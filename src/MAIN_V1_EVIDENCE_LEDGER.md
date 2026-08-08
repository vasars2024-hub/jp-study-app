# Main Study OS v1 evidence ledger

Last updated: 2026-08-08. This ledger is source-derived and intentionally compact. It does not inherit completion claims from older documents.

## Repository and baseline

- Workspace: `C:\Users\Arseniy\Projects\jp-study-app`
- Branch / starting HEAD: `feat/nyaa-subtitles` / `9c74730`
- Starting staged state: empty.
- Starting worktree: 406 changed paths (171 modified, 133 deleted, 102 untracked). All pre-existing paths are treated as user-owned.
- Recent relevant commits: `8d7642a` (SQLite/FTS dictionary), `9c74730` (sense-gloss indexing and real-corpus proof).
- Focused starting baseline: credential + dictionary tests, 136 passed / 6 skipped.
- Full post-foundation baseline: 434 files passed / 1 skipped; 5,793 tests passed / 6 skipped.
- TypeScript baseline: red before the slice with project-wide test/module-mode errors and unrelated renderer/scraper errors. Changed-path filtering after the slice shows the same top-level-await test pattern and an existing `src/main/mining.ts:1705` IPC-handler type error; no new production error remains in the credential adapters.
- Architecture gate: 1,518 modules, 18 known findings, nothing new; 3 known test-only findings remain pending.
- i18n gates: catalog parity, locale-argument, missing-key, and hardcoded-text checks all pass with only their recorded baselines.

## Source-derived execution map

| Requirement | Starting status | Evidence / ownership | Next dependency |
| --- | --- | --- | --- |
| Encrypted credential vault and provider migration | Three path-scoped checkpoints implemented; focused and full suites passed | Jiten, Gemini, DeepSeek, Jimaku, OpenSubtitles, MAL OAuth and dynamic scraper references now use `src/main/credentials/*`; shared Settings wiring remains in the protected dirty tree | Build the structured provider runtime without absorbing unrelated `main.ts` / preload work |
| Gemini / DeepSeek credentials | Broken security policy: separate store could downgrade to plaintext | Clean-at-HEAD `src/main/mining.ts` explicitly wrote plaintext when `safeStorage` was unavailable | Completed in first slice; provider health/client unification remains |
| Jimaku / OpenSubtitles credentials | Broken security policy: separate unmarked store could downgrade to plaintext | Clean-at-HEAD `src/main/subtitleProviderClients.ts` | Completed in first slice; retain provider-specific Test calls backed by shared status metadata |
| Professional Lexicon core | Partially implemented, automated foundation verified | SQLite/FTS service plus Yomitan, CEDICT and Tatoeba code; dictionary focused suite passed. Dictionary and Translate are still separate `AppSection` routes | Audit service adoption/migrations, then build compatibility aliases into one Workbench |
| Central AI Agent | Read-only consolidation audit complete; first-class app genuinely missing | Typed tools/runtime exist, but the only functional Agent panel is Blanc-owned; persistence and handlers remain renderer-owned and there is no durable conversation/context handoff | Shared workspace contracts are frozen; provider runtime and main-owned persistence precede shell routing |
| Unified Reading workspace | Partial and collision-prone | Reading Finder and Novels remain separate routed components; both are already modified in the dirty tree | Defer until ownership reconciliation after shared foundations |
| ReadingLens Capture and Read | Partial | Main capture service, overlay, settings and tests exist; source still presents an overlay rather than the complete three-depth workflow | Defer until Lexicon + Reading contracts exist |
| Media shell / Liquid | Implemented in several layers but live release state still needs a dedicated regression audit | Mature Media shell/workspace components exist and many paths are already modified; live Electron session restored but Media was not changed in this slice | Independent post-foundation audit, serialized live verification |
| Remaining v1 surfaces | Unverified | Large dirty-tree overlap and stale documents prevent honest blanket status | Re-derive per route after the dependency tracks above |

## Slice 1 — shared vault adoption for AI and subtitle providers

Starting status: Gemini, DeepSeek, Jimaku and OpenSubtitles used feature-owned files and could write new plaintext secrets when OS encryption was unavailable.

Changed paths owned by this slice:

- `src/main/credentials/ai.ts`
- `src/main/credentials/subtitles.ts`
- `src/main/credentials/ipc.ts`
- `src/main/mining.ts`
- `src/main/subtitleProviderClients.ts`
- `src/shared/credentialRegistry.ts`
- `src/main/__tests__/credentialLegacyAdapters.test.ts`
- credential vault / registry tests already belonging to the uncommitted credential track

Behavior now established:

- New AI and subtitle credentials are written only through `credentials.dat` using the shared refusal policy.
- If OS encryption is unavailable, new writes fail and no plaintext file is created.
- Existing plaintext or encrypted legacy values migrate one provider at a time; the old value is removed only after the vault confirms an encrypted write.
- A legacy plaintext value is retained and remains usable if encryption is unavailable, avoiding silent credential loss without creating a new downgrade.
- Feature-specific clients read the same vault values; renderer status objects contain no secret field.
- Credential IPC validates both the registry id and declared field.
- Subtitle provider tests write their result metadata back to the central status.

Automated evidence:

- Focused post-slice: 5 files / 68 tests passed.
- Full suite: 433 files passed, 1 skipped; 5,782 tests passed, 6 skipped.
- Architecture and all i18n gates: pass with no new findings.
- `eslint` on the credential slice: pass.
- `git diff --check` on the credential slice: pass (line-ending notices only).

Live and visual evidence:

- Electron debug bridge cold-reloaded after restoring the renderer dev server; live route `http://localhost:5173/entry?id=567` mounted successfully.
- Settings -> API keys rendered six providers. Vault status and legacy feature APIs agreed: Gemini configured, DeepSeek absent, Jimaku configured, OpenSubtitles absent, Jiten absent; `canStore: true`.
- Renderer-safe audit contained no serialized secret value. Keyboard focus reached an enabled password input with the correct accessible label.
- Large screenshot: `debug/shots/win1-1786178653549.png` at 1264 x 821; no horizontal overflow in the settings pane and no broken controls.
- Compact screenshot: `debug/shots/win1-1786178676686.png` at 924 x 611. It exposes a pre-existing shell defect: a maximized 1264px Settings layout is clipped by the compact native viewport. This is not caused by credential CSS and remains open.
- In-app Browser/Playwright cannot mount the production renderer independently because Electron preload APIs are required (`playerBus.ts` fails on missing `window.api`). Therefore production Electron DOM/state and screenshots were captured through the permitted application debug bridge; no Computer Use, coordinate CUA, or `tab.cua` was used.

Remaining risk:

- Provider health, model selection, budgets/costs, caching, cancellation, streaming, retry and privacy are not yet one structured provider service.
- Compact shell clipping is a release-level visual defect outside this slice.

Checkpoint: `feat(credentials): centralize provider secrets in encrypted vault` (the final hash is reported outside this self-contained ledger). Generic Settings IPC/preload wiring remains uncommitted because those shared files contain unrelated user work; the specialized Jiten, AI and subtitle paths in this checkpoint are independently functional.

## Slice 2 — MAL OAuth token migration

Behavior now established:

- MAL access and refresh tokens are stored together in the central encrypted vault; `mal-tokens.json` retains only versioned expiry and username metadata.
- Former encrypted and plaintext token files migrate one-way after the vault confirms both fields were sealed.
- When OS encryption is unavailable, a new OAuth session is refused instead of written as plaintext. An existing legacy plaintext session remains readable and unchanged until safe migration is possible.
- Profile identity remains derived from Electron `userData`, and expiry/username metadata survives migration.
- Sign-out clears both vault fields and metadata. Existing refresh, disconnect, profile, and renderer-safe status tests remain green.
- The MAL registry row is now honestly vault-owned while keeping OAuth token field names out of the generic paste UI.

Automated evidence:

- Focused vault, MAL migration, MAL sync and registry suites: 4 files / 91 tests passed.
- `eslint` on all changed MAL/vault/registry paths: pass.
- Changed-path TypeScript filtering shows only the repository's known top-level-await test/configuration pattern; no new production error.
- `git diff --check` on the slice: pass (line-ending notices only).
- No live OAuth authorization was attempted: doing so would create or mutate a real external grant and is outside safe automated verification.

Checkpoint note: `src/main/malSync.ts` already contained unrelated user-owned MAL-3/MAL-4/MAL-7 work before this slice. Any checkpoint must stage only the token-storage hunks near the imports and `fileMalTokenStore`; those later hunks must remain unstaged.

## Slice 3 — scraper credential-reference migration

Behavior now established:

- Existing per-connection `passwordRef` values remain stable in scraper settings; their secret bytes now live under a private dynamic `scraper` namespace in the central vault.
- Reads migrate former `<scraperRoot>/credentials.json` entries one reference at a time and remove an old entry only after an encrypted vault write succeeds.
- New writes refuse unavailable OS encryption. A readable legacy encrypted reference remains usable and unmodified when central migration cannot encrypt.
- Clear removes both the vault field and any legacy entry; an undecryptable legacy value is treated as absent.
- No scraper provider, qBittorrent session, runtime, settings-schema or renderer contract changed.

Automated evidence:

- Focused scraper qBittorrent and central-vault suites: 2 files / 52 tests passed.
- `eslint` on the changed scraper credential and focused test paths: pass.
- `git diff --check` on the slice: pass (line-ending notices only).

## Luna Agent consolidation audit

The exact Luna Max read-only audit changed no files and made no commit. It confirmed:

- The local GGUF planner, typed operation registry, permissions, profiles, task lifecycle, memory, knowledge, queue, automations and scheduler are real foundations, not a first-class chat app.
- Blanc owns the only functional Agent panel and most adapters. Queue, memory, profiles and automations are renderer/localStorage-owned; scheduler triggers are broadcast to windows.
- Cloud AI clients are split between `aiProviderClient.ts` and a duplicate translation client; local Qwen translation and the local Agent maintain separate llama runtime semantics.
- There is no persistent conversation/message model, context shelf, attachment/provenance model, result-card effect contract or reliable cross-window contextual handoff.
- `agent` is absent from the shared desktop section union, `AppSection`, popout allowlists, desktop catalog, Command Palette and shortcut catalog.
- Declared operations exceed implemented adapters; route work must follow shared contracts, provider service, main-owned persistence and a central handler registry.

The source-derived implementation order is: contracts -> provider/runtime service -> main-owned persistence -> central handler registry -> first-class route -> contextual handoffs -> help/automation -> grounded knowledge expansion. Shell routing must preserve the desktop grid, taskbar/focus behavior, popout deduplication and dragging layer.

## Slice 4 — versioned Agent workspace contracts

New shared contracts now define:

- versioned conversations, messages, modes, attachments and provenance-bearing context shelf items;
- explicit local/cloud provider targets, cloud and sensitive-context consent, input/output budgets, cache/retry/timeout/streaming policy and provider disclosure metadata;
- safe result-card effects for navigation, context opening, step approval, undo and save;
- bounded persistence normalization that rejects future schemas, malformed nested data, unknown providers and arbitrary persisted effects;
- a privacy decision boundary that refuses cloud-disabled, undisclosed-sensitive and over-budget requests instead of silently crossing or truncating the boundary.

Automated evidence:

- Focused Agent workspace and existing permission/queue suites: 3 files / 26 tests passed.
- `eslint` and `git diff --check` on the new shared contract paths: pass.

## Exact next slice

Implement the main-owned provider runtime behind these contracts: credential lookup, provider health, model selection, retry/cancellation, usage/cost and budget reporting, cache ownership, streaming events and honest local-Qwen fallback. Preserve translation batch/concurrency/temperature/progress behavior behind golden compatibility tests before removing its duplicate client.
