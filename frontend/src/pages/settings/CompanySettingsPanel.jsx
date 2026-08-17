import React, { useEffect, useState } from "react";
import { apiClient } from "@/api/apiClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";

// Real, wired settings only (public.company_settings, singleton row -- see
// supabase/migrations/0030_service_certificates.sql). Every field here is actually read by
// the Service Certificate PDF (frontend/src/lib/serviceCertificatePdf.js) -- company_name is
// seeded with a real value already used elsewhere in the app (Login.jsx's own branding
// text); address/phone/email/vat_number stay blank until filled in here, since inventing
// fake values for a document a client receives is not acceptable. The certificate simply
// omits any field left blank rather than printing a placeholder.
export default function CompanySettingsPanel() {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      setSettings(await apiClient.entities.CompanySettings.get());
    } catch (e) {
      console.error("Failed to load company settings:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const set = (key, value) => setSettings((prev) => ({ ...prev, [key]: value }));

  const save = async () => {
    setSaving(true);
    try {
      const updated = await apiClient.entities.CompanySettings.update({
        company_name: settings.company_name || "",
        address: settings.address || null,
        phone: settings.phone || null,
        email: settings.email || null,
        vat_number: settings.vat_number || null,
      });
      setSettings(updated);
      setSavedAt(Date.now());
    } catch (e) {
      console.error("Failed to save company settings:", e);
      alert("Could not save company settings.");
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

  return (
    <div className="max-w-lg space-y-6">
      <div>
        <h2 className="font-heading font-semibold text-foreground">Company Details</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Shown in the header of every generated Service Certificate. Leave a field blank to
          omit it from the certificate entirely.
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <Label className="text-xs">Company Name</Label>
          <Input
            value={settings.company_name || ""}
            onChange={(e) => set("company_name", e.target.value)}
            className="mt-1.5 h-10 rounded-lg text-sm"
          />
        </div>
        <div>
          <Label className="text-xs">Address</Label>
          <Textarea
            value={settings.address || ""}
            onChange={(e) => set("address", e.target.value)}
            rows={2}
            className="mt-1.5 rounded-lg text-sm"
          />
        </div>
        <div>
          <Label className="text-xs">Phone</Label>
          <Input
            value={settings.phone || ""}
            onChange={(e) => set("phone", e.target.value)}
            className="mt-1.5 h-10 rounded-lg text-sm max-w-[220px]"
          />
        </div>
        <div>
          <Label className="text-xs">Email</Label>
          <Input
            type="email"
            value={settings.email || ""}
            onChange={(e) => set("email", e.target.value)}
            className="mt-1.5 h-10 rounded-lg text-sm max-w-[280px]"
          />
        </div>
        <div>
          <Label className="text-xs">VAT / Tax Number</Label>
          <Input
            value={settings.vat_number || ""}
            onChange={(e) => set("vat_number", e.target.value)}
            className="mt-1.5 h-10 rounded-lg text-sm max-w-[220px]"
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save Changes"}</Button>
        {savedAt && !saving && <span className="text-xs text-muted-foreground">Saved</span>}
      </div>
    </div>
  );
}
