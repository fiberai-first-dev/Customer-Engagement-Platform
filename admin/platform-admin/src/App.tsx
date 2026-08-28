import { useState, useEffect, useRef } from "react";
import { GoogleLogin } from "@react-oauth/google";
import { Shield, Key, LogOut, Plus, Building, PlayCircle, MonitorPlay, X, Search, Edit2, Save, RefreshCw, Settings } from "lucide-react";
import rrwebPlayer from "rrweb-player";
import "rrweb-player/dist/style.css";

type FeatureFlag = {
  key: string;
  enabled: boolean;
  description: string | null;
  updatedAt: string;
};

type Organization = {
  id: string;
  name: string;
  websiteUrl: string;
  dbName: string;
  dbUrlConfigured: boolean;
};

type Session = {
  id: string;
  browser: string;
  os: string;
  createdAt: string;
  _count: { events: number };
};

const API_BASE =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:4200/api/v1";

export function App() {
  const [token, setToken] = useState<string | null>(localStorage.getItem("admin_token"));
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"features" | "sessions">("features");
  
  const [features, setFeatures] = useState<FeatureFlag[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // New Org Form
  const [showNewOrg, setShowNewOrg] = useState(false);
  const [newOrgName, setNewOrgName] = useState("");
  const [newOrgWebsite, setNewOrgWebsite] = useState("");
  const [newOrgDbUrl, setNewOrgDbUrl] = useState("");

  // Search & Edit States
  const [searchQuery, setSearchQuery] = useState("");
  const [editOrgName, setEditOrgName] = useState("");
  const [editOrgWebsite, setEditOrgWebsite] = useState("");
  const [editOrgDbUrl, setEditOrgDbUrl] = useState("");
  const [isEditing, setIsEditing] = useState(false);

  // Player State
  const [playingSession, setPlayingSession] = useState<string | null>(null);
  const [playingError, setPlayingError] = useState<string | null>(null);
  const playerRef = useRef<HTMLDivElement>(null);
  const playerInstanceRef = useRef<any>(null);

  useEffect(() => {
    if (token) fetchOrganizations();
  }, [token]);

  useEffect(() => {
    if (token && selectedOrgId) {
      if (activeTab === "features") fetchFeatures(selectedOrgId);
      if (activeTab === "sessions") fetchSessions(selectedOrgId);
      
      const org = organizations.find((o) => o.id === selectedOrgId);
      if (org) {
        setEditOrgName(org.name);
        setEditOrgWebsite(org.websiteUrl || "");
        setEditOrgDbUrl(""); // don't expose it, but user can input new one
        setIsEditing(false);
      }
    } else {
      setFeatures([]);
      setSessions([]);
    }
  }, [token, selectedOrgId, activeTab, organizations]);

  const fetchOrganizations = async () => {
    try {
      const res = await fetch(`${API_BASE}/admin/organizations`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) return handleLogout();
        throw new Error("Failed to fetch organizations");
      }
      const data = await res.json();
      setOrganizations(data);
      if (data.length > 0 && !selectedOrgId) {
        setSelectedOrgId(data[0].id);
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  const createOrganization = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_BASE}/admin/organizations`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ 
          name: newOrgName, 
          websiteUrl: newOrgWebsite, 
          dbUrl: newOrgDbUrl,
        }),
      });
      if (!res.ok) throw new Error("Failed to create organization");
      const org = await res.json();
      setOrganizations([org, ...organizations]);
      setSelectedOrgId(org.id);
      setShowNewOrg(false);
      setNewOrgName("");
      setNewOrgWebsite("");
      setNewOrgDbUrl("");
    } catch (err: any) {
      alert(err.message);
    }
  };

  const updateOrganization = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrgId) return;

    try {
      const res = await fetch(`${API_BASE}/admin/organizations/${selectedOrgId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ 
          name: editOrgName,
          websiteUrl: editOrgWebsite,
          dbUrl: editOrgDbUrl || undefined
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update organization");
      setOrganizations((prev) =>
        prev.map((org) => (org.id === selectedOrgId ? data : org)),
      );
      setEditOrgDbUrl("");
      setIsEditing(false);
    } catch (err: any) {
      alert(err.message);
    }
  };

  const fetchFeatures = async (orgId: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/admin/organizations/${orgId}/features`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to fetch features");
      setFeatures(await res.json());
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchSessions = async (orgId: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/admin/organizations/${orgId}/sessions`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to fetch sessions");
      setSessions(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const watchSession = async (sessionId: string) => {
    setPlayingSession(sessionId);
    setPlayingError(null);
    
    try {
      const res = await fetch(`${API_BASE}/admin/organizations/${selectedOrgId}/sessions/${sessionId}/events`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const events = await res.json();
      
      if (!res.ok) throw new Error(events.error || "Failed to fetch events");
      if (events.length < 2) throw new Error("Not enough events to replay this session");

      setTimeout(() => {
        if (playerRef.current) {
          playerRef.current.innerHTML = "";
          playerInstanceRef.current = new rrwebPlayer({
            target: playerRef.current,
            props: {
              events,
              autoPlay: true,
            },
          });
        }
      }, 100);
    } catch (err: any) {
      setPlayingError(err.message);
    }
  };

  const closePlayer = () => {
    setPlayingSession(null);
    setPlayingError(null);
    if (playerInstanceRef.current) {
      playerInstanceRef.current.pause();
      playerInstanceRef.current = null;
    }
  };

  const toggleFeature = async (featureKey: string, enabled: boolean) => {
    if (!selectedOrgId) return;
    try {
      const res = await fetch(`${API_BASE}/admin/organizations/${selectedOrgId}/features/${featureKey}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ enabled }),
      });
      if (!res.ok) throw new Error("Failed to update feature");
      
      setFeatures((prev) =>
        prev.map((f) => (f.key === featureKey ? { ...f, enabled } : f)),
      );
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleLoginSuccess = async (credentialResponse: any) => {
    try {
      setError(null);
      const res = await fetch(`${API_BASE}/auth/admin-login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credential: credentialResponse.credential }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Login failed");
      localStorage.setItem("admin_token", data.token);
      setToken(data.token);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("admin_token");
    setToken(null);
    setFeatures([]);
    setSessions([]);
    setOrganizations([]);
  };

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="max-w-md w-full p-8 bg-white rounded-2xl shadow-xl border border-slate-100 text-center">
          <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-inner">
            <Shield className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Platform Admin</h1>
          <p className="text-slate-500 mb-8">Sign in with your Super Admin account</p>
          {error && <div className="mb-6 p-4 bg-red-50 text-red-600 rounded-lg text-sm border border-red-100">{error}</div>}
          <div className="flex justify-center">
            <GoogleLogin onSuccess={handleLoginSuccess} onError={() => setError("Google login failed")} useOneTap />
          </div>
        </div>
      </div>
    );
  }

  const selectedOrg = organizations.find(o => o.id === selectedOrgId);

  return (
    <div className="min-h-screen bg-slate-50 flex relative">
      {/* Sidebar */}
      <aside className="w-64 bg-slate-900 text-slate-300 flex flex-col z-10">
        <div className="p-6 flex items-center gap-3 text-white">
          <Shield className="w-6 h-6 text-blue-400" />
          <span className="font-semibold text-lg">Admin Center</span>
        </div>
        
        <div className="px-4 py-2 mt-4">
          <div className="flex items-center justify-between mb-2 px-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
            Organizations
            <button onClick={() => setShowNewOrg(!showNewOrg)} className="hover:text-white transition-colors">
              <Plus className="w-4 h-4" />
            </button>
          </div>
          
          <div className="mb-4 relative px-2">
            <Search className="w-4 h-4 absolute left-5 top-1/2 -translate-y-1/2 text-slate-500" />
            <input 
              type="text" 
              placeholder="Search..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-800 text-sm text-slate-200 rounded-lg pl-9 pr-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder-slate-500"
            />
          </div>
          
          <div className="space-y-1">
            {organizations.filter(o => o.name.toLowerCase().includes(searchQuery.toLowerCase())).map(org => (
              <button
                key={org.id}
                onClick={() => setSelectedOrgId(org.id)}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center gap-3 transition-colors ${
                  selectedOrgId === org.id ? "bg-blue-600 text-white" : "hover:bg-slate-800"
                }`}
              >
                <Building className="w-4 h-4 shrink-0" />
                <span className="truncate">{org.name}</span>
              </button>
            ))}
            {organizations.length === 0 && (
              <div className="text-xs text-slate-500 px-2 py-4">No organizations yet.</div>
            )}
          </div>
        </div>
        
        <div className="mt-auto p-4 border-t border-slate-800">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-8 overflow-y-auto">
        <div className="max-w-4xl mx-auto">
          {showNewOrg && (
            <div className="mb-8 bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
              <h2 className="text-lg font-semibold mb-4 text-slate-900">Add New Organization</h2>
              <form onSubmit={createOrganization} className="flex flex-col gap-4">
                <div className="flex gap-4 items-end">
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-slate-500 mb-1">Company Name</label>
                    <input required value={newOrgName} onChange={e => setNewOrgName(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Acme Corp" />
                  </div>
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-slate-500 mb-1">Client Database URL</label>
                    <input required type="password" value={newOrgDbUrl} onChange={e => setNewOrgDbUrl(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="postgresql://user:password@host:5432/database" />
                  </div>
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-slate-500 mb-1">Website</label>
                    <input value={newOrgWebsite} onChange={e => setNewOrgWebsite(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="acme.com" />
                  </div>
                  <div>
                    <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors">
                      Create Organization
                    </button>
                  </div>
                </div>
              </form>
            </div>
          )}

          {selectedOrg ? (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="p-6 border-b border-slate-100 bg-slate-50/50">
                <div className="flex justify-between items-center mb-6">
                  <div>
                    <div className="flex items-center gap-3">
                      <h2 className="text-xl font-semibold text-slate-900">{selectedOrg.name}</h2>
                      <button 
                        onClick={() => setIsEditing(!isEditing)} 
                        className="p-1.5 hover:bg-slate-200 rounded-md text-slate-400 hover:text-slate-700 transition-colors"
                        title="Edit Organization"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                    </div>
                    <p className="text-sm text-slate-500 mt-1">
                      {selectedOrg.websiteUrl && <span className="mr-3">{selectedOrg.websiteUrl}</span>}
                      DB: {selectedOrg.dbName} · {selectedOrg.dbUrlConfigured ? "connected" : "not configured"}
                    </p>
                  </div>
                  <button
                    onClick={() => activeTab === "features" ? fetchFeatures(selectedOrgId!) : fetchSessions(selectedOrgId!)}
                    disabled={loading}
                    className="px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors flex items-center gap-2 disabled:opacity-50"
                  >
                    <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    Refresh
                  </button>
                </div>

                {isEditing && (
                  <form onSubmit={updateOrganization} className="mb-6 bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                    <h3 className="text-sm font-semibold mb-4 text-slate-900 flex items-center gap-2">
                      <Settings className="w-4 h-4" /> Organization Settings
                    </h3>
                    <div className="flex flex-col gap-4">
                      <div className="flex gap-4">
                        <div className="flex-1">
                          <label className="block text-xs font-medium text-slate-500 mb-1">Organization Name</label>
                          <input required value={editOrgName} onChange={e => setEditOrgName(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
                        </div>
                        <div className="flex-1">
                          <label className="block text-xs font-medium text-slate-500 mb-1">Website URL</label>
                          <input value={editOrgWebsite} onChange={e => setEditOrgWebsite(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" placeholder="acme.com" />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">
                          Client Database URL (leave blank to keep current)
                        </label>
                        <input
                          type="password"
                          value={editOrgDbUrl}
                          onChange={(e) => setEditOrgDbUrl(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                          placeholder="postgresql://user:password@host:5432/database"
                        />
                      </div>
                      <div className="flex justify-end gap-2 mt-2">
                        <button type="button" onClick={() => setIsEditing(false)} className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors">
                          Cancel
                        </button>
                        <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors flex items-center gap-2">
                          <Save className="w-4 h-4" /> Save Changes
                        </button>
                      </div>
                    </div>
                  </form>
                )}

                <div className="flex gap-6 border-b border-slate-200">
                  <button 
                    onClick={() => setActiveTab("features")} 
                    className={`pb-3 text-sm font-medium transition-colors flex items-center gap-2 ${activeTab === "features" ? "border-b-2 border-blue-600 text-blue-600" : "text-slate-500 hover:text-slate-900"}`}
                  >
                    <Key className="w-4 h-4" /> Feature Toggles
                  </button>
                  <button 
                    onClick={() => setActiveTab("sessions")} 
                    className={`pb-3 text-sm font-medium transition-colors flex items-center gap-2 ${activeTab === "sessions" ? "border-b-2 border-blue-600 text-blue-600" : "text-slate-500 hover:text-slate-900"}`}
                  >
                    <MonitorPlay className="w-4 h-4" /> Session Replays
                  </button>
                </div>
              </div>
              
              <div className="p-0">
                {error && (
                  <div className="p-6 text-sm text-red-600 bg-red-50 border-b border-red-100">
                    {error}
                  </div>
                )}

                {activeTab === "features" && (
                  <div className="divide-y divide-slate-100">
                    {features.length === 0 && !loading && !error && (
                      <div className="p-12 text-center text-slate-500">
                        No feature flags defined in this database yet.
                      </div>
                    )}
                    
                    {features.map((feature) => (
                      <div key={feature.key} className="p-6 flex items-center justify-between hover:bg-slate-50/50 transition-colors">
                        <div>
                          <h3 className="font-medium text-slate-900 flex items-center gap-2">
                            {feature.key}
                            <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${feature.enabled ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"}`}>
                              {feature.enabled ? "Active" : "Disabled"}
                            </span>
                          </h3>
                          {feature.description && <p className="text-sm text-slate-500 mt-1">{feature.description}</p>}
                        </div>
                        
                        <button
                          onClick={() => toggleFeature(feature.key, !feature.enabled)}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${feature.enabled ? "bg-blue-600" : "bg-slate-200"}`}
                        >
                          <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${feature.enabled ? "translate-x-6" : "translate-x-1"}`} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {activeTab === "sessions" && (
                  <div className="divide-y divide-slate-100">
                    {sessions.length === 0 && !loading && !error && (
                      <div className="p-12 text-center text-slate-500">
                        No recent sessions found for this organization.
                      </div>
                    )}

                    {sessions.map((session) => (
                      <div key={session.id} className="p-4 px-6 flex items-center justify-between hover:bg-slate-50/50 transition-colors">
                        <div>
                          <h3 className="font-medium text-slate-900 flex items-center gap-2 text-sm">
                            Session {session.id.substring(session.id.length - 8)}
                          </h3>
                          <div className="text-xs text-slate-500 mt-1 flex items-center gap-3">
                            <span>{new Date(session.createdAt).toLocaleString()}</span>
                            <span>&bull;</span>
                            <span>{session.browser || "Unknown"} on {session.os || "Unknown"}</span>
                            <span>&bull;</span>
                            <span>{session._count.events} events</span>
                          </div>
                        </div>
                        
                        <button
                          onClick={() => watchSession(session.id)}
                          disabled={session._count.events < 2}
                          className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <PlayCircle className="w-4 h-4" /> Watch
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="text-center text-slate-500 mt-20">
              <Building className="w-12 h-12 mx-auto mb-4 opacity-20" />
              <p>Select an organization from the sidebar to manage.</p>
            </div>
          )}
        </div>
      </main>

      {/* rrweb Player Modal */}
      {playingSession && (
        <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-8">
          <div className="bg-white rounded-xl shadow-2xl overflow-hidden w-full max-w-5xl flex flex-col">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                <MonitorPlay className="w-5 h-5 text-blue-600" />
                Session Replay
              </h3>
              <button 
                onClick={closePlayer}
                className="p-1 hover:bg-slate-200 rounded-full transition-colors"
              >
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>
            <div className="p-6 flex-1 flex flex-col items-center justify-center min-h-[600px] bg-slate-100">
              {playingError ? (
                <div className="text-red-500 text-center">
                  <p className="font-semibold">Could not play session</p>
                  <p className="text-sm mt-1">{playingError}</p>
                </div>
              ) : (
                <div ref={playerRef} className="w-full h-full max-w-[1024px] max-h-[768px] bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden" />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
