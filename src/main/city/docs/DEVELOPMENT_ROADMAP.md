---
doc_id: noctis.development_roadmap
tier: implementation
authority: delivery_plan
role: phased_implementation_plan
status: active
depends_on:
  - VISION.md
  - ART_DIRECTION.md
  - NOCTIS_ECOLOGICAL_ENGINE.md
  - GAME_DESIGN.md
  - ARCHITECTURE.md
  - SIMULATION_SYSTEMS.md
  - TIER_7_RECONCILIATION.md
  - UI_DESIGN.md
  - ENVIRONMENT_DESIGN.md
  - CHARACTER_DESIGN.md
  - VISUAL_PIPELINE.md
  - ASSET_PIPELINE.md
  - SPRITE_PIPELINE.md
  - ANIMATION_SYSTEM.md
  - FIREFLY_SYSTEM.md
---

# Noctis Development Roadmap

## Delivery Rule

Implementation proceeds downward from authority. A phase begins only after its dependencies pass their acceptance gate. Production image generation does not begin until the final pre-asset gate.

```text
Authority lock
→ deterministic engine
→ state ownership and telemetry membrane
→ presentation projection
→ code-native renderer proof
→ asset brief package
→ external asset generation
→ production integration and polish
```

## Phase 0 — Authority Lock

**Status:** complete.

Deliverables:

- Tiers 1–7 authored;
- Tier 6/7 conflicts reconciled in `TIER_7_RECONCILIATION.md`;
- all Tier 8 production specifications approved;
- stale pre-specification engine removed rather than patched;
- old implementation treated as reference only.

Gate:

- [x] Six era contributions are named and owned.
- [x] Learning Integration is upstream, never a direct era term.
- [x] Presentation remains downstream and read-only.
- [x] Asset geometry, layers, sprites, motion, particles, provenance, and ingestion are specified.

## Phase 1 — Deterministic Simulation Kernel

**Goal:** create a new pure TypeScript engine from the reconciled contracts.

Deliverables:

- versioned state envelope and initial-state factory;
- normalized `InterpretedLearningInput` contract;
- pure elapsed-time evaluation: energy cushion, renewable decay, hibernation fixed point, ten-minute wake;
- domain-owned state families for Learning, Ecology, Citizen, Technology, Culture, Memory, Economy, and Era;
- proposal/resolution order with no same-step circular reads;
- six secured era projections and weighted geometric gate with positive floors;
- canonical four event flags plus lawful domain crossings observed from before/after state and recorded durably by Memory;
- pure presentation projection;
- synchronous validation and `AbyssalConstraintError`;
- deterministic selectors and no engine randomness.

Tests:

- purity, immutability, determinism, and composable elapsed time;
- non-finite and invalid-state rejection;
- no legacy regression through absence;
- hibernation fixed point and reawakening threshold;
- domain ownership and prior-state dependency behavior;
- every era contribution required; no Technology-only transition;
- one era per evaluation;
- Memory records crossings after the gate;
- presentation projection contains no write path.

Gate: all city-engine tests pass under Node without Electron, DOM, filesystem, timers, or random APIs.

## Phase 2 — State Owner And Persistence

**Goal:** make the main process the reliable single writer.

Deliverables:

- `CityService` rebuilt against the new engine contract;
- injectable clock, storage adapter, and broadcaster;
- atomic save with directory preparation and recoverable backup;
- schema migration boundary and explicit corrupt-save handling;
- exactly one offline evaluation on initialization;
- serialized session ingestion to prevent overlapping writes;
- clean shutdown stamp without simulation mutation;
- versioned IPC messages and defensive validation.

Tests:

- first launch, reload, corrupt save, failed write, and backup recovery;
- clock rollback clamped without negative elapsed time;
- concurrent session calls remain ordered;
- one commit produces one broadcast;
- invalid inbound payload cannot bypass constraints;
- all windows receive the same committed revision.

Gate: service and IPC integration tests pass without a real Electron window.

## Phase 3 — Reliable Learning Membrane

**Goal:** collect real Study OS activity once, interpret it honestly, and deliver it without silent loss.

Deliverables:

- renderer-local accumulator with versioned storage;
- event adapters for reading, vocabulary, saved words, flashcards, achievements, and level reports;
- deterministic `TelemetryWindow → I` interpretation;
- flush on meaningful windows, idle checkpoint, visibility change, and graceful shutdown;
- retry queue with idempotency key so a partial or repeated send cannot double-apply;
- flashcard-only and milestone-only windows supported;
- one authoritative simulation bridge; presentation-only pulse effects cannot write state;
- privacy test proving titles, ids, words, notes, and raw timestamps do not cross city IPC.

Gate: real telemetry fixtures produce stable interpreted inputs; retry and restart tests prove no loss or double application.

## Phase 4 — Presentation Projection And Code-Native Proof

**Goal:** prove the entire state-to-world loop before external art exists.

Deliverables:

- `CityPresentationModel` selector implemented and tested;
- asset/scene manifest types and validator;
- code-native Era I fallback scene using gradients, SVG/CSS silhouettes, masks, and canvas particles;
- newborn, active, dimmed, hibernating, and returning composites;
- central spore-hearth, liquid channel, ridges, paths, and Noctae placeholder silhouettes;
- Glance, District, and Detail view shell;
- reduced-motion and performance-tier behavior;
- viewport resize, crop-safe, pop-out, and desktop integration;
- placeholder engineering copy removed from the user-facing city.

Gate: a real session changes the open scene from committed state without reload; restart restores the same structural composition; no production raster asset is required.

## Phase 5 — Asset Brief And Manifest Package

**Goal:** reach the exact stopping point before external image generation.

Deliverables:

- Era I `ancestral_basin` scene manifest with layer order, crop bounds, route anchors, depth bands, and fallbacks;
- complete asset id inventory;
- environment contact-sheet brief and prompt pack;
- Noctae model-sheet brief and negative examples;
- particle texture brief;
- palette/reference sheet;
- provenance ledger template;
- selected image-model role matrix and current license review;
- automated asset validator ready to ingest generated files.

Gate:

- [x] All required runtime roles have code-native fallbacks.
- [x] Every requested image has one brief, dimensions, role, and cleanup plan.
- [x] No prompt asks a model to create UI, text, citizens, scenery, masks, and animation simultaneously.
- [x] Human cleanup and approval tools are selected.
- [x] Current commercial-use and privacy terms for the selected generation tools are recorded.

**Original pre-generation gate complete.** The navigable-world correction below is also mandatory before production component generation.

## Phase 5.5 — Navigable World Foundation

**Goal:** prevent the fixed-canvas proof from becoming a static aquarium before production art hardens the mistake.

Deliverables:

- stable world-coordinate and region-topology contract;
- monotonically expanding horizontal, downward, and upward revealed bounds;
- cramped Era I origin region with permanent connection anchors;
- semantic camera levels for Glance, District, Detail, Strata, Stellar, and Whole Civilization;
- manual pointer, wheel, and keyboard navigation clamped to revealed space;
- optional Night Drift auto-explorer with committed-state observation cards and interruption safety;
- Whole Civilization overview as the only rectangular full-world fit;
- manifest schema for regions, connections, focus targets, strata, and overview/district/detail LODs;
- code-native proof and tests before additional generated production components.

Gate:

- [x] Era I remains deliberately cramped while later era bounds expand in both axes.
- [x] Existing region coordinates never move when a later region is revealed.
- [x] District, Detail, Strata, and Stellar perform real camera changes, not sidebar-only mode changes.
- [x] Whole Civilization contains every revealed region and is the only full rectangular framing.
- [x] Night Drift pauses on interaction, hidden windows, Glance View, and reduced-motion rules.
- [x] No navigation action mutates or persists simulation state.
- [x] Production asset briefs describe region seams and semantic LODs rather than a single world background.

**Status:** complete. Verified through world-projection tests, the full project test suite, a production renderer build, and live interaction at the default and 960 × 640 viewports. The live Era V preview confirms horizontal, downward, network, and stellar regions remain inside the settled Whole Civilization frame.

## Phase 6 — External Asset Generation And Cleanup

Begins only after explicit user direction at the Phase 5 gate.

Concept exploration is followed by reference lock, controlled component production, human normalization, technical export, manifest registration, and runtime review. Model output never enters production directly. The approved Era I sheet is a mood-and-origin-layout reference; Phase 5.5 has passed and controlled component production is active.

The first five-sheet morphology/LOD batch is now reviewed: shelter panel 2, hearth panel 2, canopy panel 2, and navigation/LOD panel 2 are selected with cleanup constraints; the region-composition sheet has no user preference and does not replace the earlier origin lock. The code-native proof now stages later-era additions instead of mounting a complete region as one visible block.

Controlled-production review now uses waves of up to five independent asset-family sheets per user decision. A review wave changes only presentation cadence: every family still receives its own prompt section, generation call, provenance entry, cleanup plan, runtime role, and approval gate. Distinct families are never merged into one runtime plate merely to reduce review turns.

Era I environment reference selection is now complete through review wave 02. Approved directions exist for shelters, spore-hearth, canopy, root paths, liquid channels, terrain language, far ridges, crossings, foreground framing, crystals, sky, terrain decals, fog, expansion connection bleeds, root strata preview, origin overview, and current motion. Ordinary shelters, the ancestral spore-hearth, fungal canopies, and the four-role root-path kit have completed isolated redraw, alpha cleanup, registered export, manifest validation, renderer integration, Detail inspection, soft-highlight review, and Whole Civilization review. All other approved sheets remain references until their own controlled-production gates pass.

## Phase 7 — Production Integration

Replace code-native fallbacks region by region and LOD by LOD. Validate all state composites, navigation modes, seams, focus targets, animation sequences, performance budgets, accessibility modes, and crop targets after each asset family lands.

## Phase 8 — Later-Era Expansion

Only after the Era I loop is stable: add later environments, institutions, character garments, technologies, cultural expression, and era metamorphoses as capability-envelope realizations rather than universal packages. Expansion proceeds horizontally through Era II, downward through Era III, broadly networked through Era IV, and upward into the Era V stellar chasm while preserving access to all earlier regions.

## Current Position

```text
Phase 0 complete
    ↓
Phase 1 complete: deterministic simulation kernel
    ↓
Phase 2 complete: state owner
    ↓
Phase 3 complete: learning membrane
    ↓
Phase 4 complete: code-native proof
    ↓
Phase 5 complete: asset package
    ↓
Phase 5.5 complete: navigable-world correction
    ↓
Phase 6 Stage 2 complete: environment direction explored
    ↓
Phase 6 Stage 3 complete: origin, selected morphology, navigation framing, and production provenance route locked
    ↓
Phase 6 Stage 4.1 complete: Era I environment reference families approved through review wave 02
    ↓
Phase 6 Stage 4.2a complete: ordinary shelter runtime pack normalized, registered, integrated, and reviewed
    ↓
Phase 6 Stage 4.2b complete: ancestral spore-hearth base and independent emissive mask registered, integrated, and state-reviewed
    ↓
Phase 6 Stage 4.2c complete: three fungal-canopy ecology variants normalized, registered, integrated, and travel-reviewed
    ↓
Phase 6 Stage 4.2d complete: straight, bend, fork, and terminal root paths normalized with preserved connection anchors, registered, integrated, and interaction-reviewed
    ↓
CURRENT — Phase 6 Stage 4.2e: liquid-channel and pool runtime production
```

## Definition Of Pre-Asset Complete

Pre-asset work is complete only when the new engine, state owner, learning membrane, spatial presentation projection, navigable code-native Era I proof, semantic camera, region-aware manifest validator, and prompt/brief package all pass their gates. Beautiful imagery cannot compensate for an unproven causal or spatial loop.
