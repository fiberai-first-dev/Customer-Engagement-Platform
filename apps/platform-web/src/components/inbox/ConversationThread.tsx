import { useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  MessageSquare,
  PanelRight,
  Send,
  Trash2,
  X,
} from "lucide-react";
import type { ChannelType, Conversation, Message } from "../../api";
import { Button } from "../ui/button";
import {
  CHANNELS,
  channelLabel,
  cn,
  formatIdentities,
  identitiesFor,
  initials,
  isActiveStatus,
} from "./utils";

type Props = {
  contactName: string;
  contact?: any;
  activeTab: ChannelType;
  onTabChange: (channel: ChannelType) => void;
  conversationsByChannel: Partial<Record<ChannelType, Conversation>>;
  selectedConversation: Conversation | null;
  messages: Message[] | undefined;
  loadingMessages: boolean;
  onResolve: () => void;
  resolving: boolean;
  onClearChat?: () => void;
  clearingChat?: boolean;
  onDeleteMessages?: (messageIds: string[]) => Promise<boolean>;
  deletingMessages?: boolean;
  onSend: (content: string, subject?: string) => Promise<boolean>;
  sending: boolean;
  customerContextOpen: boolean;
  onToggleCustomerContext: () => void;
  enabledChannels?: ChannelType[];
};

export function ConversationThread({
  contactName,
  contact,
  activeTab,
  onTabChange,
  conversationsByChannel,
  selectedConversation,
  messages,
  loadingMessages,
  onResolve,
  resolving,
  onClearChat,
  clearingChat,
  onDeleteMessages,
  deletingMessages,
  onSend,
  sending,
  customerContextOpen,
  onToggleCustomerContext,
  enabledChannels,
}: Props) {
  const [draft, setDraft] = useState("");
  const [subject, setSubject] = useState("");
  const [selecting, setSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const needsAttentionHere = Boolean(
    selectedConversation && isActiveStatus(selectedConversation.status),
  );
  const busy = resolving || clearingChat || deletingMessages;

  useEffect(() => {
    setDraft("");
    setSubject("");
    setSelecting(false);
    setSelectedIds(new Set());
  }, [selectedConversation?.id, activeTab]);

  useEffect(() => {
    if (!messages?.length) return;
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages?.length, messages?.[messages.length - 1]?.id]);

  const handleSend = async () => {
    const content = draft.trim();
    if (!content || sending || !selectedConversation) return;
    const subjectValue = activeTab === "email" ? subject.trim() : undefined;
    const ok = await onSend(content, subjectValue);
    if (ok) {
      setDraft("");
      setSubject("");
    }
  };

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    setSelectedIds(new Set((messages ?? []).map((m) => m.id)));
  };

  const exitSelectMode = () => {
    setSelecting(false);
    setSelectedIds(new Set());
  };

  const handleDeleteSelected = async () => {
    if (!onDeleteMessages || selectedIds.size === 0) return;
    const ok = await onDeleteMessages([...selectedIds]);
    if (ok) exitSelectMode();
  };

  const channelIds = contact ? identitiesFor(contact, activeTab) : [];
  const identity = channelIds.length
    ? formatIdentities(channelIds, activeTab)
    : null;
  const hasMessages = Boolean(messages?.length);

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col bg-background">
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-card px-5">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
            {initials(contactName)}
          </div>
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold text-foreground">{contactName}</h2>
            <p className="text-xs text-muted-foreground">
              {identity ? `${channelLabel(activeTab)}: ${identity}` : channelLabel(activeTab)}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {selectedConversation && hasMessages && onDeleteMessages && !selecting && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelecting(true)}
              disabled={busy}
              className="gap-2 text-muted-foreground"
              title="Select messages to delete"
            >
              Select
            </Button>
          )}
          {selectedConversation && onClearChat && !selecting && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onClearChat}
              disabled={busy || !hasMessages}
              className="gap-2 text-muted-foreground hover:text-destructive"
              title="Clear every message in this channel thread"
            >
              {clearingChat ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              <span className="hidden sm:inline">Clear chat</span>
            </Button>
          )}
          {selectedConversation && needsAttentionHere && !selecting && (
            <Button
              variant="outline"
              size="sm"
              onClick={onResolve}
              disabled={busy}
              className="gap-2 border-emerald-500/30 text-emerald-800 hover:bg-emerald-500/10"
            >
              <CheckCircle2 className="h-4 w-4" />
              Resolve {channelLabel(activeTab)}
            </Button>
          )}
          <Button
            variant={customerContextOpen ? "secondary" : "outline"}
            size="sm"
            onClick={onToggleCustomerContext}
            className="gap-2"
            aria-pressed={customerContextOpen}
            title={customerContextOpen ? "Hide customer context" : "Show customer context"}
          >
            <PanelRight className="h-4 w-4" />
            <span className="hidden sm:inline">Customer</span>
          </Button>
        </div>
      </div>

      {selecting && (
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border bg-muted/40 px-5 py-2">
          <p className="text-sm text-muted-foreground">
            {selectedIds.size === 0
              ? "Tap messages to select"
              : `${selectedIds.size} selected`}
          </p>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={selectAll}
              disabled={!hasMessages || busy}
            >
              Select all
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              className="gap-2"
              disabled={selectedIds.size === 0 || busy}
              onClick={() => void handleDeleteSelected()}
            >
              {deletingMessages ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              Delete
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={exitSelectMode}
              disabled={busy}
              className="gap-1"
            >
              <X className="h-4 w-4" />
              Cancel
            </Button>
          </div>
        </div>
      )}

      <div className="flex shrink-0 gap-1 border-b border-border bg-card px-2">
        {(enabledChannels?.length
          ? CHANNELS.filter((c) => enabledChannels.includes(c.id))
          : CHANNELS
        ).map((channel) => {
          const conversation = conversationsByChannel[channel.id];
          const hasConversation = Boolean(conversation);
          const channelNeedsAttention = conversation
            ? isActiveStatus(conversation.status)
            : false;
          const selected = activeTab === channel.id;

          return (
            <button
              key={channel.id}
              type="button"
              onClick={() => onTabChange(channel.id)}
              className={cn(
                "relative inline-flex items-center gap-2 rounded-t-md px-4 py-2.5 text-sm font-medium transition-colors",
                selected
                  ? "bg-muted/70 text-foreground"
                  : "text-muted-foreground hover:bg-muted/40 hover:text-foreground",
                !hasConversation && !selected && "opacity-50",
              )}
              title={
                conversation
                  ? `${channel.label} · ${conversation.status}${
                      channelNeedsAttention ? " · open" : ""
                    }`
                  : `${channel.label} · no thread yet`
              }
            >
              {selected && (
                <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-primary" />
              )}
              {channelNeedsAttention && (
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
              )}
              {!channelNeedsAttention && hasConversation && (
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground/80" />
              )}
              <span>{channel.label}</span>
            </button>
          );
        })}
      </div>

      {!selectedConversation ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full border border-border bg-card">
            <MessageSquare className="h-6 w-6 text-muted-foreground" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">
              No {channelLabel(activeTab)} conversation yet
            </p>
            <p className="mt-1 max-w-sm text-xs text-muted-foreground">
              The customer must message first on {channelLabel(activeTab)}. Use the tabs
              above to open another thread if needed.
            </p>
          </div>
        </div>
      ) : (
        <>
          <div className="flex-1 space-y-3 overflow-y-auto scrollbar-hide p-5">
            {loadingMessages && !messages?.length && (
              <div className="flex justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            )}
            {!loadingMessages && (!messages || messages.length === 0) && (
              <div className="py-10 text-center text-sm text-muted-foreground">
                No messages in this conversation yet.
              </div>
            )}
            {messages?.map((message) => {
              const incoming = message.direction === "incoming";
              const failed = !incoming && message.status === "failed";
              const isSelected = selectedIds.has(message.id);
              return (
                <div
                  key={message.id}
                  className={cn(
                    "flex max-w-[72%] flex-col",
                    incoming ? "items-start" : "ml-auto items-end",
                  )}
                >
                  <div className="flex items-end gap-2">
                    {selecting && (
                      <button
                        type="button"
                        aria-label={isSelected ? "Deselect message" : "Select message"}
                        onClick={() => toggleSelected(message.id)}
                        className={cn(
                          "mb-1 flex h-5 w-5 shrink-0 items-center justify-center rounded border text-[10px]",
                          isSelected
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-background text-transparent",
                        )}
                      >
                        ✓
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={!selecting}
                      onClick={() => selecting && toggleSelected(message.id)}
                      className={cn(
                        "rounded-xl px-3.5 py-2.5 text-left text-sm transition-shadow",
                        incoming
                          ? "rounded-tl-sm border border-border bg-card text-foreground"
                          : failed
                            ? "rounded-tr-sm border border-destructive/40 bg-destructive/10 text-foreground"
                            : "rounded-tr-sm bg-primary text-primary-foreground",
                        selecting && "cursor-pointer",
                        selecting && isSelected && "ring-2 ring-primary ring-offset-1",
                        !selecting && "cursor-default",
                      )}
                    >
                      {message.subject && (
                        <div className="mb-2 border-b border-border/50 pb-2">
                          <span className="mr-2 text-[10px] font-bold uppercase tracking-wider opacity-60">
                            Subject:
                          </span>
                          <strong className="text-[13px] font-semibold opacity-90">
                            {message.subject}
                          </strong>
                        </div>
                      )}
                      <div className="whitespace-pre-wrap break-words leading-relaxed">
                        {message.subject && (
                          <span className="mb-1 mr-2 block text-[10px] font-bold uppercase tracking-wider opacity-60">
                            Body:
                          </span>
                        )}
                        {message.content}
                      </div>
                      <div
                        className={cn(
                          "mt-1 flex items-center justify-end gap-1 text-[10px] opacity-70",
                          incoming || failed ? "text-muted-foreground" : "text-primary-foreground",
                        )}
                      >
                        <span>{format(new Date(message.createdAt), "h:mm a")}</span>
                        {!incoming &&
                          (failed ? (
                            <AlertCircle className="h-3 w-3 text-destructive" />
                          ) : message.status === "queued" ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <CheckCircle2 className="h-3 w-3" />
                          ))}
                      </div>
                    </button>
                  </div>
                  {failed && (
                    <p className="mt-1 text-[11px] text-destructive">Failed to send</p>
                  )}
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>

          {!selecting && (
            <div className="shrink-0 border-t border-border bg-card p-4">
              <div
                className={cn(
                  "flex flex-col gap-2 rounded-xl border bg-background p-2",
                  needsAttentionHere ? "border-primary/25" : "border-border",
                )}
              >
                {activeTab === "email" && (
                  <input
                    type="text"
                    placeholder="Subject (optional)"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    className="w-full border-b border-border bg-transparent px-2 py-2 text-sm font-semibold placeholder:font-normal focus:outline-none"
                  />
                )}
                <div className="flex items-end gap-2">
                  <textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSend();
                      }
                    }}
                    placeholder={`Reply on ${channelLabel(activeTab)}…`}
                    rows={1}
                    className="max-h-[120px] min-h-[40px] flex-1 resize-none bg-transparent px-2 py-2 text-sm leading-relaxed focus:outline-none"
                  />
                  <Button
                    size="icon"
                    onClick={handleSend}
                    disabled={!draft.trim() || sending}
                    className="mb-0.5 h-9 w-9 shrink-0"
                  >
                    {sending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
              <p className="mt-2 text-center text-[10px] text-muted-foreground">
                Enter to send · Shift+Enter for new line
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function ConversationEmptyState() {
  return (
    <div className="flex h-full flex-1 flex-col items-center justify-center gap-3 bg-background px-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full border border-border bg-card">
        <MessageSquare className="h-7 w-7 text-muted-foreground" />
      </div>
      <div>
        <h2 className="text-base font-semibold text-foreground">Select a conversation</h2>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          Open a contact from Unresolved — we&apos;ll open an unresolved channel if one
          needs attention.
        </p>
      </div>
    </div>
  );
}
