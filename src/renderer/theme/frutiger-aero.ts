/**
 * Frutiger Aero — hidden theme registration (Phase 1 · M3).
 *
 * Registers the secret Aero theme with the engine. It is `hidden: true`, so it
 * never appears in the theme picker (THEMES excludes hidden); the only ways in
 * are the secret activator (corner button / typing "aero") — see
 * SecretAeroTrigger.tsx. The palette lives in ./frutiger-aero.css.
 */

import { registerTheme, type Theme } from './engine';
import { AERO_PROOF_SOUND_PACK_ID } from '../audio/aeroProofPack';

export const AERO_THEME_ID = 'frutiger-aero';

export const FRUTIGER_AERO_THEME: Theme = {
  id: AERO_THEME_ID,
  label: 'Frutiger Aero',
  kind: 'aero',
  hidden: true,
  light: true,
  version: 1,
  materialSet: 'aero',
  assetPack: { id: 'frutiger-aero-assets', sounds: AERO_PROOF_SOUND_PACK_ID },
  swatch: { bg: '#bfe6ff', text: '#123a52', border: '#a9d4ef' },
};

let registered = false;

/** Idempotently register the Aero theme. Call before bootTheme() in main.tsx. */
export function registerFrutigerAero(): void {
  if (registered) return;
  registerTheme(FRUTIGER_AERO_THEME);
  registered = true;
}
