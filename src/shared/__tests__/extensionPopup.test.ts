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
import { describe, it, expect, afterEach, beforeAll } from 'vitest';
import { loadPopupSandbox, warmPopupDom, type PopupHarness, type JpMessage } from './extensionHarness';

// jsdom's cold load (~21 s on Windows) used to be charged to the first test's
// 20 s budget, so that test timed out even alone. Paid here instead.
beforeAll(() => {
  warmPopupDom();
}, 120_000);

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

describe('extension popup — the Transcribe button', () => {
  /**
   * The gate in the plan's own words is "the button transcribes the audio of the
   * page being watched and RETURNS A CUE COUNT". `/v1/transcribe` can only answer
   * `queued`, so the count arrives later from the status poller — which means the
   * only honest check drives the click and then reads the feedback line the user
   * ends up looking at. Six tests used to assert this by grepping popup.js for
   * `followTranscription(res.videoId, res.queuedAt)`; that string can be present
   * in a build where the button is never rendered at all.
   */
  function transcribeRun(statuses: unknown[]) {
    const queue = [...statuses];
    return loadPopupSandbox({
      fastPoll: true,
      respond: (msg: JpMessage) => {
        switch (msg.type) {
          case 'status-summary':
            return { ok: true, app: true, paired: true, pending: 0 };
          case 'detect':
            return youtubeDetect;
          case 'transcribe-status':
            // The page-load pill takes the first entry; the poller takes the rest.
            return queue.length > 1 ? queue.shift() : queue[0];
          case 'run-command':
            return msg.command === 'media.transcribe'
              ? { ok: true, state: 'queued', videoId: 'GSx0rW2aHs8', queuedAt: Date.now() }
              : { ok: false };
          default:
            return undefined;
        }
      },
      tabRespond: () => undefined,
    });
  }

  it('ends on the cue count after following a job it queued', async () => {
    harness = transcribeRun([
      { ok: true, state: 'notStarted' },
      { ok: true, state: 'pending', queuedAt: Date.now() },
      { ok: true, state: 'transcribed', cueCount: 8 },
    ]);
    await harness.settle();

    harness.clickAction('transcribe');
    await harness.settle(40);

    expect(harness.text('#feedback')).toBe('Transcribed — 8 cues. Mine it from Files or Mining.');
    expect(harness.document.getElementById('feedback')?.className).toBe('ok');
  });

  it('says a job left no text rather than reporting a count it does not have', async () => {
    harness = transcribeRun([
      { ok: true, state: 'notStarted' },
      { ok: true, state: 'failed', reason: 'job-ended-without-transcript' },
    ]);
    await harness.settle();

    harness.clickAction('transcribe');
    await harness.settle(40);

    expect(harness.text('#feedback')).toBe(
      'The transcription ended without a transcript. Retry from the Media library.',
    );
    expect(harness.document.getElementById('feedback')?.className).toBe('err');
  });

  it('keeps notStarted and failed on separate sentences all the way to the DOM', async () => {
    harness = transcribeRun([
      { ok: true, state: 'notStarted' },
      { ok: true, state: 'notStarted' },
    ]);
    await harness.settle();

    harness.clickAction('transcribe');
    await harness.settle(40);

    // The control for the one above: same click, same button, a DIFFERENT
    // sentence. A shared "transcription failed" for both is the defect the
    // named-refusal table exists to prevent, and only a live read can tell.
    expect(harness.text('#feedback')).toBe(
      'Nothing has been downloaded for this video yet, so no transcription has run.',
    );
  });

  it('offers no Transcribe button on a page with no audio to transcribe', async () => {
    const popup = loadPopupSandbox({
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
    harness = popup;
    await popup.settle();

    expect(() => popup.clickAction('transcribe')).toThrow(/offers no "transcribe" action/);
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
