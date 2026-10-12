// Every catalog, statically, with the lazy packs merged in. **Tooling and tests only.**
//
// Importing this pulls all four languages into whatever bundle references it,
// which is exactly the 698 KB problem the split was done to fix. App code must
// import `../catalogs` (the loader) instead — `src/shared/__tests__/i18nSplit.test.ts`
// enforces that and will fail if anything under src/main or src/renderer
// reaches for this module.
//
// The lazy packs (`../aiPack`) are merged in here the way the loader merges
// them at runtime (in place, an eager key wins), so the key checks see every
// string the app can show. Only tooling and tests load this module, and the
// vitest setup (`../testing/mergeLazyPacks.ts`) has already done the same merge.
//
// Legitimate consumers:
//   - tools/i18n-check.cjs — compares key sets across languages
//   - src/shared/__tests__/i18n.test.ts — catalog hygiene gate

import type { Catalog, UiLang } from '../core';
import { AI_PACK_EN } from '../aiPack/en';
import { AI_PACK_JA } from '../aiPack/ja';
import { AI_PACK_RU } from '../aiPack/ru';
import { AI_PACK_ZH } from '../aiPack/zh';
import { en } from './en';
import { ja } from './ja';
import { ru } from './ru';
import { zh } from './zh';

function mergePack(into: Catalog, pack: Catalog): void {
  for (const [key, value] of Object.entries(pack)) {
    if (into[key] === undefined) into[key] = value;
  }
}

mergePack(en, AI_PACK_EN);
mergePack(ja, AI_PACK_JA);
mergePack(zh, AI_PACK_ZH);
mergePack(ru, AI_PACK_RU);

export const CATALOGS: Record<UiLang, Catalog> = { en, ja, zh, ru };

export { en, ja, zh, ru };
