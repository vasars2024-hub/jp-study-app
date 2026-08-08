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
| Professional Lexicon core | SQLite/FTS adoption and Workbench compatibility foundation integrated | Canonical lookup now bridges into the existing `DictResult` surface with legacy fallback and pitch/frequency preservation; route aliases and input-scale contracts exist, while Dictionary and Translate remain separate UI routes | Adopt the contracts in a first-class Workbench shell after dirty route ownership is reconciled |
| Central AI Agent | Cloud/local provider routing and atomic main-owned workspace store foundations complete; first-class app genuinely missing | Privacy-gated cloud execution, actual local-Qwen chunk streaming, explicit no-key fallback and retention-aware disk persistence exist, but shell/bridge handlers remain absent and the old queue/memory implementations remain renderer-owned | Add true cloud streaming, then wire store IPC only with the first consuming Agent shell |
| Unified Reading workspace | Versioned route/library/handoff foundation integrated; UI remains partial and collision-prone | Reading Finder and Novels still render separately, but now share a bounded contract for aliases, deep links, work/edition/source/cover/progress cards and reader handoffs | Reconcile dirty Finder/Novels ownership before building the single shell |
| ReadingLens Capture and Read | Partial | Main capture service, overlay, settings and tests exist; source still presents an overlay rather than the complete three-depth workflow | Defer until Lexicon + Reading contracts exist |
| Media shell / Liquid | Main-tree Media shell repair reviewed and integrated; Liquid remains deliberately unverified | Player, Video and Music now route through the shared shell while local library, global search, discovery and explicit Seanime handoff remain reachable | Keep Liquid verification serialized and separate from the completed shell repair |
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

## Luna Media shell repair and primary-tree reconciliation

The exact Luna Max task worked in an isolated worktree and produced commit `99c874791810dd6a3f984b25e55518c8d6c2566a`. The primary orchestrator reviewed its complete four-path diff and integrated only the Luna-owned hunks. A pre-existing F16 reach-check change in `mediaCenterIntegration.test.ts` remains unstaged and outside this checkpoint.

Behavior now established:

- Player, Video and Music entry points all render the shared Media shell instead of replacing local Media with the adopted workspace.
- The sidebar, history/navigation, global search, local library and discovery remain one surface.
- Seanime is an explicit, availability-aware handoff from that surface; it does not hide local Video or Library navigation.
- Primary review removed Luna's automatic item-play handoffs because the dirty main tree already owns that behavior inside `playItem`; the explicit Seanime controls remain and a single click can no longer dispatch the workspace twice.
- The app-chrome body fills its window, top-bar actions can wrap, and compact pop-outs collapse secondary labels while preserving every primary route.

Automated evidence:

- Focused primary-tree verification: 4 files / 68 tests passed.
- `eslint` on the changed TSX and integration-test paths: pass.
- `git diff --cached --check`: pass.
- Exact checkpoint scope: `AppSection.tsx`, `MediaCenterView.tsx`, `mediaCenter.css` and the Luna-owned hunks of `mediaCenterIntegration.test.ts`.

Live Electron evidence:

- The real Electron renderer showed the repaired local Library with 30 imported items, persistent sidebar, global search and explicit Media workspace source.
- Discover rendered its connected search/filter controls and live recommendations without losing the Media shell.
- The Media pop-out remained usable at 780 x 640: navigation collapsed to icons, search and local library remained visible, and no route disappeared.
- Clicking the Seanime source opened the adopted workspace dialog with sidecar-ready status and Library/Readiness/Review navigation.
- No new renderer or main-process error was recorded during reload, navigation, resize or handoff. The only error in the bridge ring predates the slice and records the dev server being unavailable during the original application boot.
- Liquid verification was not started, as required.

## Slice 5 — main-owned cloud provider runtime and translation convergence

Behavior now established:

- Gemini and DeepSeek request shaping, vault-backed credential lookup, model selection, timeouts, external cancellation, retry classification/backoff, lifecycle events and renderer-safe result metadata are owned by one main-process runtime.
- Input and caller-supplied cost budgets fail before a provider receives context. Usage tokens and estimated cost are reported when the provider returns usage and the caller supplies current pricing; the runtime does not hard-code temporally unstable prices.
- Session caching uses a SHA-256 request key and never places prompt text in the cache key exposed to callers. Failed and cancelled responses are not cached.
- Malformed successful responses are classified as non-retriable provider errors; observer/telemetry exceptions cannot change execution semantics.
- Existing mining, sentence analysis, Translate analysis and Media assistant wrappers now traverse the shared runtime through `aiProviderClient.ts`.
- Cloud EPUB translation no longer owns duplicate Gemini/DeepSeek fetch code. Its 40-item batches, six-worker ceiling, strict grouping, temperature, progress and cancellation gate remain behind compatibility tests.

Automated evidence:

- Focused provider runtime, cloud-translation compatibility and translation-guard suites: 3 files / 14 tests passed.
- Full post-runtime suite: 437 files passed / 1 skipped; 5,813 tests passed / 6 skipped.
- Architecture baseline passes after connecting the Agent policy contract to the production runtime; no baseline file was weakened or updated.
- `eslint` on the runtime, both migrated clients and their tests: pass.
- Repository-wide TypeScript remains red on the recorded baseline; filtered diagnostics contain no changed provider-runtime path.
- `git diff --check` on the slice: pass (line-ending notices only).

Remaining boundary:

- This is the unified cloud execution slice, not a claim that the full Agent provider layer is complete. Local Qwen execution selection, true token streaming, privacy-reviewed persistent response caching and live provider health probes still require dedicated adapters.
- No real cloud request was issued; focused tests use deterministic provider responses and verify exact outgoing request contracts without spending user funds or transmitting user content.

## Luna Lexicon Workbench slice and primary review

The isolated exact Luna Max assignment produced commit `9e6e82dfe308e7f5a953c9a05a7484baceffd6f2` across five Lexicon-owned paths. Primary review applied the complete diff, then corrected two integration hazards before checkpointing: SQLite lookup now precedes legacy Yomitan initialization, and converted results retain the existing popup's pitch/frequency metadata instead of silently regressing it.

Behavior now established:

- `lookupTerm` attempts the canonical SQLite/FTS any-to-any service first and falls back to the established Yomitan/Jisho path on an empty database or read failure.
- The unified lookup adapter preserves sourced glosses, dictionary attribution, structured HTML, multilingual gloss languages, commonness and de-inflection in the existing `DictResult` contract.
- Legacy pitch and corpus-frequency fields are restored after conversion while the unified lookup schema lacks first-class metadata fields.
- Shared Workbench contracts normalize `dictionary` and `translate` as compatibility aliases for a future `lexicon` route and deterministically classify character/word/sentence/paragraph/document input without invoking a model.
- Dirty Dictionary/Translate renderer routes, shell routing, preload and shared catalogs were not edited.

Automated evidence:

- Focused Lexicon adapter, Workbench contract, dictionary database/lookup/migration/CEDICT and real-data suites: 7 files passed / 1 skipped; 103 tests passed / 6 skipped.
- Architecture baseline: pass through real production use of Workbench normalization; no baseline update.
- Targeted ESLint: no errors; seven existing `any` warnings remain in `dictionary.ts`.
- Electron verification remains deferred until a Workbench route exists; this slice has no new UI to verify honestly.

## Slice 6 — main-owned Agent workspace persistence

Behavior now established:

- The versioned Agent workspace has one atomic main-process JSON store under the application user-data root, with bounded normalization on every read and write.
- Missing, corrupt and future-version documents fail closed to an empty versioned workspace.
- Context and attachments marked `retained: false` never cross a process restart. Their message/provider/card references and `open-context` actions are pruned with them, preventing restored conversations from exposing dangling or session-only data.
- Deleting the active conversation selects the next retained conversation deterministically; clearing history writes the canonical empty state.
- The store is exported from the production local-Agent main boundary. IPC handlers were deliberately not registered yet: the architecture gate rejected channels without a renderer consumer, and the dirty preload bridge remains outside this slice.

Automated evidence:

- Focused workspace-store and shared Agent contract suites: 2 files / 13 tests passed.
- Architecture baseline: pass; no dead IPC and no test-only module.
- Targeted ESLint and `git diff --check`: pass.

Remaining boundary:

- The first Agent shell must add typed preload/renderer consumers in the same checkpoint as `get/save/delete/clear` handlers so the bridge never contains dead or phantom channels.
- Conversation history is local application data, not a credential. Session-only sensitive context is excluded by retention policy; an explicit encrypted-history mode remains a future privacy feature rather than an implicit claim in this store.

## Luna unified Reading workspace foundation and primary review

The isolated exact Luna Max assignment produced commit `87dd97c` across `readingWorkspace.ts`, its focused tests and a narrow production re-export from `readingIpc.ts`. Primary review applied the complete three-path diff, then added strict remote-cover URL validation, dangerous-scheme rejection and a 5,000-record normalization bound before integration.

Behavior now established:

- A versioned Reading route vocabulary covers Home, Discover, Library, Continue, Plan, Imports and Sources, with compatibility aliases for Reading Finder and Novels.
- Canonical `reading://workspace/...` deep links preserve work, edition and local item identity and reject unknown future schemas.
- Local EPUB, manga and web-inbox records project into one bounded card contract with work/edition identity, source provenance, availability, cover state, precise locator/progress, learner level, known ratio and tags.
- Persisted/nested records are normalized defensively: invalid editions and locators are rejected or nulled, out-of-range learner metadata is bounded, dangerous remote cover schemes are rejected, and malformed/duplicate library records are dropped.
- Existing dirty Finder, Novels, reader, library, handoff, shell, preload and i18n paths were left untouched.

Automated evidence:

- Primary Reading regression set: 12 files / 109 tests passed, including workspace/model/order, fetch/charset, manga acquisition/image, Seanime bridge, catalogue honesty, garden progress and architecture.
- Targeted ESLint and `git diff --check`: pass.
- No Electron verification was performed because this contract slice creates no new rendered shell; visual acceptance remains pending with UI adoption.

## Slice 7 — honest Agent cloud/local routing and local streaming

Behavior now established:

- One Agent provider router applies the shared privacy decision before either local or cloud execution receives a prompt.
- Explicit local policies run through the installed Qwen runtime with timeout, external cancellation and real `onTextChunk` delivery.
- A missing cloud credential can fall back to local Qwen only when the caller explicitly enables fallback. Authentication, budget, privacy, persistent-cache and upstream failures never silently switch providers.
- Every result discloses the target that actually received the prompt, selected context/attachment ids, timing, cloud/local status and provider-reported cost when available.
- Cloud responses remain honestly labeled `buffered`; this slice does not pretend that lifecycle events are token streaming.

Automated evidence:

- Focused provider router/runtime, translation guard, Agent policy and architecture suites: 5 files / 30 tests passed.
- Full accumulated suite: 442 files passed / 1 skipped; 5,839 tests passed / 6 skipped.
- Targeted ESLint: no errors; one unrelated existing non-null warning remains in `translate.ts`.
- Repository-wide TypeScript remains red on the recorded baseline; no diagnostic references a changed Agent-provider path.

Remaining boundary:

- Gemini/DeepSeek token streaming still needs provider-specific stream parsers and cancellation tests before the Agent UI may offer a cloud streaming toggle.
- Local streamed chunks are runtime output; the final returned text still passes through the existing Qwen cleanup boundary.

## Luna ReadingLens workflow slice and primary review

The isolated exact Luna Max assignment produced commit `f7b0cb342cbc6d9bb00d1de4db1f1b63e7bde618` across the clean Lens overlay and two new shared contract/test paths. Primary review applied the complete diff, then corrected the screenshot boundary so oversized, malformed and active-content image data is rejected rather than retained after truncation.

Behavior now established:

- OCR output enters a versioned, bounded capture envelope with source, engine, language, stable capture identity, line geometry/confidence and optional image evidence.
- Capture normalization caps text, line count, line size, coordinates and metadata; invalid boxes are dropped and confidence is clamped.
- Screen, clipboard, image and text sources share one quick -> compact -> workspace depth contract.
- Compact handoffs reuse the canonical Lexicon input classifier, while paragraph/document captures resolve to a typed Reading workspace target without claiming that the protected bridge or route consumer already exists.
- The production ReadingLens overlay now uses the shared normalized capture for OCR rendering and automatic AI context instead of maintaining a second passage-joining path.
- Screenshot evidence accepts only bounded JPEG, PNG or WebP base64 data URLs. Oversized, malformed, local-file and SVG/active-content inputs fail closed.

Automated evidence:

- Primary focused regression: 5 files / 76 tests passed across the new contract, Lens lifecycle, Lens i18n, Lexicon classification and architecture baseline.
- Targeted ESLint and `git diff --check`: pass (line-ending notices only).
- Repository-wide TypeScript remains red on the documented inherited baseline; Luna's filtered output contained no diagnostic for the three owned paths.

Live Electron evidence:

- The real full-screen Lens opened from the production main window and rendered its localized select-screen affordance at 1920 x 1080.
- Full-screen capture progressed through `Reading...` into bounded OCR line overlays with Dictionary AI, AI OCR, re-scan, Manga mode and new-region controls intact.
- Selecting AI OCR opened the compact sentence-analysis panel and populated it from the shared normalized passage contract.
- Closing the Lens hid the overlay window and returned control to the main Study window.
- No new renderer or main-process error was recorded; the sole bridge-ring error predates this slice and records the dev server being unavailable at original application boot.

Remaining boundary:

- The workspace result is a typed target only. A future clean route/bridge consumer must perform the full Reading workspace navigation and preserve provenance without introducing dead IPC.
- Imported image/text and clipboard producers can now adopt the contract, but were not wired through dirty preload or shell paths in this checkpoint.

## Slice 9 — honest Gemini and DeepSeek token streaming

Behavior now established:

- Agent cloud requests stream only when both the frozen provider policy enables streaming and the caller supplies a chunk consumer.
- Gemini uses the official `streamGenerateContent` SSE endpoint; DeepSeek uses streamed chat completions with final usage requested through `stream_options.include_usage`.
- Both parsers incrementally decode SSE boundaries, aggregate the final answer, retain provider usage/cost metadata and ignore presentation-observer failures.
- A session-cache hit remains honestly reported as buffered. Cloud delivery metadata now reflects the runtime result instead of being hard-coded.
- Timeout and external cancellation remain active through the entire response body, not merely until response headers arrive.
- A retriable network failure may retry only before visible text is delivered. Once a chunk reaches the UI, the failure becomes non-retriable so a second attempt cannot duplicate partial output.

Automated evidence:

- Focused provider/router/policy/architecture regression: 4 files / 30 tests passed.
- Targeted ESLint, `git diff --check` and changed-path TypeScript filtering: pass; no changed-path diagnostic.
- Full accumulated suite: 442 files passed / 1 skipped; 5,850 tests passed / 6 skipped, with one unrelated `scraperLogBus` rollover test timing out under full-suite contention.
- The timed-out scraper suite passed independently: 1 file / 27 tests.

Verification boundary:

- No real provider request was sent and no user content or funds were used. Deterministic SSE fixtures verify endpoint/body shape, chunk delivery, usage, observer isolation and retry-after-partial-output behavior.
- Provider API contracts were checked against current official Gemini and DeepSeek documentation before implementation.

## Slice 10 — typed Agent workspace bridge and first consuming shell

The exact Claude Opus 5 / extra-high backup assignment completed in the isolated
`codex/claude-agent-shell` worktree as commit
`5689ca7d0978e2c8d8987c4efdd31d7c0fb16ad3`. The primary orchestrator reviewed
the complete 22-path diff, reran its tests, and integrated only its Agent-owned
hunks into the dirty main tree. Existing localized pop-out work in `App.tsx`
was preserved and the Agent entry was adapted to that live key map.

Behavior now established:

- Four versioned `load/save/delete/clear` channels connect the existing
  main-owned Agent store to matching preload methods and the first renderer
  consumer. Main errors cross the boundary only as closed, typed failure codes.
- Boundary normalization rejects malformed responses and future workspace
  schemas. Saving still traverses the existing bounded store; no renderer-owned
  persistence or second conversation model was introduced.
- Agent is a first-class desktop, Start-menu, taskbar and pop-out route. The
  Fluent shell renders loading, empty, ready and recoverable error states;
  persisted conversation creation, selection, pinning, deletion and history
  clearing; context/provenance and provider disclosure; keyboard rail movement;
  reduced motion; and compact container-query layout.
- The shell deliberately has no prompt composer yet because provider execution
  has no renderer bridge. It states that boundary instead of presenting a dead
  send control. Persistent response caching remains refused until encrypted
  retention exists.

Automated evidence:

- Focused workspace bridge/store/router/shell regression: 7 files / 55 tests
  passed.
- Architecture, desktop routing/personality and i18n regression: 6 files / 54
  tests passed.
- ESLint passes across the new Agent modules, their tests, store registration,
  route consumer and four locale additions. The wider dirty-path lint still
  reports two inherited adjacent-overload errors near line 1460 of
  `window.d.ts`, outside this slice.
- Repository-wide TypeScript remains red on the recorded inherited baseline;
  filtered diagnostics contain no Agent workspace, shell, client or IPC path.
- `git diff --check` on the Agent scope passes (line-ending notices only).

Live Electron evidence:

- Electron Forge rebuilt the real main and preload targets, then a production
  relaunch exposed all four typed Agent methods. Agent opened from the real
  Start menu as a focused taskbar-managed desktop window.
- The initial empty state created a conversation through the production bridge.
  Pinning changed the accessible control to “Unpin conversation”; a full
  main-process relaunch changed the Electron PID and restored the same pinned
  conversation from the main-owned store.
- Delete required a second “Confirm delete” action. After confirmation the shell
  returned to the canonical zero-conversation state, so the acceptance run left
  no synthetic conversation in the user's history.
- Before the Forge rebuild, the hot renderer briefly ran against the older
  preload and correctly rendered the recoverable “not connected” state. It did
  not throw or pretend persistence was available.
- At 782 x 513 the shell's scroll dimensions exactly matched its bounding box:
  no horizontal or vertical overflow, no clipped controls, and no redundant
  internal window title. The debug bridge recorded no new error through create,
  pin, restart, restore and delete.
- Final live screenshot:
  `debug/shots/win1-1786189661979.png`. Electron control remained serialized;
  the Claude task performed no live verification.

## Exact next slice

Add the first consumed provider execution/stream bridge and composer as one
typed slice. Reuse the existing privacy-gated Agent provider router, expose
cancellation and honest local/cloud delivery metadata, and keep every new
channel paired with the shell consumer and focused tests. Do not add persistent
response caching.
