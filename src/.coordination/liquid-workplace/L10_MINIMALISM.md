# L10 — System-wide smart minimalism pass

Authority: `src/LIQUID_WORKPLACE_TRANSFORMATION_PLAN.md` §L10. Gate: *one coherent workplace
language with individual app character preserved.* Opened 2026-08-31 by `primary`, the turn
L9 bullet 4 closed at RULE C 16/16 (`f729d88e`).

## The instrument decision, made here so no turn re-derives it

RULE C's shape — 2 representative surfaces × all 8 rubric categories = 16 cells — was written
for bullets that CERTIFY A SURFACE, which is what every L1–L9 bullet does. **L10's four bullets
do not certify a surface; each asserts one property ACROSS surfaces.** Applied literally, L10
would cost 4 × 16 = 64 cells, most of them re-scoring shells L9 already scored 10/10, and the
category that actually answers the bullet would be one cell in sixteen.

**Decision: each L10 bullet is scored on the rubric categories that can falsify it, across a
NAMED sample of surfaces — never fewer categories than the bullet's own words require, and
never a surface skipped in silence.** The two RULE C guarantees that matter are kept verbatim:
a category is never dropped to make a bullet pass, and every skipped surface is listed under
`sampled-out:`. What changes is only that a consistency claim is measured with the instrument
that can disprove it, rather than with all eight regardless.

Reversible if wrong: nothing here bakes into product code, and a later turn can widen any
bullet to the full 16 cells without redoing the measurements taken under this rule.

| bullet | the claim | category that can falsify it | instrument |
| --- | --- | --- | --- |
| 1 | no redundant chrome / card nesting | cat3 Liquid utilization, cat4 use of space | `cat3-liquid-utilization.cjs`, `cat4-use-of-space.cjs` |
| 2 | labels, icons, spacing, motion, empty states, breakpoints reconciled | cat1 accessibility (motion, targets), cat5 UI clarity, cat8 honest states | `cat1-accessibility.cjs`, `cat5-ui-clarity.cjs`, `cat8-honest-states.cjs` |
| 3 | palette and search expose moved secondary/expert actions | cat5 UI clarity, cat6 feature parity | `cat5-ui-clarity.cjs`, `settingsSearchReachability.test.ts`, `CommandPalette.tsx` registry |
| 4 | no feature duplicated into competing control systems | cat6 feature parity | `cat6-feature-parity.cjs`, `parity-ledger.json`, `tools/blanc-drift.cjs` |

Surface sample, and why these: **Settings** (1,307 controls / 83 commands / 67 settings — by far
the densest row in `CENSUS.md`, and the surface that L8's dead-control and search work already
touched) and **Media Center** (`player`/`video`/`music`, one 816-control root that three
sections share, so a duplicated feature has three places to hide). A third is added only where a
bullet's own words demand a surface neither of those has — bullet 3's command palette is
shell-level, so it also scores the Wired shell, already instrumented in `L9_SHELL_IDENTITIES.md`.

## Progress

### Bullet 3 — CLOSED 2026-08-31. `9c117226` (palette), `74628bbc` (landing).

The open half was real and worse than "not yet widened": the palette exposed **0 of 160**
registry entries. Its own header comment had claimed since it was written that it searches
"…and settings"; the `items` memo had no settings source at all. So every action L8 moved
behind a disclosure was reachable from the Settings search box and from nowhere else.

**cat6 — feature parity. 10/10.** Live sweep of every registry entry whose English title can
be typed as a query (129 of 160; the 31 excluded are the generated `page-*` rows and titles
carrying `{}` placeholders). For each, the gate the registry declares was compared against
what the palette actually offered in the running app: **129 of 129 agree** — 124 present as
expected, 5 withheld as expected. Live gate state read from the app, not assumed:
advanced=true, aeroDiscovered=true, wiredDiscovered=false, theme=study-os.
Negative control, two independent axes discriminating in the same run: `Aero gadget lab` and
`Aero games` PRESENT (discovery true) while `NAVI terminal` and `WIRED games` are ABSENT
(discovery false) and `Pillarbox style` / `Leave secret OS` ABSENT (theme-gated). Each absent
run still returned 7–13 other settings rows, so no refusal is vacuous. Mode control: the same
query in `commands` mode returns 0 settings rows while still returning 19 command rows.
Gatekeeper check (the plan's own constraint): every route the palette offers already existed
inside Settings, so nothing became palette-only.

**cat5 — UI clarity. 10/10, and it FAILED first.** Picking a result named the action and did
not deliver it: the card highlighted **7,438 px below the fold**, pane `scrollTop` stayed 0 for
the whole 2.2 s the highlight lasts, and the highlight then expired offscreen — identical, from
the user's seat, to being dumped at the top of the page. This hit the Settings search box
equally; it is not a palette defect. Fixed in `74628bbc` and re-measured in that commit: pane
scrollTop 0 → 7233, card top 7462 → **183**, in view at ~2.5 s **while the highlight is still
lit**.

**The cause, because 11 other call sites share it.** `scrollIntoView({behavior:'smooth'})` is a
request and this renderer refuses it. Measured with OS `prefers-reduced-motion` reporting
**no-preference**: the settings pane moved 0 px on smooth and 7,233 px on the identical `auto`
call, `pane.scrollTo({behavior:'smooth'})` also moved 0, and a freshly created plain scroller in
the same document ignored smooth too. `grep` finds 16 `behavior: 'smooth'` sites, 11 of them
product. Only `SettingsCard` is fixed here — the rest are named, not silently absorbed.

Two instrument corrections banked. (37) A `themes:` gate may be written as a CONSTANT
(`themes: SECRET_SHELL_THEMES`), so a `/themes: \[/` expectation parser scores a correctly
withheld entry as a miss — that was this sweep's single "disagreement" and the app was right.
(38) The card's own `rect.top` cannot decide whether a scroll happened: the page was still
settling and moved the card 19 px by itself, so a first fix gated on `rect.top === before`
never fired and measured as no fix at all. Compare the SCROLLER's `scrollTop`.

### Refused-scroll recovery — CHECKPOINTED 2026-09-01, `8d0e2b13`

The interrupted follow-up is recovered rather than left as loose shared-tree edits. One
axis-aware helper now owns smooth-request measurement, an outright fallback, and cancellation;
all **12 direct smooth calls across 10 committed product files became 0**, while working-smooth,
already-visible, horizontal and cancelled negative controls remain single/no-op calls as
appropriate. Exact-commit validation: **5 files / 40 tests pass** in a detached worktree;
touched-path ESLint **0 errors** (9 pre-existing `NovelReader` warnings).

The shared working tree still has one direct call inside an older uncommitted transcript-panel
rewrite. It was deliberately not absorbed: that call does not exist in `HEAD`, so committing
its integration alone would either reference dead code or steal the foreign rewrite.

`sampled-out:` **Media Center** — it owns no settings registry, so bullet 3's claim has nothing
to bite on there. **Wired shell** — its command entry point is already certified by L9 bullet 1
at RULE C 16/16 (`b1e35170`), and the palette's data is theme-independent. **Blanc** — it is a
separate window that does not mount `CommandPalette` at all; that is pre-existing and belongs to
Blanc's own track, where L9 established that the shell owns its own controls. Named here rather
than passed over in silence.

### Exact next: bullet 1

Redundant chrome and card nesting, scored cat3 + cat4 on Settings and Media Center per the
table above.
