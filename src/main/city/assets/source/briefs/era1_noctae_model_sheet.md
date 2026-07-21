# Era I Noctae Model-Sheet Brief

Brief id: `era1_noctae_model_sheet`

Status: approved for reference generation; runtime frames require manual normalization.

## 1. Asset Family

Reference id `noctis.reference.era1.noctae.model_sheet.v01.base`, followed only after approval by the manually registered runtime idle base and tint mask in `asset-inventory.json`.

## 2. Authority

- `CHARACTER_DESIGN.md`: Noctae anatomy, sensory organs, silhouette, material language, garments, scale, and rejection rules.
- `SPRITE_PIPELINE.md`: 96 × 128 frame, anchor continuity, alpha, palette, and sheet export.
- `ANIMATION_SYSTEM.md`: restrained idle motion and no frame-generated simulation fact.
- `VISUAL_PIPELINE.md` Sections 4, 5, and 8: source standards, normalized anchors, and model limits.

## 3. Purpose And Role

Create a reference-only model sheet for one Era I Nocta body family. It locks anatomy and proportion before any runtime sprite is drawn. It is not a sprite sheet and never enters the runtime bundle.

## 4. Canvas And Views

- 1536 × 1024 review canvas.
- One neutral body in front, back, left profile, right profile, southwest three-quarter, and northeast three-quarter views.
- One consistent ground line and scale guide; no printed text is required.
- Clear separation between body, sensory organs, simple grown garment, and carried object study.
- Runtime frame target after approval: 96 × 128 with a fixed bottom-center ground anchor.

## 5. Palette And Light

Dark mineral-organic body values, muted indigo and cold slate separation, restrained teal sensory response, optional amber civic reflection. The body must remain readable without high emission.

## 6. Negative Space

Each view stands alone without overlap. Leave margin around feelers, limbs, and garment. Background is plain neutral dark; no environment, UI, labels, decorative alphabet, or particle field.

## 7. Positive Prompt

Use `source/prompts/character_prompts.md#noctae-model-sheet-v1`.

## 8. Negative Prompt

Use the paired negative block. Reject human faces, elf/fairy grammar, armor classes, mascot proportions, insect caricature, luminous eyes, weapons, royal clothing, steampunk accessories, cyberpunk implants, text, diagram labels, and inconsistent anatomy.

## 9. References

- `source/references/era1_palette_and_composition.md`
- The SVG Noctae fallback supplies only scale and anchor intent, not final anatomy.
- No artist-name, franchise, or scraped character sheet may be used.

## 10. Variants And Selection

Generate 4–8 model-sheet candidates. Select for canonical anatomy, calm silhouette, non-human sensory presence, readable small-scale shape, consistent views, and suitability for manual sprite redrawing. Do not select on surface polish alone.

## 11. Expected Cleanup

Human redraw of every approved view, anatomy reconciliation across angles, removal of pseudo-labels, proportion grid, silhouette test at 96 × 128, palette reduction, alpha cleanup, anchor registration, and separate tint/sensory mask authoring.

## 12. Acceptance

- Same individual and anatomy in every view.
- Reads at 96 × 128 without becoming a human, mascot, or fantasy class.
- No generated frame is shipped directly.
- Runtime idle frame and tint mask align exactly and pass anchor validation.
