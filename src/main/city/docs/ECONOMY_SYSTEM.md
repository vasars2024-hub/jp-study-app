---
doc_id: noctis.economy_system
tier: 7
authority: domain_specification
role: economy_domain_blueprint
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
---

# Noctis Civilization Module — Economy System

## Document Status And Authority

This document is the economy domain blueprint of the Noctis civilization simulation: the Tier 7 specification of how the civilization coordinates its limited material, energy, skill, time, infrastructure, and attention so that its people and institutions can keep living. It is the domain that answers *why the civilization can and cannot do what it can and cannot do* — why one settlement holds a technology another lacks, why standing infrastructure decays for want of upkeep, why a reproducible invention still cannot spread, why one district's lights are dim while its neighbor's are bright.

It sits beneath the full canon, the technical architecture, the simulation physics, and the five peer domains already written, and may never contradict any of them:

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
ECONOMY_SYSTEM.md              Tier 7 — Economy Domain Blueprint (this file)
```

In the per-evaluation dependency topology of `SIMULATION_SYSTEMS.md` Section 13, Economy is a coordination layer sitting downstream of ecology, citizens, and technology (it allocates what they make possible) and upstream of the era system and of much citizen and cultural experience (it conditions what people can reach). This document specializes the Economy Contract of `SIMULATION_SYSTEMS.md` Section 20; it may specialize the physics, and it may never override it. It honors the economy-boundary pointers already written into `CITIZEN_SYSTEM.md` Section 6, `CULTURE_SYSTEM.md` Section 25, `TECHNOLOGY_SYSTEM.md` Section 15, and `MEMORY_SYSTEM.md` Section 27.

### The Identity Guardrail

Economy in Noctis is **not a currency system**, not a market, not a shop, not a production game, not a resource bar, not a trade-route minigame, and not something the user optimizes. There is no money, coin, price the user pays, wage, tax menu, budget, building cost, production queue, or inventory. The user never buys infrastructure, assigns workers, sets prices, moves resources, chooses production priorities, balances a budget, places a district, or manages a stockpile (`GAME_DESIGN.md` Section 1; `SIMULATION_SYSTEMS.md` Section 20; the forbidden tokens `coin, gold, xp, score, build, construct, zone` of the `ARCHITECTURE.md` Trope Guard). The civilization handles its own internal coordination, and the user's role is unchanged from the rest of the module: source of learning-derived possibility, witness, quiet influence, archivist, participant in continuity — never economic ruler.

The absence of user-facing money must not make the economy vague or decorative. The civilization still lives under real material and energy constraints, real labor and skill, real production and maintenance, real distribution and access, real surplus, shortage, dependency, and inequality. Economy is what makes those constraints legible and causal without ever handing the user a spreadsheet.

### What This Document Binds — And What It Refuses To Bind

**Binds:** the economy philosophy and its vocabulary ladder; the abstract economy-state projection and its active-capacity / economic-heritage split; needs and provision; production, labor, allocation, exchange-without-currency, scarcity, maintenance, distribution, ownership/stewardship, and inequality models; economic institutions; the interfaces to ecology, citizens, technology, culture, and memory; era economic behavior; the coefficient families of the economy domain, each named symbolically with its binding constraint and canon citation.

**Refuses to bind:** every numeric coefficient and threshold *value* (named here as constrained symbols; bound at implementation under the calibration constraints of `SIMULATION_SYSTEMS.md` and this file, each carrying a canon citation); the exact field identifiers of the state schema, any storage schema, or any code; any allocation *formula* or institution-generation rule beyond its constraint; the interpretation of raw study (`LEARNING_INTEGRATION.md`); citizen psychology, decision, and life cycle (`CITIZEN_SYSTEM.md`); technological invention and reactivation (`TECHNOLOGY_SYSTEM.md`); ecological outcome resolution (`ECOLOGY_SYSTEM.md`); cultural meaning and legitimacy (`CULTURE_SYSTEM.md`); the historical record (`MEMORY_SYSTEM.md`); formal law, taxation, legal ownership enforcement, and political authority (a future governance domain); the era-transition gate (`ERA_PROGRESSION.md`); and all rendering, UI, and presentation (`ART_DIRECTION.md`, Tier 8). Economy resolves *material coordination*; the other domains own everything the coordination is made of and about.

No numeric anchors appear in this document beyond the three the canon itself locks: the three-consecutive-day consistency trigger, the five-day absence horizon, and the ten-minute reawakening session (`NOCTIS_ECOLOGICAL_ENGINE.md` section 7).

### Notation

Notation follows the siblings. Economy reads canonical state and the outputs of its peers: the metabolic energy reserve `E` and capacity `C_E` (`SIMULATION_SYSTEMS.md` Section 6), nutrient reservoirs, era designation and per-era efficiency `η_era` (`TECHNOLOGY_SYSTEM.md`), infrastructure vitality `V_infra` and dependency load `D_load` (`TECHNOLOGY_SYSTEM.md`), population `P` and activity `A_P` (`CITIZEN_SYSTEM.md`), and ecological availability (`ECOLOGY_SYSTEM.md`). It introduces its own bounded, per-*group* and per-*good* signals: `sufficiency ∈ [0,1]` (whether a need can be met), `access ∈ [0,1]` (whether a given group can actually use what exists), `scarcity` and `bottleneck` descriptors, and `inequality` as a *dispersion* across groups, never a single wealth number. Seeded deterministic selection is written `select(seed, S, context)` — a pure function of committed state, never randomness (`SIMULATION_SYSTEMS.md` Section 11). Named constants carry their constraints here and their values at implementation time.

---

## SECTION 1 — ECONOMY PHILOSOPHY

### Economy Is Coordination Under Limit

Economy is how the civilization coordinates limited material, energy, skill, time, infrastructure, and attention so that people and institutions can keep living. It is not the *making* of value — ecology grows the substrate, technology makes it workable, citizens do the work, learning powers it all — but the *coordination* of it: deciding, through the civilization's own institutions and customs, what gets produced, maintained, moved, stored, and reached, by whom, under what limits. Every other domain provides capabilities; Economy is why those capabilities are or are not *actually available* to a given household, profession, district, or settlement at a given time.

### Learning Is Still The Only Source

The deepest law, inherited from `SIMULATION_SYSTEMS.md` Sections 8, 9, and Law 7: **no internal economic loop creates primary value from nothing.** Citizens and institutions may transform, allocate, maintain, distribute, combine, store, and conserve value; they may never mint primary learning-derived energy, knowledge, or material from within the world. The civilization's entire active energy budget traces to the user's metabolized focus (`SIMULATION_SYSTEMS.md` Section 6; the Stellar Guard of Section 9). This is the anti-idle guarantee stated economically: there is no passive income, no self-feeding production engine, no economy that runs while the mind that feeds it is idle. Economy coordinates a budget it never prints.

### Real, But Never A Game The User Plays

Economy must be causally real — it must genuinely explain access differences, maintenance decline, scaling limits, dependency, and inequality — while never becoming a system the user operates or optimizes (`GAME_DESIGN.md` Section 11, Principle 2). The two commitments are compatible because the economy resolves itself: its tensions (maintenance versus expansion, this district versus that, craft versus scale) are settled by the civilization's own institutions and history, never by a user decision. The user studies; the civilization coordinates; and the coordination is visible only as the texture of a world that plainly has to make do with what it has.

---

## SECTION 2 — WHAT ECONOMY IS: THE VOCABULARY LADDER

Economy refuses to blur its terms. Each is distinguished, with its owner named:

- **Need** — something a group requires to keep living (sustenance, illumination, shelter, medicine, upkeep). The demand-side ground of the domain (Section 5).
- **Demand** — an expressed or latent requirement for a good, service, or capability.
- **Material / energy requirement** — the physical and metabolic inputs a process needs (from Ecology and from the learning-derived reserve).
- **Labor / skilled labor** — citizen activity directed at sustaining the civilization; skill is scarce and uneven (Section 7). Citizens are actors, never units (`CITIZEN_SYSTEM.md` Section 8).
- **Productive capacity** — what the civilization can currently produce, at what scale, with existing technology, skill, institutions, and infrastructure (Section 6).
- **Production / transformation** — turning inputs into usable goods or services (Section 6).
- **Maintenance / repair** — sustaining existing capability against wear; a central, first-class economic activity (Section 11).
- **Allocation** — directing limited inputs and attention among competing uses (Section 8).
- **Distribution / access / availability** — moving production to use, and whether a given group can actually reach it (Sections 12, 14). Possession is not access.
- **Ownership / stewardship / commons / provision** — the arrangements by which things are held, cared for, and made available (Section 13).
- **Exchange / reciprocity / gifting / obligation** — how value moves between parties without a market (Section 9).
- **Surplus / shortage / scarcity / reserve / storage** — the states of having more than, less than, or banked against need (Section 10).
- **Waste / recycling** — unrecovered and recovered byproduct (efficiency < 1, `SIMULATION_SYSTEMS.md` Section 9).
- **Dependency / bottleneck** — reliance on a fragile material, specialist, institution, or infrastructure, and the single point that limits a whole system (Sections 10, 13-analog).
- **Specialization / redundancy / resilience** — concentration of capability, its backups, and the system's ability to absorb disruption.
- **Inequality** — differences in access, burden, security, and opportunity across groups; multidimensional, never one score (Section 14).
- **Economic institution** — a durable coordinator of production, maintenance, distribution, or provision (Section 15).
- **Supply relationship** — a standing dependency between producers and users, often between settlements (Sections 12, 15).
- **Infrastructure / maintenance burden** — the standing cost, in labor/material/energy/attention, of keeping built systems working (Sections 11, 12).
- **Productive tradition / economic heritage** — the inherited way of coordinating, and the recorded memory of past systems (Section 4; owned with Culture and Memory).

Every later section is the physics of how a capability becomes an availability — or fails to.

---

## SECTION 3 — DOMAIN OWNERSHIP

Specializing `SIMULATION_SYSTEMS.md` Sections 14 and 20.

**Economy owns:** production capability *as an economic condition* (what can actually be made, at scale); allocation of available materials, energy, and labor; distribution and access; scarcity and sufficiency; supply relationships; labor demand and skill bottlenecks *as economic pressures*; maintenance allocation; storage and reserves; household, institutional, and civic provision; ownership or stewardship arrangements where canon allows them; exchange and reciprocity; economic inequality; regional economic dependency; productive specialization; economic resilience; resource conflict *as an allocation condition*; the economic consequences of technology and ecology; and the economic-readiness contribution to Era Progression.

**Economy does not own:** raw learning telemetry (`LEARNING_INTEGRATION.md`); knowledge generation, technological invention, and prototype success (`TECHNOLOGY_SYSTEM.md`); ecological growth, damage, and outcome (`ECOLOGY_SYSTEM.md`); citizen decision and psychology (`CITIZEN_SYSTEM.md`); cultural meaning and legitimacy (`CULTURE_SYSTEM.md`); the historical record (`MEMORY_SYSTEM.md`); formal political law, taxation, and legal ownership enforcement (a future governance domain); era gating (`ERA_PROGRESSION.md`); and visual presentation (`ART_DIRECTION.md`, Tier 8). Every economic output is an interpretable condition or pressure — a sufficiency, an access, a bottleneck, a demand — never a generic bonus and never a number the user pushes.

---

## SECTION 4 — CONCEPTUAL STATE MODEL

The economy domain's state is an abstract **projection** over canonical state and the outputs of its peers. It is categories, not a schema.

```
EconomyState  (a projection over canonical state and peer-domain outputs)
{
  materialAvailability   usable material flows currently supported by ecology and
                         technology (reads ECOLOGY, TECHNOLOGY) — active

  energyAvailability     the learning-derived metabolic energy available for
                         active processes (reads E, C_E; bounded by learning) — active

  productiveCapacity     what can be produced, at what scale, given technology,
                         skill, institutions, infrastructure (η_era, V_infra) — active

  laborSkillAvailability which work can be performed and where the bottlenecks are
                         (reads CITIZEN population, roles, skill) — active

  maintenanceCapacity    ability to preserve active infrastructure, institutions,
                         tools, archives, habitats (feeds V_infra) — active

  distributionReach      how effectively goods, materials, and services move
                         between settlements and groups — active

  accessStructure        who can actually use what exists, per group — active;
                         civilization-level possession never implies equal access

  reservesRedundancy     stored capacity and alternative supply relationships that
                         buffer disruption — active

  dependencyLoad         how many systems lean on fragile materials, specialists,
                         institutions, or infrastructure (D_load) — active

  scarcitySufficiency    whether needs are met under current conditions, per group — active

  inequality             dispersion of access, burden, security, and opportunity
                         across groups — active, never one wealth score

  economicHeritage       the recorded record of past production systems,
                         institutions, shortages, supply relationships, abandoned
                         industries, and earlier allocation models — LEGACY (with Memory)
}
```

### The Active-Capacity / Economic-Heritage Split

Specializing `SIMULATION_SYSTEMS.md` Section 10 (legacy vs active). **`economicHeritage` is legacy**: the recorded history of how the civilization once coordinated — its old industries, institutions, shortages, and supply routes — is permanent, held with Memory State (`MEMORY_SYSTEM.md`), never rewritten, never touched by absence. Everything else is **active capacity**: material and energy availability, productive capacity, labor, maintenance, distribution, access, reserves, dependency, sufficiency, and inequality all rise and fall through internal causality (`SIMULATION_SYSTEMS.md` Law 8) and quiet safely during user absence without any heritage being lost. The civilization always *remembers* the industry it abandoned; whether it can currently *run* one is a separate, living question.

### Derived, Not Exhaustively Simulated

Every category is a projection over committed state; this document adds *vocabulary*, never a hidden per-good or per-transaction loop that would balloon state or demand ticking (`SIMULATION_SYSTEMS.md` Section 2). Economy models **aggregate capacities, sufficiencies, and bottlenecks**, never individual items, transactions, or prices. A "shortage" is a group-scoped sufficiency reading, not a depleted inventory count.

### Coefficient Families

| Symbol family | Governs | Binding constraint | Canon source |
|---|---|---|---|
| `σ_alloc` | Allocation sufficiency from available inputs to competing needs | Bounded; total allocated never exceeds available (conservation) | `SIMULATION_SYSTEMS.md` Sections 9, 20 |
| `δ_reach` | Distribution reach per infrastructure and consistency | Monotone in `V_infra` and consistency; saturating; greater reach raises `D_load` | `TECHNOLOGY_SYSTEM.md` Sections 11, 17 |
| `θ_bottleneck` | Thresholds at which a scarce input limits a whole system | Determined by the scarcest necessary input, not the average | `SIMULATION_SYSTEMS.md` Section 9 |
| `μ_maint` | Maintenance allocation → `V_infra` sustainment | Competes with production for the same inputs; never absence-driven | `TECHNOLOGY_SYSTEM.md` Section 11 |
| `ε_recycle` | Recovery of byproduct into usable input | Strictly less than one, always | `ECOLOGY_SYSTEM.md` Section 9 |
| `ι_dispersion` | Spread of access/burden across groups (inequality) | Multidimensional; never collapsible to one wealth scalar | `SIMULATION_SYSTEMS.md` Section 20 |

No coefficient may ever be user-visible as a number to optimize, and no economic development may ever require a user decision (`GAME_DESIGN.md` Section 11, Principle 2; `SIMULATION_SYSTEMS.md` Law 10).

---

## SECTION 5 — NEEDS AND PROVISION

The civilization has categories of need — biological sustenance, shelter, illumination, sanitation, medicine, mobility, communication, education, maintenance, archival preservation, ecological stewardship, technical research, cultural activity, and institutional continuity. **Needs are never user-facing meters demanding management** (`GAME_DESIGN.md` Section 1). The economy resolves them internally through household provision, community coordination, professional institutions, shared infrastructure, civic provision, reciprocity networks, long-distance exchange, and technological systems (Sections 8–12, 15).

Two rules bind provision. **Not every need is always perfectly met** — unmet or partially-met need is legitimate economic content, producing substitution, rationing, inequality, or migration pressure (Section 10), never an automatic catastrophe. And **ordinary user absence is never interpreted as neglect causing suffering** — economic difficulty must always arise from internal civilization conditions (a bottleneck, a collapsed institution, an ecological shift), never from the user taking a break (`SIMULATION_SYSTEMS.md` Laws 5, 6). During absence, active provision quiets with the rest of the world and resumes intact on return; no one starves because the user was away.

---

## SECTION 6 — PRODUCTION

Production is the transformation of available material, energy, knowledge, labor, tools, and infrastructure into usable goods or services. It requires all of, distinctly: an ecological substrate (`ECOLOGY_SYSTEM.md`), technical capability (`TECHNOLOGY_SYSTEM.md`), living skill (`CITIZEN_SYSTEM.md`), appropriate tools, energy (learning-derived, bounded), coordination, maintenance, and distribution. The domain division is exact and already contracted:

- **Technology** decides whether a production process is *technically possible* (`TECHNOLOGY_SYSTEM.md` Section 6, the possibility gradient — *manufacturable* and *scalable* are its stages).
- **Ecology** decides whether the material and environmental conditions *exist* (`ECOLOGY_SYSTEM.md`).
- **Citizens** perform the *work* (`CITIZEN_SYSTEM.md` Section 8).
- **Culture** influences *legitimacy, prestige, work tradition, and willingness* (`CULTURE_SYSTEM.md`).
- **Economy** decides whether enough inputs can be *coordinated for production to occur at meaningful scale* — the binding question of feasibility.

There are **no production queues and no per-item modeling**. Economy works in aggregate productive capacities and bottlenecks: a settlement can grow a class of goods at some scale limited by its scarcest necessary input (`θ_bottleneck`), and the interesting economic facts are always about the limit, not the tally. A technology can be reproducible and still not producible here, because a required input — material, skill, energy, or coordination — is missing (Section 21; `TECHNOLOGY_SYSTEM.md` Section 11).

---

## SECTION 7 — LABOR AND PROFESSIONS

Labor is citizen activity directed toward sustaining, transforming, maintaining, teaching, caring, preserving, transporting, or organizing the civilization. **Citizens are not units, and the user assigns no work** (`CITIZEN_SYSTEM.md` Sections 4, 6; `GAME_DESIGN.md` Section 1). The boundary matches the pointer already written into `CITIZEN_SYSTEM.md` Section 6: **Citizen owns** personal role, skill, biography, decision, participation, relationships, and professional identity; **Economy owns** labor demand, skill shortage, regional labor pressure, maintenance burden, productive sufficiency, and institutional staffing *conditions*. Economy reads citizen participation and vocational function as input and coordinates its material consequences; it never staffs, commands, or optimizes a citizen.

Crucially, labor is **more than material output**. Care, teaching, maintenance, ecological tending, archival preservation, cultural labor, coordination, transport, research, repair, and household labor are all real economic activity, and none is reducible to a quantity of goods. A civilization can be materially productive and starved of maintenance labor, or rich in caretakers and short of cultivators. Reducing citizen contribution to output would erase exactly the distinctions this domain exists to keep (and would violate `CITIZEN_SYSTEM.md`'s roles-are-character rule).

---

## SECTION 8 — ALLOCATION

Allocation directs limited materials, energy, labor, maintenance, and institutional attention among competing uses (`σ_alloc`). Its mechanisms are plural and emergent — household custom, professional coordination, civic institutions, guild-like bodies, mutual obligation, common provision, negotiated exchange, inheritance, stewardship, emergency prioritization, and (later eras) automated coordination — and **no single universal allocation model spans all eras or settlements**. Two adjacent settlements may coordinate through utterly different arrangements, and this divergence is the economic face of the alternative-development paths of `TECHNOLOGY_SYSTEM.md` Section 19 and the plural cultures of `CULTURE_SYSTEM.md` Section 5.

The boundary with the neighboring domains is firm: **Culture** influences what citizens consider fair, legitimate, honorable, or unacceptable (`CULTURE_SYSTEM.md` Sections 8, 21); a **future governance domain** owns any compulsory or legal allocation; **Economy resolves the material consequence** of whatever arrangement holds. Allocation obeys conservation absolutely — total allocated never exceeds total available (`SIMULATION_SYSTEMS.md` Section 9) — so allocation is always a question of *priority under limit*, never of creating more to go around.

---

## SECTION 9 — EXCHANGE AND RECIPROCITY

Noctis supports exchange without a shop economy. Value moves through reciprocity, gifting, household sharing, professional obligation, institutional provision, negotiated transfer, long-term mutual dependency, regional specialization, redistribution, public access, and stewardship rights — **never through a universal currency, and never as user spending** (`SIMULATION_SYSTEMS.md` Section 20; `GAME_DESIGN.md` Section 6, resources are metabolic states not currencies).

The domain introduces **no prices** unless higher canon later explicitly permits an internal, abstract, non-user-facing valuation — and even then, such a valuation could only ever be a hidden coordination signal, and could never become user spending, coin accumulation, a shop, a trading minigame, or an optimization dashboard (the Trope Guard's `coin, gold, score` ban is absolute). Economic value is instead expressed through **access, scarcity, obligation, dependency, prestige (resolved by Culture), institutional priority, opportunity cost, and maintenance burden** — the real texture of how a civilization decides what it owes and to whom, without ever counting coins.

---

## SECTION 10 — SCARCITY, SHORTAGE, AND BOTTLENECKS

Scarcity is not automatically catastrophe. A scarce condition may produce substitution, rationing, delayed adoption, local specialization, repair culture, recycling, institutional prioritization, unequal access, innovation pressure (feeding `R` in `TECHNOLOGY_SYSTEM.md`), cultural conflict (`CULTURE_SYSTEM.md` Section 34), migration pressure, or ecological overuse (`ECOLOGY_SYSTEM.md`) — a whole field of adaptive responses before it ever becomes suffering.

The domain distinguishes the *kinds* of scarcity, because they demand different responses and mean different things: **absolute scarcity** (not enough exists anywhere), **distribution failure** (enough exists but cannot reach where it is needed), **skill shortage** (the material exists but no one can work it), **infrastructure bottleneck** (a single works or route limits everything downstream), **access inequality** (plenty overall, denied to a group), **temporary disruption**, and **single-point dependence** on one settlement, one institution, or one ecological substrate. The load-bearing consequences: **a civilization may hold enough material overall while one district still lacks access**; **a technology may be reproducible but economically impractical**; **a record may be preserved but inaccessible because archival labor is unavailable** (`MEMORY_SYSTEM.md` Section 27). Possession, feasibility, and access are three different things, and scarcity lives in the gaps between them.

---

## SECTION 11 — MAINTENANCE ECONOMY

Maintenance is a central, visible economic system, never an invisible background assumption. The economy coordinates repair labor, replacement material, technical knowledge, access to infrastructure, preventive and emergency repair, archival preservation, habitat stewardship, public-space upkeep, and network redundancy — and maintenance **competes with expansion** for the same finite labor, material, energy, and institutional attention (`μ_maint` against `σ_alloc`). This is the economic engine behind the infrastructure vitality `V_infra` of `TECHNOLOGY_SYSTEM.md` Section 11: whether standing infrastructure stays alive is an allocation outcome.

Two rules bind maintenance. **The user is never asked to choose** between maintenance and expansion — the civilization resolves the tension through its own institutions and history (a maintenance order that wins prestige, a settlement that lets its old works decay to fund new ones). And **poor maintenance causes decline only through internal causality, never through user absence** (`SIMULATION_SYSTEMS.md` Laws 5, 6, 8): a civilization that under-invests in upkeep watches its infrastructure fail; a civilization whose user simply steps away finds everything preserved and quietly waiting. Maintenance debt is a story the civilization tells about its own priorities, not a penalty for the user's life.

---

## SECTION 12 — DISTRIBUTION AND INFRASTRUCTURE

Distribution connects production to use (`δ_reach`), and it depends on transport technology, ecological terrain, infrastructure vitality, communication, standards, institutions, settlement distance, local trust (`CULTURE_SYSTEM.md`), maintenance, and environmental conditions. Its signal failure mode is decisive: **distribution failure creates scarcity without reducing total production** (Section 10; Scenario 1). A world can produce plenty and still leave a district dark, if the light cannot get there.

Distribution reach is era-inflected — local household exchange, settlement networks, aqueduct-linked flows, industrial transport, optogenetic coordination, planetary and cosmic networks — and every increase in reach is also an increase in **dependency** (`D_load`): greater opportunity bought with greater fragility. A settlement woven into a distribution network gains access to everything the network carries and loses the ability to function when the network fails (`TECHNOLOGY_SYSTEM.md` Section 18, emancipation and dependency at once; Scenario 3, 4).

---

## SECTION 13 — OWNERSHIP, STEWARDSHIP, AND COMMONS

Modern private property is **not** assumed as universal canon. The domain supports plural arrangements — personal possession, household possession, professional stewardship, institutional custody, shared infrastructure, public access, common ecological stewardship, inherited responsibility, temporary use rights, and regional custodianship — and which prevails is emergent, era- and settlement-specific. These arrangements affect access, maintenance responsibility, preservation, exclusion, transfer, inequality, and institutional power.

The ownership boundary is split across domains, matching the siblings: **Culture** determines legitimacy — whether an arrangement is regarded as proper (`CULTURE_SYSTEM.md` Section 21); a **future governance domain** may later define legal enforcement; **Memory** preserves historical ownership claims and their provenance (`MEMORY_SYSTEM.md` Section 16); **Economy resolves active access and material consequence**. An ownership claim can be historically recorded, culturally illegitimate, legally unenforced, and materially decisive all at once — and Economy owns only the last of these.

---

## SECTION 14 — INEQUALITY

Economic inequality is modeled as **unequal access and burden across many dimensions, never a single wealth score** (`ι_dispersion`). The dimensions include access to food systems, safe illumination, medicine, education, archives (`MEMORY_SYSTEM.md`), technology, transport, repair, institutional influence, leisure, stable shelter, resilient infrastructure, and skilled professions. Inequality exists between households, professions, districts, settlements, institutions, established citizens and migrants, and technological centers and peripheries (`TECHNOLOGY_SYSTEM.md` Section 18; `CULTURE_SYSTEM.md` Section 35).

Inequality is never portrayed as either automatically natural or instantly catastrophic; the domain shows its **causes and consequences**. The ownership split: **Culture** owns how inequality is interpreted and legitimized (Is it just? Shameful? Invisible?); **Citizen** owns the personal experience of it; **Economy owns the distribution pattern itself** — who can reach what, and who carries which burden. A profession can be culturally prestigious and materially insecure; an institution can be materially powerful and culturally distrusted (Scenario 5); inequality of access and inequality of esteem are different axes that routinely diverge.

---

## SECTION 15 — ECONOMIC INSTITUTIONS

Economic institutions coordinate production, maintain infrastructure, train workers, distribute essentials, preserve reserves, manage shared resources, organize long-distance exchange, support archives, and allocate scarce technical capability — and they may also exclude outsiders, monopolize skills, become rigid, fail, reform, fragment, and revive (mirroring the cultural and technological institution lifecycles). Representative forms — households, workshops, guilds, maintenance orders, cultivation cooperatives, archive-support bodies, transport networks, civic provisioning bodies, distributed automated systems — are illustrative, **not a fixed list**. The domain defines the *system* by which institutions emerge from repeated economic need (the formation lifecycle of `CULTURE_SYSTEM.md` Section 6 applied to coordination), not a catalogue.

Institution ownership is shared exactly as in `CULTURE_SYSTEM.md` Section 15 and `MEMORY_SYSTEM.md` Section 12: **Economy owns the coordinating function** and its material consequence; **Citizen** owns participation and the citizens who compose it; **Culture** owns legitimacy; **Memory** owns its recorded history and precedents; **Technology** owns its technical media; a **future governance domain** owns any formal authority. An institution can coordinate essential provision while being culturally resented and materially precarious — and can protect itself at the public's expense (Scenario, Section 31).

---

## SECTION 16 — INTERFACES TO THE PEER DOMAINS

Economy sits amid five completed domains; each interface is one-directional in ownership and already contracted from the other side.

**Ecology** (`ECOLOGY_SYSTEM.md`). Ecology provides organisms, nutrient flows, material conditions, habitat limits, abundance, scarcity, environmental pressure, and biological recycling. Economy emits resource-demand, harvesting/cultivation, waste, preservation, recycling, and habitat-use *pressures*; Ecology resolves the biological outcome (`ECOLOGY_SYSTEM.md` Section 13). **Economic reverence never becomes automatic sustainability**: a civilization can value nature and materially overuse it, because valuing (Culture) and consuming (Economy) are different acts (Scenario 7; `CULTURE_SYSTEM.md` Section 22).

**Citizen** (`CITIZEN_SYSTEM.md`). Citizens work, teach, repair, maintain, transport, cultivate, care, preserve, organize, adapt, refuse, migrate, and specialize. Citizen owns the personal decision and experience; Economy provides conditions — labor demand, access, scarcity, opportunity, burden, dependency, security, inequality. **No citizen behaves as one economic class**; a shared condition is lived differently by each.

**Technology** (`TECHNOLOGY_SYSTEM.md`). Technology provides production possibilities, tools, automation, infrastructure, maintenance requirements, standards, dependency structures, and resource demands (`TECHNOLOGY_SYSTEM.md` Sections 11, 12). Economy decides whether a technical possibility can be produced, supplied, maintained, distributed, accessed, and scaled. **A prototype may exist without economic feasibility; a technology may be viable in one settlement and impossible in another.** Automation may increase capacity, reduce some labor demand, create new maintenance demand, concentrate expertise, deepen dependency, weaken skill transmission, and widen or narrow inequality — and technology never determines distribution by itself (Scenario 4).

**Culture** (`CULTURE_SYSTEM.md`). Culture influences work ethics, professional prestige, fairness expectations, gift and inheritance customs, attitudes toward ownership and automation, acceptable exchange, stewardship, consumption norms, and preservation priorities (`CULTURE_SYSTEM.md` Section 25). Economy provides material conditions; Culture interprets them; **neither reduces the other to a modifier**.

**Memory** (`MEMORY_SYSTEM.md`). Memory provides historical ownership claims, records of shortages, abandoned production systems, old infrastructure maps, technical manuals, institutional precedents, remembered disasters, preserved exchange relationships, and economic biographies (`MEMORY_SYSTEM.md` Section 27). Economy emits archival-support, preservation-labor, heritage-maintenance, record-access, and restoration-capacity *demands*; **Memory decides what is preserved as record, Economy decides what can currently be materially supported** (Scenario 6).

---

## SECTION 17 — LEARNING INTEGRATION CONTRACT

Economy receives only already-interpreted learning signals, never raw Study OS telemetry (`SIMULATION_SYSTEMS.md` Section 22; `LEARNING_INTEGRATION.md`, placeholder). Learning may expand economic *possibility* through deeper technical competence, improved classification, stronger institutional knowledge, broader interdisciplinary understanding, better planning concepts, improved communication, stronger historical awareness, greater scientific understanding, and increased problem-solving capacity — all of which widen what the civilization can understand and coordinate.

The hard boundaries: **no school subject maps directly to an economic outcome** (`SIMULATION_SYSTEMS.md` Section 7), and **learning minutes never become money, labor, production points, purchasing power, or any currency** (`SIMULATION_SYSTEMS.md` Law 7; `GAME_DESIGN.md` Section 11, Principle 2). Learning expands what can be understood and coordinated; citizens and institutions determine how that understanding is used. The metabolic energy that learning banks (`SIMULATION_SYSTEMS.md` Section 6) is the one quantitative thing learning supplies the economy — and even that is a budget the economy allocates, never a wallet the user spends.

---

## SECTION 18 — ERA PROGRESSION CONTRACT

Economy emits an era-readiness contribution reflecting productive capacity, distribution reach, institutional coordination, maintenance resilience, regional integration, ability to support complex technology, and ability to preserve and transmit specialized labor. It **does not decide era advancement**; `ERA_PROGRESSION.md` owns the final gating model, combining Economy's contribution with those of the other domains (`SIMULATION_SYSTEMS.md` Section 15). **Era transition instantly solves nothing** — not scarcity, inequality, maintenance, access, or distribution. Later eras create *more complex dependencies*, not economic perfection (Section 19).

---

## SECTION 19 — ECONOMY ACROSS THE FIVE ERAS

Eras are capability envelopes for coordination, never fixed economic packages (`SIMULATION_SYSTEMS.md` Section 15). Gating is deferred to `ERA_PROGRESSION.md`; later eras are never post-scarcity.

- **`SPORE_HEARTH`** — economic life may be household-centered, local, reciprocal, tied to ecology and shared survival, dependent on embodied skill, and limited in storage and reach. Never portrayed as primitive or irrational; a reciprocity economy is a sophisticated coordination system.
- **`CRYSTAL_INSCRIPTION`** — economy may develop specialized professions, durable records (`MEMORY_SYSTEM.md`), guild-like coordination, regional exchange, civic infrastructure, formal stewardship, and greater inequality of access.
- **`PHONONIC_SUBTERRANEAN`** — economy may confront industrial-scale production, standardized labor, urban concentration, deep infrastructure dependency, class-like divisions, mass distribution, occupational danger, and the tension between craft and scale — the coordination weather of the heatless industrial age.
- **`OPTOGENETIC_CIRCUIT`** — economy may become network-coordinated, automated, information-intensive, heavily maintenance-dependent, efficient but fragile, spatially unequal, and dominated by infrastructure access (Scenario 4).
- **`COSMIC_STELLAR`** — economy may confront planetary-scale coordination, distant-settlement dependency, extreme infrastructure cost, artificial-labor questions, and a strange new scarcity: abundance in some materials alongside scarcity of *access, attention, trust, and continuity*, with disputes over responsibility between worlds. **Energy remains bound to the user's learning** even here (the Stellar Guard, `SIMULATION_SYSTEMS.md` Section 9); no era achieves energy independence, so no era achieves true post-scarcity.

---

## SECTION 20 — ETERNAL NIGHT AS AN ECONOMIC CONDITION

Permanent night materially shapes the economy in every era (`VISION.md`; `NOCTIS_ECOLOGICAL_ENGINE.md`). **Illumination is itself a scarce economic good**: light is precious, heatless, and metabolic (`NOCTIS_ECOLOGICAL_ENGINE.md` Rule 1), so lighting a workshop, a path, or a district is an allocation of learning-derived energy, and *unequal lighting* is one of the most visible forms of economic inequality (Section 14; `ART_DIRECTION.md`). Energy reserves are stored as crystal-lattice charge (the mathematics pathway, `SIMULATION_SYSTEMS.md` Section 6), so a civilization's economic buffer against disruption is literally the light it has banked. Distribution runs along aqueducts and mycelial networks; production and work happen in the dark, so light discipline — making only the light that is needed, where it is needed — is an economic virtue as much as an ecological and cultural one (`CULTURE_SYSTEM.md` Section 30). The night makes energy, light, and their coordination inseparable, and the economy is where that inseparability is felt.

---

## SECTION 21 — TEMPORAL EVALUATION

Economy inherits its relationship to time entirely from `SIMULATION_SYSTEMS.md` Sections 3–4: event-driven, lazy, no ticking. **There is no continuous market, no background production tick, no hourly wage, no passive income, no real-time factory, and no continuously drifting price.** Economic processes evaluate only during meaningful committed events. Their scales are different threshold quantities on one lazy schedule: **immediate** (distribution, repair, local shortage response, household provision, labor participation); **short-term** (production adjustment, substitution, professional demand, reserve use, local inequality shifts); **medium-term** (institutional formation, settlement specialization, infrastructure expansion, maintenance strain, regional dependency); **generational** (inherited professions, long-term inequality, economic tradition, institutional persistence, abandoned industries, migration patterns); and **era-scale** (production regimes, distribution systems, automation, planetary coordination, changing ideas of ownership and provision). Between evaluations, economic state holds; the busy workshops the user sees during quiet minutes are the renderer breathing over a constant state, not production running on a clock.

---

## SECTION 22 — DETERMINISM AND EXPLAINABILITY

Every major economic outcome is causally reconstructable (`SIMULATION_SYSTEMS.md` Law 1). The simulation can always answer why a shortage occurred, why one district had access and another did not, why a profession became scarce, why infrastructure was maintained or neglected, why a technology failed to scale, why a settlement specialized, why inequality widened or narrowed, why a supply relationship formed, and why an institution became economically powerful.

Seeded deterministic variation (`SIMULATION_SYSTEMS.md` Section 11) may influence which qualified institution coordinates a response, which settlement develops a specialization, which qualified substitute is attempted first, minor distribution order, and which local economic arrangement becomes influential — always among causally qualified possibilities, always reproducible from committed state. Seeded variation may **never** create goods from nothing, ignore scarcity, invent universal prosperity, cause arbitrary collapse, punish user absence, or replace a causal prerequisite. The economy may surprise the user; it is never arbitrary underneath.

---

## SECTION 23 — PLAYER-FACING EXPRESSION

The user perceives the economy through the living world, never through a dashboard, obeying `GAME_DESIGN.md` Section 8 and the handoff law of `SIMULATION_SYSTEMS.md` Section 23. Economic condition reaches the user as citizen routines, crowded or quiet workshops, maintenance crews, worn or repaired infrastructure, changing professions, unequal lighting, transport activity, reused objects, abandoned machinery, local abundance, substitution practices, archival records, district differences, and visible networks of dependence (`ART_DIRECTION.md`).

Forbidden absolutely: currency counters, production-per-minute displays, profit charts, shop interfaces, trade menus, budget screens, resource alerts, constant shortage notifications, and any economic micromanagement (`GAME_DESIGN.md` Section 11, Principle 4). Thin observational instruments may expose broad conditions for the curious — a sense that a district is short of repair labor, that a settlement leans on a distant supplier — but they read the world and never operate it. The economy is felt as the texture of a civilization making do, not shown as a ledger.

---

## SECTION 24 — EXAMPLE SCENARIOS

Each traces initial conditions → available inputs → citizens/institutions → allocation → production/maintenance → distribution → access → scarcity/surplus → cross-domain consequences → legacy → ownership. All are deterministic and seeded; none adds an exception.

**1 — A local shortage produces substitution, not collapse.** A district's usual grown-biosilicate feedstock thins after an ecological shift (`ECOLOGY_SYSTEM.md`). Total civilization material is adequate, but distribution cannot cover the gap fast enough (distribution failure, Section 10). A maintenance order coordinates a substitute material; production continues at reduced scale; a repair culture grows. Legacy: Memory records the shortage and the substitution; Culture may later prize the make-do craft that resulted.

**2 — Reproducible but unscalable.** A settlement can reproduce a light-routing technique (`TECHNOLOGY_SYSTEM.md`), but each instance carries a heavy maintenance burden (`μ_maint`) its labor cannot sustain. Economy caps productive scale at the maintenance bottleneck (`θ_bottleneck`); the technique stays boutique. Technology owns that it *works*; Economy owns that it cannot be *afforded at scale*.

**3 — Two settlements specialize and grow interdependent.** Seeded on their differing ecology, one settlement specializes in crystal-charge storage, the other in mycelial cultivation (`TECHNOLOGY_SYSTEM.md` Section 19). A standing supply relationship forms; each gains access to what it cannot make and loses self-sufficiency (Section 12). A later disruption to the route hurts both. Legacy: the interdependence becomes economic tradition and a Memory of mutual reliance.

**4 — Automation raises capacity, weakens repair knowledge.** In `OPTOGENETIC_CIRCUIT`, network coordination automates distribution, raising capacity and reducing routine labor demand — while the skill to repair the network concentrates in a few and thins elsewhere (`TECHNOLOGY_SYSTEM.md` Section 9; Scenario 7 there). Efficiency and fragility rise together; a later failure cascades through everything that leaned on the network (`D_load`). No legacy is lost; active access dims until repair skill is relearned.

**5 — A prestigious profession, materially insecure.** An artistic illumination craft holds high cultural prestige (`CULTURE_SYSTEM.md` Section 21) but commands little material provision; its practitioners have esteem and precarious access to essentials (Section 14). Prestige and security are different axes. Culture owns the esteem; Economy owns the insecurity; Citizen owns how a given artisan lives it.

**6 — An archive preserved but unsupported.** A settlement's record-hall holds intact archives (`MEMORY_SYSTEM.md`), but archival preservation labor is unavailable — coordinators are needed elsewhere. Records survive as legacy while their active access degrades for want of upkeep (Section 11; `MEMORY_SYSTEM.md` Section 27). Memory owns that the record persists; Economy owns that it cannot currently be maintained or reached.

**7 — Ecological overuse becomes economic and cultural conflict.** A settlement's demand pressure (Section 16) drives cultivation past a renewable limit; Ecology resolves depletion of activity. The resulting scarcity pits an expansion-minded institution against a restraint-minded movement (`CULTURE_SYSTEM.md` Section 34). Economy owns the scarcity and allocation fight; Culture owns the meaning of the conflict; Ecology owns the damage.

**8 — Return after long absence.** The user is away for weeks. Active provision quiets — workshops still, distribution slow, maintenance paused. **Nothing is lost:** productive heritage, institutions, reserves, and every recorded economic fact are preserved exactly; no shortage, no debt, no collapse, no suffering results from the absence; the first ten-minute session relights active coordination (`SIMULATION_SYSTEMS.md` Section 5, Laws 5, 6). The economy waited.

---

## SECTION 25 — FAILURE MODES AND EDGE CASES

Each resolves to a lawful state, never an exception:

- **Enough production, failed distribution** — scarcity without shortage of supply (Section 10; Scenario 1).
- **Material without skill / skill without material** — production stalls at the missing input; each is a distinct incapacity (Sections 6, 10).
- **Infrastructure without maintenance knowledge** — `V_infra` decays through internal causality; salvage and rediscovery remain (`TECHNOLOGY_SYSTEM.md` Section 20).
- **A useful technology culturally rejected** — feasible and unadopted; Culture owns the refusal (`CULTURE_SYSTEM.md`).
- **One settlement controls a critical capability** — single-point dependence; a power condition emitted to Culture/governance (Section 13; `TECHNOLOGY_SYSTEM.md` Section 18).
- **Automation hides dependency** — the Optogenetic fragility (Scenario 4).
- **Regional isolation** — permanent uneven access, a valid state (Section 14).
- **Obsolete production continuing through tradition** — culturally sustained inefficiency (`CULTURE_SYSTEM.md` Section 32).
- **Conflicting historical ownership claims** — Memory keeps the claims, Culture the legitimacy, Economy the active access (Section 13).
- **Archives preserved but inaccessible** — record vs support (Scenario 6).
- **Harmful production economically important** — high dependency and real benefit; the trade-off persists (`TECHNOLOGY_SYSTEM.md` Section 18).
- **Replacement technology creates new scarcity** — a new bottleneck displaces an old one (Section 10).
- **High capacity, unequal access** — the normal shape of inequality (Section 14).
- **Institutions protecting themselves over public need** — a legitimate, consequential failure (Section 15).
- **The user stops studying for a long time** — active coordination quiets; **no collapse, no debt, no suffering, no lost legacy** ever results from an ordinary break (`SIMULATION_SYSTEMS.md` Laws 5, 6; Scenario 8).

---

## SECTION 26 — INPUTS AND OUTPUTS

**Economy receives** (across committed evaluations): ecological availability, abundance, scarcity, and pressure resolutions (`ECOLOGY_SYSTEM.md`); the metabolic energy reserve and capacity (`SIMULATION_SYSTEMS.md` Section 6); technological production possibilities, infrastructure vitality, dependency, and maintenance requirements (`TECHNOLOGY_SYSTEM.md`); citizen participation, skill distribution, and migration (`CITIZEN_SYSTEM.md`); cultural work-ethic, prestige, fairness, and stewardship signals (`CULTURE_SYSTEM.md`); memory of past systems, claims, and precedents (`MEMORY_SYSTEM.md`); validated learning signals (`LEARNING_INTEGRATION.md`); and era context.

**Economy produces** interpretable, typed conditions — never a generic "economy modifier": sufficiency and scarcity states; access structure; labor and skill demand; maintenance-allocation pressure; distribution reach; dependency load; reserve status; inequality dispersion; supply-relationship state; production-feasibility conditions; resource-conflict conditions; archival/preservation and restoration demands (to Memory); demand and waste pressures (to Ecology); staffing and burden conditions (to Citizen); consumption and fairness conditions (to Culture); and an economic-readiness contribution (to Era Progression). Every output names a specific coordination condition a consuming domain can read.

---

## SECTION 27 — INVARIANTS

Hard rules; a proposed economy mechanic that violates any is invalid at birth and redesigned from the constraint up.

1. **Economy is not a currency system;** no money, price the user pays, shop, market, or trade menu (`SIMULATION_SYSTEMS.md` Section 20; Trope Guard).
2. **The user never spends study, never manages production or labor, never balances a budget** (`GAME_DESIGN.md` Section 1; `SIMULATION_SYSTEMS.md` Law 10).
3. **No passive loop creates unlimited primary value;** the energy budget is bounded by learning (`SIMULATION_SYSTEMS.md` Law 7).
4. **Production requires causal inputs** — ecological substrate, technical capability, skill, tools, energy, coordination (Section 6).
5. **Technological possibility is distinct from economic feasibility** (Section 16; `TECHNOLOGY_SYSTEM.md`).
6. **Civilization-wide possession is distinct from local access** (Sections 10, 14).
7. **Scarcity is distinct from distribution failure, skill shortage, and access inequality** (Section 10).
8. **Labor is more than material output;** care, teaching, maintenance, and coordination are real economic activity (Section 7).
9. **Maintenance is economically real** and competes with expansion (Section 11).
10. **Economic institutions may help, exclude, persist, fail, or transform** (Section 15).
11. **Inequality is multidimensional, never one wealth score** (Section 14).
12. **Culture owns legitimacy, Citizen owns personal action, Ecology owns biology, Memory owns record, Era Progression owns gating — not Economy** (Sections 3, 16).
13. **Later eras do not eliminate scarcity;** no era is post-scarcity, and energy stays bound to learning (Section 19).
14. **Economic change is event-driven;** no continuous market, tick, wage, or passive income (Section 21).
15. **Seeded variation is bounded, reproducible, and creates nothing from nothing** (Section 22).
16. **User absence is non-punitive:** no starvation, debt, bankruptcy, unemployment, confiscation, collapse, or lost achievement (Sections 5, 25).
17. **Eternal night materially shapes production, distribution, work, and access;** illumination is a scarce economic good (Section 20).
18. **The domain adds no new engine event flags;** economic change is committed-state transition (`SIMULATION_SYSTEMS.md` Section 12).
19. **Major economic outcomes remain explainable** (Section 22).

---

## SECTION 28 — AI GENERATION RULES

Any future economy feature must pass every rule, *after* clearing the tiered validation of `DOCUMENT_ARCHITECTURE.md`, the experience tests of `GAME_DESIGN.md`, the structural laws and Trope Guard of `ARCHITECTURE.md`, the physics of `SIMULATION_SYSTEMS.md` Section 12, and the peer-domain laws. A proposal that fails any rule is rejected and redesigned from the constraint up.

- **Rule 1 — Coordination, not currency.** It must express value through access, scarcity, obligation, dependency, and burden, never through money, prices the user pays, or a shop.
- **Rule 2 — No primary value from nothing.** Every gain traces to learning-derived energy, ecological substrate, or transformation at efficiency ≤ 1 (recycling < 1).
- **Rule 3 — Possession, feasibility, and access distinct.** It must not collapse civilization-level possession into local access, or technical possibility into economic feasibility.
- **Rule 4 — Citizen-carried, not unit-managed.** Labor must be citizen activity read as condition, never assignable units.
- **Rule 5 — Maintenance real.** Anything built must carry a maintenance cost that competes for finite inputs.
- **Rule 6 — Ownership-respecting.** It must resolve only material coordination, leaving legitimacy to Culture, record to Memory, biology to Ecology, decision to Citizen, and law to governance.
- **Rule 7 — Event-driven, non-punitive, night-shaped.** Lazy evaluation, no absence-driven suffering, and shaped by the economics of light and heatless energy.
- **Rule 8 — Deterministic, no new flags, no dashboard.** Seeded variation only; committed-state transitions only; no user-facing management surface.

---

## SECTION 29 — DEFERRED QUESTIONS

Bound by future documents or implementation, under the contracts this file provides: exact allocation formulas, institution-generation rules, and all coefficient values (`σ_alloc`, `δ_reach`, `θ_bottleneck`, `μ_maint`, `ε_recycle`, `ι_dispersion`), each carrying a canon citation, under the calibration constraints of `SIMULATION_SYSTEMS.md`; any internal, non-user-facing abstract valuation, *only* if higher canon later introduces one (this document introduces none); detailed governance, legal ownership enforcement, and taxation (a future governance domain); detailed education mechanics and citizen-employment simulation (`CITIZEN_SYSTEM.md` and future education); raw study interpretation (`LEARNING_INTEGRATION.md`); era gating (`ERA_PROGRESSION.md`); and all UI, rendering, and presentation (`ART_DIRECTION.md`, Tier 8). Each is a clean deferred contract, resolved with no arbitrary assumption here.

---

## SECTION 30 — VALIDATION CHECKLIST

- [x] Economy is real without becoming a market game — Sections 1, 9, 23.
- [x] Production, allocation, distribution, access, and ownership are distinct — Sections 6, 8, 12, 13.
- [x] Scarcity is distinct from distribution failure — Section 10.
- [x] Labor is citizen activity, not assignable units — Section 7.
- [x] Maintenance is central — Section 11.
- [x] Technology can exist without economic scalability — Sections 6, 16; Scenario 2.
- [x] Regions can have different access — Sections 12, 14.
- [x] Inequality emerges without one wealth score — Section 14.
- [x] Ecology, Citizen, Technology, Culture, Memory boundaries respected — Sections 3, 16.
- [x] Learning is possibility, not currency — Section 17.
- [x] The user is free from economic micromanagement — Sections 1, 23.
- [x] No passive production loops — Sections 1, 21.
- [x] Later eras are more dependent, not automatically perfect — Sections 18, 19.
- [x] Outcomes deterministic and explainable — Section 22.
- [x] User absence completely non-punitive — Sections 5, 25; Scenario 8.
- [x] Eternal night materially shapes the economy — Section 20.
- [x] No new engine event flags — Section 27-18.
- [x] Concise enough to remain usable, detailed enough to guide implementation — the whole document.

---

## Closing Validation Statement

Every future economy concept for the Noctis Civilization Module must pass, in order: the Tier 1 test of `VISION.md`, the Tier 2 test of `ART_DIRECTION.md`, the Tier 3 test of `NOCTIS_ECOLOGICAL_ENGINE.md`, the experience tests of `GAME_DESIGN.md`, the structural laws of `ARCHITECTURE.md`, the physics of `SIMULATION_SYSTEMS.md`, and the domain laws of `ECOLOGY_SYSTEM.md`, `CITIZEN_SYSTEM.md`, `TECHNOLOGY_SYSTEM.md`, `CULTURE_SYSTEM.md`, `MEMORY_SYSTEM.md`, and this document. Anything that fails is rejected and redesigned from the constraint up.

Economy in Noctis is how a civilization in the dark makes do with what its studying mind has made possible. It coordinates without commanding, values without pricing, and constrains without punishing. Possession is not access; feasibility is not affordability; abundance in one district is a shortage in the next. Maintenance quietly competes with ambition, light is never free, and every joule the economy spends was earned at a desk somewhere beyond the glass.

The user studies.

The civilization coordinates.

And the light reaches — unevenly, dependently, honestly — as far as the civilization can carry it.
