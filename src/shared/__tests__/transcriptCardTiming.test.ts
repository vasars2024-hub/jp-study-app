/**
 * Transcript cards must not claim an alignment nobody measured.
 *
 * `runJob` builds cards from the worker's cue windows when it returns any, and
 * otherwise from a synthetic grid of `index * CHUNK_SECONDS`. Both paths then run
 * through the same segmenter, get the same `startSec`/`endSec` fields, get the same
 * ffmpeg clip and land in the deck with the same `sceneReference` — so before this,
 * a card whose seconds were invented read exactly like one that was measured.
 *
 * The directive's wording is the bar: "Do not claim exact alignment from coarse
 * fallback cues; label degraded timing honestly."
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { segmentTranscriptSentences, transcriptTimingSource } from '../transcriptionSentenceCards';

const SRC = resolve(__dirname, '../..');
const JOBS = resolve(SRC, 'main/transcriptionJobs.ts');
const APP = resolve(SRC, 'renderer/App.tsx');
const FLASHCARDS = resolve(SRC, 'renderer/components/flashcards/FlashcardsContent.tsx');

/** Comments out first — this file's subject is discussed in prose in all three. */
function code(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => {
      const trimmed = line.trimStart();
      return !trimmed.startsWith('//') && !trimmed.startsWith('*');
    })
    .join('\n');
}

describe('transcriptTimingSource', () => {
  it('cue windows are an alignment; no cue windows is an estimate', () => {
    expect(transcriptTimingSource(1)).toBe('cue-aligned');
    expect(transcriptTimingSource(412)).toBe('cue-aligned');
    expect(transcriptTimingSource(0)).toBe('chunk-estimated');
  });

  it('the fallback grid really does produce different seconds for the same text', () => {
    // The two paths `runJob` chooses between, on identical text. If they agreed,
    // labelling the second one would be pedantry rather than honesty.
    const text = 'これはテストです。もう一つの文です。';
    const aligned = segmentTranscriptSentences([{ start: 12.4, end: 15.1, text }]);
    const estimated = segmentTranscriptSentences([{ start: 0, end: 30, text }]);

    expect(aligned).toHaveLength(2);
    expect(estimated).toHaveLength(2);
    expect(aligned[0].start).toBeCloseTo(12.4, 5);
    expect(estimated[0].start).toBeCloseTo(0, 5);
    // 2.7 s of measured window against a 30 s chunk: an order of magnitude apart.
    expect(estimated[1].end - estimated[1].start)
      .toBeGreaterThan((aligned[1].end - aligned[1].start) * 5);
  });
});

describe('the job stamps every card and the batch', () => {
  it('the timing is derived once and reaches both the cards and the broadcast', () => {
    const source = code(readFileSync(JOBS, 'utf8'));
    expect(source).toMatch(/const timing: TranscriptCardTiming = transcriptTimingSource\(timedCues\.length\)/);

    // The card mapper and the broadcast each carry it. A card-only stamp would leave
    // any batch-level surface guessing, and a broadcast-only stamp would lose it the
    // moment a card is read on its own.
    const broadcast = /broadcastCardsReady\(\{([\s\S]*?)\}\);/.exec(source);
    expect(broadcast?.[1]).toMatch(/\btiming,/);
    const mapper = /const cards = await mapWithConcurrency\(([\s\S]*?)\n {6}\}\);/.exec(source);
    expect(mapper?.[1]).toMatch(/\btiming,/);
  });
});

describe('the deck records it, and only the estimate is announced', () => {
  it('App writes timingFidelity, and marks the seconds approximate only when estimated', () => {
    const source = code(readFileSync(APP, 'utf8'));
    expect(source).toMatch(/timingFidelity: card\.timing/);

    // The tilde is conditional on the estimate. A prefix applied to every card would
    // be the same lie in the other direction.
    const scene = /sceneReference: card\.timing === 'chunk-estimated'([\s\S]*?)studyActionId/.exec(source);
    expect(scene, 'sceneReference is no longer conditional on timing').toBeTruthy();
    expect(scene?.[1]).toContain('≈');
    const branches = (scene?.[1].match(/startSec\.toFixed\(2\)/g) ?? []).length;
    expect(branches).toBe(2);
    expect((scene?.[1].match(/≈/g) ?? []).length).toBe(1);
  });

  it('the review badge is gated on the exact value, not on the field being set', () => {
    const source = code(readFileSync(FLASHCARDS, 'utf8'));
    expect(source).toMatch(/current\.timingFidelity === 'chunk-estimated'/);
    // Control: a truthiness gate would also label every `cue-aligned` card, which is
    // the failure this whole change exists to prevent.
    expect(source).not.toMatch(/\{current\.timingFidelity &&/);
    expect(source).toMatch(/flash\.timing\.estimated/);
  });
});

describe('the label is translated', () => {
  it('both keys exist in all four catalogs', async () => {
    const { CATALOGS } = await import('../i18n/catalogs/all');
    for (const key of ['flash.timing.estimated', 'flash.timing.estimated.detail']) {
      for (const lang of ['en', 'ja', 'zh', 'ru'] as const) {
        const entry = (CATALOGS[lang] as Record<string, string>)[key];
        expect(entry, `${key} missing from ${lang}`).toBeTruthy();
      }
    }
    // The detail line is the one that has to actually say what is estimated, so it
    // is not allowed to be a copy of the two-word chip in any language.
    for (const lang of ['en', 'ja', 'zh', 'ru'] as const) {
      const catalog = CATALOGS[lang] as Record<string, string>;
      expect(catalog['flash.timing.estimated.detail'].length)
        .toBeGreaterThan(catalog['flash.timing.estimated'].length * 3);
    }
  });
});
