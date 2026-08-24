# Deadline burn-down — hard target 2026-09-01, full scope

One line per turn, appended, machine-countable. Shape:

    <ISO date> | <plan> | units done this turn: <n> | units left: <n> | basis: <the authority you counted> | projected finish: <ISO date or UNKNOWN>

`units left` counts against the plan's OWN authority — mal-pipeline: the gate table in
`src/MAL_ANIME_PIPELINE_PLAN.md`; liquid: the `Gate:` lines in section 11 of
`src/LIQUID_WORKPLACE_TRANSFORMATION_PLAN.md`; main-v1: the last `##` section of
`src/MAIN_V1_EVIDENCE_LEDGER.md`. A number not re-counted this turn is written
`INHERITED <n>`, never as a measurement.

2026-08-24 | mal-pipeline | units done this turn: 0 | units left: 2 | basis: `src/MAL_ANIME_PIPELINE_PLAN.md` gate tables re-read — 34 numbered gates, open are 31 (attended Route A + cues rendering in the player) and 34 (the four full gates at the end); the plan's own last three entries agree at 32 of 34 | projected finish: UNKNOWN

Why UNKNOWN and not a date, 2026-08-24: gate 34 is one turn once 31 closes, so the whole
projection is gate 31, and gate 31 is not rate-limited — it is blocked on data outside this
repo. Two independent halves, both measured, neither an agent decision: (a) Route A's
subs-only pack — 1 candidate in 99 titles ascending, 8 of 60 descending, and every
seed-healthy one eliminated on language or fallen below `minSeeders`; (b) the render leg
needs an owned video for a title on the user's MAL completed list, and the census of
2026-08-24 shows the only anime series in the library, The Big O, appears **0 times** in
that 1,426-row list. Dividing 2 gates by a units-per-hour rate would produce a date that
means nothing. The turn's product rate, for whoever wants one: 2 commits, ~430 lines of
non-test product source, in ~50 minutes.

