import React from "react";

// Shared stat-card primitive (design system, Phase 1/2). Deliberately restrained:
// one icon, one number, one label -- no decorative charts or trend arrows that
// don't reflect real data. `accent` picks a semantic tint (see badge.jsx for the
// same palette) rather than an arbitrary color per call site.
const ACCENTS = {
  primary: "bg-primary/10 text-primary",
  success: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
  info: "bg-info/10 text-info",
};

export default function StatCard({ icon: Icon, label, value, accent = "primary" }) {
  // "Feel like an app, not a website" pass (2026-08-19): rounder corners + a resting shadow on
  // phones only (native mobile card idiom -- see e.g. Airbnb/Revolut-style stat tiles), reverting
  // to the original flatter/squarer desktop treatment at sm:+ so nothing changes on the two other
  // pages that share this component (Jobs/ServiceRecords) at desktop widths.
  return (
    <div className="bg-card rounded-2xl sm:rounded-xl border border-border p-4 sm:p-5 flex items-center gap-4 shadow-sm sm:shadow-none transition-shadow duration-200 hover:shadow-md">
      <div className={`w-11 h-11 rounded-xl sm:rounded-lg flex items-center justify-center shrink-0 ${ACCENTS[accent] || ACCENTS.primary}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="min-w-0">
        <p className="text-2xl font-heading font-bold text-foreground leading-tight">{value}</p>
        <p className="text-xs text-muted-foreground truncate">{label}</p>
      </div>
    </div>
  );
}
