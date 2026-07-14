---
doc_id: noctis.technology_system
tier: 7
authority: domain_specification
role: technology_domain_blueprint
depends_on:
  - VISION.md
  - ART_DIRECTION.md
  - NOCTIS_ECOLOGICAL_ENGINE.md
  - DOCUMENT_ARCHITECTURE.md
  - GAME_DESIGN.md
  - ARCHITECTURE.md
  - SIMULATION_SYSTEMS.md
  - ECOLOGY_SYSTEM.md
  - CITIZEN_SYSTEM.md
---

# Noctis Civilization Module — Technology System

## Document Status And Authority

This document is the technology domain blueprint of the Noctis civilization simulation: the Tier 7 specification of how the civilization turns observation, memory, need, skill, cooperation, and accumulated knowledge into new ways of living in the eternal night. It answers the question the era machine leans on but never resolves: *how does a dark-adapted civilization actually invent, build, spread, maintain, lose, and rediscover the techniques by which it survives and grows?*

It sits beneath the full canon, the technical architecture, the simulation physics, and the two peer domains already written, and may never contradict any of them:

```
VISION.md                      Tier 1 — Absolute Conceptual Anchor
ART_DIRECTION.md               Tier 2 — Aesthetic & Spatial Interface
NOCTIS_ECOLOGICAL_ENGINE.md    Tier 3 — Mechanical & Biological Execution
DOCUMENT_ARCHITECTURE.md       Meta  — Structural Guardrail Framework
GAME_DESIGN.md                 Tier 4 — Experience Design
ARCHITECTURE.md                Tier 5 — Technical Architecture
SIMULATION_SYSTEMS.md          Tier 6 — Simulation Physics
ECOLOGY_SYSTEM.md              Tier 7 — Ecological Domain Blueprint
CITIZEN_SYSTEM.md              Tier 7 — Citizen Domain Blueprint
TECHNOLOGY_SYSTEM.md           Tier 7 — Technology Domain Blueprint (this file)
```

In the per-evaluation dependency topology of `SIMULATION_SYSTEMS.md` Section 13, technology sits *downstream* of ecology and citizens — it is inspired by natural systems and carried by living actors — and *upstream* of the culture, economy, memory, and era-progression domains, which read what technology makes possible. This document specializes the Technology Contract of `SIMULATION_SYSTEMS.md` Section 16; it may specialize the physics, and it may never override it.

### The Identity Guardrail

Technology in Noctis is not a menu of upgrades, not a tree of unlocks, not a research queue, and not a currency the user spends. There is no build button, no cost, no timer, and no icon to click. The user never selects a technology, never places a workshop, never assigns a researcher. Technology **precipitates** from the accumulated conditions of a civilization the way crystal precipitates from saturated brine (`SIMULATION_SYSTEMS.md` Section 9; `GAME_DESIGN.md` Section 1). What this document specifies is the *interior* of that precipitation: the lawful, causal, citizen-carried lifecycle by which a possibility becomes a practice — and the equally lawful ways it can fail, stall, spread unevenly, decay, be forgotten, and return. The user studies; the civilization invents. That asymmetry is the whole of it.

### What This Document Binds — And What It Refuses To Bind

**Binds:** the technology philosophy and its vocabulary ladder; the abstract technology-state projection and its heritage/practice split; the possibility gradient and its stage conditions; the discovery-and-precipitation model and its seeded actor selection; the experimentation, prototype, and failure taxonomy; the knowledge-transmission model; the adoption-and-diffusion model; the production, infrastructure, and maintenance model; the technological consequences emitted as typed signals; the era **capability-envelope realization** and the per-era infrastructure-efficiency curve `η_era`; the technological-inequality and alternative-path models; the decline/loss/rediscovery model; the night-specific technological identity; the coefficient families of the technology domain, each named symbolically with its binding constraint and canon citation.

**Refuses to bind:** every numeric coefficient, rate, efficiency, and threshold *value* (named here as constrained symbols; bound at implementation under the calibration constraints of `SIMULATION_SYSTEMS.md` and this file, each value carrying a canon citation); the exact field identifiers of the state schema; any code structure, module layout, or type definition; any visual, animation, asset, sprite, sound, or UI behavior — every appearance question belongs to `ART_DIRECTION.md` and the Tier 8 pipelines; the **era-transition gating formula** and its thresholds `Θ_era`, which are owned by `ERA_PROGRESSION.md` (this document emits a technological-maturity contribution and nothing more); the raw study-interpretation taxonomy, owned by `LEARNING_INTEGRATION.md`; the internal models of culture, economy, and memory, owned by their domains; citizen demographics and life cycle, owned by `CITIZEN_SYSTEM.md`. This document defines technological *facts and possibilities*. Other domains decide meaning, price, persistence, lifespan, gating, and appearance.

No numeric anchors appear in this document beyond the three the canon itself locks: the three-consecutive-day consistency trigger, the five-day absence horizon, and the ten-minute reawakening session (`NOCTIS_ECOLOGICAL_ENGINE.md` section 7).

### Notation

Notation follows `SIMULATION_SYSTEMS.md`: `K_total` is accumulated knowledge, `R` is research readiness, `k` is the consistency count, `m` is learning momentum, `L` is illumination, `Φ` is circulation, `X_myc` and `X_cry` are the network masses, `P` is population, `A_P` is population activity, `η_era` is per-era infrastructure efficiency. Technology introduces its own bounded symbols: `H_tech` (technique heritage — the recorded set of reproducible capabilities, a monotone legacy quantity), `A_adopt ∈ [0, 1]` (adoption breadth of an active capability), `V_infra ∈ [0, 1]` (infrastructure vitality), `D_load` (dependency load of an active infrastructure), and the possibility-stage thresholds `Θ_precip(stage)`. Seeded deterministic selection is written `select(seed, S, context)` — a pure function of committed state, never randomness (`SIMULATION_SYSTEMS.md` Section 11). Bounded expression variables live in `[0, 1]`; named constants carry their constraints here and their values at implementation time.

---

## SECTION 1 — TECHNOLOGY PHILOSOPHY

### Technology Is Converted Knowledge, Not Acquired Upgrade

Technology is the civilization's growing repertoire of *ways of living*: how it lights its dark, remembers its past, moves through its terrain, feeds its people, and reaches toward the questions at the edge of the known. It is not a stock the user accumulates and spends. It is what happens when accumulated knowledge, present need, available material, living skill, and social trust converge densely enough that a new practice becomes not merely thinkable but reproducible. The canonical image is chemical, not commercial: technology *precipitates* out of a saturated civilization (`SIMULATION_SYSTEMS.md` Section 9). The user's learning saturates the solution; the civilization crystallizes the technique.

### Possibility, Not Possession

The deepest principle of this domain, inherited as law from `SIMULATION_SYSTEMS.md` Section 16 (the capability distinction, Law 9): **knowing is not the same as being able, being able is not the same as making, making is not the same as maintaining, and maintaining is not the same as everyone having.** A civilization may understand a principle it cannot engineer, build a prototype it cannot reproduce, produce an object it cannot maintain, or hold a technology in one district that another has never seen. These are different states, and the difference between them is where all the texture of technological history lives. A technology system that collapses them into a single "unlocked" flag has thrown away the entire subject.

### Situated, Path-Dependent, Socially Carried

Technology is **situated**: it emerges from the actual world of the civilization — its materials, its organisms, its terrain, its ecology, its accumulated knowledge, its institutions, its trust, its permanent night. The same understanding does not produce the same technology in a fungal-materials civilization and a crystal-materials one. Technology is **path-dependent**: earlier choices shape later possibilities, so no two civilizations converge (`SIMULATION_SYSTEMS.md` Section 5). And technology is **socially carried**: it does not spread because it exists but because living citizens invent it, teach it, trust it, adopt it, maintain it, and sometimes let it lapse (`CITIZEN_SYSTEM.md` Section 8 agency; `SIMULATION_SYSTEMS.md` Section 8). Nothing in this document treats a technology as an object that acts on its own. Every technology is a thing some Noctae once worked out and other Noctae still, or no longer, know how to do.

### Trade-Offs, Not Strict Improvement

Almost every significant technology creates dependencies, risks, and externalities alongside its benefits (`SIMULATION_SYSTEMS.md` Sections 9, 16). Brighter settlements disturb nocturnal fauna; greater throughput deepens material dependence; automation thins the transmission of the craft it replaces; cosmic capability brings cosmic fragility. Higher-era technology is *more capable*, never *strictly better*. The document must never present an era or a technique as an unqualified upgrade, and the simulation must always let the trade-off be real.

---

## SECTION 2 — WHAT TECHNOLOGY IS: THE VOCABULARY LADDER

Technology is not one thing, and this domain refuses to use the word as an undifferentiated umbrella. It distinguishes, and the distinctions carry mechanical weight:

- **Observation** — a noticed regularity in the world (a moss that glows brighter over warm seepage). Raw material of knowledge; produced by citizen attention and survey fauna; owned here only as a precondition.
- **Knowledge** — an understood relationship, held in `K_total` and in citizen practice. Necessary for technology, never sufficient.
- **Explanatory model / theory** — a why behind a what. Deepens reproducibility and transfer; can be held without the craft to use it, and lost while the craft survives.
- **Craft / skill** — an embodied ability living in citizens (`CITIZEN_SYSTEM.md`). Transmits by apprenticeship, resists text, dies with its last unrenewed practitioner-expression.
- **Technique** — a repeatable method. The atomic unit of this domain: a technique is a capability the civilization can, under the right conditions, *do again*.
- **Tool / instrument** — a made object that a technique uses. Requires materials and production.
- **Process** — a coordinated sequence of techniques and tools.
- **Invention / discovery** — the first crossing of a technique from *not-possible-here* to *achieved-once*. Invention is deliberate; discovery is often accidental; both are events, not stocks.
- **Prototype** — an achieved-once technique not yet reproducible.
- **Innovation** — a technique recombined or adapted into a new arrangement (informational novelty, lawful under `SIMULATION_SYSTEMS.md` Section 9 — novelty is not energy from nothing).
- **Infrastructure** — technique made civic and standing: the aqueducts, sound-vaults, mycelial boards, and light-routing of the eras. It ages and requires maintenance.
- **Institution** — a social structure that carries technique across citizens and generations (a scriptorium, a guild of valve-keepers). Owned jointly with Citizen and Culture.
- **Standard** — an agreed form that lets techniques and tools interoperate and transmit faithfully.
- **Technological tradition** — a lineage of related technique carried as culture.
- **Technological capacity** — the civilization's current ability to actually do a class of things at scale.
- **Adoption / mastery / maintenance / repair** — the states of a technique in active life.
- **Obsolescence / loss / rediscovery** — the states of a technique in decline and return.
- **Misuse / unintended consequence** — technique producing outcomes its makers did not foresee.

Every later section is, in some sense, the physics of how a possibility travels up and down this ladder.

---

## SECTION 3 — DOMAIN OWNERSHIP

This section states plainly what technology owns and what it must never decide, specializing `SIMULATION_SYSTEMS.md` Section 14.

**Technology owns:** technological possibility (what could exist here, now); the application of knowledge into capability; the discovery-and-invention lifecycle; experiments and their outcomes; prototypes; reproducibility; technical feasibility; production requirements *as technical constraints* (what a technique needs to be made); infrastructure dependencies; maintenance and repair requirements and the knowledge they take; technical standards; technical adoption *compatibility and eligibility* signals; technological decline, loss, and rediscovery; the technological consequences emitted as typed pressure signals to other domains; the realization of each era's capability envelope; and the per-era infrastructure-efficiency curve `η_era`.

**Technology does not own:** raw study interpretation (`LEARNING_INTEGRATION.md`); citizen psychology, biography, lifespan, and demographics (`CITIZEN_SYSTEM.md`); the resolution of population activity (`CITIZEN_SYSTEM.md`); cultural meaning, legitimacy, prestige, and taboo *as resolved values* (`CULTURE_SYSTEM.md`); market pricing, allocation, ownership, and distribution — and Noctis has no market at all (`ECONOMY_SYSTEM.md`; `SIMULATION_SYSTEMS.md` Section 20); ecological outcome resolution (`ECOLOGY_SYSTEM.md`); historical persistence, distortion, and forgetting *as record rules* (`MEMORY_SYSTEM.md`); the era-transition **gating** formula and thresholds (`ERA_PROGRESSION.md`); and all rendering, notification, and presentation (`ART_DIRECTION.md`, Tier 8). Technology proposes; these domains dispose.

---

## SECTION 4 — CONCEPTUAL STATE MODEL

The technology domain's state is an abstract **projection** over the canonical technological state of `SIMULATION_SYSTEMS.md` Section 2 (era designation, `R`, `K_total`, information-storage stage, Memory State) together with the ecological and cultural-reception context it reads across time steps. It is categories, not a schema; exact field identifiers bind at implementation under `ARCHITECTURE.md`.

```
TechnologyState  (a projection over canonical technological, cognitive, and Memory state)
{
  knowledgeHorizon        the conceptual reach of the civilization — what it can
                          even recognize as a problem or possibility
                          (derived from K_total and the interpreted learning profile)

  researchReadiness       R — accumulated innovation pressure; one contextual
                          input to precipitation, never the whole of it

  possibilityField        for each candidate technique, its current stage on the
                          possibility gradient (Section 6) — derived, not stored
                          per-technique as hidden variables

  techniqueHeritage       H_tech — the recorded set of capabilities the civilization
                          has ever made reproducible, held in Memory State
                          (monotone legacy; never decreases)

  activePractice          A_adopt per capability — which heritage capabilities are
                          currently practiced and how broadly (renewable)

  infrastructureVitality  V_infra — the maintenance and operational health of the
                          standing infrastructure of the current era (renewable)

  dependencyLoad          D_load — the structural dependence of active infrastructure
                          on materials, energy, skill, and other technologies (derived)

  eraCapabilityEnvelope   the era designation's bound on what is possible at all
                          (read from SIMULATION_SYSTEMS.md Section 15)
}
```

### Two Binding Laws

**Derivable from canonical state.** Every category above must remain a projection of canonical state; this document adds *vocabulary*, never hidden simulation variables that would balloon the state or demand ticking (`SIMULATION_SYSTEMS.md` Section 2; `CITIZEN_SYSTEM.md` Section 3). An individual invention — the one the user notices in a workshop, the famous device in the archive — is a **derived, seeded expression** over aggregate state (Section 24), snapshotted into permanence only when it enters Memory State as heritage, exactly as citizen individuality is rendered rather than stored.

**The heritage / practice split.** This is the load-bearing structural fidelity of the technology domain, and the direct specialization of `SIMULATION_SYSTEMS.md` Section 10 (legacy vs active possession). `techniqueHeritage` (`H_tech`), `researchReadiness` (`R`), `knowledgeHorizon`, and the era envelope are **monotone legacy** — they never decrease, and user absence never touches them. `activePractice` (`A_adopt`), `infrastructureVitality` (`V_infra`), and the active portion of the possibility field are **renewable practice** — they may rise, fall, fragment, fall dormant, and revive through internal causal processes, and they dim (safely, uniformly) during absence. The civilization always *remembers* what it once could do; whether it can *currently* do it is a separate, living question. This split is the mechanism that lets technology have a real history of loss and revival without ever violating persistence or non-punishment (`SIMULATION_SYSTEMS.md` Laws 5, 6, 8).

### Coefficient Families

The technology domain owns the following symbolic coefficient families. Each is named with its binding constraint; values bind at implementation under these constraints, each carrying its canon citation.

| Symbol family | Governs | Binding constraint | Canon source |
|---|---|---|---|
| `Θ_precip(stage)` | Thresholds along the possibility gradient (Section 6) | Strictly increasing in prerequisite depth; a stage is reachable only when all lower stages hold | `SIMULATION_SYSTEMS.md` Section 16 |
| `η_era` | Per-era infrastructure efficiency multiplier on metabolism | Monotone non-decreasing across eras; saturating within an era; returns efficiency across time steps, never primary energy | `SIMULATION_SYSTEMS.md` Sections 13, 16 |
| `μ_maint` | Maintenance sufficiency → `V_infra` | Monotone in maintenance capacity; `V_infra` bounded in `[0,1]` | `SIMULATION_SYSTEMS.md` Section 16 |
| `λ_practice` | Decay of unmaintained or superseded active practice | Acts only on the renewable practice layer; **never** triggered by user absence; heritage untouched | `SIMULATION_SYSTEMS.md` Sections 10, 16, Law 8 |
| `α_adopt` | Adoption-breadth advance per compatible condition | Monotone in compatibility and reception; `A_adopt` bounded; never reaches forced universality | `SIMULATION_SYSTEMS.md` Section 16 |
| `Θ_redisc` | Rediscovery reactivation threshold | Crossable only when a heritage record exists and preconditions realign; deterministic | `SIMULATION_SYSTEMS.md` Sections 10, 21 |
| `w_era` | Technology's contribution weight to era readiness | A contribution signal only; the gate `Θ_era` is owned by `ERA_PROGRESSION.md` | `SIMULATION_SYSTEMS.md` Section 15 |

No coefficient may ever be user-visible as a number to optimize, and no technological advance may ever require a user decision (`GAME_DESIGN.md` Section 11, Principle 2; `SIMULATION_SYSTEMS.md` Law 10).

---

## SECTION 5 — TECHNOLOGY DOMAINS

Technological activity is classified into extensible **domains** — families of technique organized by the need they answer, not by an authored dependency web. The classification is open and supports overlap, hybridization, interdisciplinary discovery, local variants, parallel solutions, dead ends, and rediscovery. Representative domains, all expressed within the heatless, night-adapted constraint engine (`NOCTIS_ECOLOGICAL_ENGINE.md`):

- **Subsistence and cultivation** — husk-beds, fungal farms, chemosynthetic terraces.
- **Light and illumination** — the central Noctis domain (Section 21): spore-hearths, luciferin synthesis, crystal light-pipes, bio-circuit glow, starlight calibration.
- **Materials** — grown biosilicate, electroformed mineral, mycelial composite, crystal lattice. Never smelted, never fired (Section 20 note; `GAME_DESIGN.md` Hard Boundaries).
- **Water and fluidics** — aqueducts, hydrostatic works, fluidic logic.
- **Record and memory technique** — knot cords, fiber scrolls, crystal lattices, sound-vaults, mycelial boards, entangled pairs (the information-storage envelope of each era).
- **Communication** — photophore semaphore, routed light, phononic telegraphy, frequency-coded fiber, aurora projection.
- **Measurement and computation** — resonance reckoning, fluidic logic, optogenetic processing.
- **Transport and mobility** — root-paths, tiered lifts, current-borne movement.
- **Construction** — anchored growth into root and lattice (`NOCTIS_ECOLOGICAL_ENGINE.md` Rule 3).
- **Medicine, sanitation, and ecology management** — detritivore husbandry, habitat tending, environmental monitoring.
- **Energy and power** — crystal charge storage, cold hydrostatics, respiration-gas pneumatics, stellar calibration.
- **Astronomy, navigation, and (late) planetary/stellar technique.**

Domains **interact** without a hand-authored dependency graph: a technique in one domain becomes a *precondition* for another only through shared material, shared knowledge, shared infrastructure, or shared skill — all read from committed state at precipitation time (Section 6). Dependencies emerge from state, they are not enumerated. This is why the same domain can be entered by different routes in different civilizations, and why a dead end in one domain can leave a lasting mark on another.

---

## SECTION 6 — PRECONDITIONS AND THE POSSIBILITY GRADIENT

A technique does not exist in a binary of locked/unlocked. It occupies a **stage** on a possibility gradient, and it advances only when the deterministic state conditions of the next stage are met (`Θ_precip`). The gradient is the capability distinction (Law 9) made into mechanism:

```
possible        the material, ecological, and energetic preconditions exist in
                the world — the technique is not forbidden by physics or night

conceivable     the knowledgeHorizon reaches it — some citizen or institution
                could recognize it as a problem or opportunity (K_total, profile)

investigable    knowledge, skill, and a motivating pressure coincide, and an
                actor exists who could pursue it (Section 7)

prototype-ready enabling technique and material are in hand; an attempt can be made

reproducible    the technique has been achieved and can be done again on demand
                — the first crossing into techniqueHeritage (H_tech)

manufacturable  production requirements are satisfiable at more than one-off scale
                (materials, skilled labor, tools, energy — Section 11)

maintainable    the civilization can keep instances working over time (V_infra)

scalable        production and maintenance extend across districts

adopted         some population actually uses it (A_adopt > 0)

normalized      it is unremarkable — woven into daily life, tradition, and culture
```

Each arrow is a threshold in `Θ_precip`, evaluated against committed state. **No stage can be skipped**, and a technique can sit at any stage indefinitely, or slide back down the renewable portion (adopted → not-currently-practiced) while its heritage record holds at *reproducible* forever. Crucially, the gradient forbids the tech-tree fantasy at the level of physics: a technique cannot be "bought" into existence, because there is no arrow that a condition-check does not gate, and no condition that the user's actual learning and the civilization's actual state do not supply.

---

## SECTION 7 — DISCOVERY AND PRECIPITATION

Discovery is the crossing from *investigable* to *achieved-once* (prototype), and it is the causal interior of `SIMULATION_SYSTEMS.md` Section 9's precipitation. It is **convergence, not a roll**: a breakthrough occurs when several conditions coincide, never because a random number came up.

### Sources Of Novelty

The pressures and openings that push a technique toward attempt include: urgent need; ecological pressure (a shifting habitat, a failing food source); material opportunity (a new substance surfaced by root expansion); curiosity; accident; imitation of a neighbor; combination of existing techniques (innovation as recombination); imported knowledge; institutional research; individual obsession; repair and improvisation; failure analysis; long-term observation; and — the ultimate upstream source — the user's learning, arriving as an expanded `knowledgeHorizon` and interpreted profile (`LEARNING_INTEGRATION.md`; Section 16). Several of these are usually present at once; precipitation is the moment their combination crosses `Θ_precip(prototype-ready)`.

### Seeded Actor Selection

*Which* citizen or institution makes the attempt — the obsessive knot-keeper, the trench-pod scribe, the guild that has been circling the problem — is chosen by seeded deterministic selection: `select(seed, S, context)`, a pure function of the civilization seed, committed state, and the candidate set of qualified actors (`SIMULATION_SYSTEMS.md` Section 11). The selection is *variation without randomness*: the same complete history always yields the same inventor, the candidate set never includes an unqualified actor, and the choice is always explainable after the fact. Variation decides *who and when*; convergence decides *whether*; prerequisites decide *what is even in the set*.

### Degrees Of Achievement

Precipitation does not always produce a clean invention. Its legitimate outcomes are graded: **possible but unattempted** (no actor, no pressure); **investigated but unsolved**; **partial success** (works under narrow conditions); **prototype** (works once); **misleading success** (works for the wrong understood reason). A failed or partial precipitation is a real, recorded outcome, not merely "no progress" (Section 8). Every one of these is causally traceable — the simulation can always answer *why this became possible, why this actor pursued it, and why it succeeded, failed, or half-succeeded* (`SIMULATION_SYSTEMS.md` Law 1; Section 24).

---

## SECTION 8 — EXPERIMENTATION, PROTOTYPES, AND FAILURE

Between *investigable* and *reproducible* lies experimentation, and its most important product is often failure. Experimentation takes era-appropriate forms: household and craft refinement in `SPORE_HEARTH`; workshop and scholarly trials in `CRYSTAL_INSCRIPTION`; industrial and fluidic-computational research in `PHONONIC_SUBTERRANEAN`; optogenetic simulation in `OPTOGENETIC_CIRCUIT`; and vast, slow, consequential experimentation in `COSMIC_STELLAR`.

A prototype carries attributes read from the state that grew it — reliability, efficiency, safety, material cost, reproducibility, required operator skill, environmental compatibility, and maintenance burden. These attributes are what the possibility gradient (Section 6) tests when deciding whether the prototype can climb toward *reproducible* and beyond.

**Failure is typed**, never a null result:

- **harmless failure** — nothing happens; knowledge of the dead end is recorded.
- **misleading success** — it works, but not for the understood reason; propagates fragile technique.
- **dangerous instability** — it works and harms (a pressure vessel that shears, a light that blinds the fauna).
- **expensive impracticality** — it works but cannot be afforded at scale (an Economy signal, Section 15).
- **ecological damage** — it works and the ecology pays (an Ecology pressure signal, Section 13).
- **unrepeatable discovery** — it worked once and cannot be reproduced (stays a prototype).
- **knowledge lost with the inventor** — the technique never left one citizen and lapses when that practitioner-expression is not renewed (Section 20; `CITIZEN_SYSTEM.md`).
- **misunderstood by successors** — the practice survives while the theory is lost, or vice versa.
- **accidental adjacent discovery** — the failure reveals an unrelated technique (a seeded side-discovery, Section 7).

Failure feeds `R` as innovation pressure and endurance, exactly as difficulty does (`SIMULATION_SYSTEMS.md` Section 7): a civilization that fails hard at a problem is closer to solving it, not poorer for trying. This is the honest reading of what hard study does to a mind, extended to the world it builds.

---

## SECTION 9 — KNOWLEDGE TRANSMISSION

A technique that cannot be transmitted dies with its holder. Transmission is how a capability moves between citizens and across generations, and its properties decide whether a civilization keeps what it learns. Transmission channels are era-inflected and drawn from the canon's information-storage envelopes: imitation, oral (flash-taught) teaching, apprenticeship, guilds, tactile diagrams and knot cords, fiber-scroll manuscripts, scriptoria and schools, resonant sound-vaults, standardized manuals, industrial training, phononic and optical networks, living mycelial archives, and — in the last era — entangled repositories.

Each channel has **fidelity, accessibility, cost, speed, authority, cultural legitimacy, and vulnerability to loss**, and — the decisive point — *different kinds of knowledge transmit differently*:

- **Embodied craft** resists textual preservation; it wants apprenticeship, and decays when its human chain thins.
- **Explanatory theory** spreads through institutions and notation; it can outlive the craft it explains, or predecease it.
- **Maintenance knowledge** is uniquely fragile: when automation hides a mechanism, the knowledge to repair it quietly starves (Section 11; a central `OPTOGENETIC_CIRCUIT` risk).
- **Complex infrastructure** can physically outlast the understanding that built it — a standing aqueduct whose makers' descendants no longer know how it was grown.

Transmission depends on standards and notation, on living institutions, and on physical infrastructure; when any of those fails, a specific *layer* of a technology can be lost while others persist (Section 20). The recording of a transmitted technique as durable heritage is a **Memory** concern (`MEMORY_SYSTEM.md`); this domain owns whether the *live capability* transmits, and Memory owns whether the *record* endures. The two are deliberately separate (`SIMULATION_SYSTEMS.md` Section 21).

---

## SECTION 10 — ADOPTION AND DIFFUSION

Invention does not imply adoption, and adoption does not imply universal access (`SIMULATION_SYSTEMS.md` Section 16). Once a technique is reproducible, whether a population actually takes it up is a separate process, resolved as `A_adopt` advancing under `α_adopt` against compatibility and the cultural-reception context.

Adoption depends on immediate usefulness, cost, compatibility with existing practice, visibility, prestige, trust in the inventor, education, tradition, fear, regulation, risk, material availability, infrastructure, and regional ecology (`SIMULATION_SYSTEMS.md` Sections 16, 17; `CULTURE_SYSTEM.md`). Because these differ across districts and citizen groups, **adoption is uneven by construction**. The domain supports, without forcing modern marketing categories: enthusiastic adoption; cautious trial; elite monopolization; local adaptation; culturally-legitimated or -rejected variants; state-enforced or guild-resisted spread; generational splits; district-by-district difference; technological inequality; and abandonment after initial excitement. Which districts lead and in what order is seeded-deterministic (Section 24), so a given civilization's diffusion history is fixed and explainable, while no two civilizations diffuse alike.

`A_adopt` is **renewable practice** (Section 4): a technology can be widely adopted and later fall out of use, its heritage intact, its practice at floor. Adoption is visible only through citizen behavior and district change — new occupations at the plazas, changed evening routines, an unfamiliar tool in a scribe's pod — never through a progress bar (Section 22; `CITIZEN_SYSTEM.md` Section 5). Culture owns whether a technology is *legitimate*; this domain owns only whether it is *compatible and eligible* to spread.

---

## SECTION 11 — PRODUCTION, INFRASTRUCTURE, AND MAINTENANCE

Reproducibility is not enough for civic scale. Between *reproducible* and *scalable* lies production, and it generates dependencies. Making a technique real at scale requires, distinctly: the knowledge of how it works; the materials; the skilled labor; the tools; the energy (which always traces to metabolized learning — `SIMULATION_SYSTEMS.md` Sections 8, 9); the supply relationships; the manufacturing capacity; the maintenance institutions; the replacement parts; the standards; and the safe operating practice. Any of these can be the binding constraint, and *which* one binds is where a civilization's character shows.

**Dependency scales with sophistication**, captured as `D_load`:

- a simple tool depends only on local craft;
- an industrial `PHONONIC_SUBTERRANEAN` machine depends on grown materials, tiered transport, hydrostatic power, trained operators, standardized parts, and repair-halls;
- an `OPTOGENETIC_CIRCUIT` network depends on energy reliability, living substrate, cooling, specialist labor, shared standards, and continuous maintenance;
- a `COSMIC_STELLAR` system depends on entire planetary and inter-district networks — and, always, on the user's ongoing learning (the Stellar Guard, Section 17).

**Infrastructure ages.** `V_infra` (infrastructure vitality) is renewable practice-layer state, driven up by maintenance capacity (`μ_maint`) and down by wear and by superseding neglect (`λ_practice`). The domain models wear, maintenance debt, repair, decay, redundancy, resilience, adaptation, abandonment, salvage, and cascading failure — where a dependency's collapse propagates through everything that leaned on it (Section 26; the classic `OPTOGENETIC_CIRCUIT` failure, Scenario 7). But two hard limits bind every one of these: infrastructure decay is **internal-causal**, never a punishment for user absence (during absence the whole practice layer simply dims uniformly and safely, then revives — Sections 23, 26); and no cascade ever destroys the *heritage record* of how the infrastructure worked (Law 5). The lights can go out on a technique; the memory of it cannot.

---

## SECTION 12 — TECHNOLOGICAL CONSEQUENCES AND EXTERNALITIES

Technology produces consequences the whole simulation can read, but it **resolves almost none of them itself**. It emits typed pressure and capability signals across committed evaluations (`SIMULATION_SYSTEMS.md` Section 13); the owning domains resolve the outcome:

- to **Ecology** — resource-demand pressure, light pressure, vibration/noise pressure, waste pressure, habitat-modification pressure; Ecology decides the ecological result (Section 13).
- to **Citizens** — health, labor, leisure, safety, and routine *conditions*; Citizen resolves how the Noctae experience them (Section 14).
- to **Culture** — symbols, prestige, anxiety, aspiration, taboo *candidates*; Culture decides meaning and legitimacy (Section 15).
- to **Economy** — production capability and resource-demand pressure; Economy decides allocation and sufficiency, with no price and no market (Section 15).
- to **Memory** — inventions, disasters, ruins, lost techniques, and monument-of-invention *candidates*; Memory decides persistence and distortion (Section 15).
- to **Era Progression** — a technological-maturity contribution signal (`w_era`); Era Progression decides gating (Section 17).
- to **metabolism** — infrastructure efficiency (`η_era`), returned across time steps, never as primary energy (`SIMULATION_SYSTEMS.md` Section 13).

This clean ownership is what lets technology be consequential without becoming a second simulation of ecology, society, or economy. It names the pressure; the world answers it.

---

## SECTION 13 — ECOLOGY INTERFACE

Technology is subordinate to the ecological canon (`ECOLOGY_SYSTEM.md`; `NOCTIS_ECOLOGICAL_ENGINE.md`) and grows out of it: lattice becomes memory and instrument, mycelium becomes computation, circulation becomes routing (`ECOLOGY_SYSTEM.md` Section 13). Ecology provides substrate and *possibility*; this domain owns which capabilities are actually realized, and it returns efficiency to ecological metabolism across time steps — never energy from nothing.

Technology interacts with ecology only by **emitting pressure**; ecology resolves the result, always delayed and cumulative (`ECOLOGY_SYSTEM.md`). Pressures include resource demand on the nutrient flow, habitat modification, light, vibration, waste, and — at the last era — planetary-scale intervention. Two canon rules bind hard. First, **nothing is mined, smelted, or forged**: materials are grown, precipitated, electroformed, and recycled (`GAME_DESIGN.md` Hard Boundaries; the `PHONONIC_SUBTERRANEAN` electroforming of `GAME_DESIGN.md` Section 7). "Extractive" technological philosophies exist only as *demand pressure* on renewable ecological activity, and can dim the living world's activity while never destroying its legacy structure (`SIMULATION_SYSTEMS.md` Laws 5, 8). Second, technology can never bypass ecological consequence: an efficiency won at ecological cost is a real trade-off the ecology will express (Section 1).

Noctis permits **multiple technological philosophies** toward ecology — extractive, adaptive, regenerative, symbiotic, conservationist, artificial, hybrid — and which a civilization tends toward is emergent from its path, not chosen at setup (Section 19). Progress never means replacing nature; the most advanced era is a more intricate night, not a brighter day.

---

## SECTION 14 — CITIZEN INTERFACE

Technology is experienced *through* the Noctae, never as civilization-level statistics alone (`CITIZEN_SYSTEM.md`). Citizens are its genuine actors within the agency boundary of `SIMULATION_SYSTEMS.md` Section 8: they observe, invent, experiment, teach, build, operate, maintain, repair, heal, record, scavenge, critique, adopt, and sometimes lose technique — while never minting primary learning-derived value. Every technological function in this document is carried by a citizen expressing a role, and roles are character, not employment (`CITIZEN_SYSTEM.md` Section 6): a maintainer is not a worker the user assigns but a life the user can watch keeping the aqueduct alive.

Citizens differ — in skill, access, trust, familiarity, dependence, exposure to risk, capacity to repair, and attitude — and those differences are exactly what make adoption uneven and loss possible (Sections 10, 20). A technology changes daily life through work routines, travel, communication, domestic activity, medicine, learning, safety, and the citizens' relationship with the night itself, and the user reads all of it as behavior, never as a readout. The domain draws on Citizen for *practitioner presence, succession, and skill distribution*; it never reaches into demographics or lifespan, which Citizen owns (`SIMULATION_SYSTEMS.md` Section 19). When the last renewable expression of a rare skill is not carried forward, a technique can lapse — modeled as practice-layer decay decoupled from any citizen's death (Section 20).

---

## SECTION 15 — CULTURE, ECONOMY, AND MEMORY INTERFACES

These three domains are unwritten (placeholders) or reserved; this document defines **one-directional deferred contracts** to them and authors none of their internals (`SIMULATION_SYSTEMS.md` Sections 17, 20, 21).

**Culture interface.** Technology emits, as candidates, the symbols, rituals, anxieties, aspirations, aesthetics, prestige markers, taboos, generational identities, and philosophical questions a technology can provoke. It reads back an abstract **cultural-reception vector** — legitimacy, trust, prestige, openness, resistance, taboo, compatibility, preservation strength — which conditions adoption (Section 10). Culture owns interpretation and legitimacy; technology never decides what a device *means* (`CULTURE_SYSTEM.md`).

**Economy interface.** Technology emits production capability, new-good possibility, resource-demand pressure, professions/vocational functions, infrastructure needs, efficiency changes, scarcity shifts, and maintenance costs *as conditions*. Economy owns allocation, exchange, affordability, ownership, and distribution — under the strict canon caution that Noctis has **no currency, no market, no user-facing spending** (`SIMULATION_SYSTEMS.md` Section 20; `GAME_DESIGN.md` Section 6). Technology never emits a price and never reads one.

**Memory interface.** Technology emits records, monuments-of-invention, ruins, famous devices, disasters, lost techniques, and founding-technical-myths *as candidates*. Memory owns whether these persist, distort, fade, or return as record; this domain owns the *live capability* those records point to (`MEMORY_SYSTEM.md`; `SIMULATION_SYSTEMS.md` Section 21). The technique heritage `H_tech` is, concretely, held in Memory State; rediscovery (Section 20) reads it as a precondition.

None of these contracts resolves an undefined future mechanic with an arbitrary assumption; each is a clean, signal-typed edge a later domain document can specialize without renegotiation.

---

## SECTION 16 — LEARNING INTEGRATION CONTRACT

Technology receives learning only as an **already-interpreted profile**, downstream through the ecological and metabolic layers, never as raw study telemetry and never as a currency (`SIMULATION_SYSTEMS.md` Sections 3, 22; `LEARNING_INTEGRATION.md` will own the interpretation). The signals technology consumes are abstract: conceptual depth, retained understanding, disciplinary exposure, interdisciplinary connection, revision strength, sustained attention, consistency, mastery, curiosity, difficulty, completion, and conceptual novelty.

These influence technology through the possibility field, never as a purchase:

- expanding the `knowledgeHorizon` so new problems become *conceivable*;
- raising the chance that a qualified citizen recognizes an opportunity;
- strengthening documentation, transmission, and institutional depth;
- enabling interdisciplinary breakthroughs that no single-discipline horizon could reach;
- increasing experimental persistence and the reliability of technical knowledge;
- helping dormant, recorded ideas become actionable again (rediscovery, Section 20).

**Cross-domain learning matters, and no single subject maps to a single technology branch** (`SIMULATION_SYSTEMS.md` Section 7; `ECOLOGY_SYSTEM.md` Section 1). Language study may strengthen documentation, classification, diplomacy, and transmission; history may deepen institutional memory and the recognition of repeated failure; mathematics may support measurement, modelling, construction, computation, and formalization; art may shape representation, design, symbolism, and interface tradition; science may raise explanatory power, experimentation, and material knowledge. These are *influence pathways on possibility*, not recipes. The clean division of ownership: `LEARNING_INTEGRATION.md` decides what a study session *means*; this document decides what an interpreted profile makes *technologically possible*; and study is never spent (`SIMULATION_SYSTEMS.md` Law 7; `GAME_DESIGN.md` Section 11, Principle 2).

---

## SECTION 17 — ERA BEHAVIOUR

The five canonical eras (`SIMULATION_SYSTEMS.md` Section 15; `GAME_DESIGN.md` Section 7) are not rungs on a technology ladder; each is a **changed relationship between the civilization and knowledge**, and each defines a **capability envelope** — the outer bound of what is *possible* — not a package of guaranteed, universally-installed technologies. This domain owns the *realization* of each envelope and the infrastructure-efficiency curve `η_era`; era **gating** is owned by `ERA_PROGRESSION.md`, to which this domain emits only a technological-maturity contribution (`w_era`). Era advancement is **not** invention: crossing into an era widens what can precipitate; it does not hand the civilization the era's signature devices for free.

- **`SPORE_HEARTH`** — knowledge is embodied, oral, local, inseparable from survival, living in hands, rituals, routes, elders, and communal repetition. Envelope: tactile knot-record, near-range semaphore and touch, echolocation survey, communal cold-hearth cultivation.
- **`CRYSTAL_INSCRIPTION`** — knowledge becomes organized and externalized: scriptoria, crystal archives, routed light, apprenticeship, the first standards. Envelope: fiber-scroll and lattice memory, aqueduct-routed signal, luciferin synthesis, resonant storage.
- **`PHONONIC_SUBTERRANEAN`** — the heatless industrial relationship: knowledge becomes mechanized, scaled, standardized, and increasingly separated from individual craft. This is the canon's reconciliation of the steam-industrial archetype under the heatless law — cold hydrostatics, electroforming, fluidic logic, living hydraulic muscle, phononic telegraphy; **massive mechanical power without a single flame** (`GAME_DESIGN.md` Section 7). Envelope: sound-vault records, bedrock-vibration data, cold refinement, industrial semaphore towers.
- **`OPTOGENETIC_CIRCUIT`** — the networked, computational, automated relationship: technique embedded in living infrastructure citizens may depend on without understanding. Envelope: living mycelial boards, frequency-coded light data, neural-mycelial computation, self-coordinating civic networks — and the era's signature risk, maintenance knowledge hidden by automation (Sections 9, 26).
- **`COSMIC_STELLAR`** — the transcendent relationship, turned back toward the remaining unknown: technique capable of transforming planetary systems, matter, energy, perception, distance, and memory. Envelope: entangled-lattice memory, instantaneous state-sharing, aurora-language, starlight calibration, anchored rift observatories.

The **Stellar Guard** is hard law across the last era and, in truth, all of them: starlight is a catalyst and calibration medium, never a substitute energy source. No era achieves energy independence from the user's mind; if study stops, even `COSMIC_STELLAR` dims into ceremonial stillness and the decay of `SIMULATION_SYSTEMS.md` Section 5 proceeds exactly as around the first hearth (`GAME_DESIGN.md` Section 7). And no era is a utopia: greater capability brings greater dependency, fragility, and philosophical weight (Sections 1, 12, 18).

---

## SECTION 18 — TECHNOLOGICAL INEQUALITY AND POWER

Technology changes power, and access to it is never uniform. Difference of access across professions, districts, institutions, social groups, generations, and regions is emergent from the uneven diffusion of Section 10 and the differentiated citizenry of Section 14 — expressed deterministically, never authored as a fixed hierarchy. The domain supports guild monopolies, institutionally-guarded knowledge, public infrastructure, private control of a technique, institutional secrecy, open exchange, uneven network access, automated coordination, neglected peripheral settlements, and repair knowledge concentrated in a few citizens.

Technology emits **power-relevant signals** — who holds a scarce capability, where a monopoly or a dependency sits, which district a technology has never reached — and leaves governance resolution to the appropriate future domain (Culture, Economy, and any later governance system); this is not a political simulation. The one binding truth it must always preserve: technology can produce **both emancipation and dependency**, and often the same technology produces both at once. A network that frees a district from isolation also makes it unable to function when the network fails.

---

## SECTION 19 — ALTERNATIVE DEVELOPMENT PATHS

Noctis rejects the premise that one real-world industrial history is the only route (`SIMULATION_SYSTEMS.md` Section 5; no two civilizations converge). Divergent development paths are supported and **emerge from actual simulation conditions**, never from a pre-game faction choice. A civilization's path is a deterministic function of its ecological composition (which of `X_myc`, `X_cry`, and circulation its districts express), its learning-history emphasis (the interpreted profile over time), its material and habitat context, and the seeded contingencies of who invented what, when.

Illustrative divergences, all coherent within the constraint engine: bioluminescent versus crystalline infrastructure emphasis; fungal-construction versus lattice-construction cultures; low-energy fluidic computation versus optogenetic computation; water-centered versus root-centered transport; advanced medicine with limited materials technique, or sophisticated astronomy without heavy industrial capacity; decentralized versus centralized computation; ecological-engineering versus artificial-habitat philosophies; ritualized versus formalized technical knowledge; craft-dominant high precision versus mass reproduction. Different **settlements within one civilization** may reach different solutions to the same problem (Scenario 10), because they express different local ecology and adoption history. No fantasy magic enters; advanced technology may feel wondrous, but it always retains coherent causal logic (`NOCTIS_ECOLOGICAL_ENGINE.md`).

---

## SECTION 20 — DECLINE, LOSS, AND REDISCOVERY

Technological history does not move only forward, and this is where the heritage/practice split (Section 4) earns its place. **Loss acts only on the renewable practice layer, and only through internal causality — never through user absence.** A technology can be forgotten, superseded, monopolized into fragility, rendered impractical, made obsolete, abandoned, or ritualized without understanding; its cause is always a traceable internal process (a superseding technique, a collapsed dependency, a thinned transmission chain, an ecological shift the civilization's own choices drove), and never the user stepping away (`SIMULATION_SYSTEMS.md` Laws 5, 6, 8).

**Layers decay separately** — the deep texture of a persistent, old world:

- artifacts survive but not the theory;
- theory survives but not the materials or the skill to use it;
- manuals survive but not the craft to read them into practice;
- infrastructure stands but not the maintenance knowledge to keep it;
- cultural memory survives but not any accurate technical record.

Each of these is a distinct combination of `H_tech` (heritage, permanent), `A_adopt`/`V_infra` (practice, dimmed), transmission state (Section 9), and Memory record (owned by `MEMORY_SYSTEM.md`). A technique lapses from *reproducible-and-practiced* to *reproducible-in-record-only* when its live capability decays below sustainability while its heritage entry holds forever.

**Rediscovery** is reactivation, gated by `Θ_redisc`: when a heritage record exists *and* preconditions realign — a rediscovered blueprint schema surfaced by root expansion (`ECOLOGY_SYSTEM.md` Section 7, where a schema is *exposed possibility*, not automatic capability), a returned material, a restored transmission chain, a new interdisciplinary horizon from the user's learning — a dormant capability can re-enter the possibility gradient at *investigable* and climb again. This deliberately parallels the ecology's "Mycelial Awakening" (`ECOLOGY_SYSTEM.md` Section 10): dormant structure, lawfully reactivated. Decline in Noctis is texture, not punishment — ruins, obsolete machines, broken networks, extinct crafts, and rediscovered archives are how the world feels old, deep, and persistent, and how the archive earns the phrase *the place where your learning lives*.

---

## SECTION 21 — NIGHT-SPECIFIC TECHNOLOGICAL IDENTITY

Every domain above is shaped by the eternal night, and no technology in Noctis is a daytime technology wearing dark paint (`VISION.md`, Eternal Night; `NOCTIS_ECOLOGICAL_ENGINE.md`). Permanent night reshapes lighting, navigation, agriculture, sleep, energy, architecture, safety, gathering, astronomy, temperature, ecology, perception, symbolism, transport, visibility, and communication — and technology develops around darkness as a beautiful constant, never as an enemy to be abolished.

**Lighting is the central and most emotionally weighted technological domain**, and it evolves across every era while remaining precious (`ART_DIRECTION.md`, Lighting And The Light Economy): spore-hearth decay-glow, luciferin synthesis and crystal light-pipes, cold industrial mains and shutter-semaphore, bio-circuit data-light, and starlight calibration. Because illumination is metabolic and heatless (`NOCTIS_ECOLOGICAL_ENGINE.md` Rule 1), lighting technology is inseparable from energy, ecology, and culture at once: it governs safety and labor hours, shapes architecture and social life, changes what the fauna do, consumes metabolized focus, and carries symbolic weight. Light discipline — *how little* light to make, and where — is itself a sophisticated technique, and a civilization's lighting philosophy is one of the clearest expressions of its character.

A hard identity rule binds forever: **advancement makes the night more intricately illuminated, never brighter in a daylight sense** (`VISION.md`; `GAME_DESIGN.md` Section 7). Even `COSMIC_STELLAR`, standing in a sky-open rift under the full cosmos, remains a night civilization whose darkness between lights is as deep as it was at the first hearth. Lighting technology must always pool brilliance against dark; a technology that floods the night uniformly has failed the constraint engine's deepest test.

---

## SECTION 22 — PLAYER-FACING EXPRESSION

The user perceives technological development without controlling a single invention, and the presentation obeys the surface/depth discipline of `GAME_DESIGN.md` Section 8 and the handoff law of `SIMULATION_SYSTEMS.md` Section 23 (simulation produces state; rendering decides appearance). Technological change reaches the user as **evidence in the world**: altered tools in citizens' hands, new sounds, changed routines, different building silhouettes, unfamiliar occupations at the plaza, infrastructure appearing gradually on the skyline, workshops lit late, old practices quietly disappearing, changed night-lighting, maintenance crews forming, accidents leaving marks, and museums preserving obsolete devices (`ART_DIRECTION.md`; `MEMORY_SYSTEM.md` for the archive).

The document is strict about **three distinct knowledge horizons**, which must never be conflated:

- **simulation truth** — what the state actually is;
- **citizen knowledge** — what the Noctae themselves understand (often less; they may operate what they cannot explain);
- **user-visible information** — what the interface surfaces, which is less still, and reaches the user as atmosphere first and thin instrument glass second.

The user does not automatically know everything the simulation knows; uncertainty and interpretation are part of the experience (`GAME_DESIGN.md` Section 8, Trustworthy Mystery). The domain forbids, absolutely: constant achievement popups, tech-tree interfaces, omniscient progress bars, research-queue panels, and numerical dashboards over the diorama (`GAME_DESIGN.md` Section 11, Principle 4). Technological progress must feel like a civilization unfolding, witnessed and recognized, not a checklist completed.

---

## SECTION 23 — TEMPORAL EVALUATION

Technology inherits its relationship to time entirely from `SIMULATION_SYSTEMS.md` Sections 3–4 and `ARCHITECTURE.md` Section 5: **event-driven, lazy, no ticking.** Nothing in this domain runs on a timer; a technique does not "progress" in the background. The domain's many time scales are not different update frequencies but different *threshold quantities* evaluated on the same lazy schedule:

- **Immediate** — tool use, breakdowns, repairs, small experiments, citizen reactions.
- **Short-term** — prototype iteration, skill acquisition, workshop adoption, local infrastructure change.
- **Medium-term** — profession formation, production scaling, institutional research, settlement diffusion, accumulating ecological effect.
- **Generational** — education, normalization, craft tradition, knowledge loss, technological inequality, cultural reinterpretation.
- **Era-scale** — infrastructure regimes, energy transitions, changed relationships with nature, civilization-wide dependency structures, new understandings of knowledge.

Each process declares, per `SIMULATION_SYSTEMS.md` Section 4, whether it is lazy (all are), composable over elapsed time (all are), whether it touches legacy or only active practice (heritage: legacy; adoption/vitality: active), and whether user absence may cause it (never, for loss). Between evaluations the technological state simply holds; the workshops the user sees running during quiet minutes are the renderer breathing over a constant state, not technique advancing on a clock.

---

## SECTION 24 — DETERMINISM AND EXPLAINABILITY

The technology domain produces surprise without randomness. Every varied outcome — which citizen invents, when an experiment resolves, how a prototype differs, which district adopts first, how faithfully a technique transmits, which institution pursues a possibility — is **seeded deterministic variation**: `select(seed, S, context)`, a pure function of the civilization seed, committed state, and history, choosing among *causally qualified candidates only* (`SIMULATION_SYSTEMS.md` Section 11). The same complete history always produces the same technological biography, on every machine, forever.

The permitted uses of seeded variation are exactly: which qualified actor acts, experiment timing, minor prototype variation, accidental adjacent discovery, local adoption order, and imperfect transmission fidelity. The forbidden uses are inventions without prerequisites, arbitrary era advancement, unexplained civilization-wide adoption, and any ecological or social consequence unrelated to state — none of which the seeded model can produce, because variation never manufactures a candidate and never overrides a threshold.

**Every major technological outcome is causally traceable.** The simulation can always reconstruct why a technique became possible, why a given actor or institution pursued it, why it succeeded or failed, why it spread or was rejected, why it declined, and what followed (`SIMULATION_SYSTEMS.md` Law 1). This traceability is internal and complete; it does not obligate the interface to *show* the causes (Section 22). Noctis may keep technological secrets from the user; it may never tell them a technological lie (`GAME_DESIGN.md` Section 8).

---

## SECTION 25 — EXAMPLE SCENARIOS

Each scenario traces initial conditions → enabling knowledge → actors → experimentation → production → diffusion → consequences → legacy. All are deterministic and seeded; none introduces an exception to the model.

**1 — A small early-era craft discovery.** In a `SPORE_HEARTH` settlement, a citizen tending husk-beds notices (observation) that beds over warm mineral seepage glow longer. With the era's embodied knowledge and a food pressure, `Θ_precip(prototype-ready)` is met; `select` picks the specific tender who has worked those beds longest. She tries seeding husks along the seep-lines — partial success at first, then reproducible husbandry. Production needs only local craft, so it scales to the hearth; it diffuses by imitation to neighboring beds. Consequence: a modest food-security signal to Economy and a mild ecological demand signal. Legacy: the technique enters `H_tech`; generations later a Memory Custodian's knot-record still names the tender who first "read the warm ground."

**2 — A technology emerging from ecological pressure.** A `CRYSTAL_INSCRIPTION` district's aqueduct fouls as a detritivore bloom shifts water chemistry (an Ecology condition). The pressure raises `R` and makes a filtration technique *conceivable*; a scriptorium institution investigates. A grown-biosilicate mesh prototype works, becomes reproducible, and is produced from local materials. It diffuses to districts with the same water; districts without the problem never adopt it (uneven by construction). Consequence: reduced ecological demand pressure. Legacy: the mesh technique and the disaster that prompted it both enter Memory.

**3 — A failed or dangerous industrial invention.** In `PHONONIC_SUBTERRANEAN`, a canyon settlement pushes hydrostatic pressure works toward higher throughput (industry without flame). Convergence yields a prototype accumulator, but its prototype attributes carry low *safety* and high *material cost*. Under scaling load it fails as **dangerous instability** — a penstock shears, cold brine floods a tier (a citizen safety condition; a Barometric-adjacent hardship read by Citizen as endurance, never shame). The failure feeds `R` and endurance memory; a fortified redesign follows. Legacy: a fortified quarter dated to the accident, remembered as weathering, not disgrace (`GAME_DESIGN.md` Section 9).

**4 — Uneven adoption across settlements.** A reproducible cold-refinement technique spreads from its inventor-district. `α_adopt` advances fastest where materials, skilled labor, and cultural openness align, slower where a guild resists and tradition holds. Seeded ordering fixes *which* district leads; the result is genuine technological inequality — a refined-materials core and a periphery that still trades for parts. Consequence: power-relevant signals to Culture/Economy. Legacy: the divergence becomes part of the civilization's map and self-story.

**5 — A technology lost and later rediscovered.** A `CRYSTAL_INSCRIPTION` light-pipe technique depends on a rare grown-biosilicate whose cultivation lives in one guild. Over time the guild's transmission chain thins (internal causality — not absence), the live capability decays below sustainability, and the technique lapses to *reproducible-in-record-only*; light-pipes still stand but no one grows new ones. Eras later, root expansion surfaces the guild's blueprint schema (exposed possibility, `ECOLOGY_SYSTEM.md` Section 7) and a new interdisciplinary horizon from the user's materials-heavy study realigns the preconditions; `Θ_redisc` is crossed, and the technique re-enters the gradient at *investigable*. Legacy: a rediscovery entry, and old pipes that suddenly make sense again.

**6 — A user-learning-driven interdisciplinary breakthrough.** The user studies mathematics and language together over a long, consistent season. The interpreted profile raises both structural-modelling and documentation/classification horizons; their *interdisciplinary connection* signal crosses a threshold no single discipline could. This makes *conceivable* a formal notation for resonance patterns — a standard that dramatically improves transmission fidelity (Section 9). A scholar-institution formalizes it; it becomes reproducible and normalizes as the civilization's first true technical standard. Consequence: faster, more faithful diffusion of many later techniques. Legacy: a founding-standard entry the whole later archive rests on.

**7 — A cyber-era infrastructure dependency failure.** In `OPTOGENETIC_CIRCUIT`, civic coordination runs on living mycelial boards whose maintenance is automated — and, per Section 9, the maintenance *knowledge* has quietly starved as automation hid the mechanism. A dependency shifts (a cooling substrate degrades from cumulative ecological pressure the network itself caused), and the failure **cascades** through everything that leaned on the network. Because so few citizens hold repair knowledge (`V_infra` low, skill concentrated), recovery is slow. No legacy is lost — `H_tech` holds the design — but active practice dims sharply until repair knowledge is relearned. Consequence: a hard lesson emitted to Culture (anxiety, a new value on maintenance) and to Memory. This is emphatically *not* triggered by user absence; it is internal cascade.

**8 — A cosmic-era development with philosophical and ecological consequences.** In `COSMIC_STELLAR`, entangled-lattice memory makes the civilization's knowledge one simultaneous whole. The capability is wondrous and fragile: it deepens dependency (Section 18), raises profound questions Culture must interpret (identity, the meaning of a memory held in two places), and — bound by the Stellar Guard — remains utterly dependent on the user's mind for the metabolic energy the starlight only calibrates. If study stops, the collectors fall to ceremonial stillness and the whole edifice dims into safe dormancy. Legacy and philosophical weight both persist; utopia does not arrive.

**9 — A lighting technology affecting nocturnal ecology.** A district adopts brighter luciferin mains to extend labor hours. Technology emits a **light-pressure** signal; Ecology resolves it (delayed, cumulative): spore-moth migration lines bend away, disturbing the pollination the district's fungal farms quietly relied on. The consequence surfaces as reduced growth the citizens struggle to interpret. A later light-discipline technique — dimmer, directional, fauna-tuned — answers the pressure. Legacy: a cultural memory of the season the moths withdrew, and a lasting lighting philosophy of restraint (Section 21).

**10 — Two regions, one problem, different solutions.** Two settlements of one civilization face the same need — long-distance communication across the dark. One sits on deep, coupled crystal ridges; the other on a vast mycelial mat. Seeded on their differing ecological composition and adoption histories, the first develops resonant crystal signalling; the second develops phononic vibration through the mat. Both are valid, both reproducible, neither universal. When later contact links them, each imports the other's technique unevenly (Section 10), and the civilization ends with a hybrid communication tradition richer than either origin. Legacy: two founding-technique lineages the archive keeps side by side — proof that no two histories, even within one people, need converge.

---

## SECTION 26 — FAILURE MODES AND EDGE CASES

The domain handles the hard cases explicitly, each resolving to a lawful state, never to an exception:

- **No qualified actor for available knowledge** — the technique holds at *conceivable*/*investigable*; nothing precipitates until an actor and pressure coincide. Legitimate stasis, not a bug.
- **A sole inventor's expression lapses** — an unreproduced prototype is lost to active practice; if it was recorded, it becomes rediscoverable, if not, it becomes a rumor in Memory (owned there).
- **A prototype cannot be reproduced** — it stays a prototype forever unless preconditions change; *unrepeatable discovery* is a real terminal outcome.
- **A technology spreads before its risks are understood** — adoption outruns safety knowledge; the consequence surfaces later as an Ecology/Citizen pressure (Scenario 9).
- **Theory without materials, or materials without theory** — the possibility gradient simply stalls at the missing precondition; each is a different, legible incapacity (Law 9).
- **Infrastructure survives institutional collapse** — standing works with dead maintenance institutions: `V_infra` decays toward failure while `H_tech` holds; salvage and rediscovery remain possible.
- **Automation hides repair knowledge** — the `OPTOGENETIC_CIRCUIT` fragility (Section 9, Scenario 7).
- **Multiple technologies solve one problem** — parallel `H_tech` entries coexist; adoption chooses among them by compatibility, not by a "best" flag.
- **A superior technology is culturally rejected** — Culture's reception vector suppresses adoption though the technique is reproducible; legitimate and common.
- **A harmful technology becomes indispensable** — high dependency plus real benefit; the trade-off is expressed, not resolved away.
- **A useful technology stays regionally isolated** — uneven diffusion never completes; permanent inequality is a valid state.
- **Ancient technology outperforms newer systems in some conditions** — higher-era is not strictly better (Section 1); an old technique may remain optimal in its niche.
- **A cosmic technology threatens continuity** — expressed as dependency and fragility for other domains to weigh; never an auto-catastrophe.
- **The user stops studying for a long time** — the entire practice layer dims uniformly and safely into hibernation; heritage, era, and all recorded technique are preserved exactly; the first ten-minute session relights it (`SIMULATION_SYSTEMS.md` Section 5). **No technological collapse, no lost invention, no punitive decline ever results from an ordinary break.** Persistence is never emotional coercion (`GAME_DESIGN.md` Section 5; `SIMULATION_SYSTEMS.md` Law 6).

---

## SECTION 27 — INVARIANTS

The hard rules of the domain. A proposed technology mechanic that violates any is invalid at birth and is redesigned from the constraint up.

1. **Technology never appears without causal prerequisites** (`SIMULATION_SYSTEMS.md` Law 1). No unlock, no purchase, no gift.
2. **Knowledge is not capability** (Law 9). Understanding, ability, production, maintenance, and universal access are distinct states.
3. **A prototype is not a scalable technology, and invention is not adoption, and adoption is not universal access.**
4. **Infrastructure requires maintenance** and may decay in active practice — never in heritage, and never from user absence.
5. **Technical capability can decline; recorded heritage cannot.** The heritage/practice split (Section 4) is inviolable.
6. **Higher-era technology is not universally superior.** Every significant technology carries trade-offs (Section 1).
7. **Technology cannot bypass ecological consequence** (Section 13); the ecology resolves the outcome.
8. **Citizens remain the actors** who invent, teach, operate, maintain, and experience technology; technology is never a self-acting object (Section 14).
9. **Real-world learning influences possibility, never a currency** (`SIMULATION_SYSTEMS.md` Law 7). The user never spends study and never buys an invention.
10. **No single subject unlocks one fixed branch** (Section 16); cross-domain learning matters.
11. **Different histories yield different valid technological paths** (Section 19); settlements may differ.
12. **Every major technological outcome is causally explainable and reproducible from state; variation is seeded, never random** (Section 24).
13. **The domain adds no new engine event flags**; technological transitions are committed-state observations (`SIMULATION_SYSTEMS.md` Section 12).
14. **Nothing is hot, burned, forged, or daylit**; all light is heatless, all material grown or electroformed, all structures anchored (`NOCTIS_ECOLOGICAL_ENGINE.md`; `GAME_DESIGN.md` Hard Boundaries).
15. **Eternal night materially shapes every technology** (Section 21); advancement deepens the night, never brightens it.
16. **The user never manages technology**: no build menu, no research queue, no assignment, no optimization target (`GAME_DESIGN.md` Section 1; `SIMULATION_SYSTEMS.md` Law 10).
17. **Ordinary user absence never causes technological loss or collapse** (Section 26; `SIMULATION_SYSTEMS.md` Laws 5, 6).

---

## SECTION 28 — TECHNOLOGICAL TRANSITIONS (NO NEW ENGINE FLAGS)

The domain expresses its many changes — prototype completion, first reproduction, standardization, adoption threshold, infrastructure failure, technological loss, rediscovery, decommissioning — as **committed-state domain transitions**, exactly following the precedent of `ECOLOGY_SYSTEM.md` Section 10 and the semantics of `SIMULATION_SYSTEMS.md` Section 12. Each is a deterministic threshold crossing already implied by the state (a stage crossing in the possibility gradient, an `A_adopt` or `V_infra` threshold, a `Θ_redisc` crossing), detected by before/after comparison and observable by rendering and Memory from committed state. **This document adds no new engine event flags**; the four canonical world-event flags remain closed (`ARCHITECTURE.md` Section 6). A technological transition never acts as a reward, never mints value, never modifies state after observation, never becomes an automatic popup, and never bypasses its owning domain. Where a typed transition-record channel is one day wanted for the renderer or Memory, that is an optional Tier-5 enhancement to `ARCHITECTURE.md` Section 6, not an assumption this domain makes.

---

## SECTION 29 — AI GENERATION RULES

Any future technology feature — a domain, a technique class, a transition, an infrastructure model, an era realization — must pass every rule below, *after* clearing the tiered validation of `DOCUMENT_ARCHITECTURE.md`, the experience tests of `GAME_DESIGN.md`, the structural laws and Trope Guard of `ARCHITECTURE.md`, the physics of `SIMULATION_SYSTEMS.md` Section 12, and the ecological and citizen laws of the peer domains. A proposal that fails any rule is rejected and redesigned from the constraint up, never merged with adjustments.

- **Rule 1 — Precipitated, not purchased.** The feature must emerge from causal conditions, never from an unlock, cost, queue, or user choice.
- **Rule 2 — Capability-distinct.** It must respect the possibility gradient; it may not collapse knowledge, prototype, production, maintenance, adoption, and access into one flag.
- **Rule 3 — Citizen-carried.** It must be invented, operated, maintained, and experienced by citizens as character, never by self-acting objects or assigned workers.
- **Rule 4 — Heritage/practice split.** Anything permanent must be heritage; anything that can be lost must be renewable practice; loss must be internal-causal and never absence-driven.
- **Rule 5 — Heatless, night-adapted, anchored.** It must obey the constraint engine absolutely and be shaped by eternal night.
- **Rule 6 — Consequence-emitting, not consequence-resolving.** It must emit typed signals to the owning domains and resolve none of their outcomes itself.
- **Rule 7 — Learning-sourced, never learning-spending.** It must trace to the interpreted learning profile as *possibility*, and must never treat study as a currency or map one subject to one branch.
- **Rule 8 — Deterministic and explainable.** Its variation must be seeded, its outcomes reproducible, and its causes reconstructable.
- **Rule 9 — No management, no spam.** It must require no user administration and must not surface as popups, trees, queues, or dashboards.

---

## SECTION 30 — DEFERRED QUESTIONS

Bound by future documents, under the contracts this file provides:

- **`ERA_PROGRESSION.md`** — the era-transition gating formula and thresholds `Θ_era`; how this domain's `w_era` contribution combines with ecology, citizen, culture, and memory contributions.
- **`LEARNING_INTEGRATION.md`** — the exact interpreted-profile dimensions and their derivation from raw study; the subject taxonomy.
- **`CULTURE_SYSTEM.md`** — the internal model of the cultural-reception vector this domain reads; legitimacy, prestige, and taboo resolution.
- **`ECONOMY_SYSTEM.md`** — how production-capability and demand-pressure signals become allocation and sufficiency, with no market.
- **`MEMORY_SYSTEM.md`** — how technique heritage, ruins, and lost-technique records persist, distort, and surface; the generation of invention monuments and rediscoverable schemas.
- **Implementation phase** — all coefficient values (`Θ_precip`, `η_era`, `μ_maint`, `λ_practice`, `α_adopt`, `Θ_redisc`, `w_era`), each carrying a canon citation, under the calibration constraints of `SIMULATION_SYSTEMS.md` and this file; and the exact seed and selection encoding for `select`.

None of these is resolved here with an arbitrary assumption; each is a clean deferred contract.

---

## SECTION 31 — VALIDATION CHECKLIST

- [x] Does technology emerge through citizens, knowledge, conditions, and institutions? — Sections 1, 7, 14.
- [x] Does the system avoid a generic linear technology tree? — Sections 1, 6 (gradient, not tree).
- [x] Is knowledge clearly separated from practical capability? — Sections 2, 6; Law 9.
- [x] Are invention, reproduction, production, adoption, and normalization distinct? — Section 6.
- [x] Does technology require maintenance? — Sections 11, 20; `V_infra`.
- [x] Can technologies fail, disappear, and be rediscovered? — Sections 8, 20.
- [x] Are ecological consequences unavoidable but resolved by ecology? — Sections 12, 13.
- [x] Does eternal night materially shape development? — Section 21.
- [x] Can different settlements develop different solutions? — Sections 19, 25 (Scenario 10).
- [x] Can user learning influence the system without becoming currency? — Section 16; Law 7.
- [x] Are culture, economy, memory, citizens, ecology, and progression given clean interfaces? — Sections 12–17, 30.
- [x] Does each era represent a changing relationship with knowledge, not a cosmetic tier? — Section 17.
- [x] Are technological inequality and access addressed? — Section 18.
- [x] Are alternative development paths supported? — Section 19.
- [x] Are major outcomes causally explainable? — Section 24; Law 1.
- [x] Does the system stay interesting when progress slows? — Sections 20, 26 (loss, rediscovery, uneven access are content).
- [x] Does it avoid punishing the user for not studying? — Sections 20, 23, 26; Laws 5, 6.
- [x] Does it preserve the calm Study OS experience? — Sections 22, 23.
- [x] Is it compatible with higher-tier canon? — the revised `SIMULATION_SYSTEMS.md` Section 16 and the peer domains, cited throughout.
- [x] Is it concrete enough to guide implementation? — state model, gradient, coefficient families, transitions, and scenarios are directly implementable with Tier 7 values bound.

---

## Closing Validation Statement

Every future technology concept for the Noctis Civilization Module must pass, in order: the Tier 1 test of `VISION.md`, the Tier 2 test of `ART_DIRECTION.md`, the Tier 3 test of `NOCTIS_ECOLOGICAL_ENGINE.md`, the experience tests of `GAME_DESIGN.md`, the structural laws of `ARCHITECTURE.md`, the physics of `SIMULATION_SYSTEMS.md`, the ecological laws of `ECOLOGY_SYSTEM.md`, the citizen laws of `CITIZEN_SYSTEM.md`, and the technology laws of this document. Anything that fails is rejected and redesigned from the constraint up.

Technology in Noctis is possibility precipitated from a studying mind and carried by a living people. Knowledge is not capability. Invention is not adoption. Infrastructure is not permanence. What the civilization can currently do may dim and return; what it once achieved is remembered forever. Different histories build different nights, and every night runs on the user's learning.

The user studies.

The possibility rises.

The Noctae invent, and build, and maintain, and sometimes forget — and, when the light returns, remember how.
