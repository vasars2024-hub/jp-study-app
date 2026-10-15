'use strict';
/* eslint-disable @typescript-eslint/no-var-requires -- CommonJS tooling, run by node directly */
/**
 * The e2e run's watchdog (started detached by `run.cjs` before it launches the app).
 *
 * A run whose harness is killed outright (a terminal closed, a tool's timeout ending the
 * node process) never reaches its own teardown, and the headless app it launched lives
 * on with nothing to stop it. This process outlives the harness: it waits for the
 * harness PID to go, then kills whatever of THAT run is still running, found by the
 * run's own paths only (`isolation.reapRun`: its temp dir, or its snapshot when no
 * other live run uses it). After a normal teardown it finds nothing and just exits.
 *
 * Its settings come in `GUM_E2E_REAP` (JSON), not argv, so its own command line never
 * names the run's paths (the teardown would otherwise count it as part of the run).
 * With `--keep` the run dir is left, as the teardown leaves it.
 */
const fs = require('node:fs');
const isolation = require('./isolation.cjs');

const POLL_MS = 2000;
/** A harness alive this long is a PID reused by something else: give up, harmlessly. */
const MAX_LIFE_MS = 24 * 60 * 60_000;

let cfg = null;
try {
  cfg = JSON.parse(process.env.GUM_E2E_REAP || 'null');
} catch {
  cfg = null;
}

function log(line) {
  if (!cfg?.logFile) return;
  try {
    fs.appendFileSync(cfg.logFile, `[e2e reaper ${new Date().toISOString().slice(11, 19)}] ${line}\n`);
  } catch {
    /* the run folder may be gone already */
  }
}

async function main() {
  if (!cfg || !Number.isInteger(cfg.harnessPid) || typeof cfg.runDir !== 'string' || !cfg.runDir.includes('gum-e2e-')) return;
  const started = Date.now();
  while (isolation.isPidAlive(cfg.harnessPid)) {
    if (Date.now() - started > MAX_LIFE_MS) return;
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
  const result = await isolation.reapRun({
    runDir: cfg.runDir,
    appDir: cfg.appDir ?? null,
    runId: cfg.runId,
    exceptPids: [process.pid],
    log,
  });
  if (result.unverified) log('the harness is gone; could not list processes to check what it left');
  else if (result.survivors.length) log(`the harness is gone; could NOT kill: ${result.survivors.map(isolation.describeProcess).join(', ')}`);
  if (result.ambiguous.length) log(`left (another live run shares the snapshot): ${result.ambiguous.map((p) => `${p.Name}#${p.ProcessId}`).join(', ')}`);
  // The run's temp dir, as its own teardown would have (a normal teardown already did).
  if (!cfg.keep && !result.unverified && !result.survivors.length && fs.existsSync(cfg.runDir) && !isolation.containsLink(cfg.runDir)) {
    try {
      fs.rmSync(cfg.runDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
      log(`the harness was gone; removed ${cfg.runDir}`);
    } catch {
      log(`could not fully delete ${cfg.runDir}`);
    }
  }
}

main().catch((err) => log(`failed: ${err && err.stack ? err.stack : err}`));
