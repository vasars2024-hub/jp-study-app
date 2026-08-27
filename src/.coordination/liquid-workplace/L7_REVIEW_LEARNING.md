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
