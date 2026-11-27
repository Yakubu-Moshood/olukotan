import { useEscape } from "./dialogs/Modal";
import { useState } from "react";
import { X } from "lucide-react";
import { parseTitlePage, serializeTitlePage, type TitlePageFields } from "../lib/pagination";

const FIELDS: { key: keyof TitlePageFields; label: string; multiline?: boolean; placeholder?: string }[] = [
  { key: "title", label: "Title" },
  { key: "credit", label: "Credit", placeholder: "written by" },
  { key: "author", label: "Author(s)", multiline: true },
  { key: "source", label: "Based on", multiline: true, placeholder: "Based on the novel by…" },
  { key: "draftDate", label: "Draft date" },
  { key: "contact", label: "Contact", multiline: true, placeholder: "Agent, company, email, phone" },
  { key: "copyright", label: "Copyright / registration" },
  { key: "notes", label: "Notes", multiline: true },
];

/** Edits the title page, stored as standard Fountain title-page keys so other tools read it. */
export function TitlePageDialog({ preamble, fallbackTitle, fallbackAuthor, onSave, onClose }: {
  preamble: string; fallbackTitle: string; fallbackAuthor: string; onSave(preamble: string): void; onClose(): void;
}) {
  useEscape(onClose);
  const [fields, setFields] = useState<TitlePageFields>(() => {
    const parsed = parseTitlePage(preamble);
    return { ...parsed, title: parsed.title ?? fallbackTitle, author: parsed.author ?? fallbackAuthor, credit: parsed.credit ?? "written by" };
  });
  return <div className="modal-backdrop" onMouseDown={onClose}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="title-page-heading" onMouseDown={(event) => event.stopPropagation()}>
    <button className="icon-button modal-close" onClick={onClose} aria-label="Close"><X size={19}/></button>
    <p className="eyebrow">Document</p><h2 id="title-page-heading">Title Page</h2>
    <form onSubmit={(event) => { event.preventDefault(); onSave(serializeTitlePage(fields, preamble)); }}>
      {FIELDS.map((field) => <label key={field.key}>{field.label}{field.multiline
        ? <textarea rows={2} value={fields[field.key] ?? ""} placeholder={field.placeholder} onChange={(event) => setFields({ ...fields, [field.key]: event.target.value })}/>
        : <input value={fields[field.key] ?? ""} placeholder={field.placeholder} onChange={(event) => setFields({ ...fields, [field.key]: event.target.value })}/>}</label>)}
      <p className="hint">Saved as standard Fountain title-page fields, so other screenwriting apps can read it.</p>
      <div className="modal-actions"><button type="button" className="secondary" onClick={onClose}>Cancel</button><button className="primary">Save title page</button></div>
    </form>
  </section></div>;
}
