---
doc_id: noctis.citizen_system
tier: 7
authority: domain_specification
role: citizen_domain_blueprint
depends_on:
  - VISION.md
  - ART_DIRECTION.md
  - NOCTIS_ECOLOGICAL_ENGINE.md
  - DOCUMENT_ARCHITECTURE.md
  - GAME_DESIGN.md
  - ARCHITECTURE.md
  - SIMULATION_SYSTEMS.md
  - ECOLOGY_SYSTEM.md
---

# Noctis Civilization Module — Citizen System

## Document Status And Authority

This document is the citizen domain blueprint of the Noctis civilization simulation: the Tier 7 specification of the Noctae — who they are, how they emerge, how they communicate, what roles they express, and how they carry the civilization's memory. It answers one question the whole module leans on: *how does a non-human civilization emerge from accumulated human learning?*

It sits beneath the full canon, the technical architecture, the simulation physics, and the ecological domain, and may never contradict any of them:

```
VISION.md                      Tier 1 — Absolute Conceptual Anchor
ART_DIRECTION.md               Tier 2 — Aesthetic & Spatial Interface
NOCTIS_ECOLOGICAL_ENGINE.md    Tier 3 — Mechanical & Biological Execution
DOCUMENT_ARCHITECTURE.md       Meta  — Structural Guardrail Framework
GAME_DESIGN.md                 Tier 4 — Experience Design
ARCHITECTURE.md                Tier 5 — Technical Architecture
SIMULATION_SYSTEMS.md          Tier 6 — Simulation Physics
ECOLOGY_SYSTEM.md              Tier 7 — Ecological Domain Blueprint
CITIZEN_SYSTEM.md              Tier 7 — Citizen Domain Blueprint (this file)
```

`ECOLOGY_SYSTEM.md` and this document are Tier 7 peers. In the per-evaluation dependency topology of `SIMULATION_SYSTEMS.md` Section 11, the citizen layer sits *downstream* of the ecological layer — population emerges from ecological prosperity — and *upstream* of culture and memory, which read what the Noctae express. This document therefore treats ecology as an input and culture and memory as consumers, and it may specialize citizen behavior only; it may not redefine civilization philosophy.

### The Identity Guardrail

The Noctae are not NPC workers, not controllable units, not a population statistic, and not a management surface. The user does not assign jobs, move citizens, manage families, select professions, optimize population, or collect anything from a citizen. The Noctae are living reflections of civilization growth, biological interpreters of knowledge, and participants in a persistent ecosystem. They respond to the user's learning journey; they are never operated by the user's hand.

### What This Document Binds — And What It Refuses To Bind

**Binds:** the citizen philosophy; the behavioral specialization of the Noctae atop their fixed canon anatomy; the abstract citizen-state projection; the emergence law and its monotone guarantee; the social and communication model; the catalogue of symbolic roles; the mapping from learning to citizen expression; the citizen-side consequences of the four canonical events; the citizen-to-culture and citizen-to-memory edges; the citizen reading of the time model; the citizen validation rules.

**Refuses to bind:** Noctae anatomy, which is fixed by `NOCTIS_ECOLOGICAL_ENGINE.md` Section 1 and only *reused* here, never extended; the population physics values and thresholds (`SIMULATION_SYSTEMS.md` Section 8, bound at implementation, each value carrying a canon citation); the exact field identifiers of any state; the rendering, sprite, motion, and lore-prose behavior through which citizens are shown (property of `ART_DIRECTION.md`, the Tier 8 pipelines, and — for lore capture — `MEMORY_SYSTEM.md`); the deterministic event-flag set, closed at Tier 5/6; any code or type definition. No numeric anchors appear here beyond the three the canon locks: the three-consecutive-day consistency trigger, the five-day absence horizon, and the ten-minute reawakening session.

### Notation

`P` is population count, a non-negative integer that grows through prosperity and is never reduced by user absence (its life cycle, if any, is Citizen-owned — Section 4). `A_P ∈ [0, 1]` is population activity, the renewable expression level of the citizenry. `π` is the ecological prosperity signal that drives growth (`SIMULATION_SYSTEMS.md` Sections 2 and 19). Throughout, an *individual citizen* is not a stored record but a deterministic expression rendered from aggregate state; Section 3 makes this precise.

---

## SECTION 1 — CITIZEN PHILOSOPHY

### Knowledge Becoming Life

The Noctae are not a population statistic. A number on a panel proves that citizens exist; it says nothing about what they *are*. What they are is the most emotionally legible display of accumulated flourishing (`GAME_DESIGN.md` Section 6) — the moment the abstract quantity `P` becomes a specific small life the user can watch cross a mycelial path and pause where the light pools. The Noctae represent knowledge becoming life.

A citizen is learning history made biological. The density of the citizenry, the roles it expresses, the fluency of its signalling, the depth of its inherited memory — all of it is the shape of what the user has studied, digested by the ecology and surfaced as living beings. No citizen is generic, because no learning history is generic; the population that grows around a mathematics-heavy season is not the population that grows around a year of language review.

### They Do Not Know The User Exists

The Noctae do not know the user exists (`VISION.md`, The Noctae; `GAME_DESIGN.md` Section 2). They know only that sometimes the nutrients come rich and steady, that sometimes the moths fly, that sometimes the pressure rises in the rock. They build their culture around these seasons the way coastal peoples build culture around tides — and the user, watching from beyond the glass, understands what the citizens cannot: the tide is them. This asymmetry is the whole emotional engine of the citizen layer. The civilization needs the user absolutely; the user is never needed back. That is why watching the Noctae feels like care rather than command.

---

## SECTION 2 — NOCTAE BIOLOGY INTEGRATION

The Noctae are biologically defined once and only once, in `NOCTIS_ECOLOGICAL_ENGINE.md` Section 1. This document invents no anatomy. It reuses the canonical biology and specializes only *behavior* on top of it. Every citizen trait below is inherited, not introduced:

**Visual system — abyssopelagic.** Oversized crystalline lenses paired with a reflective guanine tapetum lucidum, modeled on the splitfin flashlight fish and deep-sea teleosts. The Noctae cannot perceive a daylight color spectrum; their sight is tuned to high-contrast grayscale and deep-ultraviolet wavebands, catching faint starlight. Standard ambient glare blinds them. Behaviorally, this means citizens orient toward cold, localized light and away from any wash of brightness — the world is read as contrast, not illumination.

**Non-visual sensing — troglobitic.** Cranial lateral-line systems — rows of fluid-filled sensory pits along jawlines, temples, and collarbones, modelled on blind cavefish — detect barometric fluctuation, micro-acoustic vibration, and low-frequency airflow. A citizen feels another approach through air displacement before any visual contact, and feels the barometric pressure of the user's hardest study weeks directly in the rock (Section 8).

**Bioluminescent communication — photophore semaphore.** Subcutaneous photophore organs along limbs and sensory spires, lit by symbiotic chemiluminescent bacteria, are shuttered by muscular skin folds into flashes, douses, and pulses. This is the Noctae language, and it is not vocal: there is no civic speech. The canonical signal register is fixed — a sharp rapid teal pulse means active cognitive focus; a slow undulating low-intensity amber wave means rest; a steady dark-crimson signal is the calm-sign shown under pressure (Section 8; `GAME_DESIGN.md` Section 9).

**Tactile information processing.** The Noctae read by touch: cranial lateral-line pits slide along the raised textures of fiber scrolls and knotted cords. Written memory is felt, never seen as daylight text.

**Environmental adaptation.** Every trait is a dark-adaptation. Nothing about the Noctae assumes surface conditions — no daylight vision, no vocal air, no heat tolerance as a sense. They are, in body and behavior, a people of the eternal night, and any citizen behavior this document defines must remain expressible through exactly these organs.

---

## SECTION 3 — CITIZEN STATE MODEL

The citizen domain's state is an abstract projection of the canonical population state of `SIMULATION_SYSTEMS.md` Section 2 — categories, not a schema. No TypeScript, no database fields, no per-citizen record set belongs at this tier.

```
CitizenState  (a projection over the canonical population variables P and A_P)
{
  adaptationLevel           how dark-adapted and era-sophisticated the
                            citizenry's expression is   (projects era + local development)

  knowledgeAffinity         which cognitive pathway the local expression leans toward —
                            analytical, mnemonic, or expressive
                            (derived from the ecological context of emergence)

  culturalParticipation     engagement in gatherings and semaphore-dialect fluency
                            (the raw material read by CULTURE_SYSTEM.md)

  environmentalRelationship which networks and districts the citizenry expresses —
                            lattice-affine, root-affine, flow-affine

  memoryConnection          the citizenry's link to preserved Memory State —
                            captured lore, inherited record
}
```

### Individuality Is Rendered, Not Stored

This is the load-bearing architectural fidelity point of the citizen layer. The simulation state tracks population as **count `P`, activity `A_P`, and aggregate distributions** — not as a database of individual Noctae. An individual citizen — the one the user hovers, the one whose evening routine they watch, the one whose semaphore they capture — is a **deterministic expression rendered from that aggregate state**, exactly as `SIMULATION_SYSTEMS.md` Section 1 permits: "which path a citizen walks — that variety is either a deterministic function of existing state or a presentation choice made entirely inside the rendering layer."

Two consequences bind every future refinement. First, the citizen state model adds *vocabulary* over canonical population variables; it never introduces hidden per-citizen simulation variables that would balloon the state or demand ticking. Second, the individuality the user sees and loves is real and honest — it is a faithful function of true civilization state — but it lives at the point of expression, seeded deterministically, and is snapshotted into permanence only when the user captures it as lore (Section 10).

Rendered-not-stored does not mean inert. Within the agency boundary of `SIMULATION_SYSTEMS.md` Section 8 the Noctae genuinely *act* — they observe, maintain, teach, invent, preserve, and lose knowledge — and where an action carries durable consequence, the acting citizen's identity is committed so that its seeded-deterministic variation stays reproducible (`SIMULATION_SYSTEMS.md` Section 11: variation among causally qualified candidates, never uncontrolled randomness). What is never stored is a ticking per-citizen loop; what is real is the action and its recorded result. Citizens are actors, not decorative density.

---

## SECTION 4 — EMERGENT CITIZENSHIP

### Citizens Emerge; They Are Never Placed

There is no citizen spawning control, no housing system, no recruitment, and no birth management anywhere in Noctis. Citizens appear as a deterministic consequence of ecological prosperity and nothing else. Following `SIMULATION_SYSTEMS.md` Sections 2 and 19 and `ECOLOGY_SYSTEM.md` Section 13, population grows from the ecological prosperity signal `π`:

```
P(t+1) = P(t) + growth( π )          growth >= 0, always

π = prosperity( canopy expansion, substrate fertility,
                illumination, energy sufficiency )
```

Growth is zero below the flourishing threshold and rises, with saturation, above it. As accumulated knowledge deepens, the ecology matures (the succession stages of `ECOLOGY_SYSTEM.md` Section 5) and the eras turn (`SIMULATION_SYSTEMS.md` Section 9); with that maturity the citizenry gains new biological complexity, forms social structures, and expresses more specialized symbolic roles (Section 6). Knowledge does not recruit citizens — it creates the conditions in which more life becomes possible, and life follows.

### Population And Absence

Under the model this document currently defines, population count only grows: it is not reduced by offline decay, by hibernation, or by any input (`SIMULATION_SYSTEMS.md` Sections 5 and 10). What dims during quiet periods is the *activity* expression `A_P`, never the count. The citizens of a dormant city are indoors tending memory, not gone; the visible sparseness of a sleeping civilization is `A_P` at its floor while `P` holds exactly (Section 8).

One guarantee is permanent canon and never negotiable: **user absence never reduces population, and no citizen is ever shown dying from the user's absence — ever** (`GAME_DESIGN.md` Section 6; `SIMULATION_SYSTEMS.md` Section 10, Laws 5–6). The learning that earned a citizen already happened and cannot un-happen. What Tier 6 no longer fixes as physics is citizen *immortality itself*: the revised `SIMULATION_SYSTEMS.md` (Sections 10 and 19) neither mandates immortality nor prescribes a death model, and defers every life-cycle rule — birth, aging, retirement, succession, death, migration, replacement — to this document. This document does not define such a life cycle here, and does not invent one; it records only that the question is Citizen-owned, that any future life cycle must be biological or narrative in origin and never a consequence of user neglect, and that recorded history always outlives the citizen (`MEMORY_SYSTEM.md`). Forbidden in every model, present or future: population micromanagement of any kind; assignment, jobs boards, or per-citizen commands; housing limits, caps that demand growth, or crowding pressure; and starvation, hunger, or any consumption-failure state.

---

## SECTION 5 — SOCIAL NETWORKS

### A Society That Does Not Speak

The Noctae interact without vocal speech. Their entire social fabric is carried by the three channels of their biology (Section 2): **photophore signaling** (shuttered semaphore flashes at gatherings), **tactile information exchange** (lateral-line reading of cords and scrolls, and the felt air of a crowded plaza), and **resonance patterns** (in later eras, communication industrialized into phononic vibration and shutter-semaphore towers, per `SIMULATION_SYSTEMS.md` Section 9 — the detail of which is era territory for `TECHNOLOGY_SYSTEM.md`).

Social structures emerge from three shared things, never from user arrangement:

- **Shared knowledge** — citizens fed by the same subjects express compatible affinities and gather around the sites that study keeps nourishing.
- **Shared memory** — collective witnessing of vault processions, moth seasons, and blooms binds a district into a common history.
- **Shared adaptation** — citizens shaped by the same ecological neighborhood (lattice ridge, root archive, flow channel) develop common behavior.

From this, **semaphore dialects drift**: the flash-grammar of a district complexifies and diverges with repeated study, growing local idioms exactly as living languages drift (`GAME_DESIGN.md` Section 2). This drift is the raw material culture is made from, and it is the primary thing the citizen layer hands to `CULTURE_SYSTEM.md` (Section 9). There is no social graph for the user to manage; relationships are emergent expressions, read by rendering and lore, never edited.

---

## SECTION 6 — CITIZEN ROLES

### Functions, Not Professions

Noctis has no *user-managed* professions and no labor economy the user operates: there are no workers, farmers, miners, or soldiers to assign, staff, or optimize. Instead, citizens express **ecological and cultural functions** — symbolic roles that make a facet of civilization state legible as an individuated life. (Where a future `ECONOMY_SYSTEM.md` models production, labor, or allocation as civilizational *conditions*, it reads citizen participation, institutions, and vocational functions as input and owns their allocation; the user still operates none of it, and roles remain character — `SIMULATION_SYSTEMS.md` Section 20.) Representative roles:

- **Archive Keepers** — citizens whose behavior expresses the mycelial memory layer: they tend the vaults and the knotted records, and their presence thickens where language study has rooted the archive (`ECOLOGY_SYSTEM.md` Section 7).
- **Resonance Interpreters** — citizens who express the crystal-resonance state of their district, reading the coupled lattices and flashing in the sharp geometric rhythms that mathematics grows (`ECOLOGY_SYSTEM.md` Section 8).
- **Migration Observers** — citizens who witness and mark the spore-moth seasons; their role activates while the moth network is active (Section 8, The Pheromone Plume).
- **Memory Custodians** — citizens who carry generational inheritance, the diegetic bearers of what the civilization has preserved (Section 10).

### Roles Mint No Primary Value

This is the discipline that keeps roles honest. A role is **character, not employment**. It is never assigned by the user, never staffed, never optimized, and it mints no *primary* value — no learning-derived input, accumulated knowledge, or metabolic energy from nothing (`SIMULATION_SYSTEMS.md` Sections 8 and 13, the narrowed conservation boundary — the corrected form of the old "citizens are consequence, never source"). What a role *may* do is exactly what living citizens do: tend the vaults, read the resonance, teach an apprentice, keep a technique alive. Agency is not production — the behavior transforms and applies capabilities that learning, ecology, and prior history already support, and it is legible rather than profitable. A Resonance Interpreter does not *operate* the crystal network as a resource engine; the citizen's behavior *reflects and tends* it. Roles emerge deterministically from the ecological and era context a citizen expresses, and their sole function is legibility: they let the user read the state of their civilization in the lives of the people who embody it. Any future role that mints primary value, demands staffing, or invites optimization is invalid at birth (Section 12, Rule 3).

### Role Expansion

New roles enter Noctis the way new fauna enter the ecology (`ECOLOGY_SYSTEM.md` Section 9): by function, not by roster. A proposed role must name the ecological or cultural facet it makes legible, the civilization state it expresses, and the Noctae organs through which it expresses that state — and it must mint no primary value, demand no staffing, and be assignable by no one. There is no numeric pressure to multiply roles; a few resonant, legible functions outweigh a directory of titles. Roles are also era-inflected: the same underlying function wears different behavior as technology turns — the knot-keeper of `SPORE_HEARTH` and the sound-vault tender of `PHONONIC_SUBTERRANEAN` are both Archive Keepers, expressing the memory layer in the idiom their era allows (era detail bound in `TECHNOLOGY_SYSTEM.md`). A role that reads as a job description rather than a way of seeing the civilization is rejected at Section 12, Rule 3.

---

## SECTION 7 — LEARNING INFLUENCE

Human learning reaches citizens only through the ecological layer — never directly, never upstream — and expresses itself as adaptation and behavior, never as a stat to raise. The canonical mappings:

**Mathematics and logic** create **analytical adaptation**: citizens express crystal-interaction behavior, gathering along the lattice ridges, reading resonance, flashing in geometric cadence. Resonance Interpreters flourish where brine has grown the substrate.

**Languages and history** create **communication complexity and cultural memory**: richer semaphore dialects, deeper knotted records, and the Archive Keepers who tend them. The rooted past becomes a spoken (flashed) present.

**Creative work** creates **expressive signaling and aesthetic evolution**: new photophore colors and patterns enter the dialect, gatherings elaborate into ritual, and the visual character of civic life widens (the pigment register of the luciferin pathway, `ECOLOGY_SYSTEM.md` Section 3).

**Science and engineering** create **infrastructure fluency**: citizens tending the flow-instruments and light-routing of the civic circulation, the coordination behavior of a networked society (the infrastructure register of the luciferin pathway — both registers are canon and neither is dropped, `ECOLOGY_SYSTEM.md` Sections 1 and 3).

**Consistency** creates **participation rhythm**: the moth seasons bring the citizenry out; a world studied daily is a world whose people are visibly present, its Migration Observers active and its plazas full.

Every one of these is a cross-time-step consequence of metabolized study, read from the previous state and expressed in the next. Citizens never feed a *primary* value back upstream within an evaluation (`SIMULATION_SYSTEMS.md` Section 13). And because knowledge, practice, maintenance, reproduction, and possession are distinct states (`SIMULATION_SYSTEMS.md` Section 10, Law 9), a citizen may understand a technique without currently practicing it, keep one alive by maintenance long after the understanding that first grew it has thinned, or let a technique lapse from active practice while its record endures — invention, reproduction, and technical loss being Technology's mechanics (`TECHNOLOGY_SYSTEM.md`), for which the citizen layer supplies the actors who carry them.

---

## SECTION 8 — CITIZEN EVENTS

This document defines **no new engine events**. The observable event set is closed at four flags, fixed by `ARCHITECTURE.md` Section 6 and `SIMULATION_SYSTEMS.md` Section 10 and emitted in canonical order: `THE_PHEROMONE_PLUME`, `BAROMETRIC_SHOCK_WAVE`, `ABYSSAL_DOUSE`, `BENTHIC_BLOOM`. What follows is the *citizen-side consequence* of each — behavior read from the same flags, adding no signal and no state the generator does not already produce.

**The Pheromone Plume — participation.** When high consistency opens the spore-moth season, the citizenry participates in migration observation: the Migration Observer role activates, citizens gather to witness the silver moth-lines crossing the world, and participation rhythm rises with circulation. The user's discipline becomes a visible civic season.

**Barometric Shock Wave — protection.** When difficulty and failure depress atmospheric stability, the Noctae feel the cognitive pressure directly through their cranial lateral-lines. They retreat indoors, dim their photophores to the steady dark-crimson calm-sign, and settle into the fortification posture — pausing consumption and shoring foundations (`NOCTIS_ECOLOGICAL_ENGINE.md` Section 7; the valve-keeper of `GAME_DESIGN.md` Section 9 who "flashed the calm-sign to her whole tier, dark crimson and steady, until the pressure passed"). Nothing is lost; a hard week is met with endurance, never grief.

**Abyssal Douse — preservation.** When extended absence carries the world into hibernation, citizen activity enters a preservation state: `A_P` settles to its dormant floor, the citizens go indoors to tend memory, and the population count is preserved exactly. No citizen is removed and none is shown dying (`SIMULATION_SYSTEMS.md` Sections 4 and 8). The city keeps a quiet night watch and waits.

**Benthic Bloom — synchronization.** When a milestone fires the bloom, collective synchronization increases: the citizenry gathers at the civic core and its photophores pulse in unison with the rising neon-teal wave, a moment of the user's real achievement witnessed as one unified light.

---

## SECTION 9 — CULTURAL RELATIONSHIP

The citizen layer is the upstream source of culture. `CULTURE_SYSTEM.md` reads what the Noctae express and specializes it into cultural measure; this document supplies the living behavior, and the direction is one-way within any evaluation (`SIMULATION_SYSTEMS.md` Section 11). Citizen systems feed culture through:

- **Communication evolution** — the semaphore-dialect drift of Section 5, the substrate on which dialect complexity is later measured.
- **Rituals** — the gathering behaviors at hearths, pools, and plazas, and the seasonal observances around moths, vault processions, and blooms.
- **Collective memory** — the shared witnessing that binds a district into a common history.
- **Symbolic behavior** — the role expressions of Section 6, which give each district its legible character.

Culture is, in the canon's phrase, the civilization remembering how it usually receives light (`GAME_DESIGN.md` Section 5). The Noctae are how that remembering is performed; the measurement of it belongs to `CULTURE_SYSTEM.md`.

---

## SECTION 10 — MEMORY RELATIONSHIP

The Noctae preserve the civilization's historical experiences, its discoveries, and its milestones. Memory in Noctis is not a database. It is biological inheritance — carried in knotted cords, raised fiber scrolls, and the lived record of the Memory Custodians, and passed forward as the tactile and behavioral heritage of a people.

The permanence guarantees and the ledger itself are owned by Memory State (`SIMULATION_SYSTEMS.md` Section 2) and specialized by `MEMORY_SYSTEM.md`; the citizen layer supplies the *biological form* that permanence takes. The clearest expression of the relationship is lore capture (`GAME_DESIGN.md` Section 9): when the user observes an individual citizen and captures its recent semaphore routine, the system snapshots that deterministic expression into a permanent Memory State entry — a short, honest vignette grounded in true state (district, era, current events, recent study). Such entries obey the Rules of Memory: permanent, honest (never fictional filler), intimate (private by default), dignified in language, and empathetic in hard weeks. Citizens never delete or overwrite memory; inheritance only accumulates.

---

## SECTION 11 — TIME MODEL

Citizens inherit their relationship to time from `ARCHITECTURE.md` Section 5 and `SIMULATION_SYSTEMS.md` Section 3: **event-driven updates, deterministic state changes, lazy offline progression, and no constant simulation ticking.** No citizen runs on a timer. The citizenry's state is evaluated with the world — on a learning input, or once per checkpoint over elapsed time — and between evaluations it simply holds. The ambient motion of citizens on screen during quiet minutes is the rendering layer breathing over a constant state, not per-citizen simulation.

Offline, the citizen layer follows the decay model: `A_P` dims through the exponential decay of renewable activity while the count `P` holds untouched, and the first canonical ten-minute reawakening session lifts activity back toward presence. Because individual Noctae are deterministic expressions of aggregate state (Section 3), they are re-expressed on evaluation rather than persistently ticked — five days of absence and five hundred produce the same sleeping, preserved citizenry, waking to the same lives.

---

## SECTION 12 — AI GENERATION RULES

Any future citizen feature must pass every rule below, *after* clearing the tiered validation protocol of `DOCUMENT_ARCHITECTURE.md`, the runtime Trope Guard of `ARCHITECTURE.md`, and the physics of `SIMULATION_SYSTEMS.md` Section 12. A proposal that fails any rule is rejected and redesigned from the constraint up.

**Rule 1 — Citizens cannot become humans.** They remain dark-adapted Noctae: no surface anatomy, no daylight vision, no vocal civic speech (`NOCTIS_ECOLOGICAL_ENGINE.md` Section 1).

**Rule 2 — Citizens cannot become controllable units.** No selection, no movement command, no direct control of any kind.

**Rule 3 — Citizens cannot require management.** No assignment, jobs, housing, feeding, caps, or optimization. If a feature asks the user to manage citizens, it is wrong.

**Rule 4 — Citizen behavior must originate from learning-derived civilization growth.** Every behavior traces upstream through the ecological layer to metabolized study; nothing about the Noctae is self-originating.

**Rule 5 — Communication must respect Noctae biology.** Photophore semaphore, tactile exchange, or acoustic resonance only — never vocal speech, daylight-readable text, or Noctae-facing screens.

**Rule 6 — Citizens must strengthen the feeling of a living civilization.** A citizen feature must deepen the sense of witnessed, legible life, not add a mechanic.

---

## Closing Validation Statement

Every future citizen concept for the Noctis Civilization Module must pass, in order: the Tier 1 test of `VISION.md`, the Tier 2 test of `ART_DIRECTION.md`, the Tier 3 test of `NOCTIS_ECOLOGICAL_ENGINE.md`, the experience tests of `GAME_DESIGN.md`, the structural laws of `ARCHITECTURE.md`, the physics of `SIMULATION_SYSTEMS.md`, the ecological laws of `ECOLOGY_SYSTEM.md`, and the citizen laws of this document. Anything that fails is rejected and redesigned from the constraint up.

Population grows through prosperity and is never a resource, and absence never reduces it. The roles are character, never user-managed labor. The memory is inheritance, never a database. And the citizens themselves are the clearest proof the module offers that learning becomes life.

Noctae are not characters the user commands.

They are witnesses to the civilization created through human effort.

The user studies.

The civilization remembers.

The citizens awaken.
