# DISPATCH A2 — npm licence compatibility, secrets, .gitignore, docs disposition

Cold agent, `jp-study-app`. Everything you need is here plus the files it points at.

**This repo is being published: source + binaries on GitHub, GPL-3.0-or-later.** Your findings
decide what can legally ship and what must be scrubbed *before* history becomes public.

---

## 0. Read first

1. **`.claude/skills/jp-dispatch/SKILL.md`** — the working rules. **Follow it.** Git discipline,
   gates, known-failing suites, evidence standard. Not repeated here.
2. **`docs/audit/PRECOST_A1_A2_PROVENANCE.md`** — pre-costing already done. §3 is a preliminary
   secret scan; §4 sizes the docs problem. Do not re-derive; challenge it if it looks wrong.
3. **`docs/migration/LICENSING_PLAN.md`** — the existing licence record. **Treat it as a
   hypothesis.** Its "unknown provenance" column was already proved stale by the pre-cost pass.

---

## 1. Ownership and the one deviation from normal git discipline

You may create/edit **only**:

- `docs/audit/HANDOFF_A2_LICENSE.md` (your handoff)
- `docs/audit/GITIGNORE_DRAFT.md` (§3)
- `docs/audit/DOCS_DISPOSITION.md` (§4)

**Everything else is read-only to you.**

> **DO NOT COMMIT, DO NOT BRANCH, DO NOT `git add`.** You are on branch `audit/a-evidence` and
> **another agent is working concurrently in this same worktree on different files.** One index
> per worktree; concurrent commits collide. Write your files and stop — the orchestrator commits
> both halves. This overrides `jp-dispatch`'s commit rule **for this run only**; every other rule
> stands, especially never `git stash`, never `git add -A`, never touch another agent's files.
>
> The other agent owns `docs/audit/HANDOFF_A1_ASSETS.md` and
> `docs/audit/NOTICES_DRAFT_ASSETS.md`, and is covering the **bundled binary assets** in
> `public/`. **You cover npm only** — do not duplicate that half.

**Do not start, restart or kill any app.**

---

## 2. npm licence compatibility — the version question nobody has asked

`docs/migration/tools/license-audit-gate.mjs` exists and reads the *installed* tree. Re-run it
and record its output. But it **buckets by copyleft strength, not by version compatibility**, and
that is the gap:

- **Scan specifically for `GPL-2.0-only`.** GPL-2.0-*only* is **incompatible** with
  GPL-3.0-or-later; `GPL-2.0-or-later` is fine. This distinction has never been checked here and
  a single incompatible dependency is a genuine blocker, not paperwork.
- Same question for `LGPL-2.1-only` and any `CC-BY-NC*` / `*-NoDerivatives` (non-commercial and
  no-derivatives terms are incompatible with GPL distribution outright).
- **The two packages with no declared licence** — `fast-shallow-equal`,
  `react-universal-interface`. Establish from their repos, or recommend replacement.
- Confirm the previously-acknowledged strong-copyleft pair (`ffmpeg-static`, `rvfc-polyfill`) is
  still exactly two, and that no third has arrived unacknowledged.

**Deliverable: the npm half of a `THIRD_PARTY_NOTICES` file**, generated from the installed
tree — what ships is what is on disk. Put it in your handoff or reference a generator you wrote
under your owned paths.

> Method note carried from the existing record, because it nearly became a false finding:
> `jszip` is `(MIT OR GPL-3.0-or-later)`. An `OR` is the **licensee's choice** — taking MIT is
> permitted. **Only an expression whose every branch is copyleft constrains anything.**

## 3. Secrets and `.gitignore`

The pre-cost pass found the working tree essentially clean: no `.env`/`.pem`/key files, one
false positive inside a tesseract WASM blob, and **one real hit** —
`src/shared/automationBuilder.ts:8` hardcodes
`C:\Users\Arseniy\Projects\jp-study-app\automation-builder.ps1` in **shipped** source.

Your job:
- **Confirm or refute that hit**, and sweep for the same class: developer home paths, machine
  names, `%APPDATA%` literals, absolute paths, personal identifiers in shipped `src/**`.
- Sweep for the user's **MAL client id** specifically — a previous pass established it appears
  **zero** times, and that is a claim worth keeping true.
- **Scope note:** scan the **working tree only.** Full-history scanning is deliberately deferred —
  it depends on an unmade user ruling (squash to fresh history vs publish existing history), and
  if they squash, a history scan is wasted work. Say in your handoff that history is unscanned
  and why.

**Deliverable: `docs/audit/GITIGNORE_DRAFT.md`** — a proposed hardened `.gitignore`, with a
one-line reason per rule. It must make it impossible to *accidentally* commit: JMdict/Yomitan
dictionaries, the JPDB frequency dictionary, imported Anki decks, Kitsunekko subtitles, mined
sentences, media files, downloaded models, `debug/` runtime output, and `out/`. These are
correctly absent today **by luck and habit**; the point is to make it by rule before the repo is
public, because one careless `git add` afterwards is unrecoverable.

Also rule on **`.claude/`**: it currently has no `.gitignore` entry, so it ships.
`.claude/settings.local.json` may carry machine-specific paths and permissions. And there are now
**five skills** under `.claude/skills/` which name absolute paths, the debug bridge's auth model
and fixed port, incident history, and the other worktrees and parked stashes. Recommend; do not
decide — see §4.

## 4. Which documents get published

**Plan docs going public are public claims.** Shipping a plan with a tick beside a feature that
does not exist is the same dishonesty defect this audit exists to find, on the front page, and
permanent if history is squashed.

Measured surface: **37 root `*.md`, 85 under `docs/**`, 20 `src/*.md`, 12 under
`src/.coordination/`, and 258 directories under `docs/migration/proof/`.**

**Deliverable: `docs/audit/DOCS_DISPOSITION.md`** — every document (glob families are fine where
a directory is uniform) assigned one of:

- **PUBLISH** — accurate and useful to an outside reader
- **PUBLISH WITH BANNER** — useful but must carry *"internal working notes, not a
  specification"*
- **KEEP PRIVATE** — internal-only, machine-specific, or contains claims you cannot vouch for
- **CORRECT FIRST** — would mislead as written; name the specific claim

Expect `docs/migration/proof/**` (258 dirs of machine-specific paths, timings and profile
contents) to be the strongest KEEP PRIVATE candidate. Do not hand-classify 258 directories —
sample enough to justify a family-level rule and say how many you sampled.

**You recommend; the user rules.** Every item in this section is a decision, not a task.

---

## 5. Handoff — `docs/audit/HANDOFF_A2_LICENSE.md`, written as you go

For every item: `claim · what you measured · verdict · evidence (command or file:line) · what it
costs to fix · who decides`.

State explicitly:
1. **The GPL-2.0-only result** — the single highest-stakes answer in this dispatch.
2. **Measured totals, never deltas** — package counts drift for reasons that are not yours.
3. **What you scanned and what you did not** (history: not scanned, and why).
4. Anything you could not establish from a primary source, listed plainly rather than smoothed.
5. Defects noticed in code you do not own — recorded, not fixed.

## 6. Scope

If you finish early, stop. Do not edit `.gitignore` itself (draft only), do not fix the
`automationBuilder.ts` path, do not audit product features, do not touch the other agent's files.
