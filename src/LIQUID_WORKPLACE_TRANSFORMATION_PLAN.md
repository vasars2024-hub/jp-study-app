# Liquid Workplace System Transformation Plan

Status: approved product direction; planning and sequencing source of truth. No existing surface is considered visually approved merely because it appears in the concept image or current source tree.

Timeline placement: Road to v1.01 **Phase 9.75**, after the current relay/stabilization work and onboarding baseline, before Phase 10 release hardening.

Concept reference: [`renderer/assets/concepts/liquid-workplace-video-concept-v1.png`](renderer/assets/concepts/liquid-workplace-video-concept-v1.png)

Current player proof used for the initial gap analysis: [`../docs/migration/proof/phase6-live-20260731/live-player-study-dock-and-mining-preview.png`](../docs/migration/proof/phase6-live-20260731/live-player-study-dock-and-mining-preview.png). This proof is older than the current dirty tree, so milestone L0 must replace it with a fresh baseline before implementation.

## 1. Outcome

Transform the entire desktop application into a clean, intelligent, highly polished workplace with the calm hierarchy and spatial clarity shown in the concept image. “Liquid” means more than translucent material:

- one dominant task at a time;
- minimal permanent chrome;
- obvious visual hierarchy and stable orientation;
- contextual tools that appear near the content they affect;
- progressive disclosure instead of a wall of controls;
- smooth, meaningful spatial transitions;
- layouts that adapt to window size and user intent;
- full feature preservation and honest system state.

The transformation has two independent layers:

1. **Refined application interiors:** every app receives a cleaner, smarter, less cluttered information architecture. This applies in ordinary windows too.
2. **Optional Liquid window behavior:** each window remains conventional by default. Only an explicit user action turns that individual window into a Liquid workspace with adaptive docking, contextual panels, spatial transitions, and selected material effects.

This separation is non-negotiable. A user must never need to accept unusual window behavior, transparency, or moving controls to benefit from the redesigned apps.

## 2. Non-negotiable product rules

### 2.1 Conventional windows remain the default

- Existing and newly migrated window records resolve to `standard` when no Liquid preference exists.
- Standard windows keep normal focus, drag, resize, edge snap, maximize, minimize, close, pin, pop-out, taskbar, multi-monitor, and persistence behavior.
- No theme switch, upgrade, first-run flow, AI suggestion, or workspace restore silently converts a standard window to Liquid.
- “Make Liquid” is a reversible, user-initiated action on one window. “Return to standard window” restores the last standard geometry and normal containment.
- A later global preference may let a user explicitly choose Liquid for *future* windows, but its default is standard and it does not rewrite existing windows.

### 2.2 No feature deletion or obscuring

- Every current feature, command, state, field, route, shortcut, recovery path, and accessibility affordance receives an explicit destination in both standard and Liquid presentation.
- A feature moved into an overflow menu is not automatically “preserved.” It must remain discoverable by a clear label, keyboard navigation, command search, and contextual affordance.
- Primary actions stay visible. Secondary actions may become contextual. Expert or rare actions may move into an inspector or command sheet, but never into an unlabeled mystery control.
- Mock success, decorative controls, fake data, and hidden incomplete features are prohibited.
- Old deep links and app routes remain compatibility aliases until a measured migration proves they can be retired safely.

### 2.3 Liquid is selective

Not everything should look or behave like liquid glass. The system uses four surface roles:

| Role | Purpose | Treatment |
| --- | --- | --- |
| Anchor | Reading, editing, forms, tables, grids, timelines, video | Stable, high-contrast, mostly opaque |
| Work | Search results, transcript rows, card editors, property panels | Quiet solid or lightly tinted material |
| Liquid | Navigation, contextual tools, transport, temporary inspectors, docking feedback | Selective translucency, soft depth, responsive movement |
| Ambient | Wallpaper, decorative depth, inactive background | May blur/refract, never carries essential information |

Rules:

- Never stack translucent text surfaces over translucent text surfaces.
- Keep a maximum of three readable depth levels in one view.
- Every app has one dominant anchor canvas.
- Use blur only when the background relationship matters; otherwise use an efficient tinted solid.
- Forms, long prose, dense results, spreadsheets, logs, calendars, and accessibility modes default to anchored surfaces.
- High contrast removes translucency. Performance mode may replace blur with precomputed tint without changing geometry.

### 2.4 Smart minimalism must remain intuitive

The anti-confusion mechanism is a stable **orientation spine** plus three disclosure levels:

- **Level 0 — always visible:** current place, dominant task, primary action, state that could cause data loss, and the way back.
- **Level 1 — contextual:** tools relevant to the current selection, cue, document, card, result, or playback state.
- **Level 2 — advanced:** full settings, diagnostics, field mapping, provenance, and expert controls in a named inspector or command sheet.

The system may suggest a Level 1 tool, but it may not relocate controls autonomously. The user owns layout changes.

## 3. Window and workspace experience model

### 3.1 Presentation state

Extend the existing window snapshot rather than creating a second window manager. The intended persisted shape is conceptually:

```ts
type WindowPresentationMode = 'standard' | 'liquid';

interface WindowPresentationState {
  mode: WindowPresentationMode; // omitted legacy value resolves to standard
  standardRect?: { x: number; y: number; w: number; h: number };
  liquidLayoutId?: string;
  intensity?: 'subtle' | 'balanced' | 'expressive';
}
```

The exact schema may change during implementation, but the migration semantics may not:

- old data loads as standard;
- switching modes preserves both geometries;
- corrupt Liquid state falls back to a usable standard window;
- closing, minimizing, pinning, popping out, or moving between monitors never loses application state;
- Liquid mode is stored per window instance or intentional workspace template, not inferred from app type.

### 3.2 Entry and exit

Offer the same explicit action through:

- a labelled title-bar/context-menu action, “Make Liquid”;
- the command palette;
- a window’s taskbar/context menu;
- an optional first-use preview explaining what changes and how to undo it.

When activated:

1. Save the standard geometry.
2. Keep the same React application instance and state where possible.
3. Change only the presentation context and layout contract.
4. Animate panels from their real source position, respecting reduced motion.
5. Keep an obvious “Return to standard window” command.

When deactivated:

1. Reattach detached contextual panels safely.
2. Restore standard containment and geometry.
3. Preserve selection, playback position, unsaved form data, scroll position, and active route.
4. Remove Liquid-only presentation state without deleting app data.

### 3.3 Liquid behavior, not Liquid chaos

Liquid windows may:

- dock contextual rails to the dominant canvas;
- collapse secondary chrome when the pointer and keyboard focus leave it;
- let related panels flow between side rail, bottom sheet, and floating inspector at responsive breakpoints;
- save named layouts and restore them deterministically;
- detach and reattach supported tools with visible origin/return animation;
- coordinate focus and z-order with other Liquid windows.

They may not:

- merge unrelated apps automatically;
- move a panel because an AI guessed the user’s intent;
- make drag targets ambiguous;
- replace standard OS/window controls with gestures only;
- use background blur as the only boundary between interactive regions;
- put essential actions on hover only.

## 4. Design language

### 4.1 Visual hierarchy

- One dominant canvas occupies roughly 60–75% of the useful area when the task has a clear center.
- Context rails are narrower and quieter than the canvas.
- Tool docks form one coherent cluster rather than many isolated cards.
- Large internal page titles are removed when shell context already names the app, while semantic headings remain for accessibility.
- Primary actions use one restrained accent. Status, warning, and destructive colors retain distinct semantics.
- Use spacing, alignment, and typography before adding borders or cards.

### 4.2 Material and geometry

- Rounded geometry is continuous: a dock, panel, and canvas should feel related, not like nested rounded rectangles.
- Use delicate edge highlights and soft depth rather than large shadows and glow.
- Text surfaces use enough opacity for reliable contrast across all wallpapers.
- The deep berry/red accent from the concept is a Study OS active-state option, not a mandatory Aero/Wired/Blanc color.
- “MacBook-inspired” means disciplined density, typography, alignment, motion, and restraint. Do not copy Apple logos, proprietary assets, traffic-light controls, or exact macOS chrome.

### 4.3 Motion

- Motion explains origin, destination, hierarchy, and state change.
- Standard mode keeps normal window movement.
- Liquid panel transitions use transform/opacity on compositor-friendly layers and commit React state once at the end, following the existing `FloatingWindow` drag invariant.
- Reduced mode uses short fades and immediate reflow. Disabled mode has no decorative movement.
- No perpetual shimmer, bobbing, or animated refraction behind readable content.

## 5. Shared architecture

### 5.1 Extend, do not replace, the shell

Build on:

- `src/shared/desktop.ts` for persisted window state;
- `src/renderer/components/DesktopShell.tsx` for the battle-tested desktop `FloatingWindow` behavior;
- `src/renderer/components/AppSection.tsx` for app routing;
- `src/renderer/components/ui/AppChrome.tsx` for theme/material chrome seams;
- the existing theme engine, display assignments, pop-outs, taskbar, and drag performance paths.

Do not introduce a parallel desktop, taskbar, app registry, z-order system, or persistence store.

### 5.2 Shared Liquid foundation

Expected foundation modules, subject to source audit:

- `renderer/liquid/liquidWindowState.ts` — migration, persistence, restore, and validation;
- `renderer/liquid/LiquidPresentationProvider.tsx` — per-window presentation context;
- `renderer/liquid/liquidAppRegistry.ts` — capabilities and responsive contracts by app;
- `renderer/components/liquid/LiquidAppScaffold.tsx` — orientation spine, canvas, rails, and command sheet slots;
- `LiquidDock`, `LiquidInspector`, `AdaptiveRail`, `AnchorSurface`, and `ContextToolbar` primitives;
- `renderer/theme/liquid-tokens.css` and theme-specific token adapters;
- focused tests for schema migration, mode round-trip, geometry restoration, focus, keyboard order, and multi-monitor transfer.

The provider exposes presentation semantics. Individual apps should not read global DOM attributes or reinvent window-mode storage.

### 5.3 Feature parity ledger

Before an app is redesigned, create a machine-readable ledger under `src/.coordination/liquid-workplace/` with one row per feature:

```text
app | feature | current route/control | standard destination | liquid destination |
keyboard route | data/state owner | automated proof | visual proof | status
```

Rules:

- Count behavior, not buttons. “Mine sentence” includes fields, media preview, destination deck, error states, and undo/retry.
- A feature is complete only when both standard and Liquid destinations work.
- Every moved control must retain a search/keyboard route.
- New UI cannot land with `pending` parity rows unless the user explicitly accepts that scope.
- The ledger must cover settings and recovery paths, not only happy-path actions.

## 6. Media and video player pilot

The video workspace is the first full pilot because it already contains the strongest Liquid-shaped architecture: a dominant media canvas, docks, study blocks, detachable tools, transcript, grammar, mining, shadowing, and responsive panels.

### 6.1 Current-state gap

The July 31 proof shows working playback and mining, but visually it has:

- a nearly full-canvas video with weak surrounding hierarchy;
- a detached card form that reads as a generic overlay rather than a docked study tool;
- a developer sidecar occupying user workspace;
- a flat bottom strip of advanced controls;
- insufficiently unified transcript, grammar, mining, transport, and study intent;
- controls that compete with the content rather than forming one spatial system.

The current tree contains substantial newer workspace code, so L0 must capture the real current app before treating these observations as exhaustive.

### 6.2 Target composition

The concept image supplies the hierarchy:

- dominant cinematic video canvas;
- right transcript rail with one clear active cue;
- left contextual grammar and mining tools;
- one bottom transport/study dock;
- quiet top utility strip;
- strong subtitle legibility;
- generous negative space and continuous alignment.

Refinements required beyond the image:

- The video stays the anchor and never becomes translucent.
- Transcript rows use a stable readable work surface, not glass over moving video.
- Grammar and mining share one context lane and may stack, tab, or collapse based on height.
- Developer diagnostics move to an explicit developer inspector and never cover playback by default.
- The bottom dock separates transport, timeline, study mode, and capture actions without duplicating “Mine.”
- Advanced controls open from named groups; they are not permanently displayed and are not lost.
- Timeline, subtitle state, loop state, and current study mode remain visible at a glance.

### 6.3 Intent presets without feature forks

Provide layout presets that rearrange the same tools:

- **Watch:** video and transport dominate; study tools are available but quiet.
- **Study:** transcript and grammar are open; mining remains one action away.
- **Mine:** cue, card fields, preview, destination, and capture actions are foregrounded.
- **Listen:** subtitle, replay, frame/line step, offset, dictation, and shadowing tools are foregrounded.
- **Review:** recent cards, cue provenance, and replay context are foregrounded.

Presets never disable features. The user may customize panels and save a workspace.

### 6.4 Player parity inventory

The migration must preserve and verify at minimum:

- playback, seek, speed, volume, fullscreen, and current time;
- previous/replay/next line and frame stepping;
- subtitle discovery, track/version choice, dual subtitles, offset, styling, synchronization, and error states;
- active cue rendering, transcript search/scroll/jump, tokenization, reading, translation, and active-row follow;
- dictionary, grammar, sentence analysis, AI handoff, and provenance;
- mining fields, deck/field mapping, screenshot/audio/clip assets, preview, duplicate handling, history, errors, and retry;
- shadowing, dictation, listening controls, comprehension rescue, timing repair, and speech-rate challenges;
- study workspaces, block library, reorder/resize, undo/redo, detach/reattach, multi-monitor placement, and restored bounds;
- library, discovery, readiness, review, Music, YouTube, imports, Seanime handoff/status, and honest offline/degraded states;
- keyboard shortcuts, screen reader labels, reduced motion, high contrast, and performance mode.

### 6.5 Player acceptance views

Capture all of these and score them 80/80 on `src/LIQUID_UI_RUBRIC.md` before the player becomes the pattern for other apps:

1. standard window, default theme, Watch;
2. standard window, default theme, Study;
3. Liquid window, default theme, Study matching the concept hierarchy;
4. Liquid compact width with no overlap or hidden primary action;
5. Liquid maximized at 1920×1080;
6. standard and Liquid under Aero;
7. standard and Liquid under Wired;
8. high contrast and reduced/disabled motion;
9. empty, loading, offline, subtitle-missing, and mining-error states;
10. detach → move monitor → reattach → return to standard, with state preserved.

## 7. App-by-app transformation contract

Every desktop section receives a dedicated mapping. “Anchor” is what stays stable and readable. “Liquid opportunity” is selective and optional.

| App/section | Anchor and default minimal design | Selective Liquid opportunity | Parity focus |
| --- | --- | --- | --- |
| Agent | Conversation/task canvas with a compact, stable composer | Conversation rail and context/activity inspector flow between rails and sheets | Chats, plans, queue, tools, memory, attachments, provider/privacy state, confirmations, undo/recovery |
| Library | Cover/list canvas and file state remain solid | Filters, item details, import progress, and quick actions become contextual rails | Local/remote sources, search, sorting, import, metadata, continue state, errors |
| Novels | Text/cover/plan canvas stays anchored | Reading-plan and metadata inspectors dock beside the selected work | Catalog, progress, sources, import, plan, deep links, cover fallbacks |
| Dictionary | Search and definition results stay opaque and typographically stable | Sense, pitch, kanji, examples, mining, and concordance become adaptive inspectors | Every result source, star/history, known state, audio, Anki/Flashcards, errors |
| Grammar | Guide/practice canvas stays stable | Pattern detail, examples, weakness context, and mining follow the selection | Reference, practice, curation, filters, presets, progress, sentence analysis |
| Notebook | Editor/history canvas remains solid | Related media, captures, words, and quick-link tools appear contextually | All note types, search, links, editing, persistence, exports, recovery |
| Translate | Source and target text are anchored | Token, declension, grammar, alternatives, and provenance occupy a smart inspector | Language pairs, sentence analysis, offline/cloud labels, history, copy/save |
| Player | Media library shell remains a coherent normal app | Details, readiness, queue, and playback handoff adapt around the selected item | Library, Discover, Study, Readiness, Review, Music, Settings, imports, filters |
| Video | Video is the dominant anchor | Transcript, grammar, mining, listening, and transport form the pilot Liquid workplace | Full §6 inventory |
| YouTube | Playlist/video list and current selection remain stable | Transcript, progress, metadata, and study actions dock to the selected video | Playlist sync, search, playback/handoff, tracking, subtitles, errors |
| Music | Album/track browser and queue stay readable | Compact transport, lyrics/study context, and visualizer dock fluidly | Library, queues, playback, metadata, visualizer, focus music, errors |
| Anki | Field mapping and card editor remain solid forms | Preview, destination, duplicate/provenance, and sync status become inspectors | Deck/model/field mapping, media, CSS, sync, export, errors, retry |
| Flashcards | Review card and answer controls remain immovable during a review | Queue, context, media replay, and session summary flow around the card | All review modes, grading, scheduling, audio, leeches, session completion |
| Games | Gameplay canvas and input remain stable | Help, material coverage, difficulty, and post-round detail are contextual | Every game, typing input, source material, scores, level filters, accessibility |
| Statistics | Charts and data tables remain solid | Period/filter/comparison controls and drill-down detail use adaptive rails | All metrics, ranges, exports, empty states, accurate labels and scales |
| Calendar | Calendar grid/timeline remains anchored | Event editor, study details, filters, and suggestions use sheets/inspectors | Navigation, editing, recurrence, tracking sources, reminders, empty states |
| Resources | Searchable catalog grid/list remains stable | Selected resource details, actions, and compatibility status use a detail rail | Categories, filters, links, availability, saved state, honest external status |
| Settings | Stable navigation, search, and forms; no moving controls while editing | Section summaries and previews may use contextual detail panes | Every registered setting, focus/deep links, reset, import/export, recovery |
| Scraper | Step/state canvas, data tables, and logs stay solid | Source settings, field detail, handoff, and result preview dock contextually | Every page, registry, job state, export, stored results, errors, cancellation |
| Immersion | Browser/VN/manga content remains an anchor | Sentence assist, capture, dictionary, character/source detail, and mining dock to selection | All VN, browser, manga, capture, metadata, release, community, import flows |
| Reading | Document/discovery canvas remains stable | Dictionary, plan, source, comprehension, capture, and mining context follow selection | Home, Discover, Library, Continue, Plan, Imports, Sources, reader compatibility |
| City | Garden/world canvas remains dominant | HUD, growth detail, reading source, and settings appear only when requested | Growth state, reading links, save/restore, reduced motion, performance |
| Note | Conventional sticky note remains the default | Optional compact Liquid palette and related-item edge dock | Text, color, position, delete confirmation, persistence, keyboard |
| Visualizer | Visualization canvas stays stable | Controls fade into an edge dock and return on focus/keyboard | All modes/settings, audio state, detach limits, performance |
| Music widget | Compact fixed transport remains conventional | Optional Liquid mini-player with expandable queue/volume sheet | Transport, current item, volume, pop-out, restored geometry |

### 7.1 Internal suites that also require individual treatment

- **Manga/PDF/EPUB readers:** paper/content stays opaque; OCR, dictionary, translation, page tools, and mining are contextual edge tools.
- **Visual Novel suite:** script and game context stay anchored; capture, character, release/source, sentence assist, and mining use a consistent inspector contract.
- **Media panels:** Readiness, Review, language profiles, tracking sources/calendar, and assistant panels inherit the Media scaffold without becoming identical cards.
- **Blanc Toolbox:** every ready tool receives a capability decision. Dense utilities such as calculator, converter, file search, monitor, console, and field editors remain anchored; transient search, app drawer, notifications, and quick actions may use Blanc-native Liquid behavior.
- **Onboarding and help:** teach the orientation spine and “Make Liquid” as optional. Never force the user into Liquid during the tour.

## 8. Theme and shell coexistence

Liquid behavior is orthogonal to theme identity.

| State | Requirement |
| --- | --- |
| Study OS + standard | Clean redesigned app interior, conventional window frame and behavior |
| Study OS + Liquid | Concept-like restrained graphite/berry materials where appropriate |
| Aero + standard | Existing Aero window, taskbar, viewport, unlock, safe mode, and app chrome remain intact |
| Aero + Liquid | Same Liquid spatial rules, mapped to bright Aero glass/sky tokens; work surfaces remain readable |
| Wired + standard | Existing Wired identity and status/chrome remain intact |
| Wired + Liquid | Spatial adaptation with mostly opaque terminal/work surfaces and restrained signal-like edge material |
| Blanc + standard | Blanc’s separate renderer and native toolbox language remain intact |
| Blanc + Liquid | Blanc-native implementation of the semantic contract; never import Study OS chrome or mount a Study OS `*View` |
| High contrast | No blur/transparency dependency; geometry and hierarchy remain |
| Performance/safe mode | Replace blur/refraction with stable tint; no feature or layout loss |

Protected systems include Secret Aero discovery and exit, Aero safe mode, Wired lifecycle, taskbar shell, desktop grid, display assignments, window dragging, pop-outs, and Blanc’s cold-open boundary.

## 9. Concept-image and AI reference rules

The concept image is a **design-intent reference**, not a literal implementation screenshot.

Every agent or designer working on Liquid must follow these rules:

1. Inspect the concept image and the fresh screenshot of the target surface before editing real components.
2. Extract hierarchy, spacing, density, surface roles, and interaction intent. Do not blindly copy pixel values.
3. Treat generated Japanese text, timestamps, icons, grammar labels, and sample data as illustrative only. Product data and language behavior come from source contracts.
4. Do not infer that every visible panel must always be open. The image shows a Study intent preset at a generous viewport.
5. Do not turn every rectangle into glass. Classify each surface as Anchor, Work, Liquid, or Ambient first.
6. Do not delete a feature because it is absent from the concept. Update the parity ledger and find it an intuitive destination.
7. Do not add a feature solely because the concept appears to show it. Verify the existing product contract first.
8. Preserve normal windows. The concept depicts Liquid presentation, not the default behavior of all windows.
9. Preserve Aero, Wired, Blanc, high contrast, reduced motion, and performance modes through semantic tokens and presentation contracts.
10. If creative judgment changes the concept, record the reason and show before/after evidence. Favor improved usability over visual imitation.
11. Never describe a surface as visually complete from source inspection alone.

## 10. Visual confirmation and evidence protocol

### 10.1 Baseline before implementation

For every app:

- capture standard mode at its current default size;
- capture its smallest supported size and maximized size;
- record visible features and all alternate routes;
- record computed geometry, overflow, focus order, and hit targets;
- capture empty/loading/error/offline states where applicable;
- record current theme/material state and motion preference.

Store the ledger and evidence under `src/.coordination/liquid-workplace/`. Never overwrite baselines; version them by milestone.

### 10.2 Required comparison set

Each migrated app needs:

- before standard;
- after standard;
- after Liquid;
- compact standard and Liquid;
- default, Aero, Wired where supported;
- high contrast;
- reduced/disabled motion;
- at least one real functional state, not only an empty harness.

Blanc gets an equivalent native matrix in its separate entry.

### 10.3 Acceptance method

- Drive real state through the app debug bridge/in-app browser workflow.
- Use screenshots plus DOM/computed-style measurements. Pixel comparison alone is insufficient for video and animated content.
- Verify the feature ledger by observable side effects, not by button presence.
- Compare focus order to visual order.
- Check clipping, overlap, accidental scroll traps, wallpaper-dependent contrast, drag targets, resize behavior, and taskbar identity.
- Once a surface reaches 80/80 on `src/LIQUID_UI_RUBRIC.md`, add regression assertions for stable geometry/tokens/feature routes. Do not make brittle pixel snapshots the only gate.

### 10.4 Approval questions

**AMENDED 2026-08-16 — user visual approval is REMOVED from this plan.** On a direct user
instruction, every gate below that read "user approves" or "user visually approved" is
replaced by the measured rubric in `src/LIQUID_UI_RUBRIC.md`: eight categories, 10 points
each, **80/80 required**, every score carrying a measured number and a negative control, and
anything under 10 fixed and re-measured rather than reported. The ten questions in this
section are not retired — they are scored as rubric category 5 instead of being asked of a
human. Do not park a Liquid surface in `needs-user.md` awaiting a look; there is no look.

An app cannot pass unless the answer is “yes” to all:

- Is the dominant task immediately obvious?
- Is the current location and way back obvious?
- Are primary actions visible without hunting?
- Are advanced tools discoverable without cluttering the default view?
- Does every readable surface have stable contrast?
- Does Liquid motion explain a real relationship?
- Does standard mode remain fully normal?
- Can Liquid be turned off without losing state?
- Are all pre-migration features reachable and functional?
- Does the app still feel like itself rather than a generic card dashboard?

## 11. Phased implementation timeline

### L0 — Relay cleanup, live baseline, and freeze map

Dependency: complete the current relay’s clean-HEAD repair instructions first.

- Reconcile the active dirty tree without staging foreign work.
- Capture fresh player and all-app baselines.
- Inventory routes, controls, commands, settings, tests, and visual states.
- Create the feature parity ledger and protected-system matrix.
- Record performance baselines: boot, window drag, resize, theme switch, memory, and player frame stability.

Gate: no Liquid product code until the baseline and parity ledger exist.

### L1 — Design contract and reference calibration

- Approve the definitions in §§1–4 against two representative apps: Video and Dictionary.
- Confirm the four surface roles and orientation-spine behavior.
- Approve standard/Liquid entry, exit, and recovery UX.
- Produce static layout studies for compact, default, and maximized states.

Gate: the layout studies score 80/80 on `src/LIQUID_UI_RUBRIC.md` against Video and Dictionary
before shared primitives are built. (Was "user approves"; amended 2026-08-16, see §10.4.)

**Progress (2026-08-17, L0's gate having closed the same day).** Two of the eight rubric
categories are now driven live on both reference apps, each with a control that failed:
`.coordination/liquid-workplace/L1_SURFACE_ROLES.md` (category 3 — the four roles are
mechanically decidable; Video 3 of 3 eligible regions Liquid-treated, Dictionary 0 of 9, dense
work on translucent material **0** on both) and `.coordination/liquid-workplace/L1_USE_OF_SPACE.md`
(category 4 — clean at default; **Video clips 49 boxes at 260×170**, reproducing
`ALL_APPS_BASELINE.md`'s figure through a second instrument, so its category 4 is not a 10).

**Category 4 is now measured at all three sizes and NEITHER app is a 10** (2026-08-17,
maximized added). Both maximize to 1264×765 with 0 clipped / 0 overlap / 0 horizontal scroll,
but the dead region *grows*: Dictionary 8.9% → **22.0%** of viewport, Media 22.1% → **34.8%**,
against the rubric's 15% bar — so Dictionary loses the clean sheet the default table gave it.
Canvas-vs-chrome moves the right way (Media 58.3 → **62.4%** canvas, into §4.1's band; chrome
48.1 → 44.5), so the layout does spend new width on the canvas and then fails to fill it.
Control: an injected must-clip box at maximized took Media 0 → **1** and left Dictionary at 0;
round trip byte-identical on `left/top/width/height`. All 14 default-size figures reproduced
to the decimal on a fresh instance, which is what licenses the new row.
**Category 1 (accessibility) measured 2026-08-17 — also not a 10, on one bar only.**
`.coordination/liquid-workplace/L1_ACCESSIBILITY.md`. Contrast passes (min **5.30:1** Dictionary
over 141 runs, **5.13:1** Media over 37, **0** below bar, **0** unmeasurable); keyboard passes
(**0** unreachable of 54 and 31, tested by real `focus()`); reduced motion passes at **0.001 ms**
via `theme/a11y.css:36-46`+`:50-55` (live 8→0, 30→0). **Hit targets fail the rubric's 32 px bar —
Dictionary 45 of 54, Media 19 of 31 — while WCAG 2.5.8 with its spacing exception is clean at 0
on both.** Decision recorded: do NOT inflate compact chrome (that rule generated 98 false
failures before, and growing it would worsen category 4's dead region); L4 gets a targeted
hit-AREA fix and a re-score in the fixing commit. Two traps banked: the `data-theme` attribute
swap is a HALF-APPLIED palette that manufactures ~1.01 ratios (39 fake failures — `--accent` is
inline on `<html>`), so the §0 two-palette check is **not** done and category 1 is one-palette;
and reading `styles.css` alone says reduced motion FAILS, which the live diff disproved.
**Category 8 (honest states) attempted 2026-08-17 and is VOID, not scored** —
`.coordination/liquid-workplace/L1_HONEST_STATES.md`. Empty state is `LIVE` and names the query
("No dictionary match for …"); loading is `LIVE` ("Translating sentence…" → "Adding…" → "Added");
raw i18n keys **0** on `lang=en`. But **both induced failures SUCCEEDED** — AnkiConnect is up and
an AI provider is configured — so error/offline were never observed and the rubric's "control did
not fail ⇒ VOID, not 10" applies. Next slice's first job: a genuinely unreachable dependency.
Trap banked: the probe first reported `loading: 0` while the surface was visibly loading, because
Dictionary renders that state as the **button's own label**, not in a `[class*="loading"]`
container — the D-calibration error, reproduced exactly. Also note the Anki click really wrote one
食べる note to the live collection.
**Category 2 (clunkiness) measured 2026-08-17 on Dictionary — not a 10, and not for a defect.**
`.coordination/liquid-workplace/L1_CLUNKINESS.md`. Dominant task costs **2 clicks + 3 keystrokes**
→ 8 results; worst input acknowledgement **49.2 ms**, **0 of 5 over the 100 ms bar**; Search click →
8 rows painted in **161 ms** warm (2,194 ms cold); **0** modal traps, **0** scroll traps, **0**
confirmed dead ends of 19 driven. Bait control fires: an injected handler-less button is reported
`changed: false`. Not a 10 because two of the five numbers were not obtained — **17 of 36 driven
controls are `(unlabelled)`** so their dead-end status is unmeasured, and the Standard-vs-Liquid
cost delta has no second term until L3/L4 exists. Three probe false positives were killed en route
and are worth more than the score: `rAF − ev.timeStamp` bills the app for the **main→renderer hop**
(an inert click read 154/356/187/77/23 ms, three over bar, repainting nothing) so latency is scored
on renderer-side receipt→paint; four `span.sr-only` counted as scroll traps, i.e. the surface
penalised for being accessible; and a sweep that resolved all element references up front reported
**42 dead ends of 45** because target 2 (`中文`) wiped the result list and the rest clicked detached
nodes. Also banked: 18 controls that write real user data are skipped by name, after the first run
moved study state on eight words before the `mark it Learning` rule existed.

**Category 8's control fired 2026-08-17 and found a crash, not a missing message.**
`.coordination/liquid-workplace/L1_HONEST_STATES_CONTROL.md`. The genuine unreachable dependency is
`userData/profiles.json` → `ankiUrl: http://127.0.0.1:1`, a closed loopback port (refuses rather
than hangs), with the app stopped for the edit and restarted around it, because `getAnkiUrl()` reads
a schema loaded once in the store constructor and main does not hot-reload. Control verified at the
IPC layer first: `ankiStatus()` → `connected:false` with a named error in **1 ms**.
**One click on "+ Add to Anki" then took the desk from 4 `.fwin` windows to 0** —
`DictionaryResults`'s `showSetup` early return sat above the `knowledge` `useMemo`, so the first
render after Anki went unreachable ran one hook fewer and `AppErrorBoundary` recreated the tree.
Invisible on the success path, which is why the earlier pass never saw it. Fixed by hoisting the
hook; guarded by `dictionaryUnreachableAnkiHooks.test.tsx`, which asserts the connected→disconnected
**transition** (the end state alone passes against the broken code) and fails with the identical
React error when the hoist is inverted. Re-measured after the fix: error state **LIVE** and named
with a four-step remediation walkthrough, **4 of 4** windows survive, **0** raw i18n keys,
`/logs?level=error` **total 0**. `profiles.json` restored byte-identical, SHA256 re-checked `-ceq`.
Category 8 is still not a 10: the **offline** state (a timeout, distinct from a refusal) is undriven,
raw-key counting is `lang=en` only where the rubric wants all four, and dead-control/fabricated-value
counts remain unclaimed.

**Category 8's four-language half closed 2026-08-17 — 0 raw i18n keys in all four languages.**
`.coordination/liquid-workplace/L1_RAW_KEYS_FOUR_LANGUAGES.md`. **2,248 rendered text runs per
language, 5 windows + whole document, 0 refused, 8 `dict-entry` results live in every pass, 0 raw
keys** at en/ja/zh/ru. The switch is proven to reach the *rendered* surface (titles read
`Scraper / スクレイパー / 抓取器 / Скрапер`), driven through Settings → Appearance rather than a
storage write + reload, and `ui-lang` restored to `en` equal to the captured baseline. Not
redundant with `tools/i18n-check.cjs`: that gate compares catalogs against each other, so a key no
catalog has passes it — and that is exactly when `core.ts:94` renders the dotted key at the user.
Control fired twice (planted text key **found**, planted `placeholder` key **found**, planted
`display:none` key **silent**), re-run after the probe rewrite below.
**Trap banked, and it is the important half of this slice:** the probe first addressed windows by
English title text, so switching the language made 4 of 5 lookups refuse and it printed
`candidates=0` **on four windows it never read** — a zero byte-identical to a clean pass, caught
only by the run-count dropping 2,248 → 1,205. Windows are now addressed by **DOM index**, and
`refusedWindows`/`dictEntriesLive` sit at the top level of every result. Generally: *a probe keyed
on any user-visible English string cannot be used in a sweep that changes the language.*

**Category 5 (UI clarity) driven 2026-08-17 and is NOT SCORED — structurally, not for a defect.**
`.coordination/liquid-workplace/L1_UI_CLARITY.md`. **Q7 and Q8 are `NO-SUBJECT` on all five
windows**, measured rather than assumed: **0 Liquid-presentation toggles** anywhere, so there is no
Liquid mode to leave and nothing to turn off; **Q6 is `NO-SUBJECT` on Anki and Dictionary too**
(**0** `backdrop-filter` regions). Scoring those "yes" would credit the ABSENCE of the feature as
the presence of its quality, so category 5 is capped at **7 answerable questions of 10 until L3/L4
exists** — the same shape as category 2's missing Standard-vs-Liquid term. Driven results
(YES/NO/NO-SUBJECT): Anki 4/1/3, Scraper 5/1/2, Dictionary 4/1/3, Media 5/1/2, Settings 6/0/2.
The one real cross-surface finding is **Q4**: Scraper **31**, Media **25**, Dictionary **18**
chrome controls against a 12 bar, and **Media offers 0 collapsed disclosures at all**. Anki fails
**Q3** — its primary action sits outside the body viewport at `scrollTop 0`. Q5 inherited from
`l1-accessibility.js` re-driven today (min **5.30:1**, **0** of **141** failing); Q9 inherited from
`parity-ledger.json` (**0 of 7** rows `both`, all `pending`).
Control fired in three directions — blanked title → Q2 NO, displaced primary → Q3 NO, and an
injected 6-card **heterogeneous** dashboard → Q10 NO while `div.os-theme-grid`'s 13 **homogeneous**
swatches at the same 1.00 uniformity stay YES, proving the gallery discriminator is a real
distinction and not a blanket exemption. Restored to 0 markers, all verdicts back to baseline.
**Four probe defects were killed before any score was recorded**, each a recurring shape: the
window body computes to `rgba(0,0,0,0)` so "is it accent?" was comparing against black; Anki
scored `entryPoints: 0` because a `<select>` was not counted as an entry point; Q3 answered YES
about the **wrong element** (Dictionary's grammar toggle, Media's nav row); and Q10 called four
surfaces a card dashboard when the hosts were nav lists and a conjugation table. Plus
`identityMarkers.desktopLayer` queried `.desktop`, which does not exist here — the same
match-nothing selector failure as `l1-use-of-space.js`'s `.fwin-titlebar`.

Still open for L1: categories 6–7, category 8's **offline** half (a timeout, distinct from the
refusal already driven), its dead-control and fabricated-value counts, and the layout studies.
`LIQUID_SCORECARD.md` is deliberately still empty — six driven categories, none scoring 10.

### L2 — Semantic tokens and shared primitives

- Add Liquid semantic tokens without changing existing app output.
- Implement Anchor/Work/Liquid/Ambient surfaces, scaffold, dock, inspector, adaptive rail, and context toolbar.
- Map default, Aero, Wired, high-contrast, performance, and motion variants.
- Build focused harnesses and accessibility tests.

Gate: primitives pass contrast, keyboard, motion, and performance checks in isolation.

### L3 — Opt-in per-window infrastructure

- Extend the existing window snapshot with backward-compatible presentation state.
- Add explicit Make Liquid / Return to standard commands.
- Preserve geometry, focus, z-order, pin, pop-out, snap, monitor transfer, and taskbar behavior.
- Add corrupt-state recovery and mode round-trip tests.

Gate: an unchanged sample app can switch modes and back with byte-for-byte app data and equivalent observable state.

### L4 — Media shell repair and Video pilot

- Restore/confirm the coherent Media shell first.
- Refine the player through §6, using the concept hierarchy and current workspace capabilities.
- Validate every player feature in standard and Liquid modes.
- Score the video result on the rubric before calling it the system pattern.

Gate: complete §6.5 acceptance matrix and 80/80 on `src/LIQUID_UI_RUBRIC.md`, driven live on a
real playback state. (Was "user visual approval"; amended 2026-08-16, see §10.4.)

### L5 — Core study tools

Order: Dictionary → Grammar → Translate → Agent.

- Establish the common selection/context-inspector contract.
- Keep results, prose, forms, and conversation anchored.
- Move only contextual actions and deep detail into Liquid regions.

Gate: feature ledgers complete; cross-app handoffs retain context.

### L6 — Reading and immersion ecosystem

Order: Reading → Novels → Library → Immersion → manga/PDF/EPUB/VN suites.

- Establish the common content canvas and reading-side-tool contract.
- Preserve progress, capture, dictionary, mining, source, and deep-link behavior.

Gate: content remains legible and stable at all sizes; no tool obscures the document.

**Progress (2026-08-25). Bullet 1 OPENED, not closed** — the contract exists and 1 of its 5
surfaces uses it. Log: `.coordination/liquid-workplace/L6_READING_ECOSYSTEM.md`.
`shared/liquidReadingCanvas.ts` + `components/liquid/ReadingCanvas.tsx` (`edb01bfa`) give a reading
side tool exactly two placements — `docked` beside the document or `sheet` over the whole canvas —
so **a partial cover cannot be expressed** and the Gate's second sentence is an invariant rather
than a review note. The measure clamp lives in the same module because the Gate's two halves
interact: unclamped, a docking tool reflows every line; clamped, it takes slack margin and
`readingCanvasReflows` returns **false** at 1600 px.
First surface, Captures (`efb18eba`): its `minmax(180px, 260px)` grid and `@media (max-width:
720px)` stack are deleted. Negative control — the media query could not fire for the case it
existed to handle: pane **562 px**, `window.innerWidth` **1264**, `matches` **false**, so the old
grid left the passage **292 px** (~17 characters a line at 17 px) while reporting a responsive
layout. Live round trip: 820 px window → canvas 762 → docked 260 → document 490 → 42 real rows;
narrowed → sheet 562, document 562, `inert` + `aria-hidden`; dismissed → 562 with its 69 characters
intact; restored → 490, 42 rows. Category 6 scored **6/6 in both presentations** (`65a24365`),
round trip identical on every field, three negative controls each failing exactly one row.
Second surface, **Novels** (`b555bbb0`): NovelReader's three `.settings-anchor` popovers — bookmarks,
book translation, reading settings — are canvas tools; the triggers stay in the toolbar and gained
`aria-pressed`. FILL policy, because `settings.contentWidth` is a persisted rem measure the user sets
in the very panel being migrated. **640 px turned out not to be the sheet case**: room = 640 − 12 −
384 = 244 clears bookmarks' 200 floor, so it docks at 244 (clamped to the slack) and the page keeps
exactly 384 — 0% covered where the popover covered 41%; the sheet arrives at 500. Live on a real
EPUB: canvas 1264, docked document **988** with the tool at left 1000, i.e. a **12 px gap and zero
overlap**; two docked = 696 + 280 + 264 + 24 = **1264 exactly** with the first-opened tool keeping
its 280; a 520 px pane gives a sheet spanning the document's box exactly, `inert` + `aria-hidden` +
`role="dialog"` + `aria-modal`, taking focus, and Escape alone returns it to the trigger at 2%.
The primitive gained `position: relative` on `.lq-reading-doc` — and **the negative control refuted
the first explanation**: the page does not paint over the tool (`overflow: auto` clips it), it
MIS-MEASURES, reporting `clientWidth` 1264 inside a 696 px region, which is the number
`NovelReader.tsx:935` sizes every paged column from.
Third surface, **Library** (`95c91741`), and fourth, **Immersion** (`000c7c4d`) — Immersion had no
responsive rule at all, so the stage absorbed the rail's 220px at *every* window size. Fixing it
exposed a defect in the primitive that all four shared (`09bbced2`): `.lq-liquid` sets
`position/padding/background` at the same (0,1,0) specificity as `.lq-reading-sheet` and loads
later, so every sheet was a **partial cover** — 338px in flow beside a 112px document at a 462px
canvas — the one outcome the contract calls inexpressible. Fixed by specificity, not import order.
Immersion was then re-measured for rubric category 7 and failed it (`5c477856`): its rail held
**883 rows / 6,182 elements** at 112x overdraw, now 20 / 163. That fix is where
`probes/cat7-collection-weight.cjs` comes from — one surface-parameterised harness for the whole
category, per RULE 1.

Fifth surface, **manga** (`439324f5`). The panel never covered the page — a probe refuted that —
it made the reader MIS-MEASURE: `.ocr-panel` was `position: fixed` over a stage whose
`clientWidth` feeds `mangaPageFitStyles`, so the fit math emitted `max-width: 1264px` for 952px of
visible stage and put the page 150px off-centre. Docked, the stage measures **952 = 1264 − 300 −
12** and the page centres at 476 against a visible centre of 476 — **0 off**. Sheet at 620 with
`inert` + `aria-hidden` + `role="dialog"`; dismissal returns the SAME stage node at 1264. The
document region is full-bleed here (`.lq-anchor`'s 16px inset cost 34px of a reader whose whole
surface is the page). Fifth caller of the one harness, zero plumbing; five suites **48/48**.

**Still open in bullet 1: the VN suite, and only that.** Re-derived 2026-08-25 rather than assumed:
PDF and EPUB are NOT separate readers — `renderer/pdfLoader.ts` is imported by `NovelReader.tsx`
alone, so both are surface 2. `.visual-novel-layout` has the Captures/Library defect exactly
(`minmax(220px, 290px)` beside a `@media (max-width: 760px)` that reads the WINDOW, inside a pane).
It needs a `side: 'leading'` on the tool spec — its library column is on the leading edge — and a
close toggle, because the column is currently always visible. Deferred this turn on FILE
OWNERSHIP, not on a decision: `VisualNovelPanel.tsx` carries another track's large uncommitted
i18n rewrite. Full measurement in the L6 log's last section.

### L7 — Review and learning loop

Order: Flashcards → Anki → Notebook → Statistics → Calendar → Games.

- Keep review/input surfaces spatially fixed during active tasks.
- Use Liquid only for context, preview, scheduling detail, and session summaries.

Gate: timing-sensitive input and study state do not shift unexpectedly.

### L8 — Discovery, operations, and configuration

Order: Resources → Scraper → Settings → YouTube → Music.

- Apply progressive disclosure without burying configuration or operational state.
- Preserve logs, errors, cancellation, and recovery visibly.

Gate: every setting and scraper action remains searchable and keyboard reachable.

### L9 — Shell, widgets, and alternate identities

- Finish taskbar/context/command entry points without forcing Liquid.
- Migrate Note, Visualizer, Music widget, City, notifications, onboarding, and help.
- Complete Aero, Wired, and Blanc-native Liquid adapters.
- Verify Secret Aero/Wired lifecycle and Blanc cold-open boundaries.

Gate: all theme/mode combinations in §8 pass without identity leakage.

### L10 — System-wide smart minimalism pass

- Remove redundant chrome and card nesting identified by the visual census.
- Reconcile toolbar labels, icon semantics, spacing, motion, empty states, and responsive breakpoints.
- Ensure the command palette and search expose moved secondary/expert actions.
- Confirm no feature is duplicated into competing control systems.

Gate: one coherent workplace language with individual app character preserved.

### L11 — Accessibility, performance, and long-session hardening

- Full keyboard and screen-reader pass.
- High contrast, zoom, text scaling, compact widths, and reduced/disabled motion.
- Drag/resize at target frame rate while media, dictionaries, and large lists are active.
- Blur fallback, GPU-loss recovery, multi-monitor, restart persistence, and long-session memory checks.

Gate: no regression against L0 performance and interaction baselines — scored as rubric
category 7, measured after a real restart, not asked of a human.

### L12 — Visual certification and release handoff

- Run every app’s standard/Liquid/theme/state screenshot matrix.
- Close every feature-ledger row.
- Run focused tests, full suite, architecture/i18n gates, packaged-app checks, and fresh-profile migration.
- Produce a final visual atlas and remaining-risk report.

Gate: only then may Road to v1.01 Phase 10 call the Liquid Workplace release-ready.

## 12. Definition of done

The system-wide transformation is done only when:

- every current desktop app and supported internal suite has a rubric-approved (80/80) standard and Liquid presentation;
- standard windows remain the default and behave normally;
- every Liquid transition is explicit, reversible, and state preserving;
- every feature-ledger row is complete in both presentations;
- Aero, Wired, Blanc, high contrast, reduced motion, and performance modes pass their matrices;
- the video player reaches the concept’s hierarchy with all current player capabilities preserved;
- no essential feature is hover-only, gesture-only, unlabeled, or buried in an undiscoverable menu;
- visual evidence exists for real data and failure states, not only static mocks;
- performance, accessibility, persistence, and multi-monitor gates pass;
- every migrated surface holds a committed 80/80 scorecard in
  `src/.coordination/liquid-workplace/LIQUID_SCORECARD.md`, the representative player and the
  final system atlas included. (Was "the user has visually approved"; amended 2026-08-16 —
  see §10.4 and `src/LIQUID_UI_RUBRIC.md`.)

### 12.1 Open product defects that block a rubric category

Recorded here because a defect logged only in a scorecard subdirectory is invisible to every
other track. Boss audit `audit-20260824-053717` raised exactly that as its Finding 1.

**D1 — main-process private bytes grow ~12× under ordinary Dictionary use and never come back.**
Status: **FIXED 2026-08-24** in `src/main/translate.ts`. Everything below is the record of the
hunt and stays because the premise it corrects is the expensive part — the header said "under
ordinary Dictionary use" and the cause was in neither the Dictionary nor the renderer.

It was never a leak. `translate.ts` called `model.createContext()` with no size, so
node-llama-cpp allocated a KV cache for Qwen3-1.7B's full 32,768-token context, and the module
kept only the `LlamaChatSession` — the model and context that own the weights and that cache had
no reachable reference, so nothing could ever release them. Attribution and its positive control:
`probes/l7l-llama-attribution.cjs`, then a translate load that took main **3,447.7 → 9,618.8 MB**
and settled at **7,222 MB**, which is the plateau below. Fix: a bounded `contextSize`, an idle
unload that disposes context and model, and `loadPromise` cleared on success (leaving it set made
the unload's own guard permanently false — caught live, not by the tests). Measured after, one
process: 430.3 → peak 3,288 → **913.9 MB** when the 5-minute deadline fired at t+304 s, RSS
1,901 → 340 MB. Pinned by `src/main/__tests__/translateModelLifecycle.test.ts`, three mutation
controls. Remaining open question, recorded rather than assumed: 913.9 is ~484 MB above the
430.3 MB boot baseline, and which action in the Dictionary cadence starts a model load at all is
still unidentified.

- Expected: main private bytes stay near the L0 baseline of 550–577 MB across a session.
- Actual: **575.8 MB / 1,053 handles → 7,075.7 MB / 4,404 handles** after one
  `probes/l1-deadend.js` run (19 Dictionary controls in ~70 s). Three boots plateau at
  7,071.8 / 7,082.0 / 7,075.7 MB, within 10 MB of each other, and it stays.
- It is **not a timer**: an idle boot left alone over the same window moved **+0.6 MB / −3
  handles**. It is action-driven, so a fast user reaches the plateau too — not only a probe.
- It is **not one leaking control**: all 19 are individually exonerated at ≤8 MB net. One action
  commits ~250–340 MB transiently and gives it back (`searched` 801.1 → 544.7 on the next
  sample); nineteen back-to-back give none back. So it is release failure under **cadence**.
- Repro, three commands: boot clean → `probes/l7d-setup.cjs` → `debug/evfile.cjs
  probes/l1-deadend.js`, reading `PrivateMemorySize64` before and 70 s after.
- Measurement trap: read `PrivateMemorySize64`, **never `WorkingSet64`** — main RSS swung
  5,453 → 59 MB while private stayed flat.
- Blocks: rubric **category 7** leg 3, which is why category 7 is recorded NOT 10. Evidence and
  the full sample series live in `src/.coordination/liquid-workplace/L7_PERF_DICTIONARY.md`.
- Next action is a bisect of the allocation, and it is a slice of its own.

**D2 — the first dictionary interaction after a cold boot blocks main for ~1.5 s.**
Status: **FIXED 2026-08-25** by `src/main/dictionary/warmup.ts`, scheduled from
`registerDictionaryIpc`. `8b769fa6` carried this forward as "~2 s of cold cost is NOT in the
windowed scan" and named the SQLite open as the suspect. **The open is not it and neither is the
scan.** Both were falsified before anything was written:

- Not the open: `dict:listPairs` forces it plus `migrateDictionaryDb` in **1 ms** on an evicted
  boot (`maxGap` 3 ms).
- Not the scan: a standalone process over the same 537 MB file, evicted, walks the whole ja
  partition — **158 windows, 772,750 rows, 409 ms total, worst window 13 ms, none over 100 ms**
  (`debug/dict-scan-windows.cjs`). There is no 1.7 s window to find.
- It is `lookup()`'s **pre-check**, the `headwordsOnly` probe `findLexiconCompounds` runs before
  the scan. Isolated with a query that misses, so the call returns before the scan is reached:
  cold it costs **1,552 ms in one unbroken block**; the same miss warm costs **54 ms** and a
  *fresh* miss warm **51 ms**, so it is cold pages, not the miss.

Fix: stream `dict.db` once, 5 s after registration, with async `fs` on libuv's threadpool. The
Windows file cache is per file, not per handle, so pages faulted in there are the pages SQLite's
mmap later finds resident — and the main loop is never occupied, which a warm-up *query* through
the synchronous driver could not avoid. Declines by name on a missing file or one over
`DICT_WARM_MAX_BYTES` (1.5 GB), where the read would evict more than it warms.

A/B, identical procedure both sides — `tools/evict-file-cache.ps1 -TargetGb 8`, own boot,
`debug/lq-mainloop-harness.ps1`, idle control valid both times (40 ms / 22 ms):

| arm | before | after |
| --- | --- | --- |
| pre-check alone, cold (worst main-loop block) | **1,552 ms** | **74 ms** |
| `dictCompounds('猫')` worst block / wall | 196 / 1,145 ms | 69 / **195 ms** |
| `dictCompounds('犬')` wall | 218 ms | 165 ms |

Same 12 compounds both sides. Elapsed idle time is not the explanation: the first cold run of the
day sat ~60 s past boot before its query and still blocked **1,711 ms**. Pinned by
`src/main/__tests__/dictionaryWarmup.test.ts` (7 cases incl. the too-large refusal proving nothing
is read, and a cancel that stops mid-file).

## 13. Explicit non-goals

- Replacing Electron’s/native window behavior with physics or freeform gestures.
- Making every surface translucent.
- Copying macOS or Apple proprietary chrome.
- Deleting “advanced” features to achieve minimalism.
- Rewriting app data/services while restyling them unless a proven architecture defect blocks the UI contract.
- Folding Aero, Wired, or Blanc into one palette.
- Letting AI rearrange a user’s workspace without explicit approval.
