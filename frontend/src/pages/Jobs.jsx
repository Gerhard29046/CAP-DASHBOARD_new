import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Search,
  Plus,
  Clock,
  Wrench,
  Hourglass,
  CheckCircle2,
  Eye,
  ChevronRight,
  Calendar,
  ClipboardList,
  Building2,
  Package,
  X,
  Edit3,
} from "lucide-react";
import { apiClient } from "@/api/apiClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const STATUS_CONFIG = {
  "Open": {
    label: "Open / Booked In",
    color: "text-blue-400",
    badge: "bg-blue-500/15 text-blue-400 border-blue-500/30",
    icon: Clock,
  },
  "Booked In": {
    label: "Open / Booked In",
    color: "text-blue-400",
    badge: "bg-blue-500/15 text-blue-400 border-blue-500/30",
    icon: Clock,
  },
  "In Progress": {
    label: "In Progress",
    color: "text-yellow-400",
    badge: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
    icon: Wrench,
  },
  "Waiting for Parts": {
    label: "Waiting for Parts",
    color: "text-purple-400",
    badge: "bg-purple-500/15 text-purple-400 border-purple-500/30",
    icon: Hourglass,
  },
  "Ready for Collection": {
    label: "Ready for Collection",
    color: "text-teal-400",
    badge: "bg-teal-500/15 text-teal-400 border-teal-500/30",
    icon: CheckCircle2,
  },
  "Completed": {
    label: "Completed",
    color: "text-emerald-400",
    badge: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    icon: CheckCircle2,
  },
  "Collected": {
    label: "Collected",
    color: "text-teal-400",
    badge: "bg-teal-500/15 text-teal-400 border-teal-500/30",
    icon: CheckCircle2,
  },
};

const TABS = [
  "All",
  "Open",
  "In Progress",
  "Waiting for Parts",
  "Ready for Collection",
  "Completed",
  "Collected",
];

function getStatusConfig(status) {
  return STATUS_CONFIG[status] || STATUS_CONFIG["Open"];
}

function formatDate(date) {
  if (!date) return "Not set";

  try {
    return new Date(date).toLocaleDateString("en-ZA", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
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

  useEffect(() => {
    loadJobs();
  }, []);

  const loadJobs = async () => {
    setLoading(true);

    try {
      const data = await apiClient.entities.JobCard.list();
      setJobs(data || []);

      if (data?.length > 0) {
        setSelectedJob(data[0]);
      }
    } catch (error) {
      console.error("Failed to load jobs:", error);
      setJobs([]);
    } finally {
      setLoading(false);
    }
  };

  const stats = useMemo(() => {
    return {
      open: jobs.filter((j) => ["Open", "Booked In"].includes(j.status)).length,
      progress: jobs.filter((j) => j.status === "In Progress").length,
      waiting: jobs.filter((j) => j.status === "Waiting for Parts").length,
      ready: jobs.filter((j) => j.status === "Ready for Collection").length,
      completed: jobs.filter((j) => j.status === "Completed").length,
    };
  }, [jobs]);

  const filteredJobs = useMemo(() => {
    return jobs.filter((job) => {
      const searchText = [
        job.job_number,
        job.client?.company_name,
        job.client?.name,
        job.machine?.brand,
        job.machine?.model,
        job.machine?.serial_number,
        job.status,
        job.technician_name,
        job.fault_description,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      const matchesSearch = searchText.includes(search.toLowerCase());

      const matchesTab =
        activeTab === "All" ||
        (activeTab === "Open" && ["Open", "Booked In"].includes(job.status)) ||
        job.status === activeTab;

      return matchesSearch && matchesTab;
    });
  }, [jobs, search, activeTab]);

  const markCompleted = async () => {
    if (!selectedJob) return;

    setUpdating(true);

    try {
      const updated = await apiClient.entities.JobCard.update(selectedJob.id, {
        status: "Completed",
        date_completed: new Date().toISOString().slice(0, 10),
      });

      setJobs((prev) =>
        prev.map((job) => (job.id === selectedJob.id ? updated : job))
      );
      setSelectedJob(updated);
    } catch (error) {
      console.error("Failed to mark completed:", error);
      alert("Could not mark job as completed.");
    } finally {
      setUpdating(false);
    }
  };

  return (
<div className="w-full max-w-none space-y-6">      
    <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-heading font-bold text-foreground">
            Jobs
          </h1>
          <p className="text-muted-foreground mt-1">
            Overview of all booked-in machines and job cards.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search jobs..."
              className="pl-10 h-11 rounded-xl bg-secondary/50 border-border w-full sm:w-72"
            />
          </div>

          <Button
            onClick={() => navigate("/book-in")}
            className="h-11 rounded-xl gap-2"
          >
            <Plus className="w-4 h-4" />
            New Job Card
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
        <StatCard
          title="Open / Booked In"
          value={stats.open}
          icon={Clock}
          accent="blue"
        />
        <StatCard
          title="In Progress"
          value={stats.progress}
          icon={Wrench}
          accent="yellow"
        />
        <StatCard
          title="Waiting for Parts"
          value={stats.waiting}
          icon={Hourglass}
          accent="purple"
        />
        <StatCard
          title="Ready for Collection"
          value={stats.ready}
          icon={CheckCircle2}
          accent="teal"
        />
        <StatCard
          title="Completed"
          value={stats.completed}
          icon={CheckCircle2}
          accent="emerald"
        />
      </div>

<div className="grid grid-cols-1 2xl:grid-cols-[minmax(0,1fr)_380px] gap-5">
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 px-4 py-4 border-b border-border">
            {TABS.map((tab) => {
              const count =
                tab === "All"
                  ? jobs.length
                  : tab === "Open"
                  ? stats.open
                  : jobs.filter((j) => j.status === tab).length;

              const active = activeTab === tab;

              return (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    active
                      ? "bg-primary/15 text-primary"
                      : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                  }`}
                >
                  {tab === "Open" ? "Open" : tab}
                  <span className="ml-2 text-xs bg-secondary rounded-full px-2 py-0.5">
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-28">
              <div className="w-8 h-8 border-4 border-secondary border-t-primary rounded-full animate-spin" />
            </div>
          ) : filteredJobs.length === 0 ? (
            <div className="text-center py-20">
              <ClipboardList className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
              <h3 className="font-semibold text-foreground">No jobs found</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Booked-in machines will appear here.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-secondary/30 text-muted-foreground">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium">Job #</th>
                    <th className="text-left px-4 py-3 font-medium">Client</th>
                    <th className="text-left px-4 py-3 font-medium">Machine</th>
                    <th className="text-left px-4 py-3 font-medium">
                      Serial Number
                    </th>
                    <th className="text-left px-4 py-3 font-medium">Status</th>
                    <th className="text-left px-4 py-3 font-medium">
                      Date Received
                    </th>
                    <th className="text-left px-4 py-3 font-medium">
                      Technician
                    </th>
                    <th className="text-right px-4 py-3 font-medium">
                      Actions
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {filteredJobs.map((job) => {
                    const config = getStatusConfig(job.status);
                    const selected = selectedJob?.id === job.id;

                    return (
                      <tr
                        key={job.id}
                        onClick={() => setSelectedJob(job)}
                        className={`border-t border-border cursor-pointer transition-colors ${
                          selected
                            ? "bg-primary/10"
                            : "hover:bg-secondary/30"
                        }`}
                      >
                        <td className="px-4 py-4 font-medium text-foreground">
                          {job.job_number || `JOB-${job.id}`}
                        </td>

                        <td className="px-4 py-4">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-xs font-bold">
                              {(job.client?.company_name ||
                                job.client?.name ||
                                "C")[0]}
                            </div>
                            <span className="text-foreground">
                              {job.client?.company_name ||
                                job.client?.name ||
                                "Unknown Client"}
                            </span>
                          </div>
                        </td>

                        <td className="px-4 py-4">
                          <p className="text-foreground">
                            {[job.machine?.brand, job.machine?.model]
                              .filter(Boolean)
                              .join(" ") || "Unknown Machine"}
                          </p>
                          {job.machine?.refrigerant_type && (
                            <p className="text-xs text-muted-foreground">
                              {job.machine.refrigerant_type}
                            </p>
                          )}
                        </td>

                        <td className="px-4 py-4 text-muted-foreground">
                          {job.machine?.serial_number || "—"}
                        </td>

                        <td className="px-4 py-4">
                          <span
                            className={`inline-flex items-center rounded-lg border px-2.5 py-1 text-xs font-medium ${config.badge}`}
                          >
                            {config.label}
                          </span>
                        </td>

                        <td className="px-4 py-4 text-muted-foreground">
                          {formatDate(job.date_received)}
                        </td>

                        <td className="px-4 py-4 text-muted-foreground">
                          {job.technician_name || "Unassigned"}
                        </td>

                        <td className="px-4 py-4 text-right">
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedJob(job);
                              }}
                              className="w-8 h-8 rounded-lg border border-border hover:bg-secondary inline-flex items-center justify-center"
                            >
                              <Eye className="w-4 h-4 text-primary" />
                            </button>

                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/job-cards/${job.id}`);
                              }}
                              className="w-8 h-8 rounded-lg border border-border hover:bg-secondary inline-flex items-center justify-center"
                            >
                              <ChevronRight className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

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
  );
}

function StatCard({ title, value, icon: Icon, accent }) {
  const colors = {
    blue: "bg-blue-500/15 text-blue-400 border-blue-500/30",
    yellow: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
    purple: "bg-purple-500/15 text-purple-400 border-purple-500/30",
    teal: "bg-teal-500/15 text-teal-400 border-teal-500/30",
    emerald: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  };

  return (
    <div className="relative overflow-hidden bg-card border border-border rounded-2xl p-5">
      <div className="flex items-center gap-4">
        <div
          className={`w-12 h-12 rounded-2xl flex items-center justify-center ${colors[accent]}`}
        >
          <Icon className="w-6 h-6" />
        </div>

        <div>
          <p className="text-3xl font-bold text-foreground">{value}</p>
          <p className="text-sm text-muted-foreground">{title}</p>
        </div>
      </div>
    </div>
  );
}

function JobDetailsPanel({ job, onClose, onOpen, onEdit, onComplete, updating }) {
  if (!job) {
    return (
      <div className="bg-card border border-border rounded-2xl p-6 hidden xl:block">
        <p className="text-muted-foreground text-sm">
          Select a job to view details.
        </p>
      </div>
    );
  }

  const config = getStatusConfig(job.status);

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      <div className="flex items-start justify-between p-5 border-b border-border">
        <div>
          <h2 className="text-xl font-bold text-foreground">
            {job.job_number || `JOB-${job.id}`}
          </h2>
          <span
            className={`inline-flex mt-2 rounded-lg border px-2.5 py-1 text-xs font-medium ${config.badge}`}
          >
            {config.label}
          </span>
        </div>

        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="p-5 space-y-6">
        <DetailSection icon={Building2} title="Client">
          <p className="font-medium text-foreground">
            {job.client?.company_name || job.client?.name || "Unknown Client"}
          </p>
          {job.client?.phone && (
            <p className="text-sm text-muted-foreground">{job.client.phone}</p>
          )}
          {job.client?.email && (
            <p className="text-sm text-muted-foreground">{job.client.email}</p>
          )}
        </DetailSection>

        <DetailSection icon={Package} title="Machine">
          <p className="font-medium text-foreground">
            {[job.machine?.brand, job.machine?.model].filter(Boolean).join(" ") ||
              "Unknown Machine"}
          </p>
          {job.machine?.refrigerant_type && (
            <p className="text-sm text-muted-foreground">
              {job.machine.refrigerant_type}
            </p>
          )}
          <div className="grid grid-cols-2 gap-2 mt-3 text-sm">
            <span className="text-muted-foreground">Serial Number</span>
            <span className="text-foreground text-right">
              {job.machine?.serial_number || "—"}
            </span>
          </div>
        </DetailSection>

        <DetailSection icon={Calendar} title="Job Information">
          <InfoRow label="Date Received" value={formatDate(job.date_received)} />
          <InfoRow label="Date Completed" value={formatDate(job.date_completed)} />
          <InfoRow label="Technician" value={job.technician_name || "Unassigned"} />
          <InfoRow label="Status" value={config.label} />
          {job.fault_description && (
            <div className="mt-3">
              <p className="text-sm text-muted-foreground">Fault Reported</p>
              <p className="text-sm text-foreground mt-1">
                {job.fault_description}
              </p>
            </div>
          )}
        </DetailSection>

        <div>
          <h3 className="font-semibold text-foreground mb-3">Quick Actions</h3>

          <div className="grid grid-cols-1 gap-2">
            <Button onClick={onOpen} className="rounded-xl gap-2">
              <Eye className="w-4 h-4" />
              Open Job Card
            </Button>

            <Button
              onClick={onEdit}
              variant="outline"
              className="rounded-xl gap-2"
            >
              <Edit3 className="w-4 h-4" />
              Edit Job
            </Button>

            {job.status !== "Completed" && (
              <Button
                onClick={onComplete}
                disabled={updating}
                variant="destructive"
                className="rounded-xl gap-2"
              >
                <CheckCircle2 className="w-4 h-4" />
                {updating ? "Updating..." : "Mark as Completed"}
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
        <h3 className="font-semibold text-foreground">{title}</h3>
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
