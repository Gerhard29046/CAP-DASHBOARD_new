import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Link } from "react-router-dom";
import { FileText, CheckCircle2, Clock, ChevronRight, Receipt, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import moment from "moment";

const STATUS_STYLES = {
  "Completed":       "bg-emerald-500/15 text-emerald-400",
  "Ready to Invoice":"bg-blue-500/15 text-blue-400",
  "Invoiced":        "bg-secondary text-muted-foreground",
  "Collected":       "bg-secondary text-muted-foreground",
};

export default function InvoiceQueue() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [markingId, setMarkingId] = useState(null);

  const load = async () => {
    setLoading(true);
    const [jobCards, machines, clients, lines] = await Promise.all([
      base44.entities.JobCard.list(),
      base44.entities.Machine.list(),
      base44.entities.Client.list(),
      base44.entities.JobCardLine.list(),
    ]);

    const machineMap = Object.fromEntries(machines.map(m => [m.id, m]));
    const clientMap  = Object.fromEntries(clients.map(c => [c.id, c]));

    // Only show completed or ready-to-invoice job cards
    const billable = jobCards.filter(jc =>
      jc.status === "Completed" || jc.status === "Ready to Invoice" || jc.status === "Invoiced"
    );

    const enriched = billable.map(jc => {
      const machine = machineMap[jc.machine_id] || null;
      const client  = machine ? clientMap[machine.client_id] : null;
      const jobLines = lines.filter(l => l.job_card_id === jc.id);
      const total = jobLines.reduce((sum, l) => sum + ((l.quantity || 1) * (l.unit_price || 0)), 0);

      // Sage Pastel-ready structure (for future integration)
      return {
        // Internal
        id:             jc.id,
        status:         jc.status,
        job_number:     jc.job_number || `JC-${jc.id.slice(-6).toUpperCase()}`,
        date_booked_in: jc.date_booked_in,
        date_completed: jc.date_completed,
        technician:     jc.technician,
        machine_type:   jc.machine_type,
        problem_description: jc.problem_description,

        // Client / Customer (maps to Sage Customer)
        customer: {
          id:           client?.id,
          name:         client?.company_name || "Unknown Client",
          contact:      client?.contact_person,
          phone:        client?.phone,
          email:        client?.email,
          address:      client?.address,
        },

        // Machine
        machine: {
          id:    machine?.id,
          brand: machine?.brand,
          model: machine?.model,
        },

        // Line items (maps to Sage Invoice Lines)
        lines: jobLines.map(l => ({
          id:          l.id,
          type:        l.line_type,       // Labour / Part / Diagnosis / Other
          description: l.description,
          quantity:    l.quantity || 1,
          unit_price:  l.unit_price || 0,
          line_total:  (l.quantity || 1) * (l.unit_price || 0),
        })),

        // Totals
        subtotal:   total,
        vat_rate:   0.15,                 // 15% VAT (South Africa)
        vat_amount: total * 0.15,
        total_incl: total * 1.15,
      };
    });

    // Sort: Completed first, then Invoiced
    enriched.sort((a, b) => {
      const order = { "Completed": 0, "Ready to Invoice": 0, "Invoiced": 1, "Collected": 2 };
      return (order[a.status] ?? 9) - (order[b.status] ?? 9);
    });

    setItems(enriched);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const markInvoiced = async (id) => {
    setMarkingId(id);
    await base44.entities.JobCard.update(id, { status: "Collected" });
    load();
    setMarkingId(null);
  };

  const pending  = items.filter(i => i.status === "Completed" || i.status === "Ready to Invoice");
  const invoiced = items.filter(i => i.status === "Invoiced" || i.status === "Collected");

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="w-8 h-8 border-4 border-secondary border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-heading font-bold text-foreground">Invoice Queue</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Completed jobs ready for billing — structured for Sage Pastel Online</p>
      </div>

      {/* Pending billing */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <AlertCircle className="w-4 h-4 text-emerald-400" />
          <h2 className="font-heading font-semibold text-sm text-foreground">Awaiting Invoice</h2>
          {pending.length > 0 && (
            <span className="bg-emerald-500/15 text-emerald-400 text-xs font-bold px-2 py-0.5 rounded-full">{pending.length}</span>
          )}
        </div>

        {pending.length === 0 ? (
          <div className="bg-card border border-border rounded-2xl p-8 text-center">
            <CheckCircle2 className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No completed jobs awaiting invoicing</p>
          </div>
        ) : (
          <div className="space-y-3">
            {pending.map(item => (
              <InvoiceCard key={item.id} item={item} onMarkInvoiced={markInvoiced} marking={markingId === item.id} />
            ))}
          </div>
        )}
      </div>

      {/* Processed */}
      {invoiced.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle2 className="w-4 h-4 text-muted-foreground" />
            <h2 className="font-heading font-semibold text-sm text-muted-foreground">Processed / Collected</h2>
          </div>
          <div className="space-y-2">
            {invoiced.map(item => (
              <InvoiceCard key={item.id} item={item} processed />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function InvoiceCard({ item, onMarkInvoiced, marking, processed }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={`bg-card border rounded-2xl overflow-hidden transition-colors ${processed ? "border-border opacity-70" : "border-border"}`}>
      {/* Summary row */}
      <div className="p-4 flex items-center gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            <span className="text-sm font-heading font-bold text-foreground">{item.job_number}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLES[item.status] || "bg-secondary text-foreground"}`}>
              {item.status}
            </span>
          </div>
          <p className="text-sm text-foreground truncate">{item.customer.name}</p>
          <p className="text-xs text-muted-foreground">
            {item.machine.brand} {item.machine.model}
            {item.date_completed ? ` · Completed ${moment(item.date_completed).format("DD MMM YYYY")}` : ""}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-lg font-bold font-heading text-primary">R{item.total_incl.toFixed(2)}</p>
          <p className="text-[10px] text-muted-foreground">incl. VAT</p>
        </div>
      </div>

      {/* Expand / collapse lines */}
      <button
        onClick={() => setExpanded(p => !p)}
        className="w-full text-left px-4 py-2 border-t border-border bg-secondary/30 text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center justify-between"
      >
        <span>{item.lines.length} line item{item.lines.length !== 1 ? "s" : ""}</span>
        <ChevronRight className={`w-3.5 h-3.5 transition-transform ${expanded ? "rotate-90" : ""}`} />
      </button>

      {expanded && (
        <div className="px-4 pb-4 pt-3 border-t border-border space-y-1">
          {/* Customer block (Sage: Customer fields) */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 mb-3 text-xs">
            <SageField label="Customer Name"    value={item.customer.name} />
            <SageField label="Contact"          value={item.customer.contact} />
            <SageField label="Phone"            value={item.customer.phone} />
            <SageField label="Email"            value={item.customer.email} />
            <SageField label="Address"          value={item.customer.address} className="col-span-2" />
            <SageField label="Technician"       value={item.technician} />
            <SageField label="Machine Type"     value={item.machine_type} />
            <SageField label="Job Ref"          value={item.job_number} />
            <SageField label="Completed Date"   value={item.date_completed ? moment(item.date_completed).format("DD MMM YYYY") : "—"} />
          </div>

          {/* Line items (Sage: Invoice lines) */}
          <div className="rounded-xl overflow-hidden border border-border">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-secondary/60">
                  <th className="text-left px-3 py-2 text-muted-foreground font-medium">Type</th>
                  <th className="text-left px-3 py-2 text-muted-foreground font-medium">Description</th>
                  <th className="text-right px-3 py-2 text-muted-foreground font-medium">Qty</th>
                  <th className="text-right px-3 py-2 text-muted-foreground font-medium">Unit (R)</th>
                  <th className="text-right px-3 py-2 text-muted-foreground font-medium">Total (R)</th>
                </tr>
              </thead>
              <tbody>
                {item.lines.map((l, i) => (
                  <tr key={l.id} className={i % 2 === 0 ? "" : "bg-secondary/20"}>
                    <td className="px-3 py-2 text-muted-foreground">{l.type}</td>
                    <td className="px-3 py-2 text-foreground">{l.description}</td>
                    <td className="px-3 py-2 text-right text-foreground">{l.quantity}</td>
                    <td className="px-3 py-2 text-right text-foreground">{l.unit_price.toFixed(2)}</td>
                    <td className="px-3 py-2 text-right font-medium text-foreground">{l.line_total.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totals (Sage: Document totals) */}
          <div className="mt-3 space-y-1 text-xs border-t border-border pt-3">
            <div className="flex justify-between text-muted-foreground">
              <span>Subtotal (excl. VAT)</span>
              <span>R{item.subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>VAT (15%)</span>
              <span>R{item.vat_amount.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-foreground font-bold text-sm pt-1">
              <span>Total (incl. VAT)</span>
              <span className="text-primary">R{item.total_incl.toFixed(2)}</span>
            </div>
          </div>

          {!processed && (
            <div className="pt-3 flex gap-2 justify-end no-print">
              <Link to={`/job-cards/${item.id}`}>
                <Button variant="outline" size="sm" className="rounded-xl gap-1.5 h-8 text-xs">
                  <FileText className="w-3.5 h-3.5" /> View Job Card
                </Button>
              </Link>
              <Button size="sm" className="rounded-xl gap-1.5 h-8 text-xs" onClick={() => onMarkInvoiced(item.id)} disabled={marking}>
                <Receipt className="w-3.5 h-3.5" /> {marking ? "Saving…" : "Mark as Invoiced"}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SageField({ label, value, className = "" }) {
  if (!value) return null;
  return (
    <div className={className}>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{label}</p>
      <p className="text-foreground">{value}</p>
    </div>
  );
}