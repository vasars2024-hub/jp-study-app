# L1 — category 8's four-language half: 0 raw i18n keys, and the zero that was almost fake

Authority: `src/LIQUID_UI_RUBRIC.md` category 8 — *"0 raw i18n keys in all four languages"*.
Instrument: `probes/l1-raw-keys.js`, driven by `debug/l1-lang-sweep.cjs`. Closes the limit
`L1_HONEST_STATES.md` named as **"One language, not four."**

## The number

**0 raw i18n keys, in all four languages**, over **2,248 rendered text runs** per language,
across **5 windows + the whole document**, with **0 refused windows** and the surface in a real
functional state (**8 `dict-entry` results** for 食べる, live in every pass).

| lang | `<html lang>` | stored | text runs | windows / refused | dict entries | raw keys |
| --- | --- | --- | --- | --- | --- | --- |
| en | `en` | `en` | 2,248 | 5 / **0** | 8 | **0** |
| ja | `ja` | `ja` | 2,248 | 5 / **0** | 8 | **0** |
| zh | `zh-Hans` | `zh` | 2,248 | 5 / **0** | 8 | **0** |
| ru | `ru` | `ru` | 2,248 | 5 / **0** | 8 | **0** |

The switch is proven to have reached the **rendered** surface, not just the `<html>` attribute:
window titles read `Scraper / スクレイパー / 抓取器 / Скрапер` and `Dictionary / 辞書 / 词典 /
Словарь` in the four passes. `Anki` stays `Anki` in all four — a proper noun, correctly untranslated.
Driven through the product's own control (Settings → Appearance `.sp-seg-btn`), not by writing
`localStorage` and reloading, because `setUiLang` only lands when the language's catalog chunk
resolves — and a reload would have destroyed the 8 results the sweep exists to measure.
**Language restored to `en` and verified equal to the captured `before` on both `<html lang>` and
`localStorage['ui-lang']`.**

## Why this is not redundant with `tools/i18n-check.cjs`

`i18n-check` compares the four catalogs **against each other**. A key that no catalog has is
missing from all four equally and passes it — and that is precisely the case where
`translate()` renders the dotted key at the user (`shared/i18n/core.ts:94`, *"Not in English
either — show the key"*). A rendered scan is the only instrument that can see one. The gate
was green at **10,447** keys the whole time.

Corollary worth banking: because English is the fallback, a key present in `en` but missing from
`ja` renders **English**, not a key. So this number is a raw-key count, **not** a translation-
coverage number, and it must not be read as one.

## The negative control, run twice — and it failed in both directions

`probes/l1-raw-keys-control.js` plants three things in the Dictionary window:

| Plant | Expected | Observed |
| --- | --- | --- |
| text node `settings.language.title` | found | **found** |
| `placeholder="dictionary.search.placeholder"` | found | **found** |
| `display:none` text `settings.storage.title` | **silent** | **silent** |

A probe that reported 3 would be over-reporting as badly as one reporting 0 — an unpainted key
does not reach a user. Cleanup removed 3 of 3, `remaining: 0`, and the post-cleanup sweep is back
to **0 candidates / 0 refused / 8 entries**. The control was re-run **after** the probe rewrite
below; the pre-rewrite run does not license the post-rewrite number.

## The trap this slice actually banked: a zero on four refused windows

The first version of the probe addressed windows by **English title text**
(`.fwin-title-text` `.includes('Dictionary')`). That is correct exactly once. The moment the
sweep switched the UI language, every title became 辞書 / 设置 / Настройки, and four of five
lookups returned `no .fwin with that title`. The run printed:

```
ja  htmlLang=ja  stored=ja  candidates=0  runs=1205
```

**`candidates=0` — on a sweep where Dictionary, Media, Scraper and Settings were never read.**
That zero is byte-identical to a clean pass. It survived only because the probe also sweeps the
whole document, and the drop from 2,248 runs to 1,205 was the only visible tell.

Fixed by addressing windows by **DOM index**, reporting the current title as *data*, and hoisting
`refusedWindows` and `dictEntriesLive` to the top level of every result so a refusal cannot hide
behind a score. Generalised: **a probe keyed on any user-visible English string cannot be used in
a sweep that changes the language** — and the denominator is what caught it, which is why
`textRuns` is reported next to every zero.

## What category 8 still lacks

- **Offline** (a timeout, distinct from `L1_HONEST_STATES_CONTROL.md`'s refusal) — undriven.
- **Dead-control count** over all 54 Dictionary controls with a side-effect assertion each.
- **Fabricated-value count** — needs an empty scratch profile; on a populated one, real data and
  a hardcoded constant are indistinguishable.

Category 8 is therefore still **not a 10**, and `LIQUID_SCORECARD.md` stays empty.

## 2026-09-03 (primary) — the raw-key class gets a STATIC gate, and it was already off zero

Category 8 measures `rawKeyCount` on a **rendered** surface, so a key only counts once a worker
drives the surface that renders it. Every unvisited surface scores an implicit zero. The static
half of the same question — *does the text the app asks for exist at all?* — turns out to have had
a tool and no caller since 2026-08-04.

**`tools/i18n-missing-key-check.cjs` had no caller.** `grep -rn` over the repo returned the tool
and nothing else: no npm script, no test, no gate list, no doc. Its own header declares it a hard
zero with no baseline. It is also the only check that can see this class — `i18n-check` compares
the four catalogs *against each other*, so a key absent from all four is absent from both sides of
every comparison and passes; `i18n-hardcoded-check` skips any file that adopts i18n at all.

It had drifted. `DeckWorkbenchTray.tsx:1289` asked for `ankiWorkbench.tray.stale.mode`, which is
the PREFIX of the two option keys under it, not a key — the label's own key is `modes`. Since
`translate()` returns the key on a total miss (`core.ts:94`), the literal ASCII
`ankiWorkbench.tray.stale.mode` rendered above that select in JA, ZH and RU too, while the four
translations written for it sat unreachable. Fixed at `428908b4`; guard at
`src/shared/__tests__/i18nMissingKeys.test.ts`, which imports `scan()` rather than reimplementing
it. Mutation control: call site back to `stale.mode` → 1 failed, naming file and key; restored
byte-identical. Instrument before/after: 1 offender → 0.

`7970c446` then widened `SCAN_DIRS`, which had covered `src/main` the DIRECTORY and therefore
missed `src/main.ts`, `src/preload.ts` and all of `src/shared` — where CLAUDE.md says the
key-storing registries live. Measured **before** widening: 437 unscanned files, **0** offenders
(`credentialRegistry.ts` 23 real keys, `assetRegistry.ts` 1, zero dotted strings that are not
keys), so it is a ratchet, not a fix. Scan is now 1,510 files / 19.5 MB, 8.4 s standalone.

### Four adjacent classes measured the same day, all CLEAN — recorded so nobody re-derives them

- **Dynamic keys**, the documented blind spot of the check above. 344 sites in the two dynamic
  forms — a template literal `t(...)` interpolating a prefix, and `t('prefix.' + x)` — and **0**
  prefixes match no catalog key. An anchored arm-level pass (pair a
  prefix with a same-file literal array/union only when ≥1 arm resolves) gave 28 hits and **all 28
  are false**: cross-pairings between unrelated arrays in one file, or `all`/`none` arms already
  guarded at the call site — the `all` arm takes its own literal key in a ternary and never reaches
  the dynamic form at all. Precision is too low to gate; do not wire it.
- **Interpolation slots across catalogs.** 12,250 keys × ja/zh/ru: **2** disagreements on **1** key,
  `filesApp.watch.arrived`, and it is correct — ja/zh have only the CLDR `other` category, so the
  `one` form's `{name}` has nowhere to live. LEAD, not a defect: the JA/ZH user never learns *which*
  file arrived. Fixing it is a copy redesign (the `other` form would have to carry the name), it is
  files-app copy, and it was left alone.
- **`t('key')` with no vars over a slotted value.** `interpolate` returns the template untouched
  when `vars` is undefined (`core.ts:58`), so every slot would reach the user as literal braces.
  **6** sites, **all intentional**: this app's own Anki/template syntax uses braces, so
  `{expression}`, `{face}`, `{term}`, `{pitch}`, `{placeholders}` are content. Needs an allowlist to
  gate; not worth it.
- **Plural values called without `count`.** 278 plural-forms keys, 231 referenced by a literal call,
  **0** real hits — the 6 the first pass reported were my regex requiring `count:` and missing the
  `{ count }` shorthand. Instrument error, withdrawn.

**Trap for the next worker.** An earlier hypothesis here was that the check's 53 s cost was an
O(n²) comment-strip regex. It is not, and that is withdrawn: the two strip regexes are **8 ms and
37 ms for the whole tree** and the esbuild catalog bundle is 587 ms — the entire cost is reading
1,510 files on this machine (8.4 s warm, ~53 s cold). Charge it to a `beforeAll`, the shape
`deletedPlayerDependents` adopted after boss-audit Finding 7; do not try to optimise the regex.
