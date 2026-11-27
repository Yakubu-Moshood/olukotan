import { describe, expect, it } from "vitest";
import { checkForUpdate, isNewer } from "./updates";

const reply = (status: number, body: unknown) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

describe("update check", () => {
  it("compares versions numerically", () => {
    expect(isNewer("v0.1.12", "0.1.9")).toBe(true);
    expect(isNewer("0.1.9", "0.1.12")).toBe(false);
    expect(isNewer("0.1.5", "0.1.5")).toBe(false);
  });
  it("offers the Windows installer from a newer release", async () => {
    const update = await checkForUpdate("0.1.0", reply(200, { tag_name: "v0.1.7", html_url: "https://x/rel", assets: [{ name: "Olukotan_0.1.7_x64-setup.exe", browser_download_url: "https://x/setup.exe" }] }));
    expect(update).toEqual({ version: "0.1.7", downloadUrl: "https://x/setup.exe", pageUrl: "https://x/rel", publishedAt: undefined });
  });
  it("says nothing when up to date or when no release exists yet", async () => {
    expect(await checkForUpdate("0.1.7", reply(200, { tag_name: "v0.1.7", html_url: "" }))).toBeNull();
    expect(await checkForUpdate("0.1.0", reply(404, {}))).toBeNull();
  });
});
