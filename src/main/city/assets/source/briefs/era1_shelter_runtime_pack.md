# Era I Ordinary Shelter Runtime Pack

- Brief id: `noctis.brief.era1.ancestral_basin.shelter_runtime_pack.v01`
- Stage: Phase 6 / Stage 4.2 — controlled production and technical normalization
- Target region: `origin_basin`
- Runtime family: `noctis.environment.era1.ancestral_basin.shelter`
- Authority: `ART_DIRECTION.md`, `ENVIRONMENT_DESIGN.md`, `VISUAL_PIPELINE.md`, `ASSET_PIPELINE.md`
- Locked reference: `review/contact-sheets/era1_phase6_batch02_shelter_family_v01.png`, candidate 2 (center)
- Approval: `review/approvals/era1_phase6_batch02_shelter_selection_v01.md`

## Runtime Purpose

Three ordinary civic shelter variants populate the cramped Era I origin basin. They are inspectable dwellings, never specialist structures. The low ancestral spore-hearth remains the settlement's shared civic focus. Each shelter is an independent transparent element so camera detail, seeded placement, soft selection highlighting, and later regional expansion remain renderer-controlled.

## Canvas And Registration

- Source generation: one isolated opaque shelter per image on flat chroma key.
- Runtime export: 512 × 512 straight-alpha PNG.
- Camera: fixed elevated three-quarter view matching the approved family sheet.
- Runtime anchor: normalized `(0.50, 0.94)` at the central root contact line.
- Crop-safe bounds: normalized left `0.04`, top `0.04`, right `0.96`, bottom `0.97`.
- Supported semantic LODs: Detail, District, and Overview through renderer scaling.
- World placement: origin-basin ground band near the `ordinary_shelters` focus target.
- Neighbor seams and overlap bleed: not applicable; these are isolated civic elements.
- Stratum: surface.

## Visual Contract

Preserve the broad upper plane, gently flared trunk, central mass, embedded roots, restrained pores, charcoal-violet mineral tissue, and non-human grown construction. The access point is a short, low, narrow, irregular split between overlapping root membranes. It may not form a human arch, door frame, window, mouth, or face.

The base contains no emissive light, citizens, atmosphere, terrain, route, shadow, label, or interface mark. Selection glow and arrival staging remain code-native effects.

## Variants

- `v01`: mature standard; balanced upper plane and stable central mass.
- `v02`: controlled left-weighted root spread and subtly uneven upper rim.
- `v03`: slightly younger, narrower family member with reduced height and root spread.

All variants share perspective, material language, value range, and anchor.

## Positive Prompt Core

Create one isolated ordinary Era I Noctae shelter using the selected center candidate only as a morphology reference. Preserve a broad upper plane, gently flared mineral-organic trunk, embedded roots, and a low irregular grown access cleft. Use restrained permanent-night charcoal violet, cold slate, and muted root-brown with clean painterly 2.5D game-asset edges.

## Negative Prompt Core

No mushroom cottage, hut, tent, tower, altar, shrine, monument, human doorway, arch, window, face, mouth, chimney, stairs, sign, fire, glow, smoke, terrain, loose prop, citizen, particle, text, logo, signature, watermark, machinery, cyberpunk, steampunk, or daylight.

## Cleanup And Acceptance

- Remove chroma key with soft matte and despill.
- Reject green fringe, semi-transparent background noise, cast shadows, or cropped roots.
- Trim and fit to the common 512 × 512 registered canvas without stretching.
- Zero RGB under fully transparent pixels and preserve straight alpha.
- Confirm the access cleft does not read as human architecture.
- Confirm the silhouette remains readable at Detail, District, and Whole Civilization scales.
- Register SHA-256, provenance, license record, anchor, crop-safe bounds, and family pairs.
- Review newborn, active, dimmed, hibernating, returning, Night Drift, and Whole Civilization composites before runtime approval.
