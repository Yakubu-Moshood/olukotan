import { useMemo, useState } from "react";
import { Download, X } from "lucide-react";
import type { ProjectData } from "../types";
import type { Layout } from "../lib/pagination";
import type { ScreenplayDocument } from "../lib/screenplay-elements";
import { characterReport, locationReport, sceneReport, toCsv } from "../lib/reports";

type Tab = "Scenes" | "Characters" | "Locations";

/** Production reports: scene breakdown, character and location reports, exportable as CSV. */
export function ReportsDialog({ title, document, projectData, layout, onClose }: { title: string; document: ScreenplayDocument; projectData: ProjectData; layout: Layout; onClose(): void }) {
  const [tab, setTab] = useState<Tab>("Scenes");
  const scenes = useMemo(() => sceneReport(document, projectData, layout), [document, projectData, layout]);
  const characters = useMemo(() => characterReport(document, projectData, layout), [document, projectData, layout]);
  const locations = useMemo(() => locationReport(document, projectData, layout), [document, projectData, layout]);

  const table = tab === "Scenes"
    ? { headers: ["Scene", "Heading", "Page", "Length", "Characters", "Summary"], rows: scenes.map((s) => [s.number ?? s.ordinal, s.omitted ? "OMITTED" : s.heading, s.page ?? "", s.length, s.characters, s.summary ?? ""]) }
    : tab === "Characters"
      ? { headers: ["Character", "Speeches", "Words", "Scenes", "First page", "Scene numbers"], rows: characters.map((c) => [c.name, c.speeches, c.words, c.scenes, c.firstPage ?? "", c.sceneNumbers]) }
      : { headers: ["Location", "INT/EXT", "Times of day", "Scenes", "Pages", "Scene numbers"], rows: locations.map((l) => [l.location, l.intExt, l.timesOfDay, l.scenes, l.length, l.sceneNumbers]) };

  const download = () => {
    const blob = new Blob([toCsv(table.headers, table.rows)], { type: "text/csv;charset=utf-8" });
    const link = window.document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `${title} - ${tab} report.csv`; link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  };

  return <div className="settings-backdrop" onMouseDown={onClose}><section className="screenplay-settings-dialog reports-dialog" role="dialog" aria-modal="true" aria-label="Reports" onMouseDown={(event) => event.stopPropagation()}>
    <header><div><p className="eyebrow">Production</p><h2>Reports</h2></div><button className="icon-button" aria-label="Close reports" onClick={onClose}><X size={18}/></button></header>
    <div className="reports-tabs" role="tablist">{(["Scenes", "Characters", "Locations"] as Tab[]).map((item) => <button key={item} role="tab" aria-selected={tab === item} className={tab === item ? "active" : ""} onClick={() => setTab(item)}>{item}</button>)}
      <span className="reports-summary">{scenes.length} scenes · {characters.length} speaking characters · {locations.length} locations · {layout.pages.length} pages</span></div>
    <div className="reports-table-wrap"><table className="reports-table"><thead><tr>{table.headers.map((header) => <th key={header}>{header}</th>)}</tr></thead>
      <tbody>{table.rows.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex}>{Array.isArray(cell) ? cell.join(", ") : String(cell)}</td>)}</tr>)}</tbody></table>
      {!table.rows.length && <p className="setting-help">Nothing to report yet.</p>}</div>
    <footer><button className="secondary" onClick={download} disabled={!table.rows.length}><Download size={15}/> Export CSV</button><button className="primary" onClick={onClose}>Done</button></footer>
  </section></div>;
}
