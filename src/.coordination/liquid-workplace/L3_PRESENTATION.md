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
