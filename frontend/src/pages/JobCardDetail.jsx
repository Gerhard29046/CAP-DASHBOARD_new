import React, { useState, useEffect, useRef } from "react";
import { apiClient } from "@/api/apiClient";
import { useParams, Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Plus,
  Trash2,
  Printer,
  Pencil,
  CheckCircle2,
  Wrench,
  ClipboardList,
  Save,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger
} from "@/components/ui/alert-dialog";
import EmptyState from "@/components/EmptyState";
import RecordPhotoGallery from "@/components/RecordPhotoGallery";
import moment from "moment";

const LINE_TYPES = ["Labour", "Part / Product", "Diagnosis", "Other"];
const STATUSES = [
  "Open",
  "Booked In",
  "In Progress",
  "Waiting for Parts",
  "Ready for Collection",
  "Completed",
  "Collected",
];

const ARRIVAL_CONDITIONS = ["Good", "Fair", "Damaged", "Heavy Damage"];

// Same semantic tokens as Jobs.jsx's StatusBadge -- one status vocabulary
// shared across the list and detail pages.
const STATUS_VARIANT = {
  Open: "info",
  "Booked In": "info",
  "In Progress": "warning",
  "Waiting for Parts": "neutral",
  "Ready for Collection": "success",
  Completed: "success",
  Collected: "neutral",
};

function AddLineForm({ onAdd, onCancel, catalog = [], settings, initial = null }) {
  const [form, setForm] = useState({
    line_type: initial?.line_type || "Labour",
    description: initial?.description || "",
    quantity: initial?.quantity ?? (settings?.default_line_quantity || 1),
    unit_price: initial?.unit_price ?? "",
    catalog_item_id: initial?.catalog_item_id || null,
  });

  const set = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  // Catalog picker respects Job Card settings (allow_products/allow_services) -- see
  // Settings > Job Cards. Selecting an item pre-fills type/description/price, but every
  // field stays editable -- selecting from the catalogue is a convenience, not a lock.
  const selectableCatalog = catalog.filter((item) => item.is_active && (
    (item.type === "product" && settings?.allow_products !== false) ||
    (item.type === "service" && settings?.allow_services !== false)
  ));

  const applyCatalogItem = (itemId) => {
    if (itemId === "__custom__") { set("catalog_item_id", null); return; }
    const item = catalog.find((c) => c.id === itemId);
    if (!item) return;
    setForm((prev) => ({
      ...prev,
      catalog_item_id: item.id,
      line_type: item.type === "service" ? "Labour" : "Part / Product",
      description: item.name + (item.description ? ` — ${item.description}` : ""),
      unit_price: String(item.unit_price ?? ""),
    }));
  };

  return (
    <div className="border border-border rounded-xl p-4 space-y-3 bg-secondary/30">
      {selectableCatalog.length > 0 && (
        <div>
          <Label className="text-xs">From Catalogue (optional)</Label>
          <Select value={form.catalog_item_id || "__custom__"} onValueChange={applyCatalogItem}>
            <SelectTrigger className="mt-1 h-10 rounded-lg text-sm">
              <SelectValue placeholder="Choose a product/service, or enter custom below" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__custom__">Custom (type manually)</SelectItem>
              {selectableCatalog.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.name} — R{Number(item.unit_price).toFixed(2)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <Label className="text-xs">Type</Label>
          <Select value={form.line_type} onValueChange={(value) => set("line_type", value)}>
            <SelectTrigger className="mt-1 h-10 rounded-lg text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {/* Settings > Job Cards ("service types") -- falls back to the original
                  hardcoded list until 0021 is applied or the admin hasn't customized it. */}
              {(settings?.line_types || LINE_TYPES).map((type) => (
                <SelectItem key={type} value={type}>
                  {type}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="col-span-2">
          <Label className="text-xs">Description *</Label>
          <Input
            value={form.description}
            onChange={(event) => set("description", event.target.value)}
            placeholder="e.g. Replace compressor"
            className="mt-1 h-10 rounded-lg text-sm"
          />
        </div>

        <div>
          <Label className="text-xs">Qty</Label>
          <Input
            type="number"
            value={form.quantity}
            onChange={(event) => set("quantity", event.target.value)}
            className="mt-1 h-10 rounded-lg text-sm"
            min="1"
          />
        </div>

        <div>
          <Label className="text-xs">Unit Price (R)</Label>
          <Input
            type="number"
            value={form.unit_price}
            onChange={(event) => set("unit_price", event.target.value)}
            placeholder="0.00"
            className="mt-1 h-10 rounded-lg text-sm"
          />
        </div>
      </div>

      <div className="flex gap-2 justify-end">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={!form.description.trim()}
          onClick={() => onAdd(form)}
        >
          {initial ? "Save Changes" : "Add Line"}
        </Button>
      </div>
    </div>
  );
}

export default function JobCardDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const printRef = useRef();

  const [jobCard, setJobCard] = useState(null);
  const [lines, setLines] = useState([]);
  const [clients, setClients] = useState([]);
  const [machines, setMachines] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [jobCardSettings, setJobCardSettings] = useState(null);

  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [savingJob, setSavingJob] = useState(false);
  const [editForm, setEditForm] = useState({});

  const [showAddLine, setShowAddLine] = useState(false);
  const [editingLineId, setEditingLineId] = useState(null);
  const [savingLine, setSavingLine] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  const load = async () => {
    setLoading(true);

    // NOTE (bug fix, 2026-08-13): apiClient.entities.JobCard.get() only ever returns the
    // bare job_cards row -- it does NOT join line items, client, or machine (Supabase has
    // no auto-embedding here the way the old Firebase/base44 SDK layer implicitly did).
    // Previously this page read `job.lines || job.job_card_lines`, which was always
    // undefined, so newly-added/removed line items (and the client/machine header info)
    // never actually rendered even though the underlying job_card_lines write succeeded.
    // Fetch job_card_lines explicitly and resolve client/machine from the already-loaded
    // lists instead of assuming the API embeds them.
    const [job, clientList, machineList, lineList, catalogList, settings] = await Promise.all([
      apiClient.entities.JobCard.get(id),
      apiClient.entities.Client.list(),
      apiClient.entities.Machine.list(),
      apiClient.entities.JobCardLine.filter({ job_card_id: id }),
      apiClient.entities.ProductService.list(),
      apiClient.entities.JobCardSettings.get().catch((e) => { console.error("Failed to load Job Card settings:", e); return null; }),
    ]);

    const machine = (machineList || []).find((m) => m.id === job.machine_id) || null;
    const client = (clientList || []).find((c) => c.id === job.client_id)
      || (machine ? (clientList || []).find((c) => c.id === machine.client_id) : null)
      || null;

    setJobCard({ ...job, machine, client });
    setLines(lineList || []);
    setClients(clientList || []);
    setMachines(machineList || []);
    setCatalog(catalogList || []);
    setJobCardSettings(settings);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [id]);

  const startEditing = () => {
    setEditForm({
      client_id: jobCard.client_id ? String(jobCard.client_id) : "",
      machine_id: jobCard.machine_id ? String(jobCard.machine_id) : "",
      job_number: jobCard.job_number || "",
      status: jobCard.status || "Open",
      date_received: jobCard.date_received || "",
      date_completed: jobCard.date_completed || "",
      fault_description: jobCard.fault_description || "",
      technician_name: jobCard.technician_name || "",
      machine_type: jobCard.machine_type || "",
      accessories_received: jobCard.accessories_received || "",
      arrival_condition: jobCard.arrival_condition || "",
      arrival_condition_notes: jobCard.arrival_condition_notes || "",
      technician_notes: jobCard.technician_notes || "",
      notes: jobCard.notes || "",
    });

    setEditing(true);
  };

  const cancelEditing = () => {
    setEditing(false);
    setEditForm({});
  };

  const setEditValue = (key, value) => {
    setEditForm((prev) => ({ ...prev, [key]: value }));
  };

  const saveJobChanges = async () => {
    setSavingJob(true);

    try {
      const payload = {
        ...editForm,
        client_id: editForm.client_id ? String(editForm.client_id) : null,
        machine_id: editForm.machine_id ? String(editForm.machine_id) : null,
        date_completed: editForm.date_completed || null,
      };

      const updated = await apiClient.entities.JobCard.update(id, payload);

      setJobCard(updated);
      setEditing(false);
      await load();
    } catch (error) {
      console.error("Failed to save job card:", error);
      alert("Could not save job card changes.");
    } finally {
      setSavingJob(false);
    }
  };

  const handleAddLine = async (form) => {
    setSavingLine(true);

    const quantity = Number(form.quantity) || 1;
    const unitPrice = Number(form.unit_price) || 0;

    await apiClient.entities.JobCardLine.create({
      job_card_id: String(id),
      line_type: form.line_type,
      description: form.description,
      quantity,
      unit_price: unitPrice,
      line_total: quantity * unitPrice,
      catalog_item_id: form.catalog_item_id || null,
    });

    setSavingLine(false);
    setShowAddLine(false);
    load();
  };

  const handleEditLine = async (form) => {
    setSavingLine(true);
    const quantity = Number(form.quantity) || 1;
    const unitPrice = Number(form.unit_price) || 0;
    try {
      await apiClient.entities.JobCardLine.update(editingLineId, {
        line_type: form.line_type,
        description: form.description,
        quantity,
        unit_price: unitPrice,
        line_total: quantity * unitPrice,
        catalog_item_id: form.catalog_item_id || null,
      });
      setEditingLineId(null);
      await load();
    } catch (error) {
      console.error("Failed to save line item changes:", error);
      alert("Could not save changes to this line item.");
    } finally {
      setSavingLine(false);
    }
  };

  const handleDeleteLine = async (lineId) => {
    await apiClient.entities.JobCardLine.delete(lineId);
    load();
  };

  const handleStatusChange = async (status) => {
    setUpdatingStatus(true);

    await apiClient.entities.JobCard.update(id, {
      status,
      ...(status === "Completed"
        ? { date_completed: new Date().toISOString().slice(0, 10) }
        : {}),
    });

    setUpdatingStatus(false);
    load();
  };

  const handlePrint = () => {
    window.print();
  };

  // 2026-08-16, explicit user request: "delete... jobs that is booked in". job_card_lines
  // cascade-delete with the job card (0001_initial_schema.sql), so this is a clean, complete
  // deletion with nothing left orphaned. RLS (job_cards_delete, 0002_rls_policies.sql) is the
  // real authorization gate -- matches ClientDetail.jsx's delete, which likewise shows the
  // button to any signed-in user and lets the server reject an unauthorized attempt.
  const handleDelete = async () => {
    await apiClient.entities.JobCard.delete(id);
    navigate("/jobs");
  };

  const total = lines.reduce(
    (sum, line) => sum + (Number(line.quantity || 1) * Number(line.unit_price || 0)),
    0
  );

  if (loading) {
    return (
      <div className="w-full max-w-4xl mx-auto space-y-4">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-40 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  if (!jobCard) {
    return (
      <EmptyState
        icon={ClipboardList}
        title="Job card not found"
        description="This job card may have been removed."
        action={<Link to="/jobs"><Button variant="outline" size="sm">Back to Jobs</Button></Link>}
      />
    );
  }

  return (
    <>
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #job-card-print, #job-card-print * { visibility: visible !important; }
          #job-card-print { position: fixed; top: 0; left: 0; width: 100%; padding: 24px; background: white; color: black; }
          .no-print { display: none !important; }
        }
      `}</style>

      <div className="w-full max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-5 no-print">
          <button
            onClick={() => navigate(-1)}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>

          <div className="flex gap-2">
            {!editing ? (
              <>
                <Button variant="outline" size="sm" className="rounded-xl gap-2" onClick={handlePrint}>
                  <Printer className="w-4 h-4" />
                  Print / PDF
                </Button>

                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" size="icon" className="rounded-xl text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/30">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete Job Card?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will permanently delete job card{" "}
                        <strong>{jobCard.job_number || `#${String(id).slice(-6).toUpperCase()}`}</strong>
                        {jobCard.client ? <> for <strong>{jobCard.client.company_name}</strong></> : null}
                        {" "}and all its line items.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>

                <Button size="sm" className="rounded-xl gap-2" onClick={startEditing}>
                  <Pencil className="w-4 h-4" />
                  Edit Job Card
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" size="sm" className="rounded-xl gap-2" onClick={cancelEditing}>
                  <X className="w-4 h-4" />
                  Cancel
                </Button>

                <Button size="sm" className="rounded-xl gap-2" disabled={savingJob} onClick={saveJobChanges}>
                  <Save className="w-4 h-4" />
                  {savingJob ? "Saving..." : "Save Changes"}
                </Button>
              </>
            )}
          </div>
        </div>

        <div id="job-card-print" ref={printRef}>
          <div className="bg-card border border-border rounded-xl p-5 mb-4">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                  Job Card
                </p>

                {editing ? (
                  <Input
                    value={editForm.job_number}
                    onChange={(event) => setEditValue("job_number", event.target.value)}
                    className="mt-2 h-10 rounded-lg max-w-xs"
                  />
                ) : (
                  <h1 className="text-xl font-heading font-bold text-foreground mt-0.5">
                    {jobCard.job_number || `#${String(id).slice(-6).toUpperCase()}`}
                  </h1>
                )}

                <p className="text-sm text-muted-foreground mt-1">
                  {jobCard.machine?.brand} {jobCard.machine?.model}
                  {jobCard.client ? ` · ${jobCard.client.company_name}` : ""}
                </p>
              </div>

              <div className="flex flex-col items-end gap-2">
                <Badge variant={STATUS_VARIANT[jobCard.status] || "neutral"}>{jobCard.status}</Badge>

                <p className="text-xs text-muted-foreground">
                  {jobCard.date_received
                    ? moment(jobCard.date_received).format("DD MMM YYYY")
                    : "No date received"}
                </p>
              </div>
            </div>

            <div className="mt-4 no-print space-y-3">
              {!editing && jobCard.status !== "Completed" && jobCard.status !== "Collected" && (
                <Button
                  className="w-full gap-2 bg-success hover:bg-success/90 text-success-foreground"
                  disabled={updatingStatus}
                  onClick={() => handleStatusChange("Completed")}
                >
                  <CheckCircle2 className="w-4 h-4" />
                  Mark Job as Completed — Send to Invoice Queue
                </Button>
              )}

              {!editing && jobCard.status === "Completed" && (
                <div className="flex items-center gap-2 bg-success/10 border border-success/20 rounded-lg px-4 py-2.5">
                  <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
                  <p className="text-sm text-success font-medium">
                    Completed — visible in the Accountant's Invoice Queue
                  </p>
                </div>
              )}

              {!editing && (
                <div>
                  <Label className="text-xs text-muted-foreground">Update Status</Label>
                  <div className="flex gap-2 mt-1.5 flex-wrap">
                    {/* Settings > Job Cards ("job statuses") -- falls back to the original
                        hardcoded list until 0021 is applied or the admin hasn't customized
                        it. STATUS_VARIANT already safely falls back to a neutral badge for
                        any status string not in its map, so a custom admin-added status
                        cannot break this UI. */}
                    {(jobCardSettings?.available_statuses || STATUSES).map((status) => (
                      <button
                        key={status}
                        disabled={updatingStatus || jobCard.status === status}
                        onClick={() => handleStatusChange(status)}
                        className={`text-xs px-3 py-1.5 rounded-lg border transition-colors duration-150 ${
                          jobCard.status === status
                            ? "border-primary bg-primary/10 text-primary font-medium"
                            : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
                        }`}
                      >
                        {status}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="bg-card border border-border rounded-xl p-5 mb-4 space-y-4">
            <h2 className="font-heading font-semibold text-sm text-foreground flex items-center gap-2">
              <ClipboardList className="w-4 h-4 text-primary" />
              Job Details
            </h2>

            {editing ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <EditSelect
                  label="Client"
                  value={editForm.client_id}
                  onChange={(value) => setEditValue("client_id", value)}
                  items={clients.map((client) => ({
                    value: String(client.id),
                    label: client.company_name || client.name || client.email || `Client ${client.id}`,
                  }))}
                />

                <EditSelect
                  label="Machine"
                  value={editForm.machine_id}
                  onChange={(value) => setEditValue("machine_id", value)}
                  items={machines.map((machine) => ({
                    value: String(machine.id),
                    label:
                      [machine.brand, machine.model, machine.serial_number]
                        .filter(Boolean)
                        .join(" · ") || `Machine ${machine.id}`,
                  }))}
                />

                <EditSelect
                  label="Status"
                  value={editForm.status}
                  onChange={(value) => setEditValue("status", value)}
                  items={(jobCardSettings?.available_statuses || STATUSES).map((status) => ({ value: status, label: status }))}
                />

                <EditInput
                  label="Date Received"
                  type="date"
                  value={editForm.date_received}
                  onChange={(value) => setEditValue("date_received", value)}
                />

                <EditInput
                  label="Date Completed"
                  type="date"
                  value={editForm.date_completed || ""}
                  onChange={(value) => setEditValue("date_completed", value)}
                />

                <EditInput
                  label="Technician"
                  value={editForm.technician_name}
                  onChange={(value) => setEditValue("technician_name", value)}
                />

                <EditInput
                  label="Machine Type"
                  value={editForm.machine_type}
                  onChange={(value) => setEditValue("machine_type", value)}
                />

                <EditSelect
                  label="Condition on Arrival"
                  value={editForm.arrival_condition}
                  onChange={(value) => setEditValue("arrival_condition", value)}
                  items={ARRIVAL_CONDITIONS.map((condition) => ({
                    value: condition,
                    label: condition,
                  }))}
                />

                <div className="md:col-span-2">
                  <EditTextarea
                    label="Fault / Problem Reported"
                    value={editForm.fault_description}
                    onChange={(value) => setEditValue("fault_description", value)}
                  />
                </div>

                <div className="md:col-span-2">
                  <EditTextarea
                    label="Accessories Received"
                    value={editForm.accessories_received}
                    onChange={(value) => setEditValue("accessories_received", value)}
                  />
                </div>

                <div className="md:col-span-2">
                  <EditTextarea
                    label="Condition Notes"
                    value={editForm.arrival_condition_notes}
                    onChange={(value) => setEditValue("arrival_condition_notes", value)}
                  />
                </div>

                <div className="md:col-span-2">
                  <EditTextarea
                    label="Technician Notes"
                    value={editForm.technician_notes}
                    onChange={(value) => setEditValue("technician_notes", value)}
                  />
                </div>
              </div>
            ) : (
              <>
                <DetailRow
                  label="Fault / Problem Reported"
                  value={jobCard.fault_description || "No fault description recorded."}
                  multiline
                />
                <DetailRow
                  label="Accessories Received"
                  value={jobCard.accessories_received || "No accessories recorded."}
                  multiline
                />
                <DetailRow
                  label="Condition on Arrival"
                  value={jobCard.arrival_condition || "Not recorded"}
                />
                <DetailRow
                  label="Condition Notes"
                  value={jobCard.arrival_condition_notes || "No condition notes recorded."}
                  multiline
                />
                <DetailRow
                  label="Technician"
                  value={jobCard.technician_name || "Not assigned"}
                />
                <DetailRow
                  label="Machine Type"
                  value={jobCard.machine_type || "Not recorded"}
                />
                <DetailRow
                  label="Technician Notes"
                  value={jobCard.technician_notes || "No technician notes recorded."}
                  multiline
                />
              </>
            )}
          </div>

          {jobCard.arrival_photos?.length > 0 && (
            <div className="bg-card border border-border rounded-xl p-5 mb-4">
              <h2 className="font-heading font-semibold text-sm text-foreground mb-3">
                Arrival Photos
              </h2>

              <RecordPhotoGallery
                photos={jobCard.arrival_photos}
                containerClassName="flex flex-wrap gap-2"
                imgClassName="w-24 h-24 rounded-xl object-cover border border-border hover:border-primary/50 transition-colors"
              />
            </div>
          )}

          <div className="bg-card border border-border rounded-xl p-5 mb-4">
            <div className="flex items-center justify-between mb-4 no-print">
              <h2 className="font-heading font-semibold text-sm text-foreground flex items-center gap-2">
                <Wrench className="w-4 h-4 text-primary" />
                Work & Parts
              </h2>

              <Button
                size="sm"
                variant="outline"
                className="rounded-xl gap-1.5 h-8 text-xs"
                onClick={() => setShowAddLine(true)}
              >
                <Plus className="w-3.5 h-3.5" />
                Add Line
              </Button>
            </div>

            {showAddLine && (
              <div className="mb-3 no-print">
                <AddLineForm
                  onAdd={handleAddLine}
                  onCancel={() => setShowAddLine(false)}
                  catalog={catalog}
                  settings={jobCardSettings}
                />
              </div>
            )}

            {lines.length === 0 && !showAddLine ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                No work logged yet
              </p>
            ) : (
              <div className="space-y-2">
                {lines.map((line) => (
                  editingLineId === line.id ? (
                    <div key={line.id} className="py-1">
                      <AddLineForm
                        initial={line}
                        onAdd={handleEditLine}
                        onCancel={() => setEditingLineId(null)}
                        catalog={catalog}
                        settings={jobCardSettings}
                      />
                    </div>
                  ) : (
                    <div
                      key={line.id}
                      className="flex items-start gap-3 py-2.5 border-b border-border last:border-0"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground bg-secondary px-1.5 py-0.5 rounded">
                            {line.line_type}
                          </span>
                        </div>

                        <p className="text-sm text-foreground">{line.description}</p>

                        {(line.quantity || line.unit_price) && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {Number(line.quantity || 1)} × R
                            {Number(line.unit_price || 0).toFixed(2)} ={" "}
                            <span className="text-foreground font-medium">
                              R
                              {(
                                Number(line.quantity || 1) *
                                Number(line.unit_price || 0)
                              ).toFixed(2)}
                            </span>
                          </p>
                        )}
                      </div>

                      <div className="no-print flex items-center gap-1 shrink-0">
                        <button
                          className="text-muted-foreground hover:text-foreground transition-colors p-1"
                          onClick={() => setEditingLineId(line.id)}
                          aria-label="Edit line item"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          className="text-muted-foreground hover:text-destructive transition-colors p-1"
                          onClick={() => handleDeleteLine(line.id)}
                          aria-label="Delete line item"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )
                ))}
              </div>
            )}

            {lines.some((line) => line.unit_price) && (
              <div className="mt-3 pt-3 border-t border-border flex justify-between items-center">
                <span className="text-sm font-medium text-foreground">Total</span>
                <span className="text-lg font-bold text-primary font-heading">
                  R{total.toFixed(2)}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function EditInput({ label, value, onChange, type = "text" }) {
  return (
    <div>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input
        type={type}
        value={value || ""}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 h-10 rounded-lg text-sm"
      />
    </div>
  );
}

function EditTextarea({ label, value, onChange }) {
  return (
    <div>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Textarea
        value={value || ""}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 min-h-[90px] rounded-lg text-sm"
      />
    </div>
  );
}

function EditSelect({ label, value, onChange, items }) {
  return (
    <div>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Select value={value || ""} onValueChange={onChange}>
        <SelectTrigger className="mt-1 h-10 rounded-lg text-sm">
          <SelectValue placeholder={`Select ${label.toLowerCase()}`} />
        </SelectTrigger>
        <SelectContent>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function DetailRow({ label, value, multiline }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground font-medium">{label}</p>
      <p className={`text-sm text-foreground mt-0.5 ${multiline ? "whitespace-pre-wrap" : ""}`}>
        {value}
      </p>
    </div>
  );
}
