# L7 — review and learning loop

Log for `LIQUID_WORKPLACE_TRANSFORMATION_PLAN.md` §11 / L7. Order: Flashcards → Anki → Notebook →
Statistics → Calendar → Games. Gate: timing-sensitive input and study state do not shift.

## 2026-08-26 23:13 EDT — Flashcards opens; contextual mode chrome, fixed review geometry

**Both L7 bullets remain OPEN; Flashcards is 1 of 6 apps.** The existing body is shared by Study
OS and Blanc, so shell branching inside it was rejected. Four mode launch rows and the two mode
navigation rows now use `ContextualSurface`: inert in conventional/Blanc hosts, painted only under
the sanctioned Liquid presentation seam. Dense deck import, CSV editor, virtualized rows, review
card, and grading buttons stay outside it.

Live overview, Liquid, real data: **2 contextual regions**, both on the shared primitive; header
background alpha **0.72**; active EPUB deck count **3,218**; import panel outside contextual
material. Standard mode uses the same DOM and the primitive paints nothing there.

**Active-review round trip, no grade written:** started the real 3,218-card queue and toggled
Liquid → Standard → Liquid. All three snapshots: word `攻撃`, progress **0 / 3,218**, card rect
**x137 y360 724×360**, actions rect **x137 y740 724×49**, and **0** contextual descendants in the
review. That is L7's fixed-task invariant measured rather than inferred. `Exit` is the reverse path.

Guard `flashcardsLiquidRegions.test.ts`: **3/3** — all six contextual wrappers present, review owns
none, and dense import/editor/list regions stay outside. Checkpoint containing this entry.

## 2026-08-26 23:26 EDT — Flashcards categories 1 and 3 score 20/20

**Flashcards remains 1 of 6 apps; both L7 bullets remain OPEN.** The two reusable category
harnesses found one product defect and two instrument defects; no surface-specific probe was added.

- Category 1: **PASS 10/10**. **342** text owners, minimum **5.01:1**, **99** controls,
  **0** effective hit areas below 32px, **0** WCAG 2.5.8 failures, **0** unreachable controls,
  and reduced motion **57 → 0 → 57**. The control moved all five signals and restored them.
- Category 3: **PASS 10/10**. **15** Work regions, **0** on translucent material; **2/2**
  contextual regions treated and **2/2** use a shared primitive. Controls made **1/15** and then
  **15/15** Work regions translucent, then restored **0/15**.

Product repair: Flashcards compact controls now own 32px pointer footprints; the nested folder
delete pseudo-button became two sibling native buttons. The live count fell **77 → 0** undersized
effective targets and the adjacent remove failure fell **1 → 0**. Review geometry remains unchanged.

Harness repairs, each one attempt: category 1 now preserves alpha while compositing translucent
ancestor stacks (the old code stopped before the opaque card); category 3 treats `style=null` and
React's equivalent empty style attribute as the same restored state. Focused guard: **4/4**.

## 2026-08-26 23:29 EDT — Flashcards category 2 passes; category 4 stays open

Category 2 is **PASS 10/10**: EPUB → Dictionary cost **1 click** in both Standard and Liquid,
**0** dead ends, modal traps, scroll traps, or acknowledgements over 100ms; worst renderer latency
**12.1ms**. Undo restored state hash `1hrek7n`; the control moved **0,0,0 → 1,1,22 → 0,0,0**.

Category 4 is **FAIL / 0**, after the one repair pass allowed this turn. Reflowing the 24-card
preview as a grid removed the horizontal scroller at default and maximized sizes; container-query
layout changed compact clipping **3 → 0** and hidden-overflow owners **19 → 1**. Exact remainder:
compact `.flash-group` is **180 > 174px**, and dominant content falls **13.0% → 6.8%** when maximized.
The negative clip control moved **0 → 1 → 0** and all three size legs restored geometry. Next turn
opens by resolving those two measured residuals with this same category-4 harness, not a new probe.
