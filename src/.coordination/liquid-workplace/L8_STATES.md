# L8 — the four states on the Liquid Dictionary window

Rubric category 8's second and third numbers: *whether empty, loading, error and offline states
each render a named, translated message*, and *0 raw i18n keys*.
Instrument `probes/l8-honest-states.cjs`, driven live against pid 7920, 2026-08-24.
Raw run: `baselines/l8-honest-states-run2.json`.

`L1_HONEST_STATES.md` recorded this category VOID for a stated reason: *"Two induced-failure
attempts both SUCCEEDED, so the error and offline states were never observed."* This run has a
dependency that is genuinely down.

## The induction, and its control

| Probe | Verdict | Detail |
| --- | --- | --- |
| `127.0.0.1:8765` AnkiConnect | **REFUSED** | `ECONNREFUSED`, TCP connect from node |
| `127.0.0.1:5173` Vite (control) | LISTENING | connect succeeded |

The refusal is measured **from outside the app**, by this process's own socket, before the probe
touches the renderer. The thing under test cannot also be the evidence that its dependency is
down. The second row is the control on the control: a prober that returned REFUSED for everything
would prove nothing. The app's own reading agrees — `ankiLinkState()` returns
`state: 'disconnected'`, `consecutiveFailures: 598`.

## The three states this run measured

| State | Rendered | Number |
| --- | --- | --- |
| Empty | `No dictionary match for "zzzqqqxxwv".` | names the query back; **0** raw keys |
| Loading | `Looking up…` | observed in-page; **8** entries after; **0** raw keys |
| Offline | `Can't reach Anki. Open Anki desktop and make sure the AnkiConnect add-on is installed.` + `To add cards, install the free AnkiConnect add-on (one time):` + **4** numbered steps + `Retry` | **0** raw keys, `falseSuccess: false` |

`falseSuccess` is the assertion that matters for the offline row: no `.dict-add` label read
*Added* after the click. A surface that reports success against a refused port is the exact defect
category 8 exists to catch, and it is asserted rather than eyeballed.

**Clicking `+ Add to Anki` is safe while the port is refused, and that is measured, not assumed.**
`l8-dead-controls.cjs` excludes all eight because they write a real note; here `addToAnki` awaits
`ensureAnki()`, reads `connected:false` and returns **before** `ankiMineNote`. The run records
`ankiStatus().connected === false` immediately before the click.

## The instrument defect this slice paid for

Run 1 sampled `.dict-loading` over the bridge every 40 ms for 1500 ms and returned **`[]`** — on a
lookup that provably ran (8 entries after). One `/eval` round trip is longer than a local SQLite
lookup, so the sampler's own latency exceeded the state it was sampling. That `[]` is
indistinguishable from a surface that says nothing while it works: `L1_HONEST_STATES.md`'s
`loading: 0` a second time, different cause. A MutationObserver installed in the page **before**
the click sees it — `Looking up…`. Any transient state on this surface must be observed in-page,
never polled from node.

## The way back is not on the panel — measured

`AnkiSetup` replaces the whole result list from an early return (`DictionaryResults.tsx:844`) and
receives `onBack` **only when `variant === 'popup'`**. The floating Dictionary window is
`variant='page'`, so the panel renders exactly one button:

- `backButtonPresent: false`
- Retry → `setShowSetup(false)` then `ensureAnki()`, which sets it straight back:
  `stillSetup: true`, `entries: 0`.

It is not a dead end — `:290-293` clears `showSetup` whenever the query changes, and the search
box stays visible above the panel, so a fresh search restores the results. But the eight results
the user already had are gone and must be re-queried against a 697k-row database to get back.
Recorded as a category 6 reversibility defect on this surface.

**Fixed and re-measured in the same commit** — `onBack` is now passed for every variant, not only
`popup`. `probes/l8-setup-back.cjs`, same refused port (`ECONNREFUSED`):

| | before the click | on the panel | after Back |
| --- | --- | --- | --- |
| `.dict-entry` | **8** | 0 | **8** |
| window chars | **3,720** | — | **3,720** |
| buttons | — | `Back`, `Retry` | — |

`roundTripExact: true`, `stillOnPanel: false`. The char equality is the part that matters: a "fix"
that silently re-ran the lookup would also show 8 entries and would not be a way back. Nothing was
re-queried — `showSetup` is the only state that changed.

## The error state, and the defect the induction found on the way

The error branch is unreachable from the Anki path while the port is refused: `ensureAnki`
short-circuits ahead of `ankiMineNote`, so `res.error` never renders. It needs a dependency that
*accepts* the request and then fails it. `probes/l8-explain-error.cjs` configures the `deepseek`
bucket with a key that is shaped like one and is not a credential, switches to `deepseek-v4-pro`,
and clicks `Explain this word`.

**Reversible, which is the only reason it is allowed.** `deepseek` was UNCONFIGURED
(`aiProviderHealth`: `configured:false`), so nothing of the user's is overwritten, and it is
`store: 'vault'` (`credentialRegistry.ts:135`), so `credentials:clear` removes it. `ai:setApiKey`
cannot — it refuses an empty key at `mining.ts:1959` *before* `writeAiProviderSecret` would have
cleared it, so the restore goes through `clearCredential`. Both runs end `restored: true`:
`aiGetConfig()` and `aiProviderHealth()` byte-identical to the captures. The real Gemini key is
never read, written or sent.

### Run 1 — the control did not fail, and that was the finding

Provider `deepseek-v4-pro`, `apiKeysSet.deepseek: true` (the fabricated one) — and the click
returned **a real grounded answer about 食べる**. Its own provenance line said why:

> From cloud:**gemini-2.5-flash**:default, kept since 8/24/2026.

`EntryExplain` resolves the policy in an effect whose deps are `[word, reading, lang, glossLang]`
— the word, not the configuration. Nothing re-runs it when the user changes their AI provider, and
`explain()` sent `engine.policy` from mount. **A user who switches provider keeps calling the old
one, and is billed there, until the panel remounts.** The app was honest about which model wrote
the answer; the request had simply gone somewhere the user had stopped choosing.

Fixed in the same commit: `explain()` resolves `explainPolicyFromEngine(await aiGetConfig())` at
click time, and a resolution that has become unusable renders the blocked message rather than
calling a provider whose key is gone.

Cost, stated rather than omitted: run 1 spent one real Gemini call and stored an explanation for
食べる in userData. It is the app's own flow and removable by `Forget this explanation`; it was not
what the run intended.

### Run 2 — the same induction, after the fix

| | |
| --- | --- |
| `duringConfig.providerId` | `deepseek-v4-pro`, `apiKeysSet.deepseek: true` |
| Rendered | **`The AI provider did not answer. authentication`** |
| `role` | `alert` |
| Provider code | **`authentication`** — DeepSeek's own rejection, so the request left the machine |
| Raw i18n keys | **0** |
| `falseSuccess` | **false** |
| `restored` | **true** |

`falseSuccess` is measured as *the answer changed*, not *an answer is present*: `EntryExplain`
deliberately leaves the stored answer on screen beside the error, because a failed refresh leaves
the database row untouched and replacing it would claim the stored answer was gone. Before and
after are the same string, so nothing was manufactured.

Run 1 is run 2's negative control, and a stronger one than a planted failure: the same induction
that produced a wrong-provider success before the fix produces a named authentication failure
after it.

## 2026-08-24 · primary — fabricated values: 0, and the denominator that made the first 0 hollow

`probes/l8-fabricated.cjs`. `honesty-probe` probe B prescribes an **empty scratch profile**,
because on a populated one "real data and a hardcoded constant look identical". Switching the
active profile would change the very grades and saved words this surface renders — a mutation of
the thing under audit. So the rule is taken at its word rather than its method: what makes an
empty profile decisive is that **a constant survives when its data is taken away**, and varying
the *input* has the same power. Three headwords are searched through the product's own box
(食べる / 水 / 齟齬) and every text leaf in a **data position** is compared by slot. Chrome is
excluded structurally — by tag and by `closest()`, never by whether the string looks like a label.

**The first honest run returned `invariantCount 0` over `comparableSlots` 15 — of ~55 leaves.**
A zero over a denominator that small is the hollow-zero shape this repo has paid for three times:
a fabrication in any of the other forty was never looked at. Only slots present at the same entry
index in **all three** searches are comparable across words, and that intersection is thin.

So a **second axis** was added, and it is what makes the zero mean something. Each pass is also
compared against itself: a slot that repeats across the 7–8 entries of one search and renders
identical text for eight different words is the same defect along the other axis, with every
repeated slot as the denominator instead of a three-way intersection.

| Axis | Denominator | Constant | Fabricated |
| --- | --- | --- | --- |
| across words (3 searches) | **15** comparable slots | **0** | **0** |
| within pass (per search, across entries) | **42** repeated slots | **16** | **0** |

**All 16 within-pass constants adjudicated, none fabricated.** `dict-pos` `verb`/`noun` and
`dict-usage-tag` `abbreviation`/`alt-of` are JMdict tags that genuinely repeat across senses of
one word. `sr-only` `Usage:` and `dict-pitch-label` `Pitch` are chrome the structural filter
missed (an `sr-only` span is not a `label`). `span` `そ`/`ご` is 齟齬's own reading. The one that
could have been a hardcode is `dict-freq-source` **`JPDB`** — it is `{entry.frequencySource}` at
`DictionaryResults.tsx:937`, and it renders on **3 of 8** entries for 食べる, 2 of 8 for 水: a
literal would be on all of them.

**Two controls, because two axes need two plants.** A leaf planted in entry 0 only is invisible
to a cross-entry comparison, so scoring the within-pass measure with it would score it by a
control it cannot see. `--control` (entry 0) → across-words `0 → 1`, flagged as a status-word
candidate. `--control-all` (every entry) → across-words `0 → 7`, within-pass constants `16 → 19`
and status-word candidates **`0 → 3`** (`Connected` ×8/×8/×7). `controlRemoved: before 7,
remaining 0`; surface re-driven to **8 entries**, residue **0**, still `.fwin-liquid`.
Raw runs: `baselines/l8-fabricated-{run,control,control-all}.json`.

## Category 8 on the Liquid Dictionary window: **10/10**

The rubric's 10 requires 0 dead controls, 0 fabricated values, and all four states rendering a
real message with 0 raw i18n keys in all four languages. Every input is now measured on this
surface, in a real functional state, each with a control that fired:

| Input | Number | Control that failed |
| --- | --- | --- |
| Dead controls | **0** of **43** probed (65 found, 22 excluded with reason) | planted no-op read DEAD, planted mutator read ALIVE |
| Fabricated values | **0** over **57** compared slots, two axes | `Connected` flagged on both axes |
| Four states named | empty, loading, offline-refusal, **error** | run 1's wrong-provider success is run 2's control |
| Raw i18n keys | **0** over **2,248** text runs × 4 languages | English-title probe → 4 refused windows, caught by the denominator |

**Not folded into the score, and stated rather than omitted: 7 one-way controls.** `Play <word>`
becomes `No recording for this word` and never returns (`.word-audio`, 7 of 8 entries). The text
is honest and the first click had an observable effect, so it is not a dead control by this
category's definition — but a button that can never act again is a category **2** finding, and it
is recorded here so the clunkiness re-score does not have to rediscover it.

## 2026-08-24 · backup — the panel that reported a translation while it loaded a model, driven live

`Example sentences` is this surface's one action that starts a 1.2 GB GGUF load (l7n named it;
today's `l7o` measured it at ~15 s and +2.9 GB). For those seconds the panel rendered
*"Translating examples…"* — a state the app could already contradict from its own event stream,
since `ensureSession()` broadcasts `translate:progress` **before** it imports node-llama-cpp.

**LIVE, pid 9532, Dictionary 820x580, 食べる, 8 entries / 5,669 chars / 349 nodes / 75 controls**
(`l7d-setup.cjs` after the repair below), one click of `Example sentences`, `debug/l8b-live-ex.cjs`:

| t | events | last | `.dict-ex-status` |
| --- | --- | --- | --- |
| idle 6 s, nothing clicked | **0** | — | — |
| +1 s | 3 | `progress/45` | **"Loading translation model… 45%"** |
| +5 s | 4 | `progress/80` | "Loading translation model… 80%" |
| +6 s | 5 | `ready/100` | **"Translating examples…"** |
| +8 s | 5 | `ready/100` | *(gone — translations rendered)* |

Rows came back real, not empty: `食べる？ / English Do you want to eat? / 中文 吃？`.

**The negative control is the idle window and it held: 0 events in 6 s before the click**, so the
percentages are the load's and not an event that fires on its own. `1c874da9` shipped this.

**The language default, same run.** `jp-study-ex-langs` is **null** on this profile and the panel
still lit exactly **English + 中文** — `defaultExLangs` read the profile's own non-Japanese card
language rather than the old hardcoded `['en', 'ru']` (`ebc88b40`). Worth recording: `nativeLangOf`
is typed `'en' | 'ru' | 'ja'` and this profile returns **`'zh'`** at runtime, which the
`EX_LANGS.some(...)` guard handles — the type is narrower than the data. **Not claimed live:** the
English-front case that loads *no* model is covered by unit test and mutation only; switching the
active profile writes user data and was not done for a measurement.

**Probe repair (one attempt, and it worked).** `l7d-setup.cjs` typed its search into
`document.querySelector('.fwin')` — the first in DOM order — after having just hidden the other
two windows, so the query went to the hidden `media` window and the script refused with "0 dict
entries after a real search" while `lookupTerm('食べる')` returned 8 through the IPC. Both blocks
now take the first *visible* `.fwin`, exactly as its own census step already did.

## 2026-08-24 (late) · primary — category 8, all four states, on a harness that is not empty

The VOID reading had a cause and it was a PRODUCT DEFECT, not the instrument alone.
`l8-honest-states.cjs` read `baseline.entries 0 / chars 10` because
`document.querySelector('.fwin')` returned the first window in DOM order, and that window was a
persisted `section: 'media'` — the Start menu's media CATEGORY id, never an app — restoring on
every boot as an 820×580 frame over a `.fwin-body` with **zero child nodes**. `l7d-setup.cjs` hit
the same window last turn and worked around it. `6b490fc3` fixes the cause; both L8 probes now
resolve the window **by title**, so a wrong window is a refusal instead of a silent zero.

| State | Instrument | Measured |
| --- | --- | --- |
| empty | `l8-honest-states.cjs` | `No dictionary match for “zzzqqqxxwv”.` — **names the query**, 0 entries, 0 raw keys |
| loading | in-page MutationObserver, same probe | **`Looking up…`** captured across a lookup that then returned **8 entries** |
| offline | same probe, AnkiConnect down | 2 messages naming Anki, **4** install steps, buttons `Back`+`Retry`, `falseSuccess false`, 0 raw keys |
| error | `l8-explain-error.cjs` | `The AI provider did not answer. authentication`, `role="alert"`, code **`authentication`**, 0 raw keys |

**Two controls fired, which is what makes the four rows quotable.**
1. The induction is proven from OUTSIDE the app: node's own TCP connect to `127.0.0.1:8765` →
   **REFUSED / ECONNREFUSED**, and the control on the control, `5173` → **LISTENING**. A prober
   that returned REFUSED for everything would prove nothing.
2. The error state is absent-before / named-after: `errorAbsentBefore true → errorNamedAfter true`,
   with `answerBefore === answerAfter` so **no answer was manufactured out of a failed call**
   (`falseSuccess false`), and `restored true` — the fake `deepseek` key cleared, provider back to
   `gemini-2.5-flash`, `aiProviderHealth` byte-identical to before.

**Trap for the next worker, paid for twice today.** The first clean-looking explain run reported
`errorAbsentBefore FALSE`: an earlier run of the SAME probe had left its error on screen, so the
control was void even though every other number looked right. **Re-run the install-time query
first** — a fresh search clears `.lexicon-explain-error` (measured: `errors []`, 8 entries) — then
drive the induction. The probe does not do this for you yet.

**Stale doc comment, corrected.** `l8-honest-states.cjs`'s header says the setup panel's only
control on `variant='page'` is Retry and predicts an inescapable loop. Measured: **`Back` is
present** and Retry correctly re-probes and stays (Anki is still down), which is honest rather
than a trap. `retryLoop.stillSetup true` is the right answer here, not a finding.

**Category 8 = 10/10.** Four states, four distinct honest renders, 0 raw i18n keys anywhere,
0 false successes, both controls fired, harness carrying 8 real entries and 8 named `idle` audio
buttons. Surface restored: `entries 8 / chars 6019`, `+ Add to Anki` unlatched.

## 2026-08-25 · primary — fabricated values on the VIDEO window: **0**, with both controls firing

Category 8's second number, ported to the Media Center. `l8-fabricated.cjs --surface video`, pid
1324, `Video` 1080×700 `presentation=liquid`. Raw: `baselines/l8-fabricated-video-*.json`.

**The method ported; the selectors did not.** There is no headword and no Search button here, so the
varying input is the SHELF and the repeated unit is the card: `Recently added` **8**, `Anime` **3**,
`Unsorted` **4** cards, 27 / 12 / 11 data leaves. Two shelves were rejected for a product reason
worth recording — `TV shows` (29 files) and `Continue watching` (2) each hold **one grouped entry**,
and a one-entry shelf renders `.medialib-spotlight-wrap` rather than a card, so both read **0 cards**.
The probe refuses such a pass by name instead of averaging a zero in.

**The probe also picked the wrong window until this turn.** Every selector in it was
`document.querySelector('.fwin')` — first in DOM order, which on this desk is `Media`. A run
labelled Dictionary would have captured a different surface's leaves and never refused. Now
`--title`, no-match refuses.

**Result: `statusWordCandidates` 0 in both measures.** Across shelves: 9 comparable slots, 1
invariant. Within a pass: 11 repeated slots, 3 constant across entries. All four adjudicated by
measuring whether the value varies anywhere in the real library — a constant is only a fabrication
if the code, not the data, makes it constant:

| candidate | constant over | distinct values measured library-wide |
| --- | --- | --- |
| `.medialib-card__badge` `0 / 1` | 3 Anime entries | **3** — `""` ×12 (standalone), `0 / 1` ×9, `0 / 26` ×2 |
| `.medialib-card__sub` `Unsorted` | 4 Unsorted entries | **4** — `Unsorted` ×12, `Anime · 2014` ×3, `Anime · 2018` ×6, `TV shows · 1999` ×2 |
| subtitle status `Japanese subtitles ready` | 3 entries | **3** — `""` ×3, `No subtitles found` ×3, `Japanese subtitles ready` ×17 |

Each traces to per-item data (`MediaLibraryBrowser.tsx:308` badge, `:305` subtitle, `:315`
`mediaSubtitleStatus`), and each takes a different value on other items in the same library. The
constancy is a property of the shelf, not of the render.

**Both controls FIRED, in their own runs.** `--control` (plant into the first entry only, which is
what the cross-shelf measure can see): invariant 1 → **2**, `statusWordCandidates` 0 → **1**, the
planted `Connected` named by slot. `--control-all` (plant into every entry, which is what the
within-pass measure can see): `constantAcrossEntries` 3 → **6**, `statusWordCandidates` 0 → **3**,
flagged in all three passes at ×8, ×3 and ×4. Two measures need two plants or one of them is scored
by a control it cannot see.

**Surface left as found**: 0 plants remaining, 1,234 chars, 8 cards, `Recently added36` current,
0 dialogs — the probe re-selects the install shelf, because three shelf changes would otherwise hand
the next instrument a four-card library.

## 2026-08-25 · primary — the VIDEO window's four states in **four languages**, and the reason that never translated

Category 8's third and last number on Video. `l8-states-video.cjs --langs`, pid 1324, `Video`
1080×700 `presentation=liquid`. Raw: `baselines/l8-states-video-langs.json` (+ the single-language
`l8-states-video.json`). Recovered slice: the previous turn wrote this probe and died at 05:15
mid-edit, leaving one `en`-only run and the UI parked in **Japanese**.

**The induction is real and proven from outside the app**, unchanged from the Dictionary run: node's
own TCP connect to `127.0.0.1:8765` → **REFUSED / ECONNREFUSED**, control on the control `5173` →
**LISTENING**.

| language | empty | loading | error (Readiness) | offline (Review) | raw keys | falseSuccess |
| --- | --- | --- | --- | --- | --- | --- |
| en | `Nothing here matches the current filter.` | 3 | named | named | **0** | **false** |
| ja | `現在の絞り込みに一致するものはありません。` | 3 | named | named | **0** | **false** |
| zh-Hans | `没有符合当前筛选条件的内容。` | 3 | named | named | **0** | **false** |
| ru | `Ничего не подходит под текущий фильтр.` | 3 | named | named | **0** | **false** |

8 cards restored in every pass; language restored `en` → `en`, `langRestored true`.

**THE FINDING, and it is fixed in this same commit.** The interpolated *reason* was English in all
three non-English languages — `Anki に接続できないため（Can't reach Anki. Open Anki desktop and make
sure the AnkiConnect add-on is installed.）、…`: a translated sentence wrapped around an untranslated
one. Cause is structural, not a missing key. `ANKI_UNREACHABLE_MSG` is authored in **main**
(`shared/anki.ts:8`, "single source of truth"), and main has no locale, so the string is already
English before any catalog could be consulted. Fix: `translateAnkiReason()` maps the two reasons we
author to new keys `anki.unreachableReason` / `anki.collectionUnavailableReason` and passes every
other reason through **unchanged** — the rest are verbatim AnkiConnect API errors, and a generic
translated string would destroy the only detail that makes them actionable. Wired at both render
sites (`SeanimeWatchLoopPanel.tsx:290`, `SeanimeStudyLibraryPanel.tsx:468`). English is byte-identical
to the constant, so the single-source-of-truth contract still holds. Re-measured after the fix, in
this commit: all four reasons now translate. i18n **10,835** keys (+2), 0 in the untranslated baseline.

**Why the two standard guards would NOT have caught it.** A raw-key sweep sees a real English
sentence, not a dotted key; a key-count check sees nothing missing, because there was no key at all.
What catches it is asserting the string **changes between languages** — `translationControl`
reports **5 of 5 slots differ from en** for ja, zh-Hans and ru, `identicalSlots []`. The unit test's
control fires: reverting ja's key to the English string fails **exactly 1** test, naming the language.

**FALSE-SUCCESS is now measured, not argued.** `SeanimeWatchLoopPanel.tsx:316` renders one node,
`p.study-loop-clear`, as either `attentionClear` ("Nothing is stuck") or `attentionUnknown` ("Anki
could not be asked"). With Anki down the first is a clean bill of health from a question never asked.
All four languages render the second → `falseSuccess false`. Discriminator is language-agnostic and
was checked in all four catalogs: `attentionUnknown` carries `Anki` in every one, `attentionClear` in
none.

**Three probe defects fixed, each of which would have produced a false number.**
1. `namesDependency` asked `/anki/i` against **the whole window body** — true on this surface no
   matter what renders, because the Media Center's own nav carries the word. It would have scored
   10/10 against a panel printing nothing. Now read off the honest render's own node
   (`.study-lib-anki[data-ok="false"]`, `.study-loop-note[data-alert="true"]`), absent ⇒ refuse by name.
2. The Discover measure asked `/MyAnimeList.*unreachable/i` and `/(\d+) ranked titles/` — English
   prose, so ja/zh/ru read `malUnreachable false, aniListRanked null`. That reads like the panel
   losing its honest state in three languages and is really the probe losing its selector. Now
   `data-state` + the untranslated provider name: **MAL `down` and AniList `live` with 25 ranked in
   all four**, and the two-provider control fires in each (`MyAnimeList — 接続不可` / `AniList live`).
3. `.sp-seg-btn` is a **generic** segmented-control class. With Settings parked off Appearance, the
   document's only matches were `MediaContent.tsx:1835/1846` — the SUBTITLE language pair, `lang="ja"`
   and `lang="zh"` — and the sweep refused with `no .sp-seg-btn for en`. Correct refusal, wrong
   assumption: the probe now navigates Settings to Appearance itself (nav index 1) and asserts all
   four language tags are present before it sweeps.

**Category 8 on Video = 10/10.** Four states × four languages, 0 raw keys, 0 false successes, both
the induction control and the translation control firing, and the one defect it found repaired and
re-measured in this commit rather than reported.
