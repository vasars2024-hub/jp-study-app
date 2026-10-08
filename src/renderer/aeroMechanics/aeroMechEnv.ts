/**
 * Aero mechanics — what the rest of the app is doing right now.
 *
 * The interruption gates (balloon tips, the screensaver, the update notice)
 * all ask the same questions of the live document. They are read on demand,
 * on a slow timer, never per frame.
 */
import { isFocusMode } from '../focusMode';
import { prefersReducedMotion } from '../motion/motionPrefs';

const SESSION_ATTR = 'data-aero-mech-session';

export function isAeroMaterial(): boolean {
  return document.documentElement.getAttribute('data-materials') === 'aero';
}

export function isVideoPlaying(): boolean {
  for (const video of Array.from(document.querySelectorAll('video'))) {
    if (!video.paused && !video.ended && video.readyState > 2) return true;
  }
  return false;
}

export function isTyping(): boolean {
  const el = document.activeElement as HTMLElement | null;
  if (!el) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag !== 'INPUT') return false;
  const type = (el as HTMLInputElement).type;
  return !['checkbox', 'radio', 'button', 'submit', 'range', 'color', 'reset'].includes(type);
}

/** A flashcard review strip, or one of the Aero sessions, is on screen. */
export function isReviewing(): boolean {
  return !!document.querySelector(`[data-review-active="true"], [${SESSION_ATTR}="on"]`);
}

/** Lock screen, boot / sleep / shutdown overlays, focus mode. */
export function isSuspended(): boolean {
  const root = document.documentElement;
  const phase = root.dataset.secretLifecycle;
  if (phase && phase !== 'active') return true;
  if (document.querySelector('.lockscreen, .os-aero-boot')) return true;
  try {
    if (isFocusMode()) return true;
  } catch {
    /* focus store unavailable: not in focus mode */
  }
  return false;
}

export function isBatteryTier(): boolean {
  return document.documentElement.getAttribute('data-perf') === 'battery';
}

export function isSafeMode(): boolean {
  return document.documentElement.getAttribute('data-aero-safe-mode') === 'on';
}

/** Any of the user's "keep it still" requests. */
export function wantsStillness(): boolean {
  const root = document.documentElement;
  return (
    prefersReducedMotion()
    || root.classList.contains('reduce-motion')
    || root.getAttribute('data-display-anim') === 'none'
    || isBatteryTier()
    || isSafeMode()
  );
}

/** One gate for the non-screensaver interruptions. */
export function interruptionsBlocked(): boolean {
  return document.hidden || isSuspended() || isReviewing() || isVideoPlaying() || !!document.querySelector('.aero-mech-saver');
}

export const AERO_MECH_SESSION_ATTR = SESSION_ATTR;
