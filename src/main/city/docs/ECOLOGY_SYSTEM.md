---
doc_id: noctis.ecology_system
tier: 7
authority: domain_specification
role: ecological_domain_blueprint
status: reconciled
depends_on:
  - VISION.md
  - ART_DIRECTION.md
  - NOCTIS_ECOLOGICAL_ENGINE.md
  - DOCUMENT_ARCHITECTURE.md
  - GAME_DESIGN.md
  - ARCHITECTURE.md
  - SIMULATION_SYSTEMS.md
---

# Noctis Civilization Module — Ecology System

## Document Status And Authority

This document is the ecological domain blueprint of the Noctis civilization simulation: the Tier 7 specification of the living environmental layer. It defines how the environment develops, how its biological networks interact, how its ecosystems mature, how fauna serve the civilization, how ecological transitions emerge, and how the environment itself becomes a preserved record of the user's learning life.

It sits beneath the full canon, the technical architecture, and the simulation physics, and may never contradict any of them:

```
VISION.md                      Tier 1 — Absolute Conceptual Anchor
ART_DIRECTION.md               Tier 2 — Aesthetic & Spatial Interface
NOCTIS_ECOLOGICAL_ENGINE.md    Tier 3 — Mechanical & Biological Execution
DOCUMENT_ARCHITECTURE.md       Meta  — Structural Guardrail Framework
GAME_DESIGN.md                 Tier 4 — Experience Design
ARCHITECTURE.md                Tier 5 — Technical Architecture
SIMULATION_SYSTEMS.md          Tier 6 — Simulation Physics
ECOLOGY_SYSTEM.md              Tier 7 — Ecological Domain Blueprint (this file)
```

This document specializes the physics of `SIMULATION_SYSTEMS.md` into ecological law. Where that document defines the world as a deterministic state machine, this one defines what the *living* part of that machine is: the substrate, the networks, the light-bearing organisms, and the fauna loops through which metabolized learning becomes a habitat.

### The Identity Guardrail

Noctis is not a farming simulator, a mushroom growing simulator, a survival game, a city builder, a resource management game, or an aquarium. The ecology defined here exists for exactly one purpose: to be the living environment of a civilization that reflects human learning. The environment is not something the user controls. It is a biological reflection of a mind at work. The core transformation this document serves, end to end:

```
REAL-WORLD LEARNING
        |
        v
COGNITIVE METABOLIC INPUT      (nutrient synthesis — SIMULATION_SYSTEMS.md Section 5)
        |
        v
ECOLOGICAL TRANSFORMATION      (growth, networks, fauna — this document)
        |
        v
CIVILIZATION ADAPTATION        (population, culture, technology — sibling Tier 7 domains)
        |
        v
LIVING ENVIRONMENTAL MEMORY    (the terrain as historical record — MEMORY_SYSTEM.md)
```

The user creates change through learning. The civilization adapts automatically. Nothing in this document may ever ask the user to collect, place, assign, manage, or spend.

### What This Document Binds — And What It Refuses To Bind

**Binds:** the ecological philosophy and its validation rules; the four-layer environmental hierarchy; the nutrient pathway laws as they act on ecology; the organic growth model; the succession model and its stage conditions; the ecological relationship graph; the deep design of the mycelial and crystal networks; the fauna roles and their cycle structures; the domain interpretation of the canonical events and the internal ecological transitions beneath them; the ecological reading of the time model; the abstract ecological state categories; the coefficient families of the ecological domain, each named symbolically with its binding constraint and canon citation.

**Refuses to bind:** every numeric coefficient, rate, efficiency, and threshold *value* (named here as constrained symbols; bound in the implementation phase under the calibration constraints of `SIMULATION_SYSTEMS.md` and this file); the exact field identifiers of the state schema; any code structure, module layout, or type definition; any visual, animation, asset, sprite, or UI behavior — every appearance question belongs to `ART_DIRECTION.md` and the Tier 8 production pipeline documents. This document defines ecological facts. Rendering decides what they look like.

No numeric anchors appear in this document beyond the three the canon itself locks: the three-consecutive-day consistency trigger, the five-day absence horizon, and the ten-minute reawakening session (`NOCTIS_ECOLOGICAL_ENGINE.md` section 7).

### Notation

Notation follows `SIMULATION_SYSTEMS.md`: `L` is illumination, `Φ` is circulation, `σ` is atmospheric stability, `X_myc` is mycelial expansion, `X_cry` is crystal lattice mass, `K_total` is accumulated knowledge, `k` is the consecutive-day consistency count, `P` is population, `A_P` is population activity, `R` is research maturity. Bounded expression variables live in `[0, 1]`. Named symbolic constants such as `ε_detritus` or `θ_stage` carry their constraints here and their values at implementation time.

---

## SECTION 1 — ECOLOGICAL PHILOSOPHY

### Symbolic, But Biologically Lawful

The Noctis ecology is symbolic in meaning and biological in behavior. Every organism, network, and cycle in this document is an interpretive rendering of something true about learning — yet each one behaves like a real ecological system: it metabolizes, it saturates, it recycles, it rests. The symbolism is the reason the ecology exists; the biological logic is the reason it can be trusted. A user who watches patiently must be able to derive true laws from the living world (`GAME_DESIGN.md` Section 8, Trustworthy Mystery), which means the ecology can never behave decoratively. It represents:

- **Knowledge becoming structure** — comprehension precipitating as lattice and root.
- **Learning becoming environment** — the study week becoming the weather and terrain of a place.
- **Memory becoming biology** — what the user has understood persisting as living infrastructure.
- **Creativity becoming diversity** — expressive work widening the range of forms life can take.

### The Evolutionary Logic Of The Eternal Night

Noctis ecology follows evolutionary logic under three permanent conditions, all inherited from the canon (`VISION.md`, Eternal Night; `NOCTIS_ECOLOGICAL_ENGINE.md` sections 1–2):

**Darkness creates adaptation.** There is no daylight and no photosynthesis; no free calorie exists anywhere in the world. Every living system is dark-adapted — chemosynthetic, bioluminescent, tactile, acoustic — and every joule of its life arrives from exactly one source: the user's metabolized focus. The ecology is therefore honest by construction. It cannot grow on its own, and it cannot pretend.

**Isolation creates specialization.** The ecology evolved alone in the dark, so every niche a surface world fills with common forms, Noctis fills with specialists: eyeless pollinators that navigate by pheromone gradient, survey fliers that see with sound, recyclers that turn spore-fall into fertility. Specialization is why the world reads as *other* — and why it stays coherent as it grows.

**Knowledge creates complexity.** The variety and interdependence of the ecosystem scale with the depth and breadth of what the user has learned. The relationship is directional and lawful:

```
Mathematical learning        -> crystalline organization
                                (geometric order, stability, stored charge)

Language / history learning  -> information networks
                                (mycelial reach, archives, cultural rooting)

Creative work                -> biological diversity
                                (photophore variety, expressive range, atmosphere)

Science / engineering work   -> circulation and instrumentation
                                (distribution reach, routing, research pressure)
```

The first three mappings are the brief forms; the fourth is canon and must never be dropped: `NOCTIS_ECOLOGICAL_ENGINE.md` section 5 and `GAME_DESIGN.md` Section 2 assign science and engineering to the luciferin pathway's infrastructure register. Science routes the catalysts; art teaches them new colors. These four are **symbolic tendencies, not one-to-one unlock equations**: subject classification contributes to an interpreted learning profile that shapes the ecology together with the whole state, and no single academic subject is guaranteed to produce one exact ecological outcome (`SIMULATION_SYSTEMS.md` Section 7).

### What The Ecology Is For

The purpose of this entire domain is a feeling, stated in `GAME_DESIGN.md` and owed to the user: *the sense of watching an ancient living civilization slowly awaken because of their own effort.* Every law in this document must serve that feeling — growth that is earned and witnessed rather than announced, systems that sleep with dignity rather than punish, and an environment that remembers.

---

## SECTION 2 — ECOLOGICAL HIERARCHY

The environment is organized as four primary layers, ordered from foundation to motion. The layers are simulation strata, not display layers: how each one *appears* — parallax, silhouette, glow — is the property of `ART_DIRECTION.md` (Layering Model) and the Tier 8 pipelines. Each layer names its primary cognitive influence; "primary" is a weighting statement, not an exclusivity statement, because interdisciplinary study feeds blended nutrient vectors (`SIMULATION_SYSTEMS.md` Section 5).

### Layer 1 — Substrate Layer

The foundation of the world: mineral structures, geological formations, crystal foundations, and the nutrient channels that thread through them.

- **Primary influence:** mathematics and logic learning, through the piezo-electric brine pathway.
- **Meaning:** structure, reasoning, analytical understanding — the load-bearing part of a mind, made terrain.
- **Effects:** crystal development (`X_cry` growth), environmental stability (decay damping and energy capacity, `SIMULATION_SYSTEMS.md` Sections 4 and 6), and the physical foundation on which era technology later stands.

The substrate is the slowest layer and the most permanent. It is where the world stores what the user has *proven*.

### Layer 2 — Mycelial Network Layer

The information and memory layer: fungal root mats, archive organisms, biological communication pathways, and subterranean nutrient transport.

- **Primary influence:** history, languages, and the humanities, through the chemosynthetic glucan pathway.
- **Meaning:** memory, culture, accumulated knowledge — the past kept alive and connected.
- **Effects:** archive expansion (vault breaches appending to Memory State), civilization continuity (every structure anchors into root or lattice, `NOCTIS_ECOLOGICAL_ENGINE.md` section 4 Rule 3), and information preservation across absence.

The mycelial layer is the civilization's connective tissue. Section 7 gives it deep design.

### Layer 3 — Bioluminescent Layer

The sensory and communication layer: photophore organisms, glowing flora, atmospheric light phenomena, and the biological signaling systems of the world.

- **Primary influence:** creative disciplines, through the luciferin catalysts' pigment register. The same nutrient's infrastructure register — fed by science and engineering — acts on this layer's *reach* through circulation `Φ`: creative study widens what light can express, scientific study widens where light can go.
- **Meaning:** expression, imagination, communication — the parts of a mind that are visible to others.
- **Effects:** visual diversity of living light, cultural expression range (photophore dialect complexity feeding `CULTURE_SYSTEM.md`), and the ambient character of the environment.

This layer carries the world's legibility: illumination `L` is the single clearest reading of how recently the user's mind has fed the world (`SIMULATION_SYSTEMS.md` Section 2).

### Layer 4 — Fauna Layer

The mobile ecological layer: spore-moth networks, echolocation survey fliers, detritivore colonies, and the symbiotic species of future expansion.

- **Primary influence:** behavioral rather than subject-bound — fauna respond to consistency, session arrival, and ecosystem activity rather than to any one discipline.
- **Meaning:** the world in motion; process made visible as life.
- **Effects:** pollination and acceleration, survey and discovery, recycling and fertility.

Fauna perform ecological functions. They are never collectible, never countable as a score, never assignable to tasks. Section 9 defines them.

---

## SECTION 3 — COGNITIVE NUTRIENT PATHWAYS

The nutrients are not resources in the acquisitive sense and this document never treats them as anything to gather. They are biological transformations: the chemical form the user's cognition takes once metabolized (`SIMULATION_SYSTEMS.md` Section 5). They are not collected — no organism, structure, or mechanic harvests them from the world. They *emerge* from cognitive activity, flow along fixed pathways, and are consumed by growth. Reservoir stocks, synthesis weighting, and saturation behavior are physics bound at Tier 6; this section binds what each nutrient means to the ecology.

### Piezo-Electric Brine

Hyper-dense ionized mineral fluid, pooling along the crystalline ridges of the Substrate Layer.

- **Represents:** mathematical understanding, analytical reasoning, structural knowledge.
- **Ecological effects:** crystal growth (`X_cry`), environmental stability (the decay-damping and energy-capacity functions of lattice mass), and the resonance systems of Section 8.
- **Canon:** `NOCTIS_ECOLOGICAL_ENGINE.md` section 5, Mathematics And Logic Pathway.

### Chemosynthetic Glucans

Deep carbon-rich sugars, sinking beneath the city floors into the Mycelial Network Layer.

- **Represents:** language, memory, history, cultural knowledge.
- **Ecological effects:** mycelial expansion (`X_myc`), archive development (vault breaches and their Memory State yield), and the growth of information networks that carry culture.
- **Canon:** `NOCTIS_ECOLOGICAL_ENGINE.md` section 5, History, Law, And Language Pathway.

### Luciferin Catalysts

Concentrated light-chemistry precursors, flowing through the civic circulatory system and the photophore biology of the Bioluminescent Layer. One chemistry, two canonical registers:

- **Pigment register** (creative arts): biological adaptation — photophore mutation, communication evolution (semaphore dialect complexity), environmental diversity.
- **Infrastructure register** (science and engineering): circulation routing, instrument efficiency, and research pressure toward the blooms of `SIMULATION_SYSTEMS.md` Section 10.
- **Canon:** `NOCTIS_ECOLOGICAL_ENGINE.md` section 5, Creative Arts pathway; `GAME_DESIGN.md` Section 2, Science & Engineering; `SIMULATION_SYSTEMS.md` Section 5 pathway table.

### The Non-Collection Law

For all three nutrients, the same rule binds every future feature: synthesis is automatic (from learning input), transport is automatic (through circulation and the networks), consumption is automatic (by growth, blooms, and metabolism). At no point does a nutrient become an inventory item, a clickable pickup, a tradable stock, or a displayed currency. Where the user perceives nutrient levels at all, they perceive them ambiently — shimmer, glow density, current speed — with thin instrument glass available for the curious (`GAME_DESIGN.md` Section 6). The instruments read the world; they never operate it.

---

## SECTION 4 — ECOLOGICAL GROWTH SYSTEMS

### Growth Is Emergent, Never Placed

The user never places an object, approves a site, or queues a structure. Every ecological form in Noctis grows where the laws of this document permit it and the state of the world invites it (`GAME_DESIGN.md` Section 1: the user is weather, not architect). Growth is a deterministic consequence of three factors, evaluated together: nutrient availability (what has been studied), network support (what the mycelium and lattice can anchor, `NOCTIS_ECOLOGICAL_ENGINE.md` section 4 Rule 3), and circulation reach (how far distribution extends at current consistency, `SIMULATION_SYSTEMS.md` Section 2).

The canonical growth examples, stated as input–output law:

**Mathematics study.**

```
Input:   consistent mathematical learning
Output:  crystal structures gain complexity and geometric order
         resonance formations emerge along mature lattice (Section 8)
         geological systems stabilize (decay damping deepens)
```

**Language and history learning.**

```
Input:   language practice, historical study
Output:  mycelial networks expand outward and downward
         memory organisms awaken along the enriched root mats
         archive pathways develop toward buried strata (vault discovery)
```

**Creative work.**

```
Input:   creative activity
Output:  new biological patterns appear in flora and photophore arrays
         photophore diversity increases (dialect range widens)
         atmospheric phenomena evolve (aurora activity, spore drift character)
```

**Science and engineering work.**

```
Input:   scientific and engineering study
Output:  circulation reach extends; distribution grows more efficient
         instrument organisms come online along the flow paths
         research pressure accumulates toward innovation blooms
```

### The Coefficient Families Of Growth

The ecological domain owns the following symbolic coefficient families. Each is named here with its binding constraint; values bind at implementation under these constraints, each value carrying its canon citation (`ARCHITECTURE.md`, authority chain):

| Symbol family | Governs | Binding constraint | Canon source |
|---|---|---|---|
| `γ_cry` | Lattice growth per unit brine uptake | Monotone in uptake; growth never negative | `SIMULATION_SYSTEMS.md` Section 7 |
| `γ_myc` | Root expansion per unit glucan uptake | Monotone in uptake; multiplied by fertility and moth acceleration read from the previous state | `SIMULATION_SYSTEMS.md` Sections 7, 11 |
| `γ_pho` | Photophore diversification per unit pigment-register catalysts | Monotone; expression-bounded (diversity is finite per era) | `NOCTIS_ECOLOGICAL_ENGINE.md` section 5 |
| `γ_flow` | Circulation reach per unit infrastructure-register catalysts | Monotone, saturating toward the era's routing ceiling | `GAME_DESIGN.md` Section 2 |
| `θ_vault(i)` | Mycelial depth thresholds for successive vault breaches | Strictly increasing sequence in expansion depth; fixed function of `X_myc` | `SIMULATION_SYSTEMS.md` Section 7 |
| `ε_detritus` | Detritivore conversion efficiency, spore-fall to fertility | Strictly less than one, always | `SIMULATION_SYSTEMS.md` Section 7 |
| `ρ_survey` | Survey frontier advance per session | Monotone per session; coverage bounded by the unexplored frontier | `SIMULATION_SYSTEMS.md` Section 7 |
| `θ_stage(n)` | Succession stage conditions (Section 5) | Monotone stage function; stages never regress | This document, Section 5 |

No growth coefficient may ever be user-visible as a number to optimize, and no growth may ever require a user decision. Growth that would demand management is invalid at birth (`SIMULATION_SYSTEMS.md` Section 12 discipline; `GAME_DESIGN.md` Section 11, Principle 2).

---

## SECTION 5 — ECOLOGICAL SUCCESSION MODEL

### Succession Is Interdependence, Not Technology

The ecology matures along its own axis: **succession**, the degree of interdependence among living systems. Succession is deliberately distinct from the five-era civilization machine of `SIMULATION_SYSTEMS.md` Section 15. Eras measure the civilization's relationship to knowledge; succession measures the ecosystem's relationship to itself. The two advance together in a healthy world but are never the same variable, and neither defines the other. Both are monotone: succession stages never regress, exactly as eras never regress. The Abyssal Douse dims *activity*; it never unwinds *structure* (Laws 4 and 5, `SIMULATION_SYSTEMS.md` Sections 10, 24, and 25).

Stage advancement is a deterministic threshold function `θ_stage(n)` over accumulated ecological structure — network masses, fauna cycle establishment, relationship density — never over wall-clock age. A world studied deeply for a season is further along than a world left idle for a year.

### Stage 1 — Dormant Substrate

The newborn condition of the world, not a punishment state: mineral terrain, unactivated root traces, still air. The environment exists but does not yet cycle. Everything that follows is already latent here — this is the world before the first light arrives, the state the first study session awakens.

### Stage 2 — Initial Colonization

First biological systems appear where the earliest nutrients land: thin fungal networks along the first root-paths, initial mineral growth at the brine pools, basic organisms at the hearth margins. Systems exist but do not yet depend on one another.

### Stage 3 — Network Formation

Systems begin interacting. Mycelial threads join into communicating mats; crystal formations begin resonant coupling (Section 8); the first fauna relationships establish — moths finding the pheromone gradients, detritivores finding the spore-fall. The world stops being a collection and starts being a web.

### Stage 4 — Complex Ecosystem

Multiple biological systems depend on each other and would be diminished by any one's absence: migration patterns settle into seasonal rhythm with the user's consistency, full ecological cycles close (canopy to spore-fall to fertility to canopy), and the environment begins preserving memory in its own tissue — growth strata, vault chambers, resonance patterns.

### Stage 5 — Symbiotic Civilization Environment

The ecosystem and the civilization become inseparable: infrastructure is indistinguishable from biology, archives are living tissue, and the terrain itself is a readable historical record of the user's learning life (`GAME_DESIGN.md` Section 10 — the user can date events by architecture). This is succession's asymptote and the module's quiet thesis: the environment has become memory.

---

## SECTION 6 — ECOLOGICAL RELATIONSHIPS AND DEPENDENCY NETWORKS

### No Organism Stands Alone

Ecological complexity in Noctis comes from relationships, not from quantity of species. Every organism and network in this document participates in at least one dependency, and any future species must enter through a relationship or be rejected (Section 14, Rule 5). The canonical relationship set:

```
Spore-moths ──── pollinate ────> mycelial systems
                                 (cross-pollination accelerates pending
                                  transformations while the season is active)

Detritivores ─── recycle ──────> substrate fertility
                                 (spore-fall converted at ε_detritus < 1;
                                  fertility multiplies fungal growth)

Crystal networks ─ stabilize ──> the whole environment
                                 (decay damping, stored charge, and the
                                  resonance base of later-era instruments)

Chiroptera ────── survey ──────> the frontier
                                 (mapped-boundary state advances; discovery
                                  events feed Memory State)

Canopy activity ─ sheds ───────> spore-fall
                                 (the detritivore cycle's sole input —
                                  recycling can amplify life, never replace it)
```

### The Feedback Law

Relationships form loops across time, and the loops are lawful because of one rule inherited from `SIMULATION_SYSTEMS.md` Section 13: within a single evaluation, influence flows strictly downward through the dependency strata; where a relationship feeds back — fertility multiplying growth, moth acceleration speeding pending transformations, lattice mass damping decay — the downstream value is read from the *previous* state and applied as a constant. Feedback across evaluations is ecology; feedback within an evaluation would be circular definition, and is forbidden. Every relationship in this document is therefore a directed edge in an acyclic per-evaluation graph, and every apparent cycle is a recurrence across time steps.

Two structural prohibitions repeat here because they are ecological as much as architectural: no ecological process and no citizen mints *primary* value — no learning-derived input, accumulated knowledge, or metabolic energy from nothing — though citizens may observe, tend, maintain, and interact with the ecology within the agency boundary of `SIMULATION_SYSTEMS.md` Section 8; and no relationship may ever mint value from nothing (Conservation, `SIMULATION_SYSTEMS.md` Section 9 — every gain traces to metabolized learning, transformation at efficiency at most one, or recycling at efficiency strictly less than one).

---

## SECTION 7 — MYCELIAL CIVILIZATION NETWORK

### The Living Half Of The Foundation Law

Every structure that ever grows in Noctis anchors into root or lattice (`NOCTIS_ECOLOGICAL_ENGINE.md` section 4, Rule 3). The mycelial network is the living half of that law: the subterranean mat of fungal filament into which the civilization is woven. It is powered by the chemosynthetic glucan pathway — history and language study, metabolized into the sugars that drive cellular division in the root mats (`SIMULATION_SYSTEMS.md` Section 7).

The network functions as three systems at once:

**Nervous system.** The mycelium is the world's substrate-level communication fabric: nutrient state, growth signals, and ecological condition propagate along the root mats between districts. In later eras this biological connectivity is what the civilization's own technology grows into — the living mycelial computing of the `OPTOGENETIC_CIRCUIT` era is cultivated *on* this network, never grown apart from it (`SIMULATION_SYSTEMS.md` Section 15).

**Archive system.** Expansion is directional in meaning: outward expansion enables new anchored growth; downward expansion probes the buried strata. Each crossing of a depth threshold `θ_vault(i)` breaches an ancestral shale vault and appends a permanent discovery to Memory State — historical data shards, rare decorative spores, recovered blueprint schemas. A recovered schema is *exposed possibility*, never automatic capability: `MEMORY_SYSTEM.md` owns whether the record persists, and `TECHNOLOGY_SYSTEM.md` owns whether the civilization can actually reproduce or use what the schema describes (`SIMULATION_SYSTEMS.md` Sections 16 and 21, the capability distinction). Yield richness and entry generation remain the territory of `MEMORY_SYSTEM.md`. The thresholds are a fixed, strictly increasing function of `X_myc`: discovery is earned and lawful, never random.

**Civilization memory system.** The network's cumulative record never shrinks. `X_myc` is cumulative living infrastructure — root laid down by a season of language review remains part of the permanent record forever, holding districts, paths, and archives in a continuous living history. What the user rooted, absence cannot uproot (`SIMULATION_SYSTEMS.md` Section 10, Law 5). Where the *active form* of a habitat later transforms through internal ecological causality — a channel rerouting, an old canopy yielding to its successor — that is living change over active state (Law 8), never a subtraction from the legacy the record holds and never a consequence of user absence.

### What The Mycelium Is Not

The mycelial network is not farming, not agriculture, and not a production building system. Nothing is planted, tended, fertilized by hand, or held to a yield. There are no plots, no crops, no output quotas. The network is infrastructure that happens to be alive — the civilization's memory made of biology — and any future feature that treats it as a farm fails validation at Section 14, Rule 7.

---

## SECTION 8 — CRYSTAL ECOLOGY

### Accumulated Understanding, Grown Not Mined

Crystals in Noctis grow, resonate, and adapt. They are never mined, quarried, or spent as material. Lattice mass `X_cry` is the accumulated geometric record of the mathematics pathway — structure studied becoming structure that endures (`SIMULATION_SYSTEMS.md` Section 7). The lattice performs the substrate's three ecological services: it stores charge (energy capacity `C_E`), it steadies the world (decay damping during absence), and it orders itself (geometry sharpening with the rigor of the study that grew it — an expression attribute read by rendering, never a simulation input).

### The Resonance Progression

Crystal ecology matures through four structural stages. These are growth states of the Substrate Layer, deterministic in accumulated lattice mass and era capability; they are not a second era machine, and their visual language belongs to `ART_DIRECTION.md` (Crystalline Ridges) and Tier 8:

```
Stage 1: Small mineral formations
         First precipitation at the brine pools; isolated, unconnected.

Stage 2: Crystal structures
         Load-bearing lattice; storage capacity becomes meaningful;
         structures may now anchor into lattice as well as root.

Stage 3: Resonance architecture
         Mature lattices couple; stored charge and signal move through
         the crystal network; the substrate becomes coordinated.

Stage 4: Bio-crystalline technology
         The lattice becomes a technological medium — memory lattices,
         resonant instruments, and in the furthest eras the entangled
         pairs of COSMIC_STELLAR (capability gating per TECHNOLOGY_SYSTEM.md).
```

Resonance is the crystal network's form of relationship (Section 6): coupled lattices behave as one system, which is why deep mathematical understanding stabilizes the *whole* environment rather than one ridge. Resonance never generates energy — it distributes and preserves what learning banked (Conservation, Law 2; the Stellar Guard of `SIMULATION_SYSTEMS.md` Section 15 applies to every radiant medium, starlight and resonance alike).

---

## SECTION 9 — FAUNA SYSTEMS

Fauna are ecological processes with population-like expression — never units, never collectibles, never assignable workers (`SIMULATION_SYSTEMS.md` Section 7). Each species is defined by its role; a species without an ecological function may not exist in Noctis. The canonical three:

### The Spore-Moth Network

Giant eyeless silk-moths tracking pheromone gradients across miles of absolute darkness (`NOCTIS_ECOLOGICAL_ENGINE.md` section 2).

- **Role:** pollination, information transfer, migration rhythm.
- **Cycle:** activation follows the consistency state — `k` at or above the canonical three-consecutive-day trigger opens the moth season; while active, cross-pollination applies a global acceleration to every pending transformation in the world; deactivation follows loss of the condition, with no penalty beyond return to base speed.
- **Meaning:** the user's discipline made visible as a season. The weeks the user studies daily are, literally, the weeks the moths fly.

### The Dual-Frequency Chiroptera

Echolocation survey fliers using a dual-frequency acoustic matrix (`NOCTIS_ECOLOGICAL_ENGINE.md` section 2).

- **Role:** environmental sensing, mapping, exploration — performed *by the civilization's own systems*, never by the user. There is no player exploration verb anywhere in Noctis; the frontier advances because the world surveys itself.
- **Cycle:** each new study session dispatches the flocks; survey coverage advances by `ρ_survey` toward the current frontier; crossing coverage thresholds yields boundary discoveries into Memory State. The more the user shows up, the more of the dark acquires shape.
- **Meaning:** curiosity as cartography — the mapped world as a record of attendance.

### The Chemosynthetic Detritivores

Colonies of blind segmented worms and giant troglobitic isopods (`NOCTIS_ECOLOGICAL_ENGINE.md` section 2).

- **Role:** recycling and ecosystem maintenance.
- **Cycle:** canopy activity sheds spore-fall in proportion to ecological activity; the colonies convert it into substrate fertility at efficiency `ε_detritus`, strictly less than one; fertility multiplies fungal growth and feeds population prosperity. The loop is bounded by its input: recycling amplifies living activity and can never substitute for it, so the cycle obeys Conservation and quiets gracefully as the world quiets.
- **Meaning:** a well-fed world does not merely grow — it cycles.

### Expansion Categories

Future fauna enter through role, not roster. The expandable categories are: **pollination-class** (transfer and acceleration), **survey-class** (sensing and frontier), **recycling-class** (conversion and maintenance), and **symbiotic-class** (paired organism-infrastructure functions of later eras). A proposed species must name its category, its dependency edges (Section 6), and its learning-derived energy source — and there is no numerical pressure to multiply species. A handful of deep roles outweighs a hundred shallow ones, permanently.

---

## SECTION 10 — ECOLOGICAL EVENTS

### Relationship To The Canonical Event Flags

The engine's observable event set is closed at four flags, fixed by `ARCHITECTURE.md` Section 6 and `SIMULATION_SYSTEMS.md` Section 10, emitted in canonical row order: `THE_PHEROMONE_PLUME`, `BAROMETRIC_SHOCK_WAVE`, `ABYSSAL_DOUSE`, `BENTHIC_BLOOM`. **This document adds no new engine flags.** What it adds is the ecological interior of those events, plus the named *internal ecological transitions* — deterministic threshold crossings inside the state that need no flag of their own, because every durable consequence they describe already lives in the state snapshot the renderer receives. Surfacing an internal transition visually is a rendering decision over the state (Handoff Law, `SIMULATION_SYSTEMS.md` Section 10), never a new signal contract.

### The Four Canonical Events, Ecologically

**The Pheromone Plume.** Trigger: high consistency of learning — the consecutive-day count reaching the canonical three-day trigger, observed as the moth season switching on. Ecological effect: the spore-moth networks activate; cross-pollination accelerates every pending transformation; circulation rises. Rhythm has become season.

**Barometric Shock Wave.** Trigger: learning difficulty or cognitive stress — a high difficulty/failure signal depressing atmospheric stability `σ` below its shock threshold. Ecological effect: the ecosystem enters protective adaptation — its fortification posture: reserve drawdown pauses, endurance memory accrues, stability relaxes deterministically back toward calm. No stock, structure, or memory is lost. A hard week leaves the world stronger-founded, never poorer.

**Abyssal Douse.** Trigger: extended absence — the decay evaluation carrying illumination below the dormancy threshold at the canonical five-day horizon. Ecological effect: safe ecological dormancy. Canopies still, circulation settles, fauna cycles rest at their floors. No punishment. No destruction. Hibernation is a fixed point of decay: the sleeping world does not deepen its sleep (`SIMULATION_SYSTEMS.md` Section 4).

**Benthic Bloom.** Trigger: a major learning milestone — research maturity crossing an emergence threshold. Ecological effect: large ecosystem awakening — reserves surge toward the civic core and become permanent research maturity; growth completes across the visible world; an era boundary may be crossed in the same evaluation.

### The Internal Ecological Transitions

Six named transitions, all deterministic threshold crossings, all already implied by the physics — named here so the domain, the renderer, and future documents share one vocabulary:

**Mycelial Awakening.** Trigger: humanities knowledge growth carrying glucan uptake into dormant root sectors. Effect: previously inactive network regions activate and join the communicating mat. (A growth consequence within `X_myc`; visible as the world's dark floors coming quietly alive.)

**Crystal Resonance.** Trigger: mathematical milestones — lattice mass and order crossing a resonance-coupling threshold (Section 8, Stage 3). Effect: crystal systems synchronize; stability and stored-charge distribution deepen across the substrate.

**Spore Migration.** Trigger: consistent learning patterns sustaining the moth season across consecutive activations. Effect: fauna networks expand — migration paths lengthen and new districts enter the pollination range.

**Detritivore Bloom.** Trigger: ecosystem maturity — canopy activity and spore-fall sustaining colony growth past an establishment threshold. Effect: recycling systems strengthen; fertility conversion runs at full established efficiency (still strictly below one, always).

**Underground Spring Discovery.** Trigger: ecological maturity — combined network depth and substrate development crossing a deep-strata threshold. Explicitly *not* player exploration; there is no exploration verb. Effect: new environmental strata emerge naturally into the known world — deep nutrient channels and cold mineral springs that extend the world's habitable depth, appended to Memory State as discoveries.

**Fungal Network Expansion.** Trigger: accumulated knowledge — `K_total` and glucan history carrying `X_myc` past its next reach threshold. Effect: new memory pathways develop; the archive's living footprint grows.

Each transition is edge-triggered on a monotone quantity, so each fires once per crossing, deterministically, and can never be farmed, repeated, or missed — the same discipline the canonical four obey.

---

## SECTION 11 — ECOLOGICAL TIME MODEL

The ecology inherits its entire relationship to time from `ARCHITECTURE.md` Section 5 and `SIMULATION_SYSTEMS.md` Sections 3–4, and restates it here as ecological law: **there is no constant simulation and no ticking.** No organism runs on a timer. The ecology is evaluated, never executed — event-driven updates when learning arrives, one closed-form decay evaluation over elapsed time at checkpoints, lazy always. Between evaluations the ecosystem simply *is*: ambient motion on screen during quiet minutes is the renderer breathing over a constant state, not biology running.

The ecological life cycle across time:

```
ACTIVE GROWTH      Learning inputs arrive; nutrients synthesize; networks
                   grow; fauna cycle; transitions fire on their crossings.
       |
       v
DORMANCY           Absence exhausts the energy cushion; renewable activity
                   decays exponentially; at the canonical horizon the world
                   crosses into hibernation — a fixed point, safe forever.
       |
       v
REAWAKENING        The first canonical ten-minute session wakes the world;
                   preserved structure relights; growth resumes exactly
                   where it paused.
```

The ecosystem sleeps when the user is away. It does not punish absence — decay touches only renewable activity (illumination, circulation, reservoirs, expression), never structure, never networks, never memory, never population count (Laws 4 and 5). Five days of absence and five hundred produce the same sleeping world, and the same gentle waking.

---

## SECTION 12 — ECOLOGICAL STATE MODEL

The ecological domain's state is a projection of the canonical civilization state of `SIMULATION_SYSTEMS.md` Section 2 — abstract categories, not a schema. Exact field identifiers, encodings, and decomposition bind at implementation under `ARCHITECTURE.md`; no type definitions belong in this tier.

```
EcologicalState
{
  substrateDevelopment        crystal foundations, geological stability,
                              resonance stage        (projects X_cry, stability)
  mycelialNetwork             reach, depth, activation of the root mats
                                                      (projects X_myc)
  crystalDevelopment          lattice mass, order, coupling state
                                                      (projects X_cry, C_E)
  bioluminescentDiversity     photophore range, flora variety, atmospheric
                              phenomena               (projects L and expression)
  faunaSystems                moth season, survey coverage, detritivore
                              establishment           (projects fauna state)
  ecosystemHealth             composite activity reading: circulation,
                              stability, illumination (projects Φ, σ, L)
  successionStage             the Section 5 stage (monotone legacy)
}
```

Two laws bind any future refinement of this projection. First, every category must remain derivable from canonical state — the projection adds vocabulary, never hidden variables. Second, the legacy/active split of `SIMULATION_SYSTEMS.md` Section 10 is preserved exactly: the *cumulative legacy record* of `substrateDevelopment`, `mycelialNetwork`, `crystalDevelopment`, and `successionStage` never decreases and is never touched by user absence (Law 5); their *active form* may still transform through internal ecological causality (living change, Law 8); and `ecosystemHealth` and the activity components of the others are renewable and may breathe with presence and absence. No decrease anywhere is ever caused by the user stepping away.

### Era-Readiness Projection

Ecology exposes `x_ecology ∈ [0, 1]`, a secured-maturity projection consumed only by `ERA_PROGRESSION.md`. It is derived from succession stage, crystal-network maturity, secured mycelial depth, habitat interdependence, and circulation reach. It is not identical to succession and cannot gate an era by itself. Active habitat form may transform through internal causality, while the secured maturity already achieved remains available to the era reading and does not fall through ordinary absence. Ecology owns the derivation; Era Progression owns its weight, floor, and combination (`SIMULATION_SYSTEMS.md` Section 15).

---

## SECTION 13 — INTERACTION WITH OTHER SYSTEMS

The ecology's external edges follow the dependency topology of `SIMULATION_SYSTEMS.md` Section 13 — ecology sits downstream of metabolic conversion and upstream of civilization expression, and all feedback crosses time steps, never evaluations.

**Ecology → Citizens (`CITIZEN_SYSTEM.md`).** The environment is the condition of civic life: canopy expansion and substrate fertility drive population prosperity; illumination and energy sustain activity expression `A_P`. Citizens adapt to the environment; they never operate it.

**Ecology → Culture (`CULTURE_SYSTEM.md`).** Biological communication is culture's raw material, but ecology only ever emits environmental *conditions*; it never fixes cultural meaning. Photophore diversity, district ecological character, and the moth seasons and vault processions are conditions offered upward; `CULTURE_SYSTEM.md` owns how they are interpreted into expressive dialect range, district custom, and ritual (`SIMULATION_SYSTEMS.md` Section 17).

**Ecology → Technology (`TECHNOLOGY_SYSTEM.md`).** Natural systems are the inspiration and substrate of every era's technique: lattice becomes memory and instrument, mycelium becomes computation, circulation becomes routing. Technology grows out of ecology and returns efficiency to it across time steps — never energy from nothing. Ecology provides substrate and *possibility*; `TECHNOLOGY_SYSTEM.md` owns which capabilities are actually realized, reproduced, and maintained (`SIMULATION_SYSTEMS.md` Section 16).

**Ecology → Memory (`MEMORY_SYSTEM.md`).** The environment records civilization history: vault breaches, boundary discoveries, deep-strata emergence, growth strata, and monuments' anchoring sites all originate as ecological facts and persist as permanent Memory State.

**Learning Integration → Ecology.** The upstream edge, and the only true source: learning activity, delivered as the focus block of `ARCHITECTURE.md` Section 4, is the biological input from which every ecological process in this document draws its energy. Remove it and the ecology has no engine — which is the design, stated as a dependency.

---

## SECTION 14 — AI GENERATION RULES

Any future ecological feature — species, network, transition, growth system, relationship — must pass every rule below, *after* passing the tiered validation protocol of `DOCUMENT_ARCHITECTURE.md`, the hard boundaries of `GAME_DESIGN.md`, the structural laws of `ARCHITECTURE.md` (including the Trope Guard), and the physics of `SIMULATION_SYSTEMS.md` Section 12. A proposal that fails any rule is rejected and redesigned from the constraint up, never merged with adjustments.

**Rule 1 — Biologically inspired.** The feature must derive from a real dark-adapted biological analog (abyssal, deep-cave, chemosynthetic), rendered symbolically per Section 1.

**Rule 2 — Metabolically connected.** The feature must draw its energy from the learning-derived nutrient pathways of Section 3. Nothing in the ecology is self-powered.

**Rule 3 — Nocturnal.** The feature must support a permanent-night ecosystem: no daylight biology, no photosynthesis, no diurnal cycles.

**Rule 4 — Free of surface assumptions.** No traditional surface animals, no surface ecosystems, no human industrial technology, and none of the banned tropes of `NOCTIS_ECOLOGICAL_ENGINE.md` section 8.

**Rule 5 — Relational.** The feature must create or join dependency edges (Section 6). Isolated objects — species without a role, structures without an anchor — are invalid.

**Rule 6 — Identity-bearing.** The feature must contribute to the civilization's character as a living reflection of learning, not merely add content.

**Rule 7 — Never a management mechanic.** The feature must require no user placement, assignment, collection, spending, or optimization — and must not *reward* attempts to manage it. If the best way to enjoy the feature differs from simply studying well, the feature is wrong (`GAME_DESIGN.md` Section 11, Principle 2).

---

## Closing Validation Statement

Every future ecological concept for the Noctis Civilization Module must pass, in order: the Tier 1 test of `VISION.md`, the Tier 2 test of `ART_DIRECTION.md`, the Tier 3 test of `NOCTIS_ECOLOGICAL_ENGINE.md`, the experience tests of `GAME_DESIGN.md`, the structural laws of `ARCHITECTURE.md`, the physics of `SIMULATION_SYSTEMS.md`, and the ecological laws of this document. The substrate holds what was proven. The mycelium keeps what was learned. The light speaks what was imagined. The fauna carry it all, and none of it exists without the user's mind.

Noctis is not a world the user controls.

It is a world that grows because the user grows.

The ecology is the living memory of human effort.
