You are the **scheduled leftover-and-sweep run** for the Seanime migration track in
`C:\Users\Arseniy\Projects\jp-study-app`. You were started automatically by a Windows scheduled
task. The user is not watching — work autonomously and record everything.

## Read first (in this order)
1. `docs/migration/NEXT_SESSION.md` — newest-first, **EXCEPT slice 45 at the BOTTOM**.
2. `docs/migration/progress.json` — `phaseStatus20260803` is the current summary.
3. `node docs/migration/tools/audit-carried-items.mjs` — must stay **exit 0**.

**Baselines measured 2026-08-03:** `npx vitest run` **374 files / 4815 tests pass**,
`node tools/i18n-check.cjs` **exit 0**, `node tools/architecture-audit.cjs` **"Nothing new"**,
`node docs/migration/tools/audit-carried-items.mjs` **exit 0**.
State measured totals, never a delta you did not cause.

---

# HOW THIS RUN ENDS — READ THIS FIRST

**A Stop hook is armed for this run and it will not let you stop early.** The runner sets
`JP_SWEEP_ACTIVE=1`, and `.claude/settings.local.json` has a `Stop` hook that blocks and tells you
to continue while that variable is set and the completion sentinel is absent. Normal interactive
sessions never set the variable, so the hook is inert for them.

**To finish, create the sentinel file:**

```
C:/Users/Arseniy/AppData/Local/Temp/jp-sweep-complete.flag
```

**Create it only when every part below is genuinely complete**, including
`USER_VERIFICATION_CHECKLIST.md`. Creating it early is the exact failure this whole track exists to
prevent — a run that reports itself done while unfinished. If you hit a genuine blocker you cannot
work around (both worker accounts rate-limited AND a gate that cannot run), write the blocker into
your slice doc **and into the checklist**, then create the sentinel. A blocked run that says so is
finished; a run that quietly skips work is not.

There is a runaway guard: after 40 blocked stops the hook releases regardless. **If you see that,
something has gone wrong** — do not treat it as permission to stop silently; say so in the report.

---

# PARALLELISM — YOU ARE THE COORDINATOR. USE claude-x AND claude-backup.

**You are running as `claude-primary`.** Two other accounts exist and the user has explicitly asked
that they be used. Dispatch headless workers like this:

```bash
CLAUDE_CONFIG_DIR=/c/Users/Arseniy/.claude-x nohup claude -p "$(cat <brief-file>)" \
  --permission-mode acceptEdits > /c/Users/Arseniy/AppData/Local/Temp/x-<slice>.log 2>&1 &

CLAUDE_CONFIG_DIR=/c/Users/Arseniy/.claude-backup nohup claude -p "$(cat <brief-file>)" \
  --permission-mode acceptEdits > /c/Users/Arseniy/AppData/Local/Temp/backup-<slice>.log 2>&1 &
```

## Rules, every one of which was paid for

1. **NEVER dispatch to `claude-primary`** — the account you are running on. A headless run on your
   own account competes for your own quota, and you cannot tell which account you are on from the
   config paths alone.
2. **Fence every worker by FILE OWNERSHIP, explicitly, in its brief.** Two agents editing the same
   file is the failure this track has hit most. State what it owns, and list what it must not touch
   (`out/`, `docs/migration/tools/**` if you are running gates, and any file another worker owns).
3. **NEVER let a worker run `npm run package` or touch `out/`.** You own the build. A rebuild
   underneath a running gate corrupts the measurement.
4. **`NEXT_SESSION.md` and `progress.json` are YOURS.** Workers write their own
   `SLICE_NN_*.md` and you merge. Two writers on the handoff has broken it before.
5. **Expect their gates to be REFUSED.** Six workers on this track had `npx vitest run`, `npm test`,
   the audit — and in two cases `WebFetch` — denied by their permission layer. **You must run every
   gate yourself and treat "an agent wrote a test" and "the test passes" as different claims.**
   That is not paranoia: it caught an orphan module, a drift guard asserting how esbuild spells a
   number, and a test that passed alone and failed in its own file.
6. **Verify their central claims against the code**, not the report. Two workers were right to
   refuse their brief's premise; one report over-stated a finding that did not survive checking.
7. **Session limits are common.** If a worker dies mid-task its handoff file is the only record —
   tell it to write results AS IT GOES, and pick up whatever it left.

## Suggested split (adjust if the gap table says otherwise)

- **claude-x → PART 1**, Chrome-extension parity. Owns `extension/**`,
  `src/main/extensionServer.ts`, the shared contracts it must extend, its tests, the i18n catalogs.
- **claude-backup → the remaining THEMES in PART 2.** Accessibility has only ever been measured on
  2 of 12. It owns nothing in `src/` — it runs `--theme=<id>` sweeps and reports. Give it the theme
  ids and tell it not to fix anything, only measure and report; you decide what to fix.
- **You** run PART 0, the builds, every packaged gate, PART 3, and all merging.

If both accounts are rate-limited, say so plainly in the report and do the work serially yourself.
**Do not fabricate parallelism that did not happen.**

---

# PART 0 — THE CHECKPOINT COMMIT. DO THIS FIRST, BEFORE ANYTHING ELSE.

**The user explicitly authorised one big commit of the working tree on 2026-08-03.** This
OVERRIDES the standing "never commit, never `git add -A`" rule in every earlier brief on this
track — but only for this one commit, and only under the conditions below.

**Why first:** roughly **1,200 changed paths exist nowhere but this disk**, and the gates are green
right now (374 files / 4815 tests, i18n 0, architecture "Nothing new", audit 0). Committing a
known-good state before a long autonomous run is the safety net; if the sweep breaks something you
can diff against it. Do not reorder this to the end.

## Steps, in order

1. **Confirm the branch.** You must be on **`grammarx/phase-1-5`** in
   `C:\Users\Arseniy\Projects\jp-study-app`. If not, STOP and record why — do not switch branches.
2. **Re-run the gates first.** If `npx vitest run` is not green, **do not commit** — record the
   failure and stop. A checkpoint of a broken tree is worse than no checkpoint.
3. **Stage everything in THIS worktree**, then commit once.
   - `git add -A` is authorised **for this commit only**.
   - Expect roughly: **716 untracked, 266 modified, 218 deleted**. If the count differs wildly
     from that, stop and report rather than committing something unexpected.
4. **DO NOT touch the other worktrees.** `git worktree list` shows three:
   - `C:\Users\Arseniy\Projects\jp-study-app` — `grammarx/phase-1-5` ← **only this one**
   - `C:\Users\Arseniy\Projects\jp-study-app-noctis-beta` — `codex/noctis-beta` ← **EXCLUDED by the
     user.** It is a separate worktree with its own working directory, so a commit here cannot
     reach it. Do not `cd` there, do not stage from it, do not merge it.
   - `C:\ProgramData\...\Git\jp-study-app\cool-poincare-9b2f0c` — `claude/cool-poincare-9b2f0c` —
     leave alone.
5. **The 11 `NOCTIS*` / `noctis*` DELETIONS in the main tree ARE included** and that is deliberate.
   They are a *Noctis retirement* performed in this worktree (plus one new
   `noctisRetirement.test.ts`), which is a different thing from the `codex/noctis-beta` branch.
   Excluding them would leave the tree half-committed. **Say so explicitly in your report** so the
   user can object.
6. **NEVER `git stash`.** Two stashes are parked (`flashcard-search WIP`, `pre-merge workbranch
   WIP`) and a failed push/pop has detonated across ~990 files before. Leave them alone.
7. **Do not push.** Local commit only, unless the user has said otherwise since.
8. **No credentials in the commit.** Scan the diff for tokens, client ids and passwords before
   committing. If you find any, stop and report.

Commit message: a real summary of what landed (Phase 7 close-out, Phase 8 items 1–3, the
accessibility work across two themes, the pixel sampler, the offline renderer surface), not
"checkpoint". End it with:

```
Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

**After the sweep, make a SECOND commit** for whatever the sweep itself produced, so the two are
separable.

---

# PART 1 — finish the leftover (Phase 8 item 4)

**Chrome-extension parity.** The full brief is
`C:\Users\Arseniy\AppData\Local\Temp\claude\C--Users-Arseniy-Projects\65e72093-fec0-49a4-b4f2-66f3a3dbada6\scratchpad\x-slice74.md`
— read it and follow it. If that path is gone, the essentials:

- `FEATURE_PARITY_LEDGER.md:106-110` states the requirement precisely: *"Their identities and
  events must exist in the shared contracts from Phase 2 so promotion later is additive."*
  **That sentence is the spec.** It is NOT "port every extension feature into the app."
- Produce the **gap table first**, from evidence, with file:line: for each feature in
  `EXTENSION_FEATURE_TRUTH_MATRIX.md`, does its identity/event exist in the shared contracts today?
- A feature whose **contract** is missing is a parity gap. A feature whose contract exists but whose
  app-side UI does not is a **deferred promotion**, which the ledger explicitly permits — classify
  it, do not build it.
- **Concluding "already substantially satisfied by the v3.0.0 rebuild, here is the evidence" is a
  legitimate and valuable outcome.** Two agents on this track were briefed to fix things that did
  not exist and were right to refuse.
- Slice 70 already closed one parity gap (in-page lookup on a live `<webview>` guest). Do not redo it.

Write it up in `docs/migration/SLICE_74_EXTENSION_PARITY.md`.

---

# PART 2 — THE PRACTICAL SWEEP (this is the main deliverable)

**"Practical" means: drive the packaged app and observe what a user would see.** Not unit tests.
Not reading source. The whole lesson of this track is that source-level reasoning loses to
measurement — nine times a confident number turned out to be measuring something else.

The packaged app is `out/jp-study-app-win32-x64/jp-study-app.exe`. **REBUILD FIRST**
(`npm run package`) so the sweep measures the current source, then do not rebuild again mid-sweep.

## Rules for the sweep
- **Every claim must be a measurement against the packaged app**, with the proof path recorded.
- **A verdict is a difference between two controlled runs, never an absence read alone.** A step
  that observed nothing is `UNTESTED`, never `PASS`.
- If a surface cannot be reached (no library, no sidecar, no account), say **NOT-REACHABLE** and say
  why. Do not report it as working.
- **Ask what each instrument actually did.** Existing gates in `docs/migration/tools/` already
  encode most of this — prefer running them over writing new ones.

## The existing gates to run (all of these already work)
```
node docs/migration/tools/packaged-a11y-deep-gate.mjs                    # default theme
node docs/migration/tools/packaged-a11y-deep-gate.mjs --fixture          # with seeded artwork
SEANIME_SIDECAR=0 node docs/migration/tools/packaged-a11y-deep-gate.mjs --fixture   # local grid
node docs/migration/tools/packaged-a11y-deep-gate.mjs --theme=frutiger-aero --pixels
node docs/migration/tools/packaged-a11y-deep-gate.mjs --pixels           # default, pixel path
node docs/migration/tools/phase7-queue-refusal-live-gate.mjs             # AI allow-list refusal
node docs/migration/tools/packaged-offline-gate.mjs --control            # needs internet
node docs/migration/tools/packaged-offline-gate.mjs                      # blocked half
node docs/migration/tools/packaged-csp-gate.mjs                          # if present
node docs/migration/tools/audit-carried-items.mjs
```
Run `--selfcheck` on any gate that offers it **before** the expensive run.

## Themes
Accessibility has only ever been measured on **two** of the twelve themes (default and
`frutiger-aero`). Run `--theme=<id>` across the others. Theme ids are registered in
`src/renderer/theme/*.ts` (`registerTheme`). **Step 0a hard-fails if a theme did not apply** — trust
that, and if it fails, the id is wrong.
Expect the same class of finding aero had: a light theme cannot use the same indicator colours as a
dark one.

## Feature-by-feature
For each area, drive it and record what appears: **dictionary lookup, Anki/flashcards, reading
(EPUB/PDF/manga), the media library and player, the Immersion browser, the Blanc agent panel,
YouTube playlists + the new discovery panel, MAL sync (see below), settings,
the scraper/discover surface.**

### MAL sync — a real client ID is now configured. Read this before touching it.

The user registered a MAL app on 2026-08-03. **The client ID lives in the user environment
variable `JP_STUDY_MAL_CLIENT_ID`.** It is deliberately NOT in this repo and NOT in this brief,
because Part 0 runs `git add -A` and a client id must never land in a commit.

- **NEVER print, log or echo its value**, and never write it into any file under the repo. Refer to
  it by name only. If you find it in a diff, stop and report.
- **You CAN and SHOULD verify the configured path**, which was previously unreachable:
  - `status()` should now report `configured: true` (previously false),
  - the authorize URL builds with `response_type=code`, `code_challenge_method=plain`,
    a `state`, and the client id — **assert the SHAPE, not the value**,
  - the `not-configured` error path should no longer fire.
- **DO NOT attempt to complete OAuth.** It requires a human to approve in a browser and paste the
  `code` and `state` back — `completeAuth(code, state)` is an IPC the UI calls, there is no
  loopback listener and no protocol handler. An automated run cannot do it and must not try.
- **DO NOT perform any list write.** A write mutates the user's real MyAnimeList list. There is no
  auto-sync by design; keep it that way. Report the write path as **NOT-REACHABLE (needs the user)**.
- Registered redirect: `http://localhost/oauth/callback`. The app runs no server there, so the
  browser landing on a dead page is EXPECTED — the code is read out of the address bar by hand.

**In the checklist (Part 3), MAL sync stays the highest-risk user item**, and the reason changes
slightly now: it is no longer "unconfigured", it is "configured but never once executed against a
real account". 36 tests cover it over a fake transport with zero network calls. The first real
execution will be the user's.

For each: does it mount, does it render real content, does it degrade honestly when its dependency
is missing? Record `PASS` / `UNTESTED` / `NOT-REACHABLE` / `FAIL` with evidence.

---

# PART 3 — WHAT THE USER MUST VERIFY (required output)

Produce `docs/migration/USER_VERIFICATION_CHECKLIST.md`. This is the point of the whole run.

For each item: **what to do, what you should see, and why a machine could not check it.** Only
include things that genuinely need a human or hardware/data that does not exist here. Known ones:

- **MAL sync against a real account** — needs the user's MyAnimeList credentials and a `clientId`.
  Never auto-sync; it mutates a real list.
- **Clean-machine smoke** — needs a machine that has never run the app.
- **Upgrade from representative old data** — no old-format profile exists on this box.
- **Whisper first-use model download** — a multi-hundred-MB fetch, deliberately never triggered.
- **Anything visual/aesthetic.** Contrast is measured; *taste* is not. The aero theme had four
  colour changes land — the user should look at them.
- **Anything touching their real `%APPDATA%/jp-study-app` profile or their ~82-deck Anki
  collection** — every harness deliberately uses a throwaway profile.

Rank by risk. Say plainly which items would ship a defect if skipped.

---

## HARD CONSTRAINTS
- `out/jp-study-app-win32-x64.pre-storage-fix/` is a **preserved control binary** — never delete it.
- **NEVER `git add -A`. NEVER commit, revert, restore or checkout anything you did not write** —
  ~1,200 paths are uncommitted and belong to several tracks. **NEVER `git stash`** — two parked
  stashes are live and a failed push/pop has detonated across ~990 files before.
- **Anki is live on a real ~82-deck collection. Never point anything at the real
  `%APPDATA%/jp-study-app` profile.** Harnesses use `os.tmpdir()` scratch profiles — keep it that way.
- Do not move the upstream pin: `C:\Users\Arseniy\Projects\seanime-upstream` must end at `9bdd052`.
- **No credential, token or client id committed**, including in fixtures or docs.

## TRAPS THIS TRACK HAS PAID FOR
- **No backticks inside the page-side probe template literals** in `docs/migration/tools/*.mjs` —
  a backtick ends the probe string and the file stops parsing with an error pointing at prose.
  It has caught four separate authors. The same applies to backticks in a `node -e` string, where
  bash performs command substitution and silently deletes the text.
- **Double your backslashes** in any regex written inside those literals. A single `\s` reaches the
  browser as a bare `s` — a regex that matches nothing and throws nothing. Run
  `node docs/migration/tools/scan-probe-escapes.mjs docs/migration/tools/<file>.mjs` (expects 0).
- **Never read an exit code through a pipe** — `... | tail` reports tail's status, not the gate's.
- **A token is advisory until proven.** Four times a CSS rule outranked the token meant to control
  it. Always rebuild and re-measure after a token change; the diff looking right means nothing.
- **All-zero across every bucket including the catch-all is the shape of a field that never
  arrived**, not a clean result.

## RECORD AS YOU GO
Several runs on this track have died at a usage limit having done all the work and none of the
recording. Write into your slice doc the moment you have each result. Update
`docs/migration/NEXT_SESSION.md` (newest at top, slice 45 stays at the bottom) and
`docs/migration/progress.json` (validate it parses, and keep `audit-carried-items.mjs` at exit 0).

## FINAL REPORT
1. Phase 8 item 4: the gap table and your verdict.
2. The sweep: a table of every surface with PASS / FAIL / UNTESTED / NOT-REACHABLE and proof paths.
3. Every gate's measured totals.
4. `USER_VERIFICATION_CHECKLIST.md`, ranked by risk.
5. Anything that contradicted this brief — pushing back is expected and has been right repeatedly.
