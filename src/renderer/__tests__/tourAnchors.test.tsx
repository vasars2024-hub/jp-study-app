// @vitest-environment jsdom
/**
 * Every tour step points at something real.
 *
 * The tour's first version could only promise this for its handful of shell
 * selectors, and did it by grepping DesktopShell's source for class names. The
 * chapters now anchor inside app windows, Settings cards and Shortcuts rows, so
 * a source grep proves nothing: a class can be in a file and still never render
 * on the surface a step opens (a collapsed group, an advanced Settings page, a
 * card behind a feature switch).
 *
 * So this mounts the real desktop (`DesktopShell`) and the real overlay the way
 * `App` does, walks the whole tour through its own buttons — every chapter,
 * every step — and requires each step's anchor to appear in the DOM once the
 * surface the step asked for has opened. Only the preload bridge is stubbed. It
 * also checks the tour tidies up: the windows a chapter opened are closed again
 * when it ends.
 */
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TOUR_CHAPTERS, TOUR_MENU_ID, TOUR_STEPS, chapterSteps } from '../../shared/onboarding/tourScript';
import { CATALOGS } from '../../shared/i18n/catalogs/all';
import { TELEMETRY_CONSENT_KEY } from '../../shared/stats';

/** Every bridge call resolves; the few whose answer is read without a guard get a usable shape. */
function stubBridge(): void {
  const answers: Record<string, unknown> = {
    displayList: [],
    popoutListOpen: [],
    deskwinWhoAmI: {},
    desktopCommitLayout: { ok: true },
    listLibrary: [],
    getLibraryFolders: [],
    jitenGetStore: { plan: [] },
    assetsList: { statuses: [] },
    watchList: { items: [] },
    flashcardListVoices: { voices: [], platform: 'win32' },
    sysDictGetSettings: { enabled: false, hotkey: '', supported: true, registered: false },
    // Live captions renders its card once main has answered with its state.
    captionsGetState: {
      settings: {
        captureSeconds: 60,
        mineSeconds: 8,
        source: 'windows',
        overlayOpacity: 0.72,
        fontSize: 24,
        bounds: null,
        transcribeMined: true,
      },
      capture: 'off',
      bufferedMs: 0,
      recordingSince: null,
      overlayOpen: false,
      windowsAttached: false,
      windowsWaiting: false,
      gumModelMissing: false,
      supported: true,
      studyLang: 'ja',
    },
  };
  // A `list…` read answers an empty list, a settings/status read an empty object,
  // anything else `undefined`.
  const answer = (name: string): unknown => {
    if (name in answers) return answers[name];
    if (/^list|List(?:[A-Z]|$)/.test(name)) return [];
    if (/(?:Settings|Status|Config|Prefs)$/.test(name)) return {};
    return undefined;
  };
  const call = (name: string) => () => {
    const p = Promise.resolve(answer(name));
    // Callable as well as awaitable: `on*` subscriptions return their unsubscribe function.
    return Object.assign(() => undefined, { then: p.then.bind(p), catch: p.catch.bind(p), finally: p.finally.bind(p) });
  };
  (window as unknown as { api: unknown }).api = new Proxy({}, { get: (_t, key) => call(String(key)) });
}

const settle = async (ms = 30): Promise<void> => {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
};

let root: Root | null = null;
let host: HTMLDivElement;

const en = (key: string): string => String(CATALOGS.en[key]);
const current = (): string | null | undefined =>
  document.querySelector('.tour-root')?.getAttribute('data-tour-step');
const bubbleButton = (label: string): HTMLButtonElement | undefined =>
  [...document.querySelectorAll<HTMLButtonElement>('.tour-bubble button')].find((b) => b.textContent?.trim() === label);

/**
 * Poll for a selector the way the overlay does, giving lazy windows time to mount.
 * Generous: the first open of a section transforms its whole module graph here,
 * which the packaged app never does.
 */
async function waitFor(selector: string, timeoutMs = 25000): Promise<Element | null> {
  const started = Date.now();
  for (;;) {
    const found = document.querySelector(selector);
    if (found) return found;
    if (Date.now() - started > timeoutMs) return null;
    await settle(100);
  }
}

beforeAll(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  stubBridge();
  const none = (): void => undefined;
  window.matchMedia ??= ((query: string) => ({
    matches: false, media: query, onchange: null,
    addEventListener: none, removeEventListener: none, addListener: none, removeListener: none,
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  (globalThis as Record<string, unknown>).ResizeObserver ??= class {
    observe = none;
    unobserve = none;
    disconnect = none;
  };
  (globalThis as Record<string, unknown>).IntersectionObserver ??= class {
    observe = none;
    unobserve = none;
    disconnect = none;
    takeRecords = () => [];
  };
  Element.prototype.scrollIntoView ??= none;
  // jsdom has no CSS namespace; Shortcuts escapes the row id it scrolls to.
  (globalThis as Record<string, unknown>).CSS ??= { escape: (value: string) => value.replace(/["\\]/g, '\\$&') };
  Element.prototype.scrollTo ??= none as unknown as Element['scrollTo'];
  window.scrollTo = none as unknown as typeof window.scrollTo;
  localStorage.clear();
  localStorage.setItem(TELEMETRY_CONSENT_KEY, 'no');

  const DesktopShell = (await import('../components/DesktopShell')).default as (props: {
    onOpenBook: () => void;
  }) => ReactNode;
  const TourOverlay = (await import('../components/onboarding/TourOverlay')).default;
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root?.render(
      <>
        <DesktopShell onOpenBook={() => undefined} />
        <TourOverlay />
      </>,
    );
  });
  await settle(200);
}, 180_000);

afterAll(async () => {
  await act(async () => {
    root?.unmount();
  });
  host?.remove();
});

describe('the guided tour on the real desktop', () => {
  it('finds every step’s anchor on the surface the step opens, chapter by chapter', { timeout: 600_000 }, async () => {
    const missing: string[] = [];
    const visited: string[] = [];
    const leftOpen: string[] = [];

    const walkChapter = async (chapterId: string): Promise<void> => {
      const steps = chapterSteps(chapterId as (typeof TOUR_CHAPTERS)[number]['id']);
      for (let i = 0; i < steps.length; i += 1) {
        const step = steps[i];
        expect(current(), `the tour is on ${step.id}`).toBe(step.id);
        visited.push(step.id);
        if (step.anchor) {
          const found = await waitFor(step.anchor);
          if (!found) missing.push(`${step.id} → ${step.anchor}`);
        }
        const label = i === steps.length - 1 ? en('tour.chapterDone') : en('tour.next');
        await act(async () => {
          bubbleButton(label)?.click();
        });
        await settle(60);
      }
      expect(current(), `${chapterId} ends at the chapter menu`).toBe(TOUR_MENU_ID);
      // What the chapter opened, it closed.
      await settle(200);
      const windows = [...document.querySelectorAll<HTMLElement>('.fwin')].map((w) => w.dataset.section);
      if (windows.length) leftOpen.push(`${chapterId}: ${windows.join(',')}`);
    };

    // A first boot: the basics run by themselves and end at the menu.
    expect(current()).toBe('welcome');
    await walkChapter('basics');
    for (const chapter of TOUR_CHAPTERS) {
      if (chapter.id === 'basics') continue;
      const tile = document.querySelector<HTMLButtonElement>(`[data-tour-chapter="${chapter.id}"]`);
      expect(tile, `the menu offers ${chapter.id}`).toBeTruthy();
      await act(async () => {
        tile?.click();
      });
      await settle(60);
      await walkChapter(chapter.id);
    }

    expect(visited, 'every step was shown').toEqual(TOUR_STEPS.map((s) => s.id));
    expect(missing, 'a step pointing at nothing').toEqual([]);
    expect(leftOpen, 'a chapter left its windows behind').toEqual([]);

    await act(async () => {
      bubbleButton(en('tour.done'))?.click();
    });
    expect(document.querySelector('.tour-root'), 'Finish closes the tour').toBeNull();

    // …and Start brings it back, at the chapter menu.
    await act(async () => {
      document.querySelector<HTMLButtonElement>('.os-start-btn')?.click();
    });
    const again = await waitFor('.os-start-tour', 3000);
    expect(again, 'Start offers the guided tour').toBeTruthy();
    await act(async () => {
      (again as HTMLButtonElement | null)?.click();
    });
    await settle(60);
    expect(current(), 'Start → Guided tour opens the chapter menu').toBe(TOUR_MENU_ID);
    expect(document.querySelector('#os-start-panel'), 'and Start closes behind it').toBeNull();
  });
});
