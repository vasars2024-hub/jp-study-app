# Noctis engine

Deterministic simulation boundary for the civilization module.

## Modules

| File | Responsibility |
|------|----------------|
| `types.ts` | Public type surface |
| `state.ts` | Civilization state shape and factories |
| `constants.ts` | Compile-time coefficients |
| `constraints.ts` | Trope guard and validation |
| `metabolism.ts` | Study-activity to bio-light transmutation |
| `time.ts` | Time-blind interval and decay processing |
| `events.ts` | Systemic event flag evaluation |
| `tests/` | Vitest purity proofs (`environment: 'node'`) |

## Boundary laws

- Deterministic pure TypeScript
- No Electron, React, filesystem, timers, or randomness
- Immutable snapshot transitions only

Canon: `docs/NOCTIS_ECOLOGICAL_ENGINE.md`, `docs/ARCHITECTURE.md`.
