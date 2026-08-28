import { useState, useEffect, useRef } from "react";
import { GoogleLogin } from "@react-oauth/google";
import { Shield, Key, LogOut, Plus, Building, PlayCircle, MonitorPlay, X, Search, Edit2, Save, RefreshCw, Settings, MoreVertical, Trash2, ArrowLeft } from "lucide-react";
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
  userName?: string;
  userEmail?: string;
  createdAt: string;
  _count: { events: number };
};

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:4200/api/v1";

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
  
  // Menu State for list view
  const [menuOpenOrgId, setMenuOpenOrgId] = useState<string | null>(null);

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
        setEditOrgDbUrl("");
        setIsEditing(false);
      }
    } else {
      setFeatures([]);
      setSessions([]);
    }
  }, [token, selectedOrgId, activeTab, organizations]);
  
  // Close menu when clicking outside (simple hack)
  useEffect(() => {
    const handleClick = () => setMenuOpenOrgId(null);
    window.addEventListener("click", handleClick);
    return () => window.removeEventListener("click", handleClick);
  }, []);

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

  const deleteOrganization = async (orgId: string) => {
    if (!window.confirm("Are you sure you want to delete this organization?")) return;
    try {
      const res = await fetch(`${API_BASE}/admin/organizations/${orgId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error("Failed to delete organization");
      setOrganizations(organizations.filter(o => o.id !== orgId));
      if (selectedOrgId === orgId) setSelectedOrgId(null);
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

  const deleteSession = async (sessionId: string) => {
    if (!selectedOrgId || !window.confirm("Are you sure you want to delete this session?")) return;
    try {
      const res = await fetch(`${API_BASE}/admin/organizations/${selectedOrgId}/sessions/${sessionId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error("Failed to delete session");
      setSessions(prev => prev.filter(s => s.id !== sessionId));
    } catch (err: any) {
      alert(err.message);
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
    setSelectedOrgId(null);
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
  const filteredOrgs = organizations.filter(o => o.name.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <div className="min-h-screen bg-slate-50 flex relative">
      {/* Sidebar */}
      <aside className="w-64 bg-slate-900 text-slate-300 flex flex-col z-10 shrink-0">
        <div className="p-6 flex items-center gap-3 text-white">
          <Shield className="w-6 h-6 text-blue-400" />
          <span className="font-semibold text-lg">Admin Center</span>
        </div>
        
        <div className="px-4 py-2 mt-4 space-y-2">
          <button
            onClick={() => setSelectedOrgId(null)}
            className={`w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium flex items-center gap-3 transition-colors ${
              !selectedOrgId ? "bg-blue-600 text-white" : "hover:bg-slate-800"
            }`}
          >
            <Building className="w-4 h-4 shrink-0" />
            Organizations
          </button>
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
      <main className="flex-1 overflow-y-auto">
        {!selectedOrgId ? (
          // ORGANIZATION LIST VIEW
          <div className="p-8 max-w-6xl mx-auto">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h1 className="text-2xl font-bold text-slate-900">Organizations</h1>
                <p className="text-slate-500 mt-1">Manage and configure tenant environments</p>
              </div>
              <button 
                onClick={() => setShowNewOrg(!showNewOrg)} 
                className="px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors flex items-center gap-2 shadow-sm"
              >
                <Plus className="w-4 h-4" /> New Organization
              </button>
            </div>

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
                        Create
                      </button>
                    </div>
                  </div>
                </form>
              </div>
            )}

            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-visible relative">
              <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <div className="relative w-72">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input 
                    type="text" 
                    placeholder="Search organizations..." 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="text-sm text-slate-500 font-medium">
                  {filteredOrgs.length} {filteredOrgs.length === 1 ? 'result' : 'results'}
                </div>
              </div>

              {filteredOrgs.length > 0 ? (
                <div className="divide-y divide-slate-100">
                  {filteredOrgs.map(org => (
                    <div key={org.id} className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors group">
                      <div className="flex items-center gap-4 cursor-pointer flex-1" onClick={() => setSelectedOrgId(org.id)}>
                        <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center shrink-0 border border-blue-100">
                          <Building className="w-5 h-5" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-slate-900 group-hover:text-blue-600 transition-colors">{org.name}</h3>
                          <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-3">
                            {org.websiteUrl && <span>{org.websiteUrl}</span>}
                            {org.websiteUrl && <span>&bull;</span>}
                            <span>DB: {org.dbName}</span>
                            <span>&bull;</span>
                            <span className={org.dbUrlConfigured ? "text-green-600" : "text-amber-500"}>
                              {org.dbUrlConfigured ? "Connected" : "Not Configured"}
                            </span>
                          </div>
                        </div>
                      </div>
                      
                      <div className="relative" onClick={(e) => e.stopPropagation()}>
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            setMenuOpenOrgId(menuOpenOrgId === org.id ? null : org.id);
                          }}
                          className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                        >
                          <MoreVertical className="w-5 h-5" />
                        </button>
                        
                        {menuOpenOrgId === org.id && (
                          <div className="absolute right-0 mt-1 w-48 bg-white rounded-xl shadow-lg border border-slate-200 py-1 z-20">
                            <button 
                              onClick={() => {
                                setSelectedOrgId(org.id);
                                setIsEditing(true);
                                setMenuOpenOrgId(null);
                              }}
                              className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                            >
                              <Edit2 className="w-4 h-4 text-slate-400" /> Edit Details
                            </button>
                            <button 
                              onClick={() => {
                                setSelectedOrgId(org.id);
                                setMenuOpenOrgId(null);
                              }}
                              className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                            >
                              <MonitorPlay className="w-4 h-4 text-slate-400" /> Open Dashboard
                            </button>
                            <div className="h-px bg-slate-100 my-1 mx-2" />
                            <button 
                              onClick={() => {
                                deleteOrganization(org.id);
                                setMenuOpenOrgId(null);
                              }}
                              className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2 font-medium"
                            >
                              <Trash2 className="w-4 h-4" /> Delete Organization
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-12 text-center text-slate-500">
                  <Building className="w-12 h-12 mx-auto mb-4 opacity-20" />
                  <p>No organizations found matching your search.</p>
                </div>
              )}
            </div>
          </div>
        ) : selectedOrg ? (
          // ORGANIZATION DETAIL VIEW
          <div className="p-8 max-w-5xl mx-auto">
            <button 
              onClick={() => {
                setSelectedOrgId(null);
                setIsEditing(false);
              }}
              className="mb-6 flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-900 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" /> Back to Organizations
            </button>

            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="p-6 border-b border-slate-100 bg-slate-50/50">
                <div className="flex justify-between items-start mb-6">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 bg-blue-600 text-white rounded-xl flex items-center justify-center shadow-sm shrink-0">
                      <Building className="w-6 h-6" />
                    </div>
                    <div>
                      <div className="flex items-center gap-3">
                        <h2 className="text-xl font-bold text-slate-900">{selectedOrg.name}</h2>
                        <button 
                          onClick={() => setIsEditing(!isEditing)} 
                          className="p-1.5 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg text-slate-500 hover:text-slate-700 transition-colors shadow-sm"
                          title="Edit Organization"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <p className="text-sm text-slate-500 mt-1">
                        {selectedOrg.websiteUrl && <span className="mr-3">{selectedOrg.websiteUrl}</span>}
                        Database: <span className="font-medium text-slate-700">{selectedOrg.dbName}</span>
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => activeTab === "features" ? fetchFeatures(selectedOrgId) : fetchSessions(selectedOrgId)}
                    disabled={loading}
                    className="px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors flex items-center gap-2 shadow-sm disabled:opacity-50"
                  >
                    <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    Refresh Data
                  </button>
                </div>

                {isEditing && (
                  <form onSubmit={updateOrganization} className="mb-8 bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
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

                <div className="flex gap-2">
                  <button 
                    onClick={() => setActiveTab("features")} 
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${activeTab === "features" ? "bg-white text-blue-600 shadow-sm border border-slate-200" : "text-slate-600 hover:bg-slate-100 border border-transparent"}`}
                  >
                    <Key className="w-4 h-4" /> Feature Toggles
                  </button>
                  <button 
                    onClick={() => setActiveTab("sessions")} 
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${activeTab === "sessions" ? "bg-white text-blue-600 shadow-sm border border-slate-200" : "text-slate-600 hover:bg-slate-100 border border-transparent"}`}
                  >
                    <MonitorPlay className="w-4 h-4" /> Session Replays
                  </button>
                </div>
              </div>
              
              <div className="p-0 bg-white">
                {error && (
                  <div className="p-6 text-sm text-red-600 bg-red-50 border-b border-red-100">
                    {error}
                  </div>
                )}

                {activeTab === "features" && (
                  <div className="divide-y divide-slate-100">
                    {features.length === 0 && !loading && !error && (
                      <div className="p-16 text-center text-slate-500">
                        <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4 border border-slate-100">
                          <Key className="w-8 h-8 text-slate-400" />
                        </div>
                        <p className="font-medium text-slate-900">No feature flags found</p>
                        <p className="text-sm mt-1">There are no feature flags defined in this database yet.</p>
                      </div>
                    )}
                    
                    {features.map((feature) => (
                      <div key={feature.key} className="p-6 flex items-center justify-between hover:bg-slate-50/80 transition-colors group">
                        <div>
                          <h3 className="font-semibold text-slate-900 flex items-center gap-3">
                            {feature.key}
                            <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${feature.enabled ? "bg-green-50 text-green-700 border border-green-200" : "bg-slate-100 text-slate-500 border border-slate-200"}`}>
                              {feature.enabled ? "Active" : "Disabled"}
                            </span>
                          </h3>
                          {feature.description && <p className="text-sm text-slate-500 mt-1">{feature.description}</p>}
                        </div>
                        
                        <button
                          onClick={() => toggleFeature(feature.key, !feature.enabled)}
                          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2 ${feature.enabled ? "bg-blue-600" : "bg-slate-200"}`}
                        >
                          <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${feature.enabled ? "translate-x-5" : "translate-x-0"}`} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {activeTab === "sessions" && (
                  <div className="divide-y divide-slate-100">
                    {sessions.length === 0 && !loading && !error && (
                      <div className="p-16 text-center text-slate-500">
                        <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4 border border-slate-100">
                          <MonitorPlay className="w-8 h-8 text-slate-400" />
                        </div>
                        <p className="font-medium text-slate-900">No session replays found</p>
                        <p className="text-sm mt-1">There are no recent sessions recorded for this organization.</p>
                      </div>
                    )}

                    {sessions.map((session) => (
                      <div key={session.id} className="p-5 flex items-center justify-between hover:bg-slate-50/80 transition-colors">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center border border-slate-200 text-slate-500">
                            <MonitorPlay className="w-5 h-5" />
                          </div>
                          <div>
                            <h3 className="font-semibold text-slate-900 text-sm">
                              Session {session.id.substring(session.id.length - 8)}
                              {(session.userName || session.userEmail) && (
                                <span className="ml-2 text-slate-500 font-normal">
                                  — {session.userName || 'Unknown'} {session.userEmail ? `<${session.userEmail}>` : ''}
                                </span>
                              )}
                            </h3>
                            <div className="text-xs text-slate-500 mt-1 flex items-center gap-3 font-medium">
                              <span>{new Date(session.createdAt).toLocaleString()}</span>
                              <span className="w-1 h-1 rounded-full bg-slate-300"></span>
                              <span>{session.browser || "Unknown Browser"} on {session.os || "Unknown OS"}</span>
                              <span className="w-1 h-1 rounded-full bg-slate-300"></span>
                              <span className="text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">{session._count.events} events</span>
                            </div>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => watchSession(session.id)}
                            disabled={session._count.events < 2}
                            className="px-4 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <PlayCircle className="w-4 h-4 text-blue-600" /> Watch Replay
                          </button>
                          <button
                            onClick={() => deleteSession(session.id)}
                            title="Delete Session"
                            className="p-2 bg-white border border-slate-200 hover:bg-red-50 hover:text-red-600 hover:border-red-200 text-slate-400 rounded-lg transition-colors shadow-sm"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : null}
      </main>

      {/* rrweb Player Modal */}
      {playingSession && (
        <div className="fixed inset-0 z-50 bg-slate-900/90 backdrop-blur-md flex items-center justify-center p-8">
          <div className="bg-slate-50 rounded-2xl shadow-2xl overflow-hidden w-full max-w-6xl flex flex-col border border-slate-700">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-white">
              <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                <MonitorPlay className="w-5 h-5 text-blue-600" />
                Session Replay Viewer
              </h3>
              <button 
                onClick={closePlayer}
                className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors border border-transparent hover:border-slate-200"
              >
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>
            <div className="p-8 flex-1 flex flex-col items-center justify-center min-h-[600px] bg-slate-100/50">
              {playingError ? (
                <div className="text-red-600 bg-red-50 p-6 rounded-xl border border-red-100 text-center max-w-md">
                  <p className="font-bold text-lg mb-2">Could not play session</p>
                  <p className="text-sm">{playingError}</p>
                </div>
              ) : (
                <div ref={playerRef} className="w-full h-full max-w-[1024px] max-h-[768px] bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden" />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
