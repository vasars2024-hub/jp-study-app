# DISPATCH S0 — Author two repo skills: `jp-bridge` and `jp-dispatch`

You are a cold agent working in the `jp-study-app` repository. You have no prior context;
everything you need is in this document. Read it fully before acting.

Your job is **to author two Claude Code skills** that later audit dispatches will rely on.
You are not auditing the app, not fixing defects, and not touching application code.

---

## 1. What you own

You may create and edit files **only** under:

- `.claude/skills/jp-bridge/**`
- `.claude/skills/jp-dispatch/**`
- `docs/audit/HANDOFF_S0_SKILLS.md` (your own handoff, see §7)

**Everything else in the repo is read-only to you.** You will read a lot of source to verify
facts — that is expected and required. You will not modify any of it.

Other agents may be working in this repo. Do not touch anything outside the three paths above,
even if you find a defect. Record defects in your handoff instead.

---

## 2. Hard rules — non-negotiable

- **Branch first.** Cut `audit/s0-skills` from the current branch before your first write.
- **`git add` with explicit paths only. Never `git add -A`.**
- **Never `git stash`.** Two stashes are parked and live (`flashcard-search WIP`,
  `pre-merge workbranch WIP`). A failed `stash push -- <untracked>` followed by `pop`
  detonates one across the tree.
- **Never `git gc`, `git prune`, or `git reflog expire`.** Two other worktrees
  (`codex/noctis-beta`, `claude/cool-poincare-9b2f0c`) share the object store, and the
  dangling commits include real parked work.
- **Never commit or revert what you did not write.**
- **Do not start, restart, or kill the dev app.** If something is listening on 5173, it is
  the user's. Every fact in this document is verifiable by reading source — you do not need
  a running app, and you must not start one.
- **Commit when your work is complete, and again at any point it is at risk.** Explicit paths.
- **`npx tsc --noEmit` is NOT a gate.** It reports roughly 288 pre-existing errors on a clean
  tree. Do not try to fix them and do not treat them as your failure.
- **Known-failing test suites: `architectureBaseline`, `flashcardSearch`.** Do not spend a
  pass on them.
- **Write your handoff as you go, not at the end.** Runs die at usage limits, usually *after*
  doing the work, leaving changed files and a one-line log.
- **After any repeated or multi-file edit, read the values back out of the file and assert on
  all N.** A prior session reported six successful edits when five were in the file.

---

## 3. Phase 1 — Verify the fact base (do this before writing anything)

The skills you are about to write encode repo-specific facts. **A skill encoding a wrong fact
is worse than no skill**, because it is applied silently across many later runs.

Below is the claimed fact base. Every row is a **hypothesis**. Verify each one by reading the
source, and record the outcome as `CONFIRMED` (with `file:line`), `CORRECTED` (with the actual
value and `file:line`), or `UNVERIFIABLE` (with what you tried).

**Do not carry an unverified fact into a skill.** If a fact is `UNVERIFIABLE`, either omit it
or state it in the skill explicitly as unverified.

### Bridge / instrument claims

| # | Claim | Where to look |
|---|---|---|
| B1 | `npm start` detached writes `debug/bridge.json` containing a port and a bearer token, bound to `127.0.0.1` | `src/main/debugBridge.ts`, `package.json` scripts |
| B2 | The bridge exposes `/health`, `/eval`, `/dom`, `/text`, `/click`, `/screenshot`, `/logs` | route registration in `debugBridge.ts` |
| B3 | `/eval` takes its code in a field named **`js`**, splices it into `(${code})` — so it must be a single expression — and does **not** await promises | `debugBridge.ts` eval handler |
| B4 | `/screenshot` returns `{ok,path,size}` JSON and writes the PNG to `debug/shots/`; piping the response body to a `.png` yields a ~137-byte JSON file | `debugBridge.ts` screenshot handler |
| B5 | `/screenshot` fails with `UnknownVizError` when the window is occluded | search the repo and any logs for `UnknownVizError` |
| B6 | `debugBridge.ts` hard-stops on `app.isPackaged` at roughly line 380 | `debugBridge.ts` |
| B7 | The `jp-app` MCP server only loads when cwd is the repo root | `.mcp.json` / MCP config |
| B8 | `vitest.config.ts` globs `.test.ts` only, so `externalPlayerPanel.test.tsx` and `mediaTrackingSourcesHistory.test.tsx` have never run | `vitest.config.ts`, then confirm both files exist |

### Gate claims — confirm each command exists and record its exact invocation

| # | Claimed gate |
|---|---|
| G1 | `npx vitest run` |
| G2 | `node tools/i18n-check.cjs` |
| G3 | `node tools/architecture-audit.cjs` |
| G4 | `node docs/migration/tools/audit-carried-items.mjs` |
| G5 | `node tools/grammar-audit.cjs --compare` |
| G6 | `node docs/migration/tools/license-audit-gate.mjs` |
| G7 | `npx tsc --noEmit` is **not** a gate — record the actual current error count |

For G1–G6, confirm the file exists at that path. You do **not** need to run them all; if you
do run any, run it read-only and record the measured total, never a delta.

### Repo-state claims

| # | Claim |
|---|---|
| R1 | Current branch is `grammarx/phase-1-5`, tip at `88d7ead` |
| R2 | The working tree has ~17 changed/untracked paths (an older note claimed ~1,000 — establish which is true **now**, via `git status --porcelain \| wc -l`) |
| R3 | Two stashes exist, described above |
| R4 | Two other worktrees exist: `codex/noctis-beta`, `claude/cool-poincare-9b2f0c` |

Write the verification results into your handoff **before** writing either skill.

---

## 4. Phase 2 — Write `.claude/skills/jp-bridge/`

**Purpose:** so that any later agent driving the running app through the debug bridge does it
correctly on the first attempt. Every trap below has already produced a false finding or a lost
measurement in this repo.

### Required structure

```
.claude/skills/jp-bridge/
  SKILL.md
  scripts/            # helper scripts — see below
```

### `SKILL.md` frontmatter

```yaml
---
name: jp-bridge
description: >
  Drive the running jp-study-app through its debug bridge to verify behaviour by
  observing side effects. Use whenever a task requires clicking, evaluating JS,
  reading the DOM, measuring computed styles, or screenshotting the live app —
  including any verification that a feature actually works, any UI measurement,
  and any check that a control has a real effect. Covers profile setup, the
  bridge endpoints, and the measurement traps that produce false results.
---
```

Tune the description so it triggers on the real phrasings later dispatches will use
("verify by driving", "click through", "measure the live app", "check the control does
something"). Description quality is what decides whether the skill fires at all.

### Content the skill must carry

Only include facts you marked `CONFIRMED` or `CORRECTED` in Phase 1.

1. **Profile discipline.** Two profiles, both copies, both in the OS temp dir: `scratch/`
   (empty — the fresh-install view) and `populated/` (a copy of the real profile). The real
   profile is never opened. **Never point `--user-data-dir` inside the repo** — Chromium locks
   `<profile>/Network/Cookies`, Vite's watcher throws `EBUSY`, and the dev server dies in a way
   that presents as "the renderer never became usable".
2. **Back up all of `%APPDATA%\jp-study-app` before any live run** — every file, not a subset.
   A prior session lost `desktop-layout.json` by backing up a subset; the app rewrites it the
   moment a window moves. Renderer storage (localStorage/IndexedDB) has no restore point at all.
3. **Connecting:** read port and bearer token from `debug/bridge.json`; all requests to
   `127.0.0.1`.
4. **`/eval` mechanics** (B3) — single expression, no await, so the pattern is *stash a promise
   on a global, then poll it in a second call*. Include a worked example.
5. **`/screenshot` mechanics** (B4, B5) — it returns JSON and writes the file itself. Geometry
   and computed styles are the **primary** channel; screenshots corroborate, they do not decide.
6. **`elementFromPoint` before every click.** The app stacks draggable windows in one DOM, so a
   coordinate click can land on a different window than intended.
7. **Refuse to score a minimised window.** Every box measures 0×0, which scores as perfect.
   Check `getComputedStyle(section.fwin).display` first and refuse rather than recording zeros.
8. **Freeze the tree during a measured run.** No `src` edit while a harness is up — HMR lands
   in the renderer under measurement.
9. **Check no one else owns the app.** `/logs` showing foreign `[vite] hot updated:` paths means
   another agent is working. Read before attributing or killing anything.
10. **Restore afterwards.** Stop the whole process tree **first**, *then* hash from PowerShell.
    Hashing a runtime file while the app runs measures the app writing its own in-memory state back.
11. **Never use desktop remote control.** The bridge is the only sanctioned channel.

### Scripts

A skill that merely *describes* a trap still lets an agent hand-roll it wrong. Provide small,
tested helpers so the correct path is the easy one. At minimum:

- `scripts/eval.ps1` — takes an expression, posts it correctly, and handles the stash-and-poll
  pattern for promises.
- `scripts/click.ps1` — hit-tests with `elementFromPoint` first, refuses and reports if the
  element under the point is not the intended target.
- `scripts/shot.ps1` — calls `/screenshot`, parses the JSON, returns the written path, and
  reports occlusion failure distinctly from other errors.

Each script must read the port and token from `debug/bridge.json` itself, take no credentials
as arguments, and fail loudly rather than returning an empty result. **Do not start the app to
test them.** Validate argument handling and the no-bridge path (they must give a clear error
when `debug/bridge.json` is absent), and state plainly in your handoff that end-to-end
execution against a live app is unverified and needs one live run before the first audit wave.

---

## 5. Phase 3 — Write `.claude/skills/jp-dispatch/`

**Purpose:** the single source of truth for the rules every dispatched audit run must follow.
Today those rules are copy-pasted prose in each dispatch document, which drifts. After this
skill exists, dispatch documents shrink to scope plus task.

### `SKILL.md` frontmatter

```yaml
---
name: jp-dispatch
description: >
  The working rules for any dispatched agent doing audit or fix work in the
  jp-study-app repo: directory ownership, git and commit discipline, which
  checks are gates and which are not, known-failing suites, handoff format,
  and the evidence standard a finding must meet. Use at the start of any
  dispatched run in this repository, and whenever writing a dispatch prompt
  for another agent.
---
```

### Content the skill must carry

1. **Ownership.** Every run declares the directories it owns and the directories other live
   agents own. Disjoint by construction. `styles.css` (617 KB) is shared by every package and
   belongs to exactly one run at a time.
2. **Git discipline** — reproduce §2 of this document: branch per package, explicit-path `add`,
   never `add -A`, never `stash`, never `gc`/`prune`, never commit or revert another agent's work,
   commit at completion and whenever work is at risk.
3. **The dev app on 5173 belongs to the user.** Do not start, restart, or kill it.
4. **Gates vs non-gates** — the verified G1–G6 list by exact command; `tsc --noEmit` explicitly
   named as *not* a gate with its measured pre-existing error count; the known-failing suites
   named so a pass is not wasted on them.
5. **Report gate results as measured totals, never as a delta you did not cause.** Test and
   i18n counts drift for reasons unrelated to your change.
6. **Default verdict in a labeling pass is document-don't-fix.** The cheapest correct resolution
   of a dishonest control is to disable it and label it honestly, plus a row in `KNOWN_ISSUES.md`
   — not to build the missing backend. A half-built mutation IPC is a new bug surface.
7. **Handoff as you go**, with the required file name pattern and section headings.
8. **Read-back-and-assert-on-all-N** after any repeated or multi-file edit.
9. **The evidence standard**, stated as the rule later runs will be held to:
   - every finding carries the re-runnable command that produced it;
   - a claim of "done" is a hypothesis — the verdict comes from driving the app and observing a
     side effect;
   - a number that does not change when the input it claims to depend on changes is measuring
     something else, and gets challenged before it is reported;
   - a refusal has no positive observable — conclusions about things that did *not* happen come
     from the difference between two runs on identical input, never from an absence read alone;
   - before reporting, ask whether the instrument did the thing it claims, and whether the
     fixture is even capable of showing the thing being tested.

---

## 6. Verify your own output

- Both `SKILL.md` files parse as valid YAML frontmatter + Markdown.
- **Re-read both files from disk after writing** and confirm every fact in them traces to a
  `CONFIRMED` or `CORRECTED` row in your Phase 1 table. List any that do not.
- No file outside your three owned paths is modified: `git status --porcelain` shows only them.
- The scripts run and fail cleanly with no bridge present.

---

## 7. Handoff

Write `docs/audit/HANDOFF_S0_SKILLS.md` **as you go**, containing:

1. The Phase 1 fact table with every row resolved `CONFIRMED` / `CORRECTED` / `UNVERIFIABLE`,
   each with `file:line` or the command used.
2. What you created, path by path.
3. **Anything you could not verify**, stated plainly rather than smoothed over.
4. Any defect you noticed in code you did not own — recorded, not fixed.
5. **One open question for the user, flagged explicitly:** these skills live in the repo's
   `.claude/skills/`, so they become public when the repo is published. Do they get written for
   an outside reader, or added to `.gitignore`? Do not decide this yourself.

---

## 8. Scope discipline

If you finish early, stop. Do not start auditing the app, do not build the three other skills
that were discussed (`honesty-probe`, `css-measure`, `claim-check`), and do not fix anything you
found along the way. Two correct skills are the entire deliverable.
