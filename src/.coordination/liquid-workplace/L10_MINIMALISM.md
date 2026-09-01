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

Nothing measured yet. **Exact next: bullet 3**, because it is the only one with a committed
non-rubric instrument already green (`settingsSearchReachability.test.ts` asserts
`unanchored === []` for both the settings and the Scraper registries) — so its baseline is a
re-derivation rather than a first build, and the open half is whether the PALETTE, not just
search, exposes the actions L8 moved behind disclosures.

`sampled-out:` every surface not named above, listed per bullet as it is scored.
