/**
 * The guided tour overlay. Phase 9.5 / audit `T1`, grown into chapters.
 *
 * Renders a dimmed backdrop with a hole cut around the current step's anchor,
 * plus a bubble beside it. Everything the plan marked non-negotiable is here:
 *
 * - **Never blocks.** The backdrop is `pointer-events: none` except for the
 *   bubble itself and the spotlit element, so the app stays usable underneath.
 *   The plan calls a forced tour "the fastest uninstall button ever shipped".
 * - **Esc exits instantly**, from any step, and counts as completion so it does
 *   not re-fire.
 * - **Anchors recompute on resize, scroll and zoom.** A fixed rect measured once
 *   points at empty space the moment the window changes size.
 * - **A missing anchor degrades to a centred bubble** rather than a spotlight on
 *   nothing — which is what makes every step survivable on a first boot with no
 *   models installed, or with Settings popped out into its own window.
 * - **Motion Mode: Disabled** removes the transition, per the plan and
 *   `prefersReducedMotion()`.
 *
 * ## Chapters
 *
 * The basics chapter runs on a first boot; when it ends — and whenever any
 * chapter ends — the bubble becomes the chapter menu, where every other chapter
 * is optional and ticked once walked. A step names the surface it needs (a
 * window, a Settings card, a Shortcuts row); the overlay opens it, waits for the
 * anchor to render, scrolls it into view and only then draws the spotlight.
 * Windows the tour opened are closed again when the chapter ends, so the
 * desktop is left the way the user had it.
 *
 * No audio. The plan's beep-speech step depends on the Phase 4 companion voice
 * profile and carries a Chromium autoplay constraint (no AudioContext before a
 * user gesture); wiring sound to a bubble that appears *before* any click is the
 * documented way to get a silently muted voice that "randomly" works.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  TOUR_CHAPTERS,
  TOUR_MENU_ID,
  TOUR_STEPS,
  chapterSteps,
  isTourChapter,
  settingsPageNameKey,
  type TourChapterId,
  type TourSurface,
} from '../../../shared/onboarding/tourScript';
import { openSectionSurface } from '../../sectionSurface';
import { prefersReducedMotion } from '../../motion/motionPrefs';
import {
  announceTourStarted,
  loadOnboarding,
  markChapterDone,
  markTourComplete,
  onTourArmChanged,
  rememberStep,
  shouldRunTour,
  takeRequestedChapter,
} from '../../onboardingStore';
import { useT } from '../../i18n';
import { layoutViewport, toLayoutRect } from '../../zoomCoords';
import { TELEMETRY_CONSENT_DECIDED_EVENT, telemetryConsentPending } from '../../../shared/stats';
import { COMMAND_CATALOG, effectiveKeys, formatKeysDisplay, onShortcutsChanged } from '../../keyboardShortcuts';
import { commandLabel } from '../../commandI18n';
import { revealShortcut, SHORTCUT_REVEAL_EVENT } from '../../shortcutReveal';
import Icon, { type IconName } from '../Icons';
import { Tile, TileList } from '../ui/Tile';
import './onboarding.css';

/** Padding around the spotlit element so the hole does not clip its own border. */
const SPOTLIGHT_PAD = 6;
/** How long a step waits for its surface to render the anchor before centring. */
const ANCHOR_WAIT_MS = 6000;
const ANCHOR_POLL_MS = 150;
/** Settings mounts lazily; a navigate sent in the same tick as `os:open` is lost. */
const SETTINGS_NAVIGATE_DELAY_MS = 120;

/** How often a step whose Settings anchor has not rendered repeats its route. */
const REROUTE_MS = 900;

/**
 * Route an open Settings window to a step's page (and, for a Shortcuts row, its
 * group). Harmless to repeat: navigating to the page already shown is a no-op.
 */
function routeSettings(surface: TourSurface): void {
  if (surface.kind === 'settings') {
    window.dispatchEvent(
      new CustomEvent('settings:navigate', { detail: { page: surface.page, settingId: surface.settingId } }),
    );
  } else if (surface.kind === 'shortcut') {
    window.dispatchEvent(new CustomEvent('settings:navigate', { detail: { page: 'shortcuts' } }));
    window.dispatchEvent(new CustomEvent(SHORTCUT_REVEAL_EVENT, { detail: { id: surface.id } }));
  }
}

/** Asks the desktop to open or close the Start menu (DesktopShell listens). */
export const TOUR_START_MENU_EVENT = 'shell:start';
/** Asks the desktop to close one section's window (DesktopShell listens). */
export const CLOSE_SECTION_EVENT = 'os:close-window';

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

function findAnchor(selector: string | null): Element | null {
  if (!selector) return null;
  try {
    return document.querySelector(selector);
  } catch {
    return null;
  }
}

function measure(selector: string | null): Rect | null {
  const element = findAnchor(selector);
  if (!element) return null;
  // The overlay renders inside #root, whose CSS zoom scales every `top/left` it
  // sets, while getBoundingClientRect reports viewport pixels. Convert once here:
  // at the 80% default zoom the raw rect put the ring and bubble a fifth of the
  // way short of their anchor.
  const box = toLayoutRect(element.getBoundingClientRect());
  // A zero-area element is present in the DOM but not on screen (collapsed rail,
  // hidden taskbar). Treat it as absent so the step centres instead of drawing a
  // spotlight the user cannot see.
  if (box.width < 1 || box.height < 1) return null;
  // Clip to the window: a card taller than the window must not push the ring's
  // edges — and the bubble placed against them — off screen.
  const viewport = layoutViewport();
  const top = Math.max(0, box.top - SPOTLIGHT_PAD);
  const left = Math.max(0, box.left - SPOTLIGHT_PAD);
  const bottom = Math.min(viewport.height, box.top + box.height + SPOTLIGHT_PAD);
  const right = Math.min(viewport.width, box.left + box.width + SPOTLIGHT_PAD);
  if (bottom - top < 1 || right - left < 1) return null;
  return { top, left, width: right - left, height: bottom - top };
}

/** The section window a surface lives in, or `null` for the desktop and Start. */
function surfaceSection(surface: TourSurface | undefined): string | null {
  if (!surface) return null;
  if (surface.kind === 'section') return surface.section;
  if (surface.kind === 'settings' || surface.kind === 'shortcut') return 'settings';
  return null;
}

/** Section ids are the desktop's own plain identifiers, so they go into the selector as they are. */
function sectionWindowOpen(section: string): boolean {
  return findAnchor(`.fwin[data-section="${section}"]`) !== null;
}

type Where = { mode: 'menu' } | { mode: 'step'; index: number };

/**
 * Where a re-opened tour picks up.
 *
 * `lastStepId` has been persisted on every advance since the store was written, and until
 * audit 6.1 nothing read it — the tour recorded where the user got to and then restarted from
 * the beginning anyway. An unknown id (a step renamed or dropped since the value was stored)
 * resolves to the start rather than to nothing, because the failure that matters here is the
 * one the store's own comment names: never showing the tour at all.
 */
function resumeWhere(): Where {
  const { lastStepId } = loadOnboarding();
  if (lastStepId === TOUR_MENU_ID) return { mode: 'menu' };
  if (!lastStepId) return { mode: 'step', index: 0 };
  const found = TOUR_STEPS.findIndex((entry) => entry.id === lastStepId);
  return { mode: 'step', index: found > 0 ? found : 0 };
}

/** Where a replay starts: the chapter it asked for, the menu, or wherever the store says. */
function replayWhere(): Where {
  const requested = takeRequestedChapter();
  if (requested === TOUR_MENU_ID) return { mode: 'menu' };
  if (isTourChapter(requested)) {
    const index = TOUR_STEPS.findIndex((step) => step.chapter === requested);
    if (index >= 0) return { mode: 'step', index };
  }
  return resumeWhere();
}

export default function TourOverlay() {
  const { t } = useT();
  // On a first boot the consent card is also up; the tour opening over it hid the
  // card's text behind the bubble. Wait for the card's answer, then start.
  const [active, setActive] = useState(() => shouldRunTour() && !telemetryConsentPending());
  const [where, setWhere] = useState<Where>(() => (shouldRunTour() ? replayWhere() : resumeWhere()));
  const [rect, setRect] = useState<Rect | null>(null);
  const [bubbleSize, setBubbleSize] = useState<{ width: number; height: number } | null>(null);
  const [chaptersDone, setChaptersDone] = useState<string[]>(() => loadOnboarding().chaptersDone);
  const [, setShortcutsVersion] = useState(0);
  const bubbleRef = useRef<HTMLDivElement>(null);
  /** Section windows this tour opened, so it can close exactly those again. */
  const openedRef = useRef<Set<string>>(new Set());

  const step = where.mode === 'step' ? TOUR_STEPS[where.index] : undefined;
  const steps = step ? chapterSteps(step.chapter) : [];
  const position = step ? steps.findIndex((entry) => entry.id === step.id) : -1;
  const isLastOfChapter = step ? position === steps.length - 1 : false;

  /** Close the windows the tour opened, except the one the user is looking at. */
  const closeTourWindows = useCallback((keep: string | null = null) => {
    for (const section of [...openedRef.current]) {
      if (section === keep) continue;
      openedRef.current.delete(section);
      window.dispatchEvent(new CustomEvent(CLOSE_SECTION_EVENT, { detail: { section } }));
    }
  }, []);

  const finish = useCallback(
    (keepCurrent: boolean) => {
      markTourComplete();
      closeTourWindows(keepCurrent && step ? surfaceSection(step.surface) : null);
      if (keepCurrent) openedRef.current.clear();
      setActive(false);
    },
    [closeTourWindows, step],
  );

  const goTo = useCallback((next: Where) => {
    rememberStep(next.mode === 'menu' ? TOUR_MENU_ID : TOUR_STEPS[next.index].id);
    setWhere(next);
  }, []);

  const toMenu = useCallback(() => {
    closeTourWindows();
    window.dispatchEvent(new CustomEvent(TOUR_START_MENU_EVENT, { detail: { open: false } }));
    goTo({ mode: 'menu' });
  }, [closeTourWindows, goTo]);

  const next = useCallback(() => {
    if (where.mode !== 'step' || !step) return;
    if (isLastOfChapter) {
      markChapterDone(step.chapter);
      setChaptersDone(loadOnboarding().chaptersDone);
      toMenu();
      return;
    }
    goTo({ mode: 'step', index: where.index + 1 });
  }, [where, step, isLastOfChapter, goTo, toMenu]);

  /**
   * The reverse of Next, and the reason it had to exist: Esc is an exit, not an
   * undo — it calls `markTourComplete`, so one accidental Next could only be
   * recovered by finishing the tour and replaying it from Settings. `Back`
   * persists the step it lands on, exactly as `next` does, so a tour left
   * mid-way resumes where the user actually is rather than where they were
   * before they stepped back. On a chapter's first step it returns to the menu.
   */
  const back = useCallback(() => {
    if (where.mode !== 'step' || !step) return;
    if (position > 0) {
      goTo({ mode: 'step', index: where.index - 1 });
      return;
    }
    if (step.chapter !== 'basics') toMenu();
  }, [where, step, position, goTo, toMenu]);

  const startChapter = useCallback(
    (chapter: TourChapterId) => {
      const index = TOUR_STEPS.findIndex((entry) => entry.chapter === chapter);
      if (index >= 0) goTo({ mode: 'step', index });
    },
    [goTo],
  );

  /**
   * Settings → Help → Replay (or a chapter picked there, or Start's Guided tour)
   * re-arms the store from another component — and, when Settings is popped out,
   * from another window. Re-read rather than assume: `shouldRunTour()` is the
   * same predicate the initial state used, so a replay and a first boot enter
   * through one door.
   */
  useEffect(
    () =>
      onTourArmChanged(() => {
        if (!shouldRunTour()) return;
        setWhere(replayWhere());
        setChaptersDone(loadOnboarding().chaptersDone);
        setActive(true);
        // The receipt Settings → Help waits for. Raised here, synchronously,
        // because the thing that is true is "an overlay took it", not "the
        // store was written".
        announceTourStarted();
      }),
    [],
  );

  useEffect(() => {
    const onConsentDecided = (): void => {
      if (!shouldRunTour()) return;
      setWhere(replayWhere());
      setActive(true);
    };
    window.addEventListener(TELEMETRY_CONSENT_DECIDED_EVENT, onConsentDecided);
    return () => window.removeEventListener(TELEMETRY_CONSENT_DECIDED_EVENT, onConsentDecided);
  }, []);

  // A hotkey the user rebinds while the bubble is up must not stay stale on it.
  useEffect(() => onShortcutsChanged(() => setShortcutsVersion((v) => v + 1)), []);

  // Esc must work from any step, so it is bound at the window rather than on the
  // bubble — the bubble may not hold focus if the user clicked into the app.
  useEffect(() => {
    if (!active) return undefined;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        finish(true);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [active, finish]);

  /**
   * Put the step's surface on screen: close what the tour opened for earlier
   * steps, open (or focus) this step's window, route Settings to its card.
   */
  useEffect(() => {
    if (!active || !step?.surface) return;
    const surface = step.surface;
    const section = surfaceSection(surface);
    closeTourWindows(section);
    window.dispatchEvent(new CustomEvent(TOUR_START_MENU_EVENT, { detail: { open: surface.kind === 'start' } }));
    if (!section) return;
    if (!sectionWindowOpen(section)) openedRef.current.add(section);
    if (surface.kind === 'shortcut') {
      revealShortcut({ id: surface.id });
      return;
    }
    openSectionSurface(section);
    if (surface.kind !== 'settings') return;
    const timer = window.setTimeout(() => routeSettings(surface), SETTINGS_NAVIGATE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [active, step, closeTourWindows]);

  /**
   * Re-measure on anything that can move the anchor. `useLayoutEffect` so the
   * spotlight is positioned before paint — measuring in `useEffect` shows one
   * frame of the hole in its previous place on every step change. A surface the
   * step just opened renders a moment later, so the anchor is polled for until
   * it appears (then scrolled into view once) or the wait runs out.
   */
  useLayoutEffect(() => {
    if (!active || !step) {
      setRect(null);
      return undefined;
    }
    const anchor = step.anchor;
    const update = (): void => setRect(measure(anchor));
    setRect(null);
    update();
    let scrolled = false;
    const started = Date.now();
    let rerouted = started;
    const poll = window.setInterval(() => {
      const element = findAnchor(anchor);
      // A Settings window that was still mounting missed the route; say it again.
      if (!element && step.surface && Date.now() - rerouted > REROUTE_MS) {
        rerouted = Date.now();
        routeSettings(step.surface);
      }
      if (element && !scrolled) {
        scrolled = true;
        (element as HTMLElement).scrollIntoView?.({ block: 'center', inline: 'nearest' });
      }
      update();
      if ((element && measure(anchor)) || Date.now() - started > ANCHOR_WAIT_MS) window.clearInterval(poll);
    }, ANCHOR_POLL_MS);
    window.addEventListener('resize', update);
    // `true` = capture, so a scroll inside any nested container is seen too.
    window.addEventListener('scroll', update, true);
    // Guarded: `ResizeObserver` is absent in jsdom and in older embeddings, and
    // an onboarding overlay that throws on mount would take the first-run screen
    // down with it. `resize` + `scroll` already cover the common cases; this
    // only adds layout changes that move the anchor without either event.
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(update) : null;
    observer?.observe(document.body);
    return () => {
      window.clearInterval(poll);
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
      observer?.disconnect();
    };
  }, [active, step]);

  // A step that advances on clicking its anchor still needs Next to work, so
  // this listens rather than intercepts — the click reaches the real control.
  // Re-bound once the anchor has rendered (`rect` turns non-null).
  const anchorShown = rect !== null;
  useEffect(() => {
    if (!active || !step || step.advance !== 'anchor-click' || !step.anchor || !anchorShown) return undefined;
    const target = findAnchor(step.anchor);
    if (!target) return undefined;
    const onClick = (): void => next();
    target.addEventListener('click', onClick);
    return () => target.removeEventListener('click', onClick);
  }, [active, step, next, anchorShown]);

  // The bubble's real size decides where it fits; text length differs per language.
  useLayoutEffect(() => {
    const el = bubbleRef.current;
    if (!el) return;
    const width = el.offsetWidth;
    const height = el.offsetHeight;
    if (!width || !height) return;
    setBubbleSize((prev) => (prev && prev.width === width && prev.height === height ? prev : { width, height }));
  });

  if (!active) return null;

  const reduced = prefersReducedMotion();

  if (where.mode === 'menu') {
    return (
      <div className={`tour-root${reduced ? ' tour-root--static' : ''}`} data-tour-step={TOUR_MENU_ID}>
        <div className="tour-dim tour-dim--full" />
        <div
          ref={bubbleRef}
          className="tour-bubble tour-bubble--centered tour-bubble--menu"
          role="dialog"
          aria-modal="false"
          aria-label={t('tour.menu.title')}
        >
          <div className="tour-bubble__step-live" aria-live="polite" aria-atomic="true">
            <h2 className="tour-bubble__title">{t('tour.menu.title')}</h2>
            <p className="tour-bubble__body">{t('tour.menu.body')}</p>
          </div>
          <TileList layout="grid" className="tour-chapters">
            {TOUR_CHAPTERS.map((chapter) => {
              const done = chaptersDone.includes(chapter.id);
              return (
                <li key={chapter.id}>
                  <Tile
                    className="tour-chapter"
                    data-tour-chapter={chapter.id}
                    icon={<Icon name={chapter.icon as IconName} size={18} />}
                    title={t(chapter.titleKey)}
                    description={t(chapter.descKey)}
                    meta={
                      done ? (
                        <span className="tour-chapter__done" title={t('tour.menu.done')}>
                          <Icon name="check" size={14} />
                          <span className="tour-sr-only">{t('tour.menu.done')}</span>
                        </span>
                      ) : undefined
                    }
                    onClick={() => startChapter(chapter.id)}
                  />
                </li>
              );
            })}
          </TileList>
          <div className="tour-bubble__actions">
            <button type="button" className="btn primary" onClick={() => finish(false)}>
              {t('tour.done')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!step) return null;

  const title = t(step.titleKey);
  // Page names come from the Settings sidebar's own labels, in the UI language.
  const pageNames: Record<string, string> = {};
  for (const [slot, page] of Object.entries(step.settingsPages ?? {})) pageNames[slot] = t(settingsPageNameKey(page));
  const body = t(step.bodyKey, pageNames);
  const chapterTitle = t(TOUR_CHAPTERS.find((entry) => entry.id === step.chapter)?.titleKey ?? '');
  const hotkeys = (step.hotkeys ?? []).map((id) => {
    const fallback = COMMAND_CATALOG.find((command) => command.id === id)?.label ?? id;
    return { id, label: commandLabel(id, fallback, t), keys: formatKeysDisplay(effectiveKeys(id)) };
  });
  const backDisabled = position <= 0 && step.chapter === 'basics';

  return (
    <div className={`tour-root${reduced ? ' tour-root--static' : ''}`} data-tour-step={step.id}>
      {rect ? (
        <>
          {/*
            Four dim panels around the anchor rather than one box-shadow ring:
            a shadow-based cutout still covers the element with a transparent
            layer, which swallows the click that `anchor-click` steps depend on.
            Four panels leave the hole genuinely empty.
          */}
          <div className="tour-dim" style={{ top: 0, left: 0, right: 0, height: Math.max(0, rect.top) }} />
          <div className="tour-dim" style={{ top: rect.top + rect.height, left: 0, right: 0, bottom: 0 }} />
          <div className="tour-dim" style={{ top: rect.top, left: 0, width: Math.max(0, rect.left), height: rect.height }} />
          <div className="tour-dim" style={{ top: rect.top, left: rect.left + rect.width, right: 0, height: rect.height }} />
          <div className="tour-ring" style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }} />
        </>
      ) : (
        <div className="tour-dim tour-dim--full" />
      )}

      <div
        ref={bubbleRef}
        className={`tour-bubble${rect ? '' : ' tour-bubble--centered'}`}
        role="dialog"
        aria-modal="false"
        aria-label={title}
        style={rect ? bubblePosition(rect, bubbleSize) : undefined}
      >
        {/*
          The bubble never takes focus — "never blocks" is the tour's first
          non-negotiable — so a step change is silent to a screen reader:
          nothing moves, and `aria-label` on the dialog is read at most once.
          A polite live region on the text that actually changes announces the
          new step without stealing anything.
        */}
        <div className="tour-bubble__step-live" aria-live="polite" aria-atomic="true">
          <p className="tour-bubble__step">
            {t('tour.progressChapter', { chapter: chapterTitle, current: position + 1, total: steps.length })}
          </p>
          <h2 className="tour-bubble__title">{title}</h2>
          <p className="tour-bubble__body">{body}</p>
        </div>
        {hotkeys.length ? (
          <ul className="tour-bubble__hotkeys">
            {hotkeys.map((hotkey) => (
              <li key={hotkey.id} className="tour-hotkey" data-tour-hotkey={hotkey.id}>
                {hotkey.keys ? (
                  <kbd>{hotkey.keys}</kbd>
                ) : (
                  <span className="tour-hotkey__unset">{t('tour.hotkey.unset')}</span>
                )}
                <span className="tour-hotkey__label">{hotkey.label}</span>
              </li>
            ))}
          </ul>
        ) : null}
        <div className="tour-bubble__actions">
          <button type="button" className="btn" onClick={() => finish(true)}>
            {t('tour.skip')}
          </button>
          <button type="button" className="btn" onClick={back} disabled={backDisabled}>
            {t('tour.back')}
          </button>
          <button type="button" className="btn primary" onClick={next}>
            {isLastOfChapter ? t('tour.chapterDone') : t('tour.next')}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Place the bubble beside the anchor: below, above, right or left — the first
 * side it fits on. An anchor that leaves no room on any side (a whole window, a
 * tall Settings card) gets the bubble inside its bottom-right corner. Always
 * clamped to the viewport so the bubble — and its Skip button — stays on screen.
 */
function bubblePosition(
  rect: Rect,
  measured: { width: number; height: number } | null,
): { top: number; left: number } {
  const width = measured?.width || 340;
  const height = measured?.height || 220;
  const GAP = 14;
  // Layout pixels, like `rect`: the window's own size divided by the #root zoom.
  const viewport = layoutViewport();
  const clampLeft = (left: number): number => Math.min(Math.max(GAP, left), Math.max(GAP, viewport.width - width - GAP));
  const clampTop = (top: number): number => Math.min(Math.max(GAP, top), Math.max(GAP, viewport.height - height - GAP));
  const centredX = rect.left + rect.width / 2 - width / 2;
  const centredY = rect.top + rect.height / 2 - height / 2;

  const below = rect.top + rect.height + GAP;
  if (below + height <= viewport.height - GAP) return { top: below, left: clampLeft(centredX) };
  const above = rect.top - height - GAP;
  if (above >= GAP) return { top: above, left: clampLeft(centredX) };
  const right = rect.left + rect.width + GAP;
  if (right + width <= viewport.width - GAP) return { top: clampTop(centredY), left: right };
  const left = rect.left - width - GAP;
  if (left >= GAP) return { top: clampTop(centredY), left };
  return {
    top: clampTop(rect.top + rect.height - height - GAP),
    left: clampLeft(rect.left + rect.width - width - GAP),
  };
}
