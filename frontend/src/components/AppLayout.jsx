import React, { useEffect, useState } from "react";
import { Outlet, Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Users,
  CalendarClock,
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
import MobileBottomNav from "@/components/MobileBottomNav";

// Job card statuses that mean "billable but not yet invoiced" -- must match
// InvoiceQueue.jsx's own `billable`/`pending` filter exactly (see that page's
// load()) so the navbar badge and the page's own count never disagree.
const PENDING_INVOICE_STATUSES = ["Completed", "Ready to Invoice", "Ready for Invoice"];

const ALL_NAV_ITEMS = [
  { label: "Dashboard", shortLabel: "Home", path: "/", icon: LayoutDashboard, permission: "dashboard.view" },
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
      {/* Compact mobile header (mobile-first pass, 2026-08-19): no hamburger/
          drawer anymore -- every destination is reachable from the bottom
          nav + its "More" sheet below, so a second full nav menu here was
          redundant clutter (spec section 6: "avoid putting five or six
          controls into one row"). Keeps just brand identity + a one-tap
          link to the signed-in user's own account. */}
      {/* REAL BUG FIX (found via automated Playwright viewport testing, 2026-08-19): `px-4` and
          `safe-area-x` (a plain, non-@layer CSS rule -- see index.css) have identical
          specificity, and `.safe-area-x` compiles later in the stylesheet, so it was silently
          winning the cascade and collapsing this header's horizontal padding to 0 on every
          device without a real notch (i.e. almost every phone) -- not a cosmetic issue, a
          genuine sitewide layout bug that predates today's session. `pl-/pr-[max(...)]` fixes
          it at the source: the effective padding is always whichever is larger, the intended
          base spacing or the real safe-area inset, so it's correct on both notched and
          non-notched devices without depending on cascade order. */}
      <header className="sticky top-0 z-30 flex items-center justify-between pl-[max(1rem,var(--safe-left))] pr-[max(1rem,var(--safe-right))] bg-card/80 backdrop-blur-xl border-b border-border md:hidden safe-area-top" style={{ height: "var(--mobile-header-height)" }}>
        <div className="flex items-center gap-2 min-w-0">
          <img src={capLogo} alt="" className="w-7 h-7 rounded-md object-cover shrink-0" />
          <span className="font-heading font-bold text-lg text-foreground truncate">
            CAP Database
          </span>
        </div>

        <Link
          to="/account"
          aria-label="Account"
          className="tap-target flex items-center justify-center w-9 h-9 rounded-full bg-primary/15 shrink-0"
        >
          <User2 className="w-4 h-4 text-primary" />
        </Link>
      </header>

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

        {/* min-w-0 is load-bearing, not decorative: `main` is a flex item of the row above.
            Flex items default to `min-width: auto` (their unconstrained content's min-content
            width), so any unbreakable string anywhere on any page (a long name/email with no
            spaces, e.g.) could silently force this entire row -- and therefore the whole
            document -- wider than the viewport, producing real horizontal overflow on phones.
            Found via automated Playwright viewport testing (2026-08-19), not visually --
            `Dashboard.jsx`'s new `truncate` on the greeting couldn't actually clip anything
            without this fix, no matter how correct that class looked in isolation. */}
        <main className="flex-1 min-h-screen min-w-0">
          {/* Same `.safe-area-x`-vs-`px-*` cascade bug as the header above -- this was the
              actual root cause of every page's content sitting flush against the phone's
              screen edges (0 horizontal padding, not the intended 16px/32px), found via
              automated Playwright viewport testing. `max()` fix, same reasoning. */}
          <div className="w-full pl-[max(1rem,var(--safe-left))] pr-[max(1rem,var(--safe-right))] py-6 md:pl-[max(2rem,var(--safe-left))] md:pr-[max(2rem,var(--safe-right))] md:py-8 mobile-content-bottom-padding">
            <Outlet />
          </div>
        </main>
      </div>

      <MobileBottomNav
        navItems={navItems}
        badgeCounts={badgeCounts}
        userName={userName}
        role={role}
        onLogout={handleLogout}
      />
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
