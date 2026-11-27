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

/**
 * Part of an element shown on one page in Page View: visible characters [start, end) of the
 * element's text (end omitted = to the end). Offsets passed to and from the editor stay
 * element-wide, so Enter, Backspace, formatting and the cursor behave as if the line were whole.
 */
export interface LineFragment { start: number; end?: number }

export function RichLine({ value, label, readOnly, spellCheck, className, fragment, onCrossFragment, onChange, onFormat, onKeyDown, onPaste, onFocus, onContextMenu, register }: {
  value: string; label: string; readOnly: boolean; spellCheck: boolean; className?: string;
  fragment?: LineFragment;
  /** The caret wants to leave this fragment (arrow keys, or text reflowed onto another page): element-wide offset. */
  onCrossFragment?(cursor: number): void;
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
  // Fragment bounds. While typing, the page layout catches up a moment later, so the end of the
  // fragment being edited follows the text typed into it until new bounds arrive.
  const bounds = useRef({ start: 0, end: undefined as number | undefined, key: "" });
  const key = fragment ? `${fragment.start}:${fragment.end ?? ""}` : "";
  if (bounds.current.key !== key) bounds.current = { start: fragment?.start ?? 0, end: fragment?.end, key };
  const sliceOf = (text: string) => { const chars = charsOf(text); return chars.slice(bounds.current.start, bounds.current.end ?? chars.length); };
  const local = (offset: number) => offset - bounds.current.start;

  const selection = (): [number, number] => {
    const root = ref.current, sel = window.getSelection();
    if (!root || !sel || !sel.rangeCount) return [bounds.current.start, bounds.current.start];
    const range = sel.getRangeAt(0);
    if (!root.contains(range.startContainer)) return [bounds.current.start, bounds.current.start];
    const a = offsetIn(root, range.startContainer, range.startOffset), b = offsetIn(root, range.endContainer, range.endOffset);
    return [Math.min(a, b) + bounds.current.start, Math.max(a, b) + bounds.current.start];
  };

  const handle = useRef<RichLineHandle>(null as unknown as RichLineHandle);
  if (!handle.current) handle.current = {
    get element() { return ref.current; },
    get value() { return fragment ? charsOf(latest.current).map((c) => c.ch).join("") : ref.current?.textContent?.replace(/ /gu, " ") ?? ""; },
    get selectionStart() { return selection()[0]; },
    get selectionEnd() { return selection()[1]; },
    focus() { ref.current?.focus({ preventScroll: true }); },
    setSelectionRange(start: number, end = start) {
      const root = ref.current, sel = window.getSelection(); if (!root || !sel) return;
      const length = sliceOf(latest.current).length;
      const clamp = (offset: number) => Math.max(0, Math.min(length, local(offset)));
      const a = pointAt(root, clamp(start)), b = pointAt(root, clamp(end));
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
  const onCrossRef = useRef(onCrossFragment); onCrossRef.current = onCrossFragment;
  const onFormatRef = useRef(onFormat); onFormatRef.current = onFormat;

  useEffect(() => { register(handle.current); return () => register(null); }, [register]);

  // Render only when the DOM no longer represents the value, so typing never loses the caret.
  const rendered = useRef({ start: 0 });
  useLayoutEffect(() => {
    const root = ref.current; if (!root || composing.current) return;
    const shown = toFountain(sliceOf(value));
    if (toFountain(readChars(root)) === canonical(shown)) { rendered.current.start = bounds.current.start; return; }
    // Text moved across a page boundary under the caret: keep the caret on the same character.
    const focused = document.activeElement === root;
    const sel = window.getSelection();
    const caret = focused && sel?.rangeCount ? offsetIn(root, sel.getRangeAt(0).startContainer, sel.getRangeAt(0).startOffset) + rendered.current.start : undefined;
    root.innerHTML = toHtml(shown);
    rendered.current.start = bounds.current.start;
    if (caret === undefined || !fragment) return;
    const length = sliceOf(value).length;
    if (caret < bounds.current.start || caret > bounds.current.start + length) { onCrossRef.current?.(caret); return; }
    handle.current.setSelectionRange(caret);
  }, [value, key]);

  const handleInput = () => {
    const root = ref.current; if (!root || composing.current) return;
    const all = charsOf(latest.current);
    const { start, end } = bounds.current;
    const typed = readChars(root);
    let next = toFountain([...all.slice(0, start), ...typed, ...all.slice(end ?? all.length)]);
    if (end !== undefined) bounds.current.end = start + typed.length;
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
      if (fragment && !event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey) {
        // Keys that run off either end of a page fragment carry on into the element's other part.
        const [a, b] = selection(); const start = bounds.current.start, end = start + sliceOf(latest.current).length;
        const isLast = bounds.current.end === undefined;
        const atStart = a === b && a === start && start > 0, atEnd = a === b && b === end && !isLast;
        if (atStart && (key === "arrowleft" || key === "arrowup")) { event.preventDefault(); onCrossRef.current?.(start - 1); return; }
        if (atEnd && (key === "arrowright" || key === "arrowdown")) { event.preventDefault(); onCrossRef.current?.(end + 1); return; }
        if (atStart && key === "backspace") { event.preventDefault(); onChangeRef.current(replaceRange(latest.current, start - 1, start, ""), start - 1); onCrossRef.current?.(start - 1); return; }
        if (atEnd && key === "delete") { event.preventDefault(); onChangeRef.current(replaceRange(latest.current, end, end + 1, ""), end); return; }
      }
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
