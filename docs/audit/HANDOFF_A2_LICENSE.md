# HANDOFF A2 — npm licence compatibility, secrets, `.gitignore`, docs disposition

**Dispatch:** `docs/audit/DISPATCH_A2_LICENSE.md`
**Run date:** 2026-08-04
**Branch:** `audit/a-evidence` · **base commit:** `d75d86e`
**App was not started, restarted or killed.** Every finding below comes from reading the tree,
running the repo's own gate, and running read-only scripts from a scratch directory outside the
repo.

## Scope and ownership

```
Owned:    docs/audit/HANDOFF_A2_LICENSE.md
          docs/audit/GITIGNORE_DRAFT.md
          docs/audit/DOCS_DISPOSITION.md
Foreign:  docs/audit/HANDOFF_A1_ASSETS.md, docs/audit/NOTICES_DRAFT_ASSETS.md  (A1, concurrent)
          public/**  — bundled binary assets are A1's half; not covered here
          everything else in the tree — read-only
```

**Nothing was committed, branched or `git add`-ed**, per the dispatch's deviation from
`jp-dispatch` §2. Three files written, all inside the owned set. `.gitignore` itself was **not**
edited — §3's deliverable is a draft only.

---

## 1. The headline answer: GPL-2.0-only

> **There is no `GPL-2.0-only` dependency in the shipped tree. Nor `LGPL-2.1-only`, nor any
> `-NC` / `NonCommercial`, nor any `-ND` / `NoDerivatives`, nor `UNLICENSED`, nor AGPL.**
> **Verdict: no licence-compatibility blocker to publishing under GPL-3.0-or-later.**

Measured over all **623** non-dev packages in `package-lock.json`, resolved to their installed
`node_modules/<name>/package.json`:

| Constraint incompatible with GPL-3.0-or-later | Packages |
|---|---:|
| `GPL-2.0-only` (incl. bare `GPL-2.0`, which SPDX maps to `-only`) | **0** |
| `LGPL-2.1-only` (incl. bare `LGPL-2.1`) | **0** |
| `LGPL-2.0-only` | **0** |
| `CC-BY-NC*` / any `NonCommercial` term | **0** |
| `*-ND` / any `NoDerivatives` term | **0** |
| `UNLICENSED` / `SEE LICENSE IN` / proprietary | **0** |
| `AGPL-*` | **0** |

There are only **23 distinct licence expressions** across all 623 packages, which is small enough
that the result can be checked by eye rather than trusted to a regex. All 23 are listed here, and
they sum to 623:

```
 462  MIT                     18  0BSD                  1  CC-BY-4.0
  34  ISC                     14  BSD-2-Clause          1  GPL-3.0-or-later
  34  Apache-2.0              10  LGPL-3.0-or-later     1  GPL-3.0
  21  BSD-3-Clause             7  BlueOak-1.0.0         1  Apache-2.0 WITH LLVM-exception
   5  Unlicense                3  Apache-2.0 AND LGPL-3.0-or-later
   2  (none declared)          2  (MIT OR CC0-1.0)      1  (MIT OR GPL-3.0-or-later)
   1  Apache-2.0 AND LGPL-3.0-or-later AND MIT          1  (MIT AND Zlib)
   1  (BSD-2-Clause OR MIT OR Apache-2.0)               1  CC0-1.0        1  BSD
   1  LGPL-2.1-or-later AND (FTL OR GPL-2.0-or-later) AND MIT AND MIT-Modern-Variant
      AND ISC AND NTP AND Zlib AND BSL-1.0
```

### The one non-SPDX licence string in the tree

`parse-cache-control@1.0.1` declares its licence in npm's **legacy array form**, not as an SPDX
expression:

```json
"licenses": [{ "type": "BSD", "url": "http://github.com/hapijs/wreck/raw/master/LICENSE" }]
```

Bare `"BSD"` is ambiguous, and the ambiguity matters: **BSD-4-Clause is GPL-incompatible** because
of its advertising clause. Resolved from the primary source — `node_modules/parse-cache-control/LICENSE`
carries exactly three conditions (retain notice · reproduce in binary form · no endorsement) and
**no advertising clause**. It is **BSD-3-Clause**. **GPL-3.0-compatible; not a blocker.**

> Two method notes, both worth keeping. First, this row is invisible to any scan that reads only
> `package.json`'s `license` *string* — it cost me a wrong count before I caught it (see §9.7).
> Second, `license-audit-gate.mjs` does parse the array form, but its `PERMISSIVE` regex
> (`docs/migration/tools/license-audit-gate.mjs:78`) lists `BSD-2-Clause|BSD-3-Clause` and does
> **not** match bare `BSD` — so this package reaches `permissive` only via `classify()`'s final
> fallthrough (`:112`), not by matching anything. **The gate gets the right answer for the wrong
> reason.** Recorded, not fixed.

### GPL-2

**Exactly one package mentions GPL-2 at all**, and it is the `-or-later` form:

- `jassub@1.7.x` — `LGPL-2.1-or-later AND (FTL OR GPL-2.0-or-later) AND MIT AND
  MIT-Modern-Variant AND ISC AND NTP AND Zlib AND BSL-1.0`
  (`node_modules/jassub/package.json`, `license` field)

Read term by term, because this is the one row where the answer is not obvious:
`LGPL-2.1-**or-later**` may be taken as LGPL-3.0 and folded into a GPLv3 work.
`(FTL OR GPL-2.0-**or-later**)` is the bundled FreeType, and **both branches are GPLv3-compatible**
— that dual licence exists precisely because FTL is *not* GPLv2-compatible, which is the mirror
image of the problem being looked for here. `BSL-1.0`, `NTP`, `Zlib`, `MIT-Modern-Variant` and
`ISC` are permissive and GPL-compatible. **`jassub` is clear.**

Had that expression read `GPL-2.0` or `GPL-2.0-only`, it would have been a hard blocker: `jassub`
is a **direct root dependency** (`package.json` `dependencies`), it is the subtitle renderer this
migration adopted, and there is no drop-in replacement. That is how close this question was to
mattering.

**Method — re-runnable.** The repo gate buckets by copyleft *strength*, so it cannot answer
this. The script used is reproduced in **Appendix B**; it was run from a scratch directory, not
committed:

```
node <scratch>/npm-license-compat.mjs report
```

**Honest limit on the method.** The OR-splitter splits on top-level ` OR ` with a naive string
split, so it mis-parses an `OR` nested inside an `AND` — exactly the `jassub` case. That is why
the script *also* prints an unconditional "any mention of GPL-2 / LGPL-2 / NC / ND / AGPL
anywhere in the expression" sweep, which does not depend on the parser. `jassub` was found by
that second sweep and then read by hand. **The result does not rest on the parser.**

---

## 2. Every claim I was handed, resolved

| # | Claim | What I measured | Verdict |
|---|---|---|---|
| 1 | The licence gate passes | Ran it; exit 0, `PASS` | **CONFIRMED** |
| 2 | Strong copyleft is still exactly two, no third has arrived | `ffmpeg-static@5.3.0` (GPL-3.0-or-later), `rvfc-polyfill@1.0.8` (GPL-3.0) — and no others | **CONFIRMED** |
| 3 | `fast-shallow-equal` and `react-universal-interface` have no declared licence | package.json: true. **But both ship a verbatim `LICENSE` file: The Unlicense** | **CORRECTED** |
| 4 | 15 weak-copyleft packages | 15 in the lockfile; **only 2 are installed on this disk** | **CORRECTED** |
| 5 | `jszip` `(MIT OR GPL-3.0-or-later)` is a choice, not a constraint | Confirmed; 4 such dual rows total | **CONFIRMED** |
| 6 | `automationBuilder.ts:8` hardcodes a developer home path in shipped source | Confirmed — **and it is rendered on screen**, §4 | **CONFIRMED, worse than stated** |
| 7 | MAL client id appears zero times | Zero. It is env/config-only by design | **CONFIRMED** |
| 8 | `.claude/` has no `.gitignore` entry, so it ships | Partly wrong — see §5. Settings files *are* ignored; skills/commands **are tracked** | **CORRECTED** |
| 9 | 85 `*.md` under `docs/**`; 12 under `src/.coordination/` | **87** and **15** tracked | **CORRECTED** |
| 10 | 37 root `*.md`; 20 `src/*.md`; 258 proof dirs | 37 · 20 · 258 | **CONFIRMED** |

### 2.1 The two "no declared licence" packages — resolved from primary source

Both are `streamich` packages pulled in by `react-use`, and **both carry a verbatim
Unlicense text file on disk** even though `package.json` omits the `license` field:

- `node_modules/fast-shallow-equal/LICENSE:1-25` — "This is free and unencumbered software
  released into the public domain… refer to <https://unlicense.org>"
- `node_modules/react-universal-interface/LICENSE:1-25` — byte-identical text

The Unlicense is a public-domain dedication and is GPL-compatible. **No replacement is needed and
no action is required beyond listing them in the notices.** The gate's `unknown: 2` is a
limitation of reading only the `license` *field*; it is not two unlicensed packages.

> **Defect in code I do not own (recorded, not fixed):** `license-audit-gate.mjs`'s
> `declaredLicense()` (`docs/migration/tools/license-audit-gate.mjs:68-76`) never falls back to a
> `LICENSE` file on disk. Both of its current "unknown" rows are resolvable that way. Cheap fix,
> and it would let `UNKNOWN_LICENSE_CEILING` drop from 12 to something meaningful. **A2 did not
> touch this file.**

### 2.2 The "15 weak copyleft" number counts packages that are not on this disk

| | Count |
|---|---:|
| Weak-copyleft rows in the lockfile | 15 |
| …that are **installed** on this machine | **2** — `@img/sharp-win32-x64`, `jassub` |
| …that are other-platform optional binaries, never fetched on win32 | 13 |

Measured: of 623 non-dev lockfile entries, **572 are installed** and **51 are not** — the
not-installed set is entirely other-platform optional binaries (`@img/sharp-*` for
darwin/linux/musl, `@napi-rs/canvas-*`, `@node-llama-cpp/*`, `@reflink/*`).

This matters for the notices file and nothing else: **a Windows artifact cannot owe LGPL
obligations for a libvips build it does not contain.** `LICENSING_PLAN.md`'s table is not wrong
about the lockfile; it is answering a different question from "what ships". `sharp` itself is
transitive via `@huggingface/transformers`.

`rvfc-polyfill`'s provenance, which no record states: it is a **transitive dependency of
`jassub`** (`jassub` → `rvfc-polyfill`), and `jassub` is a direct root dependency. That fully
explains how a GPL-3.0 package "arrived without a decision" — adopting the subtitle renderer
brought it.

### 2.3 One attribution obligation nobody has recorded

`caniuse-lite` is **`CC-BY-4.0`** — the only CC-BY package in the tree. Chain:
root → `jotai` → `@babel/core` → … → `browserslist` → `caniuse-lite`. It is marked non-dev in the
lockfile and is installed.

CC-BY-4.0 is one-way compatible with GPL-3.0, so it is **not** a blocker — but it **requires
attribution**, and `LICENSING_PLAN.md` folds it silently into "permissive 600". It belongs in
`THIRD_PARTY_NOTICES`. Cost: one line.

---

## 3. `THIRD_PARTY_NOTICES` — the npm half

**Generated from the installed tree, because what ships is what is on disk.**

- **534 unique installed non-dev packages** (`name@version`; 572 lockfile rows collapse to 534
  because the tree holds nested duplicate copies, e.g. three `onnxruntime-common` versions).
- **500 of them carry their own `LICENSE` / `COPYING` / `NOTICE` file on disk.**
- **34 do not** — their notice must cite the declared SPDX identifier, since there is no text to
  reproduce. All 34 are named in Appendix A.

### A packaging fact that changes what the notices file has to do

`forge.config.ts:129` sets **`asar: false`**, and `forge.config.ts:136-144`'s `ignore` returns
`false` for anything under `/node_modules` — so **`node_modules` ships loose and whole** inside
`resources/app/node_modules/`. Every one of those 500 `LICENSE` files therefore **already
physically ships with the application.**

That is most of the notice obligation discharged by accident of packaging. It means
`THIRD_PARTY_NOTICES` needs to do two things, not one:

1. **Point at what already ships** — "full licence texts for bundled npm packages are in
   `resources/app/node_modules/<package>/LICENSE`". One paragraph.
2. **Cover the 34 with no text on disk** by SPDX identifier, plus the rows that carry a
   *specific* obligation: `caniuse-lite` (CC-BY-4.0 attribution), `ffmpeg-static` and
   `rvfc-polyfill` (GPL-3.0 — source offer), `jassub` and `@img/sharp-win32-x64` (LGPL — relink
   rights), and `jassub`'s embedded FreeType/libass component notices.

> **Unverified, flagged rather than smoothed:** `packagerConfig.prune` is **not set explicitly**
> in `forge.config.ts`. Electron Packager's default is `prune: true`, which strips
> devDependencies before packaging — that is the assumption behind "non-dev = what ships". I did
> not verify it by inspecting a built artifact, because building was out of scope and the
> dispatch forbids starting anything. **If `prune` is ever disabled, the shipped set becomes the
> full dev tree and this whole audit's denominator changes.** Worth one line of confirmation
> against an `out/` build before the notices file is called final.

Appendix A carries the full roster. Appendix B carries the generator.

---

## 4. Secrets sweep — working tree only

### What I scanned

| Scan | Scope | Result |
|---|---|---|
| Credential-shaped tokens (AWS `AKIA`, `ghp_`, `github_pat_`, Slack `xox*`, `-----BEGIN … PRIVATE KEY-----`, `sk-…`, Google `AIza…`) | all **3,277 tracked files**, `node_modules` excluded | **0 hits** |
| Credential file extensions (`.env`, `.pem`, `.p12`, `.pfx`, `.key`, `.jks`, `.keystore`, `.ppk`, `.crt`, `.cer`, `.asc`, `.gpg`) | `git ls-files` | **0 tracked** |
| MAL client id (32-hex shape) | `src/**` | **0** — see below |
| Developer home paths / `%APPDATA%` / machine names / personal identifiers | `src/**`, then all tracked files | **hits — see below** |

```
git ls-files | wc -l                                   # 3277
git grep -nIE 'AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{36}|...' -- . ':(exclude)node_modules'   # no output
git grep -nE '[0-9a-f]{32}' -- 'src/**'
```

### What I did **not** scan, and why

**Git history is unscanned.** This is deliberate, per the dispatch: the scan's value depends on
an unmade user ruling. If the user squashes to fresh history before publishing, a history scan is
wasted work; if they publish existing history, it becomes mandatory and must cover every one of
the ~3,277 tracked paths' prior revisions plus deleted files. **This handoff makes no claim about
what is in history.** Note that the working tree is clean *today* partly because things were
cleaned up — `LICENSING_PLAN.md:86-103` records `tools/_mazii_*.json` and
`tools/import-mazii-grammar.py` as **deleted**, which is exactly the shape of thing a history
scan exists to catch.

### MAL client id: still zero — and structurally so

The claim holds, and it holds for a good reason rather than by luck. `src/main/malSync.ts:294-316`
reads the client id from the environment (`JP_STUDY_MAL_CLIENT_ID`) or a userData config file,
never from source; the client secret is **env-only and never persisted**
(`src/main/malSync.ts:296-301`). Tokens are `safeStorage`-encrypted into
`<userData>/mal-tokens.json` (`src/main/malSync.ts:191-249`) and never cross into the renderer
(`src/main/malSync.ts:16-19`). **This is the credential design working, not an absence.**

The only 32-hex matches under `src/` are a git commit SHA in
`src/.coordination/study-mode/state.json:7` and incidental byte runs inside two binaries
(`src/media/jassub/assets/jassub-worker*.wasm`, `src/renderer/assets/secret-aero-network-wallpaper.jpg`)
— the same false-positive class the pre-cost pass found in the tesseract blob.

### Developer home paths — confirmed, and there are six, not one

| # | `file:line` | Content | Ships in binary? | Ships in public source? |
|---|---|---|---|---|
| 1 | `src/shared/automationBuilder.ts:8` | `powershell … -File "C:\Users\Arseniy\Projects\jp-study-app\automation-builder.ps1"` | **YES** | yes |
| 2 | `src/.coordination/study-mode/remove-rank22-media-fixture.cjs:19` | `C:\Users\Arseniy\AppData\Roaming\jp-study-app\media.json` | no | yes |
| 3 | `src/.coordination/study-mode/remove-rank22-fixture.cjs:15` | `C:\Users\Arseniy\AppData\Roaming\jp-study-app\study-orchestrator-v2.json` | no | yes |
| 4 | `src/shared/__tests__/seanimeStudyLibrary.test.ts:38` | `C:\Users\Arseniy\Videos\Frieren\Sousou no Frieren - 01.mkv` | no | yes |
| 5 | `src/shared/__tests__/seanimeStudyLibrary.test.ts:168` | `c:/users/arseniy/videos/frieren/…` | no | yes |
| 6 | `src/main/__tests__/seanimeExePath.test.ts:114` | `C:/Users/Arseniy/Projects/seanime-upstream/seanime.exe` (in a comment) | no | yes |

**#1 is materially worse than the pre-cost pass recorded.** It does not merely compile into the
bundle — it is **rendered into the UI**:

- `src/renderer/components/blanc/BlancShell.tsx:2441` —
  `<input readOnly value={AUTOMATION_BUILDER.directLaunchCommand} … />`
- `src/renderer/components/blanc/BlancShell.tsx:2412` —
  `await navigator.clipboard.writeText(AUTOMATION_BUILDER.directLaunchCommand)`

So every user of a published build sees `C:\Users\Arseniy\Projects\jp-study-app\` in a text box
and can copy it to their clipboard. It also confirms the pre-cost pass's Probe F suspicion: the
command is **inert for every user but this one**, because the path does not exist on their
machine. **Not fixed — out of scope per the dispatch §6.** Fix cost: derive the path at runtime
from `app.getAppPath()`, or drop `directLaunchCommand` and show only the relative
`AUTOMATION_BUILDER_COMMAND` that already exists one line above it at
`src/shared/automationBuilder.ts:4-5`. Roughly 20 minutes including the i18n label.

**#2–#6 do not ship in the binary but do ship in a public source repo.** They leak the
developer's Windows username, and #4/#5 additionally name a personal media file. Fix cost: near
zero (they are fixtures and comments — replace `Arseniy` with `user`). Whether that matters is
the user's call; the username is already implied by the GitHub owner (§4.1).

### 4.1 Identifiers that are deliberate, not leaks

These are the user's own published identifiers and appear to be intentional. Recording them so
the "clean" claim has a stated denominator, **not** as findings:

- `src/shared/release.ts:1` — `GITHUB_OWNER = 'vasars2024-hub'`
- `src/shared/resourcesCatalog.ts:6`, `src/main/downloads.ts:789`, `src/main/release.ts:63` —
  `github.com/vasars2024-hub/…` catalog and release URLs
- `src/shared/stats.ts:10` — `https://jp-study-pings.vasars2024.workers.dev`

**One decision hides in that last row.** It is a telemetry/ping endpoint on the user's own
Cloudflare Workers account. Publishing the source publishes the endpoint, and anyone can then
send traffic to it. Not a secret and not a blocker — but worth a rate limit or an auth token
before the repo is public. **User decides.**

---

## 5. `.gitignore` — the dispatch's premise was half right, and the half that was wrong is the dangerous half

Full draft: **`docs/audit/GITIGNORE_DRAFT.md`**. The finding that drove it:

```
$ git check-ignore -v .claude/settings.json .claude/settings.local.json
.gitignore:146:/.claude/settings.json                       .claude/settings.json
"C:\Users\Arseniy/.config/git/ignore":1:**/.claude/settings.local.json   .claude/settings.local.json
```

**`.claude/settings.local.json` is ignored only by a machine-global ignore file in the user's home
directory — not by anything in this repository.** On this machine it is safe. On a fresh clone, on
CI, or for any other contributor, **it is not ignored and one `git add .` commits it.** Its
contents are machine-specific: a `Stop` hook embedding
`/c/Users/Arseniy/AppData/Local/Temp/jp-sweep-*.flag` paths, plus a tool permission allowlist.
No credentials.

This is precisely the "correct today by luck and habit" class the dispatch asked to convert into
a rule, and it is the single highest-value line in the draft.

**Correction to the dispatch's premise:** `.claude/` does *not* wholly ship, and it is not
wholly ignored either. **11 files under `.claude/` are tracked and would publish:**

```
.claude/commands/update-blanc.md      .claude/skills/jp-bridge/SKILL.md
.claude/launch.json                   .claude/skills/jp-bridge/scripts/{_common,click,eval,shot}.ps1
.claude/skills/claim-check/SKILL.md   .claude/skills/jp-dispatch/SKILL.md
.claude/skills/css-measure/SKILL.md   .claude/skills/honesty-probe/SKILL.md
```

What they disclose, verified by reading them:

- `.claude/skills/jp-bridge/SKILL.md:92-95` — the debug bridge's auth model: `debug/bridge.json`
  = `{port, token, pid, started}`, `Authorization: Bearer <token>`, 401 otherwise. The bridge is
  dev-only and the token regenerates per start (`_common.ps1:69` citing `debugBridge.ts:383`), so
  this is documentation of a dev tool, not a live credential — but it is a map of an
  authenticated local HTTP surface.
- `.claude/skills/jp-dispatch/SKILL.md:48-51` — names two **parked stashes** by description and
  two other **worktrees** (`claude/cool-poincare-9b2f0c`, `codex/noctis-beta`). Internal working
  state; meaningless-to-harmful to an outside reader.
- `.claude/skills/css-measure/SKILL.md`, `honesty-probe/SKILL.md`, `claim-check/SKILL.md` —
  incident history: specific past false findings, by file and line.
- `.claude/launch.json` — dev ports 8091 / 5174 / 5185. Harmless.

**Recommendation, not a decision (§7).**

---

## 6. Docs disposition

Full rulings: **`docs/audit/DOCS_DISPOSITION.md`**. Headline numbers, measured this run against
`git ls-files` (i.e. what would actually publish, not what is on disk):

| Family | Tracked | Recommendation |
|---|---:|---|
| root `*.md` | 37 | mixed — 4 PUBLISH, rest BANNER / PRIVATE / CORRECT FIRST |
| `docs/**` `*.md` | **87** | mixed |
| `docs/migration/proof/**` | **286 files across 258 dirs** | **KEEP PRIVATE — whole family** |
| `src/` top-level `*.md` | 20 | PUBLISH WITH BANNER or KEEP PRIVATE |
| `src/.coordination/**` | **15** | **KEEP PRIVATE — whole family** |
| `.claude/**` | 11 | KEEP PRIVATE (§5) |
| **all tracked `*.md`** | **176** | |

**The proof family was not sampled — it was measured.** `git grep` over all 286 tracked files
found a literal `C:\Users\Arseniy` developer home path in **211 of the 247 directories that
contain any tracked text file (85%)**, and personal media titles in **123**. One of the 12 tracked
PNGs, `docs/migration/proof/startatsec-20260730/real-app-1-library.png`, was opened and shows
`C:\Users\Arseniy\Documents\books`, a sidecar datadir path under `AppData\Local\Temp`, a live
port and pid, and **the user's real library including third-party manga cover art and scanlation
pages** (One Punch-Man). That last item is a *copyright* exposure distinct from the privacy one,
and it is the strongest single argument in the whole disposition.

**There is no root `README.md`.** `git ls-files | grep -i '^readme'` returns nothing at root.
`LICENSE` is present. A repo published with 37 root planning documents and no README leads with
its internal working notes. **Writing one is the highest-value item in §6 and it is not in A2's
scope.**

---

## 7. Open questions — the user decides, not me

1. **Squash to fresh history, or publish existing history?** Everything in §4's "not scanned"
   note hangs on this. **This is the gating decision** — a history scan is either mandatory or
   wasted, and nothing else can be planned until it is made.
2. **`.claude/` — publish, or strip?** The skills are genuinely useful engineering artifacts and
   arguably the most interesting thing in the repo. They also disclose incident history, parked
   stashes, other worktrees, and a dev auth surface. My recommendation: publish
   `css-measure` / `honesty-probe` / `claim-check`, strip `jp-dispatch` (§2 is pure internal
   state) and `jp-bridge` (auth surface), and add the `.gitignore` rule for
   `settings.local.json` regardless of the ruling.
3. **The Cloudflare Workers ping endpoint** (`src/shared/stats.ts:10`) — rate-limit or
   authenticate before publishing?
4. **`automationBuilder.ts:8`** — fix before or after publication? It ships a developer path
   *into the UI* and the feature is inert for everyone else. Small fix, visible defect.
5. **Do the test-fixture home paths (#2–#6) matter?** The username is already public via
   `GITHUB_OWNER`. Cheap to scrub; possibly not worth a commit.
6. **Confirm `packagerConfig.prune`** is at its `true` default against a real build, so
   "non-dev = what ships" is verified rather than assumed (§3).

---

## 8. Gate results — measured totals this run

| Gate | Result |
|---|---|
| `node docs/migration/tools/license-audit-gate.mjs` | **PASS**, exit 0 |

```
root license      GPL-3.0-or-later (private: true)
declared deps     81
shipped packages  623
  permissive      600
  dual (OR perm.) 4 — jszip, rc, type-fest ×2
  weak copyleft   15
  strong copyleft 2 — ffmpeg-static (GPL-3.0-or-later), rvfc-polyfill (GPL-3.0)
  AGPL            0
  unknown         2 — fast-shallow-equal, react-universal-interface
sidecar patched   true (patches in repo: 4)
```

**The other five gates were not run.** A2 wrote three markdown files under `docs/audit/` and
changed no source, no catalog, no test and no architecture — `vitest`, `i18n-check`,
`architecture-audit`, `audit-carried-items` and `grammar-audit` cannot be affected by this run,
and running them would only produce numbers that drift with the concurrent A1 agent's work
(`jp-dispatch` §5). `npx tsc --noEmit` likewise not run; it is not a gate and A2 added no
TypeScript.

**Note on the gate's own denominator, recorded not fixed:** `license-audit-gate.mjs` reports
`shipped packages 623`, but 51 of those are not installed and cannot ship. The gate exposes
`counts.notInstalled` in `--json` but does not print it in the human output
(`docs/migration/tools/license-audit-gate.mjs:219`, `:243-252`). Printing one more line would
stop the headline number overstating the shipped set by ~8%.

---

## 9. What I could not establish

Listed plainly. This section being empty would be a false claim.

1. **Git history contents** — not scanned, by instruction (§4). No claim made.
2. **Whether `packagerConfig.prune` is at its default** — inferred from Electron Packager's
   documented default, not verified against a built artifact (§3).
3. **Whether `caniuse-lite` survives into the final artifact.** It is non-dev in the lockfile and
   installed, and `forge.config.ts` ships `node_modules` whole, so it almost certainly does — but
   I did not inspect an `out/` build to confirm. If it does not ship, its CC-BY attribution is
   moot.
4. **The `jassub` component-level licence split.** Its SPDX expression is an `AND` of eight
   terms covering libass, FreeType, fribidi and others. I verified every term is
   GPLv3-compatible, but I did **not** map each term to the component it covers. A complete
   `THIRD_PARTY_NOTICES` should; a compatibility ruling does not need it.
5. **`docs/**` beyond family level.** I read root filenames and sizes, the `docs/` tree shape, and
   sampled contents; I did not read all 176 tracked markdown files end to end. The
   `DOCS_DISPOSITION.md` rulings for individual documents are therefore **recommendations from
   filename, size, family and spot-reads**, and are marked as such where I did not open the file.
   The family-level rulings (proof, `.coordination`, `.claude`) are backed by full-corpus greps.
6. **Whether any published plan document contains a false completion claim.** The dispatch's §4
   worry is legitimate and I could not discharge it: verifying tick-marks against shipped
   behaviour is the `honesty-probe` workload for the *whole* audit, not something A2 can settle
   as a side effect. **`DOCS_DISPOSITION.md` handles this by defaulting every plan/state document
   to PUBLISH WITH BANNER or KEEP PRIVATE rather than PUBLISH** — the banner is exactly the
   mechanism for a claim nobody has re-verified.

7. **A count I got wrong mid-run, recorded because the mechanism will bite the next person.**
   I first wrote "22 distinct licence expressions", then "corrected" it to 23, then found my two
   instruments disagreed and had to settle which was right. **23 is correct.** The cause: a quick
   one-line re-derivation read only `package.json`'s `license` *string*, so it scored
   `parse-cache-control`'s legacy `licenses: [{type:"BSD"}]` array as "(none declared)" and merged
   two groups into one. **The cruder instrument was the one that looked authoritative, because it
   was shorter.** Settled by running both parsers side by side and diffing the rows — one row
   differed, and it was the legacy-array package. Both §1 and Appendix B carry the corrected form.
   It also means any future "packages with no declared licence" count taken with a string-only
   reader reads **3, not 2** — and the third is a false positive.

---

## 10. Defects noticed in code I do not own — recorded, not fixed

| # | `file:line` | Defect |
|---|---|---|
| D1 | `src/shared/automationBuilder.ts:8` + `BlancShell.tsx:2412,2441` | Developer-absolute path shipped **and displayed in the UI**; feature inert for every other user (§4) |
| D2 | `docs/migration/tools/license-audit-gate.mjs:68-76` | `declaredLicense()` ignores on-disk `LICENSE` files; both "unknown" rows are resolvable from them (§2.1) |
| D3 | `docs/migration/tools/license-audit-gate.mjs:243-252` | Human output omits `notInstalled`, overstating the shipped set by 51 packages (§8) |
| D4 | `docs/migration/LICENSING_PLAN.md:32` | "no declared license 2" — both are Unlicense; row is stale (§2.1) |
| D5 | `docs/migration/LICENSING_PLAN.md:29` | "weak copyleft 15" counts 13 packages not installed on any Windows build (§2.2) |
| D6 | `docs/migration/LICENSING_PLAN.md:88-92` | "Unknown" provenance rows for `hsk-import`, `catalogFallback`, `worldMapPaths`, `novels` — already refuted by `PRECOST_A1_A2_PROVENANCE.md:19-22`, never corrected in the plan itself |
| D7 | `docs/audit/PRECOST_A1_A2_PROVENANCE.md:100-106` | Doc counts: `docs/**` is 87 tracked not 85; `src/.coordination/**` is 15 not 12 (§6) |
| D8 | repo root | **No `README.md`** in a repo about to be published (§6) |
| D9 | `src/shared/stats.ts:10` | Unauthenticated ping endpoint on the user's own Cloudflare account, published with the source (§4.1) |
| D10 | `docs/migration/tools/license-audit-gate.mjs:78`, `:112` | `PERMISSIVE` does not match bare `BSD`, so `parse-cache-control` reaches `permissive` only through `classify()`'s final fallthrough — the right answer for the wrong reason. Any *other* unrecognised non-SPDX string would be silently classified permissive the same way (§1) |

---

## Appendix A — packages with no licence text file on disk

These **34** of 534 installed packages ship no `LICENSE` / `COPYING` / `NOTICE` file, so
`THIRD_PARTY_NOTICES` must cover them by SPDX identifier rather than by reproducing text. All are
MIT except `abslink` (Apache-2.0) and `guid-typescript` (ISC) — none carries an obligation beyond
attribution.

```
@napi-rs/canvas-win32-x64-msvc   @rrweb/utils            embla-carousel-react            path-webpack
@reflink/reflink                 @simple-git/args-pathspec embla-carousel-reactive-utils react-remove-scroll-bar
@reflink/reflink-win32-x64-msvc  @simple-git/argv-parser guid-typescript                 rrdom
@rrweb/types                     @types/localforage      https-proxy-agent               rrweb
abslink                          agent-base              isarray                         rrweb-snapshot
embla-carousel                   embla-carousel-autoplay lfa-ponyfill                    simple-git
marks-pane                       onnxruntime-common ×3   onnxruntime-node ×2             throughput
onnxruntime-web                  toggle-selection        tr46
```

## Appendix B — the generator

Not committed; it ran from the session scratch directory. Reproduced here so the result is
re-derivable. It takes `report` (the compatibility scan of §1), `json`, or `notices` (the roster
of §3) as its single argument, reads `package-lock.json` plus each installed
`node_modules/<pkg>/package.json`, and touches the network not at all.

> Rebuild it verbatim from this handoff, or re-derive the headline in one line. **The licence
> reader must handle all three shapes npm has allowed** — `license` string, `license` object, and
> the legacy `licenses` array — or it misses `parse-cache-control` and prints 22:
> ```
> node -e "const fs=require('fs'),p=require('path');const l=JSON.parse(fs.readFileSync('package-lock.json','utf8'));const D=k=>{if(!k)return null;if(typeof k.license==='string'&&k.license.trim())return k.license.trim();if(k.license&&typeof k.license==='object'&&k.license.type)return String(k.license.type);if(Array.isArray(k.licenses)&&k.licenses.length)return k.licenses.map(e=>(e&&e.type)||e).filter(Boolean).join(' OR ');return null};const s=new Set();for(const[k,e]of Object.entries(l.packages)){if(!k.startsWith('node_modules/')||e.dev)continue;let d=null;try{d=JSON.parse(fs.readFileSync(p.join(k,'package.json'),'utf8'))}catch{};s.add(D(d)??(typeof e.license==='string'?e.license:null)??'(none declared)')}console.log(s.size);console.log([...s].sort().join('\n'))"
> ```
> That prints **23** and then lists them. Reading those 23 lines *is* the audit; everything else
> in this document is bookkeeping.

The full 534-package roster follows, grouped by declared licence, generated from the installed
tree on 2026-08-04.

---

## Appendix C — installed npm packages by declared licence (534 unique, 2026-08-04)

`*` marks a package that ships **no** licence text file of its own (Appendix A).

### MIT — 416

```
@babel/code-frame@7.29.7
@babel/compat-data@7.29.7
@babel/core@7.29.7
@babel/generator@7.29.7
@babel/helper-compilation-targets@7.29.7
@babel/helper-globals@7.29.7
@babel/helper-module-imports@7.29.7
@babel/helper-module-transforms@7.29.7
@babel/helper-string-parser@7.29.7
@babel/helper-validator-identifier@7.29.7
@babel/helper-validator-option@7.29.7
@babel/helpers@7.29.7
@babel/parser@7.29.7
@babel/runtime@7.29.7
@babel/template@7.29.7
@babel/traverse@7.29.7
@babel/types@7.29.7
@date-fns/tz@1.5.0
@derhuerst/http-basic@8.2.4
@dnd-kit/accessibility@3.1.1
@dnd-kit/core@6.3.1
@dnd-kit/modifiers@9.0.0
@dnd-kit/sortable@10.0.0
@dnd-kit/utilities@3.2.2
@floating-ui/core@1.8.0
@floating-ui/dom@1.8.0
@floating-ui/react-dom@2.1.9
@floating-ui/utils@0.2.12
@hookform/resolvers@5.5.7
@huggingface/jinja@0.5.9
@img/colour@1.1.0
@jridgewell/gen-mapping@0.3.13
@jridgewell/remapping@2.3.5
@jridgewell/resolve-uri@3.1.2
@jridgewell/sourcemap-codec@1.5.5
@jridgewell/trace-mapping@0.3.31
@kwsites/file-exists@1.1.1
@kwsites/promise-deferred@1.1.1
@napi-rs/canvas-win32-x64-msvc@0.1.100 *
@napi-rs/canvas@0.1.100
@node-llama-cpp/win-arm64@3.19.0
@node-llama-cpp/win-x64-cuda-ext@3.19.0
@node-llama-cpp/win-x64-cuda@3.19.0
@node-llama-cpp/win-x64-vulkan@3.19.0
@node-llama-cpp/win-x64@3.19.0
@radix-ui/number@1.1.3
@radix-ui/primitive@1.1.5
@radix-ui/primitive@1.1.7
@radix-ui/react-accordion@1.2.20
@radix-ui/react-arrow@1.1.11
@radix-ui/react-arrow@1.1.15
@radix-ui/react-checkbox@1.3.11
@radix-ui/react-collapsible@1.1.20
@radix-ui/react-collection@1.1.15
@radix-ui/react-compose-refs@1.1.3
@radix-ui/react-compose-refs@1.1.5
@radix-ui/react-context-menu@2.3.7
@radix-ui/react-context@1.2.0
@radix-ui/react-context@1.2.2
@radix-ui/react-dialog@1.1.23
@radix-ui/react-direction@1.1.4
@radix-ui/react-dismissable-layer@1.1.15
@radix-ui/react-dismissable-layer@1.1.19
@radix-ui/react-dropdown-menu@2.1.24
@radix-ui/react-focus-guards@1.1.6
@radix-ui/react-focus-scope@1.1.16
@radix-ui/react-hover-card@1.1.19
@radix-ui/react-id@1.1.4
@radix-ui/react-menu@2.1.24
@radix-ui/react-popover@1.1.23
@radix-ui/react-popper@1.3.3
@radix-ui/react-popper@1.3.7
@radix-ui/react-portal@1.1.13
@radix-ui/react-portal@1.1.17
@radix-ui/react-presence@1.1.10
@radix-ui/react-presence@1.1.7
@radix-ui/react-primitive@2.1.10
@radix-ui/react-primitive@2.1.7
@radix-ui/react-progress@1.1.12
@radix-ui/react-radio-group@1.4.7
@radix-ui/react-roving-focus@1.1.19
@radix-ui/react-scroll-area@1.2.18
@radix-ui/react-select@2.3.7
@radix-ui/react-separator@1.1.15
@radix-ui/react-slot@1.3.0
@radix-ui/react-slot@1.3.3
@radix-ui/react-switch@1.3.7
@radix-ui/react-tabs@1.1.21
@radix-ui/react-tooltip@1.2.16
@radix-ui/react-use-callback-ref@1.1.2
@radix-ui/react-use-callback-ref@1.1.4
@radix-ui/react-use-controllable-state@1.2.3
@radix-ui/react-use-controllable-state@1.2.6
@radix-ui/react-use-effect-event@0.0.3
@radix-ui/react-use-effect-event@0.0.5
@radix-ui/react-use-is-hydrated@0.1.3
@radix-ui/react-use-layout-effect@1.1.2
@radix-ui/react-use-layout-effect@1.1.4
@radix-ui/react-use-previous@1.1.4
@radix-ui/react-use-rect@1.1.2
@radix-ui/react-use-rect@1.1.4
@radix-ui/react-use-size@1.1.2
@radix-ui/react-use-size@1.1.4
@radix-ui/react-visually-hidden@1.2.11
@radix-ui/rect@1.1.2
@radix-ui/rect@1.1.3
@reflink/reflink-win32-x64-msvc@0.1.19 *
@reflink/reflink@0.1.19 *
@rrweb/types@2.1.1 *
@rrweb/utils@2.1.1 *
@simple-git/args-pathspec@1.0.3 *
@simple-git/argv-parser@1.1.1 *
@standard-schema/spec@1.1.0
@standard-schema/utils@0.3.0
@tabby_ai/hijri-converter@1.0.5
@tanstack/history@1.162.0
@tanstack/query-core@5.101.4
@tanstack/react-query@5.101.4
@tanstack/react-router@1.170.18
@tanstack/react-store@0.9.3
@tanstack/router-core@1.171.15
@tanstack/store@0.9.3
@tinyhttp/content-disposition@2.2.4
@types/css-font-loading-module@0.0.7
@types/js-cookie@3.0.6
@types/localforage@0.0.34 *
@types/node@10.17.60
@types/node@25.9.1
@types/react-dom@19.2.3
@types/react@19.2.15
@uidotdev/usehooks@2.4.1
@xmldom/xmldom@0.7.13
@xobotyi/scrollbar-width@1.9.5
@xstate/fsm@1.6.5
@zag-js/anatomy@1.42.0
@zag-js/core@1.42.0
@zag-js/dom-query@1.42.0
@zag-js/number-input@1.42.0
@zag-js/react@1.42.0
@zag-js/store@1.42.0
@zag-js/types@1.42.0
@zag-js/utils@1.42.0
adm-zip@0.5.17
agent-base@6.0.2 *
ajv-formats@2.1.1
ajv@8.20.0
anime4k-webgpu@1.0.0
ansi-escapes@6.2.1
ansi-regex@5.0.1
ansi-regex@6.2.2
ansi-styles@4.3.0
ansi-styles@6.2.3
aria-hidden@1.2.6
async-retry@1.3.3
async@2.6.4
asynckit@0.4.0
attr-accept@2.2.5
axios@1.18.1
base64-arraybuffer@1.0.2
bmp-js@0.1.0
boolean@3.2.0
browserslist@4.28.7
buffer-from@1.1.2
bytes@3.1.2
call-bind-apply-helpers@1.0.2
chalk@5.6.2
chmodrp@1.0.2
ci-info@4.4.0
cli-cursor@5.0.0
cli-spinners@2.9.2
cli-spinners@3.4.0
clsx@2.1.1
cmake-js@8.0.0
cmdk@1.1.1
color-convert@2.0.1
color-name@1.1.4
colord@2.9.3
combined-stream@1.0.8
commander@10.0.1
concat-stream@2.0.0
convert-source-map@2.0.0
cookie-es@3.1.1
copy-to-clipboard@3.3.3
copy-to-clipboard@4.0.2
core-js@3.49.0
core-util-is@1.0.3
cross-spawn@7.0.6
crypto-js@4.2.0
css-in-js-utils@3.1.0
css-tree@1.1.3
cssom@0.5.0
csstype@3.2.3
date-fns-jalali@4.1.0-0
date-fns@3.6.0
date-fns@4.4.0
debug@2.6.9
debug@4.4.3
deep-extend@0.6.0
define-data-property@1.1.4
define-properties@1.2.1
delayed-stream@1.0.0
detect-node-es@1.1.0
detect-node@2.1.0
dom-serializer@2.0.0
dom-serializer@3.1.1
doublearray@0.0.2
dunder-proto@1.0.1
embla-carousel-autoplay@8.6.0 *
embla-carousel-react@8.6.0 *
embla-carousel-reactive-utils@8.6.0 *
embla-carousel@8.6.0 *
emoji-regex@10.6.0
emoji-regex@8.0.0
encoding@0.1.13
env-paths@2.2.1
env-var@7.5.0
error-stack-parser@2.1.4
es-define-property@1.0.1
es-errors@1.3.0
es-object-atoms@1.1.2
es-set-tostringtag@2.1.0
es6-error@4.1.1
es6-iterator@2.0.3
escalade@3.2.0
escape-string-regexp@4.0.0
event-emitter@0.3.5
eventemitter3@5.0.4
fast-deep-equal@3.1.3
fastest-stable-stringify@2.0.2
fflate@0.8.3
file-selector@2.1.2
filename-reserved-regex@3.0.0
filenamify@6.0.0
follow-redirects@1.16.0
form-data@4.0.6
framer-motion@12.42.2
fs-extra@11.3.6
function-bind@1.1.2
gensync@1.0.0-beta.2
get-east-asian-width@1.6.0
get-intrinsic@1.3.0
get-nonce@1.0.1
get-proto@1.0.1
globalthis@1.0.4
gopd@1.2.0
has-property-descriptors@1.0.2
has-symbols@1.1.0
has-tostringtag@1.0.2
hasown@2.0.4
html-escaper@3.0.3
htmlparser2@10.1.0
http-response-object@3.0.2
https-proxy-agent@5.0.1 *
iconv-lite@0.6.3
ignore@7.0.5
immediate@3.0.6
immer@11.1.15
inline-style-prefixer@7.0.1
ipull@3.9.5
is-fullwidth-code-point@3.0.0
is-fullwidth-code-point@5.1.0
is-interactive@2.0.0
is-unicode-supported@2.1.0
is-url@1.2.4
isarray@1.0.0 *
jotai-derive@0.1.3
jotai-family@1.0.2
jotai-immer@0.4.3
jotai-scope@0.11.0
jotai@2.20.2
js-cookie@3.0.8
js-tokens@4.0.0
jsesc@3.1.0
json-schema-traverse@1.0.0
json5@2.2.3
jsonfile@6.2.1
lfa-ponyfill@1.1.1 *
lie@3.1.1
lie@3.3.0
lifecycle-utils@2.1.0
lifecycle-utils@3.1.1
lodash.debounce@4.0.8
lodash@4.18.1
log-symbols@7.0.1
loose-envify@1.4.0
lowdb@7.0.1
marks-pane@1.0.9 *
matcher@3.0.0
matcher@4.0.0
math-intrinsics@1.1.0
media-captions@1.0.4
mime-db@1.52.0
mime-types@2.1.35
mimic-function@5.0.1
minimist@1.2.8
minizlib@3.1.0
mitt@3.0.1
motion-dom@12.42.2
motion-utils@12.39.0
motion@12.42.2
ms@2.0.0
ms@2.1.3
nanoid@3.3.16
nanoid@5.1.16
node-addon-api@8.9.0
node-api-headers@1.9.0
node-fetch@2.7.0
node-llama-cpp@3.19.0
node-releases@2.0.51
object-assign@4.1.1
object-keys@1.1.1
onetime@7.0.0
onnxruntime-common@1.24.0-dev.20251116-b39e144322 *
onnxruntime-common@1.24.3 *
onnxruntime-common@1.27.0 *
onnxruntime-node@1.24.3 *
onnxruntime-node@1.27.0 *
onnxruntime-web@1.26.0-dev.20260416-b7804b056c *
opencollective-postinstall@2.0.3
ora@9.4.1
parse-ms@3.0.0
parse-ms@4.0.0
path-key@3.1.1
path-webpack@0.0.3 *
platform@1.3.6
postcss@8.5.23
pretty-bytes@6.1.1
pretty-ms@8.0.0
pretty-ms@9.3.0
process-nextick-args@2.0.1
progress@2.0.3
prop-types@15.8.1
proper-lockfile@4.1.2
proxy-compare@3.0.1
proxy-from-env@2.1.0
react-colorful@5.8.0
react-day-picker@9.14.0
react-dom@19.2.6
react-dropzone@14.4.1
react-hook-form@7.83.0
react-icons@5.7.0
react-is@16.13.1
react-remove-scroll-bar@2.3.8 *
react-remove-scroll@2.7.2
react-style-singleton@2.2.3
react@19.2.6
readable-stream@2.3.8
readable-stream@3.6.2
regenerator-runtime@0.13.11
require-directory@2.1.1
require-from-string@2.0.2
resize-observer-polyfill@1.5.1
restore-cursor@5.1.0
retry@0.12.0
retry@0.13.1
rrdom@2.1.1 *
rrweb-snapshot@2.1.1 *
rrweb@2.1.1 *
rtl-css-js@1.16.1
safe-buffer@5.1.2
safe-buffer@5.2.1
safer-buffer@2.1.2
scheduler@0.27.0
screenfull@5.2.0
semver-compare@1.0.0
serialize-error@7.0.1
serialize-error@8.1.0
seroval-plugins@1.5.6
seroval@1.5.6
setimmediate@1.0.5
shebang-command@2.0.0
shebang-regex@3.0.0
simple-git@3.36.0 *
sleep-promise@9.1.0
slice-ansi@7.1.2
slice-ansi@8.0.0
sonner@2.0.7
sql.js@1.12.0
stack-generator@2.0.10
stackframe@1.3.4
stacktrace-gps@3.1.2
stacktrace-js@2.0.2
stdin-discarder@0.3.2
stdout-update@4.0.1
steno@4.0.2
string-width@4.2.3
string-width@7.2.0
string-width@8.2.1
string_decoder@1.1.1
string_decoder@1.3.0
strip-ansi@6.0.1
strip-ansi@7.2.0
strip-json-comments@2.0.1
stylis@4.4.0
tailwind-merge@2.6.1
throttle-debounce@3.0.1
throughput@1.0.2 *
toggle-selection@1.0.6 *
tr46@0.0.3 *
typedarray@0.0.6
undici-types@7.24.6
universalify@2.0.1
update-browserslist-db@1.2.3
url-join@4.0.1
use-callback-ref@1.3.3
use-debounce@10.1.1
use-sidecar@1.1.3
use-sync-external-store@1.6.0
util-deprecate@1.0.2
vaul@1.1.2
whatwg-url@5.0.0
wrap-ansi@7.0.0
yargs@17.7.2
yoctocolors@2.1.2
zlibjs@0.3.1
zod@3.25.76
```

### ISC — 32

```
@isaacs/fs-minipass@4.0.1
boolbase@2.0.0
cliui@8.0.1
d@1.0.2
electron-to-chromium@1.5.396
es5-ext@0.10.64
es6-symbol@3.1.4
esniff@2.0.1
ext@1.7.0
get-caller-file@2.0.5
graceful-fs@4.2.11
guid-typescript@1.0.9 *
inherits@2.0.4
ini@1.3.8
isexe@2.0.0
json-stringify-safe@5.0.1
linkedom@0.18.13
lru-cache@5.1.1
next-tick@1.1.0
picocolors@1.1.1
semver@6.3.1
semver@7.8.1
signal-exit@3.0.7
signal-exit@4.1.0
type@2.7.3
uhyphen@0.2.0
validate-npm-package-name@7.0.2
which@2.0.2
which@6.0.1
y18n@5.0.8
yallist@3.1.1
yargs-parser@21.1.1
```

### Apache-2.0 — 24

```
@huggingface/tokenizers@0.1.3
@huggingface/transformers@4.2.0
@internationalized/number@3.6.7
@mozilla/readability@0.6.0
@sglkc/kuromoji@1.1.0
@swc/helpers@0.5.23
abslink@1.2.2 *
baseline-browser-mapping@2.11.5
caseless@0.12.0
class-variance-authority@0.7.1
detect-libc@2.1.2
electron-squirrel-startup@1.0.1
flatbuffers@25.9.23
hls.js@1.6.16
idb-keyval@6.2.4
kuromoji@0.1.2
localforage@1.10.0
long@5.3.2
pdfjs-dist@4.10.38
sharp@0.34.5
tesseract.js-core@7.0.0
tesseract.js@7.0.0
typescript@5.2.2
wasm-feature-detect@1.8.0
```

### BSD-3-Clause — 21

```
@protobufjs/aspromise@1.1.2
@protobufjs/base64@1.1.2
@protobufjs/codegen@2.0.5
@protobufjs/eventemitter@1.1.1
@protobufjs/fetch@1.1.1
@protobufjs/float@1.0.2
@protobufjs/inquire@1.1.2
@protobufjs/path@1.1.2
@protobufjs/pool@1.1.0
@protobufjs/utf8@1.1.1
@webgpu/types@0.1.71
fast-uri@3.1.2
global-agent@3.0.0
global-agent@4.1.3
hyphenate-style-name@1.1.0
protobufjs@7.6.2
roarr@2.15.4
source-map-js@1.2.1
source-map@0.5.6
source-map@0.6.1
sprintf-js@1.1.3
```

### BSD-2-Clause — 14

```
css-select@7.0.0
css-what@8.0.0
domelementtype@2.3.0
domelementtype@3.0.0
domhandler@5.0.3
domhandler@6.0.1
domutils@3.2.2
domutils@4.0.2
entities@4.5.0
entities@7.0.1
entities@8.0.0
epubjs@0.3.93
nth-check@3.0.1
webidl-conversions@3.0.1
```

### BlueOak-1.0.0 — 5

```
chownr@3.0.0
isexe@4.0.0
minipass@7.1.3
tar@7.5.19
yallist@5.0.0
```

### Unlicense — 5

```
isbot@5.2.1
nano-css@5.6.2
react-use@17.6.1
set-harmonic-interval@1.0.1
ts-easing@0.2.0
```

### (none declared — see LICENSE file on disk) — 2

```
fast-shallow-equal@1.0.0
react-universal-interface@0.6.2
```

### 0BSD — 2

```
tslib@1.14.1
tslib@2.8.1
```

### (MIT OR CC0-1.0) — 2

```
type-fest@0.13.1
type-fest@0.20.2
```

### Apache-2.0 AND LGPL-3.0-or-later — 1

```
@img/sharp-win32-x64@0.34.5
```

### CC-BY-4.0 — 1

```
caniuse-lite@1.0.30001806
```

### GPL-3.0-or-later — 1

```
ffmpeg-static@5.3.0
```

### LGPL-2.1-or-later AND (FTL OR GPL-2.0-or-later) AND MIT AND MIT-Modern-Variant AND ISC AND NTP AND Zlib AND BSL-1.0 — 1

```
jassub@2.5.6
```

### (MIT OR GPL-3.0-or-later) — 1

```
jszip@3.10.1
```

### CC0-1.0 — 1

```
mdn-data@2.0.14
```

### Apache-2.0 WITH LLVM-exception — 1

```
mousetrap@1.6.5
```

### (MIT AND Zlib) — 1

```
pako@1.0.11
```

### BSD — 1

```
parse-cache-control@1.0.1
```

### (BSD-2-Clause OR MIT OR Apache-2.0) — 1

```
rc@1.2.8
```

### GPL-3.0 — 1

```
rvfc-polyfill@1.0.8
```
