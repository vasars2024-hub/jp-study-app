# HANDOFF P7 — Dictionary, mining and Anki

**Written incrementally during the run**, per `jp-dispatch` §7.

---

## 1. Scope and ownership

| | |
|---|---|
| Branch | `audit/a-evidence` (**not** cut; the dispatch forbids branching — §2) |
| Base commit | `68b25dc` |
| Owned | `docs/audit/FINDINGS_P7_DICT_ANKI.md`, `docs/audit/HANDOFF_P7_DICT_ANKI.md` |
| Foreign | everything else. No `src` edit, no `styles.css`, no `.gitignore`, no commit, no `git add`. |

### Dispatch overrides of `jp-dispatch` / `jp-bridge`, stated explicitly

`jp-dispatch` §1 says a dispatch that contradicts the skill wins for that run, and the
contradiction must be named. Three apply:

1. **`jp-dispatch` §3 — "do not start the app."** DISPATCH_P7 §3 grants the live queue
   exclusively and gives the launch command. I started the app. Verified first that nothing
   was listening on 5173 and that `debug/bridge.json` was absent, so no user session was
   displaced.
2. **`jp-bridge` §2 — "back up all of `%APPDATA%\jp-study-app` before any live run."** DISPATCH_P7
   §3 forbids opening that directory at all (8.7 GB of real user data). I did **not** back it up
   and I did **not** read it. The run is isolated instead by `--user-data-dir`, which redirects
   Electron's `userData` wholesale; every app JSON write went to `%TEMP%\jp-p7-scratch`.
3. **`jp-bridge` §1 — two profiles, `scratch/` and a copied `populated/`.** Only `scratch/` was
   used. Copying the real profile would mean reading `%APPDATA%\jp-study-app`, which §3 forbids.
   Consequence stated plainly: **every finding here is a fresh-install finding.** Nothing in this
   run says anything about behaviour on the user's populated profile.

---

## 2. ⚠ Anki safety — what I did to the user's collection: NOTHING

**I performed no Anki writes. No note, deck, note type, card, tag or field was added, updated or
deleted.**

This needs saying loudly because **Anki was running for the whole session** and I did not stop it:

```
Get-NetTCPConnection -LocalPort 8765 -State Listen   ->  OwningProcess 33336
Get-Process -Id 33336  ->  Anki, C:\Users\Arseniy\Saved Games\Anki.exe, started 8/1/2026 11:22:42 PM
```

The dispatch prefers Anki not running. It was, and **killing it was not mine to do** — it is the
user's process, holding an open collection. So I worked under the stricter rule instead.

**Every AnkiConnect call I made, in full:**

| action | why | mutating? |
|---|---|---|
| `version` | confirm the endpoint is AnkiConnect | no |
| `deckNames` | re-derive the "~82 decks" figure | no |
| `modelNames` | resolve the schema-18 / note-type claim | no |

That is the complete list. No `addNote`, `addNotes`, `createDeck`, `createModel`,
`updateNoteFields`, `deleteNotes`, `guiAddCards` or any other mutating action was issued, at any
point, by me. Where the app's own UI would have written, I stopped at the last read-only step and
filed the row as `NOT-REACHABLE — would mutate the user's real collection`.

> **The app itself connects to the real Anki, and I could not prevent that.** A scratch Electron
> profile does not isolate AnkiConnect — the port is fixed and machine-global, exactly as the
> dispatch warned. Opening the Dictionary was enough to make the renderer read the user's live
> deck and note-type list (evidence: the mining row rendered `JP Study::N2 Vocab`, a deck that
> exists in the real collection). Those reads are harmless, but they are the app's, not mine, and
> they are why "just don't click Add" is the only safe posture here.

### Pre-existing contamination, noticed and NOT caused by this run

`modelNames` returned **35** note types, of which **five** are namespaced to this app:

```
JP Study App::Custom::lol
JP Study App::Custom::Phase 5 manga probe (temporary)
JP Study App::EN-JA Production
JP Study App::JA Immersion
JP Study App::JA-EN Classic
JP Study App::ZH-JA Production
```

Two of those read as test residue — `Custom::lol` and `Custom::Phase 5 manga probe
(temporary)`. **"temporary" is not achievable**: AnkiConnect has no `deleteModel`, so a note type
created through it is permanent. Some earlier session wrote these into the real collection. I did
not create them, and I cannot remove them. Flagged for the user because only they can decide
whether to delete them from Anki's own Note Types dialog.

---

## 3. Environment and how the app was driven

```
npx electron-forge start -- --user-data-dir="$env:TEMP\jp-p7-scratch"
```

- `%TEMP%\jp-p7-scratch` did not exist before the run (`Test-Path` → `False`), so this is a
  genuine first boot.
- Bridge came up on the fixed port 39273; `debug/bridge.json` written.
- Driven exclusively through `.claude/skills/jp-bridge/scripts/` (`eval.ps1`, `click.ps1`) plus a
  scratchpad wrapper for `/type` and `/key`, which have no skill script. No OS-level automation.
- **Consent gate** dismissed with **No thanks** (`button.consent-no`, hit-test `match`). No
  telemetry sent on the user's behalf.
- Fresh profile opened with **0 windows and 0 desktop icons**, as predicted. Every surface was
  opened via **Start menu → app**, which is discovery depth 2 and is itself the probe-F entry-point
  measurement.

### Instrument health — the guard fired, which is why the rest is trustworthy

`click.ps1` **refused** a click at one point: target `.fwin input[type='text']`, hit element
`<div class="os-settings os-settings-v2">` — the Settings window was stacked over the Dictionary
window. I believed it, closed Settings, and re-clicked to a `match`. Recorded because a hit-test
guard that never refuses is indistinguishable from one that does not work (`jp-bridge` §8).

---

## 4. Verification of the claims I was handed

### 4.1 "`DictionaryResults.tsx` is a known i18n hole, still hardcoded English" — **CORRECTED**

The claim named four strings: *"Looking up…"*, *"No dictionary match"*, *"Example sentences"*,
*"+ Add to Anki"*. **None of them exists as a literal in that file**, and the file is fully on the
i18n system.

```
grep -c useT src/renderer/components/DictionaryResults.tsx        -> 2  (import :32, call :238)
grep -o "\bt('" src/renderer/components/DictionaryResults.tsx | wc -l   -> 36
grep -n "Looking up\|No dictionary match\|Example sentences\|Add to Anki" \
     src/renderer/components/DictionaryResults.tsx                -> no matches
```

All four are catalog keys, and the catalogue is complete in all four languages:

```
src/shared/i18n/catalogs/en.ts:1280  'dict.results.lookingUp': 'Looking up…',
src/shared/i18n/catalogs/en.ts:1281  'dict.results.noMatch':  'No dictionary match for “{query}”.',
src/shared/i18n/catalogs/en.ts:1288  'dict.results.add':      '+ Add to Anki',
src/shared/i18n/catalogs/en.ts:1294  'dict.results.examples': 'Example sentences',

for L in en ja zh ru; do grep -c "^  'dict\.results\." src/shared/i18n/catalogs/$L.ts; done
   -> 34 34 34 34
```

**Driven, not just read.** UI language switched to Japanese through the real control
(Settings ▸ Appearance ▸ 日本語, `.sp-seg-btn`), confirmed by `localStorage['ui-lang'] === 'ja'`
and `document.documentElement.lang === 'ja'`. The popup then rendered:

| English arm | Japanese arm |
|---|---|
| `+ Add to Anki` ×3 | `+ Anki に追加` ×3 |
| `Example sentences` | `例文` |
| `COMMON` / `PITCH` | `常用` / `ピッチ` |
| `Auto examples: up to 1 ja / 1 en / 1 ru / 1 zh` | `自動例文：最大 1 ja / 1 en / 1 ru / 1 zh` |
| window title `Dictionary` | `辞書` |

**The claim is wrong about the file, and right that there is a hole — it is one component up.**
See §4.2.

### 4.2 The real i18n hole: `DictionaryView.tsx`, and three more files

`src/renderer/views/DictionaryView.tsx` (106 lines) **does not import `useT` at all** — 0 `t()`
calls. Four user-visible strings render in English under a Japanese UI, all confirmed live:

| line | string observed under `ui-lang=ja` |
|---|---|
| `:62` | `Search Japanese or English — powered by Jisho (JMdict).` |
| `:86` | placeholder `Type a word, e.g. 食べる or “eat”…` |
| `:90` | button `Search` |
| `:98` | `Tip: while reading a book you can highlight any word to look it up instantly. Tap the star icon on a result to save it to Flashcards.` |

`:98` needed a fresh mount to observe (the hint renders only before the first search), so the
window was closed and reopened from the Start menu — whose own label had correctly become **辞書**.
That is the **positive control**: the instrument reads translated strings where they exist, so the
four above are genuinely untranslated rather than a measurement artifact.

Counting every user-visible literal in the file including the Aero-only `AppChrome` menu and
status props (`:40`, `:42`, `:43`, `:49`, `:51`): **14 literals, 0 `t()` calls.**

Cluster-wide sweep — `useT` and `t('` counts per file:

| file | lines | `useT` | `t('` |
|---|---|---|---|
| **`views/DictionaryView.tsx`** | 106 | **0** | **0** |
| **`components/JitenMiningPanel.tsx`** | 272 | **0** | **0** |
| **`components/FieldMappingEditor.tsx`** | 384 | **0** | **0** |
| **`components/AnkiCardPreview.tsx`** | 142 | **0** | **0** |
| `components/DictionaryResults.tsx` | 1043 | 2 | 36 |
| `views/AnkiView.tsx` | 106 | 2 | 13 |
| `components/anki/AnkiContent.tsx` | 532 | 6 | 31 |
| `views/FlashcardsView.tsx` | 606 | 2 | 71 |
| `components/flashcards/FlashcardsContent.tsx` | 1677 | 7 | 86 |
| `components/CsvEditorPanel.tsx` | 1077 | 2 | 102 |
| `components/AiCardStudio.tsx` | 1029 | 2 | 94 |
| `components/EpubMiningPanel.tsx` | 1355 | 2 | 171 |
| `components/EpubMiningSimplePanel.tsx` | 387 | 2 | 32 |
| `components/AnkiSetup.tsx` | 50 | 2 | 10 |
| `components/MiningProgressPanel.tsx` | 108 | 2 | 4 |
| `components/EpubVariablePalette.tsx` | 94 | 2 | 7 |
| `components/EpubCardLayoutEditor.tsx` | 141 | 2 | 4 |
| `components/EpubFilterPipelinePanel.tsx` | 103 | 2 | 18 |
| `components/EpubTestCard.tsx` | 262 | 2 | 12 |

**4 of 19 cluster files, 904 lines, are entirely off the i18n system.** The rest are thoroughly
on it. This is a `CLAUDE.md` violation, but a much narrower and more fixable one than the dispatch
described.

### 4.3 A fresh profile has **no** dictionaries installed — **CORRECTED**

The dispatch expected the not-installed first-run path. The app **auto-installs on first boot**,
unprompted, from `%TEMP%\jp-p7-scratch`:

```
[yomitan] Seeding bundled Kanjium pitch data…
[yomitan] Kanjium pitch seeded (107978 entries).
[yomitan] Downloading JMdict (Japanese–English)…
[yomitan] JMdict (Japanese–English) ready (305295 terms).
[yomitan] Downloading JMdict (Japanese–Russian)…
[yomitan] JMdict (Japanese–Russian) ready (93358 terms).
[yomitan] Downloading Moedict (Chinese monolingual)…
[yomitan] Moedict (Chinese monolingual) ready (70589 terms).
```

So the "not-installed" surface the dispatch wanted probed **does not occur on a fresh profile at
all** — it would need a boot with the network down. Recorded as `NOT-REACHABLE` rather than
silently skipped. The consequence for probe B is favourable: dictionary results on this profile
trace to a real downloaded index, not to a constant.

### 4.4 Deinflection line — **CONFIRMED, and localized**

Searched `食べさせられた` in the Dictionary. Rendered:

| | |
|---|---|
| `.dict-deinflection-forms` | `食べさせられた → 食べる` |
| `.dict-deinflection-reasons` (EN) | `causative · passive / potential · past` |
| `.dict-deinflection-reasons` (JA) | `使役 · 受身・可能 · 過去` |

Three senses returned, from two real sources (`JMdict (Japanese–English)` ×2,
`JMdict (Japanese–Russian)` ×1). **The reason chain is genuinely translated, not
English-in-disguise.** This is the strongest positive result of the run.

---

*(sections 5–9 continue below as the run proceeds)*
