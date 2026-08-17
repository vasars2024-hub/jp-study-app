# L3 — opt-in per-window presentation state

Log for `LIQUID_WORKPLACE_TRANSFORMATION_PLAN.md` §11 / L3. Append per slice; numbers, not adjectives.

**L3's gate, verbatim:** *an unchanged sample app can switch modes and back with byte-for-byte app
data and equivalent observable state.*

## 2026-08-17 · primary · L3.1 the schema, the commands, the recovery

| Slice | Commit | What landed |
| --- | --- | --- |
| L3.1 | `d844f239` | `shared/liquidWindowState.ts` + `WindowSnapshot.presentation?`, 24 tests |

**Scope, deliberately.** Pure schema, commands, validation and round trip. No shell wiring, no menu
item, no IPC. The gate's second half — an actual app switching and coming back — is L3.2 and needs
`DesktopShell`; landing the reversibility proof first means that wiring has something to be checked
against instead of being its own evidence.

**The four decisions, each a way reversibility is normally lost.**

1. **Conventional is the ABSENCE of the field**, not a stored `mode: 'standard'`. Every layout saved
   before today parses unchanged — the precedent is `WindowSnapshot.pinned` (`shared/desktop.ts:53`),
   optional for exactly this reason.
2. **`makeLiquid` on an already-liquid window returns it untouched.** Without the guard a second call
   records the *liquid* rect as the way home; the original geometry is then gone permanently,
   silently, and only found by a user who switches back.
3. **`returnToStandard` DELETES the key**, so the round trip is key-for-key identical. Asserted three
   ways including `JSON.stringify` equality, because a residual `presentation: undefined` is invisible
   to `toEqual` and still lands in the persisted blob.
4. **A corrupt blob means standard, never half-liquid.** `parsePresentation` is total and returns
   `undefined` for anything it cannot vouch for — including liquid with no geometry to return to,
   which is a window that cannot be reversed and therefore must not be entered.
   `sanitizeWindowPresentation` then drops the key, so corruption is not persisted forward.

**Ownership boundary.** The commands own geometry and the maximize flag only. z-order, pin,
visibility and the separate `restoreRect` belong to the shell and are asserted untouched across a
move-while-liquid round trip — a command that also moved them could not be proven reversible in one
place.

**Numbers.** 24 tests; 13 corrupt shapes, each asserted not to throw AND to be dropped off the
window; ten consecutive toggles land on the original. Existing desktop suites unaffected
(`desktop`, `desktopSchemaV3`, `desktopWindows` = 50/50).

**Mutation: 9 of 9 red, file restored byte-identical.** One SURVIVED the first run and was worth the
exercise: deleting the `mode === 'standard'` check changed nothing, because a bare `{mode:'standard'}`
has no rect and the next guard rejects it anyway. **The case a real store actually produces is
`{mode:'standard', standardRect}`** — a window that WAS liquid and came back — and under that
mutation it reads as liquid, so the window silently re-enters a presentation the user left. Now
tested. *A rejection case that two guards both catch proves neither of them.*

**Next slice (L3.2):** the Make Liquid / Return to standard commands wired to `DesktopShell` +
`shared/desktop.ts` persistence, then drive the gate live — switch a real window, restart, switch
back, and compare the persisted layout blob byte-for-byte. Needs nothing from the user.

## 2026-08-17 · backup · L3.2 the gate, driven live — and the two defects only that could find

| Slice | Commit | What landed |
| --- | --- | --- |
| L3.2 | `20462e3a` | `renderer/liquidWindowPresentation.ts`, `theme/liquid-window.css`, title-bar toggle, `main/desktop.ts` fix, 22+12 tests, i18n ×4 |

**L3's gate now PASSES on a real window.** Persisted layout after Make Liquid → Return to standard
is identical on every field except `z` (21 → 25), which is focus order and deliberately shell-owned.

**DEFECT 1 — `sanitizeWindow` (`main/desktop.ts:149`) is an ALLOWLIST, and main echoes the sanitized
layout straight back into renderer state.** MutationObserver on the live frame: `liquid` at **t+26ms**,
`standard` at **t+630ms**. The window's own persistence was undoing the user's command. That file's
comment already predicted it — *"that is how always-on-top pinning first broke."* It happened again.
**Main does not hot-reload: this was invisible until a full restart.** Now validated there with the
same total `parsePresentation`, so a corrupt blob is dropped in main, not shipped to every window.

**DEFECT 2 — `:where()` contributes ZERO specificity.** The shell's
`:where(html:not(…)) .fwin:where(…) .fwin-bar` scores `.fwin .fwin-bar` = **0,2,0**, a TIE with
`.fwin-liquid .fwin-bar`, and won on import order. Result: window translucent, title bar opaque and
covering it — `backdrop-filter` live in the computed style and **invisible on screen**. Every
override is now a compound `.fwin.fwin-liquid` (0,3,0). *A `:where()` wrapper does not mean the rule
is weak; it means the AUTHOR's other compound selectors decide, and yours must outrank them.*

**Numbers, live, restarted app, `forest-night`, `data-perf=performance`:**

| | body contrast | title contrast | window α | backdrop |
| --- | --- | --- | --- | --- |
| conventional | **17.17** | **15.57** | 1 | none |
| liquid | **16.02** | **14.62** | **0.72** | `blur(8px) saturate(1.25)` |
| back | **17.17** | **15.57** | 1 | none |

Liquid costs **1.15** of body contrast and stays far above AAA, because the body is pinned to the
opaque anchor and the sheet sets no `color`. Controls: forcing the body fill to `#555` moved contrast
**16.02 → 6.85** and restoring returned exactly 16.02, so the probe measures. `high-contrast` and
`battery` both take `--lq-liquid-blur` to **0px**, battery `--lq-motion-scale` to **0**; both restored.
Corrupt `{v:1,mode:'liquid'}` with no rect, committed and reloaded: renders **standard**, key **gone**
from the persisted layout. The user's real layout was captured first and restored byte-identically.

**Traps.** (1) Two probe bugs produced confident wrong numbers here: a `[\\d.]` regex double-escaped
by a bash heredoc parsed nothing and reported contrast **1** everywhere, and the `color(srgb …)`
branch read channels off by one and reported a blue title bar at **9.07**. Both looked like plausible
findings. Parse `color()` by the SAME indices as `rgb()`, scaled — there is no leading token with a
digit in it. (2) Composite walks read `backgroundColor` only, so the liquid title number is measured
over the shell's opaque base, not the wallpaper the blur actually samples.

**Not done, deliberately.** `parity-ledger.json` stays 0 of 7 and nothing is scored on the rubric:
one reversible presentation on a window is not an app migration. `toggleLiquid` raises `z` inside a
state updater, so a click costs +2 under StrictMode — pre-existing shape, `toggleMax` does it too.

**Next slice (L3.3):** the reverse transitions L3 has not exercised — maximize while liquid, drag
across monitors while liquid (`beginDeskDrag` sends a `winToSnapshot`, which now carries the field),
and pop-out, which routes through `main/desktop.ts:2296`-style snapshot rebuilds. Then L4.
