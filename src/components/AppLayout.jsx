import React, { useState } from "react";
import { Outlet, Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Users,
  CalendarClock,
  Menu,
  X,
  LogOut,
  Wind,
  User2,
  ClipboardList,
  ShieldCheck,
  Receipt,
} from "lucide-react";
import { ROLE_NAV_ACCESS } from "@/lib/roles";
import { useAuth } from "@/lib/AuthContext";

const ALL_NAV_ITEMS = [
  { label: "Dashboard", path: "/", icon: LayoutDashboard },
  { label: "Clients", path: "/clients", icon: Users },
  { label: "Upcoming Services", path: "/upcoming-services", icon: CalendarClock },
  { label: "Book In", path: "/book-in", icon: ClipboardList },
  { label: "Jobs", path: "/jobs", icon: ClipboardList },
  { label: "Invoice Queue", path: "/invoice-queue", icon: Receipt },
  { label: "User Management", path: "/admin/users", icon: ShieldCheck },
];

export default function AppLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const { user, logout } = useAuth();

  const role = user?.role || "Technician";
  const userName = user?.name || user?.full_name || user?.email || "User";

  const allowedPaths = ROLE_NAV_ACCESS[role] || [];
  const navItems = ALL_NAV_ITEMS.filter((item) =>
    allowedPaths.includes(item.path)
  );

  const handleLogout = () => {
    logout();
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 flex items-center justify-between px-4 py-3 bg-card/80 backdrop-blur-xl border-b border-border md:hidden">
        <div className="flex items-center gap-2">
          <Wind className="w-6 h-6 text-primary" />
          <span className="font-heading font-bold text-lg text-foreground">
            CAP Database
          </span>
        </div>

        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="p-2 rounded-lg hover:bg-secondary transition-colors"
        >
          {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </header>

      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 md:hidden"
          onClick={() => setMobileOpen(false)}
        >
          <div className="absolute inset-0 bg-black/60" />

          <nav
            className="absolute left-0 top-0 bottom-0 w-64 bg-card border-r border-border p-4 pt-16 flex flex-col gap-1"
            onClick={(e) => e.stopPropagation()}
          >
            <UserCard userName={userName} role={role} />

            {navItems.map((item) => {
              const Icon = item.icon;
              const active = location.pathname === item.path;

              return (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setMobileOpen(false)}
                  className={`flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium transition-colors ${
                    active
                      ? "bg-primary/15 text-primary"
                      : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  {item.label}
                </Link>
              );
            })}

            <div className="mt-auto pt-4 border-t border-border">
              <button
                onClick={handleLogout}
                className="flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors w-full"
              >
                <LogOut className="w-5 h-5" />
                Logout
              </button>
            </div>
          </nav>
        </div>
      )}

      <div className="flex">
        <aside className="hidden md:flex flex-col w-60 min-h-screen border-r border-border bg-card/50 p-4 sticky top-0 h-screen">
          <div className="flex items-center gap-2 px-2 mb-6">
            <Wind className="w-7 h-7 text-primary" />
            <span className="font-heading font-bold text-xl text-foreground">
              CAP Database
            </span>
          </div>

          <UserCard userName={userName} role={role} />

          <nav className="flex flex-col gap-1 flex-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = location.pathname === item.path;

              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                    active
                      ? "bg-primary/15 text-primary"
                      : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="pt-4 border-t border-border">
            <button
              onClick={handleLogout}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors w-full"
            >
              <LogOut className="w-5 h-5" />
              Logout
            </button>
          </div>
        </aside>

        <main className="flex-1 min-h-screen">
          <div className="max-w-5xl mx-auto px-4 py-6 md:px-8 md:py-8">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}

function UserCard({ userName, role }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5 mb-4 rounded-xl bg-secondary/60">
      <div className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
        <User2 className="w-4 h-4 text-primary" />
      </div>

      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground truncate">
          {userName}
        </p>
        <p className="text-xs text-muted-foreground">{role}</p>
      </div>
    </div>
  );
}