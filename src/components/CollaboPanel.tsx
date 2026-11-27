import { useState } from "react";
import { Copy, Send, Users, X } from "lucide-react";
import type { ChatMessage, Participant } from "../lib/collab";

/** Tools → CollaboWriter: session status, who's here, chat. */
export function CollaboPanel({ code, host, status, detail, participants, messages, selfId, onChat, onLeave, onClose }: {
  code: string; host: boolean; status: string; detail?: string; participants: Participant[]; messages: ChatMessage[]; selfId: string;
  onChat(text: string): void; onLeave(): void; onClose(): void;
}) {
  const [text, setText] = useState("");
  const [copied, setCopied] = useState(false);
  return <aside className="collab-panel" aria-label="CollaboWriter">
    <header><Users size={16}/><strong>CollaboWriter</strong><button className="icon-button" aria-label="Hide CollaboWriter panel" onClick={onClose}><X size={15}/></button></header>
    <div className="collab-code"><span>Session code</span><strong>{code}</strong><button className="icon-button" aria-label="Copy session code" onClick={async () => { await navigator.clipboard?.writeText(code).catch(() => undefined); setCopied(true); setTimeout(() => setCopied(false), 1500); }}><Copy size={14}/></button>{copied && <small>Copied</small>}</div>
    <p className={`collab-status ${status}`}>{status === "connected" ? (host ? "Hosting — share the code with your co-writer." : "Connected to the host's script.") : status === "connecting" ? "Connecting…" : status === "error" ? detail ?? "Connection problem." : "Not connected."}</p>
    <ul className="collab-people">{participants.map((person) => <li key={person.id}><span className="dot" style={{ background: person.colour }}/>{person.name}{person.id === selfId ? " (you)" : ""}{person.host ? " · host" : ""}</li>)}</ul>
    <div className="collab-chat" aria-live="polite">{messages.map((message) => <p key={message.id} className={message.from === selfId ? "mine" : ""}><strong>{message.name}</strong> {message.text}</p>)}{!messages.length && <p className="hint">Chat with your co-writers here.</p>}</div>
    <form className="collab-send" onSubmit={(event) => { event.preventDefault(); if (text.trim()) { onChat(text.trim()); setText(""); } }}><input aria-label="Chat message" value={text} placeholder="Message" onChange={(event) => setText(event.target.value)}/><button className="icon-button" aria-label="Send"><Send size={15}/></button></form>
    <button className="secondary" onClick={onLeave}>{host ? "End session" : "Leave session"}</button>
  </aside>;
}
