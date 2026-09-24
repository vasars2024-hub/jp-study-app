/**
 * First-boot guided tour overlay. Phase 9.5 / audit `T1`.
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
 *   models installed.
 * - **Motion Mode: Disabled** removes the transition, per the plan and
 *   `prefersReducedMotion()`.
 *
 * No audio. The plan's beep-speech step depends on the Phase 4 companion voice
 * profile and carries a Chromium autoplay constraint (no AudioContext before a
 * user gesture); wiring sound to a bubble that appears *before* any click is the
 * documented way to get a silently muted voice that "randomly" works. Text-first
 * is the honest subset — the tour is useful now, and the voice can be added to
 * the same step list later without changing its shape.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { TOUR_STEPS, settingsPageNameKey } from '../../../shared/onboarding/tourScript';
import { openSectionSurface } from '../../sectionSurface';
import { prefersReducedMotion } from '../../motion/motionPrefs';
import {
  announceTourStarted,
  loadOnboarding,
  markTourComplete,
  onTourArmChanged,
  rememberStep,
  shouldRunTour,
} from '../../onboardingStore';
import { useT } from '../../i18n';
import { TELEMETRY_CONSENT_DECIDED_EVENT, telemetryConsentPending } from '../../../shared/stats';
import './onboarding.css';

/** Padding around the spotlit element so the hole does not clip its own border. */
const SPOTLIGHT_PAD = 6;

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

function measure(selector: string | null): Rect | null {
  if (!selector) return null;
  const element = document.querySelector(selector);
  if (!element) return null;
  const box = element.getBoundingClientRect();
  // A zero-area element is present in the DOM but not on screen (collapsed rail,
  // hidden taskbar). Treat it as absent so the step centres instead of drawing a
  // spotlight the user cannot see.
  if (box.width < 1 || box.height < 1) return null;
  return {
    top: box.top - SPOTLIGHT_PAD,
    left: box.left - SPOTLIGHT_PAD,
    width: box.width + SPOTLIGHT_PAD * 2,
    height: box.height + SPOTLIGHT_PAD * 2,
  };
}

/**
 * Where a re-opened tour picks up.
 *
 * `lastStepId` has been persisted on every advance since the store was written, and until
 * audit 6.1 nothing read it — the tour recorded where the user got to and then restarted from
 * the beginning anyway. An unknown id (a step renamed or dropped since the value was stored)
 * resolves to the start rather than to nothing, because the failure that matters here is the
 * one the store's own comment names: never showing the tour at all.
 */
function resumeIndex(): number {
  const { lastStepId } = loadOnboarding();
  if (!lastStepId) return 0;
  const found = TOUR_STEPS.findIndex((entry) => entry.id === lastStepId);
  return found > 0 ? found : 0;
}

export default function TourOverlay() {
  const { t } = useT();
  // On a first boot the consent card is also up; the tour opening over it hid the
  // card's text behind the bubble. Wait for the card's answer, then start.
  const [active, setActive] = useState(() => shouldRunTour() && !telemetryConsentPending());
  const [index, setIndex] = useState(resumeIndex);
  const [rect, setRect] = useState<Rect | null>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);

  const step = TOUR_STEPS[index];
  const isLast = index === TOUR_STEPS.length - 1;

  const finish = useCallback(() => {
    markTourComplete();
    setActive(false);
  }, []);

  const next = useCallback(() => {
    setIndex((current) => {
      if (current >= TOUR_STEPS.length - 1) return current;
      const advanced = current + 1;
      rememberStep(TOUR_STEPS[advanced].id);
      return advanced;
    });
  }, []);

  /**
   * The reverse of Next, and the reason it had to exist: Esc is an exit, not an
   * undo — it calls `markTourComplete`, so one accidental Next could only be
   * recovered by finishing the tour and replaying it from Settings. `Back`
   * persists the step it lands on, exactly as `next` does, so a tour left
   * mid-way resumes where the user actually is rather than where they were
   * before they stepped back.
   */
  const back = useCallback(() => {
    setIndex((current) => {
      if (current <= 0) return current;
      const previous = current - 1;
      rememberStep(TOUR_STEPS[previous].id);
      return previous;
    });
  }, []);

  /**
   * Settings → Help → Replay re-arms the store from another component — and,
   * when Settings is popped out, from another window. Re-read rather than
   * assume: `shouldRunTour()` is the same predicate the initial state used, so
   * a replay and a first boot enter through one door.
   */
  useEffect(
    () =>
      onTourArmChanged(() => {
        if (!shouldRunTour()) return;
        setIndex(resumeIndex());
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
      setIndex(resumeIndex());
      setActive(true);
    };
    window.addEventListener(TELEMETRY_CONSENT_DECIDED_EVENT, onConsentDecided);
    return () => window.removeEventListener(TELEMETRY_CONSENT_DECIDED_EVENT, onConsentDecided);
  }, []);

  // Esc must work from any step, so it is bound at the window rather than on the
  // bubble — the bubble may not hold focus if the user clicked into the app.
  useEffect(() => {
    if (!active) return undefined;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        finish();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [active, finish]);

  /**
   * Re-measure on anything that can move the anchor. `useLayoutEffect` so the
   * spotlight is positioned before paint — measuring in `useEffect` shows one
   * frame of the hole in its previous place on every step change.
   */
  useLayoutEffect(() => {
    if (!active || !step) return undefined;
    const update = (): void => setRect(measure(step.anchor));
    update();
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
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
      observer?.disconnect();
    };
  }, [active, step]);

  // A step that advances on clicking its anchor still needs Next to work, so
  // this listens rather than intercepts — the click reaches the real control.
  useEffect(() => {
    if (!active || !step || step.advance !== 'anchor-click' || !step.anchor) return undefined;
    const target = document.querySelector(step.anchor);
    if (!target) return undefined;
    const onClick = (): void => next();
    target.addEventListener('click', onClick);
    return () => target.removeEventListener('click', onClick);
  }, [active, step, next]);

  if (!active || !step) return null;

  const reduced = prefersReducedMotion();
  const title = t(step.titleKey);
  // Page names come from the Settings sidebar's own labels, in the UI language.
  const pageNames: Record<string, string> = {};
  for (const [slot, page] of Object.entries(step.settingsPages ?? {})) pageNames[slot] = t(settingsPageNameKey(page));
  const body = t(step.bodyKey, pageNames);
  const destination = step.destination;
  // The fewest-steps route to what the step describes. The tour ends (it stays
  // replayable from Settings > Help) so it does not sit over the page it opened.
  const takeMeThere = destination
    ? () => {
        finish();
        openSectionSurface('settings');
        window.setTimeout(() => {
          window.dispatchEvent(
            new CustomEvent('settings:navigate', {
              detail: { page: destination.page, settingId: destination.settingId },
            }),
          );
        }, 80);
      }
    : null;

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
        style={rect ? bubblePosition(rect) : undefined}
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
            {t('tour.progress', { current: index + 1, total: TOUR_STEPS.length })}
          </p>
          <h2 className="tour-bubble__title">{title}</h2>
          <p className="tour-bubble__body">{body}</p>
        </div>
        {step.hotkey ? (
          <p className="tour-bubble__hotkey">
            <kbd>{step.hotkey}</kbd>
          </p>
        ) : null}
        <div className="tour-bubble__actions">
          <button type="button" className="btn" onClick={finish}>
            {t('tour.skip')}
          </button>
          {takeMeThere ? (
            <button type="button" className="btn" onClick={takeMeThere}>
              {t('tour.takeMeThere')}
            </button>
          ) : null}
          <button type="button" className="btn" onClick={back} disabled={index === 0}>
            {t('tour.back')}
          </button>
          <button type="button" className="btn primary" onClick={isLast ? finish : next}>
            {isLast ? t('tour.done') : t('tour.next')}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Place the bubble below the anchor, or above it when there is no room. Clamped
 * to the viewport so a spotlight near an edge cannot push the bubble — and its
 * Skip button — off screen.
 */
function bubblePosition(rect: Rect): { top: number; left: number } {
  const BUBBLE_W = 340;
  const BUBBLE_H = 210;
  const GAP = 14;
  const below = rect.top + rect.height + GAP;
  const fitsBelow = below + BUBBLE_H < window.innerHeight;
  const top = fitsBelow ? below : Math.max(GAP, rect.top - BUBBLE_H - GAP);
  const left = Math.min(
    Math.max(GAP, rect.left + rect.width / 2 - BUBBLE_W / 2),
    Math.max(GAP, window.innerWidth - BUBBLE_W - GAP),
  );
  return { top, left };
}
