// Download heat-map telemetry, main-process side (release.ts fetch pattern).
//   stats:ping   — fire-and-forget POST /ping (only when consent already given
//                  in the renderer; this handler just performs the request).
//   stats:counts — GET /counts, cache to userData/download-stats.json, and return
//                  the cache on failure so the map still renders offline.
// No IP or identifier is ever sent; Cloudflare derives the country server-side.

import fs from 'node:fs';
import path from 'node:path';
import { app, ipcMain } from 'electron';
import {
  STATS_COUNTS_URL,
  STATS_PING_URL,
  sanitizeCounts,
  statsConfigured,
  type CountryCounts,
} from '../shared/stats';

function countsCachePath(): string {
  return path.join(app.getPath('userData'), 'download-stats.json');
}

function atomicWrite(file: string, data: string): void {
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, data, 'utf-8');
  fs.renameSync(tmp, file);
}

function readCounts(): CountryCounts | null {
  try {
    const file = countsCachePath();
    if (!fs.existsSync(file)) return null;
    return sanitizeCounts(JSON.parse(fs.readFileSync(file, 'utf-8')));
  } catch {
    return null;
  }
}

async function ping(): Promise<{ ok: boolean; sent: boolean }> {
  if (!statsConfigured()) return { ok: true, sent: false };
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 10000);
  try {
    const res = await fetch(STATS_PING_URL, {
      method: 'POST',
      signal: ctl.signal,
      headers: { 'User-Agent': 'jp-study-app' },
    });
    return { ok: true, sent: res.ok };
  } catch {
    return { ok: false, sent: false };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchCounts(): Promise<CountryCounts | null> {
  if (!statsConfigured()) return readCounts();
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 15000);
  try {
    const res = await fetch(STATS_COUNTS_URL, {
      signal: ctl.signal,
      headers: { 'User-Agent': 'jp-study-app' },
    });
    if (!res.ok) return readCounts();
    const counts = sanitizeCounts(await res.json());
    atomicWrite(countsCachePath(), JSON.stringify(counts));
    return counts;
  } catch {
    return readCounts();
  } finally {
    clearTimeout(timer);
  }
}

export function registerStatsIpc(): void {
  ipcMain.handle('stats:ping', async () => ping());
  ipcMain.handle('stats:counts', async () => fetchCounts());
}
