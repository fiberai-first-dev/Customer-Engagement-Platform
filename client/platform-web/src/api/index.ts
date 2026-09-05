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

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
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

export type ChannelType = "whatsapp" | "instagram" | "facebook" | "email";
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
  facebookEnabled?: boolean;
  emailEnabled?: boolean;
  instagramId?: string | null;
  /** Numeric Instagram-scoped user id used for Graph messaging (not for UI). */
  instagramScopedId?: string | null;
  instagramDetails?: { username?: string | null; senderName?: string | null } | null;
  facebookId?: string | null;
  facebookDetails?: { senderName?: string | null } | null;
  globalStatus?: "active" | "resolved";
  hasUnread?: boolean;
  unreadByChannel?: Partial<Record<ChannelType, number>>;
  channelStatuses?: Partial<Record<ChannelType, ConversationStatus>>;
  identifiers?: Record<string, string>;
  identities?: ContactIdentity[];
  resolved?: boolean;
  /** Free-form label for grouping / broadcast filtering */
  tag?: string | null;
}

export interface ContactMatch {
  id: string;
  name: string | null;
  emails?: string[];
  whatsappIds?: string[];
  instagramId?: string | null;
  facebookId?: string | null;
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
  errorMessage?: string | null;
}

export interface WhatsAppTemplate {
  id: string;
  name: string;
  language: string;
  internalCategory: string;
  metaCategory: string;
  status: "APPROVED" | "PENDING" | "REJECTED" | "PAUSED" | "DISABLED" | "UNKNOWN";
  components: any[];
  rejectionReason?: string | null;
  qualityScore?: string | null;
  metaTemplateId?: string | null;
  wabaId?: string | null;
  createdAt: string;
  updatedAt: string;
  lastSyncedAt?: string | null;
}

export interface TemplateQuota {
  available: boolean;
  usedToday?: number;
  limitToday?: number;
  tier?: string;
  message?: string;
  metaBusinessSuiteUrl: string;
}

export interface TemplateAnalytics {
  available: boolean;
  sent: number;
  delivered: number;
  read: number;
  usageCount: number;
  period: { start: string; end: string };
  message?: string;
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
  windowState?: {
    channel: ChannelType;
    state: "ACTIVE" | "EXTENDED" | "EXPIRED" | "TEMPLATE_REQUIRED";
    lastCustomerMessageAt: string | null;
    expiresAt: string | null;
    canSendNormalMessage: boolean;
    requiresTemplate: boolean;
    requiresHumanAgentTag: boolean;
    requiresExternalInbox: boolean;
  };
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

/** The four per-channel feature flag keys. Default false = hidden unless admin enables. */
export const CHANNEL_FLAG_KEYS: Record<ChannelType, string> = {
  whatsapp: "whatsapp_channel",
  instagram: "instagram_channel",
  facebook: "facebook_channel",
  email: "email_channel",
};

/**
 * Returns the channels that are both:
 * 1. Connected (inbox.enabled === true), AND
 * 2. Allowed by the admin channel feature flag (default: true)
 */
export const useEnabledChannelTypes = (): {
  enabledChannels: ChannelType[];
  channelsReady: boolean;
} => {
  const { data: accounts } = useAccounts();
  const accountId = accounts?.[0]?.id;
  const { data: inboxes, isSuccess } = useInboxes(accountId);

  // Fetch the four channel flags in parallel
  const waFlag = useQuery({ queryKey: ["feature-flag", "whatsapp_channel"], queryFn: () => request<{ enabled: boolean }>(`/api/v1/features?key=whatsapp_channel`) });
  const igFlag = useQuery({ queryKey: ["feature-flag", "instagram_channel"], queryFn: () => request<{ enabled: boolean }>(`/api/v1/features?key=instagram_channel`) });
  const fbFlag = useQuery({ queryKey: ["feature-flag", "facebook_channel"], queryFn: () => request<{ enabled: boolean }>(`/api/v1/features?key=facebook_channel`) });
  const emailFlag = useQuery({ queryKey: ["feature-flag", "email_channel"], queryFn: () => request<{ enabled: boolean }>(`/api/v1/features?key=email_channel`) });

  // Build a set of admin-allowed channels (default false = hidden unless explicitly enabled)
  const flagAllowed = new Set<ChannelType>();
  if (waFlag.data?.enabled === true) flagAllowed.add("whatsapp");
  if (igFlag.data?.enabled === true) flagAllowed.add("instagram");
  if (fbFlag.data?.enabled === true) flagAllowed.add("facebook");
  if (emailFlag.data?.enabled === true) flagAllowed.add("email");

  const connectedChannels = (inboxes ?? []).filter((i) => {
    if (!i.enabled) return false;
    // Hide if it's completely unconfigured (never connected)
    const summary = i.health?.summary;
    if (summary === "Not configured" || summary === "Not connected") return false;
    return true;
  }).map((i) => i.channelType);

  const enabledChannels = connectedChannels.filter((ch) => flagAllowed.has(ch));

  return {
    enabledChannels,
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
    facebook?: string;
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
  credentials: Record<string, string> = {},
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
  facebookId?: string;
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

export type BulkImportResult = {
  imported: number;
  updated: number;
  failed: number;
  errors: string[];
};

export const useImportContacts = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (contacts: Array<{ name?: string; whatsapp?: string; email?: string; instagram?: string; facebook?: string }>) =>
      request<BulkImportResult>("/api/v1/contacts/import", {
        method: "POST",
        body: JSON.stringify({ contacts }),
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
      targetUserId,
      note,
    }: {
      id: string;
      teamId?: string;
      targetUserId?: string;
      note?: string;
    }) =>
      request<Ticket>(`/api/v1/tickets/${id}/escalate`, {
        method: "POST",
        body: JSON.stringify({ teamId, userId: targetUserId, targetUserId, note }),
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
  manager?: { id?: string; username: string; name?: string | null } | null;
  _count?: { members: number; tickets: number };
}

export interface TeamMember {
  id: string;
  username: string;
  name?: string | null;
  role: "SUPER_ADMIN" | "ADMIN" | "MANAGER" | "AGENT";
  isActive: boolean;
  createdAt: string;
}

export interface TeamDetail extends Team {
  members: TeamMember[];
}

export const useTeams = () =>
  useQuery({
    queryKey: ["teams"],
    queryFn: () => request<Team[]>("/api/v1/teams"),
  });

export const useTeam = (id?: string) =>
  useQuery({
    queryKey: ["teams", id],
    queryFn: () => request<TeamDetail>(`/api/v1/teams/${id}`),
    enabled: !!id,
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
  name?: string | null;
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
    mutationFn: (body: { email: string; name?: string; role: UserRole; teamId?: string }) =>
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
    mutationFn: ({ id, ...body }: { id: string; email?: string; name?: string; role?: UserRole; teamId?: string | null; isActive?: boolean }) =>
      request<OrgUser>(`/api/v1/users/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["org-users"] });
    },
  });
};

export const useDeleteOrgUser = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      request<{ ok: boolean }>(`/api/v1/users/${id}`, { method: "DELETE" }),
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

export const useSendWhatsAppTemplate = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      templateId,
      variables,
    }: {
      id: string;
      templateId: string;
      variables: Record<string, string>;
    }) =>
      request<{
        conversationId?: string;
        message: Message | null;
        result: { ok: boolean; status: string; error?: string };
      }>(`/api/v1/conversations/${encodeURIComponent(id)}/whatsapp/templates/send`, {
        method: "POST",
        body: JSON.stringify({ templateId, variables }),
      }),
    onSuccess: (data, variables) => {
      const resolvedId = data.conversationId || variables.id;
      if (data.message) {
        queryClient.setQueryData<Message[]>(["messages", resolvedId], (current) => {
          const list = current ?? [];
          return [...list, data.message!];
        });
      }
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
};

export const useWhatsAppTemplates = () =>
  useQuery({
    queryKey: ["whatsapp-templates"],
    queryFn: async () => {
      const data = await request<{ templates: WhatsAppTemplate[] }>("/api/v1/whatsapp-templates");
      return data.templates ?? [];
    },
  });

export const useSyncTemplates = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      request<{ templates: WhatsAppTemplate[]; removedOrphans: string[] }>(
        "/api/v1/whatsapp-templates/sync",
        { method: "POST" },
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["whatsapp-templates"] }),
  });
};

export const useDeleteTemplate = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      request(`/api/v1/whatsapp-templates/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["whatsapp-templates"] }),
  });
};

export const useCreateTemplate = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      name: string;
      language: string;
      internalCategory: string;
      metaCategory: string;
      components: any[];
    }) =>
      request<{ template: WhatsAppTemplate }>("/api/v1/whatsapp-templates", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["whatsapp-templates"] }),
  });
};

export const useSyncSingleTemplate = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      request<{ template: WhatsAppTemplate }>(`/api/v1/whatsapp-templates/${id}/sync`, {
        method: "POST",
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["whatsapp-templates"] }),
  });
};

export const usePatchTemplate = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...data
    }: {
      id: string;
      components?: any[];
      internalCategory?: string;
    }) =>
      request<{ template: WhatsAppTemplate }>(`/api/v1/whatsapp-templates/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["whatsapp-templates"] }),
  });
};

export const useTemplateQuota = () =>
  useQuery({
    queryKey: ["whatsapp-template-quota"],
    queryFn: () => request<TemplateQuota>("/api/v1/whatsapp-templates/quota"),
    staleTime: 5 * 60 * 1000,
  });

export const useTemplateAnalytics = (id: string | null | undefined) =>
  useQuery({
    queryKey: ["whatsapp-template-analytics", id],
    queryFn: () =>
      request<TemplateAnalytics>(`/api/v1/whatsapp-templates/${id}/analytics`),
    enabled: Boolean(id),
    staleTime: 10 * 60 * 1000,
  });

export const useFeatureFlag = (key: string) =>
  useQuery({
    queryKey: ['feature-flag', key],
    queryFn: () => request<{ enabled: boolean }>(`/api/v1/features?key=${key}`),
  });

export const useToggleFeatureFlag = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ key, enabled, description }: { key: string; enabled: boolean; description?: string }) =>
      request<{ enabled: boolean }>('/api/v1/features', { method: 'POST', body: JSON.stringify({ key, enabled, description }) }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['feature-flag', variables.key] });
      // Invalidate conversations + inboxes when channel visibility flags change
      const channelFlags = new Set(["whatsapp_channel", "instagram_channel", "facebook_channel", "email_channel"]);
      if (channelFlags.has(variables.key)) {
        queryClient.invalidateQueries({ queryKey: ["conversations"] });
        queryClient.invalidateQueries({ queryKey: ["inboxes"] });
      }
      if (
        variables.key === "instagram_human_agent_enabled" ||
        variables.key === "whatsapp_templates_enabled"
      ) {
        queryClient.invalidateQueries({ queryKey: ["conversations"] });
      }
    },
  });
};

// ─── Broadcast API ────────────────────────────────────────────────────────────

export interface BroadcastRecipient {
  id: string;
  jobId: string;
  customerId: string;
  customerName: string | null;
  status: "sent" | "delivered" | "failed";
  error: string | null;
  deliveredAt: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface BroadcastJob {
  id: string;
  templateId: string;
  templateName: string;
  variables: Record<string, string>;
  status: "pending" | "completed" | "partial" | "failed";
  total: number;
  succeeded: number;
  failed: number;
  createdAt: string;
  recipients: BroadcastRecipient[];
}

export const useBroadcasts = () =>
  useQuery({
    queryKey: ["broadcasts"],
    queryFn: async () => {
      const data = await request<{ jobs: BroadcastJob[] }>("/api/v1/broadcasts");
      return data.jobs ?? [];
    },
    refetchInterval: (query) => {
      const jobs = query.state.data;
      return jobs?.some((j) => j.status === "pending") ? 3000 : false;
    },
  });

export const useSendBroadcast = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      templateId: string;
      customerIds: string[];
      variables: Record<string, string>;
      tag?: string;
    }) =>
      request<{
        jobId: string;
        total: number;
        succeeded: number;
        failed: number;
        status: "pending" | "completed" | "partial" | "failed";
        results: BroadcastRecipient[];
      }>("/api/v1/broadcasts", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["broadcasts"] });
    },
  });
};

// ─── Contact Tag API ───────────────────────────────────────────────────────────

/** Fetch all distinct tags currently in use across contacts */
export const useContactTags = () =>
  useQuery({
    queryKey: ["contact-tags"],
    queryFn: async () => {
      const data = await request<{ tags: string[] }>("/api/v1/contacts/tags");
      return data.tags ?? [];
    },
  });

/** Set (or clear) the tag on a single contact */
export const useSetContactTag = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, tag }: { id: string; tag: string | null }) =>
      request<Contact>(`/api/v1/contacts/${id}/tag`, {
        method: "PATCH",
        body: JSON.stringify({ tag }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
      queryClient.invalidateQueries({ queryKey: ["contact-tags"] });
    },
  });
};
