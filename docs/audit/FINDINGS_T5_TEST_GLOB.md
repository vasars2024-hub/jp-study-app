# T5 — the test files the gate cannot see

**Measured 2026-08-04 by the orchestrator, solo (both fleet accounts rate-limited).**
Method: run the real config with a name filter, with a positive control; then run the excluded
files under a scratch config held identical except for the glob.

The audit carried this as: *"Two test files have never run — `vitest.config.ts` globs `.test.ts`
only. **Widening it will likely surface two newly-failing suites** (`environment: 'node'`)."*

One half of that is confirmed and sharpened. The other half is **refuted**, and the mechanism it
named was wrong.

---

## 1. CONFIRMED — and the count is exact, not a floor

`vitest.config.ts` has six include globs. Every one ends `*.test.ts`.

| Measure | Value |
|---|---|
| Test files under `src/` | **377** |
| `.ts` — collectable | 375 |
| `.tsx` — collectable by no glob | **2** |

```
src/renderer/__tests__/externalPlayerPanel.test.tsx
src/renderer/__tests__/mediaTrackingSourcesHistory.test.tsx
```

Two is the **complete** set, not a sample. The sweep enumerated every `*.test.{ts,tsx,js,mjs,cts,mts}`
under `src/` and grouped by extension; nothing else is stranded.

**Verified with a positive control**, because "no test files found" is an absence-read and this
audit has produced three false ones already:

| Command | Result |
|---|---|
| `vitest run --config vitest.config.ts externalPlayerPanel` | `No test files found, exiting with code 1` |
| `vitest run --config vitest.config.ts i18n` | **3 files, 25 tests passed** |

Same config, same invocation shape. The filter mechanism works; the files are genuinely unreachable.

**And the gate is the root config.** `package.json` → `"test": "vitest run"`, with no `--config`.
So `npm test` collects 375 of 377 and reports green.

---

## 2. REFUTED — they do not fail, and `environment: 'node'` never applied

Run under a scratch config (in the OS temp dir, **not** the repo — the tree under audit is not
modified in order to audit it) identical to the root config except `*.test.ts` → `*.test.tsx`:

```
Test Files  2 passed (2)
     Tests  4 passed (4)
```

The predicted failure does not occur. The stated cause could not have occurred either: **both files
declare `// @vitest-environment jsdom` on line 1**, a per-file override that supersedes the config's
`environment: 'node'`. They were never going to run under node.

The audit inherited this claim from prior notes and repeated it without executing it — the same
defect it exists to find, and the **fifth** instrument error on this session's record.

---

## 3. NEW — the finding was already made, and the tests had already gone stale

Both files carry docblocks written by the migration track, and there is a companion config at
`docs/migration/tools/vitest.tsx.config.mjs`. Together they record that in slice 40 the two files
were executed **for the first time**, and:

- `externalPlayerPanel.test.tsx` **failed** — `useSettings outside SettingsProvider`. The panel's
  `SettingsCard` had gained a context dependency after the test was written.
- `mediaTrackingSourcesHistory.test.tsx` **failed twice** — an assertion reading
  `querySelector('button')` that had silently started matching a newly-added *Assign* control, and
  a React value-tracker trap where `input.value = x` bypassed `onChange` so the store was never
  written.

Both were repaired at the time. They pass **now** because someone already fixed them — not because
they were ever correct while unrun.

That is the load-bearing point, and the file says it better than a register row can:

> *"A test that never runs is not a test — it is a claim, and this one had been false long enough
> that the component it describes had moved."*

The value-tracker trap deserves separate note: two assignments in `externalPlayerPanel.test.tsx`
were **silent no-ops for the entire life of the file**, and the assertions happened not to depend on
them. A test can be collected, executed, and green while a portion of it does nothing — which is the
same shape as a gate whose denominator was never stated.

---

## 4. Why it was not fixed — governance, not oversight

`CLAUDE.md`: *"Keep changes isolated strictly inside the `src/` directory. Do not alter root project
configurations (forge.config, vite.\*.config, tsconfig.json)."*

`vitest.config.ts` is not in that literal list, but the migration track read the rule in spirit,
declined to touch it, and built the side config instead — recording the reasoning in the file:

> *"THE REAL FIX IS ONE CHARACTER, and it belongs to the owner of the root config."*

That is the correct call for an agent to have made. It also means the fix cannot be applied by an
agent under the current rules: **it needs the owner.**

---

## 5. Verdict and disposition

| | |
|---|---|
| **Gate defect** | `REAL` — `npm test` reports green over 375 of 377 files |
| **Predicted failures** | `REFUTED` — 4 tests, 0 failed |
| **Stated mechanism (`environment: 'node'`)** | `WRONG` — both files override to `jsdom` per-file |
| **Risk of the one-character fix** | **None measured.** Widening to `*.test.{ts,tsx}` was executed and is green |
| **Blocker** | `CLAUDE.md` root-config scope rule — owner's call |

**Fix, for the owner:** in `vitest.config.ts`, widen the renderer glob only —

```
'src/renderer/__tests__/**/*.test.ts'  →  'src/renderer/__tests__/**/*.test.{ts,tsx}'
```

Then `docs/migration/tools/vitest.tsx.config.mjs` becomes dead and should be deleted with it, or it
will drift into a second source of truth about which tests exist.

This moves T5 out of TODO and into **USER-MUST**: the change is measured, safe, and one character,
and the only thing standing between it and the tree is a scope rule only the owner can lift.
