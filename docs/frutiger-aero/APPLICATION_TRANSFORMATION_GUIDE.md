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

## The interior density grammar (the core interior fix)

Chrome (menu bar + status bar) was necessary but **not sufficient** — the app
*bodies* still used a modern-web card grammar. The interior density grammar
(`aero-apps.css`, commit `0bd8c72`) re-casts the shared body containers under
Aero — `.anki-card`, `.os-set-card`, `.set-section`, `.view-head`, section
headings — from floating white cards (24px padding, big radius, drop shadow)
into flat compact XP–Vista **groupboxes** (solid surface, hairline border,
small radius, ~9px padding, no float). No DOM changes (class names are the
seam), so it lands across every app interior at once and the default Study OS
keeps its Fluent card look. **This is what makes the interiors read as native
desktop software**, not chrome bolted onto a website.

## Status matrix (live)

| Application | Status | Phase 4 work | Milestone |
|---|---|---|---|
| Flashcards | Transformed | Menu bar (File/Deck/Study/Tools) + status; header actions hidden; body compacted by interior grammar | M6 + interior ✔ |
| CSV Editor | Transformed | Menu bar (File/Edit/Data/View) + status; toolbar = command bar; grid dominates; card wrapper flattened | M8 + interior ✔ |
| Calendar | Transformed | Menu bar (File/View/Go) + status; large header hidden; cells/sections compacted | M9 + interior ✔ |
| Settings | Transformed | XP Control-Center density: glassy compact category rail, dense nav rows, small-caps groups, compact top search + property cards (interior grammar). Registry/search/deep-links preserved | M5 ✔ |
| EPUB Library (LibraryView) | Transformed | Digital Library: File menu (imports) + status; header actions hidden; shelf compacted | M7 ✔ |
| EPUB Reader (NovelReader) | Transformed | Reader bars (.reader-bar/.reader-controls/.reader-footer) → compact glass rails; reading surface (.reader-stage) left solid/legible; reader TSX untouched | M7 ✔ |
| Dictionary | Polished | View menu (language) + source status; inline lang toggle hidden | M11 ✔ |
| Anki | Polished | Connection-status bar + Anki menu (recheck); config cards compacted by interior grammar | M11 + interior ✔ |
| Notes (desktop sticky) | Polished | Aero glass-paper skin (gloss + soft shadow); note colour preserved; Knowledge Notebook → Phase 5 | M10 ✔ |
| Novels (catalog) | Polished | Curated external-link catalog; interior grammar + `.nov-view` density (no chrome — external links, not a reader) | M7 (light) |
| Music | Already aligned | Player with its own transport/vlist — native desktop pattern already; deep polish → Phase 5 | M11 (triaged) |
| Media | Already aligned | Player UI with panes/lists — native pattern already; deep polish → Phase 5 | M11 (triaged) |
| Translate | Already aligned | Focused single-purpose tool; grammar already applies; no menu warranted | M11 (triaged) |
| Grammar / Statistics / Resources / Immersion | Light / Defer | Interior grammar applies to their card bodies; deeper structural work → Phase 5 | M11 (triaged) |
| BookReader | Dead code | No imports anywhere — left untouched | — |
| Noctis (city) | Out of scope | Real module lives in `src/main/city` (separate track) | — |
| Visualizer / MusicWidget | Done (Phase 2) | Widget-frame skin already applies | — |

Still deferred (viewport option, not an app): the **Native-Fill toggle** —
requires the concurrent-work-entangled `App.tsx` viewport owner; low value
relative to the app transformations. Phase 5.

## Why some apps get chrome and others don't

The menu-bar + status-bar grammar reads as native desktop software for
**document/data/command applications** (decks, spreadsheets, calendars,
dictionaries, integrations). It is the wrong grammar for **players** (Music,
Media — transport bars are their native idiom) and **focused single-input
tools** (Translate). Forcing a menu bar onto those would be decoration, not
authenticity — exactly what the vision (§8) warns against. Those are classified
"already aligned" and left to inherit the global token/material grammar.
