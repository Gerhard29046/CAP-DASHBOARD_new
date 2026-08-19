import React, { useState, useEffect } from "react";
import { apiClient } from "@/api/apiClient";
import { dashboardNotesClient } from "@/api/dashboardNotesClient";
import { useAuth } from "@/lib/AuthContext";
import { useParams, Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft, Plus, Pencil, Trash2, Phone, Mail, MapPin,
  Building2, Cpu, Wind, Hash, ChevronRight, StickyNote, X, Check
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
import NoteRecord from "@/components/NoteRecord";
import MachineForm from "@/components/MachineForm";
import moment from "moment";

function EditClientForm({ initial, onSubmit, onCancel, loading }) {
  // BUG FIX (2026-08-18): this used to seed state as `{ ...initial }` -- but `initial` here
  // is the client record returned by apiClient.entities.Client.get(), which (see
  // supabaseApiClient.js's clientEntity.get override) injects a synthetic `machines` array
  // (this client's joined machine list, used elsewhere on this page) that is NOT a real
  // column on public.clients (0001_initial_schema.sql: id/company_name/contact_person/
  // email/phone/address/notes/is_active/created_at/updated_at only). Every "Save Changes" on
  // Edit Client therefore sent `machines: [...]` straight through to the PUT payload --
  // PostgREST rejects an update outright on any unknown column, so editing a client's details
  // was failing in production on every save, not just a display bug. Same failure class as
  // the 2026-08-16/17 UserAdmin.jsx bugs. Fixed by seeding only real, editable columns
  // explicitly, matching every other form in this app (MachineForm/ServiceForm/AddClient).
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
        <Input value={form.company_name || ""} onChange={e => set("company_name", e.target.value)} required className="mt-1.5 h-10" />
      </div>
      <div>
        <Label>Contact Person</Label>
        <Input value={form.contact_person || ""} onChange={e => set("contact_person", e.target.value)} className="mt-1.5 h-10" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <Label>Phone</Label>
          <Input type="tel" value={form.phone || ""} onChange={e => set("phone", e.target.value)} className="mt-1.5 h-10" />
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

export default function ClientDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, hasPermission } = useAuth();
  const [client, setClient] = useState(null);
  const [machines, setMachines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showEdit, setShowEdit] = useState(false);
  const [showAddMachine, setShowAddMachine] = useState(false);
  const [saving, setSaving] = useState(false);
  // BUG FIX (2026-08-18): none of this page's save handlers previously caught a thrown
  // error -- if the write failed (e.g. a still-genuinely-invalid value slipping past
  // sanitizeForWrite()'s empty-string-to-null fix, or a real network/permission error),
  // `setSaving(false)` was skipped and the dialog stayed stuck on "Saving..." forever with
  // no message. Now caught, surfaced, and the button always un-sticks.
  const [saveError, setSaveError] = useState("");

  // Notes linked to this specific client (see StickyNotes.jsx -- the Dashboard's "Link
  // client" note flow persists client_id correctly, but nothing previously read it back
  // here, so a note created against a client never appeared on that client's own page.
  // Real bug fix, 2026-08-13: fetch + display + allow managing this client's linked notes.
  const [clientNotes, setClientNotes] = useState([]);
  const [notesLoading, setNotesLoading] = useState(true);
  const [addingNote, setAddingNote] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [savingNote, setSavingNote] = useState(false);

  const load = async () => {
    const c = await apiClient.entities.Client.get(id);
    setClient(c);
    setMachines(c.machines || []);
    setLoading(false);
  };

  const loadNotes = async () => {
    setNotesLoading(true);
    try {
      const all = await dashboardNotesClient.list();
      setClientNotes(all.filter((n) => String(n.client_id) === String(id)));
    } catch (e) {
      console.error("Failed to load client notes:", e);
    } finally {
      setNotesLoading(false);
    }
  };

  useEffect(() => {
    load();
    loadNotes();
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

  const addClientNote = async () => {
    const content = noteDraft.trim();
    if (!content) { setAddingNote(false); return; }
    setSavingNote(true);
    try {
      const created = await dashboardNotesClient.create({ content, color: "yellow", client_id: id });
      setClientNotes((prev) => [created, ...prev]);
      setNoteDraft("");
      setAddingNote(false);
    } catch (e) {
      console.error("Failed to add client note:", e);
    } finally {
      setSavingNote(false);
    }
  };

  const deleteClientNote = async (noteId) => {
    setClientNotes((prev) => prev.filter((n) => n.id !== noteId));
    try {
      await dashboardNotesClient.remove(noteId);
    } catch (e) {
      console.error("Failed to delete client note:", e);
      loadNotes();
    }
  };

  const handleEdit = async (form) => {
    setSaving(true);
    setSaveError("");
    try {
      await apiClient.entities.Client.update(id, form);
      setShowEdit(false);
      load();
    } catch (e) {
      console.error("Failed to save client:", e);
      setSaveError(e?.message || "Couldn't save changes. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    try {
      await apiClient.entities.Client.delete(id);
      navigate("/clients");
    } catch (e) {
      console.error("Failed to delete client:", e);
      setSaveError(e?.message || "Couldn't delete this client. Please try again.");
    }
  };

  const handleAddMachine = async (form) => {
    setSaving(true);
    setSaveError("");
    try {
      await apiClient.entities.Machine.create({ ...form, client_id: id });
      setShowAddMachine(false);
      load();
    } catch (e) {
      console.error("Failed to add machine:", e);
      setSaveError(e?.message || "Couldn't save this machine. Please try again.");
    } finally {
      setSaving(false);
    }
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
          {/* NEW (2026-08-17): these buttons rendered unconditionally before, regardless of
              clients.edit/clients.delete -- RLS (clients_update/clients_delete,
              0002_rls_policies.sql) already blocked the actual write server-side, so this was
              never a security hole, but a technician without either permission would see a
              button that silently fails (or shows a raw RLS error) when clicked. Gated to match
              the real server-side authorization, same has_permission() keys. */}
          <div className="flex gap-2 shrink-0">
            {hasPermission("clients.edit") && (
              <Button variant="outline" size="sm" className="gap-2" onClick={() => setShowEdit(true)}>
                <Pencil className="w-3.5 h-3.5" /> Edit
              </Button>
            )}
            {hasPermission("clients.delete") && (
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
                      This will permanently delete <strong>{client.company_name}</strong> and all {machines.length} of its
                      machine{machines.length !== 1 ? "s" : ""}, along with their service history. This cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
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

          {/* Team notes linked to this client (from Dashboard "Link client" notes) */}
          <div className="bg-card border border-border rounded-xl px-5">
            <div className="flex items-center justify-between pt-4 pb-1">
              <h2 className="font-heading font-semibold text-foreground text-sm flex items-center gap-1.5">
                <StickyNote className="w-3.5 h-3.5 text-muted-foreground" /> Team Notes
              </h2>
              {!addingNote && (
                <button
                  onClick={() => setAddingNote(true)}
                  className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                >
                  <Plus className="w-3.5 h-3.5" /> Add
                </button>
              )}
            </div>

            {addingNote && (
              <div className="py-3 border-b border-border space-y-2">
                <Textarea
                  autoFocus
                  value={noteDraft}
                  onChange={(e) => setNoteDraft(e.target.value)}
                  placeholder={`Add a note about ${client.company_name}…`}
                  rows={3}
                  className="text-sm"
                />
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="ghost" size="sm" onClick={() => { setAddingNote(false); setNoteDraft(""); }}>
                    <X className="w-3.5 h-3.5 mr-1" /> Cancel
                  </Button>
                  <Button type="button" size="sm" disabled={savingNote || !noteDraft.trim()} onClick={addClientNote}>
                    <Check className="w-3.5 h-3.5 mr-1" /> {savingNote ? "Saving…" : "Save Note"}
                  </Button>
                </div>
              </div>
            )}

            {notesLoading ? (
              <p className="text-sm text-muted-foreground py-4">Loading notes…</p>
            ) : clientNotes.length === 0 && !addingNote ? (
              <p className="text-sm text-muted-foreground py-4">
                No team notes linked to this client yet.
              </p>
            ) : (
              <div>
                {clientNotes.map((note) => (
                  <div key={note.id} className="group relative">
                    <NoteRecord
                      author={note.created_by_name || "Someone"}
                      date={note.created_at ? moment(note.created_at).format("D MMM YYYY") : undefined}
                    >
                      {note.content}
                    </NoteRecord>
                    {(user?.id === note.created_by || user?.role === "admin") && (
                      <button
                        onClick={() => deleteClientNote(note.id)}
                        aria-label="Delete note"
                        className="absolute top-3 right-0 w-5 h-5 rounded-full flex items-center justify-center text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive transition-opacity duration-150"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Edit dialog */}
      <Dialog open={showEdit} onOpenChange={(open) => { setShowEdit(open); if (open) setSaveError(""); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Edit Client</DialogTitle></DialogHeader>
          {saveError && (
            <p className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">{saveError}</p>
          )}
          <EditClientForm initial={client} onSubmit={handleEdit} onCancel={() => setShowEdit(false)} loading={saving} />
        </DialogContent>
      </Dialog>

      {/* Add Machine dialog */}
      <Dialog open={showAddMachine} onOpenChange={(open) => { setShowAddMachine(open); if (open) setSaveError(""); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Add Machine</DialogTitle></DialogHeader>
          {saveError && (
            <p className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">{saveError}</p>
          )}
          <MachineForm onSubmit={handleAddMachine} onCancel={() => setShowAddMachine(false)} loading={saving} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
