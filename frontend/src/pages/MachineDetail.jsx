import React, { useState, useEffect } from "react";
import { apiClient } from "@/api/apiClient";
import { useParams, Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft, Plus, Pencil, Trash2, Cpu, Calendar, Shield,
  Hash, Droplets, ChevronRight, AlertTriangle, Clock, Wrench, User2,
  ClipboardList, StickyNote
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import RecordPhotoGallery from "@/components/RecordPhotoGallery";
import ServiceForm from "@/components/ServiceForm";
import moment from "moment";

function InfoRow({ icon: Icon, label, value, highlight }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-3 py-3 border-b border-border last:border-0">
      <Icon className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
        <p className={`text-sm ${highlight ? "text-success font-medium" : "text-foreground"}`}>{value}</p>
      </div>
    </div>
  );
}

export default function MachineDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [machine, setMachine] = useState(null);
  const [client, setClient] = useState(null);
  const [services, setServices] = useState([]);
  const [jobCards, setJobCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showEdit, setShowEdit] = useState(false);
  const [showAddService, setShowAddService] = useState(false);
  const [editService, setEditService] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const m = await apiClient.entities.Machine.get(id);
    setMachine(m);
    const [c, svc, jcs] = await Promise.all([
      apiClient.entities.Client.get(m.client_id),
      apiClient.entities.ServiceRecord.filter({ machine_id: id }),
      apiClient.entities.JobCard.filter({ machine_id: id }),
    ]);
    setClient(c);
    svc.sort((a, b) => (b.service_date || "").localeCompare(a.service_date || ""));
    setServices(svc);
    jcs.sort((a, b) => (b.date_received || "").localeCompare(a.date_received || ""));
    setJobCards(jcs);
    setLoading(false);
  };

  useEffect(() => { load(); }, [id]);

  useEffect(() => apiClient.entities.Machine.watch(id, (record) => {
    if (record) setMachine(record);
  }), [id]);

  const handleEdit = async (form) => {
    setSaving(true);
    await apiClient.entities.Machine.update(id, form);
    setSaving(false);
    setShowEdit(false);
    load();
  };

  const handleDelete = async () => {
    await apiClient.entities.Machine.delete(id);
    navigate(`/clients/${machine.client_id}`);
  };

  const handleAddService = async (form) => {
    setSaving(true);
    await apiClient.entities.ServiceRecord.create({ ...form, machine_id: id });
    setSaving(false);
    setShowAddService(false);
    load();
  };

  const handleEditService = async (form) => {
    setSaving(true);
    await apiClient.entities.ServiceRecord.update(editService.id, { ...form, machine_id: String(id) });
    setSaving(false);
    setEditService(null);
    load();
  };

  const handleDeleteService = async (svcId) => {
    await apiClient.entities.ServiceRecord.delete(svcId);
    load();
  };

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto space-y-4">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-32 rounded-xl" />
        <div className="grid lg:grid-cols-3 gap-4">
          <Skeleton className="h-80 rounded-xl lg:col-span-2" />
          <Skeleton className="h-80 rounded-xl" />
        </div>
      </div>
    );
  }

  if (!machine) {
    return (
      <EmptyState
        icon={Cpu}
        title="Machine not found"
        description="This piece of equipment may have been removed."
        action={<Link to="/clients"><Button variant="outline" size="sm">Back to Clients</Button></Link>}
      />
    );
  }

  const warrantyActive = machine.warranty_expiry && moment(machine.warranty_expiry).isAfter(moment());
  const warrantyExpiring = warrantyActive && moment(machine.warranty_expiry).diff(moment(), "days") <= 30;

  return (
    <div className="max-w-5xl mx-auto">
      <Link
        to={`/clients/${machine.client_id}`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        {client?.company_name || "Client"}
      </Link>

      {/* Asset identity header */}
      <div className="bg-card border border-border rounded-xl p-5 sm:p-6 mb-5 animate-fade-in">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="flex items-start gap-4 min-w-0">
            <div className="w-14 h-14 rounded-xl bg-warning/10 flex items-center justify-center shrink-0">
              <Cpu className="w-7 h-7 text-warning" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-heading font-bold text-foreground leading-tight truncate">
                {machine.brand} {machine.model}
              </h1>
              <div className="flex flex-wrap items-center gap-2 mt-2">
                {machine.machine_type && <Badge variant="secondary">{machine.machine_type}</Badge>}
                {warrantyActive && (
                  <Badge variant={warrantyExpiring ? "warning" : "success"} className="gap-1">
                    <Shield className="w-3 h-3" />
                    {warrantyExpiring ? "Warranty expiring soon" : "Under warranty"}
                  </Badge>
                )}
              </div>
              {client && (
                <Link to={`/clients/${client.id}`} className="text-xs text-muted-foreground hover:text-primary mt-2 inline-block transition-colors">
                  {client.company_name}
                </Link>
              )}
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
                  <AlertDialogTitle>Delete Machine?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete <strong>{machine.brand} {machine.model}</strong> and all its service records.
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
        {/* Main column: job cards + service history */}
        <div className="lg:col-span-2 order-2 lg:order-1 space-y-6">
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-heading font-semibold text-foreground">
                Job Cards <span className="text-muted-foreground font-normal text-sm">({jobCards.length})</span>
              </h2>
              <Button size="sm" className="gap-1.5 bg-warning hover:bg-warning/90 text-warning-foreground" onClick={() => navigate(`/book-in?machine_id=${id}`)}>
                <ClipboardList className="w-4 h-4" /> Book In
              </Button>
            </div>
            {jobCards.length === 0 ? (
              <div className="bg-card border border-dashed border-border rounded-xl">
                <EmptyState
                  icon={ClipboardList}
                  title="No job cards yet"
                  description="Book in this machine to create a job card."
                  action={
                    <Button size="sm" onClick={() => navigate(`/book-in?machine_id=${id}`)}>
                      <Plus className="w-4 h-4 mr-1.5" /> Book In Machine
                    </Button>
                  }
                />
              </div>
            ) : (
              <div className="bg-card border border-border rounded-xl divide-y divide-border">
                {jobCards.map(jc => (
                  <Link key={jc.id} to={`/job-cards/${jc.id}`} className="flex items-center gap-3 p-4 hover:bg-secondary/60 transition-colors duration-150 group">
                    <div className="w-10 h-10 rounded-lg bg-warning/10 flex items-center justify-center shrink-0">
                      <ClipboardList className="w-5 h-5 text-warning" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-foreground text-sm">{jc.job_number || `#${jc.id.slice(-6).toUpperCase()}`}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{moment(jc.date_received).format("DD MMM YYYY")} &middot; {jc.status}</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground group-hover:translate-x-0.5 transition-all duration-150 shrink-0" />
                  </Link>
                ))}
              </div>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-heading font-semibold text-foreground">
                Service History <span className="text-muted-foreground font-normal text-sm">({services.length})</span>
              </h2>
              <Button size="sm" className="gap-1.5" onClick={() => setShowAddService(true)}>
                <Plus className="w-4 h-4" /> Add Service
              </Button>
            </div>
            {services.length === 0 ? (
              <div className="bg-card border border-dashed border-border rounded-xl">
                <EmptyState
                  icon={Wrench}
                  title="No service records"
                  description="Log the first service performed on this machine."
                  action={
                    <Button size="sm" onClick={() => setShowAddService(true)}>
                      <Plus className="w-4 h-4 mr-1.5" /> Add First Service
                    </Button>
                  }
                />
              </div>
            ) : (
              <div className="space-y-3">
                {services.map(s => (
                  <div key={s.id} className="bg-card border border-border rounded-xl p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                          <Calendar className="w-4 h-4 text-primary" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-foreground">{moment(s.service_date).format("MMM D, YYYY")}</p>
                          {s.technician_name && (
                            <div className="flex items-center gap-1 mt-0.5">
                              <User2 className="w-3 h-3 text-muted-foreground" />
                              <p className="text-xs text-muted-foreground">{s.technician_name}</p>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <Button variant="ghost" size="icon" onClick={() => setEditService(s)} className="h-8 w-8 text-muted-foreground hover:text-foreground">
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive">
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete Service Record?</AlertDialogTitle>
                              <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleDeleteService(s.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                    {s.work_performed && <p className="text-sm text-foreground mb-2">{s.work_performed}</p>}
                    {s.notes && (
                      <div className="flex items-start gap-1.5 mb-2">
                        <AlertTriangle className="w-3.5 h-3.5 text-warning shrink-0 mt-0.5" />
                        <p className="text-xs text-muted-foreground italic">{s.notes}</p>
                      </div>
                    )}
                    <RecordPhotoGallery photos={s.photos} containerClassName="flex gap-2 overflow-x-auto pb-1 mb-1" />
                    {s.next_service_due && (
                      <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-border">
                        <Clock className="w-3.5 h-3.5 text-primary" />
                        <p className="text-xs text-primary font-medium">
                          Next service: {moment(s.next_service_due).format("MMM D, YYYY")}
                        </p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Sidebar: specifications + notes -- asset profile info */}
        <div className="space-y-5 order-1 lg:order-2">
          <div className="bg-card border border-border rounded-xl px-5">
            <h2 className="font-heading font-semibold text-foreground text-sm pt-4 pb-1">Specifications</h2>
            <InfoRow icon={Hash} label="Serial Number" value={machine.serial_number} />
            <InfoRow icon={Droplets} label="Refrigerant Type" value={machine.refrigerant_type} />
            <InfoRow icon={Calendar} label="Installation Date" value={machine.installation_date ? moment(machine.installation_date).format("MMM D, YYYY") : null} />
            <InfoRow icon={Shield} label="Warranty Expiry" value={machine.warranty_expiry ? moment(machine.warranty_expiry).format("MMM D, YYYY") : null} highlight={warrantyActive} />
          </div>

          <div className="bg-card border border-border rounded-xl px-5">
            <h2 className="font-heading font-semibold text-foreground text-sm pt-4 pb-1 flex items-center gap-1.5">
              <StickyNote className="w-3.5 h-3.5 text-muted-foreground" /> Notes
            </h2>
            {machine.notes ? (
              <NoteRecord>{machine.notes}</NoteRecord>
            ) : (
              <p className="text-sm text-muted-foreground py-4">No notes yet.</p>
            )}
          </div>
        </div>
      </div>

      <Dialog open={showEdit} onOpenChange={setShowEdit}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Edit Machine</DialogTitle></DialogHeader>
          <MachineForm initial={machine} onSubmit={handleEdit} onCancel={() => setShowEdit(false)} loading={saving} />
        </DialogContent>
      </Dialog>

      <Dialog open={showAddService} onOpenChange={setShowAddService}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Add Service Record</DialogTitle></DialogHeader>
          <ServiceForm onSubmit={handleAddService} onCancel={() => setShowAddService(false)} loading={saving} />
        </DialogContent>
      </Dialog>

      <Dialog open={!!editService} onOpenChange={v => { if (!v) setEditService(null); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Edit Service Record</DialogTitle></DialogHeader>
          {editService && <ServiceForm initial={editService} onSubmit={handleEditService} onCancel={() => setEditService(null)} loading={saving} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
