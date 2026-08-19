import React, { useState, useEffect } from "react";
import { apiClient } from "@/api/apiClient";
import { useAuth } from "@/lib/AuthContext";
import { Link } from "react-router-dom";
import { Users, Cpu, Wrench, CalendarClock, ChevronRight, Plus, ClipboardList, CalendarDays } from "lucide-react";
import StatCard from "@/components/StatCard";
import EmptyState from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import LogServiceModal from "@/components/LogServiceModal";
import StickyNotes from "@/components/StickyNotes";
import moment from "moment";

function greeting(now) {
  const hour = now.hour();
  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 18) return "Good afternoon";
  return "Good evening";
}

// Stat cards link straight into the relevant list page (2026-08-17, explicit request: "top
// clients machines services and active jobs all should be clickable"). There is no dedicated
// standalone Machines list page in this app today -- every machine is browsed via its owning
// client (Clients -> ClientDetail -> MachineDetail) -- so the Machines card also points at
// /clients, the real entry point, rather than a route that doesn't exist.
const STAT_LINKS = { clients: "/clients", machines: "/clients", services: "/service-records", activeJobs: "/jobs" };

export default function Dashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState({ clients: 0, machines: 0, services: 0, activeJobs: 0 });
  const [weekServices, setWeekServices] = useState([]);
  const [latestServices, setLatestServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showLogService, setShowLogService] = useState(false);
  const [now, setNow] = useState(() => moment());

  useEffect(() => {
    const interval = setInterval(() => setNow(moment()), 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const loadData = async () => {
    try {
      // Mini week calendar pulls from the SAME `/calendar/events` endpoint CalendarPage.jsx
      // (the full /calendar page) uses -- not a separately-recomputed filter over raw
      // service_records. Explicit request (2026-08-17): "it must reflect to the current
      // existing one too" -- a reschedule made on the full calendar (EventDetails'
      // "Reschedule" button PATCHes next_service_due) must show up here identically, and this
      // widget must never drift out of sync with whatever that endpoint's own logic does.
      const today = moment().startOf("day");
      const weekEndExclusive = moment().startOf("day").add(7, "days");
      const calendarQuery = new URLSearchParams({
        start: today.toISOString(),
        end: weekEndExclusive.toISOString(),
        include_services: "1",
      });

      const results = await Promise.allSettled([
        apiClient.entities.Client.list(),
        apiClient.entities.Machine.list(),
        apiClient.entities.ServiceRecord.list("-service_date", 100),
        apiClient.entities.JobCard.list(),
        apiClient.request(`/calendar/events?${calendarQuery}`),
      ]);
      const labels = ["clients", "machines", "service records", "job cards", "calendar events"];
      results.forEach((result, index) => {
        if (result.status === "rejected") console.error(`Dashboard failed to load ${labels[index]}:`, result.reason);
      });
      const [clients, machines, services, jobCards] = results.slice(0, 4).map(result =>
        result.status === "fulfilled" && Array.isArray(result.value) ? result.value : []
      );
      const calendarResult = results[4];
      const calendarEventsThisWeek = calendarResult.status === "fulfilled" ? (calendarResult.value?.events || []) : [];

      const activeJobs = jobCards.filter(j => ["Open", "Booked In", "In Progress"].includes(j.status)).length;
      setStats({ clients: clients.length, machines: machines.length, services: services.length, activeJobs });

      const machineMap = {};
      machines.forEach(m => { machineMap[m.id] = m; });
      const clientMap = {};
      clients.forEach(c => { clientMap[c.id] = c; });
      const enrich = (s) => ({
        ...s,
        machine: machineMap[s.machine_id],
        client: machineMap[s.machine_id] ? clientMap[machineMap[s.machine_id].client_id] : null,
      });

      // Same event shape calendarEvents() (supabaseApiClient.js) already builds for the full
      // /calendar page -- just re-sorted, no re-filtering/re-deriving of our own.
      const weekEvents = [...calendarEventsThisWeek].sort((a, b) => (a.start || "").localeCompare(b.start || ""));
      setWeekServices(weekEvents);

      // "Latest services done" (replaces "Upcoming work") -- most recently completed service
      // records, newest first. Only rows with an actual service_date count as "done". Not
      // calendar data (this is "done", not "upcoming"), so still sourced from service_records
      // directly, same as before.
      const completed = services
        .filter(s => s.service_date)
        .sort((a, b) => (b.service_date || "").localeCompare(a.service_date || ""))
        .slice(0, 6)
        .map(enrich);
      setLatestServices(completed);
    } catch (e) { console.error("Dashboard data load failed:", e); }
    finally { setLoading(false); }
  };

  useEffect(() => { loadData(); }, []);

  const firstName = (user?.name || user?.full_name || user?.email || "").split(/[\s@]/)[0];
  const greetingWord = greeting(now);
  const formattedDateTime = now.format("dddd, D MMMM YYYY") + " · " + now.format("HH:mm");

  if (loading) {
    return (
      <div className="w-full space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-96" />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
        <div className="grid lg:grid-cols-2 gap-4">
          <Skeleton className="h-72 rounded-xl" />
          <Skeleton className="h-72 rounded-xl" />
        </div>
      </div>
    );
  }

  // Rolling 7-day window starting today (not calendar Mon-Sun) -- "upcoming services in the
  // week" reads more naturally as "the week ahead" than a week that could include past days.
  // `weekServices` here is the exact same event list the full /calendar page renders (see
  // loadData()) -- `event.start` is a YYYY-MM-DD date string, matching `key` below directly.
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const date = moment().add(i, "days");
    const key = date.format("YYYY-MM-DD");
    const dueCount = weekServices.filter(s => s.start === key).length;
    return { date, key, dueCount, isToday: i === 0 };
  });

  return (
    <div className="w-full">
      {showLogService && (
        <LogServiceModal
          onClose={() => setShowLogService(false)}
          onDone={() => { setShowLogService(false); loadData(); }}
        />
      )}

      {/* Welcome / context header -- compact single-column stack on phones (title, meta line,
          then a full-width primary action) rather than a shrunken desktop header; mirrors the
          "greeting card" pattern common to native mobile dashboards. */}
      <div className="mb-6 sm:mb-8 animate-fade-in">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl md:text-3xl font-heading font-bold text-foreground truncate">
              {greetingWord}{firstName ? `, ${firstName}` : ""}
            </h1>
            <p className="text-xs text-muted-foreground mt-1">{formattedDateTime}</p>
            <p className="text-sm text-muted-foreground mt-1">
              {weekServices.length > 0
                ? `${weekServices.length} service${weekServices.length === 1 ? "" : "s"} due this week.`
                : "Here's what needs attention today."}
            </p>
          </div>
          <Button onClick={() => setShowLogService(true)} className="gap-2 shrink-0 w-full sm:w-auto">
            <Plus className="w-4 h-4" />
            Log New Service
          </Button>
        </div>
      </div>

      {/* Key operational stats -- each links into the relevant list page. On phones this is a
          horizontally-scrollable, snap-aligned strip (each tile a fixed peekable width, so the
          user can see the next card is there) instead of a cramped static 2-column grid -- a
          deliberately "native app" pattern rather than a shrunken desktop layout. Reverts to the
          original static grid at sm:+ where there's room for all 4 without scrolling. */}
      <div className="flex overflow-x-auto snap-x snap-mandatory gap-3 -mx-4 px-4 pb-1 mb-8 stagger-in sm:grid sm:grid-cols-4 sm:gap-4 sm:overflow-visible sm:mx-0 sm:px-0 sm:pb-0 no-scrollbar">
        <Link to={STAT_LINKS.clients} className="block shrink-0 w-[38%] snap-start sm:w-auto">
          <StatCard icon={Users} label="Clients" value={stats.clients} accent="primary" />
        </Link>
        <Link to={STAT_LINKS.machines} className="block shrink-0 w-[38%] snap-start sm:w-auto">
          <StatCard icon={Cpu} label="Machines" value={stats.machines} accent="warning" />
        </Link>
        <Link to={STAT_LINKS.services} className="block shrink-0 w-[38%] snap-start sm:w-auto">
          <StatCard icon={Wrench} label="Services logged" value={stats.services} accent="info" />
        </Link>
        <Link to={STAT_LINKS.activeJobs} className="block shrink-0 w-[38%] snap-start sm:w-auto">
          <StatCard icon={ClipboardList} label="Active jobs" value={stats.activeJobs} accent="success" />
        </Link>
      </div>

      {/* Primary + secondary panels */}
      {/* min-w-0 on both grid children below is load-bearing, not decorative: grid items
          default to `min-width: auto` (their content's min-content size), same as flex items.
          A long, unbreakable (`truncate` forces `white-space: nowrap`) service description
          could silently force its whole grid track -- and the document -- wider than the
          viewport on phones. Real bug, found via automated Playwright viewport testing
          (2026-08-19) with real service-record data, not a hypothetical. */}
      <div className="grid lg:grid-cols-2 gap-4 lg:gap-6">
        <section className="min-w-0 bg-card rounded-2xl sm:rounded-xl border border-border animate-slide-up" style={{ animationDelay: "80ms" }}>
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <h2 className="font-heading font-semibold text-foreground flex items-center gap-2">
              <Wrench className="w-4.5 h-4.5 text-primary" />
              Latest services done
            </h2>
            <Link to="/service-records" className="text-xs font-medium text-primary hover:underline">
              View all
            </Link>
          </div>
          {latestServices.length === 0 ? (
            <EmptyState
              icon={Wrench}
              title="No services logged yet"
              description="Completed services will show up here as soon as they're logged."
            />
          ) : (
            <div className="divide-y divide-border">
              {latestServices.map(s => (
                <Link
                  key={s.id}
                  to={`/machines/${s.machine_id}`}
                  className="flex items-center justify-between gap-3 px-5 py-3.5 hover:bg-secondary/60 transition-colors duration-150 group"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {s.client?.company_name || "Unknown client"}
                    </p>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">
                      {s.work_performed || s.findings || s.notes || "No description recorded"}
                    </p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground group-hover:translate-x-0.5 transition-all duration-150 shrink-0" />
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* Mini week calendar (replaces "Recent clients") -- same card footprint, whole card
            links to the full /calendar page. */}
        <section className="min-w-0 bg-card rounded-2xl sm:rounded-xl border border-border animate-slide-up flex flex-col" style={{ animationDelay: "140ms" }}>
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <h2 className="font-heading font-semibold text-foreground flex items-center gap-2">
              <CalendarDays className="w-4.5 h-4.5 text-primary" />
              This week
            </h2>
            <Link to="/calendar" className="text-xs font-medium text-primary hover:underline">
              Open calendar
            </Link>
          </div>
          {/* BUG FIX (Dashboard mobile pass): p-4 outer padding + gap-1.5 left only ~31px per
              cell at a 320px viewport for a fixed 7-column grid -- too tight for a 2-digit date
              + 3-letter day label to render comfortably. Tighter padding/gap below sm: reclaims
              enough width; unchanged at sm:+ where there's room to spare. */}
          <Link to="/calendar" className="flex-1 flex flex-col p-2 sm:p-4 hover:bg-secondary/30 transition-colors duration-150">
            <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
              {weekDays.map(d => (
                <div
                  key={d.key}
                  className={`rounded-lg border p-1 sm:p-2 text-center flex flex-col items-center justify-center gap-1 min-h-[60px] sm:min-h-[72px] ${
                    d.isToday ? "border-primary bg-primary/10" : "border-border"
                  }`}
                >
                  <span className="text-[9px] sm:text-[10px] font-medium uppercase text-muted-foreground">{d.date.format("ddd")}</span>
                  <span className={`text-sm sm:text-base font-heading font-bold ${d.isToday ? "text-primary" : "text-foreground"}`}>
                    {d.date.format("D")}
                  </span>
                  {d.dueCount > 0 && (
                    <span className="min-w-[16px] h-[16px] sm:min-w-[18px] sm:h-[18px] px-1 rounded-full bg-primary text-primary-foreground text-[9px] sm:text-[10px] font-semibold flex items-center justify-center">
                      {d.dueCount}
                    </span>
                  )}
                </div>
              ))}
            </div>
            <div className="flex-1 mt-3">
              {weekServices.length === 0 ? (
                <EmptyState
                  icon={CalendarClock}
                  title="Nothing due this week"
                  description="No services are scheduled in the next 7 days."
                />
              ) : (
                <div className="divide-y divide-border -mx-4">
                  {weekServices.slice(0, 4).map(event => (
                    <div key={event.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">
                          {[event.extendedProps?.machineBrand, event.extendedProps?.machineModel].filter(Boolean).join(" ") || "Machine"}
                        </p>
                        <p className="text-xs text-muted-foreground truncate mt-0.5">
                          {event.extendedProps?.clientName || "—"} &middot; {moment(event.start).format("ddd, MMM D")}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Link>
        </section>
      </div>

      <div className="mt-4 lg:mt-6">
        <StickyNotes />
      </div>
    </div>
  );
}
