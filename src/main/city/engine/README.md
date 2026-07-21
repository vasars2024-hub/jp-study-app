# Noctis Engine

This folder is the pure deterministic simulation boundary. It has no Electron, React, DOM, filesystem, clock, timer, IPC, or random dependency.

Public entry points from `index.ts`:

- `createInitialState(seed)`
- `evaluateCivilization(state, interpretedInput, elapsedMinutes?)`
- `advanceCivilizationTime(state, elapsedMinutes)`
- `interpretTelemetry(rawCountsOnlyWindow)`
- `projectCityPresentation(state, flags?)`
- `validateState(state)`

The engine returns fresh snapshots and the closed four-event flag set. Cross-domain proposals read the same committed prior state; Era resolves from six explicit secured contributions; Memory records committed crossings after the gate.

Tests live in `tests/` and run in the Node Vitest environment.
