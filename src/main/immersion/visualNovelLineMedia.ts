/**
 * Per-line screenshot and voice clip for live visual novel capture — the
 * GSM-style "every line is a card with its picture and its voice".
 *
 * When a captured line is saved:
 *
 *   - screenshot: the game window (or the window the user chose) is grabbed
 *     at once — the line has just appeared, so the text box shows it — and the
 *     picture is attached to the line;
 *   - audio: a game voices a line AFTER it appears and stops when the player
 *     advances, so a line's clip is the system audio from when it appeared to
 *     when the next line did (from a short lead-in, capped in length). The clip
 *     can only be cut once that end is known: the next line, the cap running
 *     out, or capture stopping. The audio itself lives in the system-audio
 *     replay buffer (`shared/systemAudioRing.ts`, kept by
 *     `main/systemAudioCapture.ts`) and is only read back for that span.
 *
 * Both are off by default and switched on in the capture settings. The grab,
 * the cut and the write to the line are injected, so the timing and the
 * attaching are tested with fakes (`__tests__/visualNovelLineMedia.test.ts`).
 */

/** The clip starts this long before the line appeared (the voice may lead the text). */
export const LINE_AUDIO_LEAD_MS = 250;
/** No clip is longer than this: a line left on screen is not a recording. */
export const LINE_AUDIO_MAX_MS = 15_000;
/** Shorter than this is a line skipped past, not a voiced one: nothing is cut. */
export const LINE_AUDIO_MIN_MS = 400;

export interface LineMediaOptions {
  screenshot: boolean;
  audio: boolean;
}

export interface LineMediaPatch {
  screenshotPath?: string;
  audioPath?: string;
}

export interface LineMediaDeps {
  /** Grab the game window and store the picture; '' when nothing could be grabbed. */
  grabScreenshot: () => Promise<string>;
  /** Cut the system audio between two wall times and store it; '' when there is none. */
  cutAudio: (startMs: number, endMs: number) => Promise<string>;
  /** Write the stored files onto the saved lines. */
  attach: (captureIds: readonly string[], patch: LineMediaPatch) => void;
  /** A grab or a cut that failed, for the capture state to report. */
  onError?: (kind: 'screenshot' | 'audio', error: unknown) => void;
  now?: () => number;
  setTimeout?: (fn: () => void, ms: number) => unknown;
  clearTimeout?: (handle: unknown) => void;
}

interface PendingClip {
  ids: string[];
  startMs: number;
  timer: unknown;
}

export function createLineMediaAttacher(deps: LineMediaDeps) {
  const now = deps.now ?? Date.now;
  const later = deps.setTimeout ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
  const cancel = deps.clearTimeout ?? ((handle: unknown) => clearTimeout(handle as NodeJS.Timeout));
  let options: LineMediaOptions = { screenshot: false, audio: false };
  let pending: PendingClip | null = null;
  /** Work still running (grabs, cuts), so a stop can wait for the last clip. */
  const inFlight = new Set<Promise<void>>();

  const track = (job: Promise<void>): Promise<void> => {
    inFlight.add(job);
    void job.finally(() => inFlight.delete(job));
    return job;
  };

  const drop = (): void => {
    if (pending?.timer) cancel(pending.timer);
    pending = null;
  };

  /** Cut the waiting line's clip, ending at `endMs` (never past the cap). */
  const closePending = (endMs: number): Promise<void> => {
    const clip = pending;
    if (!clip) return Promise.resolve();
    if (clip.timer) cancel(clip.timer);
    pending = null;
    const end = Math.min(endMs, clip.startMs + LINE_AUDIO_MAX_MS);
    if (end - clip.startMs < LINE_AUDIO_MIN_MS) return Promise.resolve();
    return track((async () => {
      try {
        const audioPath = await deps.cutAudio(clip.startMs - LINE_AUDIO_LEAD_MS, end);
        if (audioPath) deps.attach(clip.ids, { audioPath });
      } catch (error) {
        deps.onError?.('audio', error);
      }
    })());
  };

  return {
    options: (): LineMediaOptions => options,

    /** New settings; turning audio off forgets the line waiting for its clip. */
    configure(next: LineMediaOptions): void {
      options = { screenshot: next.screenshot === true, audio: next.audio === true };
      if (!options.audio) drop();
    },

    /**
     * Lines were saved. Ends the previous line's clip here, grabs this one's
     * picture, and opens its clip. `at` is when the line arrived.
     */
    lineCaptured(captureIds: readonly string[], at: number = now()): Promise<void> {
      const ids = captureIds.filter(Boolean);
      const jobs: Promise<void>[] = [closePending(at)];
      if (!ids.length) return Promise.all(jobs).then(() => undefined);
      if (options.screenshot) {
        jobs.push(track((async () => {
          try {
            const screenshotPath = await deps.grabScreenshot();
            if (screenshotPath) deps.attach(ids, { screenshotPath });
          } catch (error) {
            deps.onError?.('screenshot', error);
          }
        })()));
      }
      if (options.audio) {
        const clip: PendingClip = { ids: [...ids], startMs: at, timer: null };
        clip.timer = later(() => {
          if (pending === clip) void closePending(clip.startMs + LINE_AUDIO_MAX_MS);
        }, LINE_AUDIO_MAX_MS);
        pending = clip;
      }
      return Promise.all(jobs).then(() => undefined);
    },

    /** Capture stopped: the last line's clip ends now, and everything running finishes. */
    async flush(): Promise<void> {
      await closePending(now());
      await Promise.all([...inFlight]);
    },

    /** Forget the waiting clip without cutting it (a new session, a test session). */
    reset(): void {
      drop();
    },

    /** The line still waiting for its clip (tests). */
    pendingIds: (): readonly string[] => pending?.ids ?? [],
  };
}

export type LineMediaAttacher = ReturnType<typeof createLineMediaAttacher>;
