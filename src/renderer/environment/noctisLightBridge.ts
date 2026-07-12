/**
 * Light Noctis bridge — intentional under-coupling.
 *
 * Noctis city engine / CityService are still under development (IPC stubs).
 * This module only:
 *  - forwards study-ish activity as DOM events (`noctis:pulse`) for future UI
 *  - nudges the Noctis *companion* via existing companion event bus
 *
 * It does NOT:
 *  - call city: IPC
 *  - mutate noctis-state.json
 *  - drive simulation, economy, or map systems
 */
import { READING_RECORDED_EVENT, type ReadingDelta } from '../stats';
import { loadEnvironment } from './environmentStore';

export const NOCTIS_PULSE_EVENT = 'noctis:pulse';

export type NoctisPulseKind = 'study' | 'flashcard' | 'streak' | 'achievement';

export interface NoctisPulse {
  kind: NoctisPulseKind;
  note?: string;
  at: number;
}

function pulse(kind: NoctisPulseKind, note?: string): void {
  const env = loadEnvironment();
  if (!env.enabled) return;

  const detail: NoctisPulse = { kind, note, at: Date.now() };
  try {
    window.dispatchEvent(new CustomEvent<NoctisPulse>(NOCTIS_PULSE_EVENT, { detail }));
  } catch {
    /* tests / non-browser */
  }

  // Intentionally no emitCompanionEvent here — CompanionLayer already handles
  // study/flashcard/streak via its own listeners (avoids double reactions).
  void env;
}

let started = false;

export function startNoctisLightBridge(): () => void {
  if (started) return () => undefined;
  started = true;

  const onReading = (ev: Event) => {
    const d = (ev as CustomEvent<ReadingDelta>).detail;
    pulse('study', d?.title);
  };
  const onCards = () => pulse('flashcard');
  const onCompanion = (ev: Event) => {
    const d = (ev as CustomEvent<{ kind?: string; note?: string }>).detail;
    if (d?.kind === 'streak') pulse('streak', d.note);
    if (d?.kind === 'achievement') pulse('achievement', d.note);
  };

  window.addEventListener(READING_RECORDED_EVENT, onReading);
  window.addEventListener('flashcard-deck-changed', onCards);
  window.addEventListener('env:companion', onCompanion);

  return () => {
    window.removeEventListener(READING_RECORDED_EVENT, onReading);
    window.removeEventListener('flashcard-deck-changed', onCards);
    window.removeEventListener('env:companion', onCompanion);
    started = false;
  };
}
