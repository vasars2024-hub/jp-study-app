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
- Still open in this phase: gate 10's measurement half — contrast, reduced motion, compact/maximized and the four languages end-to-end — which is a measurement slice, not a build one. **Step 2 (the Browser) was measured 2026-08-16**: four languages with zero raw dotted keys, contrast 5.30–16.02 at 13.6–14 px, `outline: 2px solid` under real Tab (`.focus()` alone does not set `:focus-visible` and produced a false "no ring" reading), `html.reduce-motion` taking 0.14s → 1e-06s live, and a 3→4 row reflow at 372 px with no overflow. **Steps 3, 4 and 5 were built 2026-08-16** (`617a96ac`, `30d704ba`) — they rendered "not built yet" over tools that had all shipped into step 2's tray, so the flow described a shape the surface did not have. The 12 action kinds now partition across them (3/4/5, none on step 2, no kind twice, asserted against the tray's own catalogue), the queue moved into the shell because Back/Next unmount the tray, and a step's outcome sentence is taken back when its batch is undone from another step. **Step 6 was built 2026-08-16** (`5fc4657a`) — the complete dry run, measured as the **net** against the journal's first before-images rather than the sum of the step outcomes, so a field taken A → B → A reads as reverted and a value two steps wrote is flagged as a conflict the user resolved by ordering. Live on the 3,221-note deck: a clean draft says "No net changes", `Sentence` の → ノ reads **3,023 of 3,221** with **50** of 3,023 diff lines rendered, and an undo run **from step 6** restates it to zero. Step 6 passes no `onOpenNote`, because there is no Browser to open a note into from there. **Step 7 was built 2026-08-16 (`4dfaf53`, unblocked by Phase 6's exporter `ad09b92e`); steps 3–7's accessibility/contrast/language measurement is still owed beyond the step 6/7 partials, so the gate is still open.** Step 6's half landed 2026-08-16: contrast **6.08–16.02** at 12.6–15.2 px across title, facts, diff labels and values, `reduce-motion` **0.14s → 1e-06s** live, and the 50-of-3,023 diff cap visible rather than silent — The four-language render was measured 2026-08-16 for steps 3–7: ja/zh/ru walks on the real deck each show **0** raw keys with `<html lang>` stamped ja / zh-Hans / ru (the earlier "setUiLang re-renders nothing" reading was the Vite `?v=` duplicate-module trap; persist + reload is the working recipe — `debug/step7-lang.ps1`). One pre-existing finding it turned up: every `<select>` in the workbench is **19 px** tall (two styled ones are 32 px, buttons 35 px) — fixed once at the workbench level 2026-08-16 (`8d1f7ac9`): 27 controls now measure a **32 px** minimum, from 15 that were 19/21 px. **Gate 10 is complete-except-external as of 2026-08-16.** Compact/default/maximized closed with `0d96de79`: the workbench is hosted in an in-page window, so its `@media` widths measured the viewport and never fired — at a 420 px window the `fields` and `rules` steps clipped **14 px** and **24 px** into `.fwin-body`'s hidden overflow, and three rules (grid items may narrow, no control may outgrow its row) take all **15** measurements (3 widths × 5 steps) to **0** clipped pixels, with both halves of the fix failing red under mutation. Keyboard-only closed the same day with no code change: **21/26/17/12/7** tab stops for steps 3–7, **0** unreached controls, **0** stops without a focus ring, and steps 3→7 advanced by Tab+Enter alone with a disabled-Next negative control. **Gate 10 is CLOSED as of 2026-08-16.** Its last remainder — step 7's **package-branch** text, which renders only over an .apkg draft and was believed to need a human at a native dialog — was measured live with no dialog at all, by marking a real draft session `failed` and taking the Resume button `865f84e2` added. Over `r13-split.apkg` (7,992 notes) step 7 renders "Export writes a new package. The original file is never modified." and an enabled "Export a new package…", **0** raw i18n keys, contrast **6.08–16.02** at 13–14 px, every control **35 px** and `tabIndex 0`, `reduce-motion` **0.14s → 1e-06s**; with a 495-note change set applied it says "495 notes will be written with their new content" and with none, "The session adds up to no changes — there is nothing to export." The `ja` walk renders the same branch as 「書き出しは新しいパッケージを作成します。元のファイルは変更されません。」/「新しいパッケージを書き出す…」 with **0** raw keys and `<html lang>` `ja`.

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
- Next in this phase: **the first ten smart recipes** (list at "Smart recipes", items 1–10) — 1, 3, 4, 5 and 14 are covered by the shipped swap/known/frequency/mastery/enrich actions, 2 by gate 2, 7, 8 and 9 as above; 6 landed 2026-08-16 (`74bcb69c` model, `b0c2396b` surface: `shared/ankiPrioritize.ts`, the journal's first card-level op `card-due`, and a `prioritize-new` tray action — live on the real 3,221-note deck, 3,079 moved + 141 no-rank + 1 no-word, and marking one word known moved it to 3,078); 10 landed 2026-08-16 as above, so **every recipe 1–10 is now shipped**. Gate 11's remaining half — **export/reimport provenance** — landed 2026-08-16 (`a8df8857` reader + `9f46261a` round trip). The blocker was not the missing exporter but a missing *consumer*: `readEnrichProvenance` was called only from tests, so the inspector now renders "Written from: {sources}" off `field.raw`. Proven live through the real main process with no dialogs: 0 of 3 fixture notes attributed before, note 2002's wrapper byte-identical after export→reimport, `normalized` the bare value, the other two still unattributed. **Gate 11 is CLOSED as of 2026-08-16.** Its last half — the UI-plus-reimport combination, also parked as an attended file-dialog walk — was driven with no dialog by the same resumable-session route that closed gate 10. Reimported `gate11-provenance.apkg` in the workbench Browser: note 2002 (猫) opens the inspector with "**Written from: JMdict (EN), Jitendex**" under `Reading` and nothing under `Expression` — **1 of 3** field slots — at contrast **16.02**, 12.8 px. **Negative control:** note 2003 (犬), same package, same inspector, **0 of 3**. The wrapper is in the file, not synthesized by the panel: `Reading.raw` is `<span class="jp-dict-src" data-jp-dict="JMdict (EN)|Jitendex">cat; feline</span>` with `normalized` the bare `cat; feline`, while 2001/2003 carry no wrapper at all.

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
- Shipped 2026-08-16: **recipe 12's tag half** (`b8a7f24c`) — `shared/ankiTagNormalize.ts` + a `normalize-tags` tray action, four ops in a fixed order, casing decided by a draft-wide census rather than by `toLowerCase()`. Live on the real 3,221-note mined deck: 3,074 notes / 3,074 tags renamed (`book::容疑者Ｘの献身 -> book::容疑者Xの献身`), undo restored 3,221 of 3,221 byte-identical; a clean run reports `tag-normalize-clean` for 3,221 instead of a silent zero. Recipes still without a tray action kind: **11, 13–20, 26**.
- Shipped 2026-08-16: **recipe 12's deck half — recipe 12 is now CLOSED** (`4a3afce6` plan + reversible `deck-name` journal op, `0d205467` the writer, `841f37a2` the tray action). `shared/ankiDeckNormalize.ts` reuses the tag half's `::` path ops but never `drop-redundant-parents` (a parent deck holds cards), refuses a two-decks-onto-one-name **merge** by name, and neither renames a filtered deck nor lets it vote in the census. The rename reaches the file: `applyExportChanges` writes both storages (schema-18 `decks` row, legacy `col.decks` blob) and `verifyExportChanges` re-reads it. **Measured limit, found live and not by a fixture:** a ver-18 package declares `decks.name COLLATE unicase`, which sql.js cannot register — `notes.flds`/`notes.tags` write fine on the same database and only the deck name fails, so it is refused as `deck-collation-unsupported` with the "Support older Anki versions" instruction. Real evidence: ver-11 `Ginga Eiyuu Densetsu.apkg` renamed `銀河英雄伝説 -> Anime::銀河英雄伝説` into a new 1,057,028-byte package, re-read from disk, **7,992 notes before / 7,992 after and 7,992 cards still in that deck id**. A live commit refuses `deck-rename-unsupported`: AnkiConnect has no rename action and emulating one would move every card. Recipes still without a tray action kind: **11, 13–20, 26**.
- Shipped 2026-08-16: **recipe 16** (`07f8704a`) — `shared/ankiSentenceCover.ts` + a `cover:` Browser predicate with the same scoping `script:` and `re:` use. Five modes, because a fifth (`unknown`) was forced by a measurement: on the real 3,221-note mined deck the four-mode version put 234 notes in `none` and 233 of them were words whose stem the module refuses, leaving exactly **1** real defect. Live partition: exact 2,479 / reading 0 / stem 507 / none 1 / unknown 233 = 3,220 with 1 not applicable, and the five-way negation matches exactly that 1. Like recipe 8 this is a **filter, not a tray action** — the recipe's verb is "find".

- Shipped 2026-08-16: **recipe 15** (`df7eba97` model, `256669c8` filter, `90a30fa2` the renderer fix it found) — `shared/ankiCardHealth.ts` + a `render:` Browser predicate. Six verdicts, healthiest first: `ok / not-generated / same / empty-back / empty-front / broken`. `same` is the new one and it exists because `renderAnkiCard` substitutes `{{FrontSide}}` into the answer *before* rendering it, so `{{FrontSide}}<hr id=answer>{{Back}}` over an empty `Back` renders a non-empty answer holding the question — `empty-answer` never fires and every prior check passed the card. It compares rendered **text**, not fields, and `not-generated` is dropped from a note's verdict rather than ranked so an opted-out reverse neither enters the queue nor inflates the healthy count. `render:` is the first predicate a row cannot answer (the verdict is about the note type's templates), so it reads `schema.render` precomputed by `buildCardHealthContext`, with its own `no-render-context` refusal. **The real-data run found a defect fixtures could not:** the eggrolls JLPT deck reported `unbalanced-conditional` on **10,147 of 10,147** notes against a template that balances 26/28/28/26 with zero orphans — `renderAnkiCard` passed the rendered question as `String.replace`'s *replacement string*, and that deck's inline script carries `$'`, which spliced the whole remainder of the answer format in again. Measured after the fix over **10 real packages / 121,737 notes**: every one 100% `ok`, eggrolls 10,147 broken -> 10,147 ok, and a negative control on a plain `{{FrontSide}}...{{裏面}}` type moves exactly 1 note ok -> `same`. Like recipes 8 and 16 this is a **filter, not a tray action**. Recipes still without a tray action kind: **11, 13, 14, 17–20, 26**.
- Shipped 2026-08-16: **recipe 13 — CLOSED, and it is the first action that moves a card between decks** (`f4fda08b` planner, `e9d72fa6` the `DeckWorkbenchSplit` panel, `a668ed4d` the package writer, `8106d0ed` the live commit). `shared/ankiDeckSplit.ts` mints a deliberately non-numeric `split:<parent>:<segment>` id for a subdeck that does not exist yet — a real Anki id is epoch milliseconds, so an id that could pass for one would file cards into a row that never existed — and each writer resolves it through the change set's `deckCreates`, allocating the real id itself because only it knows which ids are free. **Both destinations write it for real.** The package writer creates the deck row in both storages (a schema-18 `decks` row whose `kind` blob is a protobuf `Normal` carrying `config_id`, so its leading `0x0a` reads back as not-filtered through `apkgDraftRead`'s own test; a legacy `col.decks` entry with the per-day counters zeroed) and rewrites `cards.did`, deck rows first so no card ever points at a deck the package does not hold. The live commit uses `createDeck` + `changeDeck` addressed by NAME, one call per target deck, with `setDeckConfigId` carrying the parent's preset so study limits do not silently reset. Verification on both sides resolves a minted deck back through its **name** in the written/re-read collection, so it confirms the row exists *and* the card is in it without trusting any id the writer chose. Refusals are by name and before write #1: `card-filtered` (a card on loan keeps its real deck in `odid`/`odue`), `deck-missing`, `deck-filtered`, `deck-name-taken`. **Measured hole, left deliberately:** an EMPTY filtered deck reads as normal live, because `probeFilteredDecks` only probes deck names the cards reference. Real evidence, ver-11 `Ginga Eiyuu Densetsu.apkg` through the surface's own `planChangeTray` path: **7,992 notes / 7,992 cards / 2 decks** in, axis `source` created **1** subdeck (`銀河英雄伝説::Lapis (Jiten)`) and moved **7,992** cards, writer reported `cardsUpdated 7992 / decksUpdated 1`, the written **1,087,549-byte** package verified with **0 mismatches**, and the re-read from disk holds **7,992 notes / 7,992 cards / 3 decks** with the parent at **0** and `conf=1` carried. Negative controls in the same run: axis `jlpt` moved **0** and said so (`split-clean` + `split-unmatched`, 7,992 each) instead of inventing a partition, and axis `frequency` refused `invalid-bands`. Recipes still without a tray action kind: **11, 14, 17–20, 26**.

- Shipped 2026-08-16: **recipe 17's audit half** (`8c705e02` model + `sibling:` predicate, `d2c53c9c` the panel). `shared/ankiSiblingAudit.ts`, five verdicts healthiest first: `single / ok / duplicate / ambiguous / orphan`. The subject is the note **type** — recipe 15 judges what one card renders into, and each half of a duplicate pair renders perfectly. `single` is dropped rather than ranked (recipe 11's `none` rule). **`ambiguous` exists so the surface cannot offer a destructive fix for the wrong case:** same question with two different answers is unanswerable, not redundant, and removing either template drops content. `orphan` outranks both — a card whose ord names no template cannot render at all, which is what Anki's Empty Cards tool deletes. Compared as rendered **text**, recipe 15's choice, over an evenly spaced sample whose size every row states: the same real deck reads `ambiguous` at 50 notes and `duplicate` at 2, asserted rather than hidden. Redundant card counts come from the whole draft, the verdict from the sample. **Live over the user's 33 real packages / 38,283 notes on page / 52,144 cards:** every tally sums to its own note count, worst audit 1,014 ms (5 templates × 2,000 notes), and the library is **clean** — 32,422 `single`, 5,861 `ok`, 0 / 0 / 0. A clean sweep proves nothing alone, so `New_HSK_30…drawing.apkg` (5 distinct templates, 2,000 notes, all `ok`) was broken on purpose: cloning Card 1 → exactly **1** `duplicate` group, ords [0,99], sampled 50, 2,000 redundant cards, 2,000 notes; changing only the clone's answer → exactly **1** `ambiguous` group, 2,000 notes. The five real templates staying clean is the negative control for both. **Still open: the "remove" half.** It is not error handling deferred — removing a template deletes every card it generated and renumbers the remaining ords, and AnkiConnect has **no** remove-template action, so the live destination must refuse by name before write #1 the way recipe 13's `deck-rename-unsupported` does. Recipes still without a tray action kind: **14, 18–20, 26**.
- Shipped 2026-08-16: **recipe 14 — CLOSED** (`63f5bfdb` model + the `merge-glossary` tray action, `046c33cb` the `DeckWorkbenchGlossary` panel, `0aa50b55` the page-count honesty fix its own live run found). `shared/ankiGlossaryMerge.ts` reads a **second package** — the only action that does — so the glossary arrives through `planChangeTray`'s options the way `apply-ai-additions`' batch does. "Without overwriting stronger fields" is the recipe, so strength is a **stated order, not a score**: attributed beats unattributed, then more senses, then more text, first difference wins, and the deciding component comes back as `strongerBy` so the surface can say *why* a value was kept. A **tie keeps the destination** — rewriting thousands of fields to equally strong text costs an export and a sync and buys nothing. Three modes and no default: `fill-empty` cannot lose text, `prefer-stronger` may and counts every note that did under `overwrite-nonempty`, `merge-senses` appends only what is missing. Two refusals carry the slice: a key the glossary holds twice with **disagreeing** values is dropped from the source entirely rather than resolved by a guess (rows that *agree* collapse, keeping the attributed copy), and `merge-senses` refuses a value carrying `<` or `&` instead of splitting it, because the `;` in `&nbsp;` is not a sense boundary. The glossary is built **at Add, not while the form is edited**, so a queued action and the payload it plans against are the same merge by construction; a re-pick mints a new id and a stale tray refuses with `glossary-mismatch`. **Live on two of the user's real N1 packages with no dialog** — destination `N1 Vocab 3.apkg` (158 notes, 2 note types), glossary `N1 Vocab-20260102173058.apkg`: source build **70 ms**, 2,000 rows → **1,784 entries / 57 ambiguous keys / 2 keyless**, and the partition is exact and identical in all three modes — **147 unmatched + 10 matched + 1 `field-absent` = 158**, plans 2–7 ms. All three wrote **0** and each said why differently (`kept-occupied` 10, `kept-stronger` 10, `html-refused` 10 — the `&`/`<` refusal firing on real HTML-heavy fields). Positive control: blanking those same 10 Backs gives **10 written** (定着 ← 6,499 chars) and undo restores all 10. Three negative controls: 読む is in no glossary row → **0 changed, still blank**; a planted twin for 定着 carrying a different answer takes entries 1,784 → 1,783 and ambiguous 57 → 58 with **0 changed** and `glossary-key-ambiguous`; and the tray holding the first source id against the second payload is **blocked** with `glossary-mismatch`. **The live run's own finding, fixed in `0aa50b55`:** `readApkgDraft` clamps to `ANKI_DRAFT_MAX_PAGE_SIZE` (2,000), so `noteLimit: 6000` returned 2,000 of 3,359 — the panel was rendering `counts.notes` (the whole collection) and would have claimed 3,359 rows were in a merge that could never reach 1,359 of them. Recipes still without a tray action kind: **18–20, 26**.

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

    **NOT CLOSED — half built 2026-08-17** (`67512897` model + both writers,
    `8901e775` the batch). Three of the six were unwritable BY CONSTRUCTION:
    `card-flag`, `card-queue` and `card-scheduling` carried `journalOp: null`, and
    `buildApkgExportChanges` folds `journal.done` and nothing else. They now have op
    kinds, change-set fields, a package writer, a live commit and a `set-card-state`
    tray action. Per destination they differ and that is the honest answer:
    suspension goes live through AnkiConnect's own `suspend`/`unsuspend`,
    interval/ease through `setSpecificValueOfCard` on `ivl`/`factor` (the route
    `card-due` already uses), and **`card-flag` is `blocked` live** with
    `card-flag-unsupported` — the only route assigns the whole `flags` column, whose
    upper bits are reserved and are not in the draft. `reps`/`lapses`/`left` stayed
    read-only as a new `card-review-counters` row: the revlog holds a row per review,
    so a rewritten counter would contradict the card's own history.
    **The builder control landed 2026-08-17** (`12a02f69`): `set-card-state` joins
    `ACTION_KINDS` and step 5's "Learning rules", with all three parts opening on
    "leave unchanged" and Add still enabled from the empty form so
    `card-state-empty` refuses out loud instead of a disabled button explaining
    nothing. `ANKI_CARD_FLAGS` is exported from the decoder so the form cannot
    label a colour `decodeCardFlag` never returns, and both honest limits are said
    before Add. 8 renderer tests; 140 green across the five affected suites.
    **Closed 2026-08-17** (`7c66293d`) — but **not on the local deck**, and the
    earlier instruction to run it there was impossible by construction: a
    `local-deck` draft is neither `isPackage` nor `isLive`, so step 7 renders
    `ankiWorkbench.apply.noFile` and offers no destination at all
    (`DeckWorkbenchApply.tsx:185`). That copy is honest and already names the way
    out, so it is not a defect — the gate's own words are "then reread **Anki**",
    and the package is the only destination that can carry all six (`card-flag`
    is `blocked` live). Run on the real `5y56454w54.apkg`: **608 notes / 608
    cards**, page of 500, 0 blocking diagnostics. One `set-card-state` action
    carrying all three parts over 5 review cards → `changedCards` **5**,
    `matched 5 / changed 5 / skipped 0`, **15 journal ops** folding to a change
    set of **5 cardFlags + 5 cardQueues + 5 cardScheduling**. Exported dialog-free
    through the real `apkg:export` (`sourcePath`/`outPath`): `cardsUpdated` **5**,
    `verified: true`, new fingerprint `sha1:3b937629…`. **Re-read through the same
    main-process reader**, all four columns on 5 of 5: flag `none`→`orange`,
    queue `review`→`suspended`, interval `3/1/1/1/1`→**42**, ease
    `2500/2500/2500/2300/2500`→**1900**. Three negative controls: card
    `1779655102544`, same shape and deliberately outside the selection, came back
    `['none','review',3,2500]` **identical**; an action with none of the three set
    is refused `card-state-empty`; ease 900 is refused `card-state-invalid`
    rather than clamped. Total cards 500→500. The pipeline seam
    (`planChangeTray` → `buildApkgExportChanges` → `applyExportChanges` →
    re-read) is now pinned by 3 cases in `apkgExportCore.test.ts`; deleting the
    `cardFlags` fold reddens exactly one of them and none of the older
    literal-change-set cases, which is why the seam needed its own coverage.
6. Safely edit a multi-template and cloze note without confusing fields with generated cards or breaking sibling renders.
7. Interrupt a large import, translation, dry run, and live commit; recover without a false success state or an ambiguous partial result.
8. Undo a draft action, reverse a supported committed action, and clearly explain any adapter operation that cannot be reversed.
9. Filter and preview the 100,000-note fixture without freezing window dragging or Electron's main event loop.

    **The fixture EXISTS as of 2026-08-17**, and the main-event-loop half is CLOSED
    (`c538ae6f`, `75ea1f6d`). Built by scaling a real ver-11 package rather than
    hand-writing a schema — `debug/gate9-make-fixture.cjs`, 100,000 notes /
    100,000 cards / 63.6 MB collection / 13.5 MB zip. Instrument: a 20 ms main-side
    IPC heartbeat driven from the renderer through the debug bridge; main is single
    threaded, so a long round trip IS main unable to answer.
    **Before:** read 6,217 ms, main answered **3** heartbeats, longest unbroken
    stall **3,293 ms**. Idle control, same machine, same session: 141 beats,
    **14 ms** max, 1 ms p95. **After** (utility process, verified again on a clean
    boot): 5,556 ms, **231** beats, longest stall **246 ms**, **0** gaps over
    250 ms, same page (2,000) and same total (100,000).
    **Instrument control, run after the fix so a clean number cannot be the probe
    going blind:** `apkg:import` still parses on main by design, and the same
    heartbeat on the same fixture through it stalls main **4,414 ms**.
    Second defect the fixture found: `readConnectDraft` was the one reader with no
    upper page bound. Asked for 20,000 against the real 155,384-note collection it
    returned **20,000 notes / 20,223 cards** in one IPC message (29,067 ms) while
    the .apkg reader answered the same request at **2,000** — that control is what
    makes it a finding rather than a code reading. After: **2,000 / 2,223**,
    17,530 ms, `totalNotes` still 155,384. This is the unexplained 30–60 s step
    transitions recorded against that collection.
    **Still open, and the gate stays open for it:** the *window-dragging* half, and
    an in-UI filter/preview walk over the fixture. Note when picking it up that the
    renderer is now structurally bounded at `ANKI_DRAFT_MAX_PAGE_SIZE` (2,000) rows
    on every reader, so "filter 100,000" means filtering a page of a 100,000-note
    deck — the honest reading, not a shortcut.
10. Complete the primary workflows using keyboard only and verify focus, contrast, reduced motion, EN/JA/ZH/RU strings, and compact/default/maximized layouts.

    **Closed 2026-08-17** (`cd7472b6`). Everything unattended passed on 2026-08-16; the one
    remainder was step 7's PACKAGE branch, which renders only over an `.apkg` draft and so was
    unreachable without the OS file dialog. Reopen removed that dependency. Measured on the real
    `gate11-provenance.apkg` draft at panel width **694 px**: **8 text leaves, 0 clipped** on
    either axis, **0 overlapping pairs**. Facts line *"1 notes will be written with their new
    content"*, button *"Export a new package…"*. Negative control, both directions: zero changes
    renders *"The session adds up to no changes — there is nothing to export."* with the button
    **disabled**, one edit enables it, undo returns to the zero sentence. **Not** measured live:
    the refusal/error line — `DeckWorkbenchApply` deliberately ships no `outPath` so export runs
    through the OS save dialog, and the refusal codes remain test-covered only.
11. Follow the numbered flow to enrich a mixed deck from configured dictionaries, add new fields, resolve conflicting senses, update the template, and prove field-level provenance after export/reimport.

    **Closed 2026-08-17** (`cd7472b6`). The round trip and the inspector's *"Written from:"* line
    were each proven separately on 2026-08-16; what no agent could stage was both halves in the
    **same window**, because reaching the inspector on a reimported package needed the native file
    picker. Reopen is that missing entry. Live on the reimported package: note **2002 (猫)** shows
    **"Written from: JMdict (EN), Jitendex"** on its `Reading` field — **1** provenance line —
    while notes **2001** and **2003** show **0**. That asymmetry is the fixture's own control: a
    field this app enriched says so, a hand-typed one says nothing.
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

    **The `read-only`/`blocked` half closes 2026-08-17** (`6a295fec`, `8ce78564`, `25d30ebf`).
    There was no matrix; `shared/ankiParityMatrix.ts` is it, and *living* is the load-bearing
    word. Rows are keyed to `AnkiDraftEditOp['kind']` because `buildApkgExportChanges` folds
    the journal and nothing else — so a capability with no journal op cannot reach a
    destination **by construction**, which is what makes `read-only` a proof rather than a
    claim. Cells are keyed to each destination's own error union, so a `blocked` cell names
    the literal it throws. 16 rows, 6 journal-backed, 10 read-only; connect blocks the 2 the
    package writes. `conditional` codes ride on a `supported` cell without downgrading it,
    because they are limits of the source **file**, not of the capability.
    Guarded by 14 tests that re-derive each side from a different file — op kinds from
    `ankiDraftEdit.ts`, change-set fields from `ankiApkgExport.ts`, codes from both unions
    **and** from a `Refusal(` construction, explanations from all four catalogs, and the two
    blocked cells from `planConnectCommit` really throwing (its first direct coverage).
    Inverse control: a `supported` cell must have **no** `why` key. Mutation control:
    `deck-name`'s connect cell set to `supported` → 3 red including the behavioural one.
    Live on the running app: connect **16 rows / 4 changeable / 10 kept / 2 refused**,
    package **16 / 6 / 10 / 0**, the delta exactly `deck-name` + `template-remove`; **0** raw
    i18n keys, contrast **6.08–16.02** at **≥12.8 px**, **0** clipped rows at 760 and 420 px.

    **Re-scored 2026-08-17** (`0a51eec1`) — gate 5 widened the matrix and the numbers above
    went stale within a day. Same probe, same real component, same real catalog: connect
    **17 rows / 6 changeable / 8 kept / 3 refused** with **11** why-sentences and 3 codes
    verbatim (`card-flag-unsupported`, `deck-rename-unsupported`, `template-remove-unsupported`),
    package **17 / 9 / 8 / 0** with **8** why-sentences and 0 codes. Both partitions sum to 17
    exactly and each destination's why-count is exactly its non-supported rows. The delta is now
    `card-flag` + `deck-name` + `template-remove` — the live inverse control, carrying a row the
    first score could not have seen. **0** raw i18n keys, contrast **6.08–16.02** at **≥12.8 px**,
    **0** clipped rows. Instrument control: mounting with a destination the catalogs hold no key
    for makes the same probe report **12** raw keys, so `0` is a measurement rather than a
    counter that cannot fire. A canary in `ankiParityMatrix.test.ts` now hardcodes both
    partitions — deliberately the only hardcoded numbers there, since every other test
    re-derives from `ANKI_PARITY_ROWS` and is blind to it changing.

    **The connect half of the three new rows is now exercised LIVE, not cited**
    (`debug/g14-connect-live.cjs`, real Anki, AnkiConnect v6, profile `User 1`). On a deck the
    probe creates and deletes, so no existing card is touched: `card-flag` refuses live by
    name — `card-flag-unsupported`, with its translated sentence — and the `card-queue` op
    riding beside it in the same batch **wrote nothing**, the card byte-identical to before,
    which is the all-or-nothing contract proven live rather than in a fixture. The same two
    ops without the flag commit: `cardsUpdated` **1**, `verified: true`, and re-read through
    the app's own `readAnkiConnectDraft` as **suspended / interval 42 / ease 1900** (raw
    AnkiConnect agrees: `queue -1`). Cleanup verified — **0** cards left, deck no longer
    listed. Honest limit: the probe's own setup to a graduated review state did **not** take,
    so the card was `new` when the batch ran; `setSpecificValueOfCard` refuses **in band**
    without `warning_check: true`, which the product already passes and decodes
    (`main/anki/client.ts:233`, `connectCommit.ts:179`). Gate 14's connect `supported` set is
    therefore 6 rows of which 3 are now live-proven here and 3 remain cited.
    **Its finding:** `template-add` is read-only on *both* destinations — `applyCardDesign`
    returns a draft and never touches the journal, so gate 13's 3,180 added cards were never
    exportable. The designer now says so between its card count and Apply.
    The `supported` half is **cited, not re-run**: each of the 6 journal-backed rows has its
    own dated live entry in the evidence ledger (recipes 2, 12, 6, 13, 12-deck, 17).

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
- Shipped 2026-08-16: **recipe 18 — CLOSED as a find-and-preview recipe** (`0a5a2e17` model recovered + `stale:` predicate + the `schema.stale` wiring, `0446c4c0` the `DeckWorkbenchStale` panel, `7eeccd5` the live run's finding). `shared/ankiStaleCards.ts` reports **two axes and never sums them**: `overdue` is `today - due`, a day Anki *planned*, and `dormant` is days since the revlog's newest entry, a day the user actually studied — a deck abandoned mid-way is deep in both while one rescheduled by a preset change is deep in `overdue` alone, and a single "staleness score" would call those the same deck with no defensible exchange rate between them. `withheld` outranks both because its remedy differs in kind: a new due day on a suspended card is a number Anki will never read. Like recipes 8, 15 and 16 the verb is **find and preview**, so it proposes and never writes; `reset` is refused whole by name (`reset-unsupported`) and shown **disabled with its reason rather than hidden**, because the journal carries field/tags/card-due/card-deck/deck-name and a reset must write type, queue, reps, lapses, interval and ease and drop the revlog. **The recovery is the story of the first commit:** the model, its 26 tests and the parse were written 28 seconds before a usage limit and sat untracked with **zero** consumers — `DeckWorkbenchBrowser` never built `schema.stale`, so every `stale:` query would have parsed to `no-stale-context` and rendered a tidy refusal, which reads exactly like a deliberate design. That refusal is therefore the wiring test's **negative control**, and deleting the one wiring line fails 2 of its 3 tests while the refusal test still passes. **Live on the user's 33 real packages with no dialog** (`readApkgDraft {filePath}`, the real module imported from the dev server — `debug/r18-live.cjs`): **52,144 cards, 0 read errors**, every tally partitions exactly (`sum === cards`, 33 of 33), worst scan **4 ms**, `reset -> reset-unsupported` on all 33, and the round-robin spread is provably even with **max−min = 1** on every deck that moves (67–68/day over 14 days on 実験's 946 moves, 52–53 on 729, 47–48 on 661, 18–19 on 263, 11–12 on 161, 6–7 on 88). **The live finding, fixed in `7eeccd5`:** all 33 returned `reviewHistory: 'present'` with **0** revlog rows, while `N1 Vocab 3333….apkg` holds **748** cards with `reps > 0` at max **41** reps, 実験 **959** at max 35 and `XXXX….apkg` **676** at max 40 — a card reviewed 41 times beside a log saying nobody ever reviewed anything is a **dropped export**, so `dormant: 0` on those decks was a false claim and the panel's own notice, firing only on `absent`, never fired at all. The empty log now splits by whether the cards agree with it — `empty` (no card claims a review, so the zero is true) versus `dropped` — behind one predicate, `staleHistoryIsReadable`, that both the notice and the disabled threshold read so they cannot drift apart. Re-measured after the fix on the same 33: **17 dropped, 16 empty, 0 present, 0 absent**, with the user's own `N1 Vocab 3XXX….apkg` (1,437 cards, 0 reps, 0 rows, panel silent) as the negative control. It corrected recipe 18's own test, which had required `present` for an empty log. **Still open, deliberately:** the *apply* half. A reschedule is `card-due` ops the journal already carries, so it is buildable — but it is a tray action kind and belongs with recipes 19/20/26 rather than smuggled into a preview. Recipes still without a tray action kind: **18–20, 26** (18's preview ships; its writer does not).
- Shipped 2026-08-17: **recipe 19 — CLOSED** (`814e83e3` model + 12 tests, `6af0f023` the `add-cloze` tray action, its 7 problem codes, the step-4 form and 13 keys ×4). `shared/ankiClozeCandidates.ts` finds a note's own word inside its own sentence and wraps it in the next free `{{cN::…}}`. **The load-bearing refusal is `not-cloze`:** a marker generates cards on a cloze note type and renders as literal braces on a standard one, with no error, no empty card and no warning — a batch that wrote into a standard type would report every note changed and silently corrupt the only copy of the field, so the kind is checked per note before any candidate is proposed. **Two texts, deliberately:** cover is answered on `normalized`, which is what recipe 16 uses, so the two recipes cannot disagree about whether a sentence contains its word; the write lands in `raw`. When normalized finds it and raw cannot be wrapped, markup runs through the match — `html-split`, a distinct refusal, because reporting "the sentence lacks its word" about a sentence that visibly contains it is a false claim. **A `stem` match wraps the stem and nothing more, and ships off by default:** the fluent cloze over 昨日ケーキを食べました covers 食べました, but extending across the trailing kana run swallows the particle in 食べましたが and reads as fluent Japanese while testing the wrong span — recipe 16's "a false stem hides the defect, a false unknown leaves it undecided" applied to the write side. Ordinals allocate note-wide because Anki numbers deletions across the whole note, and `already` makes a second Apply a no-op instead of `{{c2::{{c1::猫}}}}`. In the tray it is a **step 4** action, not step 3: it brings in no dictionary, reading or generation and rewrites text the deck already holds — though it is the only field action that changes the card count, which it does not restate because `writeNoteField` already raises the existing `cloze-cards-change`. The seven non-`ready` outcomes map to problem codes through a total `Record` rather than a ternary chain, since this file has mapped a `fill-reading` refusal to the wrong code once already. **Live on the user's 33 real packages with no dialog** (`debug/r19-live.cjs`): **38,283 of 38,283 notes `not-cloze`, 0 of 33 packages hold a cloze note type** — the guard firing on 100% of real data and measuring nothing else, so it is recorded as a **FINDING, not a pass**, exactly recipe 17's clean-sweep shape. **The positive control on real text** (`debug/r19-positive.cjs`, note-type `kind` flipped to cloze **in memory only**, nothing written and no package modified): 14 of 33 packages declare both a sentence and a word field and 19 are skipped by name rather than counted as zeros; `Re_Zero kara Hajimeru Isekai S.apkg` (2,000 notes, `Lapis (Jiten)` [Expression / Sentence]) gives **ready 1,862 = exact 1,586 + stem 276**, not-found 19, unknown 119, summing to **2,000 of 2,000**, with real spans wrapped through real HTML (`無論、三十を<b>{{c1::超える}}</b>魔手の猛攻は…`) and the stated under-coverage visible in the output rather than asserted (`<b>{{c1::命を落と}}した</b>`, `<b>{{c1::突き出}}し</b>`). Three controls, 0 violations each: the ladder is monotonic on every package (exact-only 1,586 ≤ no-stem 1,586 ≤ all 1,862), a second pass over the written text is **ready 0 / already 1,862** so the marker is never nested, and a tray with no mode selected **blocks** rather than running to a zero. Worst scan **29 ms** for 2,000 notes. **Trap:** `html-split` fired **0** times across 13,878 real notes — it is fixture-proven only, do not cite it as field-measured. Recipes still without a tray action kind: **18, 20, 26** (19 now ships both a model and a writer; 18's preview ships and its writer does not).
- Shipped 2026-08-17: **recipe 18 — CLOSED** (`788ad0a2`), and **recipe 20** (`2724d947`). `reschedule-stale` turns recipe 18's spread into `card-due` ops, the op kind recipe 6 already carries to a package and to live Anki; `nowMs` is stamped at Add so a dry run and its apply cannot straddle a day boundary, and `reset` blocks by name (always, unlike `leech-reschedule-unsupported`, because it is the action's whole mode). **The defect it found is in the shipped model:** `overdueDays` is clamped at zero, so a review card due today or later reads `null`, and `planStaleRemedy` read exactly that to decide whether a card *has* a due day — a **dormant card whose due is still ahead** was refused `not-review`, which is false about a review card and is the recipe's headline case, a deck abandoned before its cards came due. `StaleCardFacts.dueDay` is the unclamped answer; mutation control fails 3 of 12 tests. Recipe 20 (`shared/ankiSourceContext.ts` + the `restore-source` tray action) decodes only what a note already carries and ships the exact evidence string beside every value. **Its facet list was decided by measurement:** `videoClipFilename` encodes `<track>-<cueIndex>` and the start milliseconds, so timestamp and cue are exact — but the **title is not in the filename at all** and the seed's `[^a-zA-Z0-9]+ -> '-'` pass turns a Japanese title into the literal `clip`, so `title` comes from the card's deck path and nowhere else. There is **no `url` facet**: `extensionServer.ts:763` stores no page address, and a facet with nothing behind it is a promise the data cannot keep, so the form states the limit instead. Recipes still without a tray action kind: **26** — plus recipe 17's *remove* half, which must refuse by name at the live destination since AnkiConnect has no remove-template action.
- Shipped 2026-08-17: **recipe 17's remove half — both destinations, no tray action yet** (`084a052b` model + 12 tests, `2ea9e8f6` the package writer, the live refusal and 5 keys ×4). **Writer-first on purpose:** a `remove-template` tray kind landed first would be a control no destination could answer, so the destinations went in first and the planner sits as a `pending test-only-module` in `tools/architecture-baseline.json` until the kind lands — recorded there rather than hidden behind a premature consumer. `shared/ankiTemplateRemoval.ts` consumes `ankiSiblingAudit`'s verdicts and never re-decides them: **only `duplicate` is removable, and `ambiguous` is refused BY NAME** (`not-duplicate`) rather than merely left out of the offer, because a request assembled some other way must hit the same wall. Six refusals, every one reachable from a test, including **`is-keeper`** as distinct from `not-duplicate` — "that is the template being kept" and "no group covers it" send the user to different fixes, and one code would be false about the keeper. **Renumbering is the load-bearing half, not bookkeeping:** Anki binds a card to its template by `ord` alone, so dropping ord 1 of [0,1,2] without moving the rest turns every ord-2 card into a card whose ord names no template — precisely the `orphan` verdict this recipe exists to clear. Templates and cards renumber in one pass, and all removals on a note type renumber **together** (survivors ranked), never one after another, which is only the same arithmetic in descending order; both SQL loops run **ascending** by source ord so each destination is already vacated. **Negative control fails as required, on both sides:** `templateRemovalOrphans` is 0 after a mid-list removal and **2** on the same after-draft with the card half undone, and in SQL 0 cards name a missing template after a removal while **2** do once `UPDATE cards SET ord = 2 WHERE ord = 1` is applied. **The package destination writes for real in both schemas** — `templateStorage()` is its own ladder, decided separately from `deckStorage` because a collection can normalize one and not the other; schema 18 keeps the template list in its own table with a plain integer `ord`, so `notetypes.config` is never decoded and is **asserted byte-identical** across a removal, while legacy rewrites `col.models` in one parse/write for the batch. **The live destination refuses by name** (`template-remove-unsupported`) before write #1, exactly where `deck-rename-unsupported` sits, and the reason was re-derived rather than inherited: the emulation is *worse* than the rename's, since `updateModelTemplates` cannot drop a template but only blank it — leaving every card it generated rendering empty — and deleting the cards alone fails because Anki regenerates them. Both refusal controls hold: the card count is unchanged across all four package refusals, and the field edit sharing a batch with a removal does not land live (0 mutating calls). The change set carries **only** `{noteTypeId, removedOrds}` — the ord map and the doomed card rows are derived from the collection about to be written, so a draft read minutes ago cannot disagree with the package. `cardsDeleted` is reported apart from `cardsUpdated`, the only count in the result that describes destruction. **Trap for the tray slice:** a `template-remove` journal op cannot be added naively — the journal's own rule is that every op is a complete inverse (see its `card-due` comment refusing a queue change), so undoing a removal must restore the template AND every deleted card row; decided that the op carries both verbatim, legitimate here because the draft does hold them, bounded by cards-per-template (2,000 on the user's largest real package). Recipes still without a tray action kind: **17's remove half and 26**.
- Shipped 2026-08-17: **recipe 17 — CLOSED** (`ea8fbbd5` the journal op + export fold, `e2635c6c` the tray action kind + 11 keys ×4). The remove half finally has a control, and both destinations that shipped in `2ea9e8f6` are now reachable from the product. **The op is a complete inverse and carries what it destroys verbatim** — the template, every deleted card row, and the survivor renumbering — which is legitimate here, unlike the review history `card-due` refuses to reconstruct, because the draft genuinely holds those rows at the moment the removal runs; bounded by cards-per-template, 2,000 on the user's largest real package. **It also carries `cardIndexes`, and the negative control is what justifies that field:** this is the first op in the journal that changes an array's LENGTH, so the first that can put rows back in a different order than it found them, and the Browser renders `draft.cards` in order — with `cardIndexes` stubbed the restored card SET is still exactly right and only the order is wrong, so a membership assertion passes against the broken code. **The slice's real finding, and the trap for recipe 26: a second removal on one note type names an ord the FIRST removal renumbered.** Source [0,1,2], drop ord 1, survivors renumber to [0,1] — a later op removing "ord 1" means source ord 2, and exporting the op's own number would delete the template the user deliberately KEPT. Each note type therefore carries a current→source map rebuilt from each op's own `renumbered` pairs; mutation control replacing `sourceOrd(op.template.ord)` with `op.template.ord` fails exactly one test. **A second control was corrected mid-slice rather than reported:** dropping `renumbered` from an op does not orphan anything — it collides two templates on one ord, [0,1,1], and `templateRemovalOrphans` reads **0**, because every card still names *a* template, just the wrong one; a collision is not an orphan, so the round trip asserts the template list itself and not that number. **Structural ops run as a whole-step pass and never through `applyInverseInto`**, which writes through a `DraftEditIndex` mapping ids to FIXED array positions built once per step — re-inserting rows invalidates every position after the insert; it is gated by `step.some(...)` exactly the way `relinkDeckParents` already is, so a step with no removal pays nothing, and for the same reason the tray rewrites its working `cards` array **in place** and rebuilds `index.cardPosition` immediately after. **The sibling audit arrives through `opts.templateGroups` rather than on the action** — `draftTemplateGroups` was measured at 1,014 ms on a real 5-template / 2,000-note package and this planner is recomputed on every render — and its absence is **blocking**, which matters more than `no-enrich-data` does: with no audit every ord comes back `not-duplicate`, which the user reads as "this deck has no duplicates", the exact opposite of what an unrun audit means. **The action is selection-independent** because a template belongs to a note TYPE, which required widening the empty-selection guard that previously exempted `normalize-decks` alone. Two further findings were the model being right and the test being wrong: asking for EVERY ord refuses all of them `last-template` rather than removing all but one (the guard is per note type, not per request), and a note type is cloze by `type: 1` and not by its name — both now carry their own test. `editedNoteIds`/`noteIsEdited`/`auditedNoteCount` skip the op beside `deck-name`, since a removal spans every note of its type so any single attribution is false about the rest, and the review counts `templatesRemoved`/`cardsDeleted` apart instead — `cardsDeleted` separate from every other number because it is the only one describing destruction. `TEMPLATE_REFUSAL_PROBLEMS` is a total `Record`, so a refusal added later fails to compile rather than silently losing its user-facing row, and `ankiTrayProblemStrings` caught all 11 missing strings plus the missing kind name before anything ran — the gate recipe 13 shipped without. `test-only-module:ankiTemplateRemoval.ts` was deleted from `tools/architecture-baseline.json`; its own note said it stops being test-only when this kind lands. Recipes still without a tray action kind: **26**.
- Shipped 2026-08-17: **recipe 26 — CLOSED, and it completes the catalogue: every one of the 26 smart recipes now exists** (`9e758f5e` model + 21 tests, `9d053c08` the Workload panel + 24 keys ×4, `eb2ea915` the live run's own finding). Recipe 26's verb is *estimate*, so like recipes 8, 15 and 16 it is a **report, not a tray action** — and here that is forced rather than chosen: the deck-options preset is not in an `.apkg` at all (`RawAnkiCardRow` has no `data`, there is no `dconf`/`deck_config` reader), so the workbench cannot carry the change and an Add button could only be inactive. `shared/ankiSchedulingImpact.ts` therefore states its provenance on screen — intervals `read`, both ends of the proposal `stated`. **Per-card FSRS stability is likewise unreadable and it does not matter:** `t(r) = (S/FACTOR)·(r^(1/DECAY) − 1)` is linear in S, so a retention change is a pure interval multiplier in which S cancels, asserted across S = 1…4,000. Workload is `Σ 1/interval`. **The lie the recipe exists to avoid, and its control: a proposal moves no already-scheduled card** — Anki reschedules at the card's next answer — so the horizon is rendered apart and never redrawn; scaling its rows by `1/intervalRatio` fails exactly the one test that flips 85→95 and asserts the rows survive while the estimate reverses. **Live over 8 real packages: 3 project, 5 refuse, and the refusals are the honest majority.** `N1 Vocab 3.apkg` 92 scheduled / 66 unscheduled, load **53.641 → 32.760** at 0.90→0.85 and **→ 116.468** at 0.90→0.95, mean interval 4.2 → 6.9 d, backlog 88, horizon(30) 0; `Default-20260129112153.apkg` 10 scheduled with **46 filtered** (the on-loan exclusion firing on real data); `5y56454w54.apkg` 54 of 608. Ratio was **1.6374** / **0.4606** identically on all three, the horizon byte-identical under opposite proposals on all three, and `0.90→0.90` exactly `ratio 1, delta 0`. **The live run's own finding, fixed in `eb2ea915` and it was already shipped in recipe 18:** `apkgImport.ts:465` passes `col.crt` through unchanged and `Ginga Eiyuu Densetsu.apkg` reports **crt 0**, which is finite — so `todayDueDay` returned ~20,700 and recipe 18 called every review card overdue by twenty thousand days. Both modules now refuse `no-collection-origin` on `<= 0`; recipe 18's existing test was titled "instead of counting from zero" and supplied an *absent* origin, so the literal zero walked past it. Recipes still without a tray action kind: **none — the catalogue is complete.**
