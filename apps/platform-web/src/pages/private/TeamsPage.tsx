import { useState } from "react";
import { toast } from "sonner";
import { useTeams, useOrgUsers, type Team } from "../../api";
import { Building2, Plus, X, Users, ChevronRight } from "lucide-react";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";

async function apiPost(path: string, body: unknown, token: string) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(d.error ?? `${res.status}`);
  }
  return res.json();
}

interface CreateTeamModalProps { token: string; onClose: () => void; onCreated: () => void }
function CreateTeamModal({ token, onClose, onCreated }: CreateTeamModalProps) {
  const [name, setName] = useState("");
  const [managerId, setManagerId] = useState("");
  const [loading, setLoading] = useState(false);
  const { data: users = [] } = useOrgUsers();
  const managers = users.filter((u) => u.role === "MANAGER" || u.role === "ADMIN");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await apiPost("/api/v1/teams", { name, managerId: managerId || undefined }, token);
      toast.success(`Team "${name}" created`);
      onCreated();
      onClose();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-sm rounded-2xl border border-border bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-border p-5">
          <h2 className="font-semibold text-foreground">Create Team</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent transition-colors"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Team Name *</label>
            <input
              id="team-name"
              type="text"
              required
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. L1 Support, Billing"
              className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder-muted-foreground outline-none focus:border-primary/50 transition-all"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Manager</label>
            <select
              value={managerId}
              onChange={(e) => setManagerId(e.target.value)}
              className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary/50 transition-all"
            >
              <option value="">— no manager —</option>
              {managers.map((u) => <option key={u.id} value={u.id}>{u.username}</option>)}
            </select>
          </div>
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 rounded-xl border border-border py-2.5 text-sm text-foreground hover:bg-accent transition-colors">Cancel</button>
            <button
              id="create-team-submit"
              type="submit"
              disabled={loading}
              className="flex-1 rounded-xl bg-primary py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {loading ? "Creating…" : "Create Team"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function TeamCard({ team }: { team: Team }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 hover:bg-muted hover:border-border transition-all group cursor-default">
      <div className="flex items-start justify-between mb-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/20 border border-primary/30">
          <Building2 className="w-5 h-5 text-primary" />
        </div>
        <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
      </div>
      <h3 className="font-semibold text-foreground mb-1">{team.name}</h3>
      {team.manager && (
        <p className="text-xs text-muted-foreground mb-3">Manager: <span className="text-foreground">{team.manager.username}</span></p>
      )}
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <Users className="w-3 h-3" />
          {team._count?.members ?? 0} members
        </span>
        <span>{team._count?.tickets ?? 0} tickets</span>
      </div>
    </div>
  );
}

export function TeamsPage() {
  const [showCreate, setShowCreate] = useState(false);
  const { data: teams = [], isLoading, refetch } = useTeams();
  // We need the token for direct fetch in CreateTeamModal
  const token = (() => {
    try { return (JSON.parse(localStorage.getItem("cep-auth-store") ?? "{}") as any)?.state?.token ?? ""; }
    catch { return ""; }
  })();

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <div className="flex items-center gap-3">
          <Building2 className="w-5 h-5 text-primary" />
          <h1 className="text-lg font-semibold text-foreground">Teams</h1>
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{teams.length}</span>
        </div>
        <button
          id="create-team-btn"
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Team
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {isLoading ? (
          <div className="text-center text-muted-foreground text-sm py-8">Loading teams…</div>
        ) : teams.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
            <Building2 className="w-8 h-8 mb-2 opacity-30" />
            <p className="text-sm">No teams yet</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {teams.map((team) => <TeamCard key={team.id} team={team} />)}
          </div>
        )}
      </div>

      {showCreate && <CreateTeamModal token={token} onClose={() => setShowCreate(false)} onCreated={() => refetch()} />}
    </div>
  );
}
