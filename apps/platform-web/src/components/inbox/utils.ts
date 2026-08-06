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

export function identityFor(contact: any, channel: ChannelType): string | null {
  const fromIdentity = contact.identities?.find((i: any) => i.channel === channel)?.externalId;
  if (fromIdentity) return fromIdentity;
  if (contact.identifiers?.[channel]) return contact.identifiers[channel];
  if (channel === "whatsapp") return contact.phone;
  if (channel === "email") return contact.email;
  return null;
}

export function formatIdentity(identity: string, channel: ChannelType): string {
  if (!identity) return identity;
  if (channel === "whatsapp") {
    if (/^91\d{10}$/.test(identity)) {
      return `+91 ${identity.slice(2)}`;
    }
    if (/^\d+$/.test(identity)) {
      return `+${identity}`;
    }
  }
  return identity;
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
  email?: string | null;
}): string {
  return contact.name || contact.phone || contact.email || "Unknown";
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
