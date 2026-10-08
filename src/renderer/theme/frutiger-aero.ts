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
import { AERO_ICON_PACK_ID, registerAeroIconPack } from './aeroIconPack';

export const AERO_THEME_ID = 'frutiger-aero';

export const FRUTIGER_AERO_THEME: Theme = {
  id: AERO_THEME_ID,
  label: 'Frutiger Aero',
  kind: 'aero',
  hidden: true,
  light: true,
  version: 1,
  materialSet: 'aero',
  assetPack: {
    id: 'frutiger-aero-assets',
    sounds: AERO_PROOF_SOUND_PACK_ID,
    icons: AERO_ICON_PACK_ID,
  },
  // The real palette (frutiger-aero.css): --bg, --text, --border.
  swatch: { bg: '#9ed8f2', text: '#123143', border: '#90afba' },
};

let registered = false;

/** Idempotently register the Aero theme. Call before bootTheme() in main.tsx. */
export function registerFrutigerAero(): void {
  if (registered) return;
  // The icon pack must exist before the theme that names it, or the first
  // applyAssetPack() would resolve `icons` to null and fall back to line glyphs.
  registerAeroIconPack();
  registerTheme(FRUTIGER_AERO_THEME);
  registered = true;
}
