import React, { useEffect, useMemo, useRef, useState } from "react";
import { dashboardNotesClient } from "@/api/dashboardNotesClient";
import { apiClient } from "@/api/apiClient";
import { useAuth } from "@/lib/AuthContext";
import { Link } from "react-router-dom";
import { Plus, X, StickyNote, Building2, Search, Check } from "lucide-react";
import moment from "moment";

// Dashboard sticky notes -- GLOBAL (every signed-in user sees every note), explicit user
// request 2026-08-13 + follow-up correction. Only the note's creator or an admin may edit
// or delete it -- enforced server-side by the dashboardNotes Cloud Function (see
// functions/lib/dashboardNotes.js), not just hidden in this UI. Data lives in Supabase per
// explicit instruction, reached via a Cloud Function since the live app authenticates with
// Firebase and has no Supabase session (see dashboardNotesClient.js for the full reason).
//
// A note may optionally be linked to a client (client_id is a real, live Firestore client
// ID) -- shown as a colored label on the note, per follow-up user request.
const COLORS = {
  yellow: "bg-amber-50 border-amber-200 text-amber-950",
  blue: "bg-sky-50 border-sky-200 text-sky-950",
  green: "bg-emerald-50 border-emerald-200 text-emerald-950",
  pink: "bg-rose-50 border-rose-200 text-rose-950",
};
const COLOR_KEYS = Object.keys(COLORS);
// Distinct, restrained palette for the "linked to a client" label itself, independent of
// the note's own background color, so it reads clearly against any of the 4 note colors.
const CLIENT_LABEL_CLASS = "bg-primary/10 text-primary border-primary/20";

export default function StickyNotes() {
  const { user } = useAuth();
  const [notes, setNotes] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [linkedClientId, setLinkedClientId] = useState(null);
  const [showClientPicker, setShowClientPicker] = useState(false);
  const draftRef = useRef(null);

  const load = async () => {
    try {
      const [noteData, clientData] = await Promise.all([
        dashboardNotesClient.list(),
        apiClient.entities.Client.list(),
      ]);
      setNotes(noteData);
      setClients(clientData || []);
    } catch (e) {
      console.error("Failed to load dashboard notes:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);
  useEffect(() => { if (adding) draftRef.current?.focus(); }, [adding]);

  const clientMap = useMemo(() => Object.fromEntries(clients.map((c) => [c.id, c])), [clients]);

  const resetDraft = () => { setDraft(""); setAdding(false); setLinkedClientId(null); setShowClientPicker(false); };

  const addNote = async () => {
    const content = draft.trim();
    if (!content) { resetDraft(); return; }
    const color = COLOR_KEYS[notes.length % COLOR_KEYS.length];
    const clientId = linkedClientId;
    resetDraft();
    try {
      const created = await dashboardNotesClient.create({ content, color, client_id: clientId });
      setNotes((prev) => [created, ...prev]);
    } catch (e) {
      console.error("Failed to add note:", e);
    }
  };

  const updateNote = async (id, content) => {
    setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, content } : n)));
    try {
      await dashboardNotesClient.update(id, { content });
    } catch (e) {
      console.error("Failed to update note:", e);
      load();
    }
  };

  const deleteNote = async (id) => {
    setNotes((prev) => prev.filter((n) => n.id !== id));
    try {
      await dashboardNotesClient.remove(id);
    } catch (e) {
      console.error("Failed to delete note:", e);
      load();
    }
  };

  if (loading) return null;

  return (
    <section className="bg-card rounded-xl border border-border animate-slide-up" style={{ animationDelay: "200ms" }}>
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <h2 className="font-heading font-semibold text-foreground flex items-center gap-2">
          <StickyNote className="w-4.5 h-4.5 text-primary" />
          Notes
        </h2>
        <button
          onClick={() => setAdding(true)}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
        >
          <Plus className="w-3.5 h-3.5" /> Add note
        </button>
      </div>

      <div className="p-5">
        {notes.length === 0 && !adding ? (
          <p className="text-sm text-muted-foreground py-2">
            No notes yet. Add a quick reminder — visible to the whole team.
          </p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {adding && (
              <div className={`rounded-lg border p-3 min-h-[120px] flex flex-col gap-2 ${COLORS[COLOR_KEYS[notes.length % COLOR_KEYS.length]]}`}>
                <textarea
                  ref={draftRef}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); addNote(); }
                    if (e.key === "Escape") resetDraft();
                  }}
                  placeholder="Type a note…"
                  className="flex-1 bg-transparent resize-none text-sm outline-none placeholder:text-current placeholder:opacity-50"
                />
                {linkedClientId && clientMap[linkedClientId] && (
                  <ClientLabel name={clientMap[linkedClientId].company_name} onRemove={() => setLinkedClientId(null)} />
                )}
                {showClientPicker ? (
                  <ClientPicker
                    clients={clients}
                    onSelect={(id) => { setLinkedClientId(id); setShowClientPicker(false); }}
                    onClose={() => setShowClientPicker(false)}
                  />
                ) : (
                  <div className="flex items-center justify-between gap-2">
                    {!linkedClientId && (
                      <button
                        type="button"
                        onClick={() => setShowClientPicker(true)}
                        className="inline-flex items-center gap-1 text-xs opacity-70 hover:opacity-100 transition-opacity"
                      >
                        <Building2 className="w-3 h-3" /> Link client
                      </button>
                    )}
                    <button type="button" onClick={addNote} className="ml-auto inline-flex items-center gap-1 text-xs font-medium opacity-80 hover:opacity-100">
                      <Check className="w-3.5 h-3.5" /> Save
                    </button>
                  </div>
                )}
              </div>
            )}
            {notes.map((note) => (
              <StickyNoteCard
                key={note.id}
                note={note}
                client={note.client_id ? clientMap[note.client_id] : null}
                canManage={user?.id === note.created_by || user?.role === "admin"}
                onChange={(content) => updateNote(note.id, content)}
                onDelete={() => deleteNote(note.id)}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function ClientLabel({ name, onRemove }) {
  return (
    <span className={`inline-flex items-center gap-1 self-start text-[11px] font-medium px-2 py-0.5 rounded-full border ${CLIENT_LABEL_CLASS}`}>
      <Building2 className="w-3 h-3" /> {name}
      {onRemove && (
        <button type="button" onClick={onRemove} className="hover:opacity-70">
          <X className="w-3 h-3" />
        </button>
      )}
    </span>
  );
}

function ClientPicker({ clients, onSelect, onClose }) {
  const [search, setSearch] = useState("");
  const filtered = clients.filter((c) => c.company_name?.toLowerCase().includes(search.toLowerCase())).slice(0, 6);
  return (
    <div className="rounded-md border border-current/20 bg-card text-foreground p-2">
      <div className="relative mb-1.5">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
        <input
          autoFocus
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search clients…"
          className="w-full pl-6 h-7 text-xs bg-transparent outline-none border border-border rounded"
        />
      </div>
      <div className="max-h-32 overflow-y-auto space-y-0.5">
        {filtered.length === 0 && <p className="text-xs text-muted-foreground px-1 py-1">No matches</p>}
        {filtered.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => onSelect(c.id)}
            className="w-full text-left text-xs px-1.5 py-1 rounded hover:bg-secondary truncate"
          >
            {c.company_name}
          </button>
        ))}
      </div>
      <button type="button" onClick={onClose} className="text-[11px] text-muted-foreground hover:text-foreground mt-1">
        Cancel
      </button>
    </div>
  );
}

function StickyNoteCard({ note, client, canManage, onChange, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(note.content);

  const commit = () => {
    setEditing(false);
    if (value.trim() && value !== note.content) onChange(value.trim());
    else setValue(note.content);
  };

  return (
    <div className={`group relative rounded-lg border p-3 min-h-[120px] flex flex-col gap-2 transition-shadow duration-200 hover:shadow-md ${COLORS[note.color] || COLORS.yellow}`}>
      {canManage && (
        <button
          onClick={onDelete}
          aria-label="Delete note"
          className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-black/10 transition-opacity duration-150"
        >
          <X className="w-3 h-3" />
        </button>
      )}
      {editing ? (
        <textarea
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === "Escape") { setValue(note.content); setEditing(false); } }}
          className="flex-1 bg-transparent resize-none text-sm outline-none"
        />
      ) : (
        <p
          onClick={() => canManage && setEditing(true)}
          className={`flex-1 text-sm whitespace-pre-wrap pr-4 ${canManage ? "cursor-text" : ""}`}
        >
          {note.content}
        </p>
      )}
      {client && (
        <Link to={`/clients/${client.id}`} onClick={(e) => e.stopPropagation()}>
          <ClientLabel name={client.company_name} />
        </Link>
      )}
      <div className="flex items-center justify-between text-[10px] opacity-60">
        <span className="truncate">{note.created_by_name || "Someone"}</span>
        {note.created_at && <span className="shrink-0 ml-2">{moment(note.created_at).format("D MMM")}</span>}
      </div>
    </div>
  );
}
