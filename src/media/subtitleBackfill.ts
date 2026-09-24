/**
 * Makes sure the directstream sidecar reads a muxed MKV's subtitles from the top of the file
 * at least once without being cut short, so the renderer ends up with every cue of the track.
 *
 * ## The defect this exists for
 *
 * The sidecar extracts muxed subtitle cues while it reads the file, and sends each one as a
 * `subtitle-event`. `video-loaded-metadata` starts that read at byte 0. Every `video-seeked`
 * STOPS the read in progress and starts a new one at the cluster for the seek position —
 * and when that position is not exactly 0 it starts at the cluster AFTER the one holding it.
 * Nothing ever re-reads what was skipped.
 *
 * Chromium emits a `seeked` of its own while it sets up a new media resource, a few ms after
 * `loadedmetadata`: sometimes at 0 (the sidecar restarts at byte 0, nothing is lost) and
 * sometimes at ~0.02 s (it restarts after the first cluster). Measured on the packaged build
 * with the subtitle harness 6h file (5 cues x 2 tracks, the first cluster holds cues 1-2):
 * the first read had sent cue 1's Japanese line when the 0.023 s seek cancelled it, the
 * restart began with cue 3, and 7 of 10 events ever reached the player — cue 1's English line
 * and both lines of cue 2 were gone for the whole session. Whether the bootstrap seek landed
 * on 0 decided pass or fail, which is why 6h failed in full runs and passed alone. A resume
 * position or any seek during the first read loses cues the same way.
 *
 * The sidecar has no request for "the whole track", and a plain HTTP read of the stream does
 * not start extraction. What it does have is the seek at exactly 0, which reads the whole
 * file from byte 0. So once seeks settle, this asks for that pass (`requestFullPass`), and
 * repeats after any later seek until one pass has run to the end undisturbed. Cues it sends
 * again are dropped by `subtitleEventRelay` and by the manager, both keyed the same way.
 *
 * "Run to the end" is inferred: the sidecar does not say when a read finishes, so a pass that
 * has gone `quietMs` without an event is taken as done. The settle delay leaves the read the
 * seek started a moment to send the cues around the playhead before the full pass replaces it.
 */

export interface SubtitleBackfillTimers {
  set(callback: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}

export interface SubtitleBackfillOptions {
  /** Ask the sidecar to read the file's subtitles again from byte 0. */
  requestFullPass: () => void;
  /** Quiet time after the last seek before the pass is requested. */
  settleMs?: number;
  /** A requested pass with no event for this long is taken as finished. */
  quietMs?: number;
  timers?: SubtitleBackfillTimers;
}

export interface SubtitleBackfill {
  /** A new stream. `enabled` only for a sidecar MKV that has subtitle tracks. */
  reset(enabled: boolean): void;
  /** The stream's media loaded: its first read may already be cut short. */
  onStreamStarted(): void;
  /** The player seeked: the sidecar dropped its read and restarted from the seek point. */
  onSeeked(): void;
  /** Subtitle events arrived. */
  onEvents(): void;
  /** Stops every timer (unmount). */
  dispose(): void;
  /** A full pass ran to the end: every cue of every track has been sent. */
  readonly complete: boolean;
  /** Full passes requested for the current stream. */
  readonly requested: number;
}

const defaultTimers: SubtitleBackfillTimers = {
  set: (callback, ms) => setTimeout(callback, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export function createSubtitleBackfill({
  requestFullPass,
  settleMs = 1200,
  quietMs = 4000,
  timers = defaultTimers,
}: SubtitleBackfillOptions): SubtitleBackfill {
  let enabled = false;
  let complete = false;
  let passRunning = false;
  let requested = 0;
  let settleTimer: unknown = null;
  let quietTimer: unknown = null;

  const clearSettle = () => {
    if (settleTimer !== null) timers.clear(settleTimer);
    settleTimer = null;
  };
  const clearQuiet = () => {
    if (quietTimer !== null) timers.clear(quietTimer);
    quietTimer = null;
  };
  const armQuiet = () => {
    clearQuiet();
    quietTimer = timers.set(() => {
      quietTimer = null;
      passRunning = false;
      complete = true;
    }, quietMs);
  };
  // Every seek cancels the sidecar's read, a pass of ours included: wait for the seeks to
  // stop, then ask again.
  const schedule = () => {
    if (!enabled || complete) return;
    passRunning = false;
    clearQuiet();
    clearSettle();
    settleTimer = timers.set(() => {
      settleTimer = null;
      if (!enabled || complete) return;
      requested += 1;
      passRunning = true;
      requestFullPass();
      armQuiet();
    }, settleMs);
  };

  return {
    reset(nextEnabled) {
      clearSettle();
      clearQuiet();
      enabled = nextEnabled;
      complete = false;
      passRunning = false;
      requested = 0;
    },
    onStreamStarted: schedule,
    onSeeked: schedule,
    onEvents() {
      if (passRunning) armQuiet();
    },
    dispose() {
      clearSettle();
      clearQuiet();
      enabled = false;
    },
    get complete() {
      return complete;
    },
    get requested() {
      return requested;
    },
  };
}
