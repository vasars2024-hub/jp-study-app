# Keyboard & mouse shortcuts

Central registry: `src/renderer/keyboardShortcuts.ts`  
Settings UI: `src/renderer/components/ShortcutSettings.tsx` (Settings → Shortcuts)

## Features

- Rebind any catalog command (click → press keys or mouse button)
- Multi-key chords: `Ctrl`, `Alt`, `Shift`, `Meta` (Win)
- Alternatives: one command can have several chords (`Space|Enter`)
- Mouse buttons: `MouseLeft` (only with a modifier), `MouseMiddle`, `MouseRight`, `Mouse4`, `Mouse5`
- Custom shortcuts: open an app section or run an existing command
- Profiles, reset one/all, JSON import/export
- Manual “Type” entry for advanced chords

## Binding syntax

| Example | Meaning |
|---------|---------|
| `Ctrl+Shift+H` | Modifiers + key |
| `Space\|Enter` | Either key triggers the command |
| `Ctrl+MouseRight` | Ctrl + right mouse button |
| `MouseMiddle` | Middle click |
| `F6` | Function key |

Bare left-click is **not** allowed as a global shortcut (would hijack the UI). Combine with Ctrl/Alt/Shift, or use another mouse button.

## Categories

Rendered in this order (`CATEGORY_ORDER` in `ShortcutSettings.tsx`), grouped by
purpose — moving around the OS, then arranging it, then the study surfaces, then
media, then tools and user macros:

Navigation, Window, Reader, Manga, Dictionary, Flashcards, Immersion, Music,
Video, Toolbox, Utility, Custom

Window defaults avoid the `Meta` (Win) key on purpose: Windows reserves
`Win+Arrow` for its own snap layouts and `Win+D` for show-desktop, and the OS
consumes those before Electron sees the keydown. `Ctrl+Alt+*` is the safe band.

## App-wide dictionary lookup

`GlobalDictionaryOverlay` (mounted next to `ToastHost` in every `App.tsx` shell)
opens the dictionary popup on text **anywhere** in the Study OS, not just in the
six reader views. Gesture is configured in Settings → Shortcuts → App-wide lookup
(`globalLookupSettings.ts`); default is `Shift`+click.

- Modifier gestures (`Shift`/`Ctrl`/`Alt` + click) are intercepted in the capture
  phase and `preventDefault`ed, so they never activate the control underneath and
  work inside the readers too.
- `Plain click` mode stays passive instead: it skips interactive controls and any
  surface marked `data-dict-owner` (the six readers, which run their own lookup).
- Any view can open the popup without importing the module by dispatching
  `window.dispatchEvent(new CustomEvent('dict:lookup', { detail: { query } }))`.
- `Escape` closes the popup. It is handled locally rather than as a catalog
  command, because the shortcut model is one-command-per-chord and `Escape` is
  already `flashcards.end`; the overlay only intercepts it while a popup is open.

View-scoped commands only fire while that view is mounted (handlers registered on open).

## Adding a built-in command (developers)

1. Append to `COMMAND_CATALOG` in `keyboardShortcuts.ts`.
2. If always-on, add a case in `builtinHandler`.
3. If view-scoped, call `registerCommandHandler(id, fn)` while the view is open.
4. Users rebind from Settings → Shortcuts.

## Custom shortcuts (users)

Settings → Shortcuts → **Add custom**:

1. Name the shortcut  
2. Optional keys (or capture after create)  
3. Action: **Open app / section** or **Run existing command**  

## Runtime registration

```typescript
import { registerCommandHandler } from './keyboardShortcuts';

const off = registerCommandHandler('flashcards.flip', () => flip());
// later: off();
```
