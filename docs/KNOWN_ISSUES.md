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

## KI-1 · `dayLabel` renders in the OS locale and hardcodes English

**Where:** `src/shared/reviewForecast.ts:184-199`

`dayLabel(0)` returns the literal string `'Today'` and `dayLabel(1)` `'Tomorrow'`;
past that it calls `toLocaleDateString(undefined, { weekday: 'short' })`, which
formats in the **host** locale rather than the UI language. So a Russian UI shows
`Today` / `Mon`.

**Why not fixed:** its only consumer is
`src/renderer/components/blanc/BlancStudyNativePanels.tsx:646,663`, and **Blanc is
deferred and out of scope** for the run that found this. The literals also need
catalog keys, and `shared/` cannot reach `useT()`. Half-fixing the locale argument
while leaving `'Today'` in English would be worse than leaving it coherent.

`src/shared/__tests__/reviewForecast.test.ts:153-154` asserts the English strings,
so a fix must update those too.

```bash
grep -n "dayLabel" src/shared/reviewForecast.ts src/renderer/components/blanc/BlancStudyNativePanels.tsx
node tools/i18n-locale-arg-check.cjs      # lists it under "explicitly ignored"
```

---

## KI-2 · 60 `toLocaleString()` calls format numbers in the OS locale

**Where:** 23 files, recorded per-file in `tools/i18n-locale-arg-baseline.json`

Thousands separators and number formatting follow the host locale, not the UI
language — so a Russian UI can render `1,234` where it should render `1 234`.

**Why not fixed:** far lower stakes than the date/time half (a wrong separator is
legible; a wrong-language month name is not), and sweeping 60 sites was explicitly
scoped out. **Ratcheted, not ignored:** `tools/i18n-locale-arg-check.cjs` fails if
any file's count rises, and prints the total on every clean run.

```bash
node tools/i18n-locale-arg-check.cjs
```

---

## KI-3 · `grammar-audit.json` still carries pre-de-branding identifiers

**Where:** `/grammar-audit.json` (committed), flagged as F21 in
`docs/audit/AUDIT_2026-08.md` and in `.gitignore:210-213`

The committed copy names source modules `mazii-n3-dump`, `mazii-n2-dump`,
`mazii-n4-dump`, `mazii-n1-dump`. The 2026-07-28 scrub removed those identifiers
everywhere else; this artifact is the last place they survive.

**This one is nearly free to fix.** Running the standard gate regenerates the file,
and the *only* content change is those four names → `supplement-n{1..4}`. Every
count is identical.

**Why not fixed here:** the file is outside the C1 run's owned paths, and
`jp-dispatch` §2 forbids committing what you did not write. The regeneration was
reverted rather than shipped.

```bash
node tools/grammar-audit.cjs --compare && git diff --stat grammar-audit.json
```

---

## KI-4 · Four dead catalog keys: `mediaWorkspace.section.reopen`

**Where:** `src/shared/i18n/catalogs/{en,ja,zh,ru}.ts`
(`en.ts:6897`, `ja.ts:6574`, `ru.ts:7160`, `zh.ts:6543`)

`'Bring it forward'` / 「手前に表示」 / «Показать поверх» / 「移到前方」. Retired
with audit F16 — the comment at `en.ts:6891-6893` says so — but the keys were left
behind and are referenced by **no code**.

Harmless, but they are four translated strings that will be carried forever and
will read as live UI copy to the next person grepping the catalogs.

```bash
grep -rn "section.reopen" src/ | grep -v catalogs   # expect: no hits
```

---

## KI-5 · `Surfaces.tsx` is dead: all three primitives, not just `.ui-card`

**Where:** `src/renderer/components/ui/Surfaces.tsx:14,18,22`

Audit **B2** records that `.ui-card` has zero consumers. Measured 2026-08-05: so do
`GlassCard` and `Panel`. It is 3 of 3, which audit **B3** understates for this file.

- `GlassCard`'s only occurrence outside its definition is a **doc comment**
  (`ui/index.ts:4`) showing how to import it — an example nothing follows.
- Every `<Card …>` in the tree is `SeanimeWatchLoopPanel.tsx:358`'s own local
  `function Card(`.
- Every `Panel` hit is a local variable (`ImmersionView.tsx:131,135`).

B2 also records that the `.ui-card` rule is *itself* a design-system violation
(drops the border, keeps `box-shadow` → fill + shadow, two strong cues).

**Why not fixed:** the zero-consumer property that makes it safe to change also
means a change has **no visual surface** — nothing renders it, so no before/after
can exist and no measurement can move. That is dead CSS that reads like a repair
(`css-measure` §10). Correcting the primitive is only worth doing as part of
adopting it, which is B3's work. Fold B2 into B3: adopt `Surfaces` somewhere real,
or delete the module.

```bash
grep -rn "ui-card" src --include=*.tsx          # expect 1 hit: Surfaces.tsx:14
grep -rn "GlassCard" src | grep -v Surfaces.tsx # expect 1 hit, and it is a comment
```

---

## KI-6 · Reading Lens is untested end-to-end

**Where:** `src/main/readingLens.ts`, `src/main/screenOcr.ts`

The C1 run added 98 tests covering settings persistence, accelerator lifecycle,
region clamping and the OCR failure paths — but **Electron is stubbed throughout**.
Nothing exercises a real `desktopCapturer` capture, a real global-hotkey press, or
a real OCR read of the actual screen.

The Lens is enabled by default and claims an OS-level accelerator at boot
(`readingLens.ts:57`), so the gap matters. Per `jp-dispatch` §9.2 it is
**"implemented", not "works"**.

Confirming it means pressing `Ctrl+Shift+Space` on a real desktop and reading a
real screen region — not a bridge operation, and not something to do on the user's
live session unannounced.

```bash
npx vitest run src/main/__tests__/readingLens.test.ts src/main/__tests__/screenOcr.test.ts
```
