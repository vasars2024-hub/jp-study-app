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
import {
  EXTENSION_TRANSCRIBE_REFUSALS,
  countTranscriptCues,
  planExtensionTranscribe,
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
