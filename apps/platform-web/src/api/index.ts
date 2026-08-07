import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "../store/auth";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";

export class ApiError extends Error {
  status: number;
  data: unknown;
  constructor(message: string, status: number, data?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }
}

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

  if (res.status === 401 && !path.includes("/auth/login")) {
    useAuthStore.getState().logout();
  }

  if (!res.ok) {
    const body = await res.text();
    let parsed: { error?: string; message?: string; matches?: unknown } | null = null;
    try {
      parsed = JSON.parse(body) as { error?: string; message?: string; matches?: unknown };
    } catch {
      /* plain text */
    }
    throw new ApiError(
      parsed?.message || parsed?.error || body || `${res.status} ${res.statusText}`,
      res.status,
      parsed ?? body,
    );
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
  displayId?: string;
  metadata?: Record<string, unknown>;
  enabled?: boolean;
}

export interface Contact {
  id: string;
  name: string | null;
  email: string | null;
  emails?: string[];
  whatsappId?: string | null;
  whatsappIds?: string[];
  whatsappEnabled?: boolean;
  instagramEnabled?: boolean;
  emailEnabled?: boolean;
  instagramId?: string | null;
  /** Numeric Instagram-scoped user id used for Graph messaging (not for UI). */
  instagramScopedId?: string | null;
  instagramDetails?: { username?: string | null; senderName?: string | null } | null;
  globalStatus?: "active" | "resolved";
  channelStatuses?: Partial<Record<ChannelType, ConversationStatus>>;
  identifiers?: Record<string, string>;
  identities?: ContactIdentity[];
  resolved?: boolean;
}

export interface ContactMatch {
  id: string;
  name: string | null;
  emails?: string[];
  whatsappIds?: string[];
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
  channelType: ChannelType;
  lastMessageAt: string | null;
  contact: Contact;
  inbox?: { id: string; name: string; channelType: ChannelType };
  messages?: Message[];
}

export interface ShopifyConfig {
  id: string;
  shop: string;
  clientId: string;
  clientSecret: string;
  updatedAt: string;
}

export interface AuthUser {
  id: string;
  username: string;
  createdAt: string;
}

export const useAccounts = () =>
  useQuery({
    queryKey: ["accounts"],
    queryFn: () => request<Account[]>("/api/v1/accounts"),
  });

export const useInboxes = (accountId?: string) =>
  useQuery({
    queryKey: ["inboxes", accountId],
    queryFn: () => request<Inbox[]>(`/api/v1/accounts/${accountId}/inboxes`),
    enabled: !!accountId,
  });

/** Enabled channel types from channels_config. Empty array once loaded means none enabled. */
export const useEnabledChannelTypes = (): {
  enabledChannels: ChannelType[];
  channelsReady: boolean;
} => {
  const { data: accounts } = useAccounts();
  const accountId = accounts?.[0]?.id;
  const { data: inboxes, isSuccess } = useInboxes(accountId);
  return {
    enabledChannels: (inboxes ?? []).filter((i) => i.enabled).map((i) => i.channelType),
    channelsReady: Boolean(accountId && isSuccess),
  };
};

export const useConversations = (status?: string, inboxId?: string) =>
  useQuery({
    queryKey: ["conversations", { status, inboxId }],
    queryFn: () => {
      const q = new URLSearchParams();
      if (status && status !== "all") q.set("status", status);
      if (inboxId) q.set("inboxId", inboxId);
      return request<Conversation[]>(`/api/v1/conversations${q.toString() ? `?${q}` : ""}`);
    },
    refetchInterval: 5000,
    placeholderData: (previous) => previous,
  });

export const useMessages = (conversationId?: string) =>
  useQuery({
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
        method: "POST",
        body: JSON.stringify({ content, subject }),
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
      queryClient.setQueryData<Message[]>(["messages", id], [...(previous ?? []), optimistic]);
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
        method: "PATCH",
        body: JSON.stringify({ status }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
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

export const useContacts = (accountId?: string) =>
  useQuery({
    queryKey: ["contacts", accountId],
    queryFn: () => {
      const q = new URLSearchParams();
      if (accountId) q.set("accountId", accountId);
      return request<Contact[]>(`/api/v1/contacts${q.toString() ? `?${q}` : ""}`);
    },
    enabled: Boolean(accountId),
  });

type ContactWriteBody = {
  accountId?: string;
  name?: string;
  email?: string;
  emails?: string[];
  whatsappId?: string;
  whatsappIds?: string[];
  instagramId?: string;
  emailId?: string;
  mergeIntoId?: string;
  keepName?: string;
  force?: boolean;
};

export const useCreateContact = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: ContactWriteBody) =>
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
    mutationFn: ({ id, body }: { id: string; body: ContactWriteBody }) =>
      request<Contact>(`/api/v1/contacts/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
    },
  });
};

export const useMergeContacts = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { targetId: string; sourceIds: string[]; keepName: string }) =>
      request<Contact>("/api/v1/contacts/merge", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
};

export const useShopifyConfig = () =>
  useQuery({
    queryKey: ["shopify-config"],
    queryFn: () => request<ShopifyConfig>("/api/v1/shopify"),
  });

export const useUpdateShopifyConfig = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      shop?: string;
      clientId?: string;
      clientSecret?: string;
    }) =>
      request<ShopifyConfig>("/api/v1/shopify", {
        method: "PUT",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shopify-config"] });
    },
  });
};

export const useAuthUsers = () =>
  useQuery({
    queryKey: ["auth-users"],
    queryFn: () => request<AuthUser[]>("/api/v1/auth/users"),
  });

export const useCreateAuthUser = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { username: string; password: string }) =>
      request<{ ok: boolean; id: string; username: string }>("/api/v1/auth/users", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["auth-users"] });
    },
  });
};

export interface DashboardMetrics {
  totalMessages: number;
  activeContacts: number;
  recentActivity: {
    id: string;
    contactName: string;
    initials: string;
    preview: string;
    timestamp: string;
  }[];
  channelDistribution: Record<string, number>;
}

export const useDashboardMetrics = (accountId?: string) =>
  useQuery({
    queryKey: ["dashboard", "metrics", accountId],
    queryFn: () => {
      const q = new URLSearchParams();
      if (accountId) q.set("accountId", accountId);
      return request<DashboardMetrics>(`/api/v1/dashboard/metrics${q.toString() ? `?${q}` : ""}`);
    },
  });
