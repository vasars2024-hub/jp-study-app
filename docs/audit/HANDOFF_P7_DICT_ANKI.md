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

### 4.5 Anki collection unchanged, measured at both ends

```
START OF RUN  deckNames -> 84   modelNames -> 35
END OF RUN    deckNames -> 84   modelNames -> 35
```

Identical. This is the positive check on §2's claim, not a restatement of it.

---

## 5. The three claims that needed more than a grep

### 5.1 The real i18n holes, confirmed live under `ui-lang=ja`

Four files in the cluster have **zero** i18n adoption (§4.2 table). Three were confirmed
rendering English in a Japanese UI, each beside correctly-translated siblings in the same
viewport — which is what makes it a differential rather than an absence:

| file | strings observed in English under `ja` | translated sibling in the same viewport |
|---|---|---|
| `DictionaryView.tsx` | subtitle, placeholder, `Search`, tip | window title **辞書**, Start-menu label **辞書** |
| `JitenMiningPanel.tsx` | *"Jiten vocab mining"*, *"Mine a Jiten media deck…"*, *"Refresh"*, *"Plan a Jiten title in Novels first…"* | `シンプルEPUBマイニング`, `詳細EPUB`, `CSVツール`, `AIカードスタジオ`, `辞書を復習（1）` |
| `FieldMappingEditor.tsx` + `AnkiCardPreview.tsx` | *"Field templates"*, *"Variable palette"*, *"Card styling (CSS)"*, *"Card preview"*, `FRONT`/`BACK`, 4× *"Leave blank for automatic mapping"*, *"Sample content for this profile…"* | `学習プロフィール`, `接続済み — デッキ84個、ノートタイプ35個。`, `手動でカードを追加` |

The sharpest single instance is **not** in one of those four files. `FlashcardsContent.tsx` has
86 `t()` calls, and at `:1055-1059` one ternary does this:

```tsx
{epubMiningUi === 'simple'   ? t('flash.mining.simpleLead')
 : epubMiningUi === 'advanced' ? t('flash.mining.advancedLead')
 : 'Download a Jiten vocabulary deck for a planned title and save it into your local deck library.'}
```

Two arms keyed, the third hardcoded, and no `flash.mining.jitenLead` key exists. That is an
oversight rather than a scope decision.

**The structural point, which outlives any individual string:** `node tools/i18n-check.cjs`
compares catalogs against each other, so it can only see a key that already exists in `en.ts`. A
file that never adopted `t()` at all contributes no keys and is therefore **invisible to the
gate** — as is the `vitest` "catalog hygiene" block, which enforces the same comparison. Both
gates would pass on all four files forever. A `useT`-adoption check over `views/` and
`components/` is the missing instrument.

### 5.2 Tatoeba attribution — the credit works, and the Dictionary omits it

The "only attribution string" half is **CONFIRMED**, re-derived rather than repeated:

```
grep -niE "'[^']*(licen[cs]ed|CC-BY|CC BY|attribution|courtesy of|©)" src/shared/i18n/catalogs/en.ts
  -> exactly one hit: en.ts:2407 'grammar.examples.tatoebaCredit'
rg "tatoebaCredit" src   -> 1 render site (GrammarContent.tsx:151) + the 4 catalog entries
```

**Grammar (control arm).** Clicked *"+ More examples from Tatoeba"*; 10 examples loaded and the
credit appeared:

```
creditRendered : true
creditText     : "Example sentences from Tatoeba, licensed CC-BY 2.0 FR"
creditHref     : "https://tatoeba.org/"
```

It is gated at `GrammarContent.tsx:147` on examples actually being Tatoeba-sourced, which is why
it is absent until they load. Correct behaviour.

**Dictionary (test arm).** Clicked *"Example sentences"* on 猫. Six real Tatoeba sentences
rendered — `猫だ！`/"Cat!", `猫万歳！`/"Cats forever!", `猫に小判。`/"Cast pearls before swine." —
and the panel's own copy names the source (*"the first N Tatoeba hits per language"*). Measured
on that surface:

```
mentionsTatoeba : true
mentionsLicence : false
links           : []
```

Same corpus, same licence obligation, attribution on one surface and absent on the other. The
Dictionary is the higher-traffic surface, and its examples are mined onto Anki cards, which
carries the omission outward. The fix is a render site, not new work: the key and its four
translations already exist.

### 5.3 Schema 18 — settled with a real fixture, not statically

The dispatch allowed "static-only" if a fixture was impossible. A fixture was possible, so this
is a live differential. Script: `<scratchpad>/schema18-fixture.mjs` (temp only — **no file was
added to the repo**, and no `.apkg` was imported into Anki). It builds real SQLite collections
with `sql.js` resolved from the repo's own `node_modules`, then runs **the exact queries from
`apkgImport.ts:104` and `:109-114`** and the real field-selection logic. Every arm uses a note
type whose term sits at **ord 1, not ord 0** — if field selection falls back to "first field",
the arm must return the reading `ねこ` instead of the term `猫`.

```
Expected term for every arm: 猫  (field ord 1, NOT first)

ARM A — schema 18, col.models = ''   (what Anki actually writes)
  models resolved: 1  modelFound=true   ord=1  picked="猫"   -> CORRECT
ARM B — schema 18, col.models = '{}'  (non-empty but model-less)
  models resolved: 0  modelFound=false  ord=0  picked="ねこ"  -> WRONG
ARM C — legacy schema 11, col.models populated
  models resolved: 1  modelFound=true   ord=1  picked="猫"   -> CORRECT
```

**ARM B is the positive control** — it proves the fixture is capable of showing the defect, so
ARM A's pass carries information (`claim-check` §5). Readings:

- The claim's **mechanism is wrong**: `apkgImport.ts:106` guards on `modelsJson.trim()`, and real
  schema-18 collections leave `col.models` empty, so the `notetypes`/`fields` branch at
  `:108-122` runs and resolves the model correctly.
- The claim's **effect is real through a narrower door**: `'{}'` is non-empty after `.trim()`, so
  the legacy branch is taken, `parseModels` returns `{}`, `pickExpressionOrd(undefined)` returns
  `0` (`apkgParse.ts:89`) and `extractExpressions` reads `fields[0]` (`:177`) — silently.
- **Unverified, and I am not asserting it:** whether real Anki ever writes `'{}'` into
  `col.models`. Establishing that needs a real schema-18 export; I did not open the user's
  collection to check.

Transcription fidelity was checked rather than assumed: `FIELD_SEP` is `String.fromCharCode(0x1f)`
(`apkgParse.ts:7`) and the fixture's separator is codepoint 31. The repo's own suite for these
functions passes — `npx vitest run src/shared/__tests__/apkgParse.test.ts` → **1 file, 17 tests,
0 failed**. That suite covers `modelsFromNormalizedRows` (`:99-111`) but **not the branch
selection**, and `readNotes` is not exported, so the branch has no unit test at all.

---

## 6. What I drove, and the side effect each rested on

### 6.1 Anki view — connected arm

Status read `接続済み — デッキ84個、ノートタイプ35個。` The number was **not** trusted because the
app printed it; it was checked against an independent oracle (direct AnkiConnect `deckNames` /
`modelNames` → 84 / 35, exact match), and the deck `<select>` carried 84 options.

### 6.2 Anki view — disconnected arm (a real two-arm differential)

`claim-check` §3: a conclusion about something *not* happening needs two runs on identical input
differing in one variable. The variable here was **`ankiUrl` in my scratch profile only** —
`%TEMP%\jp-p7-scratch\profiles.json`, `8765` → `8799` (confirmed dead:
`Test-NetConnection 127.0.0.1 -Port 8799` → `TcpTestSucceeded: False`) — then a full app restart.
**Anki itself was never stopped, reconfigured or touched.** The file was restored afterwards.

| | connected (8765) | disconnected (8799) |
|---|---|---|
| status | `接続済み — デッキ84個、ノートタイプ35個。` | `Ankiに接続されていません。` |
| deck `<select>` | present, **84** options | **absent** |
| `<select>` count | 2 | 1 |
| action button | `Ankiに作成` | `再試行` |
| recovery guidance | — | 4 numbered steps incl. add-on code `2055492159` |

The arms differ on every axis, so the connected reading is a measurement rather than an
assumption. **The error state is genuinely good** — it names the cause, gives a numbered recovery
path and offers Retry. That is well above the bar `honesty-probe` §3 D sets.

**One defect inside it.** The headline is translated (`Ankiに接続されていません。`) and the recovery
steps are translated, but sandwiched between them is raw English:

> `Can't reach Anki. Open Anki desktop and make sure the AnkiConnect add-on is installed.`

Source: `ANKI_UNREACHABLE_MSG`, a hardcoded constant at `src/shared/anki.ts:8-9`, produced in the
main process (`main/anki/client.ts:129`) and surfaced verbatim. Its sibling
`ANKI_COLLECTION_UNAVAILABLE_MSG` (`:12-13`) has the same shape. Neither is a catalog key
(`grep "Can't reach Anki" src/shared/i18n/catalogs/` → no hits); the two are referenced 16 times
across the tree. Main-process strings cannot call the renderer's `useT()`, so this needs the
`mt()` mechanism the dialog titles already use (`main/anki/index.ts` uses `mt('dialog.…')`).
Corroborating screenshot: `debug/shots/win1-1785809233699.png` — the English line renders in red
directly beneath the translated headline.

### 6.3 Dictionary → Flashcards, the full chain

1. Searched 猫 → 10 entries from `JMdict (Japanese–English)` and `JMdict (Japanese–Russian)`.
2. Clicked the ★ (hit-test `match`). `localStorage` key count **15 → 16**; new key
   `jp-saved-words-ja` holding the real entry.
3. `/reload` → key read back byte-identical. **An update that survives a reload.**
4. Flashcards `Dictionary (0)` → `Dictionary (1)`; *Review dictionary* went `disabled: true` →
   `disabled: false`, relabelled `Review dictionary (1)`.
5. Review mode rendered `猫 / ねこ`, `0 / 1`; grading produced *"Session complete — You reviewed 1
   card."*

**A selector trap worth recording.** `document.querySelector('.dict-star')` returns a **clipboard**
button titled *"Copy to clipboard history"* — two different controls share the class `dict-star`
and only the second is the star. Reading the markup before clicking is what stopped this becoming
a false finding of the form "two shipping strings claim the star saves to Flashcards and it does
not". The copy is accurate; the class name is not.

### 6.4 Mining panels — control-type histograms (probe F)

Measured live on a fresh profile, per panel:

| panel | buttons | selects | inputs | checkboxes | textareas | primary action present |
|---|---|---|---|---|---|---|
| Simple EPUB | 13 | 1 | 5 | 1 | 0 | *Analyze EPUB* / *Save to flashcards* |
| Advanced EPUB | 44 | 4 | 12 | 7 | 0 | *Analyze EPUB* / *Download Deck* |
| Jiten | 10 | 0 | 0 | 0 | 0 | *Refresh* |
| CSV tool | 30 | 5 | 13 | 2 | 33 | *Import to flashcards* |
| AI card studio | 30 | 8 | 10 | 3 | 0 | *Generate* (step 3) |

**13 checkboxes out of 218 controls** — 127 buttons + 18 selects + 40 inputs + 33 textareas.
Two counting rules, stated because the ratio depends on them: the checkbox column is a **subset**
of `inputs` (the selector was `input[type=checkbox]` against `input`), so it is not added twice;
and the button column includes 4 window-chrome buttons per panel plus the shared navigation strip,
which inflates it. Excluding window chrome the total is 198 and the ratio moves to 13/198 — the
reading does not change either way.

The "settings page pretending to be a feature" shape is overwhelmingly checkboxes with no primary
action; this is the opposite. Per `honesty-probe` §7 I am not ranking the polish — the counts are
the finding.

### 6.5 Counts re-derived rather than quoted

| figure | source of the claim | re-derived | result |
|---|---|---|---|
| `AppChrome` render sites | dispatch §6 says 23 | `rg -l "<AppChrome" src \| wc -l` → 19; `rg -o "<AppChrome" src \| wc -l` → 23 | **CONFIRMED** |
| Anki decks | dispatch §1 says "~82" | AnkiConnect `deckNames` → **84** | close, corrected |
| Anki note types | — | `modelNames` → **35** | recorded |
| Flashcards surfaces | census: 5 modes + 2 tabs | `FlashcardsContent.tsx:86-88` → 3 unions, **10** surfaces | **census short by 3** |
| Study profiles | — | profile `<select>` → **28** options | recorded |
| `dict.results.*` keys | — | 34 in each of en/ja/zh/ru | complete |
| `deinflect.*` keys | — | 25 in each of en/ja/zh/ru | complete |

---

## 7. What I could not verify, stated plainly

- **Every Anki write path** (`P7-A2`, `P7-A3`, `P7-A4`). Not measured, by design. Measuring them
  needs a disposable Anki profile on a non-default port — the user's call to set up.
- **Whether real Anki writes `'{}'` into `col.models`** (§5.3 ARM B). The code path is proven; its
  real-world reachability is not.
- **The reading-lens render site** of `DictionaryResults` (`LensReaderPanel.tsx:186`). Needs
  OS-level screen capture, which `jp-bridge` §11 forbids.
- **The "no dictionaries installed" first-run surface.** It does not occur on a fresh profile
  (§4.3); it would need a boot with the network down.
- **Behaviour on the user's populated profile.** Only the scratch profile was used (§1).
- **`zh` and `ru` UI rendering.** I drove `en` and `ja` and verified `zh`/`ru` catalog coverage
  statically (34 and 25 keys each). I did not render either.
- **The AI card studio generate path.** It needs a cloud API key or a local Qwen3 model; the panel
  claimed *"Qwen3 model found — runs locally, no API key needed"* and I did **not** verify that
  claim or generate a card. Flagged as unmeasured rather than passed.

## 8. Defects noticed in code I do not own

Recorded, not fixed (`jp-dispatch` §1).

1. **`src/shared/anki.ts:8-9` and `:12-13`** — two user-facing error strings hardcoded in English,
   outside the i18n system, 16 references (§6.2).
2. **`src/renderer/components/DictionaryResults.tsx`** — two distinct controls share the class
   `dict-star`; neither has an accessible name (both SVGs `aria-hidden="true"`, no `aria-label`,
   name carried only by `title`) (§6.3).
3. **Start menu** — `Game Arena` renders untranslated under `ui-lang=ja` while the other 20
   entries translate. Outside this cluster.
4. **Desktop status bar** — `Seanime sidecar · stopped` renders untranslated under `ja` (visible
   in the §6.2 screenshot). Outside this cluster.
5. **`docs/audit/CENSUS_SURFACES.md`** — Flashcards `EpubMiningUi` (3 surfaces) omitted; the
   depth-2/3 totals are short by 3 (`P7-F5`).
6. **Anki collection contamination from an earlier session** — five `JP Study App::*` note types
   exist in the user's real collection, two of them obvious test residue including one named
   *"Phase 5 manga probe (temporary)"*. Undeletable via AnkiConnect (§2). **Only the user can
   remove these**, from Anki's own Note Types dialog.
7. **Another agent committed this handoff mid-run.** `c5325e1` (*"audit(stage-b): B6 promise
   register"*) swept up **`docs/audit/HANDOFF_P7_DICT_ANKI.md` (245 lines, my file, in progress)**
   and `DISPATCH_P7_DICT_ANKI.md` alongside its own three files. That is the `git add -A` pattern
   `jp-dispatch` §2 forbids ("explicit paths only. Never `git add -A`"). No harm done here — I
   verified my subsequent edits are purely additive (`git diff` → 286 insertions, 1 deletion, and
   the single deletion is a placeholder line I wrote myself) — but a mid-run snapshot of another
   agent's working file is now in history, and the next such collision may not be additive.
   **I did not commit anything**, per my own dispatch §2.
8. **`profiles.json` snapshot-level `ankiUrl` has no UI control** — `renderer/profileState.ts:20`
   seeds it and `shared/profiles.ts:169` defaults it, but `rg "ankiUrl" src/renderer` returns one
   hit and no settings page writes it. Shape matches `CENSUS_SETTINGS.md` §3's "consumer, no way
   to change it" case. Not filed as a finding row — it is a setting, and probe E on it was not in
   this cluster's scope.

## 9. Gate results

Only one suite was run, because this run changed **no source** — the two files it created are
Markdown under `docs/audit/`.

```
npx vitest run src/shared/__tests__/apkgParse.test.ts
  -> 1 file, 17 tests, 0 failed   (duration 270ms)
```

Run as evidence for §5.3, not as a change gate. The full suite was **not** run and no total is
quoted for it; per `jp-dispatch` §5 an unmeasured baseline is not reported as one.

## 10. Open questions for the user

1. **The five `JP Study App::*` note types in your real Anki collection** — two look like
   leftovers (`Custom::lol`, `Custom::Phase 5 manga probe (temporary)`). AnkiConnect cannot delete
   note types, so removing them is a manual step in Anki. Do you want them gone?
2. **`KNOWN_ISSUES.md` still does not exist.** `honesty-probe` §6 says its location is your call.
   `docs/` root is the obvious candidate but is not a verified convention.
3. **Anki write-path coverage.** Three controls are permanently unmeasurable while the audit rule
   is "never write to the real collection". If you want them covered, the clean way is a throwaway
   Anki profile on a non-default port plus a UI control (or env override) for `ankiUrl`, which
   today has no writer.
4. **The i18n gate cannot see an unconverted file** (§5.1). Whether to add a `useT`-adoption check
   is a project decision, not an audit finding.
