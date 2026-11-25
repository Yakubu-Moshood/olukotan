import { useEffect, useLayoutEffect, useRef } from "react";
import type { StyledChar } from "../lib/pagination";
import { applyStyle, canonical, charsOf, replaceRange, stylesInRange, toFountain, toggleStyle, type Style, type StyleSet } from "../lib/rich-text";

/** The imperative surface the editor uses for one script line (mirrors the parts of a textarea it needs). */
export interface RichLineHandle {
  readonly element: HTMLDivElement | null;
  /** Visible text (no formatting markers). */
  readonly value: string;
  readonly selectionStart: number;
  readonly selectionEnd: number;
  focus(): void;
  setSelectionRange(start: number, end?: number): void;
  scrollIntoView(options?: ScrollIntoViewOptions): void;
  toggle(style: Style): void;
  /** Inserts plain text at the selection (used by the context-menu Paste). */
  insertText(text: string): void;
}

const escapeHtml = (value: string) => value.replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;");

function toHtml(text: string): string {
  const chars = charsOf(text);
  let html = "", i = 0;
  while (i < chars.length) {
    const c = chars[i]; let j = i + 1;
    while (j < chars.length && chars[j].bold === c.bold && chars[j].italic === c.italic && chars[j].underline === c.underline) j++;
    const run = escapeHtml(chars.slice(i, j).map((item) => item.ch).join(""));
    const classes = [c.bold ? "rt-b" : "", c.italic ? "rt-i" : "", c.underline ? "rt-u" : ""].filter(Boolean).join(" ");
    html += classes ? `<span class="${classes}">${run}</span>` : run;
    i = j;
  }
  return html;
}

/** Reads the editable DOM back into styled characters, tolerating markup a browser or paste may insert. */
function readChars(root: HTMLElement): StyledChar[] {
  const out: StyledChar[] = [];
  const walk = (node: Node, style: StyleSet) => {
    if (node.nodeType === Node.TEXT_NODE) {
      for (const ch of (node.nodeValue ?? "").replace(/ /gu, " ").replace(/[\r\n]/gu, " ").split("")) out.push({ ch, ...style });
      return;
    }
    if (!(node instanceof HTMLElement)) return;
    if (node.tagName === "BR") return;
    const tag = node.tagName, cls = node.classList;
    const weight = node.style?.fontWeight;
    const next: StyleSet = {
      bold: style.bold || tag === "B" || tag === "STRONG" || cls.contains("rt-b") || weight === "bold" || Number(weight) >= 600,
      italic: style.italic || tag === "I" || tag === "EM" || cls.contains("rt-i") || node.style?.fontStyle === "italic",
      underline: style.underline || tag === "U" || cls.contains("rt-u") || (node.style?.textDecoration ?? "").includes("underline"),
    };
    if ((tag === "DIV" || tag === "P") && node !== root && out.length && out[out.length - 1].ch !== " ") out.push({ ch: " ", ...style });
    node.childNodes.forEach((child) => walk(child, next));
  };
  root.childNodes.forEach((child) => walk(child, { bold: false, italic: false, underline: false }));
  return out;
}

function offsetIn(root: HTMLElement, container: Node, offset: number): number {
  const range = document.createRange();
  range.setStart(root, 0);
  try { range.setEnd(container, offset); } catch { return 0; }
  return range.toString().length;
}

function pointAt(root: HTMLElement, target: number): { node: Node; offset: number } {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let remaining = target, last: Text | null = null;
  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
    const length = node.nodeValue?.length ?? 0;
    if (remaining <= length) return { node, offset: remaining };
    remaining -= length; last = node;
  }
  return last ? { node: last, offset: last.nodeValue?.length ?? 0 } : { node: root, offset: 0 };
}

export function RichLine({ value, label, readOnly, spellCheck, className, onChange, onFormat, onKeyDown, onPaste, onFocus, onContextMenu, register }: {
  value: string; label: string; readOnly: boolean; spellCheck: boolean; className?: string;
  /** Text edited by typing; `cursor` is a visible-text offset. */
  onChange(next: string, cursor: number): void;
  /** Formatting changed over a range; keep that range selected. */
  onFormat(next: string, start: number, end: number): void;
  onKeyDown(event: React.KeyboardEvent<HTMLDivElement>, handle: RichLineHandle): void;
  /** Return true when the paste was handled (e.g. multi-line screenplay paste). */
  onPaste(text: string, handle: RichLineHandle): boolean;
  onFocus(): void;
  onContextMenu(event: React.MouseEvent<HTMLDivElement>): void;
  register(handle: RichLineHandle | null): void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const latest = useRef(value); latest.current = value;
  const composing = useRef(false);
  const typingStyle = useRef<StyleSet | null>(null);

  const selection = (): [number, number] => {
    const root = ref.current, sel = window.getSelection();
    if (!root || !sel || !sel.rangeCount) return [0, 0];
    const range = sel.getRangeAt(0);
    if (!root.contains(range.startContainer)) return [0, 0];
    const a = offsetIn(root, range.startContainer, range.startOffset), b = offsetIn(root, range.endContainer, range.endOffset);
    return [Math.min(a, b), Math.max(a, b)];
  };

  const handle = useRef<RichLineHandle>(null as unknown as RichLineHandle);
  if (!handle.current) handle.current = {
    get element() { return ref.current; },
    get value() { return ref.current?.textContent?.replace(/ /gu, " ") ?? ""; },
    get selectionStart() { return selection()[0]; },
    get selectionEnd() { return selection()[1]; },
    focus() { ref.current?.focus({ preventScroll: true }); },
    setSelectionRange(start: number, end = start) {
      const root = ref.current, sel = window.getSelection(); if (!root || !sel) return;
      const a = pointAt(root, start), b = pointAt(root, end);
      const range = document.createRange(); range.setStart(a.node, a.offset); range.setEnd(b.node, b.offset);
      sel.removeAllRanges(); sel.addRange(range);
    },
    scrollIntoView(options) { ref.current?.scrollIntoView?.(options); },
    toggle(style: Style) {
      const [start, end] = selection();
      if (start === end) {
        // Nothing selected: the next characters typed get the toggled style (as in Final Draft / Word).
        const current = typingStyle.current ?? stylesInRange(latest.current, start, start);
        typingStyle.current = { ...current, [style]: !current[style] };
        return;
      }
      onFormatRef.current(toggleStyle(latest.current, start, end, style), start, end);
    },
    insertText(text: string) {
      const [start, end] = selection();
      const clean = text.replace(/\r?\n/gu, " ");
      onChangeRef.current(replaceRange(latest.current, start, end, clean), start + clean.length);
    },
  };
  const onChangeRef = useRef(onChange); onChangeRef.current = onChange;
  const onFormatRef = useRef(onFormat); onFormatRef.current = onFormat;

  useEffect(() => { register(handle.current); return () => register(null); }, [register]);

  // Render only when the DOM no longer represents the value, so typing never loses the caret.
  useLayoutEffect(() => {
    const root = ref.current; if (!root || composing.current) return;
    if (toFountain(readChars(root)) !== canonical(value)) root.innerHTML = toHtml(value);
  }, [value]);

  const handleInput = () => {
    const root = ref.current; if (!root || composing.current) return;
    let next = toFountain(readChars(root));
    const [cursor] = selection();
    const style = typingStyle.current;
    if (style) {
      const before = charsOf(latest.current).length, after = charsOf(next).length;
      const inserted = after - before;
      if (inserted > 0) next = applyStyle(next, cursor - inserted, cursor, style);
    }
    onChange(next, cursor);
  };

  return <div ref={ref} className={`rich-line ${className ?? ""}`} role="textbox" aria-label={label} aria-multiline="false" aria-readonly={readOnly || undefined}
    contentEditable={!readOnly} suppressContentEditableWarning spellCheck={spellCheck}
    onInput={handleInput}
    onCompositionStart={() => { composing.current = true; }}
    onCompositionEnd={() => { composing.current = false; handleInput(); }}
    onFocus={onFocus}
    onBlur={() => { typingStyle.current = null; }}
    onMouseDown={() => { typingStyle.current = null; }}
    onContextMenu={onContextMenu}
    onKeyDown={(event) => {
      const key = event.key.toLowerCase();
      if ((event.ctrlKey || event.metaKey) && !event.altKey && ["b", "i", "u"].includes(key)) {
        event.preventDefault();
        handle.current.toggle(key === "b" ? "bold" : key === "i" ? "italic" : "underline");
        return;
      }
      if (["arrowleft", "arrowright", "arrowup", "arrowdown", "home", "end", "pageup", "pagedown"].includes(key)) typingStyle.current = null;
      onKeyDown(event, handle.current);
    }}
    onPaste={(event) => {
      event.preventDefault();
      const text = event.clipboardData.getData("text/plain");
      if (!text || readOnly) return;
      if (onPaste(text, handle.current)) return;
      handle.current.insertText(text);
    }}
    onDrop={(event) => {
      // Drop plain text only, so formatting from other apps can't leak in as stray markup.
      const text = event.dataTransfer.getData("text/plain");
      if (!text || readOnly) return;
      event.preventDefault();
      handle.current.insertText(text);
    }}
  />;
}
