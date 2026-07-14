---
doc_id: noctis.memory_system
tier: 7
authority: domain_specification
role: memory_domain_blueprint
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
---

# Noctis Civilization Module — Memory System

## Document Status And Authority

This document is the memory domain blueprint of the Noctis civilization simulation: the Tier 7 specification of how the civilization keeps, loses, distorts, contests, and rediscovers its own past. It answers the question every other domain leans on but none owns: *once something has happened, what becomes of it?* Ecology grows the world, citizens live in it, technology changes it, culture makes it mean something — and Memory is where all of that becomes a **history** the civilization can carry, misremember, and one day dig up again. Memory is why Noctis feels older every time the user returns.

It sits beneath the full canon, the technical architecture, the simulation physics, and the four peer domains already written, and may never contradict any of them:

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
MEMORY_SYSTEM.md               Tier 7 — Memory Domain Blueprint (this file)
```

In the per-evaluation dependency topology of `SIMULATION_SYSTEMS.md` Section 13, Memory sits at the downstream end: every domain writes facts into it, and it feeds none of them primary value. It is the civilization's ledger of legacy (`SIMULATION_SYSTEMS.md` Section 2, Memory State). This document specializes the Memory Contract of `SIMULATION_SYSTEMS.md` Section 21 and honors the Rules of Memory fixed in `GAME_DESIGN.md` Section 9; it may specialize the physics, and it may never override it.

### The Identity Guardrail

Memory in Noctis is not an omniscient event log, not a lore-collection checklist, not a museum-management game, not a nostalgia meter, and not an archive the user must maintain. There is no history score, no archive currency, no completion percentage, no collectible lore card, and no encyclopedia that reveals everything the moment it happens. The user never rewrites the past, never deletes a disliked event, never selects the official history, and is never punished for being away. The archive is instead the one place where the user's accumulated learning has quietly *become history* — dated, permanent, and honest — and where the civilization can be seen to have genuinely lived: old routes beneath new streets, monuments whose meaning has drifted, manuals without practitioners, conflicting accounts of the same night, and names kept long after the ones who bore them are gone.

### What This Document Binds — And What It Refuses To Bind

**Binds:** the memory philosophy and its resolution of the legacy/forgetting paradox; the layered separation of truth, provenance, record, knowledge, public memory, interpretation, institutional narrative, myth, and user-visible information; the vocabulary ladder; the abstract memory-state projection and its immutable-provenance / active-memory split; the record, provenance, and authentication models; the significance model; archives and material memory; monuments, biography, and genealogy as historical anchors; the technological, ecological, cultural, and institutional memory sub-models; forgetting, distortion, suppression, rediscovery, and contradiction; the night-as-medium model; era memory behavior; the coefficient families of the memory domain, each named symbolically with its binding constraint and canon citation.

**Refuses to bind:** every numeric coefficient and threshold *value* (named here as constrained symbols; bound at implementation under the calibration constraints of `SIMULATION_SYSTEMS.md` and this file, each carrying a canon citation); the exact field identifiers of the state schema, storage schemas, or any code; any procedural generation of record text, biography, or historical documents (`ART_DIRECTION.md`, Tier 8); any rendering, timeline UI, search interface, animation, or audio; individual citizen psychology, private recollection, and life cycle (`CITIZEN_SYSTEM.md`); the *active meaning* of the past (`CULTURE_SYSTEM.md`); live technological capability and reactivation (`TECHNOLOGY_SYSTEM.md`); ecological outcome resolution (`ECOLOGY_SYSTEM.md`); production, allocation, and prices (`ECONOMY_SYSTEM.md`); formal law, coercion, and censorship-as-authority (a future governance domain); the era-transition gate (`ERA_PROGRESSION.md`); and the interpretation of raw study (`LEARNING_INTEGRATION.md`). Memory owns the *record of what happened and what became of that record*. Other domains own the living present the record is about.

No numeric anchors appear in this document beyond the three the canon itself locks: the three-consecutive-day consistency trigger, the five-day absence horizon, and the ten-minute reawakening session (`NOCTIS_ECOLOGICAL_ENGINE.md` section 7).

### Notation

Notation follows the siblings. Memory reads committed domain transitions and canonical Memory State (`SIMULATION_SYSTEMS.md` Section 2). It introduces its own bounded, per-*record* and per-*group* signals: `confidence ∈ [0,1]` (how strongly surviving evidence supports a claim), `access ∈ [0,1]` (whether a given group can currently find, reach, read, and interpret a record), `salience ∈ [0,1]` (how socially visible a subject is), `awareness ∈ [0,1]` (how widely a group knows a record exists), plus `distribution` (independent copies/paths) and a `condition` and `contestation` descriptor. `provenance` is the immutable legacy trace, never a bounded signal — it is present or committed, and once committed it is permanent. Seeded deterministic selection is written `select(seed, S, context)` — a pure function of committed state, never randomness (`SIMULATION_SYSTEMS.md` Section 11). Named constants carry their constraints here and their values at implementation time.

---

## SECTION 1 — MEMORY PHILOSOPHY

### Memory Is The Civilization's Changing Relationship With What Has Happened

History is what occurred. Memory is what was witnessed, recorded, preserved, transmitted, accessed, believed, forgotten, distorted, contested, ritualized, rediscovered, and interpreted. The two are not the same, and the entire value of this domain is in keeping them apart. The simulation may know a flood happened; the citizens may remember it wrong; an institution may hold an accurate account no one can currently read; a monument to it may survive after its meaning is lost; a ritual may keep the flood's emotional truth while altering every fact. Memory is the machinery that lets all of these be true at once.

### The Archive Is Where Learning Becomes History

Memory is the domain that most directly delivers the promise of `VISION.md`: *the place where the user's learning lives.* A completed course, a passed exam, a long project, a season of consistency — these are metabolized by the whole simulation, and it is Memory that turns their durable consequences into dated, permanent civilizational record: vault entries written from the real week they honor, monuments raised for real milestones, lore vignettes of the citizens the user's effort brought to life (`GAME_DESIGN.md` Section 9). The archive grows heavier and stranger over months not because the user maintains it, but because they lived and studied, and the civilization remembered.

### Memory Is Not Omniscience, And Not A Log

The reflex to model memory as a perfect, universally-known chronological list is exactly what this domain forbids. A real past is uneven: some events are perfectly documented and culturally ignored; others are barely evidenced yet socially enormous; most leave partial, biased, contradictory traces. Memory preserves that unevenness. It separates *what happened*, *what was recorded*, *what survives*, *who can reach it*, *how sure anyone is*, *who knows it exists*, and *what it is taken to mean* — and it never silently reconciles them.

---

## SECTION 2 — WHAT MEMORY IS: THE VOCABULARY LADDER

Memory refuses to blur its terms. Each is distinguished, with its owner named:

- **Event** — something that occurred in committed simulation truth (`SIMULATION_SYSTEMS.md`). Not owned here; Memory records *that it happened*.
- **Fact** — a true proposition about an event.
- **Provenance** — the immutable trace, once committed, that a qualifying event or protected achievement occurred, and the chain of who created/copied/altered a record of it. The legacy core of this domain (Section 5).
- **Witness / testimony** — a citizen, instrument, or trace that observed an event, and the account it produced (Section 9). Sincere and wrong are compatible.
- **Trace** — an unintentional physical remainder (a scar, a sediment, a ruin) that carries evidence (Section 13).
- **Record** — a preserved account or artifact — evidence, not truth (Section 3). May be complete, damaged, copied, restricted, misclassified, context-poor.
- **Copy / archive / collection / catalogue** — reproductions and the institutions that hold and order them (Section 12).
- **Inscription / artifact / ruin / monument / memorial** — material carriers of memory (Sections 13, 14).
- **Biography / genealogy / chronology** — recorded lives, lineages, and orderings (Sections 15, 16).
- **Historical milestone / heritage anchor** — a committed, protected legacy point: era transitions, foundational events, user-linked achievements, secured technological heritage (`H_tech`).
- **Public memory / collective memory** — what a broad group commonly recalls or believes; often diverges from record.
- **Institutional / technical / ecological / cultural memory** — memory carried by institutions, techniques, landscapes, and cultural forms (Sections 24–29).
- **Personal recollection** — an individual's memory; Citizen-owned until it becomes a durable record (Section 23).
- **Transmission** — how records and accounts move, in the Noctae's tactile and luminous modes, never by default civic speech (Sections 10, 23).
- **Myth / folklore / legend / rumor / narrative** — transmitted accounts carrying symbolic or emotional truth; owned as *record and version-lineage* here, as *active meaning* by Culture (Section 24).
- **Interpretation** — the meaning assigned to a record now. Owned by Culture (Section 24); Memory keeps the versions, not the verdict.
- **Distortion / omission / suppression / censorship / forgetting / loss of access** — the ways memory degrades without the past being deleted (Sections 17–19).
- **Rediscovery / restoration / authentication** — the ways access, context, and confidence return (Sections 20, 11).
- **Contradiction / confidence / provenance chain / salience** — the states of an uncertain, contested, or prominent history (Sections 21, 11).
- **Legacy / active remembrance** — the permanent record versus the living, changeable relationship to it (Section 5).

Every later section is the physics of how something moves this ladder — from an event, to a trace, to a record, to a belief, to a myth, and sometimes back into evidence when a later generation digs it up.

---

## SECTION 3 — THE NINE LAYERS OF THE PAST

Memory keeps at least nine layers distinct, and preserves their disagreement rather than forcing reconciliation. This separation is the domain's central structural fidelity.

1. **Simulation truth** — what actually happened in committed state (`SIMULATION_SYSTEMS.md`). Not owned here; the ground everything else refers to.
2. **Historical provenance** — the immutable Memory trace that a *qualifying* event or protected achievement occurred (a subset of truth, committed as legacy). Never rewritten.
3. **Recorded evidence** — what citizens, institutions, technologies, or environments actually preserved. Incomplete, biased, damageable.
4. **Citizen knowledge** — what particular citizens or groups currently know (`CITIZEN_SYSTEM.md`).
5. **Public memory** — what the broader society commonly remembers or believes.
6. **Cultural interpretation** — what the event *means* now (`CULTURE_SYSTEM.md` Section 26; owned there).
7. **Institutional narrative** — how archives, schools, guilds, and councils frame it.
8. **Rumor, myth, folklore** — transmitted accounts that may hold symbolic or emotional truth while distorting fact.
9. **User-visible information** — what the Study OS interface chooses to reveal (`ART_DIRECTION.md`; always the smallest layer, atmosphere before data).

These layers routinely disagree: an accurate record (3) that no citizen knows (4), that the public misremembers (5), that culture reveres wrongly (6), that an institution officially denies (7), that a myth preserves emotionally (8), of which the user sees only a monument (9) — all pointing back at one true event (1) and its permanent provenance (2). Memory's job is to hold the whole stack, not to collapse it.

---

## SECTION 4 — DOMAIN OWNERSHIP

Specializing `SIMULATION_SYSTEMS.md` Section 14 and 21.

**Memory owns:** durable historical records and provenance chains; the event-to-record relationship; archives, catalogues, and their distribution; historical milestones and heritage anchors; recorded biographies and genealogies; monuments and ruins *as historical anchors and evidence*; record accessibility, confidence, authentication, and preservation condition; copied and translated versions and their lineage; historical contradictions and distortion lineage; public awareness of records; rediscovery of records and restoration of their context; remembered technological heritage (the record behind `H_tech`); recorded ecological history; the historical *versions* of narratives; and the persistence of protected legacy.

**Memory does not own:** raw study telemetry or its interpretation (`LEARNING_INTEGRATION.md`); individual citizen psychology, private recollection, and decision (`CITIZEN_SYSTEM.md`); active cultural meaning, current legitimacy, and live ritual (`CULTURE_SYSTEM.md`); live technological capability, invention, and reactivation (`TECHNOLOGY_SYSTEM.md`); ecological outcomes (`ECOLOGY_SYSTEM.md`); production, allocation, prices, ownership (`ECONOMY_SYSTEM.md`); formal censorship law and political authority (a future governance domain); era gating (`ERA_PROGRESSION.md`); and rendering, UI, timeline interfaces, animation, music, and dialogue (`ART_DIRECTION.md`, Tier 8). Memory keeps the record; the living domains own the world the record is about.

---

## SECTION 5 — CONCEPTUAL STATE MODEL

The memory domain's state is an abstract **projection** over the canonical Memory State of `SIMULATION_SYSTEMS.md` Section 2 and the committed transitions of every other domain. It is categories, not a schema.

```
MemoryState  (a projection over canonical Memory State and committed transitions)
{
  historicalProvenance   the immutable set of qualifying committed events and
                         protected user-linked achievements (era transitions,
                         milestones, heritage anchors, H_tech records) — LEGACY,
                         never rewritten, never deleted, never absence-touched

  recordCorpus           records, testimony, artifacts, inscriptions, technical
                         manuals, maps, biographies, environmental traces — the
                         evidence, of varying completeness

  provenanceChains       who created, copied, translated, altered, authenticated,
                         or disputed each record

  accessibility          access, per record and per group — findable, reachable,
                         readable, interpretable (renewable, may contract/expand)

  fidelityConfidence     how strongly surviving evidence supports a claim
                         (renewable; rises with authentication, falls with loss)

  distribution           independent copies and transmission paths

  salienceAwareness      how socially visible a subject is, and how widely a group
                         knows a record exists (renewable)

  contestation           the degree to which records or groups disagree

  preservationCondition  intact, incomplete, damaged, fragmented, context-poor

  interpretationLinks    references to current cultural interpretations
                         (read-only pointers into CULTURE_SYSTEM.md; never resolved here)
}
```

### The Immutable-Provenance / Active-Memory Split

This is the load-bearing structural fidelity of the domain, and the direct specialization of `SIMULATION_SYSTEMS.md` Section 10 (legacy vs active). **`historicalProvenance` is legacy**: once a qualifying fact or protected achievement is committed, its trace is permanent, immutable, and untouched by user absence (`SIMULATION_SYSTEMS.md` Laws 4, 5). The simulation never rewrites what happened. Everything else — `accessibility`, `fidelityConfidence`, `distribution`, `salienceAwareness`, `contestation`, `preservationCondition` — is **active memory**: it may rise, fall, fragment, be suppressed, and be restored through internal causality (`SIMULATION_SYSTEMS.md` Law 8), and it quiets safely during absence without any provenance being lost. The civilization can lose *access to*, *confidence in*, *awareness of*, and *the meaning of* its past; it can never lose the past itself.

### Derived, Not Exhaustively Stored

Every category is a projection over committed state; this document adds *vocabulary*, never a hidden per-record simulation loop that would balloon state or demand ticking (`SIMULATION_SYSTEMS.md` Section 2; `CITIZEN_SYSTEM.md` Section 3). **Not every action becomes a stored record** (Section 8): most of daily life leaves no durable trace, exactly as in a real past. A specific archive entry, monument, or biography the user reads is a durable, committed Memory-State object; the vast remainder of history is a derived, seeded expression over aggregate state, snapshotted into permanence only when significance or user-linked protection commits it.

### Coefficient Families

| Symbol family | Governs | Binding constraint | Canon source |
|---|---|---|---|
| `θ_significance` | Thresholds for an event/record entering durable Memory State | Monotone in consequence, witnessing, salience, user-linkage; group-scoped | `SIMULATION_SYSTEMS.md` Section 21; `GAME_DESIGN.md` Section 9 |
| `ρ_copy` | Copy/transmission fidelity; drift of non-protected detail | Bounded; never alters provenance; embodied lower-fidelity | `SIMULATION_SYSTEMS.md` Section 11 |
| `λ_access` | Contraction of access/salience/awareness through internal causality | Acts only on active memory; **never** triggered by user absence; provenance untouched | `SIMULATION_SYSTEMS.md` Sections 10, 21, Law 8 |
| `κ_authenticate` | Confidence gain from independent evidence, material traces, cross-archive agreement | Monotone in independent support; never reaches certainty from copies of one source | `SIMULATION_SYSTEMS.md` Section 21 |
| `θ_rediscover` | Rediscovery reactivation of access/context | Crossable only when a provenance/record survives and conditions realign; deterministic | `SIMULATION_SYSTEMS.md` Sections 10, 21 |

No coefficient may ever be user-visible as a number to optimize, and no memory development may ever require a user decision (`GAME_DESIGN.md` Section 11, Principle 2; `SIMULATION_SYSTEMS.md` Law 10).

---

## SECTION 6 — THE MEMORY PARADOX AND ITS RESOLUTION

`SIMULATION_SYSTEMS.md` requires two things that seem opposed: **permanent civilizational legacy** (Laws 4, 5) and **the possibility of forgetting, distortion, lost access, and reinterpretation** (Law 8). The split of Section 5 resolves them exactly.

- **Canonical provenance is immutable.** What actually happened, and every protected user-linked achievement, is committed once and never rewritten. A later interpretation may disagree; a citizen may not know; an institution may bury access; a record may become unreadable — and the underlying historical fact remains part of the civilization's permanent history beneath all of it.
- **Records are evidence, not truth.** A record may be complete or damaged, copied or translated, restricted or misclassified. A record is not automatically correct, and multiple records may conflict (Section 21).
- **Access is separate from preservation.** A preserved record may be public, restricted, physically unreachable, technically unreadable, known only to specialists, buried under ecological growth, or merely dismissed — and access may change without deleting the record's legacy.
- **Interpretation is separate from provenance.** Culture, citizens, and later generations assign meaning that may clarify, distort, mythologize, politicize, romanticize, condemn, rehabilitate, or ritualize — and never overwrites what happened.
- **Social remembrance is separate from all of the above.** An event may stay socially enormous with poor factual knowledge; another may be perfectly documented and culturally ignored.

Forgetting, therefore, is never deletion (Section 17). It is loss of access, salience, context, transmission, or understanding — all in the active layer, all reversible in principle (Section 20), all leaving the immutable provenance intact.

---

## SECTION 7 — MEMORY LIFECYCLE

A durable memory forms through a causal lifecycle; each step is a state condition, and most events never reach the top.

```
event occurs                     (committed simulation truth)
      |
witnesses or traces exist        citizens, instruments, ecological remainders (Section 9)
      |
record opportunity               someone or something is positioned to record
      |
testimony / artifact / inscription created   (in a Noctae medium, Section 10)
      |
provenance attached              authorship, time, place, chain (Section 11)
      |
copied / distributed             fidelity ρ_copy; multiple paths raise survival
      |
classified                       an institution files, frames, or misfiles it (Section 12)
      |
verified / disputed / left uncertain   authentication state (Section 11, 21)
      |
enters archive or public tradition
      |
access expands or contracts      through internal causality (Sections 17, 19)
      |
interpretation changes           owned by Culture (Section 24)
      |
context may be lost              condition degrades; meaning detaches
      |
record becomes obscure           awareness/salience fall (Section 17)
      |
evidence rediscovered            θ_rediscover crossed (Section 20)
      |
context restored or reinterpreted
```

Not every event passes every stage. An event may leave no intentional record, only an ecological trace, only contradictory testimony, one private archive entry, widespread public remembrance with no evidence, a monument without an accurate explanation, a myth with no surviving proof, or strong evidence with no public interest. **Minor daily action is not automatically preserved** (Section 8); the world forgets the ordinary, exactly as a real world does.

---

## SECTION 8 — HISTORICAL SIGNIFICANCE

Significance decides which events become durable history and which remain ordinary life, and it is **never one global score** (`θ_significance` is group-scoped and multi-sourced). Significance may arise from large-scale consequence, a first occurrence, an irreversible milestone, an era transition, a technological invention or failure, an ecological transformation, a cultural formation, an institutional founding, a migration, a famous citizen's involvement, widespread witnessing, strong emotional response, repeated commemoration, long-term consequence, connection to a protected user-learning milestone, later rediscovery, or conflict between competing accounts.

Because significance is group-scoped, **a globally minor event can be central to one household or settlement**, and different institutions preserve different events. This is what keeps civilization-wide history from erasing local memory (Section 22): the archive is not one canon but many overlapping canons, weighted differently by every group that keeps one.

---

## SECTION 9 — WITNESSES AND TESTIMONY

Events are witnessed by individual citizens, households, professions, institutions, survey organisms (`ECOLOGY_SYSTEM.md` chiroptera), technical instruments, ecological traces, and — in later eras — automated systems. Witnesses differ in location, access, knowledge, bias, attention, emotional involvement, technical understanding, ability to record, incentive to conceal, and later influence. **A witness may be sincere and wrong; an instrument may be accurate and misunderstood; a later copy may keep the words and lose the context.**

Witness disagreement is a first-class outcome, not an error (Section 21). Which qualified witnesses produce *durable* testimony is chosen by seeded deterministic selection, `select(seed, S, context)` (`SIMULATION_SYSTEMS.md` Section 11): reproducible, among qualified witnesses only, and always explainable. Variation decides *whose account survives*; it never decides *whether the event occurred* — the event and its provenance are committed truth before any witness is selected.

---

## SECTION 10 — RECORD TYPES

Records take many forms, each with different strengths and vulnerabilities, and all of them respect the Noctae's non-vocal, night-adapted communication (`NOCTIS_ECOLOGICAL_ENGINE.md` Section 1; `CITIZEN_SYSTEM.md` Section 2). **Civic speech is never the default preservation method.** Representative types, era-inflected:

- **Embodied and social** — personal testimony (as remembered semaphore or tactile account), household chronicle, professional log, ritual reenactment, public narrative, folklore.
- **Tactile inscription** — knot cords, raised fiber scrolls, biosilicate inscription, tactile maps and genealogies.
- **Crystalline and resonant** — crystal-lattice records, resonance patterns and engraved vibration grooves (the phononic sound-vaults), refraction-encoded archives.
- **Biological and networked** — mycelial archives, living-board records, network records, and (last era) entangled-lattice records.
- **Material and environmental** — monuments, memorial objects, architectural traces, ruins, tools, artifacts, and ecological traces (crystal layers, root structures, growth scars — Section 28).
- **Instrumental** — surveys, census-equivalent records, experimental notebooks, technical manuals, infrastructure maps.

Each type differs in fidelity, durability, copyability, readability, and dependence on living skill or functioning infrastructure — differences that drive most of the loss, drift, and rediscovery in later sections. A crystal record may outlast every reader of its notation; a mycelial archive may be abundant and context-poor; a knot cord may preserve a sequence whose meaning is gone.

---

## SECTION 11 — PROVENANCE AND AUTHENTICATION

A historical claim is stronger when supported by multiple independent witnesses, direct material evidence, contemporary records, a stable provenance chain, consistent ecological traces, surviving technical artifacts, cross-institutional agreement, and later reproducibility of the described process (`κ_authenticate`). It is weaker under unknown authorship, copies sharing a single source, missing context, deliberate alteration, translation loss, ideological revision, physical damage, contradictory evidence, or anachronistic interpretation.

**Authentication is not a binary true/false switch.** A record carries a confidence state drawn from a graded set: *verified*, *strongly supported*, *plausible*, *disputed*, *uncertain*, *misattributed*, *falsified*, *symbolic-rather-than-factual*, and *impossible to authenticate*. Crucially, **in-world confidence is distinct from canonical simulation truth**: a record can be *verified* in-world and still wrong, or *disputed* in-world and correct. Confidence measures the evidence the civilization holds, not the fact the simulation committed. Authentication is itself a historical process with provenance — who authenticated, on what evidence, with what interest — so an authentication can later be overturned, and the overturning is itself recorded.

---

## SECTION 12 — ARCHIVES AND MEMORY INSTITUTIONS

Memory institutions collect, classify, preserve, copy, authenticate, translate, restrict, contextualize, restore, publicize, neglect, suppress, commercialize, and reinterpret. They span household repositories, guild archives, ecological observatories, technical scriptoria, settlement record-halls, memorial societies, museums, schools, distributed network archives, living mycelial repositories, and (last era) cosmic memory lattices. Their internal culture is their own (`CULTURE_SYSTEM.md` Section 15).

The ownership split is exact: **Memory owns the archival function** — what is preserved, its provenance, its condition, its accessibility. `CITIZEN_SYSTEM.md` owns the individual participation and the citizens who staff it; `CULTURE_SYSTEM.md` owns the institution's legitimacy and the meaning of what it keeps; a future `ECONOMY_SYSTEM.md` owns its material support; `TECHNOLOGY_SYSTEM.md` owns its preservation media and technical infrastructure; a future governance domain owns any formal access restriction it enforces. An archive can be materially rich and culturally illegitimate, or trusted and starving; it can preserve faithfully while framing tendentiously (Section 30).

---

## SECTION 13 — MATERIAL MEMORY, RUINS, AND LANDSCAPES

The civilization's past exists physically in the world, and this is the primary source of the felt age `VISION.md` and `GAME_DESIGN.md` Section 10 demand. Material memory includes obsolete structures, abandoned pathways, damaged infrastructure, reused foundations, layered settlements, memorial objects, old tools, altered ecological growth, preserved crystal patterns, scars in fungal networks, architecture built around earlier ruins, monuments whose meaning changed, and equipment kept after its function was forgotten.

A ruin is never mere decoration. One ruin can simultaneously provide evidence, incomplete knowledge, technical possibility (a recoverable schema — `TECHNOLOGY_SYSTEM.md` Section 20), contested identity, cultural prestige, ecological habitat, physical danger, an institutional claim, and a rediscovery opportunity. Its ownership is deliberately split across domains: **Memory owns the ruin's historical trace and provenance; `ECOLOGY_SYSTEM.md` owns its biological occupation; `TECHNOLOGY_SYSTEM.md` owns any recoverable capability; `CULTURE_SYSTEM.md` owns its present meaning; `ART_DIRECTION.md` owns its appearance.** No single domain owns the whole ruin, and that shared ownership is exactly what makes ruins rich.

---

## SECTION 14 — MONUMENTS AND MEMORIALS

Memory distinguishes the monument (a deliberate historical anchor), the memorial (a marker of loss), the grave-equivalent marker, the commemorative structure, the heritage site, the preserved ruin, the public archive, and the private remembrance object. Monuments are created to honor, mourn, legitimize, warn, claim ownership of history, celebrate invention, preserve a disaster, establish continuity, or suppress a rival narrative — and they are one of the canonical player-facing memory features (`GAME_DESIGN.md` Section 9, Monument Construction): raised for real user milestones, uniquely lit from the knowledge-type palette of the work that earned them, never dimming fully even in hibernation.

A monument may later be reinterpreted, neglected, altered, removed, relocated, contested, ritualized, stripped of context, or preserved despite rejection of its original message. **Memory records the monument's origin and every transformation; Culture resolves what it means now** (`CULTURE_SYSTEM.md` Section 26). A monument the culture has come to despise still holds its low residual glow and its true provenance, because the achievement it marks already happened and cannot un-happen (`SIMULATION_SYSTEMS.md` Law 5).

---

## SECTION 15 — BIOGRAPHY AND FAMOUS CITIZENS

The civilization remembers particular citizens without turning every citizen into a stored hero entry. A citizen becomes historically significant by inventing a technique, maintaining vital infrastructure, founding an institution, documenting a crisis, creating an artistic form, leading a migration, preserving forbidden records, failing publicly, becoming a symbol after death, being misremembered, or being rediscovered through archives. This is the durable extension of the Citizen Lore Logs of `GAME_DESIGN.md` Section 9 and `CITIZEN_SYSTEM.md` Section 10: a captured lore vignette is a personal recollection made into a durable record, and a few such records, over time, become biography.

A biography may hold verified facts, personal testimony, attributed achievements, disputed claims, institutional framing, later myths, missing periods, associated objects, and relationships to places and institutions. **Famous citizens are not assumed to be accurately remembered** (Scenarios 3, 14, 16): credit may be misassigned, a life may be mythologized, a villain rehabilitated. Memory holds the record and its provenance; it authors no individual psychology, which is Citizen's alone (`CITIZEN_SYSTEM.md`).

---

## SECTION 16 — GENEALOGY AND GENERATIONAL MEMORY

Where compatible with `CITIZEN_SYSTEM.md`, Memory supports household continuity, apprenticeship lineage, institutional succession, inherited objects, remembered ancestors, professional lineages, disputed descent, adopted-family memory, migration histories, and generational reinterpretation. Genealogy is **never a universal biological hierarchy**; family memory may be accurate, selective, symbolic, politically useful, privately guarded, lost, or reconstructed. `CITIZEN_SYSTEM.md` owns relationships and life cycles; **Memory owns the recorded lineage**; `CULTURE_SYSTEM.md` owns the meaning of ancestry (`CULTURE_SYSTEM.md` Section 17). A lineage can be socially decisive and factually wrong, and Memory keeps both the claim and whatever evidence contests it.

---

## SECTION 17 — FORGETTING

Forgetting never means deletion of canonical history. It is a family of active-layer processes, each with a causal path: no living citizen knows; public awareness falls away; a record becomes inaccessible; notation becomes unreadable; context disappears; copies become rare; institutions stop teaching it; an event loses emotional salience; a subject is deliberately ignored; a practice survives without remembered origin; a name survives without biography; evidence exists but is misclassified.

Forgetting occurs only through **internal causality** — supersession, institutional collapse, notation drift, ecological burial, neglect — and **never merely through ordinary user absence** (`SIMULATION_SYSTEMS.md` Laws 5, 6). Beneath every in-world forgetting, the protected provenance and every user-linked legacy anchor remain intact, waiting. This is the mechanism that makes the archive feel like a deep, lossy, real past while guaranteeing that the user's actual accomplishments are never truly gone (Section 32; Scenario 20).

---

## SECTION 18 — DISTORTION AND MYTH

Distortion emerges through identifiable processes, never as arbitrary noise: copying error, translation, compression, ritual repetition, political revision, professional self-interest, household pride, traumatic recollection, artistic adaptation, loss of context, merger of several events, misattribution, symbolic reinterpretation, and later technological assumptions projected backward. Memory tracks the **lineage of versions** (`ρ_copy`, `provenanceChains`): where each variant diverged, and from what.

**Myth is not simply falsehood.** A myth may preserve an emotional truth, an identity, a moral interpretation, an ecological warning, or the memory of an event whose facts are unrecoverable. A factually weak myth can be culturally powerful, and a well-evidenced record culturally inert (Section 6). Memory owns the myth's versions and provenance; `CULTURE_SYSTEM.md` owns its current meaning and legitimacy (`CULTURE_SYSTEM.md` Section 18). The two together let Noctis hold a myth that is false in fact and true in feeling — the normal condition of much real history.

---

## SECTION 19 — SUPPRESSION AND HISTORICAL POWER

Records become obscure through deliberate destruction of public copies, restricted access, institutional secrecy, replaced curricula, monument removal, discouraged commemoration, technical obsolescence, classification, economic neglect, and cultural shame. **Suppression never rewrites canonical provenance** — it acts on access, distribution, and awareness (the active layer). And suppression characteristically **leaves evidence**: an altered catalogue, a missing archive sequence, a destroyed monument's footprint, a contradictory private record, surviving household testimony, or ecological evidence conflicting with the official account. That evidence can itself become historical evidence, so a later generation can rediscover not only the buried fact but the burying (Scenario 9).

Memory owns the historical fact that suppression occurred, which records became inaccessible, which versions survived, and the provenance of the alterations. `CULTURE_SYSTEM.md` owns the legitimacy contest around it; a **future governance domain** owns the policy, law, coercion, and authority behind it (`CULTURE_SYSTEM.md` Section 29). This document invents no political mechanics.

---

## SECTION 20 — REDISCOVERY AND RECONSTRUCTION

Rediscovery begins through ecological excavation (`ECOLOGY_SYSTEM.md` vault breaches, Section 7), infrastructure repair, technological scanning, archive recataloguing, migration into old regions, interdisciplinary learning (`LEARNING_INTEGRATION.md` signals, Section 13-analog), comparison between contradictory records, accidental discovery, revived cultural interest, or institutional investigation. Crossing `θ_rediscover` restores **access, evidence, context, confidence, and awareness** to a record whose provenance survived.

Rediscovery restores the *record*; it does **not** automatically restore the *world the record is about*. It does not restore active culture (`CULTURE_SYSTEM.md` owns revival), technological capability (`TECHNOLOGY_SYSTEM.md` owns reactivation — a recovered blueprint is exposed possibility, not restored capability), ecology (`ECOLOGY_SYSTEM.md` owns restoration), institutional authority, or accurate interpretation. Reconstruction may remain incomplete or disputed, and a recovered record often creates more questions than answers (Scenarios 5, 15, 16). Rediscovery is a beginning, not a solution.

---

## SECTION 21 — CONTRADICTION AND UNCERTAINTY

Memory supports multiple records that cannot all be correct, and treats unresolved contradiction as a legitimate, sometimes permanent, state. Contradictions may concern who invented a technology, why a migration occurred, whether an institution prevented or caused a disaster, whether a ritual began as survival or ceremony, whether a famous citizen acted alone, which settlement adopted a technique first, or whether ecological harm was understood at the time.

A contradiction *may* be resolved through new evidence, authentication, ecological traces, technological reproduction, or cross-archive comparison — and it **may also remain unresolved forever**. The user does not always receive one authoritative answer; some of the civilization's past is permanently uncertain in-world, even though the simulation's committed truth exists beneath it (Section 3). Preserving genuine, irreducible historical uncertainty is a feature of this domain, not a gap in it.

---

## SECTION 22 — MEMORY ACROSS SCALES

Memory exists at overlapping scales, and civilization-wide history never erases local memory. **Individual** recollection is Citizen-owned; **household** memory holds objects, genealogies, and local stories; **profession** memory holds technical lineages, warnings, methods, and institutional failures; **community/district** memory holds local disasters, landmarks, founding stories, and rivalries; **settlement/region** memory holds archives, monuments, ecological history, and technological identity; **civilization-wide** memory holds era transitions, foundational crises, major inventions, large migrations, and shared narratives; and **planetary/cosmic** memory (last era) holds long-duration archives, distant-settlement histories, divergent chronologies, communication-delayed records, and the artificial-memory questions of Section 30. A globally forgotten event can be the center of a household's memory, and two regions can hold incompatible public memories of one shared migration (Scenario 12).

---

## SECTION 23 — CITIZEN INTERFACE

`CITIZEN_SYSTEM.md` owns personal recollection, lived experience, private emotional association, individual knowledge, personal misunderstanding, biography-while-lived, and individual participation in remembrance. Memory owns the *durable* remainder: when personal testimony becomes a durable record, the provenance linking testimony to an event, the preservation of recorded biography, the comparison of multiple accounts, public and institutional access, and the historical trace a citizen leaves after their active expression ends (`CITIZEN_SYSTEM.md` Section 10, the lore-capture handoff).

Two rules bind the boundary. **A citizen remembering something does not automatically create a permanent archive entry** — private recollection becomes durable record only through the lifecycle of Section 7 and the significance of Section 8. And **a record may originate from one citizen and outlive them** — this is precisely how a life becomes history. Not every citizen action becomes stored history; the domain would balloon and the past would lose its selectivity (Section 5).

---

## SECTION 24 — CULTURE INTERFACE

This is the most delicate boundary in the module, and it is drawn cleanly, matching `CULTURE_SYSTEM.md` Section 26. **Memory owns the record**: that an event or practice occurred, the versions and provenance of a narrative, surviving evidence, accessibility, historical confidence, the fact that a tradition was once practiced, and the fact that a symbol once carried a particular meaning. **Culture owns the active meaning**: what the event means now, current legitimacy, live ritual and tradition, symbolism, identity, contemporary interpretation, and whether citizens honor, condemn, ignore, parody, or revive it.

The canonical illustrations: Memory preserves that a flood occurred; Culture interprets it as sacrifice, negligence, punishment, warning, or rebirth. Memory preserves a discontinued ritual's description; Culture decides whether it is revived and what it now means. Memory preserves several accounts; Culture decides which becomes prestigious. Because record and meaning are separate, a cultural form can preserve the *emotional* memory of an event while altering every *factual* detail Memory keeps — and both remain true in their own layer (Section 18). Collective memory and culture are never merged into one undifferentiated system.

---

## SECTION 25 — TECHNOLOGY INTERFACE

Integrating tightly with `TECHNOLOGY_SYSTEM.md`. **Technology owns live capability** — experimentation, prototypes, reproducibility, production, maintenance, adoption, and loss/rediscovery *as capability processes*. **Memory owns the record** — invention records, named inventors, experiment documentation, failed variants, technical theory, embodied-practice descriptions, production requirements, maintenance instructions, standards, infrastructure maps, adoption history, accident records, decommissioning history, and the provenance of recovered schemas.

The interface is the concrete home of Technology's technique heritage `H_tech` (`TECHNOLOGY_SYSTEM.md` Sections 4, 15, 20): the heritage *record* is Memory State; the live *capability* is Technology's. **A preserved technical record never implies readable notation, available materials, living skill, active institutions, production capability, or safe reproduction.** A civilization may hold a perfectly accurate manual it cannot read, for a machine it cannot build, from materials it no longer has. A recovered blueprint exposes a possibility (Section 20); `TECHNOLOGY_SYSTEM.md` decides whether reactivation across the possibility gradient actually succeeds. Memory provides evidence and provenance; it never restores capability.

---

## SECTION 26 — ECOLOGY INTERFACE

`ECOLOGY_SYSTEM.md` owns biological succession, habitats, organisms, environmental transformation, damage, recovery, and material ecological traces. **Memory owns the recorded ecological history**: formal surveys, historical habitat maps, records of vanished local ecologies, evidence preserved in ruins/sediments/growth patterns/crystals/roots, remembered environmental disasters, preserved earlier landscape descriptions, and rediscovered ecological observations.

The distinctive feature of this interface is **unintentional recording**: ecology produces natural evidence without meaning to record anything. Crystal growth rings preserve a pollution history; mycelial scars reveal an abandoned settlement; changed migration lines preserve evidence of an old lighting disaster (`CULTURE_SYSTEM.md` Scenario 4; `TECHNOLOGY_SYSTEM.md` Scenario 9); buried root structures reveal earlier infrastructure. Memory *interprets these traces as historical evidence* (Section 13), and their yield to the vault-breach discoveries of `ECOLOGY_SYSTEM.md` Section 7 is a Memory-State append. But Memory never resolves ecological truth independently of Ecology, and ecological memory never automatically restores an ecology — it preserves evidence and context that a restoration effort, owned by Ecology, might then use.

---

## SECTION 27 — ECONOMY, LEARNING, GOVERNANCE, AND ERA INTERFACES

Four boundaries to reserved or undefined domains; Memory defines the edge and invents none of their internals.

**Economy** (`ECONOMY_SYSTEM.md`, placeholder; no market or currency — `SIMULATION_SYSTEMS.md` Section 20). Economy may affect material support for archives, preservation labor, distribution of copies, access inequality, institution survival, scarcity of preservation materials, and heritage commercialization. Memory emits preservation demand, archival-labor demand, access inequality, heritage-site status, restoration need, provenance value, and institutional dependency *as conditions*; it decides no allocation, ownership, production, exchange, or price.

**Learning Integration** (`LEARNING_INTEGRATION.md`, placeholder). Memory receives **no raw telemetry** (`SIMULATION_SYSTEMS.md` Section 22), only validated signals: that a major learning milestone occurred, a long project completed, a discipline became historically significant, an interdisciplinary breakthrough drove a domain transition, or a study period produced a protected user-linked legacy anchor. Memory turns these into civilizational traces — a dated archive layer, a named historical period, a monument candidate, an institutional founding record, a remembered age of discovery, an attributed transformation. **Study is never a currency, and not every study session is a major historical event** (`GAME_DESIGN.md` Section 9, Honesty; Section 11, Principle 2).

**Governance** (undefined; no governance document exists). Memory models the historical *fact* of governance acts — an institution classifying a record, an authority promoting an official history, a censorship campaign, a monument removal, competing official narratives — and owns which records became accessible or inaccessible and the provenance of alterations. `CULTURE_SYSTEM.md` owns the legitimacy; a future governance domain owns policy, law, coercion, and authority.

**Era Progression** (`ERA_PROGRESSION.md`, placeholder). Memory records era transitions as foundational legacy anchors and inflects its media and institutions by era (Section 29); it emits no gating signal beyond the historical record of the transition, and era gating is owned entirely by `ERA_PROGRESSION.md`.

---

## SECTION 28 — ETERNAL NIGHT AS A MEMORY MEDIUM

Permanent night shapes how the civilization records and remembers, in medium and in metaphor (`VISION.md`; `NOCTIS_ECOLOGICAL_ENGINE.md`; `ART_DIRECTION.md`). Memory is carried through controlled light sequences, photophore patterns, crystal refraction, tactile knot systems, biosilicate inscription, resonant vibration, mycelial growth encoding, the spatial arrangement of lights, constellation references, dark-preserved ruins, and recurring ecological glow cycles — all heatless, all night-native.

The night gives the domain its figures of meaning: a remembered event as a light that remains; forgotten history as unmarked dark; archives as constellations; lineages as connected glow-paths; distortion as refracted light; rediscovery as relighting an old route; contested history as overlapping signal patterns. **But light is never equated with moral truth.** Darkness in Noctis memory may mean privacy, protection, respectful silence, missing knowledge, ecological continuity, sacred absence, or deliberate concealment — and a thing recorded in light may be a lie, while a thing kept in darkness may be a mercy. The contrast of light against dark is the civilization's way of remembering; it is not a moral scoreboard.

---

## SECTION 29 — MEMORY ACROSS THE FIVE ERAS

The five canonical eras (`SIMULATION_SYSTEMS.md` Section 15) are capability envelopes for *how* the civilization can record and remember — never guaranteed fixed archive packages, and never a march toward perfect recall. Gating is deferred to `ERA_PROGRESSION.md`.

- **`SPORE_HEARTH`** — memory may be embodied, household-based, tactile, ecological, tied to route, place, elder, object, repetition, and shared witnessing. Early memory is intelligent and can be reliable; it is never portrayed as inherently primitive or false.
- **`CRYSTAL_INSCRIPTION`** — memory may become externalized, catalogued, institutional, copied, and authenticated, linked to scholarship, guilds, archives, and the first monument traditions.
- **`PHONONIC_SUBTERRANEAN`** — memory may face mass documentation, standardization, industrial and worker records, bureaucratic preservation, infrastructure archives, institutional secrecy, and a historical scale beyond personal comprehension.
- **`OPTOGENETIC_CIRCUIT`** — memory may become networked, abundant, searchable, algorithmically prioritized, easily copied, and hard to contextualize, vulnerable to infrastructure dependency and shaped by automated curation and access inequality. **More records do not mean better understanding** — the era's signature memory problem (Scenario 13).
- **`COSMIC_STELLAR`** — memory may confront extreme duration, distant settlements, divergent calendars, altered bodies, artificial minds, edited recollection, distributed and entangled archives, reconstructed ancestry, and disagreement over whether copied memory is lived memory (Section 30).

**Later eras do not solve memory; they pose larger and harder memory questions.** The Optogenetic archive drowns in context-poor abundance; the Cosmic archive fractures across distance and duration. The night keeps its unmarked dark in every era.

---

## SECTION 30 — ARTIFICIAL MEMORY AND COSMIC-ERA QUESTIONS

The last era raises questions Memory *models* but never *answers*. It asserts no unresolved metaphysics as canon (matching `CULTURE_SYSTEM.md` Section 31). It supports the debates around copied memories, artificial citizens, shared memory networks, edited recollection, restored personalities, memory continuity across bodies, whether an exact record equals an experience, whether an artificial mind can testify, whether two copies possess the same past, whether forgetting is necessary for identity, whether perfect recall is desirable, and whether civilization-scale memory threatens privacy.

Memory models the *records, provenance, continuity-claims, disputes, access, and historical consequence* of these situations; `CULTURE_SYSTEM.md` and `CITIZEN_SYSTEM.md` interpret identity and meaning. Whether a copied memory "counts" as personal continuity, or an artificial mind's testimony is trustworthy, is a contested historical and cultural question the domain keeps open (Scenarios 18, 19). Memory declares no verdict unless higher canon already has.

---

## SECTION 31 — PLAYER-FACING EXPRESSION

The user perceives memory through the world, never through a giant event log, obeying `GAME_DESIGN.md` Section 8 and the handoff law of `SIMULATION_SYSTEMS.md` Section 23. The three canonical memory features of `GAME_DESIGN.md` Section 9 are this domain's primary surface:

- **Ancestral Vault Memories** — root expansion breaches a buried vault (`ECOLOGY_SYSTEM.md` Section 7); a data shard is carried in procession to the scriptorium; a permanent, dated archive entry is written from the user's real study goals and activity of that week — in-world a new tactile scroll, on the glass a short, quiet, readable passage.
- **Monument Construction** — a completed real milestone raises a permanent, uniquely-lit landmark (Section 14).
- **Citizen Lore Logs** — a captured semaphore routine becomes a durable eyewitness vignette (Section 15; `CITIZEN_SYSTEM.md` Section 10).

Beyond these, memory surfaces as layered maps, ruins, museum displays, memorial objects, biographies, restored technical diagrams, contradictory accounts, timeline fragments, changed place-marks, inherited objects, anniversary gatherings, visible reuse of old infrastructure, recovered records, and settlement retrospectives (`ART_DIRECTION.md`). The archive must feel like *the place where the user's learning has become history*.

The **Rules of Memory** (`GAME_DESIGN.md` Section 9) bind every player-facing memory artifact, and this document adopts them as domain law: **Permanence** (nothing generated is ever deleted, decayed, or overwritten by the simulation — the active layer may change access and meaning, but the artifact and its provenance persist); **Honesty** (every memory derives from real user activity; no fictional filler milestones); **Intimacy** (memory content is private to the user by default; a personal archive, not a social feed); **Restraint** (quiet, dignified, specific language; no confetti, no history points, no completion bars, no collectible cards); **Empathy in hard weeks** (failure-heavy periods, shock waves, and long absences are remembered as weathering and endurance, never as shame). Forbidden absolutely: exhaustive notification feeds, milestone popups, lore-card collections, completion percentages, history/archive currencies, an omniscient encyclopedia, and any demand that the user manually save the civilization.

Distinct player-facing horizons must be kept separate (Section 3): what the interface shows is not simulation truth, not full citizen knowledge, and not the whole record. The user does not automatically know the true origin or full meaning of any monument, ruin, or account — they read the archive as a visitor to a real, partly-legible past.

---

## SECTION 32 — USER AGENCY

The user may study, witness, inspect, compare records, revisit old periods, notice contradictions, preserve through canon-approved high-level Study OS interactions, and interpret — without forcing citizen belief. The user may **not** rewrite historical facts, delete disliked events, choose the official history, spend anything to restore records, select which citizen becomes famous, assign archivists, force citizens to remember, purchase monuments, or control cultural interpretation. The user is witness, source of possibility, quiet influence, reader of accumulated history, and participant in continuity — never the civilization's propaganda authority (`VISION.md`; `GAME_DESIGN.md` Section 2). The past belongs to the civilization; the user's power over it is only the power to have lived and studied in ways that gave the civilization more past to keep.

---

## SECTION 33 — TEMPORAL EVALUATION

Memory inherits its relationship to time entirely from `SIMULATION_SYSTEMS.md` Sections 3–4: event-driven, lazy, no ticking. **There are no memory-decay loops, no archival timers, no real-time deterioration, no scheduled forgetting, and no hidden countdowns.** Memory changes only during meaningful committed evaluations. Its time scales are different threshold quantities on one lazy schedule: **immediate** (witness formation, record creation, first attribution, emergency documentation); **short-term** (copying, verification, public awareness, institutional response, dispute formation); **medium-term** (archival consolidation, monument creation, narrative stabilization, classification, context loss, access restriction); **generational** (reinterpretation, myth formation, genealogy, revision, forgetting, revival, rediscovery); and **era-scale** (changes in recording media and archive institutions, altered concepts of truth, civilization-wide historical identity, debates over memory and personhood). Between evaluations, memory state holds; the archives the user sees during quiet minutes are the renderer breathing over a constant state, not records deteriorating on a clock.

---

## SECTION 34 — DETERMINISM AND EXPLAINABILITY

Every major memory outcome is causally reconstructable (`SIMULATION_SYSTEMS.md` Law 1). The simulation can always answer why an event was recorded, who witnessed it, why one account survived and another became inaccessible, why citizens believed one version, why an institution disputed a claim, why a monument was raised, why context was lost, why a record was rediscovered, why the rediscovery changed awareness, and why the same event means different things in different settlements.

Seeded deterministic variation (`SIMULATION_SYSTEMS.md` Section 11) may influence which qualified witness records, which qualified copy survives public transmission, which archive fragment is found first, minor copying drift of non-protected detail, and which local account gains initial attention — always among causally qualified possibilities, always reproducible from committed state. Seeded variation may **never** change what actually happened, erase protected legacy, create evidence without a source, arbitrarily select an official truth, invent universal public belief, or cause absence-driven forgetting. The archive may keep its origins mysterious to the user (Section 31); it is never arbitrary underneath.

---

## SECTION 35 — EXAMPLE SCENARIOS

Each traces event → witnesses/traces → record → provenance → preservation → transmission → access → interpretation → distortion/dispute → later consequence → rediscovery or obscurity → protected legacy → cross-domain ownership. All are deterministic and seeded; none adds an exception to the model.

**1 — A household event becomes historically important.** A `SPORE_HEARTH` household's private way of marking the moss-tending (`CULTURE_SYSTEM.md` Scenario 1) is recorded only in a knot cord. Generations later the practice spreads and its origin is sought; the cord, surviving in the household repository, becomes the earliest evidence and the household historically significant. Legacy: the cord's provenance, permanent; Culture owns what the revival now means.

**2 — Two witnesses, one disaster, contradictory accounts.** A rift collapse is recorded by an upstream survey instrument (blaming a fault) and a downstream valve-keeper's testimony (blaming neglect). Both enter the archive; `contestation` is high; `confidence` on cause stays *disputed*. Ecological traces later support one — or never resolve it (Section 21). Provenance of *the collapse* was never in doubt; only its cause.

**3 — A famous inventor over-credited.** A technique produced by several citizens (`TECHNOLOGY_SYSTEM.md` agency, `CITIZEN_SYSTEM.md` Section 8) is recorded, via a seeded prominent-witness selection and institutional framing, under one name. The record is durable and partly false; a private log naming the others survives, misclassified. Biography here is attributed, not verified (Section 15).

**4 — A manual outlives its skill.** An inscription-craft's manual is faithfully preserved in a crystal lattice, but automation ended the apprenticeship (`TECHNOLOGY_SYSTEM.md` Scenario 8) and no one reads the notation. The record's `confidence` is high, its `access` (interpretability) near zero. Memory holds the evidence; Technology owns that the capability is lost.

**5 — Rediscovered infrastructure, partly understood.** Repair crews breach an abandoned phononic works. Memory restores the site's provenance and surfaces its infrastructure map; but the map's notation is half-legible and its materials gone. Rediscovery restores evidence and context (Section 20), not capability — Technology decides the (failed, for now) reactivation.

**6 — An ecological scar contradicts official history.** An institution's narrative credits a settlement with careful stewardship; crystal growth rings preserve a pollution spike from that very period (Section 26). The trace enters the record as evidence conflicting with the official account; `contestation` rises; the institution's legitimacy becomes a Culture problem (`CULTURE_SYSTEM.md`).

**7 — A ritual keeps the feeling, loses the facts.** A mourning observance preserves the emotional memory of a lost work-crew for centuries while its factual details drift through ritual repetition (Section 18). Memory holds the drifting versions and the true provenance; Culture owns the living rite (`CULTURE_SYSTEM.md` Section 24).

**8 — A monument changes meaning across eras.** A monument raised to celebrate an invention is, eras later, read as a warning about that invention's ecological cost (`CULTURE_SYSTEM.md` Section 24). Memory records origin and every reinterpretation; the monument keeps its residual glow and true provenance throughout (Section 14).

**9 — A suppressed record survives privately.** An authority removes public copies of an account and strikes it from curricula (Section 19). A household keeps a copy. The gap in the official catalogue is itself recorded. A later generation rediscovers both the account and the evidence of its suppression.

**10 — A learning milestone becomes a legacy anchor.** The user finishes a long real project; `LEARNING_INTEGRATION.md` emits a validated milestone; Memory commits a protected heritage anchor — a dated archive layer and a monument candidate — written honestly from that week (Section 27; `GAME_DESIGN.md` Section 9). It is permanent beneath any later in-world forgetting (Section 32).

**11 — A forgotten settlement rediscovered by ecology.** Mycelial scars and buried roots reveal an abandoned settlement no living citizen remembers (Section 26). Root expansion breaches its vault (`ECOLOGY_SYSTEM.md` Section 7); its provenance re-enters awareness. Who it belonged to becomes a fresh contested question.

**12 — Two regions, two memories of one migration.** A migration is remembered upstream as flight from disaster and downstream as invasion (Section 22; `CULTURE_SYSTEM.md` Scenario 6-analog). Both public memories are durable and incompatible; the committed truth underlies both; neither is forced to yield.

**13 — A network archive, abundant and context-poor.** In `OPTOGENETIC_CIRCUIT`, an archive holds immense searchable record but automated curation has stripped context and prioritized misleading fragments (Section 29). `awareness` is high, `confidence` and interpretability low. More information, less understanding.

**14 — A younger generation restores a disgraced figure.** A citizen recorded as a villain is, generations on, rehabilitated by a movement reading the same archive differently (`CULTURE_SYSTEM.md` Section 17). Memory keeps both the condemnation and the rehabilitation and their provenance; Culture owns which now holds prestige.

**15 — A lost technology rediscovered, not yet usable.** A recovered blueprint schema (`ECOLOGY_SYSTEM.md` Section 7) restores the *record* of a lost technique. Memory exposes the possibility; Technology finds materials and skill still missing, so the capability stays dormant (Section 25; `TECHNOLOGY_SYSTEM.md` Scenario 5).

**16 — A biography reconstructed from biased fragments.** An early figure's life is rebuilt from a proud household chronicle, a hostile guild record, and a fragmentary genealogy (Sections 15, 16). The reconstruction is confident, incomplete, and contested; missing periods remain dark.

**17 — An institution preserves a procedure it no longer understands.** A safety procedure survives as institutional ritual after its rationale is forgotten (`CULTURE_SYSTEM.md` Section 30-analog; Section 30 here). The record of *what* to do persists; the record of *why* is lost; the procedure works anyway, until conditions change.

**18 — A cosmic dispute over copied memory.** Entangled-lattice reconstruction of a citizen's memories (`TECHNOLOGY_SYSTEM.md` Scenario 8) provokes a dispute: is the copied past personal continuity? Memory holds the records and the continuity-claims and the dispute; it declares no verdict (Section 30).

**19 — Distrusted artificial testimony.** An artificial mind offers historically valuable, accurate testimony that citizens distrust on principle. Memory records the testimony, its provenance, and the distrust; whether it counts as a witness is a contested cultural question (Section 30).

**20 — Return after long absence.** The user is away for weeks. Active remembrance quiets — gatherings sparse, public memory still. **Nothing is lost:** every vault entry, monument, biography, and heritage anchor is preserved exactly; the first ten-minute session relights the archive's civic life (`SIMULATION_SYSTEMS.md` Section 5; `GAME_DESIGN.md` Section 9, Permanence). The past waited.

---

## SECTION 36 — FAILURE MODES AND EDGE CASES

Each resolves to a lawful state, never an exception:

- **No living witness remains** — the record, if made, persists; else only traces (Section 13).
- **Only ecological evidence** — Memory interprets traces as evidence; cause may stay *uncertain* (Section 26).
- **Records sharing one false source** — high distribution, low independence; `κ_authenticate` does not mistake copies for corroboration (Section 11).
- **A true record culturally rejected / a false account dominant** — record and belief diverge (Sections 3, 6); both persist.
- **A monument without readable inscription / an archive no one can interpret** — `access` (interpretability) near zero, provenance intact (Section 5).
- **A technical archive without capability / a ritual without remembered origin** — record survives, live thing lost (Sections 25, 17).
- **An institution knowingly keeping contradictory versions** — legitimate; `contestation` recorded (Section 21).
- **A citizen credited for shared work** — attributed, not verified biography (Section 15).
- **An accurate record that is emotionally irrelevant / a weak myth that is powerful** — salience and truth are independent (Sections 6, 18).
- **Too much information to contextualize / automation prioritizes misleading records** — the Optogenetic problem (Scenario 13).
- **A recovered record threatens institutional legitimacy** — a Culture/governance tension; Memory keeps the record regardless (Sections 19, 24).
- **Two settlements claim one figure / ecological evidence contradicts testimony** — durable contradiction (Section 21).
- **A record translated repeatedly / a private memory surfacing generations later** — version lineage tracked; provenance intact (Sections 18, 23).
- **A permanently uncertain fact** — irreducible in-world uncertainty is a valid state (Section 21).
- **A copied memory with no clear original owner** — a cosmic continuity dispute (Section 30).
- **A technology remembered but unbuildable / citizens choosing not to revive a discovered practice** — capability and revival are owned elsewhere (Sections 25, 24); Memory holds the possibility, the world declines it.
- **The user stops studying for a long time** — active remembrance quiets; **no protected history is ever deleted, no legacy anchor lost, no punishment applied** (`SIMULATION_SYSTEMS.md` Laws 5, 6; Scenario 20).

---

## SECTION 37 — INPUTS AND OUTPUTS

**Memory receives** (across committed evaluations): committed domain transitions from every domain; major ecological events and traces; citizen testimony and biographies (via the lore-capture handoff); institutional formation and collapse; technological invention, failure, and decommissioning; cultural formation, suppression, and revival; migration; era transitions; ruins and artifacts; validated learning milestones; archival discoveries (vault breaches); and governance-pressure and economic-preservation *candidates*.

**Memory produces** interpretable, typed outputs — never a generic "memory modifier": historical provenance; archived event records; record confidence; accessibility context; preservation demand; contradiction state; rediscovery candidates; biography records; monument candidates; historical salience; public-awareness context; heritage references (the `H_tech` and cultural-heritage records other domains read); restoration context; evidence packages; disputed attributions; and record-version lineages. Every output names a specific historical state a consuming domain can read; none is a hidden buff, and Memory resolves no other domain's outcome.

---

## SECTION 38 — INVARIANTS

Hard rules; a proposed memory mechanic that violates any is invalid at birth and redesigned from the constraint up.

1. **What actually happened is never rewritten;** protected historical provenance is immutable (`SIMULATION_SYSTEMS.md` Laws 4, 5).
2. **User absence never deletes history** and never punishes (`SIMULATION_SYSTEMS.md` Law 6; Section 32).
3. **A record is not truth; truth is not public belief; public belief is not cultural meaning** (Sections 3, 6).
4. **Recorded history is distinct from active knowledge; access from preservation; preservation from interpretation** (Section 5).
5. **A technological record does not create technological capability** (`TECHNOLOGY_SYSTEM.md`; Section 25).
6. **A ritual is not automatically an accurate historical account** (Sections 18, 24).
7. **Memory may be incomplete, contested, fragmented, or inaccessible,** and some of it permanently uncertain (Section 21).
8. **Forgetting means loss of access, salience, context, transmission, or understanding — never deletion of protected legacy** (Section 17).
9. **Distortion must have a causal transmission or interpretation path** (Section 18).
10. **Major records require provenance** (Section 11).
11. **Seeded variation may choose among qualified witnesses or surviving variants but never change underlying facts** (Section 34).
12. **The domain adds no new engine event flags;** memory changes are committed-state transitions (`SIMULATION_SYSTEMS.md` Section 12).
13. **Memory never resolves Culture, Technology, Ecology, Economy, Citizen, Governance, or Era Progression** (Section 4).
14. **The user cannot rewrite the past** and is never the civilization's propaganda authority (Section 32).
15. **History remains locally plural;** civilization-wide memory never erases local memory (Sections 8, 22).
16. **Later eras do not achieve perfect historical truth;** more information does not mean better understanding (Section 29).
17. **Permanent night materially shapes memory media and metaphor;** light is never moral truth (Section 28).
18. **The archive must feel like the place where the user's learning lives,** under the Rules of Memory (Section 31; `GAME_DESIGN.md` Section 9).

---

## SECTION 39 — AI GENERATION RULES

Any future memory feature must pass every rule, *after* clearing the tiered validation of `DOCUMENT_ARCHITECTURE.md`, the experience tests of `GAME_DESIGN.md`, the structural laws and Trope Guard of `ARCHITECTURE.md`, the physics of `SIMULATION_SYSTEMS.md` Section 12, and the peer-domain laws. A proposal that fails any rule is rejected and redesigned from the constraint up.

- **Rule 1 — Layer-distinct.** It must distinguish historical fact, record, access, and interpretation (Section 3).
- **Rule 2 — Provenance-preserving.** It must preserve immutable protected provenance and assign every record a causal source and a provenance (Sections 5, 11).
- **Rule 3 — Access ≠ preservation.** It must separate preservation from access and from understanding.
- **Rule 4 — Ownership-respecting.** It must resolve no other domain's outcome and must not restore technology, culture, or ecology automatically (Sections 4, 20).
- **Rule 5 — Seeded, not random.** Variation must select only among qualified possibilities and never alter facts (Section 34).
- **Rule 6 — No new engine flags, no lore-collection, no management, no punishment.** Committed-state transitions only; no collectible cards, currencies, or user maintenance; absence non-punitive (Sections 12-inv, 31, 32).
- **Rule 7 — Plural and night-shaped.** It must support local and contested memory and remain shaped by eternal night (Sections 22, 28).
- **Rule 8 — Horizon-preserving.** It must keep simulation truth, citizen knowledge, and user-visible information distinct (Sections 3, 31).

---

## SECTION 40 — DEFERRED QUESTIONS

Bound by future documents or implementation, under the contracts this file provides: the exact interpretation of raw study (`LEARNING_INTEGRATION.md`); the exact significance thresholds and all coefficient values (`θ_significance`, `ρ_copy`, `λ_access`, `κ_authenticate`, `θ_rediscover`), each carrying a canon citation, under the calibration constraints of `SIMULATION_SYSTEMS.md`; archive storage and schema (implementation); detailed governance and censorship mechanics (future governance domain); education and economic-support mechanics (`ECONOMY_SYSTEM.md` and future education); monument-production mechanics and the procedural generation of record text, biography, historical documents, and translation (`ART_DIRECTION.md`, Tier 8); the timeline, archive-search, and history-overlay UI, and all rendering, animation, and audio (`ART_DIRECTION.md`, Tier 8); and final era-gating (`ERA_PROGRESSION.md`). Each is a clean deferred contract, resolved with no arbitrary assumption here.

---

## SECTION 41 — VALIDATION CHECKLIST

- [x] Historical truth is distinct from memory — Sections 1, 3, 6.
- [x] Records are distinct from truth; public belief from records; cultural interpretation from Memory — Sections 3, 24.
- [x] Canonical provenance is immutable — Sections 5, 6.
- [x] Citizens can forget without deleting protected legacy — Section 17.
- [x] Records can survive without access; be accessible without being understood — Sections 5, 11.
- [x] Technological heritage survives without active capability — Section 25.
- [x] Rituals preserve memory while altering fact — Sections 18, 24.
- [x] Multiple accounts can disagree; contradictions can stay unresolved — Section 21.
- [x] Records can be suppressed without rewriting history, and suppression leaves evidence — Section 19.
- [x] Ecological traces preserve history; ruins carry multi-domain meaning — Sections 13, 26.
- [x] Personal recollection and durable record are distinct — Section 23.
- [x] Famous citizens can be misremembered; institutions can preserve self-serving history — Sections 15, 30.
- [x] Context can vanish while artifacts remain; rediscovery restores evidence, not practice — Section 20.
- [x] Different settlements remember one event differently — Sections 22, 35.
- [x] Seeded variation is bounded, reproducible, and fact-preserving — Section 34.
- [x] Changes are event-driven, not ticking; no new engine flags — Section 33; Section 38-12.
- [x] Absence is completely non-punitive — Sections 17, 32, 36.
- [x] No omniscient event log; no domain overreach — Sections 1, 4, 31.
- [x] Permanent night shapes media and metaphor — Section 28.
- [x] Later eras pose deeper memory problems, not perfect recall — Section 29.
- [x] The user cannot rewrite history but can discover and interpret it — Section 32.
- [x] Protected learning milestones are preserved permanently; the archive feels connected to real learning — Sections 27, 31.
- [x] User-visible history and simulation truth are kept separate — Sections 3, 31.
- [x] Concrete enough for implementation; Noctis feels like a civilization that has genuinely lived — the cumulative intent of the whole document.

---

## Closing Validation Statement

Every future memory concept for the Noctis Civilization Module must pass, in order: the Tier 1 test of `VISION.md`, the Tier 2 test of `ART_DIRECTION.md`, the Tier 3 test of `NOCTIS_ECOLOGICAL_ENGINE.md`, the experience tests of `GAME_DESIGN.md`, the structural laws of `ARCHITECTURE.md`, the physics of `SIMULATION_SYSTEMS.md`, and the domain laws of `ECOLOGY_SYSTEM.md`, `CITIZEN_SYSTEM.md`, `TECHNOLOGY_SYSTEM.md`, `CULTURE_SYSTEM.md`, and this document. Anything that fails is rejected and redesigned from the constraint up.

Memory in Noctis is what becomes of the past once it has happened. What the civilization truly did is kept forever and never rewritten; what it can currently reach, trust, recall, and mean is always in motion. Records outlast their readers; skills outlast their manuals or die before them; myths keep the feeling and lose the facts; monuments change their minds; the suppressed survive in a household cord; the forgotten wait in the dark to be relit. No settlement remembers the same night alike, and no era ever finishes remembering.

The user studies.

The world happens.

And the archive keeps it — honestly, unevenly, permanently — as the place where a learning life became a history.
