import fs from "node:fs";
import { expect, test, type Locator, type Page } from "@playwright/test";

// The golden path is the demo script in hack/SPEC.md: one beat() per beat,
// named "B1 …". Each beat acts like the presenter, asserts what the judge must
// see, and saves a screenshot. scripts/smoke.sh runs it in demo mode (recorded
// AI replies, story seed data); --capture records 1920x1080 video for hack-video
// plus beats.json (start and end second of every beat) for trimming.

const DEMO = process.env.HACK_DEMO !== "0";
const CAPTURE = process.env.HACK_CAPTURE === "1";
// Capture shots are 1920x1080 and go to their own folder so they never replace the README shots.
const SHOTS = CAPTURE ? "hack/demo/shots/capture" : "hack/demo/shots";
const BEATS_FILE = "hack/demo/video/raw/beats.json";
fs.mkdirSync(SHOTS, { recursive: true });

let videoStart = Date.now();
const beats: { id: string; title: string; start: number; end: number }[] = [];

// One demo beat: a named test.step that also records when it ran in the video.
async function beat(id: string, title: string, body: () => Promise<void>) {
  const start = (Date.now() - videoStart) / 1000;
  await test.step(`${id} ${title}`, body);
  beats.push({ id, title, start: Number(start.toFixed(2)), end: Number(((Date.now() - videoStart) / 1000).toFixed(2)) });
  if (CAPTURE) fs.writeFileSync(BEATS_FILE, JSON.stringify(beats, null, 2) + "\n");
}

function route(path: string) {
  if (!DEMO) return path;
  return `${path}${path.includes("?") ? "&" : "?"}demo=1`;
}

async function shot(page: Page, beat: string) {
  await page.screenshot({ path: `${SHOTS}/${beat}.png` });
}

// Pause so the video viewer can read the screen; no-op outside capture.
async function hold(page: Page, ms = 1200) {
  if (CAPTURE) await page.waitForTimeout(ms);
}

// Click like a person: in capture mode the cursor glides to the target first.
async function press(page: Page, target: Locator) {
  if (CAPTURE) {
    const box = await target.boundingBox();
    if (box) await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 24 });
    await page.waitForTimeout(200);
  }
  await target.click();
}

async function typeInto(page: Page, target: Locator, text: string) {
  await press(page, target);
  await target.pressSequentially(text, { delay: CAPTURE ? 35 : 0 });
}

// Playwright video has no cursor; draw one so viewers can follow the demo.
const CURSOR = `(() => {
  const add = () => {
    if (document.getElementById("__hack_cursor")) return;
    const c = document.createElement("div");
    c.id = "__hack_cursor";
    c.style.cssText = "position:fixed;left:-40px;top:-40px;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;background:rgba(17,17,17,.35);border:2px solid #fff;box-shadow:0 1px 6px rgba(0,0,0,.35);pointer-events:none;z-index:2147483647;transition:transform .12s ease-out";
    document.documentElement.appendChild(c);
    addEventListener("mousemove", (e) => { c.style.left = e.clientX + "px"; c.style.top = e.clientY + "px"; }, true);
    addEventListener("mousedown", () => { c.style.transform = "scale(.7)"; }, true);
    addEventListener("mouseup", () => { c.style.transform = "scale(1)"; }, true);
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", add); else add();
})();`;

test.beforeEach(async ({ page }) => {
  if (CAPTURE) await page.addInitScript(CURSOR);
  videoStart = Date.now(); // the video starts with the page
});

test("golden path", async ({ page, request }) => {
  test.setTimeout(CAPTURE ? 180_000 : 90_000);

  await beat("B0", "health", async () => {
    const response = await request.get("/api/health");
    expect(response.ok(), "GET /api/health answers 2xx").toBeTruthy();
  });

  await beat("B1", "opening screen", async () => {
    await page.goto(route("/"));
    await expect(page.locator("body")).toBeVisible();
    await hold(page);
    await shot(page, "B1");
  });

  // Add B2…B6 from hack/SPEC.md. Assert the business result the judge must see
  // (a generated summary, a score, a before/after number), not only that a page
  // loaded. Example:
  //
  // await beat("B2", "upload the contract and see risks stream in", async () => {
  //   await press(page, page.getByRole("button", { name: "Analyze sample contract" }));
  //   await expect(page.getByTestId("risk-list").getByRole("listitem")).toHaveCount(5, { timeout: 20_000 });
  //   await hold(page, 2000);
  //   await shot(page, "B2");
  // });
});

export { beat, hold, press, shot, typeInto };
