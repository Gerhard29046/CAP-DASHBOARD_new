import React, { useState, useEffect } from "react";
import { apiClient } from "@/api/apiClient";
import { Link } from "react-router-dom";
import { Users, Cpu, Wrench, CalendarClock, ChevronRight, Plus, ClipboardList } from "lucide-react";
import StatCard from "@/components/StatCard";
import { Button } from "@/components/ui/button";
import LogServiceModal from "@/components/LogServiceModal";
import moment from "moment";

export default function Dashboard() {
  const [stats, setStats] = useState({ clients: 0, machines: 0, services: 0, activeJobs: 0 });
  const [upcoming, setUpcoming] = useState([]);
  const [recentClients, setRecentClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showLogService, setShowLogService] = useState(false);

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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="w-8 h-8 border-4 border-secondary border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto">
      {/* Log Service Modal */}
      {showLogService && (
        <LogServiceModal
          onClose={() => setShowLogService(false)}
          onDone={() => { setShowLogService(false); loadData(); }}
        />
      )}

      <div className="mb-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-heading font-bold text-foreground">Dashboard</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Overview of your HVAC operations</p>
          </div>
          <Button onClick={() => setShowLogService(true)} className="rounded-xl h-11 px-4 gap-2 shrink-0">
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Log New Service</span>
            <span className="sm:hidden">Log</span>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <StatCard icon={Users} label="Clients" value={stats.clients} />
        <StatCard icon={Cpu} label="Machines" value={stats.machines} accent="bg-amber-500/15 text-amber-400" />
        <StatCard icon={Wrench} label="Services" value={stats.services} accent="bg-violet-500/15 text-violet-400" />
        <StatCard icon={ClipboardList} label="Active Jobs" value={stats.activeJobs} accent="bg-emerald-500/15 text-emerald-400" />
      </div>

      {/* Upcoming Services */}
      <div className="bg-card rounded-2xl border border-border p-5 mb-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-heading font-semibold text-foreground flex items-center gap-2">
            <CalendarClock className="w-5 h-5 text-primary" /> Upcoming Services
          </h2>
          <Link to="/upcoming-services" className="text-xs text-primary hover:underline">View all</Link>
        </div>
        {upcoming.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">No upcoming services in the next 30 days</p>
        ) : (
          <div className="space-y-2">
            {upcoming.map(s => (
              <Link key={s.id} to={`/machines/${s.machine_id}`} className="flex items-center justify-between p-3 rounded-xl bg-secondary/50 hover:bg-secondary transition-colors group">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {s.machine ? `${s.machine.brand} ${s.machine.model}` : "Machine"}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {s.client?.company_name || "—"} · {moment(s.next_service_due).format("MMM D, YYYY")}
                  </p>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground shrink-0" />
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Recent Clients */}
      <div className="bg-card rounded-2xl border border-border p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-heading font-semibold text-foreground flex items-center gap-2">
            <Users className="w-5 h-5 text-primary" /> Recent Clients
          </h2>
          <Link to="/clients" className="text-xs text-primary hover:underline">View all</Link>
        </div>
        {recentClients.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">No clients yet</p>
        ) : (
          <div className="space-y-2">
            {recentClients.map(c => (
              <Link key={c.id} to={`/clients/${c.id}`} className="flex items-center justify-between p-3 rounded-xl bg-secondary/50 hover:bg-secondary transition-colors group">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{c.company_name}</p>
                  <p className="text-xs text-muted-foreground truncate">{c.contact_person || "No contact"}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground shrink-0" />
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
