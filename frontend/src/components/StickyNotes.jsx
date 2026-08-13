import React, { useEffect, useRef, useState } from "react";
import { apiClient } from "@/api/apiClient";
import { useAuth } from "@/lib/AuthContext";
import { Plus, X, StickyNote } from "lucide-react";
import moment from "moment";

// Personal dashboard sticky notes (explicit user request, 2026-08-13) -- "something like
// Windows sticky notes": quick personal reminders, own-notes-only (see firestore.rules'
// dashboard_notes match block for the real security boundary), editable inline, a small
// palette of restrained pastel colors (not neon) matching the rest of the app's calm
// design language rather than a literal skeuomorphic yellow-post-it look.
const COLORS = {
  yellow: "bg-amber-50 border-amber-200 text-amber-950",
  blue: "bg-sky-50 border-sky-200 text-sky-950",
  green: "bg-emerald-50 border-emerald-200 text-emerald-950",
  pink: "bg-rose-50 border-rose-200 text-rose-950",
};
const COLOR_KEYS = Object.keys(COLORS);

export default function StickyNotes() {
  const { user } = useAuth();
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const draftRef = useRef(null);

  const load = async () => {
    if (!user?.id) return;
    try {
      const data = await apiClient.entities.DashboardNote.filter({ created_by: user.id });
      setNotes(data.sort((a, b) => (b.created_at || "").localeCompare(a.created_at || "")));
    } catch (e) {
      console.error("Failed to load dashboard notes:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [user?.id]);
  useEffect(() => { if (adding) draftRef.current?.focus(); }, [adding]);

  const addNote = async () => {
    const content = draft.trim();
    if (!content) { setAdding(false); setDraft(""); return; }
    const color = COLOR_KEYS[notes.length % COLOR_KEYS.length];
    setDraft(""); setAdding(false);
    try {
      const created = await apiClient.entities.DashboardNote.create({ content, color, created_by: user.id });
      setNotes((prev) => [created, ...prev]);
    } catch (e) {
      console.error("Failed to add note:", e);
    }
  };

  const updateNote = async (id, content) => {
    setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, content } : n)));
    try {
      await apiClient.entities.DashboardNote.update(id, { content });
    } catch (e) {
      console.error("Failed to update note:", e);
      load();
    }
  };

  const deleteNote = async (id) => {
    setNotes((prev) => prev.filter((n) => n.id !== id));
    try {
      await apiClient.entities.DashboardNote.delete(id);
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
            No notes yet. Add a quick personal reminder — only you can see these.
          </p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {adding && (
              <div className={`rounded-lg border p-3 min-h-[110px] flex flex-col ${COLORS[COLOR_KEYS[notes.length % COLOR_KEYS.length]]}`}>
                <textarea
                  ref={draftRef}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={addNote}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); addNote(); }
                    if (e.key === "Escape") { setDraft(""); setAdding(false); }
                  }}
                  placeholder="Type a note…"
                  className="flex-1 bg-transparent resize-none text-sm outline-none placeholder:text-current placeholder:opacity-50"
                />
              </div>
            )}
            {notes.map((note) => (
              <StickyNoteCard key={note.id} note={note} onChange={(content) => updateNote(note.id, content)} onDelete={() => deleteNote(note.id)} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function StickyNoteCard({ note, onChange, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(note.content);

  const commit = () => {
    setEditing(false);
    if (value.trim() && value !== note.content) onChange(value.trim());
    else setValue(note.content);
  };

  return (
    <div className={`group relative rounded-lg border p-3 min-h-[110px] flex flex-col transition-shadow duration-200 hover:shadow-md ${COLORS[note.color] || COLORS.yellow}`}>
      <button
        onClick={onDelete}
        aria-label="Delete note"
        className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-black/10 transition-opacity duration-150"
      >
        <X className="w-3 h-3" />
      </button>
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
        <p onClick={() => setEditing(true)} className="flex-1 text-sm whitespace-pre-wrap cursor-text pr-4">
          {note.content}
        </p>
      )}
      {note.created_at && (
        <p className="text-[10px] opacity-60 mt-2">{moment(note.created_at).format("D MMM")}</p>
      )}
    </div>
  );
}
