import { useEffect, useRef, useState } from "react";
import { Check, ChevronRight } from "lucide-react";

/** One command in a menu. `run` must do something real: the menu audit test fails on no-op items. */
export interface MenuItem {
  id: string;
  label: string;
  shortcut?: string;
  disabled?: boolean;
  checked?: boolean;
  run?: () => void;
  submenu?: MenuEntry[];
}
export type MenuEntry = MenuItem | "separator";
export interface Menu { id: string; label: string; items: MenuEntry[] }

const isItem = (entry: MenuEntry): entry is MenuItem => entry !== "separator";

/** Normalises "Ctrl+Shift+E" style shortcuts against a keyboard event. */
export function matchesShortcut(shortcut: string, event: KeyboardEvent | React.KeyboardEvent): boolean {
  const parts = shortcut.toLowerCase().split("+");
  const key = parts.pop()!;
  const wantCtrl = parts.includes("ctrl"), wantShift = parts.includes("shift"), wantAlt = parts.includes("alt");
  const ctrl = event.ctrlKey || event.metaKey;
  if (ctrl !== wantCtrl || event.shiftKey !== wantShift || event.altKey !== wantAlt) return false;
  const pressed = event.key.toLowerCase();
  const names: Record<string, string> = { del: "delete", delete: "delete", esc: "escape", plus: "+", minus: "-" };
  const target = names[key] ?? key;
  if (target.length === 1 && /[0-9]/u.test(target)) return pressed === target || (event as KeyboardEvent).code === `Digit${target}`;
  return pressed === target || (event as KeyboardEvent).code?.toLowerCase() === `key${target}`;
}

/** Every item with a shortcut, flattened (for the global key handler and the shortcuts reference). */
export function shortcutItems(menus: Menu[]): MenuItem[] {
  const out: MenuItem[] = [];
  const walk = (entries: MenuEntry[]) => entries.forEach((entry) => { if (!isItem(entry)) return; if (entry.shortcut && entry.run) out.push(entry); if (entry.submenu) walk(entry.submenu); });
  menus.forEach((menu) => walk(menu.items));
  return out;
}

export function MenuBar({ menus }: { menus: Menu[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const [sub, setSub] = useState<string | null>(null);
  const bar = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => { if (!bar.current?.contains(event.target as Node)) { setOpen(null); setSub(null); } };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { setOpen(null); setSub(null); } };
    window.addEventListener("mousedown", close); window.addEventListener("keydown", escape);
    return () => { window.removeEventListener("mousedown", close); window.removeEventListener("keydown", escape); };
  }, [open]);

  const choose = (item: MenuItem) => { if (item.disabled || item.submenu) return; setOpen(null); setSub(null); item.run?.(); };
  const renderEntries = (entries: MenuEntry[], level: number) => entries.map((entry, index) => entry === "separator"
    ? <div key={`sep-${index}`} className="menu-separator" role="separator"/>
    : <div key={entry.id} className="menu-row-wrap" onMouseEnter={() => level === 0 && setSub(entry.submenu ? entry.id : null)}>
        <button role="menuitem" className={`menu-row ${entry.disabled ? "disabled" : ""}`} aria-disabled={entry.disabled || undefined} aria-haspopup={entry.submenu ? "menu" : undefined}
          data-command={entry.id} onMouseDown={(event) => event.preventDefault()} onClick={() => entry.submenu ? setSub(sub === entry.id ? null : entry.id) : choose(entry)}>
          <span className="menu-check-col">{entry.checked && <Check size={13}/>}</span>
          <span className="menu-label">{entry.label}</span>
          {entry.shortcut && <kbd>{entry.shortcut}</kbd>}
          {entry.submenu && <ChevronRight size={14} className="menu-sub-arrow"/>}
        </button>
        {entry.submenu && sub === entry.id && <div className="menu-panel submenu" role="menu" aria-label={entry.label}>{renderEntries(entry.submenu, level + 1)}</div>}
      </div>);

  return <div ref={bar} className="menu-bar" role="menubar" aria-label="Application menu">
    {menus.map((menu) => <div key={menu.id} className="menu-top-wrap">
      <button role="menuitem" aria-haspopup="menu" aria-expanded={open === menu.id} className={`menu-top ${open === menu.id ? "open" : ""}`}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => { setOpen(open === menu.id ? null : menu.id); setSub(null); }}
        onMouseEnter={() => { if (open && open !== menu.id) { setOpen(menu.id); setSub(null); } }}>{menu.label}</button>
      {open === menu.id && <div className="menu-panel" role="menu" aria-label={menu.label}>{renderEntries(menu.items, 0)}</div>}
    </div>)}
  </div>;
}
