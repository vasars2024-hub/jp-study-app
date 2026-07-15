# Noctis engine

Deterministic simulation boundary for the civilization module.

## Modules

| File | Responsibility |
|------|----------------|
| `index.ts` | Public exports and the master `evaluate(S, I, dt)` pass |
| `types.ts` | Public type surface |
| `state.ts` | Civilization state shape and initial-state factory |
| `constants.ts` | Canon-cited calibration coefficients |
| `constraints.ts` | Trope guard, state invariants, legacy protection |
| `select.ts` | Seeded deterministic variation (no randomness) |
| `interpretation.ts` | Telemetry membrane: raw study to interpreted input `I` |
| `time.ts` | Elapsed-time evaluation D: cushion, decay, dormancy, wake |
| `metabolism.ts` | Learning evaluation T: transmutation, growth, succession, memory |
| `era.ts` | Era gate: six-domain readiness, geometric mean with floors |
| `events.ts` | Transition observation E: the four closed world-event flags |
| `tests/` | Vitest purity proofs (`environment: 'node'`) |

## Boundary laws

- Deterministic pure TypeScript
- No Electron, React, filesystem, timers, or randomness
- Immutable snapshot transitions only

Canon: `docs/NOCTIS_ECOLOGICAL_ENGINE.md`, `docs/ARCHITECTURE.md`.
