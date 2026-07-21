---
doc_id: noctis.simulation_systems
tier: 6
authority: simulation_physics
role: deterministic_world_model
status: reconciled
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

This document is the physics specification of the Noctis civilization simulation: the shared, deterministic model from which every domain behavior derives. It defines what the civilization state *is*, how real-world learning becomes civilizational change, how time acts on the world, how domains propose and commit change without contradiction, and which laws no future system may break.

It is a **shared-physics** document, not a domain design. Tier 6 defines the platform; the completed Tier 7 blueprints (`CITIZEN_SYSTEM.md`, `ECOLOGY_SYSTEM.md`, `TECHNOLOGY_SYSTEM.md`, `CULTURE_SYSTEM.md`, `MEMORY_SYSTEM.md`, `ECONOMY_SYSTEM.md`, `LEARNING_INTEGRATION.md`, and `ERA_PROGRESSION.md`) specialize it. Where an earlier draft of this file pre-authored domain-specific rules, this revision replaces them with a shared constraint or a domain contract, so that each Tier 7 domain can develop correctly without contradiction.

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

The authority chain continues downward: the Tier 7 domain blueprints specialize the physics written here into domain formulas, coefficient values, life-cycle models, and lifecycle stages, each value carrying a canon citation, exactly as `ARCHITECTURE.md` prescribes. A Tier 7 rule that contradicts Tier 5 or this document is invalid; a rule *this* document once stated that contradicts the intent of Tiers 1–5 has been corrected here rather than preserved out of deference.

### What This Document Binds — And What It Refuses To Bind

**Binds:** the state-machine philosophy and the snapshot model; the extensible state *families* and their conceptual variables; the input contract and the interpreted-learning-profile shape; the elapsed-time contract and the classes of time behavior; the offline cushion/decay/dormancy structure and ordering; the evaluation lifecycle and the domain proposal/resolution model; the citizen-agency conservation boundary; the determinism-with-seeded-variation rule; conservation-by-domain; the legacy/active-possession distinction; the transition-and-event semantics; the cross-domain dependency and ownership rules; the integrity laws.

**Refuses to bind:** every numeric coefficient, rate, multiplier, and threshold *value* (written as named symbolic constants here; bound in the Tier 7 blueprints under the calibration constraints stated in this file); the exact field identifiers of the state schema; any code structure, module layout, class, or function; any visual, animation, asset, or UI behavior; and — the correction that defines this revision — **any complete Tier 7 domain model**: the citizen life cycle, the invention lifecycle, the internal model of culture, the economic mechanics, the memory model, the final era-transition formula, and the raw study-interpretation taxonomy all belong to their owning domains. Tier 6 gives each a contract, not a design.

Exactly three numeric anchors appear in this document, because the canon itself locks them: the three-consecutive-day consistency trigger, the five-day absence horizon, and the ten-minute reawakening session (`NOCTIS_ECOLOGICAL_ENGINE.md` section 7). All other day-scale or rate values are calibration questions bound at Tier 7, never fabricated here as law.

### Notation

Mathematics is written in plain text. `S` is a committed civilization state snapshot; `I` is an interpreted learning input; `Δt` is elapsed real time; `e^(−λ·Δt)` is exponential decay; `[0, 1]` is a closed unit interval. Named constants are written as symbols such as `θ_dormancy` or `δ_discharge`; their values bind at Tier 7. Time is measured in real-world minutes; day-scale anchors are expressed as canonical day counts. Domain-specific quantities (illumination `L`, circulation `Φ`, stability `σ`, accumulated knowledge `K_total`, consistency `k`, momentum `m`, population `P`, population activity `A_P`, mycelial expansion `X_myc`, crystal mass `X_cry`, research readiness `R`, energy reserve `E`, storage capacity `C_E`) are introduced where first used; each is owned by the domain that specializes it and is named here only to state the shared law it obeys.

---

## SECTION 1 — SIMULATION PHILOSOPHY AND THE STATE MACHINE

### The Civilization Is A Deterministic State Machine

Noctis is not a running world. It is a lawful mathematical object: a committed civilization state, and a transition function that maps one committed state to the next. The world does not "happen" between the user's actions; it is *evaluated* whenever a meaningful event occurs. Everything the user ever witnesses — growth, dimming, migration, invention, era change — is the difference between two committed snapshots of the same deterministic system.

### The State Transition

The engine follows one master relationship:

```
Previous committed state
  + interpreted real-world learning input
  + elapsed-time context
  + stable simulation context (civilization seed, prior history)
        |
        v
              New committed state
            + domain transition records

S(t+1) = F( S(t), I, Δt )
```

`F` is evaluated through the ordered lifecycle of Section 6. Its two load-bearing sub-evaluations, matching the two processing regimes of `ARCHITECTURE.md` Section 5, are:

```
S'  = D( S, Δt )       Elapsed-time evaluation: energy-cushion discharge,
                       renewable decay, dormancy transition (Section 5).

S'' = T( S', I )       Learning evaluation: interpretation, domain proposal
                       generation, conflict resolution, committed mutation
                       (Sections 6 through 9). Applied when learning input
                       is present; citizen and institutional action, where a
                       domain defines it, resolves in the same evaluation
                       under the agency boundary of Section 8.

transitions = E( I or none, S, S'' )
                       Transition observation on the before/after pair
                       (Section 12).
```

Both `D` and `T` are pure functions of their arguments and the stable simulation context: they read committed state and return a freshly constructed committed state, never modifying their input (the repo-wide immutability invariant of `ARCHITECTURE.md` Section 2).

### The Prohibitions

**Same input produces same output.** Given identical committed state `S`, interpreted input `I`, elapsed time `Δt`, and stable simulation context, the engine produces an identical `S(t+1)` and an identical transition list, on every machine, on every run, forever. This is what makes the world's mystery trustworthy (`GAME_DESIGN.md` Section 8): a user who patiently observes the city can derive true laws from it, because the laws never waver. Reproducibility is a law; mechanical *sameness of expression* is not — variation among causally qualified outcomes is permitted and defined in Section 11.

**Nondeterminism is forbidden.** No hardware randomness, wall-clock read, or uncontrolled entropy enters the engine (`ARCHITECTURE.md` Sections 1–2, 6). Every variation the world exhibits is a deterministic function of committed state, the civilization seed, and prior history — *seeded* variation, not random variation (Section 11). Nondeterminism may never decide a simulation *fact*.

**Hidden timers are forbidden.** Nothing in the simulation waits, ticks, counts down, or schedules. There are no background loops and no accumulating clocks (`ARCHITECTURE.md` Sections 3 and 5). Duration enters the system exactly once per evaluation, as the argument `Δt`, computed outside the engine from the persistence envelope. A civilization left alone is not "running slowly"; it is a committed state, waiting to be evaluated.

**The simulation cannot depend on rendering.** No state variable, transition, or observation may read anything from the presentation layer: not visibility, not window state, not animation progress, not viewport, not sprite or particle state. The dependency points one way only (Section 13). The world's physics are self-contained and lawful regardless of who observes them.

### State Invariants

Every committed state the simulation produces or accepts satisfies, at all times (enforced by the runtime Trope Guard of `ARCHITECTURE.md`):

- All numeric quantities are finite; no undefined or unrepresentable values.
- All resource and energy stocks are non-negative.
- Population is a non-negative integer.
- Illumination lies strictly within the heatless, non-glare waveband `[0, 1]` (`NOCTIS_ECOLOGICAL_ENGINE.md` section 4, Rule 1).
- The era designation is one of the five canonical eras (Section 15).
- The hibernation status entails zero illumination.

These invariants are physics, so that no lawful transition can ever leave the valid region.

---

## SECTION 2 — THE STATE SNAPSHOT AND ITS FAMILIES

The committed state is the single source of truth about the civilization. An earlier draft asserted that the state "contains, and only contains" a fixed, narrow list of variables. That claim is withdrawn: it prematurely foreclosed the domains this document exists to serve. The state is instead an **extensible composition of conceptual state families**, each owned by exactly one domain, each free to grow its own internal structure under the laws here. These are conceptual families, not code schemas; exact representations bind at implementation under `ARCHITECTURE.md`.

### The State Families

**Learning-derived input state.** The interpreted signals most recently supplied by learning, and the lifetime measures that accumulate from them — accumulated knowledge `K_total`, consistency `k`, learning momentum `m`. *Owned by:* Learning Integration (interpretation) and this document (the accumulation laws). The sole external source of civilizational possibility.

**Environmental / ecological state.** Renewable conditions (illumination `L`, circulation `Φ`, atmospheric stability `σ`, nutrient reservoirs), accumulated ecological structures (mycelial expansion `X_myc`, crystal mass `X_cry`), local habitats, and ecological pressures. *Owned by:* Ecology.

**Citizen / population state.** Population existence and count `P`, activity expression `A_P`, and — as the Citizen domain defines them — life-cycle context, skills, roles, institutions, and agent-level references. *Owned by:* Citizen. Tier 6 defines no citizen schema.

**Knowledge and capability state.** What the civilization knows, understands, can currently practice, can reproduce, transmits institutionally, and can technically act upon — held distinctly from raw learning input (Section 10, the capability distinction). *Owned by:* shared between Technology (technical capability) and Citizen/Culture (practice and transmission).

**Technology state.** Technological possibility, experiments, prototypes, active technologies, infrastructure, dependencies, maintenance condition, standards, and technical heritage. *Owned by:* Technology.

**Culture and social state.** Values, practices, legitimacy, prestige, trust, traditions, taboos, identities, institutions, and interpretation. *Owned by:* Culture. Not a single monotone stock (Section 17).

**Economy and allocation state.** Production, distribution, scarcity, exchange, ownership, and allocation, under the canon caution that Noctis has no coin, market, or user-facing spending (Section 20). *Owned by:* Economy.

**Memory and history state.** Recorded milestones, discovered historical facts, monuments, public narratives, distortions, and forgotten knowledge. *Owned by:* Memory. The one family whose entire meaning is permanence (Section 10).

**Era and progression state.** The current era designation and the broad civilizational developmental context. *Owned by:* Era Progression. Research readiness `R` is a contributing signal (Sections 15–16), never the whole of it.

**Transition state.** The committed changes of the most recent evaluation that downstream presentation and Memory may interpret (Section 12). Transient in transport, durable only where a domain records them.

Two laws bind every family. First, **single-writer ownership**: each state mutation has exactly one owning domain, and no domain silently writes another's family (Section 14). Second, **legacy protection**: the legacy projection of every family (Section 10) is preserved across absence regardless of how its active portion behaves.

---

## SECTION 3 — INPUT CONTRACT

Learning reaches the simulation as an **interpreted learning input** `I`, not as raw study telemetry. The raw session — its subject strings, its timing, its recall events — is interpreted by `LEARNING_INTEGRATION.md` before it crosses into the engine, exactly as the focus block of `ARCHITECTURE.md` Section 4 prescribes. Tier 6 binds only the *shape* of what arrives, never the subject taxonomy or the telemetry, which belong to Learning Integration.

The interpreted input carries semantic signals such as:

| Signal | Meaning |
|---|---|
| Focus duration `d` | Real focused minutes of the session |
| Interpreted learning profile | Already-interpreted dimensions: conceptual depth, retained understanding, revision strength, disciplinary exposure, interdisciplinary connection, sustained attention, mastery, curiosity, conceptual novelty |
| Difficulty `f` | Difficulty/failure signal of the session, when available |
| Consistency `k` | Consecutive-day study count, computed from real session history |
| Completion `b` | Breakthrough marker: milestone reached, long project finished |

The interpreted learning profile is the general input all domains read. **No single academic subject determines one exact ecological, technological, or cultural outcome.** Subject classification contributes to the profile; it does not act as an unlock equation (Section 7). Tier 6 fixes the profile as an open vector of interpreted dimensions; Learning Integration binds the dimensions and their derivation, and may extend them, provided each remains an already-interpreted signal and never raw telemetry.

---

## SECTION 4 — TIME MODEL AND ELAPSED-TIME CONTRACT

Noctis has exactly two time regimes. Both reach the simulation as plain numbers through a single door — the state-owning application layer — and neither involves a running loop anywhere (`ARCHITECTURE.md` Section 5).

**Active time** occurs while the application is open and study events are recorded. There is no continuous ticking and no background loop. The engine is a reflex: it evaluates only when a meaningful event arrives (a completed study activity produces `I`, and `F` is evaluated). Between events the committed state simply *is*; ambient motion on screen is presentation over a constant state.

**Offline time** occurs when the application is closed and the user returns later. At each checkpoint (launch, mandatorily; optionally after long idleness, per `ARCHITECTURE.md` Section 3), the application layer computes `Δt = current timestamp − saved timestamp` from the persistence envelope, outside the state, and the engine evaluates `D(S, Δt)` exactly once for the whole interval.

### Composability

Offline evaluation is a mathematical evaluation, not a running world: five days of absence are one closed-form evaluation over `Δt`, not five days of computation. Every time-dependent process must therefore be **composable** — evaluating it over `Δt` must equal evaluating it over any partition of `Δt` into consecutive sub-intervals — so that lazy checkpoint evaluation is exact, not approximate.

### Classes Of Time Behavior

Not every process is one exponential curve. Each time-dependent process declares, as part of its domain contract, which class it belongs to and answers five questions: is it evaluated lazily? is it composable over `Δt`? does it affect legacy or only active capability? may user absence cause it? which domain owns the result?

- **Preserved legacy** — unaffected by absence (Section 10). Recorded learning history, dated milestones, secured historical facts, era history, achievements, cumulative record.
- **Renewable expression** — may dim or fall dormant with absence and recover with presence (illumination, circulation, activity expression, reservoirs).
- **Maintenance-sensitive active systems** — active technologies, infrastructure, and institutions that may become degraded, unavailable, or dormant according to their domain's rules, but **never through ordinary user absence** as a punishment (Sections 9, 16).
- **Life-cycle state** — citizen demographic progression, if and only if `CITIZEN_SYSTEM.md` defines it; it advances by narrative/biological rule, never as a consequence of user neglect (Section 19).
- **Institutional and cultural continuity** — may persist, change, or become inactive by their own contracts (Sections 17, 19), with recorded history preserved regardless.
- **Historical recording** — always preserves what has already been validly recorded, subject to Memory-system rules on distortion, access, and interpretation (Section 21).

Tier 6 does not prescribe one decay formula for every system. It prescribes only that each declare its class and obey composability and non-punishment.

---

## SECTION 5 — OFFLINE EVALUATION: CUSHION, DECAY, DORMANCY

Noctis never punishes absence. Absence is dormancy: the wise conservation strategy of an ecology whose single energy source has gone quiet. The elapsed-time evaluation `D(S, Δt)` proceeds through three ordered phases, and the ordering is law (`ARCHITECTURE.md` Section 5): cushion before decay, dormancy last. `D` acts on the **renewable expression** class only; it never touches legacy, and it never drives the maintenance-sensitive, life-cycle, or institutional classes into loss (those follow their own domain contracts under non-punishment).

### Phase 1 — The Energy Cushion

Stored cognitive energy protects the civilization first. The energy reserve `E` — surplus focus banked in the crystal lattices (Section 9) — discharges at a linear rate `δ_discharge` and, while any reserve remains, completely absorbs environmental decay:

```
t_shielded = min( Δt, E / δ_discharge )
E'         = E − δ_discharge · t_shielded
Δt_decay   = Δt − t_shielded
```

During `t_shielded`, every renewable variable passes through unchanged — the mathematics-pathway offline benefit made physical (`NOCTIS_ECOLOGICAL_ENGINE.md` section 5). Discharge is linear because a battery drains by supplying a constant need — the dim hearth-glow and essential circulation of a quiet city — not in proportion to what remains.

### Phase 2 — Renewable Decay

After the cushion is exhausted, the renewable environmental variables diminish exponentially over the remaining interval:

```
V' = V · e^( −λ_V · Δt_decay )        for V in the renewable-expression class
                                       { L, Φ, nutrient reservoirs, A_P, ... }
```

Each variable carries its own nominal rate `λ_V`, damped by protective structure and memory-oriented modifiers:

```
λ_V_effective = λ_V · ( 1 − damp(X_cry, cultural preservation, ...) ),   0 ≤ damp < 1
```

Exponential decay is the unique memoryless law whose rate of loss is always proportional to the current level: steepest at first, ever gentler after, approaching rest asymptotically without ever crashing through it. The city dims the way breathing slows in sleep. Decay touches **only** the renewable-expression class; accumulated knowledge, culture's recorded history, research readiness, era, network mass, population count, and every Memory entry are untouched (Law 5).

### Phase 3 — The Hibernation State

When illumination falls beneath the dormancy threshold — `L < θ_dormancy` — the civilization performs a single structural transition into hibernation.

**Calibration constraint (binds Tier 7 values):** with an empty cushion and nominal decay rates, illumination must cross `θ_dormancy` at approximately the canonical five-day absence horizon (`NOCTIS_ECOLOGICAL_ENGINE.md` section 7). Deep energy reserves lengthen this horizon; that lengthening is earned, lawful, and intended.

In hibernation: population count is preserved; every Memory entry is untouched; era, research readiness, culture's record, accumulated knowledge, and network mass hold exactly; illumination is exactly 0 and circulation is still. **Hibernation is a fixed point of decay:**

```
D( S_hibernating, Δt ) = S_hibernating        for every Δt
```

A dormant state passes through elapsed-time evaluation unchanged, so dormancy never compounds, never deepens, and never accrues debt. Five days and five hundred days of absence produce the same sleeping city.

**Reawakening.** The first study session of the canonical reawakening length — ten focus minutes — processed while hibernating transitions the status back to active before the learning evaluation applies; the world then relights from its preserved structure. A shorter session is honored — its influence banks quietly into reserves — but the structural wake transition awaits the canonical ten-minute session, so the city does not flicker awake at a stray half-minute of attention.

The design intention, stated as physics: **the difference between presence and absence is luminosity and active vitality, never legacy.**

---

## SECTION 6 — EVALUATION LIFECYCLE AND THE DOMAIN PROPOSAL MODEL

`F` is a single ordered pass. The earlier draft fixed a narrow six-stratum topology that admitted no citizen or institutional agency; this revision generalizes it into a **domain proposal and resolution model** that supports genuine agency while forbidding same-step circular calculation. The sequence is conceptual, not implementation pseudocode:

```
1.  Input normalization        Interpreted learning input and Δt are validated
                               and brought into canonical form.
2.  Elapsed-time & dormancy    D(S, Δt): cushion, renewable decay, dormancy
                               (Section 5). Wakes a hibernating world if the
                               canonical session is present.
3.  Learning interpretation    The interpreted profile is read into the
                               learning-derived family; K_total, k, m update.
4.  Environment & resources    Ecological synthesis and resource metabolism
                               evaluate on the post-decay state (Section 7).
5.  Citizen perception &       Which citizens and institutions are *eligible*
    action eligibility         to act is derived from committed state and the
                               agency boundary (Section 8).
6.  Domain proposal generation Each domain proposes mutations to its own family
                               — growth, invention steps, cultural drift,
                               life-cycle events, records — reading only
                               committed prior-state values of other families.
7.  Conflict & dependency      Proposals are resolved in a stable order
    resolution                 (Section 13); dependencies read prior committed
                               state; no proposal reads another's same-step
                               result.
8.  Committed state mutation   The resolved proposals are applied, producing the
                               new committed state. Each mutation is attributed
                               to its owning domain.
9.  Memory / history recording Durable consequences are recorded into Memory
                               state by the Memory-owning path (Section 21).
10. Transition observation     E compares before/after committed states and
                               emits transition records and the four canonical
                               world-event flags (Section 12).
11. Rendering handoff          The committed snapshot and transitions are
                               published; presentation interprets them
                               (Section 23). Simulation is already complete.
```

Ownership of each mutation is explicit (step 8). Feedback is lawful **across** committed evaluations and forbidden **within** one: any downstream value a proposal needs — fertility multiplying growth, culture conditioning adoption, infrastructure efficiency routing nutrients — is read from the *previous* committed state `S(t)` and applied as a constant while computing `S(t+1)`. This single rule keeps every evaluation a finite, ordered, deterministic pass with no undefined circular dependency.

---

## SECTION 7 — LEARNING TRANSMUTATION AND THE INTERPRETED PROFILE

Transmutation is the conversion of interpreted cognitive effort into civilizational consequence. Its ecological specialization is canon and unchanged: the three metabolic nutrient pathways of `NOCTIS_ECOLOGICAL_ENGINE.md` section 5 remain the **symbolic ecological tendencies** by which learning feeds the environment.

```
+------------------------------------------------------------------------+
|            CANONICAL METABOLIC PATHWAYS (ecological tendency)           |
|                (NOCTIS_ECOLOGICAL_ENGINE.md section 5)                  |
+------------------------------------------------------------------------+
| Mathematics / Logic    ->  Piezo-electric brine   -> crystalline order  |
| History / Languages    ->  Chemosynthetic glucans -> mycelial reach     |
| Creative Arts          ->  Luciferin (pigment)     -> expressive light   |
| Science / Engineering  ->  Luciferin (infrastructure) -> circulation     |
+------------------------------------------------------------------------+
```

These pathways are **tendencies at the ecological layer**, not unlock equations for every domain. The boundary is law:

> Subject classification contributes to the interpreted learning profile. It does not, by itself, determine one exact ecological, technological, or cultural outcome. No academic subject unlocks one fixed technology, culture, or ecology branch.

Ecology consumes the nutrient tendencies to grow its own family. Technology, Culture, Citizen, and Economy consume the **interpreted profile** — conceptual depth, retention, interdisciplinary connection, mastery, curiosity, difficulty, completion, novelty — and specialize it under their own contracts. A mathematics-heavy month tends to grow crystalline ecology (Tier 3 canon); whether it also enables a particular instrument, standard, or institution is a path-dependent Technology decision reading the whole profile and the whole state, never a direct subject→artifact grant.

Session influence is monotone in genuine effort and weighted by quality (`q` weights depth and recall; it never inverts effort — more honest minutes never yield less), and it saturates: the ecology and the civilization metabolize at the pace of life, so a genuine daily learning practice strictly dominates any binge without the binge ever being punished. Surplus above current metabolic need banks into the energy reserve up to lattice capacity; overflow beyond storage dissipates as transient luminous expression. Nothing appears from nowhere, and nothing vanishes silently (Section 9).

---

## SECTION 8 — CITIZEN AGENCY CONTRACT

The earlier draft declared that "population produces nothing" and that "citizens are consequence, never source." That wording is too broad: it reduces a living people to decorative density and starves every domain that depends on citizens as actors — most of all Technology. This revision replaces it with a narrower, exact conservation boundary.

### The Boundary

> Citizens cannot create primary learning-derived input, accumulated user knowledge `K_total`, or metabolic energy from nothing. Citizens and institutions **may** observe, think, experiment, invent, teach, learn, maintain, repair, operate, organize, transmit, preserve, interpret, adapt, and sometimes lose capabilities that learning, ecology, materials, institutions, culture, technology, and prior history already support.

Citizens are therefore genuine simulation actors. They may recombine existing supported capabilities into new arrangements and inventions (informational novelty), they may keep infrastructure alive through maintenance, and they may carry knowledge forward or let it lapse. What they may **not** do is manufacture the primary external input — the user's real learning, its metabolic energy, or lifetime knowledge — from within the world.

### Six Value Kinds

To keep agency honest, the model distinguishes:

- **Primary external input** — learning-derived energy, `K_total`, metabolic substrate. Source: real user study, only.
- **Internal transformation** — converting a supported capability into another form (at efficiency ≤ 1). Permitted.
- **Maintenance and reproduction** — sustaining or duplicating an existing active capability (consuming metabolic energy that traces to learning). Permitted.
- **Emergent combination** — a novel arrangement of existing ideas or techniques. Permitted; novelty is not energy from nothing.
- **Self-sustaining civilization activity** — the world remaining alive and busy between learning milestones. Permitted and desired.
- **Forbidden infinite generation** — any loop that mints unlimited primary energy, knowledge, or material value without a learning-derived foundation. Forbidden (Law 7).

The intended feel: Noctis is alive between major learning milestones — citizens invent, teach, maintain, and gather — without ever becoming a self-feeding idle game that renders the user's learning irrelevant. Every unit of *primary* value still traces to the user's mind; everything the citizens *do* with it is theirs.

The citizen contribution reaches other families only across committed evaluations (Section 6): citizen action proposed this evaluation reads prior committed state, and its consequences are read by other domains on the *next* evaluation. There is no same-step edge from population to primary input.

---

## SECTION 9 — CONSERVATION BY DOMAIN

Conservation is retained, but stated by domain rather than forced into one metabolic ledger. Every output must have a causal source appropriate to its kind:

- **External learning-derived value** must trace to real user learning. This is the anti-idle guarantee: the civilization's energy budget is bounded by the user's mind.
- **Physical and ecological transformation** must trace to existing materials, energy, organisms, or environmental processes, at efficiency ≤ 1 (recycling strictly < 1). Ecology owns this ledger.
- **Informational recombination** — a new technique or arrangement combined from existing ideas — is lawful without violating physical conservation. Novelty is not the creation of energy. Its *construction and operation* still draw metabolic energy that traces to learning.
- **Social and cultural emergence** — meaning, identity, trust, prestige, tradition, conflict — emerges from interaction and is **not** a material stock; it must not be forced into a material conservation equation. Culture owns its own accounting.
- **Economic value** may change through scarcity, allocation, labor, ownership, and exchange; Economy owns those rules (under the no-currency caution of Section 20).
- **Historical meaning** may expand through interpretation even when no physical stock is created; Memory owns that expansion.

The metabolic reserve ledger of the environmental layer still balances at every evaluation (uptake → living systems first, then reserve banking up to capacity, then transient dissipation). What changes is the recognition that not every domain is a metabolic stock, and that pretending otherwise is what made the earlier draft too rigid.

---

## SECTION 10 — LEGACY AND ACTIVE-POSSESSION DISTINCTION

The earlier draft made many systems permanently non-decreasing. Monotonicity is retained **only for true legacy**; living systems are freed to change.

**Legacy preservation** — the civilization *remembers that something existed or was achieved*. Monotone, never decreasing, never erased by absence:

- verified user learning history and accumulated knowledge `K_total`;
- dated milestones and user achievements;
- discovered historical facts, once securely recorded;
- major era history (the sequence of eras reached);
- the cumulative civilizational record.

**Active possession** — the civilization *can currently use, reproduce, maintain, access, or interpret* something. May change, migrate, decay locally, transform, fall dormant, become obsolete, lose participation, be abandoned, fail, be replaced, disappear from active use, or revive later:

- ecological active structure and habitat form;
- active cultural practice and institutional participation;
- active technological practice, infrastructure vitality, and reproducibility;
- illumination, circulation, and activity expression.

The two are decoupled, and the decoupling is the mechanism that lets Noctis have history without punishment. A civilization may **remember** a technology it can no longer **reproduce**; an archive may preserve a ritual no living citizen practices; a habitat may have existed and later transformed; an institution may be remembered after its collapse. In every case the legacy is intact and the active state has moved on.

**Non-punishment does not require the world to be frozen.** Absence freezes and later revives; internal causality (supersession, transmission failure, ecological change the user's own learning drove) may transform active possession while the user is present. What no cause may ever do is subtract a legacy value (Law 5), and what user absence in particular may never do is drive any active loss as a penalty (Law 6).

Population count is a special case reconciled with Tier 5: **user absence never reduces population** (`ARCHITECTURE.md` Section 5 — "population counts never drop" in the hibernation guarantee). Whether population changes through a natural life cycle during active evaluation — birth, aging, succession, death — is deferred entirely to `CITIZEN_SYSTEM.md` (Section 19). Tier 6 mandates neither immortality nor a death model; it requires only that any demographic dynamics be narrative or biological in origin and never a consequence of user neglect, and that recorded history outlive any citizen.

---

## SECTION 11 — DETERMINISM AND SEEDED VARIATION

The earlier draft forbade all randomness. That is stronger than the world needs and stronger than it can bear: a living civilization requires variation in *which* qualified citizen notices an opportunity, *which* institution investigates first, when an experiment resolves, how a prototype differs, in what order a technique is adopted, how faithfully knowledge transmits, and which small biography a citizen lives. This revision keeps reproducibility absolute while permitting variation — through determinism, not chance.

### The Rule

**Variation is permitted; nondeterminism is not.** All variation is *seeded*: a pure, deterministic function of stable inputs already in the committed record — the civilization seed, the committed state, the acting citizen or institution's identity, location, the historical sequence, and domain-specific context. The same complete history produces the same result, on every machine, forever. This satisfies `ARCHITECTURE.md`'s engine-purity and determinism laws (no clock, no hardware RNG), because seeded variation *is* "a deterministic function of existing state" — the carve-out the state machine already grants (Section 1).

### Constraints On Variation

- Variation selects **only among causally qualified candidates**; it never manufactures a candidate that prerequisites do not already support.
- Variation never substitutes for prerequisites. If nothing qualifies, nothing is selected — there is no lucky bypass.
- Variation may change **which** qualified outcome, actor, timing, or ordering is realized; it may never change a simulation *fact* that the state determines.
- No arbitrary civilization-wide change may issue from variation; seeds act locally, on the entity and context they belong to.
- Every varied outcome is **explainable**: because it is a function of committed inputs, its cause can always be reconstructed, and the result is committed into state or history so that all later evaluation remains deterministic.

**Recorded bounded stochasticity** — drawing from entropy and committing the result — is available only if a future `ARCHITECTURE.md` amendment ever admits a seed source into the engine boundary; until then, seeded deterministic variation is the sole permitted mechanism, and it is sufficient. Major outcomes remain causally grounded, reproducible, prerequisite-gated, and debuggable.

---

## SECTION 12 — TRANSITION AND EVENT SEMANTICS

An observation in Noctis is a *noticing*: the simulation observing that something meaningful changed between two committed states, and saying so. Observations carry no payload of points, bonuses, or prizes — every durable consequence they describe already lives in the committed snapshot. The earlier draft treated the four canonical flags as the *only* transitions the simulation could ever represent; this revision distinguishes four layers so that domains can express change without event spam and without new engine flags.

### The Four Foundational World Events

These remain the closed set of engine **event flags** published over IPC, fixed by `ARCHITECTURE.md` Section 6 and emitted in canonical row order by the deterministic generator `evaluate(I or none, S_before, S_after) -> ordered flags`:

- **`THE_PHEROMONE_PLUME`** — consistency reaches the canonical three-day trigger; the moth season activates and a global acceleration applies to pending transformations.
- **`BAROMETRIC_SHOCK_WAVE`** — atmospheric stability crosses below its shock threshold under a difficulty signal; the world enters its protective fortification posture. No loss.
- **`ABYSSAL_DOUSE`** — an observed active-to-hibernating transition; safe dormancy, a fixed point of further decay.
- **`BENTHIC_BLOOM`** — research readiness crosses an emergence threshold under a completion/breakthrough input; reserves surge and become permanent readiness; an era boundary may be crossed in the same evaluation.

These are rare, high-level, canonically named moments. Tier 6 adds **no** new engine event flags, and no domain may.

### Domain Transitions

Domains routinely need to express finer changes — prototype completion, first successful reproduction, infrastructure breakdown, technological loss, rediscovery, local adoption threshold, standardization, decommissioning, cultural revival, ecological succession, citizen succession, institutional formation. These are **domain transitions**, and they are represented *without* new engine flags, by the model that best fits `ARCHITECTURE.md`:

- **Committed before/after comparison.** A domain transition is a deterministic threshold crossing already implied by the committed state; it is detected by comparing `S_before` and `S_after`, exactly as `ECOLOGY_SYSTEM.md` Section 10 detects its internal ecological transitions. Because every durable consequence already lives in the snapshot, the renderer and Memory can observe the transition from committed state without a signal of its own.
- **History entries.** Where a transition is durable, the owning domain records it into Memory state (Section 21), which travels in the snapshot.

A **generalized typed transition-record channel** — transitions carried as first-class typed records alongside the four flags — is a possible future enhancement to the `ARCHITECTURE.md` Section 6 outbound contract; it is *deferred* to a Tier 5 decision and must not be assumed by any Tier 7 domain until adopted there.

### Discipline

A domain transition must never: act as a reward; mint resources; modify committed state after it has been observed; automatically become a user-facing popup; or bypass its owning domain. Presentation notifications are optional, owned by UI/rendering, and derived from committed state — never generated by the engine (Section 23). The event and transition contract must never become notification spam (`GAME_DESIGN.md` Section 11, Principle 4).

---

## SECTION 13 — CROSS-DOMAIN DEPENDENCY RULES

Within a single evaluation, influence flows through the lifecycle of Section 6 without cycles. The dependency graph across families is acyclic **per evaluation**; legitimate feedback is realized **across** evaluations.

- **No same-step circular dependency.** A domain proposal reads only prior committed values of other families; it never reads another domain's same-step result. Feedback (fertility multiplying growth, culture conditioning adoption, infrastructure efficiency routing nutrients, maintenance returning efficiency to metabolism) is read from `S(t)` and applied as a constant while computing `S(t+1)`.
- **Stable resolution order.** When proposals interact or compete for the same family, they resolve in a fixed, documented order, so the result is deterministic.
- **Explicit ownership of every mutation.** Each committed change is attributed to exactly one owning domain (Section 14). No domain silently writes another's family.

Forbidden edges, stated explicitly:

- **No family may mint primary learning-derived input.** Citizens, institutions, buildings, and infrastructure may transform and apply, never manufacture the user's learning, `K_total`, or metabolic energy (Sections 8–9; Law 7). This is the corrected form of the old "population produces nothing" — narrowed from "produces nothing" to "produces no *primary external input*."
- **Buildings cannot passively generate primary value.** Structures are expressions and instruments of state; the rejected passive-currency economy of the archived pre-canon design may not leak back in (`ARCHITECTURE.md`, Final Guardrails). Infrastructure may *return efficiency* to metabolism across time steps — never energy from nothing.
- **Rendering cannot affect simulation.** No presentation state ever enters `F` (Section 1).
- **Observations cannot modify state.** Flags and transitions are outputs of comparison, never inputs to the next transition.
- **Time cannot enter except as `Δt`.**

---

## SECTION 14 — DOMAIN OWNERSHIP

Every state mutation has exactly one owning domain. No domain may silently seize another's state. Tier 6 owns the shared platform; each Tier 7 domain owns its own mechanics.

**Simulation Systems (this document) owns:** the shared state-transition principles; update and evaluation semantics; the time-handling contracts and composability; the determinism and seeded-variation rules; rendering separation; persistence and non-punishment guarantees; the broad conservation-by-domain and causality rules; transition-record semantics and the four-flag world-event contract; the domain evaluation and resolution order; the shared validation laws; and the rules that forbid same-step circular dependency.

**Citizen owns:** individual agency; citizen life cycles (birth, aging, succession, death, migration, replacement, if defined); skills; biographies; relationships; personal decisions; professions at the citizen level; personal participation; personal knowledge and experience.

**Ecology owns:** organisms; habitats; ecological networks; biological succession; environmental consequences; species behavior; local ecological transformation.

**Technology owns:** technological possibility; experiments; prototypes; reproduction and reproducibility; technical capability; infrastructure dependencies; standards; maintenance; adoption compatibility; and technical loss and rediscovery.

**Culture owns:** values; practices; traditions; legitimacy; prestige; trust; symbols; identities; interpretation; and cultural diffusion and tension.

**Economy owns:** production; allocation; exchange; scarcity; ownership; distribution; labor and material-economic constraints; and pricing *if any exists* (Section 20).

**Memory owns:** historical records; remembered events; distortion; forgetting; archives; monuments; public historical narratives; and the persistence of recorded history.

**Learning Integration owns:** the interpretation of raw study activity; subject classification; retention and mastery signals; interdisciplinary connection; telemetry boundaries; and the delivery of the interpreted learning signals this document consumes.

**Era Progression owns:** the final era-transition conditions; broad civilizational transition; era gating; and era-level continuity.

**Presentation owns:** visuals; animation; sound; UI; user-facing notices; visual emphasis; and camera behavior. It reads committed state and transitions; it writes nothing to the simulation.

---

## SECTION 15 — ERA PROGRESSION CONTRACT

Era progression is a **broad civilizational transition**, not a technology score crossing a line. The earlier draft made era advancement a function chiefly of research maturity; this revision separates the two.

### The Five Canonical Eras

The era designation is one of five, in fixed order, mapped onto the production eras of `GAME_DESIGN.md` Section 7 and the canonical movements of Tiers 1–3:

| Canonical designation | Production era (Tier 4) | Canonical movement (Tiers 1–3) |
|---|---|---|
| `SPORE_HEARTH` | Era I — The Spore & Hearth Era | Spore-Hearth Era |
| `CRYSTAL_INSCRIPTION` | Era II — The Aqueduct & Inscription Era | Crystal and Inscription Era |
| `PHONONIC_SUBTERRANEAN` | Era III — The Phononic Hydro-Fluidic Era | Transitional elaboration toward Bio-Circuitry |
| `OPTOGENETIC_CIRCUIT` | Era IV — The Optogenetic Circuit Matrix | Bio-Circuitry and Alchemical Network Era |
| `COSMIC_STELLAR` | Era V — The Cosmic Stellar Chasm | Terminal extension of Bio-Circuitry |

The five designations, their fixed order, and their monotone advance (eras never regress) are canon (`ARCHITECTURE.md` Section 5; `GAME_DESIGN.md` Section 7).

### The Transition Protocol

Tier 6 defines the *protocol*; `ERA_PROGRESSION.md` binds the *conditions*.

```
era advances when  readiness( contributions ) ≥ Θ_era(next)      eras never regress
```

**No single hidden score defines an era.** The readiness that carries a civilization across an era boundary combines six domain-owned secured-maturity readings: technological capability (Technology), ecological succession (Ecology), population and institutional maturity (Citizen), cultural maturity in its relationship to knowledge (Culture), historical accumulation (Memory), and coordination maturity (Economy). Learning maturity in the canon's full sense — breadth, consistency, depth, difficulty, and reflection — is the sole upstream source feeding all six domains through Learning Integration; it is never a direct seventh gate term. Research readiness `R` is a principal input to Technology's contribution, load-bearing but never sufficient. The weights, per-domain floors, threshold `Θ_era`, and geometric-mean formula bind in `ERA_PROGRESSION.md`. Tier 6 requires that the readiness projection be monotone, that no single domain silently define the era, and that the transition be a committed state change evaluated like any other (its staging as gradual overnight metamorphosis is a presentation concern).

### Capability Envelopes, Not Guaranteed Packages

Each era defines a **capability envelope** — what becomes *possible* — not a package of technologies automatically installed civilization-wide. The per-era descriptions of `GAME_DESIGN.md` Section 7 and `NOCTIS_ECOLOGICAL_ENGINE.md` section 3 are reclassified accordingly:

- **Canon (identity + envelope):** the era's thematic relationship to knowledge, its permanent-night constraints, the heatless law, and the outer bound of what the era makes possible (e.g. `PHONONIC_SUBTERRANEAN` supports massive cold mechanical work and long-range vibration communication; `COSMIC_STELLAR` supports instantaneous lattice-paired memory and starlight calibration).
- **Representative examples / art direction:** the *specific* information-storage medium, communication method, and infrastructure named for each era. These illustrate the envelope; they are not guaranteed universal possessions.
- **Domain-owned, path-dependent:** which technologies a given civilization actually develops within the envelope, and which a given settlement locally adopts, are Technology decisions (Section 16), shaped by ecology, materials, culture, and history. Different settlements may possess different technologies within the same era. Era advancement must not instantly install one universal technological package across the whole civilization.

The **Stellar Guard** rides with the final era and is hard law: starlight is a catalyst and calibration medium, never a substitute energy source. No era achieves energy independence from the user's mind; if study stops, `COSMIC_STELLAR` dims into ceremonial stillness and the decay model of Section 5 proceeds exactly as in the first era.

---

## SECTION 16 — TECHNOLOGY CONTRACT

Tier 6 makes it *safe* to author `TECHNOLOGY_SYSTEM.md`; it does not author it. The earlier draft reduced technology to "knowledge + research maturity + cultural breadth + consistency → maturity → threshold → invention or era advancement." That is withdrawn. Technology is a lifecycle, not a meter.

Technology must be free to define distinct stages, at least: conceptual possibility; problem or opportunity recognition; prerequisite availability; investigation; experimentation; failure or partial success; prototype creation; reproducibility; production feasibility; maintenance feasibility; adoption; diffusion; normalization; adaptation; obsolescence; loss; and rediscovery. Research readiness `R` may remain an abstract civilization-level readiness signal and an input to the lifecycle; it may **not** replace the lifecycle, and **era advancement must not equal invention** (Section 15).

Shared constraints Tier 6 binds on any technology mechanic (the capability-distinction laws):

- No invention without causal prerequisites (Law 1).
- Knowledge is not identical to capability (Law 9): understanding a principle is distinct from being able to engineer, produce, maintain, or reproduce it.
- Prototypes are not identical to scalable technologies.
- Invention does not imply adoption; adoption does not imply universal access.
- Infrastructure requires maintenance; maintenance-sensitive systems may degrade or fall dormant by domain rule — never by user absence as punishment.
- Technologies may be lost (active possession), while their record persists (legacy) and may later be rediscovered (Section 10).
- Technology cannot bypass ecological or material constraints (Ecology and Economy own those resolutions), and it emits consequences as typed pressure signals, never as direct writes into other families.

`TECHNOLOGY_SYSTEM.md` owns the per-era capability envelopes' realization, the infrastructure-efficiency curves, the invention lifecycle, and adoption/diffusion/loss/rediscovery mechanics, under these constraints.

---

## SECTION 17 — CULTURE CONTRACT

Culture is not one monotone resource stock. The earlier draft defined it as a permanently increasing quantity produced directly by study subjects and used to lower technology thresholds; that is withdrawn as premature. Tier 6 acknowledges that the civilization carries social and cultural state and defines only how such state *enters shared transitions*; `CULTURE_SYSTEM.md` owns its internal mechanics.

Cultural state is a family of domain-owned signals — such as practices, values, legitimacy, prestige, trust, institutions, traditions, taboos, identities, transmission fidelity, local variation, resistance, openness, preservation strength, reinterpretation, and cultural tension. These signals may **strengthen, weaken, transform, fragment, hybridize, disappear, revive, or change meaning**; culture is not assumed monotone. What is preserved regardless of how active cultural forms change is the **recorded cultural history** (legacy, Section 10): the civilization always remembers a tradition it once held, even after it stops practicing it.

A derived aggregate summary (for example a single "cultural breadth" reading) may exist **only** if `CULTURE_SYSTEM.md` explicitly defines and retains it as a derived projection; no domain may depend on such a scalar as though it were primitive, and none may treat any subject as a direct producer of a fixed "culture amount." Other domains consume culture as an abstract reception context (legitimacy, compatibility, resistance, preservation), not as a number to accumulate.

---

## SECTION 18 — ECOLOGY CONTRACT

Ecology is a fully authored Tier 7 peer (`ECOLOGY_SYSTEM.md`) and is not modified by this task. Tier 6 provides it a stable contract: ecology consumes the nutrient tendencies of Section 7, grows its own family under conservation (Section 9, transformation ≤ 1, recycling < 1), obeys the legacy/active distinction (Section 10), and emits ecological facts to Memory and reception context to Citizen, Culture, and Technology across committed evaluations (Section 13).

Because `ECOLOGY_SYSTEM.md` was written against the earlier Tier 6 draft, several of its clauses inherit assumptions this revision has changed. Those clauses are catalogued for a later surgical compatibility pass in Section 28; Tier 6 does not weaken itself into vagueness to accommodate them, and it does not edit Ecology here. The contract is explicit so that the audit can be surgical.

---

## SECTION 19 — CITIZEN CONTRACT

Citizen is a fully authored Tier 7 peer (`CITIZEN_SYSTEM.md`) and is not modified by this task. Tier 6 provides it a stable contract and, in the corrections of Sections 8 and 10, the latitude it previously lacked:

- Citizens are genuine actors within the agency boundary of Section 8.
- Citizen life-cycle dynamics — birth, aging, retirement, succession, death, migration, replacement, apprenticeship, inheritance, institutional turnover — are **owned by `CITIZEN_SYSTEM.md`**, not by Tier 6. Tier 6 neither mandates immortality nor prescribes death.
- The only Tier 6 demographic law is non-punishment: **user absence never reduces population** and never causes starvation, punitive death, or demographic collapse (`ARCHITECTURE.md` Section 5; Laws 5–6). Any death a domain defines must be narrative or biological in origin, and recorded history always outlives the citizen (Section 21).

`CITIZEN_SYSTEM.md` currently encodes citizen immortality and a strictly monotone population, inherited from the earlier Tier 6 draft. That is now *permitted but not required*; whether Citizen adopts a life cycle under the new latitude is its own decision, catalogued for compatibility review in Section 28.

---

## SECTION 20 — ECONOMY CONTRACT

Economy is a fully authored Tier 7 peer (`ECONOMY_SYSTEM.md`). Tier 6 defines its shared boundary and a strong canon caution; Economy owns the internal model.

Economy owns production, allocation, exchange, scarcity, ownership, distribution, and labor/material constraints. **Canon caution:** Noctis has no coin, no market the user shops in, and no user-facing spending; resources are metabolic states, not currencies (`GAME_DESIGN.md` Section 6), and the terms coin, gold, xp, and score are forbidden tokens (`ARCHITECTURE.md` Trope Guard; `DOCUMENT_ARCHITECTURE.md` terminology lock). Any economic mechanic must therefore express allocation, scarcity, and production as *civilizational conditions and pressures*, never as a price the user pays or a currency they accumulate. What technology and ecology emit toward Economy are production-capability and demand-pressure signals; what Economy resolves is distribution and sufficiency, under conservation (Section 9) and non-management (Law 10).

---

## SECTION 21 — MEMORY CONTRACT

Memory is a fully authored Tier 7 peer (`MEMORY_SYSTEM.md`). Tier 6 binds the permanence physics; Memory owns the internal model and exposes the secured historical-accumulation reading consumed by Era Progression.

Memory holds the legacy family (Section 10): historical records, remembered events, monuments, public narratives, and — as Memory defines them — distortion, forgetting, access, and interpretation. The distinction Tier 6 requires is between **historical record** (that something existed or happened, once validly recorded — permanent) and **active capability** (that the civilization can currently use it — subject to loss and revival). Memory may preserve a technique no one reproduces, a ritual no one practices, or an institution that has collapsed; it may let recorded meaning expand through interpretation without minting physical stock (Section 9). What Memory records, absence never erases and no later transition deletes (`GAME_DESIGN.md` Section 9, Rules of Memory; Laws 4–5). Memory decides how records persist, distort, or fade *as records*; it never resurrects an active capability by fiat — revival is a domain event that reads Memory as a precondition.

---

## SECTION 22 — LEARNING INTEGRATION CONTRACT

Learning Integration is a fully authored Tier 7 peer (`LEARNING_INTEGRATION.md`). It owns the interpretation of raw study activity, subject classification, retention and mastery signals, interdisciplinary connection, telemetry boundaries, and the delivery of the interpreted learning signals this document consumes (Section 3).

The boundary is firm in both directions. Tier 6 (and every domain below it) receives **already-interpreted** signals — the interpreted learning profile — never raw telemetry, never a subject taxonomy to switch on. Learning Integration receives, from the world, nothing it can spend: **learning is the source of possibility, not a currency** (`VISION.md`, Light Economy; `GAME_DESIGN.md` Section 11, Principle 2). No mechanic converts study minutes into a spendable stock, and no domain infers a fixed outcome from a single subject (Section 7).

---

## SECTION 23 — PRESENTATION HANDOFF

**Simulation produces committed state and transition records. Rendering decides appearance.** The engine emits values, never visuals: no colors, no animations, no durations, no copy, no notifications. Every visual manifestation in the canon event table, every era metamorphosis staging, every ambient motion during quiet minutes, and every user-facing notice is a *presentation obligation* interpreted from committed state and the four flags and domain transitions — never a property of them (`ARCHITECTURE.md` Section 6; `ART_DIRECTION.md`). Presentation is strictly downstream (Section 13); it reads everything and writes nothing back into `F`.

---

## SECTION 24 — INTEGRITY LAWS

These laws bind every current system and every future extension. A proposed mechanic that violates any one is invalid regardless of its other merits, and must be redesigned from the constraint upward.

**Law 1 — Causal Integrity.** Every major outcome has sufficient causes and prerequisites. Nothing significant happens without a traceable reason in committed state and input.

**Law 2 — Reproducible Evaluation.** Given the same committed state, interpreted input, elapsed-time context, and stable simulation seed/history, the engine produces the same result — state, transitions, and order. Corollary (composability): evaluating elapsed time over `Δt` equals evaluating it over any partition of `Δt`.

**Law 3 — Domain Ownership.** Every state mutation has exactly one owning domain; no domain silently writes another's family.

**Law 4 — Presentation Separation.** Rendering cannot alter simulation truth; no presentation state enters `F`; no observation carries visual instruction.

**Law 5 — Legacy Protection.** Normal user absence cannot erase earned learning achievements or civilization history. The legacy projection of `D(S, Δt)` equals the legacy projection of `S`, for every `Δt`.

**Law 6 — Non-Coercion.** The simulation cannot punish the user for ordinary breaks: no starvation, no punitive death, no demographic collapse, no accumulating debt, no coercive countdown, no imposed return task list, caused by absence.

**Law 7 — No Infinite Generation.** No passive loop may create unlimited primary learning-derived energy, knowledge, or material value from nothing. Every primary stock traces to real user learning; internal transformation and recombination never mint primary value.

**Law 8 — Living Change.** Preserving legacy does not require freezing active ecology, culture, technology, institutions, or citizens. Active possession may change, decay, transform, fall dormant, be lost, and revive, while legacy endures.

**Law 9 — Capability Distinction.** Knowledge, possession, reproduction, maintenance, access, and use are separate states. A civilization may hold any subset of them for a given capability.

**Law 10 — No Micromanagement Dependency.** No core progression may require the user to manage the civilization instead of studying. The best way to advance the world is always to live a genuine learning life (`GAME_DESIGN.md` Section 11, Principle 2).

**Law 11 — Explainable Variation.** Variation occurs only among causally qualified candidates and is always seeded/reproducible or committed into history; it never substitutes for a prerequisite and never varies a fact the state determines (Section 11).

**Law 12 — Deferred Specialization.** Tier 6 defines shared physics; Tier 7 owns domain-specific mechanics. A Tier 6 rule that pre-authors a Tier 7 domain is a defect, corrected here rather than propagated.

---

## SECTION 25 — DORMANCY AND NON-PUNISHMENT

Dormancy is a welcoming state, not a failure. When the world is dormant: active illumination quiets, ambient civic expression reduces, optional processes pause, continuity is preserved, and return is gentle. Each Tier 7 domain defines what dormancy means for *its* active state; Tier 6 fixes only the hard rules, which no domain may weaken:

- No user achievement is ever deleted.
- No catastrophic collapse is caused solely by absence.
- No starvation occurs because the user did not study.
- No coercive countdown exists, and no accumulated penalty debt grows.
- No return task list is imposed on the user.

The three canonical numeric anchors — the three-consecutive-day consistency trigger, the five-day absence horizon, and the ten-minute reawakening session — are fixed by `NOCTIS_ECOLOGICAL_ENGINE.md` section 7 (Tier 3) and are therefore preserved as law, not as calibration. Every other day-scale or rate value referenced by dormancy is a calibration question bound at Tier 7 under the constraint that these three anchors are honored.

---

## SECTION 26 — FAILURE CONDITIONS

A transition, proposal, or state is invalid — and must be rejected and reshaped from the constraint up — if it: reads a clock, hardware randomness, or any presentation state inside the engine; produces a same-step circular dependency; mints primary learning-derived value from within the world (Law 7); reduces any legacy value, or reduces population through absence (Laws 5–6); leaves a non-finite, negative-stock, out-of-band-illumination, or non-canonical-era state (Section 1); writes a family it does not own (Law 3); introduces a new engine event flag beyond the canonical four (Section 12); requires user micromanagement (Law 10); or introduces a forbidden Trope-Guard token (`ARCHITECTURE.md` — thermal, heat, fire, flame, combust, smoke, steam, forge, daylight, sun, coin, gold, xp, score, build, construct, zone). Invalid states throw `AbyssalConstraintError` synchronously (`ARCHITECTURE.md`, Final Guardrails).

---

## SECTION 27 — EXTENSION PROTOCOL

Any future simulation concept enters by this protocol: pass the tiered validation of `DOCUMENT_ARCHITECTURE.md` (Tier 1 → 2 → 3), then the experience tests of `GAME_DESIGN.md`, then the structural laws of `ARCHITECTURE.md`, then the physics of this document (Sections 1–26). A concept that satisfies the canon but violates a law here is rejected and reshaped, never merged with adjustments. A concept that belongs to a domain is specified in that domain's Tier 7 blueprint under the contract this document gives it — never pre-authored here. Numeric values bind at Tier 7 with canon citations; they are never fabricated at Tier 6 beyond the three canonical anchors.

---

## SECTION 28 — DOWNSTREAM RECONCILIATION RECORD

This revision changed shared laws that the already-written Tier 7 siblings were authored against. The compatibility pass is complete. The resolutions below are binding context for implementation and replace the earlier open audit list.

**`ECOLOGY_SYSTEM.md` — reconciled resolutions:**

- Citizens may observe, tend, maintain, and transform ecological conditions but never mint primary external input (Section 8).
- `X_myc` and `X_cry` are cumulative legacy projections; active habitat form may reroute, succeed, recede, or transform through internal causality (Sections 10, 18; Law 8).
- Ecology emits environmental conditions and reception context; Culture alone resolves meaning (Section 17).
- A vault-breached schema is an exposed record and possibility, never automatic active capability (Laws 1 and 9; Sections 16, 21).
- Subject mappings are symbolic pathway tendencies mediated by Learning Integration, never unlock equations (Sections 7, 22).
- The four engine flags remain closed while ecological transitions are typed committed-state changes (Section 12).

**`CITIZEN_SYSTEM.md` — reconciled resolutions:**

- Citizen chooses a monotone aggregate population model for this implementation generation. Tier 6 still permits a future biological life cycle, but absence-driven loss remains forbidden (Sections 10, 19).
- Roles mint no primary value; citizens remain genuine actors who observe, teach, maintain, invent, preserve, and sometimes lose active practice (Section 8).
- Ambient individuality is a deterministic rendering expression of aggregate state. Identity is committed only when a durable consequence or Memory record requires reproducibility (Section 11).
- Skill transmission, teaching, maintenance, and succession are lawful Citizen actions resolved across committed evaluations.

**Cross-domain era reconciliation:** Economy is the sixth peer contribution; Learning Integration is upstream and never a seventh term. Ecology, Citizen, Culture, Memory, Technology, and Economy each expose a secured-maturity projection. Memory both contributes historical accumulation before the gate and records an era transition after the gate. `ERA_PROGRESSION.md` owns their combination and nothing else.

`GAME_DESIGN.md` (Tier 4) is **not** in scope and was not found to contain a concrete contradiction requiring change; its per-era descriptions are reclassified in place by Section 15 as envelope-plus-representative-examples rather than rewritten.

---

## FINAL QUALITY TEST

- [x] **Does Tier 6 still protect Noctis from becoming a conventional strategy game?** Yes — no objectives, no win/fail states, no micromanagement (Law 10); the user's only input is real study.
- [x] **Is learning still the foundational external input?** Yes — the single source; Laws 7 and the agency boundary forbid the world minting primary value.
- [x] **Can citizens now act meaningfully without becoming resource generators?** Yes — Section 8 narrows conservation to "no primary external input" while permitting transformation, invention, maintenance, and transmission.
- [x] **Can Citizen define life cycles without contradicting Tier 6?** Yes — deferred to `CITIZEN_SYSTEM.md`; only absence-driven loss is forbidden.
- [x] **Can Technology define invention, failure, adoption, maintenance, loss, and rediscovery?** Yes — Section 16; research readiness is one input, not the lifecycle.
- [x] **Can Culture define changing, contested practice rather than one monotone stock?** Yes — Section 17.
- [x] **Can Ecology change locally without deleting legacy?** Yes — Section 10; legacy preserved, active possession free to transform.
- [x] **Can Memory distinguish record from active capability?** Yes — Sections 10 and 21.
- [x] **Can Era Progression transition without being reduced to one Technology score?** Yes — Section 15; multi-domain readiness, `ERA_PROGRESSION.md` owns the formula.
- [x] **Can Learning Integration define nuanced interpretation?** Yes — Sections 3 and 22; Tier 6 fixes only the signal shape.
- [x] **Is variation causal, bounded, explainable, and reproducible?** Yes — Section 11, seeded deterministic variation.
- [x] **Is rendering completely downstream, absence non-punitive, achievements preserved?** Yes — Sections 5, 10, 23; Laws 4–6.
- [x] **Is the world allowed to remain alive and historically dynamic?** Yes — Law 8.
- [x] **Are domain boundaries explicit and cross-references verified?** Yes — Section 14; citations checked against the repository.
- [x] **Are the four world events preserved without blocking domain transitions?** Yes — Section 12.
- [x] **Does the document avoid pre-authoring Tier 7?** Yes — Law 12; each domain gets a contract, not a design.
- [x] **Is the result stable enough to guide Technology authorship?** Yes — Section 16 gives Technology a complete, contradiction-free contract.

---

## Closing Validation Statement

Every future simulation concept for the Noctis Civilization Module must pass, in order: the Tier 1 test of `VISION.md`, the Tier 2 test of `ART_DIRECTION.md`, the Tier 3 test of `NOCTIS_ECOLOGICAL_ENGINE.md`, the experience tests of `GAME_DESIGN.md`, the structural laws of `ARCHITECTURE.md`, and the physics of this document — causal integrity, reproducible evaluation, domain ownership, presentation separation, legacy protection, non-coercion, no infinite generation, living change, capability distinction, no micromanagement, explainable variation, and deferred specialization. Anything that fails is not adjusted at the edges; it is rejected and redesigned from the constraint up.

The world is a function. Learning is its only source. Citizens are actors, not currency. Absence is a fixed point. Legacy is monotone; life is not. Every domain owns its own truth — and the night runs on the user's mind, which is the one law all the others exist to keep honest.
