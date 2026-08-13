import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Search, Plus, Clock, Wrench, Hourglass, CheckCircle2, Eye,
  ChevronRight, Calendar, ClipboardList, Building2, Package, X, Edit3,
} from "lucide-react";
import { apiClient } from "@/api/apiClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import StatCard from "@/components/StatCard";

// Status -> design-system badge variant + icon. Same semantic tokens used
// everywhere else (success/warning/info/neutral), not ad-hoc colors per page.
const STATUS_CONFIG = {
  "Open": { label: "Open / Booked In", variant: "info", icon: Clock },
  "Booked In": { label: "Open / Booked In", variant: "info", icon: Clock },
  "In Progress": { label: "In Progress", variant: "warning", icon: Wrench },
  "Waiting for Parts": { label: "Waiting for Parts", variant: "neutral", icon: Hourglass },
  "Ready for Collection": { label: "Ready for Collection", variant: "success", icon: CheckCircle2 },
  "Completed": { label: "Completed", variant: "success", icon: CheckCircle2 },
  "Collected": { label: "Collected", variant: "success", icon: CheckCircle2 },
};
const TABS = ["All", "Open", "In Progress", "Waiting for Parts", "Ready for Collection", "Completed", "Collected"];

function getStatusConfig(status) {
  return STATUS_CONFIG[status] || STATUS_CONFIG["Open"];
}

function StatusBadge({ status }) {
  const config = getStatusConfig(status);
  const Icon = config.icon;
  return (
    <Badge variant={config.variant} className="gap-1">
      <Icon className="w-3 h-3" /> {config.label}
    </Badge>
  );
}

function formatDate(date) {
  if (!date) return "Not set";
  try {
    return new Date(date).toLocaleDateString("en-ZA", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return date;
  }
}

export default function Jobs() {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("All");
  const [selectedJob, setSelectedJob] = useState(null);
  const [updating, setUpdating] = useState(false);

  useEffect(() => { loadJobs(); }, []);

  const loadJobs = async () => {
    setLoading(true);
    try {
      const data = await apiClient.entities.JobCard.list();
      setJobs(data || []);
      if (data?.length > 0) setSelectedJob(data[0]);
    } catch (error) {
      console.error("Failed to load jobs:", error);
      setJobs([]);
    } finally {
      setLoading(false);
    }
  };

  const stats = useMemo(() => ({
    open: jobs.filter((j) => ["Open", "Booked In"].includes(j.status)).length,
    progress: jobs.filter((j) => j.status === "In Progress").length,
    waiting: jobs.filter((j) => j.status === "Waiting for Parts").length,
    ready: jobs.filter((j) => j.status === "Ready for Collection").length,
    completed: jobs.filter((j) => j.status === "Completed").length,
  }), [jobs]);

  const filteredJobs = useMemo(() => jobs.filter((job) => {
    const searchText = [
      job.job_number, job.client?.company_name, job.client?.name,
      job.machine?.brand, job.machine?.model, job.machine?.serial_number,
      job.status, job.technician_name, job.fault_description,
    ].filter(Boolean).join(" ").toLowerCase();
    const matchesSearch = searchText.includes(search.toLowerCase());
    const matchesTab = activeTab === "All"
      || (activeTab === "Open" && ["Open", "Booked In"].includes(job.status))
      || job.status === activeTab;
    return matchesSearch && matchesTab;
  }), [jobs, search, activeTab]);

  const markCompleted = async () => {
    if (!selectedJob) return;
    setUpdating(true);
    try {
      const updated = await apiClient.entities.JobCard.update(selectedJob.id, {
        status: "Completed",
        date_completed: new Date().toISOString().slice(0, 10),
      });
      setJobs((prev) => prev.map((job) => (job.id === selectedJob.id ? updated : job)));
      setSelectedJob(updated);
    } catch (error) {
      console.error("Failed to mark completed:", error);
      alert("Could not mark job as completed.");
    } finally {
      setUpdating(false);
    }
  };

  return (
    <div className="max-w-[1400px] mx-auto">
      <PageHeader
        title="Jobs"
        subtitle="Overview of all booked-in machines and job cards."
        action={
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search jobs…"
                className="pl-10 h-10 w-full sm:w-64"
              />
            </div>
            <Button onClick={() => navigate("/book-in")} className="gap-2">
              <Plus className="w-4 h-4" /> New Job Card
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4 mb-6 stagger-in">
        <StatCard label="Open / Booked In" value={stats.open} icon={Clock} accent="info" />
        <StatCard label="In Progress" value={stats.progress} icon={Wrench} accent="warning" />
        <StatCard label="Waiting for Parts" value={stats.waiting} icon={Hourglass} accent="primary" />
        <StatCard label="Ready for Collection" value={stats.ready} icon={CheckCircle2} accent="success" />
        <StatCard label="Completed" value={stats.completed} icon={CheckCircle2} accent="success" />
      </div>

      <div className="grid grid-cols-1 2xl:grid-cols-[minmax(0,1fr)_380px] gap-5">
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="flex flex-wrap items-center gap-1.5 px-4 py-3 border-b border-border overflow-x-auto">
            {TABS.map((tab) => {
              const count = tab === "All" ? jobs.length : tab === "Open" ? stats.open : jobs.filter((j) => j.status === tab).length;
              const active = activeTab === tab;
              return (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors duration-150 ${
                    active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                  }`}
                >
                  {tab}
                  <span className="ml-1.5 text-xs bg-secondary rounded-full px-1.5 py-0.5">{count}</span>
                </button>
              );
            })}
          </div>

          {loading ? (
            <div className="p-4 space-y-2">
              {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-14 rounded-lg" />)}
            </div>
          ) : filteredJobs.length === 0 ? (
            <EmptyState icon={ClipboardList} title="No jobs found" description="Booked-in machines will appear here." />
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden lg:block">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="pl-4">Job #</TableHead>
                      <TableHead>Client</TableHead>
                      <TableHead>Machine</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Received</TableHead>
                      <TableHead>Technician</TableHead>
                      <TableHead className="w-10" aria-label="Opens job card" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredJobs.map((job) => (
                      <TableRow
                        key={job.id}
                        onClick={() => setSelectedJob(job)}
                        aria-label={`Select ${job.job_number || `job ${job.id}`} to preview`}
                        className={`cursor-pointer ${selectedJob?.id === job.id ? "bg-primary/5" : ""}`}
                      >
                        <TableCell className="pl-4 font-medium text-foreground py-3.5">{job.job_number || `JOB-${job.id}`}</TableCell>
                        <TableCell>{job.client?.company_name || job.client?.name || "Unknown Client"}</TableCell>
                        <TableCell>
                          <p className="text-foreground">{[job.machine?.brand, job.machine?.model].filter(Boolean).join(" ") || "Unknown Machine"}</p>
                          {job.machine?.serial_number && <p className="text-xs text-muted-foreground mt-0.5">{job.machine.serial_number}</p>}
                        </TableCell>
                        <TableCell><StatusBadge status={job.status} /></TableCell>
                        <TableCell className="text-muted-foreground">{formatDate(job.date_received)}</TableCell>
                        <TableCell className="text-muted-foreground">{job.technician_name || "Unassigned"}</TableCell>
                        <TableCell>
                          {/* Decorative only -- the whole row above is the click target (onClick
                              on TableRow). Not a second, smaller, differently-behaved button. */}
                          <ChevronRight className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile card list -- tapping the whole card opens the job card directly
                  (no side panel exists on this breakpoint, so "select only" would be a
                  dead end with no visible result). */}
              <div className="lg:hidden divide-y divide-border">
                {filteredJobs.map((job) => (
                  <button
                    key={job.id}
                    onClick={() => navigate(`/job-cards/${job.id}`)}
                    aria-label={`Open ${job.job_number || `job ${job.id}`}`}
                    className="w-full flex items-start gap-3 p-4 text-left active:bg-secondary/60 transition-colors duration-150"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-foreground text-sm">{job.job_number || `JOB-${job.id}`}</span>
                        <StatusBadge status={job.status} />
                      </div>
                      <p className="text-sm text-muted-foreground mt-1 truncate">{job.client?.company_name || job.client?.name || "Unknown Client"}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">
                        {[job.machine?.brand, job.machine?.model].filter(Boolean).join(" ") || "Unknown Machine"} &middot; {formatDate(job.date_received)}
                      </p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 mt-1" aria-hidden="true" />
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Desktop-only preview panel (master/detail) -- its own explicit "Open Job
            Card" button (below) is the real navigation action; row clicks in the
            table above only update this preview, they don't navigate away. */}
        <div className="hidden 2xl:block">
          <JobDetailsPanel
            job={selectedJob}
            onClose={() => setSelectedJob(null)}
            onOpen={() => selectedJob && navigate(`/job-cards/${selectedJob.id}`)}
            onEdit={() => selectedJob && navigate(`/job-cards/${selectedJob.id}`)}
            onComplete={markCompleted}
            updating={updating}
          />
        </div>
      </div>
    </div>
  );
}

function JobDetailsPanel({ job, onClose, onOpen, onEdit, onComplete, updating }) {
  if (!job) {
    return (
      <div className="bg-card border border-border rounded-xl p-6">
        <p className="text-muted-foreground text-sm">Select a job to view details.</p>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="flex items-start justify-between p-5 border-b border-border">
        <div>
          <h2 className="text-lg font-heading font-bold text-foreground">{job.job_number || `JOB-${job.id}`}</h2>
          <div className="mt-2"><StatusBadge status={job.status} /></div>
        </div>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="p-5 space-y-6">
        <DetailSection icon={Building2} title="Client">
          <p className="font-medium text-foreground">{job.client?.company_name || job.client?.name || "Unknown Client"}</p>
          {job.client?.phone && <p className="text-sm text-muted-foreground">{job.client.phone}</p>}
          {job.client?.email && <p className="text-sm text-muted-foreground">{job.client.email}</p>}
        </DetailSection>

        <DetailSection icon={Package} title="Machine">
          <p className="font-medium text-foreground">{[job.machine?.brand, job.machine?.model].filter(Boolean).join(" ") || "Unknown Machine"}</p>
          {job.machine?.refrigerant_type && <p className="text-sm text-muted-foreground">{job.machine.refrigerant_type}</p>}
          <div className="grid grid-cols-2 gap-2 mt-3 text-sm">
            <span className="text-muted-foreground">Serial Number</span>
            <span className="text-foreground text-right">{job.machine?.serial_number || "—"}</span>
          </div>
        </DetailSection>

        <DetailSection icon={Calendar} title="Job Information">
          <InfoRow label="Date Received" value={formatDate(job.date_received)} />
          <InfoRow label="Date Completed" value={formatDate(job.date_completed)} />
          <InfoRow label="Technician" value={job.technician_name || "Unassigned"} />
          {job.fault_description && (
            <div className="mt-3">
              <p className="text-sm text-muted-foreground">Fault Reported</p>
              <p className="text-sm text-foreground mt-1">{job.fault_description}</p>
            </div>
          )}
        </DetailSection>

        <div>
          <h3 className="font-heading font-semibold text-foreground mb-3 text-sm">Quick Actions</h3>
          <div className="grid grid-cols-1 gap-2">
            <Button onClick={onOpen} className="gap-2"><Eye className="w-4 h-4" /> Open Job Card</Button>
            <Button onClick={onEdit} variant="outline" className="gap-2"><Edit3 className="w-4 h-4" /> Edit Job</Button>
            {job.status !== "Completed" && (
              <Button onClick={onComplete} disabled={updating} variant="secondary" className="gap-2">
                <CheckCircle2 className="w-4 h-4" /> {updating ? "Updating…" : "Mark as Completed"}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function DetailSection({ icon: Icon, title, children }) {
  return (
    <div className="border-b border-border pb-5 last:border-b-0 last:pb-0">
      <div className="flex items-center gap-2 mb-3">
        <Icon className="w-4 h-4 text-primary" />
        <h3 className="font-heading font-semibold text-foreground text-sm">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function InfoRow({ label, value }) {
  return (
    <div className="grid grid-cols-2 gap-2 text-sm py-1">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-foreground text-right">{value || "—"}</span>
    </div>
  );
}
