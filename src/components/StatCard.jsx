import React from "react";

export default function StatCard({ icon: Icon, label, value, accent }) {
  return (
    <div className="bg-card rounded-2xl border border-border p-4 flex flex-col items-center justify-center gap-2">
      <div title={label} className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 cursor-default ${accent || "bg-primary/15 text-primary"}`}>
        <Icon className="w-5 h-5" />
      </div>
      <p className="text-2xl font-bold font-heading text-foreground">{value}</p>
    </div>
  );
}