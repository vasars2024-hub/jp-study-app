# Live defect register — pre-sweep, 2026-09-06

The user sweeps the whole app personally before release. **This file exists so they find as
little as possible.** Every defect an agent sees goes here, immediately, whether or not it is in
that agent's slice and whether or not it gets fixed.

## The bar for an entry

If a user could see it, it goes in. Cosmetic counts. "Probably fine" counts. A thing you noticed
and moved past counts. **Do not filter by severity, ownership, or scope** — filtering is how the
three subtitle defects the user found by watching a video for ten seconds survived every tracker.

## Format — one row, four facts

| # | surface | what the USER sees | repro (exact) | sev | status |
|---|---------|--------------------|---------------|-----|--------|

- **what the user sees** — plain language, no internals. "The list is empty after refresh", not
  "resolveCaptures returns []".
- **repro** — the exact clicks/route from app start. If you cannot repro it, still file it and say
  "seen once, no repro".
- **sev** — P0 data loss / crash · P1 feature unusable · P2 wrong output · P3 cosmetic.
- **status** — `open`, `fixed <sha>`, or `not-reproducible`.

## Rules

1. **Filing is never out of scope and never needs permission.** One line costs nothing.
2. **File it, then FIX it.** The row is written the moment you see the defect - that is
   insurance against a turn ending early. Then fix it, in order: P0, P1, P2, P3. A P3 you can
   fix in two minutes gets fixed. Leave one unfixed only if the fix is genuinely multi-turn,
   and say so in the row with what you measured.
3. **Never close a row you did not verify against the running app.**
4. **Do not delete rows.** Mark them; the register is append-only.

---

## Findings

| # | surface | what the USER sees | repro (exact) | sev | status |
|---|---------|--------------------|---------------|-----|--------|
| D1 | library | In the Covers grid you cannot open a book without a mouse. Tab moves between the small Remove and File icons on each cover and never lands on the cover itself, and Enter does nothing. A screen reader announces each book as an unnamed group. | Library ▸ Covers ▸ press Tab repeatedly. Focus goes Remove → File → Remove → File across 24 books; the book never gets focus and Enter never opens one. | P1 | fixed 62d2c4a7 — verified live: all 24 cards now role=button/tabindex=0 named by title, and a real Enter opened 悪の教典 02 |
| D2 | library | In List view you can select a book with the keyboard but still cannot open it — opening is double-click only. | Library ▸ List ▸ Tab to a row ▸ Enter/Space selects it, nothing opens. Same in the Aero row list. | P2 | open — `LibraryView.tsx:1602` and `:1296` are `<button>` with `onDoubleClick={() => onOpen(it)}` and no key handler. Not fixed with D1 because the reading-action bar (`runReadingAction('read')`) may already provide a keyboard route for a SELECTED item, and that has to be driven before deciding whether this is a missing key handler or a discoverability problem. |
| D3 | library | A manga in the library is titled "New folder". | Library ▸ Covers ▸ second card. | P3 | open — may be exactly what the user imported (a folder literally named "New folder"), in which case it is faithful, not a defect. Filed because it reads as a placeholder and only the user can settle it. |
| D4 | every window | A screen reader announces two of the five window buttons as drawing characters instead of names — the pop-out button reads as "⧉" and Minimize as "─". Make Liquid, Maximize and Close all announce properly, so the two that do not are the odd ones out. | Open any window ▸ Tab into the titlebar. Measured on all 7 windows open at once (Translate, Reading Finder, Anki, Settings, Immersion, Library, Dictionary): 7/7 carry both. | P2 | fixed 8d34ca9c — four buttons in `DesktopShell.tsx` (framed bar + frameless cluster) had `title` but no `aria-label`; a button's own text content outranks `title` in the accessible-name computation, so the glyph won. |

### Environment note, not a product defect — READ BEFORE THE NEXT LIVE CHECK

Installing `7z-wasm` on 2026-09-06 (commit `9611596b`) **deleted
`node_modules/.vite/deps`**, verified absent from PowerShell as well as Bash. The
running dev server keeps its already-optimized dependencies in memory, so the
desktop, Library, Translate and everything loaded at boot still work — but any
dependency that is **dynamically imported later** now 504s.

Measured: opening an EPUB shows *"Could not open this book. Failed to fetch
dynamically imported module: .../deps/epubjs.js?v=8704ba46"*, and
`curl` on that URL returns **504**, not 404. It survives a window reload and it
survives touching `package.json`, so Vite does not re-optimize on its own.

**This is the dev server, not the product** — a packaged build bundles epubjs and
never reads this cache. Do not file it as a product defect and do not "fix"
reader code because of it. It clears when the dev app is next restarted, which
this turn deliberately did not do (another session's turn dies with it). Until
then, treat any *lazily imported* dependency failing in the live app as this,
and confirm against a fresh boot before believing it.

## Coverage - the user starts THEIR sweep when this table is full

They are waiting on this. Claim a surface by putting your worker name in `by` BEFORE you start,
so two workers never take the same one. Fill `done` only when you have driven every control on it,
watched the console throughout, and filed every row you saw. `found` is how many rows that surface
produced - **0 is a legitimate answer and must be written, not left blank**, because a blank reads
as "not visited" and costs the user a second pass.

| # | surface | by | done | found | notes |
|---|---------|----|------|-------|-------|
| 1 | agent | | | |  |
| 2 | library | primary | partial | 3 | Covers grid driven live on the user's own 24 items; D1 fixed. NOT yet driven: List/Inbox/Chrome-extension/YouTube tabs, folder create/rename/delete, the import buttons, Sort/Group selects, the detail drawer, narrow + maximized. |
| 3 | novels | | | |  |
| 4 | dictionary | | | |  |
| 5 | grammar | | | |  |
| 6 | translate | | | |  |
| 7 | player | | | |  |
| 8 | video | | | |  |
| 9 | music | | | |  |
| 10 | anki | | | | AnkiConnect is live, 84 decks |
| 11 | flashcards | | | |  |
| 12 | games | | | |  |
| 13 | stats | | | |  |
| 14 | resources | | | |  |
| 15 | settings | | | | do late - it invalidates earlier observations |
| 16 | note | | | |  |
| 17 | visualizer | | | |  |
| 18 | musicwidget | | | |  |
| 19 | city | | | |  |
| 20 | immersion | | | |  |
| 21 | calendar | | | |  |
| 22 | reading | | | |  |
| 23 | youtube | | | |  |
| 24 | scraper | | | |  |
| 25 | files | | | |  |

Cross-cutting passes, after the 25:

| pass | by | done | found |
|------|----|------|-------|
| resize narrow + maximize | | | |
| popout three surfaces | | | |
| close a window mid-load | | | |
| offline for two minutes | | | |
| UI language switch (dates, numbers, every string) | | | |
| restart and confirm persistence | | | |

**When every row has `done`, say so plainly in the handoff** - "AI sweep complete, N surfaces,
M defects, K fixed" - so the user knows their pass can start.

