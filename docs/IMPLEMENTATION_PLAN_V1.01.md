# Implementation Plan — Road to v1.01

Phased plan for Plans 0.5–9. Each phase lists current state, design, files, and acceptance criteria.
Scope rule per CLAUDE.md: all code changes stay inside `src/` (exception flagged in Phase 10 packaging).

**Build order tweak (binding, not optional):** 0.5 → 6 (download manager core) → 2 (i18n) → 1 → 3 → 3.5 → 4 → 4.5 → 5 / 5b → 8 → 9 → 6.5 → 7 (postponed until after 6.5) → 11 → 9.5 (onboarding tour — last phase before release) → 10.
The download manager (Plan 6) must be built **before** the OCR/transcription model swaps (5/5b) — new models land through it from day one, never bundled. The level system (0.5) is built **first of all** — it feeds Plans 1 (reading finder defaults), 3 (game difficulty), 5b (media sorting), and 9 (reader auto-sorting). i18n (2) exists before minigames (3) ship UI strings. **Stabilization (6.5) waits until after the environment switcher (8) and Chrome extension (9)** so the bug-pass covers those surfaces. **Pronunciation (7) is postponed** until after that stabilization pass. Data resiliency (11) lands **before** the final release pass (10) — v1.01 must ship with backups and the mining queue: … 7 → 11 → 9.5 → 10.

Each phase ends with a **Pitfalls** block: the known ways this phase goes wrong or gets misread. Treat them as requirements, not commentary.

Each phase also ends with a **Next up** rule: which model and tool to use for the *next* phase in the build order, per the blueprint below.

---



## Model allocation blueprint


| Task type                                                      | Model     | Tool                    | Why                                                                                                                                                       |
| -------------------------------------------------------------- | --------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Heavy coding & system integration (0.5, 4, 5, 5b, 6, 7, 9, 11) | Opus 4.8  | Claude Code             | Gold standard for agentic coding; deep architectural reasoning for delicate subsystems, with native machine access to run tests at compilation boundaries |
| UI, views & animation work (2, 3, 4.5, 8, 9.5)                 | Sonnet 5  | Claude Code             | Fast iteration on TSX/CSS; strong design reasoning; check the Electron app after every loop                                                               |
| Linguistic logic & grading design (3.5 rubric, tour dialogue)  | Fable 5   | Claude.ai chat / Cowork | Next-generation reasoning for evaluation criteria and character writing — design *before* coding                                                          |
| Mass data generation (graded sentences, 100 mirror texts)      | Sonnet 5  | Cowork (background)     | Bulk jobs that ingest local lists and write structured JSON assets while you're away                                                                      |
| Formatting, tests, docs (6.5, 10)                              | Haiku 4.5 | Claude Code / Claude.ai | Fast and cost-effective for linter fixes, test scaffolding, markdown upkeep                                                                               |


General rule: design/content with Fable 5 or Cowork first, build with Opus 4.8/Sonnet 5 in Claude Code, clean up with Haiku 4.5. Same model = same code quality per response; the tool choice is about the feedback loop (Claude Code runs your Windows build natively).

---



## Phase 0.5 — Level Meter (streamlined JLPT/HSK detection)

**Current state:** `src/renderer/levelLists.ts` already supports paste-based JLPT/HSK/custom lists, lemma-folded via `tokenizer.ts` and matched against `knownWords.ts` (progress = % words at Familiar+). Anki sync exists in `src/main/anki/` + `ankiSync.ts`.

**Design:**

- New `LevelService` (renderer module `levelService.ts`) as the single source of truth:
  - `getUserLevel(lang): 1..7` and `onLevelChange` event; consumed by Reading Finder, minigames, media sorting, reader sorting.
  - JP scale: 1 Beginner (pre-N5), 2 N5, 3 N4, 4 N3, 5 N2, 6 N1, 7 Advanced (post-N1 / literary). ZH: HSK1–6 mapped to 1–6, 7 advanced.
  - A level counts as reached when coverage of its list ≥ threshold (configurable, default 80%). Level 7 inferred from custom advanced lists + total known-word count.
- **.apkg upload:** parse Anki decks directly (apkg = zip containing SQLite `collection.anki21`). Unzip + read with `sql.js` in a worker (per CLAUDE.md: heavy work off the UI thread), extract the mapped expression field (reuse `fieldMapper.ts` heuristics), lemmatize async, feed into the existing LevelList store. One slot per N-level / HSK-level with "Paste words" OR "Upload .apkg".
- **Duplicate expression handling:** decks routinely hold multiple cards per word (recognition/production templates, inflected forms). The worker de-duplicates *after* lemmatization so the known-word count is never falsely inflated.
- **UI:** Settings > Study > "Level" section: 5 JLPT slots + 6 HSK slots + custom; a single level meter widget (7 segments) showing the computed level, per-list coverage bars. No decorative emojis; Fluent styling.

**Files:** `levelLists.ts` (extend), new `levelService.ts`, new `apkgImport.ts` (+worker), `components/settings/pages/StudyPage.tsx`, `StatisticsView.tsx` (show meter).

**Accepts when:** uploading an N4 .apkg populates the slot in <5s without UI lag; importing an .apkg with duplicate vocabulary or multiple card templates resolves to a unique, lemmatized vocabulary list in the store; meter updates live; `getUserLevel()` returns stable values consumed by at least StatisticsView.

**Pitfalls:**

- Newer Anki exports use `collection.anki21b` (zstd-compressed) — decompress or reject with a clear "re-export as legacy .apkg" message, never a silent failure.
- Expression fields contain HTML and bracket furigana (`漢字[かんじ]`) — strip both before lemmatizing or every entry misses the knownWords key.
- 30k+ card decks: stream/chunk the SQLite rows in the worker; one big pass will still freeze via structured-clone spikes.
- A word can sit in several N-lists (N5 word re-listed in an N2 deck) — coverage math must count it once per list, not globally dedupe across lists.

**Next up (Phase 6, download manager):** Opus 4.8 in Claude Code — state machines, streaming hashes, and filesystem edge cases need deep reasoning plus native test runs.

---



## Phase 1 — Reading Finder ("find your ultimate what-to-read")

**Current state:** `data/novels.ts` is a hand-curated novel browser with a 5-tier difficulty guide; `readabilityExtract.ts` + NovelReader already open external pages readably.

**Design — new** `ReadingFinderView`**:**

- Filters: level (7-tier, defaulting to user level ±1 from LevelService), site, genre, length (short story / serial / full novel), furigana availability, completed vs ongoing, free vs freemium. "Surprise me" random pick within filters.
- **Comprehensibility score (killer feature):** for any candidate the user opens, fetch text, tokenize, and show "% of words you already know" against `knownWords` — an honest per-user difficulty number, not just a static tag.
- **Continue Reading state:** opening a web novel saves chapter URL + position; ReadingFinderView gets a "In Progress / Recently Read" strip so nobody re-hunts for chapter 47 by hand.
- **Advanced de-inflection (dictionary core):** the lookup pipeline must trace heavily conjugated forms (食べさせられた, nested causative-passives, ～てしまう contractions) back to dictionary roots via iterative Yomitan-style de-inflection rules, tagging the conjugation path in the popup — tokenizer lemma alone is not sufficient.
- Results open in NovelReader via existing readability pipeline so dictionary popup + mining work everywhere.

**Site directory (seed catalog,** `data/readingSites.ts`**) — ~24 candidates with level tags:**


| #   | Site                                      | Levels | Notes                                                    |
| --- | ----------------------------------------- | ------ | -------------------------------------------------------- |
| 1   | Tadoku free graded readers (tadoku.org)   | 1–3    | Purpose-made for learners                                |
| 2   | yomujp (日本語多読道場)                          | 1–4    | Graded readers with audio                                |
| 3   | NHK News Web Easy                         | 1–2    | Furigana, simplified news                                |
| 4   | 絵本ひろば (Ehon Hiroba)                       | 1      | Free picture books                                       |
| 5   | 福娘童話集 (Hukumusume)                        | 2–3    | Folk tales, many with audio                              |
| 6   | Matcha (Easy Japanese mode)               | 2–3    | Travel/culture magazine                                  |
| 7   | Todaii / Easy Japanese (easyjapanese.net) | 2–4    | Graded news with tools                                   |
| 8   | Satori Reader                             | 2–4    | Freemium, graded, audio                                  |
| 9   | 毎日小学生新聞                                   | 3      | Elementary-school newspaper                              |
| 10  | NHK News Web (regular)                    | 4–5    | Standard news                                            |
| 11  | 小説家になろう (Syosetu)                         | 3–6    | Largest free web-novel site                              |
| 12  | 小説を読もう (yomou.syosetu.com)                | 3–6    | Narou ranking portal                                     |
| 13  | カクヨム (Kakuyomu)                           | 3–6    | Kadokawa web novels, contests                            |
| 14  | アルファポリス (Alphapolis)                      | 3–6    | Web novels, mixed free/paid                              |
| 15  | ハーメルン (Hameln)                            | 3–6    | Fanfic + originals                                       |
| 16  | pixiv小説                                   | 3–6    | Short fiction, fan + original                            |
| 17  | エブリスタ (Everystar)                         | 3–5    | Short mobile-first fiction                               |
| 18  | モノガタリー (monogatary.com)                   | 3–5    | Short stories, Sony-run                                  |
| 19  | ノベルアップ+ (Novelup Plus)                    | 3–6    | Web novels                                               |
| 20  | NOVEL DAYS (Kodansha)                     | 3–6    | Web novels, chat-fiction                                 |
| 21  | 魔法のiらんど                                   | 3–5    | Romance/teen focus                                       |
| 22  | note.com                                  | 4–6    | Essays and blogs, native                                 |
| 23  | 青空文庫 (Aozora Bunko)                       | 5–7    | Public-domain classics; 7 = bungo/pre-war orthography    |
| 24  | ノクターン/ムーンライト (Narou 18+)                  | 4–6    | Age-gated; hidden behind an adult toggle, off by default |


Each entry: `{ id, name, url, levels: [..], genres, furigana, lengthKinds, lang: 'ja', adult?: boolean }`. Catalog is data-only, so adding sites is a one-line change. ZH equivalents (e.g. qidian, jjwxc) can land later behind the same schema.

**Files:** new `data/readingSites.ts`, new `views/ReadingFinderView.tsx`, sidebar entry, reuse `readabilityExtract.ts`, `levelService.ts`.

**Accepts when:** filtering by level 2 shows only 1–3-tier sites; comprehensibility % renders for a fetched chapter; 食べさせられた resolves to 食べる with its conjugation chain shown; closing and reopening a novel restores the exact position; every result opens minable in the reader.

**Pitfalls:**

- Fetch site content in the **main process** (CORS blocks renderer fetches); send a normal browser UA and respect robots — pixiv needs login, some Narou pages paginate, so readability extraction must handle "next page" chains or show partial-content honestly.
- Comprehensibility % is inflated downward by proper nouns — filter name-POS tokens before scoring or every fantasy novel reads as "hard".
- Save reading position as chapter URL + paragraph index / text anchor, **not** pixel scroll offset — re-fetched pages reflow.
- De-inflection needs a max rule depth and cycle guard, or 行った-style ambiguity (行く/行う) loops; always return *all* candidate roots ranked, not the first hit.
- Site catalogs rot — every entry needs a last-verified date and the UI needs a graceful "site unreachable" state, not a spinner.

**Next up (Phase 3, Game Arena):** Sonnet 5 in Claude Code for the platform and game UIs; in parallel, Sonnet 5 in Cowork runs the offline sentence-grading bulk job into `data/gradedSentences/`.

---



## Phase 2 — Whole-app language switch (EN / JA / ZH / RU)

**Design:**

- Lightweight i18n, no heavy framework: `src/renderer/i18n/` with `en.json`, `ja.json`, `zh.json`, `ru.json` + `t(key, vars?)` and a `useT()` hook; event-driven live switch (same pattern as `theme.ts`), no reload.
- String-extraction pass over all views/components/settings (largest single chunk of work — do it view by view; CommandPalette, settings registry, and Sidebar first since they touch everything).
- Main process (menus, tray, dialogs) reads the same catalogs from `src/shared/`.
- Font stacks verified for CJK + Cyrillic; date/number formatting via `Intl` with the active locale.
- Selector in Settings > Appearance; persisted with existing prefs storage.
- **System IME / keyboard hinting:** every CJK-accepting input (search bars, minigame answer boxes) sets an explicit `lang` attribute (`lang="ja"` / `lang="zh"`) so OS IMEs auto-switch to the right mode on focus.

**Accepts when:** switching to RU live-swaps sidebar, settings, popups with no reload and no clipped layouts; missing keys fall back to EN and log once; focusing a JP answer field flips a configured IME to Japanese mode.

**Pitfalls:**

- UI language ≠ study language — never translate study *content* (deck names, mined sentences, dictionary entries), only app chrome. Keep the two selectors separate from day one.
- Russian needs real plural rules (1/2–4/5+ forms) — a naive `t(key, {n})` ships broken strings; support at minimum a `{count, plural}` form.
- Han unification: the same codepoints render with Japanese vs Chinese glyph forms depending on `lang` — set `lang` on the document root too, or ZH UI shows JP-shaped characters and vice versa.
- RU strings run ~30% longer than EN — audit fixed-width buttons/sidebars, don't discover it per-view later.
- Dynamically built strings (`"Deleted " + n + " cards"`) are invisible to extraction — grep for string concatenation near JSX during the extraction pass.

**Next up (Phase 1, Reading Finder):** Opus 4.8 in Claude Code for the de-inflection engine and main-process fetch pipeline; switch to Sonnet 5 for the filter/browse UI.

---



## Phase 3 — Game Arena Platform & Baseline Games (10 fast games, zero runtime AI)

The Game Arena is a dedicated, high-fidelity sub-view inside the app — a platform new games plug into, not a menu of one-offs.

**Principle:** *no AI generation at play time.* All content is pre-graded offline and bundled/indexed locally, so rounds start instantly. Sentence source: the existing offline Tatoeba store (`src/main/dictionary/tatoebaOffline.ts`) has JA sentences with EN/RU/ZH translations — grade each sentence offline by JLPT-vocab coverage + length into levels 1–7, ship as indexed JSON buckets.

**Shared engine (**`games/engine.ts`**):** round timer, streak/combo scoring, level selection (defaults from LevelService), source-language setting (EN/RU/ZH per user), shared result screen. The engine tracks **accumulated XP, active streaks, and per-game high scores**, all persisted through `stats.ts` — XP and badges (Phase 3.5) hang off this one progression store. Every game reports completion through a single callback contract: `{ score: 0–100, accuracy, mistakes[] }` — this is what badges, XP, and the result screen consume, and what any future game must implement.

**In-view settings:** the Arena has its own Settings button that deep-links to a dedicated Game Arena sub-section of the main Settings page (registered in `settingsRegistry.ts`) — game length, source language, level override, sound toggles.

**Launch lineup (10):**

1. **Sentence Builder** — shown an EN/RU/ZH sentence, reorder shuffled JP tokens to rebuild the translation.
2. **Speed Type** — type the JP translation; fuzzy kana-normalized scoring.
3. **Word Match Rush** — 60-second word↔meaning pair matching grid.
4. **Kana Sprint** — timed kana↔romaji conversion (levels 1–2).
5. **Kanji Reading Attack** — pick the correct reading of a highlighted word, 4 choices, timed.
6. **Cloze Blitz** — fill the blank in a JP sentence from 4 options.
7. **Listening Flash** — TTS (`tts.ts`) speaks a sentence; pick the right meaning.
8. **Particle Panic** — choose the correct particle (は/が/を/に/で…) under time pressure.
9. **Counter Quiz** — pick the correct counter word for object+number prompts.
10. **Reverse Recall** — see JP, answer meaning in the user's source language.

All games: language settings honored (UI via Phase 2 i18n, content via source-language setting), difficulty follows user level, every wrong answer offers one-tap mining to Anki.

**Files:** new `views/GameArenaView.tsx`, `games/` folder (engine + one file per game), offline grading script under `tools/` writing to `src/renderer/data/gradedSentences/`, Arena section in `settingsRegistry.ts`.

**Accepts when:** any game launches to first question in <300ms; 10 games playable; language + level switches affect content immediately.

**Pitfalls:**

- Tatoeba RU/ZH coverage is far thinner than EN — when a pair is missing, fall back to EN for that sentence rather than shrinking the level bucket to nothing.
- Prefer *directly linked* translation pairs; indirect (JA→EN→RU) chains drift in meaning and make "wrong" answers right.
- Translation games have multiple correct answers — Sentence Builder must accept alternative valid orderings (or restrict to short sentences where order is forced); Speed Type needs kana-normalized fuzzy matching with an alternatives list, not string equality.
- Shuffling can reproduce the original order — reshuffle until it differs.
- Key highscores by game+level+source-language, or switching language wipes apparent progress.

**Next up (Phase 3.5, Mirror Writing):** three-model split — the 100 graded texts: Sonnet 5 in Cowork as a background bulk job; the grading rubric + evaluator prompt: Fable 5 in chat, tested on sample essays *before* any code; the game UI and evaluator plumbing: Sonnet 5 in Claude Code.

---



## Phase 3.5 — Game Arena: Mirror Writing & AI Evaluation Loop

The one deliberate exception to "no runtime AI": a rigorous active-recall *writing* game where slow, asynchronous evaluation is acceptable because the user just spent 10 minutes writing — this is not a fast-paced game.

**Design:**

- **Content:** ~100 graded Japanese paragraphs, essays, and mini-texts (levels 1–7, tagged by LevelService scale), bundled as data. Each text ships with a structured **idea map**: sentence-by-sentence semantic prompts (English/RU/ZH concept translations) that tell the user *what to express* without showing the Japanese.
- **Flow:** user reads the idea map → manually drafts the Japanese text (IME-friendly textarea) → submits → asynchronous AI evaluation → multi-axis score card.
- **AI grading pipeline:** pluggable evaluator interface with two backends: (a) a local LLM runner (ONNX/Transformers.js, model delivered via the Phase 6 download manager), and (b) a lightweight user-configured API endpoint (URL + key in settings, off by default). Evaluation runs fully async in a worker/main — the UI never blocks.
- **Evaluation metrics (100-point scale, four axes):** Grammar Accuracy, Lexical Density/Vocabulary, Natural Flow/Collocations, Semantic Fidelity (does it express what the idea map asked). Score card shows per-axis scores + concrete diagnostic tips (each tip anchored to a quoted span of the user's text).
- **Badge system:** persistent visual badges ("Grammar Warden", "Flow Master", "Kanji Scholar" and similar) awarded on milestone scores, stored with XP in the Phase 3 progression store; badge inventory visible in the Arena.
- The reference answer (original text) is revealed only after grading, side-by-side with the user's draft, differences minable.

**Files:** `games/mirrorWriting/` (view, evaluator interface, backends), `data/mirrorTexts/`, badge store in `stats.ts`.

**Accepts when:** submitting a Japanese paragraph triggers an asynchronous AI evaluation, renders a multi-axis score card out of 100 with detailed diagnostic tips, and updates the user's Game Arena badge inventory without freezing the UI thread; with no local model installed and no API configured, the game clearly offers the model download instead of erroring.

**Pitfalls:**

- Small local LLMs grade Japanese unreliably — constrain hard: rubric-anchored prompt, temperature 0, strict JSON schema output with validation + one retry; if output still fails schema, show "evaluation unavailable", never a fabricated score.
- Grading must be *stable*: resubmitting the same essay should score within a narrow band, or users learn the grader is noise. Pin badge thresholds to the evaluator version — swapping models shifts score distributions.
- **Privacy:** user text leaves the machine only via the explicitly user-configured API backend — off by default, with plain wording in settings. The local path is the default (offline-first rule).
- IME composition: the textarea must not intercept keys mid-composition (composition events guard) or Japanese input breaks — test with Windows IME, not just typed romaji.
- The real work is content, not UI: 100 idea-mapped, level-graded texts is an authoring pipeline (`tools/` script + review pass), budget it like a feature.

**Next up (Phase 4, Shimeji):** Opus 4.8 in Claude Code — the XML behavior interpreter and per-pixel window math are exactly where a faster model ships subtle geometry bugs.

---



## Phase 4 — Shimeji companions (replace Pets) + routines + beep speech

**Current state:** companion window layer exists (`src/main/companionHost.ts`, `environment/companionOsBridge.ts`, `settings/pages/CompanionsPage.tsx`).

**Design:**

- **Adopt the Shimeji-ee pack format** (folder of sprite PNGs + `conf/actions.xml`, `behaviours.xml`): implement a TypeScript interpreter for the core action/behavior subset (Stay, Move, Animate, Sequence, Select, borders: Floor/Wall/Ceiling, IE-window interactions mapped to OS window bounds). Result: thousands of existing community packs load as-is; reference implementations to crib semantics from: Shimeji-ee / Shimeji-Desktop (Java) and Shijima-Qt (C++).
- **Bug fixes:** climbing orientation (sprite flip must follow edge normal, not velocity sign), ceiling walk direction, drag-throw physics, multi-monitor edges.
- **Routines:** routine editor in CompanionsPage — triggers (time of day, app events like "music playing", idle) → behavior; every routine listed with a live "test" button so each one is verifiably working; time routines use a single scheduler in main.
- **Beep speech:** WebAudio oscillator "Animalese"-style voice — per-character profile (base pitch, waveform, step per mora), one short beep per syllable while a subtitle bubble shows the line. Dialogue lines: personality-seeded pools + context hooks (time of day, current activity, level-up events from LevelService). No TTS, no network.

**Accepts when:** a stock Shimeji-ee pack dropped into the packs folder walks, climbs correctly on both walls, sits on windows; all routines pass their test buttons; beeps play with bubbles.

**Pitfalls:**

- Shimeji XML is a dialect swamp: many popular packs use **Japanese element names** (行動, 動作) and Shimeji-ee vs Shimeji-Desktop attributes differ — normalize tag aliases in one mapping table up front or half the packs "silently do nothing".
- The overlay window must be click-through except on sprite pixels (per-pixel hit test), or mascots block clicks on the desktop beneath them.
- Multi-monitor + DPI scaling: all edge/window math in physical pixels per display; mixed-DPI setups are where climbing breaks "again".
- One transparent window per mascot doesn't scale — one overlay per display, all mascots composited, or 5 shimeji will drag window performance (CLAUDE.md rule).
- Beep voices: reuse a single AudioContext; per-line oscillator creation without disposal leaks (see cross-cutting audio rule).

**Next up (Phase 4.5, Motion):** Sonnet 5 in Claude Code — highly visual, iterative CSS/spring/canvas work; check the running Electron app after every generation loop.

---



## Phase 4.5 — Motion Design & System Animations

Animations are functional, not decorative: they guide focus, establish spatial hierarchy, and give tactile feedback. Anything that doesn't do one of those three is out.

**Design — unified motion framework (**`src/renderer/motion/`**):**

- One hardware-accelerated animation layer (CSS transitions + a small spring/physics helper; Canvas only for particles). All durations/easings come from central motion tokens — no view hard-codes its own timing.
- **Core animations:**
  - *Viewport slide-shifts:* view switches (Reader → Game Arena) use a subtle horizontal slide with spring-physics ease — the OS feels like one contiguous physical space.
  - *Popup/modal scale-springs:* dictionary popups and overlays scale from the cursor's click point (0.95x → 1.0x) with a damped bounce, instead of appearing.
  - *Liquid-fill meters:* XP and level bars fill fluidly with a small splash/bubble accent at 100%.
  - *Score tickers:* scoreboards roll up (0 → 94) instead of jumping, with a subtle high-frequency audio tick (through the shared audio stack).
  - *Badge reveal choreography:* 3D card flip + radial glow burst + physics confetti that respects window boundaries (Phase 3.5 badges consume this).
  - *Shimeji drag physics:* sprite stretches slightly along the drag vector and squashes on floor/window impact (extends Phase 4 drag-throw).
  - *Morpheme highlight glows:* hovering subtitle words or manga overlay text gives a soft under-glow, color-coded by word type/difficulty, fading smoothly in and out.

**Settings — "Motion & Accessibility" panel (settingsRegistry):**


| Setting                  | Type     | Range                           | Behavior                                                                    |
| ------------------------ | -------- | ------------------------------- | --------------------------------------------------------------------------- |
| Motion Mode              | dropdown | Normal / Performance / Disabled | Disabled = zero-ms snaps; default follows OS `prefers-reduced-motion`       |
| Animation Velocity       | slider   | 0.0x (instant) – 2.0x (slow)    | Scales every CSS/JS duration from the motion tokens; default 1.0x (~250 ms) |
| Reward Particle Density  | slider   | Off / Low / High                | Particle count for badge/level-up bursts                                    |
| Companion Physics Weight | slider   | Light – Heavy                   | Gravity + damping curves for shimeji interactions                           |


Per the cross-cutting rule, every major view exposes its own settings panel; this phase establishes the pattern.

**Accepts when:** every transition responds smoothly; the velocity slider visibly scales all animations; Disabled mode snaps every element instantly with zero-ms delays (including in-flight ones); confetti never leaves the window; `prefers-reduced-motion` is respected on first run.

**Pitfalls:**

- Animate **only** `transform` and `opacity` (compositor-friendly); animating layout properties (width/left/height) on meters or panels will re-trigger the exact window-dragging lag CLAUDE.md forbids — liquid fills are transform-scaled fills or canvas, never width tweens.
- Velocity 0.0x is a *snap*, not a divide-by-zero — implement as "skip to end state", and route ALL animations through the shared tokens or the slider silently misses hard-coded ones.
- Transitions must be interruptible: a second view switch mid-slide retargets from the current position; queuing animations makes the app feel slower than no animations.
- Particle systems: pool objects, cap by density setting, run in one rAF loop that stops when idle — a confetti burst must not allocate per-frame or leave a running loop.
- Score-tick audio obeys the audio cleanup rule (shared context, disposed on view change) and mutes when Motion Mode is Disabled — accessibility users shouldn't trade flashing for ticking.
- 3D flips need `backface-visibility` care and sparing `will-change` — blanket `will-change` on cards eats GPU memory.

**Next up (Phase 5, Manga OCR):** Opus 4.8 in Claude Code — dual-graph ONNX inference, dewarping geometry, and overlay coordinate transforms are delicate compilation-boundary work.

---



## Phase 5 — Manga OCR replacement + on-image translation overlay

**Current state:** `ocr.ts` wraps tesseract.js (jpn/jpn_vert) — poor accuracy on manga.

**Design:**
Target bar: a professional manga OCR reader in the Mokuro / Yomeru class.

**Strategy — integrate, don't reinvent:** this view is built *by integration*, not from scratch. We adopt the Mokuro framework's established OCR processing schema and overlay layout math as the core foundation: pages are processed into **Mokuro-compatible JSON** (per-page text blocks with box coordinates, line segmentation, vertical/horizontal flags), and the reader renders interactive overlays from that JSON exactly as Mokuro's proven layout math dictates. What we replace is the delivery: instead of forcing users through a Python CLI, our background Node worker runs the packaged `manga-ocr` ONNX models natively and emits the Mokuro-format JSON that the reader view parses and renders immediately. Side benefit: any manga the user has already processed with stock Mokuro opens in our reader as-is.

**OCR engine & layout detection:**

- **Replace with manga-ocr** (kha-white, free, manga-specialized, reads whole bubbles in one pass): run locally via ONNX export in the main process (no Python dependency), model delivered by the Phase 6 download manager (~450 MB). Keep tesseract as installed fallback; PaddleOCR-lite as optional ZH module later.
- **Robust vertical AND horizontal handling:** detection stage (comic-text-detector ONNX) must handle classic vertical columns, horizontal text, text hugging curved bubble edges, and stylized handwritten sound effects (SFX get a lower-confidence tag and their own toggle rather than polluting normal lookups).
- **Text-line dewarping:** use the detector's line coordinates to flatten curved/rotated text regions (perspective/rotation transform per line) before they reach manga-ocr — feeding raw curved crops is the single biggest accuracy loss on stylized pages.
- **Furigana filtering:** manga-ocr natively reads kanji+furigana bubbles without emitting the ruby text as repeated garbage characters — verify this in the acceptance test, and additionally strip residual ruby-sized fragments in post-processing so word lookup always hits the base kanji word, not the reading.
- **Pipeline:** detection → per-region manga-ocr (Node worker, ONNX) → **Mokuro-compatible JSON** (cached per page) → tokenizer → existing `translate.ts`.

**Interactive overlay (no side panel):**

- **Transparent HTML/SVG bounding-box overlays** rendered from the Mokuro JSON using Mokuro's overlay layout math (box placement, vertical writing-mode, font sizing) — artwork stays untouched, text becomes selectable and hoverable in place.
- Click any word inside an overlay → morpheme-level dictionary popup + one-tap mining to Anki.
- **Manual correction hotkey:** press `E` over a bubble to edit the OCR'd text in a tiny inline input; the correction immediately re-feeds tokenizer, lookup, and the mining stream (and is remembered per page).
- **Handwriting/radical fallback canvas:** small toggleable popup with a draw-a-character canvas + radical picker for when OCR fails outright on smudged/stylized glyphs — result goes straight to dictionary lookup.
- "Translate page" mode swaps overlay contents to translations in place: cleaned bubble fill (median surrounding color; true inpainting stays an optional heavy module modeled on manga-image-translator) + typeset translated text; toggle original/translated instantly.

**Accepts when:** a raw page with vertical dialogue, one curved bubble, furigana, and handwritten SFX OCRs cleanly (furigana never breaks lookups, SFX separated); overlays sit pixel-accurate on the bubbles with text selectable; per-word popup + mining work from the overlay; `E`-editing a bubble updates lookups instantly; the fallback canvas resolves a character OCR missed.

**Pitfalls:**

- manga-ocr is an encoder-decoder model: the ONNX export is **two graphs + a tokenizer**, not one file — plan the asset registry entry and inference wrapper accordingly, and benchmark CPU latency per bubble (batch regions, show progressive results).
- Overlay coordinates are in image space — they must transform through the reader's zoom/pan/rotation matrix or boxes drift the moment the user zooms.
- The tesseract fallback does NOT filter furigana — when fallback is active, run the ruby-strip post-process aggressively and mark results as lower confidence.
- Dewarping needs a no-op path: applying perspective correction to already-straight text hurts accuracy; only dewarp when line curvature exceeds a threshold.
- Manual `E` corrections must be keyed by page + region hash so re-OCRing a page doesn't silently discard user fixes.
- **License boundary:** manga-ocr is Apache-2.0 (verified) — safe to wrap. Mokuro itself may be GPL-family: using its *JSON schema and layout math* (a file format + published algorithms) is fine, but **copying its source code** would pull copyleft obligations onto the whole app — verify the license before any code (vs. format) reuse, and record the decision for the Phase 10 audit.
- Pin the Mokuro JSON schema version we emit/consume; upstream format changes must not silently break the reader — validate on load, migrate explicitly.

**Next up (Phase 5b, video + transcription):** Opus 4.8 in Claude Code for the player engine, ffmpeg extraction, and whisper tiers; Sonnet 5 for subtitle styling and player UI polish.

---



## Phase 5b — Transcription upgrade + Media/Video split

**Transcription (current small whisper in** `whisperWorker.ts` **/** `whisperSettings.ts`**):**

- Model tiers via the download manager, user-selectable per language: kotoba-whisper (JA distil-whisper, ~6x faster at large-v3-class JA accuracy), whisper large-v3-turbo (multilingual), SenseVoice-small (ZH/JA, very fast) — GGUF/ONNX, keep the current small model as the default lightweight option.
- Language-aware default: active language (Phase 8) picks the model.

**Media/Video split:**

- Split `MediaView` into **Media** (file library: music, audio, files) and a dedicated **Video Player** view.
- **Smart import detector:** classify on add — video vs music vs audiobook/podcast (container + audio-only + duration + embedded tags), language ID via a 10-second whisper lang-ID probe (async, main thread per CLAUDE.md perf rule). Sortable/filterable by type, language, length.

**Video Player — professional language-learning player (Language Reactor / ASBplayer class):**

**Strategy — integrate, don't reinvent:** rather than scratch-building the video-to-Anki sync pipeline, dual-subtitle renderer, and precision hotkey navigation, we wrap and embed the core engine of **asbplayer** (the leading open-source language-learning player) inside our Electron view: its subtitle-rendering, time-stretch (pitch-preserving slow-down), auto-pause, and audio mining/clipping modules are consumed as vendored packages/modules. Its keyboard shortcut registry and subtitle-delay calibration (`[` / `]`) are adapted to register through our `keyboardShortcuts.ts` so they coexist with the Study OS shell. The features below define the required behavior — asbplayer's modules are the implementation, our code is the glue (furigana track, dictionary popup, mining queue, LevelService sorting).

*Subtitle & audio power controls:*

- **Targeted replay / sentence looping:** single-key shortcuts — replay current line, jump back one subtitle line, jump forward one line, loop current line until released.
- **Auto-pause after subtitle:** optional mode that pauses at the end of every subtitle line (shadowing / active-comprehension workflow); one key resumes to the next line.
- **Pitch-preserving slow-down:** 0.75x / 0.85x / 0.9x (plus free control) using time-stretch that keeps speaker pitch intact (WebAudio `preservesPitch` on the media element; fall back to a SoundTouch worklet if quality is poor), so fast native dialogue stays legible and natural.
- **Subtitle delay/sync calibration:** `[` and `]` hotkeys nudge subtitle timing in ±100 ms steps (Shift = ±500 ms), live on-screen offset indicator, offset persisted per file.

*Dual-subtitle parsing:*

- Multiple tracks with dual-sub display (JP + translation), per-track font/size/position controls (extend `subtitles.ts`).
- **Furigana toggle:** kanji-bearing subtitle lines render optional ruby furigana via the tokenizer, toggleable with one key.
- **Morpheme parsing (click-to-target):** subtitle lines are tokenized, each word individually hoverable/clickable — click highlights the morpheme and opens the popup with definitions, part of speech, and conjugation/deinflection info (reuse `DictionaryPopup`), not a whole-sentence copy.
- Auto-mining of subtitle lines and clicked words (reuse epub-miner logic from the `EpubMiningPanel` flow).
- **Fuzzy audio grabs for mining:** when clipping audio for an Anki card, pad start/end by a configurable window (default +150 ms each side) and apply short fade-in/out — subtitle timecodes are never sample-accurate and clipped-consonant cards are useless.
- **SRT/VTT export ("reverse mine"):** any locally generated Whisper transcript exports to `.srt`/`.vtt` with one button.
- Transcription module stays, with auto-mining wired to the same mining pipeline.

**Accepts when:** dropping a mixed folder auto-sorts video/music correctly; JA video plays with dual subs + furigana toggle; auto-pause + line-replay + loop all work from single keys; 0.85x playback keeps natural pitch; `[`/`]` visibly shifts sub timing and persists; clicking one word in a subtitle opens its morpheme popup and mines it; a mined audio clip has padded, faded edges; a transcript exports as valid .srt; kotoba-whisper transcribes a 1-min JA clip faster and more accurately than the current small model.

**Pitfalls:**

- HTML5 video can't read subtitles muxed inside .mkv — extract embedded tracks (ffmpeg in main) on import, don't assume external .srt files exist.
- `timeupdate` fires ~4x/second — too coarse for auto-pause; drive line-end detection with `requestVideoFrameCallback` or a rAF clock, or pauses land mid-way into the next line.
- `preservesPitch` quality degrades below ~0.7x and varies by Chromium version — cap the UI at 0.7x and verify on the shipped Electron before trusting it.
- ASS/SSA subs carry styling/positioning plain renderers ignore — either render via a proper lib or strip to text and say so; garbled karaoke tags look like a bug.
- Whisper timestamps drift on long files — segment-level realignment (or whisper.cpp token timestamps) before trusting them for audio grabs and srt export.
- Lang-ID probe: handle audio-less video and silent intros (probe a segment from 20–30% in, not the first 10 s).
- **asbplayer is built for a browser/extension context** — expect chrome-extension APIs and its own AnkiConnect calls inside the modules. Excise both at the wrap boundary: media access goes through our Electron file layer, and card creation goes through **our** mining queue (Phase 11), never its direct AnkiConnect path, or offline mining silently breaks.
- Vendor a **pinned fork**, not a floating dependency — upstream refactors will break the wrap seam; upgrades are deliberate merges with the license/attribution audit re-run (Phase 10).
- Its shortcut registry must not double-bind with ours — one owner (`keyboardShortcuts.ts`) registers everything and forwards into the asbplayer engine; two live registries produce ghost hotkeys.

**Next up (Phase 8, environment switcher):** Sonnet 5 in Claude Code — mostly integration glue over existing systems; drop to Opus 4.8 only if per-language profile migration gets hairy.

---



## Phase 6 — Download manager for all models & dictionaries — DONE

**Built:** `src/shared/assetRegistry.ts` (pure: catalog, state machine, disk pre-flight, remote-registry merge, verification policy) + `src/main/downloads.ts` (engine) + preload bridge + `src/renderer/assetStore.ts` + Settings → "Models & dictionaries". Every pitfall below is handled and covered by a test; see TASKS.md for the verification record.

**Deviation from the design, deliberate:** `sha256` is *optional* per asset. A pinned hash that is wrong fails every install with an unfixable "corrupt download", so assets whose upstream hash has not been confirmed verify by size instead and record the hash they actually got. Publishing `assets/registry.json` (already fetched and merged over the bundled catalog at boot) is how real hashes get pinned without an app release — do this before v1.01 ships.

**Design (as planned):**

- `DownloadManager` in main process; registry (`src/shared/assetRegistry.ts`) of every heavy asset: dictionaries (Yomitan dicts, CC-CEDICT), whisper models, manga-ocr, comic-text-detector, tessdata, Tatoeba indices, graded-sentence packs. Each: `{ id, name, url, sha256, sizeBytes, version, installDir }` under `userData/models/`.
- Atomic installs (download to temp → verify sha256 → rename); pause/resume; delete.
- **Graceful degrade contract:** every consumer checks `isInstalled(id)` and renders a "Download (size)" button instead of erroring — this is the rule that makes undownload→redownload safe everywhere. Integrity check on load; corrupt = auto re-flag as not installed, never crash.
- UI: download buttons inline in each relevant settings page + a single "Storage" page listing all assets with sizes, versions, delete buttons.
- **Disk-space pre-flight:** before any download starts, compare asset size (plus temp copy overhead) against free space on the target volume; block with a clear, localized warning instead of failing at 97%.
- Ship v1.01 with zero big models bundled — first-run wizard suggests the set matching the user's language.

**Accepts when:** deleting and re-downloading any model mid-session never errors; attempting to download a model with insufficient disk space gracefully prevents the download and displays a clear, localized warning; app installer size drops accordingly; no feature crashes when its model is absent.

**Pitfalls:**

- Hash multi-GB files as a **stream** during download, never by re-reading the finished file into memory.
- Windows file locks: a model mmapped by a live worker can't be deleted — deleting an in-use asset must first signal consumers to unload, then remove; otherwise "delete" errors only on Windows, only sometimes.
- HuggingFace/CDN URLs redirect and rotate — resume support must re-follow redirects and re-validate ETag/size before appending, and the registry needs to be updatable without an app release (fetch a signed registry JSON, fall back to bundled).
- "Pre-flight passed" can still run out of space (other apps write too) — treat ENOSPC mid-download as a pausable, resumable state, not a corrupt install.

**Next up (Phase 2, i18n):** Sonnet 5 in Claude Code — mass mechanical string extraction across dozens of views, where speed beats depth; draft the JA/ZH/RU catalogs with Fable 5 in chat if translation quality needs a second pass.

---



## Phase 6.5 — Stabilization pass 1

**Build-order note:** runs **after Phases 8 and 9** (not immediately after 5b). Covers regressions from the environment switcher and Chrome extension as well as earlier phases.

`tsc --noEmit`, lint, full `vitest` run; fix all failures; add smoke tests for LevelService, apkg import, download manager state machine, sentence grading. Manual sweep of every view for regressions (drag layer, shortcut grid, taskbar per CLAUDE.md safety rule). Also, going through C:\Users\Arseniy\Projects\jp-study-app\docs\IMPLEMENTATION_PLAN_[V1.01.md](http://V1.01.md)  
"ment to be added features"  such as "**Evaluation metrics (100-point scale, four axes)" Evaluate their implementation level out of 10 and evaluate if they are functional or not.** 

**Next up (Phase 7, pronunciation — postponed):** Opus 4.8 in Claude Code — alignment/F0 scoring is signal-processing logic where correctness beats speed; Sonnet 5 for the practice UI.

---



## Phase 7 — Pronunciation checker

**Build-order note:** **postponed** until after Phase 6.5. Do Phases 8 → 9 → 6.5 first.

**Design:**

- Flow: pick a word/sentence (dictionary popup or reader) → hear TTS reference (`tts.ts`) → record mic → score.
- Scoring v1 (robust, offline): transcribe user audio with the installed whisper model, kana-normalize both sides, per-mora alignment via edit distance → highlight wrong/missing morae.
- Scoring v2 (stretch): F0 pitch-contour extraction (autocorrelation) vs reference for pitch-accent feedback.
- **Visual pitch-accent & tone overlays:** JA — render the word's high/low pitch-accent contour (binary step graph over morae, from an accent dictionary asset) above the target during recording, with the user's extracted F0 drawn against it; ZH — color-code each character by pinyin tone (fixed 4-tone+neutral palette from CC-CEDICT readings) so tone association builds visually while practicing.
- UI: "Practice" button in DictionaryPopup + a Pronunciation section under Study; history of attempts in stats.

**Accepts when:** mispronouncing one mora in a 4-mora word highlights that mora; a JA target shows its accent contour and the user's pitch trace; ZH characters render tone-colored; works fully offline with any installed whisper tier.

**Pitfalls:**

- **Whisper auto-corrects you** — it's a language model and will transcribe what you *meant to say*, hiding pronunciation errors. Constrain decoding (temperature 0, kana-level comparison) and treat "transcript matches" as necessary, not sufficient; forced alignment is the honest upgrade path.
- JA pitch-accent data is not in JMdict — it's a separate downloadable asset (kanjium/NHK-style accent DB) via the Phase 6 manager; without it, hide the contour UI rather than guessing.
- Disable browser echo cancellation / noise suppression on the recording stream (`getUserMedia` constraints) — they mangle F0 extraction.
- Polyphonic ZH characters (了, 行) need tone chosen from the *word's* CC-CEDICT reading, not a per-character table.

**Next up (Phase 11, data resiliency):** Opus 4.8 in Claude Code — backup atomicity and idempotent queue sync are the highest-stakes correctness code in the app.

---



## Phase 8 — Auto language environment switcher — DONE

**Design:** the Phase 2 language selector becomes an *environment* switch. Changing active study language reconfigures, in one action: tokenizer (kuromoji for JA / jieba-class for ZH), default OCR language, default whisper model, keyboard/IME mapping hints, and **dictionary auto-detection** — a manifest maps each language to required assets (JA → Yomitan JMdict pack; ZH → CC-CEDICT + HSK lists), missing ones surface as one-click installs via the Phase 6 manager. All prompts streamlined into a single "Set up Chinese (2 downloads, 210 MB)" card.

**Accepts when:** switching EN-UI/JA-study → ZH-study offers exactly the missing dictionaries and, after install, dictionary lookup + OCR + transcription all target ZH with no further configuration.

**Pitfalls:**

- Switching study language must **never wipe or overwrite** the other language's state — knownWords, level lists, stats, and reading progress are per-language profiles that persist in parallel; switching is a view change, not a reset.
- JA and ZH lemmatize differently — knownWords keys are only valid within their language; one shared key space corrupts both.
- The app cannot force the OS IME — it can only set `lang` hints (Phase 2); don't promise "keyboard switches automatically" in UI copy.
- Mid-task switches (transcription running, OCR in flight) must finish under the old config; queue the reconfiguration.

**Next up (Phase 6.5, stabilization):** Phase 9 is done — Haiku 4.5 in Claude Code for linter noise, test scaffolding, mechanical fixes; escalate stubborn failures to Sonnet 5.

---



## Phase 9 — Chrome extension mining + reader auto-sorting — DONE

**Design:**

- **MV3 extension** (new top-level `extension/` build target — note: lives outside `src/`, needs its own folder; flag per CLAUDE.md scope): toolbar button + hotkey "Send to Reader": runs Readability on the page (same semantics as `readabilityExtract.ts`), posts `{ title, url, html, selection? }` to the app.
- **App endpoint:** localhost HTTP server in main (loopback only, token-pairing on first connect, token shown in app settings) → items land in a Reader "Inbox" collection.
- **Selection mining:** highlighted text on any page → mined directly as a sentence card.
- **Reader auto-sorting:** inbox items auto-tagged with language (local lang-ID), length (chars/est. reading time), and difficulty (comprehensibility % vs knownWords + level 1–7 estimate); Library gains sort/group by source, language, length, level, date plus Inbox filter chips.

**Accepts when:** button-press on a Syosetu chapter lands it in Reader inside 2s, auto-filed with correct language/level/length; selection mining produces a valid Anki card.

**Pitfalls:**

- MV3 service workers die after ~30 s idle — no persistent WebSocket; use plain `fetch` to the localhost endpoint per action and treat every send as stateless.
- The local server must bind loopback only, require the pairing token on every request, and set CORS/Private-Network-Access headers or Chrome will block the extension's requests.
- The app may be closed when the user hits the button — the extension needs a friendly "app not running" state and an optional retry queue in `chrome.storage`.
- De-duplicate inbox items by URL + content hash; users double-click buttons.

**Next up (Phase 6.5, stabilization):** Haiku 4.5 in Claude Code — linter noise, test scaffolding, mechanical fixes; escalate stubborn failures to Sonnet 5.

---



## Phase 9.5 — Miku first-boot guided tour (last phase before release)

A shimeji companion greets the user on first boot and walks them through the whole app with the nostalgic beep voice — onboarding as a character, not a slideshow. Built last on purpose: it touches every finished feature.

**Design:**

- **Guide character:** the bundled default companion (Miku-style shimeji pack) spawns on the desktop shell, physically walks/climbs to each area it introduces, and speaks via the Phase 4 beep-speech system (per-mora beeps + subtitle bubble) with her own voice profile.
- **Tour engine:** a declarative script — an ordered list of steps `{ anchor (view/UI element), bubble line (i18n key), companion action, advance condition }`. Advance conditions: "Next" click, or completing the actual action (e.g. picking a language). Rendered with a spotlight overlay that dims everything except the anchored element; companion positions itself beside the spotlight.
- **Tour content (doubles as first-run setup):** welcome → pick UI language (Phase 2) → pick study language (Phase 8) → upload/paste a level deck or skip (Phase 0.5) → starter model downloads via the wizard (Phase 6) → quick hop through Reader, Reading Finder, Game Arena, Video Player, Manga Reader, Settings → "I live on your desktop now" outro introducing companion settings.
- **Controls:** skippable at any moment (Esc or Skip button on every bubble), beep-voice mute toggle on the first bubble, replayable anytime from Settings > Help ("Replay tour"). Completion stored in `userData` so it fires exactly once.
- Respects Motion Mode (Disabled = static bubbles, no walking choreography) and the audio cleanup rule.

**Files:** `onboarding/tourScript.ts`, `onboarding/TourOverlay.tsx`, Miku voice profile in the companion system, Help section in `settingsRegistry.ts`.

**Accepts when:** a fresh install launches the tour once; every first-run essential (UI language, study language, level deck, starter models) is completable entirely inside the tour; Esc exits instantly from any step; the tour never re-fires after completion but replays from Settings; beeps sync with bubble text and stop cleanly on skip.

**Pitfalls:**

- **Chromium autoplay policy:** no AudioContext before a user gesture — the very first bubble must appear silently and start beeping only after the first click, or the voice is muted by the browser engine and "randomly" works.
- **Miku IP:** Hatsune Miku is Crypton IP under the Piapro license — bundle an *original* default mascot and let users drop in any shimeji pack (Phase 4 makes that trivial); don't ship copyrighted sprites in a GitHub release.
- Anchors are live UI elements — recompute spotlight/companion positions on window resize and zoom, or the tour points at empty space on small screens.
- First boot = zero models installed; every tour step must work in that state (the tour IS the funnel to the download wizard, not a consumer of it).
- Never block the app behind the tour — all steps optional, all skippable; a forced tour is the fastest uninstall button ever shipped.
- Tour lines go through i18n like everything else — switching UI language mid-tour re-renders remaining bubbles in the new language.

**Next up (Phase 10, release):** Haiku 4.5 in Claude Code for docs, cleanup, and checklists; Sonnet 5 for the `forge.config.ts`/installer work once its sign-off is given.

---



## Phase 10 — Final hardening, packaging, v1.01

- Second full bug pass + tests (repeat 6.5 scope, plus new phases).
- **Open-source compliance audit:** verify every integrated/forked dependency — Mokuro schema/layout-math usage, vendored asbplayer modules, manga-ocr (Apache-2.0), comic-text-detector, whisper models, dictionaries — against its license (MIT/Apache/GPL); confirm code-vs-format boundaries decided in 5/5b, bundle license texts, and render correct attribution in the app's About page. GPL-family findings block release until resolved (rewrite, isolate, or relicense decision).
- Installer: Electron Forge makers for a Windows installer, GitHub Releases publish, auto-update check via existing `releaseCheck.ts`. **Flag:** touching `forge.config.ts` violates the CLAUDE.md src-only rule — this single exception needs explicit sign-off before Phase 10 starts.
- Version bump to 1.0.1; release checklist: clean install on a fresh Windows VM, zero-model first run, download-manager wizard, every view smoke-tested.

**Pitfalls:**

- Unsigned Windows builds trigger SmartScreen "unrecognized app" warnings — either budget for a code-signing cert or document the warning in the README; don't let it surprise users at launch.
- Test the *packaged* app, not just dev mode — asset paths, the tesseract/public folder, and worker URLs all resolve differently under asar.
- Plan `userData` schema versioning now: v1.01 → v1.02 migrations need a version stamp in every store from the start.

**Next up: ship.** Post-release, Haiku 4.5 maintains docs and CLAUDE.md; new feature cycles start again with Fable 5 in chat/Cowork for planning, per the blueprint.

---



## Phase 11 — Data portability & resiliency (runs before Phase 10 ships)

A professional app never traps or loses user data. Hundreds of hours of mining, stats, and reading progress must survive crashes, closed Anki, and machine moves.

**Design:**

- **Rolling local backups:** automated zipped-JSON snapshots of stats, level lists, knownWords, reading progress, mining history, and settings into `userData/backups/`; keep the last 5 days (one per day + one on every app update); restore picker in Settings.
- **Export All User Data:** one button producing a single portable `.zip` of the entire learning history, reading progress, and custom dictionaries — re-importable on a fresh install.
- **Anki sync resiliency (mining queue):** if AnkiConnect is unreachable (Anki closed), mined cards go to a local persistent Mining Queue (SQLite in main) instead of failing — a quiet badge shows queued count, and a background poller auto-syncs the moment AnkiConnect reappears (reuse `heartbeat.ts`). No silent failures, no blocking error dialogs.

**Accepts when:** turning off Anki, mining a card, and reopening Anki results in the card syncing without user intervention; the export archive re-imports on a clean install with stats, levels, and progress intact; a corrupted primary store restores from yesterday's snapshot.

**Pitfalls:**

- Snapshot **atomically**: serialize state to a temp file and rename; backing up localStorage-backed stores mid-write copies torn state — route critical stores through a file-backed layer in main first.
- Queue sync must be **idempotent**: tag queued cards with a client-generated ID and check for the note before re-adding, or every reconnect duplicates cards (AnkiConnect `canAddNotes`/dupe check).
- Don't back up model binaries — backups are user *state* only, or 5 days × 3 GB kills disks; exclude `userData/models/`.
- Export must include a schema-version manifest so future versions can migrate imports; an unversioned zip is a time bomb.
- Restore is destructive — always auto-snapshot current state before applying a restore.

**Next up (Phase 9.5, Miku tour):** Sonnet 5 in Claude Code for the tour engine and spotlight overlay; write the character's dialogue lines with Fable 5 in chat first so the voice lands, then paste into the i18n catalogs.

---



## Cross-cutting rules (from CLAUDE.md, enforced every phase)

- No decorative emojis anywhere; Fluent, minimal, dark deep-red accents.
- No large internal panel titles.
- Heavy work (apkg parsing, OCR, transcription, lang-ID, grading) async in main/workers; virtual scrolling for big lists — window dragging must never lag.
- Never break: desktop shortcut grid, window dragging layer, taskbar shell.
- **Offline-first safe fallbacks:** with no network, everything except Reading Finder web fetches and initial model downloads stays 100% operational — tokenizer, dictionary lookup, OCR, local transcription, games, and mining must never query an external server.
- **Audio pipeline cleanup:** beep speech, TTS, and media elements share one audio stack — every AudioContext, worklet, and node is explicitly disposed on view change; no leaked contexts, no overlapping audio artifacts. One shared context where possible.
- **Per-view settings panels:** every major view exposes its own dedicated settings sub-section (registered in `settingsRegistry.ts`) and an in-view button that deep-links to it — no view ships with hidden or hard-coded preferences.
- **Motion discipline:** all animation goes through the Phase 4.5 motion framework and its tokens; no view hard-codes durations, and everything respects Motion Mode / velocity / `prefers-reduced-motion`.

---



## Appendix A — Game-Generator Prompt (reusable template)

Once Phases 3/3.5/4.5 exist, new Arena games are generated with this prompt. It encodes the architecture contracts so generated code drops in without rework. Not code to run — a template to reuse.

```text
Act as a Principal UI/UX and Language-Learning Engineer. We are building a new
minigame for the "Game Arena" inside Study OS (Electron + React + TypeScript).

The game must fit the existing architecture:
- games/engine.ts round/session contract (timer, streak, combo scoring)
- Offline-first: no network calls at play time; content comes from the
  pre-graded local sentence/vocab buckets (data/gradedSentences/)
- Localization via the global useT() hook (EN/JA/ZH/RU); CJK inputs set lang=
- Motion via the shared motion framework tokens (src/renderer/motion/) —
  respect Motion Mode, Animation Velocity, and prefers-reduced-motion

Game concept:
[INSERT GAME CONCEPT HERE — e.g. "A fast-paced particle routing game where
falling nouns must be flicked into bins labeled を, に, and が"]

Strict requirements:
1. No new external packages: React state, standard browser APIs, CSS
   transitions/Canvas only.
2. requestAnimationFrame for any active canvas/physics loop; loop stops when
   idle; objects pooled. Hover/selection feedback uses the shared spring
   tokens.
3. Difficulty from LevelService.getUserLevel(); source language from Arena
   settings; every user-visible string through useT().
4. Anki mining: every wrong/missed item shows a one-tap mine button that goes
   through the mining queue (works with Anki closed — Phase 11).
5. On completion, fire the engine completion callback with
   { score: 0-100, accuracy, mistakes[] } so the Arena awards XP/badges.
6. CLAUDE.md rules: no decorative emojis, minimal panel chrome, nothing that
   lags window dragging.

Deliver one modular TSX file (plus a data typings stub if needed), clean and
commented at the seams where it touches engine.ts.
```

---



## Appendix B — Master-plan maintenance

When new feature ideas arrive, they are integrated into this document phase-by-phase (design → files → accepts-when → pitfalls), never appended as loose notes. Structural rules: keep the binding build order current, keep every phase's Pitfalls block honest, and keep all code strictly inside `src/` (exceptions: `extension/` in Phase 9, `forge.config.ts` sign-off in Phase 10).