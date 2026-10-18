import fs from "node:fs";
import { defineConfig } from "@playwright/test";

// Used by scripts/smoke.sh. BASE_URL targets a deployed app; otherwise a local
// dev server on PORT (default 3000) is reused or started.
const port = Number(process.env.PORT ?? 3000);
const baseURL = process.env.BASE_URL ?? `http://localhost:${port}`;
const capture = process.env.HACK_CAPTURE === "1";
const size = capture ? { width: 1920, height: 1080 } : { width: 1440, height: 900 };
const pm = fs.existsSync("pnpm-lock.yaml")
  ? "pnpm"
  : fs.existsSync("yarn.lock")
    ? "yarn"
    : fs.existsSync("bun.lock") || fs.existsSync("bun.lockb")
      ? "bun"
      : "npm";

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "line",
  outputDir: capture ? "hack/demo/video/raw" : "test-results",
  use: {
    baseURL,
    viewport: size,
    video: capture ? { mode: "on", size } : "off",
    trace: capture ? "off" : "retain-on-failure",
    launchOptions: { slowMo: capture ? 120 : 0 },
  },
  webServer: process.env.BASE_URL
    ? undefined
    : {
        command: `${pm} run dev`,
        env: { PORT: String(port) },
        url: baseURL,
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
