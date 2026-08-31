// @vitest-environment jsdom
/**
 * Gates 31 and 36 — the "set to" half, as persistence.
 *
 * Both gates say a category or a window is *set to* something. A value that
 * only ever lived in the in-module fallback would satisfy every in-session
 * assertion and be gone at the next launch, so every survival claim here
 * re-reads after `resetIngestSettingsMemoryForTests()` — reading back what the
 * same call just cached would pass on a store that never wrote anything.
 *
 * The writer's refusals are measured here rather than only in the model,
 * because the two are allowed to differ and deliberately do: the PARSER clamps
 * a corrupted document into range, the WRITER refuses an out-of-range value.
 * The pair is what makes a settings field honest — nothing is stored that the
 * user was not shown.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FILES_INGEST_SETTINGS_CHANGED_EVENT,
  FILES_INGEST_SETTINGS_STORAGE_KEY,
  commitIngestCategoryPolicy,
  commitIngestConfidence,
  commitIngestStabilityMs,
  loadIngestSettings,
  onIngestSettingsChanged,
  resetIngestSettingsMemoryForTests,
} from '../filesIngestSettingsStore';
import {
  DEFAULT_INGEST_SETTINGS,
  INGEST_SETTINGS_ERROR_STABILITY_RANGE,
  INGEST_SETTINGS_ERROR_UNKNOWN_VALUE,
} from '../../shared/filesApp/ingest';
import { MAX_STABILITY_MS } from '../../shared/filesApp/stability';

/** A restart, as far as this module can see one: disk survives, memory does not. */
function restart(): void {
  resetIngestSettingsMemoryForTests();
}

beforeEach(() => {
  localStorage.clear();
  resetIngestSettingsMemoryForTests();
  vi.restoreAllMocks();
});

describe('ingest settings — reading', () => {
  it('an untouched profile reads as the defaults, not as an error', () => {
    expect(loadIngestSettings()).toEqual(DEFAULT_INGEST_SETTINGS);
  });

  it('malformed JSON reads as the defaults instead of taking the window down', () => {
    localStorage.setItem(FILES_INGEST_SETTINGS_STORAGE_KEY, '{not json');
    expect(loadIngestSettings()).toEqual(DEFAULT_INGEST_SETTINGS);
  });

  it('a stored out-of-range window is CLAMPED on read — a document is not a user', () => {
    localStorage.setItem(
      FILES_INGEST_SETTINGS_STORAGE_KEY,
      JSON.stringify({ confidence: 'high-confidence', byTarget: {}, stabilityMs: 9_999_999 }),
    );
    expect(loadIngestSettings().stabilityMs).toBe(MAX_STABILITY_MS);
    localStorage.setItem(
      FILES_INGEST_SETTINGS_STORAGE_KEY,
      JSON.stringify({ confidence: 'high-confidence', byTarget: {}, stabilityMs: -5_000 }),
    );
    expect(loadIngestSettings().stabilityMs).toBe(0);
  });

  it('an unknown policy word in the document falls back rather than being stored', () => {
    localStorage.setItem(
      FILES_INGEST_SETTINGS_STORAGE_KEY,
      JSON.stringify({ confidence: 'yolo', byTarget: { subtitle: 'yolo' }, stabilityMs: 1_000 }),
    );
    const doc = loadIngestSettings();
    expect(doc.confidence).toBe(DEFAULT_INGEST_SETTINGS.confidence);
    expect(doc.byTarget).toEqual({});
    // The one legal value in that document is kept: this is a fallback, not a wipe.
    expect(doc.stabilityMs).toBe(1_000);
  });
});

describe('gate 31 — the window is set, and survives a restart', () => {
  it('a set window is readable after the in-memory fallback is gone', () => {
    expect(commitIngestStabilityMs(30_000).errorKey).toBeUndefined();
    restart();
    expect(loadIngestSettings().stabilityMs).toBe(30_000);
  });

  it('zero is a legal setting and is stored as zero, not as "unset"', () => {
    commitIngestStabilityMs(0);
    restart();
    expect(loadIngestSettings().stabilityMs).toBe(0);
  });

  it('out of range is REFUSED, and nothing is written', () => {
    commitIngestStabilityMs(5_000);
    for (const bad of [-1, MAX_STABILITY_MS + 1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const result = commitIngestStabilityMs(bad);
      expect(result.errorKey).toBe(INGEST_SETTINGS_ERROR_STABILITY_RANGE);
      restart();
      // The previous good value is still there — a refusal changed nothing.
      expect(loadIngestSettings().stabilityMs).toBe(5_000);
    }
  });

  it('the boundaries themselves are accepted', () => {
    expect(commitIngestStabilityMs(MAX_STABILITY_MS).errorKey).toBeUndefined();
    restart();
    expect(loadIngestSettings().stabilityMs).toBe(MAX_STABILITY_MS);
  });
});

describe('gate 36 — a category is set to auto or review, per destination', () => {
  it('two destinations hold two different answers across a restart', () => {
    commitIngestCategoryPolicy('subtitle', 'auto');
    commitIngestCategoryPolicy('media', 'review');
    restart();
    const doc = loadIngestSettings();
    expect(doc.byTarget.subtitle).toBe('auto');
    expect(doc.byTarget.media).toBe('review');
    // And nothing else acquired an opinion.
    expect(Object.keys(doc.byTarget).sort()).toEqual(['media', 'subtitle']);
  });

  it('inherit REMOVES the row rather than storing the word', () => {
    commitIngestCategoryPolicy('subtitle', 'auto');
    commitIngestCategoryPolicy('subtitle', 'inherit');
    restart();
    expect(loadIngestSettings().byTarget).toEqual({});
    expect(loadIngestSettings().byTarget.subtitle).toBeUndefined();
  });

  it('a destination that has no home is refused — an override there does nothing', () => {
    const result = commitIngestCategoryPolicy('unknown', 'auto');
    expect(result.errorKey).toBe(INGEST_SETTINGS_ERROR_UNKNOWN_VALUE);
    restart();
    expect(loadIngestSettings().byTarget).toEqual({});
  });

  it('the confidence policy is stored and survives too', () => {
    expect(commitIngestConfidence('always-review').errorKey).toBeUndefined();
    restart();
    expect(loadIngestSettings().confidence).toBe('always-review');
  });

  it('an unknown confidence word is refused rather than written', () => {
    commitIngestConfidence('everything');
    const result = commitIngestConfidence('sometimes' as never);
    expect(result.errorKey).toBe(INGEST_SETTINGS_ERROR_UNKNOWN_VALUE);
    restart();
    expect(loadIngestSettings().confidence).toBe('everything');
  });
});

describe('the failure states stay distinguishable', () => {
  it('a write that cannot land reports a SAVE error, not a refusal', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    const result = commitIngestStabilityMs(9_000);
    expect(result.errorKey).toBeUndefined();
    expect(result.storageErrorKey).toBe('filesApp.settings.error.saveFailed');
    // The session still has the value — a control that does nothing at all is
    // worse than one that works now and says it will not survive a restart.
    expect(result.doc.stabilityMs).toBe(9_000);
    expect(loadIngestSettings().stabilityMs).toBe(9_000);
  });

  it('a change announces itself so a second window is not stale', () => {
    const seen: string[] = [];
    const off = onIngestSettingsChanged(() => seen.push('changed'));
    commitIngestStabilityMs(4_000);
    // A refusal announces nothing, because nothing happened.
    commitIngestStabilityMs(-1);
    off();
    // And after unsubscribing, a real change no longer reaches this listener.
    commitIngestStabilityMs(6_000);
    expect(seen).toEqual(['changed']);
    expect(FILES_INGEST_SETTINGS_CHANGED_EVENT).toBe('filesapp:ingest-settings-changed');
  });
});
