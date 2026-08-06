import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAppStore } from "../../store";
import { useAuthStore } from "../../store/auth";
import { MessageSquare, Settings, Moon, Sun, Users, User, LogOut } from "lucide-react";
import { cn } from "../../utils/utils";
import { useState, useRef, useEffect } from "react";

export function DashboardLayout() {
  const { theme, toggleTheme } = useAppStore();
  const logout = useAuthStore(state => state.logout);
  const navigate = useNavigate();
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowProfileMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const links = [
    { to: "/inbox", icon: MessageSquare, label: "Inbox" },
    { to: "/contacts", icon: Users, label: "Contacts" },
    { to: "/settings", icon: Settings, label: "Settings" },
  ];

  return (
    <div className="flex h-screen w-full bg-background overflow-hidden">
      {/* Sidebar Rail */}
      <aside className="w-20 border-r border-border bg-card flex flex-col items-center py-6 shrink-0 shadow-sm z-10">
        <div className="w-12 h-12 bg-primary text-primary-foreground rounded-xl flex items-center justify-center font-bold text-lg mb-8 shadow-md">
          <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
          </svg>
        </div>

        <nav className="flex flex-col gap-4 flex-1 w-full px-3">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) =>
                cn(
                  "w-full aspect-square rounded-xl flex flex-col items-center justify-center gap-1 transition-all group",
                  isActive
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )
              }
            >
              <link.icon className={cn("w-5 h-5 transition-transform group-hover:scale-110")} />
              <span className="text-[10px]">{link.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="mt-auto pt-4 px-3 w-full flex flex-col gap-2 relative" ref={menuRef}>
          <button
            onClick={toggleTheme}
            className="w-full aspect-square rounded-xl flex flex-col items-center justify-center gap-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-all"
            title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          >
            {theme === "dark" ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            <span className="text-[10px]">Theme</span>
          </button>

          <button
            onClick={() => setShowProfileMenu(!showProfileMenu)}
            className={cn(
              "w-full aspect-square rounded-xl flex flex-col items-center justify-center gap-1 transition-all",
              showProfileMenu ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
            title="Profile & Settings"
          >
            <div className="w-8 h-8 rounded-full bg-primary/20 text-primary flex items-center justify-center">
              <User className="w-4 h-4" />
            </div>
            <span className="text-[10px]">Profile</span>
          </button>

          {/* Popup Menu */}
          {showProfileMenu && (
            <div className="absolute left-full bottom-2 ml-2 w-48 bg-card border border-border rounded-xl shadow-lg flex flex-col p-1 z-50">
              <div className="px-3 py-2 border-b border-border mb-1">
                <p className="text-sm font-medium">Admin User</p>
                <p className="text-xs text-muted-foreground">admin@fiberai.com</p>
              </div>
              
              <button onClick={() => { setShowProfileMenu(false); navigate("/profile"); }} className="w-full text-left px-3 py-2 text-sm rounded-lg hover:bg-muted flex items-center gap-2">
                <User className="w-4 h-4 text-muted-foreground" />
                Profile
              </button>
              
              <button onClick={() => { setShowProfileMenu(false); navigate("/settings"); }} className="w-full text-left px-3 py-2 text-sm rounded-lg hover:bg-muted flex items-center gap-2">
                <Settings className="w-4 h-4 text-muted-foreground" />
                Settings
              </button>
              
              <div className="h-px bg-border my-1 w-full"></div>
              
              <button onClick={handleLogout} className="w-full text-left px-3 py-2 text-sm rounded-lg hover:bg-red-500/10 text-red-500 flex items-center gap-2">
                <LogOut className="w-4 h-4" />
                Logout
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 bg-background overflow-hidden relative">
        <Outlet />
      </main>
    </div>
  );
}
