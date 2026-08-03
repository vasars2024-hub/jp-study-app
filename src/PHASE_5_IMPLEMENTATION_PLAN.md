# Phase 5 Implementation Plan

Phase 5 completes the Secret OS identity and release readiness. It must reuse
the existing shell, theme, display, environment, sound, companion, settings,
storage, and packaging systems. Do not create a second shell, boot engine,
sound engine, wallpaper engine, companion engine, or Anime frontend.

Do not begin product implementation until this plan is approved.

## Current Progress

Completed:

- M0 - Final-state audit and grounded plan.
- M1 - End-to-end lifecycle orchestration.
- M2 - Immersive boot animation proof.
- M3 - Startup, Welcome, Sleep, Wake, Shutdown Finalization.
- M4 - Audio Identity Proof Pack.
- M5 - Full Original System Audio Pack.
- M6 - Default Nostalgic Wallpaper Pack.
- M7 - Final Original Icon System.
- M8 - Desktop First-run Personality.
- M10 - Companion Finalization.
- M12 - Personalization And Unlockables.
- M13 - Easter Eggs And Fictional OS History.
- M14 - Notifications And System Feedback.

M9 - Anime Edition: deferred by user decision (2026-07-24); revisit once art
direction is given.

M11 - Conditional Outside-app Companion: infrastructure already built and
functionally verified in-sandbox (see its status block below); left open
pending the hands-on multi-monitor/click-through QA its own checkpoint
requires.

Next unfinished milestone: M15 - Virtual Display And Edition Finalization.

Phase 4.75 adjustment: the corrective pass is now complete through M8. Shell
utilities, widgets, secondary apps, fringe surfaces, embedded utility panels,
Music, and app-specific contextual overlays are part of the Aero baseline.
Phase 5 must not re-open app composition cleanup unless live QA finds a
concrete regression; boot/reveal work should treat the corrected desktop and
apps as the reveal target.

## Verdict

Ready for Phase 5 implementation after approval.

No major Phase 4.5 application reconstruction needs to block Phase 5. Final
visual screenshots and live Secret OS QA remain required evidence, but they are
validation work, not a reason to restart Phase 4.5.

## Boot Experience Proposal

Visual metaphor: glass-orb coastline. A small original Study OS emblem forms
from water rings, soft light trails, bubbles, and one leaf-like accent. Use one
coherent metaphor; do not combine every effect.

Sequence:

1. Study OS dims and input is suspended safely.
2. Deep blue pre-boot atmosphere appears.
3. Emblem assembles with water rings and glass highlights.
4. Secret OS name and edition appear.
5. Startup sound resolves with the emblem.
6. Welcome state shows profile name, time, mute, skip, and accessibility entry.
7. Desktop reveals in order: wallpaper, light, taskbar, icons, windows,
   particles/weather, companion, ambient audio.

Timing:

- Normal: 4 to 8 seconds.
- Warm restart: shorter.
- Reduced sensory: static/short version.
- Skip: available after the initial safety transition by keyboard or pointer.

Fallback:

- If an asset fails, use static emblem and continue.
- If boot exceeds timeout, reveal desktop and notify recoverably.
- Safe mode bypasses effects, custom assets, companions, and ambient audio.

## Audio Identity Proposal

Direction: warm, crystalline, airy, optimistic, water-and-glass technology. It
may evoke XP warmth and Vista polish, but cannot copy melodies, samples, chord
shapes, or arrangements.

Proof pack:

- `system.startup`
- `system.shutdown`
- `notification.notify`
- `ui.info`
- `ui.warning`
- `ui.error`
- `ui.confirm`

Semantic routing:

- Extend existing `shellSounds.ts` event mapping.
- Keep all playback through `soundEngine`.
- Add events only where lifecycle and shell actions already have a single
  semantic source.

Volume architecture:

- Reuse master volume and mute in `soundEngine`.
- Add system, notification, ambient, and companion category controls after the
  proof pack validates.
- Reduced sensory lowers repeated sounds and ambient audio together.

Mixing rules:

- Never overlap startup and welcome.
- Throttle notification sounds.
- Duck environment for important chimes.
- Stop loops on exit/safe mode/shutdown.

Production workflow:

1. Add representative original proof sounds with provenance.
2. Test in context.
3. Approve direction.
4. Produce the remaining pack.
5. Record every asset in provenance docs.

## Wallpaper And Edition Proposal

Default wallpaper:

- Original nostalgic anime-inspired Frutiger Aero scene.
- Bright sky, clouds, water/shoreline, green landscape, glass-like technology,
  warm light, optional original mascot/character.
- Must support desktop icon readability.
- Must not use copyrighted characters, copied composition, commercial branding,
  or fan art.

Scenery alternatives:

- Scenery-only default alternative.
- Nighttime.
- Rainy.
- Aqua/eco-futuristic.
- Personal-room or desktop-room variation.

Edition boundary:

- Anime Edition is an asset/presentation profile over the same Secret OS.
- Use theme/asset-pack hooks.
- Do not fork the shell, applications, data, or settings.

4:3 outer treatment:

- Classic 4:3 keeps the world inside the virtual display.
- Outer stage remains atmosphere only; do not duplicate wallpaper rendering.
- Native Display uses the same assets with responsive framing metadata.

## Asset Production Plan

Current placeholders:

- Silent sound pack.
- CSS-gradient wallpapers.
- Asset-pack hooks without production packs.
- Glossy icon plate treatment rather than final icon pack.
- No cursor pack.
- No production provenance manifest.

Samples to create first:

- One boot visual proof.
- Seven sound proof clips.
- One default wallpaper sample plus one scenery-only sample.
- One icon family sample: Start emblem, folder, app, notification, lifecycle.

Approval checkpoints:

- Test every sample in actual Secret OS.
- Verify default Study OS boundary.
- Verify reduced sensory, mute, and 4:3/Native framing.
- Record creator/source/license before expanding the pack.

Packaged-build requirements:

- No absolute local asset paths.
- Assets must load from packaged app paths.
- Missing assets fall back safely.
- License/provenance file must ship with production assets.

## Optional Feature Decisions

| Feature | Decision | Reason |
| --- | --- | --- |
| Anime Edition | Include after core completion | Asset-pack architecture exists; value is high, but it depends on core assets. |
| Custom cursors | Include after core completion | Nice identity layer, not required for lifecycle readiness. |
| Outside-app companions | Defer unless stable | Host exists, but release risk is high across monitors and OS focus. |
| Animated wallpapers | Include after static pack proof | Framework supports video/animated, but performance must be measured. |
| Unlockable sound packs | Include after core completion | Use achievements lightly; avoid manipulative progression. |
| Seasonal boot variants | Defer | Core boot must be excellent first. |
| Easter eggs | Include after core completion | Keep few, high-quality, and recoverable. |
| Fictional OS history | Include after core completion | Low technical risk, high personality, but not a release blocker. |

## Milestones

### M0 - Final-state Audit And Grounded Plan

- Objective: produce Phase 5 audit and implementation plan.
- Reason: avoid duplicating mature systems or absorbing Phase 4.5 leftovers.
- Existing systems reused: repository docs and inspection only.
- Likely files: `src/PHASE_5_AUDIT.md`, `src/PHASE_5_IMPLEMENTATION_PLAN.md`.
- Visible/audible result: none.
- Risks: missing live screenshot evidence.
- Tests: document review.
- Checkpoint: compare plan against Phase 5 brief.
- Accessibility: identify required reduced-sensory and boot controls.
- Performance: identify long-session scenarios.
- Commit boundary: audit/plan only.
- Defer conditions: none.

### M1 - End-to-end Lifecycle Orchestration

- Objective: define and wire one lifecycle state machine for Secret Mode entry,
  boot, welcome, desktop reveal, exit, restart, sleep, wake, and shutdown.
- Reason: later assets need reliable ordering and fallback.
- Existing systems reused: `SecretAeroTrigger`, `AeroBootOverlay`,
  `DesktopShell`, `EnvironmentStack`, `soundEngine`, desktop persistence.
- Likely files: lifecycle module under `src/renderer`, `AeroBootOverlay`,
  `SecretAeroTrigger`, shell event routing.
- Visible/audible result: predictable sequence with placeholder visuals.
- Risks: blocking input, double initialization, default-theme leakage.
- Tests: enter/exit Aero repeatedly; skip; reduced motion; default theme.
- Checkpoint: desktop reveal order in 4:3 and Native Display.
- Accessibility: skip, keyboard, reduced motion, mute placeholder.
- Performance: no duplicate timers/listeners after repeated entry/exit.
- Commit boundary: lifecycle orchestration only.
- Defer conditions: final art/audio.
- Status: Complete. Added the Secret OS lifecycle state module, moved
  `AeroBootOverlay` onto lifecycle state, preserved `shell:softReboot`, added
  explicit entry/restart/sleep/wake/shutdown/fallback phases, and wired skip,
  mute, startup, and shutdown hooks without final art/audio.
- Verification: focused ESLint, `npm test`, and
  `npx vite build --config vite.renderer.config.ts` passed. Build still reports
  the known Vite/CSS/chunk warnings tracked before this milestone.

### M2 - Immersive Boot Animation Proof

- Objective: build one representative boot sequence using approved sample or
  temporary internal assets.
- Reason: validate timing, metaphor, and safety before asset expansion.
- Existing systems reused: `AeroBootOverlay`, `displayPrefs`, `soundEngine`.
- Likely files: `AeroBootOverlay`, Aero shell CSS, lifecycle state module.
- Visible/audible result: OS-like boot proof, not a spinner/loading screen.
- Risks: too long, flashy, or expensive.
- Tests: skip, timeout, missing asset fallback, reduced motion, mute.
- Checkpoint: boot screenshots/video in 1024x768, 1280x960, 1600x1200,
  and Native Display.
- Accessibility: static version, no rapid flashing, screen-reader status.
- Performance: boot CPU/GPU, timer cleanup.
- Commit boundary: boot proof only.
- Defer conditions: multiple variants.
- Status: Complete. Built the first internal boot proof around a glass coastline
  and original leaf/glass emblem using CSS/React only, extended normal
  lifecycle timing to feel like a real OS entry, kept reduced-motion short, and
  preserved skip/mute controls.
- Verification: focused ESLint, `npm test`, and
  `npx vite build --config vite.renderer.config.ts` passed. Build still reports
  the known Vite/CSS/chunk warnings tracked before this milestone.
- Phase 4.75 adjustment: boot reveal should validate against the corrected
  Aero desktop/app baseline, including the M7 Music reconstruction.

### M3 - Startup, Welcome, Sleep, Wake, Shutdown Finalization

- Objective: complete lifecycle surfaces around the approved boot architecture.
- Reason: Secret OS must feel complete from arrival through exit.
- Existing systems reused: lockscreen, desktop state, environment, companions,
  sound routing.
- Likely files: lifecycle module, `Lockscreen`, shell overlays, settings.
- Visible/audible result: welcome, sleep dim, wake reveal, shutdown fade.
- Risks: lost state, lingering companion/audio windows.
- Tests: cold launch, warm restart, sleep/wake, shutdown, exit to Study OS.
- Checkpoint: lifecycle screen captures.
- Accessibility: skip/mute/access controls on welcome and boot.
- Performance: environment and companion loops pause while sleeping.
- Commit boundary: lifecycle surfaces.
- Defer conditions: final sound pack.
- Status: Complete. Expanded the lifecycle-driven overlay into a fuller
  welcome surface with profile/time/mute/reduced-motion controls, added
  intentional sleep, wake, and shutdown visual states, centralized Secret OS
  shutdown through the existing Aero exit path, and wired Aero Start menu power
  actions for sleep, restart, and shutdown without introducing a second shell.
  Lifecycle state now marks the document so particles and companions pause
  during suspended phases.
- Verification: focused ESLint passed with only existing DesktopShell unused
  warnings. `npm test` and `npx vite build --config vite.renderer.config.ts`
  passed. Build still reports the known Vite/CSS/chunk warnings tracked before
  this milestone.

### M4 - Audio Identity Proof Pack

- Objective: add seven representative original sounds and route them
  semantically.
- Reason: validate the audio language before full production.
- Existing systems reused: `soundEngine`, `soundPack`, `shellSounds`,
  `QuickSettings`.
- Likely files: `public/sounds/aero`, sound manifest, provenance docs.
- Visible/audible result: startup, shutdown, notification, info, warning,
  error, confirmation.
- Risks: autoplay, volume, overlap, legal similarity.
- Tests: preview, repeated playback, mute, volume, reduced sensory.
- Checkpoint: audio captures or manual audio QA notes.
- Accessibility: full mute and reduced sensory must work.
- Performance: no leaked AudioContext nodes or loops.
- Commit boundary: audio proof pack.
- Defer conditions: full pack.
- Status: Complete. Added the source-generated `secret-aero-proof` pack with
  seven original WAV data-URL cues, bound it to the hidden Aero theme through
  the existing asset-pack system, routed startup/shutdown, notification kind,
  and dialog confirmation semantics, and added a Quick Settings preview button.
  The pack stays inside `src/` to respect project scope; no public loose assets
  or external samples were introduced.
- Provenance: `src/PHASE_5_AUDIO_PROOF_PROVENANCE.md`.
- Verification: focused ESLint, `npm test`, and
  `npx vite build --config vite.renderer.config.ts` passed. Build still reports
  the known Vite/CSS/chunk warnings tracked before this milestone.

### M5 - Full Original System Audio Pack

- Objective: complete approved semantic sound set with controls and throttling.
- Reason: complete OS identity without noisy UX.
- Existing systems reused: sound engine categories, shell event buses,
  notification store.
- Likely files: sound manifest, settings, `shellSounds`, notification routing.
- Visible/audible result: restrained system audio across lifecycle and shell.
- Risks: repetitive sounds, overlap, missing provenance.
- Tests: all semantic events, DND, mute, category volumes, repeated restarts.
- Checkpoint: audio checklist.
- Accessibility: reduced sensory category suppression.
- Performance: decode/cache behavior and cleanup.
- Commit boundary: full audio pack.
- Defer conditions: optional unlockable packs.
- Status: Complete. Expanded the original source-generated Aero pack into a
  fuller nostalgic system family covering startup, shutdown, restart, sleep,
  wake, notification variants, dialog/menu/window chrome, achievement,
  companion, and a shared ambient bed. Added persistent per-category sound
  volumes in `soundEngine`, compact Quick Settings mixer controls, reduced
  sensory gain damping, notification throttling, environment ducking for system
  chimes, and semantic routing for lifecycle, notification, dialog, window,
  companion, and achievement events.
- Provenance: `src/PHASE_5_AUDIO_PROOF_PROVENANCE.md`.
- Verification: focused ESLint passed with only existing DesktopShell unused
  warnings. `npm test` and `npx vite build --config vite.renderer.config.ts`
  passed. Build still reports the known Vite/CSS/chunk warnings tracked before
  this milestone.

### M6 - Default Nostalgic Wallpaper Pack

- Objective: add original default wallpaper and scenery alternatives.
- Reason: first-run Secret OS must not feel empty or generic.
- Existing systems reused: wallpaper framework, `WallpaperStage`,
  `wallpaperLibrary`, desktop wallpaper state.
- Likely files: wallpaper pack registry, assets under approved location,
  provenance docs, settings picker.
- Visible/audible result: default character scene and scenery variants.
- Risks: readability, copyrighted similarity, asset size.
- Tests: icon readability, 4:3/Native framing, missing file fallback.
- Checkpoint: wallpaper screenshots across display modes.
- Accessibility: reduced motion for animated/video variants.
- Performance: decode time and memory.
- Commit boundary: wallpaper proof/pack.
- Defer conditions: animated pack if static is not approved.
- Status: Complete. Added the original, bundled `secret-aero-nostalgia`
  wallpaper pack with a character-led first-run scene and four scenery
  alternatives (coastal morning, lagoon night, rain garden, and study room).
  The existing wallpaper registry, asset-pack binding, settings picker, living
  wallpaper stage, and Aero environment persistence are reused. Each static SVG
  has a deterministic CSS gradient fallback and no external dependency.
- Provenance: `src/renderer/PHASE_5_WALLPAPER_PROVENANCE.md`.
- Verification: focused wallpaper/Aero persistence tests and focused ESLint
  passed; the full suite passed (147 files, 1741 tests), and the renderer
  production build passed with the repository's existing chunk warnings.
  Full-project lint remains blocked by three unrelated pre-existing errors in
  `forge.config.ts`, `BlancAppDrawerPanel.tsx`, and `vitest.config.ts`; M6 files
  pass focused lint.

### M7 - Final Original Icon System

- Objective: complete original shell/app/system icon language.
- Reason: Phase 4.5 plates were representative, not a full icon pack.
- Existing systems reused: `Icons`, app registry, asset-pack hooks.
- Likely files: icon component/assets, Aero shell CSS, provenance docs.
- Visible/audible result: cohesive Start, taskbar, desktop, folders, files,
  notifications, lifecycle icons.
- Risks: too detailed at small sizes, copyright resemblance.
- Tests: inspect at desktop/Start/taskbar/toolbar/menu sizes.
- Checkpoint: icon sheet and in-context screenshots.
- Accessibility: contrast and non-color status cues.
- Performance: no oversized asset payload.
- Commit boundary: icon system.
- Defer conditions: cursor pack.
- Status: Complete. Added the `secret-aero-icons` pack: a declarative registry
  (`theme/iconPacks.ts`) plus the pack data (`theme/aeroIconPack.ts`), consumed
  by a single renderer in the existing `Icons` component so all 61 call sites
  needed no change. Applications render as a glass-plate tile in one of twelve
  family gradients carrying the existing line glyph; shell objects (folders,
  files, drives, discs, the bin), status, and lifecycle icons render as real
  filled silhouettes. Status (info/warning/error/success) and lifecycle
  (power/sleep/restart/logout/lock) icons are each a distinct silhouette, not a
  recolored outline, and the shape is exposed via `data-icon-shape` for
  automated and assistive checking. Inline chrome (search, close, chevron, etc.)
  stays a monochrome line glyph by design, and an application tile falls back to
  its line glyph below 17px so window-chrome-scale icons never render mud. The
  pack is wired through the existing `assetPack.icons` hook — no new extension
  point — and is idempotent to register.
- Provenance: `src/renderer/PHASE_5_ICON_PROVENANCE.md`.
- Verification: `src/renderer/__tests__/aeroIconPack.test.ts` (pack integrity,
  non-colour differentiation, resolution, activation) and a generated icon
  sheet reviewed at 48/32/24/16px on both light and dark backdrops. Full suite
  passed (166 files, 1900 tests). Live-checked in the running app: Start menu,
  taskbar task buttons, desktop icons, and system tray all repaint correctly on
  switching into and out of the Aero theme, with no console errors. Focused
  ESLint on touched files is clean (pre-existing warnings only, no errors).

### M8 - Desktop First-run Personality

- Objective: compose the default Secret OS desktop.
- Reason: the user should arrive somewhere memorable, not a blank canvas.
- Existing systems reused: desktop layout store, Start pins, widgets,
  environment presets, wallpaper packs.
- Likely files: desktop seed/migration, first-run Secret OS prefs, settings.
- Visible/audible result: curated icons/widgets/environment at first entry.
- Risks: affecting default Study OS or overwriting user layouts.
- Tests: first-run only, existing user migration, reset, default-theme boundary.
- Checkpoint: full desktop screenshot.
- Accessibility: no overwhelming motion/audio by default.
- Performance: startup impact of default widgets/effects.
- Commit boundary: first-run personality.
- Defer conditions: final wallpaper not ready.
- Status: Complete, scoped down from "icons/widgets" to widgets only. The
  desktop layout store is shared with Study OS (keyed by desktopIndex, not by
  theme) and schema v2 deliberately ships an empty desktop with apps pinned
  from Start rather than auto-seeded icon tiles — reintroducing seeded app
  icons would undo that migration, so `icons` is untouched. The
  living-environment half (wallpaper, particles, companion) was already
  Aero-scoped by M2/M3's `applyAeroEnvironment()`. What M8 adds:
  `aeroDesktopPersonality.ts` seeds one curated widget pair (`clock-analog` +
  `word-of-the-day`, sized to match the widget registry's own defaults) onto
  the desktop the user is viewing, gated by `markAeroDiscovered()`'s one-time
  return so it fires exactly once ever. Independently of that gate,
  `buildAeroPersonalityWidgets` refuses to add anything if the target desktop
  already carries any widget — covering both "already seeded" and "user placed
  their own before ever finding Aero" (widgets are shared across themes) in one
  conservative check. Wired into `SecretAeroTrigger`'s entry path,
  fire-and-forget so a failed IPC round trip never blocks entering Aero.
- Verification: `src/renderer/__tests__/aeroDesktopPersonality.test.ts` (pure
  seed logic, and a wired round trip against a stubbed `window.api` that
  mirrors the real main-process `desktop:changed` broadcast — an earlier stub
  that only echoed the initial read masked a real double-commit path, which the
  test caught). Full suite passed (168 files, 1910 tests); ESLint clean on
  touched files. Live-checked in the running app: first entry seeds both
  widgets at the expected position/size with the companion and environment
  active alongside them; exiting and re-entering Aero commits nothing further;
  no console errors.

### M9 - Anime Edition

- Objective: implement Anime Edition as a coordinated asset/profile layer over
  the same Secret OS.
- Reason: high-identity option without forking frontend/data.
- Existing systems reused: theme engine, asset packs, wallpaper/sound/icon
  registries, settings.
- Likely files: theme registration, asset manifests, settings entry.
- Visible/audible result: coordinated edition switch.
- Risks: accidental default Study OS leakage, asset provenance.
- Tests: switch editions, restart, 4:3/Native, default theme unchanged.
- Checkpoint: edition screenshots and audio sample.
- Accessibility: reduced sensory applies equally.
- Performance: no duplicate environment or shell.
- Commit boundary: Anime Edition infrastructure/assets.
- Defer conditions: core asset pack not approved.
- Status: Deferred by explicit user decision (2026-07-24) — a real second
  visual identity needs art direction that is a product call, not an
  implementation one. The M1 asset-pack plumbing (`theme/assetPacks.ts`,
  `AssetPackRef` on `Theme`) already supports registering an Anime edition
  exactly the way `frutiger-aero.ts` registers Aero's, whenever direction is
  given — no rework needed to unblock it later. Proceeding to M10.

### M10 - Companion Finalization

- Objective: make companions quiet, optional inhabitants with lifecycle support.
- Reason: companions add personality but must not become noise or leaks.
- Existing systems reused: companion registry/layer/host/routines/events.
- Likely files: companion defaults, settings, lifecycle hooks.
- Visible/audible result: restrained companion presence, sleep/wake behavior.
- Risks: intrusive movement, host window residue, multi-monitor issues.
- Tests: enable/disable, lock/hide, sleep/wake, outside host off/on.
- Checkpoint: desktop with companions in 4:3/Native.
- Accessibility: disable companions, reduced motion reduces activity.
- Performance: no duplicate RAF loops or host windows.
- Commit boundary: companion finalization.
- Defer conditions: outside-app host instability.
- Status: Complete. The lifecycle mechanics this milestone asks for
  (enable/disable, per-buddy lock/hide, sleep/wake pause via the
  `secret-lifecycle-suspended` class, a single RAF wander loop that yields on
  `document.hidden`/window drag/reduced motion, throttled disk persistence, a
  final flush + `pushCompanionOsState` on unmount) were already built in an
  earlier phase and audited here rather than rebuilt — they held up under
  reading and under live toggling in the running app. The concrete gap found
  and fixed: the companion's own context menu (`CompanionLayer.tsx`) and the
  outside-app host's menu (`CompanionHostView.tsx`) were never wired into the
  i18n system — "Lock place", "Hide 1 hour", "Run: {name}", "Configure
  routines", the tooltip hint, and the treasure-lock message were hardcoded
  English, the one CLAUDE.md i18n-workflow violation surviving in the
  companion surface. Added the `companion.*` / `companion.host.*` keys to
  `catalogs/en.ts` and translated all nine (`companion.host.*` adds two more)
  into ja/zh/ru matching neighboring `settings.companions.*` style;
  `node tools/i18n-check.cjs` and the catalog-hygiene suite are clean.
- Verification: full suite passed (170 files, 1921 tests). Live-checked in the
  running app: enabling Companions and toggling lock/hide/menu actions through
  the real UI, confirming the translated labels render.

### M11 - Conditional Outside-app Companion

- Objective: include real-desktop companion only if stable.
- Reason: it is memorable but risky.
- Existing systems reused: `companionHost`, `CompanionHostView`, IPC bridge.
- Likely files: companion host, settings, recovery.
- Visible/audible result: optional transparent OS desktop companion.
- Risks: always-on-top behavior, click-through, multi-monitor, shutdown residue.
- Tests: Windows focus, monitors, close app, safe mode.
- Checkpoint: manual OS-level QA.
- Accessibility: easy off switch.
- Performance: host process/window cleanup.
- Commit boundary: outside-app companion.
- Defer conditions: any host-window instability.
- Status: Infrastructure already built in an earlier phase (`main/companionHost.ts`
  — always-on-top skipTaskbar window, click-through hit-testing, primary/all-
  display span, `powerMonitor` wake refresh — plus the full IPC surface in
  `preload.ts` and the renderer bridge `companionOsBridge.ts`) and correctly
  registered at boot (`configureCompanionHost` + `registerCompanionHostIpc` in
  `main.ts`); a settings toggle (`settings.companions.osPets` /
  `companionsOnOsDesktop`) already exposes it. This was not apparent from the
  plan's own "Completed" list, which only tracked through M6 — the same gap
  M7's status note already flagged. Live-verified this session: toggling
  "Show on Windows desktop" opens a real transparent overlay window
  (`?companionHost=1`, maximized to the display) via
  `companionHostSetEnabled`; toggling off closes it with no residue (window
  count back to baseline, no main-process errors); closing the main window
  tears the host down along with the mini-widget and lockscreen windows
  (`mainWindow.on('closed', …)` in `main.ts`). `CompanionHostView.tsx` had the
  same hardcoded-string gap as M10's menu ("Click: run routine", "Run
  routine", "Close") and was fixed in the same pass.
- Not yet done: the "manual OS-level QA" this milestone's own checkpoint
  calls for — real multi-monitor spanning, click-through under actual cursor
  input while another application has focus, always-on-top behavior against
  other real windows, and extended-session stability — was not exercised here
  (this sandbox has one display and the check was scripted through the IPC
  layer, not driven by a real mouse over a foregrounded third-party window).
  Leaving this milestone open until that hands-on pass happens; the
  "Defer conditions: any host-window instability" gate stands.

### M12 - Personalization And Unlockables

- Objective: add lightweight unlockable assets tied to existing study events.
- Reason: encourage attachment without game economy.
- Existing systems reused: achievements, settings, asset packs, notification
  store.
- Likely files: unlock registry, settings, provenance docs.
- Visible/audible result: small asset unlocks and previews.
- Risks: bloat, manipulative progression.
- Tests: unlock persistence, reset, backup/restore.
- Checkpoint: settings and notification screenshots.
- Accessibility: unlock effects respect reduced sensory.
- Performance: lazy-load optional assets.
- Commit boundary: unlockables.
- Defer conditions: core personalization incomplete.
- Status: Complete. Added "companion trinkets" — six small cosmetic keepsakes
  (`environment/companionTrinkets.ts`) tied one-for-one to the existing
  `STREAK_MILESTONES` reading-streak ladder `environment/achievements.ts`
  already celebrates (3/7/14/30/60/100 days). Deliberately additive per the
  milestone's own "manipulative progression" risk note: nothing shipped so far
  in Phase 5 — no companion, wallpaper, or icon — is locked behind this: a
  trinket is a badge a companion earns, not a gate. Reused systems exactly as
  the milestone lists: `achievements.ts`'s existing streak detector drives the
  unlock check; a new `trophy` glyph was added to the base icon set
  (`components/Icons.tsx`) and to the M7 Aero icon pack for visual
  consistency under that theme; unlocking dispatches the existing `os:toast`
  bus, which `notificationStore.ts` already promotes into Notification Center
  history for free; persistence (`jp-os-trinkets-v1`) was added to the
  `environment` domain's backup/restore/clear coverage in
  `storage/settingsCatalog.ts` alongside `jp-os-achievements-v1`. Settings UI
  is a new "Trinkets" card on the Companions page: a small grid, greyscale +
  dimmed for locked items with a "reach N-day streak" tooltip, full colour for
  earned ones. No animation on unlock beyond the standard toast, so reduced
  motion/sensory settings need no special-casing.
- Bug caught before it shipped: the first pass had `companionTrinkets.ts`
  import `STREAK_MILESTONES` from `achievements.ts` while `achievements.ts`
  imported `unlockTrinketsForStreak` from `companionTrinkets.ts` — a circular
  import. `TRINKETS`' module-level `STREAK_MILESTONES.map(...)` evaluated
  before the cycle resolved, crashing the running app with "Cannot access
  'STREAK_MILESTONES' before initialization". The full vitest suite passed
  the whole time — Vitest's module resolution order didn't reproduce the
  ordering Vite's dev server hit — so this only surfaced by running the actual
  app, which is why that step stays mandatory even when the suite is green.
  Fixed by moving `STREAK_MILESTONES` into `companionTrinkets.ts` (the module
  that needs it at eval time) and having `achievements.ts` import it from
  there instead, making the dependency one-way.
- Verification: full suite passed (172 files, 1935 tests) and again after the
  circular-import fix; `node tools/i18n-check.cjs` clean (24 new keys ×
  ja/zh/ru); a new `companionTrinkets.test.ts` covers the unlock ladder
  (additive-only, idempotent, malformed-storage fallback). Live-checked in the
  running app: all six trinkets render locked with the correct label and
  "reach N-day streak" tooltip on the Companions settings page; no console
  errors after the circular-import fix.
- Also fixed in passing: `CompanionsPage.tsx`'s Russian
  `companion.trinket.locked` plural forms pass `{count}` from the call site,
  not `{days}` — the existing `aero.found.meter.streak` key in `ru.ts` has the
  `{days}`-vs-`{count}` mismatch that silently pins Russian to the wrong
  plural form; flagged as a separate follow-up task rather than fixed here
  since it's unrelated to this milestone's files.

### M13 - Easter Eggs And Fictional OS History

- Objective: add a small number of high-quality secrets and history artifacts.
- Reason: complete the illusion without clutter.
- Existing systems reused: command palette, resources/docs, notifications.
- Likely files: small content registry, settings/help surfaces.
- Visible/audible result: discoverable lore and rare harmless surprises.
- Risks: too many weak secrets, hard-to-recover states.
- Tests: trigger, reset, no accidental activation in text fields.
- Checkpoint: screenshots of each secret.
- Accessibility: no flashing or forced audio.
- Performance: no hidden loops.
- Commit boundary: secrets/lore.
- Defer conditions: lifecycle not done.
- Status: Complete. Investigated the existing "finding" system
  (`findingModules.ts`, `findingReadouts.ts`, `AeroFindingOverlay.tsx`,
  `WiredFindingOverlay.tsx`, the Special-page terminal) before adding
  anything: that system is entirely real-data gadgets ("the fiction differs,
  the numbers do not"), not lore, so this milestone's own scope — a small
  changelog-as-lore for the fictional Secret OS — was genuinely unbuilt, not
  duplicated work.
  - `secretHistory.ts`: a 6-entry original changelog ("First Light" through
    "Keepsakes", each nodding at a real feature already shipped this phase —
    the emblem, the wallpaper pack, companions, trinkets — without breaking
    the fiction). Reachable via a new `history`/`log` command added to the
    *existing* Aero/WIRED terminal in `SpecialPage.tsx` (`runAeroCommand`/
    `runWiredCommand`) — this *is* the command-palette-equivalent surface the
    milestone asks to reuse; the terminal already had `help`/`scan`/`quiet`/
    `all`/`summon`. One entry is revealed per invocation and the reading
    position persists (`jp-os-secret-history-v1`), so `history` reads as a log
    being paged through rather than a wall of text dumped at once — directly
    answers the milestone's own "too many weak secrets" risk note.
  - One typed easter egg, not several, for the same reason: typing "leaf"
    anywhere outside a text field (`theme/SecretHistoryTrigger.tsx`, mirroring
    `SecretAeroTrigger.tsx`'s exact `isTypingTarget` + rolling-buffer pattern)
    shows a one-time toast ("You found the second door"), which
    `notificationStore.ts` promotes into Notification Center for free. The
    word is chosen deliberately: it's the Secret OS emblem's own material (the
    glass leaf), and the History log's "second-door" entry hints at it
    in-universe ("a word this OS is made of") without spelling it out.
  - No flashing/forced audio (plain toast only); no hidden loops (both
    triggers are event-driven `keydown` listeners, not intervals); persistence
    for both (`jp-os-secret-history-v1`, `jp-os-secret-leaf-v1`) added to a new
    `secret-lore` entry in `storage/settingsCatalog.ts` for backup/restore/
    reset coverage.
- Verification: full suite passed (175 files, 1949 tests); a new
  `__tests__/secretHistory.test.ts` covers paging order, wraparound,
  cross-reload persistence, and malformed-storage fallback.
  `node tools/i18n-check.cjs` clean. Live-checked in the running app: typing
  "leaf" on the desktop produced the toast and a Notification Center entry
  with the exact expected text, and did not fire a second time on repeat;
  typing `history` three times in the Aero terminal correctly revealed
  entries v0.1 → v0.4 → v0.7 in order; no console errors.

### M14 - Notifications And System Feedback

- Objective: finalize notification visuals, audio, history, priority, and
  throttling.
- Reason: system feedback must be useful and restrained.
- Existing systems reused: `notificationStore`, center, bell, `shellSounds`.
- Likely files: notification store/UI, sound routing, settings.
- Visible/audible result: compact notifications with history and restrained
  audio.
- Risks: sound spam, DND gaps.
- Tests: toasts, DND, clear, history cap, repeated events.
- Checkpoint: notification screenshots/audio QA.
- Accessibility: screen-reader labels, keyboard focus.
- Performance: capped history and no timer leaks.
- Commit boundary: notifications.
- Defer conditions: optional milestone notifications.
- Status: Complete. Audited the existing notification infrastructure
  (`notificationStore.ts`, `shellSounds.ts`, `NotificationCenter.tsx`,
  `NotificationBell.tsx`) before building: the store already had DND
  suppression of both the sound dispatch and the tray badge, a 100-item
  capped history, client-id dedup/replace, silent/read-only entries, and
  the `shell:notification` sound-trigger event; `shellSounds.ts` already
  routed sounds by category with per-call `throttleMs` (1200ms for
  non-error notifications, 450ms for errors) to prevent spam; `os:toast`
  and `ui:toast` were already captured into history via
  `installNotificationCapture()` called in both `main.tsx` and
  `blancMain.tsx`. The concrete gaps found and fixed:
  (a) `NotificationCenter.tsx` had hardcoded English strings (`Clear all`,
  `timeAgo()` returning 'just now'/'Nm ago'/'Nh ago'/'Nd ago') and
  `Notification.tsx` had `aria-label="Dismiss"` hardcoded — both
  CLAUDE.md i18n-workflow violations. Added ten new i18n keys
  (`notifications.clearAll`, `notifications.listLabel`,
  `notifications.time.justNow`, `notifications.time.minutes`,
  `notifications.time.hours`, `notifications.time.days`,
  `notifications.blanc.title`, `notifications.blanc.entries`,
  `notifications.blanc.when`, `notifications.blanc.message`) and
  translated all into ja/zh/ru. Russian plural forms use the project's
  object-format `{ one: '...', few: '...', many: '...', other: '...' }`
  (not ICU MessageFormat strings, which `translate()` does not parse)
  with `{count}` (not `{minutes}` etc.) per the CLDR rule.
  (b) `useTimeAgo()` `useCallback` depended on `[t]` instead of
  `[lang]` — i18n rule #6: `t`'s identity is stable by design, so
  depending on it silently goes stale after a language switch; fixed in
  both `NotificationCenter.tsx` and Blanc's `NotificationCenterPanel`.
  (c) Added `dismissLabel` prop to `Notification.tsx` so the aria-label
  is localisable, removing the hardcoded 'Dismiss' fallback entirely.
  (d) Blanc's parallel `NotificationCenterPanel` in
  `BlancReadyToolPanels.tsx` had the same hardcoded strings ('Clear all',
  'Task Center', 'No notifications yet.', 'When', 'Message', 'Dismiss',
  and `notificationTime()` returning English) — fixed with the same
  `t()` pattern and `useCallback` with `[lang]`.
  (e) Added `role="log"` and `aria-label` to the notification list
  container in the center.
  (f) Fixed a timer leak: the wired teletype dismiss `setTimeout(200ms)`
  was never cleaned on unmount — now tracked in a ref and cleared in the
  effect cleanup. No new abstractions, no defensive code for scenarios
  that cannot happen.
- Verification: full suite passed (188 files, 2020 tests — 25 new
  notification store and i18n integration tests covering DND, history cap,
  client-id dedup, silent entries, toast capture, persistence, and all
  new i18n keys including Russian plural forms); `node tools/i18n-check.cjs`
  clean (all 4239 English keys translated in ja/zh/ru); focused ESLint on
  touched files clean; renderer production build passed with the
  repository's existing chunk warnings.


### M15 - Virtual Display And Edition Finalization

- Objective: verify Classic 4:3 and Native Display across boot, wallpapers,
  companions, windows, and edition switching.
- Reason: display modes are core to Secret OS identity.
- Existing systems reused: `AeroViewport`, `desktopPointerScale`,
  `displayPrefs`, desktop prefs.
- Likely files: viewport CSS, display settings, wallpaper framing metadata.
- Visible/audible result: correct framing in all display modes.
- Risks: pointer mapping regressions and wallpaper cropping.
- Tests: 1024x768, 1280x960, 1600x1200, Native Display.
- Checkpoint: required screenshot set.
- Accessibility: large text, pointer size, focus outlines.
- Performance: scale/render cost.
- Commit boundary: display finalization.
- Defer conditions: none for release.

### M16 - Persistence, Migration And Recovery

- Objective: complete Secret OS schema, safe mode, reset, fallback, and recovery.
- Reason: users must recover without deleting study data.
- Existing systems reused: storage domains, migrations, desktop store, memory
  page, settings catalog.
- Likely files: storage domains, migration runner, recovery/safe mode module,
  settings.
- Visible/audible result: reset/safe mode controls and recoverable warnings.
- Risks: destructive reset, migration bugs.
- Tests: corrupted settings, missing assets, backup/restore, safe launch.
- Checkpoint: recovery walkthrough.
- Accessibility: safe mode must disable sensory load.
- Performance: migration idempotence and startup timing.
- Commit boundary: persistence/recovery.
- Defer conditions: optional custom asset import/export.

### M17 - Accessibility And Reduced Sensory

- Objective: complete accessibility and reduced-sensory pass.
- Reason: nostalgic atmosphere must remain modern and safe.
- Existing systems reused: `displayPrefs`, a11y CSS, settings registry, boot
  controls, sound engine.
- Likely files: display prefs, settings page, boot/lifecycle controls,
  environment gates.
- Visible/audible result: one broad reduced-sensory mode plus advanced controls.
- Risks: controls not applying to all subsystems.
- Tests: keyboard nav, focus order, contrast, reduced motion, mute, boot skip.
- Checkpoint: accessibility checklist.
- Performance: reduced sensory lowers animation/audio/particles.
- Commit boundary: accessibility.
- Defer conditions: none for release.

### M18 - Performance And Long-session Stability

- Objective: measure and fix long-session leaks and hidden work.
- Reason: final effects must be dependable for daily use.
- Existing systems reused: perf tier, visibility gates, audio engine, companion
  and particle loops.
- Likely files: instrumentation helpers, lifecycle cleanup, effects.
- Visible/audible result: none unless fixes are visible.
- Risks: hard-to-reproduce leaks.
- Tests: repeated entry/exit, boot, sleep/wake, edition/wallpaper switching,
  multiple windows, mute, reduced motion.
- Checkpoint: performance notes and measurements.
- Accessibility: reduced sensory remains low-cost.
- Performance: memory, timers, listeners, audio nodes, CPU/GPU.
- Commit boundary: performance fixes.
- Defer conditions: optional outside-app companion.

### M19 - Packaging, Licensing And Release Readiness

- Objective: verify packaged Electron builds and asset provenance.
- Reason: release readiness cannot be claimed from dev server only.
- Existing systems reused: Forge config, app/media protocols, asset manifests,
  provenance docs.
- Likely files: asset manifests, docs, packaging fixes inside `src` only where
  needed.
- Visible/audible result: packaged app loads Secret OS assets correctly.
- Risks: asset path failures, loose files, unknown licenses.
- Tests: `npm test`, renderer build, `npm run package` or equivalent package
  validation, clean profile launch.
- Checkpoint: packaged build QA notes.
- Accessibility: packaged safe mode and reduced sensory.
- Performance: packaged startup time.
- Commit boundary: packaging/licensing.
- Defer conditions: no release without provenance.

### M20 - Final Emotional Review And QA

- Objective: create final completion report with visual, audio, performance,
  accessibility, migration, and release evidence.
- Reason: Phase 5 completion requires actual use evidence.
- Existing systems reused: test scripts, screenshot/audio checklist, docs.
- Likely files: `src/PHASE_5_COMPLETION_REPORT.md`.
- Visible/audible result: no product changes unless QA fixes are found.
- Risks: incomplete evidence.
- Tests: full final suite and manual QA.
- Checkpoint: final screenshot/audio/performance/accessibility pack.
- Accessibility: final reduced sensory proof.
- Performance: final long-session summary.
- Commit boundary: completion report and tiny QA fixes only.
- Defer conditions: unresolved release blockers.

## First Implementation Step After Approval

Start M1 only.

Implementation outline:

1. Add a small Secret OS lifecycle state module that listens to the existing
   Secret Mode entry/exit events.
2. Make `AeroBootOverlay` consume lifecycle state rather than owning all timing
   internally.
3. Add explicit states for preboot, boot, welcome, reveal, active, sleeping,
   waking, shutting down, and safe fallback.
4. Keep the existing `shell:softReboot` event as the entry seam.
5. Preserve default Study OS behavior.
6. Add skip/reduced-motion/mute hooks but keep final art/audio out of M1.
7. Run focused tests plus `npm test`.
8. Capture M1 sequence screenshots if a running app session is available.

Approval should authorize M1 only first.
