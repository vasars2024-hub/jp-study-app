// Pass 6 strings — Soundscape (snd6.), widgets (wid6.) and shortcuts (kbd6.) —
// as one lazy i18n pack (`../catalogs.ts`, "Lazily merged packs"). Lazy because
// the English catalog is static in every window, Blanc included, and Blanc
// shows none of these; Study OS loads the pack before its first render (main.tsx).

import type { Catalog } from '../core';
import { PRODUCT6_UI_JA } from '../product6Ui/ja';
import { KBD6_UI_JA } from '../kbd6Ui/ja';

export const PASS6_PACK_JA: Catalog = { ...PRODUCT6_UI_JA, ...KBD6_UI_JA };
