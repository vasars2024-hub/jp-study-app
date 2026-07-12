# Notification Center

Sources: `src/renderer/notificationStore.ts`,
`components/shell/NotificationCenter.tsx`, `components/shell/NotificationBell.tsx`.

## Store (`notificationStore.ts`)

Persistent history in localStorage `jp-os-notifications-v1` (capped 100). API:
`notify()`, `getNotifications()`, `dismiss(id)`, `clearAll()`, `markAllRead()`,
`unreadCount()`, `onNotificationsChanged()`, `isDnd()`/`setDnd()`.

`installNotificationCapture()` (booted in `main.tsx`) mirrors the app's existing
transient toast buses — `os:toast` **and** `ui:toast` — into history without
changing those emitters (string content only). So every toast the app already fires
is now also kept in the center.

## Panel (`NotificationCenter.tsx`)

A bottom-right glass flyout (`.os-flyout`) toggled by `shell:toggleNotifications`
(from the taskbar bell). Lists history newest-first via the Phase 1 `ui/Notification`
primitive, each with relative time + dismiss. Header has a **Do Not Disturb** toggle
and **Clear all**. Opening marks all read and moves focus into the panel; Escape /
backdrop closes.

## Bell + badge (`NotificationBell.tsx`)

A self-contained taskbar tray button that subscribes to the store and shows an unread
badge (`--status-error`), suppressed while DND is on. Dispatches
`shell:toggleNotifications`.

## Priority & DND

`ShellNotification` carries `kind` + optional `priority`. DND is a stored flag
(`jp-os-dnd`) that suppresses the badge (history is still kept) — the seam for a full
Do-Not-Disturb / quiet-hours system later.

## Styling / a11y / perf

Glass in every theme (brighter under Aero); opaque under high-contrast (a11y.css);
blur dropped under Battery Saver (perf.css); slide-in collapses under reduced motion.

## Future

Study reminders, achievements, calendar reminders, reading/flashcard milestones,
downloads, companion dialogue and Noctis events can all call `notify(...)` (or fire a
toast, which is auto-captured).
