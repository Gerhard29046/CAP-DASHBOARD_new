import React, { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { apiClient } from "@/api/apiClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ArrowLeft } from "lucide-react";

const FIELD_LABELS = {
  manufacturer: "Manufacturer",
  model_name: "Model name",
  variant: "Variant",
  product_code: "Product code",
  category: "Category",
};
const REQUIRED_FIELDS = ["manufacturer", "model_name"];

export default function KnowledgeMachineForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    manufacturer: "", model_name: "", variant: "", product_code: "", category: "",
    summary: "", supported_refrigerants: "", technical_specifications: "", main_functions: "",
  });

  useEffect(() => {
    if (!id) return;
    apiClient.request(`/knowledge-machines/${id}`).then((x) => setForm({
      ...x,
      supported_refrigerants: (x.supported_refrigerants || []).join(", "),
      technical_specifications: Object.entries(x.technical_specifications || {}).map(([k, v]) => `${k}: ${v}`).join("\n"),
      main_functions: (x.main_functions || []).join("\n"),
    }));
  }, [id]);

  const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      const specs = Object.fromEntries(
        form.technical_specifications.split("\n").filter(Boolean).map((line) => {
          const i = line.indexOf(":");
          return i < 0 ? [line, ""] : [line.slice(0, i).trim(), line.slice(i + 1).trim()];
        })
      );
      const body = {
        ...form,
        supported_refrigerants: form.supported_refrigerants.split(",").map((x) => x.trim()).filter(Boolean),
        technical_specifications: specs,
        main_functions: form.main_functions.split("\n").filter(Boolean),
      };
      const result = await apiClient.request(id ? `/knowledge-machines/${id}` : "/knowledge-machines", {
        method: id ? "PATCH" : "POST",
        body: JSON.stringify(body),
      });
      navigate(`/knowledge-base/${result.id || id}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <Link
        to={id ? `/knowledge-base/${id}` : "/knowledge-base"}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> {id ? "Back" : "Knowledge Base"}
      </Link>

      <form onSubmit={submit} className="bg-card border border-border rounded-xl p-5 sm:p-6 space-y-5 animate-fade-in">
        <h1 className="text-xl font-heading font-bold text-foreground">
          {id ? "Edit" : "Add"} Knowledge Machine
        </h1>

        <div className="grid sm:grid-cols-2 gap-4">
          {Object.keys(FIELD_LABELS).map((key) => (
            <div key={key} className={key === "category" ? "sm:col-span-2" : ""}>
              <Label>{FIELD_LABELS[key]}</Label>
              <Input
                value={form[key] || ""}
                onChange={(e) => set(key, e.target.value)}
                required={REQUIRED_FIELDS.includes(key)}
                className="mt-1.5 h-10"
              />
            </div>
          ))}
        </div>

        <div>
          <Label>Summary</Label>
          <Textarea value={form.summary || ""} onChange={(e) => set("summary", e.target.value)} className="mt-1.5" rows={3} />
        </div>

        <div>
          <Label>Supported refrigerants</Label>
          <Input
            value={form.supported_refrigerants || ""}
            onChange={(e) => set("supported_refrigerants", e.target.value)}
            placeholder="e.g. R32, R410A, R290"
            className="mt-1.5 h-10"
          />
          <p className="text-xs text-muted-foreground mt-1">Comma-separated.</p>
        </div>

        <div>
          <Label>Technical specifications</Label>
          <Textarea
            rows={6}
            value={form.technical_specifications || ""}
            onChange={(e) => set("technical_specifications", e.target.value)}
            placeholder={"Cooling capacity: 12kW\nWeight: 45kg"}
            className="mt-1.5 font-mono text-sm"
          />
          <p className="text-xs text-muted-foreground mt-1">One "Name: Value" pair per line.</p>
        </div>

        <div>
          <Label>Main functions</Label>
          <Textarea
            rows={5}
            value={form.main_functions || ""}
            onChange={(e) => set("main_functions", e.target.value)}
            placeholder={"Cooling\nHeating\nDehumidification"}
            className="mt-1.5"
          />
          <p className="text-xs text-muted-foreground mt-1">One function per line.</p>
        </div>

        <div className="flex gap-2 justify-end pt-2">
          <Button type="button" variant="ghost" onClick={() => navigate(id ? `/knowledge-base/${id}` : "/knowledge-base")}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving || !form.manufacturer?.trim() || !form.model_name?.trim()}>
            {saving ? "Saving…" : "Save Knowledge Machine"}
          </Button>
        </div>
      </form>
    </div>
  );
}
