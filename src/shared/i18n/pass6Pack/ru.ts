// Pass 6 strings — Soundscape (snd6.), widgets (wid6.) and shortcuts (kbd6.) —
// as one lazy i18n pack (`../catalogs.ts`, "Lazily merged packs"). Lazy because
// the English catalog is static in every window, Blanc included, and Blanc
// shows none of these; Study OS loads the pack before its first render (main.tsx).

import type { Catalog } from '../core';
import { PRODUCT6_UI_RU } from '../product6Ui/ru';
import { KBD6_UI_RU } from '../kbd6Ui/ru';

export const PASS6_PACK_RU: Catalog = { ...PRODUCT6_UI_RU, ...KBD6_UI_RU };
