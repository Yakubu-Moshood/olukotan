import { X } from "lucide-react";
import { useEffect } from "react";

/** Shared dialog frame: title, scrollable body, footer buttons. Escape closes. Non-modal dialogs (Find) don't dim the script. */
export function Modal({ title, eyebrow, onClose, children, footer, width = 560, modeless = false, className = "" }: {
  title: string; eyebrow?: string; onClose(): void; children: React.ReactNode; footer?: React.ReactNode; width?: number; modeless?: boolean; className?: string;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") { event.stopPropagation(); onClose(); } };
    window.addEventListener("keydown", onKey, true); return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);
  const dialog = <section className={`ol-dialog ${modeless ? "modeless" : ""} ${className}`} role="dialog" aria-modal={!modeless} aria-label={title} style={{ width: `min(${width}px, calc(100vw - 24px))` }} onMouseDown={(event) => event.stopPropagation()}>
    <header><div>{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h2>{title}</h2></div><button className="icon-button" aria-label={`Close ${title}`} onClick={onClose}><X size={18}/></button></header>
    <div className="ol-dialog-body">{children}</div>
    {footer && <footer>{footer}</footer>}
  </section>;
  return modeless ? <div className="ol-dialog-float">{dialog}</div> : <div className="ol-dialog-backdrop" onMouseDown={onClose}>{dialog}</div>;
}

export const Field = ({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) =>
  <label className="ol-field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;
export const Check = ({ label, checked, onChange, disabled }: { label: string; checked: boolean; onChange(value: boolean): void; disabled?: boolean }) =>
  <label className="ol-check"><input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)}/><span>{label}</span></label>;

/** A small replacement for window.prompt (which desktop WebViews may block). */
export function PromptDialog({ title, label, initial = "", confirmLabel = "OK", onSubmit, onClose, validate }: {
  title: string; label: string; initial?: string; confirmLabel?: string; onSubmit(value: string): void; onClose(): void; validate?(value: string): string | undefined;
}) {
  let value = initial;
  return <Modal title={title} onClose={onClose} width={420}>
    <form onSubmit={(event) => { event.preventDefault(); const input = (event.currentTarget.elements.namedItem("value") as HTMLInputElement).value; const error = validate?.(input); if (error) { (event.currentTarget.querySelector(".error") as HTMLElement).textContent = error; return; } onSubmit(input); }}>
      <Field label={label}><input name="value" autoFocus defaultValue={value} onChange={(event) => { value = event.target.value; }}/></Field>
      <div className="error" role="alert"></div>
      <div className="ol-actions"><button type="button" className="secondary" onClick={onClose}>Cancel</button><button className="primary">{confirmLabel}</button></div>
    </form>
  </Modal>;
}

/** Replacement for window.confirm with clear wording. */
export function ConfirmDialog({ title, message, confirmLabel, danger, onConfirm, onClose }: { title: string; message: string; confirmLabel: string; danger?: boolean; onConfirm(): void; onClose(): void }) {
  return <Modal title={title} onClose={onClose} width={440} footer={<><button className="secondary" onClick={onClose}>Cancel</button><button className={danger ? "danger" : "primary"} autoFocus onClick={() => { onConfirm(); onClose(); }}>{confirmLabel}</button></>}>
    <p className="ol-message">{message}</p>
  </Modal>;
}

/** Closes a dialog on Escape (for dialogs that don't use <Modal>). */
export function useEscape(onClose: () => void) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") { event.stopPropagation(); onClose(); } };
    window.addEventListener("keydown", onKey, true); return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);
}
