/**
 * Procedural root bed.
 *
 * The atlas base was a warm soil mound that read as a blob pasted on the
 * terrace; `gradeMushroomSprite` cuts it away, and this draws the replacement:
 * roots and mycelium spreading into the plate, a low mist band, and a few
 * satellite fungi so the hero has neighbours instead of a bare stage. Drawn in
 * the plate's own cool key, flattened in Y so it recedes with the terrain
 * rather than facing the viewer.
 *
 * Roots scale with the stem — a kaiju has kaiju roots — but everything that
 * belongs to the *ground* (satellite fungi, mist, soil texture) is sized from
 * `groundUnit`, a fraction of the world. Otherwise the late stages drag the
 * scenery up with them and the ground detail turns into searchlights.
 */

const ROOT_DARK = '9, 16, 26';
const ROOT_COOL = '132, 190, 214';
const MYCELIUM = '116, 224, 218';

function seeded(index: number, salt: number) {
  const value = Math.sin(index * 57.311 + salt * 91.271) * 43758.5453;
  return value - Math.floor(value);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export interface MushroomBedOptions {
  /** 1..50. Drives spread, density and how lit the mycelium reads. */
  stage: number;
  /** Width of the stem where it meets the ground, in canvas pixels. */
  stemWidth: number;
  /**
   * Size of one "ground" feature in canvas pixels — derived from the world, not
   * from the hero, so scenery keeps a constant physical scale across stages.
   */
  groundUnit: number;
}

export function drawMushroomBed(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  { stage, stemWidth, groundUnit }: MushroomBedOptions,
) {
  context.clearRect(0, 0, width, height);
  if (width < 8 || height < 8) return;

  const growth = Math.min(1, Math.max(0, (stage - 1) / 49));
  const originX = width / 2;
  // The contact point sits high in the bed so roots and mist can run in front
  // of it, which is what sells the mushroom as standing *in* the terrace.
  const originY = height * 0.4;
  const spread = clamp(stemWidth * 1.15, groundUnit * 1.5, width * 0.42);
  const depth = Math.min(height * 0.52, spread * 0.5);
  /** Vertical foreshortening of the ground plane the roots spread across. */
  const FLATTEN = 0.42;

  // 1. Contact shadow: broad, soft, nearly black-violet, never a clean disc.
  const shadowY = originY + depth * 0.3;
  const shadow = context.createRadialGradient(
    originX,
    shadowY,
    0,
    originX,
    shadowY,
    spread * 1.1,
  );
  shadow.addColorStop(0, 'rgba(3, 6, 12, 0.8)');
  shadow.addColorStop(0.44, 'rgba(4, 8, 15, 0.4)');
  shadow.addColorStop(1, 'rgba(4, 8, 15, 0)');
  context.save();
  context.translate(originX, shadowY);
  context.scale(1, 0.3);
  context.translate(-originX, -shadowY);
  context.fillStyle = shadow;
  context.fillRect(0, 0, width, height);
  context.restore();

  // 2. Roots, as a foreshortened radial fan rather than a side-on splay: the
  //    ground recedes, so a root heading "outward" travels far less in Y than
  //    in X. Every stroke fades to nothing at its tip, which is what stops a
  //    lit root from reading as a light ray.
  const rootCount = Math.round(14 + growth * 12);
  for (let pass = 0; pass < 2; pass += 1) {
    for (let index = 0; index < rootCount; index += 1) {
      // Bias the fan downward — roots that head straight up the screen would be
      // travelling away from the viewer and are hidden by the mushroom anyway.
      const angle =
        Math.PI * (0.06 + seeded(index, 3) * 0.88) +
        (index % 2 === 0 ? 0 : Math.PI * 0.02);
      const reach = spread * (0.34 + seeded(index, 5) * 0.66);
      const dirX = Math.cos(angle);
      const dirY = Math.sin(angle);
      const startX = originX + dirX * stemWidth * 0.2;
      const startY = originY + dirY * stemWidth * 0.2 * FLATTEN - depth * 0.06;
      const endX = originX + dirX * reach;
      const endY = originY + dirY * reach * FLATTEN + depth * 0.14;
      // Perpendicular wobble so no root is a straight line.
      const wobble = (seeded(index, 7) - 0.5) * reach * 0.42;
      const controlX = (startX + endX) / 2 - dirY * wobble;
      const controlY = (startY + endY) / 2 + dirX * wobble * FLATTEN;
      const thickness = clamp(
        stemWidth * (0.05 + seeded(index, 13) * 0.06) * (pass === 0 ? 1 : 0.45),
        0.7,
        groundUnit * 0.12,
      );
      const fade = 0.5 + seeded(index, 19) * 0.5;

      const stroke = context.createLinearGradient(startX, startY, endX, endY);
      if (pass === 0) {
        stroke.addColorStop(0, `rgba(${ROOT_DARK}, ${(0.7 * fade).toFixed(3)})`);
        stroke.addColorStop(0.62, `rgba(${ROOT_DARK}, ${(0.4 * fade).toFixed(3)})`);
        stroke.addColorStop(1, `rgba(${ROOT_DARK}, 0)`);
      } else {
        // The moon sits up and to the right; roots leaning that way catch more
        // of it, but every highlight still dies well before the tip.
        const lit = 0.3 + Math.max(0, dirX) * 0.7;
        stroke.addColorStop(0, `rgba(${ROOT_COOL}, ${(0.14 * fade * lit).toFixed(3)})`);
        stroke.addColorStop(0.34, `rgba(${ROOT_COOL}, ${(0.06 * fade * lit).toFixed(3)})`);
        stroke.addColorStop(0.7, `rgba(${ROOT_COOL}, 0)`);
      }

      context.beginPath();
      context.moveTo(startX, startY);
      context.quadraticCurveTo(controlX, controlY, endX, endY);
      context.lineCap = 'round';
      context.lineWidth = thickness;
      context.strokeStyle = stroke;
      context.stroke();

      if (pass === 0 && seeded(index, 23) > 0.62) {
        // Nodules where a root dives back under the mat.
        context.beginPath();
        context.ellipse(
          controlX,
          controlY,
          thickness * 1.6,
          thickness * 0.9,
          0,
          0,
          Math.PI * 2,
        );
        context.fillStyle = `rgba(${ROOT_DARK}, 0.5)`;
        context.fill();
      }
    }
  }

  // 3. Mycelium: fine bioluminescent threads, densest right at the contact and
  //    gone within a fraction of the root spread.
  const threadCount = Math.round(10 + growth * 16);
  context.lineWidth = clamp(stemWidth * 0.012, 0.6, groundUnit * 0.03);
  for (let index = 0; index < threadCount; index += 1) {
    const angle = seeded(index, 29) * Math.PI * 2;
    const reach = spread * (0.1 + seeded(index, 31) * 0.34);
    const startX = originX + Math.cos(angle) * reach * 0.25;
    const startY = originY + Math.sin(angle) * reach * 0.25 * FLATTEN;
    const endX = originX + Math.cos(angle) * reach;
    const endY = originY + Math.sin(angle) * reach * FLATTEN + depth * 0.08;
    const alpha = (0.06 + growth * 0.1) * (0.35 + seeded(index, 37) * 0.65);
    const stroke = context.createLinearGradient(startX, startY, endX, endY);
    stroke.addColorStop(0, `rgba(${MYCELIUM}, ${alpha.toFixed(3)})`);
    stroke.addColorStop(1, `rgba(${MYCELIUM}, 0)`);
    context.beginPath();
    context.moveTo(startX, startY);
    context.quadraticCurveTo(
      (startX + endX) / 2 + (seeded(index, 41) - 0.5) * reach * 0.4,
      (startY + endY) / 2,
      endX,
      endY,
    );
    context.strokeStyle = stroke;
    context.stroke();
  }

  // 4. Satellite fungi so the hero has kin at its feet. Ground-scaled: they stay
  //    the size of the small fungi already painted into the plate.
  const satelliteCount = Math.round(3 + growth * 4);
  for (let index = 0; index < satelliteCount; index += 1) {
    const side = index % 2 === 0 ? -1 : 1;
    const distance = stemWidth * 0.6 + groundUnit * (0.3 + seeded(index, 43) * 0.9);
    const x = originX + side * distance;
    const y = originY + depth * (0.16 + seeded(index, 47) * 0.62);
    const capWidth = groundUnit * (0.055 + seeded(index, 53) * 0.05);
    const stalk = capWidth * (1.1 + seeded(index, 59) * 1.3);
    const capX = x + (seeded(index, 61) - 0.5) * capWidth * 0.5;
    if (x < capWidth || x > width - capWidth) continue;

    context.beginPath();
    context.moveTo(x, y);
    context.lineTo(capX, y - stalk);
    context.lineWidth = Math.max(0.8, capWidth * 0.24);
    context.strokeStyle = `rgba(${ROOT_DARK}, 0.78)`;
    context.stroke();

    context.beginPath();
    context.ellipse(capX, y - stalk, capWidth, capWidth * 0.62, 0, Math.PI, Math.PI * 2);
    context.fillStyle = 'rgba(28, 30, 58, 0.9)';
    context.fill();
    context.strokeStyle = `rgba(${ROOT_COOL}, 0.26)`;
    context.lineWidth = 0.8;
    context.stroke();

    if (seeded(index, 67) > 0.4) {
      context.beginPath();
      context.arc(
        capX,
        y - stalk - capWidth * 0.2,
        Math.max(0.6, capWidth * 0.16),
        0,
        Math.PI * 2,
      );
      context.fillStyle = `rgba(${MYCELIUM}, ${(0.22 + growth * 0.3).toFixed(3)})`;
      context.fill();
    }
  }

  // 5. Cyan bounce at the contact point, broken by the roots drawn over it.
  const bounceY = originY + depth * 0.08;
  const bounce = context.createRadialGradient(
    originX,
    bounceY,
    0,
    originX,
    bounceY,
    spread * 0.6,
  );
  const bounceAlpha = 0.06 + growth * 0.08;
  bounce.addColorStop(0, `rgba(86, 214, 208, ${bounceAlpha.toFixed(3)})`);
  bounce.addColorStop(0.5, `rgba(64, 132, 160, ${(bounceAlpha * 0.3).toFixed(3)})`);
  bounce.addColorStop(1, 'rgba(64, 132, 160, 0)');
  context.save();
  context.globalCompositeOperation = 'screen';
  context.translate(originX, bounceY);
  context.scale(1, 0.26);
  context.translate(-originX, -bounceY);
  context.fillStyle = bounce;
  context.fillRect(0, 0, width, height);
  context.restore();

  // 6. Low mist, drawn last so it passes in front of the roots. Ground-scaled
  //    and deliberately faint — it is atmosphere at the hero's feet, not a
  //    light source.
  context.save();
  context.globalCompositeOperation = 'screen';
  for (let index = 0; index < 2; index += 1) {
    const bandY = originY + depth * (0.24 + index * 0.34);
    const bandX = originX + (seeded(index, 71) - 0.5) * groundUnit * 0.6;
    const bandWidth = groundUnit * (1.5 + index * 0.5);
    const mist = context.createRadialGradient(bandX, bandY, 0, bandX, bandY, bandWidth);
    const alpha = 0.032 - index * 0.01;
    mist.addColorStop(0, `rgba(150, 186, 205, ${alpha.toFixed(3)})`);
    mist.addColorStop(0.6, `rgba(120, 156, 184, ${(alpha * 0.4).toFixed(3)})`);
    mist.addColorStop(1, 'rgba(120, 156, 184, 0)');
    context.save();
    context.translate(bandX, bandY);
    context.scale(1, 0.2);
    context.translate(-bandX, -bandY);
    context.fillStyle = mist;
    context.fillRect(0, 0, width, height);
    context.restore();
  }
  context.restore();
}
