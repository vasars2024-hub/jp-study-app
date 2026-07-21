# Era I Ancestral Spore-Hearth Runtime Approval

- Review id: `noctis.review.era1.spore_hearth_runtime_pack.v01`
- Production record: `source/prompts/generation_records/era1_spore_hearth_runtime_pack_v01.md`
- Runtime ids:
  - `noctis.environment.era1.ancestral_basin.spore_hearth.v01.base`
  - `noctis.environment.era1.ancestral_basin.spore_hearth.v01.emissive`
- Review date: 2026-07-20
- Reviewer: user-directed continuation with Codex technical normalization
- Result: runtime approved

## Locked Runtime Result

The 512 × 512 transparent base preserves the shallow radial public basin, contained spore-organ cluster, layered gathering rim, broad root contact, and inward prong rhythm. The prongs are shorter, rounded, uneven, and non-aggressive. The near edge is open and the complete structure remains lower and wider than the ordinary shelters. It does not read as fire, altar, crown, cage, fortress, weapon, or portal.

## Paired Light Control

The 512 × 512 neutral grayscale emissive asset shares identical bounds and anchor with the base. Its visible pixels are restricted to the central spore-organ cluster. Stable mineral/root material, prongs, rim, ground roots, halo, and cast light are excluded from the mask.

## Technical Review

- Chroma key removed with soft matte, despill, and one-pixel edge contraction.
- Fully transparent RGB normalized to zero.
- Base and mask share anchor `(0.50, 0.90)`, dimensions, crop-safe bounds, and reciprocal pair registration.
- SHA-256 hashes and production provenance are registered.
- `validateAssetPackage()` passes with five runtime assets and the remaining inventory correctly reported incomplete.
- Renderer production build and all 25 city tests pass.

## Runtime Review

- District: the hearth is centered at the root-route junction and remains clearly lower than the shelters.
- Detail: selection shows `Ancestral spore-hearth`, `First civic light`, and the approved specialist description.
- Highlight: the soft pale-teal focus treatment outlines the structure without replacing the amber core.
- Active: only the internal organ cluster emits controlled amber light.
- Hibernating: computed emissive opacity and aura opacity are both exactly `0`; the dormant base remains visible and historical geometry is unchanged.
- Growth: the body settles before the emissive response, preventing a one-frame pop.
- Reduced motion: body and light animations are disabled while the correct still state remains.

The next production family is the fungal canopy ecology, which remains a living environmental layer rather than civic architecture.
