import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAppStore } from "../../store";
import { useAuthStore } from "../../store/auth";
import { MessageSquare, Settings, Moon, Sun, Users, LogOut, TicketIcon, Building2, ShieldCheck } from "lucide-react";
import { cn } from "../../utils/utils";

export function DashboardLayout() {
  const { theme, toggleTheme } = useAppStore();
  const logout = useAuthStore((state) => state.logout);
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const isAdmin = user?.role === "ADMIN" || user?.role === "SUPER_ADMIN";

  const mainLinks = [
    { to: "/inbox", icon: MessageSquare, label: "Inbox" },
    { to: "/contacts", icon: Users, label: "Contacts" },
    { to: "/tickets", icon: TicketIcon, label: "Tickets" },
  ];

  const adminLinks = [
    { to: "/admin/users", icon: ShieldCheck, label: "Users" },
    { to: "/admin/teams", icon: Building2, label: "Teams" },
  ];

  const bottomLinks = user?.role === "SUPER_ADMIN" || user?.role === "ADMIN" ? [
    { to: "/settings", icon: Settings, label: "Settings" },
  ] : [];

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      <aside className="z-10 flex w-20 shrink-0 flex-col items-center border-r border-border bg-card py-4 shadow-sm">
        {/* Logo */}
        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-lg font-bold text-primary-foreground shadow-md">
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
          </svg>
        </div>

        {/* User avatar + role */}
        {user && (
          <div className="mb-4 flex flex-col items-center gap-1" title={`${user.username}\n${user.role}`}>
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/20 border border-primary/30 text-xs font-semibold text-primary">
              {user.username.charAt(0).toUpperCase()}
            </div>
            <span className="text-[9px] text-muted-foreground leading-none max-w-[60px] truncate text-center">
              {user.role === "SUPER_ADMIN" ? "S.Admin" : user.role === "ADMIN" ? "Admin" : user.role === "MANAGER" ? "Mgr" : "Agent"}
            </span>
          </div>
        )}

        {/* Main nav */}
        <nav className="flex w-full flex-1 flex-col gap-1 px-2">
          {mainLinks.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) =>
                cn(
                  "group flex w-full aspect-square flex-col items-center justify-center gap-1 rounded-xl transition-all",
                  isActive
                    ? "bg-primary/10 font-medium text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )
              }
            >
              <link.icon className="h-5 w-5 transition-transform group-hover:scale-110" />
              <span className="text-[10px]">{link.label}</span>
            </NavLink>
          ))}

          {/* Admin section */}
          {isAdmin && (
            <>
              <div className="my-2 mx-3 border-t border-border/50" />
              {adminLinks.map((link) => (
                <NavLink
                  key={link.to}
                  to={link.to}
                  className={({ isActive }) =>
                    cn(
                      "group flex w-full aspect-square flex-col items-center justify-center gap-1 rounded-xl transition-all",
                      isActive
                        ? "bg-purple-500/10 font-medium text-purple-400"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )
                  }
                >
                  <link.icon className="h-5 w-5 transition-transform group-hover:scale-110" />
                  <span className="text-[10px]">{link.label}</span>
                </NavLink>
              ))}
            </>
          )}
        </nav>

        <div className="flex w-full flex-col gap-1 px-2 pt-2">
          {bottomLinks.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) =>
                cn(
                  "group flex w-full aspect-square flex-col items-center justify-center gap-1 rounded-xl transition-all",
                  isActive
                    ? "bg-primary/10 font-medium text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )
              }
            >
              <link.icon className="h-5 w-5 transition-transform group-hover:scale-110" />
              <span className="text-[10px]">{link.label}</span>
            </NavLink>
          ))}

          <button
            onClick={toggleTheme}
            className="flex w-full aspect-square flex-col items-center justify-center gap-1 rounded-xl text-muted-foreground transition-all hover:bg-muted hover:text-foreground"
            title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          >
            {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            <span className="text-[10px]">Theme</span>
          </button>

          <button
            id="logout-btn"
            onClick={handleLogout}
            className="flex w-full aspect-square flex-col items-center justify-center gap-1 rounded-xl text-muted-foreground transition-all hover:bg-rose-500/10 hover:text-rose-500"
            title="Logout"
          >
            <LogOut className="h-5 w-5" />
            <span className="text-[10px]">Logout</span>
          </button>
        </div>
      </aside>

      <main className="relative flex min-w-0 flex-1 flex-col overflow-hidden bg-background">
        <Outlet />
      </main>
    </div>
  );
}
