# Desktop Shell (Phase 2)

Phase 2 turned the existing desktop into a cohesive **operating-system shell** that
becomes the Frutiger Aero OS under the secret theme — reusing the Phase 1 platform
(`docs/frutiger-aero/DESIGN_SYSTEM.md`) and the shell that already existed. This is
the hub doc; see the per-subsystem references.

- [WINDOW_MANAGER.md](WINDOW_MANAGER.md) · [TASKBAR.md](TASKBAR.md) · [START_MENU.md](START_MENU.md)
- [SEARCH_SYSTEM.md](SEARCH_SYSTEM.md) · [NOTIFICATION_CENTER.md](NOTIFICATION_CENTER.md)
- [DESKTOP_WIDGET_FRAMEWORK.md](DESKTOP_WIDGET_FRAMEWORK.md) · [SECRET_MODE_ARCHITECTURE.md](SECRET_MODE_ARCHITECTURE.md)
- [DESKTOP_SHELL_QA.md](DESKTOP_SHELL_QA.md)

## One shell, restyled by the theme

There is exactly **one** shell: `src/renderer/components/DesktopShell.tsx`, mounted
once. Every theme restyles it via the CSS token/material cascade — there is no
per-theme shell. The Frutiger Aero look is delivered entirely by
`theme/aero-shell.css`, **scoped to `:root[data-materials='aero']`** (the Aero theme
stamps `data-materials="aero"`). The default Study OS shell is unchanged — no
regressions. This is exactly how the OS "switches through the Theme Engine".

## Responsibilities

The shell owns desktop behaviour; applications never do. Layers:

- **Wallpaper** — base image/video/preset + the living-layer rotation stage
  (`environment/WallpaperStage`), dim overlay. Fit modes via `wallpaperFit.ts`.
- **Desktop** — free-drag icons (grid snap), sticky notes, drag-from-Start, the
  right-click context menu, and the extension-layer host (`DesktopLayerHost`).
- **Window manager** — `FloatingWindow` (see WINDOW_MANAGER.md).
- **Taskbar** — Start button, virtual-desktop switches, running windows, and a
  system tray (search, widgets, clipboard, settings, quick settings, notification
  bell, clock).
- **Panels** — Start menu, Quick Settings flyout, Notification Center flyout.
- **Secret Mode** — the Aero soft-reboot overlay + activation.

## New in Phase 2 (all consume Phase 1)

| Piece | Files |
|---|---|
| Aero glass shell (scoped) | `theme/aero-shell.css` |
| Notification Center + store | `components/shell/{NotificationCenter,NotificationBell}.tsx`, `notificationStore.ts` |
| Quick Settings flyout | `components/shell/QuickSettings.tsx` |
| Desktop context menu | inline in `DesktopShell.tsx` (reuses `ui/ContextMenu`) |
| Start search + footer | `DesktopShell.tsx` + `shell.css` |
| Search entry points | taskbar + Start → `palette:open` (reuses `CommandPalette`) |
| Wallpaper fit modes | `wallpaperFit.ts` + `shell.css` |
| Shell audio routing | `shellSounds.ts` |
| Soft-reboot | `components/shell/AeroBootOverlay.tsx` + `theme/SecretAeroTrigger.tsx` |
| Extension seams | `shellExtensions.ts` + `components/shell/DesktopLayerHost.tsx` |
| Shared panel styles | `components/shell/shell.css` |

## Conventions

- New shell subsystems live in `components/shell/`, composed from `components/ui/*`,
  mounted by `DesktopShell` (panels) — never by applications.
- Flyouts anchor bottom-right using `.os-flyout` (glass in every theme, brighter
  under Aero) with the `.os-panel-backdrop` click-catcher; they toggle via
  `shell:toggle*` CustomEvents and self-manage open state.
- Aero-specific looks are `:root[data-materials='aero']`-scoped in `aero-shell.css`.
- Cross-cutting shell logic is a plain module (`notificationStore.ts`,
  `shellSounds.ts`, `wallpaperFit.ts`, `shellExtensions.ts`), booted in `main.tsx`.

## Persistence

The live desktop layout (windows/icons/notes/widgets/wallpaper, 2 virtual desktops)
persists through the existing main-process store (`src/main/desktop.ts` →
`userData/desktop-layout.json`, echo-safe commit). New panel state persists to
dedicated localStorage keys — see the per-subsystem docs and DESKTOP_SHELL_QA.md.
