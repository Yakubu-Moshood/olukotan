import type { ProjectData } from "../types";
import type { ScreenplayElement } from "./screenplay-elements";

/**
 * Tools → CollaboWriter: live co-writing over Supabase Realtime broadcast.
 *
 * The host shares a session code; partners join with it. Edits travel as
 * element-level patches (upsert / delete / reorder), so two writers in
 * different scenes never overwrite each other. Concurrent edits to the same
 * paragraph resolve last-writer-wins. Nothing is stored on the server: the
 * channel only relays messages between the people in the session.
 */

export interface Participant { id: string; name: string; colour: string; elementId?: string; host: boolean }
export interface ChatMessage { id: string; from: string; name: string; text: string; at: string }

export interface ElementPatch { upserts: { element: ScreenplayElement; after: string | null }[]; deletes: string[]; order?: string[] }

export type CollabMessage =
  | { kind: "patch"; from: string; patch: ElementPatch }
  | { kind: "data"; from: string; projectData: ProjectData }
  | { kind: "snapshot-request"; from: string }
  | { kind: "snapshot"; from: string; to: string; part: number; parts: number; chunk: string }
  | { kind: "chat"; message: ChatMessage };

/** What changed between two versions of the element list. */
export function diffElements(previous: ScreenplayElement[], next: ScreenplayElement[]): ElementPatch | null {
  const before = new Map(previous.map((element) => [element.id, element]));
  const nextIds = new Set(next.map((element) => element.id));
  const deletes = previous.filter((element) => !nextIds.has(element.id)).map((element) => element.id);
  const upserts: ElementPatch["upserts"] = [];
  next.forEach((element, index) => {
    const old = before.get(element.id);
    if (!old || old.text !== element.text || old.type !== element.type || JSON.stringify(old.metadata ?? {}) !== JSON.stringify(element.metadata ?? {}))
      upserts.push({ element, after: index ? next[index - 1].id : null });
  });
  // A reorder (e.g. dragging a scene) changes relative order without changing content.
  const kept = previous.filter((element) => nextIds.has(element.id)).map((element) => element.id);
  const keptNext = next.filter((element) => before.has(element.id)).map((element) => element.id);
  const reordered = kept.some((id, index) => keptNext[index] !== id);
  if (!deletes.length && !upserts.length && !reordered) return null;
  return { upserts, deletes, ...(reordered ? { order: next.map((element) => element.id) } : {}) };
}

/** Applies a partner's patch to the local element list. */
export function applyPatch(elements: ScreenplayElement[], patch: ElementPatch): ScreenplayElement[] {
  const deleted = new Set(patch.deletes);
  let list = elements.filter((element) => !deleted.has(element.id));
  for (const { element, after } of patch.upserts) {
    const existing = list.findIndex((item) => item.id === element.id);
    if (existing >= 0) { list = list.map((item, index) => index === existing ? element : item); continue; }
    const anchor = after === null ? -1 : list.findIndex((item) => item.id === after);
    list = [...list.slice(0, anchor + 1), element, ...list.slice(anchor + 1)];
  }
  if (patch.order) {
    const position = new Map(patch.order.map((id, index) => [id, index]));
    const known = list.filter((element) => position.has(element.id)).sort((a, b) => position.get(a.id)! - position.get(b.id)!);
    const unknown = list.filter((element) => !position.has(element.id));
    list = [...known, ...unknown];
  }
  return list.length ? list : elements;
}

export function sessionCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  const code = [...bytes].map((byte) => alphabet[byte % alphabet.length]).join("");
  return `${code.slice(0, 5)}-${code.slice(5)}`;
}

const COLOURS = ["#d9480f", "#1971c2", "#2f9e44", "#9c36b5", "#e8590c", "#0c8599", "#c2255c"];
const CHUNK = 120_000;

export interface CollabHandlers {
  onMessage(message: CollabMessage): void;
  onParticipants(participants: Participant[]): void;
  onStatus(status: "connecting" | "connected" | "error" | "closed", detail?: string): void;
  /** Host only: the current script for someone who just joined. */
  snapshot?(): string;
}

/** One live session. Uses the Supabase project URL and publishable (anon) key from Options. */
export class CollabSession {
  readonly clientId = crypto.randomUUID();
  readonly colour = COLOURS[Math.floor(Math.random() * COLOURS.length)];
  private channel: import("@supabase/supabase-js").RealtimeChannel | undefined;
  private client: import("@supabase/supabase-js").SupabaseClient | undefined;
  private incoming = new Map<string, string[]>();
  constructor(private url: string, private key: string, readonly code: string, readonly name: string, readonly host: boolean, private handlers: CollabHandlers) {}

  async start(): Promise<void> {
    if (!this.url || !this.key) throw new Error("Add your Supabase project URL and publishable key in Tools → Options → Co-writing first.");
    this.handlers.onStatus("connecting");
    const { createClient } = await import("@supabase/supabase-js");
    this.client = createClient(this.url, this.key, { auth: { persistSession: false, autoRefreshToken: false } });
    const channel = this.client.channel(`olukotan-${this.code}`, { config: { broadcast: { self: false }, presence: { key: this.clientId } } });
    this.channel = channel;
    channel.on("broadcast", { event: "op" }, ({ payload }) => this.receive(payload as CollabMessage));
    channel.on("presence", { event: "sync" }, () => {
      const state = channel.presenceState<Participant>();
      this.handlers.onParticipants(Object.values(state).flat().map((entry) => ({ id: entry.id, name: entry.name, colour: entry.colour, elementId: entry.elementId, host: entry.host })));
    });
    await new Promise<void>((resolve, reject) => {
      channel.subscribe(async (status, error) => {
        if (status === "SUBSCRIBED") {
          await channel.track({ id: this.clientId, name: this.name, colour: this.colour, host: this.host });
          this.handlers.onStatus("connected");
          if (!this.host) this.send({ kind: "snapshot-request", from: this.clientId });
          resolve();
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          const detail = error?.message ?? "Couldn't reach the co-writing service. Check the Supabase URL and key, and your connection.";
          this.handlers.onStatus("error", detail); reject(new Error(detail));
        } else if (status === "CLOSED") this.handlers.onStatus("closed");
      });
    });
  }

  private receive(message: CollabMessage) {
    if (message.kind === "snapshot-request" && this.host && this.handlers.snapshot) {
      const text = this.handlers.snapshot();
      const parts = Math.max(1, Math.ceil(text.length / CHUNK));
      for (let part = 0; part < parts; part++) this.send({ kind: "snapshot", from: this.clientId, to: message.from, part, parts, chunk: text.slice(part * CHUNK, (part + 1) * CHUNK) });
      return;
    }
    if (message.kind === "snapshot") {
      if (message.to !== this.clientId) return;
      const chunks = this.incoming.get(message.from) ?? []; chunks[message.part] = message.chunk; this.incoming.set(message.from, chunks);
      if (chunks.filter((chunk) => chunk !== undefined).length === message.parts) {
        this.incoming.delete(message.from);
        this.handlers.onMessage({ ...message, part: 0, parts: 1, chunk: chunks.join("") });
      }
      return;
    }
    this.handlers.onMessage(message);
  }

  send(message: CollabMessage) { void this.channel?.send({ type: "broadcast", event: "op", payload: message }); }
  shareCursor(elementId?: string) { void this.channel?.track({ id: this.clientId, name: this.name, colour: this.colour, host: this.host, elementId }); }
  chat(text: string): ChatMessage { const message = { id: crypto.randomUUID(), from: this.clientId, name: this.name, text, at: new Date().toISOString() }; this.send({ kind: "chat", message }); return message; }
  async leave() { if (this.channel) await this.client?.removeChannel(this.channel); this.channel = undefined; this.handlers.onStatus("closed"); }
}
