import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export default function ServiceForm({ initial, onSubmit, onCancel, loading }) {
  const [form, setForm] = useState({
    service_date: initial?.service_date || new Date().toISOString().split("T")[0],
    technician: initial?.technician || "",
    service_notes: initial?.service_notes || "",
    recommendations: initial?.recommendations || "",
    next_service_date: initial?.next_service_date || "",
  });
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  return (
    <form onSubmit={e => { e.preventDefault(); onSubmit(form); }} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <Label>Service Date *</Label>
          <Input type="date" value={form.service_date} onChange={e => set("service_date", e.target.value)} required className="mt-1" />
        </div>
        <div>
          <Label>Technician</Label>
          <Input value={form.technician} onChange={e => set("technician", e.target.value)} className="mt-1" />
        </div>
      </div>
      <div>
        <Label>Service Notes</Label>
        <Textarea value={form.service_notes} onChange={e => set("service_notes", e.target.value)} className="mt-1" rows={3} />
      </div>
      <div>
        <Label>Recommendations</Label>
        <Textarea value={form.recommendations} onChange={e => set("recommendations", e.target.value)} className="mt-1" rows={2} />
      </div>
      <div>
        <Label>Next Service Date</Label>
        <Input type="date" value={form.next_service_date} onChange={e => set("next_service_date", e.target.value)} className="mt-1" />
      </div>
      <div className="flex gap-2 justify-end pt-2">
        {onCancel && <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>}
        <Button type="submit" disabled={loading || !form.service_date}>
          {loading ? "Saving…" : "Save Service Record"}
        </Button>
      </div>
    </form>
  );
}