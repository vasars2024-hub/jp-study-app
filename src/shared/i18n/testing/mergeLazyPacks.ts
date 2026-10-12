// Vitest setup (vitest.config.ts `setupFiles`): every lazy i18n pack, merged
// into every language's catalog before a test file runs.
//
// In the app the AI strings arrive by dynamic import the first time something
// needs them (`../catalogs.ts`, "Lazily merged packs"), and until then `t()`
// shows a placeholder. A component test is about the component, not that
// chunk's timing, so the suite starts from the state a running app reaches
// moments after AI is on: the strings are in. The lazy path itself is tested on
// a fresh module graph (`src/shared/__tests__/i18nLazyPacks.test.ts`), where
// this setup's merge does not apply.
//
// Merged into the per-language modules directly as well as registered with the
// loader, because many tests read `ja`/`zh`/`ru` straight from
// `../catalogs/<lang>` without going through `ensureCatalog`.

import type { Catalog, UiLang } from '../core';
import { registerI18nPack, type I18nPackId } from '../catalogs';
import { en } from '../catalogs/en';
import { ja } from '../catalogs/ja';
import { ru } from '../catalogs/ru';
import { zh } from '../catalogs/zh';
import { AI_PACK_EN } from '../aiPack/en';
import { AI_PACK_JA } from '../aiPack/ja';
import { AI_PACK_RU } from '../aiPack/ru';
import { AI_PACK_ZH } from '../aiPack/zh';
import { PASS6_PACK_EN } from '../pass6Pack/en';
import { PASS6_PACK_JA } from '../pass6Pack/ja';
import { PASS6_PACK_RU } from '../pass6Pack/ru';
import { PASS6_PACK_ZH } from '../pass6Pack/zh';

const PACKS: Array<[I18nPackId, UiLang, Catalog, Catalog]> = [
  ['ai', 'en', en, AI_PACK_EN],
  ['ai', 'ja', ja, AI_PACK_JA],
  ['ai', 'zh', zh, AI_PACK_ZH],
  ['ai', 'ru', ru, AI_PACK_RU],
  ['pass6', 'en', en, PASS6_PACK_EN],
  ['pass6', 'ja', ja, PASS6_PACK_JA],
  ['pass6', 'zh', zh, PASS6_PACK_ZH],
  ['pass6', 'ru', ru, PASS6_PACK_RU],
];

for (const [id, lang, catalog, pack] of PACKS) {
  for (const [key, value] of Object.entries(pack)) {
    if (catalog[key] === undefined) catalog[key] = value;
  }
  registerI18nPack(id, lang, pack);
}
