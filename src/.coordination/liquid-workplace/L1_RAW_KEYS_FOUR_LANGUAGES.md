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
