import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const REFRIGERANTS = ["R-134a", "R-1234yf"];

export default function MachineForm({ initial, onSubmit, onCancel, loading }) {
  const [form, setForm] = useState({
    brand: initial?.brand || "",
    model: initial?.model || "",
    serial_number: initial?.serial_number || "",
    refrigerant_type: initial?.refrigerant_type || "",
    installation_date: initial?.installation_date || "",
    warranty_expiry: initial?.warranty_expiry || "",
    notes: initial?.notes || "",
  });
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  return (
    <form onSubmit={e => { e.preventDefault(); onSubmit(form); }} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <Label>Brand *</Label>
          <Input value={form.brand} onChange={e => set("brand", e.target.value)} required className="mt-1 h-11 rounded-xl" />
        </div>
        <div>
          <Label>Model *</Label>
          <Input value={form.model} onChange={e => set("model", e.target.value)} required className="mt-1 h-11 rounded-xl" />
        </div>
      </div>
      <div>
        <Label>Serial Number</Label>
        <Input value={form.serial_number} onChange={e => set("serial_number", e.target.value)} className="mt-1 h-11 rounded-xl" />
      </div>
      <div>
        <Label>Refrigerant Type</Label>
        <Select value={form.refrigerant_type} onValueChange={v => set("refrigerant_type", v)}>
          <SelectTrigger className="mt-1 h-11 rounded-xl"><SelectValue placeholder="Select refrigerant" /></SelectTrigger>
          <SelectContent>
            {REFRIGERANTS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <Label>Installation Date</Label>
          <Input type="date" value={form.installation_date} onChange={e => set("installation_date", e.target.value)} className="mt-1 h-11 rounded-xl" />
        </div>
        <div>
          <Label>Warranty Expiry</Label>
          <Input type="date" value={form.warranty_expiry} onChange={e => set("warranty_expiry", e.target.value)} className="mt-1 h-11 rounded-xl" />
        </div>
      </div>
      <div>
        <Label>Notes</Label>
        <Textarea value={form.notes} onChange={e => set("notes", e.target.value)} className="mt-1 rounded-xl" rows={3} />
      </div>
      <div className="flex gap-2 justify-end pt-2">
        {onCancel && <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>}
        <Button type="submit" disabled={loading || !form.brand.trim() || !form.model.trim()}>
          {loading ? "Saving…" : "Save Machine"}
        </Button>
      </div>
    </form>
  );
}