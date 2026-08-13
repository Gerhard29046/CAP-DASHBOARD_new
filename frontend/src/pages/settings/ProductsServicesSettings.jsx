import React, { useEffect, useState } from "react";
import { apiClient } from "@/api/apiClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Pencil, Archive, ArchiveRestore, Package, Wrench } from "lucide-react";

const blank = {
  type: "product",
  name: "",
  description: "",
  sku: "",
  category: "",
  unit_price: "",
  vat_rate: "0.15",
  is_active: true,
};

// Manages the real products_services catalogue (see
// supabase/migrations/0018_products_services_and_job_card_settings.sql). This is the
// catalogue Job Card line items are added from (JobCardDetail.jsx's AddLineForm) -- there
// is deliberately no separate "Invoice Items" table, since invoice line items are just
// job_card_lines, which are already independent, point-in-time copies of whatever a
// catalogue item's price/description were when the line was added (see the migration's
// header comment) -- editing or archiving a catalogue item here never rewrites history.
export default function ProductsServicesSettings() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(blank);
  const [saving, setSaving] = useState(false);
  const [showInactive, setShowInactive] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const rows = await apiClient.entities.ProductService.list("name");
      setItems(rows || []);
    } catch (e) {
      console.error("Failed to load products/services catalogue:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const startCreate = () => { setForm(blank); setEditingId(null); setShowForm(true); };
  const startEdit = (item) => {
    setForm({
      type: item.type,
      name: item.name || "",
      description: item.description || "",
      sku: item.sku || "",
      category: item.category || "",
      unit_price: String(item.unit_price ?? ""),
      vat_rate: String(item.vat_rate ?? "0.15"),
      is_active: item.is_active,
    });
    setEditingId(item.id);
    setShowForm(true);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    const payload = {
      type: form.type,
      name: form.name.trim(),
      description: form.description.trim() || null,
      sku: form.sku.trim() || null,
      category: form.category.trim() || null,
      unit_price: Number(form.unit_price) || 0,
      vat_rate: Number(form.vat_rate),
      is_active: form.is_active,
    };
    try {
      if (editingId) await apiClient.entities.ProductService.update(editingId, payload);
      else await apiClient.entities.ProductService.create(payload);
      setShowForm(false);
      await load();
    } catch (err) {
      console.error("Failed to save catalogue item:", err);
      alert("Could not save this item.");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (item) => {
    try {
      await apiClient.entities.ProductService.update(item.id, { is_active: !item.is_active });
      await load();
    } catch (e) {
      console.error("Failed to toggle catalogue item:", e);
    }
  };

  const visible = items.filter((i) => showInactive || i.is_active);

  if (loading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-10 rounded-lg" />
        <Skeleton className="h-40 rounded-lg" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div>
          <h2 className="font-heading font-semibold text-foreground">Products & Services</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            The catalogue used when adding line items to Job Cards / invoices.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowInactive((p) => !p)}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {showInactive ? "Hide inactive" : "Show inactive"}
          </button>
          <Button size="sm" className="gap-1.5" onClick={startCreate}>
            <Plus className="w-4 h-4" /> New Item
          </Button>
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="text-sm text-muted-foreground py-6 text-center border border-dashed border-border rounded-xl">
          No catalogue items yet. Add products or services technicians can select when logging work.
        </p>
      ) : (
        <div className="bg-card border border-border rounded-xl divide-y divide-border">
          {visible.map((item) => (
            <div key={item.id} className="flex items-center gap-3 p-3.5">
              <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center shrink-0">
                {item.type === "service" ? <Wrench className="w-4 h-4 text-primary" /> : <Package className="w-4 h-4 text-primary" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-medium text-foreground truncate">{item.name}</p>
                  {!item.is_active && <Badge variant="neutral">Inactive</Badge>}
                  {item.category && <span className="text-[11px] text-muted-foreground">{item.category}</span>}
                </div>
                <p className="text-xs text-muted-foreground truncate">
                  {item.sku ? `${item.sku} · ` : ""}R{Number(item.unit_price).toFixed(2)}
                  {item.description ? ` · ${item.description}` : ""}
                </p>
              </div>
              <button
                className="p-1.5 text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => startEdit(item)}
                aria-label="Edit"
              >
                <Pencil className="w-4 h-4" />
              </button>
              <button
                className="p-1.5 text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => toggleActive(item)}
                aria-label={item.is_active ? "Archive" : "Restore"}
                title={item.is_active ? "Mark inactive (hidden from new job cards, keeps history)" : "Mark active"}
              >
                {item.is_active ? <Archive className="w-4 h-4" /> : <ArchiveRestore className="w-4 h-4" />}
              </button>
            </div>
          ))}
        </div>
      )}

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Item" : "New Product / Service"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Type</Label>
                <Select value={form.type} onValueChange={(v) => set("type", v)}>
                  <SelectTrigger className="mt-1 h-10 rounded-lg text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="product">Product</SelectItem>
                    <SelectItem value="service">Service</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">SKU / Code</Label>
                <Input value={form.sku} onChange={(e) => set("sku", e.target.value)} className="mt-1 h-10 rounded-lg text-sm" />
              </div>
            </div>
            <div>
              <Label className="text-xs">Name *</Label>
              <Input value={form.name} onChange={(e) => set("name", e.target.value)} required className="mt-1 h-10 rounded-lg text-sm" />
            </div>
            <div>
              <Label className="text-xs">Description</Label>
              <Textarea value={form.description} onChange={(e) => set("description", e.target.value)} rows={2} className="mt-1 text-sm" />
            </div>
            {/* REAL FIX (2026-08-13 responsive audit): 3 equal columns inside a max-w-md
                dialog left each field ~110px wide on a 375px phone -- cramped for a
                Select+Input. Stacks on mobile, 3-across from sm: up. */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <Label className="text-xs">Category</Label>
                <Input value={form.category} onChange={(e) => set("category", e.target.value)} className="mt-1 h-10 rounded-lg text-sm" />
              </div>
              <div>
                <Label className="text-xs">Unit Price (R)</Label>
                <Input type="number" step="0.01" value={form.unit_price} onChange={(e) => set("unit_price", e.target.value)} className="mt-1 h-10 rounded-lg text-sm" />
              </div>
              <div>
                <Label className="text-xs">VAT Rate</Label>
                <Select value={form.vat_rate} onValueChange={(v) => set("vat_rate", v)}>
                  <SelectTrigger className="mt-1 h-10 rounded-lg text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0.15">15%</SelectItem>
                    <SelectItem value="0">0% (Zero-rated)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input type="checkbox" checked={form.is_active} onChange={(e) => set("is_active", e.target.checked)} className="rounded border-border" />
              Active (selectable on new Job Cards)
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button type="submit" disabled={saving || !form.name.trim()}>{saving ? "Saving…" : "Save"}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
