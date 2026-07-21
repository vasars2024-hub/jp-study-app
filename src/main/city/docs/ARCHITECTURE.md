---
doc_id: noctis.architecture
tier: 5
authority: technical_architecture
role: software_architecture_blueprint
depends_on:
  - VISION.md
  - ART_DIRECTION.md
  - NOCTIS_ECOLOGICAL_ENGINE.md
  - DOCUMENT_ARCHITECTURE.md
  - GAME_DESIGN.md
---

# Noctis Civilization Module — Technical Architecture

## Document Status And Authority

This document defines the software architecture of the Noctis Civilization Module inside the Study OS Electron-React desktop application. It establishes the unbreakable engineering laws — layer boundaries, dependency directionality, state ownership, lifecycle, IPC topology, time regimes, event topology, and the runtime constraint guard — under which all Noctis code is written.

It sits beneath the design canon and may never contradict it:

```
VISION.md                      Tier 1 — Absolute Conceptual Anchor
ART_DIRECTION.md               Tier 2 — Aesthetic & Spatial Interface
NOCTIS_ECOLOGICAL_ENGINE.md    Tier 3 — Mechanical & Biological Execution
DOCUMENT_ARCHITECTURE.md       Meta  — Structural Guardrail Framework
GAME_DESIGN.md                 Tier 4 — Experience Design
ARCHITECTURE.md                Tier 5 — Technical Architecture (this file)
```

The authority chain continues downward from this file:

```
Canon (Tiers 1-4 + meta)        WHAT the module is and means — absolute source of truth
        |
ARCHITECTURE.md (Tier 5)        HOW any system must be shaped — structural law (this file)
        |
SIMULATION_SYSTEMS.md (Tier 6)  Cross-domain simulation specification (authored and reconciled)
        |
Domain system blueprints        WHAT each subsystem computes — formulas, coefficients,
(Tier 7: CITIZEN_SYSTEM.md,      thresholds, subsystem decomposition (authored domain
 ECOLOGY_SYSTEM.md,              written later, each value carrying a canon citation)
 CULTURE_SYSTEM.md,
 TECHNOLOGY_SYSTEM.md,
 MEMORY_SYSTEM.md)
        |
Production pipeline docs        Visual and asset authoring specifications (Tier 8;
(Tier 8: VISUAL_PIPELINE.md,    must not define simulation rules)
 ASSET_PIPELINE.md, peers)
        |
Phase implementation plans      Concrete module splits, type modules, constants,
                                tests — bound at implementation time, under these laws
```

### What This Document Binds — And What It Refuses To Bind

**Binds:** the four application layers and their prohibitions; the topological dependency graph; single-writer state ownership; the four lifecycle milestones; the IPC channel contract; the two time regimes and two decay-processing regimes; the event generator contract and publication topology; the runtime Trope Guard.

**Refuses to bind:** the internal file decomposition of the Simulation Engine Core; class and function names (with exactly two named exceptions the contract itself requires: the `CityService` state-owner component and the `AbyssalConstraintError` failure type); every mathematical formula, coefficient, rate, multiplier, and threshold value; the exact field sets of the civilization state. Those bind later, in the domain physics blueprints and the phase implementation plans, which must obey the laws written here. Freezing them at this tier would prematurely limit the domain specifications this architecture exists to serve.

### How To Use This Document

- **Programmers** implement every Noctis feature inside the layer map of Section 1 and the directionality laws of Section 2, and wire all cross-process behavior through Sections 3 and 4.
- **Future AI agents** must first pass any new concept through the sequential validation protocol of `DOCUMENT_ARCHITECTURE.md` (Tier 1 -> 2 -> 3), then through the experience tests of `GAME_DESIGN.md`, and only then shape its implementation against the Structural Law Checklist at the end of this file. A proposal that satisfies the canon but violates a law here is rejected and reshaped, never merged.

---

## SECTION 1 — LAYERED MODULE MAP & APPLICATION BOUNDARIES

The module divides into four abstract layers. The Simulation Engine Core appears as one boundary box: its internal decomposition is deliberately unbound at this tier and belongs to the domain blueprints and phase implementation plans.

```
src/
|- main.ts                        APPLICATION LAYER   Composition root; process orchestration,
|                                 window life tracking, lifecycle dispatchers. Already invokes
|                                 registerCityIpc() inside app.whenReady(). Never modified
|                                 for Noctis work.
|- preload.ts                     BRIDGE LAYER        Isolated contextBridge boundary; a secure,
|                                 string-locked, non-leaky API gateway over fixed asynchronous
|                                 channel definitions.
|- main/city/
|  |- index.ts                    APPLICATION LAYER   Channel registration entry; delegates to
|  |                              the main-process city service (CityService), the state-owner
|  |                              component: native file I/O, wall clock, publication.
|  |- service/                   APPLICATION LAYER   CityService state owner; persistence,
|  |                              lifecycle, native file I/O, wall clock.
|  |- ipc/                        APPLICATION LAYER   Channel registry, handlers, push events.
|  |- engine/                     SIMULATION ENGINE CORE LAYER (single cohesive boundary)
|  |                              A totally decoupled, deterministic state machine processing
|  |                              resource deltas and state time-equations. Zero runtime
|  |                              dependencies on Electron, React, UI hooks, DOM/window, or
|  |                              Node-native modules (fs, path, timers). Internal module
|  |                              decomposition: UNBOUND at this tier.
|  |  |- tests/                   Vitest suites (environment: node) and schema fixtures only.
|  |                              Deterministic simulation verification; no live persistence.
|  |- rendering/                  UI/RENDERER LAYER   Civilization visual representation.
|  |  |- world/                   Stable world topology, region bounds, semantic focus graph.
|  |  |- diorama/                 Layer composition and viewport staging.
|  |  |- camera/                  Renderer-local pan, zoom, focus, whole-fit, and Night Drift.
|  |  |- particles/               Spore, glow, and atmospheric particle systems.
|  |  |- lighting/                Bio-light pools, masks, and illumination staging.
|  |- ui/                         UI/RENDERER LAYER   Study OS workspace interface.
|  |  |- panels/                  Civilization inspection and status panels.
|  |  |- dashboard/               Summary dashboards and overview layouts.
|  |  |- widgets/                 Compact embedded workspace widgets.
|  |- docs/                       Tiers 1-8 authority documents and archive/
|- renderer/
   |- cityState.ts     (future)   UI/RENDERER LAYER   Read-only mirrored snapshot provider,
   |                              following the profileState.ts house pattern.
   |- stats.ts                    EXISTING SOURCE     READING_RECORDED_EVENT input hook: the
   |                              bridge through which real study activity reaches Noctis.
   |- components/AppSection.tsx   EXISTING SLOT       City window placeholder until ui/ lands.
```

| Layer | Responsibilities | Must never contain |
|---|---|---|
| Application (Electron main process) | Process orchestration, window life tracking, native file system I/O, lifecycle dispatchers, IPC registration, wall clock | Simulation math (always delegated to the engine boundary), React |
| Bridge (preload API scripting) | contextBridge gateway; fixed asynchronous channel definitions; type-only imports | Business logic, state, dynamic channel strings |
| UI/Renderer (React application space) | Read-only data consumption, client-side state providers, the `rendering/` diorama canvas, the `ui/` Fluent workspace panels, input event hooks | `ipcRenderer` directly, engine value-imports, any persistence of civilization state |
| Simulation Engine Core (pure logic context) | Deterministic state transitions: resource deltas, time-equations, event flag evaluation, constraint validation | Electron, React, UI contexts, DOM/window, Node-native modules (fs, path, timers), wall-clock reads, randomness, IPC channel names |

The renderer layer serves the diorama relationship mandated by `VISION.md` (Visual Format) and `ART_DIRECTION.md` (UI And Sensory Overlays): the UI is the desk, the city is the window. The renderer consumes state snapshots to stage the illustrated 2.5D diorama; it never simulates. Per `GAME_DESIGN.md` Section 3, the diorama recedes during active study — a presentation rule enforced entirely inside this layer, invisible to the engine.

**Rendering and UI separation (mandatory).** `rendering/` and `ui/` are sibling folders under `main/city/` with distinct responsibilities and must never be merged:

| Folder | Responsibility | Must never become |
|---|---|---|
| `rendering/` (`diorama/`, `particles/`, `lighting/`) | Civilization visual representation — atmosphere, diorama composition, effects | Application chrome, Fluent workspace panels, or user interaction chrome |
| `ui/` (`panels/`, `dashboard/`, `widgets/`) | Study OS interface — Fluent-style workspace, readable panels, user interaction | The living civilization window or simulation staging |

The civilization window is not the same thing as the application UI.

**Spatial presentation boundary (mandatory).** The simulation does not store pixels or camera state. The pure presentation projection derives a stable revealed-region graph from the civilization seed plus monotone committed facts such as era history, secured ecology, and permanent Memory. Each projected region has a stable id, world-space bounds, stratum, introduction era, connection ids, and semantic focus targets. Renewable state may change light, motion, activity, and detail emphasis inside a revealed region; it may never remove or relocate secured geography.

Camera position, zoom, selected focus, active stratum, and Night Drift timing are renderer-local state. They never cross the city IPC mutation channel and never enter `noctis-state.json`. Whole Civilization computes a padded fit from the union of currently revealed bounds. District and Detail clamp to those bounds. Unrevealed space is non-interactive. Night Drift is a deterministic read-only traversal of the projected focus graph, pauses on user or lifecycle interruption, and may display only presentation copy derived from committed snapshot fields.

The standard 1920 × 1200 art canvas is a region plate and LOD source, not the global coordinate system. Region layers share local registration, then compose through a world transform. This separation permits horizontal chambers, deep strata, and the Era V stellar ascent without invalidating the ancestral origin.

**Persistence boundary (explicit).** Live civilization state targets the Electron `userData` directory — `userData/noctis-state.json` via `app.getPath('userData')` — written exclusively through `service/persistence.ts` under `CityService` ownership, matching the established `profiles.json` convention (SERVICES_PATCH.md, ownership rules). The Simulation Engine Core never writes files. In-repo `engine/tests/` holds Vitest schema fixtures only; an installed application must never write civilization state inside its own bundle.

---

## SECTION 2 — DEPENDENCY GRAPH & DIRECTIONALITY BOUNDARIES

Strict topological graph. Arrows point from importer to imported. Circular definitions and upward-pointing modules are banned outright:

```
                       value imports                    value imports
  [ENGINE CORE]  <────  service/ (CityService)  <────  ipc/ + index.ts  <──  src/main.ts
   (engine/)                  |
       ^                     |  electron: app, ipcMain, webContents
       |                     |  node: fs, path (via service/persistence.ts)
       |                     +──────────────>  userData/noctis-state.json
       |
       |  TYPE-ONLY imports (erased at compile; zero runtime edge)
       +──────  src/preload.ts ── contextBridge ──> window.api
                                                       |
                                                       v
                              renderer mirror (sole IPC subscriber)
                                                       |
                                      DOM CustomEvent  v
                              state providers ──> ui/ panels, rendering/ diorama canvas
```

Directionality laws:

1. **Absolute engine isolation.** The Simulation Engine Core is importable from a plain Node environment — exactly how the vitest `environment: 'node'` suites load it — with zero knowledge of frontend interfaces or desktop wrappers. It never reads a clock, never touches disk, never names an IPC channel. This is the structural expression of the constraint-engine discipline of `NOCTIS_ECOLOGICAL_ENGINE.md`: the world's physics are self-contained and lawful regardless of who observes them.
2. **Only the main-process service knows time and disk.** Elapsed intervals and session packets reach the engine as plain arguments.
3. **The renderer knows types, not values.** Bridge and renderer modules may use `import type` (erased at compile; legal TypeScript since 3.8) against the engine's public type surface. Value-importing engine logic from renderer code is a review-rejected violation: the simulation executes only in the main process.
4. **UI never talks IPC directly.** Components subscribe to the mirror's CustomEvent, exactly as views consume the existing `PROFILE_EVENT` today.

**Repo-wide immutability invariant.** Every engine function operates on and returns freshly constructed state snapshots; callers retain valid before-references precisely because inputs are never written to. Input state mutation is a review-rejected violation, and engine test suites must assert input non-mutation. This matches the snapshot-by-reference invariant already established elsewhere in the repository.

---

## SECTION 3 — STATE OWNERSHIP & MANAGEMENT LIFECYCLE

**Ownership.** The main-process application layer (`CityService`) is the single source of truth and the single writer of civilization data. The React renderer houses a read-only mirrored snapshot refreshed by push; transient view state (open pane, zoom level) stays renderer-local and never enters the civilization state.

**Persistence envelope.** A versioned envelope wraps the state on disk: a schema version marker, the wall-clock timestamp of the last successful write, and the state snapshot itself. Timestamps live in the envelope, never inside simulation state — the engine stays time-blind.

**Lifecycle across the four milestones:**

1. **Application Initialization.** `app.whenReady()` -> channel registration -> service load: read the local storage file; verify the parsed structure against the Trope Guard (loaded files are untrusted input); on a missing or corrupt file, run the initial-state generation factory; evaluate the elapsed real-world time delta since the last written save-timestamp; hand that delta to the engine's decay processing exactly once per launch; evaluate event flags on the before/after pair; persist atomically with a fresh timestamp.
2. **In-Session Ingestion.** Reader flush -> `READING_RECORDED_EVENT` -> renderer bridge aggregates focus activity into an inbound focus packet -> `window.api` -> inbound IPC channel -> service: engine transmutation on the current snapshot; event flag evaluation on the before/after pair; atomic persist; reply to the caller AND broadcast the outbound push to all windows.
3. **Dormancy / Backgrounding — lazy decay model (mandatory).** The state engine must not use active main-process ticking intervals. Decay is computed lazily at explicit checkpoints only — application initialization (mandatory), and optionally session injection after long in-app idleness or city window initialization — safeguarding background system performance, per the repository performance rule and the study-first pillar of `VISION.md`. Between checkpoints the in-memory state simply holds. Hibernation is a structural fixed point of decay processing: a dormant state passes through unchanged, so dormancy never compounds. The canon rule "progression pauses, no penalties" (`NOCTIS_ECOLOGICAL_ENGINE.md` section 7) is thereby enforced by shape, not by tuning.
4. **Teardown.** Persistence is write-through: every mutation reaches disk via atomic safe-swapping — write to a temporary sibling file, then swap via filesystem rename (the ProfileStore house pattern in `src/main/profiles.ts`) — before its IPC reply is sent, so teardown needs no flush and partial writes can never tear the save. An optional final timestamp stamp on `before-quit` narrows the offline-delta window. A crash loses at most the delta since the last completed mutation.

---

## SECTION 4 — INTER-PROCESS COMMUNICATION (IPC) SCHEMA CONTRACT

String-locked `domain:action` channel pattern under the `city` domain, following the repository service conventions (SERVICES_PATCH.md channel registry). Channel names are fixed literal constants; dynamic string construction is banished.

| Channel | Direction | Kind | Carries |
|---|---|---|---|
| `city:getState` | renderer -> main | invoke | Boot handshake: current full snapshot (empty event list) |
| `city:recordSession` | renderer -> main | invoke | Inbound focus block -> unified state/event result |
| `city:changed` | main -> renderer | push to ALL windows | Unified state/event result |

**Inbound payload (Renderer-to-Main) — the focus block.** Semantic contents, transmitted down to the simulation core: focus duration in minutes; subject category, drawn from the canonical cognitive-pathway taxonomy of `NOCTIS_ECOLOGICAL_ENGINE.md` section 5; consistency state as a consecutive-day count, sourced from the existing streak computation in `src/renderer/stats.ts`; and an optional difficulty/failure-rate signal. Exact field identifiers bind in the implementation-phase type module, not here.

**Outbound payload (Main-to-Renderer).** A full, structured-clone-safe state snapshot plus the transient event flags of the mutation that produced it — sufficient to drive 2.5D visual diorama updates without frontend rendering lag or renderer-side recomputation. Full-snapshot pushes, not diffs: they keep the mirror trivially consistent, and snapshot scale makes diffing a premature optimization.

Contract rules:

- Payloads are structured-clone-safe plain data only. No class instances, functions, or Dates cross the wire.
- Main validates every inbound packet before the engine runs; invalid input or a Trope Guard violation rejects the invoke promise — the loud developer-error path (Electron serializes the thrown error's message).
- Every subscription returns its unsubscribe function (house pattern of `onProfileChanged` in `src/preload.ts`); the mirror subscribes to the push channel BEFORE its first snapshot fetch so a racing push is never missed (`initProfileState()` precedent in `src/renderer/profileState.ts`).
- Broadcast targets all `BrowserWindow` instances (the `broadcastPopoutState()` precedent in `src/main.ts`) so a popped-out Noctis window stays in sync with the main shell.
- All designed syntax conforms to TypeScript ~4.5.4: plain interfaces and string-literal unions; the `satisfies` operator, `const` type parameters, and all post-4.5 features are banned.

---

## SECTION 5 — TIME MANAGEMENT ENGINE & PROCESSING REGIMES

Two architectural time-tracking mechanisms enter the module through exactly one door — the main-process service — and reach the engine as plain numeric arguments:

- **Active Execution.** Event-driven, triggered by inbound focus events; duration arrives inside the focus block. Nothing polls, nothing ticks, no interval timers run in the main process (study-first performance law). Ambient diorama animation is a renderer presentation concern driven by snapshots — never a second simulation.
- **Long-Term Offline Elapsed Intervals.** Derived once per checkpoint as the delta between the current wall clock and the persisted save-timestamp, then passed down. Because the engine never reads a clock, both regimes are deterministic and unit-testable.

Two abstract processing regimes govern progression over elapsed time. Their equations, coefficients, and thresholds bind in the domain physics blueprints and the implementation-phase constants module — each value carrying a canon citation. The architecture fixes only their structure and ordering:

1. **The Energy Cushion / Battery State.** Stored analytical reserves — the crystal-lattice energy of `GAME_DESIGN.md` Section 6 — are discharged at a linear rate and, while any reserve remains, completely suppress and absorb environmental light degradation: reserves are drawn down before any dimming begins. This is the mathematics-pathway offline benefit of `NOCTIS_ECOLOGICAL_ENGINE.md` section 5.
2. **The Exponential Decay & Dormancy State.** After the cushion is exhausted, resource states diminish exponentially. When illumination falls beneath the canonical dormancy threshold — the five-plus-day absence behavior of `NOCTIS_ECOLOGICAL_ENGINE.md` section 7 — the engine performs an automated structural transition into the safe, non-punitive hibernation state: progression pauses; population counts never drop; user legacy metrics (era, accumulated structures, memory) are never erased. Reawakening follows the canonical short-session wake rule from the same table.

Ordering law: cushion discharge always precedes decay within a single elapsed-interval evaluation; dormancy is evaluated last; a hibernating input is returned unchanged (fixed point, Section 3).

---

## SECTION 6 — DECOUPLED EVENT GENERATION & EVENT BUS TOPOLOGY

**Systemic Event Generator interface (abstract, deterministic).** Post-mutation, the calculation layer evaluates the pair of before/after state snapshots — together with the triggering focus block, or its absence for decay-only evaluations — and returns transient event flags:

```
evaluate(focusBlock | null, beforeSnapshot, afterSnapshot) -> orderedEventFlags[]
```

- Flags are plain string constants drawn one-to-one from the canonical systemic event table (`NOCTIS_ECOLOGICAL_ENGINE.md` section 7: consistency plume, difficulty shock, absence douse, breakthrough bloom). Their trigger conditions bind to that table's rows; the dormancy flag additionally requires an observed active-to-hibernating transition between the two snapshots — which only decay processing can produce.
- **Fixed structural evaluation hierarchy:** flags are always evaluated and emitted in the canonical table's row order. Same inputs, same list, same order — no randomness, no clock.
- **Zero subsystem coupling:** the generator reads nothing but the two snapshots and the focus block. Engine subsystems never import one another to raise events; no callback registries or listener graphs exist inside the engine boundary.

**Publication topology.** The engine emits nothing — it returns values. The main service process is the single publisher: after each mutation it publishes the unified state/event payload over the outbound IPC channel to every window. The renderer mirror is the sole IPC subscriber and re-publishes as a standard DOM CustomEvent (the `PROFILE_EVENT` house pattern), so state providers, panels, and the diorama canvas subscribe locally as view consumer groups. Event flags are transient signals, never persisted — every durable consequence they describe already lives in the state snapshot.

---

## FINAL ARCHITECTURAL GUARDRAILS & TROPE FILTERING

**Runtime Trope Guard Validation Engine (abstract specification).** A validation sub-system inside the engine boundary, executed on every state the engine returns (self-validation) and on every state the service loads from disk (untrusted input):

- **Structural checks:** all numeric values finite and non-NaN; resource quantities non-negative; population a non-negative integer; illumination strictly within the non-glare heatless waveband `[0, 1]` (`NOCTIS_ECOLOGICAL_ENGINE.md` section 4, Rule 1); status and era designations within their canonical unions (the five production eras of `GAME_DESIGN.md` Section 7); the hibernation status entails zero illumination.
- **Automated regex token guard pipeline:** the validator scans the enumerable keys of all state objects. Keys are split into identifier tokens (camelCase and snake_case segmentation, singular-normalized), and every token is tested against the strict, case-insensitive filter:

  ```
  /^(thermal|heat|fire|flame|combust|smoke|steam|forge|daylight|sun|coin|gold|xp|score|build|construct|zone)$/i
  ```

  Any key outside the canonical state schema halts processing. A token match upgrades the error to cite the precise violated canon section:

  | Matched token family | Cited authority |
  |---|---|
  | thermal, heat, fire, flame, combust, smoke, steam, forge, daylight, sun | `NOCTIS_ECOLOGICAL_ENGINE.md` section 4 Rule 1 and the section 8 rejection checklist |
  | build, construct, zone | `GAME_DESIGN.md` Section 1 — no manual construction, no build menu |
  | coin, gold, xp, score | `DOCUMENT_ARCHITECTURE.md` section 5 terminology lock — bio-light never means coins, XP, or score |

  Under token segmentation, keys such as `thermalOutput`, `coins`, `buildQueue`, `gold`, `xp`, and `forge` all halt with their specific citations.
- **Failure mode:** a synchronous developer error, `AbyssalConstraintError`, message format `"<key or field>: <rule> - violates <DOC> <section>"`. It halts runtime processing immediately and surfaces across the IPC bridge as a rejected promise, failing verification processes loudly.

**Standard repository guardrails:**

- Absolute ban on decorative emojis across all documentation lines, code, comments, tests, error strings, and IPC payloads (`AGENTS.md`).
- All architectural code remains strictly isolated within the `src/` boundary; root project configurations are untouched.
- TypeScript ~4.5.4 syntax fence module-wide; verification is vitest + eslint + application boot, never `npx tsc`.
- The superseded `src/main/city/docs/archive/CITY_ENGINE.md` is historical only and carries no authority. Its rejected systems — city points, grid placement, forge economy, passive currency generation — may not leak into any tier. Infrastructure conventions that independently survive do so via SERVICES_PATCH.md and this document, not via the archived specification.

---

## Structural Law Checklist

Every implementation proposal — human or AI — must answer yes to all of the following before merging:

1. Does all simulation logic live inside the Simulation Engine Core boundary, free of Electron, React, DOM, Node-native modules, clocks, randomness, and IPC strings?
2. Do all engine functions return freshly constructed snapshots and leave their inputs untouched?
3. Is the main-process `CityService` the only writer of civilization state, and `userData` the only live persistence target?
4. Is every persist an atomic temporary-write-then-rename swap?
5. Is decay computed lazily at checkpoints, with zero ticking intervals in the main process?
6. Do all channels use fixed `city:` domain literals with structured-clone-safe payloads, and does every subscription return its unsubscribe function?
7. Are event flags generated deterministically from before/after snapshots in the canonical table order, with no coupling between engine subsystems?
8. Does every returned or loaded state pass the Trope Guard, and do violations throw `AbyssalConstraintError` synchronously?
9. Is the syntax TypeScript ~4.5.4-safe, emoji-free, and confined to `src/`?

---

## Closing Validation Statement

Every future technical concept for the Noctis Civilization Module must pass, in order: the Tier 1 test of `VISION.md`, the Tier 2 test of `ART_DIRECTION.md`, the Tier 3 test of `NOCTIS_ECOLOGICAL_ENGINE.md`, the experience tests of `GAME_DESIGN.md`, the structural laws of this document, the shared physics of Tier 6, the domain specifications of Tier 7, and the production pipeline constraints of Tier 8. Anything that fails is not adjusted at the edges; it is rejected and reshaped from the constraint up.

The engine is pure. The service is the sole owner. The renderer only mirrors. The night runs on the user's mind — and the code that carries it must be as lawful as the world it sustains.
