/**
 * The YouTube manager's download queue (audit r2 #17).
 *
 * "Download all" used to run twenty yt-dlp downloads in one IPC call the
 * window awaited, with no way to stop any of them and every control disabled
 * until the last one finished. Downloads now go through this queue: one at a
 * time, each with its own state and progress, and each can be paused (the
 * process is stopped and the partial file kept, so yt-dlp's `--continue`
 * picks it up again), resumed, or cancelled (stopped, and its partial files
 * removed). The caller who enqueued can still await the results — the
 * extension bridge does — while the window never has to.
 *
 * Pure of Electron: the downloader, the partial-file cleaner and the change
 * sink are injected, so the state machine is tested without yt-dlp.
 */

export type YtQueueState = 'queued' | 'downloading' | 'paused' | 'done' | 'failed' | 'cancelled';

export interface YtQueueEntry {
  videoId: string;
  state: YtQueueState;
  /** 0-100 for the current attempt. */
  percent: number;
  stage?: string;
  error?: string;
  mediaItemId?: string;
}

export type YtQueueRunResult =
  | { ok: true; mediaItemId: string }
  | { ok: false; error: string; aborted?: boolean };

export interface YtQueueDeps {
  /** Download one video. Must stop promptly when `signal` aborts. */
  run: (
    videoId: string,
    signal: AbortSignal,
    onProgress: (ev: { stage: string; percent: number }) => void,
  ) => Promise<YtQueueRunResult>;
  /** Remove a cancelled download's partial files. */
  cleanup: (videoId: string) => void;
  /** Every state change, for the windows showing the queue. */
  onChange?: (entries: YtQueueEntry[]) => void;
}

export interface YtQueueResult {
  videoId: string;
  ok: boolean;
  error?: string;
  mediaItemId?: string;
}

const SETTLED: ReadonlySet<YtQueueState> = new Set(['done', 'failed', 'cancelled']);

export class YtDownloadQueue {
  private entries: YtQueueEntry[] = [];
  private active: { videoId: string; controller: AbortController; intent: 'pause' | 'cancel' | null } | null = null;
  private readonly waiters = new Map<string, Array<(r: YtQueueResult) => void>>();
  private pumping = false;

  constructor(private readonly deps: YtQueueDeps) {}

  snapshot(): YtQueueEntry[] {
    return this.entries.map((e) => ({ ...e }));
  }

  /**
   * Add videos (an id already waiting or running is not added twice) and
   * resolve once every one of them has finished, failed or been cancelled.
   */
  enqueue(videoIds: readonly string[]): Promise<YtQueueResult[]> {
    const ids = [...new Set(videoIds.filter((id) => typeof id === 'string' && id))];
    const promises = ids.map(
      (videoId) =>
        new Promise<YtQueueResult>((resolve) => {
          const list = this.waiters.get(videoId) ?? [];
          list.push(resolve);
          this.waiters.set(videoId, list);
        }),
    );
    for (const videoId of ids) {
      const existing = this.entries.find((e) => e.videoId === videoId);
      if (existing && !SETTLED.has(existing.state)) continue;
      this.entries = this.entries.filter((e) => e.videoId !== videoId);
      this.entries.push({ videoId, state: 'queued', percent: 0 });
    }
    this.changed();
    void this.pump();
    return Promise.all(promises);
  }

  /** Cancel some (or, with no ids, all) unfinished downloads. */
  cancel(videoIds?: readonly string[]): void {
    const wanted = videoIds ? new Set(videoIds) : null;
    for (const entry of this.entries) {
      if (SETTLED.has(entry.state) || (wanted && !wanted.has(entry.videoId))) continue;
      if (this.active?.videoId === entry.videoId) {
        this.active.intent = 'cancel';
        this.active.controller.abort();
        continue;
      }
      const wasPaused = entry.state === 'paused';
      this.settle(entry, 'cancelled');
      if (wasPaused) this.safeCleanup(entry.videoId);
    }
    this.changed();
  }

  pause(videoId: string): void {
    const entry = this.entries.find((e) => e.videoId === videoId);
    if (!entry) return;
    if (this.active?.videoId === videoId) {
      this.active.intent = 'pause';
      this.active.controller.abort();
      return;
    }
    if (entry.state === 'queued') {
      entry.state = 'paused';
      this.changed();
    }
  }

  resume(videoId: string): void {
    const entry = this.entries.find((e) => e.videoId === videoId);
    if (!entry || entry.state !== 'paused') return;
    entry.state = 'queued';
    this.changed();
    void this.pump();
  }

  /** Drop finished rows from the list the window shows. */
  clearFinished(): void {
    this.entries = this.entries.filter((e) => !SETTLED.has(e.state));
    this.changed();
  }

  private async pump(): Promise<void> {
    if (this.pumping) return;
    this.pumping = true;
    try {
      for (;;) {
        const next = this.entries.find((e) => e.state === 'queued');
        if (!next) return;
        const controller = new AbortController();
        this.active = { videoId: next.videoId, controller, intent: null };
        next.state = 'downloading';
        next.error = undefined;
        this.changed();
        let result: YtQueueRunResult;
        try {
          result = await this.deps.run(next.videoId, controller.signal, (ev) => {
            next.percent = ev.percent;
            next.stage = ev.stage;
            this.changed();
          });
        } catch (err) {
          result = { ok: false, error: err instanceof Error ? err.message : String(err) };
        }
        const intent = this.active?.intent ?? null;
        this.active = null;
        if (intent === 'pause') {
          next.state = 'paused';
        } else if (intent === 'cancel') {
          this.settle(next, 'cancelled');
          this.safeCleanup(next.videoId);
        } else if (result.ok) {
          next.mediaItemId = result.mediaItemId;
          next.percent = 100;
          this.settle(next, 'done');
        } else {
          next.error = result.error;
          this.settle(next, 'failed');
        }
        this.changed();
      }
    } finally {
      this.pumping = false;
    }
  }

  private settle(entry: YtQueueEntry, state: 'done' | 'failed' | 'cancelled'): void {
    entry.state = state;
    const list = this.waiters.get(entry.videoId) ?? [];
    this.waiters.delete(entry.videoId);
    const result: YtQueueResult = {
      videoId: entry.videoId,
      ok: state === 'done',
      ...(entry.error ? { error: entry.error } : state === 'cancelled' ? { error: 'cancelled' } : {}),
      ...(entry.mediaItemId ? { mediaItemId: entry.mediaItemId } : {}),
    };
    for (const resolve of list) resolve(result);
  }

  private safeCleanup(videoId: string): void {
    try {
      this.deps.cleanup(videoId);
    } catch {
      /* a partial file left behind is untidy, not a failed cancel */
    }
  }

  private changed(): void {
    try {
      this.deps.onChange?.(this.snapshot());
    } catch {
      /* a window that went away must not stop the queue */
    }
  }
}
