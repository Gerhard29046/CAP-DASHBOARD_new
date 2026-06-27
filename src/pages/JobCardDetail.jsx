import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useParams, Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft, Plus, Trash2, Printer, Pencil, CheckCircle2,
  Clock, Wrench, Package, ClipboardList, Camera, X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger
} from "@/components/ui/alert-dialog";
import moment from "moment";

const LINE_TYPES = ["Labour", "Part / Product", "Diagnosis", "Other"];
const STATUSES = ["Open", "In Progress", "Completed", "Collected"];

const STATUS_STYLES = {
  "Open": "bg-blue-500/15 text-blue-400",
  "In Progress": "bg-amber-500/15 text-amber-400",
  "Completed": "bg-emerald-500/15 text-emerald-400",
  "Collected": "bg-secondary text-muted-foreground",
};

function AddLineForm({ onAdd, onCancel }) {
  const [form, setForm] = useState({ line_type: "Labour", description: "", quantity: 1, unit_price: "" });
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));
  return (
    <div className="border border-border rounded-xl p-4 space-y-3 bg-secondary/30">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <Label className="text-xs">Type</Label>
          <Select value={form.line_type} onValueChange={v => set("line_type", v)}>
            <SelectTrigger className="mt-1 h-10 rounded-lg text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>{LINE_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="col-span-2">
          <Label className="text-xs">Description *</Label>
          <Input value={form.description} onChange={e => set("description", e.target.value)} placeholder="e.g. Replace compressor" className="mt-1 h-10 rounded-lg text-sm" />
        </div>
        <div>
          <Label className="text-xs">Qty</Label>
          <Input type="number" value={form.quantity} onChange={e => set("quantity", e.target.value)} className="mt-1 h-10 rounded-lg text-sm" min="1" />
        </div>
        <div>
          <Label className="text-xs">Unit Price (R)</Label>
          <Input type="number" value={form.unit_price} onChange={e => set("unit_price", e.target.value)} placeholder="0.00" className="mt-1 h-10 rounded-lg text-sm" />
        </div>
      </div>
      <div className="flex gap-2 justify-end">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
        <Button type="button" size="sm" disabled={!form.description.trim()} onClick={() => onAdd(form)}>Add Line</Button>
      </div>
    </div>
  );
}

export default function JobCardDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const printRef = useRef();

  const [jobCard, setJobCard] = useState(null);
  const [machine, setMachine] = useState(null);
  const [client, setClient] = useState(null);
  const [lines, setLines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddLine, setShowAddLine] = useState(false);
  const [savingLine, setSavingLine] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  const load = async () => {
  const job = await base44.entities.JobCard.get(id);

  setJobCard(job);
  setLines(job.lines || job.job_card_lines || []);
  setLoading(false);
};

  useEffect(() => { load(); }, [id]);

const handleAddLine = async (form) => {
  setSavingLine(true);

  const quantity = Number(form.quantity) || 1;
  const unitPrice = Number(form.unit_price) || 0;

  await base44.entities.JobCardLine.create({
    job_card_id: Number(id),
    line_type: form.line_type,
    description: form.description,
    quantity: quantity,
    unit_price: unitPrice,
    line_total: quantity * unitPrice,
  });

  setSavingLine(false);
  setShowAddLine(false);
  load();

};

  const handleDeleteLine = async (lineId) => {
    await base44.entities.JobCardLine.delete(lineId);
    load();
  };

  const handleStatusChange = async (status) => {
    setUpdatingStatus(true);
    await base44.entities.JobCard.update(id, { status });
    setUpdatingStatus(false);
    load();
  };

  const handlePrint = () => {
    window.print();
  };

  const total = lines.reduce((sum, l) => sum + ((l.quantity || 1) * (l.unit_price || 0)), 0);

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
        <Link to="/"><Button variant="ghost" size="sm">Back to Dashboard</Button></Link>
      </div>
    );
  }

  return (
    <>
      {/* Print styles */}
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #job-card-print, #job-card-print * { visibility: visible !important; }
          #job-card-print { position: fixed; top: 0; left: 0; width: 100%; padding: 24px; background: white; color: black; }
          .no-print { display: none !important; }
        }
      `}</style>

      <div className="max-w-lg mx-auto">
        {/* Nav */}
        <div className="flex items-center justify-between mb-5 no-print">
          <button onClick={() => navigate(-1)} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
          <Button variant="outline" size="sm" className="rounded-xl gap-2" onClick={handlePrint}>
            <Printer className="w-4 h-4" /> Print / PDF
          </Button>
        </div>

        {/* Printable content */}
        <div id="job-card-print" ref={printRef}>
          {/* Header card */}
          <div className="bg-card border border-border rounded-2xl p-5 mb-4">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Job Card</p>
                <h1 className="text-xl font-heading font-bold text-foreground mt-0.5">{jobCard.job_number || `#${id.slice(-6).toUpperCase()}`}</h1>
                <p className="text-sm text-muted-foreground mt-1">
                  {machine?.brand} {machine?.model}
                  {client ? ` · ${client.company_name}` : ""}
                </p>
              </div>
              <div className="flex flex-col items-end gap-2">
                <span className={`text-xs font-medium px-3 py-1 rounded-full ${STATUS_STYLES[jobCard.status] || "bg-secondary text-foreground"}`}>
                  {jobCard.status}
                </span>
                <p className="text-xs text-muted-foreground">{moment(jobCard.date_booked_in).format("DD MMM YYYY")}</p>
              </div>
            </div>

            {/* Status control */}
            <div className="mt-4 no-print space-y-3">
              {/* Prominent complete button */}
              {jobCard.status !== "Completed" && jobCard.status !== "Collected" && (
                <Button
                  className="w-full h-11 rounded-xl gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
                  disabled={updatingStatus}
                  onClick={() => handleStatusChange("Completed")}
                >
                  <CheckCircle2 className="w-4 h-4" />
                  Mark Job as Completed — Send to Invoice Queue
                </Button>
              )}
              {jobCard.status === "Completed" && (
                <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/30 rounded-xl px-4 py-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <p className="text-sm text-emerald-400 font-medium">Completed — visible in the Accountant's Invoice Queue</p>
                </div>
              )}
              <div>
                <Label className="text-xs text-muted-foreground">Update Status</Label>
                <div className="flex gap-2 mt-1 flex-wrap">
                  {STATUSES.map(s => (
                   <button
                      key={s}
                      disabled={updatingStatus || jobCard.status === s}
                      onClick={() => handleStatusChange(s)}
                      className={`text-xs px-3 py-1.5 rounded-lg border transition-all ${
                      jobCard.status === s
                      ? `${STATUS_STYLES[s]} border-current font-semibold shadow-sm`
                      : "border-border text-muted-foreground hover:border-primary/50"
                    }`}
                   >
                   {s}
                  </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Details */}
         {/* Details */}
<div className="bg-card border border-border rounded-2xl p-5 mb-4 space-y-3">
  <h2 className="font-heading font-semibold text-sm text-foreground flex items-center gap-2">
    <ClipboardList className="w-4 h-4 text-primary" /> Job Details
  </h2>

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
</div>

          {/* Arrival photos */}
          {jobCard.arrival_photos?.length > 0 && (
            <div className="bg-card border border-border rounded-2xl p-5 mb-4">
              <h2 className="font-heading font-semibold text-sm text-foreground mb-3">Arrival Photos</h2>
              <div className="flex flex-wrap gap-2">
                {jobCard.arrival_photos.map((url, i) => (
                  <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                    <img src={url} alt="" className="w-24 h-24 rounded-xl object-cover border border-border hover:border-primary/50 transition-colors" />
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Job lines */}
          <div className="bg-card border border-border rounded-2xl p-5 mb-4">
            <div className="flex items-center justify-between mb-4 no-print">
              <h2 className="font-heading font-semibold text-sm text-foreground flex items-center gap-2">
                <Wrench className="w-4 h-4 text-primary" /> Work & Parts
              </h2>
              <Button size="sm" variant="outline" className="rounded-xl gap-1.5 h-8 text-xs" onClick={() => setShowAddLine(true)}>
                <Plus className="w-3.5 h-3.5" /> Add Line
              </Button>
            </div>
            <h2 className="font-heading font-semibold text-sm text-foreground mb-3" style={{display: "none"}} id="work-print-heading">Work &amp; Parts</h2>

            {showAddLine && (
              <div className="mb-3 no-print">
                <AddLineForm onAdd={handleAddLine} onCancel={() => setShowAddLine(false)} />
              </div>
            )}

            {lines.length === 0 && !showAddLine ? (
              <p className="text-sm text-muted-foreground text-center py-6">No work logged yet</p>
            ) : (
              <div className="space-y-2">
                {lines.map(line => (
                  <div key={line.id} className="flex items-start gap-3 py-2.5 border-b border-border last:border-0">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground bg-secondary px-1.5 py-0.5 rounded">{line.line_type}</span>
                      </div>
                    
{(line.quantity || line.unit_price) && (
  <p className="text-xs text-muted-foreground mt-0.5">
    {Number(line.quantity || 1)} × R{Number(line.unit_price || 0).toFixed(2)}
    {" = "}
    <span className="text-foreground font-medium">
      R{(
        Number(line.quantity || 1) *
        Number(line.unit_price || 0)
      ).toFixed(2)}
    </span>
  </p>

                      )}
                    </div>
                    <button className="no-print text-muted-foreground hover:text-destructive transition-colors p-1" onClick={() => handleDeleteLine(line.id)}>
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {lines.some(l => l.unit_price) && (
              <div className="mt-3 pt-3 border-t border-border flex justify-between items-center">
                <span className="text-sm font-medium text-foreground">Total</span>
                <span className="text-lg font-bold text-primary font-heading">R{total.toFixed(2)}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function DetailRow({ label, value, multiline }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground font-medium">{label}</p>
      <p className={`text-sm text-foreground mt-0.5 ${multiline ? "whitespace-pre-wrap" : ""}`}>{value}</p>
    </div>
  );
}