import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import {
  useTicket,
  useUpdateTicketStatus,
  useUpdateTicket,
  useAssignTicket,
  useAddTicketNote,
  useReturnTicket,
  useTicketEvents,
  useTeams,
  useOrgUsers,
  useMessages,
  type TicketStatus,
  type TicketPriority,
} from "../../api";
import { useAppStore } from "../../store";
import { useAuthStore } from "../../store/auth";
import { EscalateModal } from "../../components/tickets/EscalateModal";
import {
  ArrowLeft,
  ArrowUpCircle,
  ArrowDownCircle,
  MessageSquare,
  User2,
  Users,
  Tag,
  AlertCircle,
  ChevronDown,
  Clock,
  Plus,
  Loader2,
  Lock,
  CircleDot,
  UserPlus,
  RefreshCw,
  ArrowRightLeft,
  StickyNote,
  CheckCircle2,
  XCircle,
  RotateCcw,
} from "lucide-react";

const STATUS_CONFIG: Record<TicketStatus, { label: string; bg: string; text: string; border: string }> = {
  OPEN: { label: "Open", bg: "bg-blue-500/15", text: "text-blue-400", border: "border-blue-500/30" },
  IN_PROGRESS: { label: "In Progress", bg: "bg-amber-500/15", text: "text-amber-400", border: "border-amber-500/30" },
  ESCALATED: { label: "Escalated", bg: "bg-orange-500/15", text: "text-orange-400", border: "border-orange-500/30" },
  RESOLVED: { label: "Resolved", bg: "bg-emerald-500/15", text: "text-emerald-400", border: "border-emerald-500/30" },
  CLOSED: { label: "Closed", bg: "bg-slate-500/15", text: "text-slate-400", border: "border-slate-500/30" },
};

const PRIORITY_CONFIG: Record<TicketPriority, { label: string; color: string; bg: string }> = {
  LOW: { label: "Low", color: "text-slate-400", bg: "bg-slate-500/10" },
  MEDIUM: { label: "Medium", color: "text-blue-400", bg: "bg-blue-500/10" },
  HIGH: { label: "High", color: "text-amber-400", bg: "bg-amber-500/10" },
  URGENT: { label: "Urgent", color: "text-red-400", bg: "bg-red-500/10" },
};

const EVENT_META: Record<string, { label: string; icon: typeof CircleDot; color: string; bg: string }> = {
  CREATED: { label: "Ticket created", icon: CircleDot, color: "text-blue-400", bg: "bg-blue-500/15" },
  ASSIGNED: { label: "Assigned", icon: UserPlus, color: "text-violet-400", bg: "bg-violet-500/15" },
  REASSIGNED: { label: "Reassigned", icon: RefreshCw, color: "text-violet-400", bg: "bg-violet-500/15" },
  STATUS_CHANGED: { label: "Status changed", icon: ArrowRightLeft, color: "text-sky-400", bg: "bg-sky-500/15" },
  PRIORITY_CHANGED: { label: "Priority changed", icon: Tag, color: "text-amber-400", bg: "bg-amber-500/15" },
  TEAM_CHANGED: { label: "Team changed", icon: Users, color: "text-indigo-400", bg: "bg-indigo-500/15" },
  ESCALATED: { label: "Escalated", icon: ArrowUpCircle, color: "text-orange-400", bg: "bg-orange-500/15" },
  RETURNED: { label: "Returned to agent", icon: ArrowDownCircle, color: "text-blue-400", bg: "bg-blue-500/15" },
  NOTE_ADDED: { label: "Note added", icon: StickyNote, color: "text-amber-400", bg: "bg-amber-500/15" },
  REPLIED: { label: "Reply sent", icon: MessageSquare, color: "text-emerald-400", bg: "bg-emerald-500/15" },
  RESOLVED: { label: "Resolved", icon: CheckCircle2, color: "text-emerald-400", bg: "bg-emerald-500/15" },
  CLOSED: { label: "Closed", icon: XCircle, color: "text-slate-400", bg: "bg-slate-500/15" },
  REOPENED: { label: "Reopened", icon: RotateCcw, color: "text-blue-400", bg: "bg-blue-500/15" },
};

export function TicketDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const [showEscalate, setShowEscalate] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [statusOpen, setStatusOpen] = useState(false);
  const [priorityOpen, setPriorityOpen] = useState(false);

  const { data: ticket, isLoading } = useTicket(id);
  const { data: events = [] } = useTicketEvents(id);
  const { data: teams = [] } = useTeams();
  const { data: users = [] } = useOrgUsers();

  const updateStatus = useUpdateTicketStatus();
  const updateTicket = useUpdateTicket();
  const assignTicket = useAssignTicket();
  const addNote = useAddTicketNote();
  const returnTicket = useReturnTicket();
  const setSelectedContactId = useAppStore((s) => s.setSelectedContactId);

  const [activeTab, setActiveTab] = useState<"NOTES" | "THREAD">("NOTES");

  const { data: messages = [], isLoading: messagesLoading } = useMessages(
    activeTab === "THREAD" && ticket?.conversationId ? ticket.conversationId : undefined
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-slate-500 gap-2">
        <Loader2 className="w-5 h-5 animate-spin" /> Loading ticket…
      </div>
    );
  }
  if (!ticket) {
    return <div className="flex items-center justify-center h-full text-slate-500">Ticket not found</div>;
  }

  const isEscalated = ticket.status === "ESCALATED";
  const isAgent = user?.role === "AGENT";
  const isManagerOrAbove =
    user?.role === "MANAGER" || user?.role === "ADMIN" || user?.role === "SUPER_ADMIN";
  const isAdminOrAbove = user?.role === "ADMIN" || user?.role === "SUPER_ADMIN";

  // Agents see the ticket as read-only when it's escalated
  const isLocked = isEscalated && isAgent;

  const statusCfg = STATUS_CONFIG[ticket.status];

  // Agents can only assign to self; Managers can assign team members; Admins anyone (managers/agents only)
  const agentUsers = users.filter((u) => {
    if (u.role !== "AGENT" && u.role !== "MANAGER") return false;
    if (!u.isActive) return false;
    if (isAdminOrAbove) return true;
    if (isManagerOrAbove && !isAdminOrAbove) {
      return u.teamId === user?.teamId;
    }
    return u.id === user?.id;
  });

  // Allowed status transitions per role (excluding ESCALATED — use Escalate button)
  const allowedStatuses = (Object.keys(STATUS_CONFIG) as TicketStatus[]).filter((s) => {
    if (s === "ESCALATED") return false; // use Escalate button
    if (isAgent) {
      const transitions: Record<string, string[]> = {
        OPEN: ["IN_PROGRESS"],
        IN_PROGRESS: ["OPEN", "RESOLVED"],
        ESCALATED: [],
        RESOLVED: ["OPEN"],
        CLOSED: [],
      };
      return (transitions[ticket.status] ?? []).includes(s);
    }
    return true;
  });

  const handleStatusChange = async (status: TicketStatus) => {
    setStatusOpen(false);
    try {
      await updateStatus.mutateAsync({ id: ticket.id, status });
      toast.success(`Status → ${STATUS_CONFIG[status].label}`);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handlePriorityChange = async (priority: TicketPriority) => {
    setPriorityOpen(false);
    try {
      await updateTicket.mutateAsync({ id: ticket.id, priority });
      toast.success(`Priority → ${PRIORITY_CONFIG[priority].label}`);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleAddNote = async () => {
    if (!noteText.trim()) return;
    try {
      await addNote.mutateAsync({ id: ticket.id, body: noteText });
      setNoteText("");
      toast.success("Note added");
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleReturn = async () => {
    try {
      await returnTicket.mutateAsync({ id: ticket.id });
      toast.success("Ticket returned to agent");
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Top bar */}
      <div className="flex items-center gap-3 border-b border-border px-6 py-3 bg-card/40">
        <button
          onClick={() => navigate("/tickets")}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <span className="text-muted-foreground font-mono text-sm">#{ticket.number}</span>
        <h1 className="text-foreground font-semibold truncate flex-1">{ticket.subject}</h1>
        <span
          className={`text-xs font-medium px-2.5 py-1 rounded-md border ${statusCfg.bg} ${statusCfg.text} ${statusCfg.border}`}
        >
          {statusCfg.label}
        </span>

        {/* Lock indicator for escalated agents */}
        {isLocked && (
          <span className="flex items-center gap-1 text-xs text-orange-400 bg-orange-500/10 border border-orange-500/20 px-2.5 py-1 rounded-md">
            <Lock className="w-3 h-3" /> Escalated — read only
          </span>
        )}

        {/* Return to agent — Manager+ when escalated */}
        {isEscalated && isManagerOrAbove && (
          <button
            id="return-btn"
            onClick={handleReturn}
            disabled={returnTicket.isPending}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            <ArrowDownCircle className="w-3.5 h-3.5" />
            Return to Agent
          </button>
        )}

        {/* Escalate — not escalated, not locked */}
        {!isLocked && ticket.status !== "CLOSED" && ticket.status !== "RESOLVED" && !isEscalated && (
          <button
            id="escalate-btn"
            onClick={() => setShowEscalate(true)}
            className="inline-flex items-center gap-1.5 rounded-md bg-orange-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-orange-600 transition-colors"
          >
            <ArrowUpCircle className="w-3.5 h-3.5" />
            Escalate
          </button>
        )}
      </div>

      {/* 3-column body */}
      <div className="flex flex-1 min-h-0">
        {/* LEFT: Customer info */}
        <div className="w-56 shrink-0 border-r border-white/8 overflow-y-auto p-4 space-y-5">
          <Section icon={<User2 className="w-3.5 h-3.5" />} title="Customer">
            <p className="text-sm text-white">{ticket.customer?.name ?? "Unknown"}</p>
          </Section>
          {ticket.channel && (
            <Section icon={<MessageSquare className="w-3.5 h-3.5" />} title="Channel">
              <span className="text-xs capitalize text-slate-300 bg-white/8 px-2 py-0.5 rounded-full">
                {ticket.channel}
              </span>
            </Section>
          )}
          {ticket.conversationId && (
            <Section icon={<MessageSquare className="w-3.5 h-3.5" />} title="Inbox Link">
              <button
                onClick={() => {
                  if (ticket.customerId) {
                    setSelectedContactId(ticket.customerId);
                    navigate("/inbox");
                  }
                }}
                className="text-xs text-purple-400 hover:text-purple-300 underline underline-offset-2 transition-colors"
              >
                View conversation in Inbox
              </button>
            </Section>
          )}
          {ticket.description && (
            <Section icon={<AlertCircle className="w-3.5 h-3.5" />} title="Description">
              <p className="text-xs text-slate-400 leading-relaxed">{ticket.description}</p>
            </Section>
          )}
          <Section icon={<Clock className="w-3.5 h-3.5" />} title="Created">
            <p className="text-xs text-slate-400">
              {formatDistanceToNow(new Date(ticket.createdAt), { addSuffix: true })}
            </p>
            {ticket.creator && (
              <p className="text-xs text-slate-500">by {ticket.creator.username}</p>
            )}
          </Section>
        </div>

        {/* CENTER: Notes / thread */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-white/5 border-r border-white/8">
          {/* Tabs */}
          <div className="flex items-center gap-6 px-5 border-b border-white/8 pt-2">
            <button
              onClick={() => setActiveTab("NOTES")}
              className={`pb-3 text-xs font-semibold tracking-wide transition-colors border-b-2 ${
                activeTab === "NOTES"
                  ? "border-purple-500 text-purple-400"
                  : "border-transparent text-slate-500 hover:text-slate-300"
              }`}
            >
              INTERNAL NOTES
            </button>
            {ticket.conversationId && (
              <button
                onClick={() => setActiveTab("THREAD")}
                className={`pb-3 text-xs font-semibold tracking-wide transition-colors border-b-2 ${
                  activeTab === "THREAD"
                    ? "border-purple-500 text-purple-400"
                    : "border-transparent text-slate-500 hover:text-slate-300"
                }`}
              >
                CUSTOMER THREAD
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-5 space-y-3">
            {activeTab === "NOTES" ? (
              <>
                {!ticket.notes || ticket.notes.length === 0 ? (
                  <p className="text-muted-foreground text-sm text-center py-8">No notes yet.</p>
                ) : (
                  ticket.notes.map((note) => (
                    <div key={note.id} className="rounded-xl border border-border bg-card p-3">
                      <div className="flex items-center gap-1.5 mb-2">
                        <span className="text-xs font-medium text-foreground">
                          {note.author?.username ?? "Unknown"}
                        </span>
                        <span className="text-xs text-muted-foreground">·</span>
                        <span className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(note.createdAt), { addSuffix: true })}
                        </span>
                        {note.isInternal && (
                          <span className="ml-auto text-[10px] font-medium text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded-full">
                            Internal
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-foreground whitespace-pre-wrap">{note.body}</p>
                    </div>
                  ))
                )}
              </>
            ) : (
              <>
                {messagesLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="w-5 h-5 text-muted-foreground animate-spin" />
                  </div>
                ) : messages.length === 0 ? (
                  <p className="text-muted-foreground text-sm text-center py-8">No messages found.</p>
                ) : (
                  <div className="space-y-4">
                    {messages.map((msg) => (
                      <div
                        key={msg.id}
                        className={`flex flex-col max-w-[85%] ${
                          msg.direction === "outgoing"
                            ? "ml-auto items-end"
                            : "mr-auto items-start"
                        }`}
                      >
                        <div
                          className={`px-4 py-2 rounded-2xl text-sm ${
                            msg.direction === "outgoing"
                              ? "bg-primary text-primary-foreground rounded-br-sm"
                              : "bg-card border border-border text-foreground rounded-bl-sm"
                          }`}
                        >
                          {msg.content}
                        </div>
                        <span className="text-[10px] text-muted-foreground mt-1 px-1">
                          {formatDistanceToNow(new Date(msg.createdAt), { addSuffix: true })}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Note composer */}
          {activeTab === "NOTES" && !isLocked && (
            <div className="border-t border-border p-4 bg-card">
              <div className="flex gap-2">
                <textarea
                  id="note-input"
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  rows={2}
                  placeholder="Add an internal note… (never sent to customer)"
                  className="flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground placeholder-muted-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary resize-none transition-all"
                />
                <button
                  id="add-note-btn"
                  onClick={handleAddNote}
                  disabled={addNote.isPending || !noteText.trim()}
                  className="self-end rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
          {isLocked && (
            <div className="border-t border-border p-3 bg-orange-500/5 text-xs text-orange-400 text-center">
              Ticket is escalated. Notes are disabled until a manager returns it.
            </div>
          )}
        </div>

        {/* RIGHT: Actions sidebar */}
        <div className="w-56 shrink-0 border-l border-border overflow-y-auto p-4 space-y-5">
          {/* Status */}
          {!isLocked && (
            <Section icon={<ChevronDown className="w-3.5 h-3.5" />} title="Status">
              <div className="relative">
                <button
                  id="status-dropdown"
                  onClick={() => setStatusOpen(!statusOpen)}
                  disabled={allowedStatuses.length === 0}
                  className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-xs font-medium ${statusCfg.bg} ${statusCfg.text} ${statusCfg.border} hover:opacity-80 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  {statusCfg.label}
                  {allowedStatuses.length > 0 && <ChevronDown className="w-3 h-3 opacity-60" />}
                </button>
                {statusOpen && allowedStatuses.length > 0 && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setStatusOpen(false)} />
                    <div className="absolute top-full left-0 right-0 mt-1 z-20 rounded-xl border border-border bg-card shadow-xl overflow-hidden">
                      {allowedStatuses.map((s) => (
                        <button
                          key={s}
                          onClick={() => handleStatusChange(s)}
                          className={`flex w-full items-center gap-2 px-3 py-2 text-xs hover:bg-muted transition-colors ${STATUS_CONFIG[s].text}`}
                        >
                          {STATUS_CONFIG[s].label}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </Section>
          )}

          {/* Priority */}
          <Section icon={<Tag className="w-3.5 h-3.5" />} title="Priority">
            {isLocked || isAgent ? (
              <span className={`text-xs font-semibold ${PRIORITY_CONFIG[ticket.priority].color}`}>
                {PRIORITY_CONFIG[ticket.priority].label}
              </span>
            ) : (
              <div className="relative">
                <button
                  id="priority-dropdown"
                  onClick={() => setPriorityOpen(!priorityOpen)}
                  className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-xs font-medium ${PRIORITY_CONFIG[ticket.priority].bg} ${PRIORITY_CONFIG[ticket.priority].color} border-border hover:opacity-80 transition-opacity`}
                >
                  {PRIORITY_CONFIG[ticket.priority].label}
                  <ChevronDown className="w-3 h-3 opacity-60" />
                </button>
                {priorityOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setPriorityOpen(false)} />
                    <div className="absolute top-full left-0 right-0 mt-1 z-20 rounded-xl border border-border bg-card shadow-xl overflow-hidden">
                      {(Object.keys(PRIORITY_CONFIG) as TicketPriority[]).map((p) => (
                        <button
                          key={p}
                          onClick={() => handlePriorityChange(p)}
                          className={`flex w-full items-center gap-2 px-3 py-2 text-xs hover:bg-muted transition-colors ${PRIORITY_CONFIG[p].color}`}
                        >
                          {PRIORITY_CONFIG[p].label}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </Section>

          {/* Assign To — person XOR team queue */}
          <Section icon={<User2 className="w-3.5 h-3.5" />} title="Assign To">
            {isLocked ? (
              <div className="flex flex-col gap-0.5">
                <p className="text-xs text-foreground">
                  {ticket.assignee
                    ? `${ticket.assignee.username}${ticket.team?.name ? ` — ${ticket.team.name}` : ""}`
                    : ticket.team
                      ? `Team queue: ${ticket.team.name}`
                      : <span className="text-muted-foreground">Unassigned</span>}
                </p>
              </div>
            ) : (
              <select
                id="assignee-select"
                value={
                  ticket.assignedTo
                    ? `user:${ticket.assignedTo}`
                    : ticket.teamId
                      ? `team:${ticket.teamId}`
                      : "unassigned"
                }
                onChange={(e) => {
                  const val = e.target.value;
                  let tId: string | undefined;
                  let aId: string | undefined;

                  if (val.startsWith("team:")) {
                    tId = val.replace("team:", "");
                    aId = undefined; // team queue — clear person
                  } else if (val.startsWith("user:")) {
                    aId = val.replace("user:", "");
                    const targetUser = agentUsers.find((u) => u.id === aId);
                    tId = targetUser?.teamId || undefined;
                  } else {
                    tId = undefined;
                    aId = undefined;
                  }

                  assignTicket
                    .mutateAsync({
                      id: ticket.id,
                      assigneeId: aId ?? "",
                      teamId: tId ?? "",
                    })
                    .then(() => toast.success("Assignment updated"))
                    .catch((err: any) => toast.error(err.message));
                }}
                className="w-full rounded-md border border-border bg-background px-2.5 py-2 text-xs text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              >
                <option value="unassigned">Unassigned</option>
                {isManagerOrAbove && teams.length > 0 && (
                  <optgroup label="Team queues">
                    {teams.map((t) => (
                      <option key={`team-${t.id}`} value={`team:${t.id}`}>
                        {t.name} (open queue)
                      </option>
                    ))}
                  </optgroup>
                )}
                <optgroup label="People">
                  {agentUsers.map((u) => (
                    <option key={`user-${u.id}`} value={`user:${u.id}`}>
                      {(u.name || u.username.split("@")[0])}
                      {u.team?.name ? ` — ${u.team.name}` : ""}
                    </option>
                  ))}
                </optgroup>
              </select>
            )}
          </Section>

          {/* Activity log */}
          <Section icon={<Clock className="w-3.5 h-3.5" />} title="Activity">
            {events.length === 0 ? (
              <p className="text-xs text-muted-foreground">No activity yet</p>
            ) : (
              <ol className="relative ms-2 border-s border-border space-y-0">
                {events.map((ev) => {
                  const meta = EVENT_META[ev.type] ?? {
                    label: ev.type,
                    icon: CircleDot,
                    color: "text-muted-foreground",
                    bg: "bg-muted",
                  };
                  const Icon = meta.icon;
                  return (
                    <li key={ev.id} className="relative ps-5 pb-4 last:pb-0">
                      <span
                        className={`absolute -start-2.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full border border-border ${meta.bg}`}
                      >
                        <Icon className={`h-2.5 w-2.5 ${meta.color}`} />
                      </span>
                      <p className={`text-xs font-medium ${meta.color}`}>{meta.label}</p>
                      {ev.note && (
                        <p className="mt-1 text-[11px] text-muted-foreground leading-snug rounded-md bg-muted/50 px-2 py-1">
                          {ev.note}
                        </p>
                      )}
                      <p className="mt-0.5 text-[10px] text-muted-foreground/80">
                        {formatDistanceToNow(new Date(ev.createdAt), { addSuffix: true })}
                      </p>
                    </li>
                  );
                })}
              </ol>
            )}
          </Section>
        </div>
      </div>

      {showEscalate && (
        <EscalateModal ticket={ticket} onClose={() => setShowEscalate(false)} />
      )}
    </div>
  );
}

function Section({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-muted-foreground mb-2">
        {icon}
        <span className="text-[10px] font-semibold uppercase tracking-wide">{title}</span>
      </div>
      {children}
    </div>
  );
}
