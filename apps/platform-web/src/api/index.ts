import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "../store/auth";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = useAuthStore.getState().token;
  
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
  
  if (res.status === 401) {
    useAuthStore.getState().logout();
  }
  
  if (!res.ok) {
    const body = await res.text();
    try {
      const parsed = JSON.parse(body) as { error?: string };
      throw new Error(parsed.error || body || `${res.status} ${res.statusText}`);
    } catch (err) {
      if (err instanceof SyntaxError) {
        throw new Error(body || `${res.status} ${res.statusText}`);
      }
      throw err;
    }
  }
  return res.json() as Promise<T>;
}

export type ChannelType = "whatsapp" | "instagram" | "email";
export type ConversationStatus = "open" | "pending" | "resolved";

export interface Account {
  id: string;
  name: string;
}

export interface Inbox {
  id: string;
  accountId: string;
  name: string;
  channelType: ChannelType;
  channelConfig: Record<string, unknown>;
  enabled: boolean;
  webhookUrl?: string;
}

export interface ContactIdentity {
  id: string;
  channel: ChannelType;
  externalId: string;
  metadata?: Record<string, unknown>;
  enabled?: boolean;
}

export interface Contact {
  id: string;
  name: string | null;
  email: string | null;
  /** All emails for this person */
  emails?: string[];
  /** Primary WhatsApp number */
  whatsappId?: string | null;
  /** All WhatsApp numbers for this person */
  whatsappIds?: string[];
  /** Flat channel flags/ids on contact (API may also synthesize identities) */
  whatsappEnabled?: boolean;
  instagramEnabled?: boolean;
  emailEnabled?: boolean;
  /**
   * Derived only for UI Active/All filtering — not stored.
   * "active" if ANY channel conversation is open/pending.
   */
  globalStatus?: "active" | "resolved";
  /** Derived map of channel → conversation status (source of truth is Conversation.status). */
  channelStatuses?: Partial<Record<ChannelType, ConversationStatus>>;
  /** Derived channel → external id map for UI convenience */
  identifiers?: Record<string, string>;
  identities?: ContactIdentity[];
}

export interface Message {
  id: string;
  conversationId: string;
  direction: "incoming" | "outgoing";
  content: string;
  contentType: string;
  subject: string | null;
  status: string;
  createdAt: string;
}

export interface Conversation {
  id: string;
  accountId: string;
  contactId: string;
  inboxId?: string;
  status: ConversationStatus;
  /** Derived from Inbox.channelType (not stored on Conversation) */
  channelType: ChannelType;
  lastMessageAt: string | null;
  contact: Contact;
  inbox?: { id: string; name: string; channelType: ChannelType };
  messages?: Message[];
}

// React Query Hooks

export const useAccounts = () => useQuery({
  queryKey: ["accounts"],
  queryFn: () => request<Account[]>("/api/v1/accounts")
});

export const useInboxes = (accountId?: string) => useQuery({
  queryKey: ["inboxes", accountId],
  queryFn: () => request<Inbox[]>(`/api/v1/accounts/${accountId}/inboxes`),
  enabled: !!accountId
});

export const useConversations = (status?: string, inboxId?: string) => useQuery({
  queryKey: ["conversations", { status, inboxId }],
  queryFn: () => {
    const q = new URLSearchParams();
    if (status && status !== "all") q.set("status", status);
    if (inboxId) q.set("inboxId", inboxId);
    return request<Conversation[]>(`/api/v1/conversations${q.toString() ? `?${q}` : ""}`);
  },
  refetchInterval: 5000,
  // Keep list mounted during background polls — never flash a full-page loader
  placeholderData: (previous) => previous,
});

export const useMessages = (conversationId?: string) => useQuery({
  queryKey: ["messages", conversationId],
  queryFn: () => request<Message[]>(`/api/v1/conversations/${conversationId}/messages`),
  enabled: !!conversationId,
  refetchInterval: 5000,
  placeholderData: (previous) => previous,
});

export const useSendMessage = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, content, subject }: { id: string; content: string; subject?: string }) =>
      request<{
        message: Message;
        result: { ok: boolean; status: string; error?: string };
      }>(`/api/v1/conversations/${id}/messages`, {
        method: "POST", body: JSON.stringify({ content, subject })
      }),
    onMutate: async ({ id, content, subject }) => {
      await queryClient.cancelQueries({ queryKey: ["messages", id] });
      const previous = queryClient.getQueryData<Message[]>(["messages", id]);
      const optimistic: Message = {
        id: `local_${Date.now()}`,
        conversationId: id,
        direction: "outgoing",
        content,
        contentType: "text",
        subject: subject ?? null,
        status: "queued",
        createdAt: new Date().toISOString(),
      };
      queryClient.setQueryData<Message[]>(["messages", id], [
        ...(previous ?? []),
        optimistic,
      ]);
      return { previous };
    },
    onError: (_err, variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["messages", variables.id], context.previous);
      }
    },
    onSuccess: (data, variables) => {
      queryClient.setQueryData<Message[]>(["messages", variables.id], (current) => {
        const list = current ?? [];
        const withoutOptimistic = list.filter((m) => !m.id.startsWith("local_"));
        const exists = withoutOptimistic.some((m) => m.id === data.message.id);
        return exists ? withoutOptimistic : [...withoutOptimistic, data.message];
      });
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
};

export const useUpdateConversation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: ConversationStatus }) =>
      request<Conversation>(`/api/v1/conversations/${id}`, {
        method: "PATCH", body: JSON.stringify({ status })
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    }
  });
};

export const useUpdateInbox = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      body,
    }: {
      id: string;
      body: { name?: string; enabled?: boolean; channelConfig?: Record<string, unknown> };
    }) =>
      request<Inbox>(`/api/v1/inboxes/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inboxes"] });
    },
  });
};

export interface OAuthHints {
  gmailRedirectUri: string;
  instagramRedirectUri: string;
  webBaseUrl: string;
  publicBaseUrl: string;
  webhooks: {
    whatsapp: string;
    instagram: string;
    emailPubSub: string;
  };
}

export const useOAuthHints = () =>
  useQuery({
    queryKey: ["oauth-hints"],
    queryFn: () => request<OAuthHints>("/api/v1/oauth/hints"),
  });

/** Starts hosted OAuth; returns provider consent URL (no local CLI). */
export async function startChannelOAuth(
  provider: "gmail" | "instagram",
  inboxId: string,
): Promise<{ url: string; redirectUri: string }> {
  return request<{ url: string; redirectUri: string }>(`/api/v1/oauth/${provider}/start`, {
    method: "POST",
    body: JSON.stringify({ inboxId }),
  });
}

export async function startGmailWatch(inboxId: string): Promise<{ ok: boolean; error?: string }> {
  return request(`/api/v1/gmail/watch`, {
    method: "POST",
    body: JSON.stringify({ inboxId }),
  });
}

/** @deprecated Prefer useUpdateInbox — upserts an inbox for the channel */
export const useUpdateAccountChannel = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      accountId,
      channel,
      body,
    }: {
      accountId: string;
      channel: ChannelType;
      body: { enabled?: boolean; config?: Record<string, unknown> };
    }) =>
      request<Inbox>(`/api/v1/accounts/${accountId}/channels/${channel}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      queryClient.invalidateQueries({ queryKey: ["inboxes"] });
    },
  });
};



export const useContacts = (accountId?: string) => useQuery({
  queryKey: ["contacts", accountId],
  queryFn: () => {
    const q = new URLSearchParams();
    if (accountId) q.set("accountId", accountId);
    return request<Contact[]>(`/api/v1/contacts${q.toString() ? `?${q}` : ""}`);
  },
  enabled: Boolean(accountId),
});

export const useCreateContact = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      accountId: string;
      name?: string;
      email?: string;
      emails?: string[];
      whatsappId?: string;
      whatsappIds?: string[];
      instagramId?: string;
      emailId?: string;
    }) =>
      request<Contact>("/api/v1/contacts", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
    },
  });
};

export const useUpdateContact = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      body,
    }: {
      id: string;
      body: {
        name?: string;
        email?: string;
        emails?: string[];
        whatsappId?: string;
        whatsappIds?: string[];
        instagramId?: string;
        emailId?: string;
      };
    }) =>
      request<Contact>(`/api/v1/contacts/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
    },
  });
};

export interface DashboardMetrics {
  totalMessages: number;
  activeContacts: number;
  recentActivity: { id: string; contactName: string; initials: string; preview: string; timestamp: string }[];
  channelDistribution: Record<string, number>;
}

export const useDashboardMetrics = (accountId?: string) => useQuery({
  queryKey: ["dashboard", "metrics", accountId],
  queryFn: () => {
    const q = new URLSearchParams();
    if (accountId) q.set("accountId", accountId);
    return request<DashboardMetrics>(`/api/v1/dashboard/metrics${q.toString() ? `?${q}` : ""}`);
  }
});
