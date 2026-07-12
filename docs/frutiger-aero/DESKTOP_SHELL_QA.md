# Desktop Shell — QA & Verification (Phase 2)

## Executive summary

Phase 2 evolved the single existing `DesktopShell` into a cohesive OS shell that
becomes the Frutiger Aero OS under the secret theme, and filled the missing OS
subsystems (Notification Center, Quick Settings, desktop context menu, wallpaper fit
modes, audio routing, soft-reboot) — **entirely on the Phase 1 platform**, with the
Aero look **scoped to `data-materials='aero'`** so the default shell is unchanged.
Delivered as 11 small, verified commits (`feat(phase2): M0…M17`) that stage only
platform hunks, leaving the concurrent Lockscreen work untouched.

## Milestones completed

M0 plan · M1 Aero glass shell · M2 window motion · M3 taskbar tray · M4 Start menu ·
M5 search entry points · M6 Notification Center + store · M7 Quick Settings · M8
widgets (verified) · M9 desktop context menu · M10 wallpaper fit · M11 audio routing
· M12 persistence · M13 accessibility · M14 performance · M15 soft-reboot · M16
future-compat hooks · M17 docs + QA.

## Features implemented

- **Aero glass shell** (scoped): taskbar, start menu, windows, tray/running-window
  chips, desktop-icon labels, widget frames, flyouts — glass, sheen, reflections.
- **Notification Center**: persistent store capturing `os:toast`/`ui:toast`, bell +
  unread badge, DND, dismiss/clear-all, focus-managed glass flyout.
- **Quick Settings**: theme, performance tier, volume/mute, reduce-motion, wallpaper
  fit, wallpaper/accessibility shortcuts — reusing Phase 1 APIs.
- **Desktop context menu** (reuses `ui/ContextMenu`): new note/shortcut, widgets,
  personalize, display settings.
- **Start menu**: search field + footer (Settings/Quick/Power) + opening animation.
- **Search entry points**: Start + taskbar → the existing universal palette.
- **Wallpaper fit modes** (cover/contain/fill/center) via `--wall-fit`.
- **Shell audio routing** (silent no-op until a pack loads).
- **Secret-Mode soft-reboot** splash + **extension-layer registry**.

## Files modified / added

- New modules: `theme/aero-shell.css`; `components/shell/{NotificationCenter,
  NotificationBell,QuickSettings,AeroBootOverlay,DesktopLayerHost}.tsx` +
  `components/shell/shell.css`; `notificationStore.ts`, `shellSounds.ts`,
  `wallpaperFit.ts`, `shellExtensions.ts`; the 8 shell docs + this QA.
- Evolved (mine): `components/DesktopShell.tsx` (tray buttons, Start search/footer,
  context menu, panel/overlay/layer mounts), `theme/SecretAeroTrigger.tsx`
  (soft-reboot), `theme/{a11y,perf}.css` (shell surfaces), `main.tsx` (boots/imports).
- **Untouched**: `styles.css`, `App.tsx`, `main.ts`, `preload.ts` and the Lockscreen
  files (concurrent work) — nothing of theirs was staged.

## Architecture decisions

1. **Aero-only glass, scoped** to `[data-materials='aero']` — default shell = zero
   regressions; the transformation "switches through the Theme Engine".
2. **Reuse over rebuild** — `FloatingWindow` (drag invariant), the widget framework,
   the persistence round-trip, `CommandPalette`, `BootScreen`, and all `ui/*`.
3. **Self-contained panels** in `components/shell/`, toggled by `shell:*` events,
   composed from `ui/*`.
4. **One shell** — no per-theme shell; Aero is CSS over the same tree.

## Performance observations

- New glass reuses the surfaces `perf.css` targets, so **Battery Saver** drops the
  blur on `.os-flyout/.os-taskbar/.os-start/.fwin/.widget-frame` (added this pass).
- Window/Start motion is opacity/scale only and collapses under reduced motion /
  battery; the clock stays isolated; the drag invariant avoids per-frame React work.
- Verification is by Vite transform (tsc is unusable in this repo); **17/17 shell
  modules transform clean (200)**.

## Accessibility audit

- Focus: global `:focus-visible` ring on all new buttons; Notification Center +
  Quick Settings move focus into the panel on open; context menu has arrow-key nav +
  Escape + click-outside (ui/ContextMenu).
- ARIA: `role="dialog"` + `aria-label` on flyouts; the bell announces unread count;
  tray/Start buttons have labels.
- High contrast: `.os-flyout` forced opaque (a11y.css); the Aero shell surfaces don't
  apply under the high-contrast theme (different theme, no `data-materials`).
- Reduced motion + large text: honoured via the Phase 1 global rules + rem tokens.

## Bugs fixed

None of significance — per-milestone Vite verification kept the tree green. (Tooling
note: an exact-match edit tripped on an emoji literal in `SecretAeroTrigger`; re-anchored, no code impact.)

## Known limitations

- **Base `styles.css` literal cleanup deferred** (accent-red `rgba(255,46,77)`, toast
  `#4ade80`, Start-icon tone accents). Aero is unaffected (scoped); the other 12
  themes still show a little baked red in a few shell spots. Deferred to avoid
  hunk-staging against the concurrent Lockscreen edits to `styles.css`.
- **Recent searches + extra palette content sources** not added (left the large
  `CommandPalette` untouched).
- **Base-wallpaper crossfade** not added (single-buffered; the living-layer rotation
  already crossfades).
- **Quick Settings tiles** open the full Settings window (no deep-link to a page).
- **Window close/minimize sounds** not routed (no global events; needs shell emit
  points).
- **Visual confirmation pending in Electron** — the Aero glass shell + soft-reboot
  can't be driven headlessly here; confirmed structurally + by CSS cascade.

## Regression checklist

- [ ] Default (non-Aero) shell looks/behaves exactly as before (Aero rules are
  `[data-materials='aero']`-scoped).
- [ ] Window drag/resize/snap smooth; layout still persists + restores.
- [ ] Existing tray items (widgets/clipboard/settings/clock) unchanged.
- [ ] Start app drag-to-desktop + pin still work.
- [ ] Toasts still appear (and now also land in the Notification Center).
- [ ] Activate Aero (double-click corner / type "aero") → soft-reboot → glass OS;
  toggle back restores the prior theme.
- [ ] No `session.clearStorageData` reintroduced.

## Future work (Phase 3)

Living wallpapers, particle engine, weather, companions/desktop pets, outside-app
overlays, application transformation, and the Anime Edition — all have extension
hooks (`DesktopLayer` registry, `assetPack`, `materialSet`, `data-perf`, the existing
environment seams) and need no shell rearchitecture. Plus the deferred cleanups above.
