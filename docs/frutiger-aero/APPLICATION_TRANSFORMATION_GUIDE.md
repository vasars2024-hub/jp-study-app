# Application Transformation Guide (Phase 4)

How each Secret OS application adopts the XP–Aero grammar, the shared pattern to
follow, and the triage/status of every app. Companion to
`XP_AERO_APPLICATION_LANGUAGE.md` (grammar) and
`APPLICATION_CHROME_AND_DIALOGS.md` (dialogs/menus).

## The adoption pattern (used by every transformed app)

```tsx
import { AppChrome, StatusBarField, StatusBarSpacer, type MenuBarMenu } from '../components/ui';

const menus: MenuBarMenu[] = [
  { id: 'file', label: 'File', items: [
    { id: 'open', label: 'Open…', onSelect: existingHandler },
    { separator: true, label: '' },
    { id: 'export', label: 'Export…', disabled: !canExport, onSelect: existingHandler },
  ] },
  // …
];
const status = (<><StatusBarField>{n} items</StatusBarField><StatusBarSpacer /><StatusBarField live>{m} due</StatusBarField></>);

return (
  <AppChrome menus={menus} status={status}>
    {/* the existing view, unchanged */}
  </AppChrome>
);
```

Rules that keep this gate-safe:
- **Wire existing handlers only.** No new business logic in menus.
- **AppChrome is pass-through in the default theme**, so the wrap is a no-op
  there — default Study OS stays byte-identical.
- **Never branch app DOM on theme.** If the Aero chrome makes an in-app control
  redundant (a header title, a duplicated toolbar button), hide it with a
  `:root[data-materials='aero']`-scoped rule in `theme/aero-apps.css` — the
  default theme keeps it.
- **Focused sub-modes get no chrome.** A full-screen flashcard review or a media
  player transport is not a menu-bar surface.
- Separators are `{ separator: true, label: '' }` (label satisfies the type).

## Status matrix (live)

| Application | Status | Phase 4 work | Milestone |
|---|---|---|---|
| Flashcards | Transformed | AppChrome menu bar (File/Deck/Study/Tools) + status bar; header actions hidden under Aero | M6 ✔ |
| CSV Editor | Transformed | AppChrome menu bar (File/Edit/Data/View) + status; toolbar kept as command bar; grid dominates | M8 ✔ |
| Calendar | Transformed | AppChrome menu bar (File/View/Go) + status; large header hidden under Aero | M9 ✔ |
| Dictionary | Polished | AppChrome View menu (language) + source status; inline lang toggle hidden under Aero | M11 ✔ |
| Anki | Polished | AppChrome connection-status bar + Anki menu (recheck) | M11 ✔ |
| Settings | **Blocked** | Control-Center transform pending — `SettingsApp/Home/registry/types` entangled with concurrent work | M5 (deferred) |
| EPUB (Novels/Library/Reader) | **Blocked** | Library + reader chrome pending — `NovelReader/BookReader` entangled | M7 (deferred) |
| Notes (desktop sticky) | Deferred | Sticky-note Aero skin lives in `DesktopShell` (entangled); Knowledge Notebook → Phase 5 | M10 (deferred) |
| Music | Already aligned | Player with its own transport/vlist — native desktop pattern already; deep polish → Phase 5 | M11 (triaged) |
| Media | Already aligned | Player UI with panes/lists — native pattern already; deep polish → Phase 5 | M11 (triaged) |
| Translate | Already aligned | Focused single-purpose tool; grammar already applies; no menu warranted | M11 (triaged) |
| Grammar | Defer | Density pass only if trivially cheap; else Phase 5 | M11 (triaged) |
| Statistics | Defer | Density pass; Phase 5 | M11 (triaged) |
| Resources | Defer | Batch pass; Phase 5 | M11 (triaged) |
| Immersion | Defer | Audit → likely Phase 5 | M11 (triaged) |
| Noctis (city) | Out of scope | Real module lives in `src/main/city` (separate track) | — |
| Visualizer / MusicWidget | Done (Phase 2) | Widget-frame skin already applies | — |

## Why some apps get chrome and others don't

The menu-bar + status-bar grammar reads as native desktop software for
**document/data/command applications** (decks, spreadsheets, calendars,
dictionaries, integrations). It is the wrong grammar for **players** (Music,
Media — transport bars are their native idiom) and **focused single-input
tools** (Translate). Forcing a menu bar onto those would be decoration, not
authenticity — exactly what the vision (§8) warns against. Those are classified
"already aligned" and left to inherit the global token/material grammar.
