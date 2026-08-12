# Relay boss audit log

One dated section per audit. The newest section is the live one: every relay
worker reads it before starting its own ladder work and addresses any real,
unaddressed finding first.

## 2026-08-12 — Rescue audit: ten orphaned Codex worktree commits, plus findings that never reached the tree

Not a routine cadence audit. This one was triggered by a human noticing that
work done **outside** the relay — Codex desktop `<codex_delegation>` sessions
run against `~\.codex` and `~\.codex-backup` — was at risk of being lost. It
was. This section is the recovery record and the work list that follows from it.

### 1. Ten commits existed only in Codex worktrees, unreferenced

`~\.codex\worktrees\*\jp-study-app` held **ten real commits that are not
ancestors of `feat/nyaa-subtitles`**. Because Codex creates those worktrees
with `git worktree add`, the objects live in this repo's own object store —
so they were recoverable, but nothing referenced them and a `git gc` could
eventually have taken them.

**Every one is now tagged** `rescued/codex-worktree/<sha>-<slug>`, so they
cannot be collected and are easy to find:

    git tag -l 'rescued/codex-worktree/*'

| commit | subject | base | behind HEAD | size |
|---|---|---|---|---|
| `27c74b6` | refactor(i18n): remove orphan Mooncap lore catalog | `732f30b` | 1 | 19 files, +370/-389 |
| `2545cd5` | fix(resources): make bundle setup links truthful | `732f30b` | 1 | 10 files, +456/-65 |
| `28a239c` | feat(study): persist local review schedule | `732f30b` | 1 | 13 files, +448/-47 |
| `c3ae5b6` | feat(agent): persist sensitive cloud exclusion | `732f30b` | 1 | 17 files, +292/-16 |
| `20f72eb` | test(scraper): accept scheduler and notifications | `732f30b` | 1 | 10 files, +195/-17 |
| `c48b266` | feat(reading-lens): persist pinned captures | `a43d094` | 5 | 13 files, +195/-16 |
| `9c046cc` | feat(lexicon): add offline interlinear grounding | `a43d094` | 5 | 4 files, +666 |
| `87dd97c` | feat(reading): add unified workspace contract | `f258ef7` | 148 | 3 files, +668 |
| `9e6e82d` | feat(lexicon): bridge SQLite lookups to Workbench aliases | `f258ef7` | 148 | 5 files, +361/-1 |
| `99c8747` | fix(media): restore shared media shell | `372f38d` | 152 | 4 files, +220/-122 |

**Instruction to the next worker — this outranks the normal ladder.** Integrate
these, highest-value and cheapest first. Do **not** bulk-merge them; take one
per turn, and treat each as untrusted until you have re-run its gates yourself
on this branch:

1. **The five at base `732f30b` are one commit behind and should be nearly
   clean** — `27c74b6`, `2545cd5`, `28a239c`, `c3ae5b6`, `20f72eb`. Start here.
2. **`9c046cc` (Lexicon interlinear, +666, four files, no IPC/shell/root-config
   changes) is the highest-value single item** and is only five behind. Its own
   session claimed 105 tests passing and a stated acceptance criterion: `食べた。猫`
   must render from SQLite as `食べた` → `食べる / たべる / to eat` via de-inflection,
   preserving `。` and showing unmatched tokens **without inventing glosses**.
   Re-run that claim; do not take it on trust.
3. **`c48b266`** (ReadingLens pinned captures) touches `preload.ts` — remember a
   preload binding is not proof a main handler exists; invoke it, don't grep it.
4. **The three from 08-08 (`87dd97c`, `9e6e82d`, `99c8747`) are 148–152 commits
   behind** and are the most likely to conflict or to have been overtaken by
   later work. Re-derive whether they are still needed **before** attempting a
   cherry-pick — parts may already be implemented on the branch by now. If a
   commit turns out to be obsolete, say so here and stop; do not force it in.

Cherry-pick into the shared tree with this repo's normal discipline: never
`git add -A`, never stage a whole file that carries other tracks' hunks, and
test the result before moving on.

### 2. Read-only audit findings on `set.metadata` that never reached the tree

A Codex read-only audit (session `019ff467`, 08-12 08:23) reported
`set.metadata` as **10 fields — 8 active, 2 explicitly inert**, with three
focused suites passing 82/82, and named five defects. **These are claims, not
verified facts — re-derive each before acting:**

- `Ani List` normalizes to `ani-list`, but the runtime only recognizes
  `anilist` — so the provider silently never matches.
- Network exceptions **abort** instead of falling through to the next provider.
- `mergeStrategy` and `fetchStaff` are inert despite having visible controls.
- The "Fetch" toggles redact output but still **request** those fields.
- `MetadataPanel` reports **studio** provenance using the **genres** provenance
  field.

The same session designed a no-provider, no-credential live verification path
using a strict loopback CONNECT proxy with deterministic Jikan/AniList
fixtures — worth reusing rather than reinventing if you take this on.

### 3. Scraper acceptance remainder

A second audit (session `019ff468`) put the remainder at **13 untested entries,
reducible to 8 practical acceptance slices**, recommending `page.dashboard`
next, then `page.profiles` + `set.profiles` combined.

### 4. Recovered working-tree work

`featureStatus.ts` and `settings/fields.ts` carried uncommitted work from an
out-of-relay session — the `note` field kind, `inert: true` on the five
performance fields with no consumer, and per-group status documentation. It was
committed as `bfac09d` with 246 files / 3731 tests passing, rather than left in
the tree where the relay could have clobbered it.

### 5. What was NOT done here, deliberately

None of the ten commits were integrated by this audit — tagging them made them
safe, and integration is real work that belongs in a normal turn with gates run
properly. No claim in sections 2 or 3 was verified; they are recorded as leads
with their provenance so the next worker can falsify them cheaply instead of
rediscovering them.
