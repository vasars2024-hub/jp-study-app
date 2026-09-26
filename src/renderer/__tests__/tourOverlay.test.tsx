// @vitest-environment jsdom
/**
 * The guided tour. Audit `T1`, grown into chapters (round-4 journeys audit).
 *
 * The accept criteria in `docs/IMPLEMENTATION_PLAN_V1.01.md` §9.5 are testable
 * almost verbatim, so they are tested rather than described: it runs once on a
 * fresh profile, Esc exits from any step, it never re-fires after completion,
 * and it replays from Settings. The chapter model adds its own: the basics end
 * at a chapter menu, every chapter walks back to that menu and is ticked there,
 * a chapter can be started on its own from Help or Start, and each step puts the
 * surface it talks about on screen.
 *
 * The one that matters most is **"never blocks the app"** — the plan calls a
 * forced tour "the fastest uninstall button ever shipped". That is a property of
 * the overlay's pointer-events, which a render test can assert and a code review
 * reliably misses.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  TOUR_CHAPTERS,
  TOUR_MENU_ID,
  TOUR_STEPS,
  chapterSteps,
  firstStepOf,
  tourI18nKeys,
} from '../../shared/onboarding/tourScript';
import { CATALOGS } from '../../shared/i18n/catalogs/all';
import { UI_LANGS } from '../../shared/i18n/core';
import { loadOnboarding, markTourComplete, rememberStep, replayTour, shouldRunTour } from '../onboardingStore';
import TourOverlay from '../components/onboarding/TourOverlay';
import { leakedKeys } from './helpers/i18nLeak';
import { TELEMETRY_CONSENT_DECIDED_EVENT, TELEMETRY_CONSENT_KEY } from '../../shared/stats';
import { COMMAND_CATALOG, resetBinding, setBinding } from '../keyboardShortcuts';
import { commandLabelKeys } from '../commandI18n';

let root: Root | null = null;
let host: HTMLDivElement;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

// Every case below is about the tour itself, so the first-launch consent card has
// already been answered; the waiting-for-consent behaviour has its own describe.
beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(TELEMETRY_CONSENT_KEY, 'no');
});

afterEach(() => {
  root?.unmount();
  root = null;
  document.body.replaceChildren();
});

async function mount(): Promise<HTMLElement> {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root?.render(<TourOverlay />);
  });
  return host;
}

async function remount(): Promise<void> {
  root?.unmount();
  root = null;
  host.remove();
  await mount();
}

const bubble = (): HTMLElement | null => host.querySelector('.tour-bubble');
const current = (): string | null | undefined => host.querySelector('.tour-root')?.getAttribute('data-tour-step');
const button = (label: string): HTMLButtonElement | undefined =>
  [...host.querySelectorAll('button')].find((b) => b.textContent?.trim() === label);
const en = (key: string): string => String(CATALOGS.en[key]);
const click = async (label: string): Promise<void> => {
  await act(async () => {
    button(label)?.click();
  });
};
const chapterTile = (id: string): HTMLButtonElement | null =>
  host.querySelector<HTMLButtonElement>(`[data-tour-chapter="${id}"]`);

/** Collect every CustomEvent of these types while `fn` runs. */
async function recordEvents(types: string[], fn: () => Promise<void>): Promise<{ type: string; detail: unknown }[]> {
  const seen: { type: string; detail: unknown }[] = [];
  const handler = (event: Event): void => {
    seen.push({ type: event.type, detail: (event as CustomEvent).detail });
    // Claim `os:open` the way DesktopShell does, so nothing falls back to a pop-out.
    if (event.type === 'os:open') event.preventDefault();
  };
  for (const type of types) window.addEventListener(type, handler);
  try {
    await fn();
  } finally {
    for (const type of types) window.removeEventListener(type, handler);
  }
  return seen;
}

describe('first-boot tour', () => {
  it('runs on a fresh profile and not after completion', async () => {
    expect(shouldRunTour(), 'fresh profile').toBe(true);
    await mount();
    expect(bubble(), 'the tour renders on a fresh profile').toBeTruthy();
    expect(current(), 'a first boot starts at the welcome step').toBe('welcome');

    markTourComplete();
    expect(shouldRunTour(), 'completed profile').toBe(false);
    await remount();
    expect(bubble(), 'it does not re-fire once completed').toBeNull();
  });

  it('never blocks the app underneath', async () => {
    await mount();
    const dim = host.querySelector('.tour-dim') as HTMLElement;
    const overlayRoot = host.querySelector('.tour-root') as HTMLElement;
    expect(overlayRoot, 'overlay mounted').toBeTruthy();
    expect(dim, 'a dim layer renders').toBeTruthy();
    // The bubble is the one interactive surface; everything else must pass
    // clicks through. The dim panels are siblings of the bubble, never
    // ancestors, so they cannot swallow its events nor cover the spotlight hole.
    expect(bubble()?.parentElement).toBe(overlayRoot);
    expect(dim.contains(bubble())).toBe(false);
  });

  it('Esc exits from any step and counts as completion', async () => {
    await mount();
    await click('Next');
    await click('Next');
    expect(current()).toBe(TOUR_STEPS[2].id);

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(bubble(), 'Esc dismisses immediately').toBeNull();
    expect(loadOnboarding().completedAt, 'and records completion so it does not re-fire').not.toBeNull();
  });

  it('walks the basics to the chapter menu, which offers every chapter, then finishes', async () => {
    await mount();
    const basics = chapterSteps('basics');
    for (let i = 0; i < basics.length; i += 1) {
      expect(current()).toBe(basics[i].id);
      const progress = host.querySelector('.tour-bubble__step')?.textContent ?? '';
      expect(progress, 'the progress line names the chapter and the place in it').toBe(
        `${en('tour.chapter.basics')} · ${i + 1} of ${basics.length}`,
      );
      await click(i === basics.length - 1 ? en('tour.chapterDone') : 'Next');
    }
    expect(current(), 'the basics end at the chapter menu, not at "done"').toBe(TOUR_MENU_ID);
    for (const chapter of TOUR_CHAPTERS) expect(chapterTile(chapter.id), chapter.id).toBeTruthy();
    expect(chapterTile('basics')?.querySelector('.tour-chapter__done'), 'the walked chapter is ticked').toBeTruthy();
    expect(chapterTile('watch')?.querySelector('.tour-chapter__done'), 'an unwalked one is not').toBeNull();
    expect(loadOnboarding().chaptersDone).toEqual(['basics']);
    expect(shouldRunTour(), 'the menu is still the tour').toBe(true);

    await click(en('tour.done'));
    expect(bubble()).toBeNull();
    expect(shouldRunTour()).toBe(false);
  });

  it('every chapter can be taken from the menu, walks to its end and comes back ticked', async () => {
    rememberStep(TOUR_MENU_ID);
    await mount();
    for (const chapter of TOUR_CHAPTERS) {
      expect(current(), `back at the menu before ${chapter.id}`).toBe(TOUR_MENU_ID);
      await act(async () => {
        chapterTile(chapter.id)?.click();
      });
      const steps = chapterSteps(chapter.id);
      expect(steps.length, `${chapter.id} has steps`).toBeGreaterThan(0);
      for (let i = 0; i < steps.length; i += 1) {
        expect(current()).toBe(steps[i].id);
        expect(leakedKeys(host), `${steps[i].id} renders no raw key`).toEqual([]);
        await click(i === steps.length - 1 ? en('tour.chapterDone') : 'Next');
      }
    }
    expect(current()).toBe(TOUR_MENU_ID);
    expect([...loadOnboarding().chaptersDone].sort()).toEqual(TOUR_CHAPTERS.map((c) => c.id).sort());
  });

  it('Back steps in reverse, records where it lands, is off on the welcome, and leaves a chapter for the menu', async () => {
    await mount();
    expect(button('Back')?.disabled, 'nothing to go back to on the welcome step').toBe(true);

    await click('Next');
    await click('Next');
    expect(loadOnboarding().lastStepId).toBe(TOUR_STEPS[2].id);
    await click('Back');
    expect(current()).toBe(TOUR_STEPS[1].id);
    expect(loadOnboarding().lastStepId, 'a resumed tour must come back to where the user actually is').toBe(
      TOUR_STEPS[1].id,
    );

    rememberStep(firstStepOf('grammar') ?? '');
    await remount();
    expect(button('Back')?.disabled, 'a chapter’s first step can go back — to the menu').toBe(false);
    await click('Back');
    expect(current()).toBe(TOUR_MENU_ID);
  });

  /**
   * Audit 6.1 found `lastStepId` written on every advance and read by nothing, so a tour left
   * half-finished restarted from step 1. These pin the resume, and the two ways it must NOT
   * resume: a replay is a deliberate restart, and a step id that no longer exists in the
   * script must fall back to the start rather than render nothing.
   */
  it('resumes at the step it recorded — or at the menu — rather than restarting', async () => {
    await mount();
    await click('Next');
    await click('Next');
    await remount();
    expect(current(), 'a re-opened tour picks up where it was left').toBe(TOUR_STEPS[2].id);

    rememberStep(TOUR_MENU_ID);
    await remount();
    expect(current(), 'a tour left at the menu reopens at the menu').toBe(TOUR_MENU_ID);
  });

  it('starts from the beginning after a replay, not from the resumed step', async () => {
    await mount();
    await click('Next');
    markTourComplete();
    replayTour();
    await remount();
    expect(current(), 'replay is a deliberate restart').toBe(TOUR_STEPS[0].id);
  });

  it('a replay for one chapter starts that chapter, and Start’s replay opens the menu', async () => {
    markTourComplete();
    await mount();
    expect(bubble()).toBeNull();
    await act(async () => {
      replayTour('captions');
    });
    expect(current(), 'Help → a chapter starts at that chapter').toBe(firstStepOf('captions'));
    expect(loadOnboarding().requestedChapter, 'the request is consumed').toBeNull();

    markTourComplete();
    await act(async () => {
      replayTour(TOUR_MENU_ID);
    });
    expect(current(), 'Start → Guided tour opens the chapter menu').toBe(TOUR_MENU_ID);
  });

  it('falls back to the first step when the recorded step no longer exists', async () => {
    localStorage.setItem(
      'jp-study.onboarding.v1',
      JSON.stringify({ completedAt: null, replays: 0, lastStepId: 'a-step-that-was-removed' }),
    );
    await mount();
    expect(bubble(), 'an unknown step must not blank the tour').toBeTruthy();
    expect(current()).toBe(TOUR_STEPS[0].id);
  });

  it('replays from Settings without erasing that it ran, or which chapters were walked', async () => {
    rememberStep(TOUR_MENU_ID);
    await mount();
    await act(async () => {
      chapterTile('games')?.click();
    });
    await click('Next');
    await click(en('tour.chapterDone'));
    markTourComplete();
    const first = loadOnboarding().completedAt;
    expect(first).not.toBeNull();
    replayTour();
    expect(shouldRunTour(), 'replay re-arms the tour').toBe(true);
    expect(loadOnboarding().replays, 'and counts the replay').toBe(1);
    expect(loadOnboarding().chaptersDone, 'the ticks survive a replay').toEqual(['games']);
  });

  /**
   * MEASURED LIVE 2026-08-30, before the fix: Settings → Help → Replay printed
   * "The tour will start again now." while `.tour-root` stayed at **0** and the
   * store went `replays` 8 → 9. `active` was read once, at mount, so the message
   * was true only of the next app start. This is that defect, as a test.
   */
  it('re-arms an ALREADY MOUNTED overlay when Settings replays it', async () => {
    markTourComplete();
    await mount();
    expect(bubble(), 'completed, so nothing is showing').toBeNull();

    await act(async () => {
      replayTour();
    });
    expect(bubble(), 'Replay starts the tour in this window, not on the next boot').toBeTruthy();
    expect(current()).toBe(TOUR_STEPS[0].id);
  });

  it('re-arms from another window, where Settings may be popped out', async () => {
    markTourComplete();
    await mount();
    expect(bubble()).toBeNull();

    // A pop-out shares only the origin's localStorage; this is the event the
    // browser raises in every OTHER window when it writes.
    localStorage.setItem('jp-study.onboarding.v1', JSON.stringify({ completedAt: null, replays: 1, lastStepId: null }));
    await act(async () => {
      window.dispatchEvent(new StorageEvent('storage', { key: 'jp-study.onboarding.v1' }));
    });
    expect(bubble(), 'a replay from a pop-out Settings window still starts it').toBeTruthy();
  });

  it('announces the step change without taking focus', async () => {
    await mount();
    const live = host.querySelector('.tour-bubble__step-live') as HTMLElement;
    expect(live, 'the changing text sits in a live region').toBeTruthy();
    expect(live.getAttribute('aria-live')).toBe('polite');
    // "Never blocks" is the tour's first non-negotiable: it must not pull focus.
    expect(document.activeElement).toBe(document.body);
    expect(live.contains(host.querySelector('.tour-bubble__title'))).toBe(true);
    expect(live.contains(host.querySelector('.tour-bubble__body'))).toBe(true);
  });

  it('survives a corrupt stored value by showing the tour rather than hiding it', () => {
    localStorage.setItem('jp-study.onboarding.v1', '{not json');
    expect(shouldRunTour(), 'unparseable state must not suppress onboarding forever').toBe(true);
  });

  it('renders no raw catalog key on the welcome step or the menu', async () => {
    await mount();
    expect(leakedKeys(host)).toEqual([]);
    rememberStep(TOUR_MENU_ID);
    await remount();
    expect(leakedKeys(host)).toEqual([]);
  });
});

describe('each step puts its surface on screen', () => {
  const EVENTS = ['os:open', 'settings:navigate', 'shortcuts:reveal', 'shell:start', 'os:close-window'];
  const settle = (ms = 200) => new Promise((resolve) => setTimeout(resolve, ms));

  it('opens the section window a step talks about', async () => {
    rememberStep(firstStepOf('flashcards') ?? '');
    const seen = await recordEvents(EVENTS, async () => {
      await mount();
    });
    expect(seen).toContainEqual({ type: 'os:open', detail: 'flashcards' });
    expect(seen, 'Start is closed so it does not cover the window').toContainEqual({
      type: 'shell:start',
      detail: { open: false },
    });
  });

  it('routes Settings to the card a step anchors to', async () => {
    rememberStep('captions-intro');
    const seen = await recordEvents(EVENTS, async () => {
      await mount();
      await act(async () => {
        await settle();
      });
    });
    expect(seen).toContainEqual({ type: 'os:open', detail: 'settings' });
    expect(seen).toContainEqual({
      type: 'settings:navigate',
      detail: { page: 'transcription', settingId: 'live-captions' },
    });
  });

  it('opens Shortcuts at the row a companion step teaches', async () => {
    rememberStep('companion-wheel');
    const seen = await recordEvents(EVENTS, async () => {
      await mount();
      await act(async () => {
        await settle();
      });
    });
    expect(seen).toContainEqual({ type: 'settings:navigate', detail: { page: 'shortcuts' } });
    expect(seen).toContainEqual({ type: 'shortcuts:reveal', detail: { id: 'companion.wheel' } });
  });

  it('opens Start for the search step', async () => {
    rememberStep('start-search');
    const seen = await recordEvents(EVENTS, async () => {
      await mount();
    });
    expect(seen).toContainEqual({ type: 'shell:start', detail: { open: true } });
  });

  it('closes the windows it opened when the chapter ends — and only those', async () => {
    // Files was already open before the tour; Grammar was not.
    const files = document.createElement('section');
    files.className = 'fwin';
    files.dataset.section = 'files';
    document.body.append(files);
    rememberStep(TOUR_MENU_ID);
    await mount();
    const seen = await recordEvents(EVENTS, async () => {
      await act(async () => {
        chapterTile('grammar')?.click();
      });
      await click('Next');
      await click(en('tour.chapterDone'));
      await act(async () => {
        chapterTile('files')?.click();
      });
      await click('Next');
      await click(en('tour.chapterDone'));
    });
    const closed = seen.filter((e) => e.type === 'os:close-window').map((e) => e.detail);
    expect(closed).toContainEqual({ section: 'grammar' });
    expect(closed, 'a window the user had open stays open').not.toContainEqual({ section: 'files' });
  });

  it('spotlights an anchor that renders after the step opened its surface', async () => {
    rememberStep(firstStepOf('games') ?? '');
    await mount();
    expect(host.querySelector('.tour-ring'), 'nothing to spotlight yet').toBeNull();
    const win = document.createElement('section');
    win.className = 'fwin';
    win.dataset.section = 'games';
    const list = document.createElement('aside');
    list.className = 'game-list';
    list.getBoundingClientRect = () =>
      ({ left: 100, top: 120, width: 200, height: 300, right: 300, bottom: 420, x: 100, y: 120, toJSON: () => ({}) }) as DOMRect;
    win.append(list);
    document.body.append(win);
    await act(async () => {
      await settle(400);
    });
    const ring = host.querySelector<HTMLElement>('.tour-ring');
    expect(ring, 'the late anchor is found and spotlit').toBeTruthy();
    expect(ring?.style.left).toBe('94px');
  });
});

describe('hotkeys in the bubble', () => {
  it('shows the LIVE chord, so a rebound hotkey is never misreported', async () => {
    rememberStep('lens');
    await mount();
    const row = (): Element | null => host.querySelector('[data-tour-hotkey="lens.region"]');
    expect(row()?.querySelector('kbd')?.textContent).toBe('Ctrl+Shift+Space');

    await act(async () => {
      setBinding('lens.region', 'Ctrl+Alt+L');
    });
    expect(row()?.querySelector('kbd')?.textContent, 'the bubble follows a rebind').toBe('Ctrl+Alt+L');
    resetBinding('lens.region');
  });

  it('says a command has no chord yet instead of printing an empty key', async () => {
    rememberStep('companion-card');
    await mount();
    const row = host.querySelector('[data-tour-hotkey="companion.cardPreview"]');
    expect(row?.querySelector('kbd')).toBeNull();
    expect(row?.textContent).toContain(en('tour.hotkey.unset'));
  });
});

describe('first-boot tour and the consent card', () => {
  it('waits while the consent card is unanswered, so it never covers it', async () => {
    localStorage.removeItem(TELEMETRY_CONSENT_KEY);
    await mount();
    expect(bubble(), 'tour opened on top of the consent card').toBeNull();
  });

  it('starts as soon as the consent card records a choice', async () => {
    localStorage.removeItem(TELEMETRY_CONSENT_KEY);
    await mount();
    await act(async () => {
      localStorage.setItem(TELEMETRY_CONSENT_KEY, 'yes');
      window.dispatchEvent(new Event(TELEMETRY_CONSENT_DECIDED_EVENT));
    });
    expect(bubble(), 'tour did not start after the consent answer').toBeTruthy();
  });

  it('does not start from a consent answer once the tour is complete', async () => {
    localStorage.removeItem(TELEMETRY_CONSENT_KEY);
    markTourComplete();
    await mount();
    await act(async () => {
      localStorage.setItem(TELEMETRY_CONSENT_KEY, 'no');
      window.dispatchEvent(new Event(TELEMETRY_CONSENT_DECIDED_EVENT));
    });
    expect(bubble()).toBeNull();
  });
});

describe('tour script', () => {
  it('has every string translated in all four languages — really translated, not English copies', () => {
    const missing: string[] = [];
    const copied: string[] = [];
    for (const lang of UI_LANGS) {
      for (const key of tourI18nKeys()) {
        const value = CATALOGS[lang][key];
        if (value === undefined) missing.push(`${lang}:${key}`);
        else if (lang !== 'en' && value === CATALOGS.en[key] && !/^\{|^[A-Z0-9 ·{}/]+$/.test(String(value))) {
          copied.push(`${lang}:${key}`);
        }
      }
    }
    expect(missing).toEqual([]);
    expect(copied, 'a translation that is the English text').toEqual([]);
  });

  it('uses no emoji anywhere', () => {
    const emoji = /\p{Extended_Pictographic}/u;
    const hits: string[] = [];
    for (const lang of UI_LANGS) {
      for (const key of tourI18nKeys()) {
        if (emoji.test(String(CATALOGS[lang][key]))) hits.push(`${lang}:${key}`);
      }
    }
    expect(hits).toEqual([]);
  });

  it('uses unique step ids, none of them the menu’s', () => {
    const ids = TOUR_STEPS.map((s) => s.id);
    expect(new Set(ids).size, 'ids are persisted, so duplicates corrupt resume state').toBe(ids.length);
    expect(ids).not.toContain(TOUR_MENU_ID);
  });

  it('keeps each chapter’s steps together and every chapter non-empty', () => {
    const chapterIds = TOUR_CHAPTERS.map((c) => c.id);
    let last = '';
    const seen = new Set<string>();
    for (const step of TOUR_STEPS) {
      expect(chapterIds, step.id).toContain(step.chapter);
      if (step.chapter !== last) {
        expect(seen.has(step.chapter), `${step.chapter} is split`).toBe(false);
        seen.add(step.chapter);
        last = step.chapter;
      }
    }
    expect([...seen].sort()).toEqual([...chapterIds].sort());
    expect(TOUR_STEPS[0].chapter, 'a first boot starts with the basics').toBe('basics');
  });

  it('every step but the welcome and the Lens hint anchors to real UI', () => {
    const centred = TOUR_STEPS.filter((s) => !s.anchor).map((s) => s.id);
    expect(centred).toEqual(['welcome', 'lens']);
  });

  it('teaches only hotkeys that exist, with labels in all four languages', () => {
    const ids = new Set(COMMAND_CATALOG.map((c) => c.id));
    for (const step of TOUR_STEPS) {
      for (const id of step.hotkeys ?? []) {
        expect(ids.has(id), `${step.id} → ${id}`).toBe(true);
        for (const lang of UI_LANGS) {
          const labelled = commandLabelKeys(id).some((key) => CATALOGS[lang][key] !== undefined);
          expect(labelled, `${lang}: ${id}`).toBe(true);
        }
      }
    }
  });
});

describe('the tour names real Settings pages', () => {
  it('every page it names or opens is a Settings page, printed by its sidebar label', async () => {
    const { SETTINGS_NAV } = await import('../components/settings/settingsRegistry');
    const { settingsPageNameKey } = await import('../../shared/onboarding/tourScript');
    const pageIds = new Set(SETTINGS_NAV.map((page) => page.id));
    for (const step of TOUR_STEPS) {
      for (const page of Object.values(step.settingsPages ?? {})) {
        expect(pageIds.has(page), page).toBe(true);
        // The label the tour prints IS the one the Settings sidebar shows.
        expect(settingsPageNameKey(page)).toBe(SETTINGS_NAV.find((entry) => entry.id === page)?.labelKey);
      }
      if (step.surface?.kind === 'settings') expect(pageIds.has(step.surface.page), step.surface.page).toBe(true);
    }
  });

  it('fills the page name into the welcome text', async () => {
    await mount();
    const text = host.querySelector('.tour-bubble__body')?.textContent ?? '';
    expect(text).toContain(en('settings.nav.help'));
    expect(text).not.toContain('{help}');
  });
});
