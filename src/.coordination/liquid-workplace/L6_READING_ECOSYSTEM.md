# L6 — reading and immersion ecosystem

Log for `LIQUID_WORKPLACE_TRANSFORMATION_PLAN.md` §11 / L6. Order: Reading → Novels → Library →
Immersion → manga/PDF/EPUB/VN suites. Gate: *content remains legible and stable at all sizes; no
tool obscures the document.* Append per slice; numbers, not adjectives.

## 2026-08-25 · primary · bullet 1 opens — the contract, and its first surface

**Bullet 1 is NOT closed.** The contract exists and one surface of five uses it. Recorded plainly
because the temptation is to call a contract with one caller "established".

| Slice | Commit | What landed |
| --- | --- | --- |
| contract | `edb01bfa` | `shared/liquidReadingCanvas.ts` + `components/liquid/ReadingCanvas.tsx` + its CSS, 25 tests |
| Reading | `efb18eba` | `ReadingCapturesView` migrated; the grid and its media query deleted |
| category 6 | `65a24365` | `captures` SPEC in `l6-parity.js`; ledger 44 → 50 rows |

**The design decision, and its tradeoff.** A reading side tool has exactly two placements —
`docked` beside the document, or `sheet` over the whole canvas. There is no third, so A PARTIAL
COVER CANNOT BE EXPRESSED and the Gate's second sentence becomes a checkable invariant instead of
a review note. The cost is that a narrow pane loses side-by-side working entirely; the alternative
was squeezing both, which is what shipped before and is worse in both directions.

**The defect this replaces is measurable.** `.settings-panel` in `renderer/styles.css` is
`position: absolute; right: 0; width: 264px`, and NovelReader opens bookmarks, translate and reader
settings through it — at a 640 px pop-out that covers 41% of the text. Captures had the same shape
in CSS-grid form: a `minmax(180px, 260px)` column with a `@media (max-width: 720px)` stack.

**Negative control for the Captures slice.** The media query could not fire for the case it existed
to handle. Measured live: Reading window narrowed to 620 px → pane **562 px**,
`window.innerWidth` **1264**, `matchMedia('(max-width: 720px)').matches` **false**. The old grid
would have left the passage **292 px** — ~17 characters a line at 17 px type — while reporting a
responsive layout. Through the canvas the same pane gives the passage all **562 px**.

**Live round trip, every number reproduced.** 820 px window → canvas 762 → list docked 260 →
document 490 (762−260−12) → 42 real capture rows. Narrowed → sheet 562, document 562, `inert` AND
`aria-hidden`, `role="dialog"`. Dismissed → document 562, not inert, passage 526 px with its 69
characters. Reopened from the new toggle → 42 rows. Restored → docked 260, document 490, 42 rows.

**Category 6: captures 6/6 in BOTH presentations.** Standard → liquid → standard identical on every
field (rect 94/54/820×580, zIndex 264, chars 843 = 843, nodes 284 = 284, controls 58 = 58). Three
negative controls, each failing exactly one row, each restored to 6/6.

**RULE 1 result, stated honestly.** Scoring L6's first surface cost ONE SPEC and one line of fix —
no new probe file, no engine change. The SPEC is **110 lines, not the ~40 the handoff predicted**,
because two of its six rows (`canvasPlacement`, `measureClamp`) are new L6 geometry no L5 app had.
Turn ratio measurement:product = **253 : 712 = 0.36 : 1**.

**Traps for the next worker.**
1. A control that fails TWO rows proves neither. Detaching the capture `<ul>` took `captureList`
   and `selection` together, because the selected row lives inside it. Rewritten to detach one
   row's source meta: 42 → 41, one row false, five unmoved.
2. Identity for a section inside a tabbed workspace must be structural. The window is titled
   "Reading Finder" whichever of its eight tabs is showing, so a title-only match scores Captures
   against the Library catalogue and invents six absences.
3. jsdom lays nothing out, so `ReadingCanvas` measures 0 and correctly places no tool. A caller
   test must give it a width through the element's own box, not a test-only prop, or it exercises
   a path the app never runs.
4. The CSS `gap` and `READING_CANVAS_POLICY.gutter` are one number in two files. A mismatch pushes
   the document under its own floor while the contract still reports the layout clean;
   `liquidReadingCanvas.test.tsx` asserts they agree.

**Next: NovelReader** (L6's "Novels"). Its three `.settings-anchor` popovers are the headline case.
Blocks are lines 2705–2736 (bookmarks), 2768–2918 (translate), 2928–2933 (reader settings); the
document is `.reader-stage`. It needs three new i18n labels in four catalogs, and all four catalog
files are dirty from other tracks — HEAD+edit staging, `debug/lq-stage-head-edit.cjs`.

---

## 2026-08-25 — surface 2 of 5: NovelReader (`b555bbb0`)

Bookmarks, book translation and reading settings were three `.settings-panel` popovers hung off the
reader toolbar — `position: absolute; right: 0; width: 264px`. Now `ReadingCanvas` tools. Triggers
stay in the toolbar and gained `aria-pressed`. FILL policy, because `settings.contentWidth` is a
persisted rem measure the user sets in the very panel being migrated; a second 760 px clamp would
override a setting they changed on purpose.

**640 px is NOT the sheet case, and the measurement said so before the test did.** room = 640 − 12
gutter − 384 floor = **244**, which clears bookmarks' 200 floor, so the tool docks at 244 — clamped
to the slack, not its preferred 264 — and the page keeps exactly **384**. 0% of the text covered
where the popover covered 41%. The sheet arrives at **500** (room 104).

**Live round trip, one reader, real book (悪の教典 02, EPUB, vertical paged, 2%).**
Canvas **1264**. Bookmarks docked: document attr **988** = box **988** = 1264−264−12; tool left
**1000** = docRight+12, so overlap **−12 px** — a gap, not a cover. `elementFromPoint` at the tool
centre = `.lq-reading-tool-body`, at the document centre = `.c4` (the book's own markup).
Two docked (settings first, then bookmarks): **696 + 280 + 264 + 24 = 1264 exactly**, and settings
**kept its 280** and its position — first-come docking, live. Narrowed to a **520 px** pane: sheet,
document **520**, `inert` AND `aria-hidden="true"`, `role="dialog"`, `aria-modal="true"`, sheet box
**520×724** identical to the document's box (`sheetSpansDoc: true`), and the sheet **took focus**.
Escape alone: tools 0, `covered` absent, not inert, focus back on the trigger, `aria-pressed` false,
position held at **2%**. Reader settings embedded in a docked tool: `position: static`, border 0,
background transparent, **10 `.sp-row`** rows — nothing lost, one surface not a card in a card.

**THE NEGATIVE CONTROL REFUTED MY OWN CLAIM, and the fix's comment was rewritten.** The commit said
that without `position: relative` on `.lq-reading-doc` the page paints over the docked tool.
Measured: with `position: static` restored, `elementFromPoint` at the tool's own centre still
returned `.lq-reading-tool-body` — `overflow: auto` clips the oversized scroller back to the
document region. The real defect is a MEASUREMENT one, which is worse for being invisible: at a
696 px document region the scroller's `clientWidth` became **1264**, **568 px outside the visible
region**, and `NovelReader.tsx:935` sizes the entire paged layout from exactly that `clientWidth`.
Columns 1264 px wide inside a 696 px window, remainder clipped, unreachable, absent from the page
count. `readingCanvasViolations` cannot see any of it — the resolver does not read stylesheets.

**RULE 1: this surface was a RUN, and it made the harness real.**
`__tests__/helpers/readingCanvasSurface.tsx` (228 lines) holds the rect stub, the `window.api`
Proxy, the ResizeObserver + flush, `expectPlacement` and `expectDismissRestoresDocument`. Captures'
own 140-line test was **rewritten onto it, 44 added / 73 removed**, so the harness shipped with two
callers rather than one. Novels' whole test file is 184 lines of surface-specific numbers.

Turn ratio, stated the strict way rather than the flattering one: measurement **228** (the harness)
against **152** lines of genuinely NEW product source = **1.5 : 1**. By diff-added lines it reads
228 : 353 = 0.65 : 1, but **215 of those 353 are the translate panel's JSX moved byte-for-byte with
8 spaces of indent removed** — a line surgery script did it precisely so it would not be retyped —
and counting a move as authorship is how a ratio flatters. The honest reading of the harness is that
it is a ONE-TIME 228 amortised over five surfaces: Library, Immersion and the manga/PDF/VN suites
each cost a `describe` block and no harness at all, so the third surface is the first turn where
this number can legitimately fall.

**Traps.**
1. **A ResizeObserver does not deliver in an unfocused window.** The canvas read `data-content-width
   988` while its box was **520**, twice in a row, and corrected the instant `/focus` ran. Any
   width-driven L6 measurement must `/focus` first or it reports the previous width as current.
2. `#root` carries `min-width: 100vw` inline from `appZoom.layoutRoot`, and **min-width beats
   max-width**, so narrowing the pane by styling `#root` silently does nothing. Style
   `.reader-stage` instead — it is app markup, and restoring it is one attribute.
3. Reading `aria-pressed` in the same `/eval` that clicked always returns the pre-click value.
   React has not re-rendered yet; use a second round trip.
4. The reader is NOT inside an `.fwin` — it renders at viewport width with all 8 floating windows
   hidden, so `elementFromPoint` is safe here. Do not assume that on the other L6 surfaces.

**Next: Library** (L6's third surface). `ReaderCollectionPanel` is the obvious fourth tool of this
reader and was deliberately left outside the canvas — the file is dirty from another track (the
in-flight i18n adoption, see the boss audit's Finding 5), so migrating it now would either stage
their work or lose it.
