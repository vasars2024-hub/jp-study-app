# `.gitignore` hardening — draft

**Produced by A2, 2026-08-04.** `docs/audit/DISPATCH_A2_LICENSE.md` §3.
**This is a draft. `.gitignore` itself was not edited** — applying it is the user's call.

The current `.gitignore` is 154 lines and is good at what it covers: build output, `node_modules`,
the staged sidecar, the 1.4 GB `public/` blobs, `debug/`, `out/`. **What it does not cover is
personal study data** — dictionaries, decks, subtitles, mined sentences, media, downloaded models.
Those are absent from the repo today because they live in Electron `userData`
(`%APPDATA%/jp-study-app/`) and nobody has ever copied one in. That is habit, not a rule.

**Once the repo is public, one careless `git add .` is unrecoverable** — the object is in every
clone and every fork before it can be withdrawn.

---

## 1. The gap, measured

`git check-ignore` against the **current** `.gitignore`, for paths a plausible accident would
create:

| Hypothetical path | Currently ignored? |
|---|---|
| `JMdict_e.json` | **NO** |
| `userdata/term_bank_1.json` (Yomitan) | **NO** |
| `decks/N1.apkg` (Anki) | **NO** |
| `subs/ep01.srt` (Kitsunekko) | **NO** |
| `media/ep01.mkv` | **NO** |
| `models/whisper-base.onnx` | **NO** |
| `mined-sentences.json` | **NO** |
| `debug/bridge.json` | yes (`.gitignore:125`) |
| `out/app/x.js` | yes (`.gitignore:92`) |

**Seven of nine dangerous paths are committable right now.**

### The one that is worse than "not covered"

```
$ git check-ignore -v .claude/settings.json .claude/settings.local.json
.gitignore:146:/.claude/settings.json                       .claude/settings.json
"C:\Users\Arseniy/.config/git/ignore":1:**/.claude/settings.local.json   .claude/settings.local.json
```

`.claude/settings.local.json` is ignored **only by a machine-global ignore file in the user's home
directory.** Nothing in this repository ignores it. On this machine it is safe; **on a fresh
clone, in CI, or for any other contributor it is not ignored at all.** It currently holds a `Stop`
hook embedding `/c/Users/Arseniy/AppData/Local/Temp/jp-sweep-*.flag` and a tool permission
allowlist — machine-specific, no credentials. Its sibling `.claude/settings.json` *is* covered by
the repo, so the asymmetry looks like an oversight rather than a decision.

`.git/info/exclude` carries ten more `.claude/*` runtime rules (`mailbox/`, `checkpoints/`,
`agent-registry.json`, …) with the same problem: **`.git/info/exclude` is not cloned.** Every one
of those is repo-local-only protection that vanishes for anyone else.

**Every rule in §3's `.claude/` block is one of these — moved from a location that does not travel
into one that does.**

---

## 2. How this was verified

An untested ignore rule is a hypothesis, and one of them was actively dangerous.

**The first draft contained `*.ts`** — intended for MPEG transport-stream video. It matched
**1,178 tracked TypeScript files.** Caught by the check below, removed, replaced with `*.m2ts`.
`*.wasm` and `*.vtt` were similarly over-broad and now carry negations.

Two checks, both re-runnable:

**a. Nothing already tracked is shadowed.**

```
git ls-files -i -c --exclude-from=<rules>     # → 0 lines
```

(Note: `.gitignore` does not affect files already tracked, so a match here would not *break*
anything — it would silently mislead the next person who deletes and re-adds the file. Zero is
the only acceptable result.)

**b. The rules do what they claim.** A throwaway `git init` repo outside this tree, the rules
copied in as `.gitignore`, then `git check-ignore` over 69 paths that must be ignored and 13 that
must be kept:

```
PASS=82 FAIL=0
```

The "must be kept" set deliberately includes the traps: `src/foo.ts`, `.env.example`,
`src/media/jassub/assets/jassub-worker.wasm`, `src/main/__tests__/fixtures/phase4-proof.vtt`,
`public/cedict/cedict.u8`, `src/renderer/data/novels.ts`.

---

## 3. Proposed additions

**Append to the existing `.gitignore`. Nothing below removes or replaces an existing rule** —
some intentionally restate one (`out/`, `dist/`, `debug/`) so the blocks read as complete; git
does not mind duplicates.

```gitignore
# =====================================================================
# PUBLICATION HARDENING — added <date>, see docs/audit/GITIGNORE_DRAFT.md
# These paths are absent today by habit. Before the repo goes public they
# must be absent by rule: one `git add .` after publication is permanent.
# =====================================================================

# --- Agent / machine-local config -----------------------------------
# Ignored today only by a machine-global ignore file that is NOT cloned.
.claude/settings.local.json
# The rest mirror .git/info/exclude, which is also not cloned — agent
# runtime state, per-machine, meaningless and occasionally sensitive.
.claude/scheduled_tasks.json
.claude/scheduled_tasks.lock
.claude/routines/.state/
.claude/worktrees/
.claude/checkpoints/
.claude/mailbox/
.claude/agent-registry.json
.claude/agent-memory-local/
.claude/first-run
.claude/assistant-daemon-state.json

# --- Credentials ------------------------------------------------------
# Zero of these exist in the tree today; the rule is what keeps it true.
.env
.env.*
!.env.example          # a committed template is the point of having one
*.pem
*.p12
*.pfx
*.key
*.jks
*.keystore
*.ppk
id_rsa
id_ed25519
*.crt
*.cer
*.asc
*.gpg
secrets.json
credentials.json

# --- Dictionaries: JMdict / Yomitan / kanjidic -----------------------
# CC BY-SA licensed and hundreds of MB; live in userData, never in git.
JMdict*
JMnedict*
jmdict*
kanjidic*
KANJIDIC*
term_bank_*.json       # Yomitan dictionary shard naming
term_meta_bank_*.json
kanji_bank_*.json
tag_bank_*.json
*.dic
*.dicz
*.aff
dictionaries/
dictionary-data/
yomitan/
yomichan/

# --- JPDB frequency dictionary ---------------------------------------
# 550,408 entries; redistribution terms are not established.
jpdb*.json
jpdb*.txt
*frequency*.json
*-freq.json

# --- Anki decks -------------------------------------------------------
# Imported N1–N5 decks are third-party content plus personal scheduling.
*.apkg
*.colpkg
*.anki2
*.ankiaddon

# --- Subtitles (Kitsunekko and any other source) ---------------------
# Third-party subtitle files; also reveal exactly what the user watches.
*.srt
*.ass
*.ssa
*.vtt
*.sub
*.sbv
subtitles/
subs/
kitsunekko/
# Test fixtures are deliberate, committed, and tiny — keep them.
!**/__tests__/fixtures/**

# --- Media ------------------------------------------------------------
# Video/audio/books: size, copyright, and personal-library disclosure.
*.mp4
*.mkv
*.avi
*.mov
*.webm
*.m4v
*.flv
*.wmv
*.m2ts                 # NOT *.ts — that matches every TypeScript source
*.mp3
*.m4a
*.flac
*.opus
*.wav
*.aac
*.ogg
*.oga
*.cbz
*.cbr
*.epub
*.mobi
*.azw3
*.pdf

# --- Downloaded models ------------------------------------------------
# Whisper and friends are fetched on first use; hundreds of MB each.
*.onnx
*.onnx_data
*.gguf
*.ggml
*.safetensors
*.pt
*.pth
*.traineddata
*.traineddata.gz
*.wasm
# The jassub subtitle renderer's WASM IS source and IS committed.
!src/media/jassub/assets/*.wasm
/models/
model-cache/
whisper*/

# --- Personal study data (userData file names, in case one is copied in)
mined-sentences*.json
/mining/
/media.json
/library.json
/study-orchestrator-v2.json
/desktop-layout.json
/profiles.json
/collected-tools.json
/anki-intervals.json
mal-tokens.json        # unanchored: an OAuth token file anywhere is wrong
mal-sync.json
userData/
AppData/

# --- Runtime output / archives ---------------------------------------
debug/
debug-*.log
out/
dist/
*.zip
*.7z
*.rar
*.tar
*.tar.gz
*.pid
*.flag
```

---

## 4. Rule-by-rule notes worth reading before applying

**`*.pdf` may be too aggressive.** The app reads PDFs and a future contributor might want a
committed sample. Nothing tracked matches today. If a sample is ever wanted, negate that one path
rather than dropping the rule.

**`*.zip` / `*.tar.gz`** are here because a dictionary or deck usually arrives compressed, and an
archive is the single easiest way to commit 200 MB without noticing. Nothing tracked matches.

**Anchored vs unanchored is deliberate.** `/media.json` and `/library.json` are anchored to the
repo root — unanchored they would match any file with those very ordinary names anywhere in the
tree. `mal-tokens.json` is deliberately **unanchored**: an OAuth token file is wrong at every
depth.

**`AppData/` and `userData/`** catch the whole-profile copy — the realistic accident is dragging
`%APPDATA%\jp-study-app` into the repo to inspect it, not adding one file.

**`*.wasm` with a negation.** Two tracked WASM files are real source
(`src/media/jassub/assets/jassub-worker{,-modern}.wasm`). The blanket rule plus one negation
beats naming every model format that has not been invented yet. Note the negation must come
*after* the broad rule.

**`!**/__tests__/fixtures/**`** re-admits `src/main/__tests__/fixtures/phase4-proof.vtt` and
protects future fixtures. Git cannot re-include a file inside an excluded *directory*, so this
works only because the subtitle rules are file-extension rules — if `subs/` style directory rules
are ever added over a fixture directory, the negation will silently stop working.

**`public/` is already handled** at `.gitignore:101-107` (`models/`, `ort/`, `cedict/`,
`kuromoji/`, `tesseract/`). Those blobs are A1's scope and this draft does not touch them.

---

## 5. `.claude/` — recommendation, not a decision

**11 files under `.claude/` are tracked and would publish:**

```
.claude/commands/update-blanc.md          .claude/skills/honesty-probe/SKILL.md
.claude/launch.json                       .claude/skills/jp-bridge/SKILL.md
.claude/skills/claim-check/SKILL.md       .claude/skills/jp-bridge/scripts/_common.ps1
.claude/skills/css-measure/SKILL.md       .claude/skills/jp-bridge/scripts/click.ps1
.claude/skills/jp-dispatch/SKILL.md       .claude/skills/jp-bridge/scripts/eval.ps1
                                          .claude/skills/jp-bridge/scripts/shot.ps1
```

| File(s) | What it discloses | Recommendation |
|---|---|---|
| `skills/css-measure/`, `skills/honesty-probe/`, `skills/claim-check/` | Measurement methodology and past false findings by file:line. Genuinely good engineering writing — arguably the most interesting thing in the repo | **PUBLISH** |
| `skills/jp-bridge/` (SKILL + 4 scripts) | The dev debug bridge's auth model: `debug/bridge.json` = `{port, token, pid, started}`, `Authorization: Bearer <token>` (`SKILL.md:92-95`). Token regenerates per start and the bridge is dev-only, so this is not a live credential — but it maps an authenticated local HTTP surface | **User's call.** Low real risk; publishing it also documents an attack surface that only exists in dev builds |
| `skills/jp-dispatch/` | `SKILL.md:48-51` names two parked stashes by description and two other worktrees (`claude/cool-poincare-9b2f0c`, `codex/noctis-beta`) | **KEEP PRIVATE**, or strip §2 |
| `launch.json`, `commands/update-blanc.md` | Dev ports 8091/5174/5185; a project-specific workflow | **PUBLISH** — harmless |

The `.claude/settings.local.json` rule in §3 should be applied **regardless of how this is
ruled** — it is the fresh-clone hole, and it is independent of whether the skills publish.

---

## 6. Applying it

1. Append §3 to `.gitignore`.
2. Re-run check (a): `git ls-files -i -c --exclude-from=.gitignore` must stay empty of anything
   unexpected.
3. `git status` must be unchanged — no tracked file should suddenly appear deleted.
4. **This does not clean history.** If the user publishes existing history rather than squashing,
   these rules protect the future only; the past needs a separate scan that A2 deliberately did
   not perform (`HANDOFF_A2_LICENSE.md` §4, §7 Q1).
