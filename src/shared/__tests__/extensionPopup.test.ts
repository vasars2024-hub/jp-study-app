/*
 * What the toolbar popup RENDERS, read out of a real DOM.
 *
 * Until now popup.js was the one extension file with no behavioural coverage:
 * `node:vm` cannot host it, because every line of its top-level code is
 * `document.getElementById(...)`. So the tests that wanted it asserted on its
 * source text instead — which passes just as happily when the string is built
 * and then never inserted.
 *
 * These drive the real popup.html + shared.js + settings.js + popup.js through
 * `loadPopupSandbox` and assert on the rendered chips. The transcription pill
 * (commit 778ef17d) is the first thing they prove, and its `notStarted` case is
 * the negative control: the whole point of that state is that it renders
 * NOTHING, and a test that only ever checks the happy path cannot tell the
 * difference between "silent" and "broken".
 */
import { describe, it, expect, afterEach } from 'vitest';
import { loadPopupSandbox, type PopupHarness, type JpMessage } from './extensionHarness';

const VIDEO_URL = 'https://www.youtube.com/watch?v=GSx0rW2aHs8';

/**
 * The `detect` answer for an ordinary YouTube video page.
 *
 * `scriptable` is load-bearing, not decoration: without it `refreshPage` takes
 * the browser-restricted branch, blanks `#page-meta` and returns before any
 * pill is built. That is exactly the bug a source-grepping test cannot see.
 */
const youtubeDetect = {
  ok: true,
  scriptable: true,
  kind: 'youtube-video',
  url: VIDEO_URL,
  title: 'Me at the zoo',
  categoryLabel: 'Video',
};

/**
 * Answer the four messages the popup's init always sends, then delegate the
 * interesting one. Anything unrecognised returns undefined, which is what a
 * background worker that does not claim a message actually does.
 */
function popupWith(transcribeStatus: unknown, extra: Partial<Record<string, unknown>> = {}) {
  return loadPopupSandbox({
    respond: (msg: JpMessage) => {
      switch (msg.type) {
        case 'status-summary':
          return { ok: true, app: true, paired: true, pending: 0, profileName: 'User 1' };
        case 'detect':
          return youtubeDetect;
        case 'transcribe-status':
          return transcribeStatus;
        default:
          return (extra as Record<string, unknown>)[String(msg.type)];
      }
    },
    // No content script on the page: refreshPage's badge lookup is wrapped in a
    // try/catch for exactly this, and it must not stop the pill from rendering.
    tabRespond: () => undefined,
  });
}

let harness: PopupHarness | null = null;
afterEach(() => {
  harness?.dispose();
  harness = null;
});

describe('extension popup — transcription pill', () => {
  it('renders the cue count for a video already transcribed', async () => {
    harness = popupWith({ ok: true, state: 'transcribed', cueCount: 8 });
    await harness.settle();

    expect(harness.pills()).toContain('Transcribed · 8 cues');
    // It asks about the id parsed out of the detect URL, not the detect message
    // itself — `detect` carries no videoId and widening it would touch four
    // other callers.
    expect(harness.sent).toContainEqual({ type: 'transcribe-status', videoId: 'GSx0rW2aHs8' });
  });

  it('renders nothing at all for notStarted — the state every video on the internet is in', async () => {
    harness = popupWith({ ok: true, state: 'notStarted', canDownload: true });
    await harness.settle();

    // The control. Before `notStarted` existed this branch printed
    // "transcription failed" over every YouTube page, so the assertion that
    // matters is the ABSENCE of a transcription chip, not the presence of one.
    const pills = harness.pills();
    expect(pills.some((p) => /Transcri/i.test(p))).toBe(false);
    // …while the ordinary page chip is still there, which is what proves the
    // popup rendered at all rather than having thrown before the pills.
    expect(pills).toContain('Video');
  });

  it('names the failure honestly when a job ended without a transcript', async () => {
    harness = popupWith({ ok: true, state: 'failed', reason: 'job-ended-without-transcript' });
    await harness.settle();

    expect(harness.pills()).toContain('Transcription left no text');
  });

  it("counts a running job from the JOB's clock, not from when the popup opened", async () => {
    harness = popupWith({ ok: true, state: 'pending', queuedAt: Date.now() - 7_000 });
    await harness.settle();

    // The defect this guards: a second look at an eight-minute-old job used to
    // restart the counter at 0s. Rounding makes 7s the only stable digit here.
    expect(harness.pills()).toContain('Transcribing · 7s');
  });

  it('omits the elapsed clock rather than inventing one when queuedAt is missing', async () => {
    harness = popupWith({ ok: true, state: 'pending' });
    await harness.settle();

    expect(harness.pills()).toContain('Transcribing');
    expect(harness.pills().some((p) => /Transcribing · /.test(p))).toBe(false);
  });

  it('escapes the cue count instead of interpolating it into markup', async () => {
    harness = popupWith({ ok: true, state: 'transcribed', cueCount: '<img src=x onerror=1>' });
    await harness.settle();

    const meta = harness.document.getElementById('page-meta');
    expect(meta?.querySelector('img')).toBeNull();
    expect(meta?.innerHTML).toContain('&lt;img');
  });

  it('asks nothing about transcription on a page that is not a YouTube video', async () => {
    harness = loadPopupSandbox({
      respond: (msg: JpMessage) => {
        if (msg.type === 'status-summary') return { ok: true, app: true, paired: true, pending: 0 };
        if (msg.type === 'detect') {
          return {
            ok: true,
            scriptable: true,
            kind: 'article',
            url: 'https://example.com/a',
            title: 'A',
            categoryLabel: 'News',
          };
        }
        return undefined;
      },
      tabRespond: () => undefined,
    });
    await harness.settle();

    expect(harness.sent.some((m) => m.type === 'transcribe-status')).toBe(false);
  });
});

describe('extension popup — status header', () => {
  it('reports the app as not running when the background worker says so', async () => {
    harness = loadPopupSandbox({
      respond: (msg: JpMessage) =>
        msg.type === 'status-summary' ? { ok: true, app: false, pending: 0 } : undefined,
      tabRespond: () => undefined,
    });
    await harness.settle();

    expect(harness.text('#status-chip')).toBe('App not running');
    expect(harness.text('#st-app')).toBe('Not running');
  });

  it('distinguishes "running but unpaired" from "not running"', async () => {
    harness = loadPopupSandbox({
      respond: (msg: JpMessage) =>
        msg.type === 'status-summary' ? { ok: true, app: true, paired: false, pending: 0 } : undefined,
      tabRespond: () => undefined,
    });
    await harness.settle();

    // Two different failures with two different fixes; collapsing them into one
    // "not connected" is the honest-states failure this guards against.
    expect(harness.text('#status-chip')).toBe('Pairing needed');
    expect(harness.text('#st-pair')).toBe('Token needed');
  });

  it('surfaces the queue depth in the chip and the pending bar together', async () => {
    harness = loadPopupSandbox({
      respond: (msg: JpMessage) =>
        msg.type === 'status-summary' ? { ok: true, app: true, paired: true, pending: 3 } : undefined,
      tabRespond: () => undefined,
    });
    await harness.settle();

    expect(harness.text('#status-chip')).toBe('Connected · 3 queued');
    expect(harness.text('#pending-text')).toBe('3 items waiting to sync');
    expect(harness.document.getElementById('pending-bar')?.hidden).toBe(false);
  });
});
