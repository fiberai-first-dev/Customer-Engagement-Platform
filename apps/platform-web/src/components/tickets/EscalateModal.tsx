import { useState } from "react";
import { toast } from "sonner";
import { X, AlertTriangle, ArrowUpCircle } from "lucide-react";
import { useEscalateTicket, useTeams, useOrgUsers, type Ticket } from "../../api";
import { useAuthStore } from "../../store/auth";

interface EscalateModalProps {
  ticket: Ticket;
  onClose: () => void;
}

export function EscalateModal({ ticket, onClose }: EscalateModalProps) {
  const [teamId, setTeamId] = useState(ticket.teamId ?? "");
  const [userId, setUserId] = useState("");
  const [note, setNote] = useState("");
  const escalate = useEscalateTicket();
  const { data: teams = [] } = useTeams();
  const { data: users = [] } = useOrgUsers();
  const user = useAuthStore((s) => s.user);

  const isAgent = user?.role === "AGENT";

  // Managers/Admins can escalate to other Managers/Admins/Agents in the selected team
  const agentUsers = users.filter((u) => u.role === "AGENT" || u.role === "MANAGER" || u.role === "ADMIN" || u.role === "SUPER_ADMIN");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isAgent) {
      if (!teamId) {
        toast.error("Select your team queue to escalate to");
        return;
      }
    } else {
      if (!teamId && !userId) {
        toast.error("Select a team or user to escalate to");
        return;
      }
    }
    
    try {
      await escalate.mutateAsync({
        id: ticket.id,
        teamId: teamId || undefined,
        userId: isAgent ? undefined : (userId || undefined), // Enforce agent constraint
        note: note.trim() || undefined,
      });
      toast.success(`Ticket #${ticket.number} escalated`);
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Failed to escalate");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-border bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-border p-5">
          <div className="flex items-center gap-2">
            <ArrowUpCircle className="w-5 h-5 text-orange-500" />
            <h2 className="font-semibold text-foreground">Escalate Ticket #{ticket.number}</h2>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="flex items-start gap-2 rounded-lg bg-orange-500/10 border border-orange-500/20 px-3 py-2 text-xs text-orange-600 dark:text-orange-400">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            This will change the ticket status to ESCALATED and notify the target team{isAgent ? " manager" : "/user"}.
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Escalate to Team Queue</label>
            <select
              id="escalate-team"
              value={teamId}
              onChange={(e) => setTeamId(e.target.value)}
              className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
            >
              <option value="">— select team —</option>
              {teams.map((t) => (
                // If agent, only allow their own team
                <option key={t.id} value={t.id} disabled={isAgent && t.id !== user?.teamId}>
                  {t.name} {isAgent && t.id !== user?.teamId ? "(Managers Only)" : ""}
                </option>
              ))}
            </select>
          </div>

          {!isAgent && (
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Escalate to User (optional)</label>
              <select
                id="escalate-user"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
              >
                <option value="">— select user —</option>
                {agentUsers.map((u) => (
                  <option key={u.id} value={u.id}>{u.username} ({u.role})</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Reason / Note</label>
            <textarea
              id="escalate-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder="Describe why this ticket needs escalation…"
              className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder-muted-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all resize-none"
            />
          </div>

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 rounded-xl border border-border py-2.5 text-sm text-foreground hover:bg-accent transition-colors">
              Cancel
            </button>
            <button
              id="escalate-submit"
              type="submit"
              disabled={escalate.isPending}
              className="flex-1 rounded-xl bg-orange-600 py-2.5 text-sm font-medium text-white hover:bg-orange-500 disabled:opacity-50 transition-colors"
            >
              {escalate.isPending ? "Escalating…" : "Escalate Ticket"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
