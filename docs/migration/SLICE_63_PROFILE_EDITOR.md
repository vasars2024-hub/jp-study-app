# Slice 63 — the agent profile operations editor

**Status: IN PROGRESS.** Written as the work happens, per the track rule. Anything below marked
`MEASURED` was read off a run; anything marked `PENDING` was not.

## The finding this slice acts on

Phase 7 proved end-to-end that narrowing a built-in agent profile's allowed operations persists
across a restart and makes the executor refuse a step outside the allow-list. It proved it by
hand-editing `localStorage`, because that was the only way to do it: `disabledOperations` /
`addedOperations` appeared **nowhere** in `src/renderer`. The panel rendered the allow-list as a
count (`BlancReadyToolPanels.tsx:738`) and offered no way to change it.

A security control no user can operate is not a control. This slice makes it reachable.

---

## Blocker hit at the start (resolved / see report)

`npx vitest run`, `node ./node_modules/vitest/vitest.mjs run` and `node tools/i18n-check.cjs` were
all auto-denied by the permission layer in this session, so no gate could be measured up front.
Baselines quoted in the brief (365 files / 4622 tests, i18n 6587 exit 0, audit exit 0) are the main
session's hand measurement, **not** mine. Every number in this file is labelled with who measured it.

---

## Finding 1 — 14 catalog plural keys are written in a syntax the translator does not parse

**Not caused by this slice. Found while replacing `blanc.agent.approvedTools.count`.**

`src/shared/i18n/core.ts` resolves plurals from an **object** entry
(`{ one: '…', other: '…' }` — `isPluralForms` tests for an `other` property). A **string** entry
goes straight to `interpolate()`, whose placeholder regex is `/\{(\w+)\}/g`.

Fourteen keys are written as raw ICU strings instead:

```
'{count, plural, one {# approved tool} other {# approved tools}}'
```

`\{(\w+)\}` matches nothing in that template — `{count,` fails on the comma, `{# approved tool}`
fails on `#` and the spaces. So `interpolate` returns the template **verbatim** and the user sees
the literal string `{count, plural, one {# approved tool} other {# approved tools}}` on screen.
All four languages carry the same broken shape, so `i18n-check.cjs` and the
`i18n.test.ts` catalog-hygiene block both pass: every language *has* the key, and its value is a
non-empty string.

Affected keys in `src/shared/i18n/catalogs/en.ts` (same line in the other three catalogs):

| line | key |
| --- | --- |
| 98 | `unifiedSearch.providerCount` |
| 99 | `unifiedSearch.resultCount` |
| 181 | `theme.historyCount` |
| 291 | `connection.attemptsCount` |
| 396 | `connection.msg.importedWithIssues` |
| 456 | `mediaProvider.providerCount` |
| 466 | `mediaProvider.planStepCount` |
| 471 | `mediaProvider.sourceCount` |
| 1872 | `lens.wordCount` |
| 3152 | `bookOcr.eta.seconds` |
| 3153 | `bookOcr.eta.minutes` |
| **5390** | **`blanc.agent.approvedTools.count`** ← this slice's surface |
| 5421 | `blanc.agent.scheduledCount` |
| 5917 | `mediaCenter.settings.profileCount` |

**What this slice does about it:** fixes only the two on its own surface
(`blanc.agent.approvedTools.count`, `blanc.agent.scheduledCount`) and writes every *new* plural key
in the object form. The other twelve belong to other tracks' surfaces; fixing them here would put
unrelated user-visible text in this diff. **They are still broken — someone should take them.**

A regression guard for the whole class would be one assertion in `i18n.test.ts`: no catalog value
may be a string containing `, plural,`. That is a two-line test and it would have caught all
fourteen. Not added here because `src/shared/__tests__/i18n.test.ts` is not in this slice's
ownership list.

---

## The contract, read from the code (not assumed)

`src/shared/localAgentProfiles.ts`:

- identity (`id`, `name`, `description`, `role`, `builtIn`) is **factory-owned** — a stored entry
  cannot impersonate a built-in;
- preferences override outright;
- operations are a **delta** (`disabledOperations` / `addedOperations`) over the *current* factory
  list, so a narrowing sticks *and* an operation a future version adds to a built-in still appears;
- `applyBuiltInOverride` converts a legacy whole-`enabledOperations` list into the equivalent delta
  **only when the delta is empty** (`hasDelta = disabled.length > 0 || added.length > 0`);
- empty deltas are omitted from the output entirely, never written as `[]` — slice 58's fix.

Two consequences the new editor must respect, both verified by reading the code:

1. **The UI must write the delta directly.** If it wrote only `enabledOperations`, it would depend
   on the legacy conversion, which is precisely the path slice 58 found could be masked.
2. **The UI must keep `enabledOperations` consistent with the delta it writes.** When a user
   re-enables everything, the delta becomes empty and the legacy branch takes over — reading a
   *stale* `enabledOperations` would silently re-derive the narrowing the user just undid.

## Empty allow-list — checked at every consumer

An empty list is a legitimate, maximally-restrictive choice, so the "empty means unset" shortcut
had to be absent everywhere, not just in the normalizer. Read directly:

| consumer | code | verdict |
| --- | --- | --- |
| `localAgent.ts:293` | `if (allowedOperations && !allowedOperations.includes(...))` | `[]` is truthy → denies. **Correct.** |
| `localAgentPrompt.ts:36` | `context.profile && !profile.enabledOperations.includes(...)` | `[]` → no operation offered to the model. **Correct.** |
| `localAgentProfiles.ts:184` | `!hasDelta && Array.isArray(candidate.enabledOperations)` | disabling all yields a **non-empty** `disabledOperations`, so `hasDelta` is true. **Correct.** |
| `localAgentProfiles.ts:235` (custom) | `Array.isArray(candidate.enabledOperations) ? … : [default]` | `[]` is an array → empty list kept, not replaced by the default. **Correct.** |

No fix needed. Asserted anyway, because the editor is what makes `[]` reachable for the first time.

---

## What was built

### `src/shared/localAgentProfiles.ts` — the write side of the delta

Three exports added, plus one refactor:

- `mergeOperations(factory, disabled, added)` (private). The one place a delta becomes a list.
  **Both** the read path (`applyBuiltInOverride`) and the new write path go through it, so a save
  is a *fixed point* of the next load rather than something that happens to agree with it. The
  duplicated computation that used to live inline in `applyBuiltInOverride` is gone.
- `setAgentProfileOperations(profile, nextEnabled)` — the function the editor calls. Writes the
  delta form directly; never depends on the legacy `enabledOperations` conversion.
- `factoryAgentProfileOperations(id)` — the list "restore defaults" restores. Returns the
  *current* factory list, for the same reason the stored form is a delta.
- `agentProfileOperationsAreFactoryDefault(profile)` — drives the "customized" note and disables
  the restore button when there is nothing to restore.

`setAgentProfileOperations` **destructures** `disabledOperations` / `addedOperations` out of the
profile instead of spreading over them. That is the un-narrow case: a plain `{ ...profile }`
carries the previous arrays forward underneath a freshly recomputed `enabledOperations`, and the
next load applies the stale delta and undoes the user's re-enable.

### `src/renderer/localAgentProfilesStore.ts`

`setLocalAgentProfileOperations(store, profileId, nextEnabled)` — maps the one profile through
`setAgentProfileOperations` and persists via the existing `saveLocalAgentProfiles`. Takes the
store rather than reading it back, so the value the caller is rendering is the value that gets
edited; `loadLocalAgentProfiles()` returns a module-level cache a concurrent write could have
moved underneath it.

### `src/renderer/components/blanc/AgentProfileOperations.tsx` — NEW FILE

**Deviation from the brief, flagged deliberately.** The brief said to add the editor *to*
`BlancReadyToolPanels.tsx`. It is in a sibling file instead, rendered from that panel. Reason:
`BlancReadyToolPanels.tsx` is 1,797 lines and pulls in `window.api`, the tokenizer, the asset
store and a 468 KB stylesheet at module scope. A DOM test that mounted the panel to click one
checkbox would need all of that stubbed, and the resulting test would break for reasons having
nothing to do with the allow-list. A ~170-line presentational file mounts in jsdom in one line,
which is what makes the reachability proof below cheap enough to actually keep.

Design decisions worth knowing:

- **The whole 51-operation catalogue is listed, not just the profile's current operations.** A
  list of only what is enabled can be narrowed and never widened or restored — a one-way door out
  of a working profile.
- **Built-ins are editable.** No `disabled={profile.builtIn}` anywhere. They are all a fresh user
  has; disabling the editor for them would reproduce slice 56's defect exactly.
- **Operation labels stay in English**, from `AGENT_TOOL_OPERATIONS`. Same scope rule that leaves
  profile names and plan objectives alone (`en.ts:5344` already says operation ids are out of
  scope), and there is a stronger reason: those labels are what the model is shown in its prompt
  *and* the exact words the refusal quotes back — "Search local knowledge is not enabled for the
  active agent profile." Translating them in the editor would make the editor and the refusal
  disagree about what the user just switched off. All chrome around them **is** translated.
- **No memo depends on `t`.** `OPERATION_GROUPS` is built at module scope keyed by tool id, with
  no `t()` call in it; headings are translated at render time. That sidesteps the CLAUDE.md trap
  (a `useMemo` calling `t()` must depend on `lang`, never on `t`) rather than navigating it.
- **No CSS was touched.** `styles.css`, `theme/tokens.css` and `theme/a11y.css` are all untouched
  as instructed — the editor is built from classes that already exist in `theme/blanc.css`
  (`blanc-check`, `blanc-form-grid`, `blanc-row-actions`, `blanc-note`).

### `src/renderer/components/blanc/BlancReadyToolPanels.tsx`

- Renders `<AgentProfileOperationsEditor>` under the profile row.
- Its private `agentPermissionLabelKey` moved into the new file and is imported back — both
  surfaces name the same three permission levels, and two copies would drift.

### i18n

17 new keys in all four catalogs (`blanc.agent.operations.*`), all in the **object** plural form.
Plus the two `blanc.agent.approvedTools.count` / `blanc.agent.scheduledCount` repairs from
Finding 1.
