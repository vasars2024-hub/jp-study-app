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

## Slice 11 — grounded Agent execution bridge and real composer

Behavior now established:

- A typed main/preload/renderer execution bridge connects the Agent shell to the
  existing privacy-gated provider router. Every channel has a live renderer
  consumer; credentials remain main-only and runtime exception prose never
  crosses the boundary.
- Main owns the entire message transaction. It writes the user message and a
  streaming assistant placeholder before provider execution, then re-reads the
  latest workspace and persists complete, failed or cancelled terminal state.
  A conversation deleted during execution is not resurrected.
- Local Qwen is the default. Selecting Gemini or DeepSeek is an explicit
  per-request cloud choice with a visible disclosure; missing-key local fallback
  is separately opt-in. Persistent response caching is rejected at request
  normalization until encrypted retained-response storage exists.
- Context is formatted into the actual provider prompt and the fully composed
  prompt is rechecked against the input budget. Stream chunks are delivered
  only to the requesting renderer. Cancellation is scoped to that renderer,
  and executions are serialized per conversation so main-owned store writes
  cannot race.
- The first prompt gives an untitled conversation a bounded title. The composer
  exposes honest local/cloud choices, streaming/cancel state and localized
  closed-error groups without placing secrets or provider error prose in the
  renderer.

Automated evidence:

- Focused execution/router/workspace/architecture regression: 7 files / 52
  tests passed after the final ownership and serialization hardening.
- The broader Agent workspace, desktop and i18n run exercised 14 files / 105
  tests: 104 passed and catalog hygiene found three verbatim-English cloud
  labels in Japanese. After localized cloud qualifiers were added in Japanese,
  Russian and Chinese, the affected 5 files / 46 tests passed; the final full
  14-file gate then passed all 105 tests.
- Targeted ESLint and `git diff --check` pass. Repository-wide TypeScript remains
  red on its inherited baseline (424 output lines); filtered diagnostics contain
  zero changed Agent execution, shell, preload, window declaration or provider
  router paths.

Live Electron evidence:

- Electron Forge rebuilt the real main, preload and renderer targets. The live
  preload exposed `agentExecutionRun`, `agentExecutionCancel` and
  `onAgentExecutionEvent` beside the four workspace methods.
- Vault-safe metadata confirmed DeepSeek was unconfigured. A harmless prompt
  sent through the rendered DeepSeek Flash selection persisted a complete user
  message and failed assistant message with the localized missing-credential
  result; no provider request, user credential or funds were used.
- At the 924 x 611 compact viewport the 782 x 513 Agent shell had no horizontal
  overflow. Its dedicated canvas scrolled to its exact 130-pixel maximum, making
  the provider selector, fallback control, prompt, error and send action
  reachable. Screenshot: `debug/shots/win1-1786191378058.png`.
- The synthetic acceptance conversation was deleted through the confirmed UI
  path, returning the main-owned store to zero conversations. The fresh debug
  error ring remained empty.

Parallel-session reconciliation:

- An accidentally resumed isolated session produced commits `1211b00` and
  `83c4906` plus an uncommitted operational-store draft. None changed the main
  worktree or index. The duplicate composer was not integrated: it downgraded a
  forbidden persistent-cache request to `off` and did not serialize concurrent
  writes to one conversation.
- Review of `83c4906` confirmed that its registry honestly extracts 35 real
  adapters and removes three false-success handlers, but its 17 unavailable
  operations are still advertised by the system prompt and profile editor. The
  isolated branch remains reference-only until availability is consumed by
  discovery, planning and profile UI in the same reviewed slice.

## Centralized Agent capability registry

The renderer's inline tool handlers are now one central registry
(`src/renderer/agentToolRegistry.ts`), and availability is consumed end to end
rather than merely declared:

- `createCentralAgentToolRegistry` owns every installed adapter. The 28
  operation ids previously declared inside `BlancReadyToolPanels.tsx`'s handler
  memo were read back out of the new registry after extraction: 28 of 28
  present.
- `agentToolCapabilityMatrix` throws on any declared operation that is neither
  installed nor explicitly classified, so a silently unhandled operation cannot
  reach the profile UI or the model.
- The profile editor disables unavailable operations, names the reason in the
  control's `title`, prunes them from `enable all` and from any committed
  approval set, and reports the unavailable total.
- `LocalAgentPanel` passes the installed ids into the plan request;
  `normalizeAvailableOperations` (main) re-validates them and
  `selectLocalAgentApprovedOperations` intersects them with the profile and the
  permission level before the system prompt is built. The model is never
  offered an operation that would fail at execution.

Measured catalog — re-derived from source this session, not inherited:

- `AGENT_TOOL_OPERATIONS` declares **53** operations.
- `UNAVAILABLE` classifies **17**, and all 17 are declared operations.
- Installed adapters therefore number **36**.
- The parallel session's "52 operations / 35 real" summary and this ledger's
  previous "35 real operations" wording were both stale. 53/17/36 is the
  measured set. A first count of 49 was a measurement error on this side: the
  regex required the id on the same line as `operation(`, so multi-line
  declarations were missed. Count `operation(` occurrences, not id literals.

Automated evidence:

- Full suite, run against the committed checkpoint: `npx vitest run` → 452
  files (451 passed, 1 skipped) and 5,917 tests (5,911 passed, 6 skipped),
  0 failed.
- `npx vitest run agentToolRegistry localAgentProfileOperationsUi
  localAgentZeroArgumentPlan localAgentPrompt agentWorkspace agentExecution
  agentProviderRouter localAgentRuntime` → 13 files, 84 tests, 0 failed.
  (This is a different selection from the 12 files / 121 tests quoted by the
  previous session; totals are this run's own measurement.)
- `npx eslint` over the seven registry-owned source paths: clean, exit 0.
- `node tools/i18n-check.cjs` → exit 0; all 8,778 English keys translated.
- `node tools/architecture-audit.cjs` → exit 0; 1,553 modules, 18 findings,
  nothing new.
- `git diff --cached --check`: clean.

Live Electron evidence — Blanc Toolbox, debug bridge, single controller:

- The panel was opened through the app's own `toolbox:select-tool` event, not
  coordinate control. The editor rendered **53** operation checkboxes: **36**
  enabled and **17** disabled, matching the source measurement exactly.
- Each unavailability reason surfaced on its own control:
  `dictionary.explain-grammar` → `dedicated-analysis-required`,
  `flashcard.schedule-reviews` → `false-success-stub-removed`,
  `anime.search` → `adapter-not-implemented`. All three were disabled and
  unchecked; `dictionary.lookup` stayed enabled and checked.
- Both new catalog keys rendered as localized text — "17 declared operations
  unavailable", and 17 controls labelled "Unavailable" — with zero raw-key
  leaks.
- localStorage was snapshotted before the run and asserted byte-for-byte equal
  afterwards; the two keys the navigation created were removed.

Slice boundary: the four i18n catalogs are shared with unrelated in-flight
work, so only the `blanc.agent.operations.*` hunks were staged (en +5, ja +4,
ru +7, zh +4). Roughly 1,250 lines of foreign catalog additions remain
unstaged, as does the user-owned F16 reach-check hunk in
`src/renderer/__tests__/mediaCenterIntegration.test.ts`.

## Main-owned Agent operational state

The Agent's task queue, memory and automations were three renderer-owned
`localStorage` keys, each with its own module and its own per-window `fallback`
variable. They are now three sections of one versioned main-owned document,
`<userData>/agent/operational-v1.json`, written atomically through
`src/main/agentOperationalStore.ts`.

Three defects went with the old layout, and each has a specific replacement:

- **No cross-window truth.** Two windows kept two copies and the last writer
  won. Main now broadcasts `agentOperational:changed` to every window except the
  one that caused the write, and the renderer client re-fires the same three
  `CustomEvent`s the old stores fired — so existing consumers gained
  cross-window updates without changing a call site.
- **The scheduler depended on a renderer being alive.** `main`'s automation
  scheduler only knew a schedule if some window had pushed it over
  `localAgent:syncAutomations`. `main/localAgentScheduler.ts` now subscribes to
  the store directly. The push channel had no caller left and was removed end to
  end — handler, preload method and `window.d.ts` declaration — rather than left
  as a dead channel.
- **No atomicity or retention.** Writes are temp-file-plus-rename at `0o600`.
  Terminal queue rows (completed, failed, cancelled) are pruned past 30 days;
  queued, running and paused rows are never pruned by age, so the 100-item cap
  can no longer be reached by history and evict live work.

Shape of the renderer half: the consumers are synchronous —
`loadLocalAgentMemory()` is called inside a tool adapter, and two panels seed
`useState` from a plain call — while the owner is now asynchronous and in
another process. `renderer/agentOperationalClient.ts` holds a synchronous
snapshot over the main-owned document: hydrate once per window, read
synchronously, write optimistically, persist through a single-flight loop that
always sends the latest state, and apply main's push without echoing it back.

Migration is one-way and latched by `legacyMigratedAt` inside the document, not
by file existence — a crash between main committing the file and the renderer
calling `removeItem` would otherwise discard real data next to a valid empty
store. Adoption is per-section and only into an *empty* section, so a second
window replaying its stale `localStorage` cannot roll back what main already
owns. No code path writes a legacy key again.

Execution-time authorization is untouched. `runAgentTaskStep` remains the
renderer's one execution boundary and still re-checks permission and the profile
allow-list, including for queued work restored from the new store.

Automated evidence:

- Full suite against the final tree: `npx vitest run` → 456 files (455 passed,
  1 skipped) and 5,978 tests (5,972 passed, 6 skipped), 0 failed. The 452-file /
  5,917-test baseline plus this slice's 4 new files and 61 new tests accounts
  for the difference exactly.
- New focused coverage: `agentOperationalStore` 12, `agentOperationalIpc` 20,
  `agentOperationalClient` 19, `localAgentSchedulerStore` 8, and 2 added to
  `localAgentQueueRun`.
- Focused agent regression: `npx vitest run localAgentQueueRun agentToolRegistry
  localAgentProfileOperationsUi localAgentZeroArgumentPlan localAgentPrompt
  agentWorkspace agentExecution agentProviderRouter localAgentRuntime
  agentOperational localAgentSchedulerStore` → 18 files, 157 tests, 0 failed.
- `npx eslint` over the 16 slice-owned paths: exit 0, clean.
- `node tools/i18n-check.cjs` → exit 0; 8,778 English keys translated. This
  slice added no UI string, so no catalog was touched and the four shared
  catalogs stay entirely foreign — none staged.
- `node tools/architecture-audit.cjs` → exit 0; 1,562 modules, 18 findings,
  nothing new. In particular no `dead-ipc` for the three added channels and none
  for the removed one.

Two defects the tests caught before the live run, both in the client:

- A pushed document woke *every* section's subscribers, because normalization
  allocates fresh objects and the change check was reference identity. Sections
  whose content is unchanged now keep the previous reference.
- An unusable push was **adopted**. `normalizeAgentOperationalState` answers an
  unknown version with the empty document — correct for a cold read, data loss
  for a push — so a malformed broadcast would have wiped the window's document
  and persisted that emptiness on the next edit. The version is now checked
  before normalization, exactly as a save is guarded in main.

Live Electron evidence — Forge rebuild, real relaunch, debug bridge only:

- Preload exposed `agentOperationalLoad`, `agentOperationalSave`,
  `agentOperationalMigrateLegacy` and `onAgentOperationalChanged`;
  `localAgentSyncAutomations` was gone. Before the rebuild the hot renderer
  carried the new preload against the old main and correctly reported
  `No handler registered for 'agentOperational:load'` rather than pretending.
- Three legacy documents were seeded into `localStorage` — one queued task, two
  memory entries, one daily automation. After a Forge rebuild and a
  PID-changing relaunch (main 27104 → 25960) all three appeared in
  `operational-v1.json` with `legacyMigratedAt` set, and all three legacy keys
  were absent from `localStorage`.
- **A gap the live run found and the tests could not:** `renderer/blancMain.tsx`
  is the Blanc window's own entry point and never hydrated, so the window that
  actually hosts the Agent panel rendered an empty queue while the store was
  full. Fixed in this slice. After the fix the panel rendered the migrated row
  "acceptance: list decks · Queued · 5" with Run/Pause/Cancel/Prioritize, and
  the migrated schedule "Acceptance schedule · Daily at 03:00 · Read only".
- Cross-window: Pause clicked in the Blanc panel changed the row to Paused, and
  the Study OS window received exactly one push — the `queue` section only,
  carrying `accept-task-1:paused`. Memory and automations did not fire. Main's
  file matched.
- Restart: main 25960 → 67804. The paused status, both memory entries and the
  automation all restored, and `legacyMigratedAt` was unchanged — no
  re-migration, and no legacy key resurrected.
- Scheduler, with the Blanc window closed and no renderer push channel in
  existence: writing a due automation through the store made main broadcast
  `localAgent:trigger` to the panel-less window. The schedule is main's.
- Residue: the store was returned to empty sections (the migration latch is
  genuine history and was kept); `localStorage` was compared against a pre-run
  snapshot and is identical at 76 keys, with the two keys Blanc navigation
  created removed; the `agent` directory holds no temporary file; the debug
  error ring reported 0 errors.

Verification boundary: no provider request was made and no model was loaded —
the acceptance exercised persistence, the bridge and the scheduler, not
inference. The automation used for the scheduler proof was read-only and its
trigger was delivered to a window with no Agent panel mounted, so nothing
planned or executed.

Slice boundary: `src/preload.ts` (218 foreign lines / 11 hunks),
`src/renderer/window.d.ts` (137 / 8) and `src/renderer/main.tsx` (3 / 2) are
shared with unrelated in-flight work and were staged hunk-scoped. `src/main.ts`
carries 53 foreign lines and was deliberately **not** touched: the scheduler
kept its exported names so the shared entry point needed no edit. The four i18n
catalogs and the user-owned F16 reach-check hunk in
`src/renderer/__tests__/mediaCenterIntegration.test.ts` remain unstaged.

## The context shelf gets a producer

The Agent's context pipeline was complete except for its first link. The type,
`normalizeContext`, `evaluateAgentProviderPrivacy`, the prompt formatting in
`main/agentProviderRouter.ts` and the read in `main/agentExecutionIpc.ts` all
existed and were tested — but **no production code ever built an
`AgentContextItem`**. Every conversation's `context` was permanently `[]`, the
shell's disclosure always read "no context", and the model never received the
word, passage or cue the user was looking at.

Re-derived from source before acting: `conversation.context` is already
main-owned, already persisted and already formatted into the prompt, so this
slice added **no IPC channel at all**. It is a producer, a surface and a
hand-off over the bridge that was already there.

- `shared/agentContext.ts` builds normalized items. Two rules are encoded rather
  than left to call sites: sensitivity has a **floor per kind** that a producer
  may raise but never lower (otherwise a surface could mark a reading passage
  `ordinary` and walk it past the cloud privacy boundary), and retention is
  refused outright above `ordinary`.
- The shelf is bounded at 12 and keyed by identity, so looking a word up twice
  is one entry, not two.
- `AgentWorkspaceShell` renders the actual items — kind, label, preview, source,
  sensitivity and retention — with a per-item remove, instead of the three
  counts it showed while nothing could produce an item.
- `renderer/agentContextHandoff.ts` is the first producer: the Dictionary popup's
  "Ask the Agent" attaches the entry and opens the Agent conversation. Track 3
  requires that contextual AI buttons hand off to the *same* conversation rather
  than keeping a hidden history, and this writes into the one main-owned
  workspace.

Automated evidence:

- Full suite: `npx vitest run` → 458 files (457 passed, 1 skipped) and 6,027
  tests (6,021 passed, 6 skipped), 0 failed. Against the previous checkpoint's
  456 / 5,978 that is +2 files and +49 tests, which reconciles exactly:
  `agentContext` 25 and `agentContextHandoff` 14 in new files, plus 10 added to
  `agentShellModel`.
- `node tools/i18n-check.cjs` → exit 0; 8,795 English keys translated, 17 added
  per language by this slice.
- `node tools/architecture-audit.cjs` → exit 0; 1,566 modules, 18 findings,
  nothing new.
- `npx eslint` over the eight slice-owned paths: exit 0.

Two defects the live run caught that the tests could not, both fixed here:

- **The store erased the hand-off it was supposed to deliver.**
  `prepareAgentWorkspaceForPersistence` drops every context item that is not
  `retained` — correct, since session-only material must not cross a restart —
  but the hand-off's only route to the shell is a save *through* that filter. The
  first live attempt persisted the conversation with `"context": []`. A
  dictionary entry is reference data at the `ordinary` floor, so it is now
  retained, which is both permitted by the builder and honest. Pinned by a
  regression test that runs the item through the real store function.
- **An already-open Agent never re-read.** The shell loads once on mount and the
  workspace bridge has no change push, so handing off into an open Agent wrote
  the context and the surface went on reporting "0 conversations" while the store
  held one. Re-opening the route only focuses the window, so that could not be
  the signal. A window event now announces the change and the shell reloads on it.

Live Electron evidence — renderer-only slice, reload rather than rebuild:

- With the Agent **already open against an empty store** — the exact failing
  case — a hand-off attached and the shelf appeared without any further
  navigation: 1 item reading "Dictionary · 食べる · Ordinary · Kept ·
  昨日寿司を食べました。 · From dictionary", and the counts "Kept after restart
  1 / This session only 0 / Marked sensitive 0". Zero raw `agent.context.*` key
  leaks.
- The item reached `<userData>/agent/workspace-v1.json` intact, with
  `sensitivity: "ordinary"` and `retained: true`.
- Remove carried the localized accessible name "Remove 食べる from context",
  emptied the shelf to "No context is attached." and took the item out of the
  main-owned file.
- Residue: the workspace was cleared back to zero conversations; `localStorage`
  is identical to the pre-run snapshot at 76 keys; the debug error ring reported
  0 errors.

Verification boundary: no provider request was made. The path from
`conversation.context` into the prompt is main's, and was already covered by
`agentProviderRouter` tests; this slice proved the link that was missing, which
is producer → store → shell.

Known boundary this slice creates, and it is the next thing to fix: because
retention is refused above `ordinary`, and because the only route to the shell
runs through a store that drops non-retained context, **personal and sensitive
context cannot reach the shelf at all today**. A reading passage, a media cue or
a text selection would be built correctly and then dropped by the save. Those
producers need a session-only transport that does not pass through the persisted
store. Second boundary: the announce is a window event, so an Agent **pop-out**
(a separate BrowserWindow) still will not see a hand-off; that wants a
main-owned `agentWorkspace:changed` broadcast of the kind the operational store
already has.

## The workspace acquires a change broadcast

The previous entry closed by naming its own second boundary: the hand-off was
announced with a window `CustomEvent`, so an Agent **pop-out** — a separate
`BrowserWindow` — never learned that the workspace had changed. That is now a
main-owned push, and the window event is gone rather than kept alongside it.

- `agentWorkspace:changed` is main → renderer, sent after every *successful*
  mutation: `save`, `deleteConversation` and `clear`. A refused or failed write
  did not change the file, and announcing it would be announcing a change that
  never happened.
- The push goes to **every** window, the writer included. Excluding the sender
  would read as a saved render, but the sender is the window with the original
  defect — the Dictionary producer and the shell both live in the Study OS
  window — so excluding it would fix only the pop-out and leave the reported bug
  in place. Re-applying state a window already holds is idempotent.
- The shell adopts the pushed state directly instead of triggering a re-read: the
  push carries the document just committed, so a `load` round trip would fetch
  the same bytes and flicker the loading flag for a change already in hand.
- A push is re-normalized on arrival exactly like a reply. A foreign schema
  normalizes to the *empty* workspace, which a consumer would otherwise adopt
  over correct content it already holds, so an ununderstandable push is dropped
  instead of delivered.
- `AGENT_WORKSPACE_CHANGED_EVENT` and its `dispatchEvent` are deleted from
  `renderer/agentContextHandoff.ts`. There is one mechanism now, not two.
- The bridge parity test was **extended rather than exempted**. A push has four
  ends too — a `send` in main, an `on` in the preload, a declaration, and a
  subscribe in the client — so it is separated by shape and asserted, because a
  push with no listener is exactly as dead as a handler with no caller.

Automated evidence:

- Full suite: `npx vitest run` → 458 files (457 passed, 1 skipped) and 6,035
  tests (6,029 passed, 6 skipped), 0 failed. Against the previous checkpoint's
  458 / 6,027 that is +8 tests and no new files, reconciled per file rather than
  asserted: `agentWorkspaceBridge` +3, `agentWorkspaceIpc` +6,
  `agentContextHandoff` −1, `agentWorkspaceShell` 0 — sum +8. The −1 is the
  retired window-event announcement test, correct now that main announces.
- `node tools/i18n-check.cjs` → exit 0; 8,795 English keys translated. This
  slice adds no user-visible string.
- `node tools/architecture-audit.cjs` → exit 0; 1,566 modules, 18 findings,
  nothing new.
- `npx eslint` over the ten slice-owned paths → **exit 1, and zero of it is
  ours.** Two `adjacent-overload-signatures` errors report `subtitleHarvestList`
  and `subtitleHarvestFetch` in `renderer/window.d.ts`. Proven pre-existing by
  set-difference on the same command, not by filename filtering:
  `git show HEAD:src/renderer/window.d.ts | npx eslint --stdin --stdin-filename
  src/renderer/window.d.ts` returns the identical two errors at HEAD lines
  1342/1345, which foreign hunks above shift to 1480/1483 in the worktree. It is
  a genuine duplicate declaration inside the single `window.api` type, owned by
  the `nyaa-subtitles` track, and is left alone as foreign dirt.
- `node tools/blanc-drift.cjs` → exit 1, which is its documented
  one-tracked-gap baseline; no file from this slice appears in its output. It is
  not one of this track's four gates.

Live Electron evidence — driven entirely through the debug bridge, no mouse or
keyboard control:

- That the *running* main process carried the slice is established by pushes
  actually arriving on `agentWorkspace:changed`, not by comparing build
  timestamps. A preload binding would have proved nothing: a window reload
  refreshes preload while main keeps its old handlers.
- **Same window, the original defect's exact case.** With a listener installed
  through the real `window.api`, a save from the desktop window returned
  `ok: true` and delivered exactly one push carrying one conversation — to the
  window that wrote it.
- **The pop-out, which is why this slice exists.** Workspace cleared to empty,
  then `window.api.popOut('agent')` opened window id 2 at `?popout=agent`. Its
  live DOM read "0 conversations" and "No stored conversations". A write from
  window 1 then delivered one push to window 2 carrying 1 conversation and 1
  context item, and window 2's DOM — **with no navigation and no reload** —
  showed "1 conversation", the conversation title, the shelf counts "Kept after
  restart 1 / This session only 0 / Marked sensitive 0", the item "Dictionary ·
  食べる · Ordinary · Kept · 昨日寿司を食べました。 · From dictionary", and the
  localized remove control "Remove 食べる from context".
- **Both directions, all three handlers.** Deleting the conversation *from the
  pop-out* pushed to window 1, the non-writer, whose own DOM went to "0
  conversations". `clear` was observed broadcasting the same way.
- Residue: the final workspace state is identical to the pre-run state
  (`version 1`, `activeConversationId: null`, `conversations: []`);
  `localStorage` holds 76 keys, the same count the previous slice recorded, with
  zero `agent.context.*` or `agentWorkspace` keys — there is still no
  renderer-side copy; the debug error ring reported 0 errors. Probe listeners
  were unsubscribed and their globals deleted, and the pop-out was closed through
  the app's own `popoutControl('close')`, restoring the pre-run single-window
  inventory.

One measurement trap, recorded because it cost a false defect:

- The first pop-out probe reported `context: []` and an empty shelf, which reads
  exactly like the product dropping the hand-off. It was the **fixture**:
  `kind: 'dictionary'` is not a kind (`'dictionary-entry'` is) and `source` is an
  object `{ app }`, not a string. `normalizeContext` correctly returned `null`
  and the store dropped the item. A hand-written context fixture typed into
  `/eval` is outside vitest and outside `tsc`, so nothing checks its shape —
  confirm a probe fixture against the normalizer's own accepted sets before
  reading its rejection as a bug.

Verification boundary: no provider request was made, and no restart test was run
— this slice adds no persisted field, the broadcast is a runtime mechanism, and
the persistence it announces was proven at the previous checkpoint.

## Session-only context gets a transport

The shelf could only ever show reference data. Retention is refused above
`ordinary` by `createAgentContextItem`, and the only route from a producer to the
shelf ran through a store whose save filter drops everything non-retained — so a
`selected-text`, `reading-passage` or `media-cue` item was built correctly and
then deleted by the very save meant to deliver it. Both halves of that were
right individually; together they made three of the eight context kinds
unreachable.

- `main/agentSessionContext.ts` holds the non-retained half **in main, in
  memory**. Nothing in it touches `fs`. `absorb` **replaces** a conversation's
  session list rather than unioning it — a removal reaches the store as a
  document that simply no longer lists the item, and a union would make the
  shelf's remove control a no-op — and it **forgets** every conversation the
  document does not mention, which is what makes `deleteConversation` and `clear`
  collect their session entries for free.
- The join lives in `agentWorkspaceStore.ts` rather than at each call site,
  because `read` and `write` are the only ways into the workspace. That single
  change is why the shelf, the `agentWorkspace:changed` broadcast **and** the
  prompt builder in `agentExecutionIpc` (which reads `store.read()`) all see
  whole conversations. **No new IPC channel exists, because none is needed.**
- **The file invariant stays structural.** `atomicWrite` is still only ever handed
  the output of `prepareAgentWorkspaceForPersistence`, so a non-retained item has
  no path to disk even if the merge above it is wrong. That filter was not
  touched.
- `deleteConversation` now reads the **merged** document instead of the file's.
  Reading the file's view would have deleted one conversation and silently
  stripped every *other* conversation's session context on the way past, because
  `write` re-derives the session half from what it is handed.
- Bounds: 100 items per conversation, matching the normalizer's own context cap so
  the merged view cannot exceed what it would accept back, and a 200-conversation
  memory backstop.
- Why main, for data that is deliberately not durable: two of the three consumers
  are in main, and a renderer-held copy would not reach a pop-out — the defect the
  change broadcast fixed one slice ago.

Automated evidence:

- Full suite: `npx vitest run` → 459 files (458 passed, 1 skipped) and 6,046
  tests (6,040 passed, 6 skipped), 0 failed. Against the previous checkpoint's
  458 / 6,035 that is +1 file and +11 tests, reconciled per file:
  `agentSessionContext` +6 in a new file, `agentWorkspaceStore` +5,
  `agentWorkspaceIpc` 0.
- `node tools/i18n-check.cjs` → exit 0. This slice adds no user-visible string;
  the shelf already had the "This session only" and "Marked sensitive" lanes and
  they simply stopped always reading 0.
- `node tools/architecture-audit.cjs` → exit 0; 1,568 modules (1,566 before, +2
  for the module and its test), 18 findings, nothing new. Worth stating
  explicitly: the new main module is **not** reported as an orphan or a test-only
  module, because it has a real production consumer.
- `npx eslint` over the six slice-owned paths: exit 0.

**One existing assertion was deliberately inverted, and it is the honest record
of the behaviour change.** `agentWorkspaceIpc.test.ts` asserted that a save came
back with `context: []` — it pinned the old truth that the save filter was the
only thing between a producer and the shelf. It now asserts the reply carries the
session item and that the *file* is what stays retained-only, checked on the raw
bytes so a normalizer cannot launder it.

Live Electron evidence — **a real restart, not a reload.** This slice is
main-only, so a renderer reload would have proved nothing; the main pid moved
47508 → 78112 → 75828 across the run, and the app was stopped through its own
`window.close()` each time rather than killed.

- A save of one retained item (`dictionary-entry`, `ordinary`) plus one
  session-only item (`selected-text`, `sensitive`) came back from the store
  carrying **both** ids.
- The shelf read "Kept after restart **1** / This session only **1** / Marked
  sensitive **1**" — the session lane non-zero for the first time — and rendered
  "Selection · 選択した文 · Sensitive · Session · これはセッション限定の文です。 ·
  From reading". That is precisely the class of item that could not reach the
  shelf at all before this slice. The panel's own footer, "Context and
  attachments marked session-only are never written to disk", is now a claim the
  run below actually demonstrates rather than a promise about an empty set.
- Disk: `<userData>/agent/workspace-v1.json` contains `keep-zq8` and does **not**
  contain `sess-zq8` or its preview text. Re-checked with the app fully stopped,
  so no writer was racing the read.
- A **brand-new Agent pop-out** showed both items, which proves the merge sits on
  the `load` read path and not only on the change push.
- **After the restart**: the conversation returned with `keep-zq8` alone, and the
  shelf counts fell to "Kept 1 / This session only 0 / Marked sensitive 0".
- Residue: final state identical to the pre-run state (`version 1`,
  `activeConversationId: null`, `conversations: []`); `localStorage` still 76 keys
  with zero `agent.context.*` keys; 0 errors in the debug ring; probe globals
  deleted.

Three boundaries, stated rather than smoothed over:

- **No session-only producer ships yet.** The transport was exercised through the
  same `agentWorkspaceSave` call every producer makes, but the only shipped
  producer is the Dictionary's retained hand-off. `selected-text`,
  `reading-passage` and `media-cue` are now *unblocked*, not *wired* — that is the
  next slice, and until it lands their producer half is unproven.
- **No provider request was made.** The prompt path shares `store.read()` with the
  shelf, so the merge reaching it follows from the same call the shelf proved. The
  privacy gate that this slice makes load-bearing — `sensitive` context can reach
  a request for the first time, where before only reference data could — is
  covered by unit test against `evaluateAgentProviderPrivacy`, not by a live cloud
  call.
- **Message-level references stay retained-only by design.**
  `retainedMessage` prunes `contextIds`, card references and the provider
  disclosure to the retained set at the persistence boundary, so a message keeps
  no durable back-reference to a session-only item it used. The live disclosure at
  request time is unaffected; the durable record understates what a past request
  included. Recorded rather than changed, because the alternative is persisting a
  reference to material that is meant to vanish.

## The first session-only producer

The transport had no producer, so `selected-text` was unblocked but unproven. A
reader selection now hands off, which closes the loop the previous two slices
built: producer → session store → shelf, with nothing on disk.

- `selectedTextAgentContext` in `renderer/agentContextHandoff.ts` deliberately
  passes **no `retained`**. The kind floors at `personal`, retention is refused
  above `ordinary`, and it no longer needs it. `identity` is the selection, so
  highlighting the same phrase twice is one shelf entry; the surrounding sentence
  is the preview, because a bare fragment is a poor prompt.
- `NovelReader.tsx` gets `askAgentAboutSelection`, an entry in the AppChrome
  "Study" menu, and a toolbar button beside "Collect".
- Keys `epub.askAgent` and `agent.conversation.fromReading` in all four languages;
  8,795 → 8,797 English keys.

**Three defects the live run caught and the whole test suite could not.** All three
were mine, introduced in this slice, and each is invisible to a unit test:

1. **The label pointed at a key that does not exist.** The menu item called
   `t('reader.askAgent')` while the key shipped as `epub.askAgent` — the namespace
   changed mid-work and the call site did not follow. `tools/i18n-check.cjs` cannot
   catch this: it compares the four catalogs *against each other*, and a key absent
   from all four is absent from both sides of every comparison.

   **Correction, and the useful part of this entry: the repo already has the gate
   for it and this session simply did not run it.** `tools/i18n-missing-key-check.cjs`
   scans `src/renderer`, `src/media` and `src/main` for literal `t('…')` keys and
   fails on any that English does not define; run with the defect restored it
   reports `NovelReader.tsx — 1 key(s): reader.askAgent` and exits 1. It would have
   taken seconds. **Run it, not just `i18n-check.cjs`, on any slice that adds a
   key** — the four-gate list this ledger keeps quoting is incomplete for i18n work.

   One trap inside the trap, worth recording because it nearly produced the
   opposite conclusion: the first canary used to test that tool was
   `t('__canary_missing_key__')`, the tool stayed green, and that looked like proof
   the tool was broken. Its key regex is
   `/\bt\(\s*'([a-zA-Z][\w.-]*\.[\w.-]+)'/` — the key must start with a letter and
   contain a dot, so the canary matched nothing. A malformed positive control is
   indistinguishable from a check that does not work; shape the canary like a real
   key (`canary.missingKey`) and confirm it fires before believing a green run.
2. **The menu it lived in is not rendered where people read.** In the desktop-shell
   embedding there is **no element whose text is "Study"** — the AppChrome menu bar
   simply is not there, so the action was unreachable. `Collect selection` is
   duplicated as a visible `Collect` button for exactly this reason; the hand-off
   now follows it instead of existing in one embedding only.
3. **The conversation title wrote the material the item is refused permission to
   store.** The title came from `selection.slice(0, 40)`, and titles *are*
   persisted — so `workspace-v1.json` contained `集団カンニ` while the context item
   correctly did not. That is the session-only guarantee leaking through a
   neighbouring field. It is now titled from `item.title`, the book's own library
   name, and the fragment is absent from disk entirely.

Automated evidence:

- Full suite: 459 files (458 passed, 1 skipped) and 6,052 tests (6,046 passed, 6
  skipped), 0 failed — +6 against the previous checkpoint's 6,046, all six in
  `agentContextHandoff.test.ts`.
- `node tools/i18n-check.cjs` → exit 0; 8,797 English keys, +2 from this slice,
  translated in all three languages.
- `node tools/architecture-audit.cjs` → exit 0, nothing new.
- `npx eslint` over the seven slice paths → exit 0. The nine
  `no-non-null-assertion` warnings in `NovelReader.tsx` sit at lines 1599–2110,
  all above this slice's hunks, and are warnings rather than errors.
- `tsc` is not a gate. Set-difference on the touched files shows **zero new
  errors**: the four `Property 'lang' does not exist on type 'LibraryItem'` errors
  at `NovelReader.tsx:112` are byte-identical code at HEAD's line 111, shifted one
  line by this slice's import.

Live evidence — a real book, a real selection, a real synthesized click:

- `悪の教典 02` opened from the library; chapter 7 rendered 1,737 characters. Two
  instrumentation notes for whoever drives this next: clicking an `<option>` does
  **not** navigate a `<select>` — the first attempt measured an empty pane for that
  reason and not a product fault, and it took a dispatched `change` event; and the
  reader's text pane is empty until a chapter is chosen.
- The click went through `/click` rather than `element.click()` **on purpose**: a
  programmatic click dispatches no `mousedown` and therefore cannot collapse a
  selection, so it would have passed whether or not the real gesture works. The
  selection **survived the real mousedown**, which also vindicates the shipped
  `Collect` button that depends on the same thing.
- One item resulted: `kind: selected-text`, `label: 「また、集団カンニ`,
  `preview: 第七章「また、集団カンニングがあるというんですか？` — the sentence around
  the fragment — `source: { app: 'reading', entityId: <book id> }`,
  `sensitivity: personal`, `retained: false`.
- The shelf, read from a pop-out: "Kept after restart **0** / This session only
  **1** / Marked sensitive 0", rendering "Selection · 「また、集団カンニ · Personal ·
  Session · … · From reading".
- Disk: the conversation is in `workspace-v1.json` with `context: []`, and the file
  contains neither `selected-text` nor the fragment.
- Residue: workspace restored to the pre-run empty state; `localStorage` 76 keys
  with zero agent keys; 0 errors in the ring; probe globals deleted; pop-out
  closed. `library.json` is dated 2026-08-01 and was **not** written, so the book's
  reading position was not disturbed — `desktop-layout.json` was rewritten, which
  is the documented consequence of opening and closing windows.

Boundaries: `reading-passage` and `media-cue` still have **no** producer — only
`selected-text` is wired. No provider request was made in this slice either.

## The passage producer, and two defects an independent review found

Two things landed together: the second session-only producer, and fixes for two
real defects in the three slices above — found by dispatching a **read-only
adversarial review to a different Claude account** and asking it to falsify this
ledger's own claims rather than confirm them.

The producer:

- `readingPassageAgentContext` sends the paragraph around the selection, where
  `selectedTextAgentContext` sends the fragment. "Explain this word" and "explain
  this paragraph" are different questions. Same session-only lifetime, no
  `retained`, and `identity` is the whitespace-collapsed text so a re-flowed block
  is still one shelf entry.
- `passageAroundSelection()` in `NovelReader.tsx` resolves the nearest paragraph
  itself and does **not** reuse `selectionInBlock()`. That helper's block
  resolution ends at `.novel-part, .novel-content`, and in scroll mode there is no
  `.novel-part` — so it returned the whole loaded chapter: **1,684 characters for a
  six-character selection**, measured live, from a control labelled "this
  paragraph". After the fix the same gesture yields **329** — the paragraph.
- Two toolbar buttons with distinct icons (`sparkle`, `note`), not two identical
  ones, plus both menu entries. Key `epub.askAgentPassage` in all four languages;
  8,797 → 8,798 English keys.

**The review's verdicts:** five VERIFIED, one OVERSTATED, four incidental
findings. Two were real defects, fixed here:

1. **The change broadcast never covered the execution path.** `agentExecutionIpc`
   mutates the same workspace three times — begin, complete, fail — and announced
   none of them; the only sender in the tree was `agentWorkspaceIpc`. So sending a
   message in one window left an Agent pop-out showing neither the user's message
   nor the streamed reply: *precisely the staleness `b19a902` exists to fix*, still
   open in the one flow that matters most. The previous entry's bullet listing
   `save` / `deleteConversation` / `clear` was literally true, which is exactly why
   it read as complete coverage and was not. `broadcastAgentWorkspace` is now
   exported and called on all three writes — still the single `webContents.send`
   for the channel, which the parity test counts.
   *Wrinkle worth recording:* `agentExecutionIpc.test.ts`'s electron mock had no
   `BrowserWindow`, so the new call threw inside the handler's own `try` and
   surfaced as **five unrelated assertions failing with `store-failed`**, a code
   none of them was testing.
2. **The 200-conversation cap could evict the conversation on screen, and the
   victim set rotated on every save.** `normalizeAgentWorkspaceState` allows 500
   conversations against this module's 200, so the state is reachable rather than
   theoretical. Eviction walked Map insertion order with no regard for
   `activeConversationId`; worse, `set` on an existing key keeps its position while
   a previously-evicted key re-inserts at the end, so the survivors became the next
   round's victims. `absorb` now **rebuilds** the map from the document with the
   active conversation absorbed first: the contents are a pure function of the last
   document, there is no rotation, and "forget every conversation the document does
   not mention" falls out for free instead of needing its own pass. The comment
   claiming oldest-first eviction was wrong and is gone.

**The OVERSTATED verdict was fair and is also closed.** The previous entry's "+6
tests" evidence line sat beside three defects it said the suite could not catch —
and the title fix in particular had *no* test: reverting `item.title` to
`selection.slice(0, 40)` left the entire suite green. There is now a source-level
assertion (the same technique `agentWorkspaceBridge.test.ts` uses on its four
boundary files) pinning that the reader's conversation title comes from
`item.title` and never from the selection. Verified to bite: with the call site
reverted, exactly one test fails.

Automated evidence: 459 files (458 passed, 1 skipped) and 6,059 tests (6,053
passed, 6 skipped), 0 failed — +7 against 6,052 (2 execution-broadcast, 2
eviction, 2 passage-builder, 1 title regression). `i18n-missing-key-check`,
`i18n-check` and `architecture-audit` all exit 0, the audit showing nothing new
for the new `agentExecutionIpc → agentWorkspaceIpc` import edge; `eslint` exit 0
over the eight slice paths.

Live: the passage button produced `kind: reading-passage`, `retained: false`,
`sensitivity: personal`, a 60-character label and a **329**-character preview, and
`workspace-v1.json` contains neither `reading-passage` nor the passage prose.

Still open from the review, recorded rather than fixed — both latent today:
`retainedMessage` prunes card actions only for `open-context`, while
`AgentResultEffect`'s `save` variant, `AgentNavigationEffect.controlId` and
`card.title` / `card.summary` persist unpruned (nothing builds cards yet, but the
file invariant rests on that prune list staying exhaustive when something does);
and `merge` can truncate — 60 retained plus 100 session collapses to 100, and
saving that view back replaces the session list with the 40 that survived, bounded
in practice only by `AGENT_CONTEXT_SHELF_LIMIT = 12`.

## The media-cue producer, and the player surface it could not use

`mediaCueAgentContext` completes the transport's producer list: a subtitle line
handed to the Agent as session-only context. It follows `selectedTextAgentContext`
exactly — `media-cue` floors at `personal`, so there is **no `retained`** and none
is asked for, and the line reaches the shelf and the prompt through
`main/agentSessionContext.ts` without touching disk. `identity` collapses
whitespace before keying, which matters more here than in a reader: SRT and ASS
wrap one spoken line across two rows, so the visible line and the raw cue differ by
whitespace alone and a rewind would otherwise shelve the same subtitle twice.

**The call site is not the player, and that is the finding.** The intended home was
the live active cue. Two things blocked it, both verified rather than assumed:

1. **`MediaState.active` is permanently `null` app-wide.** It is computed by a
   cue-sync effect that returns immediately on `if (!v || !src)`, where `v` is
   `videoRef.current` — and **nothing in the tree attaches `videoRef` to any
   element**. The codebase already says so in two places
   (`keyboardShortcuts.ts:554`: "Slice 16 deleted the component that rendered
   `<video ref={videoRef}>`"; `VideoCoreStudyOverlay.tsx:1243`), but nobody
   followed the consequence downstream: `MediaStudyMode`'s `activeCue` prop is
   dead, and `MediaStudyAssistantPanel`'s `sentence={activeCue?.text ?? …}` has
   always been silently taking its fallback. A control gated on `activeCue` would
   have been unreachable in the embedding people actually use — exactly the check
   this producer inherited from the reader work, and it fired.
2. **The player's own cue controls have left the committable tree.**
   `VideoCoreStudyOverlay.tsx` does have a live `activeCue` (from the VideoCore
   manager, not the dead ref), and at HEAD it carries the sibling control this
   button belongs beside — "translate this line", HEAD line 1832. But the working
   tree has moved that whole region into `AiWorkspaceBlock`, in
   `src/media/StudyBlocks.tsx`, which is **untracked**, one of **12 untracked
   files plus 9 modified** making up the in-flight study-workspace block track.
   The overlay's render section is rewritten wholesale (`-243`, `-211`, `+399`
   lines); the transport row `data-study-action="previous-cue"` no longer exists
   in the working tree at all. Adding the button there could not be committed
   without absorbing another track's unfinished work, and a HEAD-scoped hunk
   referencing `AiWorkspaceBlock` would commit a file that does not compile.

So the producer is wired where a real subtitle line is both **visible and
committable**: the `review-sentences` list in `MediaStudyMode`, which renders
`analysis.sentences` built from the genuinely-loaded `state.cues`, in the same
desktop window that hosts the Agent — `openAgentSurface()` dispatches `os:open`
into `AppSection`, and `MediaCenterView` and the Agent are both sections of it.
The route in is real: a library tile dispatches the study action, `MediaCenterView`
opens the Study tab on `MEDIA_STUDY_EVENT`.

Both remaining reader checks are enforced by tests that were confirmed to bite:

- **No neighbouring persisted field carries what the item is refused.** The
  conversation is titled `t('agent.conversation.fromMedia', { label: item.title })`
  — the media item, never the line. A title *is* persisted, and `media-cue` is
  refused retention precisely so the subtitle stays off disk; titling with it would
  write it there anyway. Pinned by a source-level assertion, the same technique the
  reader title fix ended up needing after review.
- **The scope the label promises is the scope delivered.** The button says "this
  line"; the preview carries that line and its two immediate neighbours, bounded by
  `slice(Math.max(0, index - 1), index + 2)`. The reader producer shipped the
  opposite bug live — "this paragraph" sending 1,684 characters of whole chapter —
  so the slice is asserted on the source, together with a negative assertion
  against the unbounded `sentences.map(…).join` that would send every analyzed
  sentence.

Canary evidence for both: reverting the title to `line.text` fails exactly one
test; replacing the bounded slice with the whole-transcript join fails exactly one
test. `MediaStudyMode.tsx` was restored byte-for-byte after each.

Automated evidence: 459 files (458 passed, 1 skipped) and 6,067 tests (6,061
passed, 6 skipped), 0 failed — **+8** against 6,059, reconciling with the 8 added.
`i18n-missing-key-check`, `i18n-check` and `architecture-audit` all exit 0 (the
audit reporting nothing new for the `MediaStudyMode → agentContextHandoff` edge);
`eslint` exit 0 over the seven slice paths. Two keys per catalog in all four
languages.

## Modes stop being a chip and become workflow presets

The mode had the same shape the context shelf had before it got a producer: the
pipeline existed except its first link. `AgentWorkspaceMode` carried all six
modes, `normalizeAgentWorkspaceState` validated them, the shell rendered
`t('agent.mode.…')` as a chip and all four catalogs had the labels — but **nothing
in the tree ever wrote `mode`**, so every conversation in the app was `ask`,
permanently, and the chip reported a choice no one could make.

Three changes make it real, and one deliberate omission keeps it honest:

- **`AGENT_WORKSPACE_MODES`** is now an exported ordered list, and the private
  `Set` the normalizer uses is built from it. The picker renders from it, the
  router keys presets off it and the normalizer validates against it; a second
  hand-written list would have been the thing that drifted. A test walks the list
  and round-trips every mode through the normalizer, so the picker cannot offer a
  mode that silently reverts to `ask` on save.
- **`agentWorkspaceWithMode`** is the write, following the module's convention of
  returning `null` when nothing would change — re-selecting the current mode is
  not an edit, so a `select` firing `change` does not rewrite the workspace file.
  It goes through the same main-owned save as every other change, so a pop-out
  cannot show a different preset than the one that will actually be sent.
- **`MODE_PRESETS` in `agentProviderRouter`** is what a mode *does*: one
  instruction folded into the prompt ahead of the user's text, with the context
  shelf still trailing. Not a second runtime, a second history or a different
  provider — "lightweight workflow presets, not separate bots", as Track 3 puts
  it. `inputChars` is measured after assembly, so the disclosure and the
  input-budget check both count the preset rather than quietly excluding it.

**`ask` deliberately has no preset**, and that is load-bearing twice over. It is
the mode every conversation normalizes to, so a preset would be boilerplate on
every request the app has ever sent — tokens on the cloud path, latency on the
local one. It also means this slice **cannot regress the existing default**: a
test asserts that an `ask` request and a request with no mode at all produce
byte-identical prompts.

**Two presets state a limit rather than a capability.** This execution path runs
one prompt and returns text — there is no tool loop, so the Agent cannot open a
surface and cannot run an automation. `navigate` and `automate` are exactly the
modes whose names imply otherwise, so `navigate` says it cannot open surfaces and
`automate` says it cannot execute the plan and must never report a step as done.
Track 3 requires the Agent never claim an action completed when only a plan was
generated; a preset that let the model narrate having opened something would be
that claim, authored by us rather than by it. A test pins all three phrases.

The preset strings are **not translated**, on purpose: they are instructions to a
model, not app chrome, so they follow the same rule as study content in
`CLAUDE.md`'s i18n scope section. The mode's *label* and its new one-line hint are
chrome and are translated — seven keys per catalog, and the `automate` hint says
in the user's own language that the Agent cannot run the plan.

The wiring test is the one that matters most: `agentExecutionIpc` read
`conversation.context` and nothing else, so a field added to the conversation
reaches the provider only if that call site changes too — the identical shape of
gap the independent review found in the change broadcast two slices ago. `mode` is
now read from the same conversation snapshot as `context`, so the preset that
shapes a request is the one the conversation carried when it was sent rather than
whatever it is changed to while the provider runs. Verified to bite: dropping
`mode` from the options object fails exactly one test, with
`expected undefined to be 'analyze'`.

Automated evidence: 459 files (458 passed, 1 skipped) and 6,075 tests (6,069
passed, 6 skipped), 0 failed — **+8** against 6,067, reconciling with the 8 added
(5 router, 2 shell model, 1 execution). `i18n-missing-key-check`, `i18n-check` and
`architecture-audit` all exit 0; `eslint` exit 0 over the twelve slice paths.

## Searchable history

Track 3's product model asks for "chats, task threads, searchable history, pins,
attachments" — pins and chats existed, history did not, and unlike the mode and
the context shelf there was **nothing at all** to build on: no search function, no
query state, no keys. `agentHistorySearch` is the whole feature, and it lives in
`agentShellModel.ts` with the other pure transforms so it is assertable without
mounting a tree.

Four decisions are encoded in it rather than left to the surface:

- **Substring, not tokens.** Japanese has no required word spaces, so splitting a
  query into words fails exactly the queries this app exists to serve.
  `localAgentKnowledge.terms()` already documents the same problem and falls back
  the same way, so this matches a sibling rather than inventing a second idea.
  Both sides are NFKC-folded and lowercased — the same idiom that module uses —
  so a half-width katakana query finds text stored full-width. Verified to bite:
  dropping the `normalize('NFKC')` and keeping only `toLocaleLowerCase` fails
  exactly one test, the one searching `ﾗｰﾒﾝ` for `ラーメン`.
- **Archived conversations are found, and marked.** The rail filters them out;
  search must not, because searching history is precisely when someone wants the
  conversation they put away. The `archived` flag travels so the surface can label
  it instead of implying it is on the rail. Verified to bite: copying the rail's
  `archived` filter into the search loop fails exactly one test.
- **One row per conversation.** A single long chat would otherwise flood the list
  and bury every other conversation that matched once, so the match count travels
  and the snippet comes from the newest matching message.
- **The context shelf is not searched.** It is what the Agent can see *now*, not
  what was said, and a session-only item does not survive a restart — a result
  pointing at one would vanish between launches.

The snippet is bounded to ±48 characters around the hit with ellipses added only
on the side actually cut, because a stored assistant reply can be thousands of
characters and a result list has to stay scannable.

On the surface, search **replaces** the rail list rather than filtering it in
place: a result carries a snippet and a match count the rail entries do not, and
archived conversations appear in one and not the other — two different lists, so
two renderings. The query lives in component state, not the main-owned workspace:
it is a view, not something a second window should inherit, and it must never
reach disk. Clicking a result deliberately keeps the query, so several results can
be read one after another without retyping.

Automated evidence: 459 files (458 passed, 1 skipped) and 6,081 tests (6,075
passed, 6 skipped), 0 failed — **+6**, reconciling with the 6 added.
`i18n-missing-key-check`, `i18n-check` and `architecture-audit` exit 0; `eslint`
exit 0; `tsc --noEmit` reports no error in any file this session touched (the root
config has pre-existing top-level-`await` errors in unrelated test files, so it is
not a clean gate and is not treated as one). Eight keys per catalog in all four
languages, with CLDR plural forms for the two counts in `ru`.

## Result cards cannot outlive session-only provenance

The first card producer was not safe to start at the previous checkpoint. The
persistence boundary removed session-only context objects and filtered their ids
out of a card, but kept the rest of that card. Its `title`, `summary` and action
payloads could therefore repeat a private selection, path, control id or entity id
into `workspace-v1.json` after the source item itself was correctly refused.

`retainedMessage` now treats a card as one derived result rather than a set of
independently redactable fields: every declared `sourceContextId` must survive the
retention boundary or the entire card is omitted. A retained-only card still
survives, and an `open-context` action whose target is missing is still removed.
This is deliberately a prerequisite, not a result-card completion claim; no card
producer or interactive action surface exists yet.

The regression fixture puts the session-only value in the card title and summary,
then asserts against the raw file bytes as well as the normalized result. Reverting
to id filtering leaves the private text and card id on disk and fails the test.

Focused evidence: the store/workspace/execution/IPC/bridge set passes 4 files and
41 tests, 0 failed; targeted ESLint and path-scoped `git diff --check` exit 0. No
UI, preload, catalog, Media or other dirty path changed, so live visual evidence is
not applicable to this persistence-only checkpoint.

## Stale windows cannot erase newer Agent workspace changes

The workspace bridge previously saved the whole renderer snapshot with no
revision check. Two Agent windows, or one open shell plus a study-surface handoff,
could therefore both read state A; the first write state B successfully, then the
second post its transform of A and silently erase B. Atomic file replacement did
not help: it protected bytes from partial writes, not the document from lost
updates.

The main-owned workspace now carries a monotonic `revision`. A renderer must
return the revision it read; `compareAndWrite` refuses a stale token and returns
the latest committed state without touching disk. `updateAgentWorkspace` then
re-applies the original semantic transform to that latest state, up to a bounded
four attempts. New conversation ids and timestamps are captured once per user
gesture, outside the retry closure, so a conflict does not manufacture a second
conversation or repeatedly change ordering metadata.

All shell writes that can originate from a stale view use that path: create and
select conversation, change mode, toggle pin, detach context, and the cross-surface
context handoff. Main-side execution completion remains safe on its existing
path because it reads the latest workspace and applies `finishExecution`
synchronously before its trusted write; there is no event-loop yield between the
read and commit.

The revision is backward-compatible with existing `workspace-v1.json` files:
documents written before this field normalize to revision zero, and the first
successful main commit advances them to one. Main chooses every next value; a
renderer cannot skip ahead or roll it back. Conflict replies are also validated
at the shared bridge boundary before the latest state is exposed to renderer
code.

The broadcast is now explicitly best-effort *after* commit. Each observer send is
isolated because a BrowserWindow can close between `isDestroyed()` and `send()`;
one dead observer can no longer turn a committed save into `write-failed` or
prevent healthy windows from receiving the update.

Canary evidence covers both failure classes. The store test commits a pin, rejects
a stale mode edit without losing the pin, then rebases the mode edit and preserves
both. The renderer test receives a conflict containing a newer conversation,
re-applies its transform, and verifies the second payload still contains that
conversation. The IPC test proves a stale save does not broadcast, and a separate
observer-failure test proves the committed write succeeds and reaches a healthy
window even when another observer throws.

Automated evidence: every `agent*.test.ts` suite passes — 17 files and 235 tests,
0 failed. The focused workspace/execution/context set passes 9 files and 152
tests. Targeted ESLint and path-scoped `git diff --check` exit 0;
`architecture-audit` scans 1,568 modules with no new finding. Root
`tsc --noEmit` remains a dirty-tree baseline gate with broad unrelated failures;
filtering that output to this slice reports no error in a changed Agent file.
No UI pixels, strings, preload surface, Media path or root configuration changed,
so live visual evidence is not applicable.

## One streaming run renders as one persisted exchange

The execution handler commits and broadcasts the user row plus an empty streaming
assistant row before the provider starts. The shell also rendered a separate
transient user/assistant pair from `runningPrompt` and `streamedText`. As soon as
the broadcast arrived, one real run therefore appeared twice — and the pop-out
case made it more visible because both windows adopted the placeholders while
only the initiating window owned the transient text.

`agentExecutionMessageIds` is now the one shared definition of the two rows an
execution owns. Main uses it when it creates and finishes the messages; the
renderer uses the same assistant id to project streamed chunks into the already
persisted placeholder. The transient pair remains only as a no-push fallback and
disappears as soon as the main-owned assistant row is present. This keeps the
workspace file authoritative without waiting for the final buffered answer to
show progressive text.

The adjacent restart case is closed at the store boundary. A provider call cannot
survive an Electron main-process restart, so the first open of an existing
workspace terminalizes any `pending` or `streaming` row as failed, preserves any
partial text, advances the main-owned revision once, and writes that recovery
atomically. The repair is one-time: after the store has opened, a genuinely active
execution can write and read its streaming placeholder without the normal read
path cancelling it.

The rendered canary pushes the same pending document main produces, delivers a
chunk, holds the provider open, and asserts one copy of the user prompt, one
streaming status and no duplicate `.agent-live-exchange`. The store canary opens
a revision-four document with a streaming row, asserts revision five plus a
terminal status and preserved partial text, then verifies the second read is
byte-stable.

Automated evidence: every `agent*.test.ts` suite passes — 17 files and 237 tests,
0 failed. The focused execution/workspace/render set passes 6 files and 58 tests.
Targeted ESLint exits 0. No catalog, preload, Media or root-configuration path
changed; the visible correction is behavior under an active stream rather than a
new static layout.

## Context provenance is opaque and fail-closed

The card retention rule still had one Boolean edge after the previous checkpoint:
`sourceContextIds.every(retained)` is true for an empty list. A card declaring no
provenance could therefore persist its title, summary and action payloads in full,
even though the boundary had no evidence that any source was retained. Cards now
need at least one declared source and every declared source must survive. The first
interactive producer can build on a fail-closed rule instead of making the empty
list a privileged bypass.

The ids being pruned were also content-bearing. Every personal producer used its
selection, passage or subtitle as `identity`, and `createAgentContextItem` copied
the first 200 characters into `id`. That made message references, provider
disclosures and card provenance alternate storage locations for material whose
context object is intentionally session-only. Personal and sensitive context now
uses a deterministic 16-hex opaque identity; ordinary route/dictionary identities
remain readable because they are reference data allowed across the persistence
boundary.

Hashing uses the complete personal identity rather than the previous 200-character
prefix, so two long paragraphs with the same opening no longer collapse into one
shelf item. The identifier is for stable deduplication, not encryption or user
authentication; its privacy property is simply that the raw material is not the
identifier.

Canary evidence adds an unprovenanced card whose summary contains a sentinel and
asserts neither reaches raw `workspace-v1.json`. Context tests assert equal
personal inputs produce the same opaque id, different and shared-prefix inputs do
not collide in the fixture, and the id contains none of the original material.
The media handoff test verifies the same property at a real producer boundary.

Focused evidence: 5 files and 111 tests pass, 0 failed. No visual, catalog,
preload, Media implementation or root-configuration path changed.

## Persisted chats now carry bounded conversation continuity

The workspace stored a conversation but the provider received only the newest
prompt, mode and current context shelf. A second question such as "what about the
other form?" therefore had no access to the answer it referred to. Searchable
history was real on disk and in the rail, but execution behaved as a sequence of
unrelated one-shot requests.

Execution now snapshots the conversation's existing messages before it inserts
the current user/streaming pair and hands that snapshot to the router. The router
selects complete user and assistant messages only, preserves oldest-to-newest
order, and places them between the optional workflow preset and the clearly
labelled current request. System/tool rows, failed or interrupted rows, empty text
and the in-flight pair are not replayed.

History is bounded three ways: at most the newest 12 eligible messages, at most
4,000 characters from one message, and at most 12,000 message-text characters in
the request. The final configured `maxInputChars` budget is still authoritative;
selection walks newest-first and stops at the oldest contiguous set that fits,
so the current request, preset and context are never silently truncated to make
room for history. With no eligible history, prompt assembly returns the exact
pre-continuity bytes.

Provider disclosures now record `historyMessageIds` in the order sent. The field
normalizes to a bounded deduplicated list for old or untrusted documents, and the
persistence boundary removes self-references and ids whose message no longer
exists after normalization. This makes continuity auditable without putting
message text into metadata.

Canary evidence sends 14 turns plus a failed row and proves only the newest 12
complete turns appear, in order, ahead of the current request and context. A tight
budget test proves the newest turn remains while the older one is omitted, the
request still fits and disclosure size matches the actual routed prompt. The IPC
test proves the conversation snapshot — not an empty default — reaches the
provider options.

Automated evidence: every `agent*.test.ts` suite passes — 17 files and 241 tests,
0 failed. The focused provider/execution/workspace set passes 4 files and 42
tests; targeted ESLint exits 0. This changes provider input and persisted
disclosure metadata, not static chrome, so no new visual artifact applies.

## Context handoff opens from every renderer embedding

The handoff attached context first and then dispatched `os:open`. That event is
owned by `DesktopShell` (and separately bridged by Mini), but a first-class
pop-out renders `AppSection` directly, a full-screen reader replaces the desktop,
and Blanc is a separate entry point. In those embeddings the save succeeded,
`openAgentSurface()` returned true, and no Agent surface opened.

The route now uses main's existing `popOut('agent')` contract from every renderer.
Main already deduplicates pop-outs by section, so the call focuses an existing
Agent window or creates one; it does not create a second conversation or a second
hidden history. The function awaits the IPC promise and returns false when the
bridge is missing or main rejects the open, rather than reporting success after a
fire-and-forget event.

`handOffToAgent` adds the explicit `open-failed` outcome. The attach remains
first, so a window-opening failure never loses the context, but the caller is no
longer told the whole gesture landed. Because existing producer controls invoke
the gesture with `void`, the handoff itself emits the shared `os:toast` warning on
invalid input, bridge/save failure or open failure using existing translated
Agent error strings. No producer-specific hidden error path remains necessary.

The routing test proves desktop and Blanc embeddings both invoke the main-owned
Agent pop-out route. Separate canaries prove a failed attach does not open and
emits a warning, while a rejected pop-out reports `open-failed` after the context
save is preserved.

Focused evidence: the rendered handoff suite passes 1 file and 31 tests, 0
failed. No dirty App, DesktopShell, Media, Reading or catalog path changed.

## The first safe interactive result card

A successful execution now emits at most one deterministic card for the newest
context item that the provider disclosure says was actually included. Its title,
summary and exact singleton provenance come from that context snapshot; provider
text is never parsed. The only produced effect is the existing read-only
`open-context` contract. A request with no disclosed context produces no card.

The persistence split now keeps cards derived from session-only reading or media
context in main memory beside that context while continuing to remove both from
`workspace-v1.json`. The overlay is bounded by conversation, message and card
caps, rebuilt rather than unioned, scoped by message identity and exact context
provenance, and gives a persisted card precedence on an id collision. Removing
the context, card, message or conversation removes its in-memory copy.

The rendered action does not trust its stored label or route arbitrary payloads.
It accepts only `open-context`, verifies that the target is declared by the card
and still belongs to the selected conversation, then scrolls and focuses the
exact already-rendered shelf item. Missing or stale provenance produces a local
accessible error. Navigate, save, approve and undo effects remain inert.

Automated evidence: all 17 `agent*.test.ts` suites pass, 253 tests total. The
combined producer, store, session overlay and rendered-shell run passes 4 files / 51
tests; an added execution canary proves a personal result card remains live while
its title, preview and context id are absent from the file. Targeted ESLint and
`git diff --check` pass. Architecture scans 1,568 modules with the same 18 known
findings and nothing new. Catalog parity, missing-key, locale-argument and
hardcoded-text gates all pass.

Live Electron evidence: Forge rebuilt main, preload and renderer and relaunched a
fresh main process. In the 900 x 640 Agent pop-out, one grounded dictionary card
rendered one action; activating it focused and highlighted its exact shelf item,
left zero alerts and zero horizontal overflow, and the fresh debug error ring
stayed empty. Screenshot: `debug/shots/win2-1786252832333.png`. The synthetic
acceptance conversation was deleted and the user's original active conversation
was restored.

## Explicit session-only text attachments

The composer now accepts up to five explicitly selected text/document files. It
reads them asynchronously, rejects unsupported, empty, binary-like or oversized
input, and shows removable name/size chips plus an unambiguous session-only note.
No local path is accepted by the shared contract. Attachment content is passed
only to the selected provider request; the persisted workspace contains bounded
sanitized metadata and never attachment bytes or paths. Session-derived metadata
is held only in the bounded in-memory overlay.

Cloud routing has a separate visible consent gate whenever files are attached.
The wording covers both the files and any selected sensitive context, and Send
stays disabled until that consent is checked. Local execution does not require
cloud consent. Provider input accounting includes attachment framing and complete
content; it rejects an over-budget request instead of silently truncating a file.

Automated evidence: the focused shared/main/renderer attachment set passes 7
files / 79 tests; every `agent*.test.ts` suite passes 33 files / 383 tests; the
full suite passes 459 files plus 1 skipped, 6,113 tests plus 6 skipped. Targeted
ESLint, architecture, catalog parity, missing-key, locale-argument and
hardcoded-text gates all pass. The architecture scan remains at the same 18 known
findings with nothing new.

Live Electron evidence: a fresh Forge process read `qa-session-notes.txt` through
the actual hidden file input and rendered its 48-byte chip and session-only note.
Switching to Gemini displayed the full disclosure, held Send disabled before
consent, and enabled it after consent. No request was sent. The attachment,
prompt, consent and provider were then cleared back to their original state, and
the fresh debug error ring remained empty. Screenshot:
`debug/shots/win1-1786255280556.png`.

## A second deterministic read-only card producer

When the newest context actually disclosed by the provider is a route with a
normalized destination, execution now appends a typed navigation suggestion to
the existing source card. Its destination is taken only from trusted
`source.app` and `source.route` metadata. Provider response prose cannot choose
the section, page, title, summary, ids or provenance. A route without destination
metadata, a non-route context or an undisclosed context produces no suggestion.

The renderer deliberately does not execute that navigate effect. It displays a
localized pending-action count with no button, handler, routing or bridge call.
Each card also renders provenance resolved from exact context ids in the current
conversation; stale and cross-conversation ids are omitted, and stored action
labels are never presented as provenance. Existing `open-context` remains the
only live result-card action.

The session overlay already supported two cards sharing one session-only route
source. A new regression proves both stay in deterministic order in memory,
neither reaches the persisted document, and both disappear when their source
context or owning message is removed. No production persistence change was
required.

Automated evidence: the combined producer/session/renderer set passes 3 files /
50 tests; every `agent*.test.ts` suite passes 33 files / 387 tests; the full suite
passes 459 files plus 1 skipped, 6,117 tests plus 6 skipped. Targeted ESLint and
`git diff --check` pass. Architecture remains at 1,570 modules and the same 18
known findings with nothing new.

Live Electron evidence: a snapshot/restore acceptance run injected two temporary
cards over one session-only route. The source card kept its existing read-only
open-context control; the navigation card showed `1 action, not yet connected`,
zero navigation controls, and live `Live Reader route / From reading`
provenance. A deliberately untrusted stored navigation label was absent from the
DOM, and no bridge method beyond workspace load/save ran. The original workspace
was restored at revision 8, the synthetic context/message were absent afterward,
and the fresh error ring remained empty. Screenshot:
`debug/shots/win1-1786255935672.png`.

## Permission-gated navigation execution

The navigate effect now executes, behind a gate that is three separate refusals
rather than one predicate. `shared/agentNavigation.ts` carries a hand-written
allowlist of 23 sections, asserted by test against `POPOUT_SECTIONS` in
`src/main.ts` so widening one without the other fails; `note` and `visualizer`
are excluded exactly as main excludes them. The resolver then re-derives the
destination **from live context**, never from the stored effect: it requires a
`route` context still on the conversation's shelf whose `source.app` is the
section and whose `source.route` matches the stored page. A card whose
provenance has moved on resolves to `stale-provenance` and opens nothing.
`controlId` and `highlight` are display hints and are ignored when choosing a
target.

The channel's shape is the security property. A request carries four ids and one
boolean and **never a destination**; `normalizeAgentNavigationRequest` refuses —
rather than strips — any payload carrying `section`, `page`, `destination`,
`route`, `url`, `target`, `controlId` or `effect`. `approved: false` resolves for
the review step and is guaranteed to open nothing; `approved: true` is the user's
approval of a destination already shown to them. Main opens a **section** only,
so a page can describe a destination but can never widen one. The opener is
injected from `src/main.ts` beside the pop-out wiring that owns those windows,
and `createPopoutWindow` now returns whether a window exists so a failed open is
reported as `open-failed` instead of a claimed success.

The renderer holds one lifecycle per action — idle, review, running, succeeded,
failed, cancelled, with an approval count. It lives in component state, not the
store: an approval is a decision about this window at this moment, and
persisting it would sync a granted permission into every other window. `running`
accepts neither cancel nor approve, because a window open is already in flight
and a cancel there would be a button that does not stop what it claims to stop.
A retry returns to review and re-resolves rather than reusing the first
approval. The stored action label is never rendered; the destination is named
through the section's own `palette.section.*` key. The former
`agent.card.actionsPending` string is gone — "not yet connected" became false the
moment this shipped.

Automated evidence: `src/shared/__tests__/agentNavigation.test.ts` (21),
`agentNavigationBridge.test.ts` (13) and `src/main/__tests__/agentNavigationIpc.test.ts`
(16) are new; the shell suite grew to 21. Every IPC assertion checks the sections
the opener was actually called with, not the returned code alone — a refusal that
still opened something would pass a code-only check. The full suite passes 462
files plus 1 skipped, 6,167 tests plus 6 skipped, 0 failed. `i18n-check`,
`i18n-missing-key-check`, `i18n-hardcoded-check` and `i18n-locale-arg-check` all
exit 0. Architecture: 1,577 modules, the same 18 findings, nothing new. Targeted
ESLint reports nothing for the new or changed files (the two `window.d.ts` errors
are a duplicated `subtitleHarvest*` declaration from another track, and the
`main.ts` non-null warnings are pre-existing). `tsc --noEmit` is not a gate; it
reports 360 errors, of which the only two in a file this slice touched are the
`AgentResultEffect.contextId` narrowing errors **proved present at `da8a623`** by
typechecking a pristine worktree at HEAD.

Live Electron evidence, on a fresh start because main and preload changed: a
snapshot/restore run injected one conversation carrying a `route` context and two
navigation cards — one allowlisted, one naming `admin`. Before any interaction
each card showed exactly one control, `Review destination`, no destination, and
the deliberately untrusted stored label was absent from the DOM. Reviewing the
allowed card showed `Open Dictionary · Page entry/QA` with Approve and Cancel,
and **opened no window** — still two. Reviewing the blocked card produced `The
Agent is not allowed to open that place.`, no destination and no approve control.
Approving the allowed card opened window 3 at `?popout=dictionary` and the gate
read `Opened Dictionary` with no controls left. Three direct bridge calls against
the shipped main process then confirmed the boundary: an approved request with an
injected `section: 'settings'` returned `invalid-request` and opened nothing, an
approved request for the non-allowlisted section returned `unknown-section` and
opened nothing, and a review-only request returned its destination with
`opened: false`. The handler's existence was proved by invoking it, not by
listing `window.api` keys. The workspace was restored and asserted identical
field-by-field ignoring `revision`, which main owns and moved 8 → 10; the
synthetic conversation is absent. The error ring stayed at zero for the whole
run. Screenshot: `debug/shots/win2-1786257946146.png`.

## The navigation gate becomes reachable

`routeAgentContext` in `renderer/agentContextHandoff.ts` is the first production
producer of `route` context, and every "ask the Agent about this" gesture now
carries the surface it happened on. `section` is typed `DesktopWinSection` so a
call site cannot invent a destination the app cannot open, `identity` is the
section alone so ten hand-offs from the Dictionary are one shelf entry, and
`retained: true` is honest rather than a workaround — `route` floors at
`ordinary` because it is the app's own navigation state and carries nothing of
the user's. There is deliberately no preview: a place has no content to preview.
The hand-off attaches the place and the material in **one** save, place first in
the array so the material ends up first on the shelf; two sequential saves would
broadcast a half-attached shelf and could give the two items different
conversations.

That last property is what the live run turned up a defect in.
`evaluateAgentProviderPrivacy` selected disclosable context with
`entry.preview.length > 0`, so a place — which has no preview by construction —
was filtered out before the provider ever saw it. The producer, the resolver and
the gate were all correct; the disclosure step silently discarded their input,
and no user-facing conversation could produce a navigation card. Selection is now
kind-aware (`carriesDisclosableContext`): a `route` qualifies on its label,
every other kind still requires a preview. The prompt row for a place carries
`Route: <route>` as its body, because that is what a navigation answer has to
name.

Automated evidence: the four agent suites pass 71 tests, including a new
assertion that a place with no preview is disclosed while a genuinely empty item
beside it is still dropped, and a router assertion pinning the place's prompt
row. `tsc --noEmit` has a large pre-existing baseline; by set-difference these
four files contribute zero new errors.

Live Electron evidence, on a fresh start because main changed: the real
dictionary gesture, the real `.dict-agent` hand-off and the real local Qwen
provider. The persisted workspace shows the assistant message carrying **two**
cards — `dictionary/食べる → open-context` and `navigation/Dictionary → navigate
dictionary` — where the same path before the fix produced one. The navigation
card resolves to a real allowlisted section.

Recorded rather than fixed: the budget arithmetic in
`evaluateAgentProviderPrivacy` sums previews only, so it undercounts labels for
every kind, not just `route`. It is a pre-existing approximation and the
disclosed `inputChars` is recomputed from the assembled prompt, so nothing
user-visible is wrong.

## The execution timeline

`shared/agentTimeline.ts` records what the Agent actually tried to do.
`agentNavigationReduce` already models one action's lifecycle, but it models the
*current state of one control*: a retry overwrites the refusal that preceded it,
and a second card knows nothing about the first. That is right for a button and
wrong for review, and review is the point — approving step three means reading
what steps one and two did.

Two rules carry it. **A terminal attempt is never mutated**, so a retry appends a
second attempt beside the first rather than erasing it; this is the whole
difference between a timeline and a status field, and it is the prerequisite for
`approve-step`. And **an entry names ids only** — no section, page, destination
or label. The navigation channel refuses payloads carrying those exact fields so
that no stored string can widen what gets opened; a timeline that cached the
resolved destination would put that string straight back and invite a renderer to
trust it. The UI resolves every label from the section's own `palette.section.*`
key, as the navigation card does.

`idle` is deliberately not a timeline status: it is the state where nothing
happened, and a record of things that did not happen is noise. A transition
arriving with no live attempt is **dropped rather than opening one**, so a
`succeeded` that no approval preceded cannot enter the record. The attempt opens
when the user clicks Review rather than when resolution succeeds, so a refusal is
something that happened and stays visible. The list is bounded at 200, dropping
oldest first.

It is session-only and per-window, for the same reason `AgentNavigationRun` is:
it records what this window did while the user watched, not a property of the
conversation, and persisting it would put one window's execution history in front
of another window's user.

Automated evidence: `src/shared/__tests__/agentTimeline.test.ts` (10) is new and
the shell suite grew to 22, including a run that fails an approval, retries, and
asserts **two** rows with the original failure and its code intact beneath the
success — plus an assertion that no resolved destination string reaches the
record. `src/shared/__tests__` and `src/main/__tests__` pass 312 files plus 1
skipped, 4,745 tests plus 6 skipped; the renderer suites pass 142 files, 1,329
tests. All four i18n gates exit 0 and targeted ESLint reports nothing. `tsc
--noEmit` is not a gate; the only two errors in a file this slice touched are the
pre-existing `AgentResultEffect.contextId` narrowing errors, unchanged apart from
line numbers.

No live Electron evidence for this slice, and the reason is worth stating: the
timeline has no main-process half and no persistence, so there is nothing a live
run could prove that the shell suite does not already prove against the same
component with the bridge stubbed. The navigation gate it observes was proved
live in the two slices above.

**A note on the commit, recorded because it nearly shipped wrong.** The i18n
catalogs are being edited by four other tracks in this same working tree. Staging
them whole absorbed 1,380 lines that were not this slice's; the commit was reset
and the four catalogs re-staged hunk-scoped, leaving 39 lines. Anyone touching
`catalogs/*.ts` here should stage by hunk and check the diffstat before
committing.

## Two halves of the navigation fix were left unstaged

Found before starting the next slice, not by looking for it: `git status` showed
`src/shared/agentNavigation.ts` and `src/main/agentExecutionIpc.ts` dirty on a
branch whose ledger said their change had shipped. It had not. The previous
session committed the *tests* for "a section is a destination" and the prose
describing it, and left both implementations in the working tree.

The two are now `1a3fbad` (the resolver: a section-only route context resolves
instead of being refused `stale-provenance`, while a stored page against a live
context that has since lost its route stays stale) and `376f28c` (the producer:
`newestDisclosed` takes a predicate so the source card and the navigation
suggestion are selected independently, rather than a millisecond tie deciding
which of the two the user sees).

Worth stating plainly because the ledger read as though this had shipped: **a
section written into a ledger is not a commit.** The check is one `git status`
against the paths a section names, and it costs nothing.

## approve-step becomes a real gate

`approve-step` had been in `AgentResultEffect` since the workspace contracts
landed and inert ever since — a type with no producer, no permission rule and no
failure path. `shared/agentStepApproval.ts` gives it all three, built the way
`agentNavigation.ts` is, because the two are the same problem: a persisted
suggestion that must not be trusted at the moment it is acted on.

The step model it gates already existed. `AgentTask`/`AgentTaskStep` live in
`shared/localAgent.ts`, persist in `AgentTaskQueue` inside the main-owned
operational document, and carry a `waiting-confirmation` status on both task and
step. That status *is* the question `approve-step` asks. Nothing new had to be
invented to make the effect mean something; it had to be connected to what was
already there.

**The stored effect is a reference, never an instruction.** A card action carries
a task id and a step id. Every word the user reads at review time — objective,
step label, operation — is read out of the live queue, so a planner that rewrote
either after the card was persisted is what the user actually approves. The
stored action label is never shown, exactly as the navigation card's label is
never allowed to name a place. A test asserts the sentinel label reaches no part
of the resolution.

**Approval is a third authorization boundary and gets the same check.**
`localAgent.ts` already documents why `evaluateAgentToolAccess` runs at both
planning and execution: a queued task outlives the profile that authorized it. A
user-facing approval has the same exposure and re-evaluates against the profile
as it is *now*, refusing with `operation-denied`. It passes `confirmed: false`
deliberately — asking whether the user *may* approve must not be answered by
pretending they already have, so `confirmation-required` is the expected success
and only `denied` refuses.

**Every absence is a typed refusal rather than a fall-through:** a task the queue
no longer holds, a task already completed/failed/cancelled, a step that is not
waiting, a step waiting out of turn (`step-not-current`), a card whose declared
provenance is empty or gone.

**The producer lives beside the gate,** in the same module, sharing one
`RUNNABLE_QUEUE_STATUS` and one definition of "waiting on the user". A producer
with its own reading of the queue eventually disagrees with the gate, and the
visible form of that disagreement is a button that exists and always refuses. A
test asserts the agreement directly: anything the producer offers, the gate
accepts. Selection is FIFO on the oldest blocked task and independent of the
reply it attaches to — the model chooses nothing. Only one approval is ever
offered, because a message that sprouted four approve buttons would be a queue
view, and the queue already has one.

**No task text is persisted.** The card's title is the source context's own
already-persisted label, so an approval adds no second home for the objective or
the step label in `workspace-v1.json`. A main-side test pushes sentinels through
both and asserts neither reaches the stored card, alongside the operation id.

**The grant runs one step with one confirmed call id.** `executeAgentTaskStep`
overwrites `request.confirmed` from its own `confirmedCallIds` set on every run,
which makes a persisted confirmation impossible. That is a property worth
keeping rather than routing around: a stored confirmation would authorize a
re-run nobody watched. `agentStepApprovalReduce` therefore has no `running`
state — `granted` spans the grant and the single run it authorizes, since a
granted approval cannot be withdrawn mid-execution and a cancel there would
be a button that stops nothing. It *does* accept `failed` from `granted`, which
the first wiring got wrong: without it the card would have read "approved" over
a step that never ran.

`AgentTimelineEffect` gains its second member — the extension the timeline was
built to make cheap. `save` and `undo` stay absent until each has a gate of its
own.

**Automated evidence.** `src/shared/__tests__/agentStepApproval.test.ts` is new
(35 tests); the shell suite grew 22 → 28 with the approval review, grant, a
profile-narrowed refusal, a step that stopped waiting, a cancel, and a
fail→retry→succeed run asserting both timeline rows survive. `agentExecutionIpc`
grew 18 → 20. Full `npx vitest run`: **464 files passed, 1 skipped; 6,233 tests
passed, 6 skipped, 0 failed, exit 0.** All five i18n/architecture gates exit 0.
Targeted ESLint reports 0 errors and 0 warnings. 26 keys added in all four
languages.

No live Electron evidence: the grant's only side effect is a queue write the
`localAgentQueueRun` suites already cover against the same functions, and the
gate has no main-process half. Stated rather than left as a silent absence.

## Staging a catalog by hunk is not enough — check what the hunk deletes

Recorded because it nearly shipped a real regression, and because the previous
session's note ("stage `catalogs/*.ts` by hunk") is necessary but **not
sufficient**.

The four catalogs are being edited by five tracks at once. My 26 keys landed in
one hunk that contained no other track's additions — by the previous session's
rule, safe to stage. Staging it produced *26 insertions and 13 deletions*: another
track had **moved** the `agent.attachment.*` block earlier in the file, so the
hunk that added my keys also carried the removal of those 13 keys from their old
position, while the re-adding hunk sat elsewhere and was correctly excluded.
Committing it would have deleted 13 live keys from `HEAD` and broken the i18n
gate for everyone.

The rule that actually holds: **read `git diff --cached` for the catalogs and
require zero deletions.** A pure addition should stage as a pure addition. When
it does not, build a pure-insertion patch instead — anchor three context lines
either side of a line that exists in `HEAD`, emit only `+` lines, and
`git apply --cached`. The generator and the four patches are in
`~/.claude-runs/lanes/20260809-122200-wake-a/`.

## An independent verification pass, and what it got right and wrong

A sibling agent re-derived this ledger's claims for the last five agent commits
against the tree. Confirmed: `approve-step` had zero producers before this slice;
`AgentResultEffect` carries `taskId`/`stepId` and `normalizeEffect` validates
both; the navigable allowlist is exactly 23 and matches `POPOUT_SECTIONS`; the
timeline suite is 10 tests and the shell suite was 22; the dead `videoRef` and
the stale `src/.coordination/study-mode/state.json` are both real.

It reported two defects. **One is real:** the "Exact next slice" note said the
media *route* work remained, but `routeAgentContext('player', …)` already ships
at `MediaStudyMode.tsx:274`. Following that up showed the item was more stale
than the reviewer said — all four hand-off sites attach a route, and nothing in
the media producer track remains. Corrected below. Note that my own first
rewrite of that item was *also* wrong (it said a media-cue producer remained);
the four call sites are what settled it, not either summary of them.

**One is wrong, and the shape of the error is worth keeping.** It claimed the
`source.app` note names the wrong failure code — that a media context yields
`stale-provenance` rather than `unknown-section`, because `agentNavigation.ts:182`
skips on `item.kind !== 'route'` before `source.app` is compared. That describes
a `media-cue` context. The note is about a **`route` context whose `app` is
`media`**, and for that one `resolveAgentNavigation` returns `unknown-section` at
line 172, before the provenance loop is ever entered. The ledger was right.

Both were checked against the source before either was acted on, which is the
only reason the wrong one did not become a "fix". A sibling's finding is a
hypothesis with a file and a line attached, and the line is the part to read.

## `save` becomes a real effect

The second of the three inert effects to acquire a gate, and deliberately built
as a copy of `agentStepApproval.ts`'s shape rather than a third one — a third
kind of permission gate would be a third thing to audit.

What differs is what decides the design. `approve-step` authorizes work a
planner already described; `save` creates a durable row out of context **the
user put on the shelf themselves**. There is no plan to consult and nothing a
model wrote to trust, so the word, the reading and the meaning are read from the
live context item the effect names, and the stored effect keeps that item's id
and nothing else.

**Only reference-grade context can be saved.** `SAVABLE_CONTEXT_KINDS` is
`dictionary-entry` alone. A `reading-passage`, a `selected-text` or a `media-cue`
is the user's own material, session-only by design and never written to disk;
turning one into a flashcard row would be the persistence boundary leaking
through a button. Those refuse with `not-savable-kind`. `entityType` is a
free-form string on the persisted effect, so `AGENT_SAVABLE_ENTITY_TYPES` does
for it exactly what `AGENT_NAVIGABLE_SECTIONS` does for a destination.

**Re-authorized at the moment of saving,** against the profile as it is *now*,
through the same `flashcard.add-cards` operation the tool registry exposes.
`AGENT_SAVE_OPERATION` names that operation once, so the permission check and
the side effect cannot come to disagree about what was authorized.

**Saving twice is not saving twice.** The deck is keyed by word; a second save
of the same entry refuses with `already-saved` rather than quietly creating a
duplicate the user then has to find and delete. `savedWords` is supplied by the
caller rather than read here, which keeps the module free of renderer storage
for the same reason the queue is passed into the approval gate.

**Fifteen typed refusals, each with its own sentence in all four languages.**
Empty provenance is not a pass — the same fail-closed rule the navigation and
approval gates use. A context item whose label is blank refuses with
`entity-incomplete` instead of writing a card with no front, which is the
difference between a save that failed and a deck that quietly acquired an empty
row.

`agentSaveReduce` mirrors the approval lifecycle: `saved` spans the confirmation
and the write it authorizes and accepts `failed`, or the card would read "saved"
over a deck that gained nothing. A `retry` returns to `idle` rather than reusing
the earlier resolution, so the next attempt re-reads the live deck and cannot
act on a decision made before the word was already there.
`AgentTimelineEffect` gains its third member. `undo` stays absent — it is the one
that needs an operation log.

**Automated evidence.** `src/shared/__tests__/agentSave.test.ts` is new (20
tests); the shell suite grew 28 → 33 and `agentExecutionIpc` 20 → 21. 24 keys
added in all four languages (8 card, 15 refusal, 1 timeline).

## A grant that re-implemented a subset of its own gate

An independent review running on a second account attacked the `approve-step`
gate the previous section describes. It found the review half solid and the
grant half not: `grantAgentStepApproval` checked
`step.status === 'waiting-confirmation'` by hand instead of asking
`resolveAgentStepApproval`, and so performed none of the queue-row, out-of-turn
or permission checks the resolver performs.

**The reachable exploit.** `cancelAgentQueueItem` sets the queue *row*'s status
and never touches the task or its waiting step. So: review an approval card,
cancel that task from the queue panel, then approve — and the step executed.
Worse, the write-back went through `agentQueueStatusForTask`, which had no
`cancelled` or `paused` branch and returned `queued`, so the cancelled task was
resurrected and became eligible for the runner again. The same mechanism
silently reverted a pause, which is precisely what the module header claimed the
design prevented.

Two more findings had the same single cause. A profile narrowed while the card
sat on screen failed the *whole task* instead of refusing the step, because the
permission re-read happens inside `executeAgentTaskStep` after `start-step`, so
`fail-step` set `task.status = 'failed'` and `operation-denied` was unreachable
from the grant path. And `step-not-current` was dropped entirely at grant time.

**One fix closes all three.** The grant now calls the resolver in full against
inputs read at that moment, and re-locates the step by id afterwards; nothing is
re-implemented. `agentQueueStatusForTask` gains the missing `cancelled` and
`paused` branches, so a write-back can no longer promote a row the user stopped —
those two statuses are the user's decision about the *row*, not a report about
the task.

The lesson outlasts the fix and now lives in the function's header:
**re-implementing part of a gate is how a gate stops being one.** The resolver
was made pure precisely so that both callers could ask it the same question, and
its own header already said that a gate resolving differently depending on who
is asking is not a gate. The grant was the second caller, and it asked something
else.

**Automated evidence.** `src/renderer/__tests__/agentStepApprovalClient.test.ts`
is new (7 tests), covering the cancelled-row and paused-row refusals directly;
`localAgentQueueRun` grew 16 → 17. The review's own report is kept at
`~/.claude-runs/lanes/20260809-122200-wake-a/review-x2.md`, including the seven
attacks that **failed** and why — a list worth more than the findings, since it
is the part a re-audit does not have to repeat.

## The queue panel stops being a second gate

The previous section's lesson, applied to the caller it had not yet reached. The
Blanc queue panel's `confirmAndRun` never consulted the gate at all — it called
`runAgentTaskStep` with a confirmed call id directly — so every check the card
path performs was simply absent on the other route to the same permission.

Its profile allow-list check was not a refusal either. The old body hands the
step to the runner and lets `executeAgentTaskStep` deny it *after* `start-step`,
which fails the whole plan rather than declining one step — the same defect the
grant had, in the same shape, discovered independently. **Measured rather than
argued:** restoring the old body fails 4 of the 5 new tests, and the fourth fails
on the status line rather than on the call count, which is what exposed it.

`resolveAgentStepApproval` is now split. The conversation-free half —
`resolveAgentQueuedStepApproval(queue, taskId, stepId, permission,
allowedOperations?)` — holds the whole live-state rule, and the card-shaped
resolver is re-expressed on top of it. `AgentStepApprovalFailureCode` is built
*from* the narrower `AgentQueuedStepApprovalFailureCode`, so the two cannot drift
by construction rather than by discipline.

**`paused` leaves `RUNNABLE_QUEUE_STATUS`,** which changes both surfaces: a
paused row is no longer approvable and `pendingAgentStepApproval` stops offering
one. This follows from the extraction rather than being bolted onto it. Every
caller runs the step the instant the grant lands, so an approvable paused row is
a button that silently undoes Pause — and `agentQueueStatusForTask` would then
preserve `paused` over the run that just happened, which is the resurrection bug
wearing different clothes. No existing assertion was edited to accommodate it:
`agentStepApproval.test.ts` is 105 insertions and 0 deletions.

**Still open, and deliberately not half-fixed:** `runNext` and `runQueued` have
the same deny-after-start shape for the profile allow-list. They are not grants,
so they were out of this slice's scope, but the defect is real and is recorded
here rather than left for someone to rediscover.

`blancAgentStepConfirmGate.test.ts` mounts the real panel in jsdom and clicks
real buttons with `runAgentTaskStep` as the only mock — the queue store and the
operational snapshot are real, so the Cancel click genuinely is what the Confirm
click reads back. 6 keys in all four languages.

**Automated evidence for this slice and the operation log below, measured
together after both landed.** Full `npx vitest run`: **469 files passed, 1
skipped; 6,352 tests passed, 6 skipped, 0 failed, exit 0** — up from the 464 /
6,233 recorded at "approve-step becomes a real gate". All five i18n and
architecture gates exit 0; `i18n-check` reports all 8,912 English keys
translated in ja/zh/ru.

**A staging note that cost more than the code did.** Four files in this slice's
blast radius carried other tracks' uncommitted work: `catalogs/*.ts` held the
`gameArena`/`mooncapLore` fold-in (327 foreign insertions and 14 deletions in
`en.ts` alone), and the dictionary slice beside it found `preload.ts` at 226
insertions of which 8 were its own, `window.d.ts` at 139 of which 2 were, and
`DictionaryResults.tsx` carrying an audit-track Tatoeba attribution. Hunk-staging
cannot separate those. What worked is the stronger form of the rule recorded
above: **rebuild the file as HEAD plus your own lines, `git hash-object -w` it,
and `git update-index --cacheinfo` the blob** — the working tree keeps every
other track's changes untouched, and the staged diff is provably yours. Verify
by arithmetic afterwards: the foreign line counts must drop by exactly what you
committed and no more.

## The operation log, built and left unwired

`undo` is the last inert effect, and it stayed inert for a reason the other three
did not share: `navigate`, `approve-step` and `save` each resolve against
something the workspace already holds, and `undo` resolves against a record of
past operations that did not exist. `shared/agentOperationLog.ts` is that record
and nothing else — no producer, no card, no channel, no caller, no barrel export.

**Ids only, never a copy of the entity.** A log that captured the old value of a
row is a stale copy by construction, and restoring one would silently revert
edits nobody asked to lose. An entry names what was touched and refuses to
remember what it looked like.

**An inverse is an operation the tool registry already exposes, or there is
none.** `AGENT_INVERSE_OPERATIONS` maps eight forward operations to real
`AgentToolOperationId`s — each re-derived against the union rather than taken on
trust — so the undo of a gated action is itself gated, with no second and weaker
path into tool execution. No delete has an inverse; ids alone cannot restore one.

**Undoing onto state that moved is the defect it exists to prevent.** Any later
entry naming one of the same ids refuses as `superseded`. A `read` does not
supersede, because looking is not touching. `not-invertible` is checked before
`superseded`, so a user is never told "something changed" when the truth is "that
was never undoable" — an ordering choice, and the test that pins it says why.

It reads no live state, by design: it answers what the inverse *would* be, from
the log alone. `entity-not-found` is declared in the failure vocabulary and is
unreachable from this module, reserved for the resolver the wiring slice adds.
That is the seam. Bounded at 200, equal to `AGENT_TIMELINE_LIMIT` so an entry
that has fallen out of the timeline the user is reading is not still offered as
undoable.

25 tests, exit 0. Classified `pending` in `tools/architecture-baseline.json`:
test-only is this slice's intended state, not an orphan. `--update-baseline` was
deliberately not used — it would have swept in three other tracks' new modules
that happened to be in the tree.

**One judgement call worth revisiting.** `flashcard.add-cards` maps to
`flashcard.modify-cards`, which bends the module's own rule that an inverse is
the reverse operation: modify is not the reverse of add, it is the nearest thing
the registry offers, since there is no `flashcard.delete-cards`. That is the
entry `save` — the effect that just shipped — would reach first. Either the
registry gains a real delete verb or that mapping should be removed and
`add-cards` declared non-invertible.

## Exact next slice

**Not the media producers — that work is finished.** Checked before starting it,
and the whole item was stale. All four hand-off call sites exist and every one
attaches a navigable route beside its material: `DictionaryPopup.tsx:109`
(`dictionary`), `NovelReader.tsx:2231` and `:2271` (`library`), and
`MediaStudyMode.tsx:274` (`player`). Nothing remains here.

The long-standing `source.app` warning should be **retired rather than acted on**.
`mediaCueAgentContext` at `src/renderer/agentContextHandoff.ts:359` does emit
`source: { app: 'media' }`, and `media` is indeed not in
`AGENT_NAVIGABLE_SECTIONS` — but that producer emits a `media-cue`, and a
`media-cue` is material, not a place. Only a `route` context authorizes
navigation, and the route beside it already says `player`, with a comment at the
call site explaining exactly that choice. Changing the cue's `app` would relabel
a context chip and fix nothing. The warning was written when the route half did
not exist yet and has been describing a hypothetical ever since.

**`undo`, and only `undo`.** This item used to name `save` beside it. `save`
shipped — see "`save` becomes a real effect" above — so `undo` is the last inert
effect, and the shape is now established three times over: a typed producer that
stores ids only, a resolver that re-derives everything from live state,
re-authorization at the moment of action, and a typed refusal for every absence.

What `undo` needs that neither of the others did is an **operation log**, and
that log now exists — see "The operation log, built and left unwired" above. It
stores ids and never captured values, and it refuses `superseded`,
`not-invertible`, `already-undone`, `entity-not-named` and `log-rolled`.

So the remaining `undo` work is the wiring, and it is a real slice rather than a
connection: a producer that offers an undo only for an entry the log says is
invertible, a resolver that re-derives against **live** state and raises the
`entity-not-found` the log module declares but cannot itself produce,
re-authorization of the inverse operation at the moment of action, and a card
that renders a refusal as an explanation rather than a dead button. Nothing
appends to the log yet either — the effects that complete must record what they
did, and `save` is the first one that should.

**The queue-side view of the approval is done** — see "The queue panel stops
being a second gate" above. What it left behind is narrower and still real:
`runNext` and `runQueued` check the profile allow-list by handing the step to
the runner and letting the executor deny it after `start-step`, which fails the
whole plan instead of declining one step. They are not grants, so no gate call
belongs there; the fix is to refuse before starting, and it is one slice.

**Two findings from the independent review that are still open.** Both were
re-derived against the tree before being written here, and both are real.

*The producer and the gate genuinely disagree.* `pendingAgentStepApproval` runs
in **main** (`agentExecutionIpc.ts:177`), where neither the renderer-owned
profile nor the card's provenance is visible. A task waiting on an operation the
active profile disables therefore gets an approve card on every reply, and that
card always refuses. The "anything it offers, the gate accepts" test
(`agentStepApproval.test.ts:259`) varies nothing on either axis, so it passes
while the property it names is false — the test agrees with itself, not with the
gate. Two honest fixes exist and the choice between them is real: teach the
producer the permission set, which means moving the producer or moving the
profile; or let the card carry the refusal and render as a disabled explanation
instead of a button that cannot work. The second is cheaper and arguably more
truthful. Neither is free, which is why this is recorded rather than guessed at.

*The `dismiss` branch is unreachable — in all three lifecycles, not one.* The
review flagged it on the approval reducer. It is wider than that: no non-test
code dispatches `{ type: 'dismiss' }` to the navigation, save or approval
reducer. Three reducers carry a branch nothing can reach, and three test suites
assert its behaviour, which is how it has stayed invisible. Either a completed
card should offer a dismiss and return to `idle`, or the branch and its event
member should go from all three. Cosmetic in effect — the state stays truthful
either way — but it is dead weight in the one part of this surface that has been
careful about claiming only what it does.

**A note for whoever adds those producers:** `source.app` must be an allowlisted
section name. The existing media producers emit `app: 'media'`, which is not a
window — a media route context built that way resolves to `unknown-section` and
fails closed, correctly but uselessly. Emit `player`, `video` or `music`.

**The player call site, once the study-workspace block track lands.** The producer
and its i18n keys are already in place, so that slice is one button beside
"translate this line" in `AiWorkspaceBlock`, plus the scene built from the
overlay's own neighbouring cues rather than from `analysis.sentences`. It is
blocked only on `src/media/`'s 12 untracked files being committed; nothing about
the transport needs to change. Re-check `src/.coordination/study-mode/` first — its
`state.json` still reads `SM-032` on branch `grammarx/phase-1-5`, last updated
2026-07-30.

**Worth fixing on the way, and owned by that track rather than this one:** the dead
`videoRef` above. Either something must render `<video ref={videoRef}>` again or
`MediaState.active`, `MediaStudyMode`'s `activeCue` prop and
`MediaStudyAssistantPanel`'s `sentence` fallback should stop pretending to a live
cue they never receive. Recorded here rather than fixed — the two files that would
change are the other track's.

Then the rest of the Track 3 surface: additional deterministic card producers,
permission-gated tool timelines, approve/cancel/retry/undo, route and media
handoffs, privacy/budget controls and broad QA. `open-context` and `navigate` are
now the two live effects; `save`, `approve-step` and `undo` stay unconnected until
each has a typed producer, permission rule and honest failure path.

**The `navigate` mode preset was revisited when navigation shipped, and
deliberately left unchanged.** The earlier note here asked for exactly that
review, on the grounds that its "You cannot open surfaces yourself" sentence
would become false silently. It did not become false. What can now open a surface
is a deterministic card built from context metadata and approved by the user; the
model's prose still chooses nothing, triggers nothing and is never read as an
effect. The capability granted is the user's, not the agent's, so the preset must
keep saying what it says — telling the model it can act is the one edit that would
make the sentence a lie. `automate`'s sentence is untouched and still true: there
is no tool loop.

Still open and deliberately deferred: `localAgentProfilesStore` and
`localAgentSettingsStore` remain renderer-owned `localStorage`, which is correct
while they are per-window preferences with no main-side reader.
`codex/claude-agent-shell` stays reference-only.

## `undo` becomes a real effect

The last inert result-card effect is now wired end to end. The prerequisite was
closed first: a reviewed Save target is presentation state, not authority.
`grantAgentSave` re-reads the active profile, effective permission, available
tool ids and live deck at confirmation time, then re-runs `resolveAgentSave` and
writes only the target produced by that fresh resolution. Tests narrow the
profile and remove the source after review; both refuse without a deck write.

The operation log remains deliberately **session-only and window-local**. A
successful Save appends its exact created card id and a stable call id to the
bounded parent-shell log. That placement makes the Undo offer survive a
conversation switch and MessageRow remount, without persisting a stale inverse
across an app restart. A restart keeps the card and offers no Undo, which is the
honest result for an ephemeral log.

`flashcard.add-cards` now has a real inverse instead of the earlier
`modify-cards` approximation. `flashcard.delete-cards` is a typed, destructive,
limited-actions registry operation that accepts only an explicit id list,
refuses a missing id, removes only the named live cards and returns the exact
removed ids. The built-in profiles expose the operation anywhere they expose
Add cards; the ordinary permission/allow-list gate therefore governs the
inverse instead of a bespoke delete path.

`agentUndoActionForCall` offers a deterministic ephemeral `undo` action only
while the named log entry has a supported inverse. Review, confirm, cancel,
retry, running, failed and undone are explicit lifecycle states. Confirmation
calls `performAgentUndo`, which resolves the stable log entry again, re-reads
the live profile, effective permission, registry allow-list and deck ids, and
re-authorizes immediately before invoking the central registry adapter. A
missing entity, superseding operation, rolled log, narrowed permission or
disabled inverse is a typed refusal and never a best-effort mutation. Success
records the inverse entry with `invertsSequence`, removes the Undo control and
leaves the truthful result “The change was undone.” The timeline has its own
Undo effect rather than labelling inverse attempts as navigation.

### Measured evidence

- Agent-focused regression: **45 files, 618 tests passed, 0 failed**.
- Full repository regression: **471 files passed, 1 skipped; 6,371 tests
  passed, 6 skipped**. Its single failure is the stale baseline row
  `test-only-module:src/shared/agentOperationLog.ts`: the module is now a real
  renderer dependency, so the finding is correctly gone. Removing the row from
  `tools/architecture-baseline.json` is the only fix, but this workspace's
  `AGENTS.md` restricts this task to `src/`; no root file was changed.
- Main SSR, preload SSR and renderer production builds all exit 0. The renderer
  still reports the repository's existing chunk/dynamic-import warnings.
- All four i18n gates exit 0. All **8,936** English keys exist in ja/zh/ru;
  locale-argument, missing-key and hardcoded-text checks are clean against their
  baselines.
- The changed Undo/Save paths contribute no TypeScript diagnostics to the known
  repository-wide TypeScript baseline. Focused lint has no errors and retains
  two pre-existing warnings in `localAgentProfiles.ts`.

### Live Electron proof

The production renderer was exercised through the dev-only loopback debug
bridge because the page requires Electron preload APIs. No coordinate CUA or
test-only renderer was used. A retained dictionary context produced a real
local-Qwen result card. The initial read-only profile refused Save with no deck
write. After opening Save review, narrowing the profile again refused at
confirmation. Re-authorizing produced exactly one card,
`fc-msm6fakf-iczkdf`, and changed the real deck from **3,221 to 3,222** cards.

The Undo offer survived switching to another conversation and back. After Undo
review opened, narrowing the permission to read-only refused confirmation with
“The active profile no longer permits the inverse operation”; the deck stayed
at 3,222 and the exact id remained. Re-authorizing and confirming removed only
that id, restored the deck to **3,221**, removed the Undo button, rendered “The
change was undone,” and recorded the successful and refused attempts in the
activity timeline. The 900 x 640 window had no horizontal overflow and the
bridge reported zero renderer error logs.

Before live QA, the full Electron profile was copied to a temporary backup.
After closing the Agent pop-out and main window through their application close
paths, the backup was mirrored back. Source and restored profile both measured
**53,394 files / 9,059,544,186 bytes**, and a dry-run mirror returned no
differences. The five QA screenshots and temporary 9 GB backup were then
removed, so neither the test prompt, permission changes nor temporary card
remain in the user's profile.

## Exact next slice after Undo

Fix `runNext` and `runQueued` so a step disabled by the active profile is
refused **before** `start-step`. Their current deny-after-start path turns a
declined step into a failed plan, even though the card and queue-panel approval
routes now fail closed before execution. Keep this slice narrow: extract or
reuse one pre-start allow-list decision, prove both runners leave task and step
state unchanged on refusal, and do not combine it with the separate
main-produced approve-card/profile mismatch.

After that, reconcile `pendingAgentStepApproval` with renderer-owned profile
state so the producer does not keep offering a button the gate must refuse.
Rendering a disabled explanation is the smaller honest fix unless profile state
is intentionally moved across the main/renderer boundary. The three unreachable
`dismiss` reducer branches and the independent Track 7 tour replay defect remain
separate cleanup slices.

## Ordinary queue runs refuse before they start

`runNext` and `runQueued` no longer turn withdrawn authority into a failed
plan. `executeAgentTaskStep` still owns the one access decision, but a denied
decision now returns a typed `operation-denied` refusal **before** calling the
clock, dispatching `start-step`, invoking an adapter or emitting an execution
event. The original task object is returned unchanged. `runAgentTaskStep`
propagates that refusal with the original queue object and does not call the
queue write-back. The Blanc panel maps it to the existing localized refusal and
returns before changing task, queue or activity state. The Agent approval client
also handles the new union explicitly, so a future authority race cannot persist
an untouched task and misreport it as a lifecycle failure.

The click boundary was tightened at the same time. `runNext` and `runQueued`
both re-read the main-owned queue, and `runNext` resolves its exact task id
through `selectAgentQueueRun` instead of trusting the panel's task copy. A row
paused or cancelled in the queue therefore refuses rather than running behind
the queue controls. Both ordinary runs and Confirm re-read settings and the
active profile at the click, compute the installed-handler/profile intersection
again, and pass that fresh authority into the one runner. A profile narrowed in
another window takes effect even while this panel still renders its older
checkbox state. A queued task is only installed as the live task after a
non-refused run, so a declined row does not clear the visible plan/activity.

### Measured evidence

- Focused execution/Blanc integration: **4 files, 55 tests passed**. The cases
  pin task and queue reference identity, no clock call, no adapter call, no
  error property, no events, both top-level run buttons, paused/cancelled
  `runNext`, same-mount profile edits and cross-window-stale profile state.
- Agent-focused regression: **45 files, 624 tests passed, 0 failed**.
- Full repository regression: **471 files passed, 1 skipped; 6,377 tests
  passed, 6 skipped**. The only failure remains the out-of-scope stale
  `test-only-module:src/shared/agentOperationLog.ts` row in
  `tools/architecture-baseline.json`.
- Main SSR, preload SSR and renderer production builds exit 0 with the existing
  chunk/dynamic-import warnings. All four i18n gates remain green across 8,936
  English keys. Focused ESLint reports zero warnings and zero errors.

### Live Blanc proof

The production Electron renderer was exercised through the dev-only bridge in
a 1000 x 760 Blanc window and again at 520 x 430. A real main-owned queued
`flashcard.add-cards` task was seeded, Add cards was disabled from the real
Approved tools editor, and **Run next queued plan** rendered “The current
profile and permission level no longer allow this step’s action.” The serialized
queue before and after was byte-identical: row `queued`, task `queued`, step
`pending`, no error and no execution log.

A second real queued `flashcard.delete-cards` task was allowed once so it reached
`waiting-confirmation` without invoking its adapter. Delete cards was then
disabled and **Run next approved step** rendered the same refusal. Its serialized
queue was byte-identical before and after; the only activity remained the
original `confirmation-required` event, with no `tool-started` or `tool-failed`.
Both sizes had zero horizontal overflow, readable wrapped refusal text and zero
renderer errors or Agent warnings.

The full Electron profile was backed up before QA and restored afterwards.
Backup and restored profile both measured **53,394 files / 9,059,544,186
bytes**, and a dry-run mirror found no differences. Temporary task/profile/deck
changes, three screenshots and the temporary 9 GB backup were removed.

## Exact next slice after ordinary queue refusal

Reconcile the approval-card producer with the renderer gate without moving
renderer-owned profiles into main. Main may select and persist only a queue
reference `{ taskId, stepId }`; it must not claim that the current renderer can
approve it. Share one structural candidate rule that requires a runnable queue
row, task status `waiting-confirmation`, the exact current step id, and a step
that is itself waiting. `currentStepId: undefined` is a refusal, not an implicit
match.

At the Agent workspace boundary, hold one hydrated live approval context and
observe queue, settings and profile changes once per shell rather than once per
historical message. While idle, a resolvable reference renders **Review step**;
a denied or unavailable reference renders a passive localized explanation with
no action and no timeline attempt; pre-hydration renders a neutral checking
state. Review and Grant must continue to re-read and re-authorize independently.
Visually prove same-mount deny → enable → Review, deny-after-review, successful
retry and long-locale wrapping at compact and large Agent sizes.

## Approval references stay passive until live authority agrees

Main now selects only a structurally coherent queue reference and makes no
claim about renderer-owned authority. `pendingAgentStepApprovalReference` and
the live resolver share one candidate rule: the queue row is `queued` or
`running`, the task itself is exactly `waiting-confirmation`, the referenced
step exists and is waiting, and `currentStepId` exactly matches it. A missing
current id and every contradictory terminal/running task shape fail closed.
The persisted effect remains IDs-only. A queue read failure now degrades to no
approval suggestion without discarding the completed assistant reply.

The Agent shell owns one hydrated approval context for all historical messages.
It subscribes once to the main-owned queue plus same-window and cross-window
settings/profile changes, and unsubscribes all three paths together. Before
hydration it renders a passive localized availability check. Once hydrated, an
idle/retry/review control is actionable only while the full live resolver
succeeds. A denied state shows a monochrome lock and the existing localized
reason, exposes none of the live objective, step label, operation id or stored
action label, and creates no timeline attempt. Review and Grant still perform
independent fresh reads; the presentation snapshot is never authorization.

### Measured evidence

- Focused producer/gate/observer/shell/store integration: **5 files, 167 tests
  passed**. The matrix covers every queue/task/step/current-id contradiction,
  deterministic FIFO, IDs-only serialization, optional queue-read failure,
  handler/profile intersection, hydration muting, live queue/settings/profile
  refresh, listener cleanup, passive information minimization and same-mount
  deny/widen recovery.
- Agent-focused regression: **46 files, 668 tests passed, 0 failed**.
- Full repository regression: **472 files passed, 1 skipped; 6,421 tests passed,
  6 skipped**. The only failure remains the out-of-scope stale
  `test-only-module:src/shared/agentOperationLog.ts` entry in
  `tools/architecture-baseline.json`.
- The renderer production build exits 0 with the existing chunk and
  dynamic-import warnings. The Forge development build compiled both the main
  and preload targets before launching Electron. Focused ESLint and
  `git diff --check` are clean.
- All four i18n gates pass across **8,937 English keys**.

### Live Agent proof

The real Electron renderer, preload and main-owned stores were exercised in a
dedicated Agent window at **900 x 640** and **1280 x 800**. With the default
read-only permission, the authentic waiting `flashcard.add-cards` reference
showed “The active profile no longer permits that operation,” with no button,
no timeline row and none of the objective, step, operation or stored-label
sentinels in rendered text. Enabling limited actions in the already-mounted
window changed that same card to **Review step** without reload or timeline
mutation. Review displayed the long objective and step from the live queue,
never the stored action label.

Narrowing permission from another Electron window while Review was open hid
the live details and both action buttons immediately, while retaining the
already-witnessed Review timeline entry. A deliberately silent same-window
storage change then exercised the final TOCTOU boundary: the still-rendered
Grant control was clicked, Grant re-read authority, returned the localized
`operation-denied` failure, and the serialized main-owned queue before and
after was byte-identical. No adapter ran. Re-enabling and retrying returned to
Review, and Cancel ended the pass without a side effect. Long English review
text and the Russian passive refusal wrapped without horizontal document or
card overflow. The debug bridge reported **0 error logs and 0 Agent logs**.

Seven temporary screenshots and the temporary QA directory were removed after
inspection. The workspace and the post-reset operational document were restored
to their captured SHA-256 hashes after the app closed. QA-process caveat: the
attempted `--user-data-dir` isolation did not redirect Electron's
`app.getPath('userData')`; the first direct operational seed therefore reached
the normal profile before a backup existed. It was immediately reset to the
empty operational document, but the pre-launch queue/memory/automation bytes
cannot be proven or recovered. Future live Agent passes must take the full
profile backup before launch, as the preceding slices did; this launch method
must not be reused as an isolation claim.

## Exact next slice after live approval availability

Fail closed on duplicate persisted message/card/action coordinates before any
more interactive effects are added. `normalizeCard` currently preserves
duplicate action ids while resolvers use `find` and React renders by that id, so
the action a user sees can become a different sibling from the action a gate
resolves. Define one deterministic normalization rule for duplicate message,
card and action ids, pin it across load/save and every interactive resolver,
and prove no ambiguous stored coordinate can navigate, save, approve or undo.
Keep the separate causal-provenance issue — an oldest global blocked task being
attached to an unrelated disclosed source — as the next task-origin slice,
rather than implying a card's persistence provenance caused the queued task.

## Persisted Agent action coordinates fail closed on ambiguity

Message, card and action ids are now canonicalized before uniqueness is
decided. If trimming or the 240-character persistence bound makes two ids
collide, **every** member of that collision group is removed and unrelated
unique entries remain. The scope matches the coordinate contract: message ids
are unique within a conversation, card ids within a message and action ids
within a card. Reusing a card id in another message or an action id in another
card remains valid.

Normalization is not the only boundary. Navigation, save and approval now use
one shared unambiguous coordinate lookup which requires exactly one matching
message, card and action. Hand-built typed state, legacy state or a future
producer that bypasses persistence therefore cannot restore first-array-match
behavior. Every ambiguous coordinate maps to the existing `action-not-found`
refusal, so no destination, entity or queued step can be chosen by ordering.
The navigation resolver also carries the uniquely matched card forward into
its provenance check instead of searching for it again.

### Measured evidence

- Focused normalization/store/producer/navigation/save/approval regression:
  **6 files, 180 tests passed, 0 failed**.
- Tests cover whitespace and truncation collisions at all three coordinate
  levels, removal of every colliding member, preservation of unrelated entries,
  legal reuse in a different scope, raw on-disk JSON, current producer
  uniqueness and reversed malformed array order at each interactive gate.
- Focused ESLint and `git diff --check` are clean; only the repository's normal
  LF-to-CRLF notices are emitted.

No live visual pass is required for this slice: valid normalized workspaces
render exactly as before, while ambiguous persisted rows are removed before
render and direct malformed resolver input produces the existing passive
failure. The next broad Agent visual pass remains required after the visible
Track 3 inspector/navigation work.

## Exact next slice after unambiguous action coordinates

Bind an approval reference to the workspace source that actually created its
task. A queued item needs bounded optional origin coordinates: conversation id
plus deduplicated context ids. The approval producer must consider only
structurally eligible tasks whose origin conversation matches the current
conversation and whose origin intersects the provider-disclosed context that
is still live. Originless legacy rows, wrong-conversation rows, empty or
disjoint origins and removed or undisclosed sources produce no approval card.
FIFO and id tie-breaking apply only after this causal filter. The card's
`sourceContextIds` must come from that matched task origin, while its effect
continues to persist only `taskId` and `stepId`; objective, step label and
operation remain live queue data.

## Approval cards are bound to their task's causal origin

Queued work now carries optional bounded origin coordinates beside the task:
one conversation id and a deduplicated, capped list of context ids. The queue
normalizer trims and bounds every id, omits malformed partial origins, preserves
legacy originless rows, and carries a valid origin through replacement,
write-back, pause, resume, cancel and priority changes. The main-owned
operational store round-trips the normalized origin on disk without inventing
one for legacy rows.

The approval selector now receives the current conversation plus context ids
that are both live and provider-disclosed. It first rejects structurally
ineligible rows, then rejects originless tasks, a different conversation, and
empty or disjoint origin intersections. FIFO and id tie-breaking run only over
the remaining causal candidates. The returned card is grounded in the matched
origin ids, in origin order and without duplicates; its title also comes from
the first matched live context rather than the newest unrelated reply material.
Removed or undisclosed origins therefore suppress the approval suggestion while
leaving the completed assistant reply and its other cards intact. Completion
uses the conversation's latest context snapshot rather than the provider's
request snapshot, so removing the oldest origin during an in-flight request
reselects the next matching task instead of choosing a card that persistence
will immediately prune.

This deliberately does not retrofit a false origin onto Blanc-created plans.
Those legacy/context-free tasks remain runnable from the queue panel, but they
cannot appear as if an unrelated Agent conversation created them. A future
Agent task producer must pass its real conversation/context coordinates when it
enqueues work.

### Measured evidence

- Focused origin/queue/gate/main/store integration: **5 files, 159 tests
  passed, 0 failed**.
- Agent-focused regression: **46 files, 690 tests passed, 0 failed**.
- Full repository regression: **472 files passed, 1 skipped; 6,443 tests
  passed, 6 skipped**. The sole failure is still the out-of-scope stale
  `test-only-module:src/shared/agentOperationLog.ts` entry in the root
  architecture baseline.
- Renderer production build: **4,745 modules transformed, exit 0**, with the
  repository's existing chunk-size, ambiguous utility and dynamic/static import
  warnings. Focused ESLint and `git diff --check` are clean.

No new renderer state was introduced in this slice, so its visible behavior is
already the approval-card absence/presence behavior covered by the producer and
shell suites. The next live visual pass belongs to the visible inspector and
guided-navigation work and must use a full Electron profile backup before any
store mutation.

## Exact next slice after causal approval provenance

Finish the planned collapsible context/activity inspector in the Agent shell.
The toggle must be keyboard-operable with `aria-expanded` and `aria-controls`;
context shelf and filtered activity retain their current behavior inside it;
collapse state stays presentation-only and never writes the workspace. Large
layout should read as rail / conversation canvas / inspector, while compact
layout collapses or stacks without horizontal overflow. Conversation changes,
long localized strings and reduced motion need focused tests and live proof.

After that, complete exact guided navigation. The stored and live allowlisted
destination must agree on section, page, control id and highlight; approval
must deliver one typed deep link to one focused Settings window, stale or
unknown controls must fail honestly, and renderer requests must never inject a
destination.

## Collapsible inspector and exact guided navigation are complete

The Agent context/activity rail is now one accessible inspector. Its summary is
keyboard-operable, exposes `aria-expanded` and `aria-controls`, and keeps the
existing context shelf and filtered activity inside the controlled region.
Collapse state remains component presentation state: it never enters the
workspace serializer or the main-owned document. Desktop layout is rail /
conversation / inspector; compact layout stacks the inspector below the
conversation without changing the stored conversation.

Guided navigation now preserves reviewable page metadata for ordinary app
sections while allowing executable page/control/highlight coordinates only for
registered Settings targets. The result-card producer copies those coordinates
from the disclosed route context, never provider prose. The renderer sends only
message/card/action ids plus the approval boolean; main re-resolves the unique
persisted coordinate, re-checks live provenance and opens the typed destination.
The Settings consumer accepts only an exact registered page, requires one
unique rendered control when a control was requested, verifies the highlight
contract, scrolls and focuses the target, then acknowledges delivery. Unknown,
duplicated and stale coordinates fail honestly.

### Measured evidence

- Inspector/navigation focused regression: **6 files, 146 tests passed**.
- Final cross-lane focused regression after the later Agent/Aero/Blanc changes:
  **14 files, 187 tests passed**.
- Agent-focused regression: **48 files, 709 tests passed**.
- Focused ESLint has 0 errors; only two pre-existing Blanc non-null-assertion
  warnings remain outside these Agent changes. `git diff --check` is clean.

### Live Electron proof

The real renderer, preload and main-owned stores were exercised at **1264 x
821** and in an Agent pop-out at **900 x 640**. Both sizes had zero document,
shell, workspace and card horizontal overflow. Russian long copy wrapped. Space
on the focused inspector summary changed `aria-expanded` true to false, hid the
controlled content, retained focus and left the captured workspace SHA-256
unchanged, proving the collapse is presentation-only.

An exact synthetic Settings route was inserted only after a full profile
backup. Agent review displayed section, page, control and highlight in Russian.
Approval opened one Settings window on `appearance`, found exactly one
`data-setting-id="theme"`, focused its input, visibly highlighted it and
completed the Agent timeline as **Opened**. No destination field came from the
renderer request. The bridge reported **0 errors and 0 Agent logs**. The
53,405-file profile was restored byte-for-byte and the temporary backup and
screenshots were deleted.

## Per-request budgets and complete cloud consent are visible

The composer now exposes session-only input-character and output-token limits.
Their bounds/defaults live beside the execution bridge normalizer, the selected
values are sent in the existing main-enforced provider policy, and prompt plus
file content that is already known to exceed the selected input limit is
refused before IPC. Main remains the final authority because it also counts
history, mode instructions, context labels and framing.

Cloud consent is no longer attachment-only. It appears whenever the selected
cloud provider would receive either files or disclosed sensitive shelf context,
even when there is no attachment. The consent fingerprint changes when the
provider, files, conversation or exact disclosed sensitive material changes,
so a previous grant cannot silently authorize a different request. The controls
do not mutate workspace persistence. A cost control remains deliberately absent
until provider pricing is wired into Agent IPC; presenting a cap without a real
estimate would be false assurance.

### Measured and visual evidence

- Provider/bridge/composer regression: **6 files, 133 tests passed**.
- All four i18n gates pass across **8,949 English keys**.
- In the real Electron Agent surface, expanded Russian request limits rendered
  at **1264 x 821** and **900 x 640**, with values 50,000 / 1,500, correct hard
  bounds, readable explanatory copy and zero document/canvas overflow.
- Renderer production build: **4,750 modules transformed, exit 0**, with only
  the repository's existing chunk, CJS, ambiguous utility and import warnings.
- Forge compiled the main and preload development targets before the live pass.
- Full repository regression: **6,483 tests passed, 6 skipped, 1 failed**. The
  sole failure is the already-known stale root
  `test-only-module:src/shared/agentOperationLog.ts` entry in
  `tools/architecture-baseline.json`; project scope forbids editing that root
  baseline in this track.

## Parallel Aero and Blanc progress from this pass

Aero M15 now has one normalized cross-window display-mode path. Display prefs,
wallpaper fit and pillarbox/native-fill settings install one listener, apply
sibling-window changes without echo writes, normalize deletion/corruption and
update their DOM/CSS mirrors. The real Aero viewport consumes tested Classic
4:3/Native geometry at 1024x768, 1280x960, 1600x1200 and widescreen native;
living-environment image wallpapers honor Fill/Fit/Stretch/Center. A Claude-X
read-only audit found and then drove fixes for stale pillarbox images on
unmount, non-reactive reduced motion and a legacy motion-key echo write.
Broader Aero evidence is **6 files, 30 tests passed**. M15 still needs its
hands-on Classic/Native screenshot, pointer, window, companion and crop
checkpoint before M16 begins.

Blanc Pillar 6 now has a Master Search foundation. The visible top-strip button
and existing Ctrl+F / Ctrl+Shift+P command paths open one focus-managed modal
that groups Tools and Commands, uses configured shortcuts, ranks exact/prefix
matches, prevents recursive self-opening, caps results honestly and supports
arrow/Enter/Escape plus a trapped Tab cycle. Blanc/toolbox regression is **13
files, 113 tests passed**. Live at **1164 x 721** and **884 x 601**, it focused
the query, rendered `94 · showing 40`, narrowed `dictionary` to four real
results and had zero document/dialog overflow. The next Blanc slice is adding
settings, saved words/cards, dictionary, grammar, library, mined sentences,
files and App Drawer shortcuts behind the same dispatcher.

## Agent-origin conversational planner foundation is complete

The Agent composer can now request a bounded multi-step action plan through the
existing local planner. Planning receives the current allowed operations,
profile and settings plus at most the latest 16 eligible conversation context
items; privacy mode omits conversation context and selected-file planning is
disabled with an honest explanation. The resulting task is enqueued through the
existing main-owned operational queue with exact conversation and context
origin. Replay/task-id collisions, foreign origins and partial origins are
refused rather than replaced or inherited.

The Agent surface now renders only plans whose origin matches the open
conversation. It exposes normalized operations, bounded arguments, results,
errors and statuses, and it can pause, resume or cancel the matching queued
task. Legacy, foreign and dangling-origin tasks remain available to their
existing owners but cannot masquerade as work created by this conversation.
Backend errors are normalized so local model/store paths are not disclosed.
This reuses the current queue, authorization profile, confirmation gate and
store; no second queue or renderer-owned operational document was introduced.

### Measured evidence

- Planner and Agent shell: **54 tests passed**.
- Planner, queue and authorization regression: **194 tests passed**.
- Agent-focused regression before the runner continuation: **49 files, 720
  tests passed**.
- All four i18n gates passed across **8,991 English keys** at this checkpoint.
- Final renderer production build: **4,756 modules transformed, exit 0**,
  with only the repository's existing chunk, CJS, ambiguous-utility and
  dynamic/static import warnings.
- Full repository regression at this checkpoint: **6,512 tests passed, 6
  skipped, 1 failed**. The only failure remains the stale root
  `test-only-module:src/shared/agentOperationLog.ts` architecture-baseline
  entry; this track is explicitly limited to `src/` and cannot alter that root
  baseline.
- Focused ESLint has **0 errors** and three existing Blanc warnings; `git diff
  --check -- src` is clean.

## Agent-origin execution and durable queue receipts are complete

Conversation plans now expose **Run next**, explicit sensitive-step
confirmation and failed-step retry. Every action re-resolves the exact
conversation-origin row from live operational state, routes through the single
existing `runAgentTaskStep` boundary and revalidates current permission plus the
active profile's operation allow-list. Run next never supplies confirmation;
the explicit confirmation action resolves the existing gate and grants only the
current step's one-use call id. A sensitive retry returns to
`waiting-confirmation` and must be approved again.

After an asynchronous handler, write-back requires the exact normalized origin
and a byte-stable original task snapshot. A legitimate status-only pause or
cancel made while the handler ran is preserved; same-id replacement, origin
drift and task/step drift are refused. Renderer-local in-progress state prevents
repeat clicks in the same surface.

Operational saves now provide additive generation-bound durability receipts.
The existing synchronous setters and IPC contract remain compatible, while the
planner waits for the exact save attempt covering its enqueue, control or run
outcome. Receipt failure quarantines the exact row by origin and row snapshot;
all execute, confirm, retry, pause and cancel controls are replaced with a
save-only recovery action. Recovery re-reads the row, refuses any origin, task,
status, priority or creation drift and retries only persistence—never the tool.
If a tool returned but its outcome could not be committed, the UI states that
the operation may have completed and suppresses blind retry.

### Final measured evidence for this continuation

- Focused planner/runner coverage: **15 tests passed**.
- Durable operational-client coverage: **23 tests passed**.
- Agent-focused regression: **49 files, 731 tests passed**.
- All four i18n gates pass across **9,007 English keys**.
- Renderer production build: **4,756 modules transformed, exit 0**, with only
  the repository's existing build warnings.
- Fresh full repository regression: **6,523 tests passed, 6 skipped, 1
  failed**. The only failure remains the out-of-scope stale root
  `test-only-module:src/shared/agentOperationLog.ts` architecture-baseline
  entry.
- Focused ESLint and `git diff --check` pass.

## Exact remaining Track 3 architecture gaps

Cross-window duplicate execution still requires a main-owned atomic task lease
or compare-and-swap revision. The exact post-run checks prevent stale overwrite,
but renderer locks cannot undo duplicate side effects if two windows start the
same queued step simultaneously. That must be solved at the main-owned queue
boundary before automatic/background execution is honest.

Conversation-plan execution events, confirmation attempts, retries and
quarantine recovery are not yet appended to the durable Agent operation
log/timeline. Tool adapters do not consistently return authoritative entity ids,
so generic undo records must not be fabricated from arbitrary results. The next
logging slice should add explicit per-operation metadata only where authoritative
ids are available, then append after a real tool completion even if persisting
the queue outcome fails. Provider cost UI remains deferred until the request
path supplies real pricing estimates.

## Later parallel Aero and Blanc checkpoint

Aero M16 now has a persisted, strict-version safe-mode switch applied before
first paint. It suppresses Aero-only motion, particles, weather, lighting,
companions, video/blur effects, ambient audio and system sounds without touching
study data, and it is reversible from the Settings Motion page. A read-only
health checker scans exactly seven known Secret OS/presentation JSON stores,
reports malformed, wrong-shape or unavailable storage, ignores study stores and
never writes, removes or repairs data. Recovery-focused evidence is **2 files,
12 tests passed**; broader M16 evidence is **8 files, 42 tests passed**. Actual
selective repair/restore remains open because destructive semantics require a
separate product decision. M15's automated geometry, synchronization and
wallpaper-fit work is complete, but its Classic/Native pointer, companion,
window and crop screenshot checkpoint is still manual and therefore open.

Blanc Master Search now draws from live App Drawer shortcuts, all 11 Settings
sections and saved words in addition to its original tools and commands. Results
route through the real launch/section/dictionary paths, settings targets scroll
and focus, and saved-word matches use expression, reading and meaning. Focused
source/search evidence is **11 tests passed**; broader Blanc/toolbox evidence is
**15 files, 141 tests passed**. Remaining sources are deck cards, live
dictionary entries, grammar, library/novels, mined sentences and filesystem
results, plus per-source toggles and final landing/scope UX.

## Track 3 hardening and product-surface checkpoint — 2026-08-10

The earlier renderer-local duplicate-execution gap is closed. Execution now
starts with a main-owned atomic lease that persists the exact task, step, call,
action, previous status and expiry before a handler can run. Commit uses an
exact compare-and-swap and preserves a concurrent Pause or Cancel. A crash or
failed outcome commit leaves the durable execution marker quarantined; the UI
offers **Verified not run — unlock** only after expiry. Whole-document saves
rebase around active markers, so a stale renderer cannot silently make claimed
work runnable again.

Conversation-plan executor events now project into the visible timeline and an
exact-id operation record wherever a handler returns authoritative entity ids.
The projection is also recorded when queue-outcome persistence fails, because
the side effect may already have occurred. This operation log and the timeline
remain deliberately **session-only and window-local**; they are not described
as durable evidence.

The central Agent surface gained:

- a clean Simple default and a Full disclosure mode;
- main-owned reusable prompts with bounded create/edit/delete and composer
  handoff;
- a live directory for all **54** declared operations, including effective
  profile/permission/adapter availability and confirmation requirements;
- attached-context suggestion chips that only prefill the composer, plus a
  main-owned global switch and six per-surface switches;
- generic execution-status wording rather than navigation-specific timeline
  copy.

Blanc Master Search now also indexes every local deck card, successful
persisted dictionary lookups, the deterministic grammar corpus and the current
reader library, routing results through their real destinations.

### Measured evidence

- Agent-focused regression: **59 files, 776 tests passed**.
- Final focused visual-surface regression: **4 files, 59 tests passed**.
- Suggestion/operational integration checkpoint: **8 files, 95 tests passed**.
- All i18n gates pass across **9,177 English keys**; missing-key,
  locale-argument and hardcoded-component checks are clean.
- Focused Agent ESLint is clean.
- Final renderer production build: **4,770 modules transformed, exit 0**,
  with only the repository's existing bundle/CJS/import warnings.

### Live Electron evidence

The real Electron window was inspected in the Russian locale with the current
profile and IPC bridge. Simple mode showed conversation, context and one inert
suggestion while hiding provider controls, queue, timeline, prompts and
capabilities. Full mode exposed the provider/request limits, persistent prompt
editor, and the capability directory. Clicking the suggestion populated the
composer without sending or creating a plan, and the draft was cleared after
verification. The live console contained no runtime error; only Electron's
expected development Content-Security-Policy warning was present.

This pass caught and fixed one real CSS defect: `.agent-full-inspector` and
`.agent-composer-options` author `display` declarations overrode the HTML
`hidden` attribute. Targeted `[hidden]` selectors now keep Simple mode visually
simple. Hot-reload verification confirmed both the advanced inspector and
provider row disappear while context suggestions remain available.

### Honest remaining Track 3 gaps (superseded in part — see below)

Track 3 is not product-complete. Fresh natural-language feature queries do not
yet resolve through a deterministic help/settings/command index. Production
handoffs remain incomplete for ReadingLens, Flashcards and Settings, and there
is no screenshot/OCR context attachment. Seventeen declared tool adapters are
still honestly unavailable, including the key dictionary analysis and media
subtitle paths plus anime/visual-novel operations. AI Card Studio remains a
separate generation experience. Planned-operation Undo coverage and Full-mode
memory/profile/permission/automation/cost controls are incomplete. A compact
viewport plus full keyboard/reduced-motion matrix also remains required.

## Deterministic fresh-query navigation — 2026-08-10

The first gap above is closed. Navigation previously had exactly one provenance
authority: `resolveAgentNavigation` re-derived its destination from a live
`route` context item, so a suggestion existed only where a hand-off had already
attached the place. A cold "where do I change the interface language?" produced
no card at all, because the producer returned early when the context shelf was
empty.

There is now a second authority with the same refusal shape. `src/shared/
agentNavigationIndex.ts` holds a static table of 124 destinations — 22 app
sections, 24 Settings pages and 78 registered guided controls — and
`resolveAgentNavigationQuery` matches a question against it by exact token, with
no fuzzy or substring matching. A navigation card produced from a fresh question
stores that question on its effect and carries no context ids;
`resolveAgentNavigation` re-runs the lookup at review and at approval and refuses
with `stale-provenance` unless the index still answers with the identical
section, page, control and highlight. The allowlist and
`isAgentNavigationDestination` still have the last word, and a card carrying a
query can never fall back to the context shelf, so the two authorities cannot be
combined.

Design decisions worth not re-litigating:

- **Ambiguity refuses.** Two destinations tied on evidence inside one precedence
  band return `null` rather than a guess. Bands are declared, not emergent:
  section beats control beats page, which is what makes "dictionary" open the
  app and "popup dictionary" open the setting.
- **Terms are English**, exactly as `SETTINGS_REGISTRY.keywords` already are, and
  are copied from that registry rather than invented. A JA/ZH/RU user finds a
  setting by typing its English feature name in Settings search today and gets
  the same reach here. A question asked *in* Russian resolves nothing — that is
  the honest remaining limitation of this slice.
- **The index lives in `src/shared`** because main resolves navigation and the
  architecture audit forbids `shared` from importing `renderer`. The drift gate
  is `renderer/__tests__/agentNavigationIndexMirror.test.ts`, which asserts every
  coordinate against the live `SETTINGS_REGISTRY`/`SETTINGS_NAV` and rejects any
  term that is not already a word of that destination.
- **Retention gained one narrow exception.** A card with empty
  `sourceContextIds` was always dropped before persistence, which would have made
  index cards session-only. `isAgentQueryProvenancedCard` keeps a card whose
  every action is a query navigation: its text is the user's own prompt, already
  persisted verbatim above it, and its destination is re-derived from a static
  table. A card mixing a query action with any other kind fails that check and is
  still dropped.
- **The stored question is the truncated one.** The producer resolves from the
  120-character title it will persist, not from the raw prompt, so a long
  question cannot resolve here and then refuse itself at approval time. A
  question whose destination words fall past that cut simply produces no card.

### Measured evidence

- New `agentNavigationIndex` suite: **20 tests**; mirror gate: **4 tests**.
- Agent regression across the whole track: **61 files, 816 tests passed**
  (was 59/776).
- Architecture audit: **0 fresh findings** (`--json` `fresh: 0`); the single
  stale `test-only-module:src/shared/agentOperationLog.ts` baseline entry is the
  same pre-existing one recorded above.
- `tsc --noEmit`: **392 errors, none in any file this slice created or at any
  line it added**. The 7 errors in `agentExecutionIpc.test.ts` are the
  pre-existing `preview`-omission fixtures, unchanged in message and shifted only
  by the one line inserted above them.
- All four i18n gates clean across **9,177 English keys**. This slice adds no UI
  string: the card's title is the user's own question.
- Focused ESLint: **0 errors, 0 warnings**.
- Renderer production build: **4,771 modules transformed, exit 0** (was 4,770 —
  the one new module).

### Live Electron evidence

Driven through the debug bridge against a freshly started dev app (main rebuilt
from this source), in the Russian locale on the real profile:

- A probe conversation carrying three cards was saved through the real
  main-owned store. The two query-provenanced cards survived persistence and the
  one with a navigation effect but **no** query was dropped — the retention rule
  running in main, not in a test double.
- `agentNavigation:run` with `approved: false` resolved the good card to
  `{settings, appearance, ui-language, highlight: true}` and opened nothing.
- The same card with `page` tampered to `memory` was refused
  `stale-provenance`.
- With `approved: true`, the Settings window opened, landed on Appearance,
  scrolled to the Language card and focused the UI-language segmented control.
  Screenshot: `debug/shots/win2-1786339196291.png`.
- The probe conversation was deleted after every run and the remaining
  conversations compared byte-for-byte against the snapshot taken first —
  `restored: true` on all three runs. No user data was changed.
- `/logs?level=error` returned **0 entries** across the whole pass.

### Coverage the index deliberately does not have

`AGENT_SETTINGS_GUIDED_TARGETS` declares **107** page/control pairs. Only **78**
are indexed, because the other 29 have no `SETTINGS_REGISTRY` entry to mirror:
28 are absent from that registry entirely — `app-border`, `pillarbox`,
`environment-preset`, `weather`, `ambient-audio`, `companions-leave-secret`,
`trinkets`, `os-hotkey`, `global-lookup`, the four `mini-*`, `level`, four of the
`special/*`, all four `monitors-*`, all four `filedrop-*`, `borderless` and
`agent-memory` — and `appearance/blanc-mode` is registered on the `special` page
instead, so the index routes it there.

That is a finding about **Settings' own search**, not only about the Agent: those
28 controls are highlightable deep-link targets that the settings search box
cannot find either. Adding them to `SETTINGS_REGISTRY` extends both surfaces at
once and is the cheapest way to widen this index; doing it here instead would
have meant inventing terms the mirror gate is specifically built to reject.

### One pre-existing defect this pass surfaced

Approving a navigation when the Settings window is **not already open** returns
`open-failed` even though the window opens and lands on the correct page. The
warm path succeeds every time. The cause is in `deliverAgentSettingsDestination`
(`src/main.ts:1438`), whose acknowledgement requires
`agentSettingsRenderedTarget` to find the control *already highlighted* — which a
just-created window has not done yet, so Settings answers `rejected` and the
retry loop treats that as final. Nothing in this slice touches that path; the
destination it delivers is correct in both cases. Fixing it means letting a
first `rejected` from a window that has not yet mounted the target page retry,
which is a change to the delivery handshake's finality rule and wants its own
slice.

## The 29 guided controls Settings' own search could not find either — 2026-08-10

The section above closed on a finding rather than a gap. `AGENT_SETTINGS_GUIDED_TARGETS`
declares **107** page/control pairs and the index carried **78**; the 29 it left
out were not omitted because the index was narrow. They had **no
`SETTINGS_REGISTRY` entry at all**, so typing one of those cards' own names into
Settings' search box returned nothing — for every user, whether or not they have
ever opened the Agent. The Agent index is only what surfaced that. This slice
fixes the Settings defect first, and the index follows from it.

`settingsRegistry.ts` gains **26 entries** and `agentNavigationIndex.ts` gains the
same 26 coordinates, taking the index from 124 destinations to **150** — 22
sections, 24 Settings pages, **104 of the 107 guided controls**.

### Why 26 and not 29

The other three pairs are not three cards. Each is a card already indexed under a
different coordinate, and indexing the second one would have made every term the
two share ambiguous — and ambiguity refuses. Adding them would have *removed*
answers:

| Declared pair | Answered by | Because |
| --- | --- | --- |
| `display/borderless` | `display/window-chrome` | no card of its own; `DisplayPage` highlights Window chrome for either id |
| `appearance/blanc-mode` | `special/blanc-mode` | Blanc Mode renders on both pages, and the registry registers it on Special |
| `special/secret-os-leave` | `companions/companions-leave-secret` | "Leave secret OS" renders on both; the Companions copy is indexed because the Special page is Advanced-only |

That list is not a comment. `agentNavigationIndexMirror.test.ts` now walks all 107
declared pairs and fails on any that is neither indexed nor in it, **and** requires
each listed pair to name an indexed stand-in — so the allowlist cannot become a
place to park controls nobody got round to. A fourth test reads `DisplayPage.tsx`
as source and asserts the `focusSettingId === 'window-chrome' || focusSettingId
=== 'borderless'` branch still exists, because that is the one alias claim the
registry cannot corroborate.

### The constraint that chose every term

The index scores by exact token and refuses a tie inside a precedence band. With
78 entries already in place, almost every obvious word for a new control was
**already some older entry's word** — and a second claimant does not lose the
word, it ties for it and takes the answer away from both. So the design work was
mostly subtraction: `rain` and `snow` stayed with Particles rather than moving to
Weather, `preset` stayed with the desktop icon preset, `routine` with the buddy
programmer, `jlpt` with the study profile, `craft window` with the Mini wallpaper,
`multi monitor` with the OS pets card, `ambient` with Lighting, `audio` with the
mining profile rules, and bare `aero` with the Special page. Each new control is
reached by the phrase only it uses. Eight of those words are now asserted to
resolve exactly where they did before, and `snow` and `hotkey` are asserted to
stay *refused* — a word that was already ambiguous must not look fixed.

Two behaviours did change on purpose, both by the declared precedence ladder
rather than by accident: `environment` now names the Environment card instead of
merely being a keyword of the Living layer (it is the only entry that is *named*
it, so the position-0 bonus decides it), and `mini view` now highlights the Mini
View switch rather than stopping at the page that holds it.

### Twelve catalog keys, and the four headings that are still literal

Twenty-two of the 26 entries reuse their card's own `titleKey`. Six could not:
`mini-apps` and `mini-routines` have parameterised headings (`Pinned apps
({count}/{max})`), which would render the placeholders verbatim in a search row,
and `agent-memory`, `special-locked`, `wired-arcade` and `aero-arcade` still carry
literal English titles in their page components. Those six get `search.*` keys in
all four catalogs, following the convention the registry already uses for
`search.theme` and its neighbours.

That leaves those four **card headings** untranslated — a pre-existing i18n defect
this slice did not create and did not fix. Their search rows are now translated
while their cards are not; converting the cards belongs to the i18n track, and
`tools/i18n-hardcoded-check.cjs` reports no new violation either way.

### Measured evidence

- Agent regression: **61 files, 854 tests passed** (was 61/816). The index suite
  goes 20 → 55 tests, the mirror gate 4 → 7.
- `node tools/i18n-check.cjs`: **clean at 9,189 English keys** (was 9,177 — the 12
  added here), all translated in ja/zh/ru.
- `node tools/i18n-hardcoded-check.cjs`: no new component renders UI text without
  i18n; 6 files baselined, unchanged.
- `node tools/architecture-audit.cjs --json`: **`fresh: []`**. Exit 1 comes from
  the same pre-existing stale `test-only-module:src/shared/agentOperationLog.ts`
  baseline entry recorded above.
- `tsc --noEmit`: **392 errors, the same total as before this slice, and none in
  any of the eight files it touches.**
- Focused ESLint over all eight paths: **exit 0**.
- Settings/i18n/monitors suites: 18 files, 226 tests passed.

### Live Electron evidence

Driven through the debug bridge against a freshly started dev app (main rebuilt
from this source) on the real profile, whose UI language is Russian:

- A probe conversation carrying two index cards — one resolving
  `monitors/monitors-list`, one with `page` tampered to `memory` — was saved
  through the real main-owned store. Both survived persistence, which is the
  query-provenance retention rule running in main.
- `agentNavigation:run` with `approved: false` resolved the good card to
  `{settings, monitors, monitors-list, highlight: true}` — a control that had no
  registry entry to mirror an hour earlier — and refused the tampered one
  `stale-provenance`.
- With `approved: true` and Settings **not** already open: `open-failed`, while
  the window opened on the Monitors page with exactly its four cards rendered.
  That is the pre-existing cold-open defect from the section above, reproduced
  unchanged and still untouched by this slice.
- With Settings already open: `{ok: true, opened: true}`, and a sampler installed
  in the Settings window recorded `monitors-list` carrying `is-highlight`.
- Settings search with Advanced Mode **off**: `trinkets` → «Вещицы», `undo
  history` → «История отмен», `simulated displays` → «Виртуальные мониторы»,
  `agent memory` → «Локальная память агента», `pinned apps` → «Закреплённые
  приложения», `level` → «Уровень». English keywords against a Russian UI, which
  is the property the index inherits from this registry.
- `weather` returned nothing there — and so did `lighting` and `wired archive`,
  which have been registered for months. The blank is the pre-existing
  page-level Advanced gate, not a bad entry.
- With Advanced Mode on, each of the gated additions ranks first: `weather` →
  «Погода», `ambient audio` → «Фоновый звук», `environment preset` →
  «Окружение», `wired games` → «Игры WIRED», `aero games` → «Игры Aero», `app
  borders` → «Рамки приложения», `pillarbox` → «Стиль полей».
- Clicking the new «Вещицы» row navigated to Companions and highlighted the
  `trinkets` card. Screenshot: `debug/shots/win2-1786341154131.png`.
- Restores, all asserted rather than eyeballed: `jp-settings-advanced-v1` and
  `jp-os-settings-recent-v1` both put back byte-for-byte; the probe conversation
  deleted and the remaining three hashed identical to the pre-run snapshot
  (`7318042f:4972`). `/logs?level=error` returned **0 entries** across the whole
  pass, and localStorage carries zero `agentWorkspace` / `agent.context.*` keys —
  the only agent-shaped key is the deliberately renderer-owned
  `jp-study-local-agent-settings-v1`.

### Still open after this

- **Cold-open still answers `open-failed`.** Unchanged, and it is now the oldest
  thing on this track's list.
- **A question asked in Russian, Japanese or Chinese still resolves nothing.**
  The live pass above is the sharpest statement of that limit: this app's UI is
  Russian, its search box answers English feature names, and so does the index.
- Three guided pairs stay unindexed by design, and the four literal card
  headings stay literal. Both are recorded above rather than left to be
  rediscovered.

### What the commit does on its own, measured rather than assumed

`settingsRegistry.ts` and the four catalogs were staged as HEAD-plus-these-edits
blobs, so `e5ae8a8` carries none of the other tracks' uncommitted work. Checked
out detached, with `node_modules` junctioned in:

- `agentNavigationIndex.test.ts` — **55 of 55 pass**. Nothing in the index itself
  depends on another track.
- `agentNavigationIndexMirror.test.ts` — will not even load, because
  `catalogs/en.ts` at HEAD imports `../gameArena/en`, `../mooncapLore/en` and
  `../miningUi/en`, and those module directories **exist only as untracked files**
  in the working tree. Copying those three in is enough to run it, and then **5 of
  7 pass**.
- The two that fail are `points every page at a real sidebar page` (`monitors is
  not in SETTINGS_NAV`) and `matches only on words the destination already uses`
  (`settings/scraper/-: "providers"`). Both come from the other track's unstaged
  `settingsRegistry.ts` nav pages and its `settings.nav.scraper.desc` rewrite.

**Every one of those three conditions is byte-identical at `69d9165`** — the same
load error, and the same two assertions failing there with 22 of 24 passing. So
this slice adds 38 tests, all of which pass on the commit alone, and changes
neither pre-existing failure. That is the measurement, not an assumption: both
commits were checked out and run side by side.

The practical consequence for the next session: **the mirror gate can only be run
against the working tree** until the i18n track commits its per-language module
split and whoever owns Monitors / File drops / API keys / Help commits their
`SETTINGS_NAV` entries. Running it in a clean checkout and reading the result as a
defect in this track would be wrong twice over.

## Cold open acknowledges, and the delivery handshake finally enters history — 2026-08-10

Two things were wrong here, and the smaller one is the one the previous sections
predicted.

### The handshake had never been committed

The three sections above describe the Settings delivery handshake as existing
infrastructure and its cold-open failure as pre-existing. Both readings are true
of the *working tree*. Neither was true of *history*: `69d9165` touched no
`main.ts`, no `SettingsApp.tsx` and no `agentNavigationBridge.ts` at all, and the
last agent commit to reach `main.ts` is `3fc91ca`, which installed a
**section-only** opener — `setAgentNavigationOpener((section) => createPopoutWindow(section))`
— that is still what HEAD contains. The whole page/control/highlight delivery
lived only in the working tree, together with two untracked files
(`agentSettingsNavigation.ts` and its test).

That is coherent rather than careless: the feature was held out of history
because it did not work cold. Fixing cold open is what made it committable, so
this commit carries both.

### The cause was not a timing margin

The prediction on record was that 16 animation frames were too few for a
just-mounted window, so the fix would be to let a first `rejected` retry.
Measured against the running app, that is not what happens.

`agentSettingsRenderedTarget` is polled through `requestAnimationFrame`, and
**Chromium runs no `requestAnimationFrame` callbacks at all for a document whose
`visibilityState` is `hidden`.** A pop-out that main has just opened is routinely
occluded at the instant main delivers to it. Measured in the cold-opened Settings
window:

| Window state | rAF callbacks in 600 ms |
| --- | --- |
| occluded, `visibilityState: hidden` | **0** |
| after `/focus`, `visible` | **30** |

So the acknowledgement never ran, the renderer never answered at all, and main's
750 ms silence timer turned that into `rejected` — which the loop treated as
final. Every one of the three conditions the renderer checks was **already
satisfied** while it was failing: the pane read `data-settings-page="appearance"`,
exactly one `[data-setting-id="theme"]` existed, and it carried
`class="os-set-card is-highlight"`.

The decisive measurement is that **retrying alone would not have fixed it**. A
replica of main's dispatch loop, run against a cold window and deliberately *not*
stopping on refusal, produced `unhandled` at 12 ms, 336 ms and 1962 ms and then
`rejected` at 3337, 5344, 7345, 9340 and 11340 ms — still refusing at 11.3 s,
never once accepting. The ~2 s spacing is itself the signature of the same cause:
an occluded window throttles its own timers to roughly one tick per second.

### The fix, in two halves

**Schedule on a clock that runs.** `createAgentSettingsAckScheduler` picks rAF
when the document is visible and a timer when it is hidden, choosing per attempt
so a window that becomes visible mid-poll gets frames again. The renderer's
patience is now wall-clock (`AGENT_SETTINGS_ACK_BUDGET_MS`) rather than a frame
count, because the frame is exactly what a hidden window does not get.

**Type the refusal, so finality means something.** `reject()` became
`reject(refusal?)` over `'invalid' | 'not-ready'`, and main's outcomes became
`accepted | invalid | not-ready | unhandled`. `agentSettingsDeliveryDecision` is
the whole finality rule as one pure function: `invalid` fails at any elapsed time,
everything else retries until `AGENT_SETTINGS_DELIVERY_BUDGET_MS` and then fails
honestly. The security property is unchanged and now asserted directly — a
destination Settings judged unusable never becomes a success because main asked
again.

Both halves are required. The first alone still dies on main's per-attempt
timeout; the second alone is the 11.3 s measurement above.

One incidental correctness gain: the script's "did anyone claim this?" check moved
from `setTimeout(…, 0)` to an inline test straight after `dispatchEvent`, which is
synchronous. Every attempt made while Settings is still mounting used to cost a
throttled ~1 s tick.

### Measured evidence

- Agent regression: **61 files, 862 tests passed** (was 61/854).
- `tsc --noEmit`: **392 errors, identical to the pre-slice total.** The one error
  in a file this slice touches is `SettingsApp.tsx:332` `meta?.label`, another
  track's `SettingsNavPage` rename that never updated this call site; it is far
  from any edit here and predates them.
- `node tools/i18n-check.cjs`: clean at **9,189** keys — this slice adds no UI text.
- `node tools/architecture-audit.cjs --json`: **`fresh: []`**.
- Focused ESLint over all six paths: **exit 0** (12 pre-existing `main.ts`
  non-null-assertion warnings, none in the edited region).

### Live Electron evidence

Driven through the debug bridge against a dev app restarted on this source, on the
real profile, with a probe conversation carrying an index-provenanced card
(`query: "where is the theme setting"` → `settings/appearance/theme`) saved
through the real main-owned store:

| Path | Before | After |
| --- | --- | --- |
| cold open (Settings closed) | `open-failed` after **5208 ms** | **`{ok:true, opened:true}` after 4580 ms** |
| warm open (Settings already open) | `{ok:true}` in 83 ms | `{ok:true}` in **90 ms** |

- The cold-opened window read **`visibilityState: hidden` at the moment it
  acknowledged** — the exact state that produced 0 rAF callbacks and made
  acknowledgement impossible before. Since acknowledgement *requires*
  `agentSettingsRenderedTarget` to resolve, `ok:true` is itself proof the
  highlighted control was found; a sampler installed in the window separately
  caught the highlight at 279 ms.
- Both refusals still refuse. A card with `page` tampered to `memory` while its
  query still resolved to `appearance` returned **`stale-provenance`**, refused at
  the IPC layer before any window work. Dispatching a delivery for a page that is
  not registered made the renderer call **`reject('invalid')`** — the final
  refusal, not the retryable one.
- `/logs?level=error` returned **0 entries** across the whole pass, and no
  `hot updated` entries, so no other agent edited the tree under measurement.
- The probe conversation was deleted and the workspace asserted back to its exact
  three conversation ids, titles and `activeConversationId`.
  `jp-settings-advanced-v1` was never touched (`"0"`), and the only agent-shaped
  localStorage key remains the deliberately renderer-owned
  `jp-study-local-agent-settings-v1`.

**One restore this pass cannot claim.** `jp-os-settings-recent-v1` now carries
`appearance` at the head of its `pages` list, because navigating there is what the
feature does. That key was **not** snapshotted before the run, so unlike the
previous pass this one cannot assert it byte-for-byte — only that the change is
exactly one page moved to the front of a recents list, with the seven entries
behind it untouched. Snapshot it first next time; `pushRecentPage` is reached by
every successful delivery.

### Still open after this

- **A question asked in Russian, Japanese or Chinese still resolves nothing.** Now
  the oldest thing on this track's list.
- The three guided pairs stay unindexed by design and the four literal card
  headings stay literal, both unchanged and recorded above.

## "где тема" resolves — 2026-08-10

### The blocker was the tokenizer, not the vocabulary

The standing description of this gap was that index terms and
`SETTINGS_REGISTRY.keywords` are English by design, so a translated question has
nothing to match. That is true and it is not the reason. `tokenize` is

```js
.replace(/[^a-z0-9]+/g, ' ')
```

so a Cyrillic or Japanese query reduced to **no tokens at all** and returned
`null` before scoring anything. Adding translated terms alone would have changed
nothing whatsoever. This is pinned as a test rather than described, so the fix
cannot quietly regress into it.

### The mechanism, and why this one

Each of the 150 entries now carries `titleKey`, and a caller may pass the
translated catalogs; a non-English query is matched against the title the UI
already renders. The alternative considered was hand-written per-language term
lists — roughly 450 of them — which buys better recall and pays for it in
authorship and in drift: nothing would tie those lists to the translations the
app actually shows. A title cannot drift from itself.

Two rules keep it from disturbing what already worked:

- **English is never scored through the translated lane.** `en` is skipped even
  when handed in. Sixteen English queries — including `rain`, `snow`, `preset`,
  `routine`, `aero` and `hotkey`, the words earlier slices deliberately left
  ambiguous — are asserted to return *exactly* what they return with no catalogs
  supplied.
- **Substring matching is confined to Japanese and Chinese**, which have no word
  boundaries to tokenize on: 「テーマはどこ」 contains 「テーマ」 and no splitting
  rule available in `shared` would find that. Cyrillic and Latin titles still
  match whole tokens, so the "ai" ⊄ "said" property survives everywhere it can. A
  two-character floor stops a one-character CJK title becoming a wildcard, and
  that is asserted too.

`terms` stays a second, English-only lane rather than being replaced: it is
hand-tuned, it is what the 55 existing index assertions pin, and the translated
titles are one string per destination where the English terms are several.

### Three constraints that shaped it

- **`shared` cannot import `renderer`**, so the keys are copied rather than
  looked up — and the mirror gate now holds every one of the 150 to the
  `SETTINGS_REGISTRY` entry, `SETTINGS_NAV` page or section-label map it came
  from, and separately asserts each resolves to a string in the `en` catalog. A
  key that names nothing would leave a destination unreachable in ja/zh/ru while
  looking perfectly indexed.
- **`agentNavigation.ts` already imports this index** (`:39`), so the index cannot
  import `AGENT_NAVIGATION_SECTION_LABEL_KEYS` back without a cycle. The 22
  section entries therefore carry their own copy, gate-checked against that map.
- **`catalogFor()` falls back to English when a language is not loaded**, and
  `ensureCatalog()` resolves to the English catalog on failure. Either would put
  English text under a `ja` key and score English questions through the
  translated lane. `agentNavigationIpc` drops any language whose catalog is
  identical to `en`, and a test asserts an English catalog handed in among the
  translations changes nothing.

The catalogs are loaded once in `agentNavigationIpc` and **awaited by every
call**, not read opportunistically: the resolver re-derives an index card's
destination at review and again at approval and demands the two agree in every
coordinate, so a catalog set that grew between them would make an honest approval
look like tampering.

### What the precedence ladder does to a translated question

«где обои» resolves to the Wallpaper **control**, not the Wallpaper page — the
page and the control share a title, and a control outranks the page holding it.
That is the declared ladder behaving as designed, and it is what `wallpaper` has
always done in English. The test asserts the equivalence directly: a translated
question lands where its English twin lands.

### Measured evidence

- Agent + i18n regression: **67 files, 932 tests passed** (was 61/862 for agent
  alone; this slice adds 14 index assertions and 2 mirror assertions).
- `tsc --noEmit`: **392, unchanged**, none in any file this slice touches.
- `node tools/i18n-check.cjs`: clean at **9,189** — this slice adds no keys, it
  only starts reading the ones already there.
- `node tools/architecture-audit.cjs --json`: **`fresh: []`**.
- Focused ESLint over all five paths: **exit 0**.

### Live Electron evidence

Driven through the debug bridge against a dev app restarted on this source, real
profile, UI language Russian (`document.documentElement.lang === "ru"`), with the
probe cards saved through the real main-owned store:

- «где тема» resolved in **main** to `{settings, appearance, theme, highlight}` —
  which also proves main can dynamic-`import()` the `ru` catalog inside its own
  bundle, the part of this design most likely to fail in Electron rather than in
  vitest.
- 「辞書はどこですか」 and 「词典在哪里」 both resolved to `{section: dictionary}`.
- Approving the Russian card with Settings **closed** returned
  `{ok:true, opened:true}` in **2800 ms** and landed on Appearance — so the
  cold-open fix above holds for a question that was not asked in English either.
- Restores asserted, including the one the previous pass could not:
  `jp-os-settings-recent-v1` came back **byte-for-byte identical**,
  `jp-settings-advanced-v1` untouched, the workspace back to its exact three
  conversation ids and active id, and `/logs?level=error` **0 entries**.

### Limits, stated rather than discovered later

- **One title per destination.** English reaches Particles through eight phrases;
  Russian reaches it through «Частицы» and nothing else.
- **No morphology.** Russian matches whole tokens, so «где словарь» resolves and
  «в словаре» does not. Adding stemming would weaken the exact-token property
  every English answer depends on, so it was not done here.
- The four card headings that are still literal English (`agent-memory`,
  `special-locked`, `wired-arcade`, `aero-arcade`) resolve through their
  translated `search.*` rows, which is why they work at all.

## The context producers, and the field that was being thrown away — 2026-08-10

### What the audit found

Five producers existed (`route`, `dictionary-entry`, `selected-text`,
`reading-passage`, `media-cue`), wired into exactly three surfaces:
`DictionaryPopup`, `NovelReader` and `MediaStudyMode`. ReadingLens, Flashcards
and Settings had no hand-off at all. And two declared `AgentContextKind` members
— `study-session` and `saved-words` — had **no producer**: legal kinds nothing
could create.

### `createAgentContextItem` was dropping the coordinate

The finding worth the slice. `AgentContextSource` declares `controlId` and
`highlight`; `normalizeAgentWorkspaceState` preserves both
(`agentWorkspace.ts:335-336`); and `resolveAgentNavigation` authorizes a guided
page/control destination by requiring a live `route` item to agree with the
stored effect **in every one of those coordinates**. But `createAgentContextItem`
rebuilt `source` as `{app, route, entityId}` and silently discarded the other
two.

So no context item produced anywhere in the app could ever satisfy that check.
The provenance half of guided navigation — "I am on this card, ask about it" —
was unreachable machinery in exactly the way `route` context itself was before
`routeAgentContext` existed. The index half has been answerable since the static
table shipped; this was the other half, and it had never once run.

Nothing is validated at the producer on purpose: the allowlist keeps the last
word downstream, where `isAgentNavigationDestination` checks the pair against the
registered guided targets. A test asserts both directions — a real coordinate
resolves, an invented one returns `stale-provenance`.

### Three producers, and where they attach

- **`settingsRouteAgentContext(page, label, controlId?)`** — the canonical
  Settings hand-off. `identity` is the coordinate rather than the section, the
  opposite of the bare producer: "Settings" ten times is one place, but two named
  controls are two different places. `highlight` is claimed only alongside a
  control, because it is a promise the delivery handshake has to keep.
- **`studySessionAgentContext`** — `identity` is deck + session start, so one
  sitting is one entry however many cards are answered, while tomorrow's review
  is a new one. Session-only: the counts describe how someone is performing.
- **`savedWordsAgentContext`** — `identity` is the set's contents, not its size,
  so re-asking after saving one more word is genuinely new. The caller bounds the
  list, for the reason the media producer records.

**Settings reads a persisted coordinate, not the highlight.** The obvious wiring
— hand off `focusSettingId` — would have worked for 2200 ms and then silently
stopped, because the highlight effect nulls it. A `guidedControlId` is kept beside
`guidedPage` and cleared by the same `navigate()`, so the coordinate stays true
while the user is still on the page the Agent sent them to, and is dropped the
moment they leave. `askAgent` claims it only while `guidedPage === page`: after
that it is someone else's coordinate, and a route item naming a control the user
is not looking at would authorize a destination they never agreed to.

**ReadingLens hands over with no place item, deliberately.** Every other hand-off
attaches the surface it happened on so the Agent can offer to take the user back.
The lens is an overlay drawn over whatever was on screen — often another
application — and there is no window to return to. Naming a navigable section
there would produce a card that opens the wrong thing.

### Two things the live run corrected

**The button was invisible where it mattered.** It first went into the Settings
command bar, which is rendered under `{aero && (…)}` — so it was missing from the
ordinary Settings window, including every pop-out, which is the one the Agent
itself opens. Measured, not reasoned: the pop-out reported 79 buttons and zero
matching. It now sits in `os-set-top` beside the search, which always renders.

**The label is wrong, and it is not this slice's to fix.** The stored item came
back labelled `Control Center`, because `pageLabel` reads `meta?.label` — the
field another track's in-flight `SettingsNavPage` rename removed. That is the
pre-existing `SettingsApp.tsx` type error this ledger has recorded twice; it will
resolve when that track lands its `labelKey` call-site update.

### A second uncommitted enrichment, smaller than the first

`routeAgentContext` appears at four call sites in the working tree and **zero at
HEAD** — the three surfaces have had `handOffToAgent` committed all along, but the
*place* argument was never committed. So the pre-existing test "is only ever
called with a navigable section at its four call sites" was a working-tree gate:
it read 0 in a clean checkout. Those three one-line additions are committed here,
and the test is now green standalone.

### Measured evidence

- Agent + i18n + lens + settings regression: **78 files, 1133 tests passed**.
- `tsc --noEmit`: **392, unchanged.** `tsc` caught the one real mistake in this
  slice — `Icon name="sparkles"` is not an `IconName`; it is `sparkle`.
- `node tools/i18n-check.cjs`: clean at **9,192** keys (three added, translated
  in all four).
- `node tools/i18n-hardcoded-check.cjs`: no new component renders UI text without
  i18n. Note the Settings command bar's own `Home`/`Find`/`Advanced` labels are
  still literal English — pre-existing, and untouched here.
- `node tools/architecture-audit.cjs --json`: **`fresh: []`**.
- Focused ESLint over all seven paths: **exit 0**.
- **Standalone**: checked out from the index alone, this slice's tests pass
  **70/70** — including the four-call-sites test that fails at HEAD. That run
  needs the seven untracked `i18n` module directories supplied first
  (`grammarTaxonomy`, `gameArena`, `mooncapLore`, `miningUi`, `malSync`,
  `scraperUi`, `animeSchedule`); the list has grown from the three recorded at
  `ec6fe6a`.

### Live Electron evidence

Russian-UI dev app, real profile, driven through the debug bridge:

- A guided navigation to `appearance/theme` was approved, then the Settings
  pop-out's own «Спросить агента» button was clicked. What reached the real
  main-owned store:

  ```json
  { "id": "route:settings/appearance/theme",
    "source": { "app": "settings", "route": "appearance",
                "controlId": "theme", "highlight": true },
    "sensitivity": "ordinary", "retained": true }
  ```

  That item could not have existed before this slice.
- Restores asserted: the probe conversation deleted, the one context item the
  click attached to the user's real conversation removed by id, the workspace
  back to its exact three conversation ids, `jp-os-settings-recent-v1`
  **byte-for-byte identical**, `jp-settings-advanced-v1` untouched, and
  `/logs?level=error` **0 entries**.

### Flashcards, so the producers are not unreachable machinery either

`savedWordsAgentContext` shipped in the section above with no call site, which is
the same shape of defect this slice exists to fix. `FlashcardDeckOverview` now
carries the hand-off, in the `view-head` actions beside "Review dictionary",
where `saved` is already in scope.

The list is **bounded at 40** before it leaves. Someone with four thousand mined
words must not send all of them to a provider because they clicked one button —
the same rule `mediaCueAgentContext` records for a subtitle scene, where "this
line" must not become "this episode". The most recent are taken, because those
are what the user has been working on.

`studySessionAgentContext` still has no call site: it wants the live review
session, which is `FlashcardReviewMode`'s state rather than the overview's, and
is a separate gesture ("ask about how this session went") from "ask about my
saved words". It stays tested and unused, recorded here rather than quietly.

**Live, with three words seeded into an empty profile** (no `jp-saved-words-*`
key existed at all, so the restore is its absence, asserted):

```json
{ "id": "saved-words:2f578c85e5e68f09", "label": "Сохранённые слова",
  "preview": "食べる、飲む、走る",
  "source": { "app": "flashcards" },
  "sensitivity": "personal", "retained": false }
```

Two properties worth naming because they are the privacy floor working rather
than a coincidence. The identity is **opaque** — `2f578c85e5e68f09`, not the
words — because `saved-words` floors at `personal` and `createAgentContextItem`
hashes any identity above `ordinary`, so the vocabulary never becomes a
reference id copied into messages and provider disclosures. And `retained:
false`, so the list is gone at the next launch. The `route:flashcards` place item
landed beside it, labelled «Карточки» from the section's own catalog key.

Restores: both items removed by kind, the seeded key deleted and
`jp-saved-words-*` asserted back to **none**, the workspace back to its exact
three conversation ids, `jp-os-settings-recent-v1` unchanged, 0 error entries.

Gates after this: **62 files / 884 tests** on `flashcard agent`, i18n clean at
**9,195** keys, no new hardcoded UI text, `fresh: []`, `tsc` unchanged at 392
(the three `FlashcardsContent.tsx` errors are pre-existing and predate this
edit), focused ESLint exit 0.

### And the session hand-off, so nothing this track added is unreachable

`studySessionAgentContext` now has its call site, in `FlashcardReviewMode`'s
done state — "ask how this session went", offered at the moment it finished.
It needed one piece of state the review did not keep: `sessionStartedAt`,
stamped once per sitting in `startReviewSession`, because the producer keys its
identity on deck-plus-start so that answering forty cards leaves one shelf entry
while tomorrow's review leaves a new one.

**Live, driven to completion through the bridge** (two words seeded into an empty
profile, review started, flip/got-it until the done state):

```json
{ "id": "study-session:7270258504331ed9", "label": "Повторение словаря",
  "preview": "Повторено 2 из 2",
  "sensitivity": "personal", "retained": false }
```

Opaque identity again, and session-only: how someone is performing is not
reference data. The `route:flashcards` place landed beside it as «Карточки».
Both items removed afterwards, the seeded key deleted and `jp-saved-words-*`
asserted back to **none**, workspace back to its exact three conversation ids,
0 error entries.

Gates: **68 files / 943 tests**, i18n clean at **9,198**, no new hardcoded UI
text, `fresh: []`, `tsc` unchanged at 392, ESLint exit 0.

### Still open after this

- **Screenshot/OCR attachment context** is untouched. It is a different mechanism
  from context items — `AgentAttachment`, not `AgentContextItem` — and the lens
  already captures `screenshotDataUrl` in its `reading` state, so the material
  exists and only the attachment producer and its privacy floor are missing.

## The visual-novel adapters, and the update that replaces the route list — 2026-08-10

### What was unavailable, and what is now installed

`agentToolCapabilityMatrix` classified **17** declared operations as having no
adapter. Five of them were the whole `visual-novel` tool, and every service they
needed was already in the app: `visual-novel:list`, `:add`, `:updateRoutes`,
`:readClipboard` and `:captureText` are the same IPC the Immersion panel drives.
The unavailable surface is now **12** — three media, six anime, two dictionary
(`dedicated-analysis-required`) and one flashcard (`false-success-stub-removed`),
none of which this slice touched.

The five adapters live in `renderer/visualNovelAgentHandlers.ts` and are spread
into `createCentralAgentToolRegistry` beside `createStudyAgentHandlers()`. All
five were already in `DEFAULT_AGENT_PROFILES`' `enabledOperations`, so installing
the adapter is the only thing that stood between them and running — the
capability directory now reports them `available` rather than
`adapter-not-implemented`.

### `visual-novel:updateRoutes` REPLACES the route list

The finding worth the slice. The channel takes `(id, routes)` and writes that
array as the entry's complete route list. An adapter that forwarded the one route
the model asked about would therefore **delete every other route** — and the
damage does not stop at the routes: `applyVisualNovelRoutes` clears the entry's
`currentRouteId` outright when the surviving set no longer contains it
(`shared/visualNovel.ts:694`), while the captures keep a `routeId` that now
resolves to nothing. A "mark Yukine completed" step would have silently unpicked
the player's place in the novel and orphaned every line they had captured.

So `visual-novel.track-route` reads the entry, rebuilds the full route list as
`VisualNovelRouteInput[]`, and patches one element in place — matching on
`routeId` when given and on route name otherwise, appending when neither matches.
Fields the caller did not mention (`guideNotes`, `endings`, `character`) are
carried through from the stored route rather than defaulted away.

Positive control: sending `[patch]` instead of the merged list fails the
preservation test *and* the append test; restored byte-identical afterwards.

### `tokenizeSync` returns `[]` when kuromoji has not been built

`renderer/tokenizer.ts:121` opens with `if (!tok) return []`. A
`generate-vocabulary` adapter that called it directly would report zero words for
a novel with thousands of captured lines whenever the renderer had not already
built the tokenizer for some other reason — a false success of exactly the kind
`false-success-stub-removed` exists to keep out of this registry. The adapter
therefore awaits `getTokenizer()` first and turns a build failure into
`blanc.agent.error.tokenizerUnavailable`. A test asserts the *order* (build
before the first tokenize call), not merely that words come back.

An empty result is still distinguishable from a missing one: the adapter throws
`visualNovelNoText` when the novel (or the named route) has no captures at all,
and otherwise returns `capturesScanned` and `distinctWords` alongside the list.

### `extract-text` is the clipboard lane, and only that

The three extraction lanes are not equivalent. The hook lane needs a running
game and a user answering a process picker; the OCR lane needs Reading Lens over
a live window. The clipboard lane is the one an agent can drive on its own — it
is what `VisualNovelPanel`'s poller reads, and it is where every Japanese text
hooker writes. The adapter reuses that poller's own Japanese guard, refuses a
clipboard with no Japanese in it, and returns `{captured: false, reason:
'unchanged'}` rather than storing a duplicate when the newest capture already
holds that text. Route, chapter and scene default to the entry's current values,
the same three the panel sends.

### Titles are accepted as ids, but only when they are unambiguous

A local model passes a title where an id is asked for. `resolveEntry` falls back
to an exact case-insensitive match over `title`, `japaneseTitle`, `englishTitle`
and `alternativeTitles`, and accepts it **only when exactly one entry matches** —
two matches refuse, the same way the navigation index refuses a tie. Every result
returns the resolved id so the model can use the real one next time.

### Gates

`vitest run agent i18n lens settings flashcard visualNovel` — 88 files / 1181
tests. `i18n-check` clean at 9,202 keys (four new `blanc.agent.error.*` keys,
translated in ja/zh/ru). `i18n-hardcoded-check` clean. `architecture-audit`
`fresh: 0`. `tsc --noEmit` unchanged at 392 errors with none in the touched
files. ESLint exit 0 over the changed paths.

### Still open after this

- **Twelve operations remain unavailable.** The three media ones
  (`analyze-subtitles`, `generate-profile`, `organize-files`) have a real local
  substrate in the subtitle discovery records and would be the next adapters to
  take. The six anime ones do not: `anime.search` and `anime.check-releases` read
  as local, but the MAL list arrives over `mal:fetchList` and the schedule over
  the scraper, so "search *tracked* anime" needs a decision about what a cached
  local anime record even is before an adapter can honestly answer it.
