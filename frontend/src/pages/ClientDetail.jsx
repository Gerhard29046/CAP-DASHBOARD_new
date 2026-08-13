import React, { useState, useEffect } from "react";
import { apiClient } from "@/api/apiClient";
import { useParams, Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft, Plus, Pencil, Trash2, Phone, Mail, MapPin,
  Building2, Cpu, Wind, Hash, ChevronRight, StickyNote
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger
} from "@/components/ui/alert-dialog";
import EmptyState from "@/components/EmptyState";
import MachineForm from "@/components/MachineForm";
import moment from "moment";

function EditClientForm({ initial, onSubmit, onCancel, loading }) {
  const [form, setForm] = useState({ ...initial });
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));
  return (
    <form onSubmit={e => { e.preventDefault(); onSubmit(form); }} className="space-y-4">
      <div>
        <Label>Company Name *</Label>
        <Input value={form.company_name || ""} onChange={e => set("company_name", e.target.value)} required className="mt-1.5 h-10" />
      </div>
      <div>
        <Label>Contact Person</Label>
        <Input value={form.contact_person || ""} onChange={e => set("contact_person", e.target.value)} className="mt-1.5 h-10" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <Label>Phone</Label>
          <Input value={form.phone || ""} onChange={e => set("phone", e.target.value)} className="mt-1.5 h-10" />
        </div>
        <div>
          <Label>Email</Label>
          <Input type="email" value={form.email || ""} onChange={e => set("email", e.target.value)} className="mt-1.5 h-10" />
        </div>
      </div>
      <div>
        <Label>Address</Label>
        <Input value={form.address || ""} onChange={e => set("address", e.target.value)} className="mt-1.5 h-10" />
      </div>
      <div>
        <Label>Notes</Label>
        <Textarea value={form.notes || ""} onChange={e => set("notes", e.target.value)} className="mt-1.5" rows={4} />
      </div>
      <div className="flex gap-2 justify-end pt-2">
        <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={loading || !form.company_name?.trim()}>
          {loading ? "Saving…" : "Save Changes"}
        </Button>
      </div>
    </form>
  );
}

function InfoRow({ icon: Icon, label, value, href }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-3 py-3 border-b border-border last:border-0">
      <Icon className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
        {href ? (
          <a href={href} className="text-sm text-primary hover:underline truncate block">{value}</a>
        ) : (
          <p className="text-sm text-foreground">{value}</p>
        )}
      </div>
    </div>
  );
}

// Reusable note-record treatment (design system pattern, shared with Machine
// Detail). Today a client only has one free-text `notes` field -- this
// component presents it as a single record so the same visual pattern can
// later host a real list of author/date-stamped notes without a redesign.
// Deliberately NOT chat-bubble styling -- author + timestamp + body, like a
// business record.
function NoteRecord({ author, date, children }) {
  return (
    <div className="py-4 border-b border-border last:border-0">
      <div className="flex items-baseline gap-2 mb-1.5">
        {author && <span className="text-sm font-medium text-foreground">{author}</span>}
        {date && <span className="text-xs text-muted-foreground">{date}</span>}
      </div>
      <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap">{children}</p>
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

  useEffect(() => {
    load();
    const unsubscribeClient = apiClient.entities.Client.watch(id, (record) => {
      if (record) setClient(record);
    });
    const unsubscribeMachines = apiClient.entities.Machine.subscribe({}, (records) => {
      setMachines(records.filter((machine) => String(machine.client_id) === String(id)));
    });
    return () => {
      unsubscribeClient();
      unsubscribeMachines();
    };
  }, [id]);

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
      <div className="max-w-5xl mx-auto space-y-4">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-32 rounded-xl" />
        <div className="grid lg:grid-cols-3 gap-4">
          <Skeleton className="h-64 rounded-xl lg:col-span-2" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      </div>
    );
  }

  if (!client) {
    return (
      <EmptyState
        icon={Building2}
        title="Client not found"
        description="This client may have been removed."
        action={<Link to="/clients"><Button variant="outline" size="sm">Back to Clients</Button></Link>}
      />
    );
  }

  return (
    <div className="max-w-5xl mx-auto">
      <Link
        to="/clients"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> Clients
      </Link>

      {/* Identity header */}
      <div className="bg-card border border-border rounded-xl p-5 sm:p-6 mb-5 animate-fade-in">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="flex items-start gap-4 min-w-0">
            <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <Building2 className="w-7 h-7 text-primary" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-heading font-bold text-foreground leading-tight truncate">
                {client.company_name}
              </h1>
              {client.contact_person && (
                <p className="text-sm text-muted-foreground mt-1">{client.contact_person}</p>
              )}
              <p className="text-xs text-muted-foreground mt-2">
                {machines.length} machine{machines.length !== 1 ? "s" : ""} on record
              </p>
            </div>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button variant="outline" size="sm" className="gap-2" onClick={() => setShowEdit(true)}>
              <Pencil className="w-3.5 h-3.5" /> Edit
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="icon" className="text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/30">
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
      </div>

      <div className="grid lg:grid-cols-3 gap-5">
        {/* Main column: machines */}
        <div className="lg:col-span-2 order-2 lg:order-1">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-heading font-semibold text-foreground">
              Machines <span className="text-muted-foreground font-normal text-sm">({machines.length})</span>
            </h2>
            <Button size="sm" className="gap-1.5" onClick={() => setShowAddMachine(true)}>
              <Plus className="w-4 h-4" /> Add Machine
            </Button>
          </div>

          {machines.length === 0 ? (
            <div className="bg-card border border-dashed border-border rounded-xl">
              <EmptyState
                icon={Cpu}
                title="No machines yet"
                description="Add a machine to start tracking its service history."
                action={
                  <Button size="sm" onClick={() => setShowAddMachine(true)}>
                    <Plus className="w-4 h-4 mr-1.5" /> Add First Machine
                  </Button>
                }
              />
            </div>
          ) : (
            <div className="bg-card border border-border rounded-xl divide-y divide-border stagger-in">
              {machines.map(m => (
                <Link
                  key={m.id}
                  to={`/machines/${m.id}`}
                  className="flex items-center gap-3 p-4 hover:bg-secondary/60 transition-colors duration-150 group"
                >
                  <div className="w-10 h-10 rounded-lg bg-warning/10 flex items-center justify-center shrink-0">
                    <Wind className="w-5 h-5 text-warning" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground truncate">{m.brand} {m.model}</p>
                    <div className="flex flex-wrap items-center gap-2 mt-1">
                      {m.machine_type && (
                        <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">{m.machine_type}</span>
                      )}
                      {m.serial_number && (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Hash className="w-3 h-3" />{m.serial_number}
                        </span>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground group-hover:translate-x-0.5 transition-all duration-150 shrink-0" />
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Sidebar: contact + notes */}
        <div className="space-y-5 order-1 lg:order-2">
          <div className="bg-card border border-border rounded-xl px-5">
            <h2 className="font-heading font-semibold text-foreground text-sm pt-4 pb-1">Contact</h2>
            <InfoRow icon={Phone} label="Phone" value={client.phone} href={client.phone ? `tel:${client.phone}` : undefined} />
            <InfoRow icon={Mail} label="Email" value={client.email} href={client.email ? `mailto:${client.email}` : undefined} />
            <InfoRow icon={MapPin} label="Address" value={client.address} />
          </div>

          <div className="bg-card border border-border rounded-xl px-5">
            <h2 className="font-heading font-semibold text-foreground text-sm pt-4 pb-1 flex items-center gap-1.5">
              <StickyNote className="w-3.5 h-3.5 text-muted-foreground" /> Notes
            </h2>
            {client.notes ? (
              <NoteRecord date={client.updated_at ? moment(client.updated_at).format("D MMM YYYY") : undefined}>
                {client.notes}
              </NoteRecord>
            ) : (
              <p className="text-sm text-muted-foreground py-4">No notes yet.</p>
            )}
          </div>
        </div>
      </div>

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
