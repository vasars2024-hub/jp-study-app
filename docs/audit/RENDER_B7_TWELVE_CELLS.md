# B7 live render pass — the 12 surviving cells

**Run:** 2026-08-04 by the orchestrator, on a fresh scratch profile, while both fleet accounts
were rate-limited. Measures `CENSUS_BOXES.md` §3's 12 cells against their stated predictions.

## Method, and its one real limitation

Six of the twelve families (`ui-dialog`, `ui-glass-card`, `ui-menu`, `ui-notification`,
`ui-toast`, `ui-window`) are the `ui.css` primitives B7 found have **zero consumers**, so they
never render naturally. All twelve were therefore measured by **injecting a synthetic `<div>`
carrying the class, reading its computed style, and removing it in the same evaluation**.

> **Stated limitation:** a synthetic element outside its real parent context does not inherit
> contextual selectors. `os-start-app-ic` measured **2 cues (b1 f0 s1)** rather than the census's
> 3 — most likely its fill arrives from a contextual rule a bare `<div>` never matches. **That row
> is unmeasured by this pass, not refuted.**

## The control — run first, and it is the whole story

Because all twelve cells returned identical counts in both themes, and *a number invariant across
the input it claims to depend on is measuring something else*, the theme switch was verified
before any result was believed:

| token | default | `high-contrast` |
|---|---|---|
| `--bg` | `#0d0c12` | **`#000000`** |
| `--text` | `#f5f4f7` | **`#ffff00`** |
| `--glass-highlight` | `color-mix(… rgba(255,255,255,.55) 40% …)` | **`transparent`** |
| `--shadow-card` | `0 2px 12px rgba(0,0,0,.22)` | **unchanged** |
| `--shadow-toolbar` | `0 1px 4px rgba(0,0,0,.16)` | **unchanged** |

The switch works. Three tokens move. **Two do not — and those two are exactly the ones the
census's predictions depended on.**

## THE FINDING — `high-contrast` cannot remove its own shadows

`CENSUS_BOXES.md` §3 records that `high-contrast` sets `--shadow-card: none` and
`--shadow-toolbar: none` (`a11y.css:69`), and predicts rows 1–3 drop 3 cues → 2.

**At runtime neither token changes.** `osPersonalization.applyPersonalization()` emits
`--shadow-card` and `--shadow-toolbar` **inline on `<html>`** from the user's SHADOW preset — the
running app carries `data-shadow=soft` — and **an inline style beats any stylesheet rule,
including `:root[data-theme='high-contrast']`.**

So the a11y stylesheet's attempt to strip shadows is **inert**, and `a11y.css:66-68`'s own comment
— *"The high-contrast theme must not rely on translucency/blur (they wreck…)"* — describes an
intent the cascade defeats.

**This is the same defect class already on record** in `USER_VERIFICATION_CHECKLIST.md` item 3,
where a `--accent-2` fix was proved inert because `osPersonalization.ts:116` writes that property
inline too, so *"a light theme cannot fix its own accent from a stylesheet."* It is now confirmed
to affect **`high-contrast`'s shadow suppression** as well. The personalization layer silently
overrides theme intent for every property it emits.

## Results against prediction

| # | family | predicted | measured | verdict |
|---|---|---|---|---|
| 1 | `.buddy-toast` | 3 → 2 | **3 → 3** | **FALSIFIED** — `--shadow-card` never changes |
| 2 | `.os-companion-menu` | 3 → 2 | **3 → 3** | **FALSIFIED** — same cause |
| 3 | `.os-start-app-ic` | 3 → 2 | **2 → 2** | **UNMEASURED** — synthetic injection misses its fill |
| 4 | `.os-qs-tile` | 3 → 2 | **3 → 3** | **PARTIAL** — `--glass-highlight` *does* go `transparent`, so the shadow paints nothing, but the declaration is not `none`. Visually the prediction holds; a cue-count instrument cannot see it |
| 5–12 | `.os-flyout`, `.os-start`, `.ui-dialog`, `.ui-glass-card`, `.ui-menu`, `.ui-notification`, `.ui-toast`, `.ui-window` | no change | **3 → 3** | **CONFIRMED**, 8 of 8 |

**Net: 8 confirmed, 2 falsified, 1 partial, 1 unmeasured.** The algebra was right about what the
stylesheets *say* and wrong about what *wins* — which is precisely the gap a live pass exists to
close, and the reason the 12 cells were kept on the list rather than argued away.

## A second instrument limitation, stated

The cue detector counts `box-shadow` as a cue whenever it is not the literal string `none`. **A
shadow whose colour resolves to `transparent` paints nothing but still counts.** Row 4 is the case
where that matters. A stricter detector would parse the colour out of each shadow layer; this one
does not, and every row above should be read with that in mind.

## Consequences

- **`CENSUS_BOXES.md` §3's rows 1–3 predictions should be marked falsified**, not silently dropped.
- **The §8 cue count is invariant across all 13 base themes** — confirmed, but for a *different
  reason* than the census gave: not because the overrides are harmless, but because two of the
  three flip tokens never reach the element at all.
- **A new FIX-register row:** `high-contrast` does not suppress shadows as its own stylesheet and
  comment intend. The fix belongs in the personalization layer, not in `a11y.css` — the same place
  the `--accent-2` fix was found to belong, and it has never been attempted there either.
