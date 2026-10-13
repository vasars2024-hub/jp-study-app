/**
 * The direct-play probe (`shared/directPlayProbe.ts`) against a real file, cached per file.
 *
 * Keyed by path + size + mtime, so a file replaced in place (a re-download, a re-encode) is
 * probed again, and an unchanged one is answered from memory on every later open. The probe
 * itself is a few small synchronous reads (the `moov` box of a long film is the largest,
 * capped at 16 MB); it runs on the play request, never at boot.
 */
import fs from 'node:fs';
import {
  decideDirectPlay,
  probeDirectPlay,
  type DirectPlayDecision,
  type DirectPlayProbe,
} from '../shared/directPlayProbe';

export interface DirectPlayResult {
  probe: DirectPlayProbe;
  decision: DirectPlayDecision;
  /** Answered from the cache (for diagnostics and tests). */
  cached: boolean;
}

const MAX_ENTRIES = 500;
const cache = new Map<string, { key: string; probe: DirectPlayProbe; decision: DirectPlayDecision }>();

const UNKNOWN: DirectPlayResult = {
  probe: { container: 'unknown', video: [], audio: [], subtitles: 0, complete: false },
  decision: { verdict: 'unknown', reason: 'file not readable' },
  cached: false,
};

export function probeDirectPlayFile(file: string): DirectPlayResult {
  let stat: fs.Stats;
  try {
    stat = fs.statSync(file);
  } catch {
    return UNKNOWN;
  }
  if (!stat.isFile()) return UNKNOWN;
  const id = file.replace(/\\/g, '/').toLowerCase();
  const key = `${stat.size}:${Math.round(stat.mtimeMs)}`;
  const hit = cache.get(id);
  if (hit && hit.key === key) {
    // Refresh recency (Map keeps insertion order).
    cache.delete(id);
    cache.set(id, hit);
    return { probe: hit.probe, decision: hit.decision, cached: true };
  }

  let fd: number | null = null;
  let probe: DirectPlayProbe;
  try {
    fd = fs.openSync(file, 'r');
    const handle = fd;
    probe = probeDirectPlay((offset, length) => {
      const buf = Buffer.allocUnsafe(Math.max(0, Math.min(length, stat.size - offset)));
      const n = buf.length ? fs.readSync(handle, buf, 0, buf.length, offset) : 0;
      return buf.subarray(0, n);
    }, stat.size);
  } catch {
    return UNKNOWN;
  } finally {
    if (fd !== null) {
      try {
        fs.closeSync(fd);
      } catch {
        /* already closed */
      }
    }
  }
  const decision = decideDirectPlay(probe);
  cache.set(id, { key, probe, decision });
  while (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
  return { probe, decision, cached: false };
}

/** For tests. */
export function clearDirectPlayProbeCache(): void {
  cache.clear();
}
