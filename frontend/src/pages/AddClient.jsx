import React, { useState } from "react";
import { apiClient } from "@/api/apiClient";
import { useNavigate, Link } from "react-router-dom";
import { ArrowLeft, Building2, User2, Phone, Mail, MapPin, FileText, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

function FieldGroup({ icon: Icon, label, required, children }) {
  return (
    <div className="space-y-1.5">
      <Label className="flex items-center gap-1.5 text-sm font-medium text-foreground/80">
        {Icon && <Icon className="w-3.5 h-3.5 text-muted-foreground" />}
        {label}
        {required && <span className="text-primary ml-0.5">*</span>}
      </Label>
      {children}
    </div>
  );
}

export default function AddClient() {
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    company_name: "",
    contact_person: "",
    phone: "",
    email: "",
    address: "",
    notes: "",
  });

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const valid = form.company_name.trim().length > 0;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!valid) return;
    setSaving(true);
    setError("");

    try {
      const created = await apiClient.entities.Client.create(form);
      navigate(`/clients/${created.id}`);
    } catch (submitError) {
      const message = submitError instanceof Error
        ? submitError.message
        : "Unable to create the client.";
      console.error("Client creation failed:", submitError);
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-lg mx-auto">
      {/* Back nav */}
      <Link
        to="/clients"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-5 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Clients
      </Link>

      {/* Page title */}
      <div className="mb-6">
        <h1 className="text-2xl font-heading font-bold text-foreground">Add Client</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Fill in the client details below</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Company info section */}
        <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Company Info</p>

          <FieldGroup icon={Building2} label="Company Name" required>
            <Input
              value={form.company_name}
              onChange={e => set("company_name", e.target.value)}
              placeholder="e.g. Acme Corporation"
              className="h-11 rounded-xl"
              autoFocus
              required
            />
          </FieldGroup>

          <FieldGroup icon={MapPin} label="Address">
            <Input
              value={form.address}
              onChange={e => set("address", e.target.value)}
              placeholder="Street, City, Country"
              className="h-11 rounded-xl"
            />
          </FieldGroup>
        </div>

        {/* Contact section */}
        <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Contact Details</p>

          <FieldGroup icon={User2} label="Contact Person">
            <Input
              value={form.contact_person}
              onChange={e => set("contact_person", e.target.value)}
              placeholder="Full name"
              className="h-11 rounded-xl"
            />
          </FieldGroup>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FieldGroup icon={Phone} label="Phone">
              <Input
                value={form.phone}
                onChange={e => set("phone", e.target.value)}
                placeholder="+1 555 000 0000"
                type="tel"
                className="h-11 rounded-xl"
              />
            </FieldGroup>

            <FieldGroup icon={Mail} label="Email">
              <Input
                value={form.email}
                onChange={e => set("email", e.target.value)}
                placeholder="email@company.com"
                type="email"
                className="h-11 rounded-xl"
              />
            </FieldGroup>
          </div>
        </div>

        {/* Notes section */}
        <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Additional Info</p>

          <FieldGroup icon={FileText} label="Notes">
            <Textarea
              value={form.notes}
              onChange={e => set("notes", e.target.value)}
              placeholder="Any additional notes about this client…"
              className="rounded-xl resize-none"
              rows={3}
            />
          </FieldGroup>
        </div>

        {/* Actions */}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="flex gap-3 pt-1 pb-6">
          <Button
            type="button"
            variant="outline"
            className="flex-1 h-12 rounded-xl"
            onClick={() => navigate("/clients")}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            className="flex-1 h-12 rounded-xl gap-2"
            disabled={!valid || saving}
          >
            {saving ? (
              <div className="w-4 h-4 border-2 border-primary-foreground/40 border-t-primary-foreground rounded-full animate-spin" />
            ) : (
              <Check className="w-4 h-4" />
            )}
            {saving ? "Saving…" : "Save Client"}
          </Button>
        </div>
      </form>
    </div>
  );
}
