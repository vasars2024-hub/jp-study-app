/**
 * One queue for every manga page scan, so the page in front of the reader is
 * never stuck behind other work.
 *
 * The models run one page at a time anyway (one set of ONNX sessions), and
 * three callers want pages: the reader for the page it shows, the reader for
 * the page after it (read-ahead), and a whole-volume analysis. Before this
 * queue they ran side by side: a volume pass started at page 1 while the reader
 * sat on page 40 waiting, a page flipped past was still read to the end, and
 * the same page could be inferred twice at once.
 *
 *  - `page` runs first, then `prefetch`, then `background` (volume) work.
 *  - A `page` request cancels the item's queued or running `page`/`prefetch`
 *    scans of OTHER pages: the reader has turned away from them. A running scan
 *    stops at its next check (between text blocks) and writes nothing.
 *  - A request for a page that is already queued or running joins that scan
 *    (and lifts its priority) instead of reading the page twice.
 */

import { MANGA_OCR_CANCELLED } from '../shared/mangaOcrIpc';

export type MangaScanPriority = 'page' | 'prefetch' | 'background';

const RANK: Record<MangaScanPriority, number> = { page: 0, prefetch: 1, background: 2 };

export interface MangaScanKey {
  itemId: string;
  mediaUrl: string;
  force?: boolean;
}

/** Thrown into a scan (and its callers) that a page turn or a cancel superseded. */
export class MangaScanCancelled extends Error {
  constructor() {
    super(MANGA_OCR_CANCELLED);
    this.name = 'MangaScanCancelled';
  }
}

interface Job<R extends MangaScanKey, T> {
  req: R;
  priority: MangaScanPriority;
  seq: number;
  started: boolean;
  cancelled: boolean;
  /** A caller's own stop condition (a volume's Cancel); dropped when a reader joins. */
  externalCancel?: () => boolean;
  promise: Promise<T>;
  resolve: (v: T) => void;
  reject: (e: unknown) => void;
}

export interface MangaScanQueue<R extends MangaScanKey, T> {
  request(req: R, priority: MangaScanPriority, opts?: { shouldCancel?: () => boolean }): Promise<T>;
  /** Cancel the item's `page`/`prefetch` scans of pages other than `mediaUrl`. */
  cancelOthers(itemId: string, mediaUrl: string): void;
  /** Queued plus running scans (for tests and diagnostics). */
  size(): number;
}

export function createMangaScanQueue<R extends MangaScanKey, T>(
  run: (req: R, shouldCancel: () => boolean) => Promise<T>,
): MangaScanQueue<R, T> {
  const jobs: Array<Job<R, T>> = [];
  let running = false;
  let seq = 0;

  const remove = (job: Job<R, T>): void => {
    const at = jobs.indexOf(job);
    if (at >= 0) jobs.splice(at, 1);
  };

  const cancel = (job: Job<R, T>): void => {
    if (job.cancelled) return;
    job.cancelled = true;
    if (!job.started) {
      remove(job);
      job.reject(new MangaScanCancelled());
    }
  };

  const pump = (): void => {
    if (running) return;
    let next: Job<R, T> | undefined;
    for (const job of jobs) {
      if (job.started) continue;
      if (!next || RANK[job.priority] < RANK[next.priority] || (RANK[job.priority] === RANK[next.priority] && job.seq < next.seq)) {
        next = job;
      }
    }
    if (!next) return;
    const job = next;
    running = true;
    job.started = true;
    let work: Promise<T>;
    try {
      work = run(job.req, () => job.cancelled || !!job.externalCancel?.());
    } catch (err) {
      work = Promise.reject(err);
    }
    work.then(job.resolve, job.reject).finally(() => {
      remove(job);
      running = false;
      pump();
    });
  };

  const cancelOthers = (itemId: string, mediaUrl: string): void => {
    for (const job of jobs.slice()) {
      if (job.req.itemId === itemId && job.req.mediaUrl !== mediaUrl && job.priority !== 'background') cancel(job);
    }
  };

  return {
    request(req, priority, opts) {
      if (priority === 'page') cancelOthers(req.itemId, req.mediaUrl);
      const same = jobs.find(
        (j) =>
          !j.cancelled &&
          j.req.itemId === req.itemId &&
          j.req.mediaUrl === req.mediaUrl &&
          // A plain request is answered by any scan of the page; a forced one
          // only by a forced scan, or by a queued one it can still upgrade.
          (!req.force || !!j.req.force || !j.started),
      );
      if (same) {
        if (req.force && !same.req.force) same.req = { ...same.req, force: true };
        if (RANK[priority] < RANK[same.priority]) same.priority = priority;
        // A reader now waits on this scan: a volume's Cancel no longer stops it.
        if (priority !== 'background') same.externalCancel = undefined;
        return same.promise;
      }
      let resolve!: (v: T) => void;
      let reject!: (e: unknown) => void;
      const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
      });
      jobs.push({
        req,
        priority,
        seq: seq++,
        started: false,
        cancelled: false,
        externalCancel: opts?.shouldCancel,
        promise,
        resolve,
        reject,
      });
      pump();
      return promise;
    },
    cancelOthers,
    size: () => jobs.length,
  };
}
