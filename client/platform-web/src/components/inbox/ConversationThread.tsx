import { Fragment, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  CheckSquare,
  Loader2,
  MessageSquare,
  Mic,
  MoreVertical,
  PanelRight,
  Paperclip,
  Send,
  Square,
  Trash2,
  X,
  FileImage,
  FileVideo,
  FileAudio,
  FileText,
  AlertTriangle,
} from "lucide-react";
import type { ChannelType, Conversation, Message } from "../../api";
import {
  uploadConversationAttachment,
  channelSupportsAttachments,
  getChannelMediaLimit,
  formatBytes,
} from "../../lib/channel-media";
import { useAuthStore } from "../../store/auth";
import { MessageMedia } from "./MessageMedia";
import { Button } from "../ui/button";
import { toast } from "sonner";
import {
  CHANNELS,
  channelLabel,
  cn,
  emailThreadLabel,
  formatBubbleTime,
  formatDaySeparator,
  formatIdentities,
  identitiesFor,
  initials,
  isActiveStatus,
  isSameCalendarDay,
} from "./utils";

const LONG_MESSAGE_CHARS = 480;

function MessageBody({
  message,
  showBodyLabel,
  incoming,
}: {
  message: Message;
  showBodyLabel: boolean;
  incoming: boolean;
}) {
  const content = message.content;
  const [expanded, setExpanded] = useState(false);
  const isLong = content.length > LONG_MESSAGE_CHARS;
  const visible = !isLong || expanded ? content : `${content.slice(0, LONG_MESSAGE_CHARS).trimEnd()}…`;
  const isMediaPlaceholder = /^\[(image|audio|video|file|document)\]$/i.test(content.trim());
  /** Backend sometimes stores the type name as content when there's no caption. */
  const isGenericMediaLabel = /^(image|audio|video|file|document)$/i.test(content.trim());
  const isMediaType = ["image", "video", "audio", "file"].includes(message.contentType);
  const showText =
    Boolean(content.trim()) &&
    !(message.hasMedia && (isMediaPlaceholder || isGenericMediaLabel)) &&
    !(!message.hasMedia && (isMediaPlaceholder || isMediaType || isGenericMediaLabel));
  const showMissingMedia =
    !message.hasMedia && (isMediaPlaceholder || isMediaType || isGenericMediaLabel);

  return (
    <div className="min-w-0 space-y-1.5">
      {message.hasMedia && (
        <div className="flex flex-col gap-2">
          {(message.mediaItems?.length
            ? message.mediaItems
            : [
                {
                  mediaKey: "",
                  mimeType: message.mediaMimeType ?? "application/octet-stream",
                  filename: message.mediaFilename,
                  contentType: message.contentType,
                },
              ]
          ).map((item, index) => (
            <MessageMedia
              key={`${message.id}-${index}-${item.filename ?? item.mimeType}`}
              messageId={message.id}
              index={index}
              mimeType={item.mimeType}
              filename={item.filename}
              contentType={item.contentType ?? message.contentType}
              incoming={incoming}
            />
          ))}
        </div>
      )}
      {showMissingMedia && (
        <div className="rounded-lg border border-dashed border-border/80 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          {message.contentType === "image" || /^\[image\]$/i.test(content.trim())
            ? "Image unavailable"
            : "Attachment unavailable"}
        </div>
      )}
      {showText && (
        <div>
          {showBodyLabel && (
            <span className="mb-1 mr-2 block text-[10px] font-bold uppercase tracking-wider opacity-60">
              Body:
            </span>
          )}
          {message.contentType === "html" ? (
            <div
              className="break-words leading-relaxed [overflow-wrap:anywhere]"
              dangerouslySetInnerHTML={{ __html: visible }}
            />
          ) : (
            <div className="whitespace-pre-wrap break-words leading-relaxed [overflow-wrap:anywhere]">
              {visible}
            </div>
          )}
          {isLong && (
            <button
              type="button"
              className={cn(
                "mt-1 text-[11px] font-medium underline-offset-2 hover:underline",
                incoming ? "text-primary" : "text-primary-foreground/90",
              )}
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                setExpanded((v) => !v);
              }}
              onKeyDown={(e) => e.stopPropagation()}
            >
              {expanded ? "Show less" : "Read more"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

type Props = {
  contactName: string;
  contact?: any;
  activeTab: ChannelType;
  onTabChange: (channel: ChannelType) => void;
  conversationsByChannel: Partial<Record<ChannelType, Conversation>>;
  selectedConversation: Conversation | null;
  /** All Gmail threads for this contact (email channel only). */
  emailThreads?: Conversation[];
  composingNewEmail?: boolean;
  onSelectEmailThread?: (conversationId: string) => void;
  onComposeNewEmail?: () => void;
  messages: Message[] | undefined;
  loadingMessages: boolean;
  onResolve: () => void;
  resolving: boolean;
  onClearChat?: () => void;
  clearingChat?: boolean;
  onDeleteMessages?: (messageIds: string[]) => Promise<boolean>;
  deletingMessages?: boolean;
  onSend: (
    content: string,
    subject?: string,
    media?: { mediaKey: string; mediaMimeType: string; mediaFilename: string },
  ) => Promise<boolean>;
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
  emailThreads = [],
  composingNewEmail = false,
  onSelectEmailThread,
  onComposeNewEmail,
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
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === "SUPER_ADMIN" || user?.role === "ADMIN";

  const [draft, setDraft] = useState("");
  const [subject, setSubject] = useState("");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selecting, setSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // ── Audio recording ──────────────────────────────────────────────────────
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startRecording = async () => {
    if (isRecording) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "audio/ogg";
      const recorder = new MediaRecorder(stream, { mimeType });
      audioChunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const ext = mimeType.includes("ogg") ? "ogg" : "webm";
        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
        const file = new File([blob], `voice-message-${timestamp}.${ext}`, { type: mimeType });
        const limit = getChannelMediaLimit(activeTab, mimeType);
        if (file.size > limit) {
          setFileError(`Recording too large (${formatBytes(limit)} limit for this channel)`);
        } else {
          setFileError(null);
          setPendingFile(file);
        }
      };
      recorder.start(250);
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      setRecordingSeconds(0);
      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds((s) => s + 1);
      }, 1000);
    } catch {
      toast.error("Microphone access denied. Please allow microphone permission and try again.");
    }
  };

  const stopRecording = () => {
    if (!isRecording || !mediaRecorderRef.current) return;
    mediaRecorderRef.current.stop();
    mediaRecorderRef.current = null;
    setIsRecording(false);
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    setRecordingSeconds(0);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current) {
        try { mediaRecorderRef.current.stop(); } catch { /* ignore */ }
      }
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    };
  }, []);
  // ──────────────────────────────────────────────────────────────────────────

  const needsAttentionHere = Boolean(
    selectedConversation && isActiveStatus(selectedConversation.status),
  );
  const busy = resolving || clearingChat || deletingMessages;
  const hasMessages = Boolean(messages?.length);
  const isNewEmailCompose =
    activeTab === "email" &&
    (composingNewEmail || selectedConversation?.id.endsWith(":email:new"));
  const showChatMenu =
    Boolean(selectedConversation) &&
    !selecting &&
    !isNewEmailCompose &&
    (Boolean(onDeleteMessages && hasMessages) || Boolean(onClearChat));

  useEffect(() => {
    setDraft("");
    setPendingFile(null);
    setSelecting(false);
    setSelectedIds(new Set());
    setMenuOpen(false);
    if (isNewEmailCompose) {
      setSubject("");
    } else if (activeTab === "email" && selectedConversation?.threadSubject) {
      // Prefill reply subject from the selected thread; agent can still edit.
      const base = selectedConversation.threadSubject;
      setSubject(base.toLowerCase().startsWith("re:") ? base : `Re: ${base}`);
    } else {
      setSubject("");
    }
  }, [selectedConversation?.id, activeTab, isNewEmailCompose, selectedConversation?.threadSubject]);

  useEffect(() => {
    if (!messages?.length) return;
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages?.length, messages?.[messages.length - 1]?.id]);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const handleSend = async () => {
    const content = draft.trim();
    if ((!content && !pendingFile) || sending || uploading || !selectedConversation) return;
    const subjectValue = activeTab === "email" ? subject.trim() : undefined;

    let media: { mediaKey: string; mediaMimeType: string; mediaFilename: string } | undefined;
    if (pendingFile && channelSupportsAttachments(activeTab)) {
      setUploading(true);
      try {
        const uploaded = await uploadConversationAttachment(selectedConversation.id, pendingFile);
        media = {
          mediaKey: uploaded.mediaKey,
          mediaMimeType: uploaded.mediaMimeType,
          mediaFilename: uploaded.mediaFilename,
        };
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Upload failed");
        return;
      } finally {
        setUploading(false);
      }
    }

    const ok = await onSend(content, subjectValue, media);
    if (ok) {
      setDraft("");
      setSubject("");
      setPendingFile(null);
      setFileError(null);
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
  const canInitiateChannel = activeTab === "email" || activeTab === "whatsapp";
  const isLinkedAwaitingFirst =
    Boolean(selectedConversation) && !hasMessages && channelIds.length > 0;

  if (loadingMessages) {
    return (
      <div className="flex h-full min-w-0 flex-1 flex-col bg-background">
        <div className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-card px-4">
          <div className="h-9 w-9 shrink-0 animate-pulse rounded-full bg-muted" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-3.5 w-40 max-w-[50%] animate-pulse rounded bg-muted" />
            <div className="h-3 w-28 max-w-[35%] animate-pulse rounded bg-muted" />
          </div>
        </div>
        <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border bg-card px-3">
          <div className="h-6 w-20 animate-pulse rounded bg-muted" />
          <div className="h-6 w-20 animate-pulse rounded bg-muted" />
          <div className="h-6 w-16 animate-pulse rounded bg-muted" />
        </div>
        <div className="flex flex-1 flex-col items-center justify-center gap-3">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          <p className="text-xs text-muted-foreground">Loading conversation…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col bg-background">
      <div className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border bg-card px-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
            {initials(contactName)}
          </div>
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold text-foreground">{contactName}</h2>
            <p className="truncate text-xs text-muted-foreground">
              {identity ? `${channelLabel(activeTab)}: ${identity}` : channelLabel(activeTab)}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {selectedConversation && needsAttentionHere && !selecting && (
            <Button
              variant="outline"
              size="sm"
              onClick={onResolve}
              disabled={busy}
              className="gap-2 border-emerald-500/40 bg-emerald-500/5 text-emerald-800 hover:bg-emerald-500/10"
            >
              <CheckCircle2 className="h-4 w-4" />
              <span className="hidden sm:inline">Resolve {channelLabel(activeTab)}</span>
              <span className="sm:hidden">Resolve</span>
            </Button>
          )}

          <Button
            variant={customerContextOpen ? "secondary" : "ghost"}
            size="icon"
            onClick={onToggleCustomerContext}
            className="h-9 w-9"
            aria-pressed={customerContextOpen}
            title={customerContextOpen ? "Hide customer context" : "Show customer context"}
          >
            <PanelRight className="h-4 w-4" />
          </Button>

          {showChatMenu && (
            <div className="relative" ref={menuRef}>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-9 w-9"
                disabled={busy}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                title="More actions"
                onClick={() => setMenuOpen((open) => !open)}
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
              {menuOpen && (
                <div
                  role="menu"
                  className="absolute right-0 top-full z-30 mt-1 w-52 overflow-hidden rounded-lg border border-border bg-card py-1 shadow-lg"
                >
                  {onDeleteMessages && hasMessages && (
                    <button
                      type="button"
                      role="menuitem"
                      className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm text-foreground hover:bg-muted"
                      onClick={() => {
                        setMenuOpen(false);
                        setSelecting(true);
                      }}
                    >
                      <CheckSquare className="h-4 w-4 text-muted-foreground" />
                      Select messages
                    </button>
                  )}
                  {onClearChat && isAdmin && (
                    <button
                      type="button"
                      role="menuitem"
                      disabled={!hasMessages || busy}
                      className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm text-destructive hover:bg-destructive/10 disabled:pointer-events-none disabled:opacity-40"
                      onClick={() => {
                        setMenuOpen(false);
                        onClearChat();
                      }}
                    >
                      {clearingChat ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                      Clear chat
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
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
            {isAdmin && (
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={() => void handleDeleteSelected()}
                disabled={selectedIds.size === 0 || busy}
              >
                {deletingMessages ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="mr-2 h-4 w-4" />
                )}
                Delete selected
              </Button>
            )}
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

      <div className="flex h-11 shrink-0 items-stretch gap-0 border-b border-border bg-card px-2">
        {(enabledChannels?.length
          ? CHANNELS.filter((c) => enabledChannels.includes(c.id))
          : CHANNELS
        ).map((channel) => {
          const conversation =
            channel.id === "email"
              ? emailThreads[0] || conversationsByChannel[channel.id]
              : conversationsByChannel[channel.id];
          const linkedIds = contact ? identitiesFor(contact, channel.id) : [];
          const canStart =
            channel.id === "email" || channel.id === "whatsapp"
              ? linkedIds.length > 0
              : false;
          const hasConversation =
            channel.id === "email"
              ? emailThreads.length > 0 || Boolean(conversationsByChannel.email)
              : Boolean(conversation);
          const tabAvailable = hasConversation || canStart;
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
                "relative inline-flex items-center gap-2 px-3.5 text-sm font-medium transition-colors",
                selected
                  ? "bg-muted/70 text-foreground"
                  : "text-muted-foreground hover:bg-muted/40 hover:text-foreground",
                !tabAvailable && !selected && "opacity-50",
              )}
              title={
                conversation
                  ? `${channel.label} · ${conversation.status}${
                      channelNeedsAttention ? " · open" : ""
                    }`
                  : canStart
                    ? `${channel.label} · linked · send first message`
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

      {activeTab === "email" && (emailThreads.length > 0 || onComposeNewEmail) && (
        <div className="flex shrink-0 items-center gap-2 border-b border-border bg-muted/20 px-3 py-2">
          <div
            className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto scrollbar-hide"
            role="tablist"
            aria-label="Email threads"
          >
            {emailThreads.map((thread) => {
              const selected =
                !isNewEmailCompose && selectedConversation?.id === thread.id;
              const label = emailThreadLabel(thread);
              return (
                <button
                  key={thread.id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  title={label}
                  onClick={() => onSelectEmailThread?.(thread.id)}
                  className={cn(
                    "max-w-[200px] shrink-0 truncate rounded-md border px-2.5 py-1.5 text-left text-xs font-medium transition-colors",
                    selected
                      ? "border-primary/40 bg-primary/10 text-foreground"
                      : "border-border bg-card text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                  )}
                >
                  {label}
                </button>
              );
            })}
            {onComposeNewEmail && (
              <button
                type="button"
                role="tab"
                aria-selected={isNewEmailCompose}
                onClick={() => onComposeNewEmail()}
                className={cn(
                  "shrink-0 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors",
                  isNewEmailCompose
                    ? "border-primary/40 bg-primary/10 text-foreground"
                    : "border-dashed border-border bg-card text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                )}
              >
                + New email
              </button>
            )}
          </div>
        </div>
      )}

      {!selectedConversation ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full border border-border bg-card">
            <MessageSquare className="h-6 w-6 text-muted-foreground" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">
              {activeTab === "instagram"
                ? "Waiting for the customer on Instagram"
                : channelIds.length
                  ? `${channelLabel(activeTab)} linked · waiting for first message`
                  : `No ${channelLabel(activeTab)} on this contact`}
            </p>
            <p className="mt-1 max-w-sm text-xs text-muted-foreground">
              {activeTab === "instagram"
                ? "The customer needs to message first on Instagram. Switch tabs for WhatsApp or Email."
                : channelIds.length
                  ? canInitiateChannel
                    ? "You can send the first message from here."
                    : "Switch tabs to open another conversation."
                  : "Add this on the contact, then you can message from here."}
            </p>
          </div>
        </div>
      ) : (
        <>
          <div className="flex-1 space-y-2.5 overflow-y-auto scrollbar-hide p-4 sm:p-5">
            {loadingMessages && !messages?.length && (
              <div className="flex justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            )}
            {!loadingMessages && isLinkedAwaitingFirst && (
              <div className="py-10 text-center">
                <p className="text-sm font-medium text-foreground">
                  {activeTab === "email"
                    ? "Email linked · waiting for first message."
                    : activeTab === "whatsapp"
                      ? "WhatsApp linked · send the first message."
                      : "No messages in this conversation yet."}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {canInitiateChannel
                    ? "Write a message below to get started."
                    : "Waiting for the customer to message first."}
                </p>
              </div>
            )}
            {!loadingMessages && !isLinkedAwaitingFirst && (!messages || messages.length === 0) && (
              <div className="py-10 text-center text-sm text-muted-foreground">
                No messages in this conversation yet.
              </div>
            )}
            {messages?.map((message, index) => {
              const incoming = message.direction === "incoming";
              const failed = !incoming && message.status === "failed";
              const isSelected = selectedIds.has(message.id);
              const prev = index > 0 ? messages[index - 1] : null;
              const showDaySeparator =
                !prev || !isSameCalendarDay(prev.createdAt, message.createdAt);
              const dayLabel = showDaySeparator
                ? formatDaySeparator(message.createdAt)
                : null;
              return (
                <Fragment key={message.id}>
                  {dayLabel && (
                    <div className="flex justify-center py-1.5">
                      <span className="rounded-full bg-muted px-2.5 py-0.5 text-[11px] text-muted-foreground">
                        {dayLabel}
                      </span>
                    </div>
                  )}
                  <div
                    className={cn(
                      "flex w-fit max-w-[min(75%,32rem)] flex-col",
                      incoming ? "mr-auto items-start" : "ml-auto items-end",
                    )}
                  >
                    <div className="flex max-w-full items-end gap-2">
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
                      <div
                        role={selecting ? "button" : undefined}
                        tabIndex={selecting ? 0 : undefined}
                        onClick={() => selecting && toggleSelected(message.id)}
                        onKeyDown={(e) => {
                          if (!selecting) return;
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            toggleSelected(message.id);
                          }
                        }}
                        className={cn(
                          "min-w-0 max-w-full overflow-hidden text-left text-sm",
                          message.hasMedia &&
                            !message.content
                              ?.trim()
                              ?.replace(/^\[(image|audio|video|file|document)\]$/i, "")
                            ? "rounded-xl p-1.5"
                            : "rounded-xl px-3 py-2",
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
                            <strong className="break-words text-[13px] font-semibold opacity-90 [overflow-wrap:anywhere]">
                              {message.subject}
                            </strong>
                          </div>
                        )}
                        <MessageBody
                          message={message}
                          showBodyLabel={Boolean(message.subject)}
                          incoming={incoming || failed}
                        />
                        <div
                          className={cn(
                            "mt-1 flex items-center justify-end gap-1 text-[10px] opacity-70",
                            incoming || failed
                              ? "text-muted-foreground"
                              : "text-primary-foreground",
                          )}
                        >
                          <span title={new Date(message.createdAt).toLocaleString()}>
                            {formatBubbleTime(message.createdAt)}
                          </span>
                          {!incoming &&
                            (failed ? (
                              <AlertCircle className="h-3 w-3 text-destructive" />
                            ) : message.status === "queued" ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <CheckCircle2 className="h-3 w-3 opacity-80" />
                            ))}
                        </div>
                      </div>
                    </div>
                    {failed && (
                      <p className="mt-1 text-[11px] text-destructive">Failed to send</p>
                    )}
                  </div>
                </Fragment>
              );
            })}
            <div ref={messagesEndRef} />
          </div>

          {!selecting && (
            <div className="shrink-0 border-t border-border bg-card p-3">
              <div
                className={cn(
                  "flex flex-col gap-1.5 rounded-xl border bg-background p-1.5",
                  needsAttentionHere ? "border-primary/25" : "border-border",
                )}
              >
                {activeTab === "email" && (
                  <input
                    type="text"
                    placeholder={
                      isNewEmailCompose ? "Subject" : "Subject (reply keeps this thread)"
                    }
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    className="w-full border-b border-border bg-transparent px-2 py-2 text-sm font-semibold placeholder:font-normal focus:outline-none"
                  />
                )}
                {fileError && (
                  <div className="flex items-center justify-between rounded-md bg-red-500/10 border border-red-500/20 px-3 py-2 text-xs text-red-600 dark:text-red-400">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                      <span>{fileError}</span>
                    </div>
                    <button
                      type="button"
                      className="text-red-500 hover:text-red-700"
                      onClick={() => setFileError(null)}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
                {pendingFile && (
                  <div className="flex items-center gap-2 rounded-md bg-muted/50 px-3 py-2 text-sm border border-border">
                    {pendingFile.type.startsWith("image/") ? (
                      <FileImage className="h-4 w-4 shrink-0 text-blue-400" />
                    ) : pendingFile.type.startsWith("video/") ? (
                      <FileVideo className="h-4 w-4 shrink-0 text-purple-400" />
                    ) : pendingFile.type.startsWith("audio/") ? (
                      <FileAudio className="h-4 w-4 shrink-0 text-amber-400" />
                    ) : pendingFile.type.includes("pdf") ? (
                      <FileText className="h-4 w-4 shrink-0 text-red-400" />
                    ) : (
                      <Paperclip className="h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                    <span className="min-w-0 flex-1 truncate font-medium">{pendingFile.name}</span>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {formatBytes(pendingFile.size)}
                    </span>
                    <button
                      type="button"
                      className="ml-2 rounded-full p-1 text-muted-foreground hover:bg-background hover:text-foreground transition-colors"
                      onClick={() => {
                        setPendingFile(null);
                        setFileError(null);
                      }}
                      aria-label="Remove attachment"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
                <div className="flex items-end gap-1">
                  {channelSupportsAttachments(activeTab) && (
                    <>
                      <input
                        ref={fileInputRef}
                        type="file"
                        className="hidden"
                        accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.zip"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          
                          const limit = getChannelMediaLimit(activeTab, file.type || "application/octet-stream");
                          if (file.size > limit) {
                            setFileError(`File too large (${formatBytes(limit)} limit for ${channelLabel(activeTab)})`);
                            setPendingFile(null);
                          } else {
                            setFileError(null);
                            setPendingFile(file);
                          }
                          e.target.value = "";
                        }}
                      />
                      {/* Paperclip – attach file */}
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="mb-0.5 h-9 w-9 shrink-0"
                        disabled={sending || uploading || isRecording}
                        onClick={() => fileInputRef.current?.click()}
                        title="Attach file"
                      >
                        <Paperclip className="h-4 w-4" />
                      </Button>

                      {/* Microphone – voice recording */}
                      {isRecording ? (
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="relative mb-0.5 h-9 w-9 shrink-0 text-red-500 hover:bg-red-500/10 hover:text-red-600"
                          onClick={stopRecording}
                          title={`Stop recording · ${recordingSeconds}s`}
                          aria-label="Stop recording"
                        >
                          <span className="absolute inset-0 animate-ping rounded-full bg-red-400/25" />
                          <Square className="relative h-3.5 w-3.5 fill-current" />
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="mb-0.5 h-9 w-9 shrink-0"
                          disabled={sending || uploading || pendingFile !== null}
                          onClick={startRecording}
                          title="Record voice message"
                          aria-label="Record voice message"
                        >
                          <Mic className="h-4 w-4" />
                        </Button>
                      )}
                    </>
                  )}
                  <textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSend();
                      }
                    }}
                    placeholder={
                      isNewEmailCompose
                        ? "Write a new email…"
                        : isLinkedAwaitingFirst && canInitiateChannel
                          ? `Message on ${channelLabel(activeTab)}…`
                          : `Reply on ${channelLabel(activeTab)}…`
                    }
                    rows={1}
                    className="max-h-[120px] min-h-[40px] flex-1 resize-none bg-transparent px-2 py-2 text-sm leading-relaxed focus:outline-none"
                  />
                  <Button
                    size="icon"
                    onClick={handleSend}
                    disabled={
                      (!draft.trim() && !pendingFile) || 
                      sending || 
                      uploading || 
                      fileError !== null
                    }
                    className="mb-0.5 h-9 w-9 shrink-0"
                  >
                    {sending || uploading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
              <p className="mt-1.5 text-center text-[10px] text-muted-foreground">
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
          Pick a contact from the list to open the conversation.
        </p>
      </div>
    </div>
  );
}

