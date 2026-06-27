import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export default function ClientForm({ initial, onSubmit, onCancel, loading }) {
  const [form, setForm] = useState({
    company_name: initial?.company_name || "",
    contact_person: initial?.contact_person || "",
    phone: initial?.phone || "",
    email: initial?.email || "",
    address: initial?.address || "",
    notes: initial?.notes || "",
  });

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  return (
    <form onSubmit={e => { e.preventDefault(); onSubmit(form); }} className="space-y-4">
      <div>
        <Label>Company Name *</Label>
        <Input value={form.company_name} onChange={e => set("company_name", e.target.value)} required className="mt-1" />
      </div>
      <div>
        <Label>Contact Person</Label>
        <Input value={form.contact_person} onChange={e => set("contact_person", e.target.value)} className="mt-1" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <Label>Phone</Label>
          <Input value={form.phone} onChange={e => set("phone", e.target.value)} className="mt-1" />
        </div>
        <div>
          <Label>Email</Label>
          <Input type="email" value={form.email} onChange={e => set("email", e.target.value)} className="mt-1" />
        </div>
      </div>
      <div>
        <Label>Address</Label>
        <Input value={form.address} onChange={e => set("address", e.target.value)} className="mt-1" />
      </div>
      <div>
        <Label>Notes</Label>
        <Textarea value={form.notes} onChange={e => set("notes", e.target.value)} className="mt-1" rows={3} />
      </div>
      <div className="flex gap-2 justify-end pt-2">
        {onCancel && <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>}
        <Button type="submit" disabled={loading || !form.company_name.trim()}>
          {loading ? "Saving…" : "Save Client"}
        </Button>
      </div>
    </form>
  );
}