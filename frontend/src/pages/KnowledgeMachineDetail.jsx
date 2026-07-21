import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { apiClient } from "@/api/apiClient";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export default function KnowledgeMachineDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const [machine, setMachine] = useState(null);
  const [codes, setCodes] = useState([]);
  const [revealed, setRevealed] = useState({});
  const [note, setNote] = useState({ title: "", note_type: "troubleshooting", content: "" });

  const load = async () => {
    const [item, notes, media, documents, serviceCodes] = await Promise.all([
      apiClient.request(`/knowledge-machines/${id}`),
      apiClient.request(`/knowledge-machines/${id}/notes`),
      apiClient.request(`/knowledge-machines/${id}/media`),
      apiClient.request(`/knowledge-machines/${id}/documents`),
      user?.role !== "accountant" ? apiClient.request(`/knowledge-machines/${id}/service-codes`) : [],
    ]);
    setMachine({ ...item, notes, media, documents });
    setCodes(serviceCodes);
  };

  useEffect(() => { load().catch((error) => console.error("Knowledge detail load failed", error)); }, [id]);

  if (!machine) return <p>Loading…</p>;

  const addNote = async (event) => {
    event.preventDefault();
    await apiClient.request(`/knowledge-machines/${id}/notes`, {
      method: "POST",
      body: JSON.stringify(note),
    });
    setNote({ title: "", note_type: "troubleshooting", content: "" });
    await load();
  };

  const reveal = async (code) => {
    const result = await apiClient.request(`/knowledge-service-codes/${code.id}/reveal`, { method: "POST" });
    setRevealed((current) => ({ ...current, [code.id]: result.service_code }));
  };

  const upload = async (event, type) => {
    const files = [...event.target.files];
    for (const file of files) {
      const { file_url } = await apiClient.integrations.Core.UploadFile({ file });
      await apiClient.request(`/knowledge-machines/${id}/${type}`, {
        method: "POST",
        body: JSON.stringify({
          file_url,
          original_filename: file.name,
          title: file.name,
        }),
      });
    }
    await load();
  };

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <div className="bg-card border rounded-2xl p-6">
        <p className="text-primary font-semibold">{machine.manufacturer}</p>
        <h1 className="text-3xl font-bold">{machine.model_name} {machine.variant}</h1>
        <p>{machine.summary}</p>
        {user?.role === "admin" && <Link to={`/knowledge-base/${id}/edit`}><Button className="mt-3">Edit</Button></Link>}
      </div>

      <Section title="Overview">
        <p>Product code: {machine.product_code || "—"}</p>
        <div className="flex gap-2">{machine.supported_refrigerants?.map((item) => <span className="bg-secondary px-2 py-1 rounded" key={item}>{item}</span>)}</div>
        <dl>{Object.entries(machine.technical_specifications || {}).map(([key, value]) => <div key={key} className="grid grid-cols-2 border-b py-2"><dt>{key}</dt><dd>{value}</dd></div>)}</dl>
        <ul className="list-disc pl-5">{machine.main_functions?.map((item) => <li key={item}>{item}</li>)}</ul>
      </Section>

      <Section title="Notes">
        {machine.notes?.map((item) => <article key={item.id} className="bg-secondary/40 p-3 rounded mb-2"><b>{item.title}</b><p className="whitespace-pre-wrap">{item.content}</p></article>)}
        {user?.role !== "accountant" && <form onSubmit={addNote} className="space-y-2"><Input placeholder="Note title" value={note.title} onChange={(event) => setNote({ ...note, title: event.target.value })}/><Textarea placeholder="Troubleshooting or maintenance note" value={note.content} onChange={(event) => setNote({ ...note, content: event.target.value })}/><Button>Add Note</Button></form>}
      </Section>

      <Section title="Photos">
        {user?.role !== "accountant" && <Input type="file" multiple accept="image/jpeg,image/png,image/webp,image/heic,image/heif" onChange={(event) => upload(event, "media")}/>}
        <div className="grid grid-cols-3 gap-3">{machine.media?.map((item) => <button key={item.id} onClick={() => window.open(item.file_url, "_blank")} className="border p-3 rounded">{item.caption || item.original_filename}</button>)}</div>
      </Section>

      {user?.role !== "accountant" && <Section title="Service Codes">{codes.map((code) => <div key={code.id} className="flex justify-between border-b py-2"><div><b>{code.function_name}</b><p>{revealed[code.id] || "••••••••"}</p></div><Button onClick={() => reveal(code)}>{revealed[code.id] ? "Revealed" : "Reveal"}</Button></div>)}</Section>}

      <Section title="Documents">
        {user?.role === "admin" && <Input type="file" accept="application/pdf" onChange={(event) => upload(event, "documents")}/>}
        {machine.documents?.map((item) => <Button variant="outline" key={item.id} onClick={() => window.open(item.file_url, "_blank")}>{item.title}</Button>)}
      </Section>
    </div>
  );
}

function Section({ title, children }) {
  return <section className="bg-card border rounded-2xl p-5 space-y-3"><h2 className="text-xl font-bold">{title}</h2>{children}</section>;
}
