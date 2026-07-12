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

Navigation, Reader, Manga, Dictionary, Flashcards, Immersion, Utility, Music, Custom

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
