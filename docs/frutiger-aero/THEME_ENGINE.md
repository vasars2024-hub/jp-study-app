# Theme Engine

Authoritative module: `src/renderer/theme/engine.ts`.
Back-compat facade: `src/renderer/theme.ts` (preserves the original
`THEMES` / `applyTheme` / `bootTheme` / `loadThemeId` / `onThemeChanged` API).
React access: `src/renderer/theme/ThemeContext.tsx`.

## How a theme works

A theme is applied by stamping `data-theme="<id>"` on `<html>`. All styles read
CSS variables, so switching the attribute restyles the whole app instantly. The
default theme (`study-os`) uses **no attribute** so the base `:root` wins.

`applyTheme(id)` is the single choke point: it stamps `data-theme`, applies the
theme's extended attributes (`data-materials` + any `dataAttrs`), persists the id
to `localStorage['jp-os-theme']`, and broadcasts `jp-theme-changed`.

## The `Theme` shape

```ts
interface Theme {
  id: string;
  label: string;
  kind: 'base' | 'aero' | 'anime' | 'custom';
  hidden?: boolean;          // excluded from the picker (e.g. secret Aero)
  light: boolean;            // light vs dark base
  swatch: { bg; text; border };
  version: number;           // bump to trigger future per-theme migrations
  materialSet?: string;      // → data-materials="<id>" while active
  assetPack?: AssetPackRef;  // { icons?, wallpapers?, sounds? } — see below
  dataAttrs?: Record<string,string>; // extra data-* while active
}
```

## Registry API

```ts
registerTheme(theme: Theme): void          // add/replace a theme
getTheme(id): Theme | undefined
isThemeRegistered(id): boolean
listThemes({ includeHidden? }): Theme[]    // hidden excluded by default
loadThemeId(): string                       // persisted id, validated
applyTheme(id) / setTheme(id): void         // apply + persist + broadcast
applyThemeAttributes(id): void              // (re)stamp data-materials/dataAttrs
onThemeChanged(cb): () => void
bootThemeEngine(): void                      // called via bootTheme() in main.tsx
```

The 13 built-in themes live in `BASE_THEMES` inside the engine. `theme.ts` derives
the legacy `THEMES` array (visible themes, legacy shape) from `listThemes()`.

## Adding a theme

```ts
// my-theme.css
:root[data-theme='sunset'] { --bg:#…; --panel:#…; --accent:#…; /* … */ }

// my-theme.ts
import { registerTheme } from './engine';
registerTheme({ id:'sunset', label:'Sunset', kind:'custom', version:1,
                light:false, swatch:{bg:'#…',text:'#…',border:'#…'} });
```

Import the CSS in `main.tsx` (after `styles.css`) and call the register before
`bootTheme()`. A non-hidden theme automatically appears in the picker.

## Hidden themes & the secret Frutiger Aero

`frutiger-aero.ts` registers the Aero theme with `hidden: true` and
`materialSet: 'aero'`, so it never appears in the picker. The only ways in are
the secret activator (`theme/SecretAeroTrigger.tsx`): **double-click the
bottom-right corner**, or **type "aero"** outside a text field. Toggling ON
remembers the prior theme and restores it on toggle OFF. Registration happens
before `bootTheme()` so a persisted Aero selection re-applies on launch.

## Materials binding

A theme's `materialSet` is stamped as `data-materials="<id>"`. The material
utilities (`materials.css`) read this to enhance themselves — e.g.
`:root[data-materials='aero'] .mat-glass` pushes saturation/brightness.

## Asset packs (Anime Edition extension point)

`theme/assetPacks.ts` resolves the active theme's `assetPack` on every theme
change (`installAssetPackSync()` in `main.tsx`):

- `sounds` → `soundEngine.setActivePack(id)` (**wired**).
- `icons` / `wallpapers` → stored (`getActiveIconPack()` / `getActiveWallpaperPack()`)
  as hooks the icon set + wallpaper framework consume in later phases.

So a future **Anime Edition** is just a theme with an `assetPack` (+ its palette
CSS): layout, components, spacing, motion, and behaviour stay identical.

## Versioning

`THEME_ENGINE_VERSION` + `runThemeMigrations()` record a version marker
(`localStorage['jp-os-theme-engine-v']`) at boot; future engine changes can remap
stored ids/prefs there. Each `Theme.version` enables per-theme migrations later.

## React usage

```tsx
import { ThemeProvider, useTheme } from '../theme/ThemeContext';
// wrap once: <ThemeProvider><App/></ThemeProvider>
const { themeId, theme, themes, setTheme } = useTheme();
```

`ThemeProvider` subscribes to `jp-theme-changed`, so consumers re-render on any
switch regardless of who triggered it. Adoption is optional; existing features are
unaffected.
