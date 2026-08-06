 import type { Conversation } from "../../api";
import {
  cn,
  contactDisplayName,
  formatMessageTime,
  initials,
} from "./utils";
import { motion, AnimatePresence } from "framer-motion";

type Props = {
  /** One row per contact — unified inbox, no channel labels. */
  conversations: Conversation[];
  /** Sibling channel threads by contact — used only for unresolved count badge. */
  channelConversationsByContact?: Record<string, Conversation[]>;
  selectedContactId: string | null;
  onSelect: (conversation: Conversation) => void;
};

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
}: Props) {
  if (conversations.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
        <p className="text-sm font-medium text-foreground">No conversations</p>
        <p className="text-xs text-muted-foreground">
          Unresolved contacts appear here until every thread is resolved.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto scrollbar-hide">
      <AnimatePresence initial={false}>
        {conversations.map((conversation) => {
          const name = contactDisplayName(conversation.contact);
          const preview = conversation.messages?.[0]?.content ?? "No messages yet";
          const selected = selectedContactId === conversation.contactId;
          const isActive = conversation.contact.globalStatus !== "resolved";
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
                "flex w-full gap-3 border-b border-border px-4 py-3 text-left transition-colors overflow-hidden",
                selected ? "bg-muted" : "bg-card hover:bg-muted/60",
              )}
            >
              <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                {initials(name)}
                {openCount > 0 && (
                  <span
                    className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold text-primary-foreground"
                    title={`${openCount} unresolved channel${openCount === 1 ? "" : "s"}`}
                  >
                    {openCount}
                  </span>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <div className="mb-0.5 flex items-start justify-between gap-2">
                  <span
                    className={cn(
                      "truncate text-sm text-foreground",
                      isActive ? "font-semibold" : "font-medium",
                    )}
                  >
                    {name}
                  </span>
                  <span className="shrink-0 text-[11px] text-muted-foreground">
                    {formatMessageTime(conversation.lastMessageAt)}
                  </span>
                </div>

                <p className="truncate text-xs text-muted-foreground">{preview}</p>
              </div>
            </motion.button>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
