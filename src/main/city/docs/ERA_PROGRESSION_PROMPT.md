# Commissioning Prompt — Author `ERA_PROGRESSION.md`

Paste everything below this line into a fresh AI session (or this session) to draft the file. It is written to be self-contained: an agent with no prior context on Noctis should be able to follow it and produce a canon-consistent Tier 7 blueprint.

---

## TASK

You are authoring `src/main/city/docs/ERA_PROGRESSION.md` for the Noctis Civilization Module — a hidden, non-gamified civilization simulation living inside a Study OS desktop app (`jp-study-app`). The file currently exists but is empty (0 bytes). It is the **last remaining reserved Tier 7 domain blueprint**. Every other domain in the canon — `ECOLOGY_SYSTEM.md`, `CITIZEN_SYSTEM.md`, `TECHNOLOGY_SYSTEM.md`, `CULTURE_SYSTEM.md`, `MEMORY_SYSTEM.md`, `ECONOMY_SYSTEM.md`, `LEARNING_INTEGRATION.md` — is already fully authored and treats `ERA_PROGRESSION.md` as a forward reference they defer to. Writing this file closes out the domain-blueprint layer of the canon.

Do not write code. Do not touch anything outside `src/main/city/docs/ERA_PROGRESSION.md`. This is a design-canon document, matching the rigor, citation discipline, and prose register of its six completed siblings.

---

## MANDATORY READ ORDER

Read these in full, in this order, before drafting a single sentence. Every claim you write must be traceable to one of these files or logically derived from them — nothing invented from outside the canon.

```
1. VISION.md                      Tier 1 — Absolute Conceptual Anchor
2. ART_DIRECTION.md                Tier 2 — Aesthetic & Spatial Interface
3. NOCTIS_ECOLOGICAL_ENGINE.md      Tier 3 — Mechanical & Biological Execution
4. DOCUMENT_ARCHITECTURE.md         Meta  — Structural Guardrail Framework
5. GAME_DESIGN.md                  Tier 4 — Experience Design
6. ARCHITECTURE.md                 Tier 5 — Technical Architecture
7. SIMULATION_SYSTEMS.md           Tier 6 — Simulation Physics
8. ECOLOGY_SYSTEM.md               Tier 7 — Ecological Domain Blueprint
9. CITIZEN_SYSTEM.md               Tier 7 — Citizen Domain Blueprint
10. TECHNOLOGY_SYSTEM.md           Tier 7 — Technology Domain Blueprint
11. CULTURE_SYSTEM.md              Tier 7 — Culture Domain Blueprint
12. MEMORY_SYSTEM.md               Tier 7 — Memory Domain Blueprint
13. ECONOMY_SYSTEM.md              Tier 7 — Economy Domain Blueprint
14. LEARNING_INTEGRATION.md        Tier 7 — Learning Integration Domain Blueprint
15. ERA_PROGRESSION.md             Tier 7 — Era Progression Domain Blueprint (the file you are writing)
```

`ERA_PROGRESSION.md` sits at the **end** of the Tier 7 layer, not beside it — it is the one domain whose entire job is to read and combine the outputs of the other six. Frame the whole document with that posture: it is a synthesizer, not a peer with its own independent subject matter.

---

## FRONTMATTER TEMPLATE

Use exactly this pattern (matches every sibling):

```yaml
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
```

Open with an `## Document Status And Authority` section, matching the siblings: state what this document is, what it sits beneath (reprint the tier diagram with all thirteen prior files, `ERA_PROGRESSION.md` last), and which sections of `SIMULATION_SYSTEMS.md` it specializes (Section 15, Era Progression Contract; Section 16's boundary against equating era with invention; Section 20's economic non-post-scarcity clause references it too).

---

## BINDING CANON — QUOTE AND SPECIALIZE, NEVER CONTRADICT

### 1. The protocol `SIMULATION_SYSTEMS.md` Section 15 already fixes

Tier 6 defines the *protocol*; this document binds the *conditions*. The law already written, verbatim:

> era advances when readiness( contributions ) ≥ Θ_era(next) — eras never regress

> No single hidden score defines an era. The readiness that carries a civilization across an era boundary is a combination of contributions from multiple domains — learning maturity in the canon's full sense (breadth, consistency, depth, difficulty, reflection), technological capability (Technology), cultural development (Culture), ecological succession (Ecology), population and institutional maturity (Citizen), and historical accumulation (Memory). Research readiness `R` is one contributor, load-bearing but not sole.

Your job is to author the weights, the threshold `Θ_era`, and the final combination formula — Tier 6 explicitly refuses to bind these and hands them to you. Tier 6's own requirements on your formula: it must be **monotone**, **no single domain may silently define the era alone**, and the transition must be **a committed state change evaluated like any other** (its overnight-metamorphosis staging is a rendering concern, not a simulation one).

### 2. The five canonical eras (fixed order, do not alter)

| Canonical designation | Production era (`GAME_DESIGN.md` Section 7) | Canonical movement (Tiers 1–3) |
|---|---|---|
| `SPORE_HEARTH` | Era I — The Spore & Hearth Era | Spore-Hearth Era |
| `CRYSTAL_INSCRIPTION` | Era II — The Aqueduct & Inscription Era | Crystal and Inscription Era |
| `PHONONIC_SUBTERRANEAN` | Era III — The Phononic Hydro-Fluidic Era | Transitional elaboration toward Bio-Circuitry |
| `OPTOGENETIC_CIRCUIT` | Era IV — The Optogenetic Circuit Matrix | Bio-Circuitry and Alchemical Network Era |
| `COSMIC_STELLAR` | Era V — The Cosmic Stellar Chasm | Terminal extension of Bio-Circuitry |

Five eras means **four thresholds**: `Θ_era(CRYSTAL_INSCRIPTION)`, `Θ_era(PHONONIC_SUBTERRANEAN)`, `Θ_era(OPTOGENETIC_CIRCUIT)`, `Θ_era(COSMIC_STELLAR)`. Whether these thresholds are equal, increasing, or shaped some other way is yours to define and justify — but state the reasoning (e.g. later eras plausibly demanding proportionally more from *more* domains at once, not just a bigger number from one).

Read `GAME_DESIGN.md` Section 7 in full for the qualitative texture of each era (theme, environment, technology, light, civilization feeling) and `VISION.md`'s "The Meaning Of Eras" section for the thesis that eras are not tech tiers but changes in *how the civilization understands itself* — architecture, light language, institutions, terrain behavior, sensory systems, and what mysteries become noticeable. Your readiness formula should be explainable in terms of that thesis, not just as an abstract weighted sum.

### 3. Capability envelopes, not guaranteed packages (`SIMULATION_SYSTEMS.md` Section 15)

Already-settled canon you must carry forward and not re-litigate:

- **Canon (identity + envelope):** each era's thematic relationship to knowledge, its permanent-night constraints, the heatless law, and the outer bound of what becomes *possible*.
- **Representative examples / art direction:** the specific technologies named per era in `GAME_DESIGN.md` Section 7 illustrate the envelope; they are not guaranteed universal possessions.
- **Domain-owned, path-dependent:** which technologies a civilization actually develops within the envelope is `TECHNOLOGY_SYSTEM.md`'s decision. **Era advancement must not instantly install one universal technological package civilization-wide.** Different settlements may possess different technologies within the same era.

### 4. The Stellar Guard (hard law, restate and enforce)

> No era achieves energy independence from the user's mind; if study stops, `COSMIC_STELLAR` dims into ceremonial stillness and the decay model proceeds exactly as in the first era.

This must appear explicitly in your document, likely in a section on Era V or on non-regression, because it is the single most load-bearing anti-power-creep law in the whole era system (`GAME_DESIGN.md` Section 7, "What Never Changes Across Eras": "The user's focus is the sole ultimate energy source; no era achieves independence from it").

### 5. The three canonical numeric anchors

Only three raw numbers are locked by canon anywhere in this system (`NOCTIS_ECOLOGICAL_ENGINE.md` section 7): the three-consecutive-day consistency trigger, the five-day absence horizon, and the ten-minute reawakening session. Your document may introduce named symbolic constants for `Θ_era` and domain weights, but must not fabricate new raw numeric anchors as if they were canon — they are calibration questions, bound at implementation, each carrying a citation to this document.

### 6. `BENTHIC_BLOOM` — the existing event-flag hook

One of the four closed engine event flags already ties directly into era transition (`SIMULATION_SYSTEMS.md` Section 12; also referenced in `ECOLOGY_SYSTEM.md` and `CITIZEN_SYSTEM.md`):

> `BENTHIC_BLOOM` — research readiness crosses an emergence threshold under a completion/breakthrough input; reserves surge and become permanent readiness; **an era boundary may be crossed in the same evaluation.**

Your document must explain how a `BENTHIC_BLOOM` crossing interacts with your combined-readiness formula (it is the moment a breakthrough input pushes an already-near-threshold civilization over `Θ_era`) without inventing a new engine event flag — Tier 6 fixes the four flags as closed, and no domain may add a fifth.

### 7. Domain ownership boundary already assigned to you (`SIMULATION_SYSTEMS.md` Section 14)

> **Era Progression owns:** the final era-transition conditions; broad civilizational transition; era gating; and era-level continuity.

Every other domain has already written a line disclaiming ownership of the era gate and pointing at you. You must not re-derive their internals — only consume what they already declare they emit.

### 8. What each peer domain has already promised to contribute — quote these, don't reinvent them

**Technology** (`TECHNOLOGY_SYSTEM.md`) already names its contribution as a coefficient:

> `w_era` — Technology's contribution weight to era readiness. A contribution signal only; the gate `Θ_era` is owned by `ERA_PROGRESSION.md`.

And its deferred-questions section explicitly hands you the combination problem:

> the era-transition gating formula and thresholds `Θ_era`; how this domain's `w_era` contribution combines with ecology, citizen, culture, and memory contributions.

Note Technology's own list omits Economy by name (it was written before `ECONOMY_SYSTEM.md` existed) — Economy has since written its own contribution explicitly (below), so your combination must include **six** domain contributions total: Technology, Ecology, Citizen, Culture, Memory, Economy — plus Learning Integration as the ultimate upstream source feeding all of them (never a direct seventh contributor of its own; it feeds the others, who feed you).

**Economy** (`ECONOMY_SYSTEM.md` Section 18) already states its contribution and its limits in full:

> Economy emits an era-readiness contribution reflecting productive capacity, distribution reach, institutional coordination, maintenance resilience, regional integration, ability to support complex technology, and ability to preserve and transmit specialized labor. It does not decide era advancement; `ERA_PROGRESSION.md` owns the final gating model, combining Economy's contribution with those of the other domains. Era transition instantly solves nothing — not scarcity, inequality, maintenance, access, or distribution. Later eras create more complex dependencies, not economic perfection.

That last sentence is a constraint on you: your document must state explicitly that **crossing an era boundary does not resolve any other domain's open problems** — it only widens the capability envelope.

**Culture** (`CULTURE_SYSTEM.md`) already frames its relationship to era as inflection, not production:

> The five canonical eras are capability envelopes and, above all, changing relationships between the civilization and knowledge — never fixed cultural unlock lists. Culture is inflected by era; it is not dispensed by it. Gating is deferred to `ERA_PROGRESSION.md`; later eras are never culturally superior or conflict-free.

Your document should make clear that Culture's contribution to readiness is about *maturity of relationship to knowledge* (legitimacy of institutions, transmission fidelity, resolved-vs-unresolved cultural tension), not a monotone "culture points" stock — `CULTURE_SYSTEM.md` Section 17 forbids treating culture as a single scalar except as an explicitly-defined derived projection, so if you read a Culture signal, name it as that kind of projection, not a raw stock.

**Memory** (`MEMORY_SYSTEM.md`) already limits itself to record-keeping, not gating:

> Memory records era transitions as foundational legacy anchors and inflects its media and institutions by era; it emits no gating signal beyond the historical record of the transition, and era gating is owned entirely by `ERA_PROGRESSION.md`.

So Memory's "contribution" is subtly different from the other five: it is less a forward-looking readiness signal and more a **historical-accumulation depth** measure (breadth and depth of secured record, continuity of institutional memory) — and separately, Memory is the domain that **records** the transition after you decide it, as a permanent legacy anchor. Your document should specify both roles: Memory as a contributor *and* Memory as the recorder-of-record for the event you produce.

**Ecology and Citizen — the two gaps you must fill carefully.** Unlike the four domains above, neither `ECOLOGY_SYSTEM.md` nor `CITIZEN_SYSTEM.md` has yet written an explicit "era progression contract" section or a named contribution coefficient (they predate the convention). You cannot silently invent obligations for them that contradict what they *do* say. Instead:

- For **Ecology**, ground its contribution in `SIMULATION_SYSTEMS.md` Section 15's own phrase, "ecological succession (Ecology)," and in what `ECOLOGY_SYSTEM.md` already defines as legitimate ecological maturity signals — e.g. its four-stage crystal-network maturity progression, mycelial network depth, and habitat succession stages (`ECOLOGY_SYSTEM.md`, crystal ecology maturation section). Cite the specific mechanism you're borrowing from, and phrase Ecology's contribution as a *reading* of its existing state, not a new obligation placed on it.
- For **Citizen**, ground its contribution in the same Section 15 phrase, "population and institutional maturity (Citizen)," using `CITIZEN_SYSTEM.md`'s own concepts of institutional formation, skill transmission, and (if the document has adopted it under the Tier 6 latitude of `SIMULATION_SYSTEMS.md` Section 19) life-cycle depth — never population *count* alone, since population size is explicitly not allowed to be a proxy for civilizational maturity on its own.
- Flag, in your document's own deferred-questions section, that a future compatibility pass may want `ECOLOGY_SYSTEM.md` and `CITIZEN_SYSTEM.md` to add explicit named contribution coefficients (mirroring Technology's `w_era`) for symmetry — but do not require it; your formula must work with what they currently expose.

**Learning Integration** (`LEARNING_INTEGRATION.md`) explicitly disclaims era gating as something it owns, and is upstream of everyone, including you — read it only to confirm you are never reading raw telemetry, only the already-interpreted signals the other six domains have already processed.

### 9. The corrective this document must make explicit

`SIMULATION_SYSTEMS.md` Section 15 opens by narrating its own history: "The earlier draft made era advancement a function chiefly of research maturity; this revision separates the two." Your document is the payoff of that correction. State plainly, early in your document (mirroring how `SIMULATION_SYSTEMS.md` Section 16 states it): **research readiness `R` is one input among several and must never alone equal an era transition.** This is a law you are inheriting, not proposing.

### 10. Forbidden tokens (`ARCHITECTURE.md` Trope Guard, restated in every sibling)

Never use: thermal, heat, fire, flame, combust, smoke, steam, forge, daylight, sun, coin, gold, xp, score, build, construct, zone. No progress bar, XP bar, level-up popup, or percentage-to-next-era readout may be described as user-facing — `GAME_DESIGN.md` Section 7 is explicit that a transition is staged as "a gradual overnight metamorphosis — never a popup, never a fanfare screen."

---

## STRUCTURAL TEMPLATE

Follow the shape of `ECONOMY_SYSTEM.md` and `MEMORY_SYSTEM.md` (both fully authored — read them as your closest structural models, ECONOMY_SYSTEM.md especially, since it is the most recently completed sibling and the tightest example of the citation discipline expected). Suggested section list — adjust numbering as content demands, but cover all of this ground:

1. **Document Status And Authority** — position in the stack, what this document binds vs. refuses to bind (the "Binds" list should include: the readiness combination formula, the four thresholds `Θ_era`, the weight/contribution model per domain, the transition-detection and staging contract, the Memory-anchoring contract, the non-regression and non-punishment guarantees for era state specifically. The "Refuses to bind" list should include: any domain's internal mechanics, exact numeric weight *values* — named as symbols here, bound at implementation — and all rendering/staging visuals).
2. **Era Progression Philosophy** — why eras exist, tying back to `VISION.md`'s "Meaning Of Eras" and the idea that advancement is a change in relationship to knowledge, not a tech-tier climb.
3. **Vocabulary Ladder** — define precisely: readiness, contribution, weight, threshold, gate, capability envelope, transition, staging, regression (forbidden), floor requirement (if you require a minimum from every domain, not just a weighted sum — recommended, since Section 15 forbids any single domain silently defining the era, which a pure weighted sum without floors could still allow if one domain's contribution collapses to zero while others compensate).
4. **Domain Ownership** — specializing Section 14; restate what you own and, explicitly, what you do not (you do not own any domain's internal mechanics, only the combination and the gate).
5. **Conceptual State Model** — what state this domain projects: current era designation (already owned by `SIMULATION_SYSTEMS.md` Section 2's "Era and progression state" family — you specialize it, you don't duplicate it), the six contribution readings, the combined readiness value, transition history pointer (owned jointly with Memory).
6. **The Five Canonical Eras And Four Thresholds** — the table above, plus your reasoning for how `Θ_era` should scale across the four boundaries.
7. **The Readiness Formula** — the actual mathematical model. Recommend: a bounded combination (e.g. a weighted mean with per-domain floors, or a weighted geometric mean, which naturally punishes any domain collapsing toward zero and thereby enforces "no single domain solely defines the era" as a structural property rather than a promise) over the six normalized per-domain contributions, each contribution itself a bounded `[0,1]` reading the domain already exposes or can reasonably expose from what's documented. Must be monotone (Law 2 territory), must never regress era on its own (paired with Section 10 below), and must show its work — no unexplained magic constant.
8. **Capability Envelopes, Not Packages** — restate and specialize Section 15's envelope/representative-example/path-dependent trichotomy for your own gating logic: crossing the gate only ever *widens what's possible*, never installs anything.
9. **The Transition Event** — mechanics of the moment the gate opens: relationship to `BENTHIC_BLOOM`; the fact that the transition is a committed-state change like any other (no new engine flag); handoff to Memory as a permanent legacy anchor; handoff to rendering as an overnight-metamorphosis staging obligation (owned by `ART_DIRECTION.md`/Tier 8, not by you).
10. **Interfaces To The Six Peer Domains** — one clearly-labeled subsection per domain (Technology/`w_era`, Economy/Section 18, Culture/inflection, Memory/legacy-anchor-and-contribution, Ecology/succession-derived, Citizen/population-institutional-maturity), each citing the exact passage you're specializing.
11. **Non-Regression And Non-Punishment** — eras never regress (state machine law); ordinary user absence cannot reduce readiness that has already accrued, because readiness is built from largely-legacy-class signals (Section 10 of `SIMULATION_SYSTEMS.md`); restate the Stellar Guard here or in the era-five subsection.
12. **Temporal Evaluation** — inherits event-driven, lazy, no-ticking evaluation from `SIMULATION_SYSTEMS.md` Sections 3–4; era checks happen at commit time, not on a clock.
13. **Determinism And Explainability** — every era crossing must be causally reconstructable from the six contributing readings; seeded variation, if any, may only affect incidental staging details, never whether/when the gate opens.
14. **Player-Facing Expression** — no progress bar, no percentage, no popup; the transition is felt only through the changed world (light language, terrain, buildings) and a new permanent Memory vault entry, per `GAME_DESIGN.md` Section 7's "How An Era Turns."
15. **Example Scenarios** — 4-8 deterministic, seeded scenarios in the sibling style ("initial conditions → contributions → threshold check → outcome → legacy"), including at least one where a civilization is strong in most domains but blocked by one lagging domain (demonstrating the floor/no-single-domain-defines-it property), one ordinary `BENTHIC_BLOOM`-triggered crossing, one long-absence-then-return case showing no regression, and one showing a settlement-level technology gap that persists even after the civilization-wide era gate opens (demonstrating envelope-vs-package).
16. **Failure Modes And Edge Cases** — e.g. near-threshold oscillation prevention (must not flicker back and forth — tie to monotonicity), a domain contribution stuck at floor indefinitely, simultaneous multi-threshold crossing in one evaluation (does a single huge `BENTHIC_BLOOM` ever jump two eras at once? — recommend explicitly forbidding it, one era per evaluation, to preserve the "invisible threshold" pacing feel of `GAME_DESIGN.md` Section 7).
17. **Inputs And Outputs** — what you receive from each of the six domains plus Learning Integration context; what you emit (era designation, transition record to Memory, capability-envelope context to Technology/Economy/Culture/Ecology/Citizen for their own path-dependent development).
18. **Invariants** — numbered hard laws, in the style of `ECONOMY_SYSTEM.md` Section 27, covering at minimum: no single domain gates alone; eras never regress; era transition solves nothing else; envelope not package; no new engine event flags; absence never blocks or reverses readiness; the Stellar Guard; determinism/explainability; no user-facing progress meter.
19. **AI Generation Rules** — rules any future feature proposal touching era progression must pass, mirroring `ECONOMY_SYSTEM.md` Section 28's rule format.
20. **Deferred Questions** — exact weight *values*, exact threshold *values*, exact per-domain contribution formulas (each domain's own internal derivation of its `[0,1]` reading stays owned by that domain), whether Ecology/Citizen later adopt named coefficients symmetrical to `w_era`, implementation-level state schema.
21. **Validation Checklist** — checkbox list mirroring the sibling closing checklists, verifying every constraint above is satisfied.
22. **Closing Validation Statement** — closing prose in the register the siblings use: plain declarative sentences, thematically tying the mechanism back to the emotional thesis (the night, the user's mind as sole energy source, six domains in honest disagreement resolving into one quiet threshold crossed).

---

## STYLE REQUIREMENTS

- Prose register matches the six completed siblings: dense, precise, declarative, occasional short poetic closing lines — never marketing copy, never bullet-only.
- Mathematics in plain text (`Θ_era`, `w_tech`, `R_readiness`, etc.), never LaTeX, matching `SIMULATION_SYSTEMS.md`'s notation convention.
- Every non-obvious claim carries a citation to the specific file and section it specializes or is constrained by.
- No emojis, anywhere (project-wide rule, `CLAUDE.md`).
- Close with a "Closing Validation Statement" naming every file in the dependency stack, exactly as `ECONOMY_SYSTEM.md` and `SIMULATION_SYSTEMS.md` do.

---

## DEFINITION OF DONE

The file passes if: it never contradicts any binding passage quoted above; every peer domain's already-stated contribution is used as given, not rewritten; the readiness formula is fully specified in symbolic form with an explicit non-single-domain-gate property; the five eras and four thresholds are correctly ordered and named; the Stellar Guard, the three numeric anchors, and the `BENTHIC_BLOOM` interaction are all present; no new engine event flag is introduced; no forbidden token appears; and the closing validation statement lists all fourteen dependency files plus itself.
