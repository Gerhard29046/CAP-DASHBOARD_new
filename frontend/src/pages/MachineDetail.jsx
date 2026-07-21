import React, { useState, useEffect } from "react";
import { apiClient } from "@/api/apiClient";
import { useParams, Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft, Plus, Pencil, Trash2, Cpu, Calendar, Shield,
  Hash, Droplets, ClipboardCheck, AlertTriangle, Clock, Wrench, User2,
  ClipboardList, ChevronRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger
} from "@/components/ui/alert-dialog";
import MachineForm from "@/components/MachineForm";
import ServiceForm from "@/components/ServiceForm";
import moment from "moment";

function InfoRow({ icon: Icon, label, value, highlight }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-3 py-3 border-b border-border last:border-0">
      <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center shrink-0 mt-0.5">
        <Icon className="w-4 h-4 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-muted-foreground font-medium mb-0.5">{label}</p>
        <p className={`text-sm ${highlight ? "text-emerald-400 font-medium" : "text-foreground"}`}>{value}</p>
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

  await apiClient.entities.ServiceRecord.update(editService.id, {
    ...form,
    machine_id: String(id),
  });

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
      <div className="flex items-center justify-center py-32">
        <div className="w-8 h-8 border-4 border-secondary border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!machine) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Cpu className="w-12 h-12 text-muted-foreground mb-3" />
        <p className="font-medium text-foreground mb-1">Machine not found</p>
        <Link to="/clients"><Button variant="ghost" size="sm">Back to Clients</Button></Link>
      </div>
    );
  }

  const warrantyActive = machine.warranty_expiry && moment(machine.warranty_expiry).isAfter(moment());
  const warrantyExpiring = warrantyActive && moment(machine.warranty_expiry).diff(moment(), "days") <= 30;

  return (
    <div className="max-w-lg mx-auto">
      {/* Breadcrumb */}
      <Link
        to={`/clients/${machine.client_id}`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-5 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        {client?.company_name || "Client"}
      </Link>

      {/* Hero card */}
      <div className="bg-card border border-border rounded-2xl p-5 mb-4">
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-2xl bg-amber-500/15 flex items-center justify-center shrink-0">
            <Cpu className="w-7 h-7 text-amber-400" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-heading font-bold text-foreground leading-tight">
              {machine.brand} {machine.model}
            </h1>
            {machine.machine_type && (
              <span className="inline-block text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full mt-1">{machine.machine_type}</span>
            )}
            {client && <p className="text-xs text-muted-foreground mt-1.5">{client.company_name}</p>}
          </div>
          {warrantyActive && (
            <span className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-full shrink-0 ${warrantyExpiring ? "bg-amber-500/15 text-amber-400" : "bg-emerald-500/15 text-emerald-400"}`}>
              <Shield className="w-3.5 h-3.5" />
              {warrantyExpiring ? "Expiring Soon" : "Under Warranty"}
            </span>
          )}
        </div>

        <div className="flex gap-2 mt-4">
          <Button variant="outline" className="flex-1 h-10 rounded-xl gap-2 text-sm" onClick={() => setShowEdit(true)}>
            <Pencil className="w-4 h-4" /> Edit Machine
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" className="h-10 w-10 rounded-xl text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/30" size="icon">
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

      {/* Specifications */}
      <div className="bg-card border border-border rounded-2xl px-5 mb-4">
        <div className="flex items-center gap-2 py-3">
          <ClipboardCheck className="w-4 h-4 text-primary" />
          <h2 className="font-heading font-semibold text-sm text-foreground">Specifications</h2>
        </div>
        <InfoRow icon={Hash} label="Serial Number" value={machine.serial_number} />
        <InfoRow icon={Droplets} label="Refrigerant Type" value={machine.refrigerant_type} />
        <InfoRow icon={Calendar} label="Installation Date" value={machine.installation_date ? moment(machine.installation_date).format("MMM D, YYYY") : null} />
        <InfoRow icon={Shield} label="Warranty Expiry" value={machine.warranty_expiry ? moment(machine.warranty_expiry).format("MMM D, YYYY") : null} highlight={warrantyActive} />
        {machine.notes && (
          <div className="flex items-start gap-3 py-3 border-t border-border">
            <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center shrink-0 mt-0.5">
              <ClipboardCheck className="w-4 h-4 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground font-medium mb-0.5">Notes</p>
              <p className="text-sm text-foreground">{machine.notes}</p>
            </div>
          </div>
        )}
      </div>

      {/* Job Cards */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-heading font-semibold text-foreground">
          Job Cards <span className="text-muted-foreground font-normal text-sm">({jobCards.length})</span>
        </h2>
        <Button size="sm" className="rounded-xl h-9 gap-1.5 bg-amber-500 hover:bg-amber-600 text-white border-0" onClick={() => navigate(`/book-in?machine_id=${id}`)}>
          <ClipboardList className="w-4 h-4" /> Book In
        </Button>
      </div>

      {jobCards.length === 0 ? (
        <div className="bg-card border border-dashed border-border rounded-2xl py-8 flex flex-col items-center text-center mb-4">
          <ClipboardList className="w-8 h-8 text-muted-foreground mb-2" />
          <p className="text-sm font-medium text-foreground mb-1">No job cards yet</p>
          <p className="text-xs text-muted-foreground mb-4">Book in a machine to create a job card</p>
          <Button size="sm" className="rounded-xl" onClick={() => navigate(`/book-in?machine_id=${id}`)}>
            <Plus className="w-4 h-4 mr-1" /> Book In Machine
          </Button>
        </div>
      ) : (
        <div className="space-y-2 mb-4">
          {jobCards.map(jc => (
            <Link key={jc.id} to={`/job-cards/${jc.id}`} className="flex items-center gap-3 bg-card border border-border rounded-2xl p-4 hover:border-primary/50 transition-all group">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center shrink-0">
                <ClipboardList className="w-5 h-5 text-amber-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-foreground text-sm">{jc.job_number || `#${jc.id.slice(-6).toUpperCase()}`}</p>
                <p className="text-xs text-muted-foreground">{moment(jc.date_received).format("DD MMM YYYY")} · {jc.status}</p>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary shrink-0" />
            </Link>
          ))}
        </div>
      )}

      {/* Service Records */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-heading font-semibold text-foreground">
          Service Records <span className="text-muted-foreground font-normal text-sm">({services.length})</span>
        </h2>
        <Button size="sm" className="rounded-xl h-9 gap-1.5" onClick={() => setShowAddService(true)}>
          <Plus className="w-4 h-4" /> Add Service
        </Button>
      </div>

      {services.length === 0 ? (
        <div className="bg-card border border-dashed border-border rounded-2xl py-10 flex flex-col items-center text-center">
          <Wrench className="w-8 h-8 text-muted-foreground mb-2" />
          <p className="text-sm font-medium text-foreground mb-1">No service records</p>
          <p className="text-xs text-muted-foreground mb-4">Log the first service for this machine</p>
          <Button size="sm" className="rounded-xl" onClick={() => setShowAddService(true)}>
            <Plus className="w-4 h-4 mr-1" /> Add First Service
          </Button>
        </div>
      ) : (
        <div className="space-y-3 pb-6">
          {services.map(s => (
            <div key={s.id} className="bg-card border border-border rounded-2xl p-4">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
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
                  <Button variant="ghost" size="sm" onClick={() => setEditService(s)} className="text-muted-foreground hover:text-foreground">
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive">
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
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-muted-foreground italic">{s.notes}</p>
                </div>
              )}
              {s.photos && s.photos.length > 0 && (
                <div className="flex gap-2 overflow-x-auto pb-1 mb-1">
                  {s.photos.map((url, i) => (
                    <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="shrink-0">
                      <img src={url} alt="" className="w-24 h-24 rounded-xl object-cover border border-border hover:border-primary/50 transition-colors" />
                    </a>
                  ))}
                </div>
              )}
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

      <Dialog open={showEdit} onOpenChange={setShowEdit}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Edit Machine</DialogTitle></DialogHeader>
          <MachineForm initial={machine} onSubmit={handleEdit} onCancel={() => setShowEdit(false)} loading={saving} />
        </DialogContent>
      </Dialog>

      <Dialog open={showAddService} onOpenChange={setShowAddService}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Add Service Record</DialogTitle></DialogHeader>
          <ServiceForm onSubmit={handleAddService} onCancel={() => setShowAddService(false)} loading={saving} />
        </DialogContent>
      </Dialog>

      <Dialog open={!!editService} onOpenChange={v => { if (!v) setEditService(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Edit Service Record</DialogTitle></DialogHeader>
          {editService && <ServiceForm initial={editService} onSubmit={handleEditService} onCancel={() => setEditService(null)} loading={saving} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
