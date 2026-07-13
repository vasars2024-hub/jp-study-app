# Application Chrome & Dialogs (Phase 4 · M2)

How Secret OS applications handle confirmation, prompts, alerts, menus and
tooltips — one consistent, accessible system, both themes. Companion to
`XP_AERO_APPLICATION_LANGUAGE.md` (M1 grammar) and
`PHASE_4_IMPLEMENTATION_PLAN.md`.

## Dialog service (replaces native browser dialogs)

`components/ui/dialogService.tsx` provides three promise-based functions that
render an accessible `ui/Dialog` (focus trap, Escape, labelled title) into a
self-mounting detached React root on `document.body`. No `<DialogHost>` needs
wiring into `App.tsx` — they work identically in the desktop shell, pop-outs,
reader takeover, focus and mini shells.

```ts
import { confirmDialog, alertDialog, promptDialog } from '../components/ui';

// confirm() → boolean
if (await confirmDialog({
  title: 'Delete folder',
  message: 'Delete the folder “Reading”? Books inside stay in your library.',
  confirmLabel: 'Delete',
  danger: true,           // red confirm button; Cancel gets initial focus
})) { … }

// alert() → void
await alertDialog({ title: 'Wallpaper', message: 'Could not open that image.' });

// prompt() → string | null  (null = cancelled)
const name = await promptDialog({
  title: 'New playlist',
  message: 'New playlist name:',
  defaultValue: 'My playlist',
});
```

### Conventions

- **Escape / backdrop** = cancel (returns `false` / `null`).
- **Enter** = default action (confirm / OK / submit the prompt).
- **Default focus**: destructive (`danger`) confirms focus **Cancel**;
  non-destructive confirms and alerts focus the primary button; prompts focus
  and select the input.
- **Labels**: always pass a `title`; use verbs for `confirmLabel`
  ("Delete", "Reset", "Remove") not "OK" for destructive actions.
- **Multi-line**: `message` renders with `white-space: pre-line`, so `\n`
  works as it did in the native dialogs.

### Why self-mounting

The native `confirm()`/`alert()`/`prompt()` are synchronous and block the
event loop; a React modal cannot. Each call spins up its own root and tears it
down on resolve (unmount deferred a tick past resolve so it never unmounts
mid-render). Call sites became `async`; every one was already inside an
async-tolerant handler (onClick, async function), so no control-flow changed
beyond `if (confirm(x))` → `if (await confirmDialog({…}))`.

## Migration completed in M2

All native dialogs in `src/renderer` were replaced (gate: zero
`confirm(`/`alert(`/`prompt(` outside the service):

- **17 `confirm()`** across FlashcardsView, LibraryView (×2), StatisticsView,
  SettingsView (×2), MediaLibraryActions, PlaylistEditor, ShortcutSettings
  (×2), DesktopShell (×2), and settings pages Appearance / Companions (×2) /
  Display / Memory (×2).
- **4 `alert()`** in DesktopShell (wallpaper/slideshow/shortcut errors) →
  `alertDialog`.
- **8 `prompt()`** in CsvEditorPanel (×6 — split/merge/tag/auto-number),
  PlaylistEditor, ShortcutSettings → `promptDialog`.

Bespoke csv-editor modals (`FindReplaceModal`, `ImportMergeModal`) now compose
`ui/Dialog` (their own `csv-editor-modal-backdrop` wrapper is gone), so they
inherit the shared focus trap, Escape handling and the Aero dialog material.

## Menus & tooltips

- **Context menus** use `ui/ContextMenu` (`MenuItem` shape: label, icon,
  onSelect, danger, disabled, separator). Arrow keys navigate, Escape closes,
  positioning is zoom- and viewport-scale-corrected.
- **Application menu bars** use `ui/MenuBar` (M1), whose dropdowns reuse the
  same `MenuItem` shape and `.ui-menu` visuals — one menu look everywhere.
- **Tooltips** use `ui/Tooltip` (wrapper-relative, zoom-safe, shows on hover
  and focus-within).

Applications should not hand-roll menus, modal backdrops, or tooltips; compose
these primitives so the whole suite feels like one operating system.

## Not done here (later milestones / Phase 5)

- Progress and multi-step wizard dialogs — introduce per-app only where a real
  workflow needs them (e.g. import flows in M6/M7/M8).
- Aero-specific dialog polish beyond the shared material already in
  `aero-apps.css` (dialog head sheen, solid body).
