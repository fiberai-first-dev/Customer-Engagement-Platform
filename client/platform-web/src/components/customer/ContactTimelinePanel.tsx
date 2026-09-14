// @ts-nocheck
import { useState, useEffect } from "react";
import {
  MessageSquare,
  TicketIcon,
  Radio,
  StickyNote,
  ChevronDown,
  ChevronUp,
  Plus,
  Trash2,
  Loader2,
  Tag,
} from "lucide-react";
import {
  useContactTimeline,
  useUpdateContactCustomFields,
  type TimelineEvent,
  type Contact,
} from "../../api";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { cn } from "../inbox/utils";

const CHANNEL_ICONS: Record<string, string> = {
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  facebook: "Facebook",
  email: "Email",
};

const EVENT_STYLES: Record<
  string,
  { icon: React.ElementType; color: string; bg: string; label: string }
> = {
  message: {
    icon: MessageSquare,
    color: "text-blue-600 dark:text-blue-400",
    bg: "bg-blue-50 dark:bg-blue-900/20",
    label: "Message",
  },
  ticket: {
    icon: TicketIcon,
    color: "text-violet-600 dark:text-violet-400",
    bg: "bg-violet-50 dark:bg-violet-900/20",
    label: "Ticket",
  },
  ticket_note: {
    icon: StickyNote,
    color: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-50 dark:bg-amber-900/20",
    label: "Note",
  },
  broadcast: {
    icon: Radio,
    color: "text-emerald-600 dark:text-emerald-400",
    bg: "bg-emerald-50 dark:bg-emerald-900/20",
    label: "Broadcast",
  },
};

function TimelineEventRow({ event }: { event: TimelineEvent }) {
  const [expanded, setExpanded] = useState(false);
  const style = EVENT_STYLES[event.type] ?? EVENT_STYLES.message;
  const Icon = style.icon;
  const ts = formatDistanceToNow(new Date(event.timestamp), { addSuffix: true });

  const title =
    event.type === "message"
      ? `${event.direction === "incoming" ? "Received" : "Sent"} message`
      : event.type === "ticket"
        ? `Ticket #${event.ticketNumber} — ${event.subject ?? "Support ticket"}`
        : event.type === "ticket_note"
          ? "Internal note"
          : `Broadcast: ${event.templateName ?? "Campaign"}`;

  const body =
    event.type === "message"
      ? event.content
      : event.type === "ticket_note"
        ? event.body
        : event.type === "broadcast"
          ? event.status === "failed"
            ? `Failed: ${event.error ?? "unknown error"}`
            : `Delivered via broadcast`
          : null;

  const hasBody = Boolean(body && body.length > 60);

  return (
    <div className="flex gap-3 group">
      {/* Timeline spine */}
      <div className="flex flex-col items-center">
        <div className={cn("w-7 h-7 rounded-full flex items-center justify-center shrink-0 border border-border/60", style.bg)}>
          <Icon className={cn("w-3.5 h-3.5", style.color)} />
        </div>
        <div className="w-px flex-1 bg-border/50 mt-1" />
      </div>

      <div className="flex-1 pb-4 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-foreground leading-tight">{title}</p>
            {event.channelType && (
              <span className="text-[10px] text-muted-foreground">
                {CHANNEL_ICONS[event.channelType || "whatsapp"] ?? "💬"} {event.channelType}
              </span>
            )}
          </div>
          <span className="text-[10px] text-muted-foreground whitespace-nowrap shrink-0 mt-0.5">{ts}</span>
        </div>

        {body && (
          <div className="mt-1">
            <p className={cn("text-xs text-muted-foreground leading-relaxed", !expanded && "line-clamp-2")}>
              {body}
            </p>
            {hasBody && (
              <button
                type="button"
                onClick={() => setExpanded((p) => !p)}
                className="mt-0.5 text-[10px] text-primary hover:underline flex items-center gap-0.5"
              >
                {expanded ? <ChevronUp className="w-2.5 h-2.5" /> : <ChevronDown className="w-2.5 h-2.5" />}
                {expanded ? "Show less" : "Show more"}
              </button>
            )}
          </div>
        )}

        {event.type === "ticket" && (
          <span
            className={cn(
              "inline-block mt-1 text-[10px] font-semibold rounded-full px-1.5 py-0.5",
              event.status === "OPEN" && "bg-blue-100 text-blue-700",
              event.status === "IN_PROGRESS" && "bg-amber-100 text-amber-700",
              event.status === "ESCALATED" && "bg-red-100 text-red-700",
              event.status === "RESOLVED" && "bg-emerald-100 text-emerald-700",
              event.status === "CLOSED" && "bg-slate-100 text-slate-600",
            )}
          >
            {event.status}
          </span>
        )}
      </div>
    </div>
  );
}

function CustomFieldsEditor({
  contactId,
  initial,
}: {
  contactId: string;
  initial: Record<string, string>;
}) {
  const [fields, setFields] = useState<Record<string, string>>(initial);
  const [newKey, setNewKey] = useState("");
  const [newVal, setNewVal] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editVal, setEditVal] = useState("");
  const updateFields = useUpdateContactCustomFields();

  // Sync when timeline payload loads
  useEffect(() => {
    setFields(initial ?? {});
  }, [contactId, JSON.stringify(initial)]);

  const save = async (patch: Record<string, string | null>) => {
    try {
      const result = await updateFields.mutateAsync({ id: contactId, fields: patch });
      setFields(result.customFields);
    } catch (err: any) {
      toast.error(err.message ?? "Failed to save");
    }
  };

  const addField = async () => {
    if (!newKey.trim()) return;
    await save({ [newKey.trim()]: newVal.trim() || "" });
    setNewKey("");
    setNewVal("");
  };

  const deleteField = (key: string) => save({ [key]: null });

  const commitEdit = (key: string) => {
    save({ [key]: editVal });
    setEditing(null);
  };

  return (
    <div className="space-y-2">
      {Object.entries(fields).map(([key, val]) => (
        <div key={key} className="flex items-center gap-1.5 group">
          <span className="text-[10px] font-semibold text-muted-foreground uppercase shrink-0 w-20 truncate">
            {key}
          </span>
          {editing === key ? (
            <input
              className="flex-1 text-xs rounded border border-primary px-1.5 py-0.5 bg-background focus:outline-none"
              value={editVal}
              autoFocus
              onChange={(e) => setEditVal(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitEdit(key);
                if (e.key === "Escape") setEditing(null);
              }}
              onBlur={() => commitEdit(key)}
            />
          ) : (
            <span
              className="flex-1 text-xs text-foreground truncate cursor-pointer hover:text-primary"
              onClick={() => { setEditing(key); setEditVal(val); }}
              title="Click to edit"
            >
              {val || <em className="text-muted-foreground">empty</em>}
            </span>
          )}
          <button
            type="button"
            onClick={() => deleteField(key)}
            className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-500 transition-opacity"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      ))}

      {/* Add field row */}
      <div className="flex items-center gap-1.5 pt-1">
        <input
          placeholder="Field"
          value={newKey}
          onChange={(e) => setNewKey(e.target.value)}
          className="w-20 text-xs rounded border border-border px-1.5 py-0.5 bg-background focus:outline-none focus:border-primary"
          onKeyDown={(e) => { if (e.key === "Enter") addField(); }}
        />
        <input
          placeholder="Value"
          value={newVal}
          onChange={(e) => setNewVal(e.target.value)}
          className="flex-1 text-xs rounded border border-border px-1.5 py-0.5 bg-background focus:outline-none focus:border-primary"
          onKeyDown={(e) => { if (e.key === "Enter") addField(); }}
        />
        <button
          type="button"
          onClick={addField}
          disabled={!newKey.trim()}
          className="shrink-0 text-primary hover:text-primary/80 disabled:opacity-30"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>
      {updateFields.isPending && (
        <p className="text-[10px] text-muted-foreground flex items-center gap-1">
          <Loader2 className="w-2.5 h-2.5 animate-spin" /> Saving…
        </p>
      )}
    </div>
  );
}

interface ContactTimelinePanelProps {
  contact: Contact;
  /** Navigate to inbox with this conversation selected */
  onOpenConversation?: (conversationId: string) => void;
}

export function ContactTimelinePanel({ contact }: ContactTimelinePanelProps) {
  const { data, isLoading } = useContactTimeline(contact.id);
  const [filter, setFilter] = useState<"all" | "message" | "ticket" | "broadcast">("all");

  const events = (data?.events ?? []).filter(
    (e) => filter === "all" || e.type === filter || (filter === "ticket" && e.type === "ticket_note"),
  );

  const identities = [
    ...(contact.whatsappIds ?? (contact.whatsappId ? [contact.whatsappId] : [])),
    ...(contact.identities?.filter((i: any) => i.channelType === "email").map((e: any) => e.externalId ?? e) ?? []),
    ...(contact.instagramId ? [`@ig:${contact.instagramId}`] : []),
    ...(contact.facebookId ? [`fb:${contact.facebookId}`] : []),
  ];

  return (
    <div className="flex flex-col h-full overflow-hidden bg-card text-sm">
      {/* Contact header */}
      <div className="px-4 py-4 border-b border-border/50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center text-primary font-bold text-sm shrink-0 border border-primary/10">
            {(contact.name ?? "?").slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-foreground truncate">{contact.name ?? "Unknown"}</p>
            {contact.tag && (
              <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                <Tag className="w-2.5 h-2.5" />
                {contact.tag}
              </span>
            )}
          </div>
        </div>
        {identities.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {identities.map((id, i) => (
              <span key={i} className="text-[10px] bg-muted/70 rounded-full px-2 py-0.5 text-muted-foreground font-mono truncate max-w-[140px]">
                {id}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Custom fields */}
      <div className="px-4 py-3 border-b border-border/50">
        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Custom fields</p>
        <CustomFieldsEditor
          contactId={contact.id}
          initial={data?.customFields ?? {}}
        />
      </div>

      {/* Timeline filter tabs */}
      <div className="px-4 py-2 border-b border-border/50 flex gap-1">
        {(["all", "message", "ticket", "broadcast"] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={cn(
              "rounded-full px-2.5 py-0.5 text-[10px] font-semibold capitalize transition-colors",
              filter === f
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Timeline feed */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : events.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <MessageSquare className="w-8 h-8 mb-2 opacity-20" />
            <p className="text-xs">No events yet</p>
          </div>
        ) : (
          <div>
            {events.map((event: any) => (
              <TimelineEventRow key={event.id} event={event} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
