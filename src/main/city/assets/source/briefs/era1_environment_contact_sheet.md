# Era I Ancestral Basin Environment Brief

Brief id: `era1_environment_contact_sheet`

Status: exploration direction approved; panel 1 locked as mood and origin-layout reference; production generation paused for the navigable-world correction.

## 1. Asset Family

All `noctis.environment.era1.ancestral_basin.*` and `noctis.motion.era1.ancestral_basin.current_strip.v01.motion` ids in `asset-inventory.json`.

## 2. Authority

- `ART_DIRECTION.md`: nocturnal 2.5D diorama, localized biolight, study-first framing.
- `ENVIRONMENT_DESIGN.md` Sections 2–9: fixed elevated three-quarter view, canonical layer stack, Era I contents, state composites, palette, and lighting.
- `VISUAL_PIPELINE.md` Sections 3–8: one role per output, independent masks, compositing order, and AI-assisted concept workflow.
- `ASSET_PIPELINE.md` Sections 6–9: brief package, generation stages, and rejection rules.

## 3. Purpose And Roles

Create an approved composition reference for the ancestral origin region first. It is not a full-world rectangle. After the navigable-world contract passes and the reference lock is reconfirmed, create one isolated family at a time: sky, ridges, terrain, canopy, foreground, routes, liquid, shelters, hearth, crystals, crossings, decals, fog, and current strip. The concept sheet is reference-only. Production outputs remain separated by manifest role and semantic LOD.

## 4. Canvas, Camera, Crop, Layers

- District-region master: 1920 × 1200, sRGB, fixed elevated three-quarter view. This is an origin-region plate, never the complete civilization canvas.
- Central spore-hearth: within x 42–58%, y 52–72%.
- Core focus safe at 960 × 640 and narrow crop; bottom 12% may be foreground occlusion.
- Era I must feel enclosed: close walls and canopy, short routes, one or two dark traversal mouths, and no broad empty plain that reads as already conquered space.
- Declare west/east region connections, downward root-strata access, world bounds, overlap bleed, and overview/district/detail eligibility before production extraction.
- Keep citizens, particles, text, UI, and global grading out of environment plates.
- Full-canvas plates share the same origin. Isolated elements retain transparent margins and a documented ground anchor.
- Keep connection terrain, routes/circulation, ecology, civic forms, and local light as independently revealable roles. The origin must support cumulative growth and may never be replaced by a one-image era swap.

## 5. Palette And Light

Near-black blue, charcoal violet, deep wine shadow, muted indigo, dark teal, and cold slate dominate. Cold amber hearth light and restrained teal current are local sources. Darkness occupies most of the frame. No global daylight logic.

## 6. Required Negative Space

- Preserve calm dark atmosphere above the hearth.
- Preserve route legibility from hearth to west/east anchor areas.
- Keep the central 50% readable without foreground obstruction.
- No baked labels, panels, signs, glyphs, windows containing text, or icon-like marks.

## 7. Positive Prompt

Use `source/prompts/environment_prompts.md`. Start with `environment-concept-v1`. After one reference is approved, use the isolated role prompts only.

## 8. Negative Prompt

Use the matching negative block. It explicitly rejects daylight, combustion cues, generic fantasy village grammar, surface-human architecture, cyberpunk neon, steampunk machinery, strategy-game framing, UI, text, citizens, particles, and watermark-like symbols.

## 9. References

- `source/references/era1_palette_and_composition.md`
- The checked-in code-native diorama is a layout reference, not a style image to trace.
- No living artist or protected franchise reference is permitted.

## 10. Variants And Selection

Generate 6–12 low-cost concept variations. Select one only if it passes canon, crop, localized-light, route, and layer-separability review. Production then follows the exact variant counts in `asset-inventory.json`; seeded variants differ in silhouette without changing perspective or state meaning.

## 11. Expected Cleanup

Perspective alignment, paint-over of repeated model artifacts, removal of pseudo-text and symbols, separation of citizens/particles, edge reconstruction, palette normalization, transparent-edge cleanup, independent mask authoring, exact canvas registration, and final hash/export.

## 12. Acceptance

- Reads as one patient permanent-night basin at both required crops.
- Reads as a cramped ancestral origin inside a larger unrevealed world, not as the world's rectangular boundary.
- Central hearth, liquid path, root routes, ridges, shelters, and negative space are legible.
- Active and hibernating composites differ through masks and parameters, not changed geometry.
- No forbidden visual grammar or baked runtime role.
- Every promoted file has provenance, approval, dimensions, clean filename, and manifest entry.
- Region edges, traversal anchors, and semantic LOD fallbacks pass manual pan, Whole Civilization, Detail, and Night Drift review.
- Layer staging proves that no era boundary makes terrain, ecology, civic forms, and lighting appear simultaneously or removes an older secured form.
