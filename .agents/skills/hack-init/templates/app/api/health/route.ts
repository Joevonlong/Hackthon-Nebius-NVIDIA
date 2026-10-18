import { NextResponse } from "next/server";

// Liveness check used by scripts/smoke.sh and the F-00 walking skeleton.
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({
    ok: true,
    demo: process.env.DEMO_MODE === "1",
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? process.env.GIT_COMMIT ?? null,
    time: new Date().toISOString(),
  });
}
