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

## 2026-08-25 — the certified surface was a category-7 defect, and the harness is now reusable

`5c477856`. Not a bullet: L6 bullet 1 stays at 4 of 5 surfaces. This is rubric category 7 on a
surface L6 already passed, found by running the new harness at the surface we had just shipped.

**Before → after, same script, different arguments.**

| | before | after |
| --- | --- | --- |
| rows in the DOM | **883** | **20** |
| elements under `.immersion-rail` | **6,182** | **163** |
| distinct row heights | 3 (49x879, 50x1, 51x3) | **1** (49) |
| `scrollHeight` / viewport | 46,822 / 418 = **112x** | 46,815 / 418 |
| spacer | none | **46,799** = 883 x 53 exactly |
| verdict | **UNWINDOWED** | **WINDOWED** |

The 7px the scrollHeight lost is the whole row-height story: 883 x 53 + 4 + 12 padding = 46,815,
and the four odd rows were exactly the missing 7. Their variance was **not** wrapping — the title
is already `nowrap` + ellipsis. It was `line-height: normal`: `(`, `[` and `․` fall back to a font
with a taller line box. Pinned to 16px/15px, which is what the other 879 already computed to, so
nothing moved for them — and because wired overrides the meta's `font-size` but not its
`line-height`, the slot is now theme-independent. The completion bar was the second source
(`margin-top: 4 + height: 2` made a row with progress 55px against a 53px slot); it is out of flow
in the card's existing 6px bottom padding. **0 of 883 sites here have `completionPct > 0`**, so
that branch is held in JSDOM, not live — its absence is not evidence it is dead.

Windowing costs accessibility unless declared, so `VirtualList` gained `listRole`/`itemRole`:
each slot carries the FULL `items.length` as `aria-setsize` and its true `aria-posinset`, wrappers
`presentation`. Without it, 883 sites announce as "1 of 20". Live at the bottom: rows 870..883,
`aria-setsize` 883, the 883rd reachable and hit-testing to its own content.

**RULE 1 — `probes/cat7-collection-weight.cjs` names no surface.** Title/container/row are
arguments; it COMPUTES the verdict and distinguishes WINDOWED from **INERT**, because this repo
shipped virtualisation that was present and had no effect (`4e2c46e1`). Mutation control:
`endIdx = total` turns 3 of 6 new tests red; restored 13/13. The suite's last test is the viewport
control — give the rail the library's full height and all 883 rows must appear.

**Swept all 9 open surfaces with it: Immersion was the only UNWINDOWED one.** Grammar's 139,780px
scroller has 146 descendants — already a spacer. Honest limit: Dictionary (39 nodes) and Translate
(46) were EMPTY, and the rubric caps an empty harness at 0, so those two are unmeasured, not clean.

### NEXT SLICE — surface 5, the manga reader. Measured, do not re-derive.

`.ocr-panel` (styles.css:8717) is `position: fixed; top: 56px; right: 0; width: min(380px, 44vw)`
and `.manga-stage` never insets for it. Live on a real volume (One Punch-Man, 18 pages, OCR panel
open): stage **1264** = the whole viewport, panel occupies **964..1264**, containing block
**viewport** — no ancestor creates one.

**My first claim was refuted by its own measurement, so state it correctly:** the panel does NOT
cover this page. `overlapWithPage: 0`, `pageCoveredPct: 0`, and `elementFromPoint` under the panel
returns `IMG.manga-page`. This page is height-bound (512 wide at max-height 729). What IS wrong is
the same defect Novels had (`38a83c03`) — it **MIS-MEASURES**: the fit math emits
`max-width: 1264px` while only **964px** is visible, and the page centres in 1264, putting its
centre at 632 against a visible centre of 482 — **150px off-centre**, toward the panel. Any page
wider than 964 is then a real cover. `44vw` is a viewport unit too, so in Blanc's pane or a pop-out
the panel is sized and placed by the screen, not the reader.

Migration shape, already scouted: `MangaReader.tsx:1451` is the stage, `:1531` the `<aside>`
(running to ~:1930, `MangaSidebar` at :1850). Extract the aside's children to a `content` variable
rather than moving them, then wrap the stage in `ReadingCanvas` with one tool. Watch `stageRef`
(page-fit math) and the two absolutely-positioned `.nav-zone`s inside the stage.

### Same turn — the harness had a defect of its own, found by running it on a second surface

Dictionary, loaded with a real query (8 entries, 204 elements): the auto-detected scroller came
back as **`dict-star lq-hit`, clientHeight 20** — a star button overflowing by 6px outranked the
545px results region, because the picker ranked purely by `scrollHeight - clientHeight`. A 20px
element cannot be a collection's viewport. Floor added (`clientHeight >= 40`); re-run gives
`dict-entries`, 1461/1461, overdraw **1**, verdict **FITS**. The verdict was right either way here
(8 rows, all in the DOM, no spacer) — the numbers were not, and a number nobody can trust is the
thing this file exists to prevent.

**Dictionary is not a category-7 collection defect: it PAGES.** `.dict-results` carries a `page`
class and returns 8 entries at a time out of 650k. That is the honest negative result — it did not
need the fix Immersion needed, and recording it stops the next turn from re-deriving it.

Also observed, and it is the guard working: re-running against Immersion after I had closed that
window **REFUSED with `no window titled Immersion`** rather than scoring the first visible `.fwin`.
That is the `probe-picks-first-visible-fwin` failure mode, refused by name.

### Same turn — the two props the rail needed were needed almost everywhere

Of **11** `<VirtualList` call sites, **8 declared no role at all**. Applied `listRole`/`itemRole` to
those 8 (GrammarExplorer, GrammarCurationPanel, GrammarPracticePanel, BlancShell file search, both
Flashcards lists, Music, YouTube x2, and the two scraper log consoles); NOT to the 4 grids, which
already carry `role="row"`/`gridcell` — a `row` inside a `list` is invalid ARIA. `c1d658bb`.

**The latch is per-TAG, and that is the finding.** `ResultPanels.tsx` alone holds **two grids and
one log console**, so the file-level allowlist written first would have excused the log with the
grids and shipped it mute. The rule now reads the row role out of the tag's own `renderItem`, which
sits inside the opening tag's braces. It also guards itself: a sweep that finds no call sites passes
everything, so it asserts it found ≥ 6. `src/renderer/__tests__/virtualListSemantics.test.ts`.

Known gap left open on purpose: for those 4 grids, VirtualList's two structural wrappers are only
`presentation` when `listRole` is set, so their `grid`→`row` ownership chain has the same break.
That needs a `gridRole` decision, not a copy of the list one.

### A measurement trap the last several handoffs inherited

`node tools/architecture-audit.cjs 2>&1 | tail -8; echo "exit=$?"` reports **`tail`'s** exit status,
not the tool's. Every recent handoff recorded "architecture-audit exit 0" from that shape. Measured
properly (`> /dev/null; echo $?`) it is **exit 1**, and has been — caused solely by the foreign-track
`src/shared/externalSubtitleMount.ts`, which names none of our files. The finding is unchanged; the
*number* was never measured. Same class as everything else in this file: a value nobody computed.

## 2026-08-25 — surface 5, the manga reader (`439324f5`), and what is actually left of bullet 1

The panel never covered the page — my own probe refuted that last turn — it made the reader
**measure 300px it did not have**. `stageSize` is `stageRef.current.clientWidth` fed straight to
`mangaPageFitStyles`, and `.ocr-panel` was `position: fixed` over a stage that never inset.

Live, One Punch-Man ch.229, 17 pages, same reader, before → after:

| | before | after |
| --- | --- | --- |
| stage `clientWidth` | 1264 | **952** (= 1264 − 300 − 12 gutter, exactly) |
| page `max-width` emitted | 1264px | **952px** |
| page centre vs visible centre | 632 vs 482 = **150px off** | 476 vs 476 = **0** |
| panel/page overlap | 0 | 0 — it never was the cover it looked like |

Round trip, all live: dismiss → 1264 and the SAME stage node with the same page; reopen from the
toolbar → 952. Narrowed to 620 → sheet, `role=dialog`, `aria-modal`, doc `inert` + `aria-hidden`,
`position: absolute`, full 620. Restored, probe globals deleted.

**A finding the other four surfaces hid.** `.lq-anchor` puts 16px padding, a border and a radius on
the document region. Every prose reader wants that; a manga stage does not — measured, it cost
**34px** of a 952px region and drew a frame round a black rectangle. `.manga-canvas >
.lq-reading-doc` is full-bleed, and the stage's own opaque `#0a0a0d` is what makes the region a
stable anchor in the first place.

**RULE 1:** `mangaCanvas.test.tsx` is 215 lines, zero plumbing, fifth caller of
`helpers/readingCanvasSurface`. Five suites 48/48. The harness had a defect the fifth surface
found: ONE module-level callback set with `disconnect()` clearing all of it, so MangaReader's
stage observer (deps `[pages.length]`) unregistered the canvas the moment pages loaded and
`resize()` silently stopped working. Each instance owns its callbacks now.

### What bullet 1 still needs, measured this turn — do not re-derive

The plan's fifth item is "manga/**PDF/EPUB/VN** suites", which is not one surface.
- **PDF and EPUB are NOT separate readers.** `renderer/pdfLoader.ts` is imported by exactly
  `views/NovelReader.tsx` and `novelLensCapture.ts` — so both are surface 2, already migrated.
- **VN is the one thing left.** `.visual-novel-layout` is `grid-template-columns: minmax(220px,
  290px) minmax(0, 1fr)` with a `@media (max-width: 760px)` stack — the *exact* Captures/Library
  defect: the query reads the WINDOW, and this panel renders inside the Immersion fwin, so in a
  600px pane inside a 1264px window it never fires and the workspace eats the whole shortfall.
- Two things make it a bigger slice than manga. (1) The library column is on the **leading** edge
  and `ReadingCanvas` renders tools after the document, so it needs a `side: 'leading'` on the tool
  spec — render leading tools BEFORE `children` rather than using CSS `order`, so DOM order and
  visual order do not diverge. (2) The library is always visible, so the contract's required
  `onClose` means adding a toggle with `aria-pressed` and its i18n key in four catalogs.
- **BLOCKED ON FILE OWNERSHIP, not on a decision.** `VisualNovelPanel.tsx` carries another track's
  large uncommitted i18n rewrite (`useT`, `SPEECH_MARKER_KEYS`, `speechSummary`, `formatDuration`
  re-signed). Restructuring its JSX on top of that, then reverting their diff out to build a
  HEAD+edit blob, is the fragile case. Re-check `git status --short` on that file first: if it is
  clean, this is a ~90-minute slice and bullet 1 closes with it.

## 2026-08-25 — surface 6 (VN), the leading edge, and **BULLET 1 CLOSES**

`ReadingCanvas` could only dock on the trailing edge, so the sixth surface needed a contract
change first (`132220b7`): `ReadingToolSpec.side`, default `trailing`, inert to the arithmetic —
the same spec with the side flipped returns identical `contentWidth`, `measureWidth` and tool
width, with `side` itself as the control that something did differ. **A leading tool is EMITTED
BEFORE `children`, never `order: -1`**: `order` repaints the box and leaves the DOM alone, so Tab
and a screen reader would reach the document first and the index that navigates into it second.
`readingCanvas.css` declares no `order` at all and a test asserts that. Mutation control: forcing
`isLeading` to false → 2 red, restored 22/22.

### Surface 6 — the visual novel panel (`b2c6e7f5`)

Same defect as Captures and Library, third instance: `.visual-novel-layout` was `minmax(220px,
290px) minmax(0, 1fr)` with a `@media (max-width: 760px)` stack that reads the WINDOW while the
panel renders inside the Immersion fwin. Live, 600px pane inside a 1264px window:

| | before | after |
| --- | --- | --- |
| canvas | 534 | 534 |
| library | 290 | sheet, 534, `dialog`+`aria-modal`, doc `inert`+`aria-hidden` |
| workspace | **232**, below the 384 floor | 534, restored on dismiss |
| `matchMedia('(max-width: 760px)')` | **false** at `innerWidth` 1264 | n/a |

The old grid was REBUILT LIVE at 534px to get that 232 — the negative control is that the
responsive rule which existed for exactly this case cannot fire. At 820: canvas 754, library
docked leading 290 (left 229 vs doc 531), workspace 452, `--lq-reading-measure: none`. Round trip
600→820: same document NODE, 452 again.

Two things it had to ADD, not move. (1) The library was always visible, so the contract's required
`onClose` needed a real control — a header toggle with `aria-pressed` and a visible pressed state
(accent border live, vs the plain sibling). (2) Both header buttons were **bare UA buttons at
23x110** against the app's own 32px `--lq-hit-target`; 32x116 now. Fixing only the one I added
would have been half a defect.

**Keep the wrapper.** Every `.visual-novel-library` rule is a DESCENDANT selector (`ul`,
`li > button`, `li span`), so rendering the tool content as a bare fragment unstyles the whole
list while the layout still looks right in a screenshot.

### The regression the migration itself introduced (`eb9a07bf`)

Swept all six surfaces for it; **exactly one had it.** Before `efb18eba`, Captures rendered
`<aside className="reading-captures-list">` FIRST against `minmax(180px, 260px) minmax(0, 1fr)` —
the list was the left column. `ReadingCanvas` renders tools after the document, so the media-query
fix silently moved it to the right edge, and nothing caught it because **every assertion on that
surface was about WIDTH, and the width was right the whole time.** Live: list left 123 / passage
left 395 now, vs list left 507 / passage left 123 before. Same widths, mirrored.
The other five were re-derived, not assumed: Immersion `<ImmersionStage/>` then `{showRail &&
<ImmersionRail/>}`, Library's `lib-drawer` after `<main>`, Novels' three `.settings-anchor`
popovers, manga's `.ocr-panel` `position: fixed; right: 0`. All trailing before, all trailing now.

### Traps this slice paid

- **`source.includes('\r\n')` is not a CRLF test.** HEAD's `styles.css` holds 10 stray CRs in
  26,065 lines, so that test called the whole file CRLF and the HEAD+edit blob staged as **26,068
  added / 26,055 removed** instead of 13. Majority, not presence.
- `git hash-object` **refuses `--path` together with `--no-filters`**. Use `--no-filters` alone
  when the blob file already holds the exact bytes you want stored.
- A quoted bash heredoc still ate one level of backslash here (the pinned `\`→`\` trap), which put
  real newlines inside JS string literals. `String.fromCharCode(10)` / `(13, 10)` sidesteps it.

**RULE 1: 256 lines of test, 0 of scaffolding.** `vnCanvas.test.tsx` is the SIXTH caller of
`helpers/readingCanvasSurface` — no new probe, no new harness, and every live number came through
the debug bridge, which leaves no files. Six canvas suites 88/88.

### Bullet 1 status

**CLOSED.** "Establish the common content canvas and reading-side-tool contract" — the contract is
`shared/liquidReadingCanvas.ts` + `components/liquid/ReadingCanvas.tsx`, and all five named
surfaces plus VN use it: Captures, Novels (PDF and EPUB are the same reader), Library, Immersion,
manga, VN. Bullet 2 — "preserve progress, capture, dictionary, mining, source and deep-link
behavior" — is what the next turn opens on, and it is a PARITY question across those six, not a
new migration.

## 2026-08-25 (later) — bullet 2: two remounts nothing could see, and the route sweep that found nothing

`39d2a22c` `40cf77d5` `bf5d198c`. Bullet 2's list — progress, capture, dictionary, mining,
source, deep-link — is mostly state that lives INSIDE a tool, and every assertion on all six
surfaces was a width, a class or an attribute. All of those are identical across a remount.

**Defect 1 (`39d2a22c`).** `ReadingCanvas` renders leading and trailing tools as two children
arrays either side of the document, grouped by RESOLVED placement. React reconciles by key
within an array, not across two, so a leading tool that narrowed into a sheet crossed arrays and
was unmounted and rebuilt. vitest reports it as *"serializes to the same string"* — the two
nodes are byte-identical markup. Fix: group by the tool's DECLARED side. Nothing is given up; a
sheet is `position: absolute; inset: 0; z-index: 2` over an `inert` + `aria-hidden` document, so
neither its flex position nor its reading order is observable. Only Captures and VN declare
`side: 'leading'`, so only those two were affected.

**Defect 2 (`40cf77d5`).** One level up: `renderTool` returned null for every sheet that was not
the newest, under a comment saying they "stay open in the caller's state and reappear" — true of
the STATE, never of the tree. Now `hidden`. **The attribute alone does nothing here:** UA
`[hidden] { display: none }` is (0,1,0) and `.lq-reading-sheet { display: flex }` is (0,1,0) from
a later sheet, so a "hidden" stacked sheet would paint over the live one at full size. Reclaimed
at (0,2,1) in `readingCanvas.css`.

**Instrument:** `expectToolSurvivesPlacementChange` in the one L6 harness. No new probe file.
Node identity, not a scroll offset — jsdom lays nothing out, so a `scrollTop` there is a value
the test wrote to itself.

**Controls, four, all restored after.** Old `isLeading`: 3 red / 24, the two LEADING suites,
trailing control green — localises it to the crossing. `return null`: 2 red / 33. Deleting the
CSS rule: 1 red / 23. `key={tool.id + resolved.placement}`: 3 red / 22, which is what makes the
four trailing surfaces' guards load-bearing rather than free passes.

**Route parity, mechanically.** Set difference of `on[A-Z]…={…}` handlers removed against added,
per migration commit (`efb18eba b555bbb0 95c91741 000c7c4d 439324f5 b2c6e7f5`). Net-removed = 3,
all three the popovers' own close buttons, replaced by `lq-reading-tool-close`. No route to any
named behaviour was dropped.

**Live, Reading Finder / Captures, fwin 820.** (a) canvas 762 docked leading, list scrolled to
300 of 1816 → fwin 480, canvas 422, sheet, `role=dialog`, doc inert, SAME root and scroller
nodes, scrollTop still 300, 42 rows → back to 820, same node, still 300. `precedesDoc: true`
while `placement: sheet` is the discriminator proving the running renderer holds the new module.
(b) `[hidden]` computes `display: none` on a real `aside.lq-reading-sheet.lq-liquid` appended to
the live canvas, `flex` without it — the cascade check jsdom cannot make.
(c) **capture behaviour, both placements.** Docked: click row 7 → passage hash 1126921975 →
1675215115 (84 → 68 chars). Sheet: click row 15 → **no change**, which I first read as a defect
and refuted — `aria-current` DID move to 15, and rows 7/15 are two screen captures with identical
text. Clicking row 0 (a `clipboard` capture) under the sheet: 1675215115 → 1126921975, 68 → 84,
`aria-current` back to 0, document `inert` throughout. Dismissed: tool gone, doc not inert,
passage hash unchanged at 1126921975. `/logs?level=error` total **0**; all live state restored.

**Bullet 2 is NOT closed, and what remains is named.** Closed: no route was dropped, the document
survives on 6 of 6, the tool subtree survives on 6 of 6, stacked sheets survive. Demonstrated
functionally end to end: **capture only, 1 of 6.** Progress, dictionary, mining, source and
deep-link have their routes proven present and their state proven to survive, but have not been
driven. That is the next slice, and progress is the one to do first — NovelReader restores by
FRACTION not page index (`NovelReader.tsx:1088-1095`, keyed on `size.w`), so a reflow is exactly
where it would break, and jsdom cannot see it. Suites: nine L6 files **93/93**, was 68/68.

## 2026-08-25 (later 2) — bullet 2: the reader had no grid column, so it never saw the window

`02c5dd92` `8aaa9216`. Two of bullet 2's five remaining behaviours driven end to end on a real
EPUB (悪の教典 02, part 7) through the bridge: **progress** and **dictionary**. Both defects were
found by driving, not by reading.

**Defect 3 (`02c5dd92`) — `.reader` is `display: grid` with `grid-template-rows` and no
`grid-template-columns`.** That still has a column: one implicit `auto` track, whose base size is
its items' min-content and which only ever GROWS. `.reader-bar` is a nowrap flex row of 18
controls measuring **860 px**, so the track sat at **860.016 px at every host width** and
`.reader { overflow: hidden }` cut off the rest. The row axis had this exact fix already, with a
comment explaining it; the column axis had never been considered.

Measured at the **380 px Blanc allows** (`BLANC_MIN_W`, `main.ts:577` — Blanc hosts this reader at
`BlancShell.tsx:507`): **14 of the 18 bar controls entirely past the right edge** — translation,
lens, reader settings, all six annotation swatches, Collect, both Ask-the-Agent buttons, the
flashcard collection. And one level down, `ReadingCanvas` resolves docked-vs-sheet from its OWN
measured width, which was the frozen 860, **so the sheet placement was unreachable in NovelReader
at any size.** After: track 380, canvas 380, clipped **0**, and Bookmarks resolves to a **sheet**
over an inert document — the first sheet this reader has ever produced. Bar 85→182 px at 380,
**unchanged 56 px at 1264**, absorbed by the `minmax(0, 1fr)` stage row. Wrap over horizontal
scroll: every control stays reachable by pointer and Tab with no gesture.

**Progress survived, which is what the bullet asked.** Head paragraph identical across
1264/docked → 380/sheet → 1264/docked (`何だろう、この嫌な感じは。雄一郎は…`), page 1/2 → 3/4 →
1/2 as a reflow demands, persisted value byte-identical at `p:7:1.0000` / `0.02376848187622909`
throughout. Instrument is the paragraph nearest the reading edge (vertical-rl ⇒ rightmost), not a
page index — a page index MUST change across a reflow, so asserting it is asserting noise.

**Defect 4 (`8aaa9216`) — a sheet covers the document; a surface's document-anchored overlays are
not in the document.** The word/sentence popup is `position: fixed; z-index: 160` and a sibling of
the canvas. With Bookmarks as a sheet at 380: **28×97 px of overlap**, `elementFromPoint` in that
region returning the popup and not the sheet, `aria-modal="true"`, document `inert`, **2 focusable
controls outside any inert subtree**. `ReadingCanvas` now reports `onDocumentCoveredChange` —
additive, optional, fired on the TRANSITION (a caller dismissing on every render could never open
a lookup while a sheet is up). After: popup `null` at 380, not resurrected on widening.

**Controls, all restored.** Reverting exactly the six CSS declarations live reproduces 860.016 px,
the same 14 clipped controls and the tool back to `docked` at 264 inside a 380 px host. Mutating
`.reader` to `grid-template-columns: auto` caught a weakness in the first guard — presence is not
the property — so the sweep now requires a track that can reach zero; both new tests then go red.
Deleting the transition guard turns the ordering test red at 24/25.

**RULE 1: no new probe file, no new harness.** The guard extends `gridTrackFloorsFitTheWindow.test.ts`
— the existing category-4 sweep over every sheet under `src/renderer` — with the column-axis case.
It found **two more instances**, both fixed here (aero `.dict-view`, `.aero-settings`).

**Bullet 2 still OPEN: 3 of 6 behaviours driven** (capture, progress, dictionary). Mining, source
and deep-link remain. **Trap for the next worker: you cannot narrow the main shell below 940 px**
(`main.ts:696`), so a reader reflow has to be simulated by constraining `.reader`'s width inline —
faithful, because `size` comes from a `ResizeObserver` on the scroller and the canvas measures its
own box. What is NOT faithful that way: anything reading `window.innerWidth`. The lookup popup is
one (`min(560px, 100vw - 32px)`), and it read as "does not reflow" until I checked — an artefact,
not a finding.

## 2026-08-25 (later 3) — bullet 2 CLOSES: mining, source, deep-link, and the RO trap that nearly became a finding

`daf70721`. The last three of bullet 2's six behaviours, each driven end to end on the surface
that owns it, each with a control that had to fail and did.

**Mining — Library, no defect.** `runReadingAction('mine')` writes `epubMining` to
`localStorage` and dispatches `os:open` + `flashcards:openEpubMining`. Driven from inside the
SHEET: drawer docked 262 at canvas 772 → sheet 592 at canvas 592 → docked 262, tool node and
`[data-reading-action="mine"]` both carrying the JS expando they were marked with, so neither was
rebuilt. Clicked in the sheet: handoff `{"bookId":"078d8fa0-…","ui":"simple"}`, both events fired,
the Flashcards window opened, the handoff read back `null` (consumed), and step 1's `<select>`
resolved to that exact id — **1 of 21 options**, code points 悪の教典 02. Document `inert` +
`aria-hidden` throughout, not inert after. Two controls: a **manga** item offers `read, dictionary`
and **no `mine`** (`readingWorkspaceActionApplies`'s epub rule, live); and a genuine
close-then-reselect **across two eval calls** reads `REBUILT` on both marks — batched into one call
it does not, because React nets the two state changes into one render and never unmounts.

**Deep-link — Captures, defect found and fixed.** See the commit. Staged through the real
`readingPassageHandoffStage`: section, head, `aria-current` all correct while `data-covered="true"`
and the document was `inert` at a 552 px canvas. `useReadingDocumentCover()` now lives in the canvas
module so the other five surfaces cost a line each. After: covered null, tool absent, document 552
and live, head `LQ-DEEPLINK-PROBE-2`, passage **34 chars** exact, toggle `aria-pressed="false"` and
visible. Docked control at 1142: tool stays docked 260, document 870, head and `aria-current` on the
arriving capture. Mutations `false &&` → sheet test red, `true ||` → docked test red, one each.

**Source — Captures, no defect.** `source: 'image'`, `sourceLabel: 'LQ-SOURCE-B / poster p.3'`.
Docked 1142/870: row title = the label, row meta = **"Image"** localised with **no `settings.lens`
key leak**, head = the label. Narrowed to 552: **sheet**, row and head both on their original nodes
(`row-mark-b`, `head-mark-b`), same title, same meta, head correctly inside the inert document.
Back to 1142/870: identical, head not inert. All four `READING_LENS_SOURCES` have catalog keys.

**THE TRAP, and it produced a false finding I had to retract before writing it down: an unfocused
Electron renderer does not deliver ResizeObserver notifications.** Setting `.fwin`'s width inline
moved the box (580 → 639 → 835, `getBoundingClientRect`) while `data-content-width` stayed at
**756** — a canvas apparently frozen at a stale width, which reads exactly like a product bug and
survived a full `/reload`. It is not: an **independent** RO attached from the bridge to the same
element also logged **zero** entries, and a React state change in the same eval did not help
either — React commits without a frame, RO delivery needs one. `POST /focus` and the same resize
fires immediately: `fired: [652]`, believed 652, real 652. **Focus the window before any
bridge-driven resize, and check `data-content-width` against the real box before believing a
placement.** Every earlier resize this turn happened to be in the same eval as a click while the
app still had focus, which is why they were real.

**Bullet 2 CLOSED.** Six of six driven: capture (2026-08-25), progress + dictionary (later 2),
mining + source + deep-link (here). Route parity, document survival 6/6 and tool-subtree survival
6/6 were already swept mechanically. Suites: `readingCapturesCanvas` **8/8** (was 6), neighbours
36/36. Full `npx vitest run` **1 failed / 11,397 passed / 836 files** — the one red is the foreign
`architectureBaseline` ← `externalSubtitleMount.ts`, identical to the previous turn's baseline.

## 2026-08-25 (later 17) — L6's Gate, scored by RUNNING the category-4 harness. Three defects.

The turn opened on an interrupted worker's uncommitted 77-line `readingCanvas` block inside
`probes/l1-use-of-space.js` — a RUN-shaped extension, not a new probe. It was finished, run, and
found three things no jsdom assertion on any of the six surfaces could see.

**The split that decides the number, because the raw one lies.** First run: 8 focusable "leaks" in
Reading Finder, 16 in Immersion, which reads like wholesale focus-containment failure. Measured by
rect, **0 of Reading Finder's 8 were painted over the document** — all eight are the window's own
workspace tab strip, above the canvas, and a canvas-scoped sheet does not claim the window's
navigation any more than its title bar. Exactly **1 of Immersion's 16** was real. So the harness now
reports `overDocument` (the gate number, must be 0) and `elsewhereInWindow` (context, not a defect),
and the leak filter is keyed on the sheet ELEMENT, never on `[aria-modal]` — keying an instrument on
the claim it exists to check makes it agree with whatever the markup asserts.

**Defect 1 — `89279302`.** `.visual-novel-open`, `position: absolute; z-index: 4` on
`.immersion-root` and a SIBLING of the canvas. Sheet, canvas 342: button 409,240 136x26 inside a
sheet of 215,238 342x469, on its header, `elementFromPoint` at the button's centre returning the
button over an `inert` document. Docked, canvas 550 — **the default state, and worse**: button
849,240 136x26 over a rail of 777,238 220x469, covering 32x19 of the rail's close control (952,247
32x32); `elementFromPoint` at that control's own centre returned `button.btn`. **The rail's × was
dead.** Hiding it under a sheet was written first and was half a fix; it moved into the toolbar row
via a new additive `trailing` slot instead. After: `hitIsClose` true, `btnOverRail` height −10.

**Defect 2 — `c8db7642`.** `.immersion-toolbar` is nowrap with `overflow-x: visible`: `scrollWidth`
588 in `clientWidth` 342 at the 380px Blanc allows — **246px of overflow, 7 of 14 children entirely
past the right edge**, including `.immersion-sites-toggle`, the trigger for the tool this gate is
about. The url form was hiding it: at `flex: 1; min-width: 0` it collapses to width 0, the row still
does not fit, and the shortfall lands on everything after it. `flex-wrap: wrap` + a 160px form floor.
After: overflow 0, past-edge 0, `clipped` **21 → 0**; one row at 820 (782x44), three at 380 (342x109).

**Defect 3 — `16c306fd`.** The sheet claimed `aria-modal="true"` while 8/15 focusables stayed
Tab-reachable outside it. A screen reader honours the claim and hides them; the keyboard does not.
Containment was rejected because the same tool is a DOCK at a wider canvas — a keyboard model that
changes with window width is its own defect — so the claim goes: `aria-modal="false"`, explicit,
`TourOverlay` precedent. The document stays `inert` + `aria-hidden`, which was the true part.

**RULE 1, and why there is no new sweep for defect 2.** A nowrap control row is NOT decidable from
CSS: whether it overflows depends on how many children the TSX renders. A source predicate broad
enough to catch `.immersion-toolbar` flags **29 rules** across `src/renderer`, mostly two-button
action pairs that must never wrap. So this half of category 4 is scored by the live harness (already
surface-parameterised) and `gridTrackFloorsFitTheWindow.test.ts` keeps named latches. Recorded there
so it is not re-derived. Turn total: 0 new probe files, 0 new harnesses, 0 new test files.

**Gate status: still OPEN.** Only Immersion has been run. Category 4 at 380 after the fixes —
`clipped` 0, `hiddenOverflowX` 0, `horizontalScrollers` 0, dead region 6.1% of window,
`overDocument` 0, `covered` true, `docInert` true. The other five surfaces have not been run and
the eight rubric categories have not been scored, so no 80/80 is claimed for anything.

## 2026-08-25 (later 18) — three more Gate surfaces run. Two shipped defects, two harness defects.

Gate still OPEN: **3 of 6 surfaces clean** (Immersion from last turn, plus Library and Reading
Captures here), Novels partially run, manga and VN not run, and no rubric category is scored.

**`6883a59a` — the header THIRTEEN views share.** Library at the 380px Blanc allows:
`div.fwin-body 726>368` under `overflow-x: hidden`, 358px gone with no scrollbar, `clipped` 8
including three buttons. `.view-head` is a nowrap flex row of `p.muted` (114) and `.actions`
(642), and `.actions` was `flex-shrink: 0`, so the row floored at 726 min-content at every host
width. Both halves are load-bearing and the intermediate state proves it: wrapping the header
alone left `.actions` at its 642 max-content on its own line — `clipped` 8 → 5, overflow still
1 at `660>368`. **A wrap container only wraps when its own box is constrained.** After: 0 / 0,
`bodySW` 368, dead region 22.4% → 9.4%. Dictionary, Grammar and Translate re-measured at 380
after the change: 0 / 0 each, no regression.

**`2ea2ac29` — the same category on the OTHER axis, and the bigger number.**
`.reading-workspace-panel` was `overflow: hidden` with `> * { height: 100% }`, a bet that every
section scrolls itself; five of the eight do not. `clipped` 77 at 380, **41 at the default
820x580**, still 3 at 1100x700 — and `xCount` 0, `yCount` 77: all of it leaving downwards.
Discover held `scrollHeight` 740 in `clientHeight` 460; the Library section 2118 in 460. The
window's own `.fwin-body` is `overflow-y: auto` and never saw it, because the panel clamps
first and its `scrollHeight` never propagates. `overflow-y: auto` keeps the self-scrolling
sections at `height: 100%` with no second scrollbar. Negative control: forcing `overflow-y:
hidden` back inline on the Library section returns **193** unreachable boxes; removing it, 0.
All eight sections after: 0.

**`138f3a26` — the harness was wrong twice, and one of the fixes nearly hid the fix above.**
(a) Opening a book replaces the desktop shell: `.fwin` count **0**, so a title-keyed harness
scores L6's own Novels surface as absent. Entries may now be `{ root: '<selector>', title }`.
(b) On a real EPUB it read `clipped` **132** at 820 and 239 at 380, all x-axis, all descendants
of `div.novel-content` **806px left of the surface** inside `div.novel-scroller` — the
product's own pagination, invisible to both existing numbers because content at a negative
offset never counts towards `scrollWidth`. A box entirely outside its nearest clipping ancestor
is outside THAT viewport. **The narrowing that keeps it honest: the clipper must itself report
no hidden content** — without it, `.reading-workspace-panel`'s 740-in-460 would have been
exempted and `2ea2ac29` would never have been found.
(c) `/bounds` on the debug bridge, because a full-window surface cannot be narrowed by an
inline width mid-tree — that left `.novel-scroller` holding a page buffer sized against a
container that had not moved. Verified live after a restart. **It measured its own trap: asking
for 380 yields 924, the desktop's minimum**, so only the response's `contentSize` may be
reported. Restart cost: none, 11 fwins restored, all three clean surfaces reproduced.

**NEXT: manga and VN through the same driver, then Novels in a REAL narrow host** — Blanc
(`BLANC_MIN_W` 380) or `/bounds` at 924, never an inline width on `.reader`.

## 2026-08-25 (later 19) — Gate surfaces 4 and 5: VN clean on a RUN, manga had never fitted

Gate still OPEN: **5 of 6 surfaces clean** (Immersion, Library, Reading Captures, + VN, + manga);
Novels is the one left and it is the one that needs the real narrow host. No rubric category is
scored, so nothing here claims 80/80.

**VN — a pure RUN, no new instrument, no defect.** `.visual-novel-open` in the Immersion toolbar,
then `lq-cat4-sizes.cjs "Immersion" "380x580,820x580" who`. 820: `clipped` 0, `overlaps` 0,
`xCount`/`yCount` 0, doc 452x344, `contentWidth` 452. 380: `clipped` 0, `xCount`/`yCount` 0, the
library becomes a sheet (`covered` true, `docInert` true, `overDocument` **0**), and the one
`overlaps` entry is the sheet over the doc, which is what a sheet is. `sheetRoleAria`
**`dialog/false`** next to `elsewhereInWindow` 2 (`Hide library`, `Back to browser`) — that is
`16c306fd` holding: the sheet does not claim a modality the keyboard does not honour. Style
restored byte-identical.

**`76e56aff` — the manga OCR overlay has never fitted, at any zoom, on any page.**
`.reader` is a full-window surface, so it needed the driver's new **`host` flag** (`/bounds`
instead of an inline width; see below). One Punch-Man ch.229 in translate mode, page rendered
**512 of 2400 natural px, scale 0.214**: `clipped` **2** at BOTH 924x580 and 1264x821, both `p`
inside `div.ocr-text.manga-ocr-text`, both leaving downwards, `yCount` 2.

Cause: `MangaOcrOverlay` lays every box out as a **percentage** of the rendered page and emits
`fontSize` in **image pixels**. The boxes shrink with the stage; the type does not. A 2400 px
scan in a window is never 1:1, so this fitted at no size the product can produce. Measured, the
five blocks' hidden text — `scrollHeight - clientHeight`:

| block | 1 | 2 | 3 | 4 | 5 |
| --- | --- | --- | --- | --- | --- |
| before | 198 | 20 | 0 | 224 | **544 of 568 (4% visible)** |
| after | 0 | 0 | 0 | 0 | 8, and reachable |

Negative control, run BEFORE writing the fix: multiplying each block's inline `font-size` by the
live render scale took 198/20/0/224/544 → 0/0/0/0/**5**, which both proved the cause and showed
that the scale fix alone is not enough — a translation is longer than the line it replaces.

Fix, two halves, both needed. (a) `.manga-ocr-layer` becomes `container-type: inline-size` and
the font is emitted as `${fontPx / img_width * 100}cqw` — exactly the authored size times the
render scale, the same ratio the boxes already use, reflowing on zoom and resize with no
measurement and no ResizeObserver. Live after: `containerType` `inline-size`, `1.6703cqw` →
computed `8.55977px` at layer width 512, i.e. 40.0877 × 0.2135 to five figures. (b) the residual:
`.manga-ocr-block.translated .manga-ocr-text` gets `overflow-y: auto`, because that text is
PAINTED and `.manga-ocr-text`'s blanket `overflow: hidden` is only right for the transparent
Japanese alignment layer. `clipped` 0 / `overlaps` 0 / `xCount` 0 / `yCount` 0 at both host sizes
after; host content size restored identically.

**RULE 1 — the driver grew a `host` mode instead of a sixth reader-shaped probe.**
`lq-cat4-sizes.cjs`'s argv[4] is now a flag list, and `host` sizes the OS window through
`POST /bounds` rather than writing an inline width mid-tree. That is what every remaining
full-window surface needs — Novels, the Agent pop-out, Blanc, Focus — so each is now a RUN. It
reports the size `/bounds` measured BACK, never the size asked for: **380 yields 924**, the
desktop minimum, and a row labelled 380 would name a size nothing was measured at. Restore uses
`contentSize`, not the outer bounds, or the window grows by the frame every round trip.
Guards: two named latches in the existing `gridTrackFloorsFitTheWindow.test.ts`, no new test
file. Mutation controls, both restored and re-verified green at 79/79:
`container-type: inline-size` → `normal` = 1 red; dropping `overflow-y: auto` = 1 red.

**Trap paid, and it nearly shipped.** Reverting that second mutation with a whole-file
`String.replace('  scrollbar-width: thin;\n', …)` put `overflow-y: auto` into
**`.media-hub-shelf-row`** — the FIRST of four matches in a 26k-line sheet — and the manga rule
stayed broken, so the suite failed for a reason that had nothing to do with the assertion. Anchor
a revert on the surrounding rule, never on one common declaration, and read `git diff -U0 … |
grep '^@@'` back afterwards: mine were exactly `+8955,7` and `+9323,8`.

**NEXT: Novels through `node debug/lq-cat4-sizes.cjs "@.reader" "380x580,1264x821" "who,host"`**
with an EPUB open — the same command that scored manga, now that `host` exists. Then the Gate's
own sentence (legible and stable at all sizes; no tool obscures the document) can be answered for
all six.

## 2026-08-25 (later 19, second slice) — Novels in a real narrow host: **6 of 6 Gate surfaces clean**

`node debug/lq-cat4-sizes.cjs "@.reader" "380x580,1264x821" "who,host"` with ハサミ男 open, i.e.
the same command that scored manga. First run: **`clipped` 645 at 1264x821, 863 at 924x580,
`hiddenOverflowX` 1 (`div.novel-scroller 3782>1262`)**, every one on the x axis.

**It was a harness false positive, and the previous narrowing could not have caught it.** That
narrowing exempted a clipper reporting `scrollWidth <= clientWidth`, which held for a horizontal
EPUB because its earlier pages sit at negative x and never count. This book is **`vertical-rl`**:
the scroll origin is at the RIGHT edge, so the pages not yet turned to are at negative x and DO
count as forward extent — the identical mechanism producing the opposite reading. Driven live
rather than reasoned about: `Next ›` moved `.novel-content` from x **-2519 to -1259**, visible
paragraphs **23 → 36**, `Prev ‹` restored both. Nothing was lost.

Geometry cannot decide this, so the surface declares it and the probe CHECKS the declaration.
`.novel-scroller` gains `data-paged="true"`, Prev/Next gain `data-paged-control`, and the paged
layout effect publishes the grid it already computes as `data-paged-pages` / `data-paged-step`.
The exemption then requires all three: the claim, an **enabled** control, and the arithmetic
**`(pages - 1) * step + clientWidth >= scrollWidth`** — the statement "every pixel of the buffer
lands on some page", which is exactly what `pad` in that effect exists to make true. Measured:
3 pages, step 1260, clientWidth 1262, scrollWidth 3782 → 2×1260 + 1262 = **3782 >= 3782**.

After: **`clipped` 0, `overlaps` 0, `hiddenOverflowX` 0, `horizontalScrollers` 0 at both host
sizes**, doc 924x483 / 1264x724 with `contentWidth` tracking, dead region 8.3% / 6.2%, host
content size restored identically.

**Negative control, both halves, live and non-persistent (`debug/lq-pager-control.cjs`):**

| state | clipped | hiddenOverflowX |
| --- | --- | --- |
| baseline | 0 | 0 |
| `data-paged-control` removed | **66** | **1** |
| restored | 0 | 0 |
| `data-paged-pages` forced to 1 | **66** | **1** |
| restored | 0 | 0 |

So the exemption is not "declare the attribute and the category cannot see you" — either half
falsified and the surface scores as loss again. `.reading-workspace-panel` still scores its 77,
because it declares nothing.

Guard: a third named latch in `gridTrackFloorsFitTheWindow.test.ts` holding all three parts of
the contract on both sides (reader and probe). 92/92 with `novelReaderCanvas` and
`novelsViewModes`. No new test file, no new probe file; `lq-pager-control.cjs` is gitignored
tooling and its numbers are in the table above.

**Two things the next worker should NOT re-derive.** (1) The driver's `WHO`/`AXIS` halves are
separate inline expressions and do NOT share `outsideItsClipper`, so they still print
`xCount` 66/83 on this surface. That is the raw split, not the gate number — the gate number is
`clipped`. (2) The manga overlay's transparent Japanese layer (`highlightOnly`) could not be
measured: every block on the OCR'd page is `.translated`, and Regions mode did not mount the
outline path either. The `cqw` fix applies to both call sites identically, but only the painted
one has live numbers.

**NEXT: L6's Gate sentence can now be answered for all six surfaces** — "content remains legible
and stable at all sizes; no tool obscures the document". Category 4 is clean on 6 of 6; the
`no tool obscures` half already has `overDocument` 0 everywhere it was measured. What is NOT
done and must not be claimed: **no rubric CATEGORY is scored for L6, so there is no 80/80.**

## 2026-08-25 (later 23) · primary — the two surfaces category 7 recorded as EMPTY, and a harness that agreed too easily

The 2026-08-25 sweep left Dictionary and Translate **EMPTY → unmeasured** ("the rubric caps an
empty harness at 0, so those two are unmeasured, not clean"). Populated Dictionary through its
own search form (native value setter + `input`, then the `.dict-search` submit button) and re-ran
`probes/cat7-collection-weight.cjs`. **Two harness defects surfaced, in series.**

1. **`--scroller` searched DOWN only.** `c.querySelector(sel) || c` cannot find an ANCESTOR, and a
   list that is not virtualised scrolls in one — Dictionary's results scroll in `.fwin-body`. The
   lookup missed and **silently fell back to the container**, reporting `scroller "dict-entries"`,
   `scrollHeight 1584 / clientHeight 1584`, **overdraw 1**, verdict **FITS**. The real viewport is
   **2633 over 545 = overdraw 4.8**. Now: descendant, then ancestor chain, then in-scope-and-
   contains; a `--scroller` that resolves to nothing **REFUSES**. Control: `--scroller
   ".no-such-scroller"` exits non-zero with the refusal, so the fallback cannot come back silently.
2. **The spacer rule was in the comment and not in the code.** "a child taller than the scroller's
   own client box **that contains no rows of its own directly**" — only the height half was
   implemented. Harmless while the scroller *was* the container; the moment an ancestor became
   reachable, Dictionary's plain content wrapper (2601px inside a 545px `.fwin-body`) matched on
   height alone and the run reported **INERT** — the harness's most serious verdict, meaning
   shipped virtualisation that does nothing. Both halves are now checked.

**Dictionary, measured: rows 8, domRows 8, nodes 221, scrollHeight 2633 / clientHeight 545,
overdraw 4.8, spacerHeight null, 3 distinct row heights → UNWINDOWED.**

**UNWINDOWED here is NOT a finding, and the next worker must not "fix" it.** The cap is
`src/main/dictionary.ts:253` — `lookupInDictionaryDb({ text: q, limit: 8 })`, and `:281` for the
fuzzy pass. Verified live rather than read: `kami` returns 8 and the deliberately broad `water`
also returns **8**, so the collection is hard-bounded at 8 and cannot grow. Virtualising an
8-row list would be damage. The verdict vocabulary has no BOUNDED state; this paragraph is the
substitute, deliberately, rather than a third repair to the harness in one turn.

**What that cap IS, and it belongs to category 8 rather than 7 — carried as the next slice.** The
renderer shows 8 entries with **no "showing 8 of N"** and no way to reach the ninth: `entries =
result?.entries ?? []` (`DictionaryResults.tsx:850`) rendered straight into `.dict-entries`
(`:942`). A truncated result presented as a complete one is exactly what the honest-states
category exists to catch. An honest fix needs the true match count out of the main-side lookup —
main does not hot-reload, so it is an opening slice, not a tail-of-turn one.

Translate remains **EMPTY / unmeasured**; only Dictionary was populated this turn.

## 2026-08-26 (later) · primary — category 6 gets its node half, and a control that was measuring its own decay

RULE 1 audit before writing anything: `l6-parity.js` (982 lines) IS the category-6 harness and is
already a consolidation of `l6-parity-dictionary.js` — 5 specs, `dictionary/grammar/translate/
agent/captures`, 7/8/7/8/6 rows. What did **not** exist was the node half. It was three
single-use runners, each hardcoding one app: `l6f-roundtrip.cjs` (`__L6`, "notes" placeholder),
`l6f-controls.cjs` ("7 -> 6" as a literal), `l6m-parity-run.cjs` (`__L6M`). `cat6-feature-parity.cjs`
is those three with every app name removed; `--app` is the only thing that varies. Three additive
engine accessors feed it: `__titleRe`, `__mutations`, `__drive`.

**Three instrument defects found and fixed in the same file, in order.**

1. **The dirty happened BETWEEN the two parity checks.** First run reported
   `input: standard=false liquid=true` — a parity break the driver had caused, because it typed
   into the textarea after checking the first presentation. Everything that changes the surface
   now happens before EITHER check.
2. **Declaration order is the wrong drive order for Translate.** With `highlight` third, the two
   steps after it re-render and collapse the caret, so `agentHandoff` read its label back
   unchanged — a live feature scored dead by the order it was driven in. Specs may now declare
   `drive: [...]`; Translate's is `type, swap, run, collapse, highlight`.
3. **The control was measuring the previous mutation's cleanup.** One baseline reused across
   three mutations gave `fell 4-5 rows` every time and VOID. Rows that pass by comparing against
   a step-recorded `before` cannot survive `restore()`, which consumes those globals. Each
   mutation now gets its own freshly driven baseline and `exactlyOwnRow` is measured against it.
   Same three mutations, after: `direction` **fell exactly [direction]**, `windowLifecycle`
   **fell exactly [windowLifecycle]**, both returning to `7/7`.

Also fixed: **`swap` is a drive step, not a mutation, so `restore()` never undid it** and the
driver left the live desktop's translate direction reversed. Added `undo.swap`; direction verified
back at `日本語 -> English`, textarea back to empty.

**Translate, measured (`baselines/cat6-l5-translate.json`):** parity **6/7 standard, 6/7 liquid,
`rowsAgree` true, 0 rows in only one presentation**. Round trip standard -> liquid -> standard with
`.tr-textarea` deliberately dirtied: **`fieldsHeld` true, `shellHeld` true, 0 diffs**, box 820x580
in both. Not a PASS: `allRowsReachable` is false on the scored drive.

**The one open row, and it is the opening slice — it is NOT yet shown to be a product defect.**
`agentHandoff` reads `before="Ask the Agent" after="Ask the Agent"` on the FIRST drive, and
**7/7 with it passing on the second and third**. The two i18n strings genuinely differ
(`translate.askAgent` "Ask the Agent" vs `translate.askAgent.selection` "Ask the Agent about the
selection", `en.ts:3887/3898`) and the wiring is real (`TranslateView.tsx:97` `onSourceSelect` ->
`setSelection`, `:82` picks the label). Measured in isolation with `document.hasFocus() true`,
`activeElement === textarea`, selection `[0,2]`: label unchanged. The likely mechanism is React's
`SelectEventPlugin` seeding `lastSelection` at `focusin` and suppressing an identical range, which
would make it a warm-up artefact of a synthetic `keyup` rather than a defect — **but that is a
hypothesis, not a measurement, and the row stays FAILING until it is settled one way.** Settle it
before scoring any category-6 cell that depends on a select-driven row.

**No L6 surface has a category-6 spec yet except `captures`.** Library was inventoried for one this
turn — `.lib-folder-chip` x20 with `All 24 / Manga 3 / Inbox 0 / Unfiled 21`, `.lib-inbox-filters`
language and level chips, two `select`s in `.lib-sort-row`, `Covers`/`List` at
`.aero-library-layout-switch` carrying real `aria-pressed`, 24 `.card`, **86 buttons and zero text
inputs**. That last number is why `snapshot()` now records scroll offsets: on a surface with no
editable field they are the only user state a round trip can lose, and without them Library's round
trip would have compared chrome to chrome and held no matter what.

### Same turn, continued — the open row was the instrument, and Translate closes at 10/10

The `agentHandoff` question above is **SETTLED, and the answer is that the feature works.**
Measured in four separate bridge calls: type, then `focus()` **in its own call**, then
`setSelectionRange(1,4)` + `keyup`, then read. Label went `"Ask the Agent"` ->
**`"Ask the Agent about the selection"`**. The same sequence with `focus()` and the select in
ONE call leaves the label unchanged, with `document.hasFocus()` true, `activeElement === el`
true and the range genuinely set. So trap 6 gets a third refinement: `selectRange` no longer
focuses — it REFUSES unless the element is already active, and focusing is its own `focus` step.
No product change was made or needed.

Two more driver defects fell out of that and are fixed in the same file:

4. **The dirty went AFTER the drive**, so typing into `.tr-textarea` fired React `onChange`,
   `TranslateView.tsx:263` ran `setSelection('')`, and the scored check read `agentHandoff`
   false — the instrument erasing the state its own drive step had just set. Dirty now runs
   BEFORE the drive; the drive may overwrite the value and snapshot A records what is really
   there.
5. **A declared cascade is not a broken control.** Clearing the textarea empties the span the
   ask-agent button would send, so that button correctly disables and its row correctly falls:
   two rows down, one feature removed. Specs may declare `cascades`; anything a mutation takes
   with it that is NOT declared still voids the control.

**Translate, category 6: PASS 10/10** (`baselines/cat6-l5-translate.json`). Parity **7/7
standard, 7/7 liquid**, `rowsAgree` true, **0 rows reachable in only one presentation**. Round
trip standard -> liquid -> standard with `.tr-textarea` dirtied: `fieldsHeld` true, `shellHeld`
true, **0 diffs**, 820x580 both. Control **fires and restores on all three mutations** —
`direction` fell `[direction]`, `input` fell `[input, agentHandoff]` with `agentHandoff`
declared and `unexpected []`, `windowLifecycle` fell `[windowLifecycle]`, each returning to 7/7.

Translate is an **L5** surface, so this does not move the L6 board (still 30 of 48 cells). It is
the calibration that makes the L6 cells cheap: the next five L6 surfaces need a **spec**, which
is ~40 lines of data, not a runner. Live state left as found — every window back in its found
presentation (only Video is liquid), Translate empty and pointed 日本語 -> English.

## 2026-08-26 (later) · primary — Library category 6, and RULE 1 paying out for the first time

**Library, category 6: PASS 10/10** (`baselines/cat6-l6-library.json`). Parity **9/9 standard,
9/9 liquid**, `rowsAgree` true, **0 rows reachable in only one presentation**. Round trip
standard → liquid → standard: `fieldsHeld` true, `shellHeld` true, **0 diffs**, 820x580 both.
Control fires on **all five** mutations — `folderTree`, `layoutSwitch`, `groupBy`, `cardActions`,
`windowLifecycle` each fell **exactly its own row** (9/9 → 8/9), `unexpected []`, each back at 9/9.
Board **31 of 48**.

**RULE 1, measured.** This cell cost **one spec plus six shared helpers, no new probe file and no
change to `cat6-feature-parity.cjs`** — the first L6 surface to be a pure RUN of the category-6
harness. First run, first pass; nothing was repaired.

**The problem this spec had to solve, and it is new.** Library is the first L6 surface with **zero
editable text fields** (91 buttons, 0 inputs), so the driver's `dirtyField` finds nothing and the
round trip would have compared chrome to chrome and held no matter what the toggle did. Fixed by
making **scroll a drive step**: `fwin-body` scrolled to **240 of a 1,605 px range** before
snapshot A, and the trip had to bring it back — it did. On a surface with no text field, scroll is
the only user-entered state there is; a round trip driven without one is vacuous, not clean.

**Every row is a cross-check, never a count.** `sortOrder` scores the RENDERED order, per group,
not the select's value; `layoutSwitch` requires `aria-pressed` to agree with the container that
actually mounted; `folderFilter` requires the card count both to have CHANGED and to equal what
the active chip advertises; `groupBy` requires every bucket to carry its heading and the buckets to
account for every card. Each half alone passes on a dead control.

**Four traps paid here, for the next spec.**
1. **A select needs `change`, not `input`** — `pickSelect` uses the native `HTMLSelectElement`
   setter then dispatches `change`. `typeInto`'s `input` event does nothing for a `<select>`.
2. **The driver runs the drive TWICE PER MUTATION**, so a step that is a no-op the second time
   round breaks its own row. `folder` alternates between the two largest chips instead of clicking
   a fixed one, and never lands on an empty folder.
3. **A row that compares against a step-recorded `before` is contaminated by later steps.**
   `sortOrder` was almost written that way; the folder step narrows the list afterwards, so the
   first title changes anyway and the row would have passed for the wrong reason. Rows that can be
   made order-independent should be.
4. **`.lib-folder-chip` is three different things** — the folder rail, the layout switch and the
   inbox filters all use it. Scope by container or `folderTree` scores 20 chips with 4 actives.

Live state left as found: presentation `standard`, sort `date-desc`, group `none`, folder `All 24`,
24 cards, `fwin-body` scrollTop 0, `__LQP_LIB_ORIG` null.

## 2026-08-26 (later 2) · primary — Immersion category 6, on a page it had to actually load

**Immersion, category 6: PASS 10/10** (`baselines/cat6-l6-immersion.json`). Parity **7/7 standard,
7/7 liquid**, `rowsAgree` true, **0 rows in only one presentation**. Round trip standard → liquid →
standard with `.immersion-url` dirtied: `fieldsHeld` true, `shellHeld` true, **0 diffs**, 820x580
both. Control fires on all five mutations — `urlBar`, `modeSwitch`, `siteRail`,
`railReversibility`, `windowLifecycle` each fell **exactly its own row** (7/7 → 6/7), each back at
7/7. Board **32 of 48**. Second consecutive cell that was a RUN plus a spec, no driver change.

**The state it was driven in, because the rubric caps an empty harness at 0.** As found, Immersion
was `.immersion-empty` — "Open a page to begin immersion reading", five starter buttons, **zero**
loaded content — on which `urlBar`, `modeSwitch` and `readerExtraction` are all vacuous. Driven to
`https://ja.wikipedia.org/wiki/日本語` through the product's own URL bar: live `<webview>`,
**80,394 characters** extracted by Reader mode, scroll range **177,566 px**, 20 rendered history
rows. Every number in the baseline is from that state.

**Rows are composition cross-checks, not counts,** because everything this surface can get wrong is
a disagreement between a control and the stage: `urlBar` requires the address bar to equal the
webview's `src`; `modeSwitch` scores the active mode against the real branch table at
`ImmersionContent.tsx:172-175` (live → webview only, reader → both, focus → reader only);
`railReversibility` requires the toggle's boolean to agree with whether the tool is mounted.

**Three things worth the next worker's time.**
1. **The starter state is the only route to a page, and the reader is ASYNC.** Right after
   navigating, `readerChars` is **0** and reader mode legitimately shows webview-only — so a strict
   composition table scores two rows false on a surface that is merely still loading. Wait for the
   extraction BEFORE running the harness (`fetchReadableArticle` retries 6–12 times with growing
   delays); `open` is then a no-op on all eleven drives and the whole run costs ONE page load.
2. **`news.web.nhk` is NOT a typo.** The first starter's host looks wrong next to
   `readingSites.ts:121`'s `www3.nhk.or.jp`, and it is not — `shared/nhkArticle.ts:3` declares
   `NHK_NEWS_HOSTS = {news.web.nhk, www.web.nhk}` and the page loads. It does sit behind a consent
   gate, so its extraction is **322 chars** of consent text; Wikipedia is the better subject.
3. **Immersion has no route from a loaded page back to the starter state** — Back/Forward/Reload
   and actions only. Transient view state that dies with the window, so it is left loaded; the two
   history rows the run created (NHK, Wikipedia) ARE persisted and were removed through the rail's
   own `.immersion-site-remove`, verified back to 0 matches.

Live state left as found: every window in the presentation it was found in (only Video liquid),
Immersion mode `reader`, rail open, site history back to what it was, reader scrollTop 0.

## 2026-08-26 (later 3) · primary — the one-way door in Immersion, closed

**Product slice, not a measurement.** Scoring Immersion for category 6 turned up a reversibility
gap the category's own rows could not see, because every row it has assumes a page is loaded:
**opening a page was a one-way door.** Back, Forward, Reload, the three view modes and eight page
actions all require a page, so once anything had loaded the starter state — five curated
destinations and the "open a page to begin immersion reading" copy — was **unreachable without
destroying the window.** That is the repo's own "every enable/open flow owes a disable/close path"
invariant, on the surface whose category-6 cell had just been banked.

**What landed.** `closePage` in `useImmersion` — the exact reverse of `navigate`: `flushStats()`
FIRST (or the time on the page being closed is discarded rather than banked), then `currentUrl`,
`urlInput`, `readerHtml`, `error`, `status`, `popup`, `title`, `loading` and the lookup highlight.
Rendered in **all three hosts** that own this toolbar — the shared `ImmersionToolbar` (Study OS
classic + Blanc), the Aero toolbar in `ImmersionView.tsx`, and the View menu — because the aero bar
does not render `ImmersionToolbar` and would otherwise have had no route back. Four i18n keys ×
two strings; `i18n-check` **10,916**, was 10,914.

**History and the saved-sites rail are deliberately NOT cleared.** The rail is the route back to
what was just closed, and clearing the stack would make closing a page destroy the trail as a side
effect. Asserted, not just intended.

**One neighbour fixed with it.** `reload()` opens `if (!currentUrl) return;`, so in the starter
state Reload was an **enabled control that did nothing and said nothing** — the same category-8
defect its two neighbours had been fixed for one entry above. Now disabled with the same reason
string. `immersionCanvas.test.tsx` asserted the old behaviour in prose ("because it is never
disabled"), which described the shipped code rather than a decision; both its assertions were
updated with the reasoning inline, and the disabled-button count went **2 → 4**.

**Live acceptance through the bridge, numbers.** Starter state: 4 disabled nav buttons, each with
a reason title distinct from its `aria-label`. Navigated to `ja.wikipedia.org/wiki/Main_Page`:
Reload and Close page both enabled, titles fall back to their labels. Clicked Close page: 5
starters back, webview **false**, reader **false**, url `""`, control disabled again, rail
**20 rows** and still `aria-pressed="true"`. Site history returned to as-found (3 Wikipedia rows
this run created removed through the rail's own control; `wiki: []`).

Tests: `immersionClosePage.test.tsx` (4 cases), plus `immersionCanvas` / `immersionRailWindowing` /
`liquidSurfaces` / `liquidControls` — **66 passed**.

## 2026-08-26 (later 4) · primary — Captures category 6, and a drive step that inverted

**Captures, category 6: PASS 10/10** (`baselines/cat6-l6-captures.json`). Parity **6/6 standard,
6/6 liquid**, `rowsAgree` true, **0 rows reachable in only one presentation**. Round trip
standard → liquid → standard: `fieldsHeld` true, `shellHeld` true, **0 diffs**, 820x580 both.
Control fires on all three declared mutations — `captureList`, `listReversibility`,
`windowLifecycle` each fell **exactly its own row** (6/6 → 5/6), `unexpected []`, each back at
6/6. Board **33 of 48**. Third consecutive cell that is a RUN plus a spec edit; the driver
(`cat6-feature-parity.cjs`) was not touched.

**The defect this run found is in the SPEC, and it is a new shape.** `captures` declared no
`drive:`, so it fell back to `Object.keys(steps)` — which ended on `toggleList`. That step
**inverts** rather than sets, so the drive left the list collapsed, the list is this section's
navigation, and `.reading-captures-row` therefore matched **nothing**: `captureList` read
`rows=0 withSource=0` and `selection` read `selected=""`, on a surface holding **42 captures**
and working perfectly. First run: parity 4/6 both sides, `verdict VOID`.

Fixed with an explicit `drive: ['openSection','toggleList','toggleList',['select','1'],['scroll','240']]`.
Toggling **twice** is the point rather than a workaround — it exercises the reversibility the
row claims (closed, and back) and is **idempotent**, which the driver requires because it
re-runs the whole sequence once per mutation. `select` goes after the collapse so the selection
is established rather than destroyed by it.

**Not a product defect, and that was checked rather than assumed.** Collapsing and reopening the
list restores **42 rows** with `aria-current` still on `clipboard` and the reader heading still
`clipboard` — the two agree, so the collapse loses no place.

**The round trip was vacuous until the scroll step landed.** Captures is the second L6 surface
with **zero editable text fields**, so `dirtyField` returns `null` ("surface has no editable text
field") and A-vs-C compared chrome to chrome. `.lq-anchor` carries a **1,806 px** range; the
drive now scrolls to **240** and `snapshot().scroll` records `["lq-anchor:240,0"]`, which
`stripVolatile` does **not** strip, so the offset is genuinely part of `shellHeld`.

**Two traps for the next spec.**
1. **The snapshot field is `scroll`, singular.** Reading `snapshot().scrolls` returns `undefined`,
   which looks exactly like "this surface records no scroll" and nearly banked a vacuous trip as a
   verified one. It cost one probe round trip here; it would cost a false 10/10 elsewhere.
2. **`window.__LQP.step()` returns an OBJECT, not a JSON string** — `JSON.parse` on it throws
   `"[object Object]" is not valid JSON`. Only the bridge's own `call()` wrapper stringifies.

Live state to restore at end of turn: Reading Finder was **minimized** and on the **Reading
Finder** tab as found; the run leaves it open on **Captures**.

## 2026-08-26 (later 5) · primary — Captures told the user their store was empty when the read had failed

**Product slice, not a measurement**, and the same shape as the Immersion one-way door one entry
above: scoring a surface for category 6 turns up a defect that category's rows cannot see, because
every row it has assumes the list LOADED.

`ReadingCapturesView` rendered its two notes from independent conditions — the failure note on
`history.kind === 'error'`, the empty note on `history.kind !== 'loading' && rows.length === 0`.
**An error satisfies both**: it is not `loading`, and a failed read produces no rows. So a store
that could not be read rendered, verbatim and in this order:

> Could not read the capture history.Nothing captured yet. Scan a passage with the Reading Lens
> and send it here.

One of those is always false, and it is the second — the one that reads like a fact about the
user's data. It invites them to go and capture something when up to `HISTORY_LIMIT` 60 captures
may be sitting on disk behind a broken IPC. That is CLAUDE.md's "user-visible failures must be
honest" and the rubric's category 8, on the surface whose category-6 cell had just been banked.

**Fix: one condition, `history.kind === 'ready'`.** No new strings, so no i18n work — `i18n-check`
unchanged. The narrow fix and the WRONG fix (deleting the empty branch) are one edit apart, which
is why the suite carries a positive control on a genuinely empty store.

**`readingCapturesStates.test.tsx`, 4 cases, and it FAILED FIRST** — 2 failed / 2 passed before the
edit, with the assertion output quoting both notes concatenated. After: **15 passed** across it and
both existing captures suites (`readingCapturesCanvas`, `readingCapturesHandoff`). The fourth case
covers an absent preload binding, which `load()` routes to the same `error` branch **synchronously**
and which therefore never passes through `loading` at all — the state a renderer reload produces
while main is still coming up.

**Honest limit on the live half.** Live through the bridge, the populated path is unaffected: 42
rows, **0** `.reading-captures-note`, no `.reading-captures-error`. The error branch was NOT forced
live, because `window.api` is frozen and `load()` reads `window.api.lensHistoryList` directly, so it
cannot be made to fail from `/eval`. That half rests on the suite, and this says so rather than
implying a live failure was observed.

**Not a repo-wide class**, checked rather than assumed: `kind|status|state !== 'loading'` across
`src/renderer` and `src/media` returns this file only.

## 2026-08-26 — Category 6, manga: PASS 10/10, and the harness was quietly damaging the app

**manga PASS 10/10.** Parity **7/7 standard, 7/7 liquid**, `rowsAgree` true, **0** rows in one
presentation only. Round trip `liquid -> standard -> liquid`, **0 diffs**, fields and shell held.
All three mutations fell **exactly their own row** and each returned to 7/7 —
`CONTROL FAILED AS REQUIRED`. Volume: *One Punch-Man : The Koi Pond | Ch. 229*, 17 pages, OCR 17/17,
box 1264x821. Reproduced on a second full run before being banked. Board: cat 1, 2, 3, 4, 8 each
6/6 plus **cat 6 at 4 of 6** = **34 of 48 cells**. Evidence `baselines/cat6-l6-manga.json`.

**The reader was unreachable to this category, and "chromeless" was the reason.** `findWin` knew
`.fwin` and `.popout-root` only, so `@.reader` fell through to `host: 'chromeless'` and
`toggleLiquid` REFUSED — category 6 could not be scored on either reader surface even though L3.2
gave the reader a working toggle (`.reader-btn-liquid`, `data-presentation` on `.reader`). Fixed in
the shared engine, not in a probe: a `LIQUID_BTN` table keyed by host, one reader branch in
`findWin`, and a reader branch in `lifecycle` — the reader fills the OS window so it has no
minimize/maximize/restore to count, and its route out (back to Library) is its whole lifecycle.
Chromeless has to keep meaning *has no destination*, not *nobody taught this function about it*.

**HARNESS DEFECT, and it is the finding of the turn: `restore` was a lie for every attribute except
one.** `stripAttr` has always taken an arbitrary attribute name; the restore swept the literal list
`['aria-pressed']`. Measured on the first manga run — the `pageTransport` mutation stripped `min`
from `.reader-seek`, `restored` came back `["manga:mode+page"]` with no attribute in it, and
`returned: true`. The harness declared the surface clean while `min` was gone from a live range
input, which silently defaults it to **0**: a real page-0 off-by-one left in the user's running
reader, by the instrument. Two later scoring rounds then read `range=..17` and that would have been
filed as a **product** defect — the instrument manufacturing the bug it reports. The restore now
sweeps the `data-lqp-was-` marker itself rather than a list somebody must remember to extend, and
the live attribute was put back by hand (`min=1 max=17`, 0 leftovers).

**Two corrections to my own spec, both false numbers.** (1) `pageTransport` read `first=false
last=false` against a working transport: they are `<Icon>` buttons with no text node, so
`btnByText` cannot see them — their name is in `title`/`aria-label`, which is where the rest of this
file reads icon controls from. (2) The `presentationHonest` control stripped `aria-pressed` and felled
`windowLifecycle` too, since both read it; a control that fails two rows proves neither. New `setAttr`
helper falsifies by **lying** rather than deleting — a wrong-but-well-formed boolean falls only the row
that cross-checks it, which is the defect that row exists for.

**Trap for the next worker.** The drive CANNOT open this surface: `App.tsx:702` returns the reader as
the whole app render, so opening a volume unmounts the desktop and all ten windows, and the drive
re-runs once per mutation. `openSection` therefore REFUSES with the reason instead of navigating —
the open volume is the operator's precondition. Reader presentation is persisted **per `LibraryKind`
in localStorage**, not per window, so it survives every restart: found `liquid`, left `liquid`.

## 2026-08-26 (later 6) · codexA — Category 6, Novels: PASS 10/10

Novels **PASS 10/10** on the live 1Q84 EPUB: parity **9/9 standard, 9/9 liquid**,
`rowsAgree` true, and the 2/2 → 1/2 → 2/2 transport plus all three ReadingCanvas tools held
through Liquid → Standard → Liquid with **0 diffs**. Four controls fell only their declared row
(document removal also removes its chapter-heading evidence, an explicit cascade) and every one
returned to 9/9. Evidence: `baselines/cat6-l6-novels.json`.

The first run was VOID, not banked: seek percent could not observe a page flip and “settings”
matched translation settings. The rule's one spec repair changed the observation to page
content/page count and excluded translation from the reader-settings matcher. Board: category 6
is **5 of 6**; only VN remains. No product defect was found in Novels.

## 2026-08-26 (later 7) · codexA — Captures windowing, category 7 progress

The shared collection harness measured **42/42 DOM rows, 210 nodes, 2,205/399px = 5.5×
overdraw, UNWINDOWED**. `ReadingCapturesView` now uses the existing fixed-height `VirtualList` at
the measured **49px row + 3px gap**, with full `list`/`listitem`, `aria-setsize=42`, and true
`aria-posinset` semantics. Re-run: **20/42 DOM rows, 102 nodes, WINDOWED** in a 375px viewport;
bottom scroll rendered positions **29–42**, clicking 42 updated the reader, then top/selection
restored. Evidence: `cat7-l6-captures-{before,after}.json`.

The first post-fix run was not banked: the virtual list expanded to its 2,184px spacer and stayed
42/42 (`INERT` in effect). Constraining its viewport to the ReadingCanvas tool body produced the
numbers above. Focused Captures suites: **16/16**. This closes the collection-weight defect only;
category 7's restart-dependent frame/theme/boot/main-block/memory legs remain open.

## 2026-08-26 (later 8) · codexA — Captures category 7 stays OPEN on a measured theme regression

Restarted after `6e339984` and exercised the populated **42-capture** surface. Main stayed below
the rubric ceiling: idle `/health` p50/p95/max **3.1/12.3/15.7ms**; real refresh
**2.8/3.7/18.3ms**. The 3,000-lookup sensitivity control reached **2,330ms**, while a renderer-only
block left main at **2.9/3.7/16.2ms**, so the instrument both detects and isolates a >500ms block.

Frame evidence is not a pass. Ceiling: p95/max **16.8/17.0ms**, 0 frames >33ms. Resize was
**33.5/83.5ms**, 22 frames >33ms; settled drag improved to max **83.7ms**, 0 >100ms. Theme switches
repeatedly cost **330–446ms** to restore with 2 frames >100ms. Moving Reading Finder from Captures
to Home still cost **149.6/350.7ms** apply/restore, so the defect is theme-wide rather than caused
by the new list. The jank control planted/detected **15/15** >100ms frames.

Long-animation-frame attribution found **397.9ms** style/layout-only work and a **215ms** frame
with 118ms in `CompanionLayer`'s animation callback plus 110ms forced style/layout. One bounded
ResizeObserver-cache experiment did not improve two re-runs (**159.9/445.6ms** and
**168.3/395.8ms**) and was fully removed; no speculative fix is banked.

At 8/16/24 minutes, main private memory was **430.9/432.4/437.3MB**, handles
**1072/1074/1077**, and RSS **371.9/179.9/108.5MB** after reclamation. That is a measured +6.4MB
private delta, not a leak claim. Main start to debug-bridge ready was **16.58s**; the outer npm
build leg was not instrumented comparably to L0. **Category 7 Captures remains unscored/open**;
next work starts at the global theme style/layout cost, then re-runs the same harness.

## 2026-08-26 (later 9) · primary — the theme-switch regression is not one, and the real defect it was hiding

`62abb6d3`. Recovery turn: codexA died on a usage limit at 17:33 with nothing uncommitted —
the dirty `CompanionLayer.tsx` is another track's Aug-7 companions audit, not its work.

**The handoff's next slice was "fix the global theme-switch style/layout regression". There is
no regression.** Decomposed live through `/eval`, each number a median of 8 forced
style+layout flushes on the real desk:

| operation on `<html>` | 10 windows / 3,438 el | 2 windows / 258 el |
| --- | --- | --- |
| class toggle matching no rule | 0.5 ms | — |
| non-inherited property (`outline-offset`) | 0.5 ms | — |
| `setProperty` re-writing the SAME value | 0.0 ms | — |
| `setProperty`, ONE custom property no rule reads | **69.3 ms** | — |
| the real `--app-border-*` triple | **87.0 ms** | — |
| full `data-theme` swap | **92.5 ms** | **5.4 ms** |

L0's recorded baseline is **20.0 ms settled**, captured with **2 `.fwin` open** by its own
scene note. At that same window count today it is **5.4 ms — better than baseline.** codexA's
330–446 ms came from a **10-window** desk. Hiding each window's subtree one at a time walks the
cost down monotonically: 83.2 → 72.1 → 59.0 → 66.2 → 42.9 → 31.2 → 22.6 → 17.1 → 12.1 → 11.3 →
**8.8 ms** at 0 elements live. The cost is linear in open-window element count, and the
comparison was scene-mismatched.

**Trap for every later category-7 number: a perf figure without its scene is not comparable.**
Record `.fwin` count and `document.getElementsByTagName('*').length` beside every timing, or the
next worker files another phantom regression. This one cost codexA a turn.

**What the decomposition did find is a real shipped defect.** The cost is custom-property
*inheritance*, not selector matching and not the theme — an unused property costs the same as a
theme swap, because every element re-inherits the 249-property root map. `<input type="range">`
fires per tick and `saveAppBorderSettings` wrote three changed `--app-border-*` values straight
to `<html>` inside the handler. On a real 8-window desk (6,055 elements) a 20-tick drag cost
**1,835.1 ms**, 91.8 ms a tick. Through the new `rootCssVars.ts` writer — diff against last
value, coalesce into one rAF flush — **75.5 ms, 24.3x**. Boot uses the immediate path because
`--taskbar-h` is a layout input; verified live after reload at `--taskbar-h: 56px` with the
taskbar rendered 56px. 10/10 new tests with a negative control; adjacent suites 27/27.

**Follow-on, measured not guessed:** `<html>`'s inline style carries **~45** custom properties
from other subsystems (display, motion, spacing, accent, wallpaper, pillarbox). Every writer has
the same per-change cost. `pillarboxSettings.ts` and `wallpaperFit.ts` are the same shape and
were left alone — both carry another track's uncommitted work.
