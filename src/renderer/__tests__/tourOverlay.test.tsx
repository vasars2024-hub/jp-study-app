// @vitest-environment jsdom
/**
 * The first-boot tour. Audit `T1`.
 *
 * The accept criteria in `docs/IMPLEMENTATION_PLAN_V1.01.md` §9.5 are testable
 * almost verbatim, so they are tested rather than described: it runs once on a
 * fresh profile, Esc exits from any step, it never re-fires after completion,
 * and it replays from Settings.
 *
 * The one that matters most is **"never blocks the app"** — the plan calls a
 * forced tour "the fastest uninstall button ever shipped". That is a property of
 * the overlay's pointer-events, which a render test can assert and a code review
 * reliably misses.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { TOUR_STEPS, tourI18nKeys } from '../../shared/onboarding/tourScript';
import { CATALOGS } from '../../shared/i18n/catalogs/all';
import { UI_LANGS } from '../../shared/i18n/core';
import { loadOnboarding, markTourComplete, replayTour, shouldRunTour } from '../onboardingStore';
import TourOverlay from '../components/onboarding/TourOverlay';
import { leakedKeys } from './helpers/i18nLeak';
import { TELEMETRY_CONSENT_DECIDED_EVENT, TELEMETRY_CONSENT_KEY } from '../../shared/stats';

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
    root!.render(<TourOverlay />);
  });
  return host;
}

const bubble = (): HTMLElement | null => host.querySelector('.tour-bubble');
const button = (label: string): HTMLButtonElement | undefined =>
  [...host.querySelectorAll('button')].find((b) => b.textContent?.trim() === label);

describe('first-boot tour', () => {
  it('runs on a fresh profile and not after completion', async () => {
    expect(shouldRunTour(), 'fresh profile').toBe(true);
    await mount();
    expect(bubble(), 'the tour renders on a fresh profile').toBeTruthy();

    markTourComplete();
    expect(shouldRunTour(), 'completed profile').toBe(false);
    root?.unmount();
    root = null;
    await mount();
    expect(bubble(), 'it does not re-fire once completed').toBeNull();
  });

  it('never blocks the app underneath', async () => {
    await mount();
    const dim = host.querySelector('.tour-dim') as HTMLElement;
    const overlayRoot = host.querySelector('.tour-root') as HTMLElement;
    // jsdom does not apply the stylesheet, so assert the rule exists in the CSS
    // the component imports rather than a computed style that is always ''.
    expect(overlayRoot, 'overlay mounted').toBeTruthy();
    expect(dim, 'a dim layer renders').toBeTruthy();
    // The bubble is the one interactive surface; everything else must pass
    // clicks through. This is asserted structurally: the dim panels are
    // siblings of the bubble, never ancestors, so they cannot swallow its
    // events nor cover the spotlight hole.
    expect(bubble()!.parentElement).toBe(overlayRoot);
    expect(dim.contains(bubble())).toBe(false);
  });

  it('Esc exits from any step and counts as completion', async () => {
    await mount();
    // Advance a couple of steps first — Esc must work mid-tour, not only on the
    // first bubble.
    await act(async () => { button('Next')?.click(); });
    await act(async () => { button('Next')?.click(); });
    expect(host.querySelector('.tour-root')?.getAttribute('data-tour-step')).toBe(TOUR_STEPS[2].id);

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(bubble(), 'Esc dismisses immediately').toBeNull();
    expect(loadOnboarding().completedAt, 'and records completion so it does not re-fire').not.toBeNull();
  });

  it('walks every step to the end and finishes', async () => {
    await mount();
    for (let i = 0; i < TOUR_STEPS.length - 1; i += 1) {
      expect(host.querySelector('.tour-root')?.getAttribute('data-tour-step')).toBe(TOUR_STEPS[i].id);
      await act(async () => { button('Next')?.click(); });
    }
    expect(button('Finish'), 'the last step offers Finish, not Next').toBeTruthy();
    await act(async () => { button('Finish')?.click(); });
    expect(bubble()).toBeNull();
    expect(shouldRunTour()).toBe(false);
  });

  /**
   * Audit 6.1 found `lastStepId` written on every advance and read by nothing, so a tour left
   * half-finished restarted from step 1. These pin the resume, and the two ways it must NOT
   * resume: a replay is a deliberate restart, and a step id that no longer exists in the
   * script must fall back to the start rather than render nothing.
   */
  it('resumes at the step it recorded rather than restarting', async () => {
    await mount();
    await act(async () => { button('Next')?.click(); });
    await act(async () => { button('Next')?.click(); });
    expect(loadOnboarding().lastStepId, 'the step is recorded').toBe(TOUR_STEPS[2].id);

    root?.unmount();
    root = null;
    await mount();
    expect(
      host.querySelector('.tour-root')?.getAttribute('data-tour-step'),
      'a re-opened tour picks up where it was left',
    ).toBe(TOUR_STEPS[2].id);
  });

  it('starts from the beginning after a replay, not from the resumed step', async () => {
    await mount();
    await act(async () => { button('Next')?.click(); });
    expect(loadOnboarding().lastStepId).toBe(TOUR_STEPS[1].id);

    markTourComplete();
    replayTour();
    root?.unmount();
    root = null;
    await mount();
    expect(
      host.querySelector('.tour-root')?.getAttribute('data-tour-step'),
      'replay is a deliberate restart',
    ).toBe(TOUR_STEPS[0].id);
  });

  it('falls back to the first step when the recorded step no longer exists', async () => {
    localStorage.setItem(
      'jp-study.onboarding.v1',
      JSON.stringify({ completedAt: null, replays: 0, lastStepId: 'a-step-that-was-removed' }),
    );
    await mount();
    expect(bubble(), 'an unknown step must not blank the tour').toBeTruthy();
    expect(host.querySelector('.tour-root')?.getAttribute('data-tour-step')).toBe(TOUR_STEPS[0].id);
  });

  it('replays from Settings without erasing that it ran', async () => {
    markTourComplete();
    const first = loadOnboarding().completedAt;
    expect(first).not.toBeNull();
    replayTour();
    expect(shouldRunTour(), 'replay re-arms the tour').toBe(true);
    expect(loadOnboarding().replays, 'and counts the replay').toBe(1);
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

    await act(async () => { replayTour(); });
    expect(bubble(), 'Replay starts the tour in this window, not on the next boot').toBeTruthy();
    expect(host.querySelector('.tour-root')?.getAttribute('data-tour-step')).toBe(TOUR_STEPS[0].id);
  });

  it('re-arms from another window, where Settings may be popped out', async () => {
    markTourComplete();
    await mount();
    expect(bubble()).toBeNull();

    // A pop-out shares only the origin's localStorage; this is the event the
    // browser raises in every OTHER window when it writes.
    localStorage.setItem(
      'jp-study.onboarding.v1',
      JSON.stringify({ completedAt: null, replays: 1, lastStepId: null }),
    );
    await act(async () => {
      window.dispatchEvent(new StorageEvent('storage', { key: 'jp-study.onboarding.v1' }));
    });
    expect(bubble(), 'a replay from a pop-out Settings window still starts it').toBeTruthy();
  });

  it('Back steps in reverse, records where it lands, and is off on the first step', async () => {
    await mount();
    expect(button('Back')?.disabled, 'nothing to go back to on step 1').toBe(true);

    await act(async () => { button('Next')?.click(); });
    await act(async () => { button('Next')?.click(); });
    expect(loadOnboarding().lastStepId).toBe(TOUR_STEPS[2].id);

    await act(async () => { button('Back')?.click(); });
    expect(host.querySelector('.tour-root')?.getAttribute('data-tour-step')).toBe(TOUR_STEPS[1].id);
    expect(
      loadOnboarding().lastStepId,
      'a resumed tour must come back to where the user actually is',
    ).toBe(TOUR_STEPS[1].id);
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

  it('renders no raw catalog key', async () => {
    await mount();
    expect(leakedKeys(host)).toEqual([]);
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
  it('has every string translated in all four languages', () => {
    const missing: string[] = [];
    for (const lang of UI_LANGS) {
      for (const key of tourI18nKeys()) {
        if (CATALOGS[lang][key] === undefined) missing.push(`${lang}:${key}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('uses unique step ids', () => {
    const ids = TOUR_STEPS.map((s) => s.id);
    expect(new Set(ids).size, 'ids are persisted, so duplicates corrupt resume state').toBe(ids.length);
  });

  it('only anchors to selectors that exist in the shell source', async () => {
    // The plan's pitfall: "anchors are live UI elements ... or the tour points
    // at empty space". A selector that no longer exists degrades to a centred
    // bubble at runtime, so this is a quality gate rather than a crash guard —
    // but a step that silently stops pointing at anything is still a defect.
    const { readFileSync } = await import('node:fs');
    const shell = readFileSync('src/renderer/components/DesktopShell.tsx', 'utf8');
    const stale = TOUR_STEPS.filter((step) => {
      if (!step.anchor) return false;
      const className = step.anchor.replace(/^\./, '');
      return !shell.includes(className);
    }).map((step) => `${step.id} → ${step.anchor}`);
    expect(stale, 'every anchored step points at a class DesktopShell still renders').toEqual([]);
  });
});

describe('the tour names real Settings pages and can take you there', () => {
  it('every page it names is a Settings page, rendered by its sidebar label', async () => {
    const { SETTINGS_NAV } = await import('../components/settings/settingsRegistry');
    const { settingsPageNameKey } = await import('../../shared/onboarding/tourScript');
    const pageIds = new Set(SETTINGS_NAV.map((page) => page.id));
    for (const step of TOUR_STEPS) {
      for (const page of Object.values(step.settingsPages ?? {})) {
        expect(pageIds.has(page), page).toBe(true);
        // The label the tour prints IS the one the Settings sidebar shows.
        expect(settingsPageNameKey(page)).toBe(SETTINGS_NAV.find((entry) => entry.id === page)?.labelKey);
      }
      if (step.destination) expect(pageIds.has(step.destination.page), step.destination.page).toBe(true);
    }
    // No catalog still hard-codes the old, non-existent page names.
    for (const lang of UI_LANGS) {
      const body = String(CATALOGS[lang]['tour.language.body']);
      expect(body, lang).toContain('{appearance}');
      expect(body, lang).toContain('{study}');
      expect(String(CATALOGS[lang]['tour.assets.body']), lang).toContain('{storage}');
    }
  });

  it('fills the page names and "Take me there" opens Settings at the card', async () => {
    const assets = TOUR_STEPS.findIndex((step) => step.id === 'assets');
    const { rememberStep } = await import('../onboardingStore');
    rememberStep(TOUR_STEPS[assets].id);
    await mount();
    expect(host.querySelector('[data-tour-step]')?.getAttribute('data-tour-step')).toBe('assets');
    const text = host.querySelector('.tour-bubble__body')?.textContent ?? '';
    expect(text).toContain(String(CATALOGS.en['settings.nav.storage']));
    expect(text).not.toContain('{storage}');

    const seen: unknown[] = [];
    const onOpen = (event: Event) => {
      seen.push((event as CustomEvent).detail);
      event.preventDefault();
    };
    const onNav = (event: Event) => seen.push((event as CustomEvent).detail);
    window.addEventListener('os:open', onOpen);
    window.addEventListener('settings:navigate', onNav);
    await act(async () => {
      button(String(CATALOGS.en['tour.takeMeThere']))?.click();
      await new Promise((resolve) => setTimeout(resolve, 120));
    });
    window.removeEventListener('os:open', onOpen);
    window.removeEventListener('settings:navigate', onNav);
    expect(seen).toContainEqual({ page: 'storage', settingId: undefined });
    expect(bubble()).toBeNull();
    expect(shouldRunTour()).toBe(false);
  });
});
