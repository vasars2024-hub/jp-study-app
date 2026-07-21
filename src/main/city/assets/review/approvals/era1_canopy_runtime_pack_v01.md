# Era I Fungal Canopy Runtime Approval

- Review id: `noctis.review.era1.canopy_runtime_pack.v01`
- Production record: `source/prompts/generation_records/era1_canopy_runtime_pack_v01.md`
- Runtime ids:
  - `noctis.environment.era1.ancestral_basin.canopy_cluster.v01.base`
  - `noctis.environment.era1.ancestral_basin.canopy_cluster.v02.base`
  - `noctis.environment.era1.ancestral_basin.canopy_cluster.v03.base`
- Review date: 2026-07-20
- Reviewer: user-directed continuation with Codex technical normalization
- Result: runtime approved

## Locked Runtime Result

The canopy pack contains a tall background-capable braided cluster, a wide midground sibling split into two growth groups, and a smaller juvenile derivative. All preserve irregular overlapping shelf levels, strong root contact, asymmetrical subordinate growth, and visible open passages. None contains an entrance, room, door, balcony, constructed platform, light source, or civic marker.

## Technical Review

- V01 and V02 chroma keys removed with soft matte, despill, and one-pixel edge contraction.
- V03 is a deterministic smaller derivative of V02 on the same registered anchor.
- All assets are 512 × 512 straight-alpha PNGs with normalized transparent RGB.
- Every variant uses anchor `(0.50, 0.94)` and matching crop-safe bounds.
- SHA-256 hashes, production provenance, and license references are registered.
- `validateAssetPackage()` passes with eight runtime assets and the remaining inventory correctly incomplete.
- All 25 city tests pass.

## Runtime Review

- District: edge placement increases the cramped ancestral-basin feeling without covering the civic center.
- Detail: selecting `Fungal canopy cluster` moves the camera to the ecology and shows the approved name and description.
- Travel/readability: the wide sibling keeps a visible gap between its main growth groups; the tall cluster retains multiple trunk openings.
- Layering: canopy art remains behind routes, shelters, citizens, and the spore-hearth.
- Highlight: the soft focus treatment identifies the ecology without making it resemble an active building.
- Whole Civilization: the silhouettes remain legible as environmental framing rather than civic landmarks.
- Reduced motion: growth-reveal animation is disabled while the complete still geometry remains visible.

The next production family is the four-part root-path set with registered entry and exit continuity anchors.
