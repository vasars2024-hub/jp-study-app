# Era I Particle Texture Brief

Brief id: `era1_particle_texture_pack`

Status: approved for generation handoff.

## 1. Asset Family

All `noctis.particle.era1.common.*` ids in `asset-inventory.json`.

## 2. Authority

- `FIREFLY_SYSTEM.md` Sections 1–8: particle families, density, movement, hibernation, and accessibility.
- `VISUAL_PIPELINE.md`: particle role, alpha, tinting, and performance budget.
- `ASSET_PIPELINE.md`: provenance, isolated production, cleanup, and runtime promotion.

## 3. Purpose And Role

Create neutral isolated source textures only. Runtime code controls color, path, speed, lifetime, density, and event causality. The texture must not imply a reward, projectile, or autonomous event.

## 4. Canvas

- Source: 128 × 128 transparent PNG, sRGB, centered form with at least 12 px clean margin.
- Downsampled runtime variants may be 32–128 px after comparison.
- One texture per output. No contact sheet enters runtime.

## 5. Palette And Light

Neutral grayscale is preferred for runtime tint. Limited pale amber, silver, or teal is allowed only where the inventory role is intrinsically colored. No white clipped core.

## 6. Negative Space

Transparent background and clean RGB under alpha. No baked environment, text, frame, icon, shadow plane, or full-canvas glow.

## 7. Positive Prompt

Use `source/prompts/particle_prompts.md`, one named family per request.

## 8. Negative Prompt

Reject spark showers, fire embers, smoke, steam, magic spell particles, confetti, currency pickups, projectile trails, lens flares, stars, UI dots, logos, watermarks, and baked motion blur unless the role explicitly names a ribbon.

## 9. References

Use only the palette sheet and role descriptions. No external artist or game-particle references.

## 10. Variants And Selection

Generate 4–6 candidates per family at contact-sheet scale. Select 3 motes, 3 spores, 2 dust forms, 2 glints, 2 haze tiles, 1 ribbon, and 1 route mote as listed. Forms must remain distinct after 32 px downsampling.

## 11. Expected Cleanup

Manual isolation, alpha repair, removal of dirty halos, neutralization for tint, removal of accidental trails, tile seam correction for haze, consistent centering, downsample test, and manifest hash.

## 12. Acceptance

- Correct count and id for every family.
- Alpha and edge cleanliness pass at dark and light checkerboards.
- Haze tiles seamlessly; other forms do not touch canvas bounds.
- Reduced-motion static presentation remains legible.
- No texture contains gameplay or combustion language.
