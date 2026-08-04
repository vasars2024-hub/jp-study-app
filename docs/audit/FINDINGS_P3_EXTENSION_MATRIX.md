# P3 — the extension feature truth matrix, driven

**Run:** 2026-08-04, account claude-x, branch `audit/a-evidence`, base `97924ce`. Nothing committed.

Every verdict below comes from driving `extension/` loaded into Playwright Chromium
(`chromium-1228`, `Chrome/149.0.7827.55`) over CDP, against a **live paired** GrammarX app on a
scratch Electron profile. Raw output is reproduced in §5; the harness lives in the session
scratchpad, not in the repo.

---

## 1. The denominator, and the audit's own figure

`EXTENSION_FEATURE_TRUTH_MATRIX.md` has **35 feature rows**, not 47.

```
$ awk 'NR>=12 && NR<=46 && /^\|/' EXTENSION_FEATURE_TRUTH_MATRIX.md | wc -l
35
$ grep -c '^| ' EXTENSION_FEATURE_TRUTH_MATRIX.md
36          # = 1 header row + 35 feature rows; the |---|---|---| separator does not match '^| '
```

`docs/audit/FINDINGS_EXTENSION_BRIDGE.md:130` records the coverage line
`| 47-row feature truth matrix | 0 / 47 — NOT ATTEMPTED |`. **The 47 is wrong**; it should read
35. That file is not owned by this run, so the correction is recorded here rather than applied.

**Coverage: 35 / 35 rows attempted, 35 / 35 given a verdict.**

*(The verdict tally is in §2.1, computed from the table below after it was final. It is not
restated here, because a count written above the table it summarises is a count nobody re-derives.)*

---

## 2. The 35 rows

Column 3 is the interaction and the observable. A row with no observable is not a verdict.

### The rule used to assign a single verdict to a multi-part row

Most matrix rows assert three or four things at once. The vocabulary has six words and no
"partially". So:

- **`LIVE`** — every sub-claim in the row was driven and confirmed.
- **`BROKEN`** — something was driven and the result was wrong. Two rows.
- **`MIXED`** — driven, and **observed** to work on some paths and **observed** not to on others.
  Reserved for rows where the non-effect was actually measured against a positive control, not
  merely skipped.
- **`NOT-REACHABLE`** — at least one sub-claim could not be driven. §3 names the sub-claim and the
  reason. The confirmed parts of the row are still listed in column 3, because a row is not
  upgraded to `LIVE` by the parts that happened to be easy.

`NOT-REACHABLE` here therefore means *"most of this row is confirmed and one named part is not"*,
never *"nothing was measured"* — which is why each such row still carries a full column 3.

| # | Feature (matrix row) | Claim asserted for v3.0.0 | What was driven, and the observable | Verdict |
|---|---|---|---|---|
| 1 | Shift-hover lookup | "configurable key, delay, scan length, prefix-trimmed lookup, popup survives cursor entry" | `Input.dispatchKeyEvent` Shift down + `Input.dispatchMouseEvent` mouseMoved at (382,295) over `国内や、` on ja.wikipedia.org → `#jp-study-popup.open` appeared, 362×502, term `国内` — **the trailing particle `や` was trimmed**. `mark.jp-lookup-active` placed in the page. Settings dump from `chrome.storage.local`: `hoverKey:"shift"`, `hoverDelayMs:140`, `scanLength:12`, `hoverLookup:true`. "Survives cursor entry" settled by a three-way differential — §4.11 | `LIVE` |
| 2 | Dictionary popup | "Tabbed reader popup (Meaning/Grammar/Sentence/Kanji/Examples/More), keyboard nav, pin/drag, nested lookup + back" | 6 `role="tab"` buttons, exactly those six ids. ArrowRight from `more` → `meaning`, ArrowLeft → `more` (wraps). `P` → `.rp-pin` gains `.on`. **Drag** (gated on the pin, `content.js:580-586`): pinned, then dragged by −130/+130 → `style.left` 474.5px → 344.5px, `style.top` 138px → 268px. Kanji tab on `国家` → click `家` → header term becomes `家`/`か` and `.rp-back` un-hides; Back → term returns to `国家` and `.rp-back` hides again | `LIVE` |
| 3 | Sentence detection | "Sentence tab: detected bounds, extend/contract/reset, manual edit, difficulty + known-coverage stats" | Detected bound `は、日本国内や…言語。` + the stat line `Known words 0% · 52 chars`. **The bounds move**: extend-left → **73 chars** (pulls in `日本語（にほんご、にっぽんご[注釈 3]）`), extend-right → **158**, again → **196**, reset → back to **52**. `sent-edit` → a `TEXTAREA`, `readOnly:false`, pre-filled with the sentence | `LIVE` |
| 4 | Grammar analysis | "patterns with JLPT level + meaning, literal spans underlined, explicit 'pattern match' uncertainty labeling" | Grammar tab returned 6 patterns for the detected sentence — `〜ている N5`, `〜し N4`, `の N4`, `さ N4`, `ている N4`, `間 N4` — each with level and meaning, plus the shipped copy *"Matches are found by GrammarX's pattern rules on this sentence's text. When several overlap, judgement is yours"*. Separately `grammar-match` on `食べなければならないと思います。` → 8 matches incl. `n4-nakereba-naranai / 〜なければならない / N4 / must do ~`. **"Literal spans underlined" measured, not assumed** — §4.15 | `LIVE` |
| 5 | Kanji information | "Kanji tab: per-character lookup through the real `/v1/lookup`, nested lookup on tap" | On `国家`: two `[data-act="lookup-nested"]` entries `国` (くに — country; state) and `家` (か — -ist; -er …), sourced from the app's dictionary, not a table in the view. Tap navigates (row 2) | `LIVE` |
| 6 | Examples | "Examples tab: term-highlighted, per-example play + save sentence" | 8 examples returned for `内` (`家内だ。/ She's my wife.` …), each with an `example-tts:Play` and an `example-save:Save sentence` button — 8 of each. Term highlighting is real markup rather than a styled line: `<div class="rp-example-jp"><b class="rp-hl-term">内</b>緒だよ。</div>`, 8 `B.rp-hl-term` nodes for 8 examples | `LIVE` |
| 7 | Known-word status | "Kept; restyled as labeled segmented control, loads for de-inflected base form" | `.rp-known` group renders `Known:` + New/Learning/Familiar/Known as `[data-act="wk"][data-level=0..3]`; §4.1 is the full write → app-storage → read-back round trip. **"De-inflected base form" measured**: popup opened on the surface form `食べなければ`, Familiar clicked, and the app's store gained exactly one key — `{"食べる":{"l":2,"m":1}}` — §4.15 | `LIVE` |
| 8 | Pitch / frequency / JLPT badges | "Kept; JLPT explicitly labeled as estimate" | `.rp-sub` rendered `<span class="rp-badge common">common</span>`; More tab rendered `Pitch accent / ない` and `Entries / 8 from JMdict (Japanese–English)`; `/v1/lookup` returns real `pitchHtml` per entry. **The JLPT badge never renders in this configuration**: 8 terms probed (`食べる 学校 勉強 日本 本 大きい 行く 国家`), **43 entries**, `jlpt: []` on every one. Pitch and frequency are confirmed; the JLPT-estimate wording had no fixture that could show it | `NOT-REACHABLE` |
| 9 | Audio (TTS) | "Kept (header + examples)" | `speechSynthesis.speaking` = **false** before, **true** immediately after clicking `[data-act="tts"]`, **false** again 2.5 s later. 10 voices present. Examples tab carries 8 `example-tts` buttons | `LIVE` |
| 10 | Mine word/sentence | "'Save word / Save sentence'; destination from one setting; queued path preserved" | Both buttons render with exactly those labels (Meaning tab + Grammar tab + Examples rows). Destination is a single setting, `saveDestination` default `'both'` (`extension/settings.js:74`), surfaced in the card preview as *"Destination: Anki (falls back to GrammarX if Anki is closed)"*. The queued path is proven on a non-Anki kind in §4.5. **Neither Save button was clicked** — §3 | `NOT-REACHABLE` |
| 11 | Add to Anki | "'Create card' with preview (text, type, destination, source); forceAnki path" | `create-card` opened `#jp-study-card-preview.open` showing all four: text `内` (editable), type `Word card`/`Sentence card` segmented, `Source: 日本語 - Wikipedia`, `Destination: Anki …`. Buttons `cancel`, `send:Create card`. **`send` was never clicked**; Esc closed it (`open:false`). The `forceAnki` path *is* `send` — §3 | `NOT-REACHABLE` |
| 12 | Card field editing | "preview edits the *sent text* only; note explains fields are filled app-side" | The preview's editable element is a `TEXTAREA.cp-text`, `readOnly:false`, value = the sent text and nothing else; no field editors exist. The note reads verbatim: *"GrammarX fills the card fields (reading, definition, audio) from its dictionaries and your Anki field mapping."* | `LIVE` |
| 13 | Capture page / inbox | "Kept ('Save page'); queued result no longer throws" | Popup on a real active tab renders `Save page`; context-menu id `capture.page` registered (§4.2). Driven both ways in §4.5: offline → `{ok:true, queued:true, action:"inbox"}` with **no throw**, then online → `flush` reported `{flushed:1, left:0}`, so the app accepted it | `LIVE` |
| 14 | YouTube download | "'Download video', page-aware (disabled off YouTube)" | Popup rebuilt against a real active tab: on `youtube.com/watch?v=…` the button set is `Save video · Download video · Look up selection · Save selection`; on `ja.wikipedia.org` it is `Look up selection · Save selection · Save page · OCR capture`. `detect` → `kind:"youtube-video", category:"youtube", action:"video"` vs `kind:"article"`. **No transfer was started.** Correction: off YouTube the control is **absent**, not "disabled" | `LIVE` |
| 15 | YouTube metadata save | "Kept ('Save video / Save playlist')" | Both labels driven, and they swap with the page. Watch page → primary is `Save video`, `playlist-status` → `youtubePlaylistId: null`. Real playlist URL → `detect` `kind:"youtube-playlist", action:"playlist"`, `playlist-status` → `youtubePlaylistId:"PLbpi6ZahtOH6Blw3RGYpWkSByi_T7Rygb", tracked:false`, and the popup's primary becomes **`Save playlist`**. No write was sent | `LIVE` |
| 16 | Long-strip import | "'Import manga pages'; shown on manga pages" | The shipped detector driven on four URLs: `mangadex.org/chapter/abc` and `comic-days.com/episode/1` → `category:"manga"`; the two controls → `"other"`. `popup.js:158-161` maps `manga` to `{id:'scan-strip', label:'Import manga pages'}` — §4.3 | `LIVE` |
| 17 | OCR | "Editable result, Look up / Save / Re-select actions, model-missing guidance kept" | FAB `OCR` → region-select armed (`#jp-study-ocr-select` present, `jp-study-ocr-selecting` on `<html>`); dragged a box → **real recognised Japanese returned** (61 chars). Result overlay: editable `TEXTAREA` (`readOnly:false`), header *"Read as Japanese · Double-click a word to look it up."*, buttons `analyze:AI analysis · lookup:Look up · save:Save to GrammarX · retry:Re-select`. The model-missing guidance is real copy from the app — but see §4.14, it was wrong for the first hour | `LIVE` |
| 18 | Audio record/save | "Kept, under More menu ('Record audio' / 'Save audio')" | More menu rendered 12 items including `capture.audio.record:Record audio` and `capture.audio.save:Save audio`, exactly those labels, both enabled. Actual recording needs a microphone grant in the scratch profile — §3 | `NOT-REACHABLE` |
| 19 | Clipboard send | "One path: 'Add to clipboard history' (input source framing)" | Driven to a persisted app-side side effect: `clipboard-text` → `{ok:true}`, and the **app's** `localStorage['jp-clipboard-history']` went from **absent** to one entry — `{text:"P3PROBE… 日本語のテスト文です。", readerMeta:{book:"日本語 - Wikipedia", chapter:"<page url>"}}`. That `readerMeta` is the claimed input-source framing. One command id; two labels for it — popup More tab "Add to clipboard history", More menu "Send to clipboard history" | `LIVE` |
| 20 | Radial wheel | "Rebuilt — see `EXTENSION_RADIAL_WHEEL_DECISION.md`" | `jp-action-wheel` (the Alt+Shift+W path) → `#jp-study-wheel.open` with a `Cancel` centre and **6** numbered slices: `1 Look up · 2 Word · 3 Sentence · 4 Card · 5 Page · 6 More`, matching `JP_DEFAULT_WHEEL_SLOTS` (`extension/settings.js:16-23`) | `LIVE` |
| 21 | Bulk tab picker | "'Reading list': bulk save pages / download videos; junk mine removed" | `list-tabs` returned both open tabs with real per-tab `kind`/`category`/`selectable` — `about:blank` `selectable:false`, the Wikipedia tab `selectable:true`. Popup renders `Reading list` (`#nav-tabs`). See §4.4 | `LIVE` |
| 22 | Page level badge | "Kept, with honest tooltips (estimate/offline/no-JA-text)" | **The tooltip is false in one of four app states.** On a 105,339-char Japanese article the badge reads `—` with the title *"No Japanese or Chinese text detected on this page"* while its own `dataset.lang` is `"ja"` and the app answered `noLists:true`. §4.6 | `BROKEN` |
| 23 | Comprehensibility % | "Kept on panel + popup page card + sentence stats" | Present in all three: FAB `#jp-study-comp-badge`, popup page card `Known words 0%`, Sentence tab `Known words 0% · 52 chars`. **Computed, not a literal** — §4.1 moves it 0% → 100% on identical text by changing one known-word level, and the FAB badge differs by page (`0%` on ja.wikipedia, `—` on en.wikipedia) | `LIVE` |
| 24 | Category · profile badge on FAB | "Removed from page; profile shown in popup status detail" | FAB enumerates to exactly: `#jp-study-level-badge`, `#jp-study-comp-badge`, and buttons `toggle/theme/hlmode/learn/ocr/hide-site`. **No category or profile badge.** The profile appears only in the popup's expanded status detail: `Anki profile / Japanese Focus → JP Study::N2 Vocab` | `LIVE` |
| 25 | "Mine → Anki" destination badge | "Removed; destination is a setting with honest two options" | No destination badge in the 4 `jp-study*` nodes on-page, none in the FAB button set. `saveDestination` has exactly two options — `'app'` and `'both'` (`extension/settings.js:74`) — and the card preview states the consequence of each in prose | `LIVE` |
| 26 | Page themes / highlight / tint | "Kept; highlighter rewritten per-text-node (works on any selection)" | Theme cycles 5 states on `<html>`: `(none) → jp-study-theme-night → -sepia → -paper → -gray → (none)`, button text tracking each. **Highlighter driven across element boundaries** — a Range spanning 3 text nodes in different elements produced 3 `MARK.jp-study-hl` nodes (`日本語`, `（にほんご、にっぽんご`, `[`) with `crossesElements:true`. That is exactly the case `Range.surroundContents` throws on, so it is the discriminating test. Theme and highlight mode both **survive a reload** (`jp-study-theme-sepia` + `jp-study-hl-mode` still on `<html>` after `location.reload()`) | `LIVE` |
| 27 | Immersion logging | "Kept (Advanced toggle)" | The toggle is real and in Advanced: `#log-immersion` at `options.html:478`, written at `options.js:141`, read back at `:185`, consumed as `cfg.logImmersion` by the content script's heartbeat (`content.js:2764`, `:2790`). Round trip driven: the app's `immersionGetMetrics().today` advanced while pages were open and moved **+0 s / +0 chars** across a 70 s idle with every tab closed — so it is not a free-running counter. One unresolved anomaly in §4.7 | `LIVE` |
| 28 | Retry queue + badge | "Kept; badge amber, popup pending bar with Retry, unknown legacy kinds dropped safely" | Queue, badge (`#946300`, amber) and pending bar all driven and correct — §4.5. But **"dropped safely" is not what the user is shown**: a discarded item renders in the popup's Recent list as **"Saved"** — §4.10 | `BROKEN` |
| 29 | Pairing | "Settings → Connection only; popup links there on failure" | Options page has a `Connection` category whose pane heading is `Pairing app reachable`; the popup has no pairing form. Token differential: correct → chip `Connected`/`ok`; wrong → chip `Pairing needed`/`warn` with detail row `Pairing / Token needed`. §4.8, and §4.13 for where the link actually sits | `LIVE` |
| 30 | Connection chip | "Expandable: app / pairing / Anki profile / pending, each separate" | `#status-chip` `aria-expanded` **false → true** on click; `#status-detail` `hidden:true → false` revealing four separate labelled rows with computed values: `GrammarX app / Running`, `Pairing / OK`, `Anki profile / Japanese Focus → JP Study::N2 Vocab`, `Waiting to sync / 0`. Every value traces to `status-summary`, which reads `/v1/health` and `/v1/mine-info` | `LIVE` |
| 31 | Context menus | "6 verbs: Look up selection, Save word, Save sentence, Create flashcard, Save page, OCR capture, Open GrammarX" | **9 ids are registered — 8 clickable + 1 separator.** The claim says "6", lists **7**, and omits `analyze.selection` ("AI analysis of selection") entirely. Registration proven by duplicate-id collision with a negative control (§4.2) | `LIVE` |
| 32 | Keyboard commands | "Kept (same ids so user bindings survive); descriptions renamed" | `chrome.commands.getAll()` → the 6 manifest ids all present with the renamed descriptions, plus `_execute_action`. **2 of the 4 manifest `suggested_key`s are unassigned on a fresh profile**: `dictionary-popup` `Alt+Shift+D` and `mine-selection` `Alt+Shift+M` bound; `save-page` (`Alt+Shift+R`) and `action-wheel` (`Alt+Shift+W`) both report `shortcut: ""` | `LIVE` |
| 33 | Settings page | "Categorized app with search + aliases, export/import/reset" | 10 categories, a real `Search settings…` input, and `Export settings / Import settings / Reset to defaults`. Search driven with four terms; `anki` resolves to the `Saving & cards` pane, whose title contains no such word — that is the alias behaviour, not a title filter. §4.9 | `LIVE` |
| 34 | PDF support | "Unchanged — out of scope; documented limitation" | The content script **does** run on a PDF — `contentType: application/pdf`, 4 `jp-study*` nodes, FAB rendered — and the shift-hover that works repeatedly on ja.wikipedia produces **no popup** there (`bodyTextLen: 0`). The limitation is real; the *before* column's stated reason for it is not. §4.12 | `MIXED` |
| 35 | Subtitle capture | "Unchanged — not invented; YouTube actions are metadata/download only" | The extension's whole command vocabulary is the 20 in `/v1/health` plus the 12 More-menu ids and 9 context-menu ids driven above. **No subtitle command exists in any of them**, and the YouTube popup offers exactly `Save video` and `Download video`. The claim is a claim of absence and the absence holds | `LIVE` |

---

### 2.1 Tally, derived from the table above

```
$ awk '/^\| [0-9]+ \|/ { if (match($0, /`(LIVE|MIXED|DEAD|BROKEN|FIXTURE|NOT-REACHABLE)` \|$/)) \
        print substr($0, RSTART, RLENGTH-2) }' \
      docs/audit/FINDINGS_P3_EXTENSION_MATRIX.md | sort | uniq -c
      2 `BROKEN`
     28 `LIVE`
      1 `MIXED`
      4 `NOT-REACHABLE`

$ awk '/^\| [0-9]+ \|/' docs/audit/FINDINGS_P3_EXTENSION_MATRIX.md | wc -l
35
```

Both anchors matter and both were got wrong once while writing this file: without `^\| [0-9]+ \|`
the count picks up the tally block quoting itself (39), and without the end-of-line anchor it picks
up the first backticked capital in the prose — `` `OCR` ``, `` `P` ``, `` `TEXTAREA` `` — and
under-counts `LIVE` to 25.

28 + 1 + 4 + 2 = **35**. No `DEAD` and no `FIXTURE` row: nothing in this extension was found to be
a control wired to nothing, and nothing rendered content that failed to trace to real app data.

| Verdict | Rows |
|---|---|
| `LIVE` | 28 |
| `BROKEN` | **2** — row 22 (level-badge tooltip), row 28 (a discarded item shown as "Saved") |
| `NOT-REACHABLE` | 4 — rows 8, 10, 11, 18 |
| `MIXED` | 1 — row 34 (PDF) |
| `DEAD` | 0 |
| `FIXTURE` | 0 |

---

## 3. Where measurement stopped, and why

**4 rows are `NOT-REACHABLE`.** Every one of them is a *named sub-claim* that could not be driven;
the rest of each row is confirmed and is in column 3 above. Grouped by reason:

### Would write to the user's real Anki collection — rows 10 and 11

`Save word`, `Save sentence`, and `Create card`'s **send** (which *is* the `forceAnki` path). The
default destination is `saveDestination: 'both'`, and the shipping UI states the consequence
itself: *"Destination: **Anki** (falls back to GrammarX if Anki is closed) · copy kept in
GrammarX"*.

This was not a theoretical risk on this machine. `%TEMP%\p3ext-app\anki-intervals.json` reached
**7.8 MB** within three minutes of launching on a **fresh** scratch profile, and the popup reported
the real collection `Japanese Focus → JP Study::N2 Vocab`. **A scratch Electron profile does not
isolate AnkiConnect.** Everything else in both rows — the labels, the single destination setting,
the preview's four fields, the field-editing scope note, Esc-to-cancel — was driven.

### Needs a device grant — row 18

Actual audio recording needs a microphone permission grant in the scratch Chromium profile. The
More-menu entries `Record audio` / `Save audio` were driven and are enabled.

### The fixture could not show it — row 8

The JLPT badge's *"explicitly labeled as estimate"* wording. **8 terms probed, 43 entries, `jlpt: []`
on every single one** — `食べる 学校 勉強 日本 本 大きい 行く 国家`. The badge cannot render in this
app's configuration, so its label cannot be read. This is the shape `jp-dispatch` §9.5 warns about:
a pass here would have carried no information, so it is reported as an absence of measurement
instead. Pitch and frequency, the other two thirds of the row, are confirmed.

**One near-miss worth separating out.** A `<span class="rp-badge jlpt">N4</span>` **does** render —
but in the **Grammar** tab, against a grammar *pattern*, which is row 4's claim, not row 8's. It
carries no "estimate" qualifier in its markup, while its sibling `rp-badge span-ok` does carry
`title="This form appears literally in the sentence"`. Anyone re-running row 8 should not mistake
that badge for the dictionary-entry one.

### Not a reason for anything here: pairing

The dispatch anticipated a `NOT-REACHABLE — requires pairing` bucket. **It is empty.** Pairing
succeeded (§5.2 of the handoff), so every read-only bridge route was driven for real.

### Two things deliberately not done, per the dispatch's hard rules

- **No download was started.** Row 14 was settled on the control's *state and page-awareness* only.
- **No `Save playlist` / `Save video` write was sent.** Row 15 was settled on the label swap and
  the real `youtubePlaylistId` coming back from the app.

## 4. The rows that needed more than one line

### 4.1 Row 7 + row 23 — the known-word control round-trips into the app, and the number moves

This is the strongest observable available here: a click in a **browser extension** creates a key in
the **desktop app's** renderer storage, the extension reads it back, and a *third* number that
claims to depend on it changes.

```
### E-app-localStorage-BEFORE      {"keys":[],"entryFor":{}}          <- the key does not exist yet
### E-extension-known-levels-BEFORE {"ok":true,"levels":{"国家":0}}
### E-comprehensibility-BEFORE     {"ok":true,"percent":0,"known":0,"total":12}

  (click [data-act="wk"][data-level="3"] — "Known" — in the reader popup on ja.wikipedia.org)

### known-buttons-after-click      lvl 0 active:false … lvl 3 active:true
### E-app-localStorage-AFTER       {"keys":["jp-word-knowledge-ja"],
                                    "entryFor":{"jp-word-knowledge-ja":{"l":3,"m":1}}}
### E-extension-known-levels-AFTER {"ok":true,"levels":{"国家":3}}
### E-comprehensibility-AFTER      {"ok":true,"percent":100,"known":12,"total":12}
```

`m:1` is the "set manually" flag (`src/renderer/knownWords.ts:95-101`), so the app recorded it as a
user decision rather than an Anki inference. **Comprehensibility went 0% → 100% on identical input**
— that is the "vary the input and confirm the number moves" test, and it is what separates a real
metric from a rendered constant.

The safety check that made this drivable: `setLevel()` persists to renderer `localStorage`
(`src/renderer/knownWords.ts:63`) and never reaches AnkiConnect. That was verified in source
**before** the button was clicked, not after.

The known-word tint uses the same data:

```
### tint-off {"spans":0}
### tint-on  {"spans":106,"byLevel":{"0":106},
              "sample":["jp-wk-0:コンテンツにスキップ","jp-wk-0:メインメニュー", …]}
```

106 `span[data-jp-wk]` nodes appear and disappear with the toggle, and the level is carried in the
data attribute rather than assumed.

### 4.2 Row 31 — context menus: 9 registered, proven by collision against a negative control

There is no CDP call that enumerates registered context-menu items. `chrome.contextMenus.create`
does, however, report `Cannot create item with duplicate id X` through `lastError` when the id is
already registered — so attempting each declared id is an observation of registration state, and a
**control id that is not registered must succeed** or the instrument proves nothing.

```
lookup.selection  EXISTS: Cannot create item with duplicate id lookup.selection
analyze.selection EXISTS: …
save.word         EXISTS: …
save.sentence     EXISTS: …
card.create       EXISTS: …
sep-1             EXISTS: …
capture.page      EXISTS: …
capture.ocr       EXISTS: …
app.open          EXISTS: …
p3-control-should-not-exist   CREATED (was absent) — removed again      <- the control
```

**9 registered = 8 clickable + 1 separator.** The matrix row says *"6 verbs"* and then lists
**7** of them, and omits `analyze.selection` — *"AI analysis of selection"* — entirely. The menu
itself is real and correct; the row describing it is not. Titles as shipped:
`Look up selection · AI analysis of selection · Save word · Save sentence · Create flashcard ·
—— · Save page to GrammarX · OCR capture (drag a box) · Open GrammarX`
(`extension/background.js:1081-1091`).

### 4.3 Row 16 — manga page-awareness, driven on the shipped detector

```
### E-detector
[{"url":"https://mangadex.org/chapter/abc",       "category":"manga","label":"Manga"},
 {"url":"https://ja.wikipedia.org/wiki/日本語",     "category":"other","label":"Webpage"},
 {"url":"https://www.youtube.com/watch?v=x",      "category":"other","label":"Webpage"},
 {"url":"https://comic-days.com/episode/1",       "category":"manga","label":"Manga"}]
```

Two manga hosts classify as `manga` and the two controls do not — a real differential on the
shipped `detectContentCategory`. `popup.js:158-161` maps `category === 'manga'` to
`{ id: 'scan-strip', label: 'Import manga pages' }`, which is the claimed label exactly.

**One caveat, stated because it looks like a defect and is not:** the YouTube row reads
`category:"other"` here while the live YouTube tab reported `category:"youtube"`. The difference is
my input — `?v=x` is not a valid 11-character video id, so `parseYoutubeVideoId` correctly rejects
it. The detector is right; the test URL was lazy.

### 4.4 Row 21 — the reading list, and the specific junk that was removed

```
### C-reading-list
{"title":"GrammarX — Reading list", "rows":10, "mentionsMine":false,
 "buttons":["Select all","None","Refresh","Save pages to GrammarX","Download videos"]}
```

Each row carries a real per-tab classification from the same detector — the YouTube tab renders
`Video`, the Wikipedia tabs render `Webpage`, and `list-tabs` marks `about:blank` `selectable:false`
while marking the Wikipedia tab `selectable:true`. The two bulk actions are exactly the two claimed.
`/\bmine\b/i` over the whole rendered page → **no match**: the "Mine page" bulk action the row says
was junk is genuinely gone, tested as an absence against a page that would show it if present.

### 4.5 Rows 13 + 28 — the retry queue, driven end to end

Made genuinely offline by pointing the extension at a dead port, which is the only failure
`shouldQueue()` accepts (`extension/background.js:131-133`). No Anki path is involved: `capture.page`
replays to `/v1/capture`.

```
### A0-queue-empty  {"len":0,"kinds":[]}
### A0-badge        {"text":"","color":[148,99,0,255]}
### A1-run-capture-while-offline  {"ok":true,"queued":true,"kind":"article","action":"inbox"}
### A1-queue        {"len":1,"kinds":["capture"]}
### A1-badge        {"text":"1","color":[148,99,0,255]}
```

`[148,99,0,255]` is `#946300` — **amber**, as claimed. The queued result returned `ok:true` and did
not throw, which is the specific regression row 13 asserts was fixed.

Popup pending bar, after a reload while still offline:

```
### A2-popup-pending-bar {"mentionsPending":true,"pendingText":"Queued",
                          "retryBtn":{"text":"Retry now","hidden":false,"offsetParent":true},
                          "chip":"App not running","chipCls":"status-chip err"}
```

Unknown legacy kinds — one injected, then the port restored and Retry driven:

```
### A3-queue-with-legacy  {"len":2,"kinds":["capture","legacy-kind-that-no-longer-exists"]}
### A4-flush              {"flushed":1,"left":0,"dropped":1}
### A4-queue-after-flush  {"len":0,"kinds":[]}
### A4-badge-after-flush  {"text":""}
```

`flushed + left + dropped` = 2 = what went in. The drop is accounted for rather than silent — in the
*flush result*. What the popup then does with it is §4.10, and it is the second blocker of this run.

### 4.6 Row 22 — the page level badge tells the user something false. `BROKEN`.

The app distinguishes **four** states. The badge has **three** tooltips. The fourth state borrows
the wrong one.

Two calls to the same route, differing only in the text:

```
### A-app-answer-JA  {"ok":true,"badge":"—","empty":false,"noLists":true, "lang":"ja","scheme":"jlpt"}
### A-app-answer-EN  {"ok":true,"badge":"X","empty":true, "noLists":false,"lang":null,"scheme":null}
```

`noLists: true` means *"Japanese was detected; you have no vocabulary lists installed, so no
estimate is possible."* `empty: true` means *"there is no Japanese or Chinese here."* Two different
things. Now the rendered badge, on a **105,339-character Japanese Wikipedia article**:

```
### A-badge-on-JA-page
{"pageChars":105339,"hasJapanese":true,
 "level":{"text":"—",
          "title":"No Japanese or Chinese text detected on this page",
          "cls":"offline",
          "data":{"empty":"0","offline":"0","lang":"ja"}}}
```

The tooltip is **false**. The element's own dataset contradicts it in the same breath —
`lang: "ja"` says Japanese *was* detected and `empty: "0"` says the page was not empty.

Cause, and it is three lines: `runLevelScan` collapses `noLists` into the same `'—'` badge string
as every other no-estimate case (`extension/content.js:2703`), and `setLevelBadge`'s tooltip
ternary has no branch for it (`extension/content.js:2657-2663`):

```js
el.title = meta?.offline
  ? 'Difficulty estimate unavailable — GrammarX is not running'
  : next === 'X' || next === '—'
    ? 'No Japanese or Chinese text detected on this page'   // <- swallows noLists
    : `Estimated page difficulty: ${next} …`;
```

A second, smaller inconsistency in the same render: the badge is given the CSS class **`offline`**
(`content.js:2656`, `next === '—'`) while `dataset.offline` is `"0"` and the app answered `200` —
so the badge is *styled* as disconnected while its own data says it is connected.

**Severity: blocker** — this is shipping UI copy telling the user something untrue, and the false
statement points them away from the fix (install a vocabulary list) toward a non-problem.

### 4.7 Row 27 — immersion logging, and the one number this run could not explain

The setting is real end to end: `#log-immersion` in the **Advanced** pane
(`extension/options.html:478`, labelled *"Log reading time to GrammarX — Counts active time on
pages with Japanese text toward your immersion statistics"*), written at `options.js:141`, read
back at `:185`, and consumed by the content script's heartbeat as `cfg.logImmersion`
(`content.js:2764`, `:2790`). `immersion` is one of the 10 queue kinds and `/v1/immersion/visit`
its replay endpoint (`background.js:213-224`).

The metric is not a free-running counter. With **every page target closed but one `about:blank`**,
two reads of the app's own `immersionGetMetrics()` **70 s** apart:

```
### D-cleanroom-t0                  today.seconds 8205, today.chars 1011163
### D-cleanroom-t1-after-70s-idle   today.seconds 8205, today.chars 1011163
### D-cleanroom-delta               {"seconds":0,"chars":0}
```

**The anomaly, stated as an open question rather than a verdict.** Earlier in the run, with **28
page targets open** (`D-open-page-targets-before {"n":28}`), the same two reads **35 s** apart gave:

```
### A-control-delta  {"seconds":480,"chars":48000}
```

480 immersion-seconds in 35 seconds of wall clock, with no navigation and no input in the window.
`48000 = 6 × 8000`, and 8000 is exactly `samplePageText(8000)`'s cap — so six flushes landed, each
carrying ≥60 s. Two readings fit and this run does not distinguish them:

1. **Legitimate but late** — each of those tabs accrued real dwell seconds while it was the active
   tab earlier in the session and flushed them during the window. Correct behaviour, delivered out
   of order.
2. **Over-count** — the `document.visibilityState !== 'visible'` guard (`content.js:2792`) is not
   holding for background tabs, so more than one tab accrues per wall-clock second.

Distinguishing them needs a controlled two-tab run with timestamps on each flush, which this run
did not do. Flagged because the setting's own copy says *"active time"*, and reading 1 is fine
while reading 2 would make the app's headline immersion number wrong. **Not filed as a defect.**

### 4.8 Row 29 — pairing, and where the popup sends you when it fails

Pairing lives on the options page under **Connection** (`B-options-shape`, and the pane's own
heading is `Pairing app reachable`). The popup has no pairing form — it has a link.

Differential, same instrument, only the token changed:

| token | `status-summary` | chip |
|---|---|---|
| correct | `{app:true, paired:true, profileName:"Japanese Focus", deckName:"JP Study::N2 Vocab"}` | `Connected`, `status-chip ok` |
| wrong | `{app:true, paired:false, profileName:"", deckName:""}` | `Pairing needed`, `status-chip warn` |

The chip degrades honestly and names the right problem — not "app not running", which is the wrong
advice and the failure mode `background.js:1196-1207` explicitly guards against.

**One thing the run got wrong first and had to re-measure.** `#fix-connection`'s visibility was read
via `offsetParent`, which is also `null` for a positioned element, and the first reading was taken
from a popup DOM left over from an *earlier* reload — the chip said `App not running` when the app
was running, because that render was from the offline phase of §4.5. The corrected measurement is
in `C-unpaired-link` / `C-unpaired-link-after-expand`.

### 4.9 Row 33 — the settings page

```
### B-options-shape
{"title":"GrammarX — Extension settings",
 "search":{"id":"search","ph":"Search settings…"},
 "categories":["Hover lookup","AI OCR","Reader popup","Saving & cards","Radial wheel",
               "Page panel","Video & media","Connection","Shortcuts","Advanced"],
 "controls":{"inputs":32,"selects":9,"buttons":23},
 "exportImportReset":["Export settings","Import settings","Reset to defaults"]}
```

10 categories, not an accordion. Search driven with four terms, and **the alias behaviour is what
makes it a real search rather than a title filter** — `anki` is not the name of any pane:

```
### B-search-pair      -> ["Pairing app reachable"]
### B-search-hover     -> ["pane-lookup"]
### B-search-anki      -> ["pane-saving"]        <- "Saving & cards"; matched through an alias
### B-search-shortcut  -> ["Browser shortcuts"]
```

Export / Import / Reset all present as real controls.

### 4.10 Rows 28 + 13 — a **discarded** item is shown to the user as **"Saved"**. `blocker`.

`flushQueue` records every drop into the activity list the popup shows, and the code says why:

```js
// A drop is the queue failing at its one job, so it goes in the activity list
// the popup shows rather than vanishing into a console nobody has open.
for (const item of dropped) {
  await recordActivity({ kind: item.kind, label: queueItemLabel(item), dropped: item.reason });
}
                                                     // extension/background.js:272-276
```

The popup then renders that entry without ever reading `dropped`:

```js
it.queued ? 'Queued' : RECENT_LABELS[it.kind] || 'Saved'
                                                     // extension/popup.js:265-268
```

**`entry.dropped` has zero read sites in the whole extension.** The six hits for "dropped" in
`popup.js` are all `res.dropped`, the flush *count*, not the per-item flag:

```
$ grep -rn "dropped" extension/ | grep -v background.js
extension/popup.js:299,300,304,305,308,310   <- all res.dropped (the count)
extension/settings.js:6                      <- a comment
```

Driven, from an emptied activity list:

```
### D-flush              {"flushed":0,"left":0,"dropped":1}
### D-popup-recent-render  ...  "A page the user asked to save" · "Saved"
```

The item was **discarded** and the popup says **Saved**. Worse, the two messages are shown together:
the flush toast reads *"1 item could not be saved and was discarded — **see recent activity**"*
(`popup.js:299-300`) and recent activity then says it was saved. The toast points the user at the
list that contradicts it.

Reachability is not hypothetical. Drops happen on three real paths — an unknown legacy `kind`
(exactly the case row 28 claims is "dropped safely"), `MAX_QUEUE_ATTEMPTS` = 10, and
`MAX_QUEUE_AGE_MS` = 7 days (`background.js:161-162`). And because `recordActivity` is called with
the **queue** kind (`capture`, `mine`, `inbox`) while `RECENT_LABELS` is keyed by the **success**
kinds (`word`, `sentence`, `card`, `page`, `download`, `ocr`, `manga`), the lookup almost always
misses and falls through to the bare literal `'Saved'`.

Resolution, per the A–E ladder: this is a display bug with the data already present — the entry
carries `dropped: 'unknown-kind' | 'attempts' | 'age'`. One branch in `refreshRecent` fixes it.
Not built here; this run does not own `extension/`.

### 4.11 Row 1 — "popup survives cursor entry", settled by a three-way differential

`closeOnRelease` is the setting this claim hangs on. One run cannot decide it: with the default
(`false`) the popup stays open no matter where the pointer is, so a "survives" pass carries no
information. Three runs on the same instrument, varying only the setting and the pointer:

| `closeOnRelease` | pointer at Shift-release | after hover | after release |
|---|---|---|---|
| `false` (default) | outside popup | open, term `国内` | **open** |
| `true` | outside popup | open, term `国内` | **closed** |
| `true` | moved into the popup | open, term `国内` | **open** |

Row 2 flipping to `closed` is what makes rows 1 and 3 mean something — without it, "still open"
would be indistinguishable from the setting doing nothing. The claim holds
(`extension/content.js:1531-1533`, `if (cfg.closeOnRelease && !popupPinned && !pointerOverPopup)`).

### 4.12 Row 34 — PDF: the panel renders on a PDF and cannot do anything there

The matrix's *before* column explains the limitation as *"content script is http/https only"*, and
the *after* column says **"Unchanged"**. Driven on `https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf`:

```
### A-pdf-panel      {"contentType":"application/pdf","jpNodes":4,"fab":true,
                      "bodyTextLen":0,"embeds":0,
                      "levelBadge":{"text":"—","title":"No Japanese or Chinese text detected on this page"}}
### A-pdf-after-hover {"popup":false}
```

The content script **does** run on a PDF — the manifest matches on scheme, not content type — and
the on-page panel renders with all four `jp-study*` nodes. The shift-hover that reliably produces a
popup on ja.wikipedia.org (same instrument, four times this run) produces **nothing** here, because
the shell document has zero readable text (`bodyTextLen: 0`) and the viewer's content is not in it.

So the limitation is real, and the explanation given for it is not: the reason lookup fails on PDFs
is that the text is unreachable, not that the content script is absent. What the user gets is a
GrammarX panel sitting on a PDF offering Theme / Highlight / Known tint / OCR, none of which can
reach the document.

Both halves observed — a real side effect (the panel) and an observed non-effect (the lookup), with
a positive control on the same instrument — so this is `MIXED`, not a pass and not a `DEAD`.

### 4.13 Row 29 — where the "Open connection settings" link actually is

```
### C-unpaired-link
{"chip":"Pairing needed","chipCls":"status-chip warn","chipExpanded":"false",
 "detailHidden":true,"inDetail":true,
 "link":{"text":"Open connection settings","display":"block","visibility":"visible","w":0,"h":0}}

### C-unpaired-link-after-expand
{"detailHidden":false,"w":136,"h":18,
 "detailText":"GrammarX app | Running | Pairing | Token needed | Anki profile | — | Waiting to sync | 0 | Open connection settings"}
```

The link is real and it is inside `#status-detail`, which is collapsed until the chip is clicked —
so on a pairing failure the popup shows `Pairing needed` in amber but the link is **0×0** until the
user expands the chip. `display:block; visibility:visible` with a zero box is why `offsetParent`
was the wrong instrument here and the measurement had to be redone.

One click behind an amber chip that names the problem is defensible; "links there on failure"
overstates it slightly. Recorded as a note on a `LIVE` row, not as a defect.
### 4.14 Row 17 — the OCR "no models installed" guidance was wrong for the first hour

`/v1/ocr/status`, same app process, same route, no models downloaded in between:

```
  09:5x  {"ok":true,"available":false,"web":false,"manga":false,"langs":[],
          "message":"No OCR models are installed — open Settings → Models & dictionaries to download them."}

  ~1 h later
         {"ok":true,"available":true,"web":true,"manga":false,"langs":["ja","zh","ru"],
          "message":"Web OCR ready (ja, zh, ru); manga OCR not installed."}
```

The second answer is the true one: an OCR driven through the FAB immediately afterwards returned
**real recognised Japanese** from the page (61 characters), so the models were installed all along.

The early answer therefore sends a user with working OCR to a download screen they do not need. It
is a warm-up race in the app's status route, not in the extension — `background.js:1348-1360`
already treats an *unanswered* status as `available: undefined` precisely so it does not misdirect;
the case it cannot defend against is the app answering **`false` confidently while still warming
up**. Owner is the app side, not `extension/`.

**Recorded with its limit:** this run took the two readings ~1 hour apart and did not bisect the
transition, so "warm-up" is the most likely explanation rather than a proven one. What is proven is
that the same route gave two contradictory answers about the same unchanged installation.


### 4.15 The two sub-claims the first pass left unmeasured, driven on a second harness

Written after a full teardown, because a self-imposed rule ("a row is `LIVE` only if every
sub-claim was driven") had two rows failing it on detail I had skipped. Both halves were relaunched
on fresh profiles `p3ext-app2` / `p3ext-chrome2`, re-paired, and re-identified by manifest name
before either measurement.

**Row 4 — "literal spans underlined".** Driven on `食べなければならないと思います。`:

```html
<div class="rp-sentence-line" lang="ja">食べ<u class="rp-hl-grammar">なければならない</u><u class="rp-hl-grammar">と</u>思います。</div>
```

`getComputedStyle` on both `<u>` nodes: `textDecorationLine: "underline"`,
`textDecorationStyle: "solid"`, `textDecorationColor: rgb(217, 185, 106)`. Underlined in fact, not
just in markup — and only the two patterns that appear **literally** are wrapped, which is what the
sibling badge asserts (`rp-badge span-ok`, `title="This form appears literally in the sentence"`).

The probe walked **20** candidate inline elements (`u, ins, mark, b, i, em, span`) in that body. Of
the sample it returned, the two `<u class="rp-hl-grammar">` nodes are the ones carrying
`textDecorationLine: underline`; the `rp-badge` spans beside them compute to
`textDecorationLine: none` with a `1px solid` bottom border, which is a different treatment
entirely. *(The returned list was sliced to 10, so this is a statement about that sample, not a
census of all 20.)*

**Row 7 — "loads for the de-inflected base form".** The discriminating test is to act on a
*surface* form and see which key the app gains:

```
popup header                       term "食べなければ", reading "たべる"
### B-known-levels-before          {"食べる":0,"食べなければ":0}
   (click [data-act="wk"][data-level="2"] — "Familiar" — with 食べなければ in the header)
### B-known-levels-after           {"食べる":2,"食べなければ":0,"食べなければならない":0}
### B-app-store                    keys ["食べる"], {"食べる":{"l":2,"m":1}}
```

The app's `jp-word-knowledge-ja` gained **one** key and it is the base form. The surface form the
user clicked on is not stored, so the level will be found again the next time that verb appears in
any inflection. That is the claim, and the two zero entries beside it are the control that makes it
a measurement rather than a coincidence.

---

## 5. Findings, in the wave's row schema

Emitted in `honesty-probe` §5's column order so this table can be concatenated into the master
audit without normalisation. Most-severe first.

| id | area | surface | probe | claim | what was measured | verdict | evidence path | severity | owner |
|---|---|---|---|---|---|---|---|---|---|
| P3-D1 | extension | GrammarX page panel ▸ difficulty badge | D | "Kept, with honest tooltips (estimate/offline/no-JA-text)" — `EXTENSION_FEATURE_TRUTH_MATRIX.md:33` | On a 105,339-char Japanese article the app answered `{badge:"—", empty:false, noLists:true, lang:"ja"}` and the badge rendered `title="No Japanese or Chinese text detected on this page"` with `dataset.lang="ja"`, `dataset.empty="0"`. Identical tooltip for pure English text (`{badge:"X", empty:true, lang:null}`) — the two states are indistinguishable to the user. Cause: `content.js:2703` collapses `noLists` into `'—'`; `content.js:2657-2663` has no branch for it | `BROKEN` | this file §4.6 | blocker | `extension/content.js` |
| P3-A1 | extension | Toolbar popup ▸ Recent | A | "unknown legacy kinds dropped safely" — `EXTENSION_FEATURE_TRUTH_MATRIX.md:39` | Flush of a queue holding one unknown kind → `{flushed:0, left:0, dropped:1}`; the activity record is `{dropped:"unknown-kind", kind:"obsolete-kind-from-an-older-build", label:"A page the user asked to save"}`; the popup rendered `<span class="what">Saved</span>`. `grep -rn "dropped" extension/ \| grep -v background.js` → **6 hits, all `res.dropped` (the count), zero reads of the per-item flag**. The same flush's toast says "1 item could not be saved and was discarded — see recent activity" | `BROKEN` | this file §4.10 | blocker | `extension/popup.js` |
| P3-D2 | app | Extension bridge ▸ `/v1/ocr/status` | D | `"No OCR models are installed — open Settings → Models & dictionaries to download them."` | Two calls to the same route on the same app process, no models downloaded in between: first `{available:false, web:false, langs:[]}` with that message, later `{available:true, web:true, langs:["ja","zh","ru"]}`. An OCR driven immediately after the second returned 61 characters of real recognised Japanese, so the models were installed the whole time. The first answer sends a working install to a download screen | `BROKEN` | this file §4.14 | major | `src/main/**` (status route), not `extension/` |
| P3-A2 | extension | Page panel on a PDF | A | "PDF support … Unchanged — out of scope; documented limitation" — `EXTENSION_FEATURE_TRUTH_MATRIX.md:45` | On `…/dummy.pdf` (`contentType: application/pdf`): 4 `jp-study*` nodes and the FAB render, offering Theme / Highlight / Known tint / OCR. A shift-hover that produces a popup every time on ja.wikipedia produces **none** here — `bodyTextLen: 0`, the viewer's text is not in the shell document. The panel is present and cannot act on the page | `MIXED` | this file §4.12 | minor | `extension/content.js` |
| P3-A3 | extension | background message router | A | — (no claim; found while driving) | `type: 'health'` has **one handler and zero senders**: `grep -rn "'health'" extension/` → `background.js:1193` only, while `status-summary` has a handler *and* `popup.js:42`. Driven directly it also reports `paired: true` on a wrong token, because `/v1/health` is unauthenticated — harmless only because nothing in the shipped UI calls it | `DEAD` | `extension/background.js:1193-1217` | minor | `extension/background.js` |
| P3-F1 | extension | Keyboard commands | F | "Kept (same ids so user bindings survive)" — `EXTENSION_FEATURE_TRUTH_MATRIX.md:43` | `chrome.commands.getAll()` on a fresh profile: all 6 manifest ids present with the renamed descriptions, but **2 of the 4 declared `suggested_key`s are unbound** — `save-page` (`Alt+Shift+R`) and `action-wheel` (`Alt+Shift+W`) both return `shortcut: ""`, while `dictionary-popup` and `mine-selection` are bound. The wheel's advertised shortcut does not exist until the user assigns it | `MIXED` | this file §2 row 32 | minor | `extension/manifest.json` |
| P3-F2 | extension | Clipboard command labels | F | "One path: 'Add to clipboard history'" — `EXTENSION_FEATURE_TRUTH_MATRIX.md:30` | One command id (`clipboard.send`) and one real destination (verified: the app's `jp-clipboard-history` gained the entry), but two labels — popup More tab "Add to clipboard history", on-page More menu "Send to clipboard history" | `LIVE` | this file §2 row 19 | minor | `extension/content.js` |

**Two verdicts here differ from the matrix row they touch, on purpose.** A §5 row is scoped to the
*defect*; a §2 row is scoped to the *claim the matrix makes*. They are not the same object:

- **P3-D2 `BROKEN` vs row 17 `LIVE`** — row 17 is the extension's OCR surface, which works. P3-D2 is
  the **app's** `/v1/ocr/status` route, which contradicted itself. Different owner, different file.
- **P3-F1 `MIXED` vs row 32 `LIVE`** — row 32's claim is *ids kept, descriptions renamed*, and both
  are true. P3-F1 is about two `suggested_key` accelerators that never got bound, which the row
  does not claim.

Neither is a disagreement; conflating them would be.

**Resolution note, per `honesty-probe` §6.** P3-D1 and P3-A1 are both display bugs with the correct
data already in hand — the badge's `dataset` carries `lang`/`empty`, the activity entry carries
`dropped`. Each is one branch. This run does not own `extension/` and built nothing.

---

## 6. Corrections owed to documents this run does not own

| Document | What it says | Measured | Who should fix |
|---|---|---|---|
| `docs/audit/FINDINGS_EXTENSION_BRIDGE.md:130` | `47-row feature truth matrix — 0 / 47` | The matrix has **35** feature rows | whoever owns that file |
| `docs/audit/FINDINGS_EXTENSION_BRIDGE.md:129` | `Browser-side load — 0 / 1 — NOT ATTEMPTED`, contradicted by §E4 in the same file, which records it as driven and `LIVE` | Re-derived independently this run: service worker registers, `getManifest().name` = `GrammarX — Reader Companion` v3.2.0, content script injects | same |
| `EXTENSION_FEATURE_TRUTH_MATRIX.md:42` | "6 verbs: Look up selection, Save word, Save sentence, Create flashcard, Save page, OCR capture, Open GrammarX" | Says **6**, lists **7**, and the extension registers **8 clickable items + 1 separator** — the omitted one is `analyze.selection` / "AI analysis of selection" (§4.2) | whoever owns the matrix |
| `EXTENSION_FEATURE_TRUTH_MATRIX.md:25` | "'Download video', page-aware (**disabled** off YouTube)" | Off YouTube the control is **absent**, not disabled. Behaviour is right; the word is wrong | same |
| `EXTENSION_FEATURE_TRUTH_MATRIX.md:45` | PDF: "Missing (content script is http/https only)" as the *reason* | The content script **does** run on a PDF URL; what it cannot reach is the viewer's text (§4.12) | same |
| `docs/audit/DISPATCH_P3_EXTENSION_MATRIX.md:46` | Chromium at `chromium-1228\chrome-win\chrome.exe` | The directory is `chrome-win64`; `chrome-win` does not exist | whoever writes the next dispatch |
| `docs/audit/DISPATCH_P3_EXTENSION_MATRIX.md:85-87` | "A fresh profile opens behind a full-viewport telemetry consent gate — dismiss it with 'No thanks'" | No consent gate appeared on this fresh profile; `/consent\|telemetry\|No thanks/i` over `document.body.innerHTML` → **false** | same |

---

## 7. Raw evidence

The harness is **13** `.mjs` stage scripts plus four shared modules (`cdp.mjs`, `bridge.mjs`,
`extctx.mjs`, `pair.mjs`) in the session scratchpad — deliberately not in the repo, and therefore
not durable (`ls s*.mjs | wc -l` → 13). The outputs they produced are reproduced below so this file stands alone.

**To re-run from scratch:**

```
# 1. app, on a throwaway profile
npx electron-forge start -- --user-data-dir=%TEMP%\p3ext-app

# 2. browser — chrome-win64, NOT chrome-win, and NOT branded Chrome
%LOCALAPPDATA%\ms-playwright\chromium-1228\chrome-win64\chrome.exe
  --disable-extensions-except=<repo>\extension
  --load-extension=<repo>\extension
  --remote-debugging-port=9222 --user-data-dir=%TEMP%\p3ext-chrome
  --no-first-run --no-default-browser-check about:blank

# 3. pair: read window.api.extensionStatus().token through the debug bridge, then
#    chrome.storage.local.set({ jpStudyToken: <token>, jpStudyPort: 18765 }) in the worker
```

Node 24's native `WebSocket` is enough for the CDP client; **nothing was installed** and
`package.json` was not touched.

### 7.1 Identification and injection

```
### serviceWorkers
[{"url":"chrome-extension://nkeimhogjdpnpccoofpliimaahmaaome/thunk.js",
  "name":"Google Hangouts","version":"1.4.5"},
 {"url":"chrome-extension://nimngppppgpldedpaepkpobiebicmcba/background.js",
  "name":"GrammarX — Reader Companion","version":"3.2.0"}]

### injection (ja.wikipedia.org/wiki/日本語, 105,339 chars)
{"fab":true,"nodes":4,"ids":["jp-study-fab","jp-study-level-badge",
                             "jp-study-comp-badge","jp-study-fab-status"]}
```

Chrome's own **Google Hangouts** component extension exposes a service worker in the same target
list. Matching on "the only service worker", or on a URL, measures it.

### 7.2 The FAB and the theme cycle

```
### fab-initial
{"corner":"bottom-right","collapsed":false,
 "level":{"text":"—","title":"No Japanese or Chinese text detected on this page",
          "data":{"empty":"0","offline":"0","lang":"ja"}},
 "comp":{"text":"0%","title":"Share of sampled words you already know"},
 "buttons":[{"act":"toggle"},{"act":"theme","text":"Theme: off"},
            {"act":"hlmode","text":"Highlight"},{"act":"learn","text":"Known tint"},
            {"act":"ocr","text":"OCR"},{"act":"hide-site","text":"Hide here"}]}

### fab-after-toggle   {"collapsed":true,"actionsHidden":true,"toggleText":"▴"}

### theme-cycle   (6 clicks, class on <html> read at each step)
[] "Theme: off" -> [jp-study-theme-night] -> [-sepia] -> [-paper] -> [-gray] -> [] "Theme: off"

### hl-on     {"text":"Highlight: on","on":true,"htmlCls":["jp-study-hl-mode"]}
### learn-on  {"text":"Known tint: on","on":true}
```

No category badge and no destination badge exist in that button set — rows 24 and 25, tested as
absences against an enumeration that would have shown them.

### 7.3 The background router, all read-only routes

```
### status-summary  {"ok":true,"app":true,"pending":0,"profileName":"Japanese Focus",
                     "deckName":"JP Study::N2 Vocab","version":1,"paired":true}
### get-commands    6 manifest ids + _execute_action; shortcuts bound:
                    dictionary-popup Alt+Shift+D, mine-selection Alt+Shift+M;
                    save-page "" and action-wheel "" (both declare a suggested_key)
### list-tabs       about:blank selectable:false · ja.wikipedia selectable:true
### lookup 日本語     6 entries, JMdict EN + JMdict RU + Moedict, real pitchHtml
### examples 食べる   食べる？ / 食べる。 / 食べるな！  with English glosses
### known-levels    {"日本語":0,"食べる":0,"国家":0}
### grammar-match 食べなければならないと思います。
                    8 matches incl. n4-nakereba-naranai / 〜なければならない / N4 / "must do ~"
### comprehensibility  {"percent":0,"known":0,"total":48}
```

### 7.4 Page awareness — the popup rebuilt against three real pages

```
ja.wikipedia.org   detect kind:"article"          -> Look up selection · Save selection ·
                                                     Save page · OCR capture
youtube.com/watch  detect kind:"youtube-video"    -> Save video · Download video ·
                                                     Look up selection · Save selection
youtube.com/playlist?list=PLbpi6Zaht...
                   detect kind:"youtube-playlist" -> Save playlist · Download video ·
                                                     Look up selection · Save selection
                   playlist-status youtubePlaylistId:"PLbpi6ZahtOH6Blw3RGYpWkSByi_T7Rygb"
```

On YouTube the popup's own empty state reads *"No Japanese text detected on this page — Hover
lookup activates when you hold the lookup key over Japanese text."*

### 7.5 The reader popup, tab by tab

```
### popup-after-shift-hover
{"open":true,"rect":{"w":362,"h":502},
 "tabs":[meaning*,grammar,sentence,kanji,examples,more]}
header: 国内 こくない   [tts] [pin] [close]      badge: common
known:  Known: [New*] [Learning] [Familiar] [Known]

### tab-meaning   5 entries + "3 more entries — see More tab."
### tab-grammar   sentence + 〜ている N5 · 〜し N4 · の N4 · さ N4 · ている N4 · 間 N4
                  + "Matches are found by GrammarX's pattern rules on this sentence's text.
                     When several overlap, judgement is yours"
                  buttons: open-grammar, save-sentence
### tab-sentence  bounds + "Known words 0% · 52 chars"
                  buttons: sent-extend-left, sent-extend-right, sent-reset, sent-edit,
                           copy, save-sentence, card-sentence
### tab-kanji     内 ない "within ...; inside ..."      button: lookup-nested:内
### tab-examples  8 examples, 8 x example-tts:Play + 8 x example-save:Save sentence
### tab-more      Pitch accent ない · Entries "8 from JMdict (Japanese–English)" ·
                  Source page 日本語 - Wikipedia · Translate sentence ·
                  Add to clipboard history · Open GrammarX ·
                  "All dictionary, grammar, and difficulty data comes from your GrammarX
                   desktop app over the local bridge."

### kbd  more --ArrowRight--> meaning --ArrowLeft--> more
### pin  {"pinned":false} --P--> {"pinned":true}
### drag (pinned) left 474.5px -> 344.5px, top 138px -> 268px
### nested (国家) chars ["国","家"] -> click 家 -> term 家 / か, back shown
                  -> Back -> term 国家, back hidden
### tts  speechSynthesis.speaking  false -> true -> false   (10 voices)
### sentence bounds  52 chars -> extend-left 73 -> extend-right 158 -> again 196 -> reset 52
### card-preview {"open":true,"text":"内","editable":true,"tag":"TEXTAREA",
                  "kinds":[{"kind":"word","active":true},{"kind":"sentence","active":false}],
                  "source":"Source: 日本語 - Wikipedia",
                  "dest":"Destination: Anki (falls back to GrammarX if Anki is closed) ·
                          copy kept in GrammarX",
                  "note":"GrammarX fills the card fields (reading, definition, audio) from its
                          dictionaries and your Anki field mapping.",
                  "buttons":["cancel:×",":Word card",":Sentence card",
                             "cancel:Cancel","send:Create card"]}
### card-preview-after-esc {"open":false}      <- send was never clicked
```

### 7.6 Wheel, More menu, highlighter, OCR

```
### wheel   className "open"; centre "Cancel"; slices
            1 Look up · 2 Word · 3 Sentence · 4 Card · 5 Page · 6 More
            --Escape--> className ""

### more-menu (12 items)
capture.ocr:OCR capture · capture.audio.record:Record audio · capture.audio.save:Save audio ·
clipboard.send:Send to clipboard history · translate.selection:Translate ·
grammar.match:Match grammar · reader.theme:Reading theme · reader.highlight:Highlight mode: on ·
reader.knownTint:Known-word tint: on · tabs.picker:Reading list · app.open:Open GrammarX ·
settings.special:Special modules

### highlighter across element boundaries
selection {"spansNodes":3,"crossesElements":true,"text":"日本語（にほんご、にっぽんご["}
result    MARK.jp-study-hl:日本語 · MARK.jp-study-hl:（にほんご、にっぽんご · MARK.jp-study-hl:[

### ocr
armed  {"overlay":true,"selecting":true}
result {"open":true,
        "text":"OCR result / x / Read as Japanese · Double-click a word to look it up. /
                AI analysis / Look up / Save to GrammarX / Re-select",
        "textarea":{"readOnly":false,"value":"川山 / む日本人同士の間で使用され / ..."},
        "buttons":["close:×","analyze:AI analysis","lookup:Look up",
                   "save:Save to GrammarX","retry:Re-select"]}
```

### 7.7 Persistence across a reload

```
### persist-before-reload {"theme":["jp-study-theme-sepia"],"hl":true}
### persist-after-reload  {"theme":["jp-study-theme-sepia"],"hl":true,"fab":true}
```

An update that vanishes on reload never happened. These did not vanish.
