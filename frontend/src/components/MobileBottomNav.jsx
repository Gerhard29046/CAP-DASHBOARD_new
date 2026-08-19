import React from "react";
import { Link, useLocation } from "react-router-dom";
import { MoreHorizontal, LogOut, User2 } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetClose,
} from "@/components/ui/sheet";

// Native-app-style fixed bottom navigation for phone widths. Desktop keeps
// the existing sidebar (AppLayout.jsx) -- this component renders nothing
// there (md:hidden). Mobile-first UI/UX pass, 2026-08-19.
//
// Primary destinations are a fixed, curated subset (not just "the first N
// permitted nav items") so the bar stays meaningful even if ALL_NAV_ITEMS'
// order changes later. Anything not in this set -- plus Account/Logout --
// lives behind "More", a bottom sheet, per the mobile-first spec (section 5:
// don't cram every destination into the bar itself).
const PRIMARY_PATHS = ["/", "/clients", "/jobs", "/book-in"];

export default function MobileBottomNav({
  navItems,
  badgeCounts = {},
  userName,
  role,
  onLogout,
}) {
  const location = useLocation();
  const [moreOpen, setMoreOpen] = React.useState(false);

  const primaryItems = PRIMARY_PATHS
    .map((path) => navItems.find((item) => item.path === path))
    .filter(Boolean);
  const secondaryItems = navItems.filter(
    (item) => !primaryItems.some((p) => p.path === item.path)
  );

  const isActive = (path) => location.pathname === path;
  const moreActive = secondaryItems.some((item) => isActive(item.path));

  return (
    <>
      <nav
        className="fixed inset-x-0 bottom-0 z-40 flex items-stretch border-t border-border bg-card/95 backdrop-blur-xl md:hidden safe-area-bottom safe-area-x"
        style={{ height: "calc(var(--mobile-bottom-nav-height) + var(--safe-bottom))" }}
        aria-label="Primary"
      >
        {primaryItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.path);
          const count = item.badgeKey ? badgeCounts[item.badgeKey] : 0;
          return (
            <Link
              key={item.path}
              to={item.path}
              className="relative flex flex-1 flex-col items-center justify-center gap-0.5 py-1.5 text-[11px] font-medium"
              aria-current={active ? "page" : undefined}
            >
              <span className="relative">
                <Icon
                  className={`h-6 w-6 transition-colors ${active ? "text-primary" : "text-muted-foreground"}`}
                  strokeWidth={active ? 2.4 : 2}
                />
                {count > 0 && (
                  <span className="absolute -right-2 -top-1.5 min-w-[16px] h-4 px-1 rounded-full bg-destructive text-destructive-foreground text-[9px] font-semibold flex items-center justify-center">
                    {count > 99 ? "99+" : count}
                  </span>
                )}
              </span>
              <span className={active ? "text-primary" : "text-muted-foreground"}>
                {item.shortLabel || item.label}
              </span>
            </Link>
          );
        })}

        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          className="flex flex-1 flex-col items-center justify-center gap-0.5 py-1.5 text-[11px] font-medium"
          aria-haspopup="dialog"
        >
          <MoreHorizontal
            className={`h-6 w-6 ${moreActive ? "text-primary" : "text-muted-foreground"}`}
            strokeWidth={moreActive ? 2.4 : 2}
          />
          <span className={moreActive ? "text-primary" : "text-muted-foreground"}>More</span>
        </button>
      </nav>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent
          side="bottom"
          className="rounded-t-2xl p-0 pb-[var(--safe-bottom)] max-h-[80vh] overflow-y-auto md:hidden"
        >
          <SheetHeader className="px-4 pt-5 pb-2 text-left">
            <SheetTitle>More</SheetTitle>
          </SheetHeader>

          <div className="px-2 pb-2">
            {secondaryItems.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.path);
              const count = item.badgeKey ? badgeCounts[item.badgeKey] : 0;
              return (
                <SheetClose asChild key={item.path}>
                  <Link
                    to={item.path}
                    className={`flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium transition-colors ${
                      active
                        ? "bg-primary/15 text-primary"
                        : "text-foreground hover:bg-secondary"
                    }`}
                  >
                    <Icon className="w-5 h-5 shrink-0" />
                    <span className="flex-1">{item.label}</span>
                    {count > 0 && (
                      <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-primary text-primary-foreground text-[11px] font-semibold flex items-center justify-center shrink-0">
                        {count > 99 ? "99+" : count}
                      </span>
                    )}
                  </Link>
                </SheetClose>
              );
            })}
          </div>

          <div className="border-t border-border px-2 py-2">
            <SheetClose asChild>
              <Link
                to="/account"
                className="flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium text-foreground hover:bg-secondary transition-colors"
              >
                <div className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
                  <User2 className="w-4 h-4 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate">{userName}</p>
                  <p className="text-xs text-muted-foreground font-normal">{role}</p>
                </div>
              </Link>
            </SheetClose>

            <button
              type="button"
              onClick={() => {
                setMoreOpen(false);
                onLogout?.();
              }}
              className="flex w-full items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors"
            >
              <LogOut className="w-5 h-5" />
              Logout
            </button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
