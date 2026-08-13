import React, { useEffect, useState } from "react";
import { apiClient } from "@/api/apiClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, X } from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const STATUSES = [
  "Open", "Booked In", "In Progress", "Waiting for Parts",
  "Ready for Collection", "Completed", "Collected",
];

// Small reusable editable-list control for available_statuses/line_types -- add/remove
// only (no reordering/renaming complexity), matching "don't invent a huge ERP system."
function TagListEditor({ label, help, values, onChange }) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const trimmed = draft.trim();
    if (!trimmed || values.includes(trimmed)) { setDraft(""); return; }
    onChange([...values, trimmed]);
    setDraft("");
  };
  const remove = (value) => {
    if (values.length <= 1) return; // never allow an empty list
    onChange(values.filter((v) => v !== value));
  };
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <div className="flex flex-wrap gap-1.5 mt-1.5">
        {values.map((v) => (
          <span key={v} className="inline-flex items-center gap-1 text-xs font-medium bg-secondary text-foreground px-2 py-1 rounded-full">
            {v}
            <button type="button" onClick={() => remove(v)} className="hover:text-destructive transition-colors" aria-label={`Remove ${v}`}>
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2 mt-2 max-w-xs">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          placeholder="Add new…"
          className="h-9 rounded-lg text-sm"
        />
        <Button type="button" size="sm" variant="outline" onClick={add} disabled={!draft.trim()}>
          <Plus className="w-3.5 h-3.5" />
        </Button>
      </div>
      {help && <p className="text-xs text-muted-foreground mt-1.5">{help}</p>}
    </div>
  );
}

// Real, wired settings only (public.job_card_settings, singleton row) -- every field here
// is actually read by BookIn.jsx (numbering_prefix, default_status) and
// JobCardDetail.jsx (allow_products/allow_services/default_line_quantity/
// available_statuses/line_types). No UI-only/decorative toggles.
export default function JobCardSettingsPanel() {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      setSettings(await apiClient.entities.JobCardSettings.get());
    } catch (e) {
      console.error("Failed to load Job Card settings:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const set = (key, value) => setSettings((prev) => ({ ...prev, [key]: value }));

  // available_statuses/line_types only exist once migration 0021 is applied -- guard so
  // this page still works against the 0018-only shape and doesn't send an unknown column.
  const hasExtendedColumns = settings && Object.prototype.hasOwnProperty.call(settings, "available_statuses");

  const save = async () => {
    setSaving(true);
    try {
      const payload = {
        numbering_prefix: settings.numbering_prefix || "JOB-",
        default_status: settings.default_status,
        default_line_quantity: Number(settings.default_line_quantity) || 1,
        allow_products: settings.allow_products,
        allow_services: settings.allow_services,
      };
      if (hasExtendedColumns) {
        payload.available_statuses = settings.available_statuses;
        payload.line_types = settings.line_types;
      }
      const updated = await apiClient.entities.JobCardSettings.update(payload);
      setSettings(updated);
      setSavedAt(Date.now());
    } catch (e) {
      console.error("Failed to save Job Card settings:", e);
      alert("Could not save Job Card settings.");
    } finally {
      setSaving(false);
    }
  };

  if (loading || !settings) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 rounded-lg" />
        <Skeleton className="h-10 rounded-lg" />
        <Skeleton className="h-10 rounded-lg" />
      </div>
    );
  }

  const statusOptions = settings.available_statuses || STATUSES;

  return (
    <div className="max-w-lg space-y-6">
      <div>
        <h2 className="font-heading font-semibold text-foreground">Job Cards</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Configuration that affects how new Job Cards are created and worked.
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <Label className="text-xs">Job Number Prefix</Label>
          <Input
            value={settings.numbering_prefix || ""}
            onChange={(e) => set("numbering_prefix", e.target.value)}
            className="mt-1.5 h-10 rounded-lg text-sm max-w-[200px]"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Used when generating a new job number on Book In (e.g. "{settings.numbering_prefix || "JOB-"}123456").
          </p>
        </div>

        <div>
          <Label className="text-xs">Default Status for New Job Cards</Label>
          <Select value={settings.default_status} onValueChange={(v) => set("default_status", v)}>
            <SelectTrigger className="mt-1.5 h-10 rounded-lg text-sm max-w-[220px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {statusOptions.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label className="text-xs">Default Quantity for New Line Items</Label>
          <Input
            type="number"
            min="1"
            value={settings.default_line_quantity}
            onChange={(e) => set("default_line_quantity", e.target.value)}
            className="mt-1.5 h-10 rounded-lg text-sm max-w-[120px]"
          />
        </div>

        <div className="flex items-center justify-between border border-border rounded-xl px-4 py-3">
          <div>
            <p className="text-sm font-medium text-foreground">Allow Products on Job Cards</p>
            <p className="text-xs text-muted-foreground">Technicians can select catalogue products when adding a line.</p>
          </div>
          <Switch checked={settings.allow_products} onCheckedChange={(v) => set("allow_products", v)} />
        </div>

        <div className="flex items-center justify-between border border-border rounded-xl px-4 py-3">
          <div>
            <p className="text-sm font-medium text-foreground">Allow Services on Job Cards</p>
            <p className="text-xs text-muted-foreground">Technicians can select catalogue services when adding a line.</p>
          </div>
          <Switch checked={settings.allow_services} onCheckedChange={(v) => set("allow_services", v)} />
        </div>

        {hasExtendedColumns ? (
          <>
            <TagListEditor
              label="Job Statuses"
              help="Shown as the status options on every Job Card. At least one is required."
              values={settings.available_statuses}
              onChange={(v) => set("available_statuses", v)}
            />
            <TagListEditor
              label="Service / Line Item Types"
              help="Shown as the 'Type' options when adding a line item to a Job Card."
              values={settings.line_types}
              onChange={(v) => set("line_types", v)}
            />
          </>
        ) : (
          <p className="text-xs text-muted-foreground border border-dashed border-border rounded-lg px-3 py-2.5">
            Job Statuses and Service Types become editable here once migration 0021 is applied.
          </p>
        )}
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save Changes"}</Button>
        {savedAt && !saving && <span className="text-xs text-muted-foreground">Saved</span>}
      </div>
    </div>
  );
}
