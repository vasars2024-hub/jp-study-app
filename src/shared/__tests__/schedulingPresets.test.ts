/**
 * Presets (Anki's deck option presets), the FSRS version setting, and the
 * migration that must not move anybody's intervals.
 */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PRESET_ID,
  DEFAULT_SCHEDULING_CONFIG,
  MAX_SCHEDULING_PRESETS,
  effectiveFsrsWeights,
  normalizeSchedulingConfig,
  personalFsrsWeightsInUse,
  presetIdForFolder,
  presetSettings,
  scheduleReview,
  schedulingConfigForFolder,
  withFolderPreset,
  withNewPreset,
  withPresetName,
  withPresetSettings,
  withoutPreset,
  type SchedulingConfig,
} from '../flashcardScheduling';
import { DEFAULT_FSRS6_WEIGHTS, DEFAULT_FSRS_WEIGHTS, upgradeFsrsWeights } from '../fsrs';
import { planFsrsReplay } from '../fsrsMemoryReplay';
import type { LocalSrsRating, LocalSrsState } from '../localSrs';

const NOW = new Date(2026, 9, 1, 12).getTime();
const DAY = 86_400_000;
const FIT5 = DEFAULT_FSRS_WEIGHTS.map((w, i) => (i === 8 ? w + 0.1 : w));

function run(config: SchedulingConfig, ratings: LocalSrsRating[], gapDays = 3): LocalSrsState[] {
  let state: LocalSrsState | undefined;
  let at = NOW;
  const out: LocalSrsState[] = [];
  for (const rating of ratings) {
    state = scheduleReview(state, rating, config, at);
    out.push(state);
    at = Math.max(state.dueAt, at + gapDays * DAY);
  }
  return out;
}

describe('migration: a config written before FSRS-6 and presets', () => {
  it('reads as FSRS-5 with no presets, and schedules exactly as it did', () => {
    const stored = { algorithm: 'fsrs', desiredRetention: 0.9, fsrsWeights: FIT5, learningStepsMinutes: [1, 10] };
    const config = normalizeSchedulingConfig(stored as Partial<SchedulingConfig>);
    expect(config).toMatchObject({ fsrsVersion: 5, presets: [], folderPresets: {} });
    expect(config.ankiFsrsImport).toBeUndefined();
    expect(effectiveFsrsWeights(config)).toEqual(FIT5);
    // Every card, in every folder, is the Default preset's.
    expect(schedulingConfigForFolder(config, 'verbs')).toBe(config);
    const ratings: LocalSrsRating[] = ['good', 'good', 'good', 'again', 'good', 'hard', 'easy'];
    const legacyConfig = { ...stored } as unknown as SchedulingConfig; // as an older build handed it over
    expect(run(config, ratings)).toEqual(run(legacyConfig, ratings));
  });

  it('the default config is still SM-2, FSRS-5, no presets', () => {
    expect(normalizeSchedulingConfig(null)).toEqual(DEFAULT_SCHEDULING_CONFIG);
    expect(DEFAULT_SCHEDULING_CONFIG).toMatchObject({ algorithm: 'sm2', fsrsVersion: 5, presets: [], folderPresets: {} });
  });
});

describe('the weights a version runs', () => {
  const base = DEFAULT_SCHEDULING_CONFIG;
  it('FSRS-5: its own fit, or its defaults; an FSRS-6 fit is kept but cannot run', () => {
    expect(effectiveFsrsWeights({ ...base, fsrsVersion: 5 })).toEqual(DEFAULT_FSRS_WEIGHTS);
    expect(effectiveFsrsWeights({ ...base, fsrsVersion: 5, fsrsWeights: FIT5 })).toEqual(FIT5);
    const six = [...DEFAULT_FSRS6_WEIGHTS];
    expect(effectiveFsrsWeights({ ...base, fsrsVersion: 5, fsrsWeights: six })).toEqual(DEFAULT_FSRS_WEIGHTS);
    expect(personalFsrsWeightsInUse({ fsrsVersion: 5, fsrsWeights: six })).toBe(false);
  });

  it('FSRS-6: its own fit, an FSRS-5 fit carried over unchanged, or its defaults', () => {
    expect(effectiveFsrsWeights({ ...base, fsrsVersion: 6 })).toEqual(DEFAULT_FSRS6_WEIGHTS);
    expect(effectiveFsrsWeights({ ...base, fsrsVersion: 6, fsrsWeights: FIT5 })).toEqual(upgradeFsrsWeights(FIT5));
    expect(personalFsrsWeightsInUse({ fsrsVersion: 6, fsrsWeights: FIT5 })).toBe(true);
  });

  it('turning FSRS-6 on with an FSRS-5 fit keeps the intervals that fit gave', () => {
    const five = normalizeSchedulingConfig({ algorithm: 'fsrs', fsrsWeights: FIT5 });
    const six = normalizeSchedulingConfig({ ...five, fsrsVersion: 6 });
    const ratings: LocalSrsRating[] = ['good', 'good', 'again', 'good', 'easy', 'good'];
    expect(run(six, ratings).map((s) => s.intervalDays)).toEqual(run(five, ratings).map((s) => s.intervalDays));
  });

  it('FSRS-6 defaults schedule differently from FSRS-5 defaults: the change is opt-in', () => {
    const five = normalizeSchedulingConfig({ algorithm: 'fsrs' });
    const six = normalizeSchedulingConfig({ algorithm: 'fsrs', fsrsVersion: 6 });
    const ratings: LocalSrsRating[] = ['good', 'good', 'good', 'good'];
    expect(run(six, ratings).map((s) => s.intervalDays)).not.toEqual(run(five, ratings).map((s) => s.intervalDays));
  });

  it('refuses a stored version or vector it cannot run', () => {
    const config = normalizeSchedulingConfig({ fsrsVersion: 7 as never, fsrsWeights: [1, 2, 3] });
    expect(config.fsrsVersion).toBe(5);
    expect(config.fsrsWeights).toBeUndefined();
  });
});

describe('presets', () => {
  const base = normalizeSchedulingConfig({ algorithm: 'fsrs', learningStepsMinutes: [], desiredRetention: 0.9 });

  it('a new preset copies the one being edited; its settings are its own', () => {
    const made = withNewPreset(base, 'Kanji', DEFAULT_PRESET_ID, 1);
    expect(made).not.toBeNull();
    const id = made?.id ?? '';
    let config = made?.config ?? base;
    expect(presetSettings(config, id)).toEqual(presetSettings(config, DEFAULT_PRESET_ID));
    config = withPresetSettings(config, id, { desiredRetention: 0.95, fsrsVersion: 6, learningStepsMinutes: [1, 10] });
    expect(presetSettings(config, id)).toMatchObject({ desiredRetention: 0.95, fsrsVersion: 6, learningStepsMinutes: [1, 10] });
    // The Default preset (the top level) did not move.
    expect(config).toMatchObject({ desiredRetention: 0.9, fsrsVersion: 5, learningStepsMinutes: [] });
  });

  it('a folder assigned to a preset is scheduled by it; other folders by the Default', () => {
    const made = withNewPreset(base, 'Steps', DEFAULT_PRESET_ID, 2, { learningStepsMinutes: [1, 10], leechThreshold: 4 });
    const id = made?.id ?? '';
    const config = withFolderPreset(made?.config ?? base, 'verbs', id);
    expect(presetIdForFolder(config, 'verbs')).toBe(id);
    expect(presetIdForFolder(config, 'nouns')).toBe(DEFAULT_PRESET_ID);
    expect(presetIdForFolder(config, undefined)).toBe(DEFAULT_PRESET_ID);
    const verbs = schedulingConfigForFolder(config, 'verbs');
    expect(verbs).toMatchObject({ learningStepsMinutes: [1, 10], leechThreshold: 4, algorithm: 'fsrs', dayStartHour: 4 });
    // A new card's first Good: a 10-minute step in the preset's folder, a graduation elsewhere.
    expect(scheduleReview(undefined, 'good', verbs, NOW)).toMatchObject({ phase: 'learning', intervalDays: 0 });
    expect(scheduleReview(undefined, 'good', schedulingConfigForFolder(config, 'nouns'), NOW).intervalDays).toBeGreaterThanOrEqual(1);
  });

  it('renames, deletes (its folders go back to the Default), and drops stale assignments', () => {
    const made = withNewPreset(base, 'Temp', DEFAULT_PRESET_ID, 3);
    const id = made?.id ?? '';
    let config = withFolderPreset(made?.config ?? base, 'verbs', id);
    config = withPresetName(config, id, '  Grammar  ');
    expect(config.presets[0].name).toBe('Grammar');
    expect(withPresetName(config, id, '   ').presets[0].name).toBe('Grammar');
    config = withoutPreset(config, id);
    expect(config.presets).toEqual([]);
    expect(config.folderPresets).toEqual({});
    const stale = normalizeSchedulingConfig({ ...base, folderPresets: { verbs: 'gone' } });
    expect(stale.folderPresets).toEqual({});
  });

  it('keeps at most the preset limit, and refuses a preset with no name or a reserved id', () => {
    let config = base;
    for (let i = 0; i < MAX_SCHEDULING_PRESETS; i += 1) config = withNewPreset(config, `P${i}`, DEFAULT_PRESET_ID, 100 + i)?.config ?? config;
    expect(config.presets).toHaveLength(MAX_SCHEDULING_PRESETS);
    expect(withNewPreset(config, 'One more', DEFAULT_PRESET_ID, 999)).toBeNull();
    const odd = normalizeSchedulingConfig({ ...base, presets: [{ id: 'default', name: 'x' }, { id: 'ok', name: '' }] as never });
    expect(odd.presets).toEqual([]);
  });

  it('keeps imported Anki parameters only when they are a valid vector', () => {
    const good = normalizeSchedulingConfig({ ankiFsrsImport: { weights: [...DEFAULT_FSRS6_WEIGHTS], importedAt: 5, desiredRetention: 0.87, presetName: 'JP' } });
    expect(good.ankiFsrsImport).toMatchObject({ weights: [...DEFAULT_FSRS6_WEIGHTS], desiredRetention: 0.87, presetName: 'JP' });
    expect(normalizeSchedulingConfig({ ankiFsrsImport: { weights: [1], importedAt: 5 } }).ankiFsrsImport).toBeUndefined();
  });
});

describe('the memory replay follows each card\'s preset', () => {
  it('rebuilds a card in an FSRS-6 folder with FSRS-6 and the rest with FSRS-5', () => {
    const srs: LocalSrsState = {
      version: 2, algorithm: 'sm2', dueAt: NOW, intervalDays: 10, ease: 2.5, repetitions: 3, lapses: 0,
      lastReviewedAt: NOW - 10 * DAY, lastRating: 'good',
    };
    const cards = [{ id: 'a', folder: 'six', srs }, { id: 'b', srs }];
    const shared = { weights: DEFAULT_FSRS_WEIGHTS, desiredRetention: 0.9, maximumIntervalDays: 36_500, dayStartHour: 4 };
    const log = ['a', 'b'].flatMap((cardId) => [
      { cardId, at: NOW - 20 * DAY, rating: 'good' as const, isNew: true },
      { cardId, at: NOW - 10 * DAY, rating: 'good' as const },
    ]);
    const plan = planFsrsReplay(cards, log, shared, NOW, true, (card) => (
      card.folder === 'six' ? { ...shared, weights: DEFAULT_FSRS6_WEIGHTS } : shared
    ));
    const [a, b] = plan.entries;
    expect(a.after.stability).not.toBeCloseTo(b.after.stability, 3);
  });
});
