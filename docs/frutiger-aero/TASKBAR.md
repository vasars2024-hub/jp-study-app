# Taskbar

Source: the `.os-taskbar` block in `DesktopShell.tsx`.

## Structure (left → right)

- **Start button** (`.os-start-btn`) — toggles the Start menu; glossy aqua orb
  under Aero.
- **Virtual-desktop switches** (`.os-desktop-switch`) — Desktop 1 / 2.
- **Running windows** (`.os-task-win`) — one per open window (icon + label, active
  / minimized state); click cycles focus/minimize.
- **System tray** (`.os-tray`):
  - Search → `palette:open` (`'search'`)  *(Phase 2)*
  - Widgets → widget gallery
  - Clipboard history → `clipboard:open`
  - Settings → opens the Settings window
  - Quick settings → `shell:toggleQuickSettings`  *(Phase 2)*
  - Notification bell (`NotificationBell`, unread badge) → `shell:toggleNotifications`  *(Phase 2)*
  - Clock (`TaskbarClock`, isolated so its tick doesn't re-render the desktop)

## Aero styling (Phase 2 · M1)

Under `data-materials='aero'` (`theme/aero-shell.css`): the taskbar becomes a glass
slab with a bright top sheen + reflection; tray / running-window / desktop-switch
buttons become glass chips with hover brightening; the active window/desktop uses an
accent-tinted glass. Battery Saver drops the blur (perf.css). Default shell unchanged.

## Accessibility

All tray affordances are real `<button>`s with `title` + `aria-label`; the bell's
label announces the unread count. They inherit the global `:focus-visible` ring.
The notification badge uses `--status-error` (themeable).

## Extensibility

Add a tray control by dropping a `<button className="os-tray-btn">` (or a small
self-contained component like `NotificationBell`) into `.os-tray`. Future companion
indicators / notification-driven affordances follow the same pattern.
