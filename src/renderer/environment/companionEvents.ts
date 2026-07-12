/** Lightweight bus for companion reactions (study / music / time). */

export type CompanionEventKind =
  | 'study'
  | 'music-play'
  | 'music-stop'
  | 'flashcard'
  | 'morning'
  | 'night'
  | 'tick'
  | 'streak'
  | 'achievement'
  | 'calendar';

export interface CompanionEventDetail {
  kind: CompanionEventKind;
  note?: string;
}

export const COMPANION_EVENT = 'env:companion';

export function emitCompanionEvent(kind: CompanionEventKind, note?: string): void {
  window.dispatchEvent(
    new CustomEvent<CompanionEventDetail>(COMPANION_EVENT, { detail: { kind, note } }),
  );
}

export function onCompanionEvent(cb: (e: CompanionEventDetail) => void): () => void {
  const handler = (ev: Event): void => {
    const d = (ev as CustomEvent<CompanionEventDetail>).detail;
    if (d?.kind) cb(d);
  };
  window.addEventListener(COMPANION_EVENT, handler);
  return () => window.removeEventListener(COMPANION_EVENT, handler);
}
