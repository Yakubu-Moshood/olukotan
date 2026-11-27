import { visibleText } from "./rich-text";
import { parseCharacter, type ScreenplayElement } from "./screenplay-elements";
import type { VoiceAssignment } from "../types";

/** Tools → Speech Control: reads the script aloud with the system's voices, one voice per character. */
export const NARRATOR = "Narrator (action)";

export function availableVoices(): SpeechSynthesisVoice[] {
  return typeof speechSynthesis === "undefined" ? [] : speechSynthesis.getVoices();
}

export interface SpeechLine { index: number; speaker: string; text: string }

/** Turns elements into what is spoken: dialogue by its character, action and headings by the narrator. */
export function speechLines(elements: ScreenplayElement[], from = 0, to = elements.length, readCues = false): SpeechLine[] {
  const lines: SpeechLine[] = [];
  let speaker = NARRATOR;
  for (let index = from; index < to; index++) {
    const element = elements[index]; const text = visibleText(element.text).trim();
    if (!text || element.type === "page-break" || element.type === "note") continue;
    if (element.type === "character") { speaker = parseCharacter(text).name; if (readCues) lines.push({ index, speaker: NARRATOR, text: speaker }); continue; }
    if (element.type === "parenthetical") continue;
    if (element.type === "dialogue") { lines.push({ index, speaker, text }); continue; }
    speaker = NARRATOR;
    lines.push({ index, speaker: NARRATOR, text: element.type === "scene-heading" ? text.replace(/^INT\./u, "Interior,").replace(/^EXT\./u, "Exterior,").replace(/\s-\s/gu, ", ") : text });
  }
  return lines;
}

export class ScriptReader {
  private queue: SpeechLine[] = [];
  private stopped = true;
  constructor(private voices: Record<string, VoiceAssignment>, private onLine: (line: SpeechLine | null) => void, private baseRate = 1) {}
  get speaking() { return !this.stopped; }
  play(lines: SpeechLine[]) { this.stop(); this.queue = [...lines]; this.stopped = false; this.next(); }
  pause() { speechSynthesis.pause(); }
  resume() { speechSynthesis.resume(); }
  stop() { this.stopped = true; this.queue = []; if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel(); this.onLine(null); }
  private next() {
    const line = this.queue.shift();
    if (!line || this.stopped) { this.stopped = true; this.onLine(null); return; }
    const assignment = this.voices[line.speaker] ?? {};
    const utterance = new SpeechSynthesisUtterance(line.text);
    const voice = availableVoices().find((item) => item.name === assignment.voice);
    if (voice) utterance.voice = voice;
    utterance.rate = (assignment.rate ?? 1) * this.baseRate; utterance.pitch = assignment.pitch ?? 1;
    utterance.onend = () => this.next(); utterance.onerror = () => this.next();
    this.onLine(line);
    speechSynthesis.speak(utterance);
  }
}
