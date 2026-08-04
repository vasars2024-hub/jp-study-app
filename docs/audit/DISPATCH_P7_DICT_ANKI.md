# DISPATCH P7 — Probe Dictionary, mining and Anki, live

Cold agent, `jp-study-app`. You hold the **live queue exclusively**.

## 0. Read first

`.claude/skills/jp-dispatch/SKILL.md` · `.claude/skills/jp-bridge/SKILL.md` (use its
`scripts/`, smoke-tested and passing) · `.claude/skills/honesty-probe/SKILL.md` (**emit its row
schema exactly**) · `.claude/skills/claim-check/SKILL.md` · `docs/audit/CENSUS_SURFACES.md` and
`CENSUS_SETTINGS.md` for your denominator · `docs/audit/FINDINGS_P1_SCRAPER.md` for the shape of
a good findings table.

## 1. ⚠ THE ONE THING THAT MUST NOT GO WRONG

**The user's Anki runs a real ~82-deck collection, and AnkiConnect listens on a fixed local
port. A scratch Electron profile does NOT isolate you from it.** A mining action that "just
tests the pipeline" writes into their real collection.

**Rules, absolute:**
- **Never add, update or delete a note, deck, or note type in Anki.** Not even a
  namespaced test one — AnkiConnect has **no `deleteModel`**, so a custom note type is
  permanent and undeletable.
- **Read-only AnkiConnect calls only** (`deckNames`, `modelNames`, `modelFieldNames`,
  `version`, `findNotes` with no mutation).
- If a control's only honest verdict requires a write, the verdict is
  **`NOT-REACHABLE — would mutate the user's real collection`**. That is a *correct* result, not
  a gap. Say so and move on.
- Prefer **Anki not running at all** — then the disconnected/error states are what you probe,
  which are themselves under-tested surfaces.

## 2. Ownership

Create/edit only `docs/audit/FINDINGS_P7_DICT_ANKI.md` and `docs/audit/HANDOFF_P7_DICT_ANKI.md`.
**Do not commit, branch or `git add`.** **Do not fix anything** — Stage B's verdict is
document-don't-fix.

## 3. Running the app

```
npx electron-forge start -- --user-data-dir=%TEMP%\jp-p7-scratch
```

- **`npm start -- --user-data-dir=X` fails** — npm's `--` goes to forge. The second `--` is required.
- Never put the profile in the repo (Chromium locks `Network/Cookies`, Vite throws `EBUSY`, the
  dev server dies looking like "the renderer never became usable").
- **Never open `%APPDATA%\jp-study-app`** — 8.7 GB of the user's real data.
- Bridge takes **~40 s**. If you watch a log for readiness, **truncate it first**.
- **A fresh profile opens behind a full-viewport consent gate** — dismiss with **No thanks**.
  Do not send telemetry on the user's behalf.
- Zero windows and zero desktop icons on a fresh profile: open your own surface, and say how.
- Shut down via `eval.ps1 -Js "(() => { setTimeout(()=>window.close(),200); return 'closing' })()"`.

## 4. What to probe — surfaces

Dictionary, Flashcards, the Anki view, the mining panels (EPUB mining, CSV editor, Jiten mining,
AI card studio), and the dictionary popup wherever it can be raised. Report
`visited / enumerated` against the census.

**A fresh profile has no dictionaries installed.** That is not an obstacle — the
*not-installed* path is a first-run surface almost certainly never probed. Does it explain
itself, or fail silently (Probe D)?

## 5. Standing claims to settle

| Claim | How |
|---|---|
| **`DictionaryResults.tsx` is a known i18n hole** — never included in the Phase 2 sweep, still hardcoded English ("Looking up…", "No dictionary match", "Example sentences", "+ Add to Anki", the whole Anki-mining sub-UI) | Switch the UI language to Japanese and read the popup. Count the raw literals. This is a `CLAUDE.md` violation and it is on the user's most-used surface |
| **Schema-18 Anki collections** moved note types out of `col.models` into a `notetypes` table, so `parseModels` returns `{}` and field selection silently falls back to "first field" — wrong for any deck whose term is not first | Static read of `main/anki/apkgImport.ts`. **Do not import into real Anki.** If you can construct a schema-18 `.apkg` fixture in temp, that is the honest test; if not, say the claim is static-only |
| **Tatoeba CC-BY attribution** is the app's *only* attribution string (`catalogs/en.ts:2407`) | Confirm it actually renders where a user sees it, not just that the key exists |
| **Deinflection popup line** — `食べさせられた → 食べる` with a localized reason chain | Does it render, and are the reasons translated in JA/ZH/RU or English-in-disguise? |

## 6. Probe F on this cluster

The mining panels are a prime "settings page pretending to be a feature" candidate. Use the
control-type histogram, the empty/loading/error-state check, the lazy-CSS proxies, and
structural conformance against `AppChrome` (**23 render sites** — that is the measured figure;
an earlier count of 42 was wrong).

## 7. Evidence discipline

- **A click that prints success is not a passing control.** Assert a side effect that survives a
  reload.
- **`/screenshot` lags one frame** — insert a second call between click and capture.
- **`/eval` re-evaluates your expression if the result fails to serialize** (`debugBridge.ts:236`)
  — a side-effecting expression returning something non-cloneable **double-applies**. Return
  primitives or plain objects.
- **Wait for async loads.** P1 twice read a surface one round-trip after navigating and saw an
  empty list that was merely still loading — two findings that would have been fabricated.
- Use `click.ps1`; **if its hit-test guard refuses, believe it.**

## 8. Handoff

`FINDINGS_P7_DICT_ANKI.md` — rows in `honesty-probe`'s schema, `visited / enumerated` per area.
`HANDOFF_P7_DICT_ANKI.md` — **written as you go**: what you drove, what you could not reach and
why, every count re-derived, **an explicit statement that you performed no Anki writes**, and
defects noticed in code you do not own.

## 9. Scope

This cluster only. No fixes, no `.gitignore`, no `styles.css`, nothing outside your two files.
