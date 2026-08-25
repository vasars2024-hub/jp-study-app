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

---

## 2026-08-25 — surface 3 of 5: the classic Library shelf

Captures' defect, in a different stylesheet. `.lib-shell[data-drawer='open']` was
`grid-template-columns: minmax(0, 1fr) 262px` with a `@media (max-width: 900px)` stack, and
**a media query reads the WINDOW**. Both are deleted; `.lib-shell` IS the `.lq-reading` element
and the detail drawer is a tool the resolver places. FILL policy — a catalogue is not prose.

**The negative control, measured live and not argued.** The Library renders in the Reading
Finder's pane: canvas **782**, `window.innerWidth` **1264**,
`matchMedia('(max-width: 900px)').matches` **false**. The query could not fire for the case it
existed to handle. Narrowed to a **600 px** pane the same reading holds — `matches` still
**false**, `innerWidth` still 1264 — where the old grid would have kept all 262 px and left a
five-column list row ~322 px.

**Live round trip.** 782 pane → drawer docked **262**, list **508** = 782−262−12, gap exactly
**12**, `elementFromPoint` at the tool = `.lq-reading-tool-title`, 4 meta rows and 3 shared
reading actions intact, 25 list rows. 600 pane → **sheet**, list **600**, `inert` +
`aria-hidden="true"` + `role="dialog"` + `aria-modal="true"`, sheet box identical to the
document's, and it **took focus**. Escape alone → tools 0, `data-drawer` back to `closed`, not
inert, 25 rows. Pane restored, `style` attribute back to `null` as found.

**The primitive gained `scroll="page"`, and this surface is why.** Measured docked: the drawer is
**365 px** of content beside a **1191 px** list. Under the default `contained` geometry the tool is
stretched to the full list height and its contents scroll off the top — the inspector you selected
a row to read leaves the screen. `page` makes the docked tool `position: sticky`, which is
load-bearing in one word: **sticky stays IN FLOW**, so it still reserves its flex track and the
resolver's arithmetic holds. `absolute` or `fixed` would put the tool back over the document.
`.lq-reading-tool` keeps `position: static` in the default case and the test still asserts it.

**RULE 1: this was a RUN.** `libraryCanvas.test.tsx` is 129 lines of surface-specific numbers and
zero plumbing — third caller of `helpers/readingCanvasSurface`. Its own negative control is
"places no tool until a row is selected": the canvas is measured at a width that could easily dock
and still places nothing, so a surface inventing a tool would fail.

**Traps.**
1. **`styles.css`'s HEAD blob has 10 CRLF lines** (24932–24941, another track's earlier HEAD+edit
   staging). Normalising EOLs before editing turns a 2-hunk commit into a **26,029-line whole-file
   rewrite**, and it also rewrote the working copy the same way. Read HEAD with `latin1` (byte
   round-trip), never `replace(/\r\n/g,'\n')`, and verify with
   `git diff --cached --unified=0 | grep '^@@'` — the hunk list must be only yours.
2. A CSS-text assertion must strip comments first. The replacement comment NAMES the deleted rule
   so the next worker knows why it went, and `not.toMatch(/\.lib-shell\[data-drawer='open'\]/)`
   then reads the explanation as the defect.
3. `libraryShelfLayout.test.ts` asserted `{detailBody}` appeared **twice**. It still appears once
   per shell — the classic one is now `content: detailBody` in `libraryTools`, not `{detailBody}`.

**Next: Immersion**, then the manga/PDF/EPUB/VN suites. `ReaderCollectionPanel` stays outside the
canvas until its own track commits: it is dirty with the in-flight i18n adoption (boss-audit
Finding 5), so migrating it now would stage their work or lose it.

---

## 2026-08-25 — surface 4 of 5: Immersion, and a defect in the primitive itself

Recovered work: the previous worker's session ended mid-slice at 13:09 with the source landed
(`ImmersionView`, `ImmersionContent`, `BlancLibraryPanels`, `styles.css` — mtimes 13:07) and no
test, gates or commit. Re-derived and finished rather than restarted. `000c7c4d`.

**A worse defect than the first three surfaces had.** Captures and Library were broken by a
`@media` query that reads the WINDOW and so never fired inside a pane. `.immersion-rail` was
`width: 220px; flex-shrink: 0` beside a `flex: 1` stage with **no responsive rule of any kind** —
there was no query to fire, so the stage absorbed the whole shortfall at every window size. Both
hosts had the same hand-rolled `.immersion-body` row and move together.

FILL policy: in `live` mode the document is an Electron `<webview>` whose guest lays itself out,
and a 760px clamp would letterbox a browser. Reader Mode owns its own measure one level down
(`.immersion-reader` is `max-width: 42rem`).

**DELIBERATELY NOT MOVED — read before migrating the split view.** The `<webview>` stays inside
`ImmersionStage`. A webview that changes DOM parent is destroyed and its guest reloaded, and the
live-lookup `ipc-message` effect keys off `[showWebview, currentUrl, liveLookup, ...]`, none of
which change on a mode switch — so it would stay bound to the dead element and live lookup would
die with no message. Aero's `.aero-immersion-rail` is a separate code path, untouched.

### The finding: every L6 sheet has been a partial cover — `09bbced2`

Found only by driving the live app at a narrow pane. Four JSDOM suites, a CSS-text assertion and
the resolver all passed throughout.

Every tool renders as `<aside class="lq-reading-sheet lq-liquid">`. `theme/liquid-surfaces.css`
declares `position: relative`, `padding: var(--lq-space-4)` and `background: var(--lq-liquid-bg)`
on `.lq-liquid` at the **same (0,1,0) specificity** as a bare `.lq-reading-sheet`, from a
stylesheet that loads **later**. It won all three, and a component-level
`import './readingCanvas.css'` cannot influence that order.

Measured on Immersion, canvas 462:

| | before | after |
| --- | --- | --- |
| sheet `position` | `relative` | `absolute` |
| sheet box | **338 in flow** | **462 = full canvas** |
| document | **112**, while `data-content-width` said 462 | 462, inert |
| aside `padding` | 12px | 0 |
| material | `--lq-liquid-bg`, alpha **0.72** | `--lq-liquid-bg-raised`, alpha **0.88** |

338 beside 112 is a **partial cover** — the one outcome `shared/liquidReadingCanvas.ts` declares
inexpressible. It was inexpressible in the resolver and shipping in the stylesheet. After the fix
`elementFromPoint` at the canvas centre returns a node inside the tool: covering proven by hit
test, not only by box arithmetic. Docked re-measured at 782: `static`, padding 0,
220 + 12 + 550 = 782 exactly.

Fix is **specificity, not order** — `.lq-reading > .lq-reading-tool` / `> .lq-reading-sheet` are
(0,2,0) and cannot lose to a role class whatever the import order becomes. `background` was
dropped from the old (0,1,0) combined rule rather than left as a losing duplicate that reads like
the source of truth; border/radius/shadow/colour stay there because `.lq-liquid` sets them to the
SAME tokens, so which wins is not observable. `[data-scroll='page']`'s sticky rule is (0,3,0) and
never lost, which is why Library's docked drawer was correct.

**Why the existing test could not see it, and what replaced it.** It asserted the CSS TEXT
contains `position: static` / `position: absolute`. Both were true the whole time. *A declaration
existing is not a declaration winning.* The replacement reads BOTH stylesheets, asserts
`.lq-liquid` really does claim those three properties (so the premise fails loudly if that
changes), then requires every rule reclaiming them to carry more than one class. It **failed on
first run** against a real leftover — the dead `background` duplicate — which is the evidence it
can actually see this class of defect.

### Gate numbers

`immersionCanvas.test.tsx`, 160 lines, **zero plumbing** — fourth caller of
`helpers/readingCanvasSurface`, a RUN not a build. 7/7: docked 220 / content 968 at 1200; sheet /
content 500 at 500 with dismissal restoring the same node; the boundary from **both sides** (576 →
docked at exactly 180 with the stage at exactly its 384 floor, 575 → sheet);
`--lq-reading-measure: none` proving the fill policy is in force; negative control — rail closed at
1200 places no tool and returns all 1200. Five reading-canvas suites together: **40/40**.

Live, default pane: canvas 782, tool 220, doc 550, gap exactly 12, `aria-pressed="true"`. The
toolbar trigger gained `aria-pressed` and a stable class — a localised title is neither a state
report nor a safe selector.

**Not claimed as live evidence:** the classic Library shelf could not be re-driven after the
primitive fix — it renders **0 rows** in this profile, so its drawer never opens. Covered by its
JSDOM suite only.

### NEXT SLICE, already measured so the next turn does not re-derive it

**The sites rail is unvirtualised and it is now a category-7 defect on a surface we certified.**
Measured live in this profile: **883 real saved sites**, one `<ul>`, `scrollHeight` **46,822px**
in a **418px** viewport (112x overdraw), **6,199 DOM nodes** inside `.immersion-body`.
`components/VirtualList.tsx` is the repo's primitive and the rail's ancestors already give it a
definite height (`.lq-reading-tool-body` is `flex: 1 1 auto; min-height: 0`).

The one thing to settle first: **row heights are 49px x879, 50px x1, 51px x3**, and `VirtualList`
is FIXED-height, so 883 rows would drift up to ~1.7kpx cumulatively. `.immersion-site-title` is
already `nowrap` + ellipsis, so the variance is not wrapping. `completionPct > 0` renders an extra
6px bar and **0 of 883 sites have one here**, so this profile cannot exercise that branch — do not
conclude the bar is dead. Give the row a deterministic height before virtualising.
Trap to check, from `4e2c46e1`: this repo has already shipped virtualisation that was *present and
inert*.
