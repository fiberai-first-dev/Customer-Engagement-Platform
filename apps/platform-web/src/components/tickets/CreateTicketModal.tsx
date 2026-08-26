import { useState } from "react";
import { toast } from "sonner";
import { TicketIcon, X, AlertCircle } from "lucide-react";
import { useCreateTicket, useTeams, useOrgUsers, type TicketPriority } from "../../api";
import { useAuthStore } from "../../store/auth";

interface CreateTicketModalProps {
  conversationId?: string;
  customerId?: string;
  channel?: string;
  defaultSubject?: string;
  onClose: () => void;
}

const PRIORITY_OPTIONS: { value: TicketPriority; label: string; color: string }[] = [
  { value: "LOW", label: "Low", color: "text-slate-400" },
  { value: "MEDIUM", label: "Medium", color: "text-blue-400" },
  { value: "HIGH", label: "High", color: "text-amber-400" },
  { value: "URGENT", label: "Urgent", color: "text-red-400" },
];

export function CreateTicketModal({ conversationId, customerId, channel, defaultSubject, onClose }: CreateTicketModalProps) {
  const [subject, setSubject] = useState(defaultSubject ?? "");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<TicketPriority>("MEDIUM");
  const [teamId, setTeamId] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  
  const createTicket = useCreateTicket();
  const { data: teams = [] } = useTeams();
  const { data: users = [] } = useOrgUsers();
  const user = useAuthStore((s) => s.user);

  const isManagerOrAbove = user?.role === "MANAGER" || user?.role === "ADMIN" || user?.role === "SUPER_ADMIN";
  const isAdminOrAbove = user?.role === "ADMIN" || user?.role === "SUPER_ADMIN";

  const agentUsers = users.filter((u) => {
    if (isAdminOrAbove) return u.role === "AGENT" || u.role === "MANAGER";
    if (isManagerOrAbove && !isAdminOrAbove) {
      return (u.role === "AGENT" || u.role === "MANAGER") && u.teamId === user?.teamId;
    }
    return u.id === user?.id;
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim()) return;
    try {
      const ticket = await createTicket.mutateAsync({
        subject: subject.trim(),
        description: description.trim() || undefined,
        conversationId,
        customerId,
        channel,
        priority,
        teamId: teamId || undefined,
        assignedTo: assigneeId || undefined,
      });
      toast.success(`Ticket #${ticket.number} created`);
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Failed to create ticket");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      
      <div className="relative z-10 w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl border border-border bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-border p-5 sticky top-0 bg-card z-10">
          <div className="flex items-center gap-2">
            <TicketIcon className="w-5 h-5 text-purple-400" />
            <h2 className="font-semibold text-white">Create Ticket</h2>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {conversationId && (
            <div className="flex items-center gap-2 rounded-lg bg-purple-500/10 border border-purple-500/20 px-3 py-2 text-xs text-purple-300">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              Linked to current conversation
            </div>
          )}

          <div>
            <label className="text-xs font-medium text-slate-400 mb-1.5 block">Subject *</label>
            <input
              id="ticket-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              required
              autoFocus
              placeholder="Brief description of the issue"
              className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder-muted-foreground outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/30 transition-all"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-slate-400 mb-1.5 block">Description</label>
            <textarea
              id="ticket-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="More detail about the issue (optional)"
              className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder-muted-foreground outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/30 transition-all resize-none"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-slate-400 mb-1.5 block">Priority</label>
            <div className="flex gap-2">
              {PRIORITY_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setPriority(opt.value)}
                  className={`flex-1 rounded-lg border py-2 text-xs font-medium transition-all ${
                    priority === opt.value
                      ? "border-primary/30 bg-primary/10 text-primary ring-1 ring-primary/30"
                      : "border-border bg-background text-muted-foreground hover:border-border/80 hover:text-foreground"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-xs font-medium text-slate-400 mb-1.5 block">Assignee</label>
              <select
                id="ticket-assignee"
                value={assigneeId}
                onChange={(e) => setAssigneeId(e.target.value)}
                className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/30 transition-all"
              >
                <option value="">Unassigned</option>
                {agentUsers.map((u) => (
                  <option key={u.id} value={u.id}>{u.username}</option>
                ))}
              </select>
            </div>

            {isManagerOrAbove && (
              <div className="flex-1">
                <label className="text-xs font-medium text-slate-400 mb-1.5 block">Team</label>
                <select
                  id="ticket-team"
                  value={teamId}
                  onChange={(e) => setTeamId(e.target.value)}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/30 transition-all"
                >
                  <option value="">No Team</option>
                  {teams.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl border border-border py-2.5 text-sm text-foreground hover:bg-accent transition-colors"
            >
              Cancel
            </button>
            <button
              id="create-ticket-submit"
              type="submit"
              disabled={createTicket.isPending || !subject.trim()}
              className="flex-1 rounded-xl bg-primary py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {createTicket.isPending ? "Creating…" : "Create Ticket"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
