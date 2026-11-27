import type { ElementStyle, ProjectType } from "../types";

/** File → New from Stationery: starting templates with their own element formatting. */
export interface Stationery {
  id: string; name: string; description: string; projectType: ProjectType;
  fountain: string;
  elementStyles?: Partial<Record<string, ElementStyle>>;
  sceneHeadingSpacing?: 1 | 2;
}

const act = (name: string) => `/* OLUKOTAN:general */\n/* OLUKOTAN:FMT:{"align":"center"} */\n_${name}_`;
const end = (name: string) => `/* OLUKOTAN:general */\n/* OLUKOTAN:FMT:{"align":"center"} */\n_${name}_\n\n===`;

export const STATIONERY: Stationery[] = [
  { id: "feature", name: "Feature Screenplay", description: "Industry-standard spec format, US Letter or A4.", projectType: "feature-film",
    fountain: "FADE IN:\n\nINT. LOCATION - DAY\n\n" },
  { id: "one-hour", name: "One-Hour Drama (TV)", description: "Teaser and four acts, each act on a new page.", projectType: "television-episode",
    fountain: [act("TEASER"), "INT. LOCATION - DAY", end("END OF TEASER"), act("ACT ONE"), "INT. LOCATION - DAY", end("END OF ACT ONE"), act("ACT TWO"), "INT. LOCATION - DAY", end("END OF ACT TWO"), act("ACT THREE"), "INT. LOCATION - DAY", end("END OF ACT THREE"), act("ACT FOUR"), "INT. LOCATION - DAY", act("END OF ACT FOUR")].join("\n\n") + "\n" },
  { id: "multi-cam", name: "Half-Hour Multi-Camera Sitcom", description: "Double-spaced dialogue, underlined scene headings, action in capitals.", projectType: "television-episode", sceneHeadingSpacing: 1,
    fountain: [act("ACT ONE"), "INT. LOCATION - DAY", end("END OF ACT ONE"), act("ACT TWO"), "INT. LOCATION - DAY", act("END OF ACT TWO")].join("\n\n") + "\n",
    elementStyles: { "scene-heading": { underline: true }, action: { caps: true, left: 1.5, right: 7.5 }, dialogue: { spacing: 2, left: 2.5, right: 6.5 }, character: { left: 4.0 }, transition: { underline: true } } },
  { id: "stage-play", name: "Stage Play", description: "Centred character names, full-width dialogue, indented stage directions.", projectType: "stage-play", sceneHeadingSpacing: 1,
    fountain: "/* OLUKOTAN:general */\n/* OLUKOTAN:FMT:{\"align\":\"center\"} */\n_ACT ONE_\n\n/* OLUKOTAN:general */\n/* OLUKOTAN:FMT:{\"align\":\"center\"} */\nScene 1\n\nThe stage is bare.\n\n",
    elementStyles: { character: { align: "center", left: 1.5, right: 7.5 }, dialogue: { left: 1.5, right: 7.5 }, parenthetical: { left: 3.0, right: 6.0 }, action: { left: 3.5, right: 7.5, italic: true } } },
  { id: "short", name: "Short Film", description: "Feature format for scripts under 40 pages.", projectType: "short-film", fountain: "FADE IN:\n\nEXT. LOCATION - DAY\n\n" },
  { id: "micro-drama", name: "Vertical Micro-Drama Series", description: "Short episodes (1–3 minutes), each episode on a new page.", projectType: "micro-drama-series", sceneHeadingSpacing: 1,
    fountain: [1, 2, 3].map((n) => `${act(`EPISODE ${n}`)}\n\nINT. LOCATION - DAY\n\n${n < 3 ? "===" : ""}`).join("\n\n") + "\n" },
];
