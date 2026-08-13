import React from "react";

// Shared note-record pattern (design system). Used by ClientDetail, MachineDetail,
// and KnowledgeMachineDetail so client notes, equipment notes, and knowledge-base
// notes all look like the same professional business record -- author + date +
// body, deliberately NOT chat-bubble styling. Architected to host a real list of
// author/date-stamped notes (see KnowledgeMachineDetail, which already has one)
// without any further redesign.
export default function NoteRecord({ title, author, date, children }) {
  return (
    <div className="py-4 border-b border-border last:border-0">
      {(title || author || date) && (
        <div className="flex items-baseline justify-between gap-2 mb-1.5">
          {title && <span className="text-sm font-medium text-foreground">{title}</span>}
          <div className="flex items-baseline gap-2 ml-auto">
            {author && <span className="text-xs text-muted-foreground">{author}</span>}
            {date && <span className="text-xs text-muted-foreground">{date}</span>}
          </div>
        </div>
      )}
      <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap">{children}</p>
    </div>
  );
}
