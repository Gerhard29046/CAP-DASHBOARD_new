import React, { useState, useEffect } from "react";
import { apiClient } from "@/api/apiClient";
import { useParams, Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft, Plus, Pencil, Trash2, Phone, Mail, MapPin,
  Building2, FileText, Cpu, Wind, Hash, ChevronRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger
} from "@/components/ui/alert-dialog";
import MachineForm from "@/components/MachineForm";

function EditClientForm({ initial, onSubmit, onCancel, loading }) {
  const [form, setForm] = useState({ ...initial });
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));
  return (
    <form onSubmit={e => { e.preventDefault(); onSubmit(form); }} className="space-y-4">
      <div>
        <Label>Company Name *</Label>
        <Input value={form.company_name || ""} onChange={e => set("company_name", e.target.value)} required className="mt-1 h-11 rounded-xl" />
      </div>
      <div>
        <Label>Contact Person</Label>
        <Input value={form.contact_person || ""} onChange={e => set("contact_person", e.target.value)} className="mt-1 h-11 rounded-xl" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <Label>Phone</Label>
          <Input value={form.phone || ""} onChange={e => set("phone", e.target.value)} className="mt-1 h-11 rounded-xl" />
        </div>
        <div>
          <Label>Email</Label>
          <Input type="email" value={form.email || ""} onChange={e => set("email", e.target.value)} className="mt-1 h-11 rounded-xl" />
        </div>
      </div>
      <div>
        <Label>Address</Label>
        <Input value={form.address || ""} onChange={e => set("address", e.target.value)} className="mt-1 h-11 rounded-xl" />
      </div>
      <div>
        <Label>Notes</Label>
        <Textarea value={form.notes || ""} onChange={e => set("notes", e.target.value)} className="mt-1 rounded-xl" rows={3} />
      </div>
      <div className="flex gap-2 justify-end pt-1">
        <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={loading || !form.company_name?.trim()}>
          {loading ? "Saving…" : "Save Changes"}
        </Button>
      </div>
    </form>
  );
}

function StatPill({ icon: Icon, value, label, color }) {
  return (
    <div className={`flex-1 flex flex-col items-center justify-center gap-1 py-4 rounded-2xl border ${color}`}>
      <Icon className="w-5 h-5 opacity-80" />
      <span className="text-2xl font-bold font-heading leading-none">{value}</span>
      <span className="text-xs font-medium opacity-70">{label}</span>
    </div>
  );
}

function InfoRow({ icon: Icon, label, value, href }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-3 py-3 border-b border-border last:border-0">
      <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center shrink-0 mt-0.5">
        <Icon className="w-4 h-4 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-muted-foreground font-medium mb-0.5">{label}</p>
        {href ? (
          <a href={href} className="text-sm text-primary hover:underline truncate block">{value}</a>
        ) : (
          <p className="text-sm text-foreground">{value}</p>
        )}
      </div>
    </div>
  );
}

export default function ClientDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [client, setClient] = useState(null);
  const [machines, setMachines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showEdit, setShowEdit] = useState(false);
  const [showAddMachine, setShowAddMachine] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = async () => {
  const c = await apiClient.entities.Client.get(id);

  setClient(c);
  setMachines(c.machines || []);
  setLoading(false);
};

  useEffect(() => { load(); }, [id]);

  const handleEdit = async (form) => {
    setSaving(true);
    await apiClient.entities.Client.update(id, form);
    setSaving(false);
    setShowEdit(false);
    load();
  };

  const handleDelete = async () => {
    await apiClient.entities.Client.delete(id);
    navigate("/clients");
  };

  const handleAddMachine = async (form) => {
    setSaving(true);
    await apiClient.entities.Machine.create({ ...form, client_id: id });
    setSaving(false);
    setShowAddMachine(false);
    load();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="w-8 h-8 border-4 border-secondary border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!client) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Building2 className="w-12 h-12 text-muted-foreground mb-3" />
        <p className="font-medium text-foreground mb-1">Client not found</p>
        <Link to="/clients"><Button variant="ghost" size="sm">Back to Clients</Button></Link>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto">
      <Link
        to="/clients"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-5 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> Clients
      </Link>

      {/* Hero card */}
      <div className="bg-card border border-border rounded-2xl p-5 mb-4">
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-2xl bg-primary/15 flex items-center justify-center shrink-0">
            <Building2 className="w-7 h-7 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-heading font-bold text-foreground leading-tight">{client.company_name}</h1>
            {client.contact_person && (
              <p className="text-sm text-muted-foreground mt-0.5">{client.contact_person}</p>
            )}
          </div>
        </div>
        <div className="flex gap-2 mt-4">
          <Button variant="outline" className="flex-1 h-10 rounded-xl gap-2 text-sm" onClick={() => setShowEdit(true)}>
            <Pencil className="w-4 h-4" /> Edit Client
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" className="h-10 w-10 rounded-xl text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/30" size="icon">
                <Trash2 className="w-4 h-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Client?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete <strong>{client.company_name}</strong> and all its machines.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {/* Stats */}
      <div className="flex gap-3 mb-4">
        <StatPill icon={Cpu} value={machines.length} label={machines.length === 1 ? "Machine" : "Machines"} color="bg-amber-500/10 border-amber-500/20 text-amber-400" />
      </div>

      {/* Contact info */}
      <div className="bg-card border border-border rounded-2xl px-5 mb-4">
        <InfoRow icon={Phone} label="Phone" value={client.phone} href={`tel:${client.phone}`} />
        <InfoRow icon={Mail} label="Email" value={client.email} href={`mailto:${client.email}`} />
        <InfoRow icon={MapPin} label="Address" value={client.address} />
        <InfoRow icon={FileText} label="Notes" value={client.notes} />
      </div>

      {/* Machines section */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-heading font-semibold text-foreground">
          Machines <span className="text-muted-foreground font-normal text-sm">({machines.length})</span>
        </h2>
        <Button size="sm" className="rounded-xl h-9 gap-1.5" onClick={() => setShowAddMachine(true)}>
          <Plus className="w-4 h-4" /> Add Machine
        </Button>
      </div>

      {machines.length === 0 ? (
        <div className="bg-card border border-dashed border-border rounded-2xl py-10 flex flex-col items-center text-center">
          <Cpu className="w-8 h-8 text-muted-foreground mb-2" />
          <p className="text-sm font-medium text-foreground mb-1">No machines yet</p>
          <p className="text-xs text-muted-foreground mb-4">Add a machine to start tracking service records</p>
          <Button size="sm" className="rounded-xl" onClick={() => setShowAddMachine(true)}>
            <Plus className="w-4 h-4 mr-1" /> Add First Machine
          </Button>
        </div>
      ) : (
        <div className="space-y-2 pb-6">
          {machines.map(m => (
            <Link
              key={m.id}
              to={`/machines/${m.id}`}
              className="flex items-center gap-3 bg-card border border-border rounded-2xl p-4 hover:border-primary/50 hover:shadow-md hover:shadow-primary/5 transition-all group"
            >
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center shrink-0">
                <Wind className="w-5 h-5 text-amber-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-foreground truncate">{m.brand} {m.model}</p>
                <div className="flex flex-wrap items-center gap-2 mt-0.5">
                  {m.machine_type && <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">{m.machine_type}</span>}
                  {m.serial_number && <span className="flex items-center gap-1 text-xs text-muted-foreground"><Hash className="w-3 h-3" />{m.serial_number}</span>}
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
            </Link>
          ))}
        </div>
      )}

      {/* Edit dialog */}
      <Dialog open={showEdit} onOpenChange={setShowEdit}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Edit Client</DialogTitle></DialogHeader>
          <EditClientForm initial={client} onSubmit={handleEdit} onCancel={() => setShowEdit(false)} loading={saving} />
        </DialogContent>
      </Dialog>

      {/* Add Machine dialog */}
      <Dialog open={showAddMachine} onOpenChange={setShowAddMachine}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Add Machine</DialogTitle></DialogHeader>
          <MachineForm onSubmit={handleAddMachine} onCancel={() => setShowAddMachine(false)} loading={saving} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
