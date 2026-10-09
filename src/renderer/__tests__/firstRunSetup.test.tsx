// @vitest-environment jsdom
/**
 * onb2 — first-run setup, the first-steps checklist, and Help search.
 *
 * The contracts that matter: a fresh profile gets setup and an existing one
 * does not; every step persists, so "Later" resumes and "Skip" never re-asks;
 * the tour is held while setup is open and starts only if setup left it armed;
 * the checklist ticks from real app activity, not from its own buttons.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { CATALOGS } from '../../shared/i18n/catalogs/all';
import { TELEMETRY_CONSENT_KEY } from '../../shared/stats';
import { loadOnboarding, markTourComplete, shouldRunTour } from '../onboardingStore';
import {
  FIRST_RUN_KEY,
  FIRST_RUN_STEPS,
  LEVEL_SEED_COUNTS,
  closeFirstRunSetup,
  deferFirstRunSetup,
  firstRunSetupPending,
  firstStepsChecklistVisible,
  firstStepsDoneCount,
  loadFirstRun,
  markFirstStepDone,
  patchFirstRun,
  resetFirstRunSessionForTests,
  restartFirstRunSetup,
} from '../firstRunSetup';
import { seedWordsFor } from '../firstRunSeed';
import { deckGrew, installFirstStepsTracker } from '../firstStepsTracker';
import { LOOKUP_HISTORY_EVENT } from '../lookupHistory';
import { REVIEW_RECORDED_EVENT, MEDIA_STUDY_RECORDED_EVENT, WATCH_RECORDED_EVENT } from '../stats';
import { HELP_TOPICS, helpTopic, searchHelpTopics } from '../helpTopics';
import { bundleProgress, dictionaryAssetFor, ocrAssetFor, percentOf } from '../components/onboarding/firstRunDownloads';
import { BUNDLED_FREQUENCY_DICTIONARIES } from '../../shared/bundledFrequencyDicts';
import { ASSET_CATALOG } from '../../shared/assetRegistry';
// Static: these pull playerBus, which must evaluate before the window.api stub below.
import FirstRunSetup from '../components/onboarding/FirstRunSetup';
import TourOverlay from '../components/onboarding/TourOverlay';
import FirstStepsChecklist from '../components/onboarding/FirstStepsChecklist';

const en = (key: string, vars: Record<string, string | number> = {}): string => {
  const entry = CATALOGS.en[key];
  const text = typeof entry === 'string' ? entry : entry ? entry.other : key;
  return text.replace(/\{(\w+)\}/g, (_, name: string) => String(vars[name] ?? `{${name}}`));
};

let root: Root | null = null;
let host: HTMLDivElement;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(TELEMETRY_CONSENT_KEY, 'no');
  resetFirstRunSessionForTests();
  (window as unknown as { api: unknown }).api = {
    assetsList: vi.fn(async () => ({ assets: ASSET_CATALOG, statuses: [] })),
    onAssetStatus: vi.fn(() => () => undefined),
    assetsFreeSpace: vi.fn(async () => 50_000_000_000),
    assetsStart: vi.fn(async () => ({ ok: true })),
    assetsPause: vi.fn(async () => undefined),
    dictListYomitan: vi.fn(async () => [{ id: 'jmdict' }]),
    ankiStatus: vi.fn(async () => ({ connected: true, decks: ['Default', 'Mining'], models: [] })),
    popOut: vi.fn(async () => undefined),
  };
});

afterEach(() => {
  root?.unmount();
  root = null;
  document.body.replaceChildren();
});

describe('first-run record', () => {
  it('is pending on a fresh profile and not on one that already finished the tour', () => {
    expect(firstRunSetupPending()).toBe(true);
    markTourComplete();
    expect(firstRunSetupPending()).toBe(false);
  });

  it('"Later" hides it for this session but keeps the step for the next launch', () => {
    patchFirstRun({ step: 'downloads' });
    deferFirstRunSetup();
    expect(firstRunSetupPending()).toBe(false);
    resetFirstRunSessionForTests(); // a new launch
    expect(firstRunSetupPending()).toBe(true);
    expect(loadFirstRun().step).toBe('downloads');
  });

  it('finishing or skipping never re-asks, and arms the checklist', () => {
    expect(firstStepsChecklistVisible()).toBe(false);
    closeFirstRunSetup('skipped', 3);
    expect(firstRunSetupPending()).toBe(false);
    const state = loadFirstRun();
    expect(state.status).toBe('skipped');
    expect(state.deckBaseline).toBe(3);
    expect(firstStepsChecklistVisible()).toBe(true);
  });

  it('rebuilds from known keys only, so a corrupt value cannot suppress setup', () => {
    localStorage.setItem(FIRST_RUN_KEY, '{"status":"bogus","step":"nowhere","checklist":{"lookup":5}}');
    const state = loadFirstRun();
    expect(state.status).toBe('pending');
    expect(state.step).toBe('language');
    expect(state.checklist.lookup).toBeNull();
    localStorage.setItem(FIRST_RUN_KEY, 'not json');
    expect(firstRunSetupPending()).toBe(true);
  });

  it('ticks a first step only once the checklist is armed', () => {
    expect(markFirstStepDone('lookup')).toBe(false);
    closeFirstRunSetup('done', 0);
    expect(markFirstStepDone('lookup')).toBe(true);
    expect(markFirstStepDone('lookup')).toBe(false);
    expect(firstStepsDoneCount()).toBe(1);
  });

  it('"Run setup again" re-opens at the first step and keeps checklist progress', () => {
    closeFirstRunSetup('done', 0);
    markFirstStepDone('review');
    restartFirstRunSetup();
    expect(firstRunSetupPending()).toBe(true);
    expect(loadFirstRun().step).toBe('language');
    expect(loadFirstRun().checklist.review).not.toBeNull();
  });
});

describe('level seed', () => {
  it('marks nothing for a beginner and is capped by the bundled list', () => {
    expect(seedWordsFor('ja', 'beginner')).toEqual([]);
    expect(seedWordsFor('ja', 'elementary')).toHaveLength(LEVEL_SEED_COUNTS.elementary);
    const unique = new Set(BUNDLED_FREQUENCY_DICTIONARIES.find((d) => d.language === 'zh')?.words ?? []);
    expect(seedWordsFor('zh', 'advanced').length).toBe(unique.size);
  });

  it('takes the most common words first, without duplicates', () => {
    const words = seedWordsFor('ru', 'intermediate');
    expect(new Set(words).size).toBe(words.length);
    const list = BUNDLED_FREQUENCY_DICTIONARIES.find((d) => d.language === 'ru')?.words ?? [];
    expect(words[0]).toBe(list[0]);
  });
});

describe('downloads step model', () => {
  it('names a real catalog asset for every study language', () => {
    for (const lang of ['ja', 'zh', 'ru'] as const) {
      expect(ASSET_CATALOG.some((a) => a.id === dictionaryAssetFor(lang))).toBe(true);
      expect(ASSET_CATALOG.some((a) => a.id === ocrAssetFor(lang))).toBe(true);
    }
  });

  it('aggregates a bundle the way Storage does', () => {
    const closure = [
      { id: 'a', sizeBytes: 100 },
      { id: 'b', sizeBytes: 300 },
    ];
    const statuses: Record<string, { id: string; state: 'installed' | 'downloading'; receivedBytes: number; totalBytes: number; bytesPerSecond: number }> = {
      a: { id: 'a', state: 'installed', receivedBytes: 100, totalBytes: 100, bytesPerSecond: 0 },
      b: { id: 'b', state: 'downloading', receivedBytes: 100, totalBytes: 300, bytesPerSecond: 5 },
    };
    const progress = bundleProgress(closure, (id) => statuses[id]);
    expect(progress.state).toBe('downloading');
    expect(percentOf(progress.received, progress.total)).toBe(50);
    expect(bundleProgress([], () => undefined).state).toBe('not-installed');
  });
});

describe('first-steps tracker', () => {
  it('ticks from the app events, not from the card', () => {
    closeFirstRunSetup('done', 0);
    const off = installFirstStepsTracker();
    try {
      window.dispatchEvent(new CustomEvent(LOOKUP_HISTORY_EVENT));
      window.dispatchEvent(new CustomEvent(REVIEW_RECORDED_EVENT));
      window.dispatchEvent(new CustomEvent(MEDIA_STUDY_RECORDED_EVENT, { detail: { kind: 'lines', count: 1 } }));
      expect(loadFirstRun().checklist.mine).toBeNull();
      window.dispatchEvent(new CustomEvent(MEDIA_STUDY_RECORDED_EVENT, { detail: { kind: 'mined', count: 1 } }));
      window.dispatchEvent(new CustomEvent(WATCH_RECORDED_EVENT));
    } finally {
      off();
    }
    expect(firstStepsDoneCount()).toBe(4);
  });

  it('counts a mine only when the deck grew past its armed size', () => {
    expect(deckGrew(5, 5)).toBe(false);
    expect(deckGrew(5, 6)).toBe(true);
    expect(deckGrew(null, 1)).toBe(true);
    expect(deckGrew(0, null)).toBe(false);
  });
});

describe('help topics', () => {
  it('every topic resolves its catalog keys in English', () => {
    for (const topic of HELP_TOPICS) {
      for (const key of [topic.titleKey, topic.bodyKey, topic.actionKey]) expect(CATALOGS.en[key], key).toBeTruthy();
    }
  });

  it('search ranks a title hit first and finds keyword-only matches', () => {
    const t = (key: string) => en(key);
    expect(searchHelpTopics('anki', t)[0]?.id).toBe('anki');
    expect(searchHelpTopics('whisper', t).map((topic) => topic.id)).toContain('transcription');
    expect(searchHelpTopics('   ', t)).toEqual([]);
    expect(helpTopic('nope')).toBeUndefined();
  });
});

describe('FirstRunSetup dialog', () => {
  async function mountSetup(onClose = vi.fn()): Promise<typeof onClose> {
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    await act(async () => {
      root?.render(<FirstRunSetup onClose={onClose} />);
    });
    return onClose;
  }
  const button = (label: string): HTMLButtonElement | undefined =>
    [...host.querySelectorAll('button')].find((b) => b.textContent?.trim() === label);
  const click = async (label: string): Promise<void> => {
    const target = button(label);
    expect(target, label).toBeTruthy();
    await act(async () => {
      target?.click();
    });
  };
  const stepId = (): string | null | undefined => host.querySelector('.frs-root')?.getAttribute('data-first-run-step');

  it('is a labelled modal dialog that announces its progress', async () => {
    await mountSetup();
    const dialog = host.querySelector('[role="dialog"]');
    expect(dialog?.getAttribute('aria-modal')).toBe('true');
    expect(dialog?.getAttribute('aria-labelledby')).toBe('frs-step-title');
    expect(host.querySelector('#frs-step-title')?.textContent).toBe(en('onb2.step.language.title'));
    expect(host.textContent).toContain(en('onb2.progress', { current: 1, total: FIRST_RUN_STEPS.length }));
    expect(host.querySelectorAll('[role="radio"]').length).toBe(3);
  });

  it('walks every step, persisting each one, and Back returns', async () => {
    await mountSetup();
    await click(en('onb2.next'));
    expect(stepId()).toBe('level');
    expect(loadFirstRun().step).toBe('level');
    await click(en('onb2.back'));
    expect(stepId()).toBe('language');
    await click(en('onb2.next'));
    await click(en('onb2.next'));
    expect(stepId()).toBe('downloads');
    await click(en('onb2.continue'));
    expect(stepId()).toBe('anki');
    await click(en('onb2.anki.check'));
    expect(host.textContent).toContain('Connected to Anki: 2 decks found.');
    await click(en('onb2.continue'));
    expect(stepId()).toBe('theme');
    expect(host.querySelectorAll('.frs-theme').length).toBe(4);
    await click(en('onb2.next'));
    expect(stepId()).toBe('finish');
  });

  it('shows the built-in Japanese dictionary as ready instead of offering a download', async () => {
    patchFirstRun({ step: 'downloads' });
    await mountSetup();
    await act(async () => {
      await Promise.resolve();
    });
    const dict = host.querySelector('[data-download="dictionary-builtin"]');
    expect(dict?.textContent).toContain(en('onb2.dl.ready'));
    // OCR stays optional, with a real size on its button.
    expect(host.querySelector('[data-download="manga-ocr"]')?.textContent).toContain(en('onb2.dl.optional'));
  });

  it('Escape means "Later": closed now, resumed at the same step next launch', async () => {
    patchFirstRun({ step: 'anki' });
    const onClose = await mountSetup();
    await act(async () => {
      host.querySelector('.frs-card')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(onClose).toHaveBeenCalledWith('later', false);
    expect(firstRunSetupPending()).toBe(false);
    resetFirstRunSessionForTests();
    expect(firstRunSetupPending()).toBe(true);
    expect(loadFirstRun().step).toBe('anki');
  });

  it('Skip setup also completes the tour, so nothing else pops up', async () => {
    const onClose = await mountSetup();
    await click(en('onb2.skip'));
    expect(onClose).toHaveBeenCalledWith('skipped', false);
    expect(loadFirstRun().status).toBe('skipped');
    expect(shouldRunTour()).toBe(false);
  });

  it('"Show me around" leaves the tour armed; "Start studying" completes it', async () => {
    patchFirstRun({ step: 'finish' });
    let onClose = await mountSetup();
    await click(en('onb2.finish.tour'));
    expect(onClose).toHaveBeenCalledWith('done', true);
    expect(shouldRunTour()).toBe(true);
    root?.unmount();
    localStorage.removeItem(FIRST_RUN_KEY);
    patchFirstRun({ step: 'finish' });
    onClose = await mountSetup();
    await click(en('onb2.finish.start'));
    expect(onClose).toHaveBeenCalledWith('done', false);
    expect(loadOnboarding().completedAt).not.toBeNull();
  });
});

describe('TourOverlay is held while setup is open', () => {
  it('stays off while held and starts on release', async () => {
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    await act(async () => {
      root?.render(<TourOverlay holdForSetup />);
    });
    expect(host.querySelector('.tour-root')).toBeNull();
    await act(async () => {
      root?.render(<TourOverlay holdForSetup={false} />);
    });
    expect(host.querySelector('.tour-root')).not.toBeNull();
  });

  it('does not start on release when setup completed the tour', async () => {
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    await act(async () => {
      root?.render(<TourOverlay holdForSetup />);
    });
    markTourComplete();
    await act(async () => {
      root?.render(<TourOverlay holdForSetup={false} />);
    });
    expect(host.querySelector('.tour-root')).toBeNull();
  });
});

describe('FirstStepsChecklist card', () => {
  it('lists four tasks with a go button each and ticks from activity', async () => {
    closeFirstRunSetup('done', 0);
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    await act(async () => {
      root?.render(<FirstStepsChecklist />);
    });
    expect(host.querySelectorAll('[data-first-step]').length).toBe(4);
    expect(host.textContent).toContain(en('onb2.checklist.count', { done: 0, total: 4 }));
    await act(async () => {
      window.dispatchEvent(new CustomEvent(LOOKUP_HISTORY_EVENT));
    });
    expect(host.querySelector('[data-first-step="lookup"]')?.className).toContain('is-done');
    expect(host.textContent).toContain(en('onb2.checklist.count', { done: 1, total: 4 }));
    // Every icon-only control is named.
    for (const b of host.querySelectorAll('button')) {
      expect(b.getAttribute('aria-label') || b.textContent?.trim(), b.outerHTML).toBeTruthy();
    }
    const dismiss = host.querySelector<HTMLButtonElement>(`button[aria-label="${en('onb2.checklist.dismiss')}"]`);
    await act(async () => {
      dismiss?.click();
    });
    expect(firstStepsChecklistVisible()).toBe(false);
  });
});
