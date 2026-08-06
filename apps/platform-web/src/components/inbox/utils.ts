import type { ChannelType, ConversationStatus } from "../../api";
import { cn } from "../../utils/utils";

export const CHANNELS: { id: ChannelType; label: string }[] = [
  { id: "whatsapp", label: "WhatsApp" },
  { id: "instagram", label: "Instagram" },
  { id: "email", label: "Email" },
];

export function channelLabel(channel: ChannelType): string {
  return CHANNELS.find((c) => c.id === channel)?.label ?? channel;
}

function listField(primary: unknown, list: unknown, opts?: { digitsOnly?: boolean }): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (raw: unknown) => {
    if (typeof raw !== "string") return;
    const v = raw.trim();
    if (!v) return;
    const key = opts?.digitsOnly
      ? v.replace(/[^\d]/g, "")
      : v.replace(/[^\d+a-zA-Z@._-]/g, "").toLowerCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push(opts?.digitsOnly ? key : v);
  };
  if (Array.isArray(list)) list.forEach(push);
  push(primary);
  return out;
}

/** All external IDs for a channel (WhatsApp / email can have multiple). */
export function identitiesFor(contact: any, channel: ChannelType): string[] {
  if (!contact) return [];

  const fromIdentities = (contact.identities ?? [])
    .filter((i: any) => i?.channel === channel && typeof i.externalId === "string")
    .map((i: any) => i.externalId as string);

  if (channel === "whatsapp") {
    return listField(
      null,
      [
        ...fromIdentities,
        ...(Array.isArray(contact.whatsappIds) ? contact.whatsappIds : []),
        contact.whatsappId,
        contact.identifiers?.whatsapp,
      ],
      { digitsOnly: true },
    );
  }
  if (channel === "email") {
    return listField(null, [
      ...fromIdentities,
      ...(Array.isArray(contact.emails) ? contact.emails : []),
      contact.emailId,
      contact.email,
      contact.identifiers?.email,
    ]);
  }
  if (channel === "instagram") {
    const ig =
      fromIdentities[0] ??
      contact.instagramId ??
      contact.identifiers?.instagram ??
      null;
    return typeof ig === "string" && ig.trim() ? [ig.trim()] : [];
  }
  return [];
}

export function identityFor(contact: any, channel: ChannelType): string | null {
  return identitiesFor(contact, channel)[0] ?? null;
}

export function formatIdentity(identity: string, channel: ChannelType): string {
  if (!identity) return identity;
  if (channel === "whatsapp") {
    const digits = identity.replace(/[^\d]/g, "");
    if (/^91\d{10}$/.test(digits)) {
      return `+91 ${digits.slice(2)}`;
    }
    if (/^\d+$/.test(digits)) {
      return `+${digits}`;
    }
  }
  return identity;
}

export function formatIdentities(ids: string[], channel: ChannelType): string {
  return ids.map((id) => formatIdentity(id, channel)).join(", ");
}

export function formatMessageTime(dateString: string | null | undefined): string {
  if (!dateString) return "";
  try {
    const date = new Date(dateString);
    const now = new Date();
    const sameDay =
      date.getFullYear() === now.getFullYear() &&
      date.getMonth() === now.getMonth() &&
      date.getDate() === now.getDate();
    if (sameDay) {
      return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    }
    return date.toLocaleDateString([], { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

export function statusTone(status: ConversationStatus): string {
  if (status === "open") return "bg-blue-500/10 text-blue-600 border-blue-500/20";
  if (status === "pending") return "bg-amber-500/10 text-amber-700 border-amber-500/20";
  return "bg-muted text-muted-foreground border-border";
}

export function channelAccent(channel: ChannelType, active: boolean): string {
  if (!active) return "border-transparent text-muted-foreground hover:text-foreground";
  if (channel === "whatsapp") return "border-emerald-600 text-emerald-700";
  if (channel === "instagram") return "border-pink-600 text-pink-700";
  return "border-primary text-primary";
}

export function contactDisplayName(contact: {
  name?: string | null;
  phone?: string | null;
  whatsappId?: string | null;
  email?: string | null;
  identifiers?: Record<string, string>;
}): string {
  return (
    contact.name ||
    contact.whatsappId ||
    contact.identifiers?.whatsapp ||
    contact.phone ||
    contact.email ||
    "Unknown"
  );
}

export function initials(name: string): string {
  return name.trim().charAt(0).toUpperCase() || "?";
}

export function isActiveStatus(status: ConversationStatus): boolean {
  return status === "open" || status === "pending";
}

/** Contact is Active if any of their channel conversations is open/pending. */
export function isContactActive(
  conversations: { status: ConversationStatus }[],
): boolean {
  return conversations.some((c) => isActiveStatus(c.status));
}

/**
 * Prefer API-derived contact.globalStatus; fall back to scanning channel rows.
 * Status itself is always stored per channel conversation — never on Contact.
 */
export function contactGlobalIsActive(
  contact: { globalStatus?: "active" | "resolved" } | null | undefined,
  channelConversations: { status: ConversationStatus }[],
): boolean {
  if (contact?.globalStatus === "active") return true;
  if (contact?.globalStatus === "resolved") return false;
  return isContactActive(channelConversations);
}

/** Prefer newest active channel conversation; else newest overall. */
export function pickPrimaryConversation<
  T extends { status: ConversationStatus; lastMessageAt?: string | null },
>(conversations: T[]): T {
  const sorted = [...conversations].sort((a, b) => {
    const aTime = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
    const bTime = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
    return bTime - aTime;
  });
  return sorted.find((c) => isActiveStatus(c.status)) ?? sorted[0]!;
}

export function unresolvedChannels<
  T extends { status: ConversationStatus; lastMessageAt?: string | null },
>(conversations: T[]): T[] {
  return conversations
    .filter((c) => isActiveStatus(c.status))
    .sort((a, b) => {
      const aTime = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
      const bTime = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
      return bTime - aTime;
    });
}

/** Next unresolved channel after resolving `excludeId`, or null if none left. */
export function nextUnresolvedConversation<
  T extends { id: string; status: ConversationStatus; lastMessageAt?: string | null },
>(conversations: T[], excludeId?: string): T | null {
  const open = unresolvedChannels(
    excludeId ? conversations.filter((c) => c.id !== excludeId) : conversations,
  );
  return open[0] ?? null;
}

export { cn };
