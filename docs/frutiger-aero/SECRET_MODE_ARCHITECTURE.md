# Secret Mode Architecture

How the Study OS becomes the Frutiger Aero OS — and why it's one shell, not two.

## The flow

```
Study OS  →  secret activation  →  soft reboot  →  Frutiger Aero shell  →  desktop
```

1. **Activation** (`theme/SecretAeroTrigger.tsx`, Phase 1) — a near-invisible
   bottom-right corner button (glint on hover, double-click) or typing **"aero"**
   outside a text field. Never listed in the theme picker (the theme is
   `hidden: true`). The prior theme is remembered for restore.
2. **Soft reboot** (`components/shell/AeroBootOverlay.tsx`, Phase 2 · M15) — the
   trigger dispatches `shell:softReboot`; a branded sky boot splash covers the
   screen; the theme switches **behind it** after ~240ms; the splash fades to reveal
   the glass OS. It feels like booting another OS. Reduced motion shortens it.
   Exiting Aero is instant.
3. **Aero shell** — the same `DesktopShell`, restyled by `theme/aero-shell.css`,
   scoped to `:root[data-materials='aero']`. The Aero theme sets
   `materialSet: 'aero'`, which the engine stamps as `data-materials="aero"`.

## Why one shell

Everything switches **through the Theme Engine** (Phase 1). The Aero look is pure CSS
(scoped material overrides) over the single shell — no duplicate shell, no forked
components. Turning Aero off removes the attribute and the default Study OS shell
returns unchanged. This keeps the two "operating systems" in perfect structural sync.

## Asset packs → future editions

A theme may declare `assetPack { icons?, wallpapers?, sounds? }`. On theme change,
`theme/assetPacks.ts` binds the sound pack (and resolves icon/wallpaper pack ids as
hooks). So a future **Anime Edition** is a theme + asset pack: same shell, same
layout/behaviour, swapped wallpapers/icons/companions/sounds. Nothing here forks the
shell.

## Extension seams (Phase 2 · M16)

`shellExtensions.ts` + `DesktopLayerHost` provide a typed `DesktopLayer` registry for
future full-bleed effects (particles/weather/overlays) that don't already have a
seam. Existing seams to reuse: living wallpapers (`environment/WallpaperStage` +
`EnvironmentStack`), companion toasts (`environment/BuddyToast`), and the transparent
desktop-pet window (`environment/CompanionHostView`). None are implemented in Phase 2.
