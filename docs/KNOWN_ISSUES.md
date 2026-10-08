# Known issues

Defects that were **found and deliberately not fixed**, with the evidence to
re-derive each one. `jp-dispatch` §6 names this file as the single place such
findings go, so they stay visible instead of being rediscovered.

Every row carries a `file:line` and a **re-runnable command**. A row without one
is an opinion, not a finding — delete it rather than leave it.

**This is not a backlog of everything wrong with the app.** It is the narrower set
that someone measured, could have fixed, and chose not to — each with the reason.
When a row is fixed, delete it; do not mark it done.

Created 2026-08-05 by the C1 run (`docs/audit/HANDOFF_C1_NON_BLANC_COMPLETION.md`).

---

## KI-6 · Reading Lens is untested end-to-end

**Where:** `src/main/readingLens.ts`, `src/main/screenOcr.ts`

The C1 run added 98 tests covering settings persistence, accelerator lifecycle,
region clamping and the OCR failure paths — but **Electron is stubbed throughout**.
Nothing exercises a real `desktopCapturer` capture, a real global-hotkey press, or
a real OCR read of the actual screen.

Since 2026-10-08 the Lens is **opt-in**: a fresh install no longer claims
`Ctrl+Shift+Space` (an IME / editor chord on many machines) at boot — it is
switched on in Settings → Reading Lens, and a profile that already had a
`reading-lens.json` keeps it on (`readingLens.ts` `DEFAULTS`, `loadSettings`).
The end-to-end gap below still stands. Per `jp-dispatch` §9.2 it is
**"implemented", not "works"**.

Confirming it means pressing `Ctrl+Shift+Space` on a real desktop and reading a
real screen region — not a bridge operation, and not something to do on the user's
live session unannounced.

```bash
npx vitest run src/main/__tests__/readingLens.test.ts src/main/__tests__/screenOcr.test.ts
```
