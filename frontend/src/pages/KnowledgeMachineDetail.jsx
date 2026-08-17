import React, { useEffect, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { apiClient } from "@/api/apiClient";
import { useAuth } from "@/lib/AuthContext";
import { uploadKnowledgeMedia, uploadKnowledgeDocument, getKnowledgeFileSignedUrl } from "@/services/supabase/storage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger
} from "@/components/ui/alert-dialog";
import NoteRecord from "@/components/NoteRecord";
import { ArrowLeft, Pencil, Trash2, FileText, Image as ImageIcon, KeyRound, StickyNote, Eye, EyeOff, Upload } from "lucide-react";
import moment from "moment";

export default function KnowledgeMachineDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [machine, setMachine] = useState(null);
  const [codes, setCodes] = useState([]);
  const [revealed, setRevealed] = useState({});
  const [note, setNote] = useState({ title: "", note_type: "troubleshooting", content: "" });
  const [savingNote, setSavingNote] = useState(false);

  const load = async () => {
    const [item, notes, media, documents, serviceCodes] = await Promise.all([
      apiClient.request(`/knowledge-machines/${id}`),
      apiClient.request(`/knowledge-machines/${id}/notes`),
      apiClient.request(`/knowledge-machines/${id}/media`),
      apiClient.request(`/knowledge-machines/${id}/documents`),
      user?.role !== "accountant" ? apiClient.request(`/knowledge-machines/${id}/service-codes`) : [],
    ]);
    setMachine({ ...item, notes, media, documents });
    setCodes(serviceCodes || []);
  };

  useEffect(() => { load().catch((error) => console.error("Knowledge detail load failed", error)); }, [id]);

  const addNote = async (event) => {
    event.preventDefault();
    setSavingNote(true);
    try {
      await apiClient.request(`/knowledge-machines/${id}/notes`, { method: "POST", body: JSON.stringify(note) });
      setNote({ title: "", note_type: "troubleshooting", content: "" });
      await load();
    } finally {
      setSavingNote(false);
    }
  };

  const reveal = async (code) => {
    const result = await apiClient.request(`/knowledge-service-codes/${code.id}/reveal`, { method: "POST" });
    setRevealed((current) => ({ ...current, [code.id]: result.service_code }));
  };

  // 2026-08-16, explicit user request: "delete... knowledge base". knowledge_notes/
  // knowledge_service_codes/knowledge_media/knowledge_documents all cascade-delete with the
  // parent knowledge_machines row (0001_initial_schema.sql), so the database side is a clean,
  // complete deletion. NOT solved here, disclosed limitation: any uploaded media/document
  // files stay in Supabase Storage (deleting a row does not delete its Storage object) --
  // same pre-existing gap already documented in KNOWN_ISSUES.md for this feature area, not
  // introduced by this change.
  const handleDelete = async () => {
    await apiClient.request(`/knowledge-machines/${id}`, { method: "DELETE" });
    navigate("/knowledge-base");
  };

  // FIX (2026-08-17): used to call apiClient.integrations.Core.UploadFile() and persist its
  // 7-day signed URL directly into file_url -- the live bug documented in
  // docs/ai-memory/KNOWN_ISSUES.md ("KB photo/document uploads permanently break 7 days after
  // upload"). Now stores the PERMANENT Storage object path instead (same discipline as
  // service_records/job_cards photos); see storage.js's uploadKnowledgeMedia()/
  // uploadKnowledgeDocument() for the full writeup, and 0029_knowledge_base_permanent_file_paths.sql
  // for the matching bucket-RLS fix (the old owner-scoped `documents` bucket policy also made
  // this file invisible to any technician besides whoever uploaded it -- a second, independent
  // bug this same migration closes).
  const upload = async (event, type) => {
    const files = [...event.target.files];
    for (const file of files) {
      const file_url = type === "media"
        ? await uploadKnowledgeMedia(id, file)
        : await uploadKnowledgeDocument(id, file);
      await apiClient.request(`/knowledge-machines/${id}/${type}`, {
        method: "POST",
        body: JSON.stringify({ file_url, original_filename: file.name, title: file.name }),
      });
    }
    await load();
  };

  // file_url is now a permanent Storage object PATH, not a ready-to-use URL -- resolve a
  // fresh signed URL at click time and never persist the result.
  const openFile = async (path) => {
    try {
      const signedUrl = await getKnowledgeFileSignedUrl(path);
      window.open(signedUrl, "_blank");
    } catch (error) {
      console.error("Unable to open this file", error);
    }
  };

  if (!machine) {
    return (
      <div className="max-w-4xl mx-auto space-y-4">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-32 rounded-xl" />
        <Skeleton className="h-48 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <Link to="/knowledge-base" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Knowledge Base
      </Link>

      {/* Identity header */}
      <div className="bg-card border border-border rounded-xl p-5 sm:p-6 mb-5 animate-fade-in">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-primary uppercase tracking-wide">{machine.manufacturer}</p>
            <h1 className="text-xl sm:text-2xl font-heading font-bold text-foreground mt-1">
              {machine.model_name} {machine.variant}
            </h1>
            {machine.summary && <p className="text-sm text-muted-foreground mt-2 max-w-2xl">{machine.summary}</p>}
          </div>
          {user?.role === "admin" && (
            <div className="flex gap-2 shrink-0">
              <Link to={`/knowledge-base/${id}/edit`}>
                <Button variant="outline" size="sm" className="gap-2"><Pencil className="w-3.5 h-3.5" /> Edit</Button>
              </Link>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="icon" className="text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/30">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete Knowledge Base Entry?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently delete <strong>{machine.manufacturer} {machine.model_name} {machine.variant}</strong>{" "}
                      and all its notes, service codes, photos, and documents.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          )}
        </div>
      </div>

      <div className="space-y-5">
        {/* Overview */}
        <Section title="Overview">
          <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1 mb-3">
            <InfoRow label="Product code" value={machine.product_code} />
            <InfoRow label="Category" value={machine.category} />
          </div>
          {machine.supported_refrigerants?.length > 0 && (
            <div className="flex gap-1.5 flex-wrap mb-3">
              {machine.supported_refrigerants.map((r) => <Badge key={r} variant="neutral">{r}</Badge>)}
            </div>
          )}
          {Object.keys(machine.technical_specifications || {}).length > 0 && (
            <div className="border border-border rounded-lg overflow-hidden mb-3">
              {Object.entries(machine.technical_specifications).map(([key, value]) => (
                <div key={key} className="grid grid-cols-2 px-3 py-2 border-b border-border last:border-0 text-sm">
                  <dt className="text-muted-foreground">{key}</dt>
                  <dd className="text-foreground font-medium text-right">{value}</dd>
                </div>
              ))}
            </div>
          )}
          {machine.main_functions?.length > 0 && (
            <ul className="list-disc pl-5 space-y-1 text-sm text-foreground">
              {machine.main_functions.map((item) => <li key={item}>{item}</li>)}
            </ul>
          )}
        </Section>

        {/* Notes */}
        <Section title="Notes" icon={StickyNote}>
          {machine.notes?.length > 0 ? (
            <div className="mb-1">
              {machine.notes.map((item) => (
                <NoteRecord key={item.id} title={item.title} date={item.created_at ? moment(item.created_at).format("D MMM YYYY") : undefined}>
                  {item.content}
                </NoteRecord>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-2">No notes yet.</p>
          )}
          {user?.role !== "accountant" && (
            <form onSubmit={addNote} className="space-y-2.5 mt-4 pt-4 border-t border-border">
              <Input
                placeholder="Note title"
                value={note.title}
                onChange={(event) => setNote({ ...note, title: event.target.value })}
                className="h-10"
              />
              <Textarea
                placeholder="Troubleshooting or maintenance note…"
                value={note.content}
                onChange={(event) => setNote({ ...note, content: event.target.value })}
                rows={3}
              />
              <Button type="submit" size="sm" disabled={savingNote || !note.content.trim()}>
                {savingNote ? "Saving…" : "Add Note"}
              </Button>
            </form>
          )}
        </Section>

        {/* Photos */}
        <Section title="Photos" icon={ImageIcon}>
          {user?.role !== "accountant" && (
            <label className="inline-flex items-center gap-2 text-sm text-primary hover:underline cursor-pointer mb-3">
              <Upload className="w-3.5 h-3.5" /> Upload photos
              <input type="file" multiple accept="image/jpeg,image/png,image/webp,image/heic,image/heif" onChange={(event) => upload(event, "media")} className="hidden" />
            </label>
          )}
          {machine.media?.length > 0 ? (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {machine.media.map((item) => (
                <button
                  key={item.id}
                  onClick={() => openFile(item.file_url)}
                  className="aspect-square rounded-lg overflow-hidden border border-border hover:border-primary/50 transition-colors duration-150 bg-secondary flex items-center justify-center text-xs text-muted-foreground p-2 text-center"
                >
                  {item.caption || item.original_filename}
                </button>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No photos yet.</p>
          )}
        </Section>

        {/* Service codes */}
        {user?.role !== "accountant" && (
          <Section title="Service Codes" icon={KeyRound}>
            {codes.length === 0 ? (
              <p className="text-sm text-muted-foreground">No service codes recorded.</p>
            ) : (
              <div className="divide-y divide-border">
                {codes.map((code) => (
                  <div key={code.id} className="flex items-center justify-between py-2.5">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">{code.function_name}</p>
                      <p className="text-sm text-muted-foreground font-mono tracking-wider mt-0.5">
                        {revealed[code.id] || "••••••••"}
                      </p>
                    </div>
                    <Button variant="outline" size="sm" className="gap-1.5 shrink-0" onClick={() => reveal(code)}>
                      {revealed[code.id] ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                      {revealed[code.id] ? "Revealed" : "Reveal"}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </Section>
        )}

        {/* Documents */}
        <Section title="Documents" icon={FileText}>
          {user?.role === "admin" && (
            <label className="inline-flex items-center gap-2 text-sm text-primary hover:underline cursor-pointer mb-3">
              <Upload className="w-3.5 h-3.5" /> Upload document
              <input type="file" accept="application/pdf" onChange={(event) => upload(event, "documents")} className="hidden" />
            </label>
          )}
          {machine.documents?.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {machine.documents.map((item) => (
                <Button variant="outline" size="sm" key={item.id} className="gap-1.5" onClick={() => openFile(item.file_url)}>
                  <FileText className="w-3.5 h-3.5" /> {item.title}
                </Button>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No documents yet.</p>
          )}
        </Section>
      </div>
    </div>
  );
}

function Section({ title, icon: Icon, children }) {
  return (
    <section className="bg-card border border-border rounded-xl px-5 py-4">
      <h2 className="font-heading font-semibold text-foreground text-sm flex items-center gap-1.5 mb-3">
        {Icon && <Icon className="w-3.5 h-3.5 text-muted-foreground" />}
        {title}
      </h2>
      {children}
    </section>
  );
}

function InfoRow({ label, value }) {
  if (!value) return null;
  return (
    <div className="flex justify-between text-sm py-1">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-foreground font-medium">{value}</span>
    </div>
  );
}
