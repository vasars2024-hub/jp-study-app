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

**Every bullet below carries a machine-readable status marker** (relay RULE A, seeded
2026-08-31). Count it with `grep -c '^- .*status: closed;'` and its `open`/`unknown` siblings.
The `^- ` anchor is load-bearing, not decoration: an unanchored pattern also matches this
paragraph and reports one closed bullet too many. The three counts must sum to 46, and `^- `
still matches every bullet. Seeded from this plan's own explicit statements only — nothing
inferred, nothing rounded up.

**After L9 bullet 3 closed (`3f47bfa1`): 6 closed / 20 open / 20 unknown, of 46.**

**Seed result: 5 closed / 21 open / 20 unknown, of 46.** This is **−2 against the relay pin's
expected 7/19/20**, and the difference is L7. The pin seeds L7's two bullets `closed`; the L7
status block at line 1174 says in its own words that Anki's "eight cells and the two
system-wide L7 bullets **remain counted and open**", advancing the ladder under the
human-blocked exception "without calling the L7 Gate closed". RULE A says seed from explicit
statements only, so they are tagged `open` with `evidence: plan:1174`. L7 is human-blocked
(Anki desktop is not installed; 127.0.0.1:8765 refuses), so it does not gate the ladder — but
it is not closed, and marking it closed to reach the pin's 7 is exactly the fabrication RULE A
exists to stop.

**RULE E is DONE — 2026-08-31, backup. All 20 `unknown` resolved against the TREE, none from a
summary. The triple is now `24 closed / 22 open / 0 unknown` of 46.** Eighteen resolved `closed`
and each carries its artifact, commit or test in its own tag. Two resolved **`open`**, and they
are new work nobody was counting, so they are named here rather than left in a tag alone:

- **L0 line 484 — player frame stability was never measured.** Five of its six axes are in
  `PERF_BASELINE_RESTART.md`; the sixth needs a real clip playing, and both
  `PERF_BASELINE.md:104` and `VIDEO_BASELINE.md:109` already recorded it open. Not human-blocked:
  `L4_MEDIA_SHELL.md` records the "needs a real clip" blocker CLOSED, so the clip exists.
- **L4 line 651 — `mediaWorkspace` has no Liquid destination.** `parity-ledger.json` reads
  `mediaCenter` 8 of 8 `both` but `mediaWorkspace` **6 of 6 `pending`**, so "every player feature
  in standard *and* Liquid" is not met on that surface.

Do not re-derive the eighteen. Do not re-tag any bullet `unknown` without new source evidence.

### L0 — Relay cleanup, live baseline, and freeze map

Dependency: complete the current relay’s clean-HEAD repair instructions first.

- Reconcile the active dirty tree without staging foreign work.  <!-- status: closed; evidence: all 4 liquid docs tracked (git ls-files); 435 path-scoped commits under .coordination/liquid-workplace; 391 foreign dirty paths still unstaged -->
- Capture fresh player and all-app baselines.  <!-- status: closed; evidence: VIDEO_BASELINE.md + ALL_APPS_BASELINE.md, 22 surfaces x 3 sizes, raw records baselines/L0-baseline-1/ -->
- Inventory routes, controls, commands, settings, tests, and visual states.  <!-- status: closed; evidence: CENSUS.md milestone L0-baseline-1 da154966 -- 25 sections / 21 root components / 4,709 controls / 464 commands / 5,715 i18n keys -->
- Create the feature parity ledger and protected-system matrix.  <!-- status: closed; evidence: PARITY_LEDGER.md verdict "L0 gate CLOSED as of 2026-08-17", 9 of 9 protected-system rows verified; parity-ledger.json 50 rows -->
- Record performance baselines: boot, window drag, resize, theme switch, memory, and player frame stability.  <!-- status: closed; evidence: 6 of 6. Five in PERF_BASELINE_RESTART.md 2026-08-16 (boot/drag/resize/theme/memory); the sixth in PERF_BASELINE_PLAYER.md 2026-09-03 -- a real clip (JoJo 39-END RAW, 1280x720, sidecar directstream) playing in #media-workspace, 3 runs / 6 scored readings, 0 dropped and 0 corrupted frames, decoded 23.6-24.6 fps, renderer p50 16.7 ms against a 16.7 ms same-session ceiling, 0 frames over 100 ms. TWO controls both fired: the instrument REFUSED a paused player (scoredAnyway null x3, clip restored and verified paused:false each time) and -Jank moved p95 16.9 -> 100.4/117.0/100.3 ms. Instrument: liquid-interaction-probe.ps1 -Interaction playback + cat7-perf.cjs --surface player --playback (RULE 1: no new probe) -->

Gate: no Liquid product code until the baseline and parity ledger exist.

### L1 — Design contract and reference calibration

- Approve the definitions in §§1–4 against two representative apps: Video and Dictionary.  <!-- status: closed; evidence: gate 495 CLOSED 2026-09-03 -- LIQUID_SCORECARD.md carries a COMPLETED entry for BOTH named surfaces: Dictionary 80/80 (c97b864d) and Video 80/80, whose last cell (cat 7) closed this turn at PASS 10/10 after e54cdd9d fixed three instrument defects in the harness. Both re-driven on THIS tree, not inherited. cat7 numbers: ceiling p50 16.7 / max 18.3 over100 0; drag max 19.5 over100 0, stable across repeats; under-load drag max 33.5, workDuring 40 real ticks; -jank control fired 12 frames over 100 vs the clean 0. The pass is scene-conditional and the entry says so, with a four-point dose-response on desk size -->
- Confirm the four surface roles and orientation-spine behavior.  <!-- status: closed; evidence: gate 495 CLOSED 2026-09-03 -- LIQUID_SCORECARD.md carries a COMPLETED entry for BOTH named surfaces: Dictionary 80/80 (c97b864d) and Video 80/80, whose last cell (cat 7) closed this turn at PASS 10/10 after e54cdd9d fixed three instrument defects in the harness. Both re-driven on THIS tree, not inherited. cat7 numbers: ceiling p50 16.7 / max 18.3 over100 0; drag max 19.5 over100 0, stable across repeats; under-load drag max 33.5, workDuring 40 real ticks; -jank control fired 12 frames over 100 vs the clean 0. The pass is scene-conditional and the entry says so, with a four-point dose-response on desk size -->
- Approve standard/Liquid entry, exit, and recovery UX.  <!-- status: closed; evidence: gate 495 CLOSED 2026-09-03 -- LIQUID_SCORECARD.md carries a COMPLETED entry for BOTH named surfaces: Dictionary 80/80 (c97b864d) and Video 80/80, whose last cell (cat 7) closed this turn at PASS 10/10 after e54cdd9d fixed three instrument defects in the harness. Both re-driven on THIS tree, not inherited. cat7 numbers: ceiling p50 16.7 / max 18.3 over100 0; drag max 19.5 over100 0, stable across repeats; under-load drag max 33.5, workDuring 40 real ticks; -jank control fired 12 frames over 100 vs the clean 0. The pass is scene-conditional and the entry says so, with a four-point dose-response on desk size -->
- Produce static layout studies for compact, default, and maximized states.  <!-- status: closed; evidence: gate 495 CLOSED 2026-09-03 -- LIQUID_SCORECARD.md carries a COMPLETED entry for BOTH named surfaces: Dictionary 80/80 (c97b864d) and Video 80/80, whose last cell (cat 7) closed this turn at PASS 10/10 after e54cdd9d fixed three instrument defects in the harness. Both re-driven on THIS tree, not inherited. cat7 numbers: ceiling p50 16.7 / max 18.3 over100 0; drag max 19.5 over100 0, stable across repeats; under-load drag max 33.5, workDuring 40 real ticks; -jank control fired 12 frames over 100 vs the clean 0. The pass is scene-conditional and the entry says so, with a four-point dose-response on desk size -->

Gate: the layout studies score 80/80 on `src/LIQUID_UI_RUBRIC.md` against Video and Dictionary
before shared primitives are built. (Was "user approves"; amended 2026-08-16, see §10.4.)

**L1 IS NOT CLOSED — settled against the tree 2026-08-25, RULE 5.** The relay pin says it is
("gate 461, Video 8/8 and Dictionary 8/8") and the burn-down asked the next turn to settle
whether closed is 17 or 21. It is **17**. Gate 461 names **Video AND Dictionary**;
`.coordination/liquid-workplace/LIQUID_SCORECARD.md` contains **zero completed entries** — no
line matches its own `## <date> — <surface> — <n>/80` header — and says so deliberately: Dictionary
holds a 10 in all eight categories but five of them (2, 5, 6, 7, 8) were measured on an earlier
tree, and the rubric's own rule is that a score inherited across a change is stale by definition.
Video has never been scored at all (`L1_ACCESSIBILITY.md:631`: *"Only Dictionary had ever been
scored"*). So L1's 4 bullets stay OPEN and units-left stays **29 of 46**. Do not adopt 21 without
a completed scorecard entry for each of the two named surfaces.

**CORRECTION 2026-09-02 (backup) — the paragraph above is stale in three checkable ways, and the
VERDICT it reaches is nevertheless still right, for a different reason. Read this before acting on
it.** It was written 2026-08-25 and the scorecard moved the same day, later.

1. *"contains zero completed entries — no line matches its own `## <date> — <surface> — <n>/80`
   header"*: that grep returns **1**, not 0 — `LIQUID_SCORECARD.md:707`, Game Arena 80/80, commit
   `b6e55253`, 2026-08-28. It is neither of the two surfaces gate 495 names, so it does not close
   L1; but the sentence as written is false and must not be re-quoted.
2. *"Video has never been scored at all"*: **false.** Video was driven across all eight categories
   on 2026-08-25 — scorecard `:347` (cat 6), `:397` (cat 5), `:439` (cat 2), `:469`+`:503` (cat 7,
   which cost a product fix), `:540` (cat 8, commit `e801c683`) — and `:656` records the result as
   a per-category table: **Video 8 of 8, Dictionary 8 of 8, "GATE 461 CLOSES"**, off one fresh boot
   at `6eefff6c` with an A/B control (chunked 30.9 ms vs the shipped statement's 963.2 ms) and two
   categories scored honestly DOWNWARD so later drift stays visible.
3. *"units-left stays 29 of 46"*: it is **9 of 46** open (37 closed, 0 unknown).

**Why L1's four bullets stay OPEN anyway, and this is the reason to carry forward.** Not because
the measurement is missing — it exists, in full, with controls — but because it is STALE by the
rubric's own rule that a score inherited across a change is stale by definition. `6eefff6c` is
**925 commits** behind this HEAD (`git rev-list --count 6eefff6c..HEAD`). So the remaining work is
a RE-DRIVE on the current tree, not a first measurement, and that is a materially cheaper and
better-specified slice than the paragraph above implies: the protocols, instruments and baselines
for all sixteen cells already exist and are cited per category in the scorecard sections named in
(2). RULE C's shape falls out for free — 2 surfaces x 8 categories = 16 cells, nothing sampled out.
Bank each re-driven category as a formatted entry matching the template at `LIQUID_SCORECARD.md:27`,
because the header grep in (1) is what any later audit will count.

**RE-DRIVE, HALF ONE OF TWO — 2026-09-02 (primary), `c97b864d`. 8 of the 16 cells are banked and
the scorecard's header grep is now 2, not 1.** Dictionary holds a COMPLETED **80/80**, every
category with its own control that actually failed. Two categories were FAILs first and were
re-scored inside their own fixing commits, as the rubric requires: **cat 2** (`70626d66` — the
first keystroke into `.dict-search input` cost **118 ms** against a 100 ms bar, because `input`
state lives in `DictionaryView` and the 3,523 px `LexiconWorkbenchResults` is its sibling and
re-rendered on every key; memoised, now **15.9 ms**) and **cat 8** (`890c4074` — the defect was
the INSTRUMENT: `textOf` counted an UNPAINTED empty-state host in the denominator while filtering
messages by `painted()`, so an honest surface could not pass).

**RE-DRIVE, HALF TWO -- 2026-09-02 (backup), `d337f958`. 14 of the 16 cells are banked and the
scorecard's header grep is now 3. VIDEO IS NOT DONE, and L1's four bullets STAY OPEN.** Six of
Video's eight categories hold a controlled 10 (`cat{1,2,3,4,6,8}`); **cat 5 is 7/10 and cat 7 is
VOID**, so the surface has no total and this turn closed no bullet. Named so the next worker
starts without re-deriving: cat 5's three NOs are Q1 `entryPoints 4` against a 1..3 bar (three
accent CTAs compete once a video is loaded -- `Open video`, `Open in the media workspace`,
`Open Study Mode`), Q3 the primary action sitting outside the body viewport at 1080x700, and Q5
`div.media-substatus` at **3.18:1** in `classic-light` against a 4.5 bar. cat 7 VOIDs on two
separate legs, not one: the drag leg disagrees across repeats (BREACH, clean, clean, BREACH,
clean) and the heavy leg refuses with `Video load never armed`.

Two product FAILs were fixed and re-scored in their own commits, both in DOM that exists ONLY
with a video loaded: `5eaa3573` (cat 1 -- the inspector's score-row captions at **4.49:1**
against 4.5, and the MAL link's hit area **26.5 px** against the 32 px floor; now 5.28 and 0)
and `4c2df362` (cat 2 -- the first keystroke into the YouTube URL field received after
**171.7 ms**, because `ytUrl` lives in `useMedia` and every character reconciled the whole Media
Center including the seven-poster shelf; `useDeferredText` is now extracted from
`GlobalSearchField` and shared by both fields; now **11.7 ms**).

**The trap that cost this turn the most, and it wore three faces (`af21269d`): cat 6 could not
score Video AT ALL until its instrument was repaired.** Its round-trip step types into the first
visible text field, which `df00b4be` had made the topbar GLOBAL SEARCH -- a NAVIGATION control,
so the driver navigated away from the page it was about to score and refused `no video surface`.
Two of its rows read source-ness as `.mc-video-stage video`, a node this page never mounts
because playback is delegated to the media workspace, so their "with a source" branch was
unreachable and both scored FAIL on an honest surface. Three of its mutations were armable only
at rest and refused, VOIDing the category twice. **An instrument that models a state the product
cannot enter certifies only the state it can see** -- the same lesson the Dictionary half
recorded about cat 4, arriving from the opposite direction.

Second trap, cheaper to hear than to rediscover: every `cat*` run VOIDs with "N of M controls
occluded" if anything covers the surface, and the occluder is not always a window. Clicking an
up-next tile OPENS the full-screen `.seanime-host` media workspace over the whole desk, and
`document.querySelectorAll('.fwin')` keeps answering normally, so the desktop looks fine from
every DOM query. Close it by its own `.seanime-host-close` and confirm with `elementFromPoint`.

The four bullets stay OPEN because gate 495 names **Video AND Dictionary**, and Video is the
remaining half. It is the same 8 categories, same harnesses, same protocol, and the L9 baselines
(`baselines/cat{1..8}-l9-video.json`, 2026-08-31) record the exact `--surface`/`--task`/`--win`
arguments each one took, so nothing has to be re-derived to start.

**RE-DRIVE COMPLETE — 2026-09-03 (backup). GATE 495 IS CLOSED and the four bullets above are
now tagged `closed`; the paragraph immediately above is the state before that and is kept as
the record.** Video's last two cells landed in order: **cat 5** at `522022dc`, 7/10 → 10/10 in
both stage states, and **cat 7** this turn, VOID → **PASS 10/10**, giving Video **80/80**
against Dictionary's 80/80 at `c97b864d`. The full entry with every number and its control is
`LIQUID_SCORECARD.md`, last section.

Two things from cat 7 that are worth more than the bullet, and both generalise:

- **The heavy leg's `Video load never armed` was never the surface.** It was three instrument
  defects in a chain, all fixed at `e54cdd9d`: `liquid-perf-probe.ps1` fed inline JS to
  `Join-Path`, which normalises `/` to `\` and then THROWS, so any expression carrying a regex
  literal or a `//` comment killed the run before one sample; the spec hunted its scroller
  INSIDE `.mc-video-page`, where nothing scrolls, when the page's scroller is the ancestor
  `main.mc-content`; and no `progress` was declared, so correction 33 VOIDed both under-load
  legs by construction. **A refusal that names a surface is a claim about the instrument until
  the instrument has been read.**
- **A cat 7 gesture number is a property of the DESK, not only of the surface.** Same window,
  same gesture, same session, drag frame max against `documentElements`: **490 → 19.5 ms;
  766 → 50.2; 968 → 83.5; 1,184 → 100.2** — monotone, and reproduced in both directions by
  opening and closing windows. The idle ceiling does **not** move with it (18.1–19.0 ms at
  every size), so this is the shell's drag path, not a slower machine. At ~1,184 elements it
  sits astride the 100 ms bar, which is precisely why that leg read "BREACH, clean, clean,
  BREACH, clean". Video passes at 2-, 3- and 5-window desks with 0 frames over 100; the
  scene-sensitivity itself is recorded as an **open observation against the shell's drag
  path** for L11's performance work, not as a Video failure. Always name the scene.

**THE TRAP THAT DECIDED A VERDICT, and the next worker must not repeat it: drive the surface into
its REAL functional state before scoring, or the number is not a measurement.** Dictionary at rest
— empty search box, no results — scores category 4 at dead-region **18.3% default / 53.3%
maximized**, a two-bar FAIL. The same window, same tree, same harness, holding a real 20-entry
lookup: **8.9% / 15.0%**, PASS. Category 1 moves the same way: 13 text runs and 11 controls at
rest, **154 and 67** loaded. The rubric already caps an empty-harness category at 0; the point is
that the empty run is not a lower score, it is *not a measurement*. Both runs are banked side by
side (`cat4-l1rd-dictionary.json` at rest, `cat4-l1rd-dictionary-loaded.json` scored). Expect the
same to be true of Video, whose canvas is empty until a clip is loaded.

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

- Add Liquid semantic tokens without changing existing app output.  <!-- status: closed; evidence: b0c34c99; theme/liquid-tokens.css 121 --lq-* declarations, new file so no existing output changed; liquidTokens.test.ts 6/6, 4 mutations red -->
- Implement Anchor/Work/Liquid/Ambient surfaces, scaffold, dock, inspector, adaptive rail, and context toolbar.  <!-- status: closed; evidence: 576bc45f (four roles) + b2c36a3b (scaffold) + 001469f4 (rail/toolbar) + deb9c2e3 (dock/inspector); L2_PRIMITIVES.md records section 5.2 list complete -->
- Map default, Aero, Wired, high-contrast, performance, and motion variants.  <!-- status: closed; evidence: verified in liquid-tokens.css: :root, [data-materials=aero], [data-materials=wired], [data-theme=high-contrast], [data-perf=atmosphere|performance|balanced|battery], @media prefers-reduced-motion + .reduce-motion -->
- Build focused harnesses and accessibility tests.  <!-- status: closed; evidence: tokens 6 + surfaces 11 + scaffold 13 + controls 23 + dock/inspector 14 unit tests; 113 probe scripts under probes/; 205 banked baselines -->

Gate: primitives pass contrast, keyboard, motion, and performance checks in isolation.

### L3 — Opt-in per-window infrastructure

- Extend the existing window snapshot with backward-compatible presentation state.  <!-- status: closed; evidence: d844f239; WindowSnapshot.presentation? optional so conventional is the ABSENCE of the field and every pre-existing layout parses unchanged; 24 tests, 9 of 9 mutations red -->
- Add explicit Make Liquid / Return to standard commands.  <!-- status: closed; evidence: 20462e3a wires the title-bar toggle to DesktopShell + main/desktop.ts; liquidCommandEntryPoint.test.ts; keyboardShortcuts.ts route -->
- Preserve geometry, focus, z-order, pin, pop-out, snap, monitor transfer, and taskbar behavior.  <!-- status: closed; evidence: liquidWindowSnapshotFidelity.test.ts (68d1a65c) covers move, taskbar tear-off, cross-monitor drag+adopt, "changes presentation and nothing else -- not even z", maximize both directions; pin/z/visibility asserted untouched in d844f239; pop-out host added 6c16653f. SNAP IS NOT A FEATURE of this shell -- 0 snap identifiers in DesktopShell.tsx, the only match in shared/desktop.ts is WindowSnapshot -->
- Add corrupt-state recovery and mode round-trip tests.  <!-- status: closed; evidence: 13 corrupt blob shapes each dropped rather than thrown, parsePresentation total, sanitizeWindowPresentation drops forward; 10 consecutive toggles land on the original geometry -->

Gate: an unchanged sample app can switch modes and back with byte-for-byte app data and equivalent observable state.

### L4 — Media shell repair and Video pilot

- Restore/confirm the coherent Media shell first.  <!-- status: closed; evidence: L4_MEDIA_SHELL.md 2026-08-17: 17/17 gates with 3 negative controls; the Ready row Open played a real clip, pane box 0x0 -> 1264x821 after restart; 2026-08-22 detach / second monitor / reopen identical in all four numbers -->
- Refine the player through §6, using the concept hierarchy and current workspace capabilities.  <!-- status: closed; evidence: LIQUID_SCORECARD.md: Video scored at 1080x700 liquid, categories 3 (Liquid utilization) and 4 (use of space) both 10/10 against the concept hierarchy -->
- Validate every player feature in standard and Liquid modes.  <!-- status: closed; evidence: 2026-09-03 (primary). THE EVIDENCE SENTENCE THIS TAG USED TO CARRY WAS STALE AND IS WITHDRAWN: it said "mediaWorkspace 6 of 6 rows are still pending -- no Liquid destination exists for the workspace surface". Re-derived from parity-ledger.json on this tree, not from a summary: mediaCenter 8 of 8 `both` AND mediaWorkspace 6 of 6 `both`, each with its own live `observed` string naming the drive (open a study-ready file, segment navigation, readiness filters, the transcript rail, detach a Study Block, send it to another monitor) -- the workspace's Liquid destination is `.seanime-host` + `renderer/workspacePresentation.ts`, built at f2619b91 and driven in both presentations on 2026-09-02. WHAT WAS ACTUALLY STILL OPEN, and it is why this bullet did not close on that recount: one player surface had no row at all. The DETACHED Study Block window (`?studyBlock=<id>&surface=workspace`) carried `data-presentation` null and 0 `[class*=liquid]` nodes while the host it came from was Liquid and `lq.workspace.presentation` was set in the same origin -- recorded as a finding against ledger rows 11/12 on 2026-09-02 and explicitly NOT repaired, because "the honest shape is a standard-only row with its reason, which needs a row written for a host the ledger does not yet cover". Repaired this turn rather than re-recorded. `LiquidPresentationHost` gains `'detached'`; `canPresentLiquid(section,'detached')` is false by the visualizer's own test applied to a HOST rather than a section (one panel and a three-element bar, no region 2.3 assigns to the Liquid role, so a flip would be a class name and no material change) -- and deliberately a host rule, since the same block still presents when docked. The root then DIVERGES from the other three hosts on purpose: they render `data-presentation={presentable ? ... : undefined}` because for them absence means "could present, does not", while here absence was the ambiguity itself, so it declares `data-presentation="standard"` AND `data-presentation-locked="dense-work"`. LIVE, pid 47004 / port 39273, through the product's own `studyblock:open`: window 6 at 2090,20 460x512 reads standard + dense-work, 0 liquid-class nodes, 0 `lq-` nodes, 0 `aria-pressed`, 0 buttons labelled Liquid. DISCRIMINATING LEG -- the finding's own condition reproduced: `lq.workspace.presentation` planted as {v:1,mode:"liquid"} in the same origin and the window RELOADED; it read that key back (same origin, proven) and still declared standard + dense-work. NEGATIVE CONTROL, firing on the other side of the same attribute: the two live `.fwin` windows also read `data-presentation="standard"` but `data-presentation-locked` NULL, because they can go Liquid and this one cannot -- the lock, not the value, carries the decision. Storage restored to null, window closed, /health 1 window before and after. Ledger 221 `both` -> 222 rows / 27 apps, 221 `both` + 1 `standard-only`, 0 `pending`; `l6-ledger-coverage.cjs` re-run so the derived block is not stale, and it now honestly prints that `detachedStudyBlock` is the first ledger app with rows and no cat6 spec. Ratchet `src/media/__tests__/detachedStudyBlockPresentation.test.ts`, 5 tests, two mutation controls MEASURED: drop the `host === 'detached'` rule -> 2 failed; drop `data-presentation-locked` -> 1 failed; both files restored byte-identical (sha256 before and after). || MERGED 2026-09-03, also measured on wt/files-app (independent receipt, same status): 2026-09-03 c3f3516f+. THE OLD TAG WAS STALE, not wrong when written: it said "mediaWorkspace 6 of 6 rows are still pending -- no Liquid destination exists for the workspace surface". primary and backup drove those rows on 2026-09-01/02 (f2619b91, 0a3418b5) and nobody re-derived this tag. Counted from parity-ledger.json this turn: all 34 player rows are "both" -- mediaCenter 8/8, mediaWorkspace 6/6, video 10/10, music 10/10 -- and every one of the 34 `observed` fields names a live drive in BOTH presentations. RE-DERIVED LIVE rather than inherited, pid 41752, fresh profile, clip playing: the workspace's own presentation host EXISTS and works -- `.seanime-host-liquid` toggled data-presentation standard->liquid->standard, class `workspace-liquid` on/off, aria-pressed false->true->false, and 9 properties round-tripped byte-identically (bar bg rgba(0,0,0,0) <-> srgb .102 .094 .137/0.72, border rgb(45,43,55) <-> .14 alpha, padding 6px 10px <-> 4px 8px, bar height 51 <-> 47, root stayed opaque rgb(13,12,18) backdrop none in both = decision 1 holding, controls 19 in both, video box 1264x821 in both). Storage `lq.workspace.presentation` written with standardRect and REMOVED on return (null, not the string "standard"). NEW EVIDENCE ON THE BULLET'S OWN WORDS: playback itself survives the mode switch -- the clip played straight through it, currentTime +8.88 s, 212 frames decoded, 0 dropped -- and the frame-stability leg taken IN LIQUID reads 31 decoded / 0 dropped / 0 corrupted / 23.6 fps / renderer p50 16.7 ms, indistinguishable from the standard readings in PERF_BASELINE_PLAYER.md. MUTATION CONTROL, and it applied: force-adding `workspace-liquid` in standard mode reproduced the Liquid bar bg AND padding exactly (mutationApplied true, classIsLoadBearing true), and removing it restored all four properties (restoredExactly true) -- so the 9-property reading is the presentation and not a coincidence. NOT CLAIMED: the detached study-block window still carries no presentation of its own (data-presentation null while its host is Liquid); that is recorded as a finding in the ledger's detach row and needs a row of its own for the detached host, which does not exist yet. -->
- Score the video result on the rubric before calling it the system pattern.  <!-- status: closed; evidence: LIQUID_SCORECARD.md:698 "Video is 8 of 8" and gate 461 CLOSES (2026-08-25); category 7 receipt in L7_PERF_VIDEO.md:193, all four legs with a control that fired -->
- **DEFECT S1 — Japanese subtitle text renders as tofu boxes.** Observed live by the user 2026-09-02 (screenshot): one line renders (`うわあ ぐはっ`) while sibling lines on the same frame are all `□`. Lead, not a diagnosis: `src/shared/videoCoreStudy.ts:26` `SUBTITLE_FONT_STACKS.default` is the EMPTY STRING, so the default choice applies no font-family at all and inherits whatever the renderer falls back to, while `gothic`/`mincho`/`universal` all name CJK-capable stacks. The ASS track's own `fontname` is the other candidate. Fix so no subtitle path can resolve to a font without CJK coverage, and add a regression test that fails when a stack loses its CJK fallback.  <!-- status: closed; evidence: 2026-09-03 0a1283af (primary2) -- see the CLOSED entry at the end of this comment for the reproduction and the before/after canvas readings. THE LEAD RECORDED HERE WAS WRONG AND IS WITHDRAWN (2026-09-03, primary2): there is NO `SUBTITLE_FONT_STACKS` symbol anywhere in the tree -- `grep -rn 'SUBTITLE_FONT_STACKS' src/` matches this bullet's own text and nothing else -- and `videoCoreStudy.ts:26` is a `subtitleBgOpacity` doc comment. The other recorded candidate, "the ASS track's own fontname", is ruled out too: zero `fontname` reads anywhere in src/, and no libass/jassub/subtitles-octopus renderer is bundled, so nothing can consult it. Cues are DOM text: `VideoCoreStudyOverlay.tsx:1514` -> `SubtitleCueLine` -> `.study-cue-text`. WHAT IS ACTUALLY WRONG, re-derived: `cueBoxStyle()` (VideoCoreStudyOverlay.tsx:173) emits only fontSize/background, and `mediaWorkspace.css` carried **zero** `font-family` declarations, so every cue INHERITED the active theme's stack. Two themes set a stack with no Japanese face at all -- `theme/aero-shell.css:116` and `theme/aero-apps.css:100`, both `Tahoma, 'Segoe UI', sans-serif` -- plus four `Tahoma, "MS Sans Serif"` rules in those two files; neither Tahoma nor MS Sans Serif covers kana or kanji, so those glyphs fall to Chromium's last-resort fallback, which covers some ranges and not others. That is a mechanism that produces one readable line beside tofu siblings on the SAME frame, which inheritance-from-a-CJK-stack cannot. (Note `--font-body` itself is fine in both places it is defined, styles.css:169 and wired-archive.css:19 -- the aero files bypass the token rather than redefining it.) FIXED THIS TURN, the bullet's first half: `--subtitle-font-stack` declared on `#media-workspace` and applied to all five subtitle text paths (`.study-cue-text`, `.study-cue-secondary`, `.study-cue-translation`, `.study-transcript-text`, `.study-dictation input`), so no subtitle path resolves by inheritance any more. SECOND HALF DONE: `src/media/__tests__/subtitleFontStack.test.ts`, 8 tests, with TWO FIRING MUTATION CONTROLS measured not asserted -- replace the stack with the aero themes' own `'Tahoma','Segoe UI',sans-serif` -> **2 failed**; delete the declaration from one surface -> **1 failed**, and the CSS was restored byte-identical afterwards (sha256 `0855f132b88a7114`, captured before and re-checked after). The test strips CSS comments before matching (the comment names Tahoma deliberately) and normalises CRLF, both of which have produced false results in this repo. STILL OPEN, and this is why it is not closed: the fix is verified by the ratchet and by the served stylesheet (`http://localhost:5174/src/media/mediaWorkspace.css` carries the token 6x), NOT by a computed style on a real cue. `#media-workspace` is lazily mounted with the media chunk and does not exist merely from `os:open` on `video`, so confirming the painted glyphs needs a real clip with a Japanese subtitle track, under an AERO theme, which is the reproduction this bullet still owes. || **2026-09-03, primary2 -- I RETRACT MY OWN CLAIM ABOVE THAT "no libass/jassub/subtitles-octopus renderer is bundled". IT IS FALSE, AND IT IS WHY THE REAL CAUSE WENT UNLOOKED-AT FOR A TURN.** `src/media/jassub/` holds a generated JASSUB 2.5.6 runtime, its worker and two WASM builds, vendored at `dd2ca470`; `vendor/seanime-web/.../video-core-subtitles.ts:24-28` imports all of them and `:484` constructs the renderer. My grep missed it because I searched `src/` for *reads of* `fontname` and for the package name in app code, and the renderer is reached through a vendored import path. THE REAL CAUSE, and it explains the screenshot in a way the DOM cannot: JASSUB is built with `defaultFont: "roboto medium"` and `availableFonts: { "roboto medium": Roboto-Medium.ttf }` (`:491`), and `src/media/jassub/assets/` holds that one face and nothing else. Roboto has no kana and no kanji. The ONLY other fonts libass ever sees are the container's own attachments (`:502`, `playbackInfo.mkvMetadata.attachments`). So a muxed release that ships its fonts renders correctly; a bare sidecar -- every Jimaku or nyaa track, i.e. this app's entire pipeline -- renders every Japanese glyph as a box; and a release whose attachments cover one style but not another renders one readable line beside boxes ON THE SAME FRAME. That third case is the user's screenshot, and the DOM cannot produce it, because Chromium's own per-character fallback would have found a system face. The DOM fix at `117389e3` was real and stands -- it is a different surface, and `subtitleFontStack.test.ts` is now scoped to say so rather than repeating the false claim. FIX `a49d3f4d`: `main/subtitleFallbackFont.ts` resolves a CJK-capable face from the system font directories (machine-wide AND per-user, where a non-admin install lands) and the overlay hands it to `libassRenderer.renderer.addFonts` once per renderer instance. Nothing is bundled -- a Japanese face is 9-13 MB and duplicating a file already on the machine is the wrong trade -- and a machine with none gets an honest null rather than a Latin guess. Language-separated, because Noto Sans JP does not cover 简化字. Delivered as a `localfile://` URL the renderer turns into a blob, so no 9 MB crosses IPC and JASSUB's worker never has to fetch a custom protocol. 11 tests on the choice + 5 handler->preload->overlay wiring ratchets (a route with no consumer is a recorded failure here), two mutation controls MEASURED: Segoe UI at the head of the ja list -> 1 failed; drop the `addFonts` call -> 1 failed; both files restored byte-identical. STILL OPEN, and the reason is unchanged except that it now applies to two surfaces rather than one: no painted-glyph reading on a real clip. Verified from source, from the tests, and from the font files actually present on this machine -- not from a canvas. || **2026-09-03 (later), primary2 -- CLOSED, and the canvas reading finally exists because the defect REPRODUCED and `a49d3f4d` DID NOT FIX IT.** Fix `0a1283af`. Driven on a fresh-profile instance (`JP_USER_DATA_DIR`, `JP_DEBUG_PORT=39280`) seeded with the real `media.json` + `subtitles/`, on the exact subject the bullet describes: the bare nyaa ASS sidecar for JoJo 39-END, 36,435 `Dialogue:` lines, whose styles name `ＤＦＰ平成ゴシック体W7`, `思源黑体 CN Heavy` and `浪漫雅圆` -- none on this machine and none shipped by anyone. **BEFORE, at cue 18 (145890-149270 ms), paused at t=147.5 with the DOM overlay, dock and rail hidden so only libass's own painting is in frame: `□□□ □□□□□□□□□□□□□□□`** -- 3 boxes, a space, 15 boxes, exactly the shape of `何者だ なぜブチャラティを知っている`. `evidence/S1-libass-before-tofu.png`. WHY `a49d3f4d` MISSED: `addFonts` only makes a face findable BY NAME, and no style in that file names Noto Sans JP. For a family it cannot find libass substitutes its DEFAULT, which the player constructs as `roboto medium` (video-core-subtitles.ts:491), and Roboto has no kana. JASSUB's other route, `_getLocalFont` (runtime.js:693), is gated on the `local-fonts` permission Electron does not grant, so it returns undefined. The lever is the worker's `setDefaultFont` -> `_wasm.setDefaultFont`. **AFTER, same clip, same cue, same paused frame, same hidden chrome: the Japanese glyphs paint.** `evidence/S1-libass-after-glyphs.png`. Handler proven live end to end in the same session: `window.api.subtitleFallbackFont('ja')` -> `{family:"Noto Sans JP", url:"localfile://..."}`, `('zh')` -> `Noto Sans SC`, so the language split is real and not just tested. **DOM half also read live at last, with a control that FIRED:** on the same real cue `.study-cue-text` computes `"Yu Gothic UI", "Yu Gothic", Meiryo, "Noto Sans JP", ...`; planting the two aero stylesheets' own `Tahoma, 'MS Sans Serif', sans-serif` on `<body>` moved the ANCESTOR (`plantTookEffect: true`, body read back as Tahoma) and did NOT move the cue (`cueMoved: false`), because `--subtitle-font-stack` is applied rather than inherited; body style removed and both readings restored identical. NOTE for whoever re-runs this: setting `data-theme='frutiger-aero'` (with or without `data-materials='aero'`) does NOT change `body`'s font here -- the Tahoma rules are on decorative aero layers, not `:root`/`body` -- so a theme swap is a NULL instrument for this question and the ancestor plant is the one that works. 3 new guards, mutation control MEASURED: delete the `setDefaultFont` call -> 1 failed, file restored byte-identical (sha256 `50542D8FC3BDA0...`). -->
- **DEFECT S2 — `Waiting for subtitle` placeholder never resolves.** Observed live by the user 2026-09-02 (screenshot): the placeholder (`mediaWorkspace.study.waitingSubtitle`, en.ts:8739) stays on screen during playback instead of a cue. Separate from S1 and not a font problem: it is a track-load or cue-timing failure. Establish whether the track loaded at all, whether cues parsed, and whether the timestamp lookup is off, then fix the one that is wrong. State which of the three it was.  <!-- status: closed; evidence: 2026-09-03 f2241bfc + 8b773193 (primary2). WHICH OF THE THREE: **cues never parsed**. Not the track (it loads and libass paints it), not the timestamp lookup (`activeStudyCuesAtTime` is correct and is what the mediaCaptions path already uses). `VideoCoreSubtitleManager` keeps two kinds of track and builds its cue index from ONE of them. An *event* track -- the container's own muxed streams, a Whisper transcript, the downloaded track the overlay mounts -- lands in `eventTracks`, the only map `_rebuildCueIndex` reads (`video-core-subtitles.ts:1124`). A *file* track -- every `playbackInfo.subtitleTracks` entry with `useLibassRenderer`, numbered from 1000 up at `:230` -- is fetched, converted to ASS and cached as TEXT on `fileTracks[n].content` (`:1268`/`:1289`), never as events. `_updateActiveCues` (`:1143`) looks the current track up in `eventTracks`, finds nothing, and takes its "no event-based track selected" branch: `getCues()` and `getActiveCues()` both return `[]` for as long as that track is selected, and not one `cuechange` is ever dispatched. So the placeholder sits under subtitles that libass is painting on the same frame. It was never only the cue line -- `allCues` feeds the transcript rail, the analyser and mining, so a file track made the whole file read as having no subtitles. FIX: the manager exposes the cached ASS publicly (`getTrackContent`), so the missing half is a parse, not a fetch. `studyCuesFromParsedCues` normalises it to the same ms shape the event path produces and the overlay drives it off `timeupdate` -- the same shape the `mediaCaptionsManager` branch already uses, so the two cannot drift. Inert on every path that worked before: one `manager.getCues().length` check at setup, re-run on each track change. `8b773193` closes the same gap on the DUAL line, where `getCuesForTrack` answered `[]` the same way AND the picker filtered `type === 'event'`, so a downloaded translation could not even be offered as a second line. 16 tests, three mutation controls MEASURED: drop the seconds-to-ms conversion -> 4 failed; make the adopt path read null instead of `getTrackContent` -> 1 failed; swap `parseStudySubtitles` in for the second line -> 1 failed. All files restored byte-identical (sha256 captured before and re-checked). The ratchet strips comments before matching, because this change's own comments name every symbol it pins. -->
- **DEFECT S3 — the Russian second subtitle line flickers.** Observed live by the user 2026-09-02: the secondary/dual subtitle line disappears and reappears during playback. The second line is the `videoCoreStudy` offered-languages path. Likely a re-render or cue-boundary problem rather than a font one. Prove the fix with a timed capture across several cue boundaries, not a single frame.  <!-- status: closed; evidence: user report 2026-09-02. 2026-09-03, primary2: NOT SETTLED, and I am saying so rather than attaching a nearby fix to it. What IS now ruled in, from source: the second line is `activeSecondaryCues` -> `secondaryText` -> the `preferences.dualSubs && secondaryText` branch at VideoCoreStudyOverlay.tsx:~1780, so a flicker is `secondaryText` going empty and non-empty, i.e. `activeStudyCuesAtTime` over `secondaryCuesRef.current`. Ruled OUT by reading: the manager does not evict cached events (`_recordSubtitleEvent` only ever adds), so a shrinking timeline is not the mechanism; and identity churn is not either, since React reconciles the same `<p>` in place and the text is a string. What I could NOT settle statically is why the array would ever *become* empty mid-cue. A SEPARATE defect on the same path was found and fixed at `8b773193` -- the second line could not reach a libass FILE track at all, neither offered by the picker nor readable by `getCuesForTrack` -- but that is "never shows", not "flickers", so it is NOT this bullet and is recorded under S2. The bullet's own instrument is the next step and it needs a real dual-track clip: a timed capture of `data-secondary-active-cue` and `.study-cue-secondary` presence across several cue boundaries, which distinguishes a re-render from a cue-boundary gap without guessing. || **2026-09-03 (later), primary2 -- STILL OPEN, and the reason is now a MEASURED shortage of subject, not a shortage of effort.** A live session was set up for exactly this (fresh profile, real `media.json` + `subtitles/`, media workspace driven to a paused cue) and the instrument could not be armed, because **nothing reachable from this machine plays with two subtitle tracks at once.** Measured: the seanime sidecar's library root `C:\Users\Arseniy\Downloads\jp-study\` holds **3** files (JoJo 38, JoJo 39-END, one Date a Live OVA); the media workspace's own Readiness panel reads **51 files / 51 need work / 0 ready to study**; and every clip in the app's `downloads/` -- including the only genuinely dual-language ones, the Hana podcasts with both `.ja.vtt` and `.en.vtt` -- refuses to start (`data-study-player` stays `idle` through a tile click and two Library toggles) because the sidecar streams from its library root and those files are not in it. On JoJo 39-END the secondary picker offers **`Off` and nothing else**, which is correct: `tracks.filter(t => t.number !== selectedTrack)` over a one-track file is empty by construction. Two routes tried and recorded so the next worker does not repeat them: adding a second `subtitles[]` entry to the media row (a copy of the same ASS, identical timings, which would have been an ideal control -- any secondary gap where the primary is present is then a defect rather than a boundary) survived a reload but produced **one** track, so the adoption path takes a single track per row; and `media:attach-subtitle` is a dead end -- `fileImportExecute.ts:143` dispatches that CustomEvent and **grep finds no listener anywhere in `src/`**, a route with no consumer, which is a separate finding worth its own slice. WHAT WOULD UNBLOCK IT: any one file in the sidecar's library root carrying two subtitle tracks -- a muxed release with two streams, or a second harvest/Whisper generation against JoJo 38 or 39. Whisper on a 23-minute episode did not fit this turn. The static analysis above stands unchanged; nothing here contradicts it. || **2026-09-03 (third pass), primary2 -- CLOSED. Fix `ccd9f45f`. The subject shortage was real and I ENDED it rather than re-reporting it: `ffmpeg -c copy` remuxes JoJo 39-END with extra ASS streams into the sidecar's own library root, which is a fixture, not a download, and takes about a minute.** Recipe, so nobody is blocked on this again: mux, `POST /api/v1/library/scan`, then `POST /api/v1/library/unknown-media {mediaIds:[N]}` -- WITHOUT that seed the open fails `media not found in anime collection: N`, which is an honest refusal but reads like a broken file -- then `window.dispatchEvent(new CustomEvent('seanime:media-workspace-open',{detail:{localFilePath,startAtSec}}))`. Token from `window.api.seanimeConnection()`. **THE CAUSE, and both of my earlier static hypotheses were wrong.** Cue eviction: ruled out correctly. Out-of-order cues defeating the `break` in `activeStudyCuesAtTime`: also wrong, `parseSubtitles` sorts at `subtitleCues.ts:188` and `getCuesForTrack` sorts at `video-core-subtitles.ts:1114`. What is actually wrong is a *rendering asymmetry* that no amount of staring at the cue path would have found: **the second line is the only element in the overlay with no box of its own.** The primary falls back to `<span class="study-cue-status">` and the timing readout stays put; `{preferences.dualSubs && secondaryText && (<p .../>)}` UNMOUNTS. So every inter-cue gap in the translation track blanks the line and reflows the overlay around it. On the harvest track this defect was reported against -- 36,435 `Dialogue:` lines merging to **286 covered spans / 285 gaps** -- the median gap is **650 ms** and **82 of the 285 are under 400 ms**. A sub-half-second blank-and-return is a blink, which is the word the user used. FIX: `bridgedSecondaryCuesAtTime` holds the previous cue across a gap SHORTER than 1,200 ms and never across a longer one, bounded by the gap rather than by elapsed time -- "hold 1.2 s into any gap" would blank a 3 s silence part-way through, i.e. a second flicker -- and a cue with no successor is never bridged, so the closing line does not stick. Secondary only; the primary keeps exact activation because the study tools mine and grade it. **LIVE, the capture this bullet asked for: 917 samples at 50 ms over 46.5 s of continuous playback, 24 distinct secondary cues (23 boundaries crossed), `missing = 0`.** A first capture on a *gapless* secondary (710 contiguous 2 s cues) had already shown the render path sound at **1,866 samples / 93.5 s / 0 missing**, while the PRIMARY line was absent in **366 of those 1,866 samples (19.6%)** on the same overlay in the same run -- which is the asymmetry above, measured. CONTROL that fires: detach `.study-cue-secondary` and re-read -- `SHORTGAP-0089 line` -> **ABSENT** -> `SHORTGAP-0089 line`, restored in the same tick, so the reader is querying the element and not returning a constant. Unit side: 12 cases incl. the real track's p50 (650 ms -> held) and p90 (3,050 ms -> `[]`) pair, plus a source ratchet pinning one bridged call and two unbridged; mutation control MEASURED -- point `syncActive` back at `activeStudyCuesAtTime` -> **1 failed**, file restored byte-identical (sha256 `f5913373e2822b4d36fa51ef` before and after). **THE LONG-GAP REFUSAL LEG IS NOW MEASURED TOO -- run later the same turn, and it is the control that makes the 0 above mean something.** A second fixture muxed the 3.0 s-gap track FIRST among the non-selected streams, so `candidates[0]` auto-selects it and the picker is not needed at all. Same build, same overlay, same reader: **846 samples over 42.3 s, `missing` = 559 = 66.1%**, against the 3.0/4.6 = **65.2%** the track's own shape predicts, in **10 blank runs** whose lengths are 41/59/63/59/59/59/64/58 samples -- **59 x 50 ms = 2.95 s**, i.e. exactly the gap. 9 distinct cues, sequential (LONGGAP-0031..0039). So the bridge holds 400 ms at 0% and refuses 3,000 ms at 66%, which is the discriminating pair; it did not go blind. **ONE LEG REMAINS DERIVED, and I am naming it rather than letting it read as a reading:** the BEFORE on the gapped track -- an HMR reload dropped the player mid-run and ate that capture, so the 20%-of-wall-time blank rate for a 1.6 s-on / 0.4 s-off track is arithmetic plus the primary's measured 19.6%, not a reading. **AND A CORRECTION TO MY OWN TRAP, BELOW, WHICH WAS HALF WRONG AND COST A VOIDED RUN.** I wrote that a native-setter `checked=false` plus a synthetic `change` "moves the DOM and NOT React state". **It moves BOTH.** `jp-media-player-preferences-v1` was left holding `dualSubs:false`; the line kept rendering only because the MOUNTED component's state had not re-read it, so the write looked inert. The next player mount picked it up, and the first long-gap capture came back **100% missing / 0 distinct cues** -- VOID, because it measured dual-subs-OFF rather than the bridge refusing. Caught by two checkboxes disagreeing (`[true,false]`) while `data-secondary-active-cue` read 18 with no `<p>`. Restored by a real `focus()`+`click()` on the unchecked box, verified `stored: true`. The banked lesson is the general one: **a synthetic write that looks inert may still have persisted -- read the STORE, not the rendered control.** TRAPS BANKED. Editing any file the media chunk imports drops the loaded clip AND leaves the sidecar's directstream wedged: every later open then 500s with *"could not open this file -- codec or container"* on a file that played 20 minutes earlier. `window.api.seanimeStop()` then `seanimeStart()` clears it; the port changes. And `checkbox.click()` inside its `<label>` toggles twice for a net no-op, while a native-setter `checked=false` + synthetic `change` moves the DOM and NOT React state -- the line kept rendering with the box reading unchecked, a mutation control that never applied, so it is reported here as not-run rather than as a pass. FIXTURES DELETED after measuring -- 725 MB of fake episodes 40 and 41 in the user's own anime library is not something to leave behind a week before their bug pass, and the recipe above rebuilds either in about a minute. What they were, so a re-run does not have to redesign them: `- 40 (DUALSUB S3)` full length, one extra ASS track of 710 CONTIGUOUS 2 s cues (`RU-0001 ...`), which is the ideal control because any absence is then a defect rather than a cue boundary; and `- 41 (GAPTEST S3)`, `-t 240`, THREE subtitle tracks -- ja harvest, RU 1.6 s-on/0.4 s-off, RU 1.6 s-on/3.0 s-off -- the last of which is the long-gap refusal leg, still unrun. **A LEAD THAT I FILED RATHER THAN PUBLISHED, AND THEN DISPROVED THE SAME TURN -- there is NO defect here and no bullet is owed.** The lead was: on the three-track file I enumerated **9** mounted `<select>`s and **none** held track numbers, so the secondary-track picker (`StudyBottomBar.tsx:443`, `mediaWorkspace.study.secondarySubs`) looked unreachable. It is reachable. Re-enumerated on a fresh mount with each disclosure's state recorded BEFORE touching anything -- which is the step the first pass skipped -- all five `<details>` read `open:false` and the `More` button read `aria-expanded:false`. Clicking `More` specifically took the DOM from **9 selects to 15**, and select **#9 is the picker**, options `"" = Off / 4 = RUS (default) / 5 = UKR (default)`, with #8 the primary picker at `3/4/5`. So it was behind a collapsed disclosure the whole time and the original enumeration simply read a closed dock. Recorded because the METHOD is the transferable part: enumerate disclosure state alongside the controls, or "absent" and "collapsed" are indistinguishable. One real oddity seen in passing and NOT chased: `More`'s `aria-expanded` read `false` both before and after the click that demonstrably mounted six more controls, so that attribute does not track the section -- a genuine but separate a11y question, unmeasured, deliberately not turned into a finding here. -->

Gate: complete §6.5 acceptance matrix and 80/80 on `src/LIQUID_UI_RUBRIC.md`, driven live on a
real playback state. (Was "user visual approval"; amended 2026-08-16, see §10.4.)

### L5 — Core study tools

Order: Dictionary → Grammar → Translate → Agent.

- Establish the common selection/context-inspector contract.  <!-- status: closed; evidence: f29b5537 -- one app-parameterised parity engine probes/l6-parity.js with a per-app SPEC; shared/__tests__/liquidSelection.test.ts; contract driven across all four L5 apps -->
- Keep results, prose, forms, and conversation anchored.  <!-- status: closed; evidence: parity-ledger.json 44 rows both presentations: dictionary 7/7, grammar 8/8, translate 7/7, agent 8/8, round trip byte-identical, 3 negative controls each -->
- Move only contextual actions and deep detail into Liquid regions.  <!-- status: closed; evidence: 7bc4cc57 ContextualSurface + .lq-contextual + the .fwin-liquid paint gate, 48/48; 6c16653f gives the pop-out host the same interior so the region language is not inert there -->

Gate: feature ledgers complete; cross-app handoffs retain context.

### L6 — Reading and immersion ecosystem

Order: Reading → Novels → Library → Immersion → manga/PDF/EPUB/VN suites.

- Establish the common content canvas and reading-side-tool contract.  <!-- status: closed; evidence: plan:831 -->
- Preserve progress, capture, dictionary, mining, source, and deep-link behavior.  <!-- status: closed; evidence: plan:831 -->

Gate: content remains legible and stable at all sizes; no tool obscures the document.

**Bullet 2, 2026-08-25 (later): OPEN, and what is left is named** (`39d2a22c`, `40cf77d5`,
`bf5d198c`). Two remounts that no assertion on any of the six surfaces could see, because every
one of them was a width, a class or an attribute and all three are identical across a remount.
(1) leading and trailing tools are two children arrays, React reconciles by key WITHIN one, so a
leading tool that narrowed into a sheet crossed arrays and was rebuilt — grouped by declared side
now. (2) a stacked sheet was `return null`, i.e. unmounted; now `hidden`, plus the (0,2,1) CSS
rule without which the UA's `[hidden]` loses to `.lq-reading-sheet { display: flex }`. Route
parity swept mechanically across the six migration commits: **3 handlers net-removed, all three
the popovers' own close buttons.** Closed: the document survives 6/6, the tool subtree survives
6/6, stacked sheets survive, no route dropped. Nine L6 suites 93/93.
Log: `.coordination/liquid-workplace/L6_READING_ECOSYSTEM.md`.

**Bullet 2, 2026-08-25 (later 2): still OPEN, now 3 of 6 driven** (`02c5dd92`, `8aaa9216`).
**Progress** and **dictionary** driven end to end on a real EPUB, and both found a defect.
(3) `.reader` is `display: grid` with `grid-template-rows` and NO `grid-template-columns`, so its
one implicit `auto` track floored at `.reader-bar`'s 860 px min-content at every host width and
`overflow: hidden` cut off the rest: at the **380 px Blanc allows** (`BLANC_MIN_W`; Blanc hosts
this reader), **14 of 18 bar controls entirely past the right edge**, and `ReadingCanvas`
measuring the frozen 860 rather than the host — **the sheet placement was unreachable in this
reader at any size.** Fixed on the column axis the way the row axis already was; after, 380/380,
clipped 0, and Bookmarks becomes a sheet. Progress itself held: same head paragraph across
1264 docked → 380 sheet → 1264 docked, persisted `p:7:1.0000` byte-identical.
(4) the word/sentence popup is `position: fixed; z-index: 160` and a SIBLING of the canvas, so a
sheet cannot cover it — 28×97 px over an `aria-modal` sheet, winning hit-testing, 2 focusables
outside any inert subtree. `ReadingCanvas` now reports `onDocumentCoveredChange` (additive,
optional, transition-only) and the reader dismisses on the way in.
**Left: mining, source, deep-link.** Guard extends the existing category-4 sweep rather than
adding a probe, and it found two more instances of (3) in `aero-apps.css`, both fixed.

**Bullet 2 CLOSED 2026-08-25 (later 3)** (`daf70721`). The last three driven end to end, each on
the surface that owns it, each with a control that had to fail and did.
**Mining**, Library, no defect: clicked from inside the SHEET at a 592 px canvas — handoff
`{"bookId":"078d8fa0-…"}`, `os:open` + `flashcards:openEpubMining` both fired, Flashcards opened,
handoff consumed, step 1 preselected that id, **1 of 21 options**. Tool node and mine button both
kept the expando across docked 262 → sheet 592 → docked 262. Controls: a manga item offers
`read, dictionary` and **no `mine`**; a genuine unmount/remount reads `REBUILT`.
**Deep-link**, Captures, DEFECT (5) fixed: a passage staged through the real
`readingPassageHandoffStage` landed with section, head and `aria-current` all correct while
`data-covered="true"` and the document was `inert` at 552 px — the user asked to read a passage and
was shown the index. `onDocumentCoveredChange` is transition-only, which is right for dismissing an
overlay and wrong for something arriving from outside; `useReadingDocumentCover()` now answers "is
it covered right now" from the canvas module, so the other five surfaces cost a line each. Only
when it actually covers — a docked list is beside the document, and the docked control stays open.
**Source**, Captures, no defect: row title, localised row meta ("Image", no `settings.lens` key
leak) and reader head all identical across 1142/870 docked → 552 sheet → 1142/870, on their
original nodes.
**Trap that nearly became a finding: an unfocused Electron renderer does not deliver
ResizeObserver notifications.** An inline `.fwin` width move (580 → 639 → 835) left
`data-content-width` at **756**, survived a full `/reload`, and reads exactly like a frozen canvas.
An independent RO on the same element logged **zero** entries and a React state change in the same
eval did not help — React commits without a frame, RO delivery needs one. `POST /focus` first and
it fires immediately (`[652]`, believed 652, real 652). Check `data-content-width` against the real
box before believing any bridge-driven placement.
Both L6 bullets are now closed; what L6 still owes is its Gate, scored.

**L6 Gate, category 4 — 5 of 6 surfaces, 2026-08-26** (checkpoint containing this entry).
VN now passes the unchanged surface-parameterised harness: three sizes, 0 clipped/overlaps/
horizontal loss, dead region 0.4–12.9%, canvas 32.0 → 50.3 while chrome falls. Category 4's
remaining surface is Novels, parked on the paged-reader dead-region correction already named in
`L1_USE_OF_SPACE.md`; board **23 of 48**. Neither L6 Gate nor a timeline bullet closes here.

**L6 Gate, category 4 CLOSED — 6 of 6 surfaces, 2026-08-26** (checkpoint containing this entry).
Novels was driven on 1Q84 page 2/2, the adverse state that previously failed 70.1% compact and
63.0% maximized. Correction 16 measures a proven pager's rendered buffer rather than its trailing
last-page remainder: **5.0 / 10.0 / 2.6** dead, 0 loss on every other bar. Proof falsification
moved 5.0 → 8.8 → 5.0 and restored. Board **24 of 48**; L6 Gate remains open on other categories.

**L6 Gate, category 3 — 1 of 6 surfaces, 2026-08-26** (checkpoint containing this entry).
The reusable harness now exists and accepts title/`@selector` roots; Library earned 10/10 only after
its local `header.view-head` adopted `ContextualSurface`. Liquid: 0 dense-work regions on glass,
1/1 contextual regions treated and 1/1 on a shared primitive; control 0→1, all-glass 3/3, restored
0. Conventional mode stayed unpainted. Board **25 of 48**; L6 Gate remains open.

**L6 Gate, category 3 — 2 of 6 surfaces, 2026-08-26** (checkpoint containing this entry).
Captures/Reading Finder moved its local translucent workspace nav to `ContextualSurface` without
changing conventional pixels. Liquid: 0 dense Work on glass, 1/1 treated and shared; control
0→1, all-glass 2/2, restored 0. Board **26 of 48**; L6 Gate remains open.

**L6 Gate, category 6 — 2 of 6 surfaces, 2026-08-26** (checkpoint containing this entry).
Library **PASS 10/10** (`d40ab3a6`) and Immersion **PASS 10/10** (`61d7d85f`), both a SPEC plus a
RUN of the unchanged `cat6-feature-parity.cjs`. Library: parity **9/9 standard, 9/9 liquid**,
`rowsAgree` true, 0 rows in one presentation only, round trip holding with the list scrolled to
**240 of a 1,605 px** range, five mutations each falling exactly their own row. Immersion, driven
on a live `ja.wikipedia.org` page with **80,394 characters** extracted by Reader mode: parity
**7/7 / 7/7**, round trip with `.immersion-url` dirtied, **0 diffs**, five mutations. Board
**32 of 48**; category 6 owes captures (a free RUN), manga, novels and VN, and category 7 owes all six.

**L6 Gate, category 6 — 3 of 6 surfaces, 2026-08-26** (checkpoint containing this entry).
Captures **PASS 10/10**: parity **6/6 standard, 6/6 liquid**, `rowsAgree` true, 0 rows in one
presentation only, round trip `fieldsHeld`/`shellHeld` with **0 diffs** carrying a real
**240 of 1,806 px** scroll, three mutations each falling exactly their own row and each
returning to 6/6. The RUN was free as predicted; the **spec** was not — its declaration-order
drive ended on `toggleList`, which INVERTS, so the list that is this section's navigation was
left collapsed and `captureList`/`selection` scored false against **42 live captures**
(first run: 4/6 both sides, VOID). Fixed by an explicit drive that toggles twice — exercising
the reversibility AND idempotent, which the driver needs since it re-runs the drive per
mutation. Board **33 of 48**; category 6 owes manga, novels and VN, category 7 owes all six.

**L6, product — the one-way door in Immersion, 2026-08-26** (`4cda1649`). Not a cell: scoring the
surface above surfaced a reversibility gap category 6 cannot see, because every row it has assumes
a page is loaded. Back, Forward, Reload, the three view modes and eight page actions ALL require a
page, so once anything had loaded the starter state was unreachable without destroying the window.
`closePage` is the exact reverse of `navigate` (stats flushed FIRST, or the closed page's time is
discarded), in all three hosts — the shared toolbar, the aero toolbar, and the View menu. History
and the saved-sites rail are deliberately kept: the rail is the route back. Reload came with it —
`reload()` opens `if (!currentUrl) return;`, so it was an enabled control that did nothing.
Log: `.coordination/liquid-workplace/L6_READING_ECOSYSTEM.md`.

**L6 Gate, category 1 — 2 of its 6 surfaces, 2026-08-25 (later 21)** (`e41a85ce`, `16e8ed1c`).
Captures **10/10** and Immersion **10/10**, both live, raised, control fired. Immersion earned it
with a product fix, not a re-read: **34 controls under the 32px pointer floor → 0**, via a new
`.lq-hit-scope` container variant of the existing `.lq-hit` expander (they share the one `::after`,
and the guard asserts that). No box grew — the pointer gets 32px, the rects are unchanged.
**Library FAILS** (50 below floor in three families, plus a real contrast defect at **3.69:1**,
`span.manga-ocr-badge`) and **Novels FAILS** (5 below floor plus one STOLEN region, −28.8px).
manga and VN are unscored — they replace the desktop shell, so they need the harness's `@selector`
form, which `l1-hit-area.js` gained this turn and which has not yet been run on them.
The harness is `probes/cat1-accessibility.cjs`; every remaining surface is a RUN, not a build.
Log: `.coordination/liquid-workplace/L1_ACCESSIBILITY.md`.

**Bullet 1 CLOSED 2026-08-25** (`b2c6e7f5`). All six surfaces are on the contract — Captures,
Novels, Library, Immersion, manga, VN — and the fifth named item resolved to ONE surface, not
four: `renderer/pdfLoader.ts` is imported by `views/NovelReader.tsx` alone, so PDF and EPUB ARE
surface 2. `ReadingToolSpec.side` (`132220b7`) was the last thing the contract lacked; the VN
library is the first leading-edge tool and is emitted BEFORE the document in the DOM rather than
moved with CSS `order`. Sweeping the six for that same defect found exactly one regression the
migration had introduced — Captures' list had moved from the left column to the right edge, unseen
because every assertion about it was a WIDTH (`eb9a07bf`). **Bullet 2 is now the open one**, and
it is a parity question across those six rather than a new migration.

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

**L6 Gate CLOSED 2026-08-26 — 48 of 48 rubric cells, six surfaces × eight categories**
(checkpoint containing this entry). The final two cells were category 7 on the two root readers.
The existing runner now selects its gesture mechanism from the DOM: a root inside `.fwin` uses
the titled frame; a root with no frame uses pointer-only drag plus debug-bridge `/bounds` resize,
with exact content-size restoration. Manga: drag/resize/theme p95 **16.9/16.8/16.9 ms**, heavy
page-through main max **10.1 ms**, jank control **12** frames over 100 ms against the session's
2-frame compositor floor. Novels: **16.9/16.9/16.9 ms**, rendered-volume scroll max **8.5 ms**,
control **12 vs 0**. Both bounds round trips returned **1264×821**; exact manga and EPUB progress
records were restored. Full evidence: `L6_READING_ECOSYSTEM.md` and `cat7-*-perf.json`.

### L7 — Review and learning loop

Order: Flashcards → Anki → Notebook → Statistics → Calendar → Games.

- Keep review/input surfaces spatially fixed during active tasks.  <!-- status: closed; evidence: 2026-09-03, primary2, 50f99f30 (instrument) + 8abce3a4 (fix). MEASURED against the bullet's own words for the first time -- none of the eight categories samples a region's box ACROSS a task, so the 16 RULE C cells could not answer this and did not. `--fixity` on cat2 (RULE 1: a mode on the harness that already drives tasks) samples each named review/input region at rest and after EVERY step. Calendar FAILED: `.cal-month-grid` y=167 -> 211 on opening "Jump to date", **44px**, and it stayed there for the next two steps; rootDx/rootDy 0, so the window did not move, the grid did. Cause is the 2026-08-28 cat5 repair -- the disclosure that moved Q4 from 0/9 to 1/8 wrapped the transport row. Anchoring the field over the toolbar: **44 -> 0px at all seven samples**, spatiallyFixed true, undo restored. Games PASSED unmodified: `.game-stage` and `.game-launch-panel` dx/dy 0 on the same gesture, panel dh 40 displacing nothing, because it opens BELOW the stage -- so the rule is "a disclosure ABOVE a work region displaces it", not "disclosures reflow". CONTROL on both, and it still discriminates after the fix rather than going blind: planted top:9px -> used box moved 9px -> reader reported exactly 9px; removal left residue 0px, the exact original style attribute and no marker. sampled-out: Flashcards (60/80; 0 decks on this profile so its review loop is not measurable here), Anki (externally PARKED), Statistics (70/80, cat8 blocked), Notebook (DELETED -- see 971). Log: L7_REVIEW_LEARNING.md 2026-09-03 || MERGED 2026-09-03, also measured on feat/nyaa-subtitles (independent receipt, same status): 2026-09-03, primary -- 1bdfd7ca. The condition the previous OPEN tag named, met on its own terms and measured with the same instrument. BEFORE, re-derived at HEAD this session rather than inherited: 10 cards driven through the review strip, revealed with a real click at the Show-answer button own live centre -- 6 of 10 moved, max 88 px; card 360 -> 448 px on four, and on two the prompt outran the answer so it shrank 849/1011 -> 501/554 and dragged .fwin-body scrollTop 687/849 -> 404/457. (The earlier 9-of-10/431 px is the same defect on a different draw; strip order is not stable across a reload.) MECHANISM: the review card was sized by its own content -- min-height 360px with no cap -- so the grading row sat wherever the answer length put it. FIX: a zero flex-basis inside a bounded shell column, so the card used height has no term for its content; it is the shell leftover space, floored at the same 360 px that already shipped. AFTER: 0 of 10 moved, max shift 0 px, actionsY 530 and cardH 360 -> 360 on every card. CONTROL, same session: an injected sheet re-declaring the card flex 0 0 auto / overflow-y visible / justify-content center -> 4 of 6 moved, max 88 px; sheet removed -> 0 of 6. PARITY, because capping a card is only honest if the overflow stays reachable: 6 of 10 answers overflow, max 194 px, all 6 scroll, 0 clipped at the top, and the last child of each answer is fully visible and hit-testable after scrolling. NOT CLAIMED: no sampled reveal ever put a grade button under the pointer that pressed Show answer, before or after (landedOnGrade false 10/10 both times) -- that harm was never demonstrated and is not being claimed as fixed. GUARD flashcardReviewRowAnchor.test.ts, 3 cases, asserts the property not the spelling; its own mutation control fails all 3 and styles.css was restored byte-identically. Evidence: L7_REVIEW_LEARNING.md 2026-09-03 -->
- Use Liquid only for context, preview, scheduling detail, and session summaries.  <!-- status: closed; evidence: 2026-09-03, primary2. RULE C pair Calendar + Games, both 8/8 at 10/10, re-derived MECHANICALLY from the banked receipts this turn (verdict field read by `node -e` over cat{1..8}-l7-{calendar,games}*.json), not inherited from prose -- the plan's own mid-file text still says Games is 30/80 and the L7 log's tail supersedes it at 80/80. Regions ENUMERATED against the bullet's four sanctioned uses rather than inferred. Calendar: 2 Liquid-eligible, 2/2 treated, 2/2 shared-primitive-backed, denseWorkOnTranslucent 0, 1 Work region -- read live from the DOM this turn those two are HEADER.lq-contextual.view-head (context) and DIV.lq-contextual.cal-toolbar (scheduling detail), with .cal-month-grid NOT contextual and the one input (.cal-jump) inside `AnchorSurface bare`. Games: 6/6 treated, 6/6 shared, dense 0, 1 Work region -- header, 15-game nav, game/difficulty header, material coverage, seen coverage, post-round detail; gameplay, answer inputs, HUD and timing stay on the opaque work pane. 0 Liquid-treated regions hold an input on either surface. NOTEBOOK IS NO LONGER A SURFACE and L7's order above still lists it: files-app gate 8 deleted the section (grep -c notebook DesktopShell.tsx = 0; App.tsx:108 says so; the live start menu lists 22 tiles with no Notebook). Its 2026-08-28 80/80 certified a surface that no longer ships -- true when measured, not withdrawn, but L7 is five surfaces now. sampled-out: Flashcards 60/80, Anki PARKED, Statistics 70/80, Notebook DELETED. TRAP: a hand-rolled alpha reader finds 1 translucent node on both surfaces in Standard AND Liquid, because getComputedStyle().backgroundColor resolves the Liquid material to an opaque rgb(); cat3's measured classifier is the instrument. Log: L7_REVIEW_LEARNING.md 2026-09-03 || MERGED 2026-09-03, also measured on feat/nyaa-subtitles (independent receipt, same status): 2026-09-03, primary -- cat3-liquid-utilization.cjs --surface Flashcards --presentation liquid --control, on the LIVE review state (an active task, not the launcher): denseWorkOnTranslucent = 0, roles Work 1 / Anchor 29 / Anchor-holds-work 4 / Ambient 0. Control A blurred the one Work region 0 -> 1; control B made every Work region fail; both restored (oneMaterialReturned, allGlassReturned) -- "CONTROL FAILED AS REQUIRED". Baseline cat3-l7-997-flashcards-review.json. Joins the five surfaces already scored for this bullet in L7_REVIEW_LEARNING.md (Flashcards, Notebook, Statistics, Calendar, Games each recorded 0 dense Work regions on translucent material); Anki's connected half stays human-blocked on the Anki+AnkiConnect install request and is complete-except-external per the ladder. TRAP, do not re-derive it as a defect: that same run prints verdict FAIL on contextualTreated and sharedPrimitives, both computed as `eligibleTotal > 0 && ...` against eligibleTotal 0. A review with zero contextual regions is what this bullet ASKS FOR. cat3 already forgives that as `vacuousContextual`, but only inside its `if (!work)` branch; here Work = 1 so the branch is unreachable. Instrument gap, not surface. FIXED 2026-09-03 in d84bb72a -- control C's eligibility plant now runs in the A/B branch too, so the zero is a MEASURED zero there as well; the bars were not widened. Re-run on this surface after the fix: PASS 10/10, failedBars [], vacuousContextual true, exit 0, and barsWhilePlanted {contextualTreated: false, sharedPrimitives: false} showing the low score is still reachable. -->

Gate: timing-sensitive input and study state do not shift unexpectedly.

**Progress 2026-08-26 — Flashcards, first of six; both bullets remain OPEN.** The mode launcher
and the overview/mining mode navigation now use `ContextualSurface`, which stays inert in
conventional and Blanc hosts and paints only through the shared presentation seam. Dense import,
CSV editing, virtualized deck rows, the review card, and grading controls remain on the opaque
work surface. Live with a real **3,218-card** review: Liquid → Standard → Liquid preserved the
same word, **0 / 3,218** position, card rect **724×360 at 137,360**, and action rect **724×49 at
137,740** byte-for-byte; the review contained **0 contextual regions**. Focused guard: 3/3.
Log: `.coordination/liquid-workplace/L7_REVIEW_LEARNING.md`. Next: Flashcards feature parity and
the rest of its rubric cells before Anki; one migrated app does not close either system-wide bullet.

**Progress 2026-08-26 — Flashcards categories 1 and 3 are 20/20; both bullets remain OPEN.** The
surface-parameterized accessibility harness measured **342** text owners (minimum **5.01:1**),
**99** controls, **0** sub-32px effective pointer areas, **0** WCAG spacing failures, **0** unreachable
controls, and reduced motion **57 → 0 → 57**. Its control moved every signal and restored it. The
utilization harness measured **15** Work regions with **0** translucent, and **2/2** contextual
regions treated through shared primitives; its controls falsified **1/15** and **15/15**, then
restored **0/15**. Product repair changed **77 → 0** undersized effective targets and replaced the
nested folder delete pseudo-button with sibling native controls. The same harnesses remain the
instruments for Anki onward; no Flashcards-only probe was added. Full evidence: L7 log and
`cat1-l7-flashcards.json` / `cat3-l7-flashcards.json`.

**Progress 2026-08-26 — Flashcards category 2 is 10/10; category 4 remains 0.** Switching EPUB →
Dictionary costs **1 click** in both presentations, with **0** dead ends/traps, **12.1ms** worst
renderer acknowledgement, and state hash `1hrek7n` restored; its control moved all three defect
counts and restored them. Category 4's single repair pass removed the nested horizontal scroller at
default/maximized, compact clipping **3 → 0**, and compact hidden-overflow owners **19 → 1**. It is
still a measured FAIL: `.flash-group` is **180 > 174px** at compact, and dominant-content share falls
**13.0% → 6.8%** when maximized. Resume those two residuals with the same harness next turn.

**Progress 2026-08-26 (later) — Flashcards category 4 is 10/10; Flashcards is 40/80.** At default /
compact / maximized the parameterised harness measured **0** clips, overlaps, scrollers, and hidden
overflow owners; dead region **8.4 / 0.7 / 11.0%**; chrome **5.7 → 4.3%** while the visible work
viewport grew **93.7 → 95.3%**. Compact header wrapping repaired `.flash-group` **180>174 → 174=174**.
Correction 17 fixed the generic content-to-chrome measure after its deepest-leaf heuristic compared
a wrapped contextual action row with an unrelated import row. Control: clip **0→1→0**; subminimum
200×140 produced **2** clips / **2** scrollers / **10** hidden owners and restored. Full evidence:
`L7_REVIEW_LEARNING.md` and `cat4-l7-flashcards.json`. Both L7 bullets remain open; next is category 5.

**Progress 2026-08-27 — Flashcards category 6 is 10/10; Flashcards is 50/80.** A RUN of the
shared `cat6-feature-parity.cjs`; what was missing was the `flashcards` spec, which is data —
now the eleventh app in `l6-parity.js` with 8 feature rows, 5 steps and 8 mutations. Parity
**8/8 standard = 8/8 liquid**, rows agreeing by id; the standard → liquid → standard round trip
on a live **3,218**-card deck held byte-for-byte with **0** diffs; the control flipped
**8 of 8** rows exactly and restored, so the instrument is proven rather than assumed. Trap
carried forward for every later spec: the runner's `dirtyField` lands in `.flash-search-input`
and filters the deck to zero, so the drive must clear it before `check()` runs. Full evidence:
`L7_REVIEW_LEARNING.md` and `cat6-l7-flashcards.json`. Next is category 5, which reads this
baseline for Q7/Q8/Q9 and could not be scored before it existed.

**Progress 2026-08-27 (later) — Flashcards category 5 is 10/10; Flashcards is 60/80.** All ten
questions YES, control `FAILED AS REQUIRED on Q2, Q3, Q5, Q10` with plant residue **0**. The
first score was **9/10** on a real defect: Q4 measured **0 collapsed disclosures and 10 scanned
controls**, seven of them launchers competing in one row, so the overview opened by asking which
of seven buttons meant "start". Five specialist entries now sit behind one `<details>`; nothing
was removed, disabled or renamed, and Q4 re-measures **1 disclosure / 5 scanned controls**.
`Jiten vocab` shipped as a raw JSX literal and is now `flash.jitenVocab` in four catalogs.
Instrument correction: Q10's card-host scan kept only the most uniform host, so a real dashboard
beside a legitimate gallery was invisible and the control could not falsify — every qualifying
host is now scored and the worst decides. Only categories **7 and 8** remain on this surface.
Evidence: `L7_REVIEW_LEARNING.md`, `cat5-l7-flashcards.json`, `cat5-l7-flashcards-control.json`.

**Progress 2026-08-27 (last) — Flashcards category 8 is UNMEASURED, not failed, and stays in
units-left.** The run establishes raw i18n keys **0**, placeholders **0**, worst mute-pair count
**0**, and a drive leg that passed its own `surfaceChanged` and `restored` gates. It cannot
score `statesNamed` because **0 of 4** states are observable. The cause is product: this
surface's deck-list empty states are a bare `<p className="muted">`, while the surface's own
pattern — `.flash-empty`, already used by review mode — is what `cat8-honest-states.cjs:310`
looks for. Next slice is that markup, then a re-run with `--langs --control`. Category 7 is the
other open cell. Regression re-runs after the category-5 product change: category 4 **PASS
10/10**, category 1 **PASS 10/10**.

**Progress 2026-08-27 — Anki is hardened on the reachable branch and remains externally PARKED.**
The disconnected screen plus Deck Workbench pass controlled categories 1–4 after target-size and
compact-reflow fixes, but these partial results do not close whole-surface cells. The connected
deck/card/browser branch cannot mount without Anki + AnkiConnect, so Anki remains **0 of 8 closed / 8
PARKED** and L7 advances under the human-blocked exception. Next surface: Notebook. Evidence:
`L7_REVIEW_LEARNING.md`, `cat{1,2,3,4}-l7-anki*.json`.

**Progress 2026-08-27 (later) — Notebook is 60/80 after interrupted-work recovery.** Categories
1–6 are controlled **10/10** results; category 6 is **8/8 = 8/8** with 0 round-trip diffs. The
category-5 failure recovered from disk moved **8/10 → 10/10**: entry points **0→2**, default
controls to scan **36→10** behind one disclosure. Regression runs caught and repaired the open
disclosure squeezing the timeline and one compact horizontal scroller (**286>202→0**). Categories
7 and 8 remain. Evidence: `L7_REVIEW_LEARNING.md`, `cat{1..6}-l7-notebook*.json`.

**Progress 2026-08-27 (category 8) — Notebook is 70/80.** Honest states pass with raw keys,
placeholders, and unexplained disabled pairs all **0**; the one observable state is named **1/1**.
Four locales produced four distinct text hashes and restored English exactly; the control moved
all three defect terms **0→1→0**. Only category 7 remains.

**Progress 2026-08-27 (interrupted category-7 recovery) — Notebook remains 70/80, with the open
cell moving from category 7 to category 1.** Timeline row deferral fixes a repeatable resize
failure (**33.4/50.2 → 16.7/16.9 ms** p50/p95), and category 7 passes 10/10 with a jank control.
That optimization changes which off-screen controls have synchronous geometry, so the earlier
category-1 run is retracted rather than inherited. Its shared harness exhausted one repair attempt
at **484/38 falsely occluded**; category 1 is UNMEASURED until it reveals one deferred row at a
time. Evidence and the exact restart A/B are in `L7_REVIEW_LEARNING.md`.

**Progress 2026-08-27 (later category-1 attempt) — Notebook remains 70/80.** One generic
one-record-at-a-time repair made the pointer leg measure **452/479** controls, but the core leg
still measured only **33/479** controls and **117/2,062** prior text owners. The apparent PASS is
void; the edit and overwritten baseline were restored under RULE 1's one-repair limit. The next
turn opens on that exact core-leg visibility assumption, not Statistics.

**Progress 2026-08-27 (latest) — Notebook remains 70/80.** The next generic repair reached
**2,056 text owners / 454 core controls** and **472/479** pointer controls; its control falsified
all five scored terms. It is nevertheless VOID because exact restoration failed (**0/381** core
owners; **382** empty style attributes). Live residue and all failed files were restored. Per the
one-repair rule, category 1 remains UNMEASURED and Statistics does not open.

**Progress 2026-08-28 — interrupted category-1 repair safely recovered; Notebook remains 70/80.**
The full population and five-term control reproduced, but the claimed **380/380** immediate restore
was false: a post-run check found **381** empty style attributes. Residue and failed files are again
restored to zero/HEAD. The open instrument boundary is delayed renderer-task restoration; category
1 stays UNMEASURED and the next turn repairs that boundary before Statistics.

**Progress 2026-08-28 (later) — Notebook is controlled 80/80 and DONE; Statistics opens.** The
generic category-1 repair preserves each deferred owner's exact original style attribute, repairs
the expected delayed CSSOM drift on the next renderer task, and requires two later exact reads.
Full population: **1,260** text owners, **439** core / **464** pointer controls, contrast/WCAG/
keyboard/pointer-floor/theft failures all **0**, reduced motion **11→0→11**. The five-term control
moved **0→1/2/2/1/2→0**; an independent 750 ms check found **0** residue. Evidence:
`L7_REVIEW_LEARNING.md` and `cat1-l7-notebook.json`. Next surface: Statistics.

**Progress 2026-08-28 (Statistics) — 20/80 after categories 1 and 3.** Accessibility passes after
repairing the sole 26.5px target to 32px: 99 text owners, 10 controls, 0 failures, motion **20→0→20**.
Selective use passes across **91** regions: dense Work on glass **0/3**, contextual/shared **1/1**;
controls moved **0→1→3→0**. Category 2 is not flattered with reset, failed Anki sync, or a one-way
media handoff as the dominant task. Evidence: `L7_REVIEW_LEARNING.md`, `cat{1,3}-l7-statistics.json`.

**Progress 2026-08-28 (Statistics category 4) — remains 20/80.** Container-scoped single-column
reflow removed compact defects (**12 clips / 1 hidden overflow → 0/0**); all defect counts are zero
at three scored sizes and controls move/recover. The score stays **0/10** because maximized dead
space is **17.0%** against ≤15% (default 8.9%, compact 0.5%). One repair attempt is exhausted;
`cat4-l7-statistics.json` preserves the exact next boundary.

**Progress 2026-08-28 (Statistics category 8) — remains 20/80.** Passive bars are clean
(99 text runs; raw keys/placeholders/mute pairs 0/0/0; 4/4 language hashes; control
0/0/0→1/1/1→0/0/0), but no adverse state was observable. Sync outcomes are now semantic and
dismissible, yet the real-sync drive succeeded and was not reversible by text hash; its 41,535
Anki-only writes were immediately removed back to the pre-proven zero store. Category 8 stays
UNMEASURED; the next attempt must isolate a deterministic error and must not drive live sync.

**Progress 2026-08-28 (Statistics category 6) — 30/80.** The shared parity engine now carries
an eight-row Statistics spec. Standard/Liquid are **8/8 / 8/8**; an 820×580 presentation round
trip retained a driven 320px scroll with zero diffs. Eight independent controls each moved
**8/8→7/8→8/8** and only their declared row fell. Evidence: `cat6-l7-statistics.json`.

**Progress 2026-08-28 (Statistics category 5) — 40/80.** A safe **Last 14 days** jump now owns
the dominant-task slot and destructive Reset is behind one collapsed disclosure. Clarity moved
**7/10→10/10** on the one repair: one top-third entry, visible primary, 2 default controls; two-theme
contrast minima **5.30/5.71**, 0 failures. Q2/Q3/Q5/Q10 controls fail and restore. Refreshed parity
includes the jump's **0→814** scroll effect at **9/9 / 9/9**, nine isolated controls, zero diffs.
Evidence: `cat5-l7-statistics{,-control}.json`, `cat6-l7-statistics.json`.

**Progress 2026-08-28 (Statistics category 4) — 50/80.** The maximized dead region closed
**17.0%→13.3%** against the 15% bar. A wide window now runs a two-column composition (knowledge |
recent activity, books | shows) with the container on the view's PARENT behind
`:has(> .stats-view)`, because a floating window has no `AppChrome` and an element cannot query
itself. Default **8.9%**, compact **0.5%**, clip/overlap/scroller/hidden-overflow **0** at all
three sizes, chrome **11.4→8.7%**, all three restored. Injected clip **0→1→0** with removal proven;
the sub-minimum **200×140** leg still fails with **13** clips. Parity re-checked after the product
change at **9/9**. Evidence: `cat4-l7-statistics.json`. Categories 2 and 7 unrun, 8 UNMEASURED.

**Progress 2026-08-28 (Statistics category 2) — 60/80.** Input cost of the dominant task is
**2 clicks / 0 keystrokes**; dead ends **0**, modal traps **0**, scroll traps **0**, worst
renderer-side acknowledgement **4.9 ms** against 100 ms. Cost parity was driven, not assumed:
the same window in Liquid cost **2** against Standard **2** and the presentation restored. The
harness gained one generic repair — `scroll:` as a second uncounted restore primitive — because a
task that scrolls could not be driven twice, which is correction 13's shape for scroll. Control
moved all three terms **0,0,0→1,1,1→0,0,0**. Evidence: `cat2-l7-statistics.json`.

**Progress 2026-08-28 (Statistics category 7) — 70/80.** Ten lines of spec data in the existing
runner, no new probe. Session ceiling **16.7 ms p50** over three runs; drag **16.7/17.1/83.5**,
resize **16.7/17.0/67.0**, theme **16.7/16.9/66.9**, over-100 **0** on all three with the scene
stable and geometry closed-loop. Main loop under the heavy scroll **p50 2.1 / max 7.9 ms** against
idle **2.2/8.3** and a 500 ms bar, receipt 1,438 px over 91 ticks restored to 0. Main RSS
**99.4→109.6 MB**, renderer heap **254 MB**, uptime **3,553 s**. The `--jank` control moved p95
**17.1→100.3** and over-100 **0→11**. Evidence: `cat7-statistics-perf.json`.

**Progress 2026-08-28 (Statistics category 8) — stays 70/80, and the blocker is a DEFECT.**
With `ankiUrl` repointed to a refused port and the app restarted onto it, the sync reported
**"Synced 87,260 words from Anki — 0 updated"** as a `role="status"` success. `anki:getIntervals`
(`main/anki/index.ts:942`) serves the cached snapshot on a failed refresh and never rejects, so
`syncKnowledgeFromAnki` cannot report an unreachable Anki — a false success, which is category 8's
own defect. `anki:linkState` is the honest seam. The other route is closed too: `window.api` is
FROZEN, so no renderer stub can arm the state. All driven state restored and verified
(profiles.json byte-identical by SHA-256; knowledge store back to 0/0/0/0).

**Progress 2026-08-28 (Calendar category 1) — 10/80.** The interrupted controlled run was
recovered from disk: 60 text owners and 9 controls with zero contrast, reachability, pointer,
WCAG 2.5.8, or motion failures. The five-term control moved **0/0/0/0/0 → 1/2/2/1/2 →
0/0/0/0/0**, with exact delayed restoration. Evidence: `cat1-l7-calendar.json`.

**Progress 2026-08-28 (Calendar category 2) — 20/80.** Month→Week costs one click in both
Standard and Liquid, with 0 dead ends, modal traps, scroll traps, or acknowledgements over 100 ms.
The control moved all three defect terms **0/0/0→1/1/1→0/0/0** and the exact state/presentation
restored. Evidence: `cat2-l7-calendar.json`.

**Progress 2026-08-28 (Calendar category 3) — 30/80.** The first run found Calendar's date-input
subgroup as dense Work on contextual glass **1/1**. `AnchorSurface bare` reduced that to **0/1**
while retaining contextual/shared treatment **2/2**; controls moved **0→1→1→0** and restored the
exact material plus Standard presentation. Evidence: `cat3-l7-calendar.json`.

**Progress 2026-08-28 (Calendar category 4) — 40/80.** Compact mode/day tracks reduced the only
horizontal scroller from `.calendar-view` **262>212px → 0**. All four defect counts are zero at
820×580, 260×170, and 1264×765; dead region is **5.4/0.9/9.7%**, every size restored, and the
clip control moved **0→1→0**. Evidence: `cat4-l7-calendar.json`.

**Progress 2026-08-28 (Calendar category 6) — 50/80.** Five rows cover four view branches, the
42-cell month grid, reversible date transport, open/cancel event composition, and window lifecycle.
Standard/Liquid are **5/5 / 5/5**, the 120px-scroll round trip has zero diffs, and all five controls
move only their own row **5/5→4/5→5/5**. Evidence: `cat6-l7-calendar.json`.

**Progress 2026-08-28 (Calendar category 5) — 60/80.** Moving direct date entry behind a native,
translated disclosure changes Q4 from **0 disclosures / 9 controls → 1 / 8** and yields all ten
YES answers. Q2/Q3/Q5/Q10 controls all fail and restore; refreshed categories 1–4 and 6 remain
controlled 10/10. Evidence: `cat5-l7-calendar{,-control}.json` and refreshed `cat{1,2,3,4,6}`.

**Progress 2026-08-28 (Calendar category 7) — 70/80.** The shared performance harness cycles all
four views **56** times (**14/14/14/14**) without writing events and restores the starting mode.
Heavy/idle main-loop p95 are **3.7/3.0 ms**, maxima **9.5/10.6 ms**; all gestures restore geometry
and theme. The compositor control itself stalled twice (max **1,721.6 ms**), recorded as environment
noise; the injected-jank control still yields **11** >100 ms frames. Evidence: `cat7-calendar-perf.json`.

**Progress 2026-08-28 (Calendar category 8) — controlled 80/80.** Agenda's three existing absence
messages now carry an explicit empty-state semantic. Driving Month→Agenda→Month measures **1/1**
observable state named, restores the exact text hash, and finds **0** raw keys, placeholders, or
unexplained disabled controls. Four languages produce four hashes and restore English; the negative
control moves all three defect counts **0→1→0**. Evidence: `cat8-l7-calendar.json`.

**Progress 2026-08-28 (Games opening).** The live **942×593** Game Arena now exposes **5** sanctioned
contextual regions: app header, 15-game navigation, game/difficulty header, material coverage, and
seen coverage; post-round detail uses the same primitive when reached. Gameplay, answer inputs, HUD,
and timing state remain on the stable work pane. A Standard→Liquid→Standard trip changes contextual
alpha **0→0.72→0** while stage alpha stays **0.88**, selected game stays Sentence Builder, and XP stays
0. Guard: `gameArenaLiquidRegions.test.ts` **2/2**. Games scoring is next.

**Progress 2026-08-28 (Games category 1) — 10/80.** The first run found the sixth cascaded window
ending below the taskbar, reducing one game choice's usable hit area to **31.5 px**. New windows now
fit against the work area's remaining width/height at their actual cascade origin; reopened Games
ends at y=**763**, taskbar y=**765**. Final: **47** text runs, min contrast **4.72:1**, **17/17**
controls reachable, min target **32 px**, 0 obstruction, reduced motion 19→0→19; all five control
terms move and restore. Evidence: `cat1-l7-games.json`.

**Progress 2026-08-28 (Games category 2) — 20/80.** The first run found **3** clipped game
descriptions (14 unreachable px each). Games now overrides the shared badge clamp so every study
description wraps in full. Final task cost is **1 click / 0 keys** in Standard and Liquid, renderer
acknowledgement **20.4/18.5 ms**, exact undo hash restored, and dead ends/modal traps/scroll traps
are **0/0/0**. The negative control moves all three **0→1→0**. Evidence: `cat2-l7-games.json`.

**Progress 2026-08-28 (Games category 3) — 30/80.** The first run found the dense gameplay pane
still painted at alpha **0.88**. It now uses the opaque semantic Work material: **1** Work region,
**0** dense-work-on-translucent, and **5/5** eligible regions both Liquid-treated and backed by
shared primitives. The one-region and all-glass controls move the Work failure **0→1→0** and fully
restore presentation/material state. Evidence: `cat3-l7-games.json`.

**Finding 2026-08-28 (Games category 4) — stays 30/80.** The shared harness measures default,
compact, and maximized at **980×589 / 260×170 / 1264×765**. Current CSS fails compact with **1**
clipped region and **1/1** horizontal/hidden overflow; dead region is **15.1%** default and **36.1%**
maximized. One component-container attempt removed clipping but exposed **6** header/list overlaps,
kept a horizontal scroller, and did not move dead space, so it was reverted under the one-attempt
rule. Next: design the compact header/list as a genuine vertical document and distribute idle-stage
content before re-running `cat4-use-of-space.cjs`; do not reuse that partial rule set.

**Progress 2026-08-28 (Games category 4, compact half) — stays 30/80, two of three bars closed.**
The cause is measured, not the CSS the reverted attempt guessed at: the Arena is a floating window,
so `@media (max-width: 760px)` in `styles.css` cannot fire while the frame is 260px and the desktop
is 1264px. `.game-arena` is now an inline-size container and reflows to a vertical document below
560px. Compact moves **clipped 1→0**, **hiddenOverflowX 1→0**, and after stacking the coverage meter
(its label's min-content alone was **199px** inside a **168px** stage) **horizontalScrollers 1→0**;
stage `scrollWidth 207→168 = clientWidth`. Default and maximized are unchanged and still clean on
those bars. Guard: `gameArenaLiquidRegions.test.ts` **6/6**. **Only `deadRegion` still fails**:
**15.1%** default (513x305) and **36.1%** maximized (789x475), both the idle stage's lower-right
void. Evidence: `baselines/cat4-l7-games.json`.

**Progress 2026-08-28 (Games category 4) — controlled PASS 10/10; score 40/80.** The void was a
product gap, not a layout one: `stats.ts` has always persisted the last **30** finished rounds
(`GameProgressData.recent`, score/accuracy/level/missed) and **nothing ever showed them back**. The
ready state now renders the selected game's recorded rounds — the one moment the stage has nothing
else to say, and unlike a preview of the material pool it spoils no prompt. Three measured layout
corrections followed: the ready block grows into the stage instead of a 180px launch stub;
one-record-per-row left a **568x475** empty band between each summary and its right-aligned date, so
records wrap at `minmax(230px, 1fr)`; and that 230px floor then broke compact, so the container
query stacks them. Final: dead **4.8 / 0.8 / 12.0** pct of viewport at 980x589 / 260x170 / 1264x765,
clipped, overlaps, scrollers and hidden-overflow all **0/0/0/0** at all three, chrome **36.4→29.8**
falling while the canvas rises **93.9→95.3**. The injected-clip control moves clipped **0→1→0** with
removal proven; the sub-minimum 200x140 shrink honestly reports **3** scrollers below the supported
floor. Guard: `gameArenaLiquidRegions.test.ts` **7/7**; i18n **10,941**.

**How this cell was populated, because the rubric caps an empty harness at 0.** The score is
measured on **12** records written to the product's own `jp-game-progress-v1` key in the schema
`recordGameResult` writes. The key **did not exist** before (0 bytes) and was removed after;
`getItem` reads `null` again, byte-identical to the state found. The never-played state is banked
separately in `baselines/cat4-l7-games-empty.json` and is an honest open finding rather than a
score: dead **10.1 / 0.8 / 32.7**, so a player with no history still sees a 32.7% void at maximized.
Filling that needs content the app does not have for a new player; do not close it by centring the
empty message, which was measured and does not move the band. Evidence:
`baselines/cat4-l7-games{,-empty}.json`. Categories 1–3 must be re-run: this changed the DOM.

**Progress 2026-08-28 (Games categories 1–3 re-certified after the DOM change) — 40/80 stands.**
All three are RUNs of the existing harnesses against the new ready state; none needed a repair.
Category 1 measures **55** text owners at minimum **4.72:1**, **22** controls with `under32` limited
to the shell's own 24px `.fwin-b` frame buttons, **22/22** keyboard reachable, reduced motion
**26→0→26**. Category 2 is **1 click / 0 keys** with dead ends, modal traps and scroll traps
**0/0/0**, and the parity leg drives the same task in both presentations at the same 980x589 box —
Liquid **1** against Standard **1**, presentation restored. Category 3 now finds **6** eligible
contextual regions rather than 5 (the round history is the sixth), **6/6** Liquid-treated and
**6/6** on shared primitives, dense-work-on-translucent **0**, and its control failed as required.
Categories 5–8 remain. Evidence: `baselines/cat{1,2,3}-l7-games.json`.

**Progress 2026-08-28 (Games controlled close) — 80/80.** Categories 1–4 and 8 re-pass after
the disclosure DOM change; category 5 is 10/10 across all six shipped light palettes and category 6
is **10/10 / 10/10** Standard/Liquid with all ten controls exact. Category 7's retry is stable:
**60** game cycles restore selection, heavy main-loop p95/max are **3.4/9.0 ms**, and its jank
control records **11** frames over 100 ms. Category 8 is **1/1** named state, **0** honesty defects,
four language hashes, and **0→1→0** control. All live state restores, including absent game progress.
Fix/evidence commit `b6e55253`; full receipt: `L7_REVIEW_LEARNING.md` and `LIQUID_SCORECARD.md`.

**L7 status 2026-08-28 — COMPLETE EXCEPT EXTERNAL; L8 opens.** The earlier Statistics 70/80
paragraph is chronological, not current: its false success was fixed in `593d6ba8`, race-hardened
in `9f9fcc1c`, and controlled category 8 closed in `1441e2b5`. Flashcards, Notebook, Statistics,
Calendar, and Games are therefore **5/5 reachable surfaces at 80/80**. Anki remains **0/80 PARKED**:
Anki desktop is not installed and 127.0.0.1:8765 still refuses connections. Its eight cells and
the two system-wide L7 bullets remain counted and open; the human-blocked exception advances the
agent-owned ladder to Resources without calling the L7 Gate closed.

### L8 — Discovery, operations, and configuration

Order: Resources → Scraper → Settings → YouTube → Music.

- Apply progressive disclosure without burying configuration or operational state.  <!-- status: closed; evidence: plan:1186 -->
- Preserve logs, errors, cancellation, and recovery visibly.  <!-- status: closed; evidence: plan:1186 -->

Gate: every setting and scraper action remains searchable and keyboard reachable.

**L8 status 2026-08-30 — CLOSED, 2 of 2 bullets and 40 of 40 rubric cells.** Resources,
Scraper, Settings, YouTube, and Music each hold a controlled 80/80. The five receipts that a
filename-only sweep missed are resolved: Settings and YouTube category 7 were already
committed as `cat7-settings-perf.json` and `cat7-youtube-perf.json`; Resources categories 1,
3, and 4 were re-run live on the populated 51-card surface and committed under the expected
`catN-l8-resources.json` names. The Gate's searchable and keyboard-reachable halves remain
clean for both Settings and Scraper: 130/129+1 and 28/27+1 destinations, zero unsearchable,
misrouted, unanchored, ungated, or over-gated actions, with both category-1 runs at 10/10.
Full receipt map and negative-control numbers are in
`src/.coordination/liquid-workplace/L8_DISCOVERY_OPERATIONS.md`. L9 opens.

### L9 — Shell, widgets, and alternate identities

- Finish taskbar/context/command entry points without forcing Liquid.  <!-- status: closed; evidence: b1e35170 shipped the third (command) entry point; RULE C rubric receipt in L9_SHELL_IDENTITIES.md — 16 scored cells all 10/10 across Video, City and (cat8 substitution for City's UNMEASURABLE cell) the command palette -->
- Migrate Note, Visualizer, Music widget, City, notifications, onboarding, and help.  <!-- status: closed; evidence: 12d5a976 -->
- Complete Aero, Wired, and Blanc-native Liquid adapters.  <!-- status: closed; evidence: 3f47bfa1 -->
- Verify Secret Aero/Wired lifecycle and Blanc cold-open boundaries.  <!-- status: closed; evidence: identity-leakage half — 59d3eb89 scoped 61 wired gates that were live under every theme, c473e217 guards Aero the same way, f62c614e proves the Blanc cold-open boundary. RULE C receipt now 16 of 16, counted from the per-cell lines in L9_SHELL_IDENTITIES.md: Wired cat1 (bc7816d6) and cat2-cat8, Blanc cat1-cat8, every cell PASS 10/10 with its own negative control, so no category failed and no expansion was forced. Last two cells: 9b29540d cat8 Blanc, 38f531b1 cat7 Blanc -->

Gate: all theme/mode combinations in §8 pass without identity leakage.

### L10 — System-wide smart minimalism pass

- Remove redundant chrome and card nesting identified by the visual census.  <!-- status: closed; evidence: 2ae5fa57 + 12c2b10a + 4ece2839; receipt in L10_MINIMALISM.md. RULE C 16 of 16 on Settings (1,307 controls, the census maximum) and Media Center (the shared player/video/music root). Three real repairs first: a bare contextual landmark on the Media browser head (cat3 6/7 -> 7/7 treated), a 126px-wide compact shell hiding 158px of content (cat4 horizontal failures 1 -> 0), and Media losing its focus context. cat7 VOIDed its own first Settings pass on a stale 19-page assumption against a 24-page rail; correction 39 derives the tick interval from a declared budget. Every cell carries a control that discriminated in its own run -->
- Reconcile toolbar labels, icon semantics, spacing, motion, empty states, and responsive breakpoints.  <!-- status: closed; evidence: 07e2c7af + 326d1cc7; receipt in L10_MINIMALISM.md. RULE C 16 of 16 on Settings and Media Center (Video). Two real repairs: the 58px collapsed Media rail set display:none on every destination's name wrapper, so 8 of 11 controls lost their own name at an 800px .mc-root (unnamed 2 -> 0, name-lost 8 -> 0, rail pixel-identical); and the shell reconciled synchronously on every search keystroke (cat2 worst input 85.1 -> 8.9 ms, per-keystroke ~20-26 -> ~2-4 ms, overBar100 0 on three consecutive runs). The 129.9/145.9/134.8 ms FAIL banked overnight did NOT reproduce on the same HEAD next session — 85.1 at the same base 79/32 — so it was desk load, and the real cost was a surface sitting ON the bar rather than over it. cat7 x2 PASS at a measured 16.7 ms session ceiling, never L0's 10.0 -->
- Ensure the command palette and search expose moved secondary/expert actions.  <!-- status: closed; evidence: 9c117226 + 74628bbc; receipt in L10_MINIMALISM.md. Palette exposed 0 of 160 registry entries despite its own header claiming otherwise; now cat6 10/10 with a live sweep of 129 of 129 entries agreeing with the gate the registry declares (124 present, 5 withheld), controls discriminating on the discovery AND theme axes plus a commands-mode control. cat5 FAILED first at 10/10 only after the fix: results landed 7,438 px below the fold because this renderer refuses behavior:'smooth' (0 px vs 7,233 px for auto, OS reduced-motion off) -->
- Confirm no feature is duplicated into competing control systems.  <!-- status: closed; evidence: 6fc47994 + 34324fb3; receipt in L10_MINIMALISM.md. RULE C 16 of 16 on Settings and Media Center (Video), 12 re-derived at this HEAD and cat2/cat7 carried from bullet 2 with the reason stated. The instrument is a MODE on cat6, scoped by the product's own catalog vocabulary (8,379 EN values) so user filenames drop out without a DOM heuristic. Two live defects, both fixed: "Media workspace" in Video's nav-rail AND app-toolbar (the toolbar copy shared the stage CTA's handler byte-for-byte and was enabled exactly when that CTA renders, so it was never the only route), and "Memory & storage" in Settings' nav-rail AND a Home quick tile that deep-links `backup` — nine of ten quick actions name the ACTION against the rail's DESTINATION, this was the exception, now `search.backup`. cat6's own `topbarActions` row had banked the defect as its contract (`acts.length === 3 && on >= 1`, both satisfied only by the deleted control) and was re-derived strictly stronger with a new liveSomewhere clause. Banked against me: cat3 on Settings > Appearance is 12/26 treated, sampled out of this bullet and open -->

Gate: one coherent workplace language with individual app character preserved.

### L11 — Accessibility, performance, and long-session hardening

- Full keyboard and screen-reader pass.  <!-- status: closed; evidence: d517de7e + this turn; receipt in L11_HARDENING.md. RULE C 16 of 16 on Settings and Media Center (Video), 14 re-derived at this HEAD and the 2 cat7 cells carried from L10 bullet 2 with the reason stated. The instrument is a MODE on cat1 (`--mode keyboard`) that presses a real Tab through the bridge and scores traversal AND naming, which is both halves of this bullet. Two defects: Settings search was MOUSE-ONLY — its 16-shortcut panel closed on the input's own onBlur, so a Tab unmounted the panel under the option the browser had just focused (1 of 16 items keyboard-reachable, 16 of 16 by mouse); closing now belongs to focus leaving the widget via relatedTarget, plus two ARIA corrections (listbox claimed in the empty-query state where the children are query-filling buttons; aria-selected tracking an arrow cursor Tab could leave behind). And cat2's scroll-trap detector scored a -webkit-line-clamp card title as unreachable content, VOIDing every Video cell — the sixth exclusion requires the full string to be RECOVERABLE from title/aria-label rather than merely clamped, mutation-proven 0->1->0. Banked against me: cat3 on Settings > Appearance is 12/26 treated, still open -->
- High contrast, zoom, text scaling, compact widths, and reduced/disabled motion.  <!-- status: closed; evidence: all 5 clauses MEASURED and all 5 PASS as of 2026-09-01; receipt in L11_HARDENING.md. Closed against the two blockers this tag itself named, each cleared with a discriminating control -- NOT against a fresh 16-cell RULE C re-run, which was not performed and is not claimed. Zoom found a real defect on every window in the shell: at 200% the LAYOUT viewport halves while windows keep authored geometry, so a 960x680 Settings window painted 1920x1360 in a 1264x821 desk and hung 776px right / 587px bottom outside it under overflow:hidden, with no scrollbar. 82c2c252 re-fits on app-zoom-changed through the product's own clampLayoutToViewport -- from STORED geometry so zoom-out is reversible, and uncommitted so the clamp never overwrites the authored size; Settings FAIL (dead 19.4%) -> PASS 10/10 (dead 6.7%), and the mutation control disables only that effect and returns the FAIL on the same probe and route. 1346cf0b repairs the text-scale token half: bigger-text scaled 3 of the ladder's 5 steps and missed --font-size-xs (201 declarations, the most-used font-size token in the app) and --font-size-2xs (86); Media reach 35% of 100 sampled text elements, layout PASS 10/10. BOTH remaining blockers cleared 2026-09-01. The text-scale number: 7e0d16be + ff977f9f took Settings reach 1.4% -> 30% -> 100% element-wise (70/70), harness floor 91.4%, and cat4 Settings still PASSES 10/10 UNDER bigger text at 960x681 / 260x170 / 1264x765. The "2,408 declarations, a whole-surface typography pass" estimate that had kept this open was ~180x too large: measured from the CSSOM rather than grepped, exactly 13 rules of the 2,374 that set a font-size govern all 70 Settings text elements -- 7 on the elements, 6 on the ancestors the other 49 inherit from (49 of 49 resolved, 0 unresolved), all in styles.css, every one default-identical with its old value as the var() fallback. d4cdc7b1 closes Media `horizontal`: the 420px strip rule made the rail's <details> a flex ROW, so its content box became shrink-to-fit at max-content and the shell clipped 35px of navigation -- at 100% zoom too, 18 of 46 window widths sampled 250..340 every 2px, 0 after; cat4 Media zoom 2.0 PASS 10/10 with a one-declaration mutation control returning the same FAIL. 530bd9cf un-caps Video by populating the harness through the page's own library tiles, and the cell then FAILED for real: `.mc-section-head > div` at min-width auto and `.mc-inspector-score-row` at repeat(3, 1fr) held 193px in a 154px pane -- Video zoom 1 now PASS 10/10, zoom 2.0 down to ONE bar, `contentGrowsNotChrome`. That last bar closed in 4d6a7ce7 and its recorded diagnosis was WRONG: it was never the fixed 288x452 .mc-video-inspector. `.mc-video-empty` was position:absolute/inset:0, contributed no height, and left `.mc-video-stage` sized by the 30px status line under overflow:hidden -- so chrome's AREA share was inflated at every size. Stacked at 560x400 the stage was 426x30 and its only control sat 158px past the bottom edge; as a one-cell grid stack it is 426x271 with the control 59px inside. cat4 Video zoom 2.0 chrome 45.1/49.9% FAIL -> 30.4/27.2% PASS 10/10, mutation control returns the exact before-numbers; Video zoom 1 and Media zoom 2.0 both still 10/10. Exact next slice is now the OTHER text-scaling affordance: Settings > Display base font moves body 14->18px and the whole ancestor chain, and 0 of 70 text elements follow, because displayPrefs.ts:173 writes --display-font-px unconditionally so the body fallback can never fire. 2d9b7266 WITHDRAWS this turn's own claim that @container lengths compare against the PAINTED size -- they compare against the zoom-adjusted one; the real trap is that a thin scrollbar is painted in device px and does not scale. Instrument is a MODE on cat4 (--zoom / --ui-request), corrections 25/25a/25b; 25a is load-bearing -- applyZoom does NOT dispatch app-zoom-changed, so a probe on it would have scored 82c2c252 as broken. FOLLOW-UP, 69026f5d: the "exact next slice" this tag named while closing is now itself closed. The OTHER text-scaling affordance, Settings > Display base font, reached 0 of Settings' 70 text elements -- re-derived on an instrument whose positive control (bigger text, 70 of 70) proves it can see movement. --display-font-px has one consumer, body, and after ff977f9f nothing on that surface inherits from body. The preference now also lands as --display-font-scale and tokens.css writes all 11 ladder steps as calc(<step> * var(--display-font-scale, 1)); profileToCss re-applies it to font-size-* because its !important declarations would otherwise switch the base font off for any pinned step. 0 -> 70 of 70; bigger text ON TOP gives 19.29px = 13 * 1.15 * (18/14), which is only reachable if the pin still rides the scale; the mutation control (ladder reverted to the pre-fix literals, base font still 18) returns the exact before-number 0 of 70, and the default is byte-identical at 11/12/12.5/13/21.6. FOLLOW-UP, dfe88361: the "STILL OPEN" clause this tag left behind is now closed too. body read --display-font-px, an absolute px written straight from the Display preference, so the bigger-text intent -- which scales the LADDER (uiCustomization.ts:697, 1.15 across --font-size-2xs..lg) and never touches that property -- moved every token and left the document's own base size at 14px. body now reads --font-size-md, which tokens.css:29 documents as the base step and which is numerically identical whenever only the display preference is set. Measured live through the product's OWN emitted declaration: default 14px unchanged; under bigger text --font-size-md 16.1px with body 14px BEFORE and 16.1px AFTER; removed again, round trip clean. MUTATION CONTROL re-imposes the pre-fix declaration as the winning rule and returns the exact before-number (body 14px), then returns 16.1px when removed inside the same /eval. --display-font-px keeps its writer at displayPrefs.ts:173, so aeroDisplayModeSync's assertions are untouched; only which property body reads changed. -->
- Drag/resize at target frame rate while media, dictionaries, and large lists are active.  <!-- status: closed; evidence: 02932db7 + this turn; receipt in L11_HARDENING.md (2026-09-01, evening) — the FOLLOW-UP at the end of this tag is the closure, the rest is bc88587a's carried history. Carried: the instrument now scores and the FIRST number exists, but the cell was VOID and the bullet did NOT close then; receipt in L11_HARDENING.md. Correction 33: --under-load had never produced a scoreable reading and all three of its VOIDs had ONE cause, LOAD_ARM re-arming a load that was still running. The re-arm interval resolved to Math.min(deadlineMs,2000)=2000 ms for every surface against a ~1800 ms gesture, so "2 cycles across the gesture" was unsatisfiable BY CONSTRUCTION; a heavy.js is not a pulse, so re-arming stacked a second interval AND wiped its own receipt (`delete window.__lqDictLoad`), which is the whole of "REFUSE: only 2 searches ran"; and scene stability used the IDLE test, which under load can only fail because the load's job is to change the surface. Fixes all harden: interval = the load's own durationMs, the dictionary stores its interval handle so a re-arm clears the previous one (leg 2 was measuring twice leg 1's load), the receipt counts REAL WORK via a new `progress` expression instead of arms, under-load stability keeps only what makes frames incomparable (window count + closed loop) and records content drift as data, and loadProof re-scales only the DURATION threshold while keeping the mojibake guard verbatim. THE NUMBER, against a session ceiling of 16.7/16.8: drag under load p50 16.7 / p95 33.4 / max 50.1 / over100 0 / mainMax 186.5, resize p50 16.7 / p95 33.4 / max 50.2 / over100 0 / mainMax 234.5, idle counterparts 16.7/16.8 and 16.7/17.0 — ZERO findings from either under-load leg, so drag and resize do hold the ceiling while the dictionary searches. Receipt "4 searches this leg, 4 distinct, entries 6-8"; workDuring 4 where cyclesDuring is 0, which settles the diagnosis. MUTATION CONTROL: progress frozen to 0 -> both legs VOID with "only 0 unit(s) of real work" while `last` still reads "searching 28 words", i.e. the load armed and the OLD counter would have passed it; probe restored sha256-identical. STILL OPEN on two things that are not the under-load legs: the IDLE resize leg came back UNSTABLE (2 of 5 repeats breached, idle max 343.3 ms this session vs 11.4 ms an hour earlier — noisier machine, re-run before calling it a surface defect), and the heavy leg reports main blocked 1182 ms, over the 500 ms bar. The earlier 5114.8 ms was inflated by the stacked intervals this commit removed; 1182 ms is the honest figure and is still 2.4x the bar on a surface whose search is supposed to be off the main event loop. RULE C: 0 of 16 cells banked for this bullet — cat7 dictionary is the only one attempted and it VOIDed. sampled-out: nothing yet, the second surface (library) has not been started. FOLLOW-UP, 02932db7 + this turn — BOTH blockers this tag named are cleared with controls, and all three loads the bullet's words name are measured under load. The 1182 ms was never the query: re-derived on the receipt's own instrument (/health round-trips, which run on main) against the old binary, the session's first search held main 11,525 ms, one dict:frequency 6,836 ms, one dict:examples 7,796 ms, while the same calls warm took 45-260 ms — every dictionary read ran synchronously on main through better-sqlite3 over a 537 MB file under a 256 MB mmap, and on this memory-pressured machine (1.2 GB of 30 GB free, main 190 MB working set against 659 MB private) an evicted page was a fault taken inside the call; warmup.ts pays that once per boot and eviction takes it back. 02932db7 moves the seven reads (the lookup and the six expansions) into a utility process on its own handle — the import worker's own bundle, no forge change — behind a client that answers a crashed worker's reads in-process, gives up once out loud, and never waits forever; collocations (it writes), the batch frequency read and the interlinear read stay on main and say why; 12 unit cases. After, same instrument, fresh process: first search 8.7 ms worst on main with entries at 338 ms; with the file cache evicted (tools/evict-file-cache.ps1, standby 1,094 -> 3,060 MB) a dict:examples read took 1,225 ms IN THE WORKER while main's worst sample was 9.6 ms — the work is as slow as ever and main no longer knows. cat7 --under-load, strict OFF, ceiling clean on every run, sensitivity control 12-13 frames over 100 ms on every run: dictionary PASS 10/10 (heavy max 1182 -> 9.0 ms over 667 samples of 28 real searches; drag/resize under load p95 33.4 -> 16.8 ms, mainMax 186.5/234.5 -> 12.0/12.1; idle resize max 343.3 UNSTABLE -> 8.9 stable; 3 searches across each gesture), flashcards PASS 10/10 (the 331,582 px VirtualList — the largest list on this profile; 91 scroll ticks across each gesture, mainMax 12.6/12.1), music PASS 10/10 (four sort modes cycled in its own window; 48 sorts across each gesture, mainMax 10.7/12.0). Two instrument corrections, 21 probe lines: a progress receipt for every scrollAll spec and for music — without one a ~1.8 s gesture can never see a whole load cycle and the leg VOIDs by construction, which flashcards and music both did on their first run while `last` proved the load was running. Closed against the blockers this tag named plus the two unmeasured clauses, each with a discriminating control — NOT against a fresh 16-cell RULE C re-run, which was not performed and is not claimed (the precedent is bullet 2's closure above). Named, not done: initYomitan still parses 162 MB of legacy JSON synchronously on main at BOOT; the video heavy leg has had no load since 4d6a7ce7 removed the shelf overflow it swept; every other non-dictionary, non-scroll, non-music spec still lacks a progress receipt. -->
- Blur fallback, GPU-loss recovery, multi-monitor, restart persistence, and long-session memory checks.  <!-- status: closed; evidence: ALL FIVE clauses closed; receipt in L11_HARDENING.md (2026-09-01, latest). CLAUSE 5, LONG-SESSION MEMORY, IS NOW CLOSED and the previous turn's diagnosis was exactly right: the blocker was an INSTRUMENT limit, not a leak. /mem runs gc() in MAIN's isolate and cannot collect a renderer heap, so a Liquid clause scored on it credits a process the code is not in. PRODUCT, this turn: a /rmem route on debugBridge.ts over the same CDP session /emulate already uses -- HeapProfiler.collectGarbage, then Runtime.getHeapUsage and Memory.getDOMCounters -- returning the before/after pair so the collection is falsifiable, and detaching only a session it opened itself and only when /emulate holds no override on that webContents. INSTRUMENT: a --long-session MODE on cat7-perf.cjs (correction 34) under RULE 1, reusing its refusals, bridge client and retry policy; --churn adds a per-cycle mount/unmount round trip driven through the window's own title-bar controls. COLLECTOR CONTROL, armed AND fired, which is the whole difference from the previous attempt: a 1.2M-object plant plus a 20,000-span detached subtree moved the renderer heap 115.1 -> 147.4 MB (+32.3) and nodes 3,056 -> 43,057 (+40,001, exactly 2x20,000 spans-and-text +1 div), and after delete plus one collection came back to 115.1 MB and 3,056 nodes, byte-identical to base. THE FIRST SURFACE VOIDED AND THAT IS A FINDING: Dictionary toggle-only ran clean (nodes 1,379 flat x12, documents 1, listeners 684 flat, heap +0.1 MB) and it means almost nothing, because the mean per-cycle difference between the liquid and standard halves is 0 nodes and 0.0 MB -- Liquid presentation on an already-open window is CSS-only, so "nodes flat" was true of a cadence that never allocated a node to prove it. --churn on Dictionary then VOIDed at a 13-node delta: that window is 30 elements in its empty state, the smallest on the desk, measured directly (3 windows = 1,379 nodes, 2 = 1,366, 0 = 261 after collection). THE CLOSING NUMBER is Flashcards, the densest window on this profile at 874 elements, 12 churn cycles, each opening it, making it Liquid, returning it to standard and closing it: per cycle it really mounts and unmounts 1,661 DOM nodes, 203 listeners and 8.1 MB of heap (closed 1,395n/684L/106.6 MB <-> open+liquid 3,056n/887L/115.1 MB), and across cycles 1 -> 12 with both samples taken CLOSED and both after a forced collection, nodes 0, listeners 0, documents 0, heap +0.2 MB, main privateMb 436.2 -> 436.2 and detachedContexts 0 -> 0. Receipt: 12 liquid observations, 0 windows still liquid after a standard half, peak 4 .fwin / 1,587 elements, 0 refusals. growthAcrossCycles exists because growth is the wrong pair in churn mode -- the baseline is taken with the surface OPEN and the run ends CLOSED, so a clean run reports -1,661 nodes. CARRIED HISTORY BELOW. 4 of the 5 clauses closed, ONLY long-session memory left; receipt in L11_HARDENING.md (2026-09-01, late night). CLAUSE 3, MULTI-MONITOR, IS NOW CLOSED with TWO defects found and fixed. The handed-down prediction (onMove never updates presentation.standardRect) was half right and acting on it literally would have been WRONG -- liquidWindowSnapshotFidelity.test.ts:97 already REQUIRES the move to carry standardRect through unchanged, so the hole is one layer down in the fit that runs when the layout arrives. DEFECT A, a09a4527: clampLayoutToViewport fitted the live rect and NEITHER restore target, so a window was on-screen right up until the user pressed one of the two controls that put it back. This profile own desktop 4, authored 880x393, opened in a 642x385 desk window: the maximized scraper clamped correctly to 642x385, then its own Maximize button restored the untouched restoreRect 820x580 at (94,54) -- 272px past the right edge, 249px past the bottom, overflow:hidden, scrollWidth 914 vs clientWidth 642, no scrollbar, resize grip gone -- and it PERSISTED, the desk committing that 820x580 window into a desk it re-authored as 642x385. AFTER: 642x385 at (0,0), overflow 272/249 -> 0/0. One fitRect bounds live rect, restoreRect and presentation.standardRect identically; identity-preserving, so a byte-for-byte no-op on any layout that was never cross-monitor, asserted as one. DISJOINT MUTATION CONTROLS: reverting only the restoreRect line fails exactly 2 of 13 cases and both name restoreRect; reverting only the standardRect line fails exactly 2 and both name standardRect; the identity and adds-no-key controls stay green under both. DEFECT B, 9d66ddf5: the neighbour ring contained monitors that are not plugged in. syncDesktopWindows KEEPS an assignment when its monitor is unplugged and only stops giving it a window (main/desktopWindows.ts:303), and nothing downstream re-checked -- displayList() returned 3 attached against a store holding 8 assignments, 3 enabled, exactly 1 of them attached, and that one is this display, so next-monitor resolved to desktop 0 on a display that is not there. deskwinFocusDesktop answered {ok:false} for all three enabled targets (0, 3, 6) and TRUE for 4 and 1 which really were on screen, a positive control on the exact call, and onMove voided that answer AFTER removing the window from the desk. OBSERVED END TO END on the pre-fix binary: desk 1 window -> 0, browser windows stayed at 2 so nothing opened, window committed to desktop 0, gone silently. AFTER-A: 1 before, 1 after -- the ring collapses to one key and the command correctly does nothing. AFTER-B with a real neighbour (enabling display|1920x1080|1#2, desktop 7, which made syncDesktopWindows create its desk window at x=2720): source desk [] and target desk [Dictionary], re-run after the extraction with Grammar giving [Dictionary, Grammar]. The ring moved to monitorRing.ts because inside the shell it is unimportable under vitest, which is why only a machine with the wrong monitors attached ever noticed; showDesktop now OPENS the target when nothing shows it (deskwin:openDesktop, the tear-off own path) instead of focus-or-silence; 9 cases fixtured on the real assignments and the real attached keys, with the BEFORE ring pinned as a case. Everything restored: desktop-layout.json byte-identical to the pre-turn sha256, assignments byte-identical, app SIGKILLed and restarted (pid 40756). CARRIED HISTORY BELOW. 2 of the 5 clauses closed with live evidence and controls, 3 untouched, so the bullet stays OPEN; receipt in L11_HARDENING.md (2026-09-01, night). BLUR FALLBACK, 24f7dfc4: the OS preference prefers-reduced-transparency had exactly ONE reader in the app (views/mediaCenter.css:6792) and reached no Liquid token, no shell surface and none of the shared --glass-blur/--blur-* ladder -- the transparency half of the pair liquid-tokens.css:215 already fixed for MOTION. Second defect, same root: the shipped in-app `off` removed only the BLUR (styles.css:1321, !important) while --glass-tint stayed at 72%, a SHARPLY see-through taskbar, which mediaCenter.css:6812 itself calls the worst of both. Measured through the bridge's /emulate (CDP Emulation.setEmulatedMedia, so matchMedia really flips): Media Center's blurs 24/18/22px -> none as the positive control that the query re-evaluates at all, while --lq-liquid-blur 8px, --lq-ambient-blur 6px, --glass-blur 8px, --blur-md 6px, saturate 1.25 and the painted .os-taskbar `blur(8px) saturate(1.25)` over `color(srgb ... / 0.72)` were byte-identical. After: all 0px, saturate 1, tint #1a1823, taskbar `blur(0px) saturate(1)` over opaque rgb(26, 24, 35); clearing the emulation returns every value. SPECIFICITY WAS LOAD-BEARING and the first version was WRONG -- a bare :root is (0,1,0) and loses to [data-perf='performance'] (0,2,0) which sets this very ladder, so --glass-blur stayed 8px; qualified on [data-display-transparency='full'] it is (0,2,0) and last. MUTATION CONTROL via CSSOM in the live renderer: deleting exactly the 2 rules returns 8px/6px/72%/1.25/8px/6px and re-inserting restores them identically. GPU-LOSS RECOVERY, df9d9a71: theme/perf.ts is a saved user preference with NO hardware detection, so a software-rasteriser machine still asked for 8px of blur everywhere and a GPU-process death changed nothing -- main's only GPU-adjacent code was main.ts:708's render-process-gone log, a different process. theme/gpuFallback.ts writes data-gpu software|lost and both sheets flatten the same tokens with the same opaque values (the 4th and 5th triggers to reuse them). LIVE on the real WEBGL_lose_context against the real shipped detector, machine reporting a healthy ANGLE (AMD, AMD Radeon 780M, D3D11): HEALTHY data-gpu null / 8px / 6px / 8px / 72% -> LOST (isContextLost true) all three blurs 0px, tints #1a1823, taskbar opaque rgb(26, 24, 35) -> RECOVERED (restoreContext) every value back, roundTripClean true. Reversibility only works because the handler preventDefault()s the loss event. THE INSTRUMENT WAS BLIND, which is why both went unnoticed: liquidTokens.test.ts derived triggers from [attr]/.class qualifiers on the root, so a trigger the PLATFORM owns has none and cannot be seen; the new block parses @media by brace matching, and its TEST CONTROL (condition rewritten to a name nothing answers) fails 3 cases with both sheets restored sha256-identical. A NUMBER AGAINST ME: every trigger grades TOKENS, and across the 15 CSS files that paint glass only 66 backdrop-filter declarations are token-driven; 88 are hardcoded pixels reached by NOTHING (styles.css 38, aero-shell.css 14, readingGarden.css 6, aero-apps.css 5, mediaWorkspace.css 4, mediaCenter.css 4, readingLens.css 3, scraper.css 3, wired-shell.css 3, shell.css 2, multiMonitor.css 2, +4 singles), so 57% of painted glass ignores all five triggers. NOT fixed by a `:root[state] * { backdrop-filter: none !important }` catch-all on purpose: those surfaces carry hardcoded rgba() backgrounds, so dropping only their blur manufactures the exact worst-of-both state clause 1 exists to prevent, on 88 surfaces at once. NOT DONE and the reason the tag is open: multi-monitor (needs a second display this machine does not have; f5b664ff and L4's 2026-08-22 detach/reopen are prior art to re-derive against, not inherit), restart persistence, long-session memory. CLAUSE 1 IS NOW CLOSED, b3b1cc07 -- the hardcoded half. The 66/88/57% above was a DECLARATION grep and is superseded by a mechanical RULE count over every tracked .css file (debug/_bf-count.cjs): 35 token-driven, 61 hardcoded, 17 `none` resets, 64%. theme/flatten.ts ORs the six states into one derived data-lq-flat attribute via a MutationObserver on the six root attributes (five different modules write them, none share an event); theme/flatten.css carries the 60 product conversions under it, the 61st being a dev-only harness sheet. Four treatments, because the wrong one manufactures the very defect clause 1 exists to prevent: MATERIAL composites the authored tint over an opaque base, SCRIM drops only the blur where seeing through is the point, OPAQUE TINT takes a surface's own colours to alpha 1 where the backdrop is app-drawn imagery, BLUR-ONLY where the stack already ends opaque. THE CATCH-ALL WAS REJECTED ON A LIVE MEASUREMENT, NOT AN ARGUMENT: perf.css:46 already is exactly that shape over 18 enumerated selectors with !important and no tint, and under data-perf='battery' with flatten.css disabled .widget-frame paints `none` over color(srgb .../0.72) -- blur gone, transparency kept, the sharply see-through panel mediaCenter.css:6812 names, shipped in the tree; the mutation control is what found it and this commit repairs it. LIVE, running renderer, 16 probe surfaces built with their REAL ancestor chains (--mini-surface, --lock-surface and --lens-bg are inherited, so a flat probe measures rgba(0,0,0,0) and lies): data-perf performance -> battery flipped data-lq-flat false -> true and all 14 glass surfaces went blur(4..22px) over a translucent tint -> none over an OPAQUE base (--panel rgb(26,24,35) / --bg rgb(13,12,18)) with the authored tint intact as a gradient layer, while the 2 SCRIMs kept their authored alpha byte-identical and lost only the blur, and both negative controls (.fwin, which has no hardcoded blur, and a class with no rules) were unchanged. MUTATION CONTROL: disabling exactly the one stylesheet carrying [data-lq-flat] rules, attribute still set, returned 12 of 14 to byte-identical pre-flatten values -- the 2 that did not are the two perf.css already half-handled. Re-enable and restore data-perf: 16/16 byte-identical, probe host removed, nothing persisted. flattenCoverage.test.ts (17 cases) re-derives the census FROM the sheets on every run rather than from a written list, with a positive control (>40 rules found, `.dict-popup` present) and a mutation control (deleting one conversion is detected, and only that one). CLAUSE 4 (RESTART PERSISTENCE) IS ALSO CLOSED, this turn, with no product defect found -- recorded because an unmeasured clause and a measured-clean one are not the same thing. Through the product's own paths only: os:open, then os:window/togglePresentation, which is exactly what keyboardShortcuts.ts:1541 reduces the palette command to; then SIGKILL rather than a graceful quit (Stop-Process -Force on the Electron main and its forge parents), so the test cannot pass on state flushed at shutdown; then npm start, new pid 51880. standard on disk {id:dictionary,x:60,y:24,w:820,h:580,z:12,visible:true} -> liquid adds presentation{v:1,mode:liquid,standardRect:{60,24,820,580},standardMaximized:false} -> after the kill and restart the window renders data-presentation=liquid and the persisted window is BYTE-IDENTICAL to the pre-restart JSON. DISCRIMINATING CONTROL: the same comparison against the PRE-toggle blob returns false, so the reader can tell the two states apart. REVERSE TRANSITION: togglePresentation again returns the persisted window byte-identical to the pre-toggle standard blob, so reversibility survives the restart too. The reader host was measured by the same kill without being set up for it -- lq.reader.presentation came back holding book and manga at mode:liquid with standardRect {320,86,1280,860}, the real OS rect, not the {0,0,1,1} liquidWindowPresentation.ts:80 records as having once reached the store. NOT measured and named rather than implied: the pop-out host, whose key was absent because no pop-out was open. desktop-layout.json restored byte-identical to the 4,824-byte pre-slice copy, globalZTop included. CORRECTION, and it unblocks a clause: multi-monitor DOES NOT need a second display this machine lacks. That claim has been stale since 2026-08-17, when the user approved a virtual display driver in chat and ~\.claude-runs
eeds-user.md:138 recorded the blocker CLEARED; nobody re-read it. Re-derived live tonight: three displays attached (DISPLAY2 primary 1920x1080 at 0,0; DISPLAY6 virtual 800x600 at 1920,0; DISPLAY1 1920x1080 at 2720,0) and THREE assignments already enabled:true in desktop-layout.json (desktops 0, 3 and 6), which is what DesktopShell.tsx:1267 neighbourDesktop() requires -- so os:move-to-monitor is live with no persisted-setting patch. Not measured tonight because the return leg must be driven from the other desk window, which is a slice rather than a tail-of-turn errand. THE PREDICTION TO TEST FIRST, from source and not yet confirmed live: onMove at DesktopShell.tsx:1279 sends {...winToSnapshot(top), x:40, y:40}, and winToSnapshot does carry presentation through, but the forced x/y does NOT update presentation.standardRect -- so return-to-standard on the far monitor restores a rect authored for the display it left, and DISPLAY6 is 800x600 against a standardRect of 820x580. STILL OPEN: clauses 3 (multi-monitor, now measurable) and 5 (long-session memory). RULE C: 0 of 16 cells banked, none claimed -->

Gate: no regression against L0 performance and interaction baselines — scored as rubric
category 7, measured after a real restart, not asked of a human.

### L12 — Visual certification and release handoff

- Run every app’s standard/Liquid/theme/state screenshot matrix.  <!-- status: closed; evidence: 2026-09-02, this turn, on top of a02f54da/fa5c6718/6f7a862f/449935f5. THREE RUNS, all four axes swept, receipt in `src/.coordination/liquid-workplace/L12_VISUAL_CERTIFICATION.md` (2026-09-02 section) and three committed manifests under `baselines/`. (A) `l12-matrix-normal.json` -- ALL 25 canonical `DESKTOP_WIN_SECTIONS` x 13 live themes x standard/liquid x normal = **650 cells, 611 captured, certifiable:true**, controls C0-C5 ALL PASS with magnitudes: floor **0.000% of 475,600 px at max channel delta 0** (so byte-identity is the right gate, not a tolerance), theme 97.931% of pixels over delta 8, presentation 35.445%, app 74.149%, state scored geometrically 475,600 -> 966,960 px, **ratio 2.03**. (B) `l12-matrix-maximized.json` -- the STATE axis actually swept, 25 apps x 2 extreme themes x 2 presentations x **maximized** = 100 cells, 90 captured, controls all pass. (C) `l12-matrix-tries40.json` -- a control, `certifiable:false` and it says so. EVERY FAILURE IS EXPLAINED AND NONE IS A CAPTURE FAILURE: all **39** in (A) are `visualizer`/`musicwidget`/`city` x 13 themes x liquid -- those three sections **offer no presentation toggle of their own**, so 22 of 25 are presentable and that is a product fact this matrix now records; (B) adds 4 where `note` has no maximize control (frameless chrome). THE 68 UNCONVERGED CELLS, and TWO explanations were measured and DISPROVED: "those surfaces never settle" is false -- driven ALONE, Statistics liquid traces `ABBBCCCCCCCC` and Agent liquid `ABBBCCCCCCCCCC`; "the 12-frame budget is too small" is false -- run (C) repeats oled-black/liquid on the SAME 25-window desk at `--tries 40` and every cell that converges converges in <=12, while the four that do not burn all 40 frames at **streak 1**, no two consecutive frames ever identical over 12 s. What is left is the SCENE: run (B) had **0 of 90** unconverged because a maximized window covers the desk, and run (A)'s own opaque control agrees -- `agent` at oled-black converges in standard and is streak-1 in liquid, same desk, same theme. So a translucent Liquid surface composites whatever moves behind it: byte-identity is reachable for every surface here but NOT for a translucent one over a live desk. That is a certification constraint, not a defect; 68 of 611 = 11.1%, each named in the manifest and listed first in the atlas. `--tries` was ADDED to the harness for exactly this question, because `converged:false` has two causes and 12 attempts cannot tell them apart. Restore measured not asserted: theme back to `study-os`, caret freeze removed, 0 windows / 0 dialogs left, `desktop-layout.json` sha256 **9DFB6E2F2361...**, byte-identical to `debug/_bk-layout-pre.json`. PNGs stay in gitignored `debug/shots/l12-matrix/`; only the manifests are committed. CORRECTION 2026-09-03 (primary2), and it RETRACTS the numbers my own previous correction put here. That earlier text said `2b5a73cf` moved presentability "22 of 25 -> **23 of 25**" and the unavailable cells "39 -> **26**". BOTH WERE WRONG, and they were wrong because they were computed off the COMMITTED matrices while the live evidence had already moved past them. Re-derived this turn from the manifests themselves, not from prose: `l12-matrix-normal.json` (02:51Z) reads `appsPresentable` **22**, but `normal-v2` (15:34Z), `maximized-v2` (16:09Z) and `normal-v3` (21:23Z) all already read **23** -- and the 23rd is **`musicwidget`**, not `city` (set-differenced app-by-app off the two manifests' `apps` blocks). `2b5a73cf` landed 2026-09-03T02:10Z, AFTER all three, so city is not in any of them. The true figure is therefore **23 -> 24 of 25**, and the unavailable total **91 -> 78**, not 39 -> 26 (39 and 91 are different artifacts' numbers and the earlier text conflated them: `l12-atlas-final-v2.json` reports 91 = **39** `note`+`city` no-maximize + **52** `visualizer`+`city` no-presentation-toggle). MEASURED, NOT PREDICTED -- two targeted sweeps on a scratch instance serving THIS worktree (pid 42468 / port 39274, Vite 5174 verified to serve `return section !== 'visualizer';` before starting): `l12-matrix-city-normal-v1.json` (sha256 `388d283a28e8cf7e67ab...`, runId `l12-cal-city__20260903T030257Z__14648`) = 26 cells / **26 captured** / `appsPresentable` 1 / 26 distinct images, i.e. city's 13 liquid cells that were `unavailable` are now CAPTURABLE; and `l12-matrix-city-maximized-v1.json` (sha256 `b758671853bd7bb4fb6f...`) = 26 cells / **0 captured / 26 `stateBlocked`** / `appsPresentable` 1, i.e. city's no-maximize gap grows 13 -> 26 cells because it now has a second presentation to be blocked in. Net -13 on `unavailable`: 91 - 13 = **78**, attainable 1,209 -> **1,222**. Both manifests are gitignored by `.gitignore:235` (`src/.coordination/**/*-matrix*.json`), so the sha256s above are the checkable artifact, as with every other v2/v3 manifest this bullet cites. WHAT IS STILL OWED, stated with its measured cost so it is not mistaken for done: the arithmetic above is composed from the published atlas plus two targeted runs, NOT re-derived by a single `l12-atlas.cjs` pass, because that pass re-hashes every indexed plate from disk and `normal-v3`/`maximized-v2`'s 1,209 plates live in the MAIN tree's `debug/shots/`, not this worktree's. A self-contained re-derivation needs both 650-cell sweeps re-captured here; calibrated on the city run at **3m17s for 26 cells**, that is roughly 40 min per state axis plus the atlas. It is named here so the composed number is never quoted as a fresh atlas run. -->
- Close every feature-ledger row.  <!-- status: closed; evidence: 2026-09-01, f2619b91 + this turn. `parity-ledger.json` moved 44 `both` / 6 `pending` -> 45 / 5; receipt in PARITY_LEDGER.md (2026-09-01). ALL SIX pending rows were `mediaWorkspace` and all six recorded the SAME blocker, measured 2026-08-25: the Media workspace is a full-screen overlay at `body > div > .seanime-host`, outside every `.fwin`, with no window chrome, no Make Liquid control and no `data-presentation`, so per-window presentation state could not reach it AT ALL. Six of fifty rows, one cause -- an enable flow whose destination does not exist, the same defect the pop-out and the reader each fixed one host earlier. f2619b91 makes it the FOURTH host (`renderer/workspacePresentation.ts`): interior only and never the frame, because `.seanime-host` is `inset:0` and opaque ON PURPOSE -- its own styles.css rule records that everything below it must be HIDDEN rather than merely behind, so a translucent root would put the desktop grid back on screen underneath an `aria-modal` dialog. Row 8 (segment navigation) CLOSES, driven live in Liquid through the product's own controls: Library -> Readiness hid the pane (display block -> none, `hidden` set, box 1264x774 -> 0x0) with `#media-workspace` AND `.study-player-slice` still MOUNTED, and back restored 1264x774 EXACTLY; the presentation round trip is byte-identical over 18 properties by `-ceq` including storage (null -> blob -> null, the key REMOVED rather than stored as `standard`). THREE MUTATION CONTROLS, each naming exactly the right case, files restored byte-identical: workspace dropped from every `:is()` -> 2 failed; bar reverted to a bare `<header>` -> 1; opt-in class join dropped -> 1. NOT CLOSED and the reason the bullet stays open: (a) rows 7, 9, 10, 11, 12 have their destination now but no SUBJECT -- `seanimeStudyLibrary()` returns `{ok:true,files:[]}`, the media server has scanned 0 files here against the 77 the standard halves used, and a row measured only on an empty harness is capped rather than skipped; (b) the ledger's own `notWritten` still names 19 root components with NO rows written at all, plus note/visualizer/musicwidget which have no baseline. This bullet's words are "every" row, so 45 of 50 written rows is not it. UPDATE 2026-09-02 (primary2), 33b3a10b: THE 19 UNWRITTEN COMPONENTS NOW HAVE A WRITER, which is the half of this bullet that was never going to close by hand. `l6-parity-write-rows.cjs` is hand-written and its own header admits every `observed` string was copied out of a console log one row at a time; that covers 5 apps against the 24 l6-parity.js declares SPECS for, and transcription is the ONLY step of the chain with no control on it -- nothing here could tell a mistyped `rows=2410` from the real one. `probes/l6-parity-rows.cjs` splits the halves by construction: MEASURED fields are copied verbatim out of a cat6 run's `rowEvidence` (new field, same commit) and `control.mutations`, and the writer never composes a number; AUTHORED fields (feature/currentRoute/keyboardRoute/dataStateOwner + the two destinations) live in `parity-row-metadata.json`, and a spec row id with no entry there REFUSES BY NAME rather than being written with an invented route. `status` is derived too, including `REGRESSION` when a row is reachable in one presentation and not the other. FOUR REFUSALS FIRED, ledger byte-untouched after each: the first against a REAL banked artifact (cat6-notebook-final-20260827, a genuine PASS 10/10) which predates `rowEvidence` and is refused rather than written with an empty `observed`; the other three reach later branches from that same artifact used as a labelled FIXTURE, not presented as a measurement -- no metadata block for "notebook", a VOID verdict writing nothing, an unknown row id refused by its own name. The dictionary metadata block is copied MECHANICALLY out of the seven dictionary rows already in the ledger, in the spec's id order, by a node read -- so it doubles as a REGRESSION TEST: the first live cat6 dictionary run must re-derive those six features and add ZERO rows, and if it adds one then the derived and hand-written halves disagree and one is wrong. NOT a new single-use probe (RULE 1): it makes an existing single-use script generic over every app cat6 can drive. STILL OPEN and unchanged in substance: 0 rows written so far -- the writer is landed and UNARMED until a live cat6 run banks a `rowEvidence` artifact -- and rows 7/9/10/11/12 still have no SUBJECT because `seanimeStudyLibrary()` returns an empty file list here. UPDATE 2026-09-02 (primary2), ff63d811 + 1ec440ab + ba0d1070 + e272640b + 2ce489d4: THE WRITER IS ARMED AND ARMING IT FOUND A DEFECT IN THE INSTRUMENT, NOT IN THE WRITER. Ledger 50 rows / 7 apps -> **62 rows / 9 apps**, 57 both / 5 pending; notWritten 19 -> 17 root components. The opening slice was 'add ZERO' and the live run came back FAIL: lookup unreachable at chars=275 nodes=47, resultActions at actions=0. The SAME window through the SAME expression after the run read chars=2345 nodes=262 hasTaberu=true actions=20 -- both rows live the whole time. A FIXED SLEEP IS NOT A SETTLE: step() returns as soon as it has clicked, and the two parity checks are not simultaneous, so standard can read pre-resolve while liquid reads post-resolve. That is a FABRICATED PARITY REGRESSION, and REGRESSION is a status this very writer would have written into the ledger. settle() now polls chars|nodes|controls until two consecutive reads agree, before the parity check and before each round-trip snapshot; it excludes fields on purpose, because fields are what the round trip COMPARES and settling on them would make the instrument wait for its own answer. DISCRIMINATING CONTROL, deterministic via --step-ms 0 so it does not depend on a cold DB, same window and profile, only --settle-tries 0 differing: OFF -> standard 5/7 vs liquid 7/7, FAIL on all three bars; ON -> 7/7 vs 7/7, PASS 10/10, zero round-trip diffs, and the settle's own trace 275|47|16 -> 2345|262|50 -> 2345|262|50 is the proof it waited. --settle-tries 0 DROPS the bar term rather than scoring it false, because zero tries can never converge and failing a control by arithmetic proves nothing. Naturalistic rate, not an adjective: the race bit 2 of the first 3 runs and 0 of the 6 after -- a COLD-START race, which is why it survived every previous cat6 run. WHAT WAS WRITTEN: dictionary 7 rows / added **0** (the zero IS the test -- the dedupe key is app|feature, so one mistyped feature string writes an EIGHTH row instead of matching, which means 0 also certifies all seven authored strings match the hand-written ledger verbatim); calendar 5 / added 5 and settings 7 / added 7, both authored from SOURCE with every currentRoute naming the selector the spec's own f() reads. A FALSE CLAIM IN parity-row-metadata.json WAS CORRECTED RATHER THAN LEFT: it said the dictionary windowLifecycle row 'has NO spec id and is deliberately absent' -- l6-parity.js declares { id: 'windowLifecycle', f: lifecycle } for EVERY app and the run refused by that name. Writer self-control 6 armed / 6 fired. NOT A DEFECT, checked: Settings' drive log shows closeSearch -> expanded:'true', but the same input afterwards reads expanded:'false' with no panel -- the step reads the attribute in the SAME synchronous /eval as the keydown, so its RETURN VALUE is one render behind while the product is correct. STILL OPEN, and exactly this: 15 of the 24 specs still have no metadata block, and the 5 pending rows are still mediaWorkspace's -- destination now exists, SUBJECT does not, because seanimeStudyLibrary() returns {ok:true,files:[]} here. Receipt: PARITY_LEDGER.md, 2026-09-02 section. UPDATE 2026-09-02 (primary), this turn: **45 -> 47 `both` / 3 `pending`, and the blocker that held all five was CLEARED BY RE-CHECKING IT.** The standing instruction to re-check parked blockers each turn paid here: `seanimeStudyLibrary()` returns ok:true with **80 files** against the `{ok:true,files:[]}` measured on 2026-09-01, and the sidecar's own log names why -- status `ready`, three watched directories, "Library size updated: 48 GiB". The needs-user entry was DELETED, not amended. Two rows driven end to end in BOTH presentations on the overlay's own host: `Open a study-ready file` (view segment Readiness -> Library, `.study-player-slice` 0x0 -> 1264x821, `<video>` 0 -> 1, identical in Liquid) and `Readiness category filters` (79 -> 1 row on `Ready`, the same single Big O row, and 79 + 1 = 80 reconciles with the library call). SCORED BY THE SHARED HARNESS RATHER THAN BY HAND, which is the part that generalises: `l6-parity.js` gained `mediaWorkspace` and, with it, the resolver arm that finds this surface at all. `check('mediaWorkspace')` returns **2/2 reachable, 0 na, in both presentations** with identical evidence strings, host `workspace`; the round trip standard -> liquid -> standard is byte-identical (chars 31515, nodes 4639, controls 700); and both mutation controls fire on exactly their own row and restore. THE OTHER THREE ROWS STAY PENDING AND THEIR REASON CHANGED, which is recorded in the rows themselves so the old reason is not left standing as a fact: the transcript rail needs a loaded subtitle track (panel honestly empty, "No subtitle track is loaded.", with the video mounted) and the two detach rows need the Study Block menu driven. Neither was driven; neither is claimed. (a) and (b) below are both unchanged. UPDATE 2026-09-02 (backup), 321d5f63: **47 -> 49 `both` / 1 `pending`, and the two rows that closed did so by finding a defect rather than by confirming one.** The Study Block menu was driven for the first time -- Readiness -> `Ready` -> Open -> `Toggle study controls` -> `Customize workspace` -> the Transcript block's `⋯` -- in BOTH presentations. ROW 12 (detach and return) is symmetric across presentations in every number: /health 1 -> 2 windows, the new one at 730,106 460x820 on `/?studyBlock=transcript&surface=workspace`, the panel out of the host and back at 384x424, host still `workspace-liquid` throughout the Liquid half. ROW 13 (send to another monitor, restore across close/reopen) FAILED FIRST, and the reason is that the 2026-08-22 evidence had exercised the OTHER of two paths: it MOVED an already-open window, through the `moveToDisplay` handler that calls `rememberBounds`. The route a user takes -- `Send to display` on a block that is still docked -- means "detach it THERE" (`useStudyDetach.sendToDisplay`), so it goes through `openStudyBlockWindow(..., displayKey)`, which recorded nothing: `moved`/`resized` never fire for the rectangle a window is CONSTRUCTED with, and `rememberBoundsFromCacheOnClose` bails on a key the cache has never seen. BEFORE: placed 2090,20 460x512, reopened 730,106 460x820 on the PRIMARY. AFTER 321d5f63, app restarted because main does not hot-reload: 2090,20 460x512 -> close -> 2090,20 460x512, in standard AND in liquid, all four numbers. 2090,20 460x512 is `centreOnWorkArea` derived rather than assumed -- x = 1920 + (800-460)/2, height = min(820, 552-40) = 512, y = (552-512)/2 = 20 -- on a real three-monitor desk where `displayList()` reports every entry `virtual: false`. Unit ratchet plus mutation control in the fix's own commit: 23/23 with it, 22 passed / 1 failed with its one line commented out. CORRECTION CARRIED FORWARD RATHER THAN BURIED: 321d5f63's message claims the store file was "ABSENT before and after"; every node read of that path this turn was VOID (shell escaping collapsed `process.env.APPDATA + "\\jp..."` to `Roamingjp-study-app...`), so only the first PowerShell check stands -- but the finding never rested on it, because `openingBounds` returns a saved rectangle whenever one exists, making a primary-centred reopen the discriminating measurement on its own. THE BULLET STAYS OPEN on its own word "every": one row is still `pending` and its reason changed for the third time -- not the empty library (cleared), not the undriven menu (cleared here), but that the transcript rail has no CUES because the single file the readiness pane classifies `Ready` DOES NOT PLAY. Opened through its own action and again through `seanime:media-workspace-open` with an explicit `localFilePath`, the stage rendered `playback-error-container` ("The media server accepted this file and then stopped preparing it") with 0 `<video>`; cues come from the subtitle manager, which has tracks only once the file plays. SECOND FINDING, not repaired: the readiness pane says `Ready -- Nothing to do` about a file that will not open, a rubric-8 honesty gap. THIRD, recorded not repaired: a detached block window carries NO presentation of its own (`data-presentation` null, 0 `[class*="liquid"]` nodes) while its host is Liquid -- probably right, since a detached Transcript is entirely dense work, but silent rather than decided. `notWritten` still names 19 root components with no rows at all, which is the larger half of this bullet. Receipt: PARITY_LEDGER.md, 2026-09-02 section. UPDATE 2026-09-02 late (primary2), ddeb97f3 + 9412f8ff + 54a2a9f8 + 9aecfff0: **62 rows / 9 apps -> 85 rows / 12 apps, `both` 63 -> 75, `pending` 3 -> 10, 0 duplicate `app|feature` keys.** THREE apps joined -- scraper (7), resources (7 of 8) and city (9) -- and each one paid for itself by finding a defect. (1) SCRAPER: `reverseControls` read `.scr-topbar-actions button[aria-pressed="true"]`, but that div holds exactly ONE `aria-pressed` (ScraperTopBar.tsx:91) and it is the ADVANCED-MODE toggle; the drawer opener at :78-86 was deliberately moved to `aria-expanded` + `aria-controls` with a source comment saying why. FALSE POSITIVE PROVEN AT ONE INSTANT ON ONE DOM, drawer SHUT and advanced ON: OLD `pressedOpeners=1` -- scoring a reversal affordance PRESENT, on a button whose own label reads "Advanced controls shown" -- against NEW `disclosures=1 expanded=0`. Advanced mode captured (false) and restored to false, verified after. The spec also never OPENED the drawer, so four of seven rows measured a region a fresh profile does not render. DISCRIMINATING CONTROL, HEAD's spec copied into debug/_p2g-ctrl at the same directory depth and run through the SAME harness against the SAME window and profile: pre-fix VOID 4/7 both with 2 drive refusals, post-fix PASS 10/10 7/7 both with 0 refusals, 7/7 mutations flipping exactly their own row, round trip 0 diffs. `drawerReady` is a WAIT rather than a sleep because `ScraperSettingsDrawer` is `lazy()` (ScraperApp.tsx:68) -- MEASURED 403 ms cold after a reload and 113 ms warm, but still absent 1,400 ms after the click on the run where the dev server had never transformed the chunk; RATE 2 refusals on that cold run, 0 on both warm re-runs. (2) RESOURCES exposed an INSTRUMENT defect in cat6 itself: the run came back VOID with 8/8 in both presentations, all three bars passing and 7 of 8 mutations exact, because `collectedSections` targets `.mytool-card .mytool-remove` and nothing is collected here -- the mutation REFUSED, it never ran. cat6 scored "refused" identically to "ran and flipped the wrong row", throwing away seven proved rows over a data gap; passing it quietly would be worse, since the row would enter the ledger with nothing having falsified it. The cases are now separate (`armed: false` + the refusal text) and `l6-parity-rows.cjs` SKIPS that row by name while writing the other seven. CONTROL ON THE RELAXATION ITSELF, live: `catalogueCount` re-pointed at `.res-name` -- an element that EXISTS, so it arms, but whose removal flips `resourceCards` -- still VOIDs the run with the unarmable one present; plant reverted and the file verified byte-identical. An all-unarmable control is still VOID. (3) CITY is the FIRST app written through the `noLiquid` branch, so all nine rows are `pending` BY DERIVATION rather than omission. The absence is a measurement taken at one instant over every open window: targetHasLiquidControl false, targetChromeButtons 3 (a real cluster, so not "no title bar"), presentation standard, othersWithLiquidControl ["Resources"] rendering `.fwin-b-liquid` beside it -- without that last term "this window has no toggle" and "no window has one" read identically. Bullet 1 independently records city/musicwidget/visualizer as having no toggle, so two instruments now agree from different directions. Round trip minimize -> restore, rankHeld true, all NINE mutations armed and exact. `notWritten` is now RE-DERIVED mechanically instead of decremented by hand, and the honest figure is SMALLER than the standing one: 25 declared specs, 12 apps with rows, **14** specs with no row at all (was written as 17), each named, plus mediaCenter which has rows but no spec. STILL OPEN on this bullet's own word "every": 14 specs unwritten, 10 rows `pending`, and `collectedSections` deliberately unclaimed until a profile has a collected tool. STATE RESTORED AND MEASURED, not assumed: scraper `drawerCategory` had been moved to `antibot` by a hand-driven step outside the harness and is back at `network`, `drawerOpen` false, advanced mode false, 0 windows / 0 dialogs. Receipt: PARITY_LEDGER.md, three 2026-09-02 (primary2) sections. UPDATE 2026-09-02 late (primary), 0a3418b5 + this commit: **49 -> 50 `both` of 50, 0 pending -- every WRITTEN row in this ledger is now closed**, and this bullet stays open on coverage alone rather than on anything unproven. The last row (transcript rail) had been pending three turns under three reasons; the last of them, "the one file the readiness pane calls Ready does not play", DOES NOT REPRODUCE -- THE Big O - 01 (mediaId 567) opened through `seanime:media-workspace-open` renders 1 <video> and plays. What reproduces instead is a DIFFERENT defect that probably caused the previous turn to stop looking: 47 of this profile's 80 files carry `mediaId: 0`, the sidecar refuses them with `abort-open local file has not been matched to a media`, and StudyPlayerSlice DISCARDED that payload, leaving the racing POST's status>=500 guess on screen -- "It is usually a codec or container it cannot read -- try another episode", advice that fails identically for all 47. Fixed in 0a3418b5 (the stated reason is parked in a ref and the HTTP branch prefers it, so either arrival order lands on the words), with a control: the matched Big O file opens through the same channel with no error container and the new branch does not fire. THE ROW ITSELF, all four clauses, standard then liquid, paused at the SAME 396,000 ms: 267 cue rows / 267 with non-empty text / 267 seek buttons in both; active cue 71 with aria-current="true" and 20 chars in both; card preview `Cue 72 - track 0 - 395,617-398,083 ms` byte-identical and RE-DERIVED rather than quoted from 2026-08-17; panel 384x517 in both; the translation written in standard SURVIVES the switch. `translateBtns` 267 -> 266 is arithmetic (the translated cue drops its button; 266 + 1 = 267), not a gap. Follow has its own control and it is the checkbox, not the seek: from the identical position, OFF leaves activeInView FALSE at listScrollTop 4488, ON makes it TRUE at 3693. Translate was DRIVEN: `.study-transcript-translation` 0 -> 1 with the row reading back its furigana and "Without past history, culture can still be manifested." Round trip removes `lq.workspace.presentation` (null, not "standard"). RECORDED NOT REPAIRED, not this row's words: the presentation switch reflows the list, the panel's own "scrolling away suspends following" rule sees that scroll, and **Follow silently turns itself off** (3693 -> 4552, checked true -> false). A layout change is not a user scrolling away; one click restores it. WHAT IS LEFT OF THIS BULLET IS NOW EXACTLY ONE THING: `notWritten`'s 19 root components. UPDATE 2026-09-02 (primary2), d9f1c213 + 37cf11f3 + dedb475c + 9f6419f0: **85 rows / 12 apps -> 120 rows / 16 apps, `both` 76 -> 111, `pending` 9 (unchanged, all city), 0 duplicate `app|feature` keys.** Three apps joined -- shell (9), blancShell (8) and games (10) -- and TWO of the three could not be written until a row that scored the PRODUCT as broken was repaired. (1) SHELL. `shellIdentity` scored `!!mat && theme.indexOf(mat) === 0 && owned > 0`, and both halves are WIRED-ONLY, measured live on frutiger-aero rather than reasoned: the Aero theme's id is `frutiger-aero` with materialSet `aero`, so indexOf is **9, not 0**; and `.${mat}-wall-atmosphere, .${mat}-tray-lamps` are rendered only under wired (DesktopShell.tsx:2748, :3502) -- on aero the shell renders **0** `aero-`prefixed elements outside `.fwin` against **178** INSIDE the hosted Resources window, so there was nothing to widen the selector to and widening it would have scored the shell from a window's contents. Aero's identity is CSS scoped to [data-materials='aero'] restyling the same `.os-*` furniture. What BOTH material sets own in the DOM is the secret start surface `.os-start-aero-menu` (DesktopShell.tsx:683), which exists only while the menu is open -- so `readStartOpen` records it and the row reads it back, the act-then-read shape trap 1 already forced on this spec. On the base theme the row is now `na` (no material set stamped = no material identity to verify), never false. CROSS-MATERIAL CONTROL, same harness/window/profile, three themes: `study-os` before the fix FAIL 8/9 with the mutation UNARMABLE; `frutiger-aero` PASS 10/10 9/9 both, carrying the row by `materialStartMenu=1` with `identityElements=0`; `wired-archive` PASS 10/10 9/9 both, carrying it by `identityElements=2` AND `materialStartMenu=1`. Two materials, two different pieces of evidence, one row. The rows were written from the wired run DELIBERATELY -- on the base theme that row is `na` and eight rows would have been the whole ledger. Theme captured and restored to `study-os` and read back out of localStorage, not asserted. (2) BLANCSHELL, the second shell -- its own BrowserWindow (`blanc.html?blanc=1`) hosting 0 `.fwin`, presentation axis = chrome reduction. `workspaceToggleHonest` read the fullscreen control at CHECK time and returned `control=null` -> FALSE. Measured live: the window renders exactly ONE `.blanc-icon-btn` ("Search Blanc") on the `Read` route, because the control is ROUTE-SCOPED -- `canExpandWorkspace = book || tab in {mine,flashcards,media,stats,tools}` (BlancShell.tsx:430). The drive visits a qualifying route and then correctly RESTORES the user's own route, so by check time the control is legitimately gone: a deliberate product decision was reading as a lying label. The reading is now taken WHERE THE CONTROL EXISTS (route "Mine") with a second chance on the restored route, and the row is `na` NAMING BOTH ROUTES if neither offers it; the mutation falsifies the recorded label rather than the element, so it arms on exactly the runs the row can score. BEFORE FAIL 7/8 mutation UNARMABLE -> AFTER PASS 10/10 8/8 both, control `"Fullscreen workspace"` -> `"Exit fullscreen workspace"` against workspaceFull=false fell that row alone and restored. (3) GAMES scored **PASS 10/10 on an EMPTY profile**, which is worth recording against the standing "an empty harness is capped rather than skipped" warning: that is true of rows that need content, and four of games' rows are written to score HONEST EMPTY STATE instead -- `sourceMaterial` pct=noList scaleX=0 agrees=true with "No word list uploaded for this level", `exposureTracking` seen=0/59 with stated pct, derived pct and bar scale all 0, `roundHistory` rows=0 against its empty-state sentence, `materialScope` mode=auto scripts=0 groups=0 shapeHeld=true. A bar that agrees with a zero is as real a reading as one that agrees with a 60; what the empty profile costs is the RANGE, not the row. It was DRIVEN end to end, not inspected: round started, "ro" typed, submit disabled true -> false, round aborted back to a ready state the harness re-read; 0 driven refusals. A SECOND SELF-CLAIM WAS ADDED TO THE LEDGER AND ITS FIRST READING IS UNFLATTERING: `controlCoverage`, derived from the rows themselves, reports **73 named / 1 NONE DECLARED / 45 silent of 120**. Forty-five rows -- dictionary 7, mediaCenter 8, flashcards 8, mediaWorkspace 5, grammar 5, agent 5, translate 4, captures 3 -- carry no negative control clause at all, and the ledger said so nowhere. They are not disproved; most were driven live. But a row claims "verified by side effect", and that is only true if something falsified it. The writer now STATES `negative control: NONE DECLARED` with the reason rather than ending the string in silence, so `silent` can only shrink. `shell` > `desktopSurface` is the live case and its reason is real: the row's subject is the shell ROOT and `restore()` sweeps `qa(win, '*')`, which does not include `win` itself, so a falsification could not be guaranteed undone. `notWritten` re-derived mechanically each time: **14 -> 10** specs with no row at all -- notebook, statistics, library, immersion, novels, manga, vn, music, video, youtube. STILL OPEN on this bullet's own word "every": 10 specs unwritten, 9 rows pending (all city, by derivation), 45 rows with no recorded control. Receipt: PARITY_LEDGER.md, three more 2026-09-02 (primary2) sections. UPDATE 2026-09-02 late (primary), 2e29fc05 + c5374209 + 59eaf12e + fd575a90 + this turn: **THAT 19 IS NOW 13, AND IT IS RE-DERIVED MECHANICALLY RATHER THAN QUOTED** -- `window.__LQP.apps()` (25) against the distinct `app` keys in `rows[]`, both read live, banked into the ledger as `notWritten.derived`. Six apps written this turn, each PASS 10/10 on `cat6-feature-parity.cjs`, parity equal in both presentations, every mutation flipping exactly its own row and restoring, 0 drive refusals: **flashcards 8/8, statistics 9/9, library 9/9, music 10/10, video 10/10, youtube 10/10**. Ledger **50 -> 106 rows / 7 -> 13 apps, 106 `both` / 0 `pending` / 0 duplicate `app|feature` keys**. The split with the concurrent worker is BY DATA, not alphabet: their profile has an empty media library and no Anki collection, so this tree took the six apps that would otherwise have been scored on an empty harness and capped -- 3,235 cards, 80 media files, real statistics; `city`, `scraper` and `resources` are theirs and arrive by merge. **THREE OF THE SIX FOUND AN INSTRUMENT DEFECT, AND ALL THREE WERE THE INSTRUMENT RATHER THAN THE SURFACE.** (1) `flashcards.virtualizedList` demanded `declared > rendered` for any group taller than its pane; `VirtualList`'s window is VIEWPORT-derived, so rendered 5/5/7/16/16 against declared 5/5/7/144/3074 is `min(declared, cap)` exactly, and a re-mount gave cap=12, so hardcoding 16 would have been the next wrong answer. The cap is now read off the DOM and must be DEMONSTRATED by a collection exceeding it; CONTROL ON THE RELAXATION, live -- detach the two large groups and the row still FAILS (`ceilingProven=false`). (2) `library.inboxFilters` demanded `chips.length >= 6`; the chip sets are DERIVED (`LibraryView.tsx:1165/1175`), so three languages and one level render 3 + 2 = 5 and can never reach 6. The rail is now split at its own `All` heads -- matched against the first chip's own text, never the English word -- with one active per group, which is strictly stronger than `active === 2`. **It had NO mutation at all**; the new one flips exactly it, 9/9 -> 8/9. (3) `music` scored **5/10 in BOTH presentations** on a library with two real songs because the drive never selected a track, so five rows read the empty player: one click gave now-playing `Choose a track` -> `e2e-audio-ja`, active 0 -> 1, queue active 0 -> 1, **seek max 1 -> 90**, like `aria-pressed` absent -> false, hint recovery 0 -> 2. The new `pick` step then refused for a SECOND reason and was right -- the driver dirties the first visible text field before driving, and here that is the music search, which filters the list to nothing (`.music-song` 0, `.mc-track-queue > button` 2) -- so it falls back to the queue, the same `state.play(item)` action. TWO TRAPS BANKED: `statistics.recentActivity` reads `scrolled=false` outside its own step sequence and a live feature reads dead, so the authoring tool now DRIVES then reads then `restore()`s; and `os:open` does NOT choose the Media Center's tab -- section `video` came up on **Library** and cat6 correctly refused `no video surface` rather than scoring the wrong page. STILL OPEN, and the words are still every: **13 of 25 specs have no row in this tree** (notebook, calendar, games, immersion, novels, manga, vn, city, scraper, resources, settings, shell, blancShell), three of which are written in the other tree. UPDATE 2026-09-02 (primary2), d55e340c + 2a78fbe2: **THE MERGE MOVED THIS LEDGER'S OWN COVERAGE NUMBER AGAINST IT, AND THE CLAIM THAT BROKE WAS RETRACTED RATHER THAN QUIETLY DROPPED.** First act of the turn was not a slice: the previous run died mid-merge and left three `UU` paths resolved in the working tree but never committed. Validated rather than trusted before committing as 21fbb957 -- every heading (56) and every commit hash from BOTH sides present, 0 duplicate headings, 0 conflict markers, 168 rows with 0 duplicate `app|feature` keys and **0 status disagreements** across the 58 overlapping rows, 46 tagged bullets / 35 closed on both sides and after. (1) `controlCoverage` went **45 silent of 120 -> 93 of 168**, and the block's own closing sentence -- "New rows now say NONE DECLARED explicitly, so `silent` can only shrink" -- was false the moment the two b2 waves met. CAUSE, and it is not a regex artifact (checked: 77 of 168 rows name a control SOMEWHERE, so the field was read correctly): the two waves used TWO ROW WRITERS. `probes/l6-parity-rows.cjs` copies both `rowEvidence` and `control.mutations` into `observed`; the main tree's `_pr4-rows.cjs` copies only `rowEvidence`. Same harness, same per-row mutations, same PASS verdicts -- one writer simply does not write the control down. THE CONTROLS WERE UNWRITTEN, NOT LOST: cat6 banks the whole run, so `debug/_p2i-transcribe.cjs` recovers them from `_pr4-<app>*.json` through an identity chain it VERIFIES at every link and REFUSES on -- the receipt is chosen BY ITS OWN CONTENT (unique `PASS 10/10` + `CONTROL FAILED AS REQUIRED` + every mutation `exactlyOwnRow` and `returned`, so the pre-fix VOID/FAIL receipts sitting beside them are correctly NOT picked up), every mutation name must be a declared row id, and every meta `feature` must match EXACTLY ONE ledger row. 56 metaIds <-> 56 ledger rows, 1:1, 0 duplicates, 0 unmatched either way. **53 rows given a transcribed control, 3 explicitly none-declared** (library declares 6 mutations for 9 rows); silent **93 -> 37**, withNamedControl **73 -> 126 of 168**, `silentByCause.b2WaveNotTranscribed` **0** -- the whole recoverable class is recovered. PROVENANCE IS IN THE CLAUSE: each ends "TRANSCRIBED 2026-09-02 (primary2) from the banked cat6 receipt `<file>` (`<mtime>`), not re-run here", because a control this process did not run must never read like one it did. THE TRANSCRIBER HAS ITS OWN NEGATIVE CONTROL, three plants on a COPY in `debug/_p2i-ctrl/`, baseline 10/10 transcribed: meta feature changed -> REFUSED "matched 0 ledger rows"; `exactlyOwnRow=false` -> REFUSED "found 0 qualifying PASS receipt"; mutation renamed -> REFUSED "not a declared row id"; baseline 10/10 restored after each. (2) **`notebook` is not an unwritten spec, it is one whose SUBJECT this branch deleted**, and `noRows` was one bucket hiding two different things. FILES_APP_PLAN gate 7b deletes the Notebook section: `AppSection.tsx` has no `case 'notebook'`, `LEGACY_WIN_SECTION_ALIASES` (shared/desktop.ts:76) maps `notebook -> files`, and `NotebookContent.tsx` is imported by exactly ONE file here, `components/blanc/BlancStudyPanels.tsx`. DRIVEN LIVE, one instant one DOM, desk 0 windows before and after, WITH BOTH CONTROLS: os:open `notebook` -> window "Files", body root `DIV.lq-scaffold.fa-shell`, 52 buttons, 1,704 chars, unavailable=false; CONTROL os:open `dictionary` -> "Dictionary", `DIV.dict-view`; CONTROL os:open `notAKnownSection` -> `DIV.app-section-unavailable`, unavailable=TRUE; and `.gx-notebook` = **0 across the whole document**, searched over `document` rather than one window. Both controls are load-bearing -- without dictionary, "notebook opened Files" is equally consistent with os:open ALWAYS opening Files; without the unknown id, with every unrecognised id falling through to Files. `noRowsByCause` now splits the five with the measurement inline, and **THE DENOMINATOR DID NOT MOVE** -- still 5 of 25, because reclassifying work is not doing it. The spec is ANNOTATED, NOT DELETED: on a tree where the Notebook section still exists it is still correct, and this branch is the unusual one. MEASURED FOR THE NEXT TURN, NOT CLAIMED AS DONE: `mediaCenter` is the "1 ledger app with rows but no spec", and its 8 rows are the largest remaining silent block. They are NOT unproven -- they were driven 2026-08-25 by the SUPERSEDED `window.__L6M` instrument, which cat6 cannot re-run, which is exactly why they are silent. All 9 of their selectors still exist in source, and the window was opened and measured live this turn: navButtons=9 active=1 seanimeLink=1, historyButtons=2, chromeButtons=5, liquidPressed=false -- so rows 1/6/7/8 are drivable on THIS profile, while **rows 2/3/4/5 have no subject** (`.medialib-card` = 0, empty media library). TWO TRAPS BANKED FOR WHOEVER WRITES THAT SPEC: the shelf rail reads **6** `.ui-sidebar__item` here against the ledger prose's 9 and the sort `<select>` **4** options against 7 -- both DERIVED from available media, so a spec hardcoding either repeats the `library.inboxFilters` defect exactly; and "current" is `aria-current="true"` (measured `true,false,false,false,false,false`), NOT a class -- a class-based selector matched 6 of 6. CANDIDATE, ONE READING ONLY AND DELIBERATELY NOT FILED AS A DEFECT: Back stays `disabled` after the FIRST in-window navigation (Home -> Library) and enables only after the second (Library -> Music), so "Back to Home" looks unreachable; that is one gesture on one profile and needs a repeat before anyone calls it a bug. STILL OPEN on this bullet's own word "every": **5 specs with no rows** (notebook by product decision, immersion/novels/manga/vn awaiting authoring), **9 rows pending** (all city, by derivation), and **37 rows with no recorded control** -- down from 93, and every one that remains genuinely pre-dates any writer saying anything about controls. Receipt: PARITY_LEDGER.md, two 2026-09-02 (primary2) sections. UPDATE 2026-09-02 (primary), 62097cc9 + 8663391e + 0e618fe0 + a442b6ec + 24abb4a4: **13 -> 10 specs with no row, re-derived mechanically, not quoted** -- the same `window.__LQP.apps()` (25) against distinct `app` keys in `rows[]`, re-banked into `notWritten.derived`. Ledger **106 -> 129 rows / 13 -> 16 apps, 129 `both` / 0 `pending` / 0 duplicate `app|feature` keys** validated after every write. Three apps: **novels 9/9, manga 7/7, immersion 7/7**, each PASS 10/10 with parity equal in both presentations and every mutation flipping exactly its own row and restoring. **ALL THREE FOUND AN INSTRUMENT DEFECT AND ALL THREE WERE THE INSTRUMENT.** (1) RECOVERED FROM AN INTERRUPTED TURN: `novels.chapterNavigation` asked whether the current page contained a TOC label, which is only true on a chapter head -- the TOC has 9 entries over ~166 parts, so a working control scored dead on ~95% of the book. It is now DRIVEN, and because `goTo` writes the reading position through `setProgress` (NovelReader.tsx:731) the position is captured before the jump and written back by the undo; the seek cannot do it, being permille. Its NEGATIVE CONTROL ran by accident: the dead turn left a plant in the live DOM (option 165 relabelled `lqp-never-in-this-book`) and the first authoring run correctly scored the row PENDING in both presentations. (2) **THE MANGA DRIVE REPORTED ITS OWN WRITE BACK TO ITSELF.** `.reader-seek` is a SCRUBBER -- `onChange` sets a preview and the jump commits on `pointerup`/`keyup` (MangaReader.tsx:2069-2086) -- so `.value = 3` plus `input`/`change` moved nothing, and `pageRender` passed anyway because its predicate asked `declared >= 1` while its own comment promised a cross-check against the rendered page. Measured live: seek `12`, stage `pages/0001.png`, `First page` DISABLED, verdict 7/7. Clicking the product’s own `Next page` DID move it. Three receipts discriminate: PASS on the broken drive -> VOID once the row cross-checked -> PASS 10/10 with the `pageTransport -> pageRender` cascade DECLARED (clamping the range clamps the seek’s value, so the transport genuinely stops declaring the page on screen). The undo’s baseline had the same disease and was moved onto the STAGE, which the clamp cannot rewrite: `page=3->1` now appears on every cycle, and on zero cycles before. (3) `immersion` VOIDed at cat6’s DEFAULT `--step-ms 700` with `readerChars=0` and `composed=false` -- a REAL public page still loading, exactly as the `open` step warns; the receipt even heals mid-run (first mutation pre-baseline 5/7, second afterRestore 7/7). At `--step-ms 3500`, same window and profile: PASS 10/10, 7/7, 0 refusals. A slow live page is not a dead control. NOT WRITTEN AND SAID PLAINLY: **vn has a live window and NO SUBJECT** -- its library is empty on this profile ("Add a local visual novel to begin capturing Japanese dialog"), a row measured on an empty harness is capped rather than skipped, and adding one would write to the user’s real library, which that spec’s own safety note forbids. STILL OPEN on the word every: **10 of 25 specs have no row in this tree** (notebook, calendar, games, vn, city, scraper, resources, settings, shell, blancShell), five of which (city, scraper, resources, shell, blancShell) are the concurrent worker’s and arrive by merge. UPDATE 2026-09-02 (primary), same turn, later commit: **10 -> 9 specs with no row.** `calendar` joins the ledger -- **5/5 both, PASS 10/10, 0 refusals, 18 driven steps**, all five mutations flipping exactly their own row and restoring, box 820x580 in both. It PASSED on the first run with no instrument repair, which is worth saying because three of the previous four did not. Rows: `visited=4/4` (the row scores four ARRIVALS, not four buttons -- the walk is recorded in spec state so a segment whose other three modes render nothing cannot pass); dows=7 cells=42 numbered=42; `shiftedAndReturned=true` (a transport that moves and cannot return fails it); the composer complete AND closed at read time, with `type="button"` asserted because a default-type button inside that form would submit it and create an event. The drive never submits. Ledger **129 -> 134 rows / 16 -> 17 apps, 134 `both` / 0 `pending` / 0 duplicate keys**. `dirtiedField` is null on this surface and the reason is written into the row rather than glossed: the driver dirties the first VISIBLE text field and the composer holding this surface's six inputs is closed at trip time. STILL OPEN: **9 of 25 specs have no row here** (notebook, games, vn, city, scraper, resources, settings, shell, blancShell) -- five the concurrent worker's, one (`vn`) with no subject on this profile. UPDATE 2026-09-02 (backup), 7c19ee6a + c5a15d7b: **13 -> 7 specs with no row, and NO SPEC LEFT IN THIS TREE IS BOTH DRIVABLE AND UNWRITTEN.** Two apps written, each PASS on cat6 with parity equal in both presentations, every mutation flipping exactly its own row and restoring, 0 drive refusals: **games 10/10** (first run, no repair) and **settings 7/7**. Ledger **134 -> 151 rows / 17 -> 19 apps, 151 both / 0 pending / 0 duplicate app|feature keys**. Gap re-derived mechanically again (__LQP.apps() = 25 against distinct app keys in rows[]): the 7 remaining are notebook, vn, city, scraper, resources, shell, blancShell -- five are the concurrent worker's and arrive by merge, notebook's SUBJECT was deleted by files-app on this branch (LEGACY_WIN_SECTION_ALIASES maps notebook -> files), and vn has a live window with an empty library that only a user may fill. **THE DRIVE IS LOAD-BEARING AND games PROVES IT WITH A NUMBER**: read passively the same ten predicates score 5 of 10, because selectionWorks, the round, the HUD, the level baseline and the kana picker cannot be answered without driving. AND ONE ROW WAS PASSING ON THE SPELLING OF AN ATTRIBUTE: settings.settingsSearch asked only that aria-expanded be a well-formed boolean, which a widget stuck permanently open passes; it now scores the DISMISSAL and discriminates both ways (driven 7/7 expandedAfterEscape=false panelMounted=false, undriven 6/7 dismissal=not driven). Its instrument defect is the generalisable one: closeSearch read aria-expanded in the SAME expression that dispatched Escape, so it reported "true" on every run it had ever made while the live surface one call later was false -- a receipt that would have had a worker file drive residue that is not there. Dispatch and read are now two legs (the idiom blancShell already used), and the trap is written into cat6-feature-parity.cjs because a Media Center reading in the same 24 hours had the identical off-by-one. THAT CANDIDATE IS WITHDRAWN: primary2's "Media Center Back stays disabled after the first navigation" reproduces EXACTLY under a same-expression read and is contradicted by the separated one (back=false, title "Back", tab Home), and the trail walks Music -> Home -> Library with both ends disabling honestly. Also checked and clean: Game Arena's Settings entry lands on page study with the game-arena setting highlighted, COLD and WARM, despite an 80 ms setTimeout race. Receipt: PARITY_LEDGER.md, 2026-09-02 (backup) section. UPDATE 2026-09-02 (primary2), a175e657 + this turn: **`captures` is BLOCKED BY DATA on this profile, measured rather than assumed, and it was the slice this track's own last handoff named as the cheapest remaining one.** Driven live through the product's own path -- `os:open` detail `reading` opens "Reading Finder", the `.reading-workspace-tab` rail renders 8 tabs, clicking `Captures` mounts `.reading-captures` -- and the surface then reads `rows=0`, `passage=false`, `head=null`, with its own empty state saying "Nothing captured yet. Scan a passage with the Reading Lens and send it here." `cat6 --app captures` REFUSED before that click ("the captures surface is not open... a surface that is not on screen measures as perfect because every count is zero"), which is the refusal working. Three of the six rows (`captureList` needs `rows>0`, `selection` needs an `aria-current` row, `measureClamp` needs a rendered passage) have NO SUBJECT here, so a run would be capped, not a PASS. Creating one means driving the Reading Lens over a passage and PERSISTING a capture; not done, and named instead of quietly skipped. So the b2 remainder on this tree is now data-blocked or tree-blocked in every case: `captures` and `mediaWorkspace` by an empty profile, `novels`/`manga`/`immersion` by their receipts living in the main tree, `vn` by an empty library, `notebook` by this branch deleting its subject. THE MERGE, said because it moved a number: sync-down `a175e657` resolved 5 conflicts -- the plan bullet spliced by SEGMENT (18 of the other side's 93 were absent here), PARITY_LEDGER.md unioned THEIRS-FIRST so their `### calendar` was not orphaned under our `##`, the ledger's derived block taken by SHAPE and RE-DERIVED with `debug/_p2g-notwritten.cjs` rather than hand-merged, and `l12-atlas.cjs` taken WHOLLY THEIRS: b4 is the main tree's track, and their `9c6474f9`+`6a1e48a5` reach integrity `all-present` on the 21 plates this tree's `32aae369` could only report as CORRUPT, plus the raw-NUL repair `sourceNulBytes.test.ts` gates on. Ledger after the union: **213 rows / 24 apps, 204 both / 9 pending / 0 duplicate app|feature keys**; derived re-run, **2 specs with no row of 26** (notebook, vn); controlCoverage **135 named / 13 none-declared / 64 silent of 213**. Desk restored and measured: 0 `.fwin` before and after. UPDATE 2026-09-02 (primary2), this commit: TWO things, neither a closure. (1) The 28 `b2WaveNotTranscribed` rows: 21 RECOVERED -- novels 9, immersion 7, calendar 5 -- by `debug/_p2i-transcribe.cjs` reading the main tree's banked `_pr5-*` receipts read-only (the transcriber globbed only `_pr4-`; the second wave's receipts carry `_pr5-`, same writer, same shape, so nothing was ever lost). controlCoverage RE-DERIVED, not decremented: withNamedControl 135 -> 150, declaredNone 13 -> 19, silent 64 -> 43; rows 213, 0 duplicate app|feature keys, statuses unchanged (204 both / 9 pending). Provenance is in every clause -- "TRANSCRIBED 2026-09-02 (primary2) from the banked cat6 receipt debug/_pr5-novels2.json (2026-09-02 08:39), not re-run here" -- because a control this process did not run must never read like one it did. manga's 7 stay silent DELIBERATELY: THREE of its receipts qualify as PASS 10/10 with every mutation exact (_pr5-manga, manga3, manga4 -- the drive was repaired between them) and the identity chain demands exactly one, so it was skipped BY NAME rather than picked by mtime; games and settings have no banked receipt in the main tree at all. silentByCause.b2WaveNotTranscribed 28 -> 7, all manga. (2) A NEW GAP, measured rather than inherited: `files` is the 25th entry of DESKTOP_WIN_SECTIONS on the branch since df751d60 and has NO spec in l6-parity.js and NO ledger row -- the Notebook's replacement arrived and this ledger does not know it. "Every row" now also means a Files spec; its DOM is already L2-shaped (`LiquidAppScaffold` root `.fa-shell`, rail `.fa-tree-node[aria-pressed]`, toolbar `.fa-search input` / `.fa-sort select` / `.fa-sort-dir` / `.fa-view-mode-button[aria-pressed]`, canvas `.fa-list[role=grid][data-view][aria-rowcount]` with `.fa-row[aria-selected]`, inspector `.fa-details` with `.fa-action-open` always and EXACTLY ONE of `.fa-action-mine` / `.fa-mine-refusal`, dock `.fa-status[role=status]`; window title Files / ファイル / 文件 / Файлы). NOT a decision, recorded so it is not re-litigated: city's 9 `pending` rows were NOT flipped to `standard-only`. The plan's own per-app table (line 328) assigns City a Liquid design -- "Garden/world canvas remains dominant; HUD, growth detail, reading source, and settings appear only when requested" -- so `pending` ("no Liquid destination yet") is the honest word and `standard-only` ("deliberately never going Liquid") would contradict the plan. Receipt: PARITY_LEDGER.md, 2026-09-02 (primary2) section. UPDATE 2026-09-03 (primary2), cf447daa + 981d0ce6 + 3f0c9030: THE FILES GAP THIS TAG OPENED IS CLOSED AND THE TRANSCRIBABLE HALF OF `silent` IS EXHAUSTED, so what remains is stated exactly. (1) `files` has a spec and rows: cat6 --app files live, **PASS 10/10**, 8/8 in BOTH presentations, na 0, round trip 0 diffs, 8 of 8 mutations armed and each flipping exactly its own row; ledger 213 -> 221 rows, 24 -> 25 apps, 0 duplicate app|feature keys. Its first two runs VOIDed and the cause generalises: the `search` row scored the DRIVER's `dirtyField` mark, which runs ONCE before the FIRST drive while the control loop RE-DRIVES before every mutation, so the row read `narrowed=true` when scored and `narrowed=false` on every control baseline -- already false, unable to fall, seven proved rows discarded. A row may not depend on state another part of the harness owns and only guarantees once; it now cuts its own probe token off a listed row and asks for SELECTION (`1 < queried < unfiltered`, live 45 -> 1) rather than shrinkage. cat6 also gained `ownRowBefore -> ownRowAfter` + `whyNotFalsified`, because a VOID that publishes `fellRows: []` cannot distinguish "own row already false" from "mutation hit the wrong element" and only the second is an instrument bug. (2) controlCoverage **43 silent -> 19**, named 158 -> 178, and `silentByCause.b2WaveNotTranscribed` is **0** with `b2WaveApps` empty. manga's 7: three qualifying PASS receipts, resolved BY CONTENT and never by mtime -- `_pr5-manga` predates the `pageTransport: ['pageRender']` declaration and measured a different surface (7/7 -> 6/7 vs manga3/4's 7/7 -> 5/7), so a receipt must now declare the cascades the spec declares NOW; manga3 and manga4 then agree field-for-field and the clause names both. games (10) and settings (7): never missing a receipt at all -- the glob was pinned to `_pr[0-9]+-` and their receipts are `_pb1-`/`_pb2-`. The prefix is a LABEL, not evidence. FIVE controls fired, ledger byte-untouched after each, including the cascade parser's own: its first draft was line-anchored and returned {} for `translate` and `video`, whose cascades are written inline -- a filter that fails open is worse than none. (3) NOT CLOSED, and now for exactly two reasons, both named: **9 rows are still `pending` and all 9 are city's** (its Liquid destination does not exist yet; the plan assigns City a Liquid design at line 328, so `pending` stays the honest word), and **`vn` has no rows at all** because its library is empty and adding a VN writes to the user's real library -- needs-user.md 2026-09-02 05:40, RE-CHECKED this turn and STILL BLOCKED. `notebook` is the third spec with no rows and is NOT pending work: this branch deletes that section, measured. So b2's "every row" is 212 of 221 both, 0 of 221 silent-and-recoverable, and the remainder is one product slice (city) plus one human-blocked subject (vn). (4) An audit-trail defect found and fixed on the way: the TRACKED ledger's `controlCoverage.reason` cited `debug/_p2g-notwritten.cjs` as the authority for its own numbers, and `debug/` is gitignored -- the tools that write 221 rows of self-claims were unreadable to any reviewer. Both are now `probes/l6-ledger-coverage.cjs` and `probes/l6-control-transcribe.cjs`, re-run from there reproducing identical figures, and the debug copies are DELETED rather than mirrored. (5) CLOSED 2026-09-03 (primary2), `2b5a73cf` + `daa8a919`. **221 of 221 rows are `both`; 0 pending.** The 9 city rows were closed by BUILDING the destination, not by relabelling them. `canPresentLiquid` refused `city` for being frameless, and frameless is not the test S2.3 asks -- the question is whether a section owns a region in the LIQUID role that a flip could hand to `--lq-*` instead of one hardcoded palette. Mooncap owns exactly one: `.reading-garden-info`, the labelled dossier the hero discloses, which is line 328's own column for City. It is now a `ContextualSurface`, the frameless cluster carries the SAME `.fwin-b-liquid` control the framed bar does from the same `canGoLiquid`, and the painted scene stays the ANCHOR in both presentations (`.fwin-body-flush`'s exception, for its reason). `visualizer` owns no such region and still refuses, so the predicate keeps a live negative -- both tests now assert it from both sides. cat6 --app city: **PASS 10/10**, host `fwin` where every prior run recorded `fwin-no-liquid`, parity 9/9 / 9/9, **na 0** (was 9), `roundTrip.trip` = `standard -> liquid -> standard` with `diffs: []` -- the real flip, replacing the minimize->restore substitute. 9/9 mutations armed, each falling exactly its own row. Material delta measured before the harness: bg gradient -> `color(srgb .102 .094 .137 / .72)`, border teal .28 -> neutral .14, radius 14 -> 16, padding `12px 14px 11px` -> 8, colour `rgba(224,242,237,.9)` -> `rgb(245,244,247)`; back = 0 diffs over geometry, z, rect, the 13-control count and the open dossier. **Accessibility owed and paid**, since this changed text colours: cat1 anchored on the window, BOTH arms, artifact records its own `presentation` -- standard PASS 10/10 and liquid PASS 10/10, 32 text runs, 0 unmeasurable, minRatio **4.62**, 0 failing, IDENTICAL. Zero a11y delta from the flip. (The high-contrast improvement claimed in the row metadata is derived from `liquid-tokens.css:178-186` and was NOT driven under that theme -- a source fact, not a measurement, and it says so.) TWO INSTRUMENT DEFECTS fixed on the way: `--refresh` re-derived `status` but not the destinations, so rows could go `pending -> both` while still carrying `noLiquidReason`'s "NONE, and it is a product fact this run measured rather than assumed" -- a row sourced to two different dates, where both halves look sourced; and `.fwin-drag-strip`'s reserve was computed from `.fwin-b`'s 26px while the live cluster measured 130px, because `lq-hit` raises each button to 30px in LAYOUT, not only in pointer region. WHAT REMAINS AND WHY IT DOES NOT HOLD THE BULLET: two declared specs carry no rows and neither is recoverable by work in this repo -- `vn` is human-blocked (re-checked LIVE this turn: 0 VN/novel keys of 42 in localStorage; needs-user.md 2026-09-02 05:40 stands) and `notebook` has no subject on a branch that deletes that section. The bullet's own words are "every feature-ledger ROW", and every row is closed. -->
- Run focused tests, full suite, architecture/i18n gates, packaged-app checks, and fresh-profile migration.  <!-- status: closed; evidence: 2026-09-01, 98b5ef39. THE PACKAGED-APP CLAUSE FOUND A REAL BLOCKER ON ITS FIRST RUN AND IT WAS PRE-EXISTING: `npx vite build --config vite.renderer.config.ts` FAILED on the committed branch -- `Could not resolve "./studyWorkspace.css" from "src/media/DetachedStudyBlock.tsx"`. That import is committed (9fa37b59, "commit 20 modules that tracked source imports but git never had"; this is the 21st, missed because that sweep looked at .ts/.tsx) while the 924-line stylesheet had NO git history and sat UNTRACKED in the main working tree. Dev never resolves the module unless you detach a study block; rollup resolves the whole graph eagerly, so PRODUCTION DIED and nobody could see it from the main tree. A clean worktree checkout is the only reason it was visible. Control is before/after on the same command in this order: fails at that import -> file added byte-identical (sha256 987A6056..., 27,194 bytes, 924 lines, 0 CRLF) -> EXITS 0. THE RECEIPT: with a production bundle finally existing, `main-*.css` carries all 23 `.seanime-host.workspace-liquid` selectors (matching the 23 in source), 23 `.reader.reader-liquid`, both `.seanime-host-liquid` toggle rules and 13 `--lq-liquid-bg` references -- the Liquid material is NOT dev-only. Also swept all 8,972 relative import specifiers under src/ for unresolvable targets: exactly ONE real hit, the above; 63 others are false positives (`?raw`/`?worker` suffixes whose files exist, and paths quoted inside test assertions). NOT DONE, and why the bullet stays open: (a) only the RENDERER was built -- `electron-forge package`/`make` and the main+preload configs have not been run, so "packaged-app checks" is one third measured; (b) FRESH-PROFILE MIGRATION is completely untouched -- it needs a second Electron on an empty userData dir, which cannot start while a dev instance holds the port and the profile lock, so it is a whole slice of its own; (c) the full suite / i18n / architecture gates are run every turn but not yet recorded here against L12's own words. One genuine but INERT defect found and deliberately left: `src/renderer/window.d.ts` writes `import('../../shared/...')` in ~30 type positions where the target is `src/shared/`, one `../` too many. rollup never sees a .d.ts and `tsc --noEmit` is not a gate in this repo, so it is named rather than fixed. FIXED 2026-09-02 (backup), `b01f3608` -- it was 27 lines / 29 positions across 5 modules, three characters each. Measured with `ts.resolveModuleName` under this repo's tsconfig rather than by reading: HEAD 88 distinct relative specifiers / 83 resolve / **5 unresolved**, after 87 / 87 / **0**; 88 -> 87 because `mining` was written BOTH ways in this one file and collapses onto the twin it already had, and the 83 that resolved before still resolve, which is the control against a blanket rewrite breaking a good path. GENERALISED to the class before closing it, since that is what this defect is worth: `ts.resolveModuleName` over every relative `import('...')` specifier in all **2,545** `.ts`/`.tsx` under `src/` -- **1,386** specifiers, and after `b01f3608` **0** genuinely unresolvable. The 5 residual hits are the instrument's, and are recorded so the next sweep does not re-raise them: four Blanc panels' `import('../../theme/studyos-compat.css')` resolve on disk and TypeScript simply has no CSS resolution, and two `./catalogs/ja` hits in `i18nSplit.test.ts` are inside COMMENTS. Staged as HEAD + this hunk; the working-tree copy is foreign-dirty (+63/-3, another track's `studyBlock*` block, which already uses the correct `../shared/` form) and was left as found. UPDATE 2026-09-01 (primary2), fab72cac + this turn: THE FRESH-PROFILE CLAUSE HAD NO WORKING INSTRUMENT AND THAT WAS ITSELF THE DEFECT. `JP_USER_DATA_DIR` is the repo's only fresh-profile affordance and `src/main/desktop.ts` defeated it: the store was built at MODULE SCOPE, and its constructor resolves `app.getPath('userData')` while `main.ts:142` applies the redirect in a top-level statement that runs AFTER every import. It READ the real profile and WROTE the scratch one. MEASURED: a userData dir created EMPTY (0 entries, redirect echoed in the log) came up with the real profile's 8 desktops, widget id `wgt-mrmkpxj7-tpja`, `aurora` City wallpaper, authored viewports 1904x985 / 944x453 / 642x385 and globalZTop 10802 -- all identical to %APPDATA%. `profiles.json` beside it was CORRECTLY seeded, which is what named this one module as the single cause; a module-scope scan of src/main finds three other eager instantiations (RateLimiter x2, AsyncLocalStorage), none touching userData. AFTER the fix, same procedure on the same wiped dir: 3 desktops, all seed, 0 windows / 0 widgets / 0 icons, globalZTop 10. The write half is why it mattered -- `load()` re-writes the file it read on any schema migration, and at import time that target was the 8.6 GB profile with no restore point. WITH A WORKING INSTRUMENT, the clause's own subject finally measured: fresh default is CONVENTIONAL (`data-presentation=standard`, 0 of 11 storage keys are `lq.*`, `data-window-chrome=standard`), and the Liquid round trip driven through the title-bar control on a never-before-existing profile is BYTE-IDENTICAL over the full 18-property snapshot by `-ceq`, with `presentation` REMOVED from that profile's own desktop-layout.json rather than written as `standard`. Discriminating control came free: the first return attempt used the wrong aria-label, no click landed, and the same comparison returned False with the key still present. FIRST-RUN, visible only here: the fresh desktop comes up behind TWO overlays at once, a `.consent` country modal and an 8-step `.tour-root`, over zero desktop icons -- recorded, not repaired, not a Liquid defect. STILL OPEN, which is why this bullet does not close: (a) `electron-forge package` has NOT been run, and `npx vite build --config vite.main.config.ts` is NOT a substitute -- forge's VitePlugin injects `build.lib.entry`, so standalone it builds the default root without the renderer's aliases and dies on `@/app/(main)/_features/...` from src/media/MediaWorkspace.tsx, identically for the preload config; that is a HARNESS error and must not be logged as a product one; (b) CLOSED this turn -- kill-and-relaunch on the fresh profile: entered Liquid, blob already byte-identical BEFORE a `Stop-Process -Force` (not a graceful quit, so it cannot pass on shutdown-flushed state), relaunched on the same scratch dir, window returned `data-presentation=liquid` with `.fwin-liquid`, 18-property snapshot byte-identical to the pre-restart Liquid one by `-ceq`, and the discriminating control against the STANDARD snapshot returns False. First-run consent + tour did not reappear. TRAP: the bridge answers before the desktop hydrates -- at ~6 s the renderer read `fwin: 0` and looked like a broken restore, at ~21 s it read 1/liquid; poll, never sample once; (c) the gate results are still not recorded against this bullet's own words. Full receipt: `src/.coordination/liquid-workplace/L3_PRESENTATION.md`, 2026-09-01 section. UPDATE 2026-09-01 late (primary2), 96a7b579: CLAUSE (a) IS NOW MEASURED ACROSS ITS WHOLE BUILD SURFACE, and running it found a PRODUCTION DEFECT the dev server structurally cannot show. `npx electron-forge package` builds EVERY target and hook: src/main.ts, src/preload.ts, the five utility-process entries (importWorker, apkgReadWorker, llamaHostWorker, flashcardTtsWorker, localDeckApkgWorker), renderer target main_window, and all three prePackage hooks (keep-alive, seanime-sidecar-staging, vite) -- 8 build targets, all green, through forge's injected `build.lib.entry`, which is exactly what the standalone vite invocations could not do. Artifacts verified present: .vite/build/main.js + main-*.js (2.5 MB), preload.js (56 KB), the 5 workers, and .vite/renderer/main_window with 752 files; the i18n split survives production -- ja/ru/zh land as SEPARATE chunks (880 KB / 1.11 MB / 724 KB), not in the main bundle. All 38 html/css asset references in the built renderer resolve (the 6 apparent misses are `url(%23b)` SVG fragment ids inside data: URIs). THEN THE REAL CHECK, never run before: BOOT the production bundle. `package.json` main is `.vite/build/main.js`, and the built bundle has ZERO `MAIN_WINDOW_VITE_DEV_SERVER_URL` references against 6 `app://bundle/index.html` ones, so `electron .` is a genuine production-mode boot. It BOOTS and opens its window. But main.log carried 12 identical bare `net::ERR_FILE_NOT_FOUND` stacks naming neither URL nor path. Identification was MECHANICAL: `public/kuromoji/dict` holds exactly 12 files. `public/kuromoji/` is gitignored (.gitignore:106) with `models/ ort/ cedict/ tesseract/`, so this worktree's `public/` has 3 entries against the main tree's 7 -- A PRODUCTION BUILD FROM A CLEAN BRANCH CHECKOUT LACKS THE BUNDLED RUNTIME BLOBS, and only `public/sounds/README.md` + `public/tray-icon.png` are in git. Same class as clause (a)'s earlier studyWorkspace.css find, and invisible from the main tree. FIXED in 96a7b579 (`main/appProtocolResolve.ts`, 7 cases, both mutation controls fire). THREE-RUN CONTROL, each a fresh 0-entry scratch userData: (A) before fix, no bundle -> 12 anonymous stacks; (B) after fix, no bundle -> 0 anonymous stacks and 12 NAMED `missing-bundled-asset` diagnostics, one per dict file; (C) after fix, bundle provisioned from the main tree (17 MB, 12 files) -> 0 anonymous stacks, 0 diagnostics, main.log not even created. (C) is the discriminating control: it proves the 12 are the gitignored bundle and that the new logging does not fire spuriously. The bundle was REMOVED again afterwards so the worktree keeps reporting the branch honestly; re-provision with `Copy-Item C:UsersArseniyProjectsjp-study-apppublickuromoji -Destination publickuromoji -Recurse`. STILL OPEN, and it is the ONLY residual: electron-packager's file-COPY stage cannot run in this worktree. `node_modules` here is a ReparsePoint junction to the main tree, and the packager tries to reproduce it as a symlink into TEMP. CONTROL, run in this shell: `fs.symlinkSync(dir, link, 'dir')` -> EPERM, while `'junction'` -> OK, and `AllowDevelopmentWithoutDevLicense` is unset; the main tree's node_modules is a plain Directory, so the packager never reaches that branch there. ENVIRONMENT, NOT PRODUCT -- and it compiles nothing, so the product signal above is complete. Deliberately NOT worked around: materialising node_modules as a real ~GB copy, or running the packager in the shared main tree, would write multi-GB `out/` on a disk at 99% (18 GB free) and disturb a concurrent worker, for a stage that only copies files. Logged in needs-user.md. UPDATE 2026-09-02 (primary): THE PACKAGED-APP CLAUSE IS CLOSED, AND THE BLOCKER WAS THE WORKTREE RATHER THAN THE MACHINE. Its own needs-user entry named the alternative -- "say a packager run in the main tree is acceptable" -- and both reasons it had been declined had moved when re-derived: free space is **27.0 GB**, not the 18 GB assumed, and the main tree is quiet because the relay dispatches one main-tree worker at a time while primary2 sits in its own worktree. `node_modules` here is a plain `Directory` (LinkType empty) rather than the ReparsePoint junction the packager tried to reproduce as a directory symlink, so the EPERM branch is never reached. `npx electron-forge package` **EXIT 0**, log `debug/_pr-forge-package.log`: 8 build targets, all three prePackage hooks, then `Copying files` -> `Preparing native dependencies` -> `Finalizing package`, the three lines that had never printed. RECEIPT ON THE ARTIFACT, not the log: 40,254 files / 4.15 GB at `out/jp-study-app-win32-x64`; `jp-study-app.exe` present; **0 reparse points anywhere inside the package**, which is the discriminating number because the worktree failure was precisely an attempt to CREATE one, so a package containing none is the copy stage completing rather than being skipped; `resources/app/node_modules` a plain Directory; no asar, `resources/app/.vite/renderer` 755 files, `resources/seanime/seanime.exe` staged. SECOND INDEPENDENT CONFIRMATION OF primary2's `96a7b579` FINDING, FROM THE OPPOSITE DIRECTION: `resources/public` carries all 7 entries and `resources/public/kuromoji/dict` holds the **12** files whose absence produced their 12 anonymous ERR_FILE_NOT_FOUND stacks -- they proved the 12 by removing them, this proves the same 12 by having them, and the difference between the two trees is `.gitignore:106`. NOT CLAIMED: the package was not booted (primary2 already did that) and `electron-forge make` is unrun, which the bullet's words do not ask for. THE BULLET NEVERTHELESS STAYS OPEN, and this is a deliberate decision recorded so it is not re-litigated: all five clauses now have live measurements -- focused tests, full suite and the architecture/i18n gates at faa1424f, fresh-profile migration at fab72cac/96a7b579, packaged-app here -- so the bullet's literal verb, "Run", is satisfied. But L12 is VISUAL CERTIFICATION, and the branch's own `npx vitest run` still exits 1 on two inherited identities (architectureBaseline's 3 `src/media/Study*.tsx` orphans, and i18n catalog hygiene over 27 components) that are green in the shared tree ONLY because of other tracks' uncommitted files -- boss-audit Finding 1. Closing a certification bullet on a red suite would be a closure that has to look away from a number, which this plan forbids. The single remaining condition is therefore NOT more measurement: it is the media and i18n owners hunk-scoping `VideoCoreStudyOverlay.tsx` and their 27 components. Both those workers are benched past 2026-09-07, so this is reported, not fixed from here. UPDATE 2026-09-02 (primary2), this commit: CLOSED. The one condition this bullet was held open on -- "the branch's own npx vitest run still exits 1 on two inherited identities" -- is no longer true at the branch tip. At df751d60 (feat/nyaa-subtitles tip, files-app merged, 0/0 divergence, clean worktree, git status empty) BOTH identities are GREEN: the i18n catalog-hygiene hardcoded-strings case passes because tools/i18n-hardcoded-baseline.json was re-derived from HEAD with a per-file count ratchet (b94dca35 + 9842c0d6), and architectureBaseline passes because the three src/media/Study*.tsx orphans have zero importers at HEAD, so the baseline's pending entries are accurate there. Full suite at that checkout, under a concurrent main-tree worker: 14 failed files / 27 tests of 1,006 / 12,982 in 243 s; 13 are load flakes proven by re-run alone (12 pass in two batches of 7, extensionPopup passes 14/14 as a single file), and the ONE real failure -- liquidWindowSnapshotFidelity scoring a COMMENT that 02f3bdca added to DesktopShell.tsx as a fourth predicate call site, because the ratchet's regex reads comments -- is fixed in this commit (14/14, call-site set back to the three it names). i18n-check exit 0 (12,115 keys), architecture-audit exit 0 (Nothing new), i18n-hardcoded-check exit 0 (33 files / 815 strings, none grew). All five clauses now carry live measurements on the branch alone: focused tests and full suite here, the gates here, packaged-app (primary, 2026-09-02), fresh-profile migration (fab72cac/96a7b579). Receipt: L12_GATE_SUITE.md, 2026-09-02 (primary2) section. CORRECTION 2026-09-02 late (backup), boss-audit Finding 1, re-derived here rather than quoted -- the "STILL OPEN" sentence above states this branch's red/green polarity BACKWARDS and must not be read as history. Side by side, same three files, same command `npx vitest run src/shared/__tests__/architectureBaseline.test.ts src/shared/__tests__/i18n.test.ts src/renderer/__tests__/liquidWindowSnapshotFidelity.test.ts`: in a detached worktree at HEAD (03758f25, node_modules junctioned) **3 files / 42 tests, ALL PASS**; in the shared main tree **2 failed / 40 passed**, and the two failures are exactly `architectureBaseline > has no stale baseline entries` and `i18n > catalog hygiene`. So those two identities are the SHARED TREE's blocker and are green on the branch; the condition this bullet was held open on ("the media and i18n owners hunk-scoping VideoCoreStudyOverlay.tsx and their 27 components") named two benched workers who do not own it, and would not have closed the bullet even if they had acted. The bullet's closure stands -- it was reached for the right reason by the UPDATE above, on the branch's own tip -- but the reasoning quoted from before it is false and is retracted here. SECOND CORRECTION, same date: the UPDATE's claim that the one real failure "is fixed in this commit (14/14)" was true at df751d60 and is NOT the whole story at the tip. `liquidWindowSnapshotFidelity` was RED AGAIN at c51e4232 for a second, unrelated reason -- the zoom re-fit added a real fourth `.map(winToSnapshot)` against a count pinned at 3 -- because 0227993f reworded the comment rather than repairing the instrument. Fixed at **03758f25**: every counting/enumerating assertion in that suite now reads a comment-stripped copy of the shell, with an in-suite fixture control plus two mutation controls against the real file (prose naming two call sites -> still green; a hand-built literal beside a converter call -> red). 15/15. -->
- Produce a final visual atlas and remaining-risk report.  <!-- status: closed; evidence: 2026-09-02 (primary2), 17b3d833 + 583195d1. BOTH INSTRUMENTS EXIST, BOTH FIRE THEIR OWN CONTROLS, AND THE FIRST CERTIFYING ATLAS IS BANKED -- but the bullet stays open on ONE WORD, `final`: the atlas is derived from bullet 1's matrix, so it is only as final as that matrix, and bullet 1 is open. `probes/l12-atlas.cjs` assembles any `l12-visual-matrix/v1` manifest OFFLINE -- it touches no bridge, deliberately, because a release atlas must be rebuildable from banked evidence after the app that made it is gone (the matrix REFUSES without debug/bridge.json). Four checks, each against a fabrication this repo has already shipped somewhere: coverage recomputed from the manifest's own cartesian product; AXIS EFFECTIVENESS (hold three axes, vary the fourth, count distinct sha256s); integrity by RE-HASHING every indexed PNG from disk; duplicate grouping. THE RUN: 25 of 25 canonical DESKTOP_WIN_SECTIONS opened = 100% app-universe, 3 themes x 2 presentations x 1 state = 150 declared cells, 141 captured, 138 distinct, 0 never-attempted, 13 unconverged, integrity all-present / 0 mismatches. Matrix controls C1-C4 ALL PASS -- the first non-VOID run of this matrix at scale (the 650-cell run failed C1). Atlas mutation controls 4 of 4 fire: drop a cell -> coverage reports the gap; flatten the images -> the effective axis is reported decorative; corrupt one sha256 -> integrity reports the mismatch; drop an app -> coverage falls by exactly that app. TWO FALSE VERDICTS FROM MY OWN INSTRUMENT, both caught by a follow-up measurement and both fixed in the commit that found them. (1) `--states normal,maximized` came back `partial` and scored `certifiable: true`. It is not: THE MATRIX DRIVES NO MAXIMIZE AT ALL -- `for (const state of states)` sets nothing, no code reaches a maximize control, and `--states` appears only in the usage line. Every duplicate image in that run was a state pair, 5 of 8 comparable groups byte-identical under two labels; the 3 that differed are content drift, and the giveaway is geometric -- all 8 groups had a byte-identical rect (820px in every cell) and a maximize necessarily changes geometry. Geometry is now a second independent signal and a `partial` axis is a BLOCKER, because incidental drift is exactly how a dead axis dodges `decorative`. THE FIX BELONGS TO BULLET 1 AND ANOTHER WORKER -- reported, not repaired. (2) The full run then reported "9 cells failed to capture" and refused to certify; all nine are `city`, `musicwidget`, `visualizer` in Liquid, and the manifest already said why -- those three windows offer NO presentation toggle. A cell that cannot exist is not a cell that failed. Non-captured cells are now classified from the manifest's own record into `unavailable` (product gap, named by surface, does not block) vs `failed` (blocks); attainable 141, attainable completeness 100%, and the product gap is published as its own line: 3 of 25 surfaces have no Liquid presentation at all. SAMPLED-OUT, per RULE C and on BOTH axes: 0 apps; 10 of 13 themes (dark-nebula, soft-sepia, ocean-blue, mint-green, rose-pine, oled-black, midnight-ink, paper, cyberpunk, forest-night) = 23.08% theme-universe. THE RISK REPORT is GENERATED, not written -- `probes/l12-risk-register.cjs` re-derives 8 risks from the tree every run, because a prose register rots silently and a hand-edit is a claim with no measurement behind it. 5 open (2 high) / 3 closed / 0 unmeasured at 583195d1. R2 is the generalised form of the studyWorkspace.css production-build kill: 7,749 relative specifiers under src/ swept, 7,722 resolved, 0 untracked -- and its control PLANTS an untracked module imported by an untracked importer, confirms the sweep finds exactly 1, tears both down and re-asserts the original finding set. R6 CLOSED by the atlas. R8 (the repo's own gates) is open on the inherited i18n catalog-hygiene case. 3 of 3 armable register controls fire; R1/R5/R6/R7/R8 are reported `unfalsified` rather than given a fake control. WHAT REMAINS, exactly: re-run `l12-atlas.cjs` over bullet 1's FINAL matrix once bullet 1 sweeps all 13 themes and actually drives the state axis. Artifacts: `baselines/l12-atlas.json` (150 plates, sha256 per cell), `baselines/l12-risk-register.json`, `L12_REMAINING_RISK.md`; the contact sheet and the PNGs live in gitignored `debug/shots/` -- no binaries in git, the sha256s stay checkable forever. UPDATE 2026-09-02 (backup), 557cdf3b + ed9a9f05: THE BLOCKER THIS BULLET WAS WAITING ON IS FIXED, AND IT WAS IN THE PLATE NAMESPACE. l12-visual-matrix.cjs named plates by their four dimension coordinates alone, so any two runs sharing a coordinate wrote the same path and the later destroyed the earlier image while the earlier manifest kept asserting a hash. Fixed with a per-run DIRECTORY, not a longer filename -- a run-tagged filename is still one namespace and a re-run with identical flags collides again; default id is unique without being asked (basename + UTC stamp + pid), runId/shotDir ride in the manifest. A THIRD independent instrument agrees with primary2s two: 723 indexed cells -> 701 distinct paths, 22 written twice, 21 disagreeing, all oled-black, all stale for l12-matrix-normal.json, all on-disk hashes equal to tries40s own; 680 verified / 0 missing. NEW FACT: 16 of the 21 were converged:true in BOTH runs, so "only the flaky cells were overwritten" is false and convergence does not make a plate reproducible across runs. RE-CAPTURED LIVE ON THE SAME PROFILE (pid 53288 -- a scratch profile would be a different scene and the theme axis would then compare scenes): 25 apps x oled-black x standard/liquid x normal = 50 cells, 46 captured, integrity ALL-PRESENT, 0 mismatch / 0 missing, controls C0-C5 all pass, certifiable:true, banked as baselines/l12-matrix-oledblack.json. DISCRIMINATING CONTROL, a counterfactual on this very run: all 46 of these plates WOULD have overwritten banked plates under the old naming (damage 21 -> 67); with the fix, 0 of 46 collide. Ratcheted by src/shared/__tests__/l12PlateIdentity.test.ts, 4 mutation controls all firing, legacy three FROZEN at their known damage because those images are gone. One capture failure, agent/standard Error: UnknownVizError, is NOT a product defect -- driven alone it captures in both presentations converged in 4 attempts, a compositor flake under a 25-window desk. STILL OPEN on ONE WORD, unchanged: `final` means bullet 1s FULL matrix, and 21 of its 611 plates remain permanently unverifiable from disk. That is an evidence gap to state, not a reason to flip bullet 1 -- the run happened and its controls passed; only re-verification of those 21 hashes is lost. UPDATE 2026-09-02 (primary), 9c6474f9: TWO OF THIS BULLET'S THREE STANDING BLOCKERS WERE THE ASSEMBLER, NOT THE EVIDENCE, AND THE 21 UNVERIFIABLE PLATES ARE RECOVERED. Bullet 1's evidence is THREE manifests and structurally cannot be one -- the matrix is a live instrument, so it swept 13 themes at normal, a separate maximized run for the state axis, and backup's oled-black re-capture after the plate-namespace fix. `l12-atlas.cjs` read a single file, so it could never report the state axis as anything but `not-swept`, and it re-hashed stale plates whose replacements sat in a manifest it could not open. `--manifest` now takes a comma-separated LIST where order is precedence. Over bullet 1's full evidence: state axis `not-swept` -> **effective**, integrity **CORRUPT (21 mismatches) -> all-present (0)**. DISCRIMINATING CONTROL, the same merge minus the re-capture: 21 mismatches / 0 superseded against 0 / 50 with it, so supersession is measured rather than assumed. Two merge rules, both aimed at how a merged artifact lies here: NOTHING DERIVED IS MERGED (only cells/dimensions/apps union; every computed block re-derives from the union, because hand-merging a computed block while its inputs move is exactly how a merged ledger keeps pre-merge counts), and SUPERSESSION IS COUNTED AND NAMED per source. Certification is conjunctive -- one uncontrolled manifest voids the atlas instead of being averaged away. FOUND BY THE MERGE, the same defect one axis over: 4 of the 5 `failed` cells were the sticky note at maximized, where the manifest's own error says a frameless note has no maximize control. That is a PRODUCT GAP being counted as a capture failure, because `classify()` understood unavailability only on the presentation axis; it now also matches the harness's own emitted clause, deliberately narrowly, and the `agent` UnknownVizError compositor flake STAYS `failed` as that rule's negative control. `unavailableReason` also described two different gaps with whichever string it met first, so gaps are grouped and named per reason. Backward compatible: a single manifest yields byte-identical coverage/axes/integrity/duplication/blockers/plates with `multiRun` null; all 4 atlas mutation controls fire on the merged run (4 fired / 0 failed / 0 n/a). BANKED: `baselines/l12-atlas-final.json`, **750 plates, certifiable FALSE**, 100% app-universe and 100% theme-universe, integrity all-present. THE BULLET STAYS OPEN, and the reason is now a MEASURED number instead of the word `final`: **550 of the full 1,300-cell product were never attempted** -- the state axis was swept at 2 of 13 themes -- plus the 1 `agent` flake. That is bullet 1's gap, not the atlas's, and closing it means one more maximized sweep across the remaining 11 themes. UPDATE 2026-09-02 late (backup), `288dd6f5` + this commit: **CLOSED.** The blocker above is quoted verbatim and answered with its own number -- `neverAttempted` is **0**. `l12-matrix-normal-v2.json` did not stand (228 unconverged cells scored under the pre-`0c0cd38a` byte-identity gate, exit 1, not re-scorable from disk), so it was RE-CAPTURED under the corrected harness on the same live instance: `l12-matrix-normal-v3.json`, sha256 `4cf0db68067384bf...`, **EXIT 0**, 25 apps x 13 themes x 2 presentations x normal = 650 cells / **624 captured / 624 distinct**, `themeMisapplied` 0, `unsettled` 0, `stateBlocked` 0, certifiable. The number it existed for: **unconverged 228 -> 37**, `settledByTolerance` 318, `worstResidualDelta` 8. HONEST ON THE FLOOR, because `maximized-v2`'s was 0.000%/d0 and this one is not: v3's C0 is `identical:false`, **maxDelta 1**, pctDiff 0, pctOver8 0 -- one channel level of noise, inside the gate, not byte-identity. C1 0.002% / C2 **97.924%** / C3 **35.442%** / C4 **74.149->74.161%** / C5 geometric 475,600 -> 966,960 px. THE ATLAS, assembled over `maximized-v2 + normal-v3` and nothing else (those two ARE the whole product; the three legacy manifests would only re-import 21 unverifiable hashes): `l12-atlas-final-v2.json`, sha256 `eab1d3fc0f9f03bf...` -- **1,300 declared / 91 unavailable / 1,209 attainable / attainable completeness 100% / failed 0 / neverAttempted 0**, integrity RE-HASHED FROM DISK **1,209 verified, 0 missing, 0 mismatch, all-present**, all four axes `effective`, `blockers: []`, certifiable, 100% app-universe (25 of 25) and 100% theme-universe (13 of 13) with `sampledOut` EMPTY, atlas mutation controls 4 fired / 0 failed. The 91 unavailable are published as a PRODUCT gap, not a capture failure: `note`+`city` have no maximize control (39 cells, frameless chrome), `visualizer`+`city` no presentation toggle (52 cells). THE RISK REPORT is regenerated, never hand-edited: 9 risks, **6 open (3 high) / 3 closed / 0 unmeasured**, 4 of 4 controls fire. R6 closed at `288dd6f5` -- and that was a real instrument defect, not a loosened verdict: the register read ONE hardcoded atlas filename, so a certifying atlas banked under any other name was invisible and R6 stayed HIGH on a blocker that had already been repaired. Its control is discriminating -- default (newest of 3 candidates) 6 open / R6 closed, versus `--atlas <the stale file>` on the same tree 7 open / 4 high / R6 open on the same 21-hash blocker. R9 STAYS OPEN ON LEGACY DAMAGE ONLY and the number says so: its 22 doubly-claimed plate paths are claimed exclusively by `l12-matrix-normal.json` and `l12-matrix-tries40.json`, both pre-dating the per-run directory fix `557cdf3b`, while `normal-v3` wrote 624 plates and added **0** collisions. R5/R8 are red in the SHARED TREE only (boss-audit Finding 6, two foreign ` M` files) and must not be read as branch blockers -- that inversion was Finding 1. An open risk register is not a reason to hold this bullet: the bullet says PRODUCE the report, and a remaining-risk report with zero remaining risks would be the suspicious outcome. Receipt: `L12_VISUAL_CERTIFICATION.md`, 2026-09-02 late (backup). CORRECTION 2026-09-03 (primary2), and it RETRACTS the numbers my own previous correction put here. That earlier text said `2b5a73cf` moved presentability "22 of 25 -> **23 of 25**" and the unavailable cells "39 -> **26**". BOTH WERE WRONG, and they were wrong because they were computed off the COMMITTED matrices while the live evidence had already moved past them. Re-derived this turn from the manifests themselves, not from prose: `l12-matrix-normal.json` (02:51Z) reads `appsPresentable` **22**, but `normal-v2` (15:34Z), `maximized-v2` (16:09Z) and `normal-v3` (21:23Z) all already read **23** -- and the 23rd is **`musicwidget`**, not `city` (set-differenced app-by-app off the two manifests' `apps` blocks). `2b5a73cf` landed 2026-09-03T02:10Z, AFTER all three, so city is not in any of them. The true figure is therefore **23 -> 24 of 25**, and the unavailable total **91 -> 78**, not 39 -> 26 (39 and 91 are different artifacts' numbers and the earlier text conflated them: `l12-atlas-final-v2.json` reports 91 = **39** `note`+`city` no-maximize + **52** `visualizer`+`city` no-presentation-toggle). MEASURED, NOT PREDICTED -- two targeted sweeps on a scratch instance serving THIS worktree (pid 42468 / port 39274, Vite 5174 verified to serve `return section !== 'visualizer';` before starting): `l12-matrix-city-normal-v1.json` (sha256 `388d283a28e8cf7e67ab...`, runId `l12-cal-city__20260903T030257Z__14648`) = 26 cells / **26 captured** / `appsPresentable` 1 / 26 distinct images, i.e. city's 13 liquid cells that were `unavailable` are now CAPTURABLE; and `l12-matrix-city-maximized-v1.json` (sha256 `b758671853bd7bb4fb6f...`) = 26 cells / **0 captured / 26 `stateBlocked`** / `appsPresentable` 1, i.e. city's no-maximize gap grows 13 -> 26 cells because it now has a second presentation to be blocked in. Net -13 on `unavailable`: 91 - 13 = **78**, attainable 1,209 -> **1,222**. Both manifests are gitignored by `.gitignore:235` (`src/.coordination/**/*-matrix*.json`), so the sha256s above are the checkable artifact, as with every other v2/v3 manifest this bullet cites. WHAT IS STILL OWED, stated with its measured cost so it is not mistaken for done: the arithmetic above is composed from the published atlas plus two targeted runs, NOT re-derived by a single `l12-atlas.cjs` pass, because that pass re-hashes every indexed plate from disk and `normal-v3`/`maximized-v2`'s 1,209 plates live in the MAIN tree's `debug/shots/`, not this worktree's. A self-contained re-derivation needs both 650-cell sweeps re-captured here; calibrated on the city run at **3m17s for 26 cells**, that is roughly 40 min per state axis plus the atlas. It is named here so the composed number is never quoted as a fresh atlas run. -->

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
