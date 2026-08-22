# Main Study OS v1 completion plan

Status: canonical integration brief for the main tree. Re-derive every status from source and live behavior before acting on an older completion claim.

## Scope and non-negotiables

- Work only in `C:\Users\Arseniy\Projects\jp-study-app`.
- Never take features, status, or code from `jp-study-app-noctis-beta` as the baseline.
- Mobile and Noctis/City are later stages and are excluded.
- Packaging, publishing, Forge release builds, pushing, and pull requests are excluded unless separately requested.
- Keep implementation changes inside `src/`; do not alter root configuration.
- Preserve the desktop shortcut grid, window dragging, taskbar shell, and other users' dirty work.
- Heavy datasets must use asynchronous/cooperative processing or virtualized rendering.
- Live verification must use the application MCP/debug bridge and the in-app Browser through DOM/Playwright. Never use remote control, Computer Use, or coordinate-based CUA.
- Every completion claim requires automated evidence plus live functional and visual evidence where a UI exists.

## Operating method

1. Re-audit the current main tree, recent commits, dirty paths, tests, active documentation, and actual route wiring. Classify every planned item as finished, partial, missing, broken, stale-doc-only, or blocked.
2. Protect unrelated work. Never stash, reset, clean, broadly checkout, or broadly stage. Use explicit path-scoped diffs and commits.
3. Establish baselines for tests, type errors, architecture/i18n gates, and the live application. Do not treat an existing global failure as caused by new work without a before/after comparison.
4. Implement in dependency order. Add focused tests with each slice and make coherent path-scoped checkpoint commits when they improve recoverability.
5. Maintain an evidence ledger containing the requirement, source-derived starting status, changed paths, automated evidence, live evidence, visual evidence, remaining risk, and commit.
6. Finish with a fresh v1.0 audit derived from code and live behavior, not copied from old ledgers.

## Track 1: credentials and shared AI foundations

- Finish the encrypted credential vault and migrate every scattered or plaintext credential, including Jiten.
- Refuse insecure plaintext downgrade when OS encryption is unavailable.
- Centralize provider health, model selection, usage/cost reporting, caching, cancellation, streaming, retry, and privacy controls.
- Support local Qwen as the no-key fallback and provider adapters through the managed vault.
- Reuse one structured provider client and one permission/audit model instead of creating feature-specific clients.

**Re-derived 2026-08-20 — 4 of 5 finished, 1 partial (8 of 9 sub-items).** Everything but one
sub-item is shipped with a mechanism at a named line: vault, scraper-store migration,
plaintext-downgrade refusal, Qwen fallback, the single client and its privacy gate, and — in
`providerRuntime.ts`, not the router — caching (`:138`/`:666-679`) and retry with exponential
backoff (`:693-727`). The one gap: **provider health is an exported function nothing calls.**
`getAiProviderHealth` (`:151`) has zero consumers outside its own module — no IPC channel, no
preload binding, no renderer read — so a mis-keyed provider surfaces only as a failed request.
See the ledger, "Tracks 1, 4, 5, 6 re-derived bullet-by-bullet" and its correction.

## Track 2: professional multilingual Lexicon Workbench

Complete the full professional dictionary plan rather than only its committed SQLite foundation.

- One SQLite/FTS service for Japanese, Chinese, English, and Russian with language detection and any-to-any gloss targets.
- Cooperative cancellable migrations/imports with progress and restart safety.
- Importers and source management for Yomitan, CEDICT, KANJIDIC, JMnedict, Tatoeba, StarDict/DSL, Wiktextract, bundled sources, and user-supplied licensed datasets.
- Multi-source merge, deduplication, source attribution, per-language-pair priority, deep/fuzzy/reverse/example search, saved searches, and virtualized results.
- Character decomposition, radicals, handwriting and stroke practice, words containing a character, pitch/tone/stress, inflections, conjugation/declension, corpus frequency, collocations, semantic neighbors, etymology, register, audio, concordance, notes, history, stars, known-word overlays, exports, Flashcards, and Anki.
- Find-in-the-wild results from the user's library, subtitles, examples, news, encyclopedic sources, and spoken sources, ranked by sense and learner level and cached for offline reuse.

Merge Dictionary and Translator into one scale-adaptive Lexicon Workbench:

- One input accepts a character, word, sentence, paragraph, or document and automatically chooses a lens, with manual override.
- Run the ladder: segment -> real dictionary lookup -> offline interlinear gloss -> fluent translation -> linguistic analysis -> contextual explanation.
- Render the offline first three rungs immediately and never make useful core results wait for a model.
- Ground every token, reading, level, and sense in the database. Use the model to select and explain supplied facts, not invent them.
- Add sense pinning and retranslation, interlinear display, parallel targets, round-trip semantic diff, composition checking, vocabulary harvest, difficulty scoring, and personal concordance.
- Keep old Dictionary and Translate routes as compatibility aliases into the correct Workbench lens.

Complete and visually verify the AI language features:

- Contextual Explain with nuance, similar-word distinctions, usage/register, collocations, learner mistakes, etymology, grammar, mnemonics, and graded examples.
- Japanese particle and grammar analysis, Chinese classifier/measure-word and aspect guidance, Russian declension/aspect/case/agreement, and formality variants.
- Streamed and cached answers, explanation-language selection, batch explanation, cost limits, and clear labels separating sourced material from AI-generated material.

## Track 3: one centralized AI Agent app

Create a first-class Study OS AI app rather than another small chat popup. It becomes the common entry point for the existing local-agent runtime, cloud/local provider clients, AI Studio, sentence and dictionary analysis, media assistant, theme assistant, knowledge search, automations, and application navigation.

### Product model

- A persistent conversational workspace with chats, task threads, searchable history, pins, attachments, reusable prompts, and clear current context.
- A context shelf showing what the agent can currently see: active app/route, selected text, dictionary entry, reading passage, media cue/transcript, study session, saved words, and optional user-selected files.
- Contextual AI buttons remain in Dictionary, Reading, ReadingLens, Media, Flashcards, Settings, and other surfaces, but they open or hand off to the same Agent conversation with context attached. They do not maintain separate hidden chat histories.
- The Agent can explain the application, answer help questions, search settings/help/commands, and navigate the user directly to the correct surface. Navigation should support an optional visible highlight or guided next-step card, not merely open a window.
- The Agent can plan multi-step study work, show the plan before execution, run permitted tools step by step, pause, cancel, retry, resume, and present an undo path when the underlying operation supports one.

### Capability consolidation

- Reuse and expand the existing typed operation registry, handler adapters, planner, queue, profiles, memory, knowledge search, automations, scheduler, model runtime, confirmations, and event log.
- Cover app navigation; help/settings/command search; Dictionary/Lexicon; Reading and ReadingLens; Media/Liquid; subtitle and sentence analysis; mining; Flashcards/Anki; study planning; calendar; themes; and safe library operations.
- Add capability discovery so the Agent can say what it can do, what context or permission is missing, and offer a direct route to resolve it.
- Convert specialized generation experiences such as AI Card Studio into Agent skills/workflows while preserving rich dedicated editors for preview and correction.
- Allow proactive but non-intrusive suggestions based on current context, with a global off switch and per-surface controls. Never create surprise automation.

### Trust, safety, and privacy

- Default to read-only. Separate read-only, limited-action, and full-automation profiles.
- Re-check both permission level and per-operation allowlist at execution time, including resumed queued work.
- Require explicit confirmation for deletion, external connections, file organization, exports, major setting/theme changes, and other material side effects.
- Display a human-readable plan, tool calls, arguments, results, failures, and affected data. Never claim an action completed when only a plan was generated.
- Keep local mode genuinely local. Clearly indicate when content will be sent to a cloud provider and which provider receives it.
- Give users controls for memory scope, retained chats, sensitive-context exclusion, history deletion, provider budgets, and automation schedules.

### Central Agent UI

- Main layout: compact conversation rail; primary conversation/task canvas; collapsible context and activity inspector.
- Modes are lightweight workflow presets, not separate bots: Ask, Navigate, Study, Analyze, Create, and Automate.
- Responses may contain safe interactive result cards: open location, compare entries, preview flashcards, inspect a reading, resume media, approve a step, undo, or save.
- Simple mode defaults to clean conversation and a few suggestions. Full mode exposes plans, queue, tools, memory, model/provider, permissions, automations, and execution logs.
- Use Fluent Windows 11 styling, deep-red action accent, progressive disclosure, monochrome icons, no decorative emoji, no redundant internal window title, keyboard access, screen-reader semantics, and reduced-motion support.

### Agent acceptance

- A user can ask where a feature is and be navigated to the exact app, page, or control with an understandable explanation.
- A user can ask a study question from a word, sentence, novel, screenshot, subtitle, or media cue and receive a grounded answer with that context preserved.
- A user can request a multi-step workflow, inspect the plan, approve required steps, observe progress, recover from a failure, and verify the resulting app state.
- Local and cloud modes degrade honestly, never silently crossing the privacy boundary.
- Existing scattered AI surfaces either hand off to the Agent or are documented as specialized non-chat tools backed by the same services.

### Track 3 implementation checkpoint — 2026-08-10

The central foundation is implemented and verified, but Track 3 remains
**partial** against the full acceptance above.

Completed in the current source tree:

- main-owned persistent conversations, prompts and operational state;
- Simple/Full Agent presentation, context shelf and inert context suggestions;
- global and Dictionary/Reading/Reading Lens/Media/Flashcards/Settings
  suggestion controls;
- typed plan creation, an inspectable queue, execution-time authorization,
  pause/cancel/resume/retry and explicit sensitive-step confirmation;
- a main-owned atomic execution lease with a durable in-doubt marker and an
  expiry-gated, user-attested recovery path;
- exact executor timeline projection and an exact-id, session-only operation
  log where authoritative ids exist;
- a live capability directory and persistent reusable prompt library;
- expanded Blanc Master Search sources for decks, persisted dictionary
  results, grammar and the reader library;
- deterministic fresh-query routing to 124 app/settings destinations through a
  static index, re-derived at review and approval and refusing on ambiguity
  (2026-08-10 — see the evidence ledger's "Deterministic fresh-query
  navigation" section);
- that index widened to **150 destinations covering 104 of the 107 guided
  controls**, by giving the 26 controls that had no `SETTINGS_REGISTRY` entry one
  — which widens Settings' own search box by the same 26 rows. The remaining
  three declared pairs are duplicate coordinates of cards already indexed, held
  by a gate that makes each name its stand-in (2026-08-10 — see the ledger's
  "The 29 guided controls Settings' own search could not find either");
- an approved navigation that has to **open** the Settings window now
  acknowledges, where it previously reported `open-failed` after landing on the
  correct page. The cause was not a timing margin: the acknowledgement was polled
  through `requestAnimationFrame`, which Chromium does not run at all for a
  hidden document, and a pop-out main has just opened is routinely occluded. The
  poll now picks its clock from `document.visibilityState`, and a refusal is
  typed `invalid` (final) or `not-ready` (retried within a budget), so a
  destination Settings judged unusable still never becomes a success
  (2026-08-10 — see the ledger's "Cold open acknowledges, and the delivery
  handshake finally enters history"). That commit is also the first time the
  delivery handshake itself entered history; it had lived only in the working
  tree.
- a question asked in Russian, Japanese or Chinese now resolves. The blocker was
  the tokenizer rather than the vocabulary — it stripped every non-ASCII
  character, so such a query produced no tokens at all — and the fix reuses the
  translated titles the UI already renders (a `titleKey` on all 150 entries, held
  to `SETTINGS_REGISTRY` by the mirror gate) instead of hand-writing per-language
  term lists that could drift from them. English is never scored through that
  lane and is asserted unchanged (2026-08-10 — see the ledger's "«где тема»
  resolves").

Still required before the Track 3 acceptance can be called complete:

- **partly done.** ReadingLens and Settings now hand off, and the study-session
  and saved-words producers exist and are tested. The load-bearing fix was that
  `createAgentContextItem` rebuilt `source` without `controlId`/`highlight`, so
  no context item could satisfy the guided check `resolveAgentNavigation` runs —
  the provenance half of guided navigation had never once run (2026-08-10 — see
  the ledger's "The context producers, and the field that was being thrown
  away"). ReadingLens, Settings and Flashcards all hand off now, the last through
  `FlashcardDeckOverview` with the word list bounded at 40 before it leaves.
  The review session hands off too, from `FlashcardReviewMode`'s done state.
  **Screenshot/OCR attachment context — done.** The *lane* was committed first:
  `AgentExecutionAttachment` takes `kind: 'image'` carrying `imageBase64`,
  bounded at 4 MiB decoded and two images per request, restricted to
  png/jpeg/webp, and deliverable only to `gemini-2.5-flash` — both DeepSeek
  models and the local backend refuse with `vision-unsupported` rather than
  dropping the image (2026-08-10 — see the ledger's "The vision lane, finished
  and driven live", which records the four decisions and the seven live
  normalizer probes). `FORBIDDEN_ATTACHMENT_FIELDS` was extended, not weakened.
  The **producer and the transport** followed the same day. The design question —
  where a multi-megabyte payload lives between the capturing window and the Agent
  window, when the persisted workspace may not hold it and a renderer copy does
  not reach a pop-out — is answered by a fourth route: main-process memory keyed
  by conversation, bounded, expiring and **single-use**, touching no `fs`
  (`shared/agentImageStaging.ts`). ReadingLens now sends its capture with every
  "ask the Agent", and every lens scan keeps its screenshot rather than only a
  visual-novel one. Two defects were found by driving it and fixed here: a stage
  request carrying `bytes` was accepted (staging was a second door into the
  attachment world that never consulted the forbidden set), and the claim was
  wired to the workspace push, which the hand-off's own ordering guarantees
  arrives *before* the capture is staged — so an already-open Agent claimed
  nothing. See the ledger's "The capture reaches the Agent, and two ways it did
  not". **Still open, and now a small edit rather than a design question**: the
  visual-novel surfaces produce nothing yet, though `visualNovels.ts:985` already
  persists a capture screenshot via `saveCaptureScreenshot`. **Superseded — the
  vision lane is complete across all three producers that can carry a picture**:
  the lens, the visual-novel library (`VisualNovelAgentHandoffButton`,
  `ca938e1`/`05b673c`) and the media player (`MediaCueAgentHandoffButton`). The
  note above described a file rather than a gesture and was already false when
  written: `saveCaptureScreenshot` has exactly one caller, and its only renderer
  entry point is ReadingLens, which already hands its capture over. See the
  ledger's "The last capture surface, and the 27 MiB it would have sent";
- **done.** All fourteen adapters are installed — five `visual-novel`, three
  `media`, six `anime` (`renderer/visualNovelAgentHandlers.ts`,
  `mediaAgentHandlers.ts`, `animeAgentHandlers.ts`, 2026-08-10; see the ledger's
  three "adapters" sections). The unavailable surface went 17 → 12 → 9 → 3, and
  **no declared operation reports `adapter-not-implemented` any more** — the
  registry test asserts that as a property. The three that remain are decisions
  already taken, not missing code: `dictionary.explain-grammar` and
  `dictionary.analyze-sentence` are `dedicated-analysis-required`, and
  `flashcard.schedule-reviews` is `false-success-stub-removed`. The anime item
  needed no product decision after all — `jp-media-tracking-v1` already *is* the
  local tracked-anime record, which is recorded in the ledger so it is not
  re-litigated a fourth time;
- **AI Card Studio conversion to an Agent workflow while retaining its editor:
  done.** `flashcard.generate-cards` runs the studio's pipeline, writes nothing,
  and now **stages** its batch for the studio's own preview editor, which adopts
  it into the same `batchResults` state a locally generated batch lands in — so
  the preview strip, Save to flashcards, Send to Anki and Export CSV all work on
  it identically. The transport (`shared/agentCardBatchStaging.ts` +
  `main/agentCardBatchStaging.ts`) had been **written and left unreferenced by
  any running code**; this slice registered it, bound it through preload, and
  wired both ends. One slot, single-use, expiring at 30 minutes, main memory
  only, `fs` untouched. The load-bearing fix was that the staged batch had to
  carry `miningDeckIdentity`'s **book id** and not only its label:
  `saveAiResultsToDeck` derives an id with `deckBookId`, whose ASCII-only slug
  collapses every Japanese title to the same value, and `replaceImportedDeck`
  deletes the matched group before inserting — so two Japanese-titled `book`
  batches would have destroyed each other. See the ledger's "The transport that
  had been written and never connected" (2026-08-11). **Deliberately not done:**
  `AiCardStudio` was not mounted live, because its language-sync effect writes
  the user's saved AI configuration on mount (`AiCardStudio.tsx:270`);
- **broader Undo surfacing: done.** The feature was committed on 2026-08-10
  (`d13c770`/`c04bb60`) — it had never been in the repository despite being
  written up here as verified — and then widened from one inverse to four
  (`flashcard.delete-cards`, `flashcard.delete-deck`, `calendar.delete-event`,
  `media.delete-item`), so creating a deck, adding cards, scheduling a session,
  creating a reminder and importing media are all reversible. Two defects that a
  single supported operation had been hiding were fixed first: the inverse's
  arguments were hard-coded to `{ids}`, and `liveEntityIds` was one flat set
  instead of a per-`entityType` resolver. See the ledger's "Undo widened from one
  inverse to four". `study.undo-filter` stays out on purpose (its inverse leaves
  the entity alive, so the removal check and the `deleted` claim both misdescribe
  it). **The durable-history decision: taken and shipped** (2026-08-21,
  `422df210` + `ee28eac1`) — `shared/agentOperationHistory.ts` rides the
  main-owned operational document as a fifth section, bounded at 500 rows and 90
  days, with exact immediate deletion as the control and `arguments` dropped on
  the way to disk. Undo stays session-only on purpose: a log restored from disk
  cannot honestly answer the supersede question for writes made while the app was
  closed. Surfaced as a Settings > Memory card in all four languages;
- **Real provider-cost controls: done.** The composer prices a request from the
  user's own per-million-token rates — never a shipped table, which would rot
  into a confident lie the first time a provider re-priced — shows a labelled
  floor for the run in front of it, reports the actual charge per turn from the
  provider's returned usage, and can refuse a run above a cost limit. The
  refusal is main's, and it fires in the preflight before any credential is read
  or any request leaves the machine. The load-bearing rule is that the cap is
  carried **only** alongside a complete pair of rates: `providerRuntime` skips
  its refusal whenever the estimate is `undefined`, so a cap forwarded without
  pricing would be a control that refuses nothing while telling the user it
  will. `normalizePolicy` drops it, in shared code, so both ends agree. The lane
  was found already written and **entirely uncommitted** — two untracked
  modules, six modified files and 44 catalog entries that had never been in the
  branch's history; this commit verified and landed it, and added the two tests
  that hold its rules (2026-08-11 — see the ledger's "The cost control that had
  been written and never committed"). **Still open** from this bullet:
  none — the two bullets below close what this one named. **Full-mode
  memory/profile/permission controls: done.** `AgentGovernancePanel` is the main
  app's writer for the permission ceiling, the active profile and the memory
  switch; until it existed the only writer for `localAgentSettings` or the
  profile store in the whole repository was Blanc's shell, so the app that owns
  the Agent could read all three and change none (2026-08-11 — see the ledger's
  "The Agent's own governance, written from the app that owns it");
- **Retained-chat policy and memory scope: done.** `memoryScope` narrows which
  memory categories a request may draw on. It is enforced in
  `main/localAgent.ts`, the choke point the Agent's planner and Blanc's separate
  shell both arrive at, rather than at either producer — so the scope cannot be
  bypassed by a surface outside this track, and Blanc is covered without editing
  its directory. `chatHistory` bounds how many prior turns reach a provider,
  carried as `AgentProviderPolicy.historyTurns` and applied as the LOWER of it
  and `AGENT_HISTORY_TURN_CEILING`, so a policy arriving over IPC can only ever
  narrow what is sent, never widen it; the bridge normalizer clamps to the same
  ceiling and never invents a value where the sender stated none. An absent
  `memoryScope` restores every category — a document older than the setting must
  not silently lose the memories it was already using — while an empty one sends
  nothing, which is the user's own choice; the two are deliberately
  distinguishable, and that migration path was measured against the real stored
  settings document on this machine (2026-08-11 — see the ledger's "The two
  privacy controls that had no state behind them"). **Persistent sensitive-context
  exclusion: done, live acceptance included.** The setting defaults on
  for older documents and removes sensitive context and attachments at the main
  provider boundary. Turning it off only makes that material eligible: each
  cloud request still requires the existing explicit consent. Both halves were
  driven live on 2026-08-12 against a real staged capture in the active
  conversation: with exclusion on the composer states the material stays local
  and asks for nothing, with it off the consent checkbox appears naming
  `gemini-2.5-flash` by name, and the switch renders checked with **no persisted
  settings document in existence** — which is the default-on migration claim
  measured rather than reasoned (see the ledger's "Three live-acceptance debts
  paid in one session"). **Automations: done** (2026-08-22, `1f73d808`). The
  freeze itself was never the open part — `BlancReadyToolPanels.tsx:474` has
  always stored `effectiveAgentPermission(settings.permission, activeProfile)` on
  the entry, and the automation table renders that level in its own column, so
  the product decision was already taken. What was open is that the frozen level
  **governed nothing that had shipped**: the ceiling's whole implementation —
  `narrowAgentPermission`, the queue row's `permissionCeiling` and its
  normalizer, and the execution-time narrowing — sat uncommitted in the shared
  working tree from 2026-08-12, absent from every commit. That lane is landed
  here, together with the half that was genuinely missing: **planning**. Main
  builds both the system prompt and the approved-operation set from the settings
  the renderer sends, so a `read-only` automation planned full-automation steps
  that execution then refused one at a time; `underPermissionCeiling` bounds the
  settings the plan is built from. It is a ceiling at every boundary and never a
  grant — a stored `full-automation` bound leaves a `read-only` live setting
  alone, and a re-enqueue keeps the lower of the two. That sentence was written
  true of the three defined levels and **false of a fourth**, and the 2026-08-22
  boss audit measured the exception: `narrowAgentPermission` ranked a level
  absent from its table as `undefined`, lost the comparison, and returned the
  *other* operand — so an unrecognized ceiling widened `read-only` to 56
  approved operations instead of 18. Never reachable (every path normalized
  first), and closed at the primitive in `58203d56`, which is what makes the
  sentence unqualified now: an unrecognized level ranks as the strictest, and
  `evaluateAgentToolAccess` refuses it outright. Measured live against a
  real Qwen3-1.7B with one objective and one operation list, varying only the
  permission: `full-automation` planned `flashcard.create-deck` in 2 of 2 runs;
  the negative control, `read-only`, produced no plan in 0 of 3 — the write the
  ceiling forbids never appeared. See the ledger's "Track 3, last trust bullet";
- **Final compact-width and complete keyboard/reduced-motion visual matrices:
  done.** Run for the first time — the only prior mention of this bullet in the
  ledger is one line saying it "also remains required". Measured live at fifteen
  widths from 1084 down to 320 against `.agent-root`'s own container (an
  `@container` surface, so the width is drivable without resizing a window and
  rewriting `desktop-layout.json`), in Full mode with all ten disclosures open —
  1,201 descendants rather than Simple mode's 245, because a closed `<details>`
  measures 0x0 and every check in the matrix scores 0x0 as a pass. Clean on
  horizontal overflow, focus rings, positive `tabindex`, rail arrow keys and
  smooth scrolling. Four defects fixed: three controls under the WCAG 2.5.8
  24px target-size floor (`.agent-mode-select` at 94x19, and the request-limit
  and plan-step summaries at 116x20 and 43x18), now floored through one
  `--agent-hit-min` token and deliberately *not* blockified, because these
  summaries have no chevron of their own and `display: flex` would drop the UA
  disclosure triangle; and — the real one — a focus order that disagreed with
  the rendered order at every width under 980, where the inspector was lifted
  with `grid-row: 1` but follows the conversation in the DOM, so a keyboard user
  saw it first and reached it last. Both `grid-row` overrides are gone and the
  inspector stacks below, which is the accepted cost. 330 inversions before, 0
  after, with the 330 reproduced as a positive control by re-applying the
  deleted declarations inline. Twelve tests, each proved to guard by its own
  mutation (2026-08-11 — see the ledger's "The matrix that had never been run").
  **Reduced-motion ambiguity resolved; Track 3 closes.** The Display preference
  now reaches the shared motion runtime immediately: *Reduced* maps to
  half-duration Performance while retaining `.reduce-motion` for targeted
  decorative opt-outs, and *None*/OS reduced motion remain the global snap
  controls. The Agent therefore keeps purposeful token-timed transitions under
  Reduced without weakening its complete-off path. The Track 3 "Still required"
  list is now **6 of 6 top-level bullets closed** (`1ac943ed`, 2026-08-22; see the
  ledger's "Reduced is Performance").

## Track 4: unified Reading workspace

Take creative product-design authority; do not merely place Reader Finder beside Novels.

- Build one coherent flow for Home, Discover, Library, Continue Reading, Reading Plan, Imports, and Sources.
- Search local catalog, Jiten, curated reading sites, web material, and available EPUB sources together.
- Rank and recommend by difficulty, known vocabulary, interests, availability, source quality, and reading history.
- Replace the dense permanent three-pane table with a cover-first grid plus strong compact list and a contextual detail drawer.
- Resolve covers through cached local art -> validated remote art -> designed fallback, with failure/negative caching.
- Resolve Jiten metadata and covers automatically; move API-key management into the credential vault.
- Unify planning, import/download, web extraction, comprehension analysis, Novel Reader, progress, dictionary, mining, and Jiten vocabulary actions.
- Preserve saved plans, imports, progress, and deep links; keep the former Reading Finder route as a Discover compatibility alias.

**Re-derived 2026-08-20 — 9 of 9 finished.** The seven sections are literally
`READING_WORKSPACE_SECTIONS`; ranking, cover resolution with negative caching, the vaulted Jiten
key and the Finder→Discover alias all carry mechanisms. The last gap, the **contextual detail
drawer** half of the grid bullet, closed 2026-08-20: the centred `nov-modal` is now a docked
`rf-drawer`, measured live at `offsetLeft 358 + width 460 = layer 818`, so the grid it was opened
from stays beside it. See the ledger entry of the same date.

## Track 5: ReadingLens as Capture and Read

The existing popup is a foundation, not completion.

- Support region, repeat-region, clipboard, and persistent pinned captures.
- Provide OCR confidence, editable text, alternate candidates, retry/engine choice, vertical-text handling, and line-order correction.
- Progressive experiences: Glance for instant meaning; Inspect for tokenization, Dictionary/Workbench, translation, grammar and explanation; Read for a cleaned multi-line passage with furigana, typography, annotations and vocabulary harvest.
- Send a word to Lexicon, a sentence to Workbench analysis, and a passage to the Reading workspace.
- Save to Flashcards/Anki, retain contextual screenshots and source metadata, and provide searchable capture/session history.
- Pin, dock, resize, restore bounds, and work correctly across monitors.
- Support VN, manga, video, PDF, and browser workflows through the same shared pipeline.
- Add privacy/retention, OCR/model defaults, shortcuts, keyboard-only use, and honest offline/cloud indicators.

**Re-derived 2026-08-20 (second pass, same day) — 8 bullets: 3 finished, 5 partial, 0 deferred.**
Bullet 1 closes (`d3408014` added the missing repeat-region; region, clipboard and pinned captures
already shipped) and bullet 5 was already closed. **Bullet 6 now closes too:** it names five
things — pin, dock, resize, restore bounds, across monitors — and all five are in.
Across-monitors landed with `d3408014`'s `resolveRepeatRegion` (a region is replayed on its own
display, and dropped when that display is gone); `83d63cb0` added the eight resize grips and, with
them, restore-bounds, because a resized rescan runs through the same `lens:ocr` handler that
persists `lastRegion`; `c002631f` added the pin that suspends the 3.6 s auto-dismiss; `39b1777a`
added the dock that moves the toolbar off a read sitting in the bottom band. Each measured live,
each with its own negative control — see the ledger entry of the same date.
Bullet 7 **stays partial**: it names five workflows and `bb165db8` made manga the second, so
video, PDF and browser remain. The other four partials are bullets 2 (alternate OCR candidates,
mixed-panel order model), 3 (progressive **Read**), 4 (passage → Reading workspace) and 8
(privacy/retention, OCR/model defaults). Counted one bullet line at a time, not by keyword sweep.
Across Tracks 1/4/5/6 that is **20 finished / 5 partial / 4 deferred = 29**.

**Amended 2026-08-20 — bullet 4 now CLOSES.** `0facd903` + `e3dc49e7` built the third of its
three halves: paragraph/document captures reach a new Reading-workspace **`captures`** section
through a main-owned single-use slot that mirrors the Lexicon lane. Word → Lexicon and
sentence → Workbench were already done. Measured live with a negative control (a word-scale
stage is refused and announces nothing) and both arrival paths — cold open and the `staged`
broadcast into an already-open window. Trap recorded in the ledger: StrictMode's effect replay
silently consumed the single-use claim until the client latched the in-flight promise.
Track 5 is now **4 finished / 4 partial**; Tracks 1/4/5/6 = **21 finished / 4 partial /
4 deferred = 29**.

**Amended 2026-08-20 (same day, later) — bullet 7 now CLOSES.** It names five workflows and
all five are in: VN and manga were already, `24266c45` added the browser, `84c7a26d` the video
and `6553f743` the document reader (PDF and EPUB arrive at one derivation because
`pdfLoader.ts` produces the same `LoadedEpub` shape). Each parks its own provenance in the
shared `localStorage` slot and each was clicked in the running app, with the browser carrying
the negative control: with no page open the click parks **nothing** and says so.
`f918b5f9` is the finding the walk produced — the reader's item shipped inside a menu bar that
only the aero and wired material sets render, so it moved to a toolbar that renders in every
theme. Counted one bullet line at a time, not by keyword sweep.
Track 5 is now **5 finished / 3 partial**; Tracks 1/4/5/6 = **22 finished / 3 partial /
4 deferred = 29**. Remaining Track 5 partials: bullets 2 (alternate OCR candidates, mixed-panel
order model), 3 (progressive **Read**) and 8 (privacy/retention, OCR/model defaults).

**Amended 2026-08-20 (same day, later still) — bullet 3 now CLOSES.** It names three
progressive experiences and all three are in: Glance is the in-place OCR plus
`LensReaderPanel`'s glance tier, Inspect is `LensAnalysisPanel`, and `7d227f84` added the
missing **Read** — `LensReadPanel`, with all four parts the bullet names. The cleaned
passage comes from a shared model (`32d846f3`, corrected by `f37c0ba6`) so what you read is
what the harvest counted; furigana is per-run `alignFurigana`, so ruby sits over the kanji
rather than the whole word; typography is size, leading, vertical columns and the furigana
switch, persisted; annotations reuse the reader's own store keyed `lens:<captureId>`.
Measured live on a real `lensOpen('clipboard')`: 3 lines → **2 paragraphs**, 11 words,
**4** ruby, **6** harvest rows, and the negative control — a swatch clicked with no
selection refuses, says why, and writes **0** keys.
`9f649b77` is the finding the walk produced, and it was pre-existing: a capture that landed
before the tokenizer stayed one unclickable blob for the life of the window, so the Read
harvest counted 0 forever. Counted one bullet line at a time, not by keyword sweep.
Track 5 is now **6 finished / 2 partial**; Tracks 1/4/5/6 = **23 finished / 2 partial /
4 deferred = 29**. Remaining Track 5 partials: bullets 2 (alternate OCR candidates,
mixed-panel order model) and 8 (privacy/retention, OCR/model defaults).

**Amended 2026-08-20 — a direct user requirement added to bullet 3, and one defect under it.**
The user reported the Read sheet twice from their own screen: it "just sticks in the middle of
the screen", and then "right now no buttons work either". Both are now closed, and the
requirement is recorded here rather than left in a relay pin that expires.

*The requirement.* The Read overlay **must be draggable by its header row, resizable from its
edges and corners with a minimum that keeps the header controls and one line of the passage
legible, must persist its position and size across close/reopen, and must be clamped on
screen** — this machine has two displays, so an unclamped restore can put it where there are
no pixels. Delivered in `9b1497a2`; geometry lives in `shared/readingLensReadFrame.ts` and
every entry point runs through `clampReadFrame`.

*The defect underneath it, `a4d1cd85`.* The sheet took no input at all, and the cause was not
in the DOM. The lens is one transparent always-on-top window that is click-through by default;
interactivity is re-armed only by a forwarded `mousemove` landing on `.lens-interactive`. Read
is an opaque sheet with its own controls, so it must not depend on that flip. Measured at the
OS layer — with the sheet open and the flag set, `WindowFromPoint` at the centre of its own
close button returned **another process's window**. `readOpen` now joins `resizing` in the
pass-through guard and `popup` in the auto-dismiss suspension list.

### Track 5 implementation checkpoint — 2026-08-12

- **Searchable capture/session history: done.** Persistent captures, pinning, and — as of
  `0f15a2a` — the source and **pinned-only** filters, all resolved in main against the whole
  history rather than over an already-fetched page. That commit landed a finished slice that
  existed only in the working tree, with its own tests and all four translations; see the
  ledger's "A finished ReadingLens slice was living only in the working tree". Live-accepted
  read-only against the real `ipcMain` handler, including the strict `=== true` guard that makes
  a stringy `"false"` from IPC widen the result instead of silently hiding rows.
- **Character/word → Lexicon: done in the 2026-08-12 recovery checkpoint.** The first real
  consumer of `resolveReadingLensWorkflow`'s `lexicon` target uses a main-owned, bounded,
  two-minute, single-use slot; opens or focuses Dictionary only after staging succeeds; and makes
  Dictionary claim both on mount and on the staged broadcast. The latter is required for an
  already-open window, and the mount claim is held through React StrictMode's effect replay. Live
  acceptance proved both paths through the real `ipcMain` handler. Sentence input is deliberately
  refused rather than dumped into Dictionary: that receiver cannot honor the resolved
  `translate` lens.
- **Sentence → Workbench analysis: done in the 2026-08-12 grounded Workbench checkpoints.** The
  Translate compatibility route now claims the sentence handoff and renders the offline
  interlinear result immediately, with the later grounded analysis tools layered onto that result.
- **Still open — passage → Reading workspace.** `ReadingWorkspaceView` routes only to Library,
  Finder and Novels, and an ad-hoc OCR passage has no surface among them. That half remains parked
  on the recorded product decision rather than being misrepresented by a fake novel.
- Still open beyond that: progressive passage **Read** mode, and the privacy/retention and
  OCR/model default controls. Alternate OCR candidates and the mixed-panel order model still
  need explicit provider/product decisions and have not been forced.

**Final re-derivation 2026-08-22 — 8 of 8 bullets finished, counted from the eight top-level
Track 5 requirements.** The checkpoint immediately above is chronological evidence, not current
status. Bullet 2's alternate-reader half closed in `b9c4eea7`; its mixed-orientation panel-order
half closed in `dc760b38`/`0869bd89`, including four explicit fail-open guards. Bullet 8 closed in
`80e72e51`, `4e7817ff`, `3ce6a412` and `2006027f`: retention, keyboard-only use, selectable OCR
defaults, and scoped on-device/cloud honesty are all present. The other six bullets were already
closed by the amendments above. Track 5 has no remaining partial or deferred requirement.

## Track 6: repair Media shell, then prove the Liquid Video pilot

- Treat the current workspace screenshot state as a release-blocking regression: no sidebar, search, discovery, or useful library structure and a giant empty canvas.
- Restore one coherent Media shell with sidebar, global search, Library, Discover, Study, Readiness, Review, Music, Settings, imports, filtering, sorting, queues, details, and player access.
- Clearly integrate local and Seanime-backed libraries rather than hiding the mature shell behind a stripped overlay.
- Then complete the first full Liquid Video pilot under `LIQUID_WORKPLACE_TRANSFORMATION_PLAN.md`: real playback, subtitle discovery/versioning, dual subtitles, transcript, dictionary, translation, AI, mining/card editor, layouts, customization, detach/reattach, multi-monitor placement, restored bounds, persistence, errors, and performance.
- Use `renderer/assets/concepts/liquid-workplace-video-concept-v1.png` for hierarchy, density, and selective-material intent, not as a literal feature or data specification.
- Keep conventional windows as the default. The same complete Media/Video feature set must work in Standard and explicitly enabled Liquid presentations.
- Do not call the player a system pattern until it has passed the full visual matrix and the user has approved it.

**Re-derived 2026-08-20 — 7 bullets: 3 finished, 0 partial, 4 deferred to the Liquid plan.** (The
earlier "1 finished, 1 partial, 5 deferred" counted bullet 3 as deferred; closing bullets 2 and 3
moves it, so deferred goes 5 → 4 and the seven still sum.) The empty-canvas
regression is repaired (`MediaWorkspace.tsx:53-56` mounts the adopted `LibraryView` plus the
player; `MediaWorkspaceSectionView.tsx:98-107` states `pending`/`unavailable` honestly).

**Bullets 2 and 3 closed 2026-08-20** (`99eb3719`, `4807b671`). The one shell is
`MediaCenterView.tsx`, which every Media entry point already routed to; what was missing was two
of its own destinations and a shell that stayed visible. Readiness and Review existed only inside
the adopted overlay, and `os:open` auto-opened that overlay over the sidebar. Measured live in one
window: **8 sidebar destinations** (Home, Library, Video, Music, Study Mode, Readiness, Review,
Discover, plus Settings and the availability-aware workspace link), global search, **7 sort
options**, shelf filters carrying real counts (Recently added 33, Continue watching 2, Study queue,
Favorites, Tracking, TV shows 29, Unsorted 4), a `Title details` drawer, File-menu imports, and
player access through the workspace handoff — which now opens only when asked and closes back to an
intact shell. Readiness reads **77 files · 76 need work · 1 ready**; Review reads **1 card · 0 need
a look**. The Liquid Video pilot bullets are L4 of `LIQUID_WORKPLACE_TRANSFORMATION_PLAN.md` and
close there, not here.

## Track 7: remaining main-app completion

- Reconcile and finish all still-open non-Mobile, non-Noctis v1 features after re-deriving their state.
- Include known architecture, grammar, settings/help, storage-hardening, scraper, subtitles, resources, VN, manga, Anki, multi-monitor, visual, and stale-document discrepancies only when source/live evidence confirms they remain open.
  **Done 2026-08-19.** That list is the register in `docs/ACTIVE/AUDIT_2026-08.md` — **22 rows,
  F1–F23 (there is no F18)**, counted from its own `| F<n> |` table rows. All 22 were re-derived
  against the tree; 21 were already closed and F21's artifact half closed with `e44b137a`. Each
  closure rests on a mechanism at a named line, not a keyword match — see the ledger entry
  "Track 7's non-workbench clause" for the per-row evidence, the negative control, and the one
  remainder that is an owner decision (11 documents under the `.gitignore:178-187` publication
  list) rather than a code defect. **Do not re-sweep this register**; re-derive only a row you
  have new source evidence against.
- Deliver the required full-fidelity Anki Deck Workbench in `ANKI_DECK_WORKBENCH_PLAN.md`. The current APKG importer, local Flashcards editor, and Anki card composer are foundations, not completion; this slice remains open until that plan's demonstrable acceptance gates pass.
- Do not redo items merely because an old document says pending.

## Track 8: system-wide Liquid Workplace transformation

After the player pilot is visually approved and the remaining app contracts are stable, execute
`LIQUID_WORKPLACE_TRANSFORMATION_PLAN.md` across every main desktop app and internal suite.

- Apply the concept's clean, smooth, minimal, intelligent hierarchy to every app interior, including normal windows.
- Keep Liquid window behavior explicit, per-window, reversible, and state preserving.
- Use stable opaque anchors for reading, editing, forms, tables, logs, calendars, gameplay, review cards, and other dense work. Reserve Liquid treatment for contextual navigation, transport, inspectors, docking, and meaningful transitions.
- Build and close a feature-parity ledger for Standard and Liquid destinations before accepting any app migration.
- Preserve the taskbar, desktop grid, normal drag/resize/snap/focus, pop-outs, multi-monitor transfer, persistence, Aero, Wired, Blanc, high contrast, reduced motion, and performance modes.
- Require fresh rendered baselines and after screenshots at compact/default/maximized sizes; source inspection alone is not visual proof.
- Finish with the full visual atlas and explicit user visual approval before release hardening.

## Track 9: qBittorrent API surface — credential contract and verification phase

Every part of the app that reaches qBittorrent goes through one client
(`src/main/scraper/qbittorrent.ts`) and one stored secret. That surface has never been proven
against a live daemon: the nyaa subtitle provider shipped in `477380be` with 40 unit tests and a
live IPC check, but **no acquisition has ever completed**, and the client cannot use the
credential form qBittorrent now issues. This phase closes both gaps and covers *all* qBittorrent
consumers, not only nyaa.

### The auth contract — measured, not inferred

Taken 2026-08-15 against **qBittorrent v5.2.3** on `127.0.0.1:8080`.

> **Test-validity rule.** With `WebUI\LocalHostAuth=false`, qBittorrent authorises *every*
> localhost request, so all four rows below return 200 and the run proves nothing. Every auth
> probe MUST run with `LocalHostAuth=true` and MUST include a no-credential control that returns
> 403. A probe without a passing negative control is not evidence. This exact false pass was
> produced once while establishing this table.

| Method | Result |
|---|---|
| no credentials (control) | **403** — control passes, run is valid |
| `X-Api-Key: <key>` | **403** — not a supported header |
| `Authorization: Bearer <key>` | **200** |
| `POST /api/v2/auth/login` (username+password) → SID cookie | 204, then 200 |

What follows from it:

- **An API key authenticates on its own.** A user who supplies one must never also be asked for a
  username and password. Requiring both is a defect, not a safety measure.
- **`Authorization: Bearer` is the only accepted header form.** `X-Api-Key` is refused by the
  daemon. Do not ship the header name by analogy with other providers.
- `qbittorrent.ts` today implements only `login()` → SID cookie, with the password resolved from
  the vault via `getScraperSecret(config.passwordRef)`. **API-key auth is unimplemented**, so every
  gate below that names a key is blocked until Phase 9.0 lands.
- Both modes must keep working. Existing users have username/password in the vault; new users will
  have only a key. Neither may become mandatory for the other.

### Phase 9.0 — the missing auth path (build, then test)

- Add an API-key mode to `ScraperQbittorrentSettings`: an `apiKeyRef` alongside `passwordRef`,
  resolved through the same credential vault. The key itself never enters settings JSON, any
  export, any error string, or any log line.
- Add the key to the scraper redaction list beside the existing `'x-api-key'` entry in
  `src/main/scraper/http.ts:72`, and to the token patterns in `src/main/scraper/logBus.ts:217`.
- Settings offers exactly one auth mode at a time; choosing one visibly disables the other's
  fields rather than silently ignoring them.
- `qbitTest()` reports *which* mode authenticated, so a user can tell a working key from a working
  password.
- `resetQbitSessions()` must clear key-mode state too, or a changed key keeps working until restart.

**Phase 9.0 CLOSES 2026-08-18.** Re-derived against the tree rather than inherited: bullets 1, 2, 3
and 5 were already built — `authMode`/`apiKeyRef` on `ScraperQbittorrentSettings`
(`shared/scraperSourceSettings.ts:488-510`), `authorization` already in `SECRET_HEADERS`
(`scraper/http.ts:67`) and the greedy `authorization|cookie` line pattern in `logBus.ts`, and
`resetQbitSessions()` clearing one shared `sessions` map that both modes use. **Bullet 4 was not**:
`QbitStatusReport` had no field naming the mode and the success message says only
"Connected to host:port", so a user holding both a password and a key could not tell which one
answered — and, worse, `TorrentManagerPage` read `passwordRef` unconditionally, so a working
key-only setup was labelled **"no password"**, which reads as broken (that is Phase 9.4 gate 17's
complaint, one surface early). Now `QbitStatusReport.authMode` is set on **every** outcome except
`not-configured` — deliberately including the refusals, because that is where it changes what the
user does next — and both surfaces render it: the Torrent Manager shows the mode pill plus the
credential pill *for the mode in force*, and the settings drawer appends it to the test note.
5 tests in `main/__tests__/scraperQbittorrent.test.ts` (104 pass, was 99), including the
discrimination the field exists for — a rejected password and a rejected key are both
`unauthorized` yet carry different `authMode` and different messages — and the deliberate absence on
`not-configured`. Mutation control: hardcoding the field to `'password'` turns **4** of the 5 red.

### Phase 9.1 — contract gates (no daemon, run in CI)

1. A key-mode request carries `Authorization: Bearer` and **no** `username`/`password` field.
2. A password-mode request is byte-identical to today's — this phase must not regress the SID path.
3. The key is absent from every log line, error message, `QbitStatusReport`, and settings export;
   assert on a fixture key with a recognisable sentinel value.
4. Switching modes clears the cached cookie/session for that host.
5. A malformed or empty key is refused before any network call is attempted.

**Phase 9.1 CLOSES 2026-08-18, all five gates, `0ff6507a`.** Gates 1 and 5 were already covered
by the API-key describe block ("sends the key as Authorization: Bearer and never as X-Api-Key" —
asserted on every recorded request, plus `x-api-key` undefined and zero login attempts; "refuses an
unusable key before making any request" — `seenHeaders` length 0). **2, 3 and 4 were unwritten and
are now 8 tests** in `main/__tests__/scraperQbittorrent.test.ts` (**112 pass, was 104**).

- **Gate 2** could not be diffed against code that no longer exists, so it is **pinned**: a new
  `seenWire` recorder in the stand-in captures method + target + full header set, and the
  password-mode `qbitTest` is asserted equal to a 3-request literal (login → `app/version` →
  `transfer/info`), login body byte-exact `username=admin&password=adminadmin`, plus the send
  path's `torrents/add`. Discrimination control, in-suite: the same recorder on the same operation
  in key mode yields **2** requests, no login, `authorization: Bearer …` on both, no cookie.
  Mutation control: one stray header in `authed` turns **2** red.
- **Gate 3** scans a real corpus for sentinel `SENTINELqbitKEY7f3a2b91c4d6e8` after driving three
  key-mode outcomes (rejection, transfer list, 409 send): on-disk log files + the 2,000-line ring +
  the validated settings document + `redactHeaders` of every request that actually carried it.
  Absent from all of it, and from the three returned reports. **Positive control** in its own test:
  the identical scan **finds** the sentinel when a careless `scraperLog` builds a line containing
  it — which is also the honest limit, since the redaction is pattern-based and a bare token matches
  no pattern. The guarantee is "nothing in this client builds such a line", not "any line is caught".
- **Gate 4 needed a product fix**, and it was broken in the direction nobody tests. Key mode never
  reads the session map, so it never cleared it either: a password → key → password round trip rode
  the SID the *first* password minted. `evictForeignSession()` is now called from both branches of
  `authed`. Proven by changing the stored password underneath the round trip — a stale SID would
  still list transfers, and the daemon happily honours it. Controls: no-switch reuse (**1** login
  across 3 calls) and the reverse direction. Mutation control: dropping the one new call turns the
  round-trip test red.

Not claimed: none of this touches a real daemon. Gates 6–10 are Phase 9.2 and still need one.

### Phase 9.2 — live daemon gates (real qBittorrent, no torrent traffic)

Run with `LocalHostAuth=true` and the 403 control passing, against a real daemon.

6. `qbitTest()` succeeds in key mode with no password stored anywhere.
7. `qbitTest()` succeeds in password mode with no key stored anywhere.
8. A wrong key and a wrong password each produce a *distinct, honest* message — not the same
   generic failure, and not a false success.
9. `qbitTransfers()`, `qbitTorrentInfo()`, `qbitFiles()`, `qbitSetFilePriorities()`, `qbitStart()`
   and `qbitAwaitFiles()` each succeed in **both** modes. Reaching only `app/version` proves
   nothing about the endpoints acquisition actually uses.
10. A daemon that is running but has the WebUI disabled must surface the specific "WebUI not
    enabled" condition, distinct from "wrong credentials" and from "not running". qBittorrent
    refuses to start the WebUI at all when credentials are unset and logs
    `WebUI: Credentials are not set` — that state must be reported honestly, not as a timeout.

**Phase 9.2, 2026-08-18: gates 6 and 8 CLOSE against the real daemon. 7, 9, 10 stay open.**
**Amended 2026-08-19: gate 9 CLOSES. 7 and 10 stay open, both blocked on the user.**
Run through the live app (pid 31240, restarted onto `0ff6507a` first — the previous instance
predated `a3a361aa` and its main process had no `authMode`), driving `window.api.scraperQbitTest`
via `debug/p92-walk.js`. Non-destructive: no vault write, no settings write; wrong credentials were
passed **on the call** (`password` / `apiKey` on `ScraperQbitInput`) rather than stored.
**Control, verified before and after the run:** a no-credential request to
`127.0.0.1:8080/api/v2/app/version` returns **403**, and `X-Api-Key` returns **403** —
`LocalHostAuth=true` is genuinely in force, so a 200 means a credential actually authenticated.

| gate | result |
| --- | --- |
| **6** key mode, no password anywhere | **PASSES** — `connected`, v**5.2.3**, **185 ms**, `connection: connected`, `authMode: apiKey`, with `username: ''` and `passwordRef: ''` so nothing could fall back to a password |
| **7** password mode, no key anywhere | **BLOCKED, not failed** — `unauthorized` / "No password is stored for this account." in **9 ms**, never reaching the network. `scraperHasCredential` asked the vault directly: `qbit/apikey` **true**, `qbit/webui` **false**. Only the user has that password |
| **8** wrong key vs wrong password | **PASSES** — key: "qBittorrent rejected the API key.", `apiKey`, **1 ms**, one attempt, no retry. Password: "The username or password was rejected.", `password`, **71 ms**, a real login round-trip the daemon refused. Two distinct strings, two distinct `authMode`s, neither generic, neither a false success |
| **9** six operations, both modes | **CLOSED 2026-08-19 — 6 of 6 in both modes.** Was 1 of 6 in one mode. Five of the six are not on `window.api`, so the instrument is the product's own acquisition: `debug/qbit-basepath-proxy.cjs` grew a torrent lifecycle and `subtitleHarvestNyaaFetch` was driven end to end against it. **Key mode: 4 subtitle files, 1,825 ms, 11 stub requests, every one `served-by-key`, zero logins.** **Password mode: 4 files, 1,521 ms, 13 requests — 1 login, then 12 `served-by-session`, `served-by-key` count 0.** `qbitTransfers` completes the six in each mode: **1 row** off the stub. **CONTROLS**, same acquisition with a bad credential: wrong key → "qBittorrent rejected the API key.", wrong password → "The username or password was rejected.", **0 files each**, and the wire shows 2×403 and 2×`login-401`. Durable half `be52bc63`, 3 tests; mutation routing `qbitSetFilePriorities` around `authed()` reddens all 3 |
| **10** WebUI disabled | **not run** — the only honest instrument is disabling the WebUI on the user's own running client, which is their app, not ours |

Run control: a config naming a ref that does not exist (`qbit/does-not-exist`) refused in **0 ms**
with "No API key is stored for this connection." — the refusal path is reached, not skipped.

**Gate 9's instrument, so nobody rebuilds it.** No swarm traffic is involved: the magnet is a real
one off a real nyaa listing, but it is only ever handed to `/stub` as a string, and the stub
fabricates the file list and writes the four Japanese `.srt` files the fetch then reads off disk.
The one config that matters is `savePath: ''` — a non-empty one is forwarded to `torrents/add` and
the stub reports it back, so the fetch looks for files that are not there. `takeRememberedNyaaCandidate`
**removes** the id, so every fetch needs its own preceding listing.

**Open, and it is now the only thing between Phase 9.2 and closed: gates 7 and 10.** 7 needs the
user's own WebUI password; 10 needs the WebUI disabled on their own client. Both are recorded in
`needs-user.md`.

**Finding, from the same run — the password pill claims a credential the vault does not hold.**
`relay-probe` has `passwordRef: 'qbit/webui'` set while the vault has nothing behind it, and
`TorrentManagerPage.tsx:256` renders the credential pill from the **ref**, not the vault. In
password mode it would read "password stored" next to a connection test saying "No password is
stored for this account." That is the same false-honest-state family Phase 9.0 just fixed one
surface of, and the fix is available: `scraperHasCredential` already runs main handler
(`scraper/index.ts:244`) → preload (`preload.ts:2917`). ~~It is the next slice.~~
**FIXED 2026-08-18, `bd725520`** — struck 2026-08-19, because "it is the next slice" outlived
its own fix by a day and is exactly the kind of line a later turn re-implements. The pill now
asks the vault and carries four states plus `unknown` for a failed probe; see the same commit
in the gate 16 table below and the ledger entry "the credential pill's existence half".

Gate 9 has an instrument waiting: hash `07ea0e8a84626e1152a357ffab2da7be37abe57a` is in category
`jp-study-subtitles`, which only `qbitAddStopped` ever writes — so it is the **app's own** torrent,
paused at progress 1, and carries no user-chosen file priorities to clobber.

### Phase 9.3 — real acquisition gates (network side effects — attended runs only)

These download from a public swarm on the user's connection. **Never run unattended, and never as
part of an automated suite.**

11. Route A: a subtitle-only release under the 50 MB ceiling is taken whole, lands as a
    `SubtitleRecord`, and its cues render in the player through the same path a Jimaku subtitle
    takes.
12. Route B: a batch release fetches only subtitle files by per-file priority, with everything else
    set to skip; verify against `qbitFiles()` that no video file was ever requested.
13. A single-file MKV with an interleaved embedded track is refused rather than partially fetched.
14. The "don't touch a torrent the user already has" rule holds when the target hash is already in
    the session — verified against a real pre-existing torrent, not a fixture.
15. Interrupting an in-flight acquisition leaves no half-registered `SubtitleRecord` and no
    orphaned torrent in the `jp-study-subtitles` category.

**Gate 14 is BLOCKED, and 2026-08-19 measured why rather than assuming it.** It was nominated as
the one of 11–15 needing no swarm traffic. It needs no swarm — but it does need a real
pre-existing torrent that the product's own listing will hand to `nyaaFetchAll`, and there is
none. `nyaaFetchAll` only ever sees a candidate `rememberNyaaCandidates` stored, so the target
hash comes from nyaa; the only honest subject is a release nyaa and the user's client both know.
Cross-matched every real transfer against a live `scraperSearchTorrents` (`debug/g14-live.cjs`):
**7 transfers, 3 carry an infohash nyaa also returns.** Of those 3, the listing drops 2 before
they are candidates at all — `The Big O` (6 title-matched, all 6 dropped `shape`) and
`Date a Live II` (5 matched, 2 muxed + 3 shape, 0 candidates) — and the 1 that survives is
`07ea0e8a…`, which sits in `jp-study-subtitles` and is therefore the **`adopted`** branch by
construction, the opposite of what gate 14 asserts. So **0 of 7** can drive it.
Staging one is not available either: the app's own add always writes `jp-study-subtitles`, and
putting a torrent anywhere else — or moving that one out — needs the WebUI credential gate 7 is
already blocked on. A paused magnet cannot substitute: with no metadata the run never reaches the
priority check at all.
Also load-bearing for whoever unblocks it: **any real-daemon acquisition for a candidate other
than `07ea0e8a…` deletes that torrent and its files**, because `qbitReapSubtitleOrphans` sweeps
the app's own category minus the in-flight hash with `deleteFiles`. Those files are the MAL
plan's gate-31 evidence. Move it out of the category first, or drive the run through a mount that
refuses `torrents/delete`.
The durable half needs nothing: `subtitleNyaaFetch.test.ts` already asserts the refusal, **zero**
`filePrio` calls and unchanged priorities, with the `adopted` case and an identical-but-uncategorised
control beside it.

**Its side finding is FIXED, `31560cc2`** — see the ledger. The same run showed
`describeEmptyNyaaListing` explaining only its `muxed` bucket, so a title whose one matching
release was dropped for `shape` was told "No release on the index looks like it carries subtitles
for this title" while the index held that exact release.

### Phase 9.4 — portability gates (the "any user, not just this machine" requirement)

16. A clean profile with no vault entry, no key, and no qBittorrent configured shows an honest
    disabled state with a specific reason — the four-message availability guard already proven for
    nyaa must hold for every qBittorrent consumer.
17. A user who pastes only an API key reaches a working acquisition without ever seeing a
    username or password field.
18. A non-default host, port, and `basePath` (reverse-proxy style) work in both auth modes;
    `qbitBaseUrl()` is exercised with a non-empty base path.
19. Credentials survive an app restart and are readable only through the vault, never from a
    settings file on disk.
20. Every qBittorrent consumer is covered, not just nyaa: `subtitleNyaaSource.ts`,
    `subtitleDiscovery.ts`, `scraper/downloads.ts`, `scraper/torrents.ts`, `scraper/runtime.ts`,
    and the `TorrentManagerPage`, `MalDownloadDialog`, `NyaaSubtitleDialog`, and
    `ScraperSettingsDrawer` surfaces. A consumer left on the old auth path is an open gate.

**Phase 9.4, 2026-08-18: gate 16's front half CLOSES; 20's main-side half is measured.**

| gate | result |
| --- | --- |
| **16** clean profile, honest reason | **CLOSED 2026-08-18.** Front half `8910b778`: `nyaaAvailability` gained a fifth reason, `qbit-no-credential`, from a pure mode-aware `qbitCredentialGap()`. Before it, a profile with qBittorrent enabled and nothing ever entered passed the guard and refused four steps later inside `qbitAddStopped`. Surface half `029ace82` / `26d2fb2c` / `70efe13b` — all three remaining surfaces, below. Live: **8 configs through `subtitleHarvestNyaaList`, 8 different sentences**, including **CONTROL real profile → `ok=true`, 5 candidates** |
| **20** every consumer, not just nyaa | **CLOSED 2026-08-18.** Main side: all **14** qBittorrent API calls in `scraper/qbittorrent.ts` go through `authed()`; the only direct `scraperRequest` calls are `login()` (password mode by design) and `authed`'s own `send`. `subtitleNyaaSource.ts`, `subtitleDiscovery.ts`, `downloads.ts`, `torrents.ts`, `runtime.ts`: **zero** matches for `passwordRef\|apiKeyRef\|authMode\|username\|password` — they hand over `{ config }` and let `authed()` pick the mode. All four surfaces now covered: `TorrentManagerPage` `bd725520`, `MalDownloadDialog` `029ace82`, `ScraperSettingsDrawer` `26d2fb2c`, `NyaaSubtitleDialog` `70efe13b` |
| **17** key only, no username/password field | **CLOSED 2026-08-19.** Was FAILING: `SCRAPER_FIELDS` had no way to say a field belongs to one auth mode, so Username, Password and API Key rendered together under a select whose own hint says the unselected mode "is ignored, not used as a fallback". `a1455718` adds `ScraperFieldDef.onlyWhen`. Live on `relay-probe` in key mode: rendered labels are **API Key present, Username absent, Password absent**; **CONTROL** — the same drawer flipped to password mode through its own select renders the **exact inverse** (Username ✓ Password ✓ API Key ✗). Key-only reaches a working client, not just a green dot: **7 real transfer rows** off the user's own daemon via `scraperQbitTransfers`. Settings restored **byte-identical**, 70,179 bytes, `restoredExactly: true` |
| **18** non-default host/port/basePath, both modes | **CLOSED 2026-08-19.** Instrument `debug/qbit-basepath-proxy.cjs` — `/qb/*` passthrough to the real daemon, `/stub/*` a stand-in implementing the measured contract, anything else 404. **10 of 10 rows as expected.** Row 1 is real end to end: key mode, `127.0.0.1:8781/qb`, app resolved the key from the vault → **qBittorrent 5.2.3**. **CONTROLS**: same port, empty basePath → "answered 404 to the version request"; `/wrong` → 404 with the wrong prefix arriving intact at the proxy; password mode with empty basePath → "answered 404 to the login"; wrong password → "The username or password was rejected". `qbt` and `/stub/` both normalize and connect. Wire log reconciles exactly at **23 requests**. Durable half `e64bd6d0`, 10 tests; mutation on `qbitBaseUrl` reddens exactly the 8 positive ones |
| **19** survives restart, vault-only | **CLOSED 2026-08-19.** Sentinel written through `scraperSetCredential` → "Stored in OS-protected storage."; app killed (pid 29180 → 25036); still `true` after. **59 files** scanned under userData (root + Local/Session Storage + `credentials.dat`), UTF-8 **and** UTF-16: the secret is in **NOTHING**, `credentials.dat` included, so it is encrypted at rest. **CONTROL** — the same scanner over the same files finds `jp-scraper-settings-v1` in 2 leveldb files, and finds the *ref* `relay/gate19` in plaintext inside `credentials.dat` while the secret it names stays unreadable. Settings document: **13 `passwordRef`, 13 `apiKeyRef`, 0 bare `password`, 0 bare `apiKey`** across 70,179 bytes. **CONTROL** — a ref never written answers `false`. Strongest row: the **real** API key, entered 2026-08-15, authenticated against the live daemon on a brand-new main process |

**Phase 9.4 is COMPLETE — 5 of 5 gates (16–20) closed.** Gates 1–10 and 16–20 are the plan's
own CI-or-live exit condition for Track 9; 11–15 remain attended.

Gate 16's surface half, per surface:

| surface | what was wrong | evidence |
| --- | --- | --- |
| `MalDownloadDialog` | offered qBittorrent from `enabled && host.trim()` alone, then refused every row of the batch | `029ace82`. 4 tests; mutation control reddens exactly the 2 negative ones |
| `ScraperSettingsDrawer` | Password/API Key rows were `kind: 'status'`, which prints the `*Ref` verbatim — **byte-identical output for a vault answering yes and one answering no** | `26d2fb2c`. New `kind: 'secret'` reusing `credentialPresence.ts`. Live on `relay-probe`: `qbit/webui` false → "password missing from OS storage" `rgb(209,52,56)`; `qbit/apikey` true → "API key stored" `rgb(56,178,107)`, one screen, its own control. 6 tests; mutation reddens all 6 |
| `NyaaSubtitleDialog` | **nothing** — already passed main's `message` through. Proof, not a fix | `70efe13b`. 5 tests, the first coverage this surface has had |

Honest limit: `listNyaaSubtitles` is unmeasurable live here — its media-item guard fires before the
credential check and the library holds **20 books, 4 manga, 0 video**. The shared `nyaaAvailability`
both surfaces consume is what the 8-config table measures.

**That run's open finding is FIXED, `a6666501`, 2026-08-19.** A structurally-valid but incomplete
`torrents` block passed `asNyaaAcquisitionConfig` (`typeof === 'object'` only) and then threw in
`searchTorrents` at `input.torrents.extraTrackers.filter(...)`; `listNyaaHarvest` caught it and
printed **"Cannot read properties of undefined (reading 'filter')"** as the reason the search found
nothing — reproduced live before the fix. The guard now requires the five lists the pipeline indexes
into plus a finite `minSeeders`. Live after: both a gutted block and one missing only `extraTrackers`
refuse with "No scraper configuration was supplied."; **CONTROL** — the real profile still lists
1 candidate. Both fixtures for this guard were fictional (`maxSizeBytes`, `preferredResolutions`,
`blockedGroups`, `maxSizeGb` are not `ScraperTorrentSettings` fields), which is why it tested green.

Related defect fixed the same day, `bd725520`: the Torrent Manager credential pill rendered from the
settings **ref** rather than the vault, so a non-empty `passwordRef` over an empty store painted
"password stored" in green. It now asks `scraperHasCredential` and carries four states plus an
explicit `unknown` for a failed probe. Measured live: pill read "password missing from OS storage",
`scr-pill--bad`, with `passwordRef: 'qbit/webui'` set and the vault answering false.

### Exit condition

Gates 1–10 and 16–20 pass in CI or against a live daemon with the 403 control passing. Gates 11–15
are attended and signed off once by the user. Until then the nyaa provider stays default-disabled
and last in priority, as it ships today.

**Track 9 standing, re-derived 2026-08-19 from the phase tables above, not inherited: 13 of 15
non-attended gates closed** (1–5 in 9.1, 6/8/9 in 9.2, 16–20 in 9.4). The two that are not are
**7** and **10**, and neither is agent-work: 7 needs the user's own WebUI password in the vault,
10 needs the WebUI disabled on their own running client. Both are in `needs-user.md`, and gate 7's
blocker was **re-checked live this turn and is still in force** — `scraperHasCredential('qbit/webui')`
answers **false** on pid 5004. Gates 11–15 are the attended set; 14's own blocker is measured above.
So Track 9 is **complete-except-external**, and nothing in it is a next slice for an agent.

## Dependency order

1. Fresh main-tree audit, baselines, ownership map, and evidence ledger.
2. Credential/provider foundation and dictionary migration/service correctness.
3. Lexicon Workbench and its grounded AI capabilities.
4. Central AI Agent foundation and main Study OS surface, reusing the Lexicon and existing tool infrastructure.
5. Unified Reading workspace.
6. ReadingLens completion using shared Lexicon, Agent, and Reading components.
7. Media shell repair, then the feature-complete and visually approved Liquid Video pilot.
8. Remaining confirmed main-app items, including the required Anki Deck Workbench, so the transformation targets stable contracts.
9. qBittorrent API surface: the credential contract in Track 9 Phase 9.0, then its verification phase. This gates the nyaa subtitle acquisition and every other qBittorrent consumer, and it is the only remaining item whose acceptance needs an attended run with real network side effects.
10. System-wide Liquid Workplace rollout in the L5–L11 waves defined by its dedicated plan.
11. Fresh v1.0 audit, parity-ledger closure, full regression gates, and complete Standard/Liquid/theme visual verification matrix.

Independent Media-shell work may run alongside Dictionary/Lexicon after the audit, but live Electron verification must be serialized to avoid misleading evidence.

## Luna Max delegation

- Delegate only to exact `gpt-5.6-luna` with maximum thinking; do not substitute another agent/model.
- Good bounded assignments: read-only source census; Dictionary/Lexicon slice; central Agent architecture or a bounded capability adapter slice; Reading workspace; ReadingLens; Media/Liquid; final visual audit.
- At most two Luna Max tasks concurrently. Electron live-verification tasks run one at a time.
- The primary session owns worktree reconciliation, shared contracts, final review, tests, evidence, and every commit.

## Release-level verification

- Run targeted tests with each slice, then the full test suite and all existing architecture/i18n/structural gates.
- Compare TypeScript and other known global failure baselines before and after.
- Verify cold start, restart persistence, empty/loading/error/offline/no-key/invalid-key/cancelled states, large data, keyboard-only operation, reduced motion, and clean-profile behavior.
- Visually inspect every primary route and every material state at compact and large desktop sizes. Check clipping, overflow, empty canvases, broken covers, density, focus, hierarchy, contrast, typography, and consistency.
- Use only MCP/debug bridge state plus in-app Browser DOM/Playwright evidence. Record screenshots/selectors and observable state transitions.
- A feature is not finished until its source contract, automated tests, live behavior, and visual presentation agree.

### Track 5 bullet 8 — privacy/retention closes (2026-08-21, `80e72e51`)

The bullet names five things: privacy/retention, OCR/model defaults, shortcuts, keyboard-only
use, and honest offline/cloud indicators. **Keyboard-only use** closed at `4e7817ff`; **shortcuts**
ship with it. **Privacy/retention** closes here.

The capture history had a *size* bound only (`READING_LENS_HISTORY_LIMIT`, 200 entries), which
cannot promise a user that what they read is gone by a given day. `shared/readingLensHistory.ts`
now carries a time bound — 1/7/30/90 days, or `0` for the rolling limit alone — pruned on **load**
as well as on capture, with pinned entries exempt at every window, surfaced in
`ReadingLensSection.tsx` and reached over `lens:history:{get,set}Retention`.

Two decisions taken under standing auto-approval, both reversible and both recorded in the
evidence ledger with their tradeoffs: `0` is the **default**, because turning a real bound on at
upgrade would delete history the user never agreed to lose; and an unrecognised value on disk
falls back to that default rather than the nearest offered choice, because the file is
user-writable JSON and rounding a typo'd `3` to `1` would delete two days.

Measured live on the real store (41 entries, 2 pinned, ages 0.163–1010.291 days), 6/6 gates,
including the pin exemption holding for a **1010-day-old** entry at a 1-day window and a negative
control in which `setRetention(3)` removes **0** rather than clamping. The store was restored
byte-identical afterwards.

**Bullet 8 remainder: OCR/model defaults, and honest offline/cloud indicators.** Both live in
`ReadingLensSection.tsx` and `main/screenOcr.ts`; nothing has yet checked whether the lens
reports which engine actually ran or whether any of it leaves the device.

### Track 5 bullet 8 CLOSES (2026-08-21, `3ce6a412` + `2006027f`)

Its remaining two things land together, because they are one question asked twice: *which*
recognizer reads the crop, and *where* that reading happens.

**OCR/model defaults.** `defaultEngine` (`auto` / manga / printed) joins the lens settings, is
persisted in `reading-lens.json`, and rides into the overlay on `LensInit` — not over a second
IPC, because the lens window is created and scanning in the same tick as the hotkey and an
awaited value would leave the first capture of every session on `auto`. It replaces the four
hardcoded `engine: 'auto'` sites in `ReadingLensOverlay.tsx`. `lens:ocrEngineStatus` reports
which model packs are installed, read **live** on every call, so Settings warns about an engine
that cannot run — and warns only about the **selected** one, since `auto` works whenever either
recognizer is present.

**Honest offline/cloud indicators.** `shared/readingLensEngine.ts` records a
`processing: 'device' | 'network'` per engine and the settings claim is **derived** from that
table, so adding a cloud recognizer withdraws the label rather than inheriting it. The claim is
also scoped in the UI: recognition is local, and sending a capture to the Agent is named as a
separate action that does leave the device on a cloud provider.

Measured live after a restart, 7/7, including the pre-restart negative control (the preload
binding present while main rejected `No handler registered`), three unknown values falling back
to the default rather than to a neighbour, and a byte-identical store restore.

Track 5 is now **7 finished / 1 partial**; Tracks 1/4/5/6 = **24 finished / 1 partial /
4 deferred = 29**. The single remaining Track 5 partial is bullet **2** — alternate OCR
candidates and the mixed-panel line-order model. Counted one bullet line at a time.

### Track 5 bullet 2, first half — alternate OCR candidates (2026-08-21, `b9c4eea7`)

`auto` ran BOTH recognizers whenever `shouldTryMangaOcr` fired and discarded the loser, so
disagreeing with the pick cost a whole second OCR pass for a read that already existed. The loser
now rides back as `alternate` (`AutoOcrResult` → `LensOcrResult`) and the Lens's existing
engine-swap button spends it instead of re-scanning — same control, dotted underline, tooltip
saying "already read, no re-scan". The swap parks the outgoing read as the new alternate, so it is
its own undo, and re-records history under the same hash, which replaces the row rather than
adding a second for the same pixels.

Live, after a restart: manga fixture page-2 at 212x300 → general read 22 chars of garbage,
`hasAlt:true altEngine:manga altText:'そうして、'`, box `[0,0,212,300]` in region-relative DIP. Two
clean single-engine reads returned `hasAlt:false` as the negative control.

The live pass also found and closed a defect in the same commit: the carry guard dropped only
EMPTY losers, so manga-ocr's `．．．` on a 96 px `猫だ` — 0.0 Japanese, already rejected by
`pickBetterRead` — was being offered as a one-click swap. The bar is now `mangaReadIsUsable`,
extracted from `pickBetterRead` so the two cannot drift.

Track 5 stays **7 finished / 1 partial**: bullet 2's remaining half is the mixed-orientation panel
line-order model (`readingLensLineOrder.ts:113` fails open to provider order deliberately, and its
header says why). Tracks 1/4/5/6 unchanged at **24 finished / 1 partial / 4 deferred = 29**.

### Track 5 bullet 2 CLOSES — mixed-orientation panel order (2026-08-21, `dc760b38` + `0869bd89`)

A mixed capture kept provider order because no panel rule existed. There is one now: same-orientation
lines within a glyph-size merge into a block, each block is ordered by the existing single-axis rule,
and blocks read in bands top-to-bottom — right-to-left when the page runs vertically, left-to-right
when it does not, weighted by how much text runs each way rather than by line count.

It stays narrow. Four fail-open guards: overlapping blocks, an exact tie in direction, unusable
geometry, and a band that is not a clique. The clique guard is the one desk work missed — the band
sweep merges transitively, so a tall column spanning two stacked captions bands all three and orders
them purely across the page, and the lower caption wins on x by one pixel. Live boxes are in the
ledger and in the test. A second guard closed a regression this would otherwise have caused: both
engines derive `vertical` from the box aspect ratio, so a lone square 。 no longer votes on whether
the capture is mixed.

Live, after two restarts: the mixed fixture returned **3 lines, 2 horizontal + 1 vertical**, so mixed
output is reachable and the rule is not dead code. Each of the four guards was mutation-checked —
disabling one fails exactly one test.

**Open follow-up, pre-existing and not caused here:** paddle emits a caption at y=183 ahead of one at
y=103, and a mixed capture fails open rather than correcting it, so a *same-orientation* mis-order
inside a mixed capture is currently unreachable by this rule.

Track 5 is now **8 finished / 0 partial**; Tracks 1/4/5/6 = **25 finished / 0 partial /
4 deferred = 29**. Counted one bullet line at a time.

### Track 3 — the Agent's operation record becomes durable (2026-08-21, `422df210` + `ee28eac1`)

The trust bullet asks for "controls for memory scope, retained chats, sensitive-context exclusion,
**history deletion**, provider budgets, and automation schedules". History deletion had nothing to
delete: `agentOperationLog.ts` is per-window and dies with it.

`shared/agentOperationHistory.ts` is the durable half, carried as a fifth section of the main-owned
operational document rather than a fifth store — additive, optional, and riding the existing
normalize/prune path, so main needed no source change. Undo stays session-only on purpose: a log
restored from disk cannot honestly answer the supersede question for writes made while the app was
closed, so the persisted row deliberately is not shaped to be replayed. `arguments` are dropped on
the way to disk. Bounds are 500 rows and 90 days, with deletion — exact and immediate — as the
control instead of a retention dial.

Surfaced as a Settings > Memory card beside the agent-memory card it is the audit twin of, with the
delete control and its confirmation, in en/ja/zh/ru, and registered in `SETTINGS_REGISTRY`,
`AGENT_SETTINGS_GUIDED_TARGETS` and `AGENT_NAVIGATION_INDEX` so the settings search actually reaches
it.

Track 3 remains **partial** against its full acceptance — this closes one named trust control, not
the track. What it does not yet cover: memory scope, retained-chat controls, sensitive-context
exclusion, and provider budgets, all from the same bullet.

**Superseded 2026-08-22.** All four named above have since closed, and so has the sixth: memory
scope, retained chats and sensitive-context exclusion at 2026-08-11/12, provider budgets at
`c77fee80`/`eef593fc` (enforcement) and `52cb568c` (the dial a user can reach), automation
schedules at `1f73d808`. The trust bullet's six controls are **6 of 6**, counted against the names
the bullet itself lists. Track 3's only remaining "still open" note is that animation level
*Reduced* does not reach `.agent-root`, which is believed to be the design and whose ambiguity
lives in another track's files.
