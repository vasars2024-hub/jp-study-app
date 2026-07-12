# Search System

Source: `src/renderer/components/CommandPalette.tsx` (**reused** — it already is the
universal command palette). Phase 2 added prominent entry points, not a new search.

## What it indexes

Via fuzzy subsequence match: **commands** (`COMMAND_CATALOG`), **app sections/pages**
(the `SECTIONS` list), and **widgets** (`WIDGETS`). In `'search'` mode it also
searches **saved words**, **deck flashcards**, and **grammar points**.

## Invocation

- `Ctrl+Space` → `palette:open` (`'commands'`) — command mode.
- `Ctrl+P` → `palette:open` (`'search'`) — content search.
- **Phase 2 entry points** (both dispatch `palette:open`): the Start menu search
  field and the taskbar search button.

The palette is registered once (in `App.tsx`) and opens purely via the `palette:open`
CustomEvent, so any surface can invoke it by dispatching that event.

## Design stance

"Search is the universal command palette" — met by the existing component. Phase 2
surfaces it from the shell chrome (Start + taskbar) so it's discoverable like an OS
search, without duplicating the logic.

## Extensibility & future work

Add content sources by pushing more items into the palette's `items` memo (e.g.
library books, calendar events, notes, wallpapers, settings pages). **Recent
searches** + those extra sources are the noted follow-up — deferred this pass to keep
the large `CommandPalette` component untouched. Future companions/wallpapers become
searchable the same way.
