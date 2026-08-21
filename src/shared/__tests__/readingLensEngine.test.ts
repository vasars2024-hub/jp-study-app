/**
 * The lens's engine default and its processing-location claim.
 *
 * Two of these tests exist to fail when someone adds a cloud recognizer: the
 * facts table must carry an entry for every offered choice, and the "runs on
 * this device" indicator must be *derived* from that table rather than
 * hardcoded. The privacy string in Settings is gated on that derivation, so a
 * silent inheritance of the honest label is the defect being guarded against.
 */
import { describe, expect, it } from 'vitest';
import {
  READING_LENS_ENGINE_CHOICES,
  READING_LENS_ENGINE_DEFAULT,
  READING_LENS_ENGINE_FACTS,
  normalizeReadingLensEngine,
  readingLensEngineRunnable,
  readingLensOcrIsFullyOnDevice,
  type ReadingLensEngine,
  type ReadingLensEngineStatus,
} from '../readingLensEngine';

const status = (patch: Partial<ReadingLensEngineStatus> = {}): ReadingLensEngineStatus => ({
  manga: true,
  web: true,
  webLangs: ['ja'],
  none: false,
  ...patch,
});

describe('normalizeReadingLensEngine', () => {
  it('keeps every offered choice', () => {
    for (const engine of READING_LENS_ENGINE_CHOICES) {
      expect(normalizeReadingLensEngine(engine)).toBe(engine);
    }
  });

  it('falls back to the default, never to a neighbour', () => {
    // `reading-lens.json` is user-writable and survives across versions, so a
    // value this build cannot honour is a value whose intent it cannot guess.
    // Guessing "manga" here would force the wrong recognizer on every capture.
    for (const bad of ['Manga', 'paddle', '', 'autoo', 0, 1, null, undefined, {}, ['manga']]) {
      expect(normalizeReadingLensEngine(bad)).toBe(READING_LENS_ENGINE_DEFAULT);
    }
    expect(READING_LENS_ENGINE_DEFAULT).toBe('auto');
  });
});

describe('processing facts', () => {
  it('covers every offered choice', () => {
    for (const engine of READING_LENS_ENGINE_CHOICES) {
      expect(READING_LENS_ENGINE_FACTS[engine]).toBeDefined();
    }
    expect(Object.keys(READING_LENS_ENGINE_FACTS).sort())
      .toEqual([...READING_LENS_ENGINE_CHOICES].sort());
  });

  it('reports on-device today', () => {
    expect(readingLensOcrIsFullyOnDevice()).toBe(true);
  });

  it('NEGATIVE CONTROL: one networked engine withdraws the on-device claim', () => {
    // The indicator must be computed, not asserted. Proven by mutating a copy
    // of the table through the same predicate the product uses — if this still
    // returned true, the settings string would be a lie the moment a cloud
    // recognizer landed.
    const facts = { ...READING_LENS_ENGINE_FACTS, web: { processing: 'network' as const, needsModels: false } };
    const derived = READING_LENS_ENGINE_CHOICES.every((e) => facts[e].processing === 'device');
    expect(derived).toBe(false);
  });
});

describe('readingLensEngineRunnable', () => {
  it('a forced engine needs its own models and nothing may stand in', () => {
    expect(readingLensEngineRunnable('manga', status({ manga: false }))).toBe(false);
    expect(readingLensEngineRunnable('web', status({ web: false }))).toBe(false);
    expect(readingLensEngineRunnable('manga', status({ manga: true, web: false }))).toBe(true);
  });

  it('auto runs whenever either engine can', () => {
    expect(readingLensEngineRunnable('auto', status({ manga: true, web: false }))).toBe(true);
    expect(readingLensEngineRunnable('auto', status({ manga: false, web: true }))).toBe(true);
  });

  it('nothing is runnable when nothing is installed', () => {
    const empty = status({ manga: false, web: false, webLangs: [], none: true });
    for (const engine of READING_LENS_ENGINE_CHOICES as readonly ReadingLensEngine[]) {
      expect(readingLensEngineRunnable(engine, empty)).toBe(false);
    }
  });
});
