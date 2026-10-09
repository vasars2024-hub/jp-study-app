/**
 * Review-sitting preferences that are not scheduling: whether the answer timer
 * is shown, and whether a card's audio plays by itself when the answer is
 * revealed. Kept apart from the scheduling setting so changing how a sitting
 * looks can never touch how cards are scheduled.
 */
import { useEffect, useState } from 'react';
import { writeLocalStorageJson } from './localStorageWrite';

export interface ReviewSessionPrefs {
  /** Show the seconds spent on the card on screen. */
  showTimer: boolean;
  /** Play the card's audio when the answer side is revealed. */
  autoplayOnReveal: boolean;
}

export const REVIEW_SESSION_PREFS_KEY = 'jp-review-session-prefs-v1';
const CHANGED_EVENT = 'jp-review-session-prefs-changed';

/**
 * Both off, as in Anki: answer times are recorded either way (Statistics reads
 * them), the visible clock is for people who want the pressure.
 */
export const DEFAULT_REVIEW_SESSION_PREFS: ReviewSessionPrefs = {
  showTimer: false,
  autoplayOnReveal: false,
};

export function normalizeReviewSessionPrefs(value: unknown): ReviewSessionPrefs {
  const raw = value && typeof value === 'object' ? (value as Partial<ReviewSessionPrefs>) : {};
  return {
    showTimer: raw.showTimer === true,
    autoplayOnReveal: raw.autoplayOnReveal === true,
  };
}

export function loadReviewSessionPrefs(): ReviewSessionPrefs {
  try {
    return normalizeReviewSessionPrefs(JSON.parse(localStorage.getItem(REVIEW_SESSION_PREFS_KEY) ?? 'null'));
  } catch {
    return DEFAULT_REVIEW_SESSION_PREFS;
  }
}

export function saveReviewSessionPrefs(next: Partial<ReviewSessionPrefs>): ReviewSessionPrefs {
  const merged = normalizeReviewSessionPrefs({ ...loadReviewSessionPrefs(), ...next });
  writeLocalStorageJson(REVIEW_SESSION_PREFS_KEY, merged);
  try {
    window.dispatchEvent(new CustomEvent(CHANGED_EVENT));
  } catch {
    /* non-browser context */
  }
  return merged;
}

/** The current preferences, kept in step with the settings panel. */
export function useReviewSessionPrefs(): ReviewSessionPrefs {
  const [prefs, setPrefs] = useState(loadReviewSessionPrefs);
  useEffect(() => {
    const refresh = (): void => setPrefs(loadReviewSessionPrefs());
    window.addEventListener(CHANGED_EVENT, refresh);
    return () => window.removeEventListener(CHANGED_EVENT, refresh);
  }, []);
  return prefs;
}
