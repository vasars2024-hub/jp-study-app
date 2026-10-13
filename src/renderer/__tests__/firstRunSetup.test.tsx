// @vitest-environment jsdom
/**
 * onb2 — first-run setup, the first-steps checklist, and Help search.
 *
 * The contracts that matter: a fresh profile gets setup and an existing one
 * does not; every step persists, so "Later" resumes and "Skip" never re-asks;
 * the tour is held while setup is open and starts only if setup left it armed;
 * the checklist ticks from real app activity, not from its own buttons.
 */
import { act, useState, type ReactNode } from 'react';
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
import { FIRST_RUN_SEED_UNDO_KEY, seedKnownWords, seedWordsFor, undoSeededKnownWords } from '../firstRunSeed';
import { getLevel, resetKnownWordsCacheForTests, setLevel } from '../knownWords';
import {
  BOOT_START_WAIT_MS,
  holdTourForThemeBoot,
  resetTourBootHoldForTests,
  tourHeldForThemeBoot,
} from '../tourBootHold';
import { ANKI_UNREACHABLE_MSG } from '../../shared/anki';
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

// Picking Aero at the finish step imports the trigger on demand; its own boot
// side effects (sound, theme) are not what these tests are about.
vi.mock('../theme/SecretAeroTrigger', () => ({
  SECRET_AERO_ENTER_EVENT: 'shell:enterSecretAero',
  default: () => null,
}));

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
  resetKnownWordsCacheForTests();
  resetTourBootHoldForTests();
  delete document.documentElement.dataset.secretLifecycle;
  delete document.documentElement.dataset.wiredLifecycle;
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

/* ------------------------------------------------------------------ */
/* onb3                                                                */
/* ------------------------------------------------------------------ */

async function mountNode(node: ReactNode): Promise<void> {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root?.render(node);
  });
}
const buttonByLabel = (label: string): HTMLButtonElement | undefined =>
  [...host.querySelectorAll('button')].find((b) => b.textContent?.trim() === label);
const clickLabel = async (label: string): Promise<void> => {
  const target = buttonByLabel(label);
  expect(target, label).toBeTruthy();
  await act(async () => {
    target?.click();
  });
};
/** Let dynamic imports and IPC promises settle. */
const flush = async (rounds = 5): Promise<void> => {
  for (let i = 0; i < rounds; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
};
const currentStep = (): string | null | undefined => host.querySelector('.frs-root')?.getAttribute('data-first-run-step');

describe('Anki step errors (onb3)', () => {
  it('never shows the raw IPC error; says Anki is unreachable in the UI language', async () => {
    patchFirstRun({ step: 'anki' });
    (window.api as unknown as Record<string, unknown>).ankiStatus = vi.fn(async () => {
      throw new Error("Error invoking remote method 'anki:status': Error: connect ECONNREFUSED 127.0.0.1:8765");
    });
    await mountNode(<FirstRunSetup />);
    await clickLabel(en('onb2.anki.check'));
    await flush();
    const note = host.querySelector('.frs-note[role="status"]');
    expect(note?.textContent).toContain(en('onb2.anki.missing'));
    expect(note?.textContent).toContain(en('anki.unreachableReason'));
    expect(note?.textContent).not.toMatch(/invoking remote method|ECONNREFUSED/);
  });

  it('maps the reasons main authors through translateAnkiReason', async () => {
    patchFirstRun({ step: 'anki' });
    (window.api as unknown as Record<string, unknown>).ankiStatus = vi.fn(async () => ({
      connected: false,
      decks: [],
      models: [],
      error: ANKI_UNREACHABLE_MSG,
    }));
    await mountNode(<FirstRunSetup />);
    await clickLabel(en('onb2.anki.check'));
    await flush();
    expect(host.querySelector('.frs-note[role="status"]')?.textContent).toContain(en('anki.unreachableReason'));
  });
});

describe('downloads step follows the built-in dictionary (onb3)', () => {
  it('turns a download offer into "setting up", then "ready", without leaving the step', async () => {
    let dicts: Array<{ id: string }> = [];
    let emit: ((snapshot: unknown) => void) | null = null;
    Object.assign(window.api as unknown as Record<string, unknown>, {
      dictListYomitan: vi.fn(async () => dicts),
      dictImportStatus: vi.fn(async () => null),
      onDictImportChanged: vi.fn((cb: (snapshot: unknown) => void) => {
        emit = cb;
        return () => {
          emit = null;
        };
      }),
    });
    patchFirstRun({ step: 'downloads' });
    await mountNode(<FirstRunSetup />);
    await flush();
    expect(host.querySelector('[data-download="dictionary-builtin"]')).toBeNull();
    expect(emit).toBeTypeOf('function');

    // Main starts importing the bundled pack: no download offer, a setting-up row instead.
    await act(async () => {
      emit?.({
        jobId: 'j1',
        kind: 'legacy',
        status: 'running',
        progress: { jobId: 'j1', kind: 'legacy', lines: 10, phase: 'importing', percent: 40 },
      });
    });
    await flush();
    const row = host.querySelector('[data-download="dictionary-builtin"]');
    expect(row?.className).toContain('is-busy');
    expect(row?.textContent).toContain(en('onb3.dl.builtInSettingUp', { percent: 40 }));
    expect(row?.querySelector('button')).toBeNull();
    expect(host.querySelector(`[data-download="${dictionaryAssetFor('ja')}"]`)).toBeNull();

    // The import commits and the list now has the pack.
    dicts = [{ id: 'jmdict' }];
    await act(async () => {
      emit?.({ jobId: 'j1', kind: 'legacy', status: 'committed', terminal: { state: 'committed' } });
    });
    await flush();
    const ready = host.querySelector('[data-download="dictionary-builtin"]');
    expect(ready?.className).toContain('is-ready');
    expect(ready?.textContent).toContain(en('onb2.dl.ready'));
  });
});

describe('level seed undo (onb3)', () => {
  it('a lower band takes back only what the higher seed set', async () => {
    const upper = seedWordsFor('ja', 'upper');
    const elementary = seedWordsFor('ja', 'elementary');
    expect(upper.length).toBeGreaterThan(elementary.length + 2);
    const inferredBefore = upper[elementary.length];
    const byHandLater = upper[elementary.length + 1];
    const plain = upper[upper.length - 1];
    setLevel(inferredBefore, 1, false);

    await seedKnownWords('ja', 'upper');
    expect(getLevel(inferredBefore)).toBe(3);
    expect(getLevel(plain)).toBe(3);
    // The user then grades one of those words by hand.
    setLevel(byHandLater, 3, true);

    await seedKnownWords('ja', 'elementary');
    expect(getLevel(plain)).toBe(0);
    expect(getLevel(inferredBefore)).toBe(1);
    expect(getLevel(byHandLater)).toBe(3);
    expect(getLevel(elementary[0])).toBe(3);

    // Unticking the seed takes the rest back too.
    await undoSeededKnownWords('ja');
    expect(getLevel(elementary[0])).toBe(0);
    expect(localStorage.getItem(FIRST_RUN_SEED_UNDO_KEY)).toBeNull();
  });

  it('Back to the level step and a lower band replaces the seed in the dialog', async () => {
    patchFirstRun({ step: 'level' });
    await mountNode(<FirstRunSetup />);
    const pick = async (band: string): Promise<void> => {
      await clickLabel(en(`onb2.level.ja.${band}`) + en(`onb2.level.desc.${band}`));
    };
    await pick('upper');
    await clickLabel(en('onb2.next'));
    await flush(10);
    expect(currentStep()).toBe('downloads');
    expect(loadFirstRun().seededKnown).toBe(seedWordsFor('ja', 'upper').length);
    await clickLabel(en('onb2.back'));
    await pick('elementary');
    await clickLabel(en('onb2.next'));
    await flush(10);
    expect(currentStep()).toBe('downloads');
    expect(loadFirstRun().seededKnown).toBe(LEVEL_SEED_COUNTS.elementary);
    const upper = seedWordsFor('ja', 'upper');
    expect(getLevel(upper[upper.length - 1])).toBe(0);
  });

  it('closing setup keeps the seed and forgets the undo record', async () => {
    await seedKnownWords('ja', 'elementary');
    expect(localStorage.getItem(FIRST_RUN_SEED_UNDO_KEY)).not.toBeNull();
    patchFirstRun({ step: 'finish' });
    await mountNode(<FirstRunSetup />);
    await clickLabel(en('onb2.finish.start'));
    expect(localStorage.getItem(FIRST_RUN_SEED_UNDO_KEY)).toBeNull();
    expect(getLevel(seedWordsFor('ja', 'elementary')[0])).toBe(3);
  });
});

describe('Escape inside the placement check (onb3)', () => {
  it('closes only the quiz; setup stays open and focus returns to its opener', async () => {
    patchFirstRun({ step: 'level' });
    const onClose = vi.fn();
    await mountNode(<FirstRunSetup onClose={onClose} />);
    await clickLabel(en('aiTutor.placement.open'));
    await flush();
    const textarea = host.querySelector('.frs-placement textarea');
    expect(textarea).not.toBeNull();
    await act(async () => {
      textarea?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    });
    expect(onClose).not.toHaveBeenCalled();
    expect(currentStep()).toBe('level');
    expect(host.querySelector('.frs-placement')).toBeNull();
    expect(document.activeElement?.textContent?.trim()).toBe(en('aiTutor.placement.open'));
    // Escape outside the quiz is still "Later".
    await act(async () => {
      host.querySelector('.frs-card')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(onClose).toHaveBeenCalledWith('later', false);
  });
});

describe('the look picked in setup and the tour (onb3)', () => {
  function Harness() {
    const [pending, setPending] = useState(true);
    return (
      <>
        {pending && <FirstRunSetup onClose={() => setPending(false)} />}
        <TourOverlay holdForSetup={pending} />
      </>
    );
  }
  const setPhase = async (phase: string): Promise<void> => {
    await act(async () => {
      document.documentElement.dataset.secretLifecycle = phase;
      window.dispatchEvent(new CustomEvent('secret:lifecycle', { detail: { phase } }));
    });
  };

  it('Aero: the tour waits for the boot overlay to finish', async () => {
    patchFirstRun({ step: 'finish', theme: 'aero' });
    await mountNode(<Harness />);
    await clickLabel(en('onb2.finish.tour'));
    expect(host.querySelector('.frs-root')).toBeNull();
    expect(shouldRunTour()).toBe(true);
    expect(host.querySelector('.tour-root'), 'held before the boot starts').toBeNull();
    await setPhase('preboot');
    await setPhase('boot');
    await setPhase('welcome');
    expect(host.querySelector('.tour-root'), 'held during the boot').toBeNull();
    await setPhase('active');
    expect(host.querySelector('.tour-root'), 'starts once the boot has run').not.toBeNull();
  });

  it('Study OS: the tour starts at once', async () => {
    patchFirstRun({ step: 'finish', theme: 'study-os' });
    await mountNode(<Harness />);
    await clickLabel(en('onb2.finish.tour'));
    expect(host.querySelector('.tour-root')).not.toBeNull();
  });

  it('Blanc: no Study OS tour to start; it stays in Help', async () => {
    patchFirstRun({ step: 'finish', theme: 'blanc' });
    (window.api as unknown as Record<string, unknown>).blancOpen = vi.fn(async () => undefined);
    await mountNode(<Harness />);
    expect(buttonByLabel(en('onb2.finish.tour'))).toBeUndefined();
    expect(host.textContent).toContain(en('onb3.finish.blancTour'));
    await clickLabel(en('onb2.finish.start'));
    expect(shouldRunTour()).toBe(false);
    expect(host.querySelector('.tour-root')).toBeNull();
  });

  it('a boot that never starts releases the hold on its own', () => {
    vi.useFakeTimers();
    try {
      holdTourForThemeBoot();
      expect(tourHeldForThemeBoot()).toBe(true);
      vi.advanceTimersByTime(BOOT_START_WAIT_MS + 1);
      expect(tourHeldForThemeBoot()).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('finish step: Snip to cards offered with one click (off by default, v1)', () => {
  async function mountFinish(enabled: boolean): Promise<ReturnType<typeof vi.fn>> {
    const setSettings = vi.fn(async (patch: { enabled?: boolean }) => ({ enabled: patch.enabled === true }));
    Object.assign(window.api as unknown as Record<string, unknown>, {
      snipGetStatus: vi.fn(async () => ({ enabled })),
      snipSetSettings: setSettings,
      onSnipSettingsChanged: vi.fn(() => () => undefined),
    });
    patchFirstRun({ step: 'finish' });
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    await act(async () => {
      root?.render(<FirstRunSetup onClose={vi.fn()} />);
    });
    await act(async () => {
      await Promise.resolve();
    });
    return setSettings;
  }
  const offer = (): HTMLElement | null => host.querySelector('[data-first-run-optin="snip"]');
  const toggle = (): HTMLInputElement | null => host.querySelector('[data-first-run-optin="snip"] input[role="switch"]');

  it('says what it does and that pictures stay on this computer; the switch starts off', async () => {
    await mountFinish(false);
    expect(offer()?.textContent).toContain(en('onb4.snip.title'));
    expect(offer()?.textContent).toContain(en('onb4.snip.what'));
    expect(offer()?.textContent).toContain(en('onb4.snip.privacy'));
    expect(en('onb4.snip.privacy')).toMatch(/this computer only/);
    expect(toggle()?.checked).toBe(false);
    expect(toggle()?.closest('label')?.textContent).toContain(en('onb4.snip.enable'));
  });

  it('one click turns it on in main (the same setting Settings and the tray use)', async () => {
    const setSettings = await mountFinish(false);
    await act(async () => {
      toggle()?.click();
    });
    expect(setSettings).toHaveBeenCalledWith({ enabled: true });
    expect(toggle()?.checked).toBe(true);
    expect(offer()?.textContent).toContain(en('onb4.snip.on'));
    await act(async () => {
      toggle()?.click();
    });
    expect(setSettings).toHaveBeenLastCalledWith({ enabled: false });
    expect(toggle()?.checked).toBe(false);
  });

  it('shows the choice already made (setup re-run from Help)', async () => {
    await mountFinish(true);
    expect(toggle()?.checked).toBe(true);
  });

  it('a stale bridge without the snip API leaves the switch off, not broken', async () => {
    const api = window.api as unknown as Record<string, unknown>;
    patchFirstRun({ step: 'finish' });
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    delete api.snipGetStatus;
    delete api.onSnipSettingsChanged;
    await act(async () => {
      root?.render(<FirstRunSetup onClose={vi.fn()} />);
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(toggle()?.checked).toBe(false);
    expect(toggle()?.disabled).toBe(false);
  });
});
