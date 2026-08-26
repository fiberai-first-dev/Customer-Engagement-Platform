import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  useTickets,
  useUpdateTicketStatus,
  useTeams,
  useOrgUsers,
  type Ticket,
  type TicketStatus,
} from "../../api";
import { useAuthStore } from "../../store/auth";
import { formatDistanceToNow } from "date-fns";
import { Ticket as TicketIcon, Search, ChevronDown, TriangleAlert } from "lucide-react";

const STATUS_CONFIG: Record<TicketStatus, { label: string; bg: string; text: string }> = {
  OPEN: { label: "Open", bg: "bg-blue-500/15", text: "text-blue-400" },
  IN_PROGRESS: { label: "In Progress", bg: "bg-amber-500/15", text: "text-amber-400" },
  ESCALATED: { label: "Escalated", bg: "bg-orange-500/15", text: "text-orange-400" },
  RESOLVED: { label: "Resolved", bg: "bg-emerald-500/15", text: "text-emerald-400" },
  CLOSED: { label: "Closed", bg: "bg-slate-500/15", text: "text-slate-400" },
};

const PRIORITY_COLORS: Record<string, string> = {
  LOW: "text-muted-foreground",
  MEDIUM: "text-blue-500",
  HIGH: "text-amber-500",
  URGENT: "text-red-500",
};

const STATUS_FILTERS: Array<TicketStatus | "ALL"> = [
  "ALL", "OPEN", "IN_PROGRESS", "ESCALATED", "RESOLVED", "CLOSED",
];

function StatusBadge({ status }: { status: TicketStatus }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${cfg.bg} ${cfg.text}`}>
      {cfg.label}
    </span>
  );
}

function TicketStatusMenu({ ticket }: { ticket: Ticket }) {
  const [open, setOpen] = useState(false);
  const update = useUpdateTicketStatus();
  const user = useAuthStore((s) => s.user);

  const handleChange = async (status: TicketStatus, e: React.MouseEvent) => {
    e.stopPropagation();
    setOpen(false);
    await update.mutateAsync({ id: ticket.id, status });
  };

  // Agents cannot directly set ESCALATED or CLOSED
  const allowedStatuses = (Object.keys(STATUS_CONFIG) as TicketStatus[]).filter((s) => {
    if (user?.role === "AGENT" && (s === "ESCALATED" || s === "CLOSED")) return false;
    return true;
  });

  return (
    <div className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        className="flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors hover:opacity-80"
      >
        <StatusBadge status={ticket.status} />
        <ChevronDown className="w-3 h-3 text-slate-500" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={(e) => { e.stopPropagation(); setOpen(false); }} />
          <div className="absolute left-0 top-full mt-1 z-20 w-40 rounded-xl border border-border bg-card shadow-xl overflow-hidden">
            {allowedStatuses.map((s) => (
              <button
                key={s}
                onClick={(e) => handleChange(s, e)}
                className="flex w-full items-center gap-2 px-3 py-2 text-xs hover:bg-muted transition-colors"
              >
                <StatusBadge status={s} />
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function TicketsPage() {
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState<TicketStatus | "ALL">("OPEN");
  const [priorityFilter, setPriorityFilter] = useState<string>("ALL");
  const [assigneeFilter, setAssigneeFilter] = useState<string>("ALL");
  const [teamFilter, setTeamFilter] = useState<string>("ALL");
  const [search, setSearch] = useState<string>("");

  const user = useAuthStore((s) => s.user);
  const hasPersonalTeam = user?.role === "MANAGER" || user?.role === "AGENT";
  const { data: teams = [] } = useTeams();
  const { data: orgUsers = [] } = useOrgUsers();

  const { data: tickets, isLoading } = useTickets({
    status: statusFilter !== "ALL" ? statusFilter : undefined,
    priority: priorityFilter !== "ALL" ? (priorityFilter as any) : undefined,
    assigneeId: assigneeFilter !== "ALL" ? assigneeFilter : undefined,
    teamId: teamFilter !== "ALL" ? teamFilter : undefined,
    search: search.trim() || undefined,
  });

  const handleMyTickets = () => {
    setStatusFilter("ALL");
    setAssigneeFilter(user?.id ?? "ALL");
    setTeamFilter("ALL");
    setPriorityFilter("ALL");
  };

  const handleMyTeam = () => {
    setStatusFilter("ALL");
    setAssigneeFilter("ALL");
    setPriorityFilter("ALL");
    if (user?.teamId) {
      setTeamFilter(user.teamId);
    }
  };

  const handleEscalated = () => {
    setStatusFilter("ESCALATED");
    setAssigneeFilter("ALL");
    setTeamFilter("ALL");
    setPriorityFilter("ALL");
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <div className="flex items-center gap-3">
          <TicketIcon className="w-5 h-5 text-primary" />
          <h1 className="text-lg font-semibold text-foreground">Tickets</h1>
          {tickets && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              {tickets.length}
            </span>
          )}
        </div>
      </div>

      {/* Status filter tabs */}
      <div className="flex gap-1 border-b border-border px-6 py-2 overflow-x-auto">
        {STATUS_FILTERS.map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              statusFilter === s
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            {s === "ALL" ? "All Tickets" : STATUS_CONFIG[s].label}
          </button>
        ))}
      </div>

      {/* Filters row */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-6 py-3 bg-muted/20">
        {/* Quick views */}
        <button
          onClick={handleMyTickets}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
            assigneeFilter === user?.id && teamFilter === "ALL"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
          }`}
        >
          My Tickets
        </button>
        {/* Admins / Super Admins are org-level — they don't belong to a team */}
        {hasPersonalTeam && (
          <button
            onClick={handleMyTeam}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              teamFilter === user?.teamId && assigneeFilter === "ALL"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            My Team
          </button>
        )}
        <button
          onClick={handleEscalated}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
            statusFilter === "ESCALATED"
              ? "bg-orange-500 text-white shadow-sm"
              : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
          }`}
        >
          <TriangleAlert className="w-3 h-3" />
          Escalated
        </button>

        <div className="h-4 w-px bg-border mx-1" />

        {/* Search */}
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            id="ticket-search"
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tickets…"
            className="w-full rounded-lg border border-border bg-background pl-8 pr-3 py-1.5 text-xs text-foreground outline-none focus:border-primary/50 transition-all"
          />
        </div>

        {/* Assignee filter */}
        <select
          value={assigneeFilter}
          onChange={(e) => setAssigneeFilter(e.target.value)}
          className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs text-foreground outline-none focus:border-primary/50"
        >
          <option value="ALL">All Assignees</option>
          {orgUsers.map((u) => (
            <option key={u.id} value={u.id}>{u.username}</option>
          ))}
        </select>

        {/* Team filter — only for admin/manager */}
        {(user?.role === "SUPER_ADMIN" || user?.role === "ADMIN" || user?.role === "MANAGER") && (
          <select
            value={teamFilter}
            onChange={(e) => setTeamFilter(e.target.value)}
            className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs text-foreground outline-none focus:border-primary/50"
          >
            <option value="ALL">All Teams</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        )}

        {/* Priority filter */}
        <select
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value)}
          className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs text-foreground outline-none focus:border-primary/50"
        >
          <option value="ALL">All Priorities</option>
          <option value="LOW">Low</option>
          <option value="MEDIUM">Medium</option>
          <option value="HIGH">High</option>
          <option value="URGENT">Urgent</option>
        </select>
      </div>

      {/* Ticket list */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
            Loading tickets…
          </div>
        ) : !tickets?.length ? (
          <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
            <TicketIcon className="w-8 h-8 mb-2 opacity-30" />
            <p className="text-sm">No tickets found</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th className="px-6 py-3 text-left font-medium">#</th>
                <th className="px-3 py-3 text-left font-medium">Subject</th>
                <th className="px-3 py-3 text-left font-medium">Status</th>
                <th className="px-3 py-3 text-left font-medium">Priority</th>
                <th className="px-3 py-3 text-left font-medium">Team</th>
                <th className="px-3 py-3 text-left font-medium">Assignee</th>
                <th className="px-3 py-3 text-left font-medium">Updated</th>
              </tr>
            </thead>
            <tbody>
              {tickets.map((ticket) => (
                <tr
                  key={ticket.id}
                  onClick={() => navigate(`/tickets/${ticket.id}`)}
                  className="border-b border-border hover:bg-muted/50 transition-colors cursor-pointer"
                >
                  <td className="px-6 py-3 text-muted-foreground font-mono text-xs">#{ticket.number}</td>
                  <td className="px-3 py-3 max-w-xs">
                    <p className="text-foreground font-medium truncate">{ticket.subject}</p>
                    {ticket.customer?.name && (
                      <p className="text-xs text-muted-foreground">{ticket.customer.name}</p>
                    )}
                  </td>
                  <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                    <TicketStatusMenu ticket={ticket} />
                  </td>
                  <td className={`px-3 py-3 text-xs font-medium ${PRIORITY_COLORS[ticket.priority]}`}>
                    {ticket.priority.charAt(0) + ticket.priority.slice(1).toLowerCase()}
                  </td>
                  <td className="px-3 py-3 text-xs text-muted-foreground">
                    {ticket.team?.name ?? <span className="italic">No team</span>}
                  </td>
                  <td className="px-3 py-3 text-xs text-foreground">
                    {ticket.assignee?.username ?? <span className="text-muted-foreground">Unassigned</span>}
                  </td>
                  <td className="px-3 py-3 text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(ticket.updatedAt), { addSuffix: true })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
