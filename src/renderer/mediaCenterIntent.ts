/**
 * "Take the user to this place in the Media Center" — from anywhere in the window.
 *
 * The Media Center is the one media library (2026-09-23): the player workspace no longer
 * carries its own Library, Readiness or Review panes, so the hand-offs that used to open
 * those panes (a readiness row's "Review this file", the desktop Continue-watching widget, a
 * bare "open the media workspace") now land here instead. The Media Center may not be
 * mounted when the request is made, so the intent is parked until it mounts and takes it.
 */
import type { StudyReviewFocusRequest } from '../shared/mediaWorkspace';

export type MediaCenterIntent =
  | { tab: 'review'; focus?: StudyReviewFocusRequest }
  | { tab: 'library' }
  | { tab: 'home' };

const INTENT_EVENT = 'media-center:intent';
let pending: MediaCenterIntent | null = null;

/** Park the intent and bring the Media Center forward (the `player` section is its window). */
export function requestMediaCenter(intent: MediaCenterIntent): void {
  pending = intent;
  window.dispatchEvent(new CustomEvent(INTENT_EVENT));
  window.dispatchEvent(new CustomEvent('os:open', { detail: 'player' }));
}

/** The parked intent, once: a Media Center that mounts later still gets it. */
export function takeMediaCenterIntent(): MediaCenterIntent | null {
  const next = pending;
  pending = null;
  return next;
}

/** Called for every new intent while a Media Center is mounted. Returns an unsubscribe fn. */
export function onMediaCenterIntent(listener: () => void): () => void {
  window.addEventListener(INTENT_EVENT, listener);
  return () => window.removeEventListener(INTENT_EVENT, listener);
}
