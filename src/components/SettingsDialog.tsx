import { useState } from "react";
import { FolderOpen, X } from "lucide-react";
import { desktop } from "../platform";
import type { AppSettings } from "../types";

export function SettingsDialog({ initial, onClose, onSave, webMode }: { initial: AppSettings; onClose(): void; onSave(value: AppSettings): Promise<void>; webMode: boolean }) {
  const [value, setValue] = useState(initial); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const choose = async () => { const path = await desktop.chooseFolder("Choose the default project location"); if (path) setValue({ ...value, defaultProjectFolder: path }); };
  return <div className="modal-backdrop"><section className="modal" role="dialog" aria-modal="true" aria-labelledby="settings-title">
    <button className="icon-button modal-close" onClick={onClose} aria-label="Close"><X size={19}/></button><p className="eyebrow">Application</p><h2 id="settings-title">Settings</h2>
    <form onSubmit={async (event) => { event.preventDefault(); setBusy(true); setError(""); try { await onSave(value); } catch (reason) { setError(String(reason)); setBusy(false); } }}>
      <label>Default author<input value={value.defaultAuthor} onChange={(e) => setValue({ ...value, defaultAuthor: e.target.value })}/></label>
      <label>Default project location<div className="path-picker"><input readOnly value={value.defaultProjectFolder}/><button className="secondary" type="button" onClick={choose}><FolderOpen size={17}/> Choose</button></div></label>
      <div className="form-row"><label>Theme<select value={value.theme} onChange={(e) => setValue({ ...value, theme: e.target.value as AppSettings["theme"] })}><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></select></label>
      <label>Autosave delay (seconds)<input type="number" min="2" max="60" value={value.autosaveSeconds} onChange={(e) => setValue({ ...value, autosaveSeconds: Number(e.target.value) })}/></label></div>
      {webMode && <fieldset className="settings-group"><legend>Google Drive</legend><label>OAuth client ID<input value={value.googleClientId} onChange={(e) => setValue({ ...value, googleClientId: e.target.value })} placeholder="000000000000-example.apps.googleusercontent.com"/></label>
        <label className="check-label"><input type="checkbox" checked={value.driveSyncEnabled} onChange={(e) => setValue({ ...value, driveSyncEnabled: e.target.checked })}/><span>Enable explicit Google Drive sync</span></label>
        <p className="hint">Olukotan requests access only to files it creates. Sign-in tokens are kept in memory, not stored in the project.</p></fieldset>}
      <p className="hint">Settings stay on this computer. Telemetry is not collected.</p>{error && <div className="error">{error}</div>}
      <div className="modal-actions"><button type="button" className="secondary" onClick={onClose}>Cancel</button><button className="primary" disabled={busy}>{busy ? "Saving…" : "Save settings"}</button></div>
    </form>
  </section></div>;
}

