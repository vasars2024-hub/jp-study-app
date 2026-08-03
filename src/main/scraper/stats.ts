// Real process telemetry for the rail's STATUS block.
//
// The rail used to drift a random number every three seconds. These are the
// actual figures: memory is the resident set of every process this app owns
// (main, renderers, utility), CPU is Chromium's own per-process accounting, and
// the job count comes from the scrape engine rather than from UI state.
//
// `app.getAppMetrics()` is a snapshot, not a sample loop, so polling it stays
// cheap enough for a one-second UI tick.

import { app } from 'electron';
import type { SystemStats } from '../../shared/scraperResults';

type JobCounter = () => number;

// Set by the engine at registration time. Kept as an injected getter rather
// than an import so this module has no dependency on the engine (and so the
// test can drive it without one).
let jobCounter: JobCounter = () => 0;

export function setActiveJobCounter(counter: JobCounter): void {
  jobCounter = counter;
}

export function scraperSystemStats(): SystemStats {
  let memoryMb = 0;
  let cpuPercent = 0;
  try {
    for (const metric of app.getAppMetrics()) {
      // workingSetSize is in KB.
      memoryMb += (metric.memory?.workingSetSize ?? 0) / 1024;
      cpuPercent += metric.cpu?.percentCPUUsage ?? 0;
    }
  } catch {
    // getAppMetrics is unavailable before `ready` and in tests; the main
    // process's own RSS is a fair stand-in and never throws.
    memoryMb = process.memoryUsage().rss / (1024 * 1024);
  }
  return {
    memoryMb: Math.max(1, Math.round(memoryMb)),
    // Chromium reports per-core percentages, so a busy 8-core box can exceed
    // 100. Clamped because the rail renders this as a bar.
    cpuPercent: Math.max(0, Math.min(100, Math.round(cpuPercent))),
    activeJobs: Math.max(0, jobCounter()),
  };
}
