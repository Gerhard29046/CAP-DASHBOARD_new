import React, { useState, useEffect } from "react";
import { apiClient } from "@/api/apiClient";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { ArrowLeft, Camera, X, Search, ChevronRight, History, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import moment from "moment";
import { uploadRecordPhoto, deleteRecordPhoto, RECORD_PHOTO_NAMESPACES } from "@/services/supabase/storage";
import { useSignedPhotoUrls } from "@/hooks/useSignedPhotoUrls";


const CONDITIONS = ["Good", "Fair", "Poor", "Damaged"];

export default function BookIn() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const presetMachineId = searchParams.get("machine_id");

  const [machine, setMachine] = useState(null);
  const [client, setClient] = useState(null);
  const [selectedMachineId, setSelectedMachineId] = useState(presetMachineId || "");

  const [clients, setClients] = useState([]);
  const [clientMachines, setClientMachines] = useState([]);
  const [selectedClient, setSelectedClient] = useState(null);
  const [clientSearch, setClientSearch] = useState("");

  const [form, setForm] = useState({
    date_booked_in: new Date().toISOString().split("T")[0],
    machine_type: "",
    problem_description: "",
    accessories_received: "",
    condition_on_arrival: "",
    condition_notes: "",
    technician: "",
    job_number: `JOB-${Date.now().toString().slice(-6)}`,
  });
  // Phase 3 (permanent Storage paths, not signed URLs -- see docs/ai-memory/DECISIONS.md and
  // migration 0024_photos_bucket_record_scoped_rls.sql): `photos` holds Storage object PATHS,
  // never a URL. `jobCardId` is the job_cards.id created as soon as client+machine are both
  // known (create-then-update design), so photo uploads have a real record to scope their
  // path under. Persisted immediately after each upload/removal via update().
  const [jobCardId, setJobCardId] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [previousJobs, setPreviousJobs] = useState([]);
  const [jobCardSettings, setJobCardSettings] = useState(null);
  const { urls: photoUrls } = useSignedPhotoUrls(photos);

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  // Fires exactly once, the moment both client and machine are known -- covers both entry
  // paths (the presetMachineId query-param resolution and the client/machine picker flow),
  // guarded by `!jobCardId` so it can't double-create on a re-render. Invisible to the user:
  // no extra button, no spinner.
  useEffect(() => {
    if (selectedMachineId && client?.id && !jobCardId) {
      apiClient.entities.JobCard.create({ client_id: String(client.id), machine_id: String(selectedMachineId) })
        .then((created) => setJobCardId(created.id))
        .catch(() => setUploadError("Could not start this job card. Photos cannot be added right now."));
    }
  }, [selectedMachineId, client, jobCardId]);

  // Job Card numbering prefix (Settings > Job Cards) -- real effect, not a placeholder.
  useEffect(() => {
    apiClient.entities.JobCardSettings.get()
      .then((settings) => {
        setJobCardSettings(settings);
        const prefix = settings?.numbering_prefix || "JOB-";
        setForm((prev) => ({ ...prev, job_number: `${prefix}${Date.now().toString().slice(-6)}` }));
      })
      .catch((e) => console.error("Failed to load Job Card settings:", e));
  }, []);

  useEffect(() => {
    if (presetMachineId) {
      apiClient.entities.Machine.get(presetMachineId).then(async (m) => {
        setMachine(m);
        setSelectedMachineId(m.id);
        if (m.client_id) {
          const c = await apiClient.entities.Client.get(m.client_id);
          setClient(c);
        }
        const jobs = await apiClient.entities.JobCard.filter({ machine_id: m.id }, "-date_received");
        setPreviousJobs(jobs);
      });
    } else {
      apiClient.entities.Client.list().then(setClients);
    }
  }, [presetMachineId]);

  const handleSelectClient = async (c) => {
    setSelectedClient(c);
    setClient(c);
    const machines = await apiClient.entities.Machine.filter({ client_id: c.id });
    setClientMachines(machines);
  };

  const handleSelectMachine = async (m) => {
    setMachine(m);
    setSelectedMachineId(m.id);
    const jobs = await apiClient.entities.JobCard.filter({ machine_id: m.id }, "-date_received");
    setPreviousJobs(jobs);
  };

  const filteredClients = clients.filter(c =>
    c.company_name?.toLowerCase().includes(clientSearch.toLowerCase())
  );

  const handleUploadPhoto = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!jobCardId) {
      setUploadError("This job card hasn't been created yet. Please try again.");
      e.target.value = "";
      return;
    }
    setUploading(true);
    setUploadError(null);
    try {
      const path = await uploadRecordPhoto(RECORD_PHOTO_NAMESPACES.jobCard, jobCardId, file);
      const next = [...photos, path];
      setPhotos(next);
      await apiClient.entities.JobCard.update(jobCardId, { arrival_photos: next });
    } catch (err) {
      setUploadError(err?.message || "Photo upload failed. Please try again.");
    }
    setUploading(false);
    e.target.value = "";
  };

  const removePhoto = async (path) => {
    const next = photos.filter(p => p !== path);
    setPhotos(next);
    if (jobCardId) {
      try {
        await apiClient.entities.JobCard.update(jobCardId, { arrival_photos: next });
      } catch (err) {
        setUploadError(err?.message || "Could not remove that photo. Please try again.");
        setPhotos(photos); // roll back local state if the database update itself failed
        return;
      }
    }
    // Best-effort Storage cleanup -- must not block/undo the database update above.
    deleteRecordPhoto(path).catch(() => {});
  };

 const handleSubmit = async (e) => {
  e.preventDefault();

  if (!selectedMachineId || !client?.id || !jobCardId) {
    alert("Please select a client and machine first.");
    return;
  }

  setSaving(true);

  try {
   // Photos are already persisted incrementally (see handleUploadPhoto) -- finalize the
   // remaining fields via update(), not a second create().
   const card = await apiClient.entities.JobCard.update(jobCardId, {
  job_number: form.job_number,
  status: jobCardSettings?.default_status || "Booked In",
  date_received: form.date_booked_in,

  fault_description: form.problem_description,
  technician_name: form.technician,
  // BUG FIX (2026-08-13): the "Machine Type" input has always existed on this form and
  // InvoiceQueue.jsx has always displayed it, but job_cards had no such column and this
  // payload never included it -- every job card silently discarded whatever was typed
  // here. See supabase/migrations/0022_job_cards_machine_type.sql.
  machine_type: form.machine_type,

  accessories_received: form.accessories_received,
  arrival_condition: form.condition_on_arrival,
  arrival_condition_notes: form.condition_notes,
});
    navigate(`/job-cards/${card.id}`);
  } catch (error) {
    console.error("Book-in failed:", error);
    alert("Book-in failed. Check the console for details.");
  } finally {
    setSaving(false);
  }
};

  // Selection flow when no machine preset
  if (!selectedMachineId && !presetMachineId) {
    if (!selectedClient) {
      return (
        <div className="max-w-lg mx-auto">
          <div className="mb-5">
            <h1 className="text-2xl font-heading font-bold text-foreground">Book In Machine</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Select a client first</p>
          </div>
          <div className="relative mb-3">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search clients…" value={clientSearch} onChange={e => setClientSearch(e.target.value)} className="pl-10 h-11 rounded-xl" autoFocus />
          </div>
          <div className="space-y-1">
            {filteredClients.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">No clients found</p>}
            {filteredClients.map(c => (
              <button key={c.id} onClick={() => handleSelectClient(c)} className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-secondary transition-colors text-left">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{c.company_name}</p>
                  {c.contact_person && <p className="text-xs text-muted-foreground">{c.contact_person}</p>}
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 ml-2" />
              </button>
            ))}
          </div>
        </div>
      );
    }

    return (
      <div className="max-w-lg mx-auto">
        <button onClick={() => { setSelectedClient(null); setClient(null); setClientMachines([]); }} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-5 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to Clients
        </button>
        <div className="mb-5">
          <h1 className="text-2xl font-heading font-bold text-foreground">Book In Machine</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{selectedClient.company_name} — Select a machine</p>
        </div>
        <div className="space-y-1">
          {clientMachines.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">No machines for this client</p>}
          {clientMachines.map(m => (
            <button key={m.id} onClick={() => handleSelectMachine(m)} className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-secondary transition-colors text-left">
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">{m.brand} {m.model}</p>
                {m.serial_number && <p className="text-xs text-muted-foreground">{m.serial_number}</p>}
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 ml-2" />
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto">
      <button
        onClick={() => {
          if (!presetMachineId) { setMachine(null); setSelectedMachineId(""); }
          else navigate(-1);
        }}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-5 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> Back
      </button>

      <div className="mb-5">
        <h1 className="text-2xl font-heading font-bold text-foreground">Book In Machine</h1>
        {machine && (
          <p className="text-sm text-muted-foreground mt-0.5">
            {machine.brand} {machine.model}{client ? ` · ${client.company_name}` : ""}
          </p>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
          <h2 className="font-heading font-semibold text-sm text-foreground">Job Information</h2>
          {/* REAL FIX (Phase 9 continuation, 2026-08-13): bare grid-cols-2 gave Job Number
              (free-text, can be a longer alphanumeric code) ~160px on a 375px phone --
              cramped, and inconsistent with every other 2-field form row in the app
              (AddClient/ClientForm/MachineForm/ServiceForm all stack on mobile via
              grid-cols-1 sm:grid-cols-2). Date Booked In is a native date input, unaffected
              either way. */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label>Job Number</Label>
              <Input value={form.job_number} onChange={e => set("job_number", e.target.value)} className="mt-1 h-11 rounded-xl" />
            </div>
            <div>
              <Label>Date Booked In *</Label>
              <Input type="date" value={form.date_booked_in} onChange={e => set("date_booked_in", e.target.value)} required className="mt-1 h-11 rounded-xl" />
            </div>
          </div>
          <div>
            <Label>Technician</Label>
            <Input value={form.technician} onChange={e => set("technician", e.target.value)} placeholder="Assigned technician" className="mt-1 h-11 rounded-xl" />
          </div>
          <div>
            <Label>Machine Type</Label>
            <Input value={form.machine_type} onChange={e => set("machine_type", e.target.value)} placeholder="e.g. Wigam, Ecotechnics, Texa…" className="mt-1 h-11 rounded-xl" />
          </div>
        </div>

        <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
          <h2 className="font-heading font-semibold text-sm text-foreground">Problem Report</h2>
          <div>
            <Label>Problem Description *</Label>
            <Textarea value={form.problem_description} onChange={e => set("problem_description", e.target.value)} placeholder="Describe the fault or reason for booking in…" className="mt-1 rounded-xl" rows={4} required />
          </div>
          <div>
            <Label>Accessories / Items Received With Machine</Label>
            <Textarea value={form.accessories_received} onChange={e => set("accessories_received", e.target.value)} placeholder="e.g. Remote control, power cable, manual…" className="mt-1 rounded-xl" rows={2} />
          </div>
        </div>

        <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
          <h2 className="font-heading font-semibold text-sm text-foreground">Machine Condition on Arrival</h2>
          <div>
            <Label>Condition</Label>
            <Select value={form.condition_on_arrival} onValueChange={v => set("condition_on_arrival", v)}>
              <SelectTrigger className="mt-1 h-11 rounded-xl"><SelectValue placeholder="Select condition" /></SelectTrigger>
              <SelectContent>
                {CONDITIONS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Condition Notes</Label>
            <Textarea value={form.condition_notes} onChange={e => set("condition_notes", e.target.value)} placeholder="Any visible damage or notes…" className="mt-1 rounded-xl" rows={2} />
          </div>
          <div>
            <Label>Arrival Photos</Label>
            {uploadError && <p className="text-xs text-destructive mt-1">{uploadError}</p>}
            <div className="flex flex-wrap gap-2 mt-2">
              {photos.map((path, i) => (
                <div key={path + i} className="relative w-20 h-20 rounded-xl overflow-hidden bg-secondary border border-border">
                  {photoUrls[path] ? (
                    <img src={photoUrls[path]} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Camera className="w-4 h-4 text-muted-foreground animate-pulse" />
                    </div>
                  )}
                  <button type="button" onClick={() => removePhoto(path)} className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 flex items-center justify-center">
                    <X className="w-3 h-3 text-white" />
                  </button>
                </div>
              ))}
              <label className="w-20 h-20 rounded-xl border-2 border-dashed border-border flex flex-col items-center justify-center gap-1 cursor-pointer hover:border-primary/50 hover:bg-secondary/50 transition-colors">
                <Camera className="w-5 h-5 text-muted-foreground" />
                <span className="text-[10px] text-muted-foreground">{uploading ? "Uploading…" : "Add Photo"}</span>
                <input type="file" accept="image/*" onChange={handleUploadPhoto} className="hidden" disabled={uploading} />
              </label>
            </div>
          </div>
        </div>

        <Button type="submit" disabled={saving || !form.date_booked_in || !form.problem_description} className="w-full h-12 rounded-xl">
          {saving ? "Booking In…" : "Create Job Card"}
        </Button>
      </form>

      {/* Previous Jobs */}
      <div className="mt-6 bg-card border border-border rounded-2xl p-5">
        <h2 className="font-heading font-semibold text-sm text-foreground flex items-center gap-2 mb-4">
          <History className="w-4 h-4 text-primary" /> Previous Jobs for This Machine
        </h2>
        {previousJobs.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No previous job cards found</p>
        ) : (
          <div className="space-y-2">
            {previousJobs.map(job => (
              <Link key={job.id} to={`/job-cards/${job.id}`} className="flex items-center justify-between p-3 rounded-xl bg-secondary/50 hover:bg-secondary transition-colors group">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="text-sm font-medium text-foreground">{job.job_number || `#${job.id.slice(-6).toUpperCase()}`}</p>
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                      job.status === "Open" ? "bg-blue-500/15 text-blue-400" :
                      job.status === "In Progress" ? "bg-amber-500/15 text-amber-400" :
                      job.status === "Completed" ? "bg-emerald-500/15 text-emerald-400" :
                      "bg-secondary text-muted-foreground"
                    }`}>{job.status}</span>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    <Clock className="w-3 h-3 inline mr-1" />
                    {moment(job.date_received).format("DD MMM YYYY")}
                    {job.technician_name ? ` · ${job.technician_name}` : ""}
                    {job.fault_description ? ` · ${job.fault_description.slice(0, 50)}${job.fault_description.length > 50 ? "…" : ""}` : ""}
                  </p>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground shrink-0 ml-2" />
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
