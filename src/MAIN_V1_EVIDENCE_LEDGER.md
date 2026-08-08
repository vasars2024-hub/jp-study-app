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
   changed mid-work and the call site did not follow. `tools/i18n-check.cjs`
   cannot catch this: it checks en↔ja/zh/ru *parity*, not that a `t()` call site
   resolves to anything. Now verified by extracting every `t('…')` key added by the
   diff and asserting each exists in `en.ts` — a check worth repeating on any slice
   that adds a key.
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

## Exact next slice

Two producers remain from the transport's list: a **media cue** (a subtitle line
hands off from the player) and a **reading passage** (a whole block rather than a
selection). Both follow `selectedTextAgentContext` exactly — no `retained`, the
surrounding context as the preview, en/ja/zh/ru keys — and both want the same
live check the reader just needed: confirm the control is reachable in the
embedding users actually use, and confirm no neighbouring persisted field
(title, label, status line) writes the material the item itself is refused.
Then the remaining Track 3 surface: modes as workflow presets, attachments,
history search and interactive result cards.

Still open and deliberately deferred: `localAgentProfilesStore` and
`localAgentSettingsStore` remain renderer-owned `localStorage`, which is correct
while they are per-window preferences with no main-side reader.
`codex/claude-agent-shell` stays reference-only.
