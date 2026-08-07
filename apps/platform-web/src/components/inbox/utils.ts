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
    // Keep original formatting for display (e.g. "+91 6303481401")
    out.push(opts?.digitsOnly ? formatWhatsAppDisplay(v) : v);
  };
  if (Array.isArray(list)) list.forEach(push);
  push(primary);
  return out;
}

/** Store/display: "+{country} {number}" e.g. "+91 6303481401" */
export function formatWhatsAppDisplay(raw: string): string {
  const digits = raw.replace(/[^\d]/g, "");
  if (!digits) return raw.trim();
  if (digits.length > 10) {
    return `+${digits.slice(0, -10)} ${digits.slice(-10)}`;
  }
  if (digits.length === 10) return `+91 ${digits}`;
  return `+${digits}`;
}

/** All external IDs for a channel (WhatsApp / email can have multiple). */
export function identitiesFor(contact: any, channel: ChannelType): string[] {
  if (!contact) return [];

  const fromIdentities = (contact.identities ?? [])
    .filter((i: any) => i?.channel === channel && typeof i.externalId === "string")
    .map((i: any) => {
      // Prefer API displayId (@username) for Instagram UI
      if (channel === "instagram" && typeof i.displayId === "string" && i.displayId.trim()) {
        return i.displayId.trim();
      }
      if (channel === "instagram") {
        const username =
          typeof i.metadata?.username === "string" ? i.metadata.username.replace(/^@/, "").trim() : "";
        if (username) return `@${username}`;
      }
      return i.externalId as string;
    });

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
    const fromDetails =
      typeof contact.instagramDetails?.username === "string"
        ? contact.instagramDetails.username.replace(/^@/, "").trim()
        : "";
    const rawName = typeof contact.name === "string" ? contact.name.trim() : "";
    const fromName =
      rawName.startsWith("@")
        ? rawName
        : rawName && !/^\d{5,}$/.test(rawName)
          ? `@${rawName.replace(/^@/, "")}`
          : "";

    const candidates = [
      ...fromIdentities,
      fromDetails ? `@${fromDetails}` : "",
      fromName,
    ].filter((v) => typeof v === "string" && v.trim());

    // Prefer @username over bare IGSID
    const handle = candidates.find((v) => v.startsWith("@") || !/^\d{5,}$/.test(v));
    if (handle) return [handle];

    const fallback = contact.instagramId ?? contact.identifiers?.instagram ?? null;
    return typeof fallback === "string" && fallback.trim() ? [fallback.trim()] : [];
  }
  return [];
}

export function identityFor(contact: any, channel: ChannelType): string | null {
  return identitiesFor(contact, channel)[0] ?? null;
}

export function formatIdentity(identity: string, channel: ChannelType): string {
  if (!identity) return identity;
  if (channel === "whatsapp") {
    return formatWhatsAppDisplay(identity);
  }
  if (channel === "instagram") {
    if (identity.startsWith("@")) return identity;
    if (/^\d{5,}$/.test(identity)) return identity; // unresolved IGSID
    return `@${identity.replace(/^@/, "")}`;
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
  whatsappId?: string | null;
  whatsappIds?: string[] | null;
  email?: string | null;
  instagramId?: string | null;
  instagramDetails?: { username?: string | null } | null;
  identifiers?: Record<string, string>;
  identities?: Array<{ channel?: string; displayId?: string; metadata?: { username?: string } }>;
}): string {
  const name = contact.name?.trim();
  if (name && !/^\d{5,}$/.test(name)) {
    return name.startsWith("@") || !name.includes("@") ? name : name;
  }

  const igIdentity = (contact.identities ?? []).find((i) => i.channel === "instagram");
  const igUser =
    (typeof igIdentity?.displayId === "string" && igIdentity.displayId.startsWith("@")
      ? igIdentity.displayId
      : null) ||
    (typeof igIdentity?.metadata?.username === "string"
      ? `@${igIdentity.metadata.username.replace(/^@/, "")}`
      : null) ||
    (typeof contact.instagramDetails?.username === "string"
      ? `@${contact.instagramDetails.username.replace(/^@/, "")}`
      : null);
  if (igUser) return igUser;

  if (name) return name; // last resort: IGSID-as-name

  const whatsapp =
    contact.whatsappId ||
    contact.identifiers?.whatsapp ||
    contact.whatsappIds?.find((id) => typeof id === "string" && id.trim()) ||
    null;
  if (whatsapp) return formatWhatsAppDisplay(whatsapp);
  return contact.email || "Unknown";
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
