/**
 * MINING gate 11 — "a NAMED refusal when no audio is resolvable".
 *
 * The gate's currency is that each distinct situation gets its own answer. So
 * this suite is organised as one case per refusal, plus the two success paths,
 * plus the controls that stop the planner from being a constant:
 *
 * - every refusal must be REACHABLE (a planner that can only say one thing
 *   would pass a suite that only checked one thing);
 * - every refusal must have its own i18n key, all four languages, and the keys
 *   must be DISTINCT (five reasons sharing one sentence is a generic error
 *   wearing five names);
 * - the ORDER must hold: the most specific true refusal wins, and a video that
 *   is already transcribed answers with its count even when nothing else on the
 *   machine could run a new job.
 */
import { describe, expect, it } from 'vitest';
import { bootBackground, readExtensionFile } from './extensionHarness';
import {
  EXTENSION_TRANSCRIBE_REFUSALS,
  countTranscriptCues,
  planExtensionTranscribe,
  resolveExtensionTranscribeStatus,
  transcribeRefusalKey,
  type ExtensionTranscribeFacts,
} from '../extensionTranscribe';
import { en } from '../i18n/catalogs/en';
import { ja } from '../i18n/catalogs/ja';
import { zh } from '../i18n/catalogs/zh';
import { ru } from '../i18n/catalogs/ru';

/** A video that is downloaded, has no transcript, and could be queued. */
const READY: ExtensionTranscribeFacts = {
  pageKind: 'youtube-video',
  videoId: 'x9QKu3OLjaU',
  existingCueCount: null,
  mediaId: 'media-1',
  mediaFileExists: true,
  transcriberReady: true,
};

describe('gate 11 — every refusal is named and reachable', () => {
  it('an article page refuses notAVideoPage', () => {
    const plan = planExtensionTranscribe({ ...READY, pageKind: 'article' });
    expect(plan).toMatchObject({ action: 'refuse', reason: 'notAVideoPage' });
  });

  it('a video page whose id would not parse refuses noVideoId', () => {
    const plan = planExtensionTranscribe({ ...READY, videoId: null });
    expect(plan).toMatchObject({ action: 'refuse', reason: 'noVideoId' });
  });

  it('a video that was never downloaded refuses notDownloaded', () => {
    const plan = planExtensionTranscribe({ ...READY, mediaId: null });
    expect(plan).toMatchObject({ action: 'refuse', reason: 'notDownloaded', videoId: 'x9QKu3OLjaU' });
  });

  it('a record whose file is gone refuses audioMissing, not notDownloaded', () => {
    const plan = planExtensionTranscribe({ ...READY, mediaFileExists: false });
    expect(plan).toMatchObject({ action: 'refuse', reason: 'audioMissing' });
  });

  it('no transcription host refuses transcriberOffline', () => {
    const plan = planExtensionTranscribe({ ...READY, transcriberReady: false });
    expect(plan).toMatchObject({ action: 'refuse', reason: 'transcriberOffline' });
  });

  it('control: all five refusals are reachable, so the planner is not a constant', () => {
    const reached = new Set<string>();
    for (const facts of [
      { ...READY, pageKind: 'article' },
      { ...READY, videoId: null },
      { ...READY, mediaId: null },
      { ...READY, mediaFileExists: false },
      { ...READY, transcriberReady: false },
    ]) {
      const plan = planExtensionTranscribe(facts);
      if (plan.action === 'refuse') reached.add(plan.reason);
    }
    expect([...reached].sort()).toEqual([...EXTENSION_TRANSCRIBE_REFUSALS].sort());
  });
});

describe('gate 11 — the success paths', () => {
  it('a ready video is queued against its media row', () => {
    expect(planExtensionTranscribe(READY)).toEqual({
      action: 'enqueue',
      videoId: 'x9QKu3OLjaU',
      mediaId: 'media-1',
    });
  });

  it('an already-transcribed video reports its cue count', () => {
    const plan = planExtensionTranscribe({ ...READY, existingCueCount: 86 });
    expect(plan).toEqual({ action: 'report', videoId: 'x9QKu3OLjaU', cueCount: 86 });
  });

  it('reports even when nothing on this machine could run a NEW job', () => {
    // The gate's "mineable later without returning to the page": the cue count
    // is a fact on disk and does not depend on the transcriber being up.
    const plan = planExtensionTranscribe({
      ...READY,
      existingCueCount: 12,
      mediaId: null,
      mediaFileExists: false,
      transcriberReady: false,
    });
    expect(plan).toEqual({ action: 'report', videoId: 'x9QKu3OLjaU', cueCount: 12 });
  });

  it('a transcript that produced 0 cues is REPORTED as 0, not treated as absent', () => {
    // An empty result is a finding. Merging it with "no transcript yet" would
    // re-queue the same silent video forever and never say why.
    const plan = planExtensionTranscribe({ ...READY, existingCueCount: 0 });
    expect(plan).toEqual({ action: 'report', videoId: 'x9QKu3OLjaU', cueCount: 0 });
  });
});

describe('gate 11 — the refusal keys are real and distinct', () => {
  it('every reason has a key in all four catalogues', () => {
    const missing: string[] = [];
    for (const reason of EXTENSION_TRANSCRIBE_REFUSALS) {
      const key = transcribeRefusalKey(reason);
      for (const [name, catalog] of [['en', en], ['ja', ja], ['zh', zh], ['ru', ru]] as const) {
        if (!(key in catalog)) missing.push(`${name}:${key}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('control: the five English sentences are five DIFFERENT sentences', () => {
    const texts = EXTENSION_TRANSCRIBE_REFUSALS.map(
      (reason) => en[transcribeRefusalKey(reason)] as string,
    );
    expect(new Set(texts).size).toBe(EXTENSION_TRANSCRIBE_REFUSALS.length);
    // And a key that does not exist must NOT resolve, or the check above would
    // pass on a catalogue that answered everything.
    expect('extension.transcribe.refuse.notARealReason' in en).toBe(false);
  });
});

describe('gate 11 — the cue count comes from the file, not from a flag', () => {
  it('counts the cues a transcript actually holds', () => {
    expect(countTranscriptCues('[{"text":"a"},{"text":"b"}]')).toBe(2);
    expect(countTranscriptCues('[]')).toBe(0);
  });

  it('a corrupt or non-array file reads as absent, never as a confident 0', () => {
    expect(countTranscriptCues('not json')).toBeNull();
    expect(countTranscriptCues('{"cues":[]}')).toBeNull();
    expect(countTranscriptCues('')).toBeNull();
  });
});

describe('gate 11 — polling follows the queue sink', () => {
  it('reports the generated media track before the legacy playlist file', () => {
    expect(resolveExtensionTranscribeStatus({
      mediaCueCount: 37,
      playlistCueCount: 12,
      active: false,
      mediaKnown: true,
    })).toEqual({ state: 'transcribed', cueCount: 37 });
  });

  it('preserves a real zero-cue result', () => {
    expect(resolveExtensionTranscribeStatus({
      mediaCueCount: 0,
      playlistCueCount: null,
      active: false,
      mediaKnown: true,
    })).toEqual({ state: 'transcribed', cueCount: 0 });
  });

  it('says pending only while the queue still owns the job', () => {
    expect(resolveExtensionTranscribeStatus({
      mediaCueCount: null,
      playlistCueCount: null,
      active: true,
      mediaKnown: true,
    })).toEqual({ state: 'pending', cueCount: null });
  });

  it('a retired or failed job stops claiming it is pending', () => {
    expect(resolveExtensionTranscribeStatus({
      mediaCueCount: null,
      playlistCueCount: null,
      active: false,
      mediaKnown: true,
    })).toEqual({
      state: 'failed',
      cueCount: null,
      reason: 'job-ended-without-transcript',
    });
  });

  /*
   * The defect this branch fixes: with no media row there is nothing
   * `enqueueTranscription` could ever have been handed, so "the job ended
   * without a transcript" is a statement about a job that does not exist.
   * Anything polling on page load rather than only after its own POST — which
   * is the obvious next feature for this route — hits this case first.
   */
  it('a video that was never downloaded says notStarted, not failed', () => {
    expect(resolveExtensionTranscribeStatus({
      mediaCueCount: null,
      playlistCueCount: null,
      active: false,
      mediaKnown: false,
    })).toEqual({
      state: 'notStarted',
      cueCount: null,
      reason: 'no-local-media',
    });
  });

  it('control: the same absent media row still reports a transcript that exists', () => {
    // Otherwise `notStarted` would swallow the legacy playlist sink, whose cue
    // file outlives the media row it came from — a real regression shaped
    // exactly like a fix.
    expect(resolveExtensionTranscribeStatus({
      mediaCueCount: null,
      playlistCueCount: 8,
      active: false,
      mediaKnown: false,
    })).toEqual({ state: 'transcribed', cueCount: 8 });
  });

  it('control: notStarted never outranks a job that is actually running', () => {
    expect(resolveExtensionTranscribeStatus({
      mediaCueCount: null,
      playlistCueCount: null,
      active: true,
      mediaKnown: false,
    })).toEqual({ state: 'pending', cueCount: null });
  });

  /*
   * The two routes answer about the same machine and must not contradict each
   * other: it would be incoherent for the POST to say "download it first"
   * while the GET says the transcription failed.
   */
  it('agrees with the POST: notDownloaded on one route is notStarted on the other', () => {
    const facts = {
      pageKind: 'youtube-video',
      videoId: 'GSx0rW2aHs8',
      existingCueCount: null,
      mediaId: null,
      mediaFileExists: false,
      transcriberReady: true,
    };
    expect(planExtensionTranscribe(facts)).toMatchObject({
      action: 'refuse',
      reason: 'notDownloaded',
    });
    expect(resolveExtensionTranscribeStatus({
      mediaCueCount: null,
      playlistCueCount: facts.existingCueCount,
      active: false,
      mediaKnown: Boolean(facts.mediaId),
    })).toMatchObject({ state: 'notStarted' });
  });
});

/**
 * The gate says the BUTTON returns a cue count. Until the extension polls, the
 * status route is a correct answer nobody asks for: `/v1/transcribe` can only
 * ever reply `queued`, and the click ended there. These drive the real
 * `background.js` through the same `chrome.runtime.onMessage` a popup uses.
 */
describe('gate 11 — the extension actually asks for the count', () => {
  const statusUrl = 'http://127.0.0.1:18765/v1/transcribe/status?videoId=GSx0rW2aHs8';

  it('transcribe-status reaches the app route and passes its answer through', async () => {
    const harness = bootBackground({
      responder: (url) =>
        url.includes('/v1/transcribe/status')
          ? { status: 200, json: { ok: true, videoId: 'GSx0rW2aHs8', state: 'transcribed', cueCount: 41 } }
          : { status: 200, json: { ok: true } },
    });
    const res = await harness.send({ type: 'transcribe-status', videoId: 'GSx0rW2aHs8' });
    expect(res).toMatchObject({ state: 'transcribed', cueCount: 41 });
    expect(harness.fetches.map((f) => f.url)).toContain(statusUrl);
    // The token has to travel or the route answers 401 and the popup would
    // report "not paired" for a job that is running fine.
    expect(harness.fetches.at(-1)?.headers?.Authorization).toBe('Bearer tok');
  });

  it('a pending job is passed through as pending, not rounded to a failure', async () => {
    const harness = bootBackground({
      responder: () => ({ status: 200, json: { ok: true, state: 'pending', cueCount: null } }),
    });
    const res = await harness.send({ type: 'transcribe-status', videoId: 'GSx0rW2aHs8' });
    expect(res).toMatchObject({ state: 'pending', cueCount: null });
  });

  it('an app that is not running answers offline instead of throwing', async () => {
    const harness = bootBackground({ responder: () => 'network-error' });
    const res = await harness.send({ type: 'transcribe-status', videoId: 'GSx0rW2aHs8' });
    expect(res).toMatchObject({ ok: false, offline: true });
  });

  it('control: a missing videoId never reaches the network', async () => {
    const harness = bootBackground();
    const res = await harness.send({ type: 'transcribe-status', videoId: '  ' });
    expect(res).toMatchObject({ ok: false, state: 'failed' });
    expect(harness.fetches.filter((f) => f.url.includes('/v1/transcribe'))).toEqual([]);
  });

  it('the popup follows a queued job and ends on the cue count', () => {
    // popup.js is a classic script wired to a DOM this suite does not build, so
    // the honest check is that the queued branch is wired to the poller and the
    // poller ends on the number — not a second copy of the popup's plumbing.
    const popup = readExtensionFile('popup.js');
    expect(popup).toContain("res?.state === 'queued'");
    expect(popup).toContain('followTranscription(res.videoId)');
    expect(popup).toMatch(/type: 'transcribe-status', videoId/);
    expect(popup).toMatch(/Transcribed — \$\{res\.cueCount\} cues/);
    // And the four endings stay distinct: a shared sentence is the defect the
    // named-refusal table exists to prevent.
    expect(popup).toContain('The transcription ended without a transcript.');
    expect(popup).toContain("res.state === 'notStarted'");
    expect(popup).toContain('Nothing has been downloaded for this video yet');
  });

  it('control: notStarted and failed do not share a sentence in the popup', () => {
    const popup = readExtensionFile('popup.js');
    const sentences = [
      'The transcription ended without a transcript. Retry from the Media library.',
      'Nothing has been downloaded for this video yet, so no transcription has run.',
    ];
    expect(new Set(sentences).size).toBe(2);
    for (const sentence of sentences) expect(popup).toContain(sentence);
  });

  it('notStarted is passed through the background verbatim, not rounded to failed', async () => {
    const harness = bootBackground({
      responder: () => ({
        status: 200,
        json: { ok: false, state: 'notStarted', cueCount: null, reason: 'no-local-media', canDownload: true },
      }),
    });
    const res = await harness.send({ type: 'transcribe-status', videoId: 'GSx0rW2aHs8' });
    expect(res).toMatchObject({ state: 'notStarted', reason: 'no-local-media', canDownload: true });
  });
});
