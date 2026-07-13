import { Cloud, CloudOff, RefreshCw } from "lucide-react";

export function CloudSyncPanel({ configured, connected, busy, message, onConnect, onSync, onSettings }: {
  configured: boolean; connected: boolean; busy: boolean; message: string; onConnect(): void; onSync(): void; onSettings(): void;
}) {
  return <section className="cloud-panel">
    <div className="cloud-icon">{connected ? <Cloud size={24}/> : <CloudOff size={24}/>}</div>
    <div><p className="eyebrow">Optional cross-device access</p><h2>Google Drive sync</h2>
      <p>{message || (configured ? "Connect only when you want to fetch or send projects." : "Add your Google OAuth client ID in Settings to enable explicit sync.")}</p></div>
    <div className="cloud-actions">{!configured ? <button className="secondary" onClick={onSettings}>Configure</button> : !connected ?
      <button className="primary" onClick={onConnect} disabled={busy}>{busy ? "Connecting…" : "Connect Drive"}</button> :
      <button className="primary" onClick={onSync} disabled={busy}><RefreshCw size={16}/>{busy ? "Syncing…" : "Sync now"}</button>}</div>
  </section>;
}

