---
doc_id: noctis.tier_7_reconciliation
tier: meta
authority: compatibility_record
role: closed_audit_record
status: complete
depends_on:
  - SIMULATION_SYSTEMS.md
  - CITIZEN_SYSTEM.md
  - ECOLOGY_SYSTEM.md
  - CULTURE_SYSTEM.md
  - TECHNOLOGY_SYSTEM.md
  - MEMORY_SYSTEM.md
  - ECONOMY_SYSTEM.md
  - LEARNING_INTEGRATION.md
  - ERA_PROGRESSION.md
---

# Tier 6/7 Reconciliation Record

## Purpose

This record closes the compatibility pass required by `SIMULATION_SYSTEMS.md` Section 28. It records conflicts found after the Tier 7 domains were authored against different revisions of shared physics and the binding resolution applied before Tier 8 production work.

It introduces no simulation rule. Authority remains with Tiers 1–7.

## Closed Findings

| Finding | Resolution | Owning authority |
|---|---|---|
| Tier 6 described Economy, Memory, and Learning Integration as placeholders after those domains were authored. | Tier 6 now identifies all Tier 7 peers as completed and retains only their shared boundaries. | `SIMULATION_SYSTEMS.md` Sections 20–22 |
| The Tier 6 era contract named Learning maturity directly, omitted Economy, and left the number of gate terms ambiguous. | The gate consumes six secured domain projections: Technology, Ecology, Citizen, Culture, Memory, and Economy. Learning Integration is their sole upstream source and never a seventh term. | `SIMULATION_SYSTEMS.md` Section 15; `ERA_PROGRESSION.md` Sections 5–7 |
| Technology used `w_era` for a domain-owned maturity signal while Era Progression also used it as a mathematical weight. | Technology now emits `x_technology`; Era Progression owns the independent weight `w_technology`. Readings and influence weights are distinct for every domain. | `TECHNOLOGY_SYSTEM.md` Sections 16–17; `ERA_PROGRESSION.md` Sections 4, 7 |
| Ecology and Citizen had no explicit named era projections. | Ecology exposes `x_ecology`; Citizen exposes `x_citizen`. Neither is equivalent to succession or population count alone. | `ECOLOGY_SYSTEM.md` Section 12; `CITIZEN_SYSTEM.md` Section 3 |
| Culture could not lawfully be treated as a monotone stock, yet the era gate requires a monotone contribution. | Culture exposes `x_culture`, a secured maturity-of-relationship-to-knowledge projection. Active practices remain free to fragment, disappear, and revive. | `CULTURE_SYSTEM.md` Sections 16, 31 |
| Memory stated that it emitted no gate signal while Era Progression consumed historical accumulation. | Memory exposes `x_memory` before the gate and separately records an era transition after the gate. It never decides the gate. | `MEMORY_SYSTEM.md` Section 27; `ERA_PROGRESSION.md` Section 10 |
| Economy's readiness contribution was unnamed. | Economy exposes `x_economy`, derived from secured coordination maturity rather than wealth or current output. | `ECONOMY_SYSTEM.md` Section 18 |
| Ecology inherited strict monotonicity that could forbid living local change. | Cumulative network record remains legacy; active habitat form may change through internal causality. Absence causes neither loss nor damage. | `SIMULATION_SYSTEMS.md` Sections 10, 18; `ECOLOGY_SYSTEM.md` Sections 7, 12 |
| Citizen inherited language that could make citizens passive consequences. | Citizens are genuine actors but mint no primary learning-derived value. Ambient individuality is rendered deterministically; identities are committed when durable consequences require them. | `SIMULATION_SYSTEMS.md` Sections 8, 11, 19; `CITIZEN_SYSTEM.md` Sections 3, 6 |
| Learning Integration described the old bridge and IPC as future stubs even after provisional code appeared. | The document now treats old wiring as non-authoritative and binds one final membrane: raw activity stays renderer-local; only interpreted `I` crosses IPC. | `LEARNING_INTEGRATION.md` Sections 3–4, 14 |

## Final Six-Domain Gate Vocabulary

```text
x_technology  -- owned by Technology
x_ecology     -- owned by Ecology
x_citizen     -- owned by Citizen
x_culture     -- owned by Culture
x_memory      -- owned by Memory
x_economy     -- owned by Economy

w_technology, w_ecology, w_citizen,
w_culture, w_memory, w_economy -- owned by Era Progression
```

Learning Integration feeds all six. Era Progression combines all six. Presentation reads the committed result and writes nothing back.

## Implementation Consequence

All engine code written before this reconciliation is non-authoritative. A replacement engine must be derived from the reconciled contracts and prove domain ownership, determinism, legacy preservation, six-domain gating, non-punitive dormancy, and presentation separation in tests. No production asset may encode a simulation fact not present in committed state or an approved presentation projection.

## Closure

The Tier 6/7 compatibility audit is closed. New contradictions discovered later reopen this record explicitly; they are never silently resolved in code or artwork.
