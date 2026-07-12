# Phase 2 — Desktop Shell & OS Experience · Implementation Plan

Builds on the Phase 1 platform (`docs/frutiger-aero/`). Goal: when the secret
Frutiger Aero theme is active, the desktop **feels like booting into another OS** —
and the genuinely-missing OS subsystems (Notification Center, Quick Settings,
desktop context menu, wallpaper fit modes, audio routing, soft-reboot) are filled.

## Guiding principles

- **One shell, reused.** `components/DesktopShell.tsx` is mounted once and already
  provides the window manager, taskbar, start menu, desktop icons, sticky notes,
  the 24-widget framework, search (`CommandPalette`), and echo-safe persistence
  (`src/main/desktop.ts`). Phase 2 **evolves** it — no rebuild, no second shell.
- **Aero-only glass, scoped.** All new glass/reflection styling is scoped to
  `:root[data-materials='aero'] …` (the secret theme stamps `data-materials="aero"`).
  The default Study OS shell is unchanged — no regressions.
- **Consume Phase 1.** Everything uses the theme engine, tokens, materials, motion,
  `components/ui/*`, and the wallpaper/audio/perf/a11y frameworks. No duplicated
  styling, no bypassing the theme engine.
- **Reuse invariants.** `FloatingWindow` drag/resize/snap (write style during
  gesture, commit once on pointerup) is untouched. Never reintroduce a blanket
  `session.clearStorageData` (see the storage-wipe root cause).
- **New code is contained** in `theme/aero-shell.css` + `components/shell/` + small
  stores/helpers.
- **Small commits, verify each.** Vite 200 per module (tsc is unusable here);
  browser DOM/computed-style checks for the Aero restyle; manual Electron check for
  the "boots into another OS" feel.

## Milestones

| # | Milestone | Status |
|---|---|---|
| M0 | Plan doc & `components/shell/` conventions | ✅ |
| M1 | Aero shell materials (glass taskbar/start/windows) + tokenize literals | ⬜ |
| M2 | Window manager motion (reuse FloatingWindow) | ⬜ |
| M3 | Taskbar (tray: Quick Settings + Notification bell) | ⬜ |
| M4 | Start menu (glass, opening anim, in-Start search, shortcuts) | ⬜ |
| M5 | Global search (extend CommandPalette + recent searches) | ⬜ |
| M6 | Notification Center + persistent store | ⬜ |
| M7 | Quick Settings flyout | ⬜ |
| M8 | Widget framework (verify + Aero glass + doc) | ⬜ |
| M9 | Desktop right-click context menu | ⬜ |
| M10 | Wallpaper fit modes + base-layer transition | ⬜ |
| M11 | Audio event routing (`shellSounds.ts`) | ⬜ |
| M12 | Persistence for new state | ⬜ |
| M13 | Accessibility pass | ⬜ |
| M14 | Performance pass | ⬜ |
| M15 | Secret Mode soft-reboot | ⬜ |
| M16 | Future-compat hooks | ⬜ |
| M17 | Docs (8) + QA audit | ⬜ |

## `components/shell/` conventions

- New shell subsystems that aren't part of the core `DesktopShell` render loop
  live in `src/renderer/components/shell/` (NotificationCenter, QuickSettings,
  DesktopContextMenu). They are composed from `components/ui/*` primitives and are
  mounted by `DesktopShell.tsx` (panels) or `App.tsx` (global).
- Panels anchor bottom-right using the existing `.os-start` flyout pattern
  (backdrop + fixed panel) and use glass materials.
- Cross-cutting shell logic (notification store, sound routing) lives in
  `src/renderer/` modules (`notificationStore.ts`, `shellSounds.ts`).
- All shell styling that must react to the theme goes through tokens/materials;
  Aero-specific looks are `:root[data-materials='aero']`-scoped in `aero-shell.css`.

## Not in Phase 2 (later phases)

Living wallpapers, particle engine, weather, companions/desktop pets, outside-app
overlays, application reskins, Anime Edition assets, Noctis — extension hooks only.
