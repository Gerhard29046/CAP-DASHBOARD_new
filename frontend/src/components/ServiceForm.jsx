import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export default function ServiceForm({ initial, onSubmit, onCancel, loading }) {
  const [form, setForm] = useState({
    service_date: initial?.service_date || new Date().toISOString().split("T")[0],
    technician_name: initial?.technician_name || "",
    work_performed: initial?.work_performed || "",
    findings: initial?.findings || "",
    notes: initial?.notes || "",
    next_service_due: initial?.next_service_due || "",
  });

  const set = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(form);
      }}
      className="space-y-4"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <Label>Service Date *</Label>
          <Input
            type="date"
            value={form.service_date}
            onChange={(e) => set("service_date", e.target.value)}
            required
            className="mt-1"
          />
        </div>

        <div>
          <Label>Technician</Label>
          <Input
            value={form.technician_name}
            onChange={(e) => set("technician_name", e.target.value)}
            className="mt-1"
            placeholder="Technician name"
          />
        </div>
      </div>

      <div>
        <Label>Work Performed</Label>
        <Textarea
          value={form.work_performed}
          onChange={(e) => set("work_performed", e.target.value)}
          className="mt-1"
          rows={3}
          placeholder="Describe the service work completed..."
        />
      </div>

      <div>
        <Label>Findings</Label>
        <Textarea
          value={form.findings}
          onChange={(e) => set("findings", e.target.value)}
          className="mt-1"
          rows={2}
          placeholder="Any issues found during the service..."
        />
      </div>

      <div>
        <Label>Recommendations</Label>
        <Textarea
          value={form.notes}
          onChange={(e) => set("notes", e.target.value)}
          className="mt-1"
          rows={2}
          placeholder="Recommended repairs, parts, or follow-up actions..."
        />
      </div>

      <div>
        <Label>Next Service Date</Label>
        <Input
          type="date"
          value={form.next_service_due}
          onChange={(e) => set("next_service_due", e.target.value)}
          className="mt-1"
        />
      </div>

      <div className="flex gap-2 justify-end pt-2">
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}

        <Button type="submit" disabled={loading || !form.service_date}>
          {loading ? "Saving…" : "Save Service Record"}
        </Button>
      </div>
    </form>
  );
}
