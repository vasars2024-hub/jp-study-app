---
doc_id: noctis.simulation_systems
tier: 6
authority: simulation_physics
role: deterministic_world_model
depends_on:
  - VISION.md
  - ART_DIRECTION.md
  - NOCTIS_ECOLOGICAL_ENGINE.md
  - DOCUMENT_ARCHITECTURE.md
  - GAME_DESIGN.md
  - ARCHITECTURE.md
---

# Noctis Civilization Module — Simulation Systems

## Document Status And Authority

This document is the physics specification of the Noctis civilization simulation: the complete deterministic mathematical model from which every engine behavior derives. It defines what the civilization state *is*, how real-world learning transmutes into ecological change, how time acts on the world, and which laws no future system may break.

It sits beneath the full canon and the technical architecture, and may never contradict them:

```
VISION.md                      Tier 1 — Absolute Conceptual Anchor
ART_DIRECTION.md               Tier 2 — Aesthetic & Spatial Interface
NOCTIS_ECOLOGICAL_ENGINE.md    Tier 3 — Mechanical & Biological Execution
DOCUMENT_ARCHITECTURE.md       Meta  — Structural Guardrail Framework
GAME_DESIGN.md                 Tier 4 — Experience Design
ARCHITECTURE.md                Tier 5 — Technical Architecture
SIMULATION_SYSTEMS.md          Tier 6 — Simulation Physics (this file)
```

The authority chain continues downward: the Tier 7 domain blueprints (`CITIZEN_SYSTEM.md`, `ECOLOGY_SYSTEM.md`, `CULTURE_SYSTEM.md`, `TECHNOLOGY_SYSTEM.md`, `MEMORY_SYSTEM.md`) specialize the physics written here into domain formulas and bound coefficient values, each value carrying a canon citation, exactly as `ARCHITECTURE.md` prescribes.

### What This Document Binds — And What It Refuses To Bind

**Binds:** the state categories and their conceptual variables; the state transition structure and its evaluation order; the functional forms of transmutation, saturation, decay, and dormancy; the resource metabolism and its priority laws; the ecological system relationships; the population law; the era progression structure; the deterministic event conditions; the system dependency topology; the mathematical integrity laws.

**Refuses to bind:** every numeric coefficient, rate, multiplier, and threshold *value* (written as named symbolic constants here; bound in the Tier 7 domain blueprints under the calibration constraints stated in this file); the exact field identifiers of the state schema; any code structure, module layout, class, or function; any visual, animation, asset, or UI behavior. Exactly three numeric anchors appear in this document, because the canon itself locks them: the three-consecutive-day consistency trigger, the five-day absence horizon, and the ten-minute reawakening session (`NOCTIS_ECOLOGICAL_ENGINE.md` section 7).

### Notation

Mathematics is written in plain text. `S` is a civilization state snapshot; `I` is a learning input; `Δt` is elapsed real time; `e^(−λ·Δt)` is exponential decay; `[0, 1]` is a closed unit interval. Named constants are written as symbols such as `θ_dormancy` or `δ_discharge`; their values bind at Tier 7. Time is measured in real-world minutes; day-scale anchors are expressed as canonical day counts.

---

## SECTION 1 — SIMULATION PHILOSOPHY AND STATE MODEL

### The Civilization Is A Deterministic State Machine

Noctis is not a running world. It is a lawful mathematical object: a civilization state, and a transition function that maps one state to the next. The world does not "happen" between the user's actions; it is *evaluated* whenever a meaningful event occurs. Everything the user ever witnesses — growth, dimming, migration, era change — is the difference between two snapshots of the same deterministic system.

A civilization state `S` contains, and only contains:

- **Measurable resources** — the metabolic stocks of Section 6.
- **Environmental conditions** — illumination, nutrient reservoirs, circulation, atmospheric stability.
- **Biological conditions** — population, network expansion, fauna activity.
- **Technological state** — era designation, research maturity, information-storage stage.
- **Memory of previous achievements** — milestones, discoveries, monuments, historical record.

The state contains no timestamps, no clocks, no pending timers, no references to presentation. Wall-clock time lives outside the simulation, in the persistence envelope owned by the application layer (`ARCHITECTURE.md` Section 3). The simulation is time-blind: time reaches it only as a number.

### The State Transition

The engine follows one master relationship:

```
Previous State + Real-world learning input + Elapsed time
        |
        v
              New State

S(t+1) = F( S(t), I, Δt )
```

`F` decomposes into two ordered evaluations, matching the two processing regimes of `ARCHITECTURE.md` Section 5:

```
S'  = D( S, Δt )       Elapsed-time evaluation: energy cushion discharge,
                       environmental decay, dormancy transition (Section 4).

S'' = T( S', I )       Transmutation evaluation: nutrient synthesis, resource
                       metabolism, ecological growth, era progression
                       (Sections 5 through 9). Applied only when a learning
                       input is present.

flags = E( I or none, S, S'' )
                       Event observation on the before/after pair (Section 10).
```

Both `D` and `T` are pure functions: they read a snapshot and return a freshly constructed snapshot, never modifying their input (the repo-wide immutability invariant of `ARCHITECTURE.md` Section 2).

### The Four Prohibitions

**Same input produces same output.** Given identical `S`, `I`, and `Δt`, the engine must produce an identical `S(t+1)` and an identical flag list, on every machine, on every run, forever. This is what makes the world's mystery trustworthy (`GAME_DESIGN.md` Section 8): a user who patiently observes the city can derive true laws from it, because the laws never waver.

**Randomness is forbidden.** No random number generation exists anywhere in the simulation. Where the canon permits variety of *expression* — which ridge a crystal grows on, which path a citizen walks — that variety is either a deterministic function of existing state or a presentation choice made entirely inside the rendering layer. Randomness may never vary a simulation *fact*. Mathematics always grows crystal; consistency always drives circulation; the same week of study always produces the same world.

**Hidden timers are forbidden.** Nothing in the simulation waits, ticks, counts down, or schedules. There are no background loops and no accumulating clocks (`ARCHITECTURE.md` Sections 3 and 5). Duration enters the system exactly once per evaluation, as the argument `Δt`, computed outside the engine from the persistence envelope. A civilization left alone is not "running slowly"; it is a constant, waiting to be evaluated.

**The simulation cannot depend on rendering.** No state variable, transition, or event condition may read anything from the presentation layer: not visibility, not window state, not animation progress, not viewport. The dependency points one way only (Section 11). The world's physics are self-contained and lawful regardless of who observes them — the structural expression of the constraint-engine discipline of `NOCTIS_ECOLOGICAL_ENGINE.md`.

### State Invariants

Every state the simulation produces or accepts satisfies, at all times:

- All numeric quantities are finite; no undefined or unrepresentable values.
- All resource stocks are non-negative.
- Population is a non-negative integer.
- Illumination lies strictly within the heatless, non-glare waveband `[0, 1]` (`NOCTIS_ECOLOGICAL_ENGINE.md` section 4, Rule 1).
- The era designation is one of the five canonical eras (Section 9).
- The hibernation status entails zero illumination.

These invariants are enforced structurally by the runtime validation guard specified in `ARCHITECTURE.md` (Final Architectural Guardrails); this document defines them as physics, so that no lawful transition can ever leave the valid region.

---

## SECTION 2 — GLOBAL CIVILIZATION STATE

The state divides into five conceptual categories. These are abstract variables of the world model — not programming objects, not schema fields. Their exact representations bind at implementation time under the laws of this file.

### Environmental State

**Illumination `L ∈ [0, 1]`** — the civilization's current metabolic light output: the normalized intensity of active bioluminescent life across the visible world.
- *Purpose:* the single clearest expression of how recently and steadily the user's mind has fed the world; the variable whose threshold defines dormancy.
- *How generated:* driven upward by nutrient uptake and learning momentum during transmutation, saturating toward 1.
- *How consumed:* decays exponentially during unshielded offline intervals; set to exactly 0 by the hibernation transition.
- *How it affects future states:* falling below the dormancy threshold triggers hibernation; its level scales ecological activity and population activity expression.

**Nutrient reservoirs `(brine, glucans, catalysts)`** — the current stocks of the three canonical metabolic nutrients (Section 5): piezo-electric brine, chemosynthetic glucans, luciferin catalysts.
- *Purpose:* the chemical intermediary between cognition and ecology; different studies fill different vessels.
- *How generated:* synthesized from learning input along the canonical pathways.
- *How consumed:* drawn down by ecological growth (lattice expansion, root growth, photophore mutation), by innovation blooms, and by the daily metabolic need of living systems.
- *How it affects future states:* their relative balance steers which networks expand, which discoveries surface, and which register of culture deepens.

**Ecological activity / circulation `Φ ∈ [0, 1]`** — the speed and reach of the civilization's distribution systems: the liquid-light currents, canopy pulse rhythm, and nutrient transport efficiency.
- *Purpose:* models the canon rule that consistency improves distribution and stability (`VISION.md`, Light Economy).
- *How generated:* a saturating, monotone function of the consistency state; boosted while the spore-moth network is active.
- *How consumed:* relaxes downward during decay phases; settles to stillness in hibernation.
- *How it affects future states:* multiplies the effective reach of nutrients (outer districts receive growth only at high circulation) and the completion rate of pending transformations.

**Atmospheric stability `σ ∈ [0, 1]`** — the barometric calm of the world; the inverse of cognitive pressure.
- *Purpose:* gives difficulty and failure an honest, non-punitive physical channel: pressure, not punishment.
- *How generated:* rests at 1; depressed transiently by high difficulty/failure signals in learning input; relaxes deterministically back toward 1 across subsequent evaluations.
- *How consumed:* read by the event system — a downward crossing of the shock threshold is the Barometric Shock Wave.
- *How it affects future states:* while depressed, the world enters its fortification posture: reserve drawdown pauses and endurance memory accumulates (Section 10). Stability never destroys stock, structure, or memory.

### Cognitive State

**Accumulated knowledge `K_total`** — the lifetime integral of metabolized comprehension: everything the user's study has ever fed into the world.
- *Purpose:* the deep measure of civilization capability; the quantity that "enables civilization complexity."
- *How generated:* increases with every metabolized session, weighted by duration, depth, and recall quality.
- *How consumed:* never. `K_total` is monotone non-decreasing for the lifetime of a civilization. (Spendable stocks are the nutrient reservoirs and the energy reserve — Section 6.)
- *How it affects future states:* parametrizes era maturity, institutional sophistication, and the ceiling of ecological complexity.

**Consistency `k`** — the current consecutive-day study count, mirrored into state from the learning input.
- *Purpose:* the physical carrier of rhythm; the canon's "seasons."
- *How generated:* supplied with each learning input (computed by the application layer from real session history).
- *How consumed:* read by circulation and by the pheromone/moth activation condition.
- *How it affects future states:* `k ≥ K_PLUME` (canonically three consecutive days) activates the spore-moth season and its world-wide acceleration.

**Learning momentum `m`** — a deterministically smoothed measure of recent study velocity.
- *Purpose:* distinguishes a world fed steadily from a world fed in rare bursts, without ever punishing either.
- *How generated:* exponential smoothing of uptake across evaluations: `m' = α·uptake + (1 − α)·m` (form bound here; `α` binds at Tier 7).
- *How consumed:* contributes to illumination level and to era-maturity weighting.
- *How it affects future states:* high momentum makes the world visibly quicker and brighter; zero momentum simply lets the environmental variables rest.

### Biological State

**Population `P`** — the count of Noctae citizens, a non-negative integer.
- *Purpose:* the visible density of civilization; growth made legible as life.
- *How generated:* increases only through ecological prosperity (Section 8).
- *How consumed:* never consumed, never reduced. `P` is a monotone ratchet.
- *How it affects future states:* higher population raises visible activity capacity and the completion rate of pending transformations; it produces nothing else (Section 11).

**Population activity `A_P ∈ [0, 1]`** — the expression level of the population: how much of the citizenry is out, working, gathering, and signaling.
- *Purpose:* reconciles the two canon truths that population never drops and that a quiet world grows sparse: the *count* is preserved; the *activity* dims.
- *How generated:* scales with illumination and energy availability.
- *How consumed:* read by the rendering layer as the density of visible civic life.
- *How it affects future states:* none beyond its own recovery — activity is an expression variable, never a producer.

**Mycelial network expansion `X_myc`** — the extent, thickness, and depth of the subterranean root mats.
- *Purpose:* the civilization's structural foundation; every structure anchors into it or into crystal (`NOCTIS_ECOLOGICAL_ENGINE.md` section 4, Rule 3).
- *How generated:* grows when chemosynthetic glucans are metabolized; accelerated by substrate fertility and by moth cross-pollination.
- *How consumed:* never shrinks; expansion is cumulative living infrastructure.
- *How it affects future states:* crossing depth thresholds breaches ancestral vaults (deterministic discovery events feeding Memory State); expansion enables new anchored growth and supports population prosperity.

**Crystal lattice mass `X_cry`** — the accumulated geometric crystal grown by the mathematics pathway.
- *Purpose:* the civilization's memory-battery infrastructure.
- *How generated:* grows when piezo-electric brine is metabolized.
- *How consumed:* never shrinks.
- *How it affects future states:* sets energy storage capacity and damps the offline decay rate of surrounding systems (Section 4) — the canonical offline benefit of the mathematics pathway.

**Fauna activity `(survey, moths, detritivores)`** — the state of the three ecological fauna networks (Section 7): survey coverage of the chiroptera flights, activation of the spore-moth season, and the fertility output of the detritivore cycle.
- *Purpose:* makes the ecology a living system of loops rather than a warehouse of objects.
- *How generated:* survey coverage advances with each new session; moth season follows consistency; detritivore fertility follows canopy activity.
- *How consumed:* fertility is consumed by fungal growth; survey coverage is consumed by discovery; moth acceleration is consumed by pending transformations.
- *How it affects future states:* each loop feeds the ecological variables above it — never the reverse.

### Technological State

**Era designation** — exactly one of the five canonical eras (Section 9): `SPORE_HEARTH`, `CRYSTAL_INSCRIPTION`, `PHONONIC_SUBTERRANEAN`, `OPTOGENETIC_CIRCUIT`, `COSMIC_STELLAR`.
- *Purpose:* the civilization's current relationship to knowledge, memory, and night.
- *How generated:* advances when era maturity crosses the next era threshold.
- *How consumed:* read by every domain as the ambient sophistication level.
- *How it affects future states:* monotone — eras never regress; each era raises the ambient efficiency of metabolism and unlocks new classes of ecological expression.

**Research maturity `R`** — accumulated innovation pressure: the civilization's readiness for its next technological step.
- *Purpose:* the gating quantity for era evolution.
- *How generated:* fed by difficulty, breakthroughs, and completions; blooms convert reserve stocks into permanent maturity.
- *How consumed:* never decays; holds through any absence.
- *How it affects future states:* crossing maturity thresholds (lowered by cultural breadth) fires blooms and, at era boundaries, era transitions.

**Information-storage stage** — the civilization's current memory technology, an era-linked designation: tactile knot cords, fiber scrolls and crystal lattices, phononic sound-vaults, living mycelial boards, entangled lattice pairs.
- *Purpose:* expresses how the civilization remembers, per era.
- *How generated:* derived deterministically from era designation.
- *How consumed:* read by the memory and culture domains for the *form* new records take.
- *How it affects future states:* raises the yield richness of vault discoveries and cultural records in later eras.

### Memory State

**Historical achievements** — the permanent ledger of milestones: completed long projects, era transitions, monument grants.
**Unlocked discoveries** — vault shards unearthed by root expansion, survey-revealed regions, earned sensory-overlay access.
**User milestones** — the dated record of real study accomplishments the world has honored.

For all Memory State variables together:
- *Purpose:* the civilization as a personal historical record — the one category whose entire meaning is permanence.
- *How generated:* appended by deterministic threshold crossings (vault breaches, era transitions, completion inputs).
- *How consumed:* never consumed, never decayed, never overwritten, never deleted (`GAME_DESIGN.md` Section 9, Rules of Memory).
- *How it affects future states:* discoveries can permanently raise capability (a recovered blueprint schema deepens future growth); achievements anchor monuments whose presence is read by rendering; nothing in memory is ever spent.

---

## SECTION 3 — TIME SIMULATION MODEL

Noctis has exactly two time regimes. Both reach the simulation as plain numbers through a single door — the state-owning application layer — and neither involves a running loop anywhere (`ARCHITECTURE.md` Section 5).

### Active Time

Active time occurs while the application is open and study events are being recorded.

There is **no continuous ticking**. There is **no background simulation loop**. The engine is not a heartbeat; it is a reflex. It evaluates only when a meaningful event arrives:

- A completed study activity produces a learning input `I`, and the engine evaluates `T(S, I)`.
- Nothing else happens. Between events, the state simply *is*. Ambient motion on screen during quiet minutes is presentation, not simulation — the diorama breathing is the rendering layer's interpretation of a constant state.

This is the physics of the study-first pillar: a simulation that only reacts to meaningful events can never compete with the work that produces them.

### Offline Time

Offline time occurs when the application is closed and the user returns later.

At each evaluation checkpoint (application launch, mandatorily; optionally after long in-app idleness, per `ARCHITECTURE.md` Section 3), the application layer computes:

```
Δt = current timestamp − saved timestamp
```

Both timestamps live in the persistence envelope, outside the simulation state. The engine receives only `Δt`, and evaluates the decay model of Section 4 exactly once for the whole interval:

```
S' = D( S, Δt )
```

**Offline simulation is a mathematical evaluation, not a running world.** Five days of absence are not five days of computation; they are one closed-form evaluation over `Δt`. This is only possible because the decay model is built from integrable forms (linear discharge, exponential decay) whose value at any horizon can be computed directly. Nothing about the outcome depends on when, or how often, the evaluation runs: evaluating `D` over `Δt` must equal evaluating it over any partition of `Δt` into consecutive sub-intervals. This *composability law* is what makes lazy checkpoint evaluation lawful.

---

## SECTION 4 — OFFLINE DECAY MODEL

Noctis never punishes absence. Absence is dormancy: the wise conservation strategy of an ecology whose single energy source has gone quiet. The decay model exists to make return graceful, not to make leaving costly.

The elapsed-time evaluation `D(S, Δt)` proceeds through three ordered phases. The ordering is law (`ARCHITECTURE.md` Section 5): cushion before decay, dormancy last.

### Phase 1 — The Energy Cushion

Stored cognitive energy protects the civilization first.

The energy reserve `E` — surplus focus banked in the crystal lattices (Section 6) — discharges at a linear rate `δ_discharge` and, **while any reserve remains, completely absorbs environmental decay**. No dimming of any kind begins while the lattices still hold charge.

```
t_shielded = min( Δt, E / δ_discharge )
E'         = E − δ_discharge · t_shielded
Δt_decay   = Δt − t_shielded
```

During `t_shielded`, every environmental variable passes through unchanged. This is the canonical offline benefit of the mathematics pathway made physical: a user who has studied deeply builds a civilization that weathers their absence on stored focus. The discharge is linear because a battery drains by supplying a constant need — the dim hearth-glow and essential circulation of a quiet city — not in proportion to what remains.

### Phase 2 — Environmental Decay

After the cushion is exhausted, the renewable environmental variables diminish exponentially over the remaining interval:

```
V' = V · e^( −λ_V · Δt_decay )        for V in { L, Φ, nutrient reservoirs, A_P }
```

Each variable carries its own nominal rate `λ_V`, damped by protective infrastructure:

```
λ_V_effective = λ_V · ( 1 − damp(X_cry, culture modifiers) ),   0 ≤ damp < 1
```

Crystal lattice mass and memory-oriented cultural modifiers reduce the decay rate — never to zero, or absence would become consequence-free and the light economy dishonest.

**Why exponential decay represents biological dormancy.** A dormant ecology does not lose a fixed amount of life per day; it slows in proportion to how much activity remains. Metabolic processes damp each other as they quiet: dimmer light means slower circulation means lower consumption means slower dimming. Exponential decay is the unique memoryless law with this property — the rate of loss is always proportional to the current level, the curve is steepest at first and ever gentler afterward, and the value approaches rest asymptotically without ever crashing through it. There is no cliff, no collapse, no moment where the world is suddenly gone. The city dims the way breathing slows in sleep.

Decay touches **only** the renewable environmental variables listed above. It never touches accumulated knowledge, culture, innovation, population count, era, network mass, or any Memory State variable. What the user built is not what fades; only the *activity level* fades.

### Phase 3 — The Hibernation State

When illumination falls beneath the dormancy threshold — `L < θ_dormancy` — the civilization performs a single structural transition into hibernation.

**Calibration constraint (binds Tier 7 values):** with an empty energy cushion and nominal decay rates, illumination must cross `θ_dormancy` at approximately the canonical five-day absence horizon (`NOCTIS_ECOLOGICAL_ENGINE.md` section 7, the Abyssal Douse row). Deep energy reserves lengthen this horizon; that lengthening is earned, lawful, and intended.

In hibernation:

- **Population is preserved.** The count `P` does not drop by even one citizen. Activity `A_P` rests at its dormant floor — the citizens are indoors, tending memory; they are never gone.
- **Achievements are preserved.** Every Memory State variable is untouched.
- **Eras are preserved.** Era designation, research maturity, culture, accumulated knowledge, and network mass hold exactly.
- **No loss of history. No punishment.** Nothing is subtracted anywhere, ever, because the user was away.
- Illumination is exactly 0 (the state invariant of Section 1), and circulation is still. The metabolic light of the world is out; the world itself is intact.

**Hibernation is a fixed point of decay:**

```
D( S_hibernating, Δt ) = S_hibernating        for every Δt
```

A dormant state passes through elapsed-time evaluation unchanged, so dormancy never compounds, never deepens, and never accrues debt. Five days of absence and five hundred days of absence produce the same sleeping city. This is the canon rule "progression pauses, no penalties" enforced by mathematical shape rather than by tuning (`ARCHITECTURE.md` Section 3).

**Reawakening.** The first study session of canonical reawakening length — ten focus minutes — processed while hibernating transitions the status back to active before transmutation applies; nutrients then flow normally and the world relights from its preserved structure. A shorter session is still honored — its nutrients are banked quietly into reserves, nothing is wasted — but the structural wake transition awaits the canonical ten-minute session, so that the city does not flicker awake at a stray half-minute of attention.

Hibernation is conservation, not failure. The design intention, stated as physics: **the difference between presence and absence is luminosity, never legacy.**

---

## SECTION 5 — LEARNING TRANSMUTATION SYSTEM

Transmutation is the heart of the model: the lawful conversion of human cognitive effort into ecological consequence. It answers the simulation's single governing question — *how does human cognitive effort transform into a living dark-adapted civilization?* — with a metabolic chain:

```
Human cognition
      |
      v
Metabolic nutrients        (synthesis: this section)
      |
      v
Ecological changes         (consumption: Section 7)
      |
      v
Civilization evolution     (accumulation: Sections 6, 8, 9)
```

### Input Variables

A learning input `I` carries five semantic quantities (exact encodings bind at implementation under `ARCHITECTURE.md` Section 4):

| Variable | Meaning |
|---|---|
| Focus duration `d` | Real focused minutes of the session |
| Subject category `c` | The studied domain, resolved through the canonical cognitive-pathway taxonomy |
| Consistency `k` | Consecutive-day study count, computed from real session history |
| Difficulty `f` | Difficulty/failure-rate signal of the session, when available |
| Completion `b` | Breakthrough marker: milestone reached, long project finished |

### Nutrient Synthesis

Every subject category resolves deterministically to a weight vector `w(c) = (w_brine, w_glucans, w_catalysts)` over the three canonical nutrients — pure categories map to a dominant nutrient, interdisciplinary categories to a blend. The category table binds at Tier 7; the pathway identities are canon and fixed:

```
+------------------------------------------------------------------------+
|                     CANONICAL METABOLIC PATHWAYS                        |
|                (NOCTIS_ECOLOGICAL_ENGINE.md section 5)                  |
+------------------------------------------------------------------------+
| Mathematics / Logic    ->  Piezo-electric brine                         |
|                              (crystalline energy: lattice growth,       |
|                               storage capacity, decay damping)          |
| History / Languages    ->  Chemosynthetic glucans                       |
|                              (carbon-rich sugars: mycelial expansion,   |
|                               vault breaches, cultural rooting)         |
| Creative Arts          ->  Luciferin catalysts (pigment register)       |
|                              (photophore mutation, dialect complexity,  |
|                               expressive culture)                       |
| Science / Engineering  ->  Luciferin catalysts (infrastructure          |
|                              register: aqueduct routing, instrument     |
|                              efficiency, research pressure)             |
+------------------------------------------------------------------------+
```

Science routes the catalysts; art teaches them new colors (`GAME_DESIGN.md` Section 2) — one nutrient chemistry, two registers of consequence.

Session yield is monotone in genuine effort and weighted by quality:

```
n(I) = d · q(f, recall) · w(c)         nutrient vector produced
U(I) = uptake( n(I), saturation )      amount the ecology can metabolize now
```

`q` weights depth and recall performance; it never inverts effort (more honest minutes never yield less). `uptake` applies **metabolic saturation**: the ecology can only digest so much in one interval. Yield beyond current metabolic need is not lost — it banks into the energy reserve up to lattice capacity (Section 6); only overflow beyond storage capacity dissipates as transient luminous expression. Saturation is a physical law with a design purpose: a genuine daily learning life outperforms any binge, not because binging is punished, but because a living system metabolizes at the pace of life.

### The Modulating Inputs

**Consistency `k` is circulation.** Circulation follows a monotone, saturating function of the consecutive-day count. At `k ≥ K_PLUME` (canonically three consecutive days) the spore-moth season activates: cross-pollination accelerates every pending transformation in the world. Subject choice decides *what* grows; showing up daily decides *how fast everything* grows.

**Difficulty `f` is pressure.** High difficulty and failure rates depress atmospheric stability and feed research maturity. Struggle is metabolized as innovation pressure and endurance — never as loss. A failure-heavy week leaves the civilization more fortified and closer to breakthrough, which is the model's honest reading of what hard study actually does to a mind.

**Completion `b` is charge.** Milestones and long-project completions inject innovation charge directly. When research maturity crosses its emergence threshold, the Benthic Bloom fires (Section 10): reserves surge toward the civic core, are consumed, and become permanent research maturity — possibility made structure.

### Why Different Knowledge Creates Different Worlds

The pathways are not flavor; they are the ecological mirror (`GAME_DESIGN.md` Section 5) made mechanical. Each family of cognition has a distinct character — structure-building, memory-rooting, expression-mutating, infrastructure-routing — and each is assigned the ecological system whose growth *is* that character:

- Mathematics builds lawful structure, so it grows the lattice: geometric, load-bearing, energy-storing.
- History and language root the present in the past, so they thicken the mycelium downward into buried strata, surfacing what was forgotten.
- Creative work changes how a culture expresses itself, so it mutates pigment, dialect, and theme.
- Science and engineering change what a culture can *do*, so they upgrade the routing of light itself.

No two users study alike, so no two civilizations can ever converge: the state trajectory is the biography.

---

## SECTION 6 — RESOURCE METABOLISM

Resources in Noctis are metabolic states, not currencies (`GAME_DESIGN.md` Section 6). Nothing is spent in a shop; nothing is allocated from a menu. Each resource is a different way of remembering the user's effort — as chemistry, habit, possibility, reserve, and life.

### Knowledge

- **Meaning:** accumulated cognitive progress — the lifetime stock `K_total`, plus the circulating nutrient reservoirs it arrives through.
- **Creation:** study activity, exclusively. Knowledge is the sole external energy input to the entire system; there is no photosynthesis in eternal night, no free calorie anywhere in the model.
- **Transformation:** repetition settles it into Culture; difficulty and completion pressurize it into Innovation; surplus above metabolic need banks into Energy; the reservoirs feed all ecological growth.
- **Consumption:** the reservoirs are consumed by ecology and blooms. `K_total` itself is never consumed and never decays.
- **Dependencies:** none upstream — it is the source. Everything downstream depends on it.
- **Long-term effect:** enables civilization complexity: era maturity, institutional depth, and the ceiling of every other system scale with it.

### Culture

- **Meaning:** language, history, and communication evolution — semaphore dialect complexity, ritual formation, district character.
- **Creation:** generated by the glucan pathway and the catalysts' pigment register: linguistic, historical, artistic, and literary study; deepened by topical persistence (repeated attention to the same subjects is what makes a custom).
- **Transformation:** cultural breadth lowers innovation emergence thresholds (a cross-pollinated civilization invents sooner); cultural depth enriches vault discovery yield (a literate civilization writes richer history from the same shard).
- **Consumption:** never consumed. Culture never decays; it is frozen intact through any dormancy and resumes where it paused.
- **Dependencies:** knowledge inflow along its pathways; information-storage stage for the form its records take.
- **Long-term effect:** changes civilization expression — the drifting dialects, deepening rituals, and district personalities that make the world legible as a society rather than a diagram.

### Innovation

- **Meaning:** long-term technological pressure — research maturity `R`, the civilization's accumulated readiness to become something new.
- **Creation:** achieved through focus breakthroughs: sustained high-difficulty work, milestone completions, long-project finishes.
- **Transformation:** at emergence thresholds (lowered by cultural breadth), pressure converts reserve stocks into permanent maturity — the bloom. Accumulated maturity is the quantity that crosses era boundaries.
- **Consumption:** blooms consume nutrient reserves (the visible surge toward the civic core). Maturity itself never decays and holds through any absence.
- **Dependencies:** knowledge reserves to consume; cultural breadth for its cheapest thresholds.
- **Long-term effect:** allows era transitions; each permanent step raises the ambient efficiency of every other loop (better infrastructure routes nutrients further, better instruments deepen culture).

### Energy

- **Meaning:** stored metabolic reserve — surplus bio-light banked as charge in the crystal lattices.
- **Creation:** automatic banking of uptake beyond current metabolic need, up to capacity `C_E = capacity(X_cry)` — mathematics study literally enlarges the battery.
- **Transformation:** none; energy is the one resource whose entire purpose is to be *held* and then *given back* during absence.
- **Consumption:** linear discharge during offline intervals, fully shielding the environment while any charge remains (Section 4).
- **Dependencies:** lattice mass for capacity; cultural memory-modifiers damp its discharge draw.
- **Long-term effect:** protects against decay: deep reserves make absences graceful and lengthen the horizon to dormancy. **Metabolic priority law:** when the user returns, living systems are fed before storage is recharged — the world always spends on life before saving for later.

### Population

- **Meaning:** visible civilization activity — the walking consequence of flourishing.
- **Creation:** grows only through ecological prosperity (Section 8).
- **Transformation / Consumption:** none. Population is not a management resource. **No starvation. No deaths. No manual assignment.** Not ever, in any era, under any state.
- **Dependencies:** canopy expansion and substrate fertility for growth; energy and illumination sustain its activity expression during quiet periods.
- **Long-term effect:** raises the completion rate of pending transformations and the density of observable civic life; deliberately produces nothing else, so it can never become an optimization target.

### The Metabolic Ledger

```
study minutes ──> nutrient synthesis ──> uptake (saturating)
                                           |── living systems first
                                           |     (illumination, circulation,
                                           |      ecological growth)
                                           |── then reserve banking (energy,
                                           |      up to lattice capacity)
                                           └── overflow dissipates as
                                                 transient light
```

Every unit that enters the system is accounted for: metabolized, banked, or visibly dissipated. Nothing appears from nowhere; nothing vanishes silently (Section 12, Conservation).

---

## SECTION 7 — ECOLOGICAL SIMULATION

The ecology is a set of coupled living systems, not a collection of objects. Each system has a source, a function, and a consumer; each is powered — directly or through recycling — by metabolized learning, because nothing else in eternal night carries energy.

### The Mycelial Network

- **Role:** the civilization's foundation. Every structure that ever grows anchors into root or lattice (`NOCTIS_ECOLOGICAL_ENGINE.md` section 4, Rule 3); the mycelium is the living half of that law.
- **Powered by:** history and language learning — the chemosynthetic glucan pathway.
- **Physics:** expansion `X_myc` grows monotonically with glucan uptake, multiplied by substrate fertility (detritivore output) and by moth-season acceleration. Growth is directional in meaning: outward expansion enables new anchored structures; downward expansion probes the buried strata of the world.
- **Deterministic discovery:** each crossing of a depth threshold breaches an ancestral shale vault, appending a discovery to Memory State — historical data shards, rare decorative spores, blueprint schemas. Thresholds are fixed functions of expansion, so discovery is earned and repeatable-in-law: a week of steady language review always excavates, though what it excavates depends on how deep the roots have already gone.

### The Crystal Network

- **Role:** energy and information infrastructure — the civilization's memory batteries and, in later eras, the physical substrate of its records and instruments.
- **Powered by:** mathematics and logic learning — the piezo-electric brine pathway.
- **Physics:** lattice mass `X_cry` grows monotonically with brine uptake. Mass determines energy capacity `C_E` and the decay-damping factor of Section 4. Lattice geometry order (an expression attribute read by rendering) sharpens with the depth and rigor of the logical study that grew it.
- **Systemic meaning:** the crystal network is why mathematics protects the world during absence — structure studied becomes structure that endures.

### The Fauna Networks

Fauna are ecological processes with population-like expression — never units, never collectibles, never assignable.

**Chiroptera survey organisms.** Each new study session dispatches the dual-frequency echolocation flocks. Survey coverage advances toward the current frontier of the unexploited world, expanding the mapped-boundary state and enabling boundary discoveries. Survey is the ecology's cartography of the unknown: the more the user shows up, the more of the dark acquires shape.

**Spore-moth networks.** The pollinator season. Activation is driven by the consistency state (`k ≥ K_PLUME`); while active, a global acceleration multiplier applies to every pending transformation — construction completing, mutations resolving, growth finishing. Deactivation follows loss of the consistency condition, without any penalty beyond the return to base speed.

**Detritivore cycles.** The recycling loop. Canopy activity sheds spore-fall in proportion to ecological activity; the detritivore colonies convert spore-fall into substrate fertility at a fixed efficiency strictly less than one; fertility multiplies fungal growth and feeds population prosperity. The loop is bounded by its input — recycling amplifies living activity, it can never substitute for it — so the cycle obeys conservation and dies back gracefully as the world quiets.

```
learning uptake ──> canopy activity ──> spore-fall ──> detritivore conversion
                        ^                                     (efficiency < 1)
                        |                                          |
                        └────────────── substrate fertility <─────┘
```

The loop's purpose is textural honesty: a well-fed world does not merely grow, it *cycles* — and the cycling itself is downstream of the user's mind.

---

## SECTION 8 — POPULATION DYNAMICS

### The Law

Population is an indicator of civilization flourishing — a reading on the ecology's prosperity, not a workforce, not a mouth-count, not a target.

```
P(t+1) = P(t) + growth( π(t) )        growth ≥ 0 always

π = prosperity( canopy expansion, substrate fertility,
                illumination, energy sufficiency )
```

`growth` is zero below the flourishing threshold and rises monotonically (with saturation) above it. Population changes through ecological prosperity and through nothing else. The count is a **monotone ratchet**: it never decreases — not during decay, not in hibernation, not for any input. The visible quieting of a dormant city is carried entirely by the activity expression `A_P` (Section 2), which dims with illumination while the count holds; citizens go indoors, they do not go away.

### Forbidden Mechanics

The following do not exist in this model and may never be added to it:

- Population micromanagement of any kind: no assignment, no jobs board, no per-citizen commands.
- Housing limits, caps that demand construction, or crowding pressure.
- Starvation, hunger states, or any consumption-failure mechanic.
- Death simulation: no citizen is ever removed, and none is ever shown dying from user absence.

### Why A Passive Civilization Requires Different Population Logic

Strategy games treat population as a consumable input: units to feed, house, employ, and lose. That logic exists to create resource tension the player must manage — and management is precisely what Noctis refuses to ask of its user (`GAME_DESIGN.md` Section 1: the user is weather, not architect). In a passive civilization, population has the opposite job: it is an *output* — the most emotionally legible display of accumulated flourishing. It must therefore be safe (no tension), monotone (growth is never clawed back, because the learning that earned it already happened and cannot un-happen), and productive of nothing (Section 11 forbids the edge from population to any resource, so more citizens can never become a farm, a quota, or a reason to grind). The citizens are the consequence of the user's mind, never a demand on it.

---

## SECTION 9 — TECHNOLOGY EVOLUTION SYSTEM

### The Five Canonical Eras

The era state machine has exactly five states, in fixed order, mapped one-to-one onto the production eras of `GAME_DESIGN.md` Section 7 and, through them, onto the canonical movements of the tri-document canon:

| Canonical designation | Production era (Tier 4) | Canonical movement (Tiers 1–3) |
|---|---|---|
| `SPORE_HEARTH` | Era I — The Spore & Hearth Era | Spore-Hearth Era |
| `CRYSTAL_INSCRIPTION` | Era II — The Aqueduct & Inscription Era | Crystal and Inscription Era |
| `PHONONIC_SUBTERRANEAN` | Era III — The Phononic Hydro-Fluidic Era | Transitional elaboration toward Bio-Circuitry |
| `OPTOGENETIC_CIRCUIT` | Era IV — The Optogenetic Circuit Matrix | Bio-Circuitry and Alchemical Network Era |
| `COSMIC_STELLAR` | Era V — The Cosmic Stellar Chasm | Terminal extension of Bio-Circuitry |

### How Technology Emerges

There are **no unlock menus, no upgrade trees, no costs**. Technology is not purchased; it *precipitates* from accumulated knowledge the way crystal precipitates from saturated brine. The era designation advances when era maturity crosses the next boundary:

```
M = maturity( K_total, R, cultural breadth, consistency history, m )

era advances when  M ≥ Θ_era(next era)          eras never regress
```

Maturity is a weighted, monotone combination of learning maturity in the canon's full sense — breadth, consistency, depth, difficulty, and reflection all contribute (`VISION.md`, The Meaning Of Eras) — with research maturity `R` (Section 6) as the load-bearing term: blooms are the discrete steps by which a civilization becomes ready. Weights and thresholds bind at Tier 7. Era transitions are structural state changes evaluated like any other transition; their staging as gradual overnight metamorphosis is a rendering concern.

### What Changes At Each Era

For each era, the simulation binds four abstract capabilities; every visual and narrative consequence downstream of them belongs to Tiers 2, 4, and 8.

**`SPORE_HEARTH`**
- *Information storage:* tactile knot-cord records — memory as knots tied by hand.
- *Communication:* near-range photophore semaphores and touch; echolocation survey pings captured on tympanic resonators.
- *Infrastructure:* communal cold spore-hearths, root-paths, wild bioluminescent cultivation.
- *Civilization expression:* a fragile communal clearing of glow in vast dark; survival close to the light it keeps.

**`CRYSTAL_INSCRIPTION`**
- *Information storage:* raised fiber scrolls and crystal memory lattices; the first true archive.
- *Communication:* routed light — aqueduct signals and refracted guide-beams carrying meaning between districts.
- *Infrastructure:* luciferin-synthesizing glass plumbing, fiber-optic crystal light-pipes, resonant crystal batteries.
- *Civilization expression:* coordination — light shared across distance and time; a village becoming a polity.

**`PHONONIC_SUBTERRANEAN`**
- *Information storage:* resonant sound-vaults holding records as standing acoustic patterns and engraved vibration grooves.
- *Communication:* phononic telegraphy — data as low-frequency vibration through the bedrock itself; industrialized shutter-semaphore towers.
- *Infrastructure:* cold hydrostatic pressure works, fluidic logic computation, electroformed mineral refinement — massive mechanical power without a single flame.
- *Civilization expression:* patient industrial strength; the dark itself made to do work.

**`OPTOGENETIC_CIRCUIT`**
- *Information storage:* living mycelial boards — records grown into computing tissue.
- *Communication:* frequency-coded light pulses across biomorphic glass fiber; streets that carry information.
- *Infrastructure:* neural-mycelial computer arrays, optogenetic processing vaults, light-routing towers; the city as one connected organism.
- *Civilization expression:* cerebral serenity — a civilization whose thinking is visible as weather.

**`COSMIC_STELLAR`**
- *Information storage:* quantum-entangled lattice pairs holding identical memory across any distance — knowledge as one simultaneous whole.
- *Communication:* instantaneous lattice-state sharing; aurora projection as civic language.
- *Infrastructure:* rift observatories, suspended instrument plates (all anchored — nothing floats free), starlight collectors.
- *Civilization expression:* transcendence turned toward the remaining unknown; the first question, grown up.

### The Stellar Guard

A hard physical law rides with the final era: **starlight is a catalyst and calibration medium, never a substitute energy source.** The collectors of `COSMIC_STELLAR` amplify and refine metabolic loops that only the user's harvested bio-light can drive. If study stops, the collectors dim into ceremonial stillness and the decay model of Section 4 proceeds exactly as in the first era. Under no configuration, in any era, does the civilization become energetically independent of the user's mind. The world at its most transcendent runs on the same rare cognitive weather it ran on around the first hearth.

---

## SECTION 10 — EVENT GENERATION MODEL

### Events Are Observations, Not Rewards

An event in Noctis is a *noticing*: the simulation observing that something meaningful changed between two states, and saying so once. Events carry no payload of points, bonuses, or prizes — every durable consequence they describe already lives in the state snapshot. They exist so the rendering layer knows that a moment worth witnessing has occurred.

The generator is the deterministic function fixed by `ARCHITECTURE.md` Section 6:

```
evaluate( I or none, S_before, S_after ) -> ordered event flags
```

It reads nothing but the two snapshots and the input; it is evaluated after every mutation; flags are emitted in the canonical table row order below, are transient, and are never persisted. All four canonical events are **transition observations** — each fires exactly when its condition crosses, which is what makes them deterministic and unrepeatable-by-accident.

### THE_PHEROMONE_PLUME

- **Trigger:** the consistency condition activates — the consecutive-day count reaches `K_PLUME` (canonically three consecutive daily sessions), observed as the spore-moth season switching from inactive to active between the snapshots.
- **Meaning:** rhythm has become season. The user's discipline is now a visible weather system.
- **State impact:** the moth network activates; the global acceleration multiplier applies to all pending transformations for as long as the consistency condition holds; circulation rises.
- **Visual layer handoff:** the flag plus the active moth-season state; the silver drift, migration lines, and their choreography are rendering interpretations guided by Tiers 2–3.

### BAROMETRIC_SHOCK_WAVE

- **Trigger:** atmospheric stability crosses below the shock threshold `θ_shock`, driven by a high difficulty/failure signal in the session input.
- **Meaning:** the civilization has felt the pressure of the user's hardest work — and answers it with protection, not grief.
- **State impact:** the fortification posture engages: reserve drawdown pauses, endurance memory accrues, stability then relaxes deterministically toward calm across subsequent evaluations. No stock, structure, or memory is lost; a hard week leaves the world *stronger-founded*.
- **Visual layer handoff:** the flag plus the depressed-stability state; quivering channels and protective crimson dimming are the rendering layer's translation.

### ABYSSAL_DOUSE

- **Trigger:** an observed active-to-hibernating transition between the two snapshots — a crossing only the decay evaluation can produce (never a session, never rendering).
- **Meaning:** the ecology has chosen conservation; the world is sleeping sensibly, not dying of neglect.
- **State impact:** the hibernation invariants of Section 4 hold: illumination exactly zero, circulation still, activity at its dormant floor, population and all legacy fully preserved, the state a fixed point of further decay.
- **Visual layer handoff:** the flag plus the hibernating status; settled clear aqueduct fluid and stilled canopies are presentation. UI language around this state must remain welcoming (`ART_DIRECTION.md`, Hibernation).

### BENTHIC_BLOOM

- **Trigger:** research maturity crosses an emergence threshold — driven by a completion/breakthrough input or by accumulated pressure reaching readiness.
- **Meaning:** understanding has become invention: a genuine milestone in the user's real learning, honored as structure.
- **State impact:** nutrient reserves are consumed in the surge toward the civic core; research maturity permanently increments; era maturity may cross an era boundary in the same evaluation (in which case the era transition is part of this mutation's after-state).
- **Visual layer handoff:** the flag plus the incremented maturity and any era change; the rising neon-teal wave is the rendering layer's celebration, kept quiet by Tier 2 law.

### The Handoff Law

**Simulation produces signals. Rendering decides appearance.** The generator's output is a list of canonical flag designators and nothing more — no colors, no animations, no durations, no copy. Every visual manifestation in the canon's event table (`NOCTIS_ECOLOGICAL_ENGINE.md` section 7) is a *rendering obligation triggered by* these signals, never a property of them.

---

## SECTION 11 — SYSTEM DEPENDENCY TOPOLOGY

### The Canonical Flow

Within a single evaluation, influence flows strictly downward through six strata:

```
Learning Input            (focus blocks; elapsed time)
      |
      v
Metabolic Conversion      (pathway synthesis, saturation, banking)
      |
      v
Resource State            (knowledge, reservoirs, culture, innovation, energy)
      |
      v
Ecological State          (networks, fauna, illumination, circulation)
      |
      v
Civilization State        (population, era, expression, memory)
      |
      v
Event Signals             (transient flags; terminal output)
```

### No Circular Dependencies

The graph above is acyclic and its direction is law. Within one evaluation, no stratum ever reads a value computed below it. Where the model contains legitimate feedback — culture lowering innovation thresholds, lattice mass damping decay, fertility multiplying growth — the downstream value is read **from the previous state** `S(t)` and applied as a constant during the computation of `S(t+1)`. Feedback across time steps is lawful recurrence; feedback within a step would be circular definition, and is forbidden. This single rule keeps every evaluation a finite, ordered, deterministic pass.

Forbidden edges, stated explicitly:

- **Population cannot create knowledge** — or nutrients, or culture, or any resource. Citizens are consequence, never source; otherwise the civilization would become a self-feeding engine that no longer needs the user's mind, falsifying the entire premise.
- **Buildings cannot create resources.** Structures are expressions of ecological and civilization state. Passive generation by owned objects is the rejected economy of the archived pre-canon design and may not leak back in (`ARCHITECTURE.md`, Final Architectural Guardrails).
- **Visuals cannot affect simulation.** No rendering state, camera state, window state, or user gaze ever enters `F`. The world grows identically whether watched or not — which is precisely why watching it feels honest.
- **Events cannot modify state.** Flags are outputs of the comparison between snapshots, never inputs to the next transition. Anything durable an event describes already happened inside the state.
- **Time cannot enter except as `Δt`.** No stratum may consult a clock (Section 3).

### Why Topology Is A Physics Law

The dependency direction is not an engineering preference; it is the mathematical form of the module's meaning. Learning is the only source (`VISION.md`: light as metabolism), so the graph must have exactly one root. The civilization is a reflection, so nothing downstream may push back upstream within an evaluation. The night runs on the user's mind — and the topology is where that sentence becomes checkable.

---

## SECTION 12 — MATHEMATICAL INTEGRITY LAWS

These laws bind every current system and every future extension. A proposed mechanic that violates any one of them is invalid regardless of its other merits, and must be redesigned from the constraint upward.

### Law 1 — Determinism

`F(S, I, Δt)` is a pure function. Same input, same output, always — states, flags, and their order. No randomness, no clocks, no hidden iteration counts, no environmental reads. Corollary (composability): evaluating elapsed time over `Δt` equals evaluating it over any partition of `Δt`; lazy checkpoints are therefore exact, not approximate.

### Law 2 — Conservation

No impossible resource creation. Every stock increase traces to exactly one of: metabolized learning input, transformation of another stock (at efficiency ≤ 1), or recycling of system byproducts (at efficiency < 1). Every stock decrease traces to transformation, consumption by a named system, lawful decay, or explicit dissipation. The metabolic ledger of Section 6 balances at every evaluation. Population is exempt as a non-conserved *indicator* — but it is bounded by the prosperity function and produces nothing, so the exemption can never mint value.

### Law 3 — Separation

The simulation cannot know presentation. No state variable encodes appearance; no transition reads rendering; no event carries visual instruction. The same blindness extends to platform: no clock reads, no persistence knowledge, no channel names (`ARCHITECTURE.md` Sections 1–2). The model must remain evaluable, in principle, by hand on paper.

### Law 4 — Persistence

User achievements survive absence — all of them, always. Accumulated knowledge, culture, innovation maturity, era designation, network mass, population count, and every Memory State entry are invariant under `D` for every `Δt`. Decay's entire domain is the renewable environmental layer: illumination, circulation, reservoirs, activity expression. What learning built, absence cannot touch.

### Law 5 — Non-Punishment

Dormancy preserves progress. Formally: for every state `S` and every `Δt`, the legacy projection of `D(S, Δt)` equals the legacy projection of `S`; hibernation is a fixed point of `D`; and no input `I` exists whose processing reduces any legacy variable. There is no mechanism anywhere in the model by which the user can *lose* for having lived their life. Absence dims; it never subtracts.

### Corollary Laws

- **Monotone Legacy:** `K_total`, culture, research maturity, era, network masses, population count, and memory entries are non-decreasing over the lifetime of a civilization.
- **Boundedness:** illumination, circulation, stability, and activity live in `[0, 1]`; all quantities are finite; the validation invariants of Section 1 hold on every produced state.
- **Dormancy Fixed Point:** `D(S_hibernating, Δt) = S_hibernating`.
- **Saturation:** metabolic uptake per evaluation saturates; sustained genuine study strictly dominates burst grinding without any burst ever being punished.
- **Honesty (Trustworthy Mystery):** the same class of behavior always produces the same class of consequence; any pattern a patient observer infers from the world must be true (`GAME_DESIGN.md` Section 8). The model may keep secrets; it may never tell lies.

---

## SECTION 13 — FUTURE EXPANSION BOUNDARIES

### The Physics / Domain Boundary

**SIMULATION_SYSTEMS.md defines the physics.** State categories, transition structure, functional forms, ordering laws, invariants, event conditions, and topology — the laws every subsystem lives under.

**The Tier 7 domain blueprints define the specialized domains.** Each binds the concrete formulas, coefficient values, category tables, and threshold constants for its territory — every bound value carrying a canon citation, under the calibration constraints stated here (`ARCHITECTURE.md`, authority chain):

- **`CITIZEN_SYSTEM.md`** — citizen activity loops, semaphore dialect drift mechanics, lore-capture state hooks; everything that makes `A_P` legible as lives being lived.
- **`ECOLOGY_SYSTEM.md`** — network growth coefficients, fauna cycle rates, recycling efficiencies, vault-depth threshold tables, survey frontier mechanics.
- **`CULTURE_SYSTEM.md`** — dialect complexity measures, ritual formation, district behavioral modifier tables, cultural breadth metrics.
- **`TECHNOLOGY_SYSTEM.md`** — era maturity weights and thresholds `Θ_era`, bloom emergence thresholds, infrastructure efficiency curves per era.
- **`MEMORY_SYSTEM.md`** — vault entry generation, monument grant conditions, milestone taxonomy, the permanence guarantees in practice.

Domain blueprints may specialize the physics; they may never contradict it. A Tier 7 equation that breaks a Section 12 law is invalid at birth. The Tier 8 production pipeline documents (visual and asset authoring) sit below all of this and must not define simulation rules of any kind.

### Deliberately Unbound At This Tier

For clarity of the contract, this document intentionally does **not** bind: any numeric coefficient or threshold value beyond the three canonical anchors (three-day plume, five-day douse horizon, ten-minute reawakening); the subject-category-to-pathway weight table; the exact state field identifiers; the internal decomposition of the engine; and any presentation behavior whatsoever. Those bindings belong to Tier 7 and the implementation phases, under these laws.

---

## FINAL QUALITY TEST

- [x] **Does this describe a simulation engine, not a game?** Yes — a state machine, transition laws, and integrity constraints; no objectives, no win states, no loops of challenge and reward.
- [x] **Are all rules deterministic?** Yes — one pure transition function; randomness, clocks, and hidden timers are prohibited by Law 1 and Section 1.
- [x] **Is there zero micromanagement?** Yes — no placement, allocation, assignment, or spending exists anywhere in the model; the user's only input is real study.
- [x] **Is absence non-punitive?** Yes — cushion, then bounded exponential decay of renewables only, then a fixed-point hibernation that preserves population, eras, achievements, and history (Law 5).
- [x] **Does every system connect to learning?** Yes — the topology has a single root; every stock, network, era, and event traces back to metabolized study input.
- [x] **Does it obey abyssal biology?** Yes — the nutrient triad, cold-light illumination bounded in the heatless waveband, anchored networks, and the fauna loops all derive from Tier 3.
- [x] **Does it avoid normal city-builder mechanics?** Yes — no construction queues, zoning, budgets, housing, starvation, or unit management; structures are grown expressions, and buildings cannot create resources.
- [x] **Does it avoid implementation details?** Yes — no code, classes, filenames, field identifiers, or UI; mathematics is symbolic with values reserved for Tier 7.
- [x] **Does it respect ARCHITECTURE.md boundaries?** Yes — time-blind engine, lazy checkpoint evaluation, cushion-before-decay ordering, dormancy fixed point, the before/after event contract in canonical row order, and immutability are all restated here as physics.
- [x] **Could engineers implement the engine from this document?** Yes — with the Tier 7 blueprints supplying bound constants, every transition, invariant, and signal defined here is directly implementable and testable.

---

## Closing Validation Statement

Every future simulation concept for the Noctis Civilization Module must pass, in order: the Tier 1 test of `VISION.md`, the Tier 2 test of `ART_DIRECTION.md`, the Tier 3 test of `NOCTIS_ECOLOGICAL_ENGINE.md`, the experience tests of `GAME_DESIGN.md`, the structural laws of `ARCHITECTURE.md`, and the physics of this document — determinism, conservation, separation, persistence, and non-punishment. Anything that fails is not adjusted at the edges; it is rejected and redesigned from the constraint up.

The world is a function. Learning is its only source. Absence is a fixed point. Legacy is monotone. The night runs on the user's mind — and these are the laws that keep it honest.
