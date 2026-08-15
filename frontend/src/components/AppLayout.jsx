import React, { useEffect, useState } from "react";
import { Outlet, Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Users,
  CalendarClock,
  Menu,
  X,
  LogOut,
  User2,
  ClipboardList,
  ClipboardCheck,
  ShieldCheck,
  Receipt,
  Library,
  CalendarDays,
  Settings as SettingsIcon,
} from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { apiClient } from "@/api/apiClient";
import capLogo from "@/assets/cap-logo.png";

// Job card statuses that mean "billable but not yet invoiced" -- must match
// InvoiceQueue.jsx's own `billable`/`pending` filter exactly (see that page's
// load()) so the navbar badge and the page's own count never disagree.
const PENDING_INVOICE_STATUSES = ["Completed", "Ready to Invoice", "Ready for Invoice"];

const ALL_NAV_ITEMS = [
  { label: "Dashboard", path: "/", icon: LayoutDashboard, permission: "dashboard.view" },
  { label: "Clients", path: "/clients", icon: Users, permission: "clients.view" },
  { label: "Upcoming Services", path: "/upcoming-services", icon: CalendarClock, permission: "upcoming_services.view" },
  { label: "Calendar", path: "/calendar", icon: CalendarDays, permission: "calendar.view" },
  { label: "Service Records", path: "/service-records", icon: ClipboardCheck, permission: "services.view" },
  { label: "Book In", path: "/book-in", icon: ClipboardList, permission: "job_cards.create" },
  { label: "Jobs", path: "/jobs", icon: ClipboardList, permission: "job_cards.view" },
  { label: "Machine Knowledge Base", path: "/knowledge-base", icon: Library, permission: "knowledge_base.view" },
  { label: "Invoice Queue", path: "/invoice-queue", icon: Receipt, permission: "invoices.queue.view", badgeKey: "pendingInvoices" },
  { label: "User Management", path: "/admin/users", icon: ShieldCheck, permission: "users.view" },
  { label: "Settings", path: "/settings", icon: SettingsIcon, permission: "settings.access" },
];

export default function AppLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [pendingInvoices, setPendingInvoices] = useState(0);
  const location = useLocation();
  const { user, logout, hasPermission, hasAnyPermission } = useAuth();

  const role = user?.role || "technician";
  const userName = user?.name || user?.full_name || user?.email || "User";

  const navItems = ALL_NAV_ITEMS.filter((item) =>
    item.anyPermission ? hasAnyPermission(item.anyPermission) : hasPermission(item.permission));

  const canViewInvoiceQueue = hasPermission("invoices.queue.view");

  useEffect(() => {
    if (!canViewInvoiceQueue) { setPendingInvoices(0); return; }
    let active = true;
    apiClient.entities.JobCard.list()
      .then((jobCards) => {
        if (!active) return;
        setPendingInvoices((jobCards || []).filter((jc) => PENDING_INVOICE_STATUSES.includes(jc.status)).length);
      })
      .catch((e) => console.error("Failed to load pending invoice count:", e));
    return () => { active = false; };
  }, [canViewInvoiceQueue, location.pathname]);

  const badgeCounts = { pendingInvoices };

  const handleLogout = () => {
    logout();
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 flex items-center justify-between px-4 py-3 bg-card/80 backdrop-blur-xl border-b border-border md:hidden">
        <div className="flex items-center gap-2">
          <img src={capLogo} alt="" className="w-7 h-7 rounded-md object-cover" />
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
            className="absolute left-0 top-0 bottom-0 w-64 bg-card border-r border-border p-4 pt-16 flex flex-col gap-1 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <UserCard userName={userName} role={role} />

            <div className="sidebar-navigation flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto overflow-x-hidden">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = location.pathname === item.path;
              const count = item.badgeKey ? badgeCounts[item.badgeKey] : 0;

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
                  <span className="flex-1">{item.label}</span>
                  {count > 0 && (
                    <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-primary text-primary-foreground text-[11px] font-semibold flex items-center justify-center shrink-0">
                      {count > 99 ? "99+" : count}
                    </span>
                  )}
                </Link>
              );
            })}
            </div>

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
        <aside className="hidden md:flex flex-col w-60 min-h-screen border-r border-border bg-sidebar p-4 sticky top-0 h-screen">
          <div className="flex items-center gap-2 px-2 mb-6">
            <img src={capLogo} alt="" className="w-8 h-8 rounded-md object-cover" />
            <span className="font-heading font-bold text-xl text-foreground">
              CAP Database
            </span>
          </div>

          <UserCard userName={userName} role={role} />

          <nav className="sidebar-navigation flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto overflow-x-hidden">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = location.pathname === item.path;
              const count = item.badgeKey ? badgeCounts[item.badgeKey] : 0;

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
                  <span className="flex-1">{item.label}</span>
                  {count > 0 && (
                    <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-primary text-primary-foreground text-[11px] font-semibold flex items-center justify-center shrink-0">
                      {count > 99 ? "99+" : count}
                    </span>
                  )}
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
      <div className="w-full px-4 py-6 md:px-8 md:py-8">            
  <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}

// Cross-platform parity Phase 7: the one entry point to the new self-service /account page --
// every existing consumer of this component (mobile drawer + desktop sidebar) gets it for free.
function UserCard({ userName, role }) {
  return (
    <Link
      to="/account"
      className="flex items-center gap-3 px-3 py-2.5 mb-4 rounded-xl bg-secondary/60 hover:bg-secondary transition-colors"
    >
      <div className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
        <User2 className="w-4 h-4 text-primary" />
      </div>

      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground truncate">
          {userName}
        </p>
        <p className="text-xs text-muted-foreground">{role}</p>
      </div>
    </Link>
  );
}
