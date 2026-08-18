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
  it). **Still open**: the product decision on whether the session-only
  activity/operation history becomes durable;
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
  paid in one session"). **Still open**
  from this bullet: automations, whose created entry freezes
  `effectiveAgentPermission` at creation time, which is a product decision
  rather than a missing writer;
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
  **Still open** from this bullet: animation level *Reduced* does not reach this
  surface, believed to be the design (`motion-system.css:216` calls Performance
  the mode "where purposeful transitions still run"), and the inconsistency that
  makes it ambiguous lives in another track's files.

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

## Track 6: repair Media shell, then prove the Liquid Video pilot

- Treat the current workspace screenshot state as a release-blocking regression: no sidebar, search, discovery, or useful library structure and a giant empty canvas.
- Restore one coherent Media shell with sidebar, global search, Library, Discover, Study, Readiness, Review, Music, Settings, imports, filtering, sorting, queues, details, and player access.
- Clearly integrate local and Seanime-backed libraries rather than hiding the mature shell behind a stripped overlay.
- Then complete the first full Liquid Video pilot under `LIQUID_WORKPLACE_TRANSFORMATION_PLAN.md`: real playback, subtitle discovery/versioning, dual subtitles, transcript, dictionary, translation, AI, mining/card editor, layouts, customization, detach/reattach, multi-monitor placement, restored bounds, persistence, errors, and performance.
- Use `renderer/assets/concepts/liquid-workplace-video-concept-v1.png` for hierarchy, density, and selective-material intent, not as a literal feature or data specification.
- Keep conventional windows as the default. The same complete Media/Video feature set must work in Standard and explicitly enabled Liquid presentations.
- Do not call the player a system pattern until it has passed the full visual matrix and the user has approved it.

## Track 7: remaining main-app completion

- Reconcile and finish all still-open non-Mobile, non-Noctis v1 features after re-deriving their state.
- Include known architecture, grammar, settings/help, storage-hardening, scraper, subtitles, resources, VN, manga, Anki, multi-monitor, visual, and stale-document discrepancies only when source/live evidence confirms they remain open.
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

### Exit condition

Gates 1–10 and 16–20 pass in CI or against a live daemon with the 403 control passing. Gates 11–15
are attended and signed off once by the user. Until then the nyaa provider stays default-disabled
and last in priority, as it ships today.

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
