# Project Core Persona & Guidelines

## UI & Aesthetics (Fluent Design Upgrade)
- **Aesthetic**: Modern Windows 11 Fluent inspired. Sleek, minimal spacing, dark deep-red accent palette.
- **Strict Emoji Prohibition**: Remove ALL decorative emojis (e.g., ??, ??, ??, ??) across all menus, text blocks, popups, and dictionary settings. Use clean typography or standard minimalist vector icons.
- **Window Minimalism**: Remove large internal window titles like "Music Widget" or "Statistics" within the panels themselves. The bottom OS taskbar button states make identity context obvious.

## Code Architecture Limits
- **Scope**: Keep changes isolated strictly inside the `src/` directory. Do not alter root project configurations (forge.config, vite.*.config, tsconfig.json).
- **Safety**: Do not break the functional desktop shortcut grid, window dragging layer, or taskbar shell. Patch services directly beneath them.
- **Performance**: Heavy datasets (large media, dictionary indices) must process asynchronously in the main thread or use virtual scrolling to eliminate window-dragging lag.

## i18n workflow (EN/JA/ZH/RU)

The whole app is on a live translation system (`shared/i18n/core.ts` + `shared/i18n/catalogs.ts` + `renderer/i18n.ts`'s `useT()` hook) — every view and shell component is already converted. **Any new UI text must go through this system from the moment it's written**, so this never needs another full-app sweep:

1. Write the string as an English-only key in `src/shared/i18n/catalogs.ts` (`en` block), then call it with `t('your.new.key')` / `useT()` at the call site — never a raw string literal in JSX or in a status/error message built inside an event handler.
2. Run `node tools/i18n-check.cjs` (no build step needed) to see every English key that's missing a `ja`/`zh`/`ru` counterpart, printed with its English text ready to translate. Hand that output to an assistant and ask it to fill in the three translations directly in `catalogs.ts`, matching the style of neighboring entries — this is a short follow-up pass, not a rewrite. Re-run the script to confirm it's clean (exit code 0).
3. The `vitest` suite (`src/shared/__tests__/i18n.test.ts`, "catalog hygiene" block) enforces the same thing as a hard gate — a key present in `en` but missing from another language fails the test suite. Treat that failure as blocking, same as a type error.
4. Scope rule: only app **chrome** (labels, buttons, menus, empty states, status/error messages) is translated. Never translate study **content** — deck names, mined sentences, dictionary glosses, or data modules that live outside the component (novel/resource/category/preset lists, default seed values a user can rename). The UI-language selector and the study-language selector are deliberately independent settings.
5. Plural counts must use CLDR plural forms (`{ one, few, many, other }` for Russian; `{ other }` alone is fine for ja/zh, which don't inflect) — see any `*.count`/`*Count` key in `catalogs.ts` for the pattern. Never hand-roll `count === 1 ? 'x' : 'xs'`.
6. If a `useMemo`/`useCallback` calls `t()` and must react to a language switch, put `lang` (from `useT()`) in its dependency array — never `t` itself. `t`'s identity is stable by design, so depending on it silently goes stale after a language switch instead of erroring; this has bitten multiple past sessions and is the #1 review item for new i18n code.
7. Module-level data arrays (e.g. a widget registry, a settings-nav list) can't call `useT()` at declaration time — store an i18n *key* on each entry (`titleKey`/`descKey`, following the pattern in `renderer/widgets/registry.tsx` and `renderer/components/settings/settingsRegistry.ts`) and resolve it with `t()` at render time in the consumer, not at module-eval time.
