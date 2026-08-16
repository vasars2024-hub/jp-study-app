# Feature parity ledger — L0

Authority: `src/LIQUID_WORKPLACE_TRANSFORMATION_PLAN.md` §5.3 and §10.1. This ledger plus
the protected-system matrix are what the **L0 gate** requires before any Liquid product
code may land.

## Schema

§5.3's row shape, one row per feature:

```text
app | feature | current route/control | standard destination | liquid destination |
keyboard route | data/state owner | automated proof | visual proof | status
```

## Rules, from §5.3 and the rubric's category 6

- **Count behavior, not buttons.** "Mine sentence" is one row only if fields, media
  preview, destination deck, error states and undo/retry are all inside it; otherwise they
  are their own rows.
- A row is closed by an **observable side effect**, never by a button's presence. A parity
  check that has never caught a missing feature has never been shown to work.
- A feature is complete only when **both** standard and Liquid destinations work.
- Every moved control must retain a search/keyboard route.
- New UI cannot land with `pending` parity rows.
- The ledger must cover **settings and recovery paths**, not only happy-path actions.
- Status vocabulary: `pending` (no Liquid destination yet) · `standard-only` (deliberately
  never going Liquid — needs the reason inline) · `both` (verified in each, by side effect)
  · `REGRESSION` (reachable in one and not the other — blocks the wave).

## Status of this ledger

**Row set: census in progress.** The per-app census is what produces this file's rows; it
is recorded in `CENSUS.md` in this directory and each census row becomes one or more ledger
rows. Until every app in §7's table has a census section, the L0 gate is **OPEN** and no
Liquid product code may land.

Counts are stated per app, as numbers, never as adjectives.

| App/section | Census done | Ledger rows | Closed by side effect | Status |
| --- | --- | --- | --- | --- |
| *(populated by the census)* | | | | |

## Protected-system matrix

§8: these must survive every wave unchanged unless a wave explicitly owns them. A row here
is a **freeze**, not a feature — breaking one is a release blocker, not a parity gap.

| Protected system | Owner | How a break is observed | Verified |
| --- | --- | --- | --- |
| Secret Aero discovery and exit | Aero shell | | |
| Aero safe mode | Aero shell | | |
| Wired lifecycle | Wired shell | | |
| Taskbar shell | Study OS shell | | |
| Desktop shortcut grid | Study OS shell | | |
| Display assignments | Shell/window mgr | | |
| Window dragging | Shell/window mgr | | |
| Pop-outs | Shell/window mgr | | |
| Blanc cold-open boundary | Blanc renderer | | |
