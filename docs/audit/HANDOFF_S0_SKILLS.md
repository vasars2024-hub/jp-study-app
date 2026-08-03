# HANDOFF S0 — repo skills `jp-bridge` and `jp-dispatch`

Branch: `audit/s0-skills`, cut from `grammarx/phase-1-5` @ `88d7ead`.
Owned paths: `.claude/skills/jp-bridge/**`, `.claude/skills/jp-dispatch/**`,
`docs/audit/HANDOFF_S0_SKILLS.md`. Nothing else was modified.

---

## 1. Phase 1 — fact base verification

Every row below was resolved by reading source. No fact reached either skill without a
`CONFIRMED` or `CORRECTED` row here.

### Bridge / instrument claims

| # | Verdict | Evidence |
|---|---------|----------|
| **B1** | **CORRECTED** | The port/token file is real and its shape is richer than claimed: `debugBridge.ts:421-426` writes `debug/bridge.json` as `{port, token, pid, started}`. Port is a **fixed constant 39273** (`debugBridge.ts:21`), not negotiated. Bind is `127.0.0.1` (`debugBridge.ts:420`) and off-box callers are refused at `debugBridge.ts:397`. **The correction:** `npm start` is plain `electron-forge start` (`package.json` `scripts.start`) — nothing about it is detached; detaching is what the *operator* does. And the bridge does not start merely because you ran `npm start`: `src/main.ts:1419` guards it with `if (isDevServer())`, where `isDevServer()` is `!!MAIN_WINDOW_VITE_DEV_SERVER_URL` (`src/main.ts:472-474`). So a Forge run without a Vite dev server writes no `bridge.json` at all. |
| **B2** | **CORRECTED — undercount** | All seven claimed routes exist, plus **five undocumented ones**. Full set from the `switch` in `debugBridge.ts:206-375`: `/health` (207), `/logs` (210), `/clear-logs` (222), `/eval` (226), `/dom` (245), `/text` (274), `/screenshot` (290), `/click` (305), `/type` (320), `/key` (330), `/focus` (349), `/reload` (366). `/focus` matters most: its own comment (`debugBridge.ts:341-348`) records that Chromium throttles `requestAnimationFrame` in a non-foreground window, so a reveal-on-next-frame effect never runs while an unfocused window is driven — the pass then cannot tell a real defect from the harness. A skill that omitted `/focus` would have left agents measuring throttled windows. |
| **B3** | **CONFIRMED**, plus a trap the claim misses | Field is `body.js` (`debugBridge.ts:229`). Code is spliced into `(${code})` inside an IIFE (`debugBridge.ts:234-238`) — single expression, and no `await`, so a promise serializes to `{}`. **Undocumented trap found while verifying:** the wrapper has a `catch` that re-evaluates `(${code})` a *second* time to stringify it (`debugBridge.ts:236`). Any expression whose result fails `JSON.stringify` — circular refs, `window`, a React fiber — therefore **runs twice**. For a side-effecting expression (a `.click()`, a state mutation) that is a double-apply that looks like one call. Also `__r ?? null` (`:235`) collapses `undefined` into `null`, so `{ok:true,result:null}` cannot distinguish "returned null" from "returned undefined". |
| **B4** | **CONFIRMED** | `debugBridge.ts:294-299`: captures, `mkdir`s `debug/shots/`, writes `win<id>-<epoch>.png`, returns `{ok, path, size}`. Real files on disk match that naming (`debug/shots/win1-1785644372464.png`). One clarification carried into the skill: `size` is `image.getSize()` — a `{width,height}` **dimension object, not a byte count**. The response body is ~120-170 bytes of JSON depending on path length, so piping it to a `.png` yields a tiny JSON file, exactly as claimed. |
| **B5** | **CORRECTED — occlusion is not the documented cause** | `UnknownVizError` appears exactly once in the repo outside the dispatch itself: `docs/migration/TEST_EVIDENCE.md:79-81`. What it actually records is that `/screenshot` failed **once, immediately after a pop-out window was created, and succeeded on the following call** — a newly-created window without a compositor surface yet. The remedy documented there is "give a new window one round-trip before capturing." Nothing in the repo attributes it to occlusion. The skill states the verified version and flags the occlusion theory as unverified. **While verifying this I found a bigger trap on the same page** (`TEST_EVIDENCE.md:76-78`): `screenshot` **lags exactly one call** — a capture taken straight after a click shows the *previous* frame, reproduced 6×. That is a silent false-measurement generator and is now rule 1 of the screenshot section. |
| **B6** | **CONFIRMED, exact** | `debugBridge.ts:380`: `if (app.isPackaged) return; // hard stop — this must never ship`. Line number is exact, not approximate. Note this is the *second* gate — see B1 for the `isDevServer()` gate at the call site. |
| **B7** | **CONFIRMED, but the mechanism in the claim is wrong** | `.mcp.json` declares `jp-app` as `node tools/claude-app-bridge/server.mjs` with a **relative** arg, so the spawn only resolves when cwd is the repo root — that part holds. But the server itself is **cwd-independent once running**: `tools/claude-app-bridge/server.mjs:18-20` resolves `PROJECT_ROOT` from its own file location (`path.resolve(HERE,'..','..')`), not from `process.cwd()`. So the failure mode is "the server never starts", not "the server starts and looks in the wrong place". |
| **B8** | **CONFIRMED** | Every `include` glob in `vitest.config.ts` ends in `*.test.ts`; none matches `.test.tsx`. Both files exist and are therefore dead: `src/renderer/__tests__/externalPlayerPanel.test.tsx` and `src/renderer/__tests__/mediaTrackingSourcesHistory.test.tsx`. Recorded as a defect in §4 — not fixed, not mine. |

### Gate claims

| # | Verdict | Evidence |
|---|---------|----------|
| **G1** | **CONFIRMED** | `npx vitest run`. `package.json` `scripts.test` is `vitest run`; `vitest.config.ts` present. |
| **G2** | **CONFIRMED** | `tools/i18n-check.cjs` exists. Matches the `CLAUDE.md` i18n workflow, which names the same command. |
| **G3** | **CONFIRMED** | `tools/architecture-audit.cjs` exists. |
| **G4** | **CONFIRMED** | `docs/migration/tools/audit-carried-items.mjs` exists. |
| **G5** | **CONFIRMED** | `tools/grammar-audit.cjs` exists (the `--compare` flag itself was not exercised). |
| **G6** | **CONFIRMED** | `docs/migration/tools/license-audit-gate.mjs` exists. |
| **G7** | **CORRECTED** | `npx tsc --noEmit` measured on this tree: **327** errors, not ~288. Command used: `npx tsc --noEmit 2>&1 \| grep -c "error TS"`. Still not a gate. |

File existence was checked for G1-G6; only G7 was executed. No gate was run for a delta.

### Repo-state claims

| # | Verdict | Evidence (`git`) |
|---|---------|------------------|
| **R1** | **CONFIRMED** | `git branch --show-current` → `grammarx/phase-1-5`; `git rev-parse --short HEAD` → `88d7ead`. |
| **R2** | **CONFIRMED — the small number is the true one** | `git status --porcelain \| wc -l` → **18**. The "~1,000" note is stale; ~17 was right. |
| **R3** | **CONFIRMED** | `git stash list` → `stash@{0}` `flashcard-search WIP (full feature) — parked by UI-redesign session`, `stash@{1}` `pre-merge workbranch WIP`. Both live. |
| **R4** | **CONFIRMED** | `git worktree list` → `C:/ProgramData/.../cool-poincare-9b2f0c [claude/cool-poincare-9b2f0c]` @ `eafa4ac` and `C:/Users/Arseniy/Projects/jp-study-app-noctis-beta [codex/noctis-beta]` @ `3fcd64d`, alongside this one. Shared object store — the `gc`/`prune` prohibition is real. |

### Supporting facts verified for the profile section (not in the original table)

- The `--user-data-dir`-in-repo trap is independently documented in three places, so it is not
  the dispatch restating itself: `docs/migration/NEXT_SESSION.md:5-9` (it killed the developer's
  own dev server **twice** and presents as "the renderer never became usable"),
  `docs/migration/CURRENT_STATE.md:99-102`, and
  `docs/MANGA_DOWNLOAD_AND_EXTENSION_VERIFICATION_20260802.md:119`.
- `%APPDATA%\jp-study-app` is the right userData path: `package.json` `name`/`productName` are
  both `jp-study-app`, and the directory exists with **64 entries, 18 of them `.json` state
  files** (`config.json`, `desktop-layout.json`, `library.json`, `media.json`, `profiles.json`,
  `study-orchestrator-v2.json`, …). This is the concrete reason "back up all of it" beats
  "back up the file you think you'll touch".
- `desktop-layout.json` really is rewritten on window movement: path at `src/main/desktop.ts:41`,
  synchronous write at `:46`, `persist()` at `:311` called from `:342`, `:356`, `:374`.
- The stacked-window click problem is documented at `docs/migration/TEST_EVIDENCE.md:68-75`,
  including the working procedure (pop out into an OS window, then **send the same click twice** —
  first focuses, second activates).
- **The harness profile pattern is a *split*, not "everything in tmpdir"** — and the split is the
  part that matters. `music-mining-harness.mjs:46` puts `workRoot` (the *record*) at
  `docs/migration/proof/<run>`, **inside the repo**, while `scratchRoot` (the *profile and
  fixtures*) is `$TEMP/jp-music-harness-<stamp>` at `:62-63` with `userDataDir` off it at `:242`.
  Its 12-line header comment at `:49-61` explains exactly why. `retirement-step3-harness.mjs`
  reaches the same place differently: `workRoot` itself is `os.tmpdir()` (`:83`), `userDataDir` at
  `:215`. My first draft of the skill said "both harnesses put everything in `os.tmpdir()`", which
  is wrong for `music-mining-harness` and would have told an agent to stop version-controlling its
  evidence. Caught during the §6 read-back and corrected.
- `npx tsc --noEmit` → **327**; `src/renderer/styles.css` → **632,257 bytes = 617 KB** (the 617 KB
  figure in the dispatch is exact); the `/screenshot` JSON response body → **137 bytes** for a
  typical path at 1920×1080 (the dispatch's "~137-byte" figure is exact — computed with
  `JSON.stringify({ok,path,size})` over a real `debug/shots/` path).
- Both known-failing suites exist at real paths inside the vitest globs, so they genuinely run:
  `src/shared/__tests__/architectureBaseline.test.ts`,
  `src/renderer/__tests__/flashcardSearch.test.ts`. **I did not re-run the suite to confirm they
  fail** — that is carried from the dispatch and the skill says so.
- Vite dev server on **5173** corroborated at `vite.renderer.config.ts:23`.
- **`KNOWN_ISSUES.md` does not exist anywhere in the repo.** The dispatch's document-don't-fix rule
  tells agents to add a row to it. The skill carries the rule and flags that the file has to be
  created, with its location agreed with the user rather than guessed. I did not create it — not
  my path.

---

## 2. What I created

| Path | What it is |
|---|---|
| `.claude/skills/jp-bridge/SKILL.md` | Driving the live app through the debug bridge: profile discipline, backup rule, connection, per-endpoint mechanics, and the measurement traps. |
| `.claude/skills/jp-bridge/scripts/_common.ps1` | Shared bridge-file reader + request helper. Reads port/token from `debug/bridge.json`; takes no credentials as arguments; throws a clear error when the file is absent. |
| `.claude/skills/jp-bridge/scripts/eval.ps1` | Posts an expression to `/eval` correctly; `-Poll` implements the stash-a-promise-then-poll pattern that a no-await single-expression endpoint requires. |
| `.claude/skills/jp-bridge/scripts/click.ps1` | Hit-tests with `elementFromPoint` first and **refuses** when the element under the point is not the intended target; `-Twice` for the popped-out-window focus-then-activate procedure. |
| `.claude/skills/jp-bridge/scripts/shot.ps1` | Calls `/screenshot`, parses the JSON, returns the written path, and reports the new-window viz failure distinctly from other errors. |
| `.claude/skills/jp-dispatch/SKILL.md` | The working rules for any dispatched run: ownership, git discipline, gates vs non-gates, document-don't-fix, handoff format, evidence standard. |
| `docs/audit/HANDOFF_S0_SKILLS.md` | This file. |

### §6 self-verification — what the read-back actually caught

Both `SKILL.md` files were re-read from disk after writing and every factual claim was traced
back to a row above. The read-back was **not** a formality — it caught three things:

1. **A wrong fact in `jp-bridge` §1** (the harness tmpdir claim, detailed above). Corrected.
2. **An invented number in `jp-dispatch` §5.** My example of a well-formed gate report read
   `npx vitest run → 1,182 passed`. I never ran the suite; that figure was fabricated as
   illustrative filler, in the one skill whose whole subject is not reporting numbers you did not
   measure. Replaced with `<N>`/`<M>` placeholders and an explicit note that no baseline is
   reproduced, because a number written into a skill goes stale and then gets quoted as current
   by someone who never ran it.
3. **An imprecise byte range** (`~120-170`) where the exact value is computable. Now `137`.

Everything else traced clean. Both files carry a dated "verified at `88d7ead`" line so a later
reader knows what to re-measure. The claims in the skills that are **not** verified facts are
marked as such in-line: the `bridge.json`-implies-unclean-exit reading (inferred from source), the
occlusion theory (contradicted, flagged), the known-failing-suite list (carried, not re-run), and
the scripts' live behaviour (untested — see §3).

---

## 3. What I could not verify

1. **The scripts have never run against a live app.** This is the important one. I validated
   argument handling and the no-bridge path only — with no `debug/bridge.json` present, each
   script exits non-zero with a clear "app not running" message. Their end-to-end behaviour
   against a running renderer — that the `/eval` poll pattern round-trips, that `elementFromPoint`
   refusal fires on a real stacked window, that `shot.ps1` parses a real response — is
   **unverified**. The dispatch forbade starting the app, correctly. **One live run should
   exercise all three before the first audit wave depends on them.**
2. **`/screenshot` occlusion (B5).** Corrected above: the repo documents a new-window failure,
   not an occlusion failure. Whether occlusion *also* causes `UnknownVizError` is untested. The
   skill says so explicitly rather than asserting it.
3. **The `desktop-layout.json` loss incident.** The dispatch says a prior session lost it by
   backing up a subset. I found no record of that incident anywhere in `docs/`. The *mechanism*
   is fully verified (§1, `desktop.ts:41/46/311`), so the rule stands on its own evidence; I
   wrote the rule from the mechanism and did not repeat the anecdote as fact.
4. **`grammar-audit.cjs --compare`.** The file exists; the flag was not exercised.
5. **Bridge behaviour when port 39273 is already taken.** `debugBridge.ts:415-418` logs
   `[debugBridge] disabled: …` and nulls the server — so a second instance silently has no
   bridge while the first keeps its own. I did not test this. It is stated in the skill as the
   likely reading of a stale-looking `bridge.json`, flagged as inferred-from-source.

---

## 4. Defects noticed in code I do not own — recorded, not fixed

1. **Two test files have never executed.** `src/renderer/__tests__/externalPlayerPanel.test.tsx`
   and `src/renderer/__tests__/mediaTrackingSourcesHistory.test.tsx` are `.tsx`; every
   `vitest.config.ts` glob ends in `.test.ts`. They pass by never running. Whoever owns
   `vitest.config.ts` should decide between widening the glob to `*.test.{ts,tsx}` (which needs
   a DOM environment — the config is `environment: 'node'`) and deleting the files. Widening the
   glob blind will most likely surface two newly-failing suites, so this is not a one-line fix.
2. **`/eval` double-evaluates on serialization failure** (`debugBridge.ts:234-238`). Detailed in
   B3. A side-effecting expression returning a non-cloneable value applies twice. Low blast
   radius today because it is dev-only, but it can silently corrupt an audit measurement, which
   is exactly what these skills exist to prevent.
3. **`/eval` collapses `undefined` to `null`** (`debugBridge.ts:235`), so a probe cannot
   distinguish "the property is absent" from "the property is null" — relevant to any honesty
   probe that reads a field expecting `undefined` to mean "not implemented".

None of these were touched.

---

## 5. Open question for the user — needs your decision

**These skills live in `.claude/skills/`, which is inside the repo. If this repo is ever
published, they ship with it.**

They currently read as internal working notes. They name the developer's absolute paths
(`%APPDATA%\jp-study-app`), describe the debug bridge's auth model and fixed port in detail,
quote incident history ("it killed the developer's own dev server twice"), and reference the
other live agents' worktrees and parked stashes.

Two options, and this is your call, not mine:

- **(a) Write them for an outside reader** — strip the incident anecdotes and machine-specific
  paths, keep the mechanics. Costs some of the "why", which is the part that actually stops an
  agent from repeating a mistake.
- **(b) Add `.claude/skills/` to `.gitignore`** — keeps them blunt and specific, but they stop
  being version-controlled and stop travelling to the other worktrees, which is most of the
  reason to put them in the repo at all.

I wrote them as **(b)-style** — specific and blunt — because that is what makes them work, and
because reversing later is a mechanical edit while re-adding lost context is not. **I did not
touch `.gitignore`.** If you want (a), say so and it is a short pass over two files.
