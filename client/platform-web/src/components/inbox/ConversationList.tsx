import type { ChannelType, Conversation } from "../../api";
import {
  cn,
  contactDisplayName,
  formatMessageTime,
  initials,
} from "./utils";

type Props = {
  conversations: Conversation[];
  channelConversationsByContact?: Record<string, Conversation[]>;
  selectedContactId: string | null;
  onSelect: (conversation: Conversation) => void;
  emptyHint?: string;
  channelFilter?: "all" | ChannelType;
  /** Optimistically cleared unread (contact + channel scope). */
  readScopeKeys?: ReadonlySet<string>;
};

export function listReadScopeKey(
  contactId: string,
  channelFilter: "all" | ChannelType,
): string {
  return `${contactId}:${channelFilter}`;
}

function contactHasUnread(
  conversation: Conversation,
  channelFilter: "all" | ChannelType,
): boolean {
  if (channelFilter === "all") {
    return Boolean(conversation.contact.hasUnread);
  }
  const n = conversation.contact.unreadByChannel?.[channelFilter] ?? 0;
  return n > 0;
}

/** Total unread messages across all channels, or scoped to a specific channel. */
function getUnreadCount(
  conversation: Conversation,
  channelFilter: "all" | ChannelType,
): number {
  const byChannel = conversation.contact.unreadByChannel;
  if (!byChannel) return 0;
  if (channelFilter !== "all") {
    return byChannel[channelFilter] ?? 0;
  }
  return Object.values(byChannel).reduce<number>((sum, n) => sum + (n ?? 0), 0);
}

/** Strip HTML tags and CSS/script blocks so email previews are clean text. */
function stripHtmlForPreview(text: string): string {
  return text
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function ConversationList({
  conversations,
  channelConversationsByContact: _channelConversationsByContact,
  selectedContactId,
  onSelect,
  emptyHint,
  channelFilter = "all",
  readScopeKeys,
}: Props) {
  if (conversations.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
        <p className="text-sm font-medium text-foreground">No conversations</p>
        <p className="text-xs text-muted-foreground">
          {emptyHint ??
            "Unresolved contacts appear here until every thread is resolved."}
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto scrollbar-hide">
      {conversations.map((conversation) => {
        const name = contactDisplayName(conversation.contact);

        // Last message preview — prefer the first message in the array (API returns
        // latest-first). Strip HTML for email threads so no CSS leaks through.
        const rawPreview =
          conversation.messages?.[0]?.content ??
          conversation.threadSubject ??
          "";
        const preview = rawPreview
          ? stripHtmlForPreview(rawPreview)
          : "No messages yet";

        const selected = selectedContactId === conversation.contactId;
        const scopeKey = listReadScopeKey(conversation.contactId, channelFilter);
        const hasUnread =
          contactHasUnread(conversation, channelFilter) &&
          !readScopeKeys?.has(scopeKey);
        const unreadCount = readScopeKeys?.has(scopeKey)
          ? 0
          : getUnreadCount(conversation, channelFilter);

        return (
          <button
            key={conversation.contactId}
            type="button"
            onClick={() => onSelect(conversation)}
            className={cn(
              // No left border — badge conveys unread state instead
              "flex w-full items-center gap-3 border-b border-border px-3 py-2.5 text-left",
              selected ? "bg-muted" : "bg-card hover:bg-muted/50",
            )}
          >
            {/* Avatar with unread-count badge */}
            <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
              {initials(name)}
              {unreadCount > 0 && (
                <span
                  className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold text-primary-foreground"
                  title={`${unreadCount} unread message${unreadCount === 1 ? "" : "s"}`}
                >
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span
                  className={cn(
                    "truncate text-sm text-foreground",
                    hasUnread ? "font-semibold" : "font-medium",
                  )}
                >
                  {name}
                </span>
                <span className="shrink-0 text-[11px] text-muted-foreground">
                  {formatMessageTime(conversation.lastMessageAt)}
                </span>
              </div>
              <p
                className={cn(
                  "mt-0.5 truncate text-xs",
                  hasUnread ? "text-foreground/80" : "text-muted-foreground",
                )}
              >
                {preview}
              </p>
            </div>
          </button>
        );
      })}
    </div>
  );
}
