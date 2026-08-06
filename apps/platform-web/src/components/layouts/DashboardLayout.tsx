import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAppStore } from "../../store";
import { useAuthStore } from "../../store/auth";
import { MessageSquare, Settings, Moon, Sun, Users, LogOut } from "lucide-react";
import { cn } from "../../utils/utils";

export function DashboardLayout() {
  const { theme, toggleTheme } = useAppStore();
  const logout = useAuthStore((state) => state.logout);
  const navigate = useNavigate();

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
    <div className="flex h-screen w-full overflow-hidden bg-background">
      <aside className="z-10 flex w-20 shrink-0 flex-col items-center border-r border-border bg-card py-6 shadow-sm">
        <div className="mb-8 flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-lg font-bold text-primary-foreground shadow-md">
          <svg
            className="h-6 w-6"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
          </svg>
        </div>

        <nav className="flex w-full flex-1 flex-col gap-4 px-3">
          {links.map((link) => (
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
        </nav>

        <div className="mt-auto flex w-full flex-col gap-2 px-3 pt-4">
          <button
            onClick={toggleTheme}
            className="flex w-full aspect-square flex-col items-center justify-center gap-1 rounded-xl text-muted-foreground transition-all hover:bg-muted hover:text-foreground"
            title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          >
            {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            <span className="text-[10px]">Theme</span>
          </button>

          <button
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
