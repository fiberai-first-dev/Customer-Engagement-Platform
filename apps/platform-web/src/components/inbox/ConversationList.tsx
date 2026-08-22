 import type { Conversation } from "../../api";
import {
  cn,
  contactDisplayName,
  formatMessageTime,
  initials,
} from "./utils";
import { motion, AnimatePresence } from "framer-motion";

type Props = {
  conversations: Conversation[];
  channelConversationsByContact?: Record<string, Conversation[]>;
  selectedContactId: string | null;
  onSelect: (conversation: Conversation) => void;
  emptyHint?: string;
  channelFilter?: "all" | import("../../api").ChannelType;
  /** Optimistically cleared unread (contact + channel scope). */
  readScopeKeys?: ReadonlySet<string>;
};

export function listReadScopeKey(
  contactId: string,
  channelFilter: "all" | import("../../api").ChannelType,
): string {
  return `${contactId}:${channelFilter}`;
}

function contactHasUnread(
  conversation: Conversation,
  channelFilter: "all" | import("../../api").ChannelType,
): boolean {
  if (channelFilter === "all") {
    return Boolean(conversation.contact.hasUnread);
  }
  const n = conversation.contact.unreadByChannel?.[channelFilter] ?? 0;
  return n > 0;
}

function unresolvedChannelCount(
  conversation: Conversation,
  siblings?: Conversation[],
): number {
  const fromStatuses = conversation.contact.channelStatuses;
  if (fromStatuses) {
    return Object.values(fromStatuses).filter(
      (status) => status === "open" || status === "pending",
    ).length;
  }
  return (siblings ?? [conversation]).filter(
    (row) => row.status === "open" || row.status === "pending",
  ).length;
}

export function ConversationList({
  conversations,
  channelConversationsByContact,
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
      <AnimatePresence initial={false}>
        {conversations.map((conversation) => {
          const name = contactDisplayName(conversation.contact);
          const subjectHint =
            conversation.channelType === "email"
              ? conversation.threadSubject || conversation.messages?.[0]?.subject
              : null;
          const bodyPreview = conversation.messages?.[0]?.content;
          const preview = subjectHint
            ? bodyPreview
              ? `${subjectHint} — ${bodyPreview}`
              : subjectHint
            : bodyPreview ?? "No messages yet";
          const selected = selectedContactId === conversation.contactId;
          const scopeKey = listReadScopeKey(conversation.contactId, channelFilter);
          const hasUnread =
            contactHasUnread(conversation, channelFilter) &&
            !readScopeKeys?.has(scopeKey);
          const openCount = unresolvedChannelCount(
            conversation,
            channelConversationsByContact?.[conversation.contactId],
          );

          return (
            <motion.button
              key={conversation.contactId}
              layout
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              type="button"
              onClick={() => onSelect(conversation)}
              className={cn(
                "relative flex w-full items-center gap-2.5 overflow-hidden border-b border-border py-2 pl-3 pr-3 text-left transition-colors",
                selected ? "bg-muted" : "bg-card hover:bg-muted/50",
              )}
            >
              <motion.span
                aria-hidden
                className="pointer-events-none absolute left-0 top-1/2 w-[3px] -translate-y-1/2 rounded-full bg-primary"
                initial={false}
                animate={{
                  height: hasUnread ? "72%" : "0%",
                  opacity: hasUnread ? 1 : 0,
                }}
                transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
              />

              <div className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                {initials(name)}
                {openCount > 0 && (
                  <span
                    className="absolute -right-0.5 -top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-primary px-0.5 text-[8px] font-bold leading-none text-primary-foreground"
                    title={`${openCount} unresolved channel${openCount === 1 ? "" : "s"}`}
                  >
                    {openCount}
                  </span>
                )}
              </div>

              <div className="min-w-0 flex-1 leading-tight">
                <div className="flex items-baseline justify-between gap-2">
                  <span
                    className={cn(
                      "truncate text-[13px] text-foreground",
                      hasUnread ? "font-semibold" : "font-medium",
                    )}
                  >
                    {name}
                  </span>
                  <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                    {formatMessageTime(conversation.lastMessageAt)}
                  </span>
                </div>

                <p
                  className={cn(
                    "truncate text-[11px]",
                    hasUnread ? "text-foreground/75" : "text-muted-foreground",
                  )}
                >
                  {preview}
                </p>
              </div>
            </motion.button>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
