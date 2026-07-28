# Vendored Seanime artifacts

## Provenance

| Field | Value |
|---|---|
| Upstream | https://github.com/5rahim/seanime |
| Pinned commit | `9bdd052afdfc2c2f31293fdb21a27ef8e8bbcce9` |
| Upstream license | GPL-3.0 |
| Local checkout | `C:/Users/Arseniy/Projects/seanime-upstream` |
| Retrieved | 2026-07-27 (Phase 1) |

## Contents

- `generated/types.ts` — **verbatim, byte-identical** copy of
  `seanime-web/src/api/generated/types.ts` at the pinned commit. Produced upstream by
  `go generate ./codegen/main.go`. It has **zero imports**, so it drops in unmodified.
  Do not hand-edit: re-copy from the pinned checkout after a deliberate version bump.

## Why this lives outside `src/`

ADR-001 sequences the GPL-3.0 `LICENSE` flip to *"the moment the first Seanime-derived
file lands in `src/`"* — the start of Phase 2, not before. Phase 1 is a sidecar-only
proof and is meant to stay pre-flip, so the vendored types sit here instead of under
`src/`. Study OS code imports them by relative path; TypeScript compiles imported files
regardless of `tsconfig.json`'s `include`, so no config change is needed.

Moving this directory into `src/` is the Phase-2 action that triggers the ADR-001 flip.

## Type-compatibility note (gate G-1)

Upstream `seanime-web` pins `typescript: ^7.0.2`; this repo is on `~5.2.2`. The
generated types were checked against the repo's own `tsc` 5.2.2 and compile clean
(exit 0) — including `endpoint.types.ts`, which is *not* vendored here and needs a
path alias plus `allowImportingTsExtensions` if it is ever added.
