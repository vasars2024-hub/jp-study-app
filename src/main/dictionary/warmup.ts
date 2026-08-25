// Paying the dictionary's cold-page cost while nobody is waiting for it.
//
// ## The measurement this exists for
//
// `dict:compounds` was chased through three rivals before the cost was named. On a
// boot with the OS file cache evicted (`tools/evict-file-cache.ps1 -TargetGb 8`),
// driven through `debug/lq-mainloop-harness.ps1`:
//
//   arm                                        maxGap    p95   wall
//   idle control                                 40 ms    0     --
//   dictCompounds('ヷヸヹ')  -- MISSES, returns  1552 ms    0    1552 ms
//     before the scan is ever reached
//   dictCompounds('猫')     -- scan + glosses    196 ms    7    1145 ms
//   dictCompounds('犬')     -- everything warm     82 ms    1     218 ms
//
// and the same miss re-run warm costs **51 ms**, a fresh miss 51 ms. So it is not
// the miss, not the windowed scan (which behaves: 196 ms worst window, p95 7), and
// not the SQLite open -- `dict:listPairs` forces the open and `migrateDictionaryDb`
// in **1 ms**. It is `lookup()`'s first touch of the `headwords` pages, one
// unbroken synchronous block on Electron's main loop, and no amount of windowing
// *inside* the scan can move it because it happens before the scan starts.
//
// A standalone process over the same 537 MB file scans it cold in 409 ms with a
// 13 ms worst window (`debug/dict-scan-windows.cjs`), which is what ruled the scan
// out rather than an argument that it looked fine.
//
// ## Why a buffered read, and not a warm-up query
//
// A warm-up *query* would have to run through `better-sqlite3`, which is
// synchronous by construction -- warming that way spends the 1.5 s on the main
// loop, which is the thing being removed. Async `fs` reads run on libuv's
// threadpool, so the main loop is never held, and the Windows file cache is per
// *file*, not per handle: pages faulted in by this read are the same pages
// SQLite's mmap later finds resident. That equivalence is the load-bearing claim
// and it is measured, not assumed -- see the A/B in the plan's L5 entry.
//
// Nothing here opens the database, holds a handle, or takes a lock. Reading is the
// entire mechanism, exactly as in `tools/evict-file-cache.ps1`, which is its
// inverse.

import fs from 'node:fs';
import path from 'node:path';

/**
 * Above this the file is not warmed at all.
 *
 * A dictionary this large is one someone has imported several full sources into,
 * and pulling all of it through the cache would evict more than it warms -- on a
 * machine whose standby list is ~1.9 GB, a 2 GB read is a cache *flush* wearing a
 * warm-up's clothes. Skipping is the honest outcome and it is reported as
 * `skipped`, never as a success.
 */
export const DICT_WARM_MAX_BYTES = 1_500_000_000;

/** Read size per turn. Large enough to amortise the syscall, small enough to interleave. */
const CHUNK_BYTES = 4 * 1024 * 1024;

export interface DictWarmResult {
  /** `warmed`, or why not. Never a bare boolean: "it did not run" has three causes. */
  status: 'warmed' | 'missing' | 'too-large' | 'cancelled' | 'failed';
  bytesRead: number;
  fileBytes: number;
  ms: number;
  error?: string;
}

let running: Promise<DictWarmResult> | null = null;
let cancelled = false;

/**
 * Streams `dict.db` once so its pages are resident before the first lookup.
 *
 * Idempotent per process: a second call while one is in flight joins the first,
 * and a completed warm-up is not repeated -- the OS may still evict the pages
 * afterwards, and re-reading on a hunch would be a background loop nobody asked
 * for. One boot, one warm-up.
 */
export function warmDictionaryPages(dir: string): Promise<DictWarmResult> {
  if (running) return running;
  running = runWarm(dir);
  return running;
}

/** Stops an in-flight warm-up at the next chunk boundary. Used on quit. */
export function cancelDictionaryWarmup(): void {
  cancelled = true;
}

/** Test seam: forgets that a warm-up ran in this process. */
export function resetDictionaryWarmupForTests(): void {
  running = null;
  cancelled = false;
}

async function runWarm(dir: string): Promise<DictWarmResult> {
  const startedAt = Date.now();
  const file = path.join(dir, 'dict.db');
  let fileBytes = 0;
  try {
    fileBytes = (await fs.promises.stat(file)).size;
  } catch {
    return { status: 'missing', bytesRead: 0, fileBytes: 0, ms: Date.now() - startedAt };
  }
  if (fileBytes > DICT_WARM_MAX_BYTES) {
    return { status: 'too-large', bytesRead: 0, fileBytes, ms: Date.now() - startedAt };
  }

  let handle: fs.promises.FileHandle | null = null;
  let bytesRead = 0;
  try {
    handle = await fs.promises.open(file, 'r');
    const buffer = Buffer.allocUnsafe(CHUNK_BYTES);
    for (;;) {
      if (cancelled) {
        return { status: 'cancelled', bytesRead, fileBytes, ms: Date.now() - startedAt };
      }
      const read = await handle.read(buffer, 0, CHUNK_BYTES, bytesRead);
      if (read.bytesRead <= 0) break;
      bytesRead += read.bytesRead;
      if (bytesRead >= fileBytes) break;
    }
    return { status: 'warmed', bytesRead, fileBytes, ms: Date.now() - startedAt };
  } catch (err) {
    return {
      status: 'failed',
      bytesRead,
      fileBytes,
      ms: Date.now() - startedAt,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    await handle?.close().catch(() => undefined);
  }
}
