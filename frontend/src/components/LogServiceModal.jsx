import React, { useState, useEffect } from "react";
import { apiClient } from "@/api/apiClient";
import { Search, ChevronRight, ChevronLeft, ArrowLeft, Camera, X, Image, Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

const STEPS = ["Select Client", "Select Machine", "Service Details"];

export default function LogServiceModal({ onClose, onDone }) {
  const [step, setStep] = useState(0);
  const [clients, setClients] = useState([]);
  const [machines, setMachines] = useState([]);
  const [clientSearch, setClientSearch] = useState("");
  const [selectedClient, setSelectedClient] = useState(null);
  const [selectedMachine, setSelectedMachine] = useState(null);
  const [form, setForm] = useState({
    service_date: new Date().toISOString().split("T")[0],
    technician: "",
    service_notes: "",
    recommendations: "",
    next_service_date: "",
  });
  const [photos, setPhotos] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

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

  const handleUploadPhoto = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const { file_url } = await apiClient.integrations.Core.UploadFile({ file });
      setPhotos(prev => [...prev, file_url]);
    } catch (err) { /* silently fail */ }
    setUploading(false);
    e.target.value = "";
  };

  const removePhoto = (url) => {
    setPhotos(prev => prev.filter(p => p !== url));
  };

  const handleSubmit = async () => {
    if (!selectedMachine || !form.service_date) return;
    setSaving(true);
    await apiClient.entities.ServiceRecord.create({
      machine_id: selectedMachine.id,
      ...form,
      photos,
    });
    setSaving(false);
    onDone?.();
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
                    onClick={() => { setSelectedMachine(m); setStep(2); }}
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
                <Input type="date" value={form.service_date} onChange={e => setField("service_date", e.target.value)} className="mt-1 h-11 rounded-xl" required />
              </div>

              <div>
                <Label>Technician</Label>
                <Input value={form.technician} onChange={e => setField("technician", e.target.value)} placeholder="Technician name" className="mt-1 h-11 rounded-xl" />
              </div>

              <div>
                <Label>Service Notes</Label>
                <Textarea value={form.service_notes} onChange={e => setField("service_notes", e.target.value)} placeholder="Describe the work performed…" className="mt-1 rounded-xl" rows={3} />
              </div>

              <div>
                <Label>Recommendations</Label>
                <Textarea value={form.recommendations} onChange={e => setField("recommendations", e.target.value)} placeholder="Any recommendations for the client…" className="mt-1 rounded-xl" rows={2} />
              </div>

              <div>
                <Label>Next Service Date</Label>
                <Input type="date" value={form.next_service_date} onChange={e => setField("next_service_date", e.target.value)} className="mt-1 h-11 rounded-xl" />
              </div>

              {/* Photos */}
              <div>
                <Label>Photos</Label>
                <div className="flex flex-wrap gap-2 mt-1">
                  {photos.map((url, i) => (
                    <div key={i} className="relative w-20 h-20 rounded-xl overflow-hidden bg-secondary border border-border">
                      <img src={url} alt="" className="w-full h-full object-cover" />
                      <button onClick={() => removePhoto(url)} className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 flex items-center justify-center">
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