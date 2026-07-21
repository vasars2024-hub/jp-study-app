# Blanc Toolbox coordination

Updated: 2026-07-20

## Ownership

- Claude Primary: implementation, tests, and verification across the Blanc Toolbox surface.
- Codex Primary: not currently active on this surface.

The 2026-07-18 split (Claude read-only audit, Codex applies all edits) is retired as of
2026-07-20. It described a two-agent session that is no longer running; commit `4b846f1`
had already landed the Blanc build-out under Claude authorship. If a second agent picks
this surface back up, restore the split and the conflict rule below before doing so.

## In scope

- `src/shared/toolbox*.ts`
- `src/shared/__tests__/toolbox*.test.ts`
- `src/renderer/components/blanc/BlancShell.tsx`
- `src/renderer/theme/blanc.css`
- `src/renderer/toolboxSettings.ts`
- Blanc-specific IPC and preload bindings under `src/main.ts`, `src/preload.ts`, and `src/renderer/window.d.ts`

## Conflict rule (dormant — reinstate if a second agent joins)

Claude Primary must return findings with file and line references only. Codex Primary applies all edits after checking the current file state.

## Scope rule (still in force)

Unrelated city-engine, mining-rules, extension, and application-shell work is out of scope.

## API recovery rule

If Claude reports an overload, rate limit, authentication failure, empty response, or interrupted stream, retry the same read-only audit once. If the retry fails, Codex Primary completes the audit locally and records the failure.
