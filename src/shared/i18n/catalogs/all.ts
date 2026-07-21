// Every catalog, statically. **Tooling and tests only.**
//
// Importing this pulls all four languages into whatever bundle references it,
// which is exactly the 698 KB problem the split was done to fix. App code must
// import `../catalogs` (the loader) instead — `src/shared/__tests__/i18nSplit.test.ts`
// enforces that and will fail if anything under src/main or src/renderer
// reaches for this module.
//
// Legitimate consumers:
//   - tools/i18n-check.cjs — compares key sets across languages
//   - src/shared/__tests__/i18n.test.ts — catalog hygiene gate

import type { Catalog, UiLang } from '../core';
import { en } from './en';
import { ja } from './ja';
import { ru } from './ru';
import { zh } from './zh';

export const CATALOGS: Record<UiLang, Catalog> = { en, ja, zh, ru };

export { en, ja, zh, ru };
