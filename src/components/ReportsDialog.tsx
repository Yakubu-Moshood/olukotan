import { useEscape } from "./dialogs/Modal";
import { useMemo, useState } from "react";
import { Download, X } from "lucide-react";
import type { ProjectData } from "../types";
import type { Layout } from "../lib/pagination";
import type { ScreenplayDocument } from "../lib/screenplay-elements";
import { characterReport, locationReport, sceneReport, toCsv } from "../lib/reports";

type Tab = "Scenes" | "Characters" | "Locations" | "Summary";

/** Production reports: scene breakdown, character and location reports, exportable as CSV. */
export function ReportsDialog({ title, document, projectData, layout, onClose, initialTab = "Scenes" }: { title: string; document: ScreenplayDocument; projectData: ProjectData; layout: Layout; onClose(): void; initialTab?: Tab }) {
  useEscape(onClose);
  const [tab, setTab] = useState<Tab>(initialTab);
  const scenes = useMemo(() => sceneReport(document, projectData, layout), [document, projectData, layout]);
  const characters = useMemo(() => characterReport(document, projectData, layout), [document, projectData, layout]);
  const locations = useMemo(() => locationReport(document, projectData, layout), [document, projectData, layout]);

  const table = tab === "Scenes"
    ? { headers: ["Scene", "Heading", "Page", "Length", "Characters", "Summary"], rows: scenes.map((s) => [s.number ?? s.ordinal, s.omitted ? "OMITTED" : s.heading, s.page ?? "", s.length, s.characters, s.summary ?? ""]) }
    : tab === "Characters"
      ? { headers: ["Character", "Speeches", "Words", "Scenes", "First page", "Scene numbers"], rows: characters.map((c) => [c.name, c.speeches, c.words, c.scenes, c.firstPage ?? "", c.sceneNumbers]) }
      : tab === "Locations" ? { headers: ["Location", "INT/EXT", "Times of day", "Scenes", "Pages", "Scene numbers"], rows: locations.map((l) => [l.location, l.intExt, l.timesOfDay, l.scenes, l.length, l.sceneNumbers]) }
      : { headers: ["Measure", "Value"], rows: summaryRows(scenes, characters, locations, layout.pages.length) };

  const download = () => {
    const blob = new Blob([toCsv(table.headers, table.rows)], { type: "text/csv;charset=utf-8" });
    const link = window.document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `${title} - ${tab} report.csv`; link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  };

  return <div className="settings-backdrop" onMouseDown={onClose}><section className="screenplay-settings-dialog reports-dialog" role="dialog" aria-modal="true" aria-label="Reports" onMouseDown={(event) => event.stopPropagation()}>
    <header><div><p className="eyebrow">Production</p><h2>Reports</h2></div><button className="icon-button" aria-label="Close reports" onClick={onClose}><X size={18}/></button></header>
    <div className="reports-tabs" role="tablist">{(["Scenes", "Characters", "Locations", "Summary"] as Tab[]).map((item) => <button key={item} role="tab" aria-selected={tab === item} className={tab === item ? "active" : ""} onClick={() => setTab(item)}>{item}</button>)}
      <span className="reports-summary">{scenes.length} scenes · {characters.length} speaking characters · {locations.length} locations · {layout.pages.length} pages</span></div>
    <div className="reports-table-wrap"><table className="reports-table"><thead><tr>{table.headers.map((header) => <th key={header}>{header}</th>)}</tr></thead>
      <tbody>{table.rows.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex}>{Array.isArray(cell) ? cell.join(", ") : String(cell)}</td>)}</tr>)}</tbody></table>
      {!table.rows.length && <p className="setting-help">Nothing to report yet.</p>}</div>
    <footer><button className="secondary" onClick={download} disabled={!table.rows.length}><Download size={15}/> Export CSV</button><button className="primary" onClick={onClose}>Done</button></footer>
  </section></div>;
}

/** Script report: the numbers a producer asks for first. */
function summaryRows(scenes: ReturnType<typeof sceneReport>, characters: ReturnType<typeof characterReport>, locations: ReturnType<typeof locationReport>, pages: number): unknown[][] {
  const count = (test: (scene: (typeof scenes)[number]) => boolean) => scenes.filter((scene) => !scene.omitted && test(scene)).length;
  const words = scenes.reduce((sum, scene) => sum + scene.words, 0);
  return [
    ["Pages", pages], ["Scenes", count(() => true)], ["Omitted scenes", scenes.filter((scene) => scene.omitted).length],
    ["Interior scenes", count((scene) => /^INT/u.test(scene.intExt ?? ""))], ["Exterior scenes", count((scene) => /^EXT/u.test(scene.intExt ?? ""))],
    ["Day scenes", count((scene) => /DAY|MORNING|AFTERNOON/u.test(scene.timeOfDay ?? ""))], ["Night scenes", count((scene) => /NIGHT|EVENING|DUSK/u.test(scene.timeOfDay ?? ""))],
    ["Speaking characters", characters.length], ["Locations", locations.length], ["Words", words.toLocaleString()],
    ["Longest scene", scenes.reduce((best, scene) => (scene.eighths > (best?.eighths ?? -1) ? scene : best), scenes[0])?.heading ?? "—"],
    ["Most speeches", characters[0] ? `${characters[0].name} (${characters[0].speeches})` : "—"],
  ];
}
