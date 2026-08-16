# Anki Deck Workbench Plan

**Status:** required Main V1 Track 7 product slice  
**Goal:** turn the existing import, Flashcards, known-word, frequency, and AnkiConnect pieces into one intuitive, demonstrable, full-fidelity deck editing workspace.

This plan is authoritative for the Anki editing workbench. The generic Anki bullet in the Main V1 plan is not complete until the acceptance gates at the end of this document pass.

## Current source-derived baseline

The repository already has useful foundations, but not a deck editor:

- `.apkg` import currently maps selected note fields into the app's simplified `word`, `reading`, `meaning`, `sentence`, deck, and tag shape. It does not preserve enough of the note/card/template/scheduler model for safe round-trip editing.
- AnkiConnect currently supports connection checks, deck/model discovery, limited note creation/deletion, searches, note/card reads, and media storage. It does not yet expose the mutation surface required for bulk field, tag, flag, deck, template, or scheduling edits.
- The local deck model already carries frequency, JLPT, known state, and a small local SRS state. Local ratings are presently only `Again` and `Good`, rather than Anki's `Again`, `Hard`, `Good`, and `Easy` choices.
- Flashcards already supports basic import/export, folders, search, card editing, review, and known-word integration. The Anki surface is primarily a connection/card-composition flow, not a large-deck workbench.

Do not declare this plan complete by pointing to those foundations. Re-derive each capability from source and live behavior.

## Product contract

The workbench is a reversible staging area between a source deck and a committed result. A user can import a package or inspect live Anki, filter any subset, compose several edits, inspect exact before/after results, and then export or commit the validated change set.

Use Anki terminology accurately while keeping the interface approachable:

- A **note** owns fields such as Expression, Reading, English, and Russian.
- One or more **card templates** render fronts and backs from those note fields.
- Swapping two note fields and swapping a card template's rendered front/back are different operations. Offer both, explain the difference in preview, and never silently apply one as the other.
- Anki review ratings are `Again`, `Hard`, `Good`, and `Easy`. App labels such as `Known`, `Very good`, or `Bad` are named mastery or scheduling presets with a visible mapping; they must not masquerade as Anki review history.
- A lower frequency rank means a more frequent word. Every frequency condition must spell out its meaning, for example `rank <= 5,000 (top 5,000 / more frequent)`.

“Full-fledged Anki editing” means an explicit compatibility matrix for supported Anki Desktop core operations. It does not mean silently editing Anki's database or pretending to support arbitrary add-ons. Unsupported core operations remain release blockers for this plan unless an honest, tested adapter or package round-trip is supplied.

The capabilities named in this document are a **minimum, not a closed feature list**. Phase 0 must inventory the full supported Anki version across its editor, Browser/search, note types and fields, templates and card generation, deck organization, import/export, media, review state, scheduler, deck-option presets, filtered/custom study, and recovery operations. Each capability is tracked as `supported`, `read-only`, `blocked with reason`, or `add-on/custom behavior`. When Anki adds a relevant core feature, the matrix and plan must be updated rather than treating this numbered document as a ceiling.

## Supported sources and fidelity

### Source adapters

1. `.apkg` package import into an isolated draft.
2. Live Anki collection through AnkiConnect, with connection/version/capability discovery.
3. CSV/TSV import with saved field-mapping presets.
4. The app's local Flashcards and known-word stores.
5. Export to a new package or a validated live-Anki commit; never overwrite the only source copy by default.

Evaluate `.colpkg` during the capability audit. Add it only if full collection semantics, media, and recovery can be guaranteed.

### Normalized draft model

Preserve, rather than flatten:

- source and stable provenance identifiers;
- deck hierarchy, note type, all ordered raw fields, tags, flags, and marks;
- the note-to-card relationship and every card template's front, back, CSS, and browser preview;
- card IDs, note IDs, ordinals, queue/type, due data, interval, ease, lapses, repetitions, suspension/bury state, and available review history;
- media references, filenames, checksums, and missing-media diagnostics;
- original raw values plus normalized searchable values;
- import warnings and every unsupported source feature.

The draft records a source fingerprint. A live commit must re-read affected notes/cards and refuse or rebase conflicts if Anki changed after the preview was created.

## Interaction design

### Workspace layout

Build a dedicated **Deck Workbench** destination reachable from both Flashcards and Anki:

- **Source rail:** package/live collection, deck tree, saved filters, and change sets.
- **Stable high-contrast data grid:** virtualized notes/cards with configurable columns, inline edit, multi-select, sorting, grouping, and keyboard range selection.
- **Context inspector:** rendered front/back, raw fields, note/card relationship, scheduling facts, media, and validation issues.
- **Change tray:** ordered batch actions, affected count, conflicts, warnings, undo, dry run, export, and commit.

Use Liquid UI selectively for navigation, contextual tools, transitions, and the inspector. The large editing grid must remain a calm, readable anchor surface. Preserve focus order, shortcuts, reduced motion, screen-reader labels, and usable targets at compact, default, and maximized sizes.

### Numbered guided flow

Keep one visible, resumable stepper so a new user always knows where they are:

1. **Choose source** — import a deck, connect live Anki, open a local deck, or use the demonstration deck.
2. **Browse and select** — search, filter, inspect, and confirm which notes/cards will change.
3. **Add and enrich** — pull dictionary data, generate reviewed AI additions, or merge another source.
4. **Fields and design** — add/reorder fields and Browser columns, map content, and customize card templates/layout.
5. **Learning rules** — choose known/mastery labels, frequency rules, tags, deck options, and scheduling changes.
6. **Review examples** — inspect representative cards, edge cases, diffs, conflicts, costs, and a complete dry run.
7. **Apply or export** — commit to live Anki or create a new package, then verify by reading it back.

Each step shows a short outcome sentence, affected count, validation status, and safe Back/Next controls. Back never loses work. Advanced users may jump between completed steps, but the interface must not scatter required decisions across unrelated popups.

### Smart deck Browser

The Browser is both a fast editor and the selection engine for all recipes:

- offer spreadsheet, compact list, and rendered-card gallery modes over the same selection;
- combine normal text/Anki-query search, faceted filters, saved searches, and optional semantic search;
- let the user add, hide, reorder, pin, resize, and save Browser columns independently from adding fields to an Anki note type;
- show expandable note rows with every generated sibling card and its scheduling state;
- flip cards in place and compare front/back, note fields, source data, and proposed output without leaving the Browser;
- build representative sample sets from first/random cards plus empty, longest, media-heavy, cloze, sibling, conflicting, and validation-failing cases;
- preview desktop, compact/mobile, light, dark, and app-theme rendering where the template supports it;
- keep selection and scroll position stable while switching views or editing filters.

### Two levels of control

- **Quick recipes** cover common tasks with plain-language controls and a live preview.
- **Advanced rules** expose nested `AND`/`OR`, field and scheduler predicates, regex, ordered transformations, and saved reusable recipes.

Every empty state ships with a local demonstration deck. A user must be able to explore filtering, swapping, translating, and scheduling previews without connecting a real collection. Demonstration mode is clearly labeled and never reports a real export or Anki commit.

## Query and selection engine

Filters must work across:

- deck/subdeck, note type, card template, and any note field;
- exact, contains, missing, regex, script/language, duplicate, and near-duplicate text;
- tags, marked state, flags, suspended/buried state, new/learning/review/relearning state, due range, interval, ease, lapses, and leech status;
- frequency rank/range/source, JLPT level, word type, proper-name status, and missing-frequency policy;
- local known/mastery level, app review history, Anki interval/rating evidence, and user-selected precedence when the sources disagree;
- missing audio/image, broken media references, sentence availability, and source provenance.

Selection semantics must distinguish `visible rows`, `selected rows`, and `all matching rows`. Before applying a batch action, show the exact total and keep it stable even when the grid is virtualized.

## Editing and batch actions

### Fields, templates, and language

- Swap rendered front/back for selected card templates.
- Swap, copy, move, merge, split, add, rename, reorder, or clear note fields with a schema migration preview.
- Map any source field to Japanese, Russian, English, reading, sentence, hint, or custom fields.
- Translate a chosen field into Japanese, Russian, English, or another configured language; preserve the original by default and show provider, privacy, cost, and offline/cloud status before work starts.
- Apply HTML cleanup, whitespace and Unicode normalization, regex replacement, kana/romaji conversion, furigana generation/removal, and reading repair.
- Edit and preview template HTML/CSS against representative notes and every generated sibling card.
- Detect empty rendered sides, unresolved template fields, malformed cloze syntax, and script/language mismatches before commit.

### Dictionary and AI enrichment

- Browse all configured app dictionaries through the existing Lexicon/dictionary service and map selected data into new or existing Anki fields.
- Support headword, alternative spellings, readings, ordered senses, translations, part of speech, usage/register notes, pitch accent, frequency values and sources, JLPT/level metadata, kanji details, example sentences, audio, images, and source attribution whenever the underlying dictionary legally and technically provides them.
- Let the user choose one dictionary, source priority, or a merged result. Show conflicting values side by side and use explicit `keep`, `replace`, `append`, `fill empty`, `best ranked`, and `manual review` policies.
- Add dictionary fields/columns to a note type in bulk and update its templates in the same reviewed change set; never dump every available property into an unreadable card by default.
- Generate optional AI translations, natural example sentences, sentence translations, reading aids, concise definitions, mnemonics, usage notes, grammar explanations, cloze candidates, hints, distractors, and other user-defined fields.
- Generate several alternatives where useful and let the user approve, edit, regenerate, or reject per card or in batches. Apply language, length, difficulty, politeness, target-word, and duplication constraints.
- Ground dictionary-derived facts in the selected source and retain per-field provenance. Mark AI-generated content separately; do not present generated examples or definitions as dictionary quotations.
- Cache/reuse identical enrichment requests, support cancellation and bounded concurrency, and show provider, model, privacy, network, cost estimate, progress, failures, and retry scope before and during generation.

### Card and note-type designer

- Add, remove, rename, clone, and reorder note fields with reserved-name and data-loss validation.
- Add/remove/clone/reorder card types, including forward, reverse, optional reverse, typed-answer, cloze, and supported image-occlusion designs.
- Provide an intuitive block/layout designer for common content, conditionals, labels, audio, images, hints, and answer sections, plus a synchronized expert HTML/CSS editor.
- Customize fonts, sizes, spacing, colors, alignment, front/back structure, browser appearance, night-mode rules, responsive behavior, and per-language typography through reusable style presets.
- Update the preview continuously against the representative sample set, not just one ideal card. Show exactly which cards would be created, become empty, become duplicates, or change appearance.
- Make every schema/template change reversible in the draft and warn about its effect on generated sibling cards and existing scheduling.

### Organization and metadata

- Add/remove/replace/normalize tags; map app labels to tags only through an explicit preset.
- Move or copy notes/cards between decks where Anki semantics allow it.
- Change note type using an explicit field/template mapping.
- Set/clear flags and marked state.
- Suspend/unsuspend, bury/unbury where supported, and identify leeches.
- Find exact and normalized duplicates, compare them, then merge or delete only through a recoverable reviewed change set.

### Mastery and scheduling

- Expand local review controls to `Again`, `Hard`, `Good`, and `Easy` with tested migration from the existing two-rating state.
- Let users define named mastery presets such as `Bad`, `Learning`, `Good`, `Very good`, and `Known`; display the precise local and Anki effects of each preset.
- Batch-set local known/mastery status independently of Anki scheduling.
- Support core Anki scheduling operations through tested capabilities: review rating where valid, forget/reset, reschedule/set due, new-card position, interval/ease changes, suspend/unsuspend, and deck-option assignment.
- Manage deck-option presets and overrides, including daily new/review limits, learning and relearning steps, insertion/gather/sort/display order, maximum/minimum intervals, leech handling, sibling burying, audio/timer behavior where supported, and filtered/custom-study settings.
- Treat legacy scheduling and FSRS as different validated modes. For FSRS, include desired retention, parameters/optimization status, historical retention, ignore-before date, and reschedule-on-change impact; show a workload estimate and a high-impact warning before a bulk reschedule.
- Validate minimum/maximum values, time units, timezone behavior, learning states, sibling effects, and scheduler-version compatibility.
- Never fabricate review log entries or write directly to `collection.anki2`. If a desired scheduler mutation is unavailable through the supported adapter, explain it and keep Apply disabled for that action.

## Smart recipe library

Ship at least the following working, tested recipes; they are product features, not placeholder menu entries. This is the initial catalogue, not a cap: users can save new recipes from any supported filter/action pipeline, and later workers may add reusable actions without redesigning the workbench.

1. Swap front and back, with note-field and rendered-template variants.
2. Translate Back to Japanese, Russian, English, or a configured language while retaining the original.
3. Exclude words already known locally, in Anki, or in either source using explicit precedence.
4. Select `rank <= N` or `rank > N` with a plain-language frequency explanation.
5. Map frequency bands to named mastery/scheduling presets, for example top 5,000 -> `Very good`.
6. Prioritize high-frequency unknown words without changing known cards.
7. Fill missing readings or furigana, with confidence and manual-review thresholds.
8. Detect wrong-language or wrong-script content in a chosen field.
9. Find exact/normalized/near duplicates and propose a canonical note.
10. Rescue leeches by adding hints, sentences, or a slower scheduling preset.
11. Find missing, broken, duplicate, or oversized media.
12. Normalize inconsistent tags and deck paths.
13. Split a deck by JLPT level, frequency band, source, or mastery.
14. Merge glossary data from a secondary deck without overwriting stronger fields.
15. Identify empty backs, identical front/back renders, and broken templates.
16. Find sentence cards missing the target expression or reading.
17. Audit sibling cards and remove unintended duplicate templates.
18. Find stale cards by last review/due state and preview reset or reschedule options.
19. Generate cloze candidates from selected sentence fields with a review step.
20. Restore source context such as sentence, title, timestamp, screenshot, or URL when provenance is available.
21. Enrich selected notes from one or more dictionaries using visible merge precedence.
22. Generate and approve level-appropriate AI example sentences and translations.
23. Generate mnemonics, hints, grammar notes, clozes, and distractors into separate fields.
24. Create or clone a note type, add dictionary/AI fields, and apply a matching card-design preset.
25. Audit the representative preview set for clipping, unreadable styling, broken media, and light/dark/mobile differences.
26. Compare current scheduling with a proposed deck preset or FSRS desired-retention change and estimate workload impact.

The recipe system must be extensible without creating a separate one-off code path for every recipe. Each recipe compiles to the same filter, transform, validation, preview, and change-set primitives.

## Safe batch workflow

Every mutation follows the same pipeline:

1. Select a source and create or resume an isolated draft.
2. Build a filter and show matching, excluded, missing-data, and conflict counts.
3. Add one or more ordered actions to the change tray.
4. Compute a dry run outside Electron's main event loop.
5. Show representative before/after front and back renders plus a field/schedule diff.
6. Validate templates, media, values, unsupported actions, and live-source conflicts.
7. Apply to the draft; allow step-level undo/redo and action reordering.
8. Export a new artifact or commit a bounded change set to live Anki.
9. Re-read the target and verify counts, values, renders, and scheduler state.
10. Store a compact audit journal sufficient to understand and, where the adapter permits, reverse the commit.

Partial failure must identify exactly what committed, what failed, and what can be retried or reversed. Do not display success from optimistic renderer state.

## Architecture and performance

- Put normalized types, validation, filter evaluation, transformations, and deterministic change-set generation in shared pure modules.
- Keep package parsing, indexing, translation batches, media hashing, large diff generation, and commits in a worker or safely chunked child process. Never run them on Electron's main event loop.
- Add versioned IPC contracts across shared types, main handlers, preload, renderer consumers, and focused tests.
- Stream or page large results and virtualize the grid. Avoid sending whole large decks repeatedly over IPC.
- Target smooth filtering and selection on a 100,000-note fixture, bounded memory, cancellable long operations, and resumable drafts.
- Use a transaction journal/delta snapshots, not unbounded full copies of every imported package.
- Persist field mappings, saved filters, recipes, column layouts, and draft metadata with migrations, validation, reset behavior, and round-trip tests.
- Add all shared chrome and status strings through the existing EN/JA/ZH/RU i18n catalogs.

## Delivery sequence

### Phase 0 — capability and fidelity contract

- Inventory current APKG, local deck, known-word, frequency, SRS, AnkiConnect, media, and export behavior from source and live probes.
- Publish a tested compatibility matrix for Anki version, AnkiConnect actions, package features, scheduler operations, and unsupported add-on data.
- Create mixed-language, multi-note-type, multi-template, media, cloze, scheduling, and corrupt-data fixtures.
- Freeze the normalized draft and reversible change-set contracts before building the UI.

### Phase 1 — loss-aware import and drafts

- Import APKG, CSV/TSV, local decks, and live Anki into the normalized model.
- Preserve raw fields and provenance, surface unsupported data, autosave resumable drafts, and prove cancellation/recovery.

### Phase 2 — workbench shell and single edits

- Build the seven-step guided flow, smart virtualized Browser, source rail, inspector, real representative template preview, column manager, search, selection, and accessible keyboard flow.
- Support safe single-note/card field, tag, deck, and local-mastery edits.

### Phase 3 — rules, changes, and recovery — built 2026-08-15

- Build nested filters, saved views, the ordered change tray, deterministic dry runs, validation, diff previews, undo/redo, and audit journal.
- Prove stable `all matching` selection across paging and virtualization.
- Shipped: `shared/ankiChangeTray.ts` (tray, dry run = apply, one tray = one undo), `shared/ankiBrowserQuery.ts` (nested AND/OR/NOT grammar; an unrecognized key is a refusal that names the token, never a silent match-all), `shared/ankiBrowserViews.ts` (query + sort + columns, never a selection), `shared/ankiEditAudit.ts` (an entry is exactly what one Undo takes back; an undone step stays recorded).
- Still open in this phase: gate 10's measurement half — contrast, reduced motion, compact/maximized and the four languages end-to-end — which is a measurement slice, not a build one. **Step 2 (the Browser) was measured 2026-08-16**: four languages with zero raw dotted keys, contrast 5.30–16.02 at 13.6–14 px, `outline: 2px solid` under real Tab (`.focus()` alone does not set `:focus-visible` and produced a false "no ring" reading), `html.reduce-motion` taking 0.14s → 1e-06s live, and a 3→4 row reflow at 372 px with no overflow. **Steps 3, 4 and 5 were built 2026-08-16** (`617a96ac`, `30d704ba`) — they rendered "not built yet" over tools that had all shipped into step 2's tray, so the flow described a shape the surface did not have. The 12 action kinds now partition across them (3/4/5, none on step 2, no kind twice, asserted against the tray's own catalogue), the queue moved into the shell because Back/Next unmount the tray, and a step's outcome sentence is taken back when its batch is undone from another step. **Step 6 was built 2026-08-16** (`5fc4657a`) — the complete dry run, measured as the **net** against the journal's first before-images rather than the sum of the step outcomes, so a field taken A → B → A reads as reverted and a value two steps wrote is flagged as a conflict the user resolved by ordering. Live on the 3,221-note deck: a clean draft says "No net changes", `Sentence` の → ノ reads **3,023 of 3,221** with **50** of 3,023 diff lines rendered, and an undo run **from step 6** restates it to zero. Step 6 passes no `onOpenNote`, because there is no Browser to open a note into from there. **Step 7 was built 2026-08-16 (`4dfaf53`, unblocked by Phase 6's exporter `ad09b92e`); steps 3–7's accessibility/contrast/language measurement is still owed beyond the step 6/7 partials, so the gate is still open.** Step 6's half landed 2026-08-16: contrast **6.08–16.02** at 12.6–15.2 px across title, facts, diff labels and values, `reduce-motion` **0.14s → 1e-06s** live, and the 50-of-3,023 diff cap visible rather than silent — The four-language render was measured 2026-08-16 for steps 3–7: ja/zh/ru walks on the real deck each show **0** raw keys with `<html lang>` stamped ja / zh-Hans / ru (the earlier "setUiLang re-renders nothing" reading was the Vite `?v=` duplicate-module trap; persist + reload is the working recipe — `debug/step7-lang.ps1`). One pre-existing finding it turned up: every `<select>` in the workbench is **19 px** tall (two styled ones are 32 px, buttons 35 px) — fixed once at the workbench level 2026-08-16 (`8d1f7ac9`): 27 controls now measure a **32 px** minimum, from 15 that were 19/21 px. **Gate 10 is complete-except-external as of 2026-08-16.** Compact/default/maximized closed with `0d96de79`: the workbench is hosted in an in-page window, so its `@media` widths measured the viewport and never fired — at a 420 px window the `fields` and `rules` steps clipped **14 px** and **24 px** into `.fwin-body`'s hidden overflow, and three rules (grid items may narrow, no control may outgrow its row) take all **15** measurements (3 widths × 5 steps) to **0** clipped pixels, with both halves of the fix failing red under mutation. Keyboard-only closed the same day with no code change: **21/26/17/12/7** tab stops for steps 3–7, **0** unreached controls, **0** stops without a focus ring, and steps 3→7 advanced by Tab+Enter alone with a disabled-Next negative control. The only remainder is step 7's **package-branch** text, which renders only over an .apkg draft behind a native dialog — attended, tracked in `needs-user.md`.

### Phase 4 — smart language, frequency, and known-word workflows — started 2026-08-15

- Deliver field/template swap, dictionary enrichment, reviewed AI additions, translation, text normalization, frequency rules, known-word exclusion, mastery mappings, card-design presets, and the first ten smart recipes.
- Require explicit missing-frequency, conflicting-known-state, provider, privacy, and overwrite choices.
- Shipped: field swap and field-to-field copy as tray kinds (`swap-fields`, `copy-field`; the copy has no default conflict rule, and `overwrite` counts every note whose destination already held text), and `shared/ankiTextNormalize.ts` (five individually chosen ops in one canonical running order, never touching cloze markers or `[sound:…]`).
- Shipped: frequency rules and known-word exclusion — `shared/ankiVocabContext.ts` (word field, headword, rank, known state; three absences kept distinct), `freq:`/`known:` Browser predicates that **refuse naming the token** when no vocabulary context exists, a batched `dict:frequencyRanks` reader, and a visible local/Anki precedence picker. Gate 4 passes live on the 3,221-note local deck; **gate 3 is blocked on data, not code** — `freq_corpora` is empty until a frequency dictionary is imported (`needs-user.md`, 2026-08-15 17:20).
- Shipped: dictionary enrichment's model and reader — `shared/ankiEnrich.ts` (an `EnrichSenseRule` with no default, so a disagreement between installed dictionaries is a choice the user makes; field-level provenance as a `<span data-jp-dict>` that survives an APKG round trip, because Anki has no per-field metadata a tag could carry), the `enrich-dictionary` tray kind (four distinct outcomes; a plan with no lookup data blocks rather than reporting every note as "no entry"), and `main/dictionary/enrichService.ts` + `dict:enrichTerms` (offline only). Two measured findings: the unified database **merges** entries agreeing on lang+headword+reading, so provenance lives in `LookupEntry.sources` — which `lookupResultToDictResult` drops; and `initYomitan()` provisions ~577k bundled terms in ~15 s, so the legacy fallback is deferred until the database has actually missed.
- Shipped: gate 11's UI half — the `enrich-dictionary` form (aspect / destination / conflict / sense rule / provenance, each preselected to the answer that cannot invent one: `refuse` and `inline`), and the lookup fetched by the tray itself rather than lifted out of the Browser, because enrichment reads only the note's word and the Browser's context additionally carries ranks and knowledge levels it has no use for. A host without `dictEnrichTerms` leaves the lookup undefined so the plan stays blocked on `no-enrich-data`; an empty result would render as "no installed dictionary knows any of your words". Also fixed: `summarizeTrayProblems` summed counts and kept only the first problem's `detail`, so a per-note word list rendered as a number — details are now deduplicated and capped at five, which improves `media-missing` and `field-absent` for free.
- Shipped: gate 12's review half — `shared/ankiAiAdditions.ts` and the `apply-ai-additions` tray action. A generated variant is a proposal: only an approved one is written, and the tray refuses the whole plan while any variant is undecided, any note is still pending, no batch is loaded, or the queued action names a superseded batch. Rejections are retained and flagged rather than deleted, so the review stays visible and reversible; retry covers the provider's failures and never a rejection or a cancellation, which are decisions the user already made. Generated text always carries `data-jp-ai`/`jp-ai-gen`, distinct from dictionary provenance and with no way to turn it off, because unmarked generated prose reads as a quotation or as the user's own writing. Failed, cancelled and all-rejected notes are counted separately so an apply that covered part of a batch says so.
- Shipped: gate 12's generation half — `shared/ankiAiPrompt.ts` (wire format + the disclosure), `main/anki/aiAdditions.ts` (`anki:aiGenerateAdditions` / `anki:aiCancelAdditions` / `anki:aiAdditionsProgress`), and `renderer/components/anki/DeckWorkbenchAiPanel.tsx`. Notes are addressed by chunk-relative index, never by note id. The note's meaning field is opt-in and the **normalizer** enforces it, so a form that forgets to clear the glosses still cannot send them. The disclosure is rendered from the same normalized request the run sends — provider, model, request count, the exact fields leaving the machine, and the cost, which is *absent* rather than `$0.00` when the user has entered no price. A cancel is checked between chunks; a chunk failure fails its own notes only; no API key or a local engine is a named refusal, never an empty result. `apply-ai-additions` is now in the tray's action list.
- **Gate 12 live, real provider, real numbers (2026-08-16):** negative control first — before the main-process restart the bridge returned `No handler registered for 'anki:aiGenerateAdditions'`. After it: a 1-note run returned `猫がソファで寝ています。` from `gemini-2.5-flash`. A **20-note run cancelled after the first chunk returned `cancelled: true` with 8 of 20 answered and all 8 successful** — the spend stopped, the paid-for work survived. An empty selection returned `error: 'no-request'` with `provider: ''`, i.e. nothing was sent.
- Shipped: mastery mappings — `shared/ankiMastery.ts` and the `set-mastery` tray kind. Gate 3's exclusion ("no 'known'/'good'/'very good' label whose actual scheduling effect is hidden") is enforced by the *type*: `masteryEffect()` returns `ankiSchedulingChanged: false` and `ankiCardsRescheduled: 0` as literals, so an action that ever reaches Anki's scheduler stops compiling rather than starting to lie, and the effect panel renders that line whether or not it is zero. The word is the unit, not the note; "never judged" stays distinct from level 0 for undo while counting as the same state for the changed-test; the plan rides on `TrayPlan.mastery` rather than the draft, because knowledge is keyed by lemma and outlives the deck. Applying and undoing are stacked under the tray's own group id, so one tray is one undo across both stores.
- **Gate 3's mastery half live, real 3,221-note deck, real store (2026-08-16):** 60 selected, 59 declare a word, **57 terms move**, 2 held a phrase, 1 declared none. Negative control — 刑事 present in the changes before, absent after one write put it at the target, **57 to 56, delta exactly 1**. Forward **57/57 verified at level 3**, replanning then moved **0**, the inverse restored **0 entries**. Planning with no vocabulary context refuses with `no-vocab-context` and returns no plan. Gate 3's *frequency* half remains blocked on data: `freq_corpora` is still empty.
- Two defects found by that run and fixed with it: `Apply`/`Undo`/`Redo` were gated on `changedNotes`/`journal.done` alone, so all three were dead on a mastery-only tray; and `extractVocabTerm` splits on whitespace, which Japanese lacks, so `今日はいい天気です` cleared its 16-character cap and arrived as a "word". Harmless for `freq:`/`known:`, which only read — **still true of them today** — but not for a write into the lemma-keyed store every mining filter consults, so `MASTERY_MAX_TERM_CHARS` is tighter and declined notes are reported as `mastery-phrase`.
- Shipped: field translation (gate 2) — `shared/ankiTranslate.ts` (request, disclosure, the four refusals), `anki:aiTranslateField` sharing gate 12's cancel registry and progress channel, and a translate mode in `DeckWorkbenchAiPanel`. The review is gate 12's `AiBatch`, widened to `AiBatchKind`; the write is the existing `apply-ai-additions` action.
- Shipped: recipe 8, wrong-language/wrong-script detection — `shared/textScripts.ts` (containment, never a language verdict, reusing `furigana.ts`'s kanji range) and a `script:` Browser predicate with the same `Field:` scoping `re:` uses. It reads `row.fields` and **not** the search haystack: on the real 3,221-note deck a haystack-based `script:latin` matches 3,221 of 3,221 because every row carries a Latin deck and note-type name, while the field-based one matches 225. Live: cyrillic **17** (all in `Back`), letter-free **1**, unknown script refused by name.
- Shipped: recipe 9, duplicates — `shared/ankiDuplicates.ts`. Three modes (exact / normalized / near) over one field, and a canonical proposal by a rule the user can read: most non-empty fields, then most text, then first seen, with `tied` set when the pick was arbitrary. It **proposes and never deletes**, and returns a selection rather than a new tray kind, because the tray's reversible ops are tags and field text and the existing actions already consume a selection. Near mode has no default threshold and refuses without one; it indexes character bigrams, so the real deck costs **8,784** comparisons rather than 5.19 million. Live: `Expression` **40 groups**, `Sentence` **681 groups / 2,085 duplicates**. Its consumer surface shipped 2026-08-16 as `DeckWorkbenchDuplicates.tsx`, a folded tool in the Browser that scans **the rows the filter is showing** and returns a selection — no delete button and no tray kind, so "find them" and "Clear selection" are the same reversible pair. Live on the real deck: `Expression` exact **40 groups / 40 duplicates**, `Sentence` exact **681 / 2,085**, `near 0.9` **40 groups at 8,784 pairs**, and the same `Sentence` scan under `freq:<=5000` **57 / 85** — the scope is real. `near` with no threshold keeps `Scan` disabled rather than returning an empty scan. `ankiDuplicates.ts` has left `architecture-baseline.json`.
- **Gate 3's frequency half is now unblocked**: `Freq.JPDB.zip` is imported and migrated, `freq_corpora` has rows, and `dictFrequencyRanks` answered `{}` before and `の 1 / 言う 104 / 人 1,526 / 燦然 112,650` after. Gate 3 itself is a measurement slice now, not a build one.
- Shipped: the query explanation — `shared/ankiQueryExplain.ts` and a quiet nested list under the search box. It closes gate 3's last open half: a corpus rank is not a card count and nothing on the surface said so. It explains the **parsed tree**, so it cannot drift from the filter that ran, and it emits i18n keys rather than prose, so the four catalogs decide word order. See gate 3 for the live numbers.
- Shipped: recipe 7, missing readings and furigana — `shared/ankiReadingFill.ts` and the `fill-reading` tray kind, with its form in the tray. Confidence is derived from the dictionaries (two agreeing sources `certain`, one `likely`, several distinct readings `ambiguous`) and `readingMeetsThreshold` refuses `ambiguous` at **every** threshold, so an ambiguous word is a review item by construction rather than by call-site discipline. There is deliberately no conflict rule: the recipe fills *missing* readings, so an occupied destination is counted and never overwritten. A whole-token furigana fallback caps confidence at `likely`. Live on the real 3,221-note deck the partition is exact — occupied **3,180** + no-entry **21** + no-word **1** + ambiguous **18** + below-threshold **1** = **3,221** — and the negative control ran in the right direction: `certain` changed **0**, `likely` changed **1**. One defect the live run found and the same turn fixed: the unified dictionary is multi-language, so a kanji came back with **pinyin** readings (掃 → `sǎo / sào / そうかい / そうじ`) and a kanji with only a Chinese entry would have had `jù` written into a Japanese reading field; `isKanaReading` now drops them under its own `no-kana-reading` refusal. **`enrich-dictionary`'s `reading` aspect still has no such filter.**
- Shipped: recipe 10, leech rescue — `shared/ankiLeechRescue.ts` and the `rescue-leeches` tray kind, with its form in the tray (`7f1be362` model, `b2605eb3` surface). Leeches are read, never guessed: Anki's own definition, a lapse count at or above the threshold, plus notes Anki has already tagged `leech`. Two measures the journal can undo — a rescue tag and a **partial-reveal hint derived from an existing field**, one character then an ellipsis, nothing invented — and the third, a slower scheduling preset, is **offered and refused by name**: the journal carries `field`, `tags` and `card-due` only, and a reschedule-only tray blocks Apply rather than succeeding having changed nothing. The hint never overwrites, because a leech is exactly the note a user has already annotated. Live on the real 3,221-note local deck the finding is that it carries **0 cards with any SRS state**, so max lapses is **0** and nothing is a leech by count — the recipe says so ("22 notes are under the lapse threshold and carry no leech tag") instead of reporting a quiet success. The positive control therefore composes two tray steps, `add-tags leech` then rescue with `includeTagged`: **22 leeches found, 22 rescued, 22 tagged-only**, `Image` written `今…`, `Tags` `src::dictionary` → `src::dictionary leech leech::rescued`. Three negative controls on the same live data: an occupied destination refused **22** and kept the text, an empty source refused **22**, and a reschedule-only tray rendered `wb-tray-blocking` with Apply `disabled=true`.
- Next in this phase: **the first ten smart recipes** (list at "Smart recipes", items 1–10) — 1, 3, 4, 5 and 14 are covered by the shipped swap/known/frequency/mastery/enrich actions, 2 by gate 2, 7, 8 and 9 as above; 6 landed 2026-08-16 (`74bcb69c` model, `b0c2396b` surface: `shared/ankiPrioritize.ts`, the journal's first card-level op `card-due`, and a `prioritize-new` tray action — live on the real 3,221-note deck, 3,079 moved + 141 no-rank + 1 no-word, and marking one word known moved it to 3,078); 10 landed 2026-08-16 as above, so **every recipe 1–10 is now shipped**. Gate 11's remaining half — **export/reimport provenance** — landed 2026-08-16 (`a8df8857` reader + `9f46261a` round trip). The blocker was not the missing exporter but a missing *consumer*: `readEnrichProvenance` was called only from tests, so the inspector now renders "Written from: {sources}" off `field.raw`. Proven live through the real main process with no dialogs: 0 of 3 fixture notes attributed before, note 2002's wrapper byte-identical after export→reimport, `normalized` the bare value, the other two still unattributed. Still open only in the UI-plus-reimport combination, which needs the attended file-dialog walk in `needs-user.md`.

### Phase 5 — Anki core editing parity

- Extend the typed Anki adapter for the tested field, tag, deck, flag, suspend/bury, model/template, media, and scheduler operations.
- Finish the four-rating local SRS migration and explicit mastery-preset mappings.
- Complete the compatibility matrix with honest disabled states for capabilities that cannot be performed safely.

### Phase 6 — export, commit, and round-trip proof — both halves built 2026-08-16

- Export a new package and commit bounded changes to live Anki. **The package half landed
  (`ad09b92e`)**: `apkg:export` applies the journal's net change set to a fresh read of the source
  package and writes a NEW .apkg, copying every non-collection zip entry verbatim so media and
  unpaged notes survive untouched. Fingerprint mismatch, overwrite-of-source, empty set and
  unknown note/card each refuse with their own code before any file is written, and "ok" is only
  claimed after the written file is re-read from disk and every change found in it. Proven live on
  the real IPC path: 2 note edits + 1 card move exported, reimported, byte-exact, with the
  `Marked` tag token preserved and due 10→3 moved while due 20 stayed. **Step 7's UI landed
  (`4dfaf53`)**: `DeckWorkbenchApply` renders the net counts from the exporter's own builder,
  ships `{fingerprint, changes}` with no outPath so the save dialog stays the production route,
  echoes the exporter's verified numbers on ok and one translated line per refusal code, offers
  no button on a non-package source, and stays silent on a cancelled dialog. Live on the real
  local deck: step 7 current, placeholder gone, honest noFile branch, contrast 6.08–16.02. The
  package-branch UI walk through the real dialogs is attended-only (needs-user.md).
  **The live-Anki commit half landed (`87e52a5e`, `2978fa35`, `9950f88c`)**:
  `anki:commitConnectDraft` re-reads the same window and compares fingerprints, plans every
  write against that fresh read (refusing before write #1), writes collecting per-item failures,
  then re-reads and verifies. Tags commit as an add/remove diff so the `marked` token survives;
  a card on loan to a filtered deck is refused rather than repositioned. Live on a disposable
  deck: notes 2, cards 1, verified true, profile "User 1", fingerprint moved, `marked` preserved,
  card due 314703→7 with the other two untouched; negative controls `source-changed` and
  `note-missing` each left a byte-identical collection. The first run exposed a real defect —
  `setSpecificValueOfCard` refuses a string value inside a 200 body — which the post-commit
  re-read caught as `verify-failed` rather than reporting as a save.
- Add source-fingerprint conflict handling, partial-failure recovery, post-commit rereads, and reversible journals.
- Prove import -> edit -> export/reimport and live read -> edit -> commit/reread equivalence for all supported data.

### Phase 7 — advanced recipes and release hardening

- Complete all twenty smart recipes, large-deck performance, accessibility, localization, error recovery, and Standard/Liquid/theme visual matrices.
- Run focused tests, integration tests, a 100,000-note performance fixture, and live Electron acceptance with a disposable Anki profile.

## Demonstrable acceptance gates

This slice is complete only when all of these can be shown with real data and no mock success:

1. Import a representative APKG, inspect every preserved/unsupported feature, swap front/back, export a new package, reimport it, and match the approved diff.
2. Translate a Back field to Russian or Japanese into a selected destination field, preview individual diffs and provider implications, cancel safely, then apply and verify.

    **Closed 2026-08-16** (`c30a020`, `16c8990`, `fb54fff`). `shared/ankiTranslate.ts` is the request
    half only: the review, the cancel and the write are gate 12's and are reused, so a translation is
    an `AiBatch` of kind `translate-field` that the existing `apply-ai-additions` action writes.
    Recipe 2's "while retaining the original" is enforced as a blocking `same-field` problem, not as
    advice — the tray has an `overwrite` conflict rule. On the real 3,221-note deck, `Sentence` →
    `Meaning` into Russian: **3 requested, 3 answered, 3 ok in 3,461 ms**, disclosure **1 request /
    165 input tokens / cost `not-known`**; approving all three gave **`changedNotes: 3`, 0 problems**,
    the source field **byte-identical on 3 of 3**, and the destination carrying the
    `jp-ai-gen` marker. Cancel: **30 requested → 12 answered, 18 cancelled, 0 failed**. A cloze
    source is skipped rather than translated, and an echo of the source is a retryable failure.
3. Filter `frequency rank <= 5,000` plus `unknown`, explain that this means the most frequent 5,000 words, map the results to `Very good`, and show the exact mastery/scheduling effects before commit.

    **Closed 2026-08-16.** `shared/ankiQueryExplain.ts` explains the **parsed tree** as i18n keys and
    vars, so the sentence cannot describe a filter other than the one that ran and a refused query
    explains nothing. Comparisons normalize to the inclusive rank: `freq:<5000` reads as the most
    frequent **4,999** words. The gate's `Very good` is this app's top rung `Known` — Anki's ease
    vocabulary is exactly what the plan's exclusion list forbids using as a label with a hidden
    scheduling effect, and the effect panel is what closes the gate instead. Live on the real
    3,221-note deck: `freq:<=5000 known:no` → **348**, explained as "its word is among the 5,000 most
    frequent words in the installed frequency list" + "you do not know its word yet"; mapped to
    `Known` the tray shows **342 words move, 0 already there, across 348 notes, 0 cards
    rescheduled** before any commit. Negative controls: the partition `<=5000` 348 + `>5000` 2,731 +
    `none` 141 + `noword` 1 = **3,221** exactly, and `freq:<=5000 nope:1` renders the refusal and no
    explanation.
4. Exclude words known locally, known in Anki, or both; resolve a deliberately conflicting item according to the selected precedence.
5. Batch-edit tags, flags, deck, suspension, due date, interval/ease or a supported scheduling preset, then reread Anki and prove the resulting state.
6. Safely edit a multi-template and cloze note without confusing fields with generated cards or breaking sibling renders.
7. Interrupt a large import, translation, dry run, and live commit; recover without a false success state or an ambiguous partial result.
8. Undo a draft action, reverse a supported committed action, and clearly explain any adapter operation that cannot be reversed.
9. Filter and preview the 100,000-note fixture without freezing window dragging or Electron's main event loop.
10. Complete the primary workflows using keyboard only and verify focus, contrast, reduced motion, EN/JA/ZH/RU strings, and compact/default/maximized layouts.
11. Follow the numbered flow to enrich a mixed deck from configured dictionaries, add new fields, resolve conflicting senses, update the template, and prove field-level provenance after export/reimport.
12. Generate several AI example sentences and learning aids, approve only selected variants, preview difficult and edge-case cards across layouts, cancel one batch, retry only failures, and verify that rejected/generated data is represented honestly.
13. Customize Browser columns separately from note fields, create a reverse/optional-reverse card design, and prove that the representative preview catches blank, duplicate, cloze, sibling, media, and dark/mobile rendering failures before Apply. The media lens is *flagged, not rendered*: the preview frame is an opaque-origin `srcdoc` whose CSP allows `data:` images only, and Anki references media by bare file name, so a card that references media the package holds must say so explicitly (`media-not-rendered`) rather than show a blank box that reads as clean. Loosening the CSP does not satisfy this gate.

    **Closed 2026-08-16** (`a99c9f27`, `70c840cf`, `65007162`). Columns: `ankiWorkbenchBrowser.ts` + the
    `wb-browser-columns` group. Design: `shared/ankiCardDesign.ts` + `DeckWorkbenchCardDesign.tsx`. On the
    real 3,221-note deck a reverse design added **3,180** cards and skipped **41** with an empty `Reading`
    (3,180 + 41 = 3,221); apply took cards **3,221 → 6,401** and remove took them back to **3,221** with
    **1** template. Optional-reverse added `Add Reverse` to all 3,221 for **0** cards; flagging exactly 3
    replanned to **3**. Media stays *flagged, not rendered*, as above. The sibling lens gained
    `conditional-card-not-generated`: a note the design passes over says so, and a **flagged** note with a
    blank question field still says `empty-question` — proven live as two different sentences.
14. Exercise every `supported` row in the living Anki parity matrix and prove every `read-only` or `blocked` row has an honest explanation and no active Apply path.

## Explicit exclusions

- No direct mutation of Anki's SQLite collection.
- No claim of compatibility with arbitrary Anki add-ons or custom scheduler patches.
- No destructive overwrite of the only imported package or live collection state by default.
- No AI translation or generation without visible provider/privacy/cost state and a reviewed diff.
- No “known”, “good”, or “very good” label whose actual scheduling effect is hidden from the user.

## Living upstream references

Recheck these primary references during Phase 0 and before parity sign-off; Anki behavior evolves:

- [Adding and editing notes, fields, tags, flags, cloze, and image occlusion](https://docs.ankiweb.net/editing.html)
- [Browsing and bulk organization](https://docs.ankiweb.net/browsing.html)
- [Search grammar and scheduler properties](https://docs.ankiweb.net/searching.html)
- [Card templates and rendered previews](https://docs.ankiweb.net/templates/intro.html)
- [Card generation, reverse cards, conditionals, and cloze behavior](https://docs.ankiweb.net/templates/generation.html)
- [Deck options, legacy scheduling, and FSRS](https://docs.ankiweb.net/deck-options.html)
- [Package export and scheduling/media options](https://docs.ankiweb.net/exporting.html)
- [AnkiConnect action surface](https://github.com/FooSoft/anki-connect)
