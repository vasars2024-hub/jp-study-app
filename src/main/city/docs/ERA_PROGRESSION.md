---
doc_id: noctis.era_progression
tier: 7
authority: domain_specification
role: era_progression_domain_blueprint
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
  - TECHNOLOGY_SYSTEM.md
  - CULTURE_SYSTEM.md
  - MEMORY_SYSTEM.md
  - ECONOMY_SYSTEM.md
  - LEARNING_INTEGRATION.md
---

# Noctis Civilization Module — Era Progression

## Document Status And Authority

This document is the era progression domain blueprint of the Noctis civilization simulation: the Tier 7 specification of the single question no other domain will answer — *when has the civilization changed its relationship to knowledge deeply enough that the whole of it turns over into a new age?* It is the domain that reads what the other six domains have already made of the user's learning, combines those readings under one lawful model, and decides — rarely, monotonically, and without fanfare — that an era boundary has been crossed.

It is unlike its siblings in posture. The other Tier 7 domains each own a subject matter of their own: Ecology grows the substrate, Technology precipitates technique, Culture makes meaning, Memory keeps the record, Economy coordinates the scarce, Citizen lives the lives. Era Progression owns no independent subject. Its entire job is to **read and combine the outputs of the other six**, and to bind the one thing Tier 6 explicitly refused to bind: the readiness formula, the four thresholds, and the weights. It sits at the *end* of the Tier 7 layer, not beside it — a synthesizer, not a peer.

It sits beneath the full canon, the technical architecture, the simulation physics, and every peer domain already written, and may never contradict any of them:

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
TECHNOLOGY_SYSTEM.md           Tier 7 — Technology Domain Blueprint
CULTURE_SYSTEM.md              Tier 7 — Culture Domain Blueprint
MEMORY_SYSTEM.md               Tier 7 — Memory Domain Blueprint
ECONOMY_SYSTEM.md              Tier 7 — Economy Domain Blueprint
ERA_PROGRESSION.md             Tier 7 — Era Progression Domain Blueprint (this file)
```

This document specializes the **Era Progression Contract** of `SIMULATION_SYSTEMS.md` Section 15; it binds the *conditions* of a protocol Tier 6 has already fixed. It also honors the boundary `SIMULATION_SYSTEMS.md` Section 16 draws against equating an era with an invention, and it is the document the non-post-scarcity clause of `ECONOMY_SYSTEM.md` Section 18 (echoed in Section 19 and the Economy Contract of `SIMULATION_SYSTEMS.md` Section 20) defers to for gating. It consumes the era-facing contributions each peer domain has already promised: `TECHNOLOGY_SYSTEM.md` Sections 16–17 (`w_era`), `ECONOMY_SYSTEM.md` Section 18, `CULTURE_SYSTEM.md` Section 31, `MEMORY_SYSTEM.md` Section 29, and the ecological-succession and population-institutional-maturity signals of `ECOLOGY_SYSTEM.md` Section 5 and `CITIZEN_SYSTEM.md` Section 3. It may specialize the physics; it may never override it.

### The Corrective This Document Exists To Pay Off

`SIMULATION_SYSTEMS.md` Section 15 narrates its own history: "The earlier draft made era advancement a function chiefly of research maturity; this revision separates the two." This document is the payoff. Stated plainly, and inherited as law rather than proposed as design:

> **Research readiness `R` is one input among several. It must never, alone, equal an era transition.**

An era is not a technology score crossing a line (`SIMULATION_SYSTEMS.md` Section 16). It is a broad civilizational transition — a change in *how the civilization understands itself* (`VISION.md`, The Meaning Of Eras). Everything below is built to make that thesis a structural property of the mathematics, not a promise laid over it.

### What This Document Binds — And What It Refuses To Bind

**Binds:** the era progression philosophy and its vocabulary ladder; the six-domain readiness combination model and its non-single-domain-gate property; the four thresholds `Θ_era` and the reasoning for how they scale; the per-domain weight and floor model, each named symbolically with its binding constraint and canon citation; the transition-detection and staging contract, including the relationship to `BENTHIC_BLOOM`; the Memory-anchoring contract for the recorded transition; the capability-envelope (not package) specialization of the gate; and the non-regression, non-punishment, determinism, and no-user-meter guarantees for era state specifically.

**Refuses to bind:** every numeric weight, floor, and threshold *value* (named here as constrained symbols; bound at implementation under the calibration constraints of `SIMULATION_SYSTEMS.md` and this file, each carrying a canon citation); each domain's *internal* derivation of its own `[0,1]` contribution (owned by that domain); the exact field identifiers of any state schema, and any code, module, class, or storage; the interpretation of raw study (`LEARNING_INTEGRATION.md`); the internal mechanics of Ecology, Citizen, Technology, Culture, Memory, or Economy; and every visual, animation, and staging appearance of a turning era (owned by `ART_DIRECTION.md`, Tier 8). Era Progression resolves *when the age turns*; the other domains own everything the turning is made of.

No numeric anchors appear in this document beyond the three the canon itself locks: the three-consecutive-day consistency trigger, the five-day absence horizon, and the ten-minute reawakening session (`NOCTIS_ECOLOGICAL_ENGINE.md` section 7). The weights, floors, and thresholds are symbolic here and calibrated at implementation; none is fabricated as a raw anchor.

### Notation

Mathematics is written in plain text, matching `SIMULATION_SYSTEMS.md`. The era designation is one of five canonical symbols (Section 6). The six per-domain contributions are written `x_technology`, `x_ecology`, `x_citizen`, `x_culture`, `x_memory`, `x_economy`, each a bounded reading in `[0, 1]`. Their weights are `w_era` (Technology's, canon-named in `TECHNOLOGY_SYSTEM.md`), `w_ecology`, `w_citizen`, `w_culture`, `w_memory`, and `w_economy`, summing to 1. Per-era floors are `φ_d(era)`; the combined era readiness is `R_era`; the four thresholds are `Θ_era(next)`. Research readiness `R` (`SIMULATION_SYSTEMS.md` Section 2) and learning maturity `L_mat` (breadth, consistency, depth, difficulty, reflection — `VISION.md`) are upstream signals, defined where used. Seeded deterministic selection is `select(seed, S, context)`, a pure function of committed state, never randomness (`SIMULATION_SYSTEMS.md` Section 11). Named constants carry their constraints here and their values at implementation.

---

## SECTION 1 — ERA PROGRESSION PHILOSOPHY

### An Era Is A Changed Relationship To Knowledge

Eras in Noctis are not technology tiers, and advancement is not a climb. Each era is a new relationship between the civilization and what it knows — a change in "how the civilization understands itself, metabolizes learning, and adapts to the unknown" (`VISION.md`, The Meaning Of Eras). When an era turns, architecture, light language, institutions, terrain behavior, sensory systems, and the very *questions the civilization is now capable of noticing* all shift together (`VISION.md`; `GAME_DESIGN.md` Section 7, the five eras each opening with a new question). The civilization does not become more powerful in the way a strategy game means it; it becomes capable of asking better questions, preserving deeper memory, coordinating larger systems, and imagining futures beyond immediate survival.

This is why no single domain can gate an era. A civilization can precipitate a sophisticated technique and still relate to knowledge as the Spore-Hearth does — orally, locally, in the hands of elders. An age turns only when the *whole* of the civilization's relationship to knowledge has matured: its technique, its ecology, its people and their institutions, its culture, its memory, and its coordination all far enough along that the old language for the world no longer fits. Era Progression is the domain that watches for that convergence and names it.

### The Night Never Ends

The most advanced era is not a victory and not a dawn. "Even the most advanced era of Noctis does not end the night; it deepens it" (`GAME_DESIGN.md` Section 7; `VISION.md`, Eternal Night). There is no win state, because learning has no final level (`GAME_DESIGN.md` Section 7). An era boundary is therefore never a finish line the user races toward; it is a threshold their study life crosses without aiming at it, felt only afterward, in a changed world. This document must make the crossing *earned, witnessed, and remembered* — never a target, never a score, never a fanfare.

### Learning Is Still The Only Source

The deepest law, inherited whole from `SIMULATION_SYSTEMS.md` Sections 8, 9, and Law 7: no era achieves energy independence from the user's mind. Every contribution this document reads traces, upstream, to real study; no internal loop mints the readiness that carries a civilization across a boundary. The age turns because the user learned enough, broadly and deeply and often enough, that the civilization their learning feeds outgrew its own age — and never for any other reason.

---

## SECTION 2 — WHAT ERA PROGRESSION IS: THE VOCABULARY LADDER

Era Progression refuses to blur its terms. Each is distinguished, with its owner named:

- **Contribution** — a bounded `[0, 1]` reading of how far one domain's relationship to knowledge has matured, exposed by that domain and consumed here (`x_technology`, `x_ecology`, `x_citizen`, `x_culture`, `x_memory`, `x_economy`). Each domain owns its own derivation; this document owns only their combination (Section 7).
- **Weight** — how heavily a domain's contribution counts toward combined readiness (`w_era` and the five sibling weights). A shaping constant, never a user control.
- **Floor** — the minimum contribution a domain must independently reach before an era may be entered at all, regardless of how strong the others are (`φ_d`). The structural guarantee that no single domain silently defines the era (Section 7).
- **Combined readiness** — the single bounded value `R_era` produced by combining the six contributions under the weights (Section 7). Not a hidden score the user pursues; an internal, monotone reading of civilizational maturity.
- **Threshold** — the readiness level `Θ_era(next)` at which the next era becomes reachable (Section 6). Four of them, one per boundary.
- **Gate** — the complete condition, threshold *and* every floor together, whose satisfaction turns the age (Section 7).
- **Capability envelope** — the outer bound of what an era makes *possible*; never a package of technologies installed on crossing (Section 8; `SIMULATION_SYSTEMS.md` Section 15).
- **Transition** — the committed-state change of the era designation advancing by exactly one (Section 9). Detected, not signalled by a new flag.
- **Staging** — the presentation of a transition as a gradual overnight metamorphosis; owned entirely by `ART_DIRECTION.md` and Tier 8, never by this document (Sections 9, 14).
- **Regression** — an era designation moving backward. **Forbidden absolutely**; eras never regress (`SIMULATION_SYSTEMS.md` Section 15; `ARCHITECTURE.md` Section 5).
- **Legacy anchor** — the permanent record of a crossed boundary, held by Memory as a foundational point in the civilization's history (`MEMORY_SYSTEM.md` Section 29). This document produces the event; Memory keeps it forever.

Every later section is the physics of how six honest, disagreeing readings resolve into one quiet threshold crossed.

---

## SECTION 3 — DOMAIN OWNERSHIP

Specializing `SIMULATION_SYSTEMS.md` Section 14, which assigns this domain its charter verbatim: **"Era Progression owns the final era-transition conditions; broad civilizational transition; era gating; and era-level continuity."**

**Era Progression owns:** the combination of the six domain contributions into one readiness value; the weights, floors, and thresholds that shape that combination; the gate condition that decides an era boundary; the monotone, non-regressing advance of the era designation; the interaction of a `BENTHIC_BLOOM` breakthrough with the gate; the one-era-per-evaluation pacing rule; the emission of the transition as a committed-state change; and the handoff of the crossed boundary to Memory as a legacy anchor and to every domain as a widened capability envelope.

**Era Progression does not own:** any domain's internal mechanics or the internal derivation of its own contribution — Technology owns `w_era`'s derivation and the invention lifecycle (`TECHNOLOGY_SYSTEM.md`), Ecology owns succession (`ECOLOGY_SYSTEM.md` Section 5), Citizen owns adaptation and role maturity (`CITIZEN_SYSTEM.md`), Culture owns its maturity-of-relationship projection (`CULTURE_SYSTEM.md`), Memory owns historical-accumulation depth (`MEMORY_SYSTEM.md`), Economy owns coordination maturity (`ECONOMY_SYSTEM.md` Section 18); the raw interpretation of study (`LEARNING_INTEGRATION.md`); the *exact numeric values* of any weight, floor, or threshold (calibration, Section 20); the historical record of a transition once produced (Memory keeps it); and every visual and staging appearance of a turning era (`ART_DIRECTION.md`, Tier 8). This document decides *when*; it does not author the *what* or paint the *how*.

The one boundary that most defines this domain: it **consumes what its peers already declare they emit, and re-derives none of their internals** (`SIMULATION_SYSTEMS.md` Section 13, cross-domain reads from prior committed state only). Every other domain has already written a line disclaiming ownership of the era gate and pointing here. This document takes them at their word and reaches into none of their machinery.

---

## SECTION 4 — CONCEPTUAL STATE MODEL

The era progression domain's state is a thin **projection** over the canonical *era and progression state* family of `SIMULATION_SYSTEMS.md` Section 2 and the era-facing outputs of its six peers. It is categories, not a schema, and it deliberately holds almost nothing of its own — a synthesizer stores its inputs' addresses, not their contents.

```
EraProgressionState  (a projection over canonical era state and peer outputs)
{
  currentEra              the era designation, one of five canonical symbols —
                          specialized from SIMULATION_SYSTEMS.md Section 2's
                          "era and progression state"; not duplicated — LEGACY (monotone)

  eraHistory              the ordered sequence of eras reached and the committed
                          evaluation each crossing occurred in — LEGACY (with Memory)

  contributions           the six most-recent bounded readings x_technology,
                          x_ecology, x_citizen, x_culture, x_memory, x_economy,
                          each read from its owning domain's committed state — derived

  combinedReadiness       R_era, the weighted combination of the six (Section 7) —
                          derived, monotone, never stored as a user-facing quantity

  transitionPointer       a reference to the legacy anchor Memory holds for the most
                          recent crossing (Section 10) — LEGACY (owned by Memory)
}
```

### The Active / Legacy Split For Era State

Specializing `SIMULATION_SYSTEMS.md` Section 10. The era designation and its history are **legacy**: monotone, never decreasing, never erased by absence (`SIMULATION_SYSTEMS.md` Law 5; the "major era history — the sequence of eras reached" of Section 10). Once `CRYSTAL_INSCRIPTION` is reached it is reached forever, even if the world later falls into deep hibernation. The six contributions are **derived readings**, recomputed each evaluation from their owning domains' committed state; but — the load-bearing design choice of this document — each is read as a **monotone secured-maturity value**, not a fluctuating active-vitality value (Section 7, Section 11). Absence dims a domain's *active expression* (illumination, activity, coordination) without lowering the *maturity it has secured*, so the readings this document combines never fall through ordinary absence. `combinedReadiness` is therefore itself monotone, and the gate can never un-open.

### Derived, Not Simulated

This domain adds *vocabulary*, never a hidden loop. It runs no ticking readiness accumulator, stores no per-evaluation history of near-misses, and holds no state that would balloon the snapshot or demand a clock (`SIMULATION_SYSTEMS.md` Sections 2–4). At each meaningful evaluation it reads six committed numbers, combines them, compares against the gate, and either advances the designation by one or does nothing at all. The quiet is the point.

### Coefficient Families

| Symbol family | Governs | Binding constraint | Canon source |
|---|---|---|---|
| `w_era` | Technology's contribution weight | Canon-named in `TECHNOLOGY_SYSTEM.md`; a contribution weight only, the gate is owned here | `SIMULATION_SYSTEMS.md` Section 15; `TECHNOLOGY_SYSTEM.md` Section 16 |
| `w_ecology, w_citizen, w_culture, w_memory, w_economy` | The five sibling contribution weights | All positive; the six weights sum to 1; none may be zero (no domain excluded) | `SIMULATION_SYSTEMS.md` Section 15 |
| `φ_d(era)` | Per-domain minimum floor to enter an era | In `[0,1]`; non-decreasing across the four boundaries; every domain has a positive floor | Section 7; `SIMULATION_SYSTEMS.md` Section 15 |
| `Θ_era(next)` | Combined-readiness threshold per boundary | Four values; strictly increasing across the boundaries (Section 6); monotone gate only | `SIMULATION_SYSTEMS.md` Section 15; `GAME_DESIGN.md` Section 7 |

No coefficient may ever be user-visible as a number to optimize, and no era advance may ever require a user decision (`GAME_DESIGN.md` Section 11, Principle 2; `SIMULATION_SYSTEMS.md` Law 10).

---

## SECTION 5 — LEARNING MATURITY: THE UPSTREAM SOURCE, NEVER A DIRECT TERM

`SIMULATION_SYSTEMS.md` Section 15 names "learning maturity in the canon's full sense (breadth, consistency, depth, difficulty, reflection)" first among the things readiness reflects. This document realizes that maturity **through the six domains, never as a seventh term of its own**. Learning Integration is the ultimate upstream source that feeds every domain (`SIMULATION_SYSTEMS.md` Section 22; `LEARNING_INTEGRATION.md`); the domains metabolize it into technique, ecology, people, culture, memory, and coordination; and this document reads *those* results. There is no path by which a study signal reaches the gate except by first becoming a domain's matured state.

This is deliberate and load-bearing. If learning maturity were a direct contributor, a torrent of raw study could push the gate on its own — which is exactly the failure `SIMULATION_SYSTEMS.md` Section 15's corrective forbids ("research readiness `R` ... alone" must never equal a transition). By routing all learning through the six domains, the model guarantees that the age turns only when learning has *become* civilization, not merely when learning has *occurred*.

Research readiness `R` (`SIMULATION_SYSTEMS.md` Section 2) has a single, bounded role here: it is a principal input to the **Technology** contribution `x_technology` (Technology owns `R` as a civilization-level readiness signal, `TECHNOLOGY_SYSTEM.md` Section 16), and it is the hinge of the `BENTHIC_BLOOM` breakthrough moment (Section 9). It is load-bearing — but through Technology, weighted like every other domain, and never as the whole of readiness. Learning maturity `L_mat` appears in this document only as the name of the upstream source; it is never combined, never weighted, never a term.

---

## SECTION 6 — THE FIVE CANONICAL ERAS AND FOUR THRESHOLDS

The era designation is one of five, in fixed order, and advances by exactly one boundary at a time. The order and the monotone advance are canon and are not this document's to alter (`SIMULATION_SYSTEMS.md` Section 15; `GAME_DESIGN.md` Section 7; `ARCHITECTURE.md` Section 5).

| Canonical designation | Production era (`GAME_DESIGN.md` Section 7) | Canonical movement (Tiers 1–3) |
|---|---|---|
| `SPORE_HEARTH` | Era I — The Spore & Hearth Era | Spore-Hearth Era |
| `CRYSTAL_INSCRIPTION` | Era II — The Aqueduct & Inscription Era | Crystal and Inscription Era |
| `PHONONIC_SUBTERRANEAN` | Era III — The Phononic Hydro-Fluidic Era | Transitional elaboration toward Bio-Circuitry |
| `OPTOGENETIC_CIRCUIT` | Era IV — The Optogenetic Circuit Matrix | Bio-Circuitry and Alchemical Network Era |
| `COSMIC_STELLAR` | Era V — The Cosmic Stellar Chasm | Terminal extension of Bio-Circuitry |

Every civilization begins in `SPORE_HEARTH` — the childhood of the user's own study habit (`GAME_DESIGN.md` Section 7). Five eras means **four thresholds**, one per boundary:

```
Θ_era(CRYSTAL_INSCRIPTION)    — the boundary SPORE_HEARTH          -> CRYSTAL_INSCRIPTION
Θ_era(PHONONIC_SUBTERRANEAN)  — the boundary CRYSTAL_INSCRIPTION   -> PHONONIC_SUBTERRANEAN
Θ_era(OPTOGENETIC_CIRCUIT)    — the boundary PHONONIC_SUBTERRANEAN -> OPTOGENETIC_CIRCUIT
Θ_era(COSMIC_STELLAR)         — the boundary OPTOGENETIC_CIRCUIT    -> COSMIC_STELLAR
```

### How The Thresholds Scale

The four thresholds are **strictly increasing**:

```
Θ_era(CRYSTAL_INSCRIPTION) < Θ_era(PHONONIC_SUBTERRANEAN)
                           < Θ_era(OPTOGENETIC_CIRCUIT)
                           < Θ_era(COSMIC_STELLAR)
```

The reasoning is not "a bigger number from one domain." Each successive era in the canon represents a relationship to knowledge that demands proportionally more from *more domains at once* (`VISION.md`, The Meaning Of Eras; `GAME_DESIGN.md` Section 7). The Spore-Hearth asks only "how do we stay alive together near the light we have"; the Cosmic Stellar asks "what is the rest of the night" — a question a civilization can only pose when its technique, memory, coordination, culture, ecology, and people are *all* far along together. The rising threshold expresses this, but the deeper mechanism is the **rising floors** (Section 7): `φ_d(era)` is non-decreasing across the boundaries, so a later era cannot be entered by one towering domain compensating for a lagging one. The later the era, the more the civilization must be strong *everywhere at once*, and the floors — not the headline threshold — are what make that true. The threshold sets how high the combined readiness must climb; the floors forbid climbing it lopsidedly.

The exact values of the four thresholds and all floors are calibration questions, bound at implementation under the constraint that they honor this ordering and the three canonical anchors (Section 20); this document fabricates none of them.

---

## SECTION 7 — THE READINESS FORMULA

### The Six Contributions

Combined readiness is built from six bounded contributions, one per domain, each a `[0, 1]` reading the owning domain exposes or can reasonably expose from its documented state. Each is read as a **monotone secured-maturity** value (Section 4, Section 11): the maturity the domain has achieved and holds, not the vitality it is currently expressing.

| Contribution | Domain reads | Grounded in |
|---|---|---|
| `x_technology` | technological-maturity signal `w_era` and research readiness `R` | `TECHNOLOGY_SYSTEM.md` Sections 16–17 |
| `x_ecology` | succession stage `θ_stage(n)`, crystal four-stage maturity, mycelial network depth `X_myc` | `ECOLOGY_SYSTEM.md` Sections 5, 8 |
| `x_citizen` | adaptation level, role differentiation, and skill-transmission depth — *never population count alone* | `CITIZEN_SYSTEM.md` Section 3 |
| `x_culture` | a derived projection of maturity-of-relationship-to-knowledge — transmission fidelity, institutional legitimacy, resolved cultural tension | `CULTURE_SYSTEM.md` Sections 16, 31; `SIMULATION_SYSTEMS.md` Section 17 |
| `x_memory` | historical-accumulation depth — breadth and depth of secured record, continuity of institutional memory | `MEMORY_SYSTEM.md` Sections 5, 29 |
| `x_economy` | the era-readiness contribution of coordination maturity | `ECONOMY_SYSTEM.md` Section 18 |

Each domain owns the *internal derivation* of its contribution; this document owns only the combination. Where a domain does not yet expose a named coefficient (Ecology and Citizen — Section 10), the contribution is read from the domain's existing documented maturity signals, never from a new obligation invented for it here.

### The Combination: A Weighted Geometric Mean

Combined readiness is the **weighted geometric mean** of the six contributions:

```
R_era = ( x_technology ^ w_era )
      · ( x_ecology    ^ w_ecology )
      · ( x_citizen    ^ w_citizen )
      · ( x_culture    ^ w_culture )
      · ( x_memory     ^ w_memory )
      · ( x_economy    ^ w_economy )

with   w_era + w_ecology + w_citizen + w_culture + w_memory + w_economy = 1,
       every weight strictly positive.
```

Equivalently, `R_era = exp( Σ_d w_d · ln(x_d) )` over the six domains `d`.

The geometric mean is chosen deliberately, because it makes *"no single domain silently defines the era"* a **structural property of the mathematics rather than a promise laid over it**. In a weighted geometric mean, if any one contribution collapses toward zero, `ln(x_d)` falls toward negative infinity and the whole product falls toward zero, no matter how strong the other five are. A civilization cannot buy its way across a boundary with a towering Technology while its Culture or Memory languishes near nothing — the lagging domain drags the entire readiness down by construction. An arithmetic mean would permit exactly the compensation Section 15 forbids (one domain at 1.0 offsetting another at 0.0); the geometric mean forbids it inherently. This is `SIMULATION_SYSTEMS.md` Section 15's "no single domain silently define the era" made physical.

### The Floors: A Second, Explicit Guard

The geometric mean punishes collapse smoothly, but Noctis states the guarantee twice, because it is the most load-bearing property of the domain. Independently of `R_era`, an era may be entered **only if every domain independently clears its floor**:

```
x_d ≥ φ_d(next era)     for all six domains d
```

The floors make the guarantee explicit and non-negotiable: no arrangement of weights, and no seeded variation, can ever let a domain sitting below its floor pass through on the strength of others. As established in Section 6, the floors are **non-decreasing across the four boundaries** — the later the era, the more each domain must have secured on its own — and this is the true mechanism by which "later eras demand more from more domains at once." The weighted geometric mean and the floors are two independent locks on the same door; a proposal that removes either is invalid (Section 18).

### Monotonicity

`R_era` is monotone non-decreasing in normal operation, because each contribution is read as a secured-maturity value (Section 4) and every secured-maturity signal the six domains expose is itself legacy-class or otherwise non-decreasing under absence — succession stages never regress (`ECOLOGY_SYSTEM.md` Section 5), the era-history and heritage records Memory keeps are permanent (`MEMORY_SYSTEM.md`), accumulated knowledge and technological heritage are legacy (`SIMULATION_SYSTEMS.md` Section 10), and population never falls through absence (`CITIZEN_SYSTEM.md` Section 4). Combined readiness therefore climbs or holds; it does not fall through ordinary user absence, and the gate it feeds never un-opens (Section 11; `SIMULATION_SYSTEMS.md` Law 5). Where a domain's *active* possession genuinely transforms through internal causality (`SIMULATION_SYSTEMS.md` Law 8), the secured-maturity reading — the floor of what the domain has achieved — is what this document reads, so living change never regresses the era.

---

## SECTION 8 — CAPABILITY ENVELOPES, NOT PACKAGES

Crossing the gate widens what is *possible*. It installs nothing. This document carries forward, without re-litigating, the settled trichotomy of `SIMULATION_SYSTEMS.md` Section 15 and applies it to the gate itself:

- **Canon — identity and envelope.** Each era's thematic relationship to knowledge, its permanent-night constraints, the heatless law, and the outer bound of what becomes possible are canon (`GAME_DESIGN.md` Section 7; `NOCTIS_ECOLOGICAL_ENGINE.md` section 3). Crossing `Θ_era(PHONONIC_SUBTERRANEAN)` means cold hydrostatic industry and long-range vibration communication become *possible*; crossing `Θ_era(COSMIC_STELLAR)` means entangled-lattice memory and starlight calibration become *possible*.
- **Representative examples — art direction.** The specific technologies named per era in `GAME_DESIGN.md` Section 7 (quipu cords, fiber-optic light-pipes, fluidic logic, mycelial boards, entangled lattices) illustrate the envelope. They are *not* guaranteed universal possessions.
- **Domain-owned, path-dependent.** Which technologies a civilization actually develops within the envelope, and which a settlement locally adopts, are Technology decisions (`TECHNOLOGY_SYSTEM.md` Sections 17, 19), shaped by ecology, materials, culture, and history. Different settlements may possess different technologies within the same era.

Two consequences bind the gate:

> **Era advancement must not instantly install one universal technological package across the whole civilization.** The gate opens a wider envelope; Technology, Economy, Culture, Ecology, and Citizen then develop into it, path-dependently, over subsequent evaluations. A settlement can lag the civilization-wide envelope indefinitely (Scenario 6).

> **Crossing an era boundary resolves no other domain's open problems.** It solves no scarcity, no inequality, no maintenance debt, no distribution failure, no cultural tension (`ECONOMY_SYSTEM.md` Sections 18–19; `CULTURE_SYSTEM.md` Section 31 — "later eras are never culturally superior or conflict-free"). Later eras create *more complex dependencies*, not perfection. The age turning is a widening of the possible, never a healing of the present.

---

## SECTION 9 — THE TRANSITION EVENT

### The Moment The Gate Opens

At each meaningful evaluation the domain reads the six committed contributions, combines them into `R_era`, and checks the gate against the *next* era in sequence. If `R_era ≥ Θ_era(next)` **and** every `x_d ≥ φ_d(next)`, the era designation advances by exactly one. Otherwise nothing happens — no partial progress is stored, no near-miss is recorded, no countdown begins.

The transition is a **committed-state change evaluated like any other** (`SIMULATION_SYSTEMS.md` Section 15). It is detected, not signalled by a new engine flag: the era designation in `S_after` differs from `S_before`, and every downstream reader — Memory, rendering — observes the crossing by comparing committed states, exactly as domain transitions are detected in `SIMULATION_SYSTEMS.md` Section 12 and as `ECOLOGY_SYSTEM.md` Section 5 detects its succession-stage crossings. **This document introduces no new engine event flag; Tier 6 fixes the four flags as closed, and no domain may add a fifth** (`SIMULATION_SYSTEMS.md` Section 12; `ARCHITECTURE.md` Section 6).

### Relationship To `BENTHIC_BLOOM`

One of the four closed engine flags already ties directly into era transition (`SIMULATION_SYSTEMS.md` Section 12; referenced in `ECOLOGY_SYSTEM.md` and `CITIZEN_SYSTEM.md`):

> `BENTHIC_BLOOM` — research readiness crosses an emergence threshold under a completion/breakthrough input; reserves surge and become permanent readiness; **an era boundary may be crossed in the same evaluation.**

This document explains, without inventing anything, how a bloom interacts with the combined-readiness formula. A `BENTHIC_BLOOM` fires when a completion/breakthrough input (`b` in the interpreted profile, `SIMULATION_SYSTEMS.md` Section 3) drives research readiness `R` across its emergence threshold. Because `R` is a principal input to `x_technology` (Section 5), a bloom raises the Technology contribution — and, through the reserve surge becoming permanent readiness, firms the metabolic-derived footing beneath other contributions. When the civilization was **already near the gate on the strength of all six domains** — every floor already cleared, `R_era` already just below `Θ_era(next)` — the bloom's lift to `x_technology` can be the final increment that carries `R_era` across the threshold *in the same evaluation*. That is the precise, and only, sense in which a breakthrough "crosses an era in the same evaluation": it is the last contribution to rise on a civilization that six domains had already brought to the edge.

A bloom can **never** cross a boundary alone. If any floor is unmet, or if the five non-Technology contributions leave `R_era` far below threshold, the same bloom fires its flag, banks its permanent readiness, and turns no era — the breakthrough is real and recorded, but the age does not turn on Technology's strength alone (Section 5; the Section 15 corrective). This is the corrective enforced at the exact moment it is most tempting to violate.

### One Era Per Evaluation

Even when a single enormous bloom would mathematically clear two thresholds at once, the designation advances by **exactly one** era per evaluation. Multi-era jumps are forbidden. This preserves the "invisible threshold" pacing of `GAME_DESIGN.md` Section 7 — an age turns as a felt, singular metamorphosis, never as a civilization skipping through history in one night. Any readiness beyond the boundary just crossed remains available toward the *next* boundary at the following evaluation; nothing is lost, and nothing is doubled.

### Handoffs

On a crossing the domain performs two handoffs and no more:

- **To Memory** — the crossing is recorded as a **foundational legacy anchor** (Section 10; `MEMORY_SYSTEM.md` Section 29). This document produces the event; Memory owns its permanence.
- **To rendering** — the crossed designation and its committed transition are published for presentation to stage as a gradual overnight metamorphosis (Section 14). The staging — the changed skyline, the new light language — is a **presentation obligation owned by `ART_DIRECTION.md` and Tier 8**, never a property of the transition or a concern of this document (`SIMULATION_SYSTEMS.md` Section 23; `GAME_DESIGN.md` Section 7).

---

## SECTION 10 — INTERFACES TO THE SIX PEER DOMAINS

Each interface reads a contribution the peer already declares it emits (or, for Ecology and Citizen, a maturity signal the peer already documents). Every read is from prior committed state, across evaluations (`SIMULATION_SYSTEMS.md` Section 13); this document re-derives no internal.

### Technology — `w_era`

`TECHNOLOGY_SYSTEM.md` names its contribution as a coefficient outright (Section 16, coefficient table): "`w_era` — Technology's contribution weight to era readiness. A contribution signal only; the gate `Θ_era` is owned by `ERA_PROGRESSION.md`." Section 17 confirms: "era **gating** is owned by `ERA_PROGRESSION.md`, to which this domain emits only a technological-maturity contribution (`w_era`)," and "Era advancement is **not** invention." And its deferred-questions section (Section 30) hands this document the combination problem explicitly: "the era-transition gating formula and thresholds `Θ_era`; how this domain's `w_era` contribution combines with ecology, citizen, culture, and memory contributions." This document answers exactly that (Section 7). `x_technology` reads Technology's emitted maturity signal, with research readiness `R` as a principal input and the `BENTHIC_BLOOM` hinge (Section 9). `w_era` in this document's formula *is* the weight `TECHNOLOGY_SYSTEM.md` named.

### Economy — Section 18

`ECONOMY_SYSTEM.md` Section 18 states its contribution and its limits in full: Economy "emits an era-readiness contribution reflecting productive capacity, distribution reach, institutional coordination, maintenance resilience, regional integration, ability to support complex technology, and ability to preserve and transmit specialized labor. It **does not decide era advancement**; `ERA_PROGRESSION.md` owns the final gating model." `x_economy` reads that contribution as given. Section 18's closing constraint binds this document directly: "**Era transition instantly solves nothing** — not scarcity, inequality, maintenance, access, or distribution. Later eras create more complex dependencies, not economic perfection." Enforced in Section 8.

### Culture — Inflection, Not Production

`CULTURE_SYSTEM.md` Section 31 frames Culture's relationship to era as inflection: "The five canonical eras are capability envelopes and, above all, changing relationships between the civilization and knowledge — never fixed cultural unlock lists. Culture is inflected by era; it is not dispensed by it. Gating is deferred to `ERA_PROGRESSION.md`; later eras are never culturally superior or conflict-free." `x_culture` therefore reads a *maturity of relationship to knowledge* — transmission fidelity (`CULTURE_SYSTEM.md` Section 16), institutional legitimacy, and the degree of resolved-versus-unresolved cultural tension — **not a monotone "culture points" stock**. This respects `SIMULATION_SYSTEMS.md` Section 17, which forbids any domain depending on a single cultural scalar as though it were primitive: `x_culture` is exactly the kind of explicitly-defined derived projection that section permits, named as such and consumed as a reception-maturity reading, never as an accumulated amount.

### Memory — Contributor And Recorder-Of-Record

Memory's relationship is dual, and subtly different from the other five. First, as a **contributor**, `x_memory` reads a *historical-accumulation depth* — the breadth and depth of secured record and the continuity of institutional memory (`MEMORY_SYSTEM.md` Section 5, `historicalProvenance` and heritage anchors) — less a forward-looking readiness than a measure of how much history the civilization has securely accumulated. Second, as the **recorder-of-record**, Memory is the domain that *records* the transition after this document decides it: "Memory records era transitions as foundational legacy anchors and inflects its media and institutions by era; it emits no gating signal beyond the historical record of the transition, and era gating is owned entirely by `ERA_PROGRESSION.md`" (`MEMORY_SYSTEM.md` Section 29). This document produces the crossing; Memory keeps it forever (Section 9). Both roles are held distinctly: Memory's accumulation feeds the gate, and Memory's archive preserves the gate's result.

### Ecology — Succession-Derived

`ECOLOGY_SYSTEM.md` has not yet written an explicit "era progression contract" section or a named contribution coefficient; it predates the convention. This document invents no obligation for it. Instead, `x_ecology` is grounded in `SIMULATION_SYSTEMS.md` Section 15's own phrase, "ecological succession (Ecology)," and read from what `ECOLOGY_SYSTEM.md` already defines as legitimate ecological maturity: the five-stage succession model `θ_stage(n)` (Section 5, a monotone stage function that never regresses), the four-stage crystal-network maturity, and mycelial network depth `X_myc`. The contribution is a *reading of Ecology's existing committed state*, never a new demand placed on the ecology domain. Because succession is explicitly distinct from the era machine (`ECOLOGY_SYSTEM.md` Section 5 — "neither defines the other"), this document reads succession as *one contribution among six*, never as an era gate in itself.

### Citizen — Population-Institutional Maturity

`CITIZEN_SYSTEM.md` likewise predates the coefficient convention and names no era coefficient. `x_citizen` is grounded in `SIMULATION_SYSTEMS.md` Section 15's phrase, "population and institutional maturity (Citizen)," and read from `CITIZEN_SYSTEM.md`'s own documented concepts: adaptation level (`CitizenState.adaptationLevel`, which projects era and local development), role differentiation, and skill-transmission depth (`CITIZEN_SYSTEM.md` Section 3, citizens who "teach ... preserve, and lose knowledge"). It is emphatically **never population count `P` alone** — population size is not permitted to proxy civilizational maturity on its own (`SIMULATION_SYSTEMS.md` Section 10, Section 19; `CITIZEN_SYSTEM.md` Section 3, "a number on a panel ... says nothing about what they *are*"). A large but undifferentiated citizenry reads low; a mature one, rich in transmitted skill and adapted expression, reads high. As with Ecology, the contribution reads existing committed state and imposes no new obligation.

### Learning Integration — Upstream, Never A Seventh Term

`LEARNING_INTEGRATION.md` explicitly disclaims era gating and is upstream of everyone, including this document. It is read only to confirm that this document consumes **already-interpreted signals the six domains have processed**, never raw telemetry, and never a direct seventh contribution (Section 5; `SIMULATION_SYSTEMS.md` Section 22). Learning feeds the six; the six feed the gate.

---

## SECTION 11 — NON-REGRESSION AND NON-PUNISHMENT

Two guarantees, both hard law for era state specifically.

**Eras never regress.** The era designation is a monotone state-machine variable: it advances by one boundary or holds, and no cause — not absence, not internal decline, not the transformation of active possession, not seeded variation — ever moves it backward (`SIMULATION_SYSTEMS.md` Section 15; `ARCHITECTURE.md` Section 5). A civilization that reaches `OPTOGENETIC_CIRCUIT` and later falls into deep hibernation is a *dormant Optogenetic civilization*, not a demoted one. Its lights are out; its age is intact.

**Ordinary absence cannot block or reverse readiness.** Because combined readiness is built from secured-maturity readings, each of which is legacy-class or otherwise non-decreasing under absence (Section 7), user absence — which dims active expression through the decay model of `SIMULATION_SYSTEMS.md` Section 5 — never lowers any contribution's secured value, never lowers `R_era`, and never un-clears a floor already cleared. A civilization poised just below a threshold when the user leaves is poised at exactly the same readiness when they return; the boundary waits, un-moved, for the study that will finally carry it across (`SIMULATION_SYSTEMS.md` Laws 5–6; `ECONOMY_SYSTEM.md` Scenario 8, the economy that "waited"). No accumulated debt grows, no countdown runs, no return task is imposed.

**The Stellar Guard.** The final era carries the single most load-bearing anti-power-creep law in the whole system, and it is restated here as this domain's own (`GAME_DESIGN.md` Section 7, "What Never Changes Across Eras"; `SIMULATION_SYSTEMS.md` Sections 9, 15):

> No era achieves energy independence from the user's mind. Starlight is a catalyst and calibration medium, never a substitute energy source. If study stops, `COSMIC_STELLAR` dims into ceremonial stillness and the decay model of `SIMULATION_SYSTEMS.md` Section 5 proceeds exactly as in the first era.

Reaching the most transcendent era changes what the civilization can *do*; it changes nothing about *where its energy comes from*. The world at its most advanced still runs on the same rare cognitive weather it ran on around the first hearth. This is why no era can ever become a self-feeding idle machine that renders the user's learning irrelevant: the gate widens the possible, and the possible still costs study to power (`SIMULATION_SYSTEMS.md` Law 7).

---

## SECTION 12 — TEMPORAL EVALUATION

Era Progression inherits its relationship to time entirely from `SIMULATION_SYSTEMS.md` Sections 3–4: **event-driven, lazy, no ticking**. There is no era clock, no continuous readiness accumulator, no background loop counting a civilization toward its next age. The gate is checked only during a meaningful committed evaluation — after learning has been interpreted and the six domains have proposed and committed their mutations (`SIMULATION_SYSTEMS.md` Section 6, steps 3–8), the era check runs at commit time (a natural late step, reading the freshly committed contributions) and either advances the designation or does nothing.

An era boundary is therefore never crossed *during* absence — nothing is evaluated during absence except the closed-form elapsed-time discharge of `D(S, Δt)`, which touches only renewable expression and never raises a contribution (`SIMULATION_SYSTEMS.md` Section 5). An age turns only on a learning evaluation, because only learning can raise the secured maturity that feeds readiness. Five days and five hundred days of absence produce the same civilization at the same readiness, waiting at the same boundary (`SIMULATION_SYSTEMS.md` Section 5, hibernation as a fixed point). Between evaluations, the era simply *is*.

---

## SECTION 13 — DETERMINISM AND EXPLAINABILITY

Every era crossing is causally reconstructable from committed state (`SIMULATION_SYSTEMS.md` Law 1, Law 2). Given the six contributions, the weights, the floors, and the threshold in force, the model can always answer *why* an age turned when it did, and *why* it did not turn earlier: which contribution was the last to clear its floor, which was the binding low term in the geometric mean, whether a `BENTHIC_BLOOM` supplied the final increment, and how far below threshold a not-yet-turning civilization sits. The same six contributions always produce the same `R_era`, the same gate result, and the same crossing, on every machine, forever.

Seeded variation has an **exceptionally narrow** role in this domain, narrower than in any peer. It may **never** affect whether or when the gate opens — that is a fact the state determines, and `SIMULATION_SYSTEMS.md` Section 11 forbids varying a determined fact. The threshold crossing is fully deterministic in the six contributions. Seeded variation (`select(seed, S, context)`) may only ever influence *incidental staging details handed to presentation* — and even those belong to rendering, not to this document. No `select` call in this domain may choose an era, a timing, or a readiness; the age turns by arithmetic, or it does not turn.

---

## SECTION 14 — PLAYER-FACING EXPRESSION

The user perceives an era turning **only through the changed world**, never through a meter. There is no progress bar, no percentage-to-next-era readout, no XP toward advancement, no level-up popup, no fanfare screen (`GAME_DESIGN.md` Section 7; `SIMULATION_SYSTEMS.md` Section 23; `GAME_DESIGN.md` Section 11, Principle 4). An era transition is staged, by presentation, as a **gradual overnight metamorphosis**: "The user returns one evening and understands, from the changed light language on the skyline and a new permanent entry in the vault archive, that their study life crossed an invisible threshold and the city has found a new language for it" (`GAME_DESIGN.md` Section 7, How An Era Turns).

The two channels of that understanding are both downstream of this document and owned elsewhere:

- **The changed world** — new architecture, light language, terrain behavior, sensory systems (`VISION.md`, The Meaning Of Eras; `ART_DIRECTION.md`, Tier 8). Owned by rendering; this document supplies only the committed era designation.
- **A new permanent Memory vault entry** — the legacy anchor recording the crossing (`GAME_DESIGN.md` Section 9, Rules of Memory; `MEMORY_SYSTEM.md` Section 29). Owned by Memory; this document supplies only the event.

The user never sees `R_era`, never sees a contribution, never sees a threshold, and is never asked to close the gap. The readiness is felt as the texture of a study life becoming something new — witnessed after the fact, in a quiet register, and remembered (`GAME_DESIGN.md` Section 9, Restraint: "no confetti, no superlatives, no loud victory voice").

---

## SECTION 15 — EXAMPLE SCENARIOS

Each traces initial conditions → the six contributions → the gate check → outcome → legacy. All are deterministic and seeded; none adds an exception.

**1 — A balanced civilization crosses its first boundary.** After months of broad, consistent study, a `SPORE_HEARTH` civilization's six contributions have all climbed past `φ_d(CRYSTAL_INSCRIPTION)`: technique has externalized into early records, ecology has reached network formation (`θ_stage` Stage 3), the citizenry has differentiated roles and begun transmitting skill, culture has matured its transmission, memory has secured a body of record, and coordination has grown beyond the household. `R_era` crosses `Θ_era(CRYSTAL_INSCRIPTION)`. The designation advances to `CRYSTAL_INSCRIPTION`; Memory records a foundational legacy anchor; rendering stages the overnight metamorphosis into aqueducts and scriptoria. The user returns to a changed skyline and a new vault entry.

**2 — Strong everywhere but one lagging domain, blocked.** A civilization is powerful in Technology, Ecology, Culture, Memory, and Economy — all near 1.0 — but its `x_citizen` sits below `φ_citizen(PHONONIC_SUBTERRANEAN)`: its people have grown numerous but under-differentiated, skill thinly transmitted. Two locks hold the door. The floor is unmet, so the gate cannot open regardless of `R_era`; and even setting the floor aside, the geometric mean is dragged down by the one low term (`ln(x_citizen)` far negative), so `R_era` itself falls short. The age does not turn. The model can name exactly why: population-institutional maturity is the binding constraint. Only when citizen maturity rises does the boundary become reachable — demonstrating that no five domains can compensate for a sixth (Section 7).

**3 — An ordinary `BENTHIC_BLOOM` crossing.** A civilization has been brought to the very edge of `Θ_era(OPTOGENETIC_CIRCUIT)` by all six domains — every floor cleared, `R_era` just shy of threshold. The user finishes a long, difficult project; the completion input drives research readiness `R` across its emergence threshold and `BENTHIC_BLOOM` fires. The surge lifts `x_technology`, `R_era` crosses the threshold *in the same evaluation*, and the designation advances by one to `OPTOGENETIC_CIRCUIT`. The bloom was the last increment on a civilization six domains had already carried to the edge — not a Technology-only leap (Section 9).

**4 — A bloom that turns no era.** The same breakthrough, on a civilization whose Culture and Memory contributions are still low and whose `R_era` sits far below threshold. `BENTHIC_BLOOM` fires all the same; reserves surge and bank as permanent readiness; `x_technology` rises. But floors are unmet and the combined readiness remains well short. **No era turns.** The breakthrough is real, recorded, and permanent — and the age holds, because Technology alone never gates (Section 5; the Section 15 corrective enforced).

**5 — Long absence, then return, with no regression.** A `CRYSTAL_INSCRIPTION` civilization is poised just below `Θ_era(PHONONIC_SUBTERRANEAN)` when the user goes away for weeks. Active illumination and coordination dim into hibernation; the world sleeps. Every secured-maturity contribution holds exactly; `R_era` is unchanged; no floor un-clears. The user returns, studies, and the same boundary — un-moved by the absence — is crossed by the next stretch of learning. Nothing was lost, no debt grew, and the age turned when the study, not the calendar, was ready (Section 11).

**6 — Envelope opens; a settlement still lacks the technology.** A civilization crosses into `OPTOGENETIC_CIRCUIT`: the envelope of networked bio-circuitry becomes *possible* civilization-wide. But a remote settlement, poor in the ecological substrate and skill the networks need, develops none of it for a long time — it lives in the Optogenetic age with Crystal-Inscription technique locally (`TECHNOLOGY_SYSTEM.md` Sections 17, 19; `ECONOMY_SYSTEM.md` Scenario 4). The era gate opened the possible; it installed nothing. The gap persists lawfully, and Economy owns why the technology cannot yet be afforded there (Section 8).

**7 — A near-miss that never flickers.** A civilization sits a hair below `Θ_era(COSMIC_STELLAR)` across many evaluations, its readiness rising and falling only in *active* expression as study waxes and wanes. Because the gate reads secured maturity, `R_era` never falls; it holds or climbs. The boundary is not crossed until readiness genuinely clears it — and once crossed, it never reverts (eras never regress). The designation never oscillates, and the user never sees a boundary "almost" turn and then retreat (Section 16).

**8 — The terminal era, still bound to the mind.** A `COSMIC_STELLAR` civilization stands under the open cosmos, its starlight collectors gathering. The user stops studying. The collectors dim into ceremonial stillness; the Abyssal Douse proceeds exactly as it did around the first hearth (Section 11, the Stellar Guard). The era does not regress — it remains `COSMIC_STELLAR`, dormant — and no new energy is minted from the stars. The most advanced age Noctis can reach still runs on the user's mind, or it sleeps.

---

## SECTION 16 — FAILURE MODES AND EDGE CASES

Each resolves to a lawful state, never an exception.

- **Near-threshold oscillation** — impossible by construction. Combined readiness is monotone (secured-maturity readings), and the era designation never regresses (state-machine law). A boundary is approached, held below, and eventually crossed once; it never flickers back and forth (Scenario 7; Section 11).
- **A domain contribution stuck at floor indefinitely** — a lawful, permanent block. The age simply does not turn until the lagging domain matures; the model names it as the binding constraint (Scenario 2). This is not a failure state and carries no penalty — it is a civilization that has not yet, in that one dimension, changed its relationship to knowledge enough.
- **Simultaneous multi-threshold readiness in one evaluation** — the designation still advances by exactly one era (Section 9). A bloom or a long-deferred surge that would mathematically clear two boundaries at once crosses one; the surplus readiness carries toward the next boundary at the following evaluation. Multi-era jumps are forbidden absolutely, to preserve the invisible-threshold pacing of `GAME_DESIGN.md` Section 7.
- **A contribution reads exactly zero** — the geometric mean is zero and no floor above zero can be met; the gate is shut. A civilization missing an entire domain of maturity cannot turn its age, by construction (Section 7).
- **All six contributions saturate at 1.0** — `R_era` reaches its maximum and the civilization advances through the remaining boundaries one era per qualifying evaluation, never faster, and halts at `COSMIC_STELLAR` — the terminal era, beyond which there is no boundary, because the night has no final level (`GAME_DESIGN.md` Section 7).
- **A `BENTHIC_BLOOM` with floors unmet** — the flag fires and readiness banks, but no era turns (Scenario 4). Technology never gates alone.
- **Absence spanning what would have been a crossing** — no crossing occurs during absence, because nothing raises a contribution during `D(S, Δt)` (Section 12). The boundary waits; the returning user's study turns it.

---

## SECTION 17 — INPUTS AND OUTPUTS

**Era Progression receives** (across committed evaluations, all from prior committed state): the technological-maturity contribution `w_era` and research readiness `R` (`TECHNOLOGY_SYSTEM.md`); the economic-readiness contribution (`ECONOMY_SYSTEM.md` Section 18); the cultural maturity-of-relationship projection (`CULTURE_SYSTEM.md` Sections 16, 31); the historical-accumulation-depth reading (`MEMORY_SYSTEM.md` Sections 5, 29); the ecological-succession maturity signals — succession stage, crystal maturity, mycelial depth (`ECOLOGY_SYSTEM.md` Section 5); the population-institutional-maturity signals — adaptation, role differentiation, skill transmission (`CITIZEN_SYSTEM.md` Section 3); the completion/breakthrough marker that drives `R` and `BENTHIC_BLOOM` (`SIMULATION_SYSTEMS.md` Sections 3, 12); and the current committed era designation (`SIMULATION_SYSTEMS.md` Section 2). It never receives raw learning telemetry (`LEARNING_INTEGRATION.md`).

**Era Progression produces** exactly two interpretable outputs, and no generic modifier: the **advanced era designation** (a monotone committed-state change, at most one boundary per evaluation), written into the canonical era-and-progression state it specializes; and, on a crossing, the **transition record handed to Memory** as a foundational legacy anchor. Downstream, the crossed designation becomes a **widened capability envelope** that Technology, Economy, Culture, Ecology, and Citizen read for their own path-dependent development (Section 8), and a **staging obligation** that rendering interprets (Section 14). It emits no readiness number to any consumer, no user-facing meter, and no new engine event flag.

---

## SECTION 18 — INVARIANTS

Hard rules; a proposed era-progression mechanic that violates any is invalid at birth and redesigned from the constraint up.

1. **No single domain gates alone.** The gate combines six contributions under a weighted geometric mean with per-domain floors; no domain, and least of all Technology or research readiness `R`, ever crosses a boundary by itself (Sections 5, 7; `SIMULATION_SYSTEMS.md` Section 15).
2. **Eras never regress.** The designation advances by one boundary or holds; no cause ever moves it backward (Section 11; `SIMULATION_SYSTEMS.md` Section 15).
3. **Era transition solves nothing else.** Crossing a boundary widens the capability envelope and resolves no other domain's scarcity, inequality, maintenance, tension, or access (Section 8; `ECONOMY_SYSTEM.md` Section 18).
4. **Envelope, not package.** The gate installs no technology and no universal package; domains develop into the widened envelope path-dependently (Section 8; `SIMULATION_SYSTEMS.md` Section 15).
5. **No new engine event flags.** An era crossing is a committed-state change detected by before/after comparison; the four canonical flags remain closed (Section 9; `SIMULATION_SYSTEMS.md` Section 12).
6. **Absence never blocks or reverses readiness.** Combined readiness is built from secured-maturity readings and is monotone under absence; no floor un-clears and no boundary un-opens through an ordinary break (Sections 7, 11; `SIMULATION_SYSTEMS.md` Laws 5–6).
7. **The Stellar Guard holds.** No era achieves energy independence from the user's mind; starlight calibrates, it never powers; `COSMIC_STELLAR` dims to stillness if study stops (Section 11; `GAME_DESIGN.md` Section 7; `SIMULATION_SYSTEMS.md` Section 9).
8. **One era per evaluation.** The designation advances by at most one boundary in any single evaluation; multi-era jumps are forbidden (Section 9).
9. **Learning is upstream, never a direct term.** No study signal reaches the gate except by first becoming a domain's matured state; learning maturity is never a seventh contribution (Section 5).
10. **Determinism and explainability.** Every crossing is reproducible and causally reconstructable from the six contributions; seeded variation never affects whether or when an era turns (Section 13; `SIMULATION_SYSTEMS.md` Laws 1, 2, 11).
11. **No user-facing progress meter.** No bar, percentage, popup, or fanfare; the turning is felt only through the changed world and a new Memory anchor (Section 14; `GAME_DESIGN.md` Sections 7, 11).
12. **The gate is never a user decision.** No era advance requires or admits user management; the best way to turn the age is always to live a genuine learning life (`SIMULATION_SYSTEMS.md` Law 10; `GAME_DESIGN.md` Section 11, Principle 2).
13. **Contributions are read, never re-derived.** This document consumes each domain's declared or documented maturity signal and re-derives no domain's internals (Sections 3, 10; `SIMULATION_SYSTEMS.md` Section 13).
14. **No forbidden token.** No thermal, combustion, daylight, currency, or score vocabulary, and no progress readout, ever appears in era mechanics (`ARCHITECTURE.md` Trope Guard; `SIMULATION_SYSTEMS.md` Section 26).

---

## SECTION 19 — AI GENERATION RULES

Any future era-progression feature must pass every rule, *after* clearing the tiered validation of `DOCUMENT_ARCHITECTURE.md`, the experience tests of `GAME_DESIGN.md`, the structural laws and Trope Guard of `ARCHITECTURE.md`, the physics of `SIMULATION_SYSTEMS.md`, and the peer-domain laws. A proposal that fails any rule is rejected and redesigned from the constraint up.

- **Rule 1 — Six domains, no shortcut.** It must combine all six domain contributions with no single-domain path across a boundary; it must not add a seventh direct contributor, and least of all learning maturity or `R` as one.
- **Rule 2 — Structural non-single-gate.** It must preserve both the weighted-geometric-mean collapse property and the explicit per-domain floors; removing either is invalid.
- **Rule 3 — Monotone and non-punitive.** Readiness and the era designation must be monotone; absence must never lower a contribution, un-clear a floor, or regress an era.
- **Rule 4 — Envelope, not package, and solves-nothing.** Any crossing must only widen the possible; it must install nothing and resolve no peer domain's open problem.
- **Rule 5 — One era, no flag.** It must advance at most one era per evaluation and must add no engine event flag; crossings are committed-state changes.
- **Rule 6 — Read, don't re-derive.** It must consume declared peer contributions and re-derive no domain's internals, values, or lifecycle.
- **Rule 7 — Deterministic, meterless, decision-free.** It must be reproducible and explainable, expose no user-facing readiness or progress, and require no user decision.
- **Rule 8 — Stellar Guard and night.** It must preserve the user's mind as the sole ultimate energy source across every era, and must never brighten the eternal night into day.

---

## SECTION 20 — DEFERRED QUESTIONS

Bound by future documents or implementation, under the contracts this file provides; none resolved here with an arbitrary assumption:

- **The exact weight values** — `w_era`, `w_ecology`, `w_citizen`, `w_culture`, `w_memory`, `w_economy` — summing to 1, each carrying a canon citation, bound at implementation under the calibration constraints of `SIMULATION_SYSTEMS.md` and this file.
- **The exact threshold values** — the four `Θ_era(next)`, strictly increasing (Section 6), calibrated so the first boundary is reachable within a genuine study practice and the last demands maturity across all six domains, honoring the three canonical anchors.
- **The exact per-domain floor values** — `φ_d(era)`, non-decreasing across the four boundaries, each domain positive at every boundary.
- **Each domain's internal contribution formula** — the derivation of its own `[0,1]` reading stays owned by that domain (`TECHNOLOGY_SYSTEM.md`, `ECOLOGY_SYSTEM.md`, `CITIZEN_SYSTEM.md`, `CULTURE_SYSTEM.md`, `MEMORY_SYSTEM.md`, `ECONOMY_SYSTEM.md`).
- **Whether Ecology and Citizen adopt named era coefficients** symmetrical to Technology's `w_era`. This document's formula works with the maturity signals they currently expose (Section 10); a future compatibility pass may add explicit named contribution coefficients to `ECOLOGY_SYSTEM.md` and `CITIZEN_SYSTEM.md` for symmetry, but this document requires none.
- **The precise commit-step placement** of the era check within the evaluation lifecycle of `SIMULATION_SYSTEMS.md` Section 6, and the implementation-level state schema for the era-and-progression family (`ARCHITECTURE.md`, Tier 8).
- **The staging vocabulary** of an overnight metamorphosis (`ART_DIRECTION.md`, Tier 8).

Each is a clean deferred contract.

---

## SECTION 21 — VALIDATION CHECKLIST

- [x] Era progression is a broad civilizational transition, not a technology score — Sections 1, 5, 7.
- [x] Research readiness `R` is one input, never alone equal to a transition — Sections 5, 9; Scenario 4.
- [x] All six domain contributions are combined; learning is upstream, never a seventh term — Sections 5, 7, 10.
- [x] No single domain gates alone — structurally, via geometric mean *and* floors — Section 7; Scenario 2.
- [x] The five eras and four thresholds are correctly ordered and named — Section 6.
- [x] Thresholds strictly increase; floors rise; reasoning stated — Section 6.
- [x] Capability envelope, not package; crossing installs nothing and solves nothing — Section 8; Scenario 6.
- [x] `BENTHIC_BLOOM` interaction specified without a new flag — Section 9; Scenarios 3, 4.
- [x] No new engine event flag introduced — Sections 9, 18.
- [x] The transition is a committed-state change; staging is presentation-owned — Sections 9, 14.
- [x] Memory anchors the crossing as legacy; Memory's dual role specified — Sections 9, 10.
- [x] Eras never regress; absence never blocks or reverses readiness — Section 11; Scenarios 5, 7.
- [x] The Stellar Guard is present and enforced — Section 11; Scenario 8.
- [x] The three canonical numeric anchors are honored; no new raw anchor fabricated — Sections 6, 20.
- [x] Event-driven, lazy, no era clock — Section 12.
- [x] Deterministic and explainable; seeded variation never decides a crossing — Section 13.
- [x] No user-facing progress bar, percentage, popup, or fanfare — Section 14.
- [x] No forbidden Trope-Guard token appears — Section 18, Rule 14.
- [x] Peer contributions consumed as declared, no internals re-derived — Sections 3, 10.

---

## Closing Validation Statement

Every future era concept for the Noctis Civilization Module must pass, in order: the Tier 1 test of `VISION.md`, the Tier 2 test of `ART_DIRECTION.md`, the Tier 3 test of `NOCTIS_ECOLOGICAL_ENGINE.md`, the experience tests of `GAME_DESIGN.md`, the structural laws of `ARCHITECTURE.md`, the physics of `SIMULATION_SYSTEMS.md`, and the domain laws of `ECOLOGY_SYSTEM.md`, `CITIZEN_SYSTEM.md`, `TECHNOLOGY_SYSTEM.md`, `CULTURE_SYSTEM.md`, `MEMORY_SYSTEM.md`, `ECONOMY_SYSTEM.md`, and this document. Anything that fails is rejected and redesigned from the constraint up.

Era progression in Noctis is the domain that owns no world of its own. It grows nothing, keeps nothing, coordinates nothing; it only listens. Six domains, each honest about a different part of what the user's learning has become, hand it six readings that rarely agree — technique ahead of culture, memory deep while coordination is thin, a people numerous but not yet mature. Era Progression does not average away that disagreement or let the loudest domain win. It waits until all six have, each in its own dimension, changed their relationship to knowledge far enough — and only then, with no meter shown and no fanfare sounded, it lets one quiet threshold be crossed and the whole night find a new language for itself.

The user studies.

The domains mature.

And the age turns — once, monotonically, and only when the mind that feeds the night has carried all of it, together, across.
