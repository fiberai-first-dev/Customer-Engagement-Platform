import { useState } from "react";
import { toast } from "sonner";
import {
  useOrgUsers, useCreateOrgUser, useUpdateOrgUser, useTeams,
  type OrgUser, type UserRole,
} from "../../api";
import { useAuthStore } from "../../store/auth";
import { Users, Plus, X, ShieldCheck, Shield, Briefcase, Headphones, ToggleLeft, ToggleRight, Edit2 } from "lucide-react";

const ROLE_META: Record<UserRole, { label: string; icon: React.ReactNode; color: string; bg: string }> = {
  SUPER_ADMIN: { label: "Super Admin", icon: <ShieldCheck className="w-3.5 h-3.5" />, color: "text-purple-400", bg: "bg-purple-500/15" },
  ADMIN: { label: "Admin", icon: <Shield className="w-3.5 h-3.5" />, color: "text-blue-400", bg: "bg-blue-500/15" },
  MANAGER: { label: "Manager", icon: <Briefcase className="w-3.5 h-3.5" />, color: "text-amber-400", bg: "bg-amber-500/15" },
  AGENT: { label: "Agent", icon: <Headphones className="w-3.5 h-3.5" />, color: "text-emerald-400", bg: "bg-emerald-500/15" },
};

const ROLE_HIERARCHY: UserRole[] = ["SUPER_ADMIN", "ADMIN", "MANAGER", "AGENT"];

function allowedRoles(actorRole: UserRole): UserRole[] {
  if (actorRole === "SUPER_ADMIN") return ["SUPER_ADMIN", "ADMIN", "MANAGER", "AGENT"];
  if (actorRole === "ADMIN") return ["MANAGER", "AGENT"];
  return [];
}

function RoleBadge({ role }: { role: UserRole }) {
  const m = ROLE_META[role];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${m.bg} ${m.color}`}>
      {m.icon}
      {m.label}
    </span>
  );
}

interface CreateUserModalProps { actorRole: UserRole; onClose: () => void }
function CreateUserModal({ actorRole, onClose }: CreateUserModalProps) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<UserRole>("AGENT");
  const [teamId, setTeamId] = useState("");
  const createUser = useCreateOrgUser();
  const { data: teams = [] } = useTeams();
  const rolesAvailable = allowedRoles(actorRole);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const u = await createUser.mutateAsync({ email, role, teamId: teamId || undefined });
      toast.success(`User ${u.username} created`);
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Failed to create user");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-sm rounded-2xl border border-border bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-border p-5">
          <h2 className="font-semibold text-foreground">Create User</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent transition-colors"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Email *</label>
            <input
              id="new-user-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoFocus
              placeholder="agent@company.com"
              className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder-muted-foreground outline-none focus:border-primary/50 transition-all"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Role *</label>
            <div className="grid grid-cols-2 gap-2">
              {rolesAvailable.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRole(r)}
                  className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-medium transition-all ${
                    role === r
                      ? `${ROLE_META[r].bg} ${ROLE_META[r].color} border-current/30`
                      : "border-white/10 text-slate-400 hover:border-white/20"
                  }`}
                >
                  {ROLE_META[r].icon}
                  {ROLE_META[r].label}
                </button>
              ))}
            </div>
          </div>
          {(role === "MANAGER" || role === "AGENT") && (
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Team</label>
              <select
                value={teamId}
                onChange={(e) => setTeamId(e.target.value)}
                className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary/50 transition-all"
              >
                <option value="">— no team —</option>
                {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          )}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 rounded-xl border border-border py-2.5 text-sm text-foreground hover:bg-accent transition-colors">Cancel</button>
            <button
              id="create-user-submit"
              type="submit"
              disabled={createUser.isPending}
              className="flex-1 rounded-xl bg-primary py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {createUser.isPending ? "Creating…" : "Create User"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface EditUserModalProps { actorRole: UserRole; user: OrgUser; onClose: () => void }
function EditUserModal({ actorRole, user, onClose }: EditUserModalProps) {
  const [role, setRole] = useState<UserRole>(user.role);
  const [teamId, setTeamId] = useState(user.teamId || "");
  const updateUser = useUpdateOrgUser();
  const { data: teams = [] } = useTeams();
  const rolesAvailable = allowedRoles(actorRole);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updateUser.mutateAsync({ id: user.id, role, teamId: teamId || undefined });
      toast.success(`User ${user.username} updated`);
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Failed to update user");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-sm rounded-2xl border border-border bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-border p-5">
          <h2 className="font-semibold text-foreground">Edit User: {user.username}</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent transition-colors"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Role</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as UserRole)}
              className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary/50 transition-all"
            >
              {rolesAvailable.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          {(role === "MANAGER" || role === "AGENT") && (
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Team</label>
              <select
                value={teamId}
                onChange={(e) => setTeamId(e.target.value)}
                className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary/50 transition-all"
              >
                <option value="">— no team —</option>
                {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          )}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 rounded-xl border border-border py-2.5 text-sm text-foreground hover:bg-accent transition-colors">Cancel</button>
            <button
              id="edit-user-submit"
              type="submit"
              disabled={updateUser.isPending}
              className="flex-1 rounded-xl bg-primary py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {updateUser.isPending ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function UsersPage() {
  const [showCreate, setShowCreate] = useState(false);
  const [editingUser, setEditingUser] = useState<OrgUser | null>(null);
  const actorRole = useAuthStore((s) => s.user?.role ?? "AGENT") as UserRole;
  const { data: users = [], isLoading } = useOrgUsers();
  const updateUser = useUpdateOrgUser();

  const handleToggleActive = async (user: OrgUser) => {
    try {
      await updateUser.mutateAsync({ id: user.id, isActive: !user.isActive });
      toast.success(`User ${user.isActive ? "deactivated" : "activated"}`);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const canManage = (target: OrgUser) => {
    const actorIdx = ROLE_HIERARCHY.indexOf(actorRole);
    const targetIdx = ROLE_HIERARCHY.indexOf(target.role as UserRole);
    return actorIdx < targetIdx;
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <div className="flex items-center gap-3">
          <Users className="w-5 h-5 text-primary" />
          <h1 className="text-lg font-semibold text-foreground">Users & Roles</h1>
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{users.length}</span>
        </div>
        {allowedRoles(actorRole).length > 0 && (
          <button
            id="invite-user-btn"
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Create User
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">Loading users…</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th className="px-6 py-3 text-left font-medium">User</th>
                <th className="px-3 py-3 text-left font-medium">Role</th>
                <th className="px-3 py-3 text-left font-medium">Team</th>
                <th className="px-3 py-3 text-left font-medium">Status</th>
                <th className="px-3 py-3 text-left font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="border-b border-border hover:bg-muted/50 transition-colors">
                  <td className="px-6 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/20 border border-primary/30 text-xs font-semibold text-primary">
                        {user.username.charAt(0).toUpperCase()}
                      </div>
                      <span className="text-foreground text-sm">{user.username}</span>
                    </div>
                  </td>
                  <td className="px-3 py-3"><RoleBadge role={user.role} /></td>
                  <td className="px-3 py-3 text-xs text-slate-400">{user.team?.name ?? <span className="text-slate-600">—</span>}</td>
                  <td className="px-3 py-3">
                    <span className={`text-xs font-medium ${user.isActive ? "text-emerald-400" : "text-slate-500"}`}>
                      {user.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center justify-end gap-2">
                      {canManage(user) && (
                        <>
                          <button
                            onClick={() => setEditingUser(user)}
                            title="Edit User"
                            className="text-slate-400 hover:text-white transition-colors p-1"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleToggleActive(user)}
                            title={user.isActive ? "Deactivate" : "Activate"}
                            className="text-slate-400 hover:text-white transition-colors p-1"
                          >
                            {user.isActive ? <ToggleRight className="w-5 h-5 text-emerald-400" /> : <ToggleLeft className="w-5 h-5" />}
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showCreate && <CreateUserModal actorRole={actorRole} onClose={() => setShowCreate(false)} />}
      {editingUser && <EditUserModal actorRole={actorRole} user={editingUser} onClose={() => setEditingUser(null)} />}
    </div>
  );
}
