const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";
const TOKEN =
  import.meta.env.VITE_PLATFORM_ADMIN_TOKEN ??
  import.meta.env.VITE_CEP_ADMIN_TOKEN ??
  "dev-token-change-me";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(body || `${res.status} ${res.statusText}`);
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

export interface Contact {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
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
  inboxId: string;
  contactId: string;
  status: ConversationStatus;
  channelType: ChannelType;
  lastMessageAt: string | null;
  contact: Contact;
  inbox: { id: string; name: string; channelType: ChannelType };
  messages?: Message[];
}

export const api = {
  listAccounts: () => request<Account[]>("/api/v1/accounts"),
  listInboxes: (accountId: string) =>
    request<Inbox[]>(`/api/v1/accounts/${accountId}/inboxes`),
  updateInbox: (
    inboxId: string,
    body: { name?: string; enabled?: boolean; channelConfig?: Record<string, unknown> },
  ) =>
    request<Inbox>(`/api/v1/inboxes/${inboxId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  listConversations: (params?: { status?: string; inboxId?: string }) => {
    const q = new URLSearchParams();
    if (params?.status) q.set("status", params.status);
    if (params?.inboxId) q.set("inboxId", params.inboxId);
    const suffix = q.toString() ? `?${q}` : "";
    return request<Conversation[]>(`/api/v1/conversations${suffix}`);
  },
  getMessages: (conversationId: string) =>
    request<Message[]>(`/api/v1/conversations/${conversationId}/messages`),
  sendMessage: (conversationId: string, content: string, subject?: string) =>
    request<{ message: Message }>(`/api/v1/conversations/${conversationId}/messages`, {
      method: "POST",
      body: JSON.stringify({ content, subject }),
    }),
  updateConversation: (id: string, status: ConversationStatus) =>
    request<Conversation>(`/api/v1/conversations/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),
};
