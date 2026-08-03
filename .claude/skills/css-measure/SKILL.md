---
name: css-measure
description: >
  Get true numbers when measuring contrast, layout or box treatment in
  jp-study-app. Use when checking WCAG contrast or a contrast ratio, measuring
  hit-target or touch-target size, sampling painted pixels, reading computed
  styles or getBoundingClientRect, testing a responsive or narrow layout,
  auditing a theme or comparing themes, checking focus rings or borders, or
  whenever a colour, spacing or box number is about to be reported. Every
  correction here has already produced a false finding in this repo.
---

# Measuring colour, layout and box treatment without inventing findings

Use `jp-bridge` to drive and read. Use this to decide whether the number it gave you is true.
Report findings in the row schema defined in **`honesty-probe` §5** — this skill does not define
its own.

Every item below **has a measured track record of producing false findings in this repo.** Two of
them each produced a headline finding that was, on re-measurement, zero. They are not hypothetical
and they are not style advice.

Facts verified against source on 2026-08-03 at `1d30324`. Re-measure anything numeric before
quoting it.

---

## 0. The governing check — run it before you report anything

> **A contrast defect moves with the palette. A number that does not move when the palette changes
> is not measuring contrast.**

This single test invalidated a headline finding of **66 load-bearing 1.4.11 failures on the default
theme. The true number was 0.** Same packaged build, same flags; only the measurer changed
(`SLICE_77_B2P_CORRECTION.md:1-15`, `:112-116`).

**The tell was in the report before any code was read.** `identity: 48` came back byte-identical on
the dark default and on `soft-sepia` — two palettes with nothing in common. That was written down
as evidence the defect was *structural rather than a light-palette problem*. It was stronger
evidence than that, in the opposite direction: **48 = 6 controls × 8 surfaces.** The count was a
property of the page structure and contained no colour at all (`:18-28`).

So: **measure your contrast number on two palettes before you report it.** If it does not move,
you are counting elements, not measuring contrast.

---

## 1. `color-mix()` computes to `color(srgb …)`, and the channels are 0..1

Chrome computes `color-mix()` — which this app uses everywhere — to `color(srgb r g b / a)`.
**Components are 0..1, unlike `rgb()`.**

A parser that reads them as 8-bit sees every mixed colour as **nearly black**. The recorded case:
after `.anki-setup-msg` was fixed with `color-mix()`, the probe reported its contrast had *fallen*
from 3.07 to **1.38**. The value was `color(srgb 0.87 0.49 0.50)`. **The real ratio is 5.33:1 — the
fix worked and the instrument was wrong** (`UI_UX_AUDIT.md:425-429`).

**There is a second, quieter failure mode for the same construct, and it is worse.** A parser that
handles `rgb()`/`rgba()` and simply *fails to match* `color(srgb …)` scores that boundary as
**ABSENT rather than weak** — a silent null, indistinguishable from a clean bill of health. B3
(focus-ring visibility) had been reporting PASS off **2 stops out of a real population of 52**, and
**23 of them were failing** (`NEXT_SESSION.md:1159-1165`, `:1183-1184`).

**Also strip the colourspace token before matching numbers — `display-p3` contains a digit**
(`UI_UX_AUDIT.md:430-431`).

Working reference parser, in the shipped gate:
`docs/migration/tools/packaged-a11y-deep-gate.mjs:312-322`.

```js
const cs = String(s).match(/color\(\s*srgb\s+([^)]+)\)/);
// q[0..2] are 0..1 -> multiply by 255. q[3] is alpha if present.
```

**Check your parser against a positive control before you trust a run**: feed it a known
`color-mix()` value whose true ratio you computed by hand, and confirm it comes back right. A
parser that silently returns null passes every test that only checks it did not throw.

## 2. WCAG 2.5.8 has a spacing exception, and a raw size rule is a finding generator

A raw "anything under 24px fails" rule reported **98 failures across the suite**. WCAG 2.5.8 allows
an undersized control when **a 24px circle centred on it does not intersect any other target's
circle**. Checked properly, **all 11 undersized controls in the Scraper passed** — window-chrome
buttons and status-bar fields, with nearest-neighbour centres of **31–342px**
(`UI_UX_AUDIT.md:417-423`).

**Compact desktop chrome is compliant. Inflating it is damage, not repair.**

> **Two corrections to how that item is usually quoted.**
>
> **The exception cleared the Scraper, not the suite.** The suite baseline records **~64**
> undersized targets, concentrated in Notebook (~40) and Library (24)
> (`UI_UX_AUDIT.md:441-455`). Of those, `.gx-notebook-lineage-btn` at 20–21px was **"the only
> genuine target-size failure in the suite"** and was raised to a 26px minimum (`:493-495`).
> Applying the exception is step one; it does not absolve everything.
>
> **Measure the rendered box, not the declared one.** `.card-remove` was *declared* at 24px and
> rendered at **23.52** because the shell runs at a user-set UI zoom (98% in the running app)
> (`:495-497`). A 24px declaration is not a 24px control. Read `getBoundingClientRect()`.

## 3. A minimised window measures as perfect

In a minimised window **every box is 0×0**, and "is anything overflowing?", "does it fit?",
"is the contrast acceptable?" all score 0×0 as a pass. This is a silent pass — the worst kind.

The recorded case: the Scraper window was minimised, every element had a zero-size bounding box,
**and the probe reported a perfect score. Once it was actually visible, Scraper had six sub-11px
labels** (`UI_UX_AUDIT.md:433-437`).

**Refuse to score. Do not record zeros.** `/health` reports `minimized` per window; `/focus`
restores. Check before the pass, not after.

> **Selecting a floating window: `.fwin` carries NO `data-id`.** Verified 2026-08-03 — the element
> is `<section className={`fwin …`} style={{…}}>` at `src/renderer/components/DesktopShell.tsx:2698-2702`
> with no data attributes, and `data-id` appears nowhere in `src/**`. **`.fwin[data-id="x"]` matches
> nothing and returns `null`** — which, in a refuse-to-score guard, looks exactly like the guard
> working. Match on the title instead: `.fwin-title-text` holds it
> (`DesktopShell.tsx:2713`). A hidden window is given `display: none` inline (`:2701`), so a
> zero-size box covers the minimised case too.

```js
// paste this helper into any measurement eval
(() => {
  const win = (name) => [...document.querySelectorAll('.fwin')].find(
    (w) => (w.querySelector('.fwin-title-text')?.textContent || '').includes(name));

  const el = win('Scraper');
  if (!el) return { refuse: 'no .fwin titled Scraper — is it open?' };
  const r = el.getBoundingClientRect();
  if (!r.width || !r.height) return { refuse: 'window is 0x0 — measurement invalid' };
  return { ok: true, rect: r.toJSON() };
})()
```

## 4. A detached node's `getComputedStyle` returns an empty declaration, not `auto`

The value comes back `''`, which reads exactly like a token that failed to resolve.

**The cause is usually the interaction you are measuring.** The recorded case: `pick()` closes the
command palette, so a z-index read taken *after* Enter reported `''` and looked like a broken
token. **Read it before Enter** (`NEXT_SESSION.md:6395-6397`).

Two neighbours from the same list, both of which first read as defects:

- **React has not flushed yet.** State set from a plain `window` listener lands *after* the
  dispatch returns, and `createRoot().render()` is async — so a first read reported "the palette
  did not mount", indistinguishable from the stacking defect the probe existed to catch
  (`NEXT_SESSION.md:6388-6391`). Settle before you measure.
- **Reading `getComputedStyle(el).opacity` right after `el.focus()` returns the mid-transition
  value.** A 150 ms reveal measures as `0` — i.e. as a CSS bug that is not there
  (`NEXT_SESSION.md:35-36`).

**And the one that invalidates the whole approach for a class of cue: `getComputedStyle(el)` cannot
see a pseudo-element.** A probe reading the element scored the design's quiet backing surface at
1.35:1 and never saw the cue a user actually reads. Worse — *"reading `styles.css` would have
confirmed the wrong answer here"*: the accent underline the stylesheet declares is dead, replaced
by a different mechanism in a different file (`NEXT_SESSION.md:986-989`). Score `::before` /
`::after` as boundary candidates in their own right, **against the control's own painted fill**,
since the marker sits inside the control (`:991-993`).

## 5. `@media (max-width: …)` never fires inside a floating window

The app renders panels inside floating windows on a fake desktop. **The viewport is the whole
screen, not the window** — so on a 1936px screen a `max-width` block never matches however small
the window is made.

The recorded case: **296 lines across six `@media (max-width: …)` blocks were dead code.** Verified
by shrinking the window to the 940×600 acceptance size — the three-pane Music layout stayed three
panes at 884px (`UI_UX_AUDIT.md:173-180`).

**Use `@container` with `container-type: inline-size`.** After conversion, at an 884px container
the sidebar narrowed from 206px to 171px — the 1040px rule finally firing (`:182-184`). The
contract is regression-pinned at `src/renderer/__tests__/mediaCenterIntegration.test.ts:162,164`,
so a regression to `@media (max-width: …)` fails the suite instead of silently killing the CSS
again.

**To test a narrow layout: set the `.fwin` element's inline width from JS, then restore it.**
`.fwin` is the floating-window element (rule `src/renderer/styles.css:13440`, applied at
`src/renderer/components/DesktopShell.tsx:2700`). Select it by title — see the §3 note; it has no
`data-id`. Width is an inline style on that element (`:2701`), so setting `w.style.width` is
writing to the same channel the shell uses, and restoring it hands control back.

```js
(() => {
  const w = [...document.querySelectorAll('.fwin')].find(
    (n) => (n.querySelector('.fwin-title-text')?.textContent || '').includes('Media'));
  if (!w) return { refuse: 'media window not open' };
  const prev = w.style.width;
  try {
    w.style.width = '884px';
    const side = w.querySelector('.mc-sidebar');   // mediaCenter.css:119
    return { at: '884px', sidebar: side ? getComputedStyle(side).width : 'no .mc-sidebar' };
  } finally {
    w.style.width = prev;        // ALWAYS restore, including on a thrown assertion
  }
})()
```

**React owns that inline style and will reassert it.** The shell writes
`style={{ left, top, width: win.w, height: win.h, … }}` from state on every render
(`DesktopShell.tsx:2701`), so your narrowed width survives only until the next render. **Measure in
the same eval that sets it** — do not set the width, click something, and then read. The upside is
that a run that dies mid-measurement self-heals on the next render.

**Never resize the real OS window.** It moves the user's desktop, and `desktop-layout.json` is
rewritten synchronously on window movement — you will have mutated state you did not intend to.

## 6. A borderless-by-design control is not a contrast failure

`.os-tray-btn` is a borderless icon button by design: **`background: transparent; border: none`**
(`src/renderer/styles.css:13765-13772`).

A sampler with no *"paints no boundary"* class samples the taskbar behind it on both the edge ring
and the interior ring, and the boundary reading collapses to a flat **1.00:1** — indistinguishable,
from the outside, from a boundary that exists and is invisible. Every one of the 30 retained rows
read `painted === against, boundaryDistinct: 1, ratio: 1.00`
(`SLICE_77_B2P_CORRECTION.md:31-33`).

**WCAG 1.4.11 governs the visual information required to identify a component. For an icon button
that information is the glyph** — here `--muted #9d97a6` on `--panel #1a1823` = **6.18:1**, more
than double the 3:1 the criterion asks for (`:44-47`).

**The rule.** When the most generous boundary reading available is still ≈1.00, the control paints
no boundary, and what happens next depends on **what identifies it**:

| role | treatment |
|---|---|
| `identity`, `state` | re-score **from the mark inside** |
| `affordance` (select / input / textarea — the box *is* the affordance) | **keep the 1.00 as a genuine defect** |
| `decorative` | not scored at all |

> **Citation correction, verified 2026-08-03.** Both `a11y-pixel-sampler.mjs:493-496` and
> `SLICE_77_B2P_CORRECTION.md:34-35` state that `.os-tray-btn` declares
> `background: transparent; border: 1px solid transparent` at `shell.css:864`/`:954`. **It does
> not.** `shell.css:864-876` declares that, but for `.os-start-btn`, `.os-desktop-switch` and
> `.os-task-win`; `shell.css:954-962` is the `.os-tray-btn` rule and sets neither background nor
> border. The real declaration is `styles.css:13765-13772` with `border: none`. **The conclusion is
> unaffected** — the fix keys off a measured ratio, not off the declaration — but do not grep
> `border: 1px solid transparent` expecting to find the borderless family.

## 7. A thin state indicator can fall between your sample rings

A ring probe sampling the boundary at exactly **two depths, 1px and ~6px** in will miss an
indicator that lives between them.

```css
/* src/renderer/components/shell/shell.css:911-923 */
.os-task-win.active::after {
  content: ''; position: absolute; left: 50%;
  bottom: 3px; width: 16px; height: 2px;
  background: var(--accent);            /* 4.80:1 on the taskbar */
}
```

The bar occupies **3–5px**. It falls straight between the rings, **missing by a single pixel on
each side**, and the control then reports as its raised fill alone — 1.35:1
(`a11y-pixel-sampler.mjs:550-561`).

**The bounded fix.** A load-bearing control the ring reading fails gets **one** second look: the
same perimeter band, sampled **densely** instead of at two depths. Never run it on a control the
ring already passed. Because the verdict is a max over candidates, a denser sample of the *same
region* **can only raise a ratio** — so it can turn a false FAIL into a PASS and **cannot
manufacture a PASS out of a region the ring never looked at**
(`a11y-pixel-sampler.mjs:558-561`, `:1161-1180`).

That constraint is what makes the fix safe. A "second look" that widens the region instead of
densifying it is a finding-eraser, not a correction.

## 8. Both halves of a fix must be able to fail, and be tested on it

When the corrections in §6 and §7 landed, the sampler's offline self-test went **29 → 37
assertions, and six of the eight new ones assert that something STILL fails**
(`SLICE_77_B2P_CORRECTION.md:78-96`): a borderless button whose glyph really is too faint (1.21); a
control that *does* paint a sub-3:1 border, judged on it (1.52); one bright stray pixel not
carrying a control (area floor); a form control painting no boundary keeping its 1.00; the same
raised fill with the underline removed staying at 1.35.

**If your correction cannot produce a failure, it is an amnesty, not a fix.** The negative control
for §6/§7 is `frutiger-aero`, whose `paintNoBoundary` is **0** (glass paints everywhere), so
neither correction applied and its 8 load-bearing failures were **unchanged and real**
(`:205-208`).

---

## 9. Bound the work: two rendered extremes, the rest algebraically

**Families × 13 themes × 2 sizes is unbounded.** Do not attempt it.

**Render-measure two extremes:**

- the **dark default `study-os`** — first entry in `BASE_THEMES`, `src/renderer/theme/engine.ts:70`,
- the **worst light theme `soft-sepia`** — measured worst by a wide margin: **174 real B1 failures
  of 343 samples**, the highest of all 13 (`SLICE_76_PRACTICAL_SWEEP.md:441-455`).

**Then verify the rest algebraically.** A family whose cues are all `var(--token)` and which passes
both extremes **can only fail in between if a theme overrides one of the tokens it reads.** Grep
each remaining theme for overrides of exactly those tokens. **Render only those.**

State the algebra in your row's *what was measured* column — "passes both extremes; reads
`--accent`, `--panel`, `--border`; no remaining theme overrides any of the three" is a measurement.
"Looks fine" is not.

### Theme-count traps

- **`BASE_THEMES` registers 13** (`src/renderer/theme/engine.ts:69-83`). **The app ships 15** —
  `src/renderer/main.tsx:175-176` registers `registerFrutigerAero()` and `registerWiredArchive()`
  at boot. "13 themes" means the base set. Say which you measured.
- **`frutiger-aero` and `wired-archive` are not covered by the algebra.** Aero paints glass
  everywhere (`paintNoBoundary: 0`); `wired-archive` paints on `background-image`, which makes it
  **structurally unreadable by a CSS-derived instrument** — 303 of 393 text samples and 223 of 246
  controls come back *unmeasurable* (`SLICE_76_PRACTICAL_SWEEP.md:467-471`). Measure them
  separately or declare them `NOT-REACHABLE`. Do not fold them into a base-theme number.
- **A theme-application guard can hard-fail on a correctly applied theme.** A gate required
  `data-materials`, which only material-set themes stamp — so **every base theme would have been
  reported as a theme-application failure** in a sweep whose purpose was finding real ones
  (`SLICE_76_PRACTICAL_SWEEP.md:141-158`; that source says "twelve", against a `BASE_THEMES` of 13
  — quote the source's wording only if you have reconciled the count). Confirm your theme actually
  applied via `data-theme`, and **confirm your confirmation works on a base theme before trusting
  it** — that guard had only ever been run against `frutiger-aero`, which does stamp `data-materials`.

## 10. A token is advisory until proven — three times in this codebase

A stylesheet change is a hypothesis about what will paint. It has been wrong three times here, and
each time a theme could not control a colour the token system says it owns
(`SLICE_77_B2P_CORRECTION.md:188-196`):

1. `--control-edge` — a rule outranked the token.
2. `--focus-ring-color` — a recomputation bypassed it.
3. `--accent-2` — `osPersonalization.ts:116` writes it **inline on `<html>`**, and an inline
   property beats every stylesheet rule. A `--accent-2-light` token was added, all six light themes
   pointed at it, and **the rebuilt binary still painted the untouched original.**

**That change was reverted rather than left in place**, because dead CSS that reads like a fix is
worse than the defect: the next reader believes the border is 3.50:1 when it is 2.49:1.

**The rule: a token change is not a fix until it has been rebuilt and re-measured on the artifact.**
Until then it is a proposal. And when two instruments straddle a threshold — the same marker
measures 2.95:1 by the CSS path and just over 3:1 by the pixel path, because they disagree about
what "adjacent" means — **never report it as a pass or a failure without saying which path produced
it** (`:131-137`).
