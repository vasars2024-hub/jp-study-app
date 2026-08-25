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
