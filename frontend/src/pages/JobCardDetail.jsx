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

const STATUS_STYLES = {
  Open: "bg-blue-500/15 text-blue-400",
  "Booked In": "bg-blue-500/15 text-blue-400",
  "In Progress": "bg-amber-500/15 text-amber-400",
  "Waiting for Parts": "bg-purple-500/15 text-purple-400",
  "Ready for Collection": "bg-teal-500/15 text-teal-400",
  Completed: "bg-emerald-500/15 text-emerald-400",
  Collected: "bg-secondary text-muted-foreground",
};

function AddLineForm({ onAdd, onCancel }) {
  const [form, setForm] = useState({
    line_type: "Labour",
    description: "",
    quantity: 1,
    unit_price: "",
  });

  const set = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div className="border border-border rounded-xl p-4 space-y-3 bg-secondary/30">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <Label className="text-xs">Type</Label>
          <Select value={form.line_type} onValueChange={(value) => set("line_type", value)}>
            <SelectTrigger className="mt-1 h-10 rounded-lg text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LINE_TYPES.map((type) => (
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
          Add Line
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

  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [savingJob, setSavingJob] = useState(false);
  const [editForm, setEditForm] = useState({});

  const [showAddLine, setShowAddLine] = useState(false);
  const [savingLine, setSavingLine] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  const load = async () => {
    setLoading(true);

    const [job, clientList, machineList] = await Promise.all([
      apiClient.entities.JobCard.get(id),
      apiClient.entities.Client.list(),
      apiClient.entities.Machine.list(),
    ]);

    setJobCard(job);
    setLines(job.lines || job.job_card_lines || []);
    setClients(clientList || []);
    setMachines(machineList || []);
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
        client_id: editForm.client_id ? Number(editForm.client_id) : null,
        machine_id: editForm.machine_id ? Number(editForm.machine_id) : null,
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
      job_card_id: Number(id),
      line_type: form.line_type,
      description: form.description,
      quantity,
      unit_price: unitPrice,
      line_total: quantity * unitPrice,
    });

    setSavingLine(false);
    setShowAddLine(false);
    load();
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

  const total = lines.reduce(
    (sum, line) => sum + (Number(line.quantity || 1) * Number(line.unit_price || 0)),
    0
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="w-8 h-8 border-4 border-secondary border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!jobCard) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <ClipboardList className="w-12 h-12 text-muted-foreground mb-3" />
        <p className="font-medium text-foreground mb-1">Job card not found</p>
        <Link to="/jobs">
          <Button variant="ghost" size="sm">
            Back to Jobs
          </Button>
        </Link>
      </div>
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
          <div className="bg-card border border-border rounded-2xl p-5 mb-4">
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
                <span
                  className={`text-xs font-medium px-3 py-1 rounded-full ${
                    STATUS_STYLES[jobCard.status] || "bg-secondary text-foreground"
                  }`}
                >
                  {jobCard.status}
                </span>

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
                  className="w-full h-11 rounded-xl gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
                  disabled={updatingStatus}
                  onClick={() => handleStatusChange("Completed")}
                >
                  <CheckCircle2 className="w-4 h-4" />
                  Mark Job as Completed — Send to Invoice Queue
                </Button>
              )}

              {!editing && jobCard.status === "Completed" && (
                <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/30 rounded-xl px-4 py-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <p className="text-sm text-emerald-400 font-medium">
                    Completed — visible in the Accountant's Invoice Queue
                  </p>
                </div>
              )}

              {!editing && (
                <div>
                  <Label className="text-xs text-muted-foreground">Update Status</Label>
                  <div className="flex gap-2 mt-1 flex-wrap">
                    {STATUSES.map((status) => (
                      <button
                        key={status}
                        disabled={updatingStatus || jobCard.status === status}
                        onClick={() => handleStatusChange(status)}
                        className={`text-xs px-3 py-1.5 rounded-lg border transition-all ${
                          jobCard.status === status
                            ? `${STATUS_STYLES[status]} border-current font-semibold shadow-sm`
                            : "border-border text-muted-foreground hover:border-primary/50"
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

          <div className="bg-card border border-border rounded-2xl p-5 mb-4 space-y-4">
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
                  items={STATUSES.map((status) => ({ value: status, label: status }))}
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
                  label="Technician Notes"
                  value={jobCard.technician_notes || "No technician notes recorded."}
                  multiline
                />
              </>
            )}
          </div>

          {jobCard.arrival_photos?.length > 0 && (
            <div className="bg-card border border-border rounded-2xl p-5 mb-4">
              <h2 className="font-heading font-semibold text-sm text-foreground mb-3">
                Arrival Photos
              </h2>

              <div className="flex flex-wrap gap-2">
                {jobCard.arrival_photos.map((url, index) => (
                  <a key={index} href={url} target="_blank" rel="noopener noreferrer">
                    <img
                      src={url}
                      alt=""
                      className="w-24 h-24 rounded-xl object-cover border border-border hover:border-primary/50 transition-colors"
                    />
                  </a>
                ))}
              </div>
            </div>
          )}

          <div className="bg-card border border-border rounded-2xl p-5 mb-4">
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
                <AddLineForm onAdd={handleAddLine} onCancel={() => setShowAddLine(false)} />
              </div>
            )}

            {lines.length === 0 && !showAddLine ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                No work logged yet
              </p>
            ) : (
              <div className="space-y-2">
                {lines.map((line) => (
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

                    <button
                      className="no-print text-muted-foreground hover:text-destructive transition-colors p-1"
                      onClick={() => handleDeleteLine(line.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
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