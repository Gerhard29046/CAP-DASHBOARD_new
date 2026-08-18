import React, { useState, useEffect } from "react";
import { apiClient } from "@/api/apiClient";
import { Search, ChevronRight, ArrowLeft, Camera, X, Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { uploadRecordPhoto, deleteRecordPhoto, RECORD_PHOTO_NAMESPACES } from "@/services/supabase/storage";
import { useSignedPhotoUrls } from "@/hooks/useSignedPhotoUrls";
import { SERVICE_WORK_ITEMS, joinWorkPerformed } from "@/lib/serviceWorkItems";
import { addOneYear } from "@/lib/serviceDates";
import { reportError } from "@/lib/reportError";

const STEPS = ["Select Client", "Select Machine", "Service Details"];

export default function LogServiceModal({ onClose, onDone }) {
  const [step, setStep] = useState(0);
  const [clients, setClients] = useState([]);
  const [machines, setMachines] = useState([]);
  const [clientSearch, setClientSearch] = useState("");
  const [selectedClient, setSelectedClient] = useState(null);
  const [selectedMachine, setSelectedMachine] = useState(null);
  const todayIso = new Date().toISOString().split("T")[0];
  const [form, setForm] = useState({
    service_date: todayIso,
    technician_name: "",
    work_performed: "",
    notes: "",
    // Defaults to one year after the service date -- see
    // supabase/migrations/0031_service_records_default_next_service_due.sql, which applies
    // the same default at the database level regardless of client; this is just so the
    // technician sees it before saving. This modal only ever creates new records, so there is
    // no existing value to preserve (unlike ServiceForm.jsx's edit mode).
    next_service_due: addOneYear(todayIso),
  });
  // Tracks whether the technician manually edited Next Service Date -- once they have,
  // changing Service Date stops silently recomputing it out from under them.
  const [nextDueTouched, setNextDueTouched] = useState(false);
  // Phase 3 (permanent Storage paths, not signed URLs -- see docs/ai-memory/DECISIONS.md and
  // migration 0024_photos_bucket_record_scoped_rls.sql): `photos` holds Storage object PATHS,
  // never a URL. `recordId` is the service_records.id created as soon as a machine is picked
  // (create-then-update design), so photo uploads have a real record to scope their path
  // under. Persisted to the database immediately after each upload/removal via update() --
  // never held only in local state until final submit.
  const [recordId, setRecordId] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [saving, setSaving] = useState(false);
  // Checklist selection for "Work Performed" -- see lib/serviceWorkItems.js. This modal only
  // ever creates a brand-new record (no `initial` prop), so it always starts empty.
  const [workItems, setWorkItems] = useState({});
  const { urls: photoUrls } = useSignedPhotoUrls(photos);

  useEffect(() => {
    apiClient.entities.Client.list().then(setClients);
  }, []);

  useEffect(() => {
    if (selectedClient) {
      apiClient.entities.Machine.filter({ client_id: selectedClient.id }).then(setMachines);
    }
  }, [selectedClient]);

  const filteredClients = clients.filter(c =>
    c.company_name?.toLowerCase().includes(clientSearch.toLowerCase())
  );

  const setField = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const toggleWorkItem = (item) => {
    setWorkItems((prev) => {
      const next = { ...prev, [item]: !prev[item] };
      setField("work_performed", joinWorkPerformed(next));
      return next;
    });
  };

  // Machine selection is the earliest point machine_id is known -- create the service record
  // here (create-then-update design, per docs/ai-memory/DECISIONS.md's Phase 2 sequencing
  // resolution) so photo uploads in the next step have a real id to scope their path under.
  // Invisible to the user: no extra button, no spinner, fires exactly where they're already
  // navigating.
  const handleSelectMachine = async (m) => {
    setSelectedMachine(m);
    setStep(2);
    try {
      const created = await apiClient.entities.ServiceRecord.create({ machine_id: m.id });
      setRecordId(created.id);
    } catch (err) {
      setUploadError("Could not start this service record. Photos cannot be added right now.");
    }
  };

  const handleUploadPhoto = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!recordId) {
      setUploadError("This service record hasn't been created yet. Please try again.");
      e.target.value = "";
      return;
    }
    setUploading(true);
    setUploadError(null);
    try {
      const path = await uploadRecordPhoto(RECORD_PHOTO_NAMESPACES.serviceRecord, recordId, file);
      const next = [...photos, path];
      setPhotos(next);
      await apiClient.entities.ServiceRecord.update(recordId, { photos: next });
    } catch (err) {
      setUploadError(err?.message || "Photo upload failed. Please try again.");
    }
    setUploading(false);
    e.target.value = "";
  };

  const removePhoto = async (path) => {
    const next = photos.filter(p => p !== path);
    setPhotos(next);
    if (recordId) {
      try {
        await apiClient.entities.ServiceRecord.update(recordId, { photos: next });
      } catch (err) {
        setUploadError(err?.message || "Could not remove that photo. Please try again.");
        setPhotos(photos); // roll back local state if the database update itself failed
        return;
      }
    }
    // Best-effort Storage cleanup -- must not block/undo the database update above, which is
    // already the source of truth for what the user asked for (per the approved delete design).
    deleteRecordPhoto(path).catch(() => {});
  };

  const handleSubmit = async () => {
    if (!selectedMachine || !form.service_date || !recordId) return;
    setSaving(true);
    try {
      // Photos are already persisted incrementally (see handleUploadPhoto) -- finalize the
      // remaining fields via update(), not a second create().
      await apiClient.entities.ServiceRecord.update(recordId, { ...form });
      onDone?.();
    } catch (e) {
      reportError(e, "Couldn't save this service record. Please try again.", "Failed to save service record:");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-card w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl max-h-[90vh] flex flex-col animate-in slide-in-from-bottom">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            {step > 0 ? (
              <button onClick={() => setStep(step - 1)} className="p-1.5 rounded-lg hover:bg-secondary">
                <ArrowLeft className="w-5 h-5 text-muted-foreground" />
              </button>
            ) : (
              <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-secondary">
                <X className="w-5 h-5 text-muted-foreground" />
              </button>
            )}
            <div>
              <p className="text-xs text-muted-foreground">Step {step + 1} of 3</p>
              <p className="font-heading font-semibold text-sm">{STEPS[step]}</p>
            </div>
          </div>
        </div>

        {/* Step indicators */}
        <div className="flex gap-1 px-4 py-3 shrink-0">
          {STEPS.map((_, i) => (
            <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${i <= step ? "bg-primary" : "bg-secondary"}`} />
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4">
          {/* Step 0: Select Client */}
          {step === 0 && (
            <div className="space-y-1 pb-4">
              <div className="relative mb-3">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search clients…"
                  value={clientSearch}
                  onChange={e => setClientSearch(e.target.value)}
                  className="pl-10 h-11 rounded-xl"
                  autoFocus
                />
              </div>
              {filteredClients.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-8">No clients found</p>
              )}
              {filteredClients.map(c => (
                <button
                  key={c.id}
                  onClick={() => { setSelectedClient(c); setStep(1); }}
                  className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-secondary transition-colors text-left"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{c.company_name}</p>
                    {c.contact_person && <p className="text-xs text-muted-foreground">{c.contact_person}</p>}
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 ml-2" />
                </button>
              ))}
            </div>
          )}

          {/* Step 1: Select Machine */}
          {step === 1 && (
            <div className="space-y-1 pb-4">
              <div className="flex items-center gap-2 mb-3 px-1">
                <span className="text-sm font-medium text-primary">{selectedClient?.company_name}</span>
              </div>
              {machines.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No machines for this client</p>
              ) : (
                machines.map(m => (
                  <button
                    key={m.id}
                    onClick={() => handleSelectMachine(m)}
                    className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-secondary transition-colors text-left"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">{m.brand} {m.model}</p>
                      {m.machine_type && <p className="text-xs text-muted-foreground">{m.machine_type}{m.serial_number ? ` · ${m.serial_number}` : ""}</p>}
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 ml-2" />
                  </button>
                ))
              )}
            </div>
          )}

          {/* Step 2: Service Details */}
          {step === 2 && (
            <div className="space-y-4 pb-4">
              <div className="flex items-center gap-2 px-1">
                <span className="text-sm font-medium text-primary">{selectedClient?.company_name}</span>
                <ChevronRight className="w-3 h-3 text-muted-foreground" />
                <span className="text-sm text-foreground">{selectedMachine?.brand} {selectedMachine?.model}</span>
              </div>

              <div>
                <Label>Service Date *</Label>
                <Input
                  type="date"
                  value={form.service_date}
                  onChange={e => {
                    const value = e.target.value;
                    setForm(prev => ({
                      ...prev,
                      service_date: value,
                      next_service_due: nextDueTouched ? prev.next_service_due : addOneYear(value),
                    }));
                  }}
                  className="mt-1 h-11 rounded-xl"
                  required
                />
              </div>

              <div>
                <Label>Technician</Label>
                <Input value={form.technician_name} onChange={e => setField("technician_name", e.target.value)} placeholder="Technician name" className="mt-1 h-11 rounded-xl" />
              </div>

              <div>
                <Label>Work Performed</Label>
                <div className="mt-1.5 space-y-2">
                  {SERVICE_WORK_ITEMS.map((item) => (
                    <label
                      key={item}
                      className="flex items-center gap-2.5 border border-border rounded-xl p-2.5 hover:bg-secondary/40 transition-colors duration-150 cursor-pointer"
                    >
                      <Checkbox checked={!!workItems[item]} onCheckedChange={() => toggleWorkItem(item)} />
                      <span className="text-sm text-foreground">{item}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <Label>Recommendations</Label>
                <Textarea value={form.notes} onChange={e => setField("notes", e.target.value)} placeholder="Any recommendations for the client…" className="mt-1 rounded-xl" rows={2} />
              </div>

              <div>
                <Label>Next Service Date</Label>
                <Input
                  type="date"
                  value={form.next_service_due}
                  onChange={e => { setNextDueTouched(true); setField("next_service_due", e.target.value); }}
                  className="mt-1 h-11 rounded-xl"
                />
                <p className="text-xs text-muted-foreground mt-1">Defaults to one year after the service date.</p>
              </div>

              {/* Photos */}
              <div>
                <Label>Photos</Label>
                {uploadError && <p className="text-xs text-destructive mt-1">{uploadError}</p>}
                <div className="flex flex-wrap gap-2 mt-1">
                  {photos.map((path, i) => (
                    <div key={path + i} className="relative w-20 h-20 rounded-xl overflow-hidden bg-secondary border border-border">
                      {photoUrls[path] ? (
                        <img src={photoUrls[path]} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Camera className="w-4 h-4 text-muted-foreground animate-pulse" />
                        </div>
                      )}
                      <button onClick={() => removePhoto(path)} className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 flex items-center justify-center">
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

              {/* Submit */}
              <Button
                className="w-full h-11 rounded-xl gap-2"
                disabled={saving || !form.service_date}
                onClick={handleSubmit}
              >
                {saving ? "Saving…" : (
                  <>
                    <Check className="w-4 h-4" /> Log Service
                  </>
                )}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
