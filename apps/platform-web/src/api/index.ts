import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "../store/auth";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";

/** Public PDF served by platform-api (`GET /docs/channel-setup-guide.pdf`). */
export function setupGuidePdfUrl(): string {
  return `${API_BASE.replace(/\/$/, "")}/docs/channel-setup-guide.pdf`;
}

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
  const hasBody = init?.body != null && init.body !== "";

  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      // Fastify rejects empty body when Content-Type is application/json
      ...(hasBody ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });

  if (res.status === 401 && !path.includes("/auth/google")) {
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
  health?: {
    level: "ok" | "warn" | "error" | "unknown";
    summary: string;
    details: string[];
    watchExpiresAt?: string | null;
  };
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
  hasUnread?: boolean;
  unreadByChannel?: Partial<Record<ChannelType, number>>;
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
  externalThreadId?: string | null;
  isRead?: boolean;
  hasMedia?: boolean;
  mediaFilename?: string | null;
  mediaMimeType?: string | null;
  mediaItems?: Array<{
    mediaKey: string;
    mimeType: string;
    filename?: string | null;
    contentType?: string | null;
  }>;
}

export interface Conversation {
  id: string;
  accountId: string;
  contactId: string;
  inboxId?: string;
  status: ConversationStatus;
  channelType: ChannelType;
  lastMessageAt: string | null;
  /** Gmail thread id when channelType is email */
  externalThreadId?: string | null;
  /** Display subject for email threads (Re:/Fwd: stripped) */
  threadSubject?: string | null;
  contact: Contact;
  inbox?: { id: string; name: string; channelType: ChannelType };
  messages?: Message[];
  hasUnread?: boolean;
}

export interface ShopifyConfig {
  id: string;
  connected?: boolean;
  shop: string;
  clientId: string;
  /** Always "***" when set in DB — never the real secret. */
  clientSecret: string;
  hasClientSecret?: boolean;
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

export const useMessages = (conversationId?: string) => {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: ["messages", conversationId],
    queryFn: async () => {
      const data = await request<Message[]>(
        `/api/v1/conversations/${encodeURIComponent(conversationId!)}/messages`,
      );
      await queryClient.invalidateQueries({ queryKey: ["conversations"] });
      return data;
    },
    enabled: !!conversationId,
    refetchInterval: 5000,
    // Never reuse the previous contact's messages while the new query loads.
    placeholderData: undefined,
  });
};

export async function markConversationRead(conversationId: string): Promise<void> {
  await request(`/api/v1/conversations/${encodeURIComponent(conversationId)}/read`, {
    method: "POST",
  });
}

export const useSendMessage = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      content,
      subject,
      mediaKey,
      mediaMimeType,
      mediaFilename,
    }: {
      id: string;
      content: string;
      subject?: string;
      mediaKey?: string;
      mediaMimeType?: string;
      mediaFilename?: string;
    }) =>
      request<{
        conversationId?: string;
        message: Message | null;
        result: { ok: boolean; status: string; error?: string };
      }>(`/api/v1/conversations/${encodeURIComponent(id)}/messages`, {
        method: "POST",
        body: JSON.stringify({ content, subject, mediaKey, mediaMimeType, mediaFilename }),
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
    onSuccess: (data, variables, context) => {
      const resolvedId = data.conversationId || variables.id;
      if (!data.result?.ok || !data.message) {
        // Channel send failed — drop optimistic bubble; keep draft restored by caller.
        if (context?.previous) {
          queryClient.setQueryData(["messages", variables.id], context.previous);
        } else {
          queryClient.setQueryData<Message[]>(["messages", variables.id], (current) =>
            (current ?? []).filter((m) => !m.id.startsWith("local_")),
          );
        }
        return;
      }
      queryClient.setQueryData<Message[]>(["messages", resolvedId], (current) => {
        const list =
          resolvedId === variables.id
            ? (current ?? [])
            : (queryClient.getQueryData<Message[]>(["messages", resolvedId]) ?? []);
        const withoutOptimistic = list.filter((m) => !m.id.startsWith("local_"));
        const exists = withoutOptimistic.some((m) => m.id === data.message!.id);
        return exists ? withoutOptimistic : [...withoutOptimistic, data.message!];
      });
      if (resolvedId !== variables.id) {
        queryClient.setQueryData(["messages", variables.id], context?.previous ?? []);
      }
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      queryClient.invalidateQueries({ queryKey: ["messages", resolvedId] });
    },
  });
};

export const useUpdateConversation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: ConversationStatus }) =>
      request<Conversation>(`/api/v1/conversations/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
};

/** Clear all messages in a channel thread + tombstone external ids (won't reappear from sync). */
export const useSuppressConversation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      request<{ ok: boolean; suppressed: number; deletedMessages: number }>(
        `/api/v1/conversations/${encodeURIComponent(id)}/suppress`,
        { method: "POST" },
      ),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      queryClient.invalidateQueries({ queryKey: ["messages", id] });
    },
  });
};

/** Delete selected messages in a thread + tombstone their external ids. */
export const useDeleteMessages = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, messageIds }: { id: string; messageIds: string[] }) =>
      request<{ ok: boolean; suppressed: number; deletedMessages: number }>(
        `/api/v1/conversations/${encodeURIComponent(id)}/messages/delete`,
        {
          method: "POST",
          body: JSON.stringify({ messageIds }),
        },
      ),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      queryClient.invalidateQueries({ queryKey: ["messages", id] });
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

export const useDisconnectInbox = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      request<Inbox>(`/api/v1/inboxes/${id}/disconnect`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inboxes"] });
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
    },
  });
};

export function messageMediaUrl(messageId: string, index = 0): string {
  const base = `${API_BASE.replace(/\/$/, "")}/api/v1/messages/${encodeURIComponent(messageId)}/media`;
  return index > 0 ? `${base}?index=${index}` : base;
}

export async function uploadConversationAttachment(
  conversationId: string,
  file: File,
): Promise<{
  mediaKey: string;
  mediaMimeType: string;
  mediaFilename: string;
  contentType: string;
}> {
  const token = useAuthStore.getState().token;
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(
    `${API_BASE.replace(/\/$/, "")}/api/v1/conversations/${encodeURIComponent(conversationId)}/attachments`,
    {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
    },
  );
  if (!res.ok) {
    const body = await res.text();
    let msg = body;
    try {
      const parsed = JSON.parse(body) as { error?: string };
      msg = parsed.error ?? body;
    } catch {
      /* plain */
    }
    throw new ApiError(msg || `${res.status}`, res.status);
  }
  return res.json();
}

export interface OAuthHints {
  gmailRedirectUri: string;
  instagramRedirectUri: string;
  instagramDeauthorizeUri?: string;
  instagramDataDeletionUri?: string;
  shopifyRedirectUri?: string;
  privacyUrl?: string;
  webBaseUrl: string;
  apiBaseUrl: string;
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
  credentials: Record<string, string>,
): Promise<{ url: string; redirectUri: string }> {
  return request<{ url: string; redirectUri: string }>(`/api/v1/oauth/${provider}/start`, {
    method: "POST",
    body: JSON.stringify({ inboxId, ...credentials }),
  });
}

export async function startShopifyOAuth(credentials: {
  shop: string;
  clientId: string;
  clientSecret: string;
}): Promise<{ url?: string; redirectUri: string; connected?: boolean }> {
  return request(`/api/v1/oauth/shopify/start`, {
    method: "POST",
    body: JSON.stringify(credentials),
  });
}

export async function startGmailWatch(inboxId: string): Promise<{
  ok: boolean;
  error?: string;
  expiresAt?: string | null;
  watchExpiration?: number;
}> {
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
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
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
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
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

export const useDeleteContact = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      request<{ ok: boolean; deletedMessages: number }>(`/api/v1/contacts/${id}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      queryClient.invalidateQueries({ queryKey: ["messages"] });
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
      disconnect?: boolean;
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
// ─── Ticket API ──────────────────────────────────────────────────────────────

export type TicketStatus = "OPEN" | "IN_PROGRESS" | "ESCALATED" | "RESOLVED" | "CLOSED";
export type TicketPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";

export interface TicketNoteAuthor {
  id: string;
  username: string;
}

export interface TicketNote {
  id: string;
  ticketId: string;
  authorId: string;
  author?: TicketNoteAuthor | null;
  body: string;
  isInternal: boolean;
  createdAt: string;
}

export interface TicketEvent {
  id: string;
  ticketId: string;
  actorId?: string | null;
  type: string;
  fromValue?: unknown;
  toValue?: unknown;
  note?: string | null;
  createdAt: string;
}

export interface Ticket {
  id: string;
  number: number;
  subject: string;
  description?: string | null;
  status: TicketStatus;
  priority: TicketPriority;
  channel?: string | null;
  conversationId?: string | null;
  customerId?: string | null;
  assignedTo?: string | null;
  teamId?: string | null;
  createdBy?: string | null;
  escalatedToUserId?: string | null;
  escalatedToTeamId?: string | null;
  resolvedAt?: string | null;
  closedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  assignee?: { id: string; username: string } | null;
  creator?: { id: string; username: string } | null;
  team?: { id: string; name: string } | null;
  customer?: { name: string | null } | null;
  notes?: TicketNote[];
}

export const useTickets = (filters?: {
  status?: TicketStatus;
  teamId?: string;
  assigneeId?: string;
  priority?: TicketPriority;
  channel?: string;
  conversationId?: string;
  search?: string;
}) =>
  useQuery({
    queryKey: ["tickets", filters],
    queryFn: () => {
      const q = new URLSearchParams();
      if (filters?.status) q.set("status", filters.status);
      if (filters?.teamId) q.set("teamId", filters.teamId);
      if (filters?.assigneeId) q.set("assigneeId", filters.assigneeId);
      if (filters?.priority) q.set("priority", filters.priority);
      if (filters?.channel) q.set("channel", filters.channel);
      if (filters?.conversationId) q.set("conversationId", filters.conversationId);
      if (filters?.search) q.set("search", filters.search);
      return request<Ticket[]>(`/api/v1/tickets${q.toString() ? `?${q}` : ""}`);
    },
    refetchInterval: 10000,
  });

export const useTicket = (id?: string) =>
  useQuery({
    queryKey: ["ticket", id],
    queryFn: () => request<Ticket>(`/api/v1/tickets/${id}`),
    enabled: !!id,
  });

export const useCreateTicket = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      subject: string;
      description?: string;
      channel?: string;
      customerId?: string;
      conversationId?: string;
      priority?: TicketPriority;
      teamId?: string;
      assignedTo?: string;
    }) =>
      request<Ticket>("/api/v1/tickets", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
    },
  });
};

export const useUpdateTicketStatus = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: TicketStatus }) =>
      request<Ticket>(`/api/v1/tickets/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      }),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
      queryClient.invalidateQueries({ queryKey: ["ticket", id] });
      queryClient.invalidateQueries({ queryKey: ["ticket-events", id] });
    },
  });
};

export const useUpdateTicket = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id: string;
      subject?: string;
      description?: string;
      priority?: TicketPriority;
      teamId?: string;
    }) =>
      request<Ticket>(`/api/v1/tickets/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
      queryClient.invalidateQueries({ queryKey: ["ticket", id] });
      queryClient.invalidateQueries({ queryKey: ["ticket-events", id] });
    },
  });
};

export const useAssignTicket = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      assigneeId,
      teamId,
    }: {
      id: string;
      assigneeId?: string;
      teamId?: string;
    }) =>
      request<Ticket>(`/api/v1/tickets/${id}/assign`, {
        method: "POST",
        body: JSON.stringify({ assigneeId, teamId }),
      }),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
      queryClient.invalidateQueries({ queryKey: ["ticket", id] });
      queryClient.invalidateQueries({ queryKey: ["ticket-events", id] });
    },
  });
};

export const useEscalateTicket = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      teamId,
      note,
    }: {
      id: string;
      teamId?: string;
      note?: string;
    }) =>
      request<Ticket>(`/api/v1/tickets/${id}/escalate`, {
        method: "POST",
        body: JSON.stringify({ teamId, note }),
      }),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
      queryClient.invalidateQueries({ queryKey: ["ticket", id] });
      queryClient.invalidateQueries({ queryKey: ["ticket-events", id] });
    },
  });
};

export const useReturnTicket = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, note }: { id: string; note?: string }) =>
      request<Ticket>(`/api/v1/tickets/${id}/return`, {
        method: "POST",
        body: JSON.stringify({ note }),
      }),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
      queryClient.invalidateQueries({ queryKey: ["ticket", id] });
      queryClient.invalidateQueries({ queryKey: ["ticket-events", id] });
    },
  });
};

export const useTicketEvents = (ticketId?: string) =>
  useQuery({
    queryKey: ["ticket-events", ticketId],
    queryFn: () => request<TicketEvent[]>(`/api/v1/tickets/${ticketId}/events`),
    enabled: !!ticketId,
  });

export const useAddTicketNote = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      body,
      isInternal = true,
    }: {
      id: string;
      body: string;
      isInternal?: boolean;
    }) =>
      request<TicketNote>(`/api/v1/tickets/${id}/notes`, {
        method: "POST",
        body: JSON.stringify({ body, isInternal }),
      }),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["ticket", id] });
      queryClient.invalidateQueries({ queryKey: ["ticket-events", id] });
    },
  });
};

// ─── Team API ─────────────────────────────────────────────────────────────────

export interface Team {
  id: string;
  name: string;
  managerId?: string | null;
  parentTeamId?: string | null;
  manager?: { username: string } | null;
  _count?: { members: number; tickets: number };
}

export const useTeams = () =>
  useQuery({
    queryKey: ["teams"],
    queryFn: () => request<Team[]>("/api/v1/teams"),
  });

// ─── Dashboard ────────────────────────────────────────────────────────────────

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

// ─── User Management API ──────────────────────────────────────────────────────

export type UserRole = "SUPER_ADMIN" | "ADMIN" | "MANAGER" | "AGENT";

export interface OrgUser {
  id: string;
  username: string;
  role: UserRole;
  isActive: boolean;
  teamId?: string | null;
  team?: { name: string } | null;
  createdAt: string;
}

export const useOrgUsers = () =>
  useQuery({
    queryKey: ["org-users"],
    queryFn: () => request<OrgUser[]>("/api/v1/users"),
  });

export const useCreateOrgUser = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { email: string; role: UserRole; teamId?: string }) =>
      request<OrgUser>("/api/v1/users", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["org-users"] });
    },
  });
};

export const useUpdateOrgUser = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id: string;
      role?: UserRole;
      teamId?: string;
      isActive?: boolean;
    }) =>
      request<OrgUser>(`/api/v1/users/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["org-users"] });
    },
  });
};

export const useUploadMedia = () => {
  return useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch(`${API_BASE}/api/v1/media/upload`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Failed to upload media");
      }
      return response.json() as Promise<{
        mediaKey: string;
        mimeType: string;
        filename: string;
      }>;
    },
  });
};

export const useAuthUsers = () =>
  useQuery({
    queryKey: ["auth-users"],
    queryFn: () => request<AuthUser[]>("/api/v1/auth/users"),
  });

