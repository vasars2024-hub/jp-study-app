/**
 * Mushroom sprite integration pass.
 *
 * The supplied growth atlas is authored in a warm brown/tan key on a soil mound,
 * which is why the hero read as pasted over the cold moonlit plate. Rather than
 * re-authoring 50 frames, the sprite is re-lit at load time to the world's own
 * light: the warm soil bed is cut away, the palette is rotated into the plate's
 * blue-violet band, and a directional moon key from the upper right is applied
 * against deep shadow on every downward-facing surface. Existing cyan
 * bioluminescence is detected first and protected from the grade.
 */

export interface GradedSprite {
  /** Fully processed sprite, ready to blit. */
  image: ImageData;
  /** Emissive-only layer: the bioluminescent pixels, everything else clear. */
  emissive: ImageData;
  /** Tight bounds of the surviving silhouette. Empty sprites report width 0. */
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Direction of the moon key in screen space (up and to the right). */
const MOON_X = 0.72;
const MOON_Y = -0.69;

const COOL_RIM = [186, 221, 232] as const;
const COOL_AMBIENT = [96, 138, 176] as const;
const BIOLUME = [104, 236, 226] as const;

function smoothstep(edge0: number, edge1: number, value: number) {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
  else if (max === gn) h = ((bn - rn) / d + 2) / 6;
  else h = ((rn - gn) / d + 4) / 6;
  return [h * 360, s, l];
}

function hueToRgb(p: number, q: number, t: number) {
  let tt = t;
  if (tt < 0) tt += 1;
  if (tt > 1) tt -= 1;
  if (tt < 1 / 6) return p + (q - p) * 6 * tt;
  if (tt < 1 / 2) return q;
  if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
  return p;
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) {
    const v = Math.round(l * 255);
    return [v, v, v];
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hn = (((h % 360) + 360) % 360) / 360;
  return [
    Math.round(hueToRgb(p, q, hn + 1 / 3) * 255),
    Math.round(hueToRgb(p, q, hn) * 255),
    Math.round(hueToRgb(p, q, hn - 1 / 3) * 255),
  ];
}

/**
 * How strongly a hue reads as the atlas's warm soil/stem key. Peaks across the
 * browns and tans and falls off before it can touch the mauve cap.
 */
function warmWeight(hue: number) {
  if (hue >= 105) return 0;
  return 1 - smoothstep(52, 105, hue);
}

/** How strongly a hue reads as the atlas's mauve cap, which only needs a nudge. */
function violetWeight(hue: number) {
  return smoothstep(255, 285, hue) * (1 - smoothstep(320, 350, hue));
}

/**
 * Locates the top of the sprite's soil mound by scanning up from the base for a
 * contiguous run of rows dominated by warm, soil-coloured pixels. Returns -1
 * when there is no real mound, so frames that already end in stem or tendril
 * are left untouched.
 */
function findSoilLine(
  data: Uint8ClampedArray,
  width: number,
  minY: number,
  maxY: number,
) {
  if (maxY < minY) return -1;
  const span = maxY - minY + 1;
  // Never eat more than the bottom third: a badly-keyed frame should lose its
  // mound, not its stem.
  const highestCut = maxY - Math.floor(span * 0.34);
  let soilLine = -1;
  let warmRows = 0;

  for (let y = maxY; y >= highestCut; y -= 1) {
    let opaque = 0;
    let warm = 0;
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      if (data[index + 3] <= 32) continue;
      opaque += 1;
      const [hue, saturation, lightness] = rgbToHsl(
        data[index],
        data[index + 1],
        data[index + 2],
      );
      // Soil clods are warm, reasonably saturated and mid-dark. The pale stem
      // and root filaments sit well above that lightness, so a stem row
      // correctly ends the mound.
      if (hue < 60 && saturation > 0.16 && lightness < 0.55) warm += 1;
    }
    if (opaque < 3) continue;
    if (warm / opaque < 0.42) break;
    warmRows += 1;
    soilLine = y;
  }

  // A couple of stray warm rows are not a mound.
  return warmRows >= Math.max(3, Math.round(span * 0.05)) ? soilLine : -1;
}

/** Box-blurs the alpha channel into a normalised coverage field. */
function coverageField(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  radius: number,
) {
  const source = new Float32Array(width * height);
  for (let index = 0; index < source.length; index += 1) {
    source[index] = data[index * 4 + 3] / 255;
  }
  const horizontal = new Float32Array(width * height);
  const output = new Float32Array(width * height);
  const window = radius * 2 + 1;

  for (let y = 0; y < height; y += 1) {
    let sum = 0;
    const row = y * width;
    for (let x = -radius; x <= radius; x += 1) {
      sum += source[row + Math.min(width - 1, Math.max(0, x))];
    }
    for (let x = 0; x < width; x += 1) {
      horizontal[row + x] = sum / window;
      sum -= source[row + Math.min(width - 1, Math.max(0, x - radius))];
      sum += source[row + Math.min(width - 1, Math.max(0, x + radius + 1))];
    }
  }
  for (let x = 0; x < width; x += 1) {
    let sum = 0;
    for (let y = -radius; y <= radius; y += 1) {
      sum += horizontal[Math.min(height - 1, Math.max(0, y)) * width + x];
    }
    for (let y = 0; y < height; y += 1) {
      output[y * width + x] = sum / window;
      sum -= horizontal[Math.min(height - 1, Math.max(0, y - radius)) * width + x];
      sum += horizontal[Math.min(height - 1, Math.max(0, y + radius + 1)) * width + x];
    }
  }
  return output;
}

/**
 * Re-lights a keyed sprite into the garden's palette and light. Operates in
 * place on `image` and returns the emissive layer plus the surviving bounds.
 */
export function gradeMushroomSprite(image: ImageData): GradedSprite {
  const { width, height, data } = image;

  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * 4 + 3] > 32) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  const emissive = new ImageData(width, height);
  if (maxX < minX || maxY < minY) {
    return { image, emissive, minX: 0, minY: 0, maxX: -1, maxY: -1 };
  }

  // 1. Cut the warm soil bed. The base is feathered rather than sliced so the
  //    procedural mycelium can take the junction over without a visible seam.
  const soilLine = findSoilLine(data, width, minY, maxY);
  if (soilLine >= 0) {
    const feather = Math.max(2, Math.round((maxY - minY + 1) * 0.045));
    for (let y = Math.max(0, soilLine - feather); y < height; y += 1) {
      const fade = y >= soilLine ? 0 : 1 - (y - (soilLine - feather)) / feather;
      for (let x = 0; x < width; x += 1) {
        const index = (y * width + x) * 4;
        if (data[index + 3] === 0) continue;
        data[index + 3] = Math.round(data[index + 3] * fade);
      }
    }

    // Recompute bounds; everything downstream keys off the surviving silhouette.
    minX = width;
    minY = height;
    maxX = -1;
    maxY = -1;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        if (data[(y * width + x) * 4 + 3] > 32) {
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < minX || maxY < minY) {
      return { image, emissive, minX: 0, minY: 0, maxX: -1, maxY: -1 };
    }
  }

  const spriteHeight = maxY - minY + 1;
  const radius = Math.max(2, Math.round(spriteHeight * 0.022));
  const coverage = coverageField(data, width, height, radius);

  // 2. Palette transfer and directional relight.
  for (let y = minY; y <= maxY; y += 1) {
    const verticalPosition = (y - minY) / Math.max(1, spriteHeight - 1);
    for (let x = minX; x <= maxX; x += 1) {
      const pixel = y * width + x;
      const index = pixel * 4;
      const alpha = data[index + 3];
      if (alpha <= 4) continue;

      const red = data[index];
      const green = data[index + 1];
      const blue = data[index + 2];
      const [hue, saturation, lightness] = rgbToHsl(red, green, blue);

      // Protect light the world already agrees with.
      const bioluminescent =
        blue > red * 1.42 && green > red * 1.24 && lightness > 0.3 && saturation > 0.2;

      let gradedHue = hue;
      let gradedSaturation = saturation;
      let gradedLightness = lightness;

      if (!bioluminescent) {
        const warm = warmWeight(hue);
        const violet = violetWeight(hue);
        if (warm > 0) {
          // Fold the warm band onto the plate's indigo-to-periwinkle range.
          const target = 238 + Math.min(1, Math.max(0, hue / 60)) * 24;
          gradedHue = hue + (target - hue) * warm;
          gradedSaturation = saturation * (1 - 0.34 * warm) + 0.1 * warm;
          gradedLightness = lightness * (1 - 0.2 * warm);
        }
        if (violet > 0) {
          // The mauve cap only needs pulling off its pink side.
          const target = 268;
          gradedHue = gradedHue + (target - gradedHue) * violet * 0.55;
          gradedSaturation = gradedSaturation * (1 + 0.12 * violet);
        }
        gradedSaturation = Math.min(1, gradedSaturation * 0.9);
        gradedLightness *= 0.84;
      }

      let [gradedRed, gradedGreen, gradedBlue] = hslToRgb(
        gradedHue,
        gradedSaturation,
        gradedLightness,
      );

      // Outward normal from the coverage field.
      const left = coverage[pixel - (x > 0 ? 1 : 0)];
      const right = coverage[pixel + (x < width - 1 ? 1 : 0)];
      const up = coverage[pixel - (y > 0 ? width : 0)];
      const down = coverage[pixel + (y < height - 1 ? width : 0)];
      let normalX = left - right;
      let normalY = up - down;
      const normalLength = Math.hypot(normalX, normalY);
      if (normalLength > 1e-4) {
        normalX /= normalLength;
        normalY /= normalLength;
      } else {
        normalX = 0;
        normalY = -1;
      }
      const edgeness = Math.min(1, Math.max(0, 1 - coverage[pixel]));

      const facing = normalX * MOON_X + normalY * MOON_Y;
      const rim = Math.max(0, facing) * Math.pow(edgeness, 0.85);
      const away = Math.max(0, -facing) * Math.pow(edgeness, 0.85);
      const downFacing = Math.max(0, normalY) * edgeness;
      const upFacing = Math.max(0, -normalY) * edgeness;

      // Deep shade under the cap and toward the base; the crown keeps the key.
      const depth = 0.7 + 0.3 * (1 - verticalPosition);
      const shade = depth * (1 - 0.46 * downFacing) * (1 - 0.3 * away);

      gradedRed *= shade;
      gradedGreen *= shade;
      gradedBlue *= shade;

      const rimStrength = rim * 0.72 + upFacing * 0.16;
      gradedRed += COOL_RIM[0] * rimStrength;
      gradedGreen += COOL_RIM[1] * rimStrength;
      gradedBlue += COOL_RIM[2] * rimStrength;

      // A little cold sky bounce so shadowed faces are blue, not just dark.
      const ambient = 0.1 + 0.12 * upFacing;
      gradedRed += COOL_AMBIENT[0] * ambient * 0.24;
      gradedGreen += COOL_AMBIENT[1] * ambient * 0.24;
      gradedBlue += COOL_AMBIENT[2] * ambient * 0.24;

      if (bioluminescent) {
        const glow = 0.45 + 0.35 * lightness;
        gradedRed = gradedRed * (1 - glow) + BIOLUME[0] * glow;
        gradedGreen = gradedGreen * (1 - glow) + BIOLUME[1] * glow;
        gradedBlue = gradedBlue * (1 - glow) + BIOLUME[2] * glow;
        emissive.data[index] = BIOLUME[0];
        emissive.data[index + 1] = BIOLUME[1];
        emissive.data[index + 2] = BIOLUME[2];
        emissive.data[index + 3] = Math.round(alpha * (0.4 + 0.45 * lightness));
      }

      data[index] = Math.min(255, Math.max(0, gradedRed));
      data[index + 1] = Math.min(255, Math.max(0, gradedGreen));
      data[index + 2] = Math.min(255, Math.max(0, gradedBlue));
    }
  }

  return { image, emissive, minX, minY, maxX, maxY };
}
