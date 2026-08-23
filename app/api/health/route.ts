import { NextResponse } from 'next/server';

// Edge Runtime pilot #1 (zero Node-specific deps) -- also the warmup-ping
// target for an external pinger (cron-job.org / UptimeRobot) keeping Fluid
// Compute instances warm at low request volume.
export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export function GET() {
  return NextResponse.json({ ok: true, ts: Date.now() });
}
