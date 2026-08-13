import React, { useState, useEffect } from "react";
import { apiClient } from "@/api/apiClient";
import { useAuth } from "@/lib/AuthContext";
import { Link } from "react-router-dom";
import { Users, Cpu, Wrench, CalendarClock, ChevronRight, Plus, ClipboardList } from "lucide-react";
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

export default function Dashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState({ clients: 0, machines: 0, services: 0, activeJobs: 0 });
  const [upcoming, setUpcoming] = useState([]);
  const [recentClients, setRecentClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showLogService, setShowLogService] = useState(false);
  const [now, setNow] = useState(() => moment());

  useEffect(() => {
    const interval = setInterval(() => setNow(moment()), 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const loadData = async () => {
    try {
      const results = await Promise.allSettled([
        apiClient.entities.Client.list(),
        apiClient.entities.Machine.list(),
        apiClient.entities.ServiceRecord.list("-service_date", 100),
        apiClient.entities.JobCard.list(),
      ]);
      const labels = ["clients", "machines", "service records", "job cards"];
      results.forEach((result, index) => {
        if (result.status === "rejected") console.error(`Dashboard failed to load ${labels[index]}:`, result.reason);
      });
      const [clients, machines, services, jobCards] = results.map(result =>
        result.status === "fulfilled" && Array.isArray(result.value) ? result.value : []
      );
      const activeJobs = jobCards.filter(j => ["Open", "Booked In", "In Progress"].includes(j.status)).length;
      setStats({ clients: clients.length, machines: machines.length, services: services.length, activeJobs });
      setRecentClients([...clients].sort((a, b) => (b.created_at || "").localeCompare(a.created_at || "")).slice(0, 5));

      const today = moment().format("YYYY-MM-DD");
      const next30 = moment().add(30, "days").format("YYYY-MM-DD");
      const upcomingList = services.filter(s => s.next_service_due && s.next_service_due >= today && s.next_service_due <= next30);
      upcomingList.sort((a, b) => a.next_service_due.localeCompare(b.next_service_due));

      const machineMap = {};
      machines.forEach(m => { machineMap[m.id] = m; });
      const clientMap = {};
      clients.forEach(c => { clientMap[c.id] = c; });

      const enriched = upcomingList.slice(0, 5).map(s => ({
        ...s,
        machine: machineMap[s.machine_id],
        client: machineMap[s.machine_id] ? clientMap[machineMap[s.machine_id].client_id] : null,
      }));
      setUpcoming(enriched);
    } catch (e) { console.error("Dashboard data load failed:", e); }
    finally { setLoading(false); }
  };

  useEffect(() => { loadData(); }, []);

  const firstName = (user?.name || user?.full_name || user?.email || "").split(/[\s@]/)[0];
  const greetingWord = greeting(now);
  const formattedDateTime = now.format("dddd, D MMMM YYYY") + " · " + now.format("HH:mm");

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto space-y-6">
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

  return (
    <div className="max-w-7xl mx-auto">
      {showLogService && (
        <LogServiceModal
          onClose={() => setShowLogService(false)}
          onDone={() => { setShowLogService(false); loadData(); }}
        />
      )}

      {/* Welcome / context header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8 animate-fade-in">
        <div>
          <h1 className="text-2xl md:text-3xl font-heading font-bold text-foreground">
            {greetingWord}{firstName ? `, ${firstName}` : ""}
          </h1>
          <p className="text-xs text-muted-foreground mt-1">{formattedDateTime}</p>
          <p className="text-sm text-muted-foreground mt-1">
            {upcoming.length > 0
              ? `${upcoming.length} service${upcoming.length === 1 ? "" : "s"} due in the next 30 days.`
              : "Here's what needs attention today."}
          </p>
        </div>
        <Button onClick={() => setShowLogService(true)} className="gap-2 shrink-0 self-start sm:self-auto">
          <Plus className="w-4 h-4" />
          Log New Service
        </Button>
      </div>

      {/* Key operational stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-8 stagger-in">
        <StatCard icon={Users} label="Clients" value={stats.clients} accent="primary" />
        <StatCard icon={Cpu} label="Machines" value={stats.machines} accent="warning" />
        <StatCard icon={Wrench} label="Services logged" value={stats.services} accent="info" />
        <StatCard icon={ClipboardList} label="Active jobs" value={stats.activeJobs} accent="success" />
      </div>

      {/* Primary + secondary panels */}
      <div className="grid lg:grid-cols-2 gap-4 lg:gap-6">
        <section className="bg-card rounded-xl border border-border animate-slide-up" style={{ animationDelay: "80ms" }}>
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <h2 className="font-heading font-semibold text-foreground flex items-center gap-2">
              <CalendarClock className="w-4.5 h-4.5 text-primary" />
              Upcoming work
            </h2>
            <Link to="/upcoming-services" className="text-xs font-medium text-primary hover:underline">
              View all
            </Link>
          </div>
          {upcoming.length === 0 ? (
            <EmptyState
              icon={CalendarClock}
              title="Nothing due soon"
              description="No services are scheduled in the next 30 days."
            />
          ) : (
            <div className="divide-y divide-border">
              {upcoming.map(s => (
                <Link
                  key={s.id}
                  to={`/machines/${s.machine_id}`}
                  className="flex items-center justify-between gap-3 px-5 py-3.5 hover:bg-secondary/60 transition-colors duration-150 group"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {s.machine ? `${s.machine.brand} ${s.machine.model}` : "Machine"}
                    </p>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">
                      {s.client?.company_name || "—"} &middot; {moment(s.next_service_due).format("MMM D, YYYY")}
                    </p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground group-hover:translate-x-0.5 transition-all duration-150 shrink-0" />
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className="bg-card rounded-xl border border-border animate-slide-up" style={{ animationDelay: "140ms" }}>
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <h2 className="font-heading font-semibold text-foreground flex items-center gap-2">
              <Users className="w-4.5 h-4.5 text-primary" />
              Recent clients
            </h2>
            <Link to="/clients" className="text-xs font-medium text-primary hover:underline">
              View all
            </Link>
          </div>
          {recentClients.length === 0 ? (
            <EmptyState
              icon={Users}
              title="No clients yet"
              description="Add your first client to start tracking machines and service history."
              action={
                <Button asChild size="sm">
                  <Link to="/clients/new">Add Client</Link>
                </Button>
              }
            />
          ) : (
            <div className="divide-y divide-border">
              {recentClients.map(c => (
                <Link
                  key={c.id}
                  to={`/clients/${c.id}`}
                  className="flex items-center justify-between gap-3 px-5 py-3.5 hover:bg-secondary/60 transition-colors duration-150 group"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{c.company_name}</p>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">{c.contact_person || "No contact"}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground group-hover:translate-x-0.5 transition-all duration-150 shrink-0" />
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>

      <div className="mt-4 lg:mt-6">
        <StickyNotes />
      </div>
    </div>
  );
}
