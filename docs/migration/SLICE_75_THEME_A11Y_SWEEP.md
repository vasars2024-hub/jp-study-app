# Slice 75 — theme accessibility sweep

**Measured by:** `claude-primary` (the coordinator), with three runs from `claude-backup`.
**Build:** `out/jp-study-app-win32-x64/jp-study-app.exe`, packaged 2026-08-03 12:11 and verified
current. **Gate:** `docs/migration/tools/packaged-a11y-deep-gate.mjs`, one run per theme through the
`sweep-theme-a11y.mjs` wrapper. Proof: `docs/migration/proof/packaged-a11y-deep-sweep-<theme>/`.

## How this slice was staffed — two corrections to the plan

1. **The first attempt measured nothing and was right to say so.** `claude-backup` had **five of
   five** gate invocations refused by its permission layer and reported all 13 themes `UNTESTED`
   rather than inventing numbers. It diagnosed the cause correctly: a `RUN_STAMP=x node …` prefix
   makes a different command string than an allow-rule matches. `sweep-theme-a11y.mjs` exists now so
   one allow-rule covers the whole sweep and each run gets a unique per-theme stamp.
2. **`claude-backup` was stood down mid-run at the user's request.** The coordinator finished the
   remaining themes itself. `soft-sepia`, `ocean-blue` and `wired-archive` are backup's runs under
   the fixed gate; every other row is the coordinator's.

## The instrument was broken first, and it broke toward manufacturing findings

Step 0a decided "the theme applied" with `storedId === THEME && !!theme.materials`.
**`data-materials` is only stamped for themes declaring a `materialSet`** (`engine.ts:127`), and
**no base theme declares one**. The check had only ever run against `frutiger-aero`, which has one.

`classic-light` applied *perfectly* — `data-theme="classic-light"` on `<html>` — and step 0a
reported FAIL and **threw**, aborting after 4 of 19 steps. Unfixed, this would have produced
**twelve phantom theme-application failures** in a sweep whose whole purpose is finding real ones.

Re-based onto `data-theme`, which `applyTheme` sets to the resolved theme's id (`engine.ts:150`) and
*removes* for the default (`:148`); an unregistered id falls back to the default (`:145`), so a typo
still cannot pass — the guard's real purpose. `storedId` is checked beside it because
`loadThemeId()` returns the default for an unregistered id, so localStorage can hold a typo while
the screen shows the default palette.

> **`claude-backup` reached the same diagnosis independently, from source, while it was blocked from
> running anything** — including proposing `storedId === THEME && themeAttr === THEME` verbatim and
> flagging the `study-os` caveat (the default *removes* `data-theme`, so an explicit
> `--theme=study-os` would fail the new assertion). That caveat is handled: the fix branches on
> `isDefaultTheme` and expects `themeAttr === null` for the default. A worker that could not measure
> anything still produced the most useful paragraph of its run.

**Both branches of the fix are verified at runtime, not reasoned about** — an untested branch in a
gate is exactly what this track punishes:

```
--theme=classic-light  PASS 0a  {"storedId":"classic-light","materials":null,
                                 "themeAttr":"classic-light","expectedThemeAttr":"classic-light"}
--theme=study-os       PASS 0a  {"storedId":"study-os","materials":null,
                                 "themeAttr":null,"expectedThemeAttr":null}
```

Both runs completed all 19 steps with exit 0
(`proof/packaged-a11y-deep-verify-0a-fix/`, `…-verify-default-flag/`).

**There are fifteen themes, not twelve:** 13 in `BASE_THEMES` (`engine.ts:70-82`) plus
`frutiger-aero` and `wired-archive`, both registered at renderer boot (`main.tsx:175-176`).

---

## Results

`B1 real` = below AA **excluding** inactive controls exempt under 1.4.3.
`B2 lb` = load-bearing boundaries below 3:1 — the ones that carry the verdict.
B1's gate verdict is the string `MEASURED`, never PASS/FAIL: it is three numbers, not a verdict.
**Denominators are the point of this table.**

| theme | light? | A2 tab | B1 real / belowAA / samples | B2 lb (below/scored of seen) | B3 ring (below/measured) | verdict |
|---|---|---|---|---|---|---|
| `study-os` (default) | dark | 121/121 | **0** / 4 / 336 | **0** (68/107 of 234) | 0/52 | **PASS** |
| `dark-nebula` | dark | 123/123 | **7** / 11 / 346 | **0** (69/108 of 236) | 0/54 | **PASS** |
| `classic-light` | light | 121/121 | **16** / 20 / 344 | **16** (84/107 of 234) | 0/52 — **3.41:1, marginal** | **FAIL B2** |
| `ocean-blue` | light | 121/121 | **23** / 27 / 343 | **16** (84/107 of 234) | 0/52 | **FAIL B2** |
| `paper` | light | 123/123 | **64** / 68 / 346 | **16** (85/108 of 236) | 0/54 | **FAIL B2** |
| `mint-green` | light | 121/121 | **90** / 94 / 335 | **16** (84/107 of 234) | 0/52 | **FAIL B2** |
| `rose-pine` | light | 123/123 | **166** / 170 / 309 | **16** (82/100 of 222) | 0/54 | **FAIL B2** |
| `soft-sepia` | light | 121/121 | **174** / 178 / 343 | **16** (84/107 of 234) | 0/52 | **FAIL B2** |
| `high-contrast` | dark | 121/121 | **0** / 4 / 314 | **0** (22/99 of 220) | 0/52 | **PASS** |
| `oled-black` | dark | 121/121 | **0** / 4 / 335 | **0** (68/107 of 234) | 0/52 | **PASS** |
| `cyberpunk` | dark | 121/121 | **0** / 4 / 314 | **0** (65/99 of 220) | 0/52 | **PASS** |
| `forest-night` | dark | 121/121 | **0** / 4 / 335 | **0** (68/107 of 234) | 0/52 | **PASS** |
| `midnight-ink` | dark | 121/121 | **7** / 11 / 335 | **0** (68/107 of 234) | 0/52 | **PASS** |
| `frutiger-aero` | light | 128/128 | **0** / 2 / 129 † | 0 (**8 of 251** — vacuous) | 0/4 † | see † |
| `wired-archive` | dark | 123/123 | 1 / 3 / **90** ‡ | 5 (16/**18** of 246) ‡ | 0/5 ‡ | **FAIL B2**, see ‡ |

**All 15 registered themes are now measured.** Every run reached 121–128 Tab stops with full
coverage (A2 PASS everywhere) and every focus ring passed 3:1 — so keyboard reachability and ring
visibility are *not* theme-dependent. Contrast is.

### The headline: every light theme fails, and it is the same 16 boundaries every time

Six light themes, six failures, **`lb = 16` in every single one**, against the dark default's **0**.
That is not six independent bugs — it is one palette decision that does not survive a light
background, exactly as slice 72 predicted from `frutiger-aero` alone.

Text contrast degrades along the same axis and far less uniformly: `soft-sepia` has **174 real
failures of 343 samples** — more than half the painted text below AA — while `classic-light` has 16.

**The focus ring is one colour on every theme**, `rgb(255,46,77)`. On the dark default it measures
4.8–5.4:1; on `classic-light`'s white it drops to **3.41:1** — still passing, with almost no margin.

### † `frutiger-aero` — the fixes landed, but its CSS numbers are near-vacuous

Slice 72's four colour changes **worked**: aero's text went from *24 real failures* to **0 real of
129**, and its focus rings from *4 of 4 below 3:1* to **0 of 4**. That is a genuine repair.

But aero's B2 "PASS" is on **8 of 251 controls**, and its B3 on **4 ringed stops** against the
default's 52. Aero's boundaries are translucent, so the CSS path finds nothing to score on 243 of
251 controls. **That is an absence, not a pass** — the gate's own slice-72 note says exactly this.

### ‡ `wired-archive` — 77% of its text could not be measured by the CSS path at all

Its row looks mild (1 real failure of 90 samples) and it is not. `wired-archive` paints almost
everything on a **`background-image`** — a CRT/texture aesthetic — and the CSS measurer cannot
resolve a single backdrop colour behind one, so it declares those samples **unmeasurable**:

- **303 of 393 text samples unmeasurable** (`background-image on div.os-taskbar`,
  `on div.fwin-bar`, `on div.ui-menubar`, `on section.fwin.focused`, …)
- **223 of 246 controls unmeasurable**; only **18 scored**

It swept all 8 surfaces with 123 keyboard stops, so this is **not** low surface coverage — it is a
theme the CSS instrument structurally cannot read.

---

## The pixel sampler is the instrument that works, and it fails everywhere it runs

With `--pixels`, the painted-pixel step **B2p** scores what the CSS path cannot, and it FAILS on
every theme it has been run against — **including the default**:

| theme | CSS **B2** load-bearing | pixel **B2p** scored | B2p below 3:1 | **B2p load-bearing** (both readings) |
|---|---|---|---|---|
| `study-os` (dark, default) | **0** (107 of 234 scored) — PASS | **206 of 234** | 184 | **66** — `identity` 48, `state` 18 |
| `soft-sepia` (light, worst) | 16 (107 of 234 scored) — FAIL | **206 of 234** | 174 | **67** — `identity` 48, `state` 18, `affordance` 1 |
| `frutiger-aero` | 0 (**8 of 251** — vacuous) | **231 of 251** | 207 | **8** — `identity` 8 |
| `wired-archive` | 5 (**18 of 248**) | **216 of 248** | 179 | **57** — `identity` 48, `affordance` 9 |

The sampler self-tests **29/29 offline assertions** (PNG codec pixel-exact, WCAG maths, scale
detector) before any of this is believed.

> **This is the sharpest result in the slice, and it reframes everything above it.**
>
> Measured from painted pixels, the **dark default (66)** and the **worst light theme (67)** have
> essentially the **same** load-bearing failures — the *same* `identity: 48`, the *same* `state: 18`,
> differing by a single `affordance`. `identity: 48` also appears in `wired-archive`, a third
> completely unrelated palette.
>
> So the 1.4.11 problem is **one structural problem in the same chrome controls (taskbar, tray,
> nav), present on every theme, worth ~66 load-bearing controls** — and the tidy light-fails/
> dark-passes split that the CSS path reports (16 vs 0) is largely an artifact of **which controls
> happen to declare a CSS boundary**, not of where the real failures are. The CSS path scores 107 of
> 234 and calls the remaining 126 "boundary-less"; the pixel path scores 206 of the same 234 and
> finds they paint something after all.
>
> **Practical consequence: fixing only the light palettes would fix the CSS number and leave most of
> the real defect in place, on every theme including the default.**

> **Do NOT quote `textPixelContrast` as a text-contrast finding.** The gate labels it
> `HYBRID and deliberately weaker than B2p`: only the backdrop is sampled from pixels, because
> reading glyph colour off an antialiased screen biases every result in whichever direction the
> hinting went. **B1 remains the authoritative text number.**

## Recommendations — as recommendations, with numbers, not as patches

Nothing here was fixed. A token change on this track means nothing until it is rebuilt and
re-measured, and that is more than this run could honestly close out.

1. **The 16 load-bearing boundaries shared by all six light themes are one fix, not six.** Find the
   boundary token that resolves against `--panel`/`--bg` and give light palettes their own value.
2. **The focus ring needs a light-palette value.** `rgb(255,46,77)` at **3.41:1** on white has no
   margin; the same token reads 4.8–5.4:1 on dark.
3. **`soft-sepia` and `rose-pine` need a text-colour pass before anything else** — 174 and 166 real
   failures. They are the two worst surfaces in the app by a wide margin.
4. **Run `--pixels` on every theme from now on**, and treat a CSS-only B2 PASS on a translucent or
   `background-image` theme as **UNMEASURED**, not as a pass.
