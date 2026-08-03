#!/usr/bin/env node
// ────────────────────────────────────────────────────────────────────────────────
// PIXEL-SAMPLED CONTRAST — slice 73.
//
// ## Why this exists
//
// Every contrast number this track has produced was computed from CSS COLOURS: resolve the
// declared colour, walk up the ancestor chain for the first opaque backdrop, composite. That is a
// good measurer and it is honest about its limits — a boundary sitting over a gradient, a
// backdrop-filter, or a semi-transparent stack has no single backdrop colour to resolve, so it
// returns UNMEASURABLE rather than inventing one. `packaged-a11y-deep-gate.mjs`'s own B0 self-test
// asserts exactly that (`text over a gradient -> UNMEASURABLE as designed`).
//
// Then slice 72 pointed it at `--theme=frutiger-aero`, a glass-and-gradient palette, and B2
// reported PASS on 8 scored samples out of 251 controls. 97% came back UNMEASURABLE. That is not a
// pass; it is a theme that is INVISIBLE TO THE INSTRUMENT, and:
//
//     an invisible failure and an absent failure produce byte-identical output.
//
// That is the same signature as the `ringOf` regex that matched nothing for two slices, and as B3
// passing on 2 stops of 52 while a focus indicator failed on every window. This file is the
// different instrument: stop asking the stylesheet what colour something is, and ask the screen.
//
// ## The one rule this file is built around
//
// A sampler that reads the wrong rectangle, or reads a stale frame, produces confident numbers
// about nothing — which is the most expensive thing this codebase has repeatedly paid for. So
// NOTHING here reports an app number until it has got KNOWN ANSWERS right, and every check is
// fail-closed: it refuses rather than degrading to a guess.
//
//   * `--selftest-offline` needs no app, no CDP and no packaged build. It proves the PNG decoder
//     against bytes whose answer is known, including all five filter types and a deliberately
//     NON-SQUARE image (a transposed decoder round-trips a square one perfectly).
//   * `verifyMapping` DERIVES the CSS-pixel -> image-pixel scale from planted fiducials and
//     cross-checks it four ways. `window.devicePixelRatio` is recorded but NOT used as input — it
//     is evidence, not truth. The offline test feeds it a synthetic image built at scale 2 and
//     requires it to report 2, because a mapping verifier that always returns 1 passes every 1:1
//     run and silently corrupts every other one.
//   * The stale-frame check is a DIFFERENTIAL: recolour a fiducial, capture again, and require
//     both that the new colour is present AND that the old colour is absent from the whole image.
//     Asserting only the first passes on a stale frame that happens to contain both.
//
// ## Dependency direction — do not reverse it
//
// `packaged-a11y-deep-gate.mjs` runs `main()` at import. NOTHING may ever import it. The gate
// imports this file; this file imports nothing from the repo. That is also why the PNG helpers
// here are not shared with the gate's `encodePng`.
//
// The page-side probe builders take the GATE'S OWN `HELPERS` / `CONTRAST_MATH` source as an
// argument rather than copying it. `__describe` and `__path` are what the CSS-vs-pixel join is
// keyed on, so a divergent copy would silently produce zero joins — an absence that reads exactly
// like "the two paths agree".
//
// ## Two traps that live in this file's page-side template literals
//
//   - NO BACKTICKS inside them. A backtick ends the probe string and the file stops parsing, with
//     the error pointing at prose.
//   - DOUBLE every backslash in a regex written inside them. A single \s reaches the browser as a
//     bare 's', producing a regex that matches nothing and throws nothing. Verify with
//     `node docs/migration/tools/scan-probe-escapes.mjs docs/migration/tools/a11y-pixel-sampler.mjs`
//     (expects 0). This file avoids page-side regex almost entirely for that reason.
//
// usage:
//   node docs/migration/tools/a11y-pixel-sampler.mjs --selftest-offline
//   node docs/migration/tools/a11y-pixel-sampler.mjs --selfcheck
// ────────────────────────────────────────────────────────────────────────────────

import zlib from 'node:zlib';

// ════════════════════════════════════════════════════════════════════════════════
// PNG — a decoder, and the minimal encoder its self-test needs
// ════════════════════════════════════════════════════════════════════════════════

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

export function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** bytes per pixel at bit depth 8, by PNG colour type. 3 is palette: one index byte. */
const CHANNELS = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/**
 * The Paeth predictor, verbatim from the PNG spec. This and Average are where hand-written
 * decoders break, and they break QUIETLY: a wrong comparison or a wrong shift produces an image
 * that is still a plausible-looking picture, just not the one that was sent.
 */
function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

/**
 * Decode a PNG to straight RGBA. Every chunk CRC is verified — a screenshot that arrived
 * truncated over the CDP socket must throw, not decode into plausible garbage.
 *
 * Chromium's `Page.captureScreenshot` emits 8-bit RGBA (colour type 6), non-interlaced, and its
 * zlib encoder picks a filter PER ROW, so all five filter types show up in practice. Anything
 * outside what is handled here throws with the reason named.
 */
export function decodePng(input) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input ?? []);
  if (!buf || buf.length < 8) throw new Error('png: buffer too short to hold a signature');
  for (let i = 0; i < 8; i += 1) {
    if (buf[i] !== PNG_SIGNATURE[i]) throw new Error('png: bad signature at byte ' + i);
  }
  let pos = 8;
  let ihdr = null;
  let palette = null;
  const idat = [];
  while (pos + 8 <= buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const dataStart = pos + 8;
    const dataEnd = dataStart + len;
    if (dataEnd + 4 > buf.length) throw new Error('png: chunk ' + type + ' overruns the buffer');
    const data = buf.subarray(dataStart, dataEnd);
    const declaredCrc = buf.readUInt32BE(dataEnd);
    const actualCrc = crc32(buf.subarray(pos + 4, dataEnd));
    if (declaredCrc !== actualCrc) {
      throw new Error('png: CRC mismatch on chunk ' + type
        + ' (declared ' + declaredCrc + ', computed ' + actualCrc + ')');
    }
    if (type === 'IHDR') {
      if (len !== 13) throw new Error('png: IHDR is ' + len + ' bytes, expected 13');
      ihdr = {
        width: data.readUInt32BE(0),
        height: data.readUInt32BE(4),
        bitDepth: data[8],
        colourType: data[9],
        compression: data[10],
        filter: data[11],
        interlace: data[12],
      };
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'PLTE') {
      palette = data;
    } else if (type === 'IEND') {
      break;
    }
    pos = dataEnd + 4;
  }
  if (!ihdr) throw new Error('png: no IHDR chunk');
  if (ihdr.bitDepth !== 8) throw new Error('png: bit depth ' + ihdr.bitDepth + ' is not supported (only 8)');
  if (ihdr.interlace !== 0) throw new Error('png: interlaced images are not supported');
  const channels = CHANNELS[ihdr.colourType];
  if (!channels) throw new Error('png: colour type ' + ihdr.colourType + ' is not supported');
  if (ihdr.colourType === 3 && !palette) throw new Error('png: indexed image with no PLTE chunk');
  if (!idat.length) throw new Error('png: no IDAT chunk');

  const { width, height } = ihdr;
  const lineBytes = width * channels;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const needed = (lineBytes + 1) * height;
  if (raw.length < needed) {
    throw new Error('png: inflated to ' + raw.length + ' bytes, need ' + needed);
  }

  // Un-filter in place into one flat buffer; `cur` and `prev` are VIEWS onto it, so writing
  // through `cur` is what makes the next row's Up/Paeth references correct.
  const lines = Buffer.alloc(lineBytes * height);
  let rp = 0;
  for (let y = 0; y < height; y += 1) {
    const ft = raw[rp];
    rp += 1;
    const cur = lines.subarray(y * lineBytes, (y + 1) * lineBytes);
    const prev = y > 0 ? lines.subarray((y - 1) * lineBytes, y * lineBytes) : null;
    for (let i = 0; i < lineBytes; i += 1) {
      const x = raw[rp + i];
      const a = i >= channels ? cur[i - channels] : 0;
      const b = prev ? prev[i] : 0;
      const c = prev && i >= channels ? prev[i - channels] : 0;
      let v;
      if (ft === 0) v = x;
      else if (ft === 1) v = x + a;
      else if (ft === 2) v = x + b;
      else if (ft === 3) v = x + ((a + b) >> 1);
      else if (ft === 4) v = x + paeth(a, b, c);
      else throw new Error('png: unknown filter type ' + ft + ' on row ' + y);
      cur[i] = v & 0xff;
    }
    rp += lineBytes;
  }

  const rgba = new Uint8Array(width * height * 4);
  for (let p = 0; p < width * height; p += 1) {
    const s = p * channels;
    const d = p * 4;
    if (ihdr.colourType === 0) {
      rgba[d] = lines[s]; rgba[d + 1] = lines[s]; rgba[d + 2] = lines[s]; rgba[d + 3] = 255;
    } else if (ihdr.colourType === 2) {
      rgba[d] = lines[s]; rgba[d + 1] = lines[s + 1]; rgba[d + 2] = lines[s + 2]; rgba[d + 3] = 255;
    } else if (ihdr.colourType === 3) {
      const idx = lines[s] * 3;
      rgba[d] = palette[idx]; rgba[d + 1] = palette[idx + 1]; rgba[d + 2] = palette[idx + 2];
      rgba[d + 3] = 255;
    } else if (ihdr.colourType === 4) {
      rgba[d] = lines[s]; rgba[d + 1] = lines[s]; rgba[d + 2] = lines[s]; rgba[d + 3] = lines[s + 1];
    } else {
      rgba[d] = lines[s]; rgba[d + 1] = lines[s + 1]; rgba[d + 2] = lines[s + 2];
      rgba[d + 3] = lines[s + 3];
    }
  }
  return { width, height, bitDepth: ihdr.bitDepth, colourType: ihdr.colourType, data: rgba };
}

/**
 * The encoder exists ONLY so the offline self-test can hand the decoder bytes whose answer is
 * already known, with a chosen filter type per row. `packaged-a11y-deep-gate.mjs` has its own
 * encoder for the artwork fixture; it emits colour type 2 with filter 0 only, so it exercises one
 * of the twenty combinations the decoder actually has to survive.
 */
export function encodePngRaw(width, height, colourType, bytes, filterType) {
  const channels = CHANNELS[colourType];
  if (!channels) throw new Error('encode: unsupported colour type ' + colourType);
  const lineBytes = width * channels;
  const raw = Buffer.alloc((lineBytes + 1) * height);
  let o = 0;
  for (let y = 0; y < height; y += 1) {
    raw[o] = filterType;
    o += 1;
    for (let i = 0; i < lineBytes; i += 1) {
      const x = bytes[y * lineBytes + i];
      const a = i >= channels ? bytes[y * lineBytes + i - channels] : 0;
      const b = y > 0 ? bytes[(y - 1) * lineBytes + i] : 0;
      const c = y > 0 && i >= channels ? bytes[(y - 1) * lineBytes + i - channels] : 0;
      let v;
      if (filterType === 0) v = x;
      else if (filterType === 1) v = x - a;
      else if (filterType === 2) v = x - b;
      else if (filterType === 3) v = x - ((a + b) >> 1);
      else if (filterType === 4) v = x - paeth(a, b, c);
      else throw new Error('encode: unknown filter type ' + filterType);
      raw[o] = v & 0xff;
      o += 1;
    }
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body), 0);
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = colourType;
  return Buffer.concat([
    Buffer.from(PNG_SIGNATURE),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 6 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ════════════════════════════════════════════════════════════════════════════════
// WCAG 2.1 maths. Same arithmetic as the gate's CONTRAST_MATH, node-side.
// ════════════════════════════════════════════════════════════════════════════════

export function lum(c) {
  const f = (v) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
}

export function ratio(a, b) {
  const l1 = lum(a);
  const l2 = lum(b);
  const hi = Math.max(l1, l2);
  const lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}

export function srcOver(fg, bg) {
  return {
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a),
    a: 1,
  };
}

const round2 = (n) => Math.round(n * 100) / 100;
const rgbText = (c) => (c ? 'rgb(' + Math.round(c.r) + ', ' + Math.round(c.g) + ', ' + Math.round(c.b) + ')' : null);

// ════════════════════════════════════════════════════════════════════════════════
// The image side: find a colour, derive the mapping, sample a CSS point
// ════════════════════════════════════════════════════════════════════════════════

/**
 * Exact-match bounding box for one colour. Exactness is the point: PNG is lossless, so an
 * interior pixel of a planted fiducial is bit-identical to what was declared. Edge pixels may be
 * blended if the capture was downscaled, which is why the scale below is derived from the
 * SEPARATION between two fiducials rather than from one fiducial's own width.
 */
export function findColourBBox(img, colour) {
  const [wr, wg, wb] = colour;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -1;
  let maxY = -1;
  let count = 0;
  const { data, width, height } = img;
  for (let y = 0; y < height; y += 1) {
    const row = y * width * 4;
    for (let x = 0; x < width; x += 1) {
      const o = row + x * 4;
      if (data[o] !== wr || data[o + 1] !== wg || data[o + 2] !== wb || data[o + 3] < 250) continue;
      count += 1;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (!count) return null;
  return { minX, minY, maxX, maxY, count, width: maxX - minX + 1, height: maxY - minY + 1 };
}

/**
 * DERIVE the CSS-pixel -> image-pixel mapping and cross-check it four ways.
 *
 * `deviceScaleFactor: 1` is pinned by the gate, so the expected answer is 1:1 — but assuming that
 * is exactly the trap. A screenshot may come back at the host's DPR, or clipped, and then every
 * rectangle this sampler reads is fiction while every number it prints looks fine.
 *
 * All four must hold or `ok` is false and the caller must report NOTHING:
 *   1. scaleX and scaleY agree
 *   2. the derived scale matches image.width / documentElement.clientWidth
 *   3. the origin is ~0 on both axes, i.e. the capture is not cropped or offset
 *   4. every fiducial's exact-match pixel COUNT is >= 90% of its expected area — this is what
 *      stops one stray matching pixel elsewhere in the app from ballooning a bounding box and
 *      yielding a confidently wrong scale
 */
export function verifyMapping(img, fiducials, viewport, opts = {}) {
  const scaleTol = opts.scaleTol ?? 0.02;
  const originTol = opts.originTol ?? 1.5;
  const fillTol = opts.fillTol ?? 0.9;
  const found = fiducials.map((f) => ({ ...f, bbox: findColourBBox(img, f.colour) }));
  const missing = found.filter((f) => !f.bbox);
  const summary = () => found.map((f) => ({
    name: f.name,
    colour: f.colour,
    cssRect: f.rect,
    imageBBox: f.bbox,
  }));
  if (missing.length) {
    return {
      ok: false,
      detail: 'fiducial(s) not found in the screenshot: ' + missing.map((f) => f.name).join(', ')
        + ' — the capture is not of the surface the probe planted them on, or a filter altered '
        + 'their colour',
      perFiducial: summary(),
    };
  }
  const pickPair = (axis) => {
    let best = null;
    for (let i = 0; i < found.length; i += 1) {
      for (let j = i + 1; j < found.length; j += 1) {
        const d = Math.abs(found[j].rect[axis] - found[i].rect[axis]);
        if (!best || d > best.d) best = { a: found[i], b: found[j], d };
      }
    }
    return best;
  };
  const px = pickPair('x');
  const py = pickPair('y');
  if (!px || px.d < 50 || !py || py.d < 50) {
    return {
      ok: false,
      detail: 'fiducials are not separated enough to derive a scale (x span ' + (px ? px.d : 0)
        + ', y span ' + (py ? py.d : 0) + ')',
      perFiducial: summary(),
    };
  }
  const scaleX = (px.b.bbox.minX - px.a.bbox.minX) / (px.b.rect.x - px.a.rect.x);
  const scaleY = (py.b.bbox.minY - py.a.bbox.minY) / (py.b.rect.y - py.a.rect.y);
  const originX = found.reduce((n, f) => n + (f.bbox.minX - f.rect.x * scaleX), 0) / found.length;
  const originY = found.reduce((n, f) => n + (f.bbox.minY - f.rect.y * scaleY), 0) / found.length;

  const imageScaleX = img.width / viewport.clientWidth;
  const imageScaleY = img.height / viewport.clientHeight;
  /**
   * `fill` is count / BOUNDING-BOX area, NOT count / declared area.
   *
   * The first version of this used the declared area, and it could not catch the case it exists
   * for: one stray pixel of a fiducial's colour elsewhere in the app stretches the bounding box to
   * 391x293 while `count` only rises from 1920 to 1921, so declared-area fill reads 1.0004 and
   * PASSES. Against the bounding box it reads 0.017 and fails. The size ratios below catch the same
   * thing independently, because a check for a silent defect is worth having twice.
   */
  const sizeOk = (got, want) => Math.abs(got - want) <= Math.max(2, want * 0.06);
  const fills = found.map((f) => {
    const bboxArea = f.bbox.width * f.bbox.height;
    const expectedW = f.rect.w * scaleX;
    const expectedH = f.rect.h * scaleY;
    return {
      name: f.name,
      fill: bboxArea > 0 ? f.bbox.count / bboxArea : 0,
      sizeMatches: sizeOk(f.bbox.width, expectedW) && sizeOk(f.bbox.height, expectedH),
      expectedSize: { w: round2(expectedW), h: round2(expectedH) },
      measuredSize: { w: f.bbox.width, h: f.bbox.height },
    };
  });

  const checks = {
    axesAgree: Math.abs(scaleX - scaleY) <= scaleTol,
    matchesImageWidth: Math.abs(scaleX - imageScaleX) <= scaleTol
      && Math.abs(scaleY - imageScaleY) <= scaleTol,
    originIsZero: Math.abs(originX) <= originTol && Math.abs(originY) <= originTol,
    fiducialsAreSolid: fills.every((f) => f.fill >= fillTol),
    fiducialsAreTheRightSize: fills.every((f) => f.sizeMatches),
  };
  const ok = Object.values(checks).every(Boolean);
  return {
    ok,
    scaleX: round2(scaleX),
    scaleY: round2(scaleY),
    originX: round2(originX),
    originY: round2(originY),
    imageSize: { width: img.width, height: img.height },
    viewport,
    /** Recorded as EVIDENCE, never used as input. See the block comment above. */
    devicePixelRatioReported: viewport.devicePixelRatio ?? null,
    impliedScaleFromImageSize: { x: round2(imageScaleX), y: round2(imageScaleY) },
    fiducialFill: fills.map((f) => ({
      name: f.name,
      fill: round2(f.fill),
      sizeMatches: f.sizeMatches,
      expectedSize: f.expectedSize,
      measuredSize: f.measuredSize,
    })),
    checks,
    detail: ok
      ? 'scale ' + round2(scaleX) + 'x' + round2(scaleY) + ', origin ' + round2(originX) + ','
        + round2(originY) + ' — derived from fiducial separation and agreeing with '
        + img.width + '/' + viewport.clientWidth + '; devicePixelRatio reported as '
        + (viewport.devicePixelRatio ?? 'null') + ' and NOT used'
      : 'mapping REJECTED: ' + Object.entries(checks).filter(([, v]) => !v).map(([k]) => k).join(', '),
    perFiducial: summary(),
  };
}

/** A CSS-pixel sampler bound to one decoded frame and one verified mapping. */
export function makeSampler(img, map) {
  return (x, y) => {
    // floor, not round: CSS coordinate x lies inside the image pixel with index floor(x), and
    // rounding biases every sample half a pixel towards the next element.
    const ix = Math.floor(x * map.scaleX + map.originX);
    const iy = Math.floor(y * map.scaleY + map.originY);
    if (ix < 0 || iy < 0 || ix >= img.width || iy >= img.height) return null;
    const o = (iy * img.width + ix) * 4;
    return { r: img.data[o], g: img.data[o + 1], b: img.data[o + 2], a: img.data[o + 3], ix, iy };
  };
}

/** Distinct opaque colours from a point list, dropping anything off-image or translucent. */
function uniqueColours(samples) {
  const seen = new Map();
  for (const s of samples) {
    if (!s || s.a < 250) continue;
    const key = s.r + ',' + s.g + ',' + s.b;
    if (!seen.has(key)) seen.set(key, { r: s.r, g: s.g, b: s.b });
  }
  return [...seen.values()];
}

// ════════════════════════════════════════════════════════════════════════════════
// The page side: fiducials, known-answer swatches, and sample-point probes
// ════════════════════════════════════════════════════════════════════════════════

/**
 * Deliberately NON-SQUARE and at asymmetric positions, so an x/y transposition cannot pass; and in
 * unusual colours rather than round primaries, because a theme gradient can plausibly contain
 * #ff00ff and essentially never contains #fd07fb.
 */
export const FIDUCIAL_SPEC = [
  { name: 'f-tl', colour: [253, 7, 251], w: 80, h: 24, at: 'tl' },
  { name: 'f-tr', colour: [7, 251, 131], w: 24, h: 80, at: 'tr' },
  { name: 'f-bl', colour: [251, 131, 7], w: 80, h: 24, at: 'bl' },
  { name: 'f-mid', colour: [7, 131, 251], w: 40, h: 16, at: 'mid' },
];

/** The colour f-mid is repainted to for the stale-frame differential. */
export const STALE_COLOUR = [131, 7, 251];

/**
 * KNOWN ANSWERS. The primary assertion on every row is that the SAMPLED RGB equals the expected
 * RGB — no remembered constant is involved, so the test cannot absorb a wrong expectation the way
 * a loose ratio tolerance can. `ratio` is pinned only where the arithmetic is beyond doubt:
 * #000 on #fff is exactly 21, and #777 on #888 is 1.264 (the two B0 already pins).
 *
 * `flat-gradient` is the row this whole slice exists for: the CSS path returns UNMEASURABLE for a
 * background-image, and the pixel path must return exactly (32, 64, 96).
 */
export const SWATCH_SPEC = [
  {
    name: 'black-on-white',
    kind: 'box',
    outer: '#ffffff',
    inner: '#000000',
    outerSize: 64,
    innerSize: 28,
    expectOuter: [255, 255, 255],
    expectInner: [0, 0, 0],
    tol: 0,
    ratio: 21,
    ratioTol: 0.01,
    catches: 'the baseline',
  },
  {
    name: 'grey-on-grey',
    kind: 'box',
    outer: '#888888',
    inner: '#777777',
    outerSize: 64,
    innerSize: 28,
    expectOuter: [136, 136, 136],
    expectInner: [119, 119, 119],
    tol: 0,
    ratio: 1.26,
    ratioTol: 0.01,
    catches: 'a measurer that only gets the easy answer right',
  },
  {
    name: 'half-alpha-white-on-black',
    kind: 'box',
    outer: '#000000',
    inner: 'rgba(255, 255, 255, 0.5)',
    outerSize: 64,
    innerSize: 28,
    expectOuter: [0, 0, 0],
    expectInner: [128, 128, 128],
    tol: 1,
    ratio: null,
    catches: 'PAINT vs DECLARATION — the stylesheet says #fff and the screen says mid-grey',
  },
  {
    name: 'flat-gradient',
    kind: 'box',
    outer: 'linear-gradient(#204060, #204060)',
    inner: '#ffffff',
    outerSize: 64,
    innerSize: 28,
    expectOuter: [32, 64, 96],
    expectInner: [255, 255, 255],
    tol: 0,
    ratio: null,
    catches: 'THE POINT OF THIS SLICE — the CSS path returns UNMEASURABLE here',
  },
  {
    name: 'tight-margin',
    kind: 'box',
    outer: '#ffffff',
    inner: '#000000',
    outerSize: 28,
    innerSize: 20,
    expectOuter: [255, 255, 255],
    expectInner: [0, 0, 0],
    tol: 0,
    ratio: 21,
    ratioTol: 0.01,
    catches: 'a sampler off by more than 2px reads the wrong box',
  },
  {
    name: 'split',
    kind: 'split',
    outer: 'linear-gradient(90deg, #000000 0 50%, #ffffff 50% 100%)',
    outerSize: 64,
    expectP25: [0, 0, 0],
    expectP75: [255, 255, 255],
    tol: 0,
    catches: 'mirroring / x-flip, which a correct-looking decoder can still do',
  },
  {
    name: 'ramp',
    kind: 'ramp',
    outer: 'linear-gradient(90deg, #000000, #ffffff)',
    outerSize: 64,
    catches: 'position-dependent reads rather than one cached colour',
  },
];

/**
 * Plant the fiducials and swatches, then READ THEIR GEOMETRY BACK OFF THE DOM.
 *
 * Reading back rather than trusting the declared CSS is what makes this immune to a transformed
 * ancestor: whatever `position: fixed` resolved against, `getBoundingClientRect` reports where the
 * box actually is, and where it actually is, is what the screenshot contains.
 *
 * NO BACKTICKS AND NO REGEX BELOW.
 */
export const PLANT = `(() => {
  const FID = ${JSON.stringify(FIDUCIAL_SPEC)};
  const SW = ${JSON.stringify(SWATCH_SPEC)};
  const old = document.getElementById('__a11y_px_host');
  if (old) old.remove();
  const cw = document.documentElement.clientWidth;
  const ch = document.documentElement.clientHeight;
  if (cw < 700 || ch < 300) {
    return JSON.stringify({ error: 'viewport too small to plant fiducials: ' + cw + 'x' + ch });
  }
  const host = document.createElement('div');
  host.id = '__a11y_px_host';
  host.style.cssText = 'position:fixed;left:0;top:0;width:100%;height:100%;margin:0;padding:0;'
    + 'border:0;pointer-events:none;z-index:2147483647;';
  document.documentElement.appendChild(host);
  const rgb = (c) => 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')';
  const box = (parent, left, top, w, h, background, id) => {
    const d = document.createElement('div');
    d.setAttribute('data-px', id);
    d.style.cssText = 'position:absolute;margin:0;padding:0;border:0;box-sizing:border-box;'
      + 'left:' + left + 'px;top:' + top + 'px;width:' + w + 'px;height:' + h + 'px;'
      + 'background:' + background + ';';
    parent.appendChild(d);
    return d;
  };
  const fidEls = FID.map((f) => {
    let left = 8;
    let top = 6;
    if (f.at === 'tr') { left = cw - 8 - f.w; top = 6; }
    if (f.at === 'bl') { left = 8; top = ch - 8 - f.h; }
    if (f.at === 'mid') { left = Math.round(cw * 0.45); top = Math.round(ch * 0.45); }
    return { spec: f, el: box(host, left, top, f.w, f.h, rgb(f.colour), 'fid:' + f.name) };
  });
  const swEls = [];
  let x = 8;
  for (const s of SW) {
    const outer = box(host, x, 44, s.outerSize, s.outerSize, s.outer, 'sw:' + s.name);
    let inner = null;
    if (s.kind === 'box') {
      const m = (s.outerSize - s.innerSize) / 2;
      inner = box(outer, m, m, s.innerSize, s.innerSize, s.inner, 'swin:' + s.name);
    }
    swEls.push({ spec: s, outer: outer, inner: inner });
    x += s.outerSize + 8;
  }
  const rectOf = (el) => {
    const r = el.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  };
  const points = [];
  for (const e of swEls) {
    const r = rectOf(e.outer);
    const n = e.spec.name;
    if (e.spec.kind === 'box') {
      points.push({ name: n + ':outerLeft', x: r.x + 2, y: r.y + r.h / 2 });
      points.push({ name: n + ':outerTop', x: r.x + r.w / 2, y: r.y + 2 });
      const ir = rectOf(e.inner);
      points.push({ name: n + ':inner', x: ir.x + ir.w / 2, y: ir.y + ir.h / 2 });
    } else if (e.spec.kind === 'split') {
      points.push({ name: n + ':p25', x: r.x + r.w * 0.25, y: r.y + r.h / 2 });
      points.push({ name: n + ':p75', x: r.x + r.w * 0.75, y: r.y + r.h / 2 });
    } else {
      points.push({ name: n + ':p10', x: r.x + r.w * 0.10, y: r.y + r.h / 2 });
      points.push({ name: n + ':p50', x: r.x + r.w * 0.50, y: r.y + r.h / 2 });
      points.push({ name: n + ':p90', x: r.x + r.w * 0.90, y: r.y + r.h / 2 });
    }
  }
  return JSON.stringify({
    viewport: {
      clientWidth: cw,
      clientHeight: ch,
      devicePixelRatio: window.devicePixelRatio,
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
    },
    fiducials: fidEls.map((f) => ({ name: f.spec.name, colour: f.spec.colour, rect: rectOf(f.el) })),
    points: points,
  });
})()`;

/** Repaint one fiducial. Half of the stale-frame differential; the other half is in node. */
export const RECOLOUR = `(() => {
  const el = document.querySelector('[data-px="fid:f-mid"]');
  if (!el) return JSON.stringify({ error: 'f-mid is not planted' });
  el.style.background = 'rgb(${STALE_COLOUR[0]},${STALE_COLOUR[1]},${STALE_COLOUR[2]})';
  const r = el.getBoundingClientRect();
  return JSON.stringify({ rect: { x: r.left, y: r.top, w: r.width, h: r.height } });
})()`;

export const REMOVE = `(() => {
  const h = document.getElementById('__a11y_px_host');
  if (h) h.remove();
  return 1;
})()`;

/** Two frames of settle, so a capture cannot race the style change that preceded it. */
export const RAF_SETTLE = `(() => new Promise((res) => {
  requestAnimationFrame(() => requestAnimationFrame(() => res(1)));
}))()`;

/** The same selector the gate's NONTEXT_CONTRAST uses, so the two paths see the same population. */
const NONTEXT_SEL = "'button, a[href], input:not([type=\"hidden\"]), select, textarea, '\n"
  + "    + '[role=\"button\"], [role=\"tab\"], [role=\"checkbox\"], [role=\"switch\"], [role=\"slider\"], '\n"
  + "    + '[role=\"radio\"], [role=\"menuitem\"]'";

/**
 * Sample points around every control, each one VALIDITY-CHECKED page-side.
 *
 * `document.elementFromPoint` is what makes a pixel read trustworthy: an OUTSIDE point counts only
 * if the topmost element there is neither the control nor a descendant, and an EDGE/INSIDE point
 * only if it is. Without that, a control overlapped by a panel would be scored against the panel's
 * pixels and the number would look perfectly reasonable.
 *
 * Known limitation, stated rather than discovered later: elementFromPoint ignores
 * `pointer-events: none`, so a decorative non-interactive overlay painted above a control corrupts
 * the read WITHOUT being caught here. That is why `outsideDistinct` and the luminance span are
 * recorded per control, and why this path reports ALONGSIDE the CSS path rather than replacing it.
 */
export function nonTextPixelTargets(helpers) {
  return `(() => {
${helpers}
  const SEL = ${NONTEXT_SEL};
  const vw = document.documentElement.clientWidth;
  const vh = document.documentElement.clientHeight;
  const inView = (x, y) => x >= 0 && y >= 0 && x < vw && y < vh;
  const owns = (el, hit) => !!hit && (hit === el || el.contains(hit));
  const rows = [];
  let idx = -1;
  for (const el of document.querySelectorAll(SEL)) {
    idx += 1;
    if (!__visible(el)) continue;
    const r = el.getBoundingClientRect();
    // Same load-bearing classification the CSS path uses (see the boundaryRole note in
    // packaged-a11y-deep-gate.mjs). Without it B2p counts a nav item whose own TEXT identifies it
    // as a 1.4.11 failure because its fill is faint -- but 1.4.11 governs boundaries that identify
    // a control, and 1.4.3 already covers the label. The CSS path excludes 68 such controls on the
    // default theme and reports them alongside; B2p scored all 251 flat, which is why its raw
    // "217 below 3:1" over-counted. Roles:
    //   identity   -- no text at all, so the box IS the control (icon buttons, empty targets)
    //   affordance -- select/input/textarea: the box is what says "you can type/choose here"
    //   state      -- the fill or border is the ONLY thing marking active/selected/pressed
    //   decorative -- the control names itself; the boundary is not load-bearing
    // NO BACKTICKS in this block: it lives inside a template literal sent to the page.
    var ownText = (el.textContent || '').replace(/\\s+/g, ' ').trim();
    var tagName = el.tagName.toLowerCase();
    var isFormControl = tagName === 'select' || tagName === 'input' || tagName === 'textarea';
    var clsName = typeof el.className === 'string' ? el.className : '';
    var isStateful = /(^|\\s|-)(active|selected|current|on)(\\s|$)/.test(clsName)
      || el.getAttribute('aria-selected') === 'true'
      || el.getAttribute('aria-pressed') === 'true'
      || el.getAttribute('aria-checked') === 'true'
      || el.getAttribute('aria-current') != null;
    var boundaryRole = isFormControl ? 'affordance'
      : !ownText ? 'identity'
      : isStateful ? 'state'
      : 'decorative';
    const base = {
      idx: idx,
      el: __describe(el),
      path: __path(el),
      name: __nameInfo(el).name.slice(0, 40),
      inactive: !!(el.disabled || el.getAttribute('aria-disabled') === 'true'),
      hasText: !!ownText,
      boundaryRole: boundaryRole,
      rect: { x: r.left, y: r.top, w: r.width, h: r.height },
    };
    if (r.width < 3 || r.height < 3) {
      rows.push(Object.assign(base, { unmeasurable: 'the control is under 3px on a side' }));
      continue;
    }
    const GAP = 3;
    const inset = Math.max(1, Math.min(6, Math.floor(Math.min(r.width, r.height) / 2) - 1));
    const outside = [];
    const edge = [];
    const inside = [];
    for (const f of [0.25, 0.5, 0.75]) {
      const cx = r.left + r.width * f;
      const cy = r.top + r.height * f;
      outside.push([cx, r.top - GAP], [cx, r.bottom + GAP], [r.left - GAP, cy], [r.right + GAP, cy]);
      edge.push([cx, r.top + 1], [cx, r.bottom - 1], [r.left + 1, cy], [r.right - 1, cy]);
      inside.push([cx, r.top + inset], [cx, r.bottom - inset], [r.left + inset, cy], [r.right - inset, cy]);
    }
    const keep = (list, wantOwned) => {
      const out = [];
      for (const p of list) {
        if (!inView(p[0], p[1])) continue;
        if (owns(el, document.elementFromPoint(p[0], p[1])) !== wantOwned) continue;
        out.push({ x: p[0], y: p[1] });
      }
      return out;
    };
    rows.push(Object.assign(base, {
      outsidePoints: keep(outside, false),
      edgePoints: keep(edge, true),
      insidePoints: keep(inside, true),
    }));
  }
  return JSON.stringify(rows);
})()`;
}

/**
 * Rects only, run AFTER the capture. Any control whose rect moved between the point probe and this
 * one was animating, so its geometry and its pixels describe different moments — dropped, not
 * scored. Cheap by design: no elementFromPoint, so it can run right after the screenshot.
 */
export function rectSnapshot(helpers) {
  return `(() => {
${helpers}
  const SEL = ${NONTEXT_SEL};
  const rows = [];
  let idx = -1;
  for (const el of document.querySelectorAll(SEL)) {
    idx += 1;
    if (!__visible(el)) continue;
    const r = el.getBoundingClientRect();
    rows.push({ idx: idx, x: r.left, y: r.top, w: r.width, h: r.height });
  }
  return JSON.stringify(rows);
})()`;
}

/**
 * Text backdrops. DELIBERATELY WEAKER THAN B2p, and the field names say so.
 *
 * Reading the glyph colour off the screen is a bad idea: antialiasing means the painted text is a
 * blend, and picking the extreme pixel biases every result in whichever direction the hinting went.
 * So this is a HYBRID and the split is the honest part — the FOREGROUND is what CSS declares
 * (composited with its own alpha and the ancestor opacity product, via the gate's already
 * self-tested maths), and only the BACKDROP comes from pixels.
 *
 * That converts "unmeasurable because the backdrop is a gradient" into "measured against the
 * gradient the screen actually painted", which is the specific hole aero opened. It is NOT a
 * pixel-truth reading of text contrast and must not be quoted as one.
 */
export function textBackdropTargets(helpers, contrastMath) {
  return `(() => {
${helpers}
${contrastMath}
  const vw = document.documentElement.clientWidth;
  const vh = document.documentElement.clientHeight;
  const inView = (x, y) => x >= 0 && y >= 0 && x < vw && y < vh;
  const owns = (el, hit) => !!hit && (hit === el || el.contains(hit));
  const rows = [];
  let idx = -1;
  for (const el of document.querySelectorAll('body *')) {
    idx += 1;
    let text = '';
    for (const n of el.childNodes) if (n.nodeType === 3) text += n.nodeValue;
    text = text.replace(/\\s+/g, ' ').trim();
    if (!text) continue;
    if (!__visible(el)) continue;
    const s = getComputedStyle(el);
    const fg = __parse(s.color);
    if (!fg || fg.a === 0) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) continue;
    const back = __backdrop(el);
    const size = parseFloat(s.fontSize) || 16;
    const weight = parseInt(s.fontWeight, 10) || 400;
    const pts = [];
    for (const fx of [0.1, 0.3, 0.5, 0.7, 0.9]) {
      for (const fy of [0.2, 0.5, 0.8]) {
        const x = r.left + r.width * fx;
        const y = r.top + r.height * fy;
        if (!inView(x, y)) continue;
        if (!owns(el, document.elementFromPoint(x, y))) continue;
        pts.push({ x: x, y: y });
      }
    }
    rows.push({
      idx: idx,
      el: __describe(el),
      path: __path(el),
      text: text.slice(0, 40),
      color: s.color,
      fontSize: size,
      fontWeight: weight,
      large: size >= 24 || (size >= 18.66 && weight >= 700),
      inactive: !!el.closest('[disabled], [aria-disabled="true"], fieldset[disabled]'),
      cssUnmeasurable: back.unmeasurable || null,
      opacityProduct: back.opacityProduct == null ? 1 : back.opacityProduct,
      fg: { r: fg.r, g: fg.g, b: fg.b, a: fg.a },
      points: pts,
    });
  }
  return JSON.stringify(rows);
})()`;
}

// ════════════════════════════════════════════════════════════════════════════════
// Scoring
// ════════════════════════════════════════════════════════════════════════════════

/**
 * WCAG 1.4.11 from pixels.
 *
 *     score = max over boundary colours b of ( min over adjacent colours o of ratio(b, o) )
 *
 * The strongest identifying feature carries the verdict — matching the CSS path's "best of fill,
 * border, ring, marker" — but it must hold against the WEAKEST-CONTRASTING adjacent colour, which
 * is the strict reading of "adjacent colour(s)" and the only defensible one over a gradient.
 * `bestPairRatio` is kept beside it so the choice is auditable rather than asserted.
 */
export function scoreNonTextPixels(rows, sample, movedIdx = new Set()) {
  const scored = [];
  for (const row of rows) {
    // `carry` is an explicit whitelist, so a field added to the page-side target row does NOT
    // reach the scored row unless it is named here. That bit once: `boundaryRole` and `hasText`
    // were added to the targets and the summary that counted them reported 0 for EVERY role —
    // including `decorative` — while 114 rows were below threshold. All-zero-across-all-buckets
    // is the shape of a field that never arrived, not of a clean result.
    const carry = {
      idx: row.idx, el: row.el, path: row.path, name: row.name, inactive: row.inactive, rect: row.rect,
      hasText: row.hasText, boundaryRole: row.boundaryRole,
    };
    if (row.unmeasurable) {
      scored.push({ ...carry, unmeasurable: row.unmeasurable });
      continue;
    }
    if (movedIdx.has(row.idx)) {
      scored.push({
        ...carry,
        unmeasurable: 'the control moved between the rect read and the screenshot',
      });
      continue;
    }
    if ((row.outsidePoints?.length ?? 0) < 2) {
      scored.push({
        ...carry,
        unmeasurable: 'fewer than 2 valid backdrop points — occluded, or against the viewport edge',
      });
      continue;
    }
    const boundaryPoints = [...(row.edgePoints ?? []), ...(row.insidePoints ?? [])];
    if (!boundaryPoints.length) {
      scored.push({ ...carry, unmeasurable: 'no valid boundary point inside the control' });
      continue;
    }
    const outs = uniqueColours(row.outsidePoints.map((p) => sample(p.x, p.y)));
    const bnds = uniqueColours(boundaryPoints.map((p) => sample(p.x, p.y)));
    if (!outs.length || !bnds.length) {
      scored.push({
        ...carry,
        unmeasurable: 'sampled pixels fell outside the image or were not opaque',
      });
      continue;
    }
    let best = null;
    for (const b of bnds) {
      let worst = Infinity;
      let against = null;
      for (const o of outs) {
        const r = ratio(b, o);
        if (r < worst) { worst = r; against = o; }
      }
      if (!best || worst > best.ratio) best = { ratio: worst, colour: b, against };
    }
    let bestPair = 0;
    for (const b of bnds) for (const o of outs) bestPair = Math.max(bestPair, ratio(b, o));
    const lums = outs.map((o) => lum(o));
    scored.push({
      ...carry,
      painted: rgbText(best.colour),
      against: rgbText(best.against),
      ratio: round2(best.ratio),
      bestPairRatio: round2(bestPair),
      required: 3,
      passes: best.ratio >= 3,
      outsideDistinct: outs.length,
      boundaryDistinct: bnds.length,
      /** A wide span means a gradient or an occluder; it does not invalidate the strict score,
       *  but it is what an implausible reading looks like from the outside. */
      outsideLuminanceSpan: round2(Math.max(...lums) - Math.min(...lums)),
      samplePoints: {
        outside: row.outsidePoints.length,
        edge: row.edgePoints?.length ?? 0,
        inside: row.insidePoints?.length ?? 0,
      },
    });
  }
  return scored;
}

/** Backdrop-from-pixels, foreground-from-CSS. See textBackdropTargets for why it is split. */
export function scoreTextBackdrops(rows, sample) {
  const scored = [];
  for (const row of rows) {
    const carry = {
      idx: row.idx, el: row.el, path: row.path, text: row.text, color: row.color,
      fontSize: row.fontSize, fontWeight: row.fontWeight, large: row.large,
      inactive: row.inactive, cssUnmeasurable: row.cssUnmeasurable,
      opacityProduct: row.opacityProduct,
    };
    if (!row.points?.length) {
      scored.push({ ...carry, unmeasurable: 'no valid sample point inside the text box' });
      continue;
    }
    const samples = row.points.map((p) => sample(p.x, p.y)).filter((s) => s && s.a >= 250);
    if (!samples.length) {
      scored.push({ ...carry, unmeasurable: 'sampled pixels fell outside the image or were not opaque' });
      continue;
    }
    // Discard pixels close to the DECLARED foreground: those are probable glyph coverage, and
    // averaging them into the backdrop would pull every ratio towards 1 and manufacture failures.
    const fg = row.fg;
    const isGlyph = (s) => Math.abs(s.r - fg.r) + Math.abs(s.g - fg.g) + Math.abs(s.b - fg.b) < 40;
    const glyphCount = samples.filter(isGlyph).length;
    const backdropSamples = samples.filter((s) => !isGlyph(s));
    const pool = backdropSamples.length ? backdropSamples : samples;
    const counts = new Map();
    for (const s of pool) {
      const key = s.r + ',' + s.g + ',' + s.b;
      const hit = counts.get(key) ?? { colour: { r: s.r, g: s.g, b: s.b }, n: 0 };
      hit.n += 1;
      counts.set(key, hit);
    }
    const mode = [...counts.values()].sort((a, b) => b.n - a.n)[0].colour;
    const alpha = fg.a * (row.opacityProduct ?? 1);
    const paintedOn = (bg) => srcOver({ r: fg.r, g: fg.g, b: fg.b, a: alpha }, bg);
    const distinct = uniqueColours(pool);
    let worst = null;
    for (const bg of distinct) {
      const r = ratio(paintedOn(bg), bg);
      if (!worst || r < worst.ratio) worst = { ratio: r, bg };
    }
    const modeRatio = ratio(paintedOn(mode), mode);
    const required = row.large ? 3 : 4.5;
    scored.push({
      ...carry,
      backdropMode: rgbText(mode),
      backdropWorst: rgbText(worst.bg),
      paintedText: rgbText(paintedOn(mode)),
      ratio: round2(modeRatio),
      ratioWorstBackdrop: round2(worst.ratio),
      required,
      passes: worst.ratio >= required,
      backdropDistinct: distinct.length,
      glyphPixelFraction: round2(glyphCount / samples.length),
      samplesUsed: samples.length,
    });
  }
  return scored;
}

/**
 * Join the CSS-path rows to the pixel-path rows.
 *
 * UNAMBIGUOUS JOINS ONLY. A key appearing more than once on either side is excluded and counted,
 * rather than matched by position and hoped for — this app mounts <NotificationBell /> twice in a
 * tray that is in every window, which is exactly how slice 55's phantom missing tab stop happened.
 */
export function joinPaths(cssRows, pixelRows) {
  const keyOf = (r) => r.path + '|' + r.el + '|' + (r.name ?? '');
  const index = (rows) => {
    const m = new Map();
    for (const r of rows) {
      const k = keyOf(r);
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(r);
    }
    return m;
  };
  const cssIdx = index(cssRows);
  const pxIdx = index(pixelRows);
  const buckets = {
    cssUnmeasurablePixelScored: [],
    cssScoredPixelUnmeasurable: [],
    bothUnmeasurable: [],
    bothScoredAgree: [],
    bothScoredDisagree: [],
  };
  let ambiguousJoin = 0;
  let unmatched = 0;
  for (const [key, cssGroup] of cssIdx) {
    const pxGroup = pxIdx.get(key);
    if (!pxGroup) { unmatched += 1; continue; }
    if (cssGroup.length !== 1 || pxGroup.length !== 1) { ambiguousJoin += 1; continue; }
    const c = cssGroup[0];
    const p = pxGroup[0];
    const cssScored = !c.unmeasurable && c.boundaryKind && c.boundaryKind !== 'none'
      && typeof c.ratio === 'number';
    const pxScored = !p.unmeasurable && typeof p.ratio === 'number';
    const row = {
      key,
      surface: c.surface ?? p.surface ?? null,
      cssRatio: cssScored ? c.ratio : null,
      cssBoundaryKind: c.boundaryKind ?? null,
      cssUnmeasurable: c.unmeasurable ?? null,
      pixelRatio: pxScored ? p.ratio : null,
      pixelPainted: p.painted ?? null,
      pixelAgainst: p.against ?? null,
      pixelUnmeasurable: p.unmeasurable ?? null,
    };
    if (!cssScored && pxScored) buckets.cssUnmeasurablePixelScored.push(row);
    else if (cssScored && !pxScored) buckets.cssScoredPixelUnmeasurable.push(row);
    else if (!cssScored && !pxScored) buckets.bothUnmeasurable.push(row);
    else {
      row.delta = round2(Math.abs(c.ratio - p.ratio));
      // 0.5 is wide enough to absorb antialiasing at a 1px border and narrow enough to surface a
      // ring declared opaque that paints at 16% alpha — the slice-62 finding this bucket is for.
      if (row.delta > 0.5) buckets.bothScoredDisagree.push(row);
      else buckets.bothScoredAgree.push(row);
    }
  }
  return {
    ambiguousJoin,
    unmatchedCssKeys: unmatched,
    counts: Object.fromEntries(Object.entries(buckets).map(([k, v]) => [k, v.length])),
    cssUnmeasurablePixelScored: buckets.cssUnmeasurablePixelScored
      .slice().sort((a, b) => a.pixelRatio - b.pixelRatio),
    bothScoredDisagree: buckets.bothScoredDisagree.slice().sort((a, b) => b.delta - a.delta).slice(0, 40),
    cssScoredPixelUnmeasurable: buckets.cssScoredPixelUnmeasurable.slice(0, 20),
  };
}

// ════════════════════════════════════════════════════════════════════════════════
// THE SELF-TESTS
// ════════════════════════════════════════════════════════════════════════════════

/**
 * Everything provable WITHOUT an app: the PNG codec across every filter type and colour type, the
 * WCAG constants, the CRC guard, and — the important one — that `verifyMapping` REPORTS A SCALE OF
 * 2 when handed an image built at scale 2, and REJECTS a viewport that contradicts it.
 *
 * A mapping verifier that always answered 1 would pass every 1:1 run in this repo and corrupt
 * every other one silently, so the test that matters is the one it must not return 1 for.
 */
export function offlineSelfTest() {
  const results = [];
  const check = (name, ok, detail) => { results.push({ name, ok: !!ok, detail }); return !!ok; };

  // ── 1. codec round-trip: 4 colour types x 5 filter types, on a NON-SQUARE image ──
  const W = 61;
  const H = 37;
  for (const colourType of [0, 2, 4, 6]) {
    const channels = CHANNELS[colourType];
    const bytes = Buffer.alloc(W * H * channels);
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = (i * 97 + (i % 13) * 31 + colourType * 7) & 0xff;
    for (const filterType of [0, 1, 2, 3, 4]) {
      const label = 'codec colourType ' + colourType + ' filter ' + filterType + ' on ' + W + 'x' + H;
      let img;
      try {
        img = decodePng(encodePngRaw(W, H, colourType, bytes, filterType));
      } catch (err) {
        check(label, false, 'threw: ' + String(err?.message ?? err));
        continue;
      }
      if (img.width !== W || img.height !== H) {
        check(label, false, 'decoded to ' + img.width + 'x' + img.height);
        continue;
      }
      // Expansion written out per colour type rather than reusing the decoder's own helper, so
      // this compares against the source bytes instead of against the decoder agreeing with itself.
      let bad = null;
      for (let p = 0; p < W * H && !bad; p += 1) {
        const s = p * channels;
        const d = p * 4;
        const got = [img.data[d], img.data[d + 1], img.data[d + 2], img.data[d + 3]];
        let want;
        if (colourType === 0) want = [bytes[s], bytes[s], bytes[s], 255];
        else if (colourType === 2) want = [bytes[s], bytes[s + 1], bytes[s + 2], 255];
        else if (colourType === 4) want = [bytes[s], bytes[s], bytes[s], bytes[s + 1]];
        else want = [bytes[s], bytes[s + 1], bytes[s + 2], bytes[s + 3]];
        for (let k = 0; k < 4; k += 1) {
          if (got[k] !== want[k]) {
            bad = 'pixel ' + p + ' channel ' + k + ': got ' + got[k] + ', want ' + want[k];
            break;
          }
        }
      }
      check(label, !bad, bad ?? 'pixel-exact across all ' + W * H + ' pixels');
    }
  }

  // ── 2. a corrupted chunk must THROW, not decode into plausible garbage ──
  {
    const bytes = Buffer.alloc(16 * 16 * 3, 0x40);
    const png = encodePngRaw(16, 16, 2, bytes, 0);
    const corrupt = Buffer.from(png);
    corrupt[corrupt.length - 12] ^= 0xff;
    let threw = false;
    try { decodePng(corrupt); } catch { threw = true; }
    check('a corrupted chunk fails its CRC and throws', threw,
      threw ? 'throws as designed' : 'DECODED CORRUPT BYTES SILENTLY');
  }

  // ── 3. the WCAG constants B0 already pins, computed here rather than remembered ──
  {
    const r21 = round2(ratio({ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 }));
    check('ratio(#000, #fff) is 21.00', Math.abs(r21 - 21) < 0.01, String(r21));
    const r126 = round2(ratio({ r: 0x77, g: 0x77, b: 0x77 }, { r: 0x88, g: 0x88, b: 0x88 }));
    check('ratio(#777, #888) is 1.26', Math.abs(r126 - 1.26) < 0.01, String(r126));
    const half = srcOver({ r: 255, g: 255, b: 255, a: 0.5 }, { r: 0, g: 0, b: 0 });
    const r528 = round2(ratio(half, { r: 0, g: 0, b: 0 }));
    check('#fff at alpha .5 over #000 is 5.28, not 21', Math.abs(r528 - 5.28) < 0.02, String(r528));
  }

  // ── 4. THE ONE THAT MATTERS: a synthetic frame at scale 2 must be REPORTED as scale 2 ──
  {
    const cssW = 400;
    const cssH = 300;
    const scale = 2;
    const rects = [
      { name: 'f-tl', colour: [253, 7, 251], rect: { x: 8, y: 6, w: 80, h: 24 } },
      { name: 'f-tr', colour: [7, 251, 131], rect: { x: cssW - 8 - 24, y: 6, w: 24, h: 80 } },
      { name: 'f-bl', colour: [251, 131, 7], rect: { x: 8, y: cssH - 8 - 24, w: 80, h: 24 } },
      { name: 'f-mid', colour: [7, 131, 251], rect: { x: 180, y: 135, w: 40, h: 16 } },
    ];
    const iw = cssW * scale;
    const ih = cssH * scale;
    const bytes = Buffer.alloc(iw * ih * 3, 0xff);
    for (const f of rects) {
      const x0 = Math.round(f.rect.x * scale);
      const y0 = Math.round(f.rect.y * scale);
      const x1 = x0 + Math.round(f.rect.w * scale);
      const y1 = y0 + Math.round(f.rect.h * scale);
      for (let y = y0; y < y1; y += 1) {
        for (let x = x0; x < x1; x += 1) {
          const o = (y * iw + x) * 3;
          bytes[o] = f.colour[0]; bytes[o + 1] = f.colour[1]; bytes[o + 2] = f.colour[2];
        }
      }
    }
    // filter 4 so this also exercises Paeth on a real picture rather than on noise
    const img = decodePng(encodePngRaw(iw, ih, 2, bytes, 4));
    const map = verifyMapping(img, rects, { clientWidth: cssW, clientHeight: cssH, devicePixelRatio: 2 });
    check('a frame captured at scale 2 is REPORTED as scale 2 (not assumed 1:1)',
      map.ok && map.scaleX === 2 && map.scaleY === 2,
      'ok=' + map.ok + ' scaleX=' + map.scaleX + ' scaleY=' + map.scaleY
      + ' originX=' + map.originX + ' originY=' + map.originY);

    // the sampler built on that mapping must read CSS coordinates correctly
    const sample = makeSampler(img, map);
    const mid = rects[3];
    const hit = sample(mid.rect.x + mid.rect.w / 2, mid.rect.y + mid.rect.h / 2);
    check('the sampler reads the right pixel through a 2x mapping',
      !!hit && hit.r === 7 && hit.g === 131 && hit.b === 251,
      hit ? 'sampled rgb(' + hit.r + ',' + hit.g + ',' + hit.b + ') at image ' + hit.ix + ',' + hit.iy : 'null');

    // NEGATIVE CONTROL. Same image, a viewport that says it is 1:1. The cross-check must REJECT.
    const lying = verifyMapping(img, rects, { clientWidth: iw, clientHeight: ih, devicePixelRatio: 1 });
    check('a viewport contradicting the derived scale is REJECTED (the check can fail)',
      lying.ok === false && lying.checks?.matchesImageWidth === false,
      'ok=' + lying.ok + ' matchesImageWidth=' + String(lying.checks?.matchesImageWidth));
  }

  // ── 5. a stray matching pixel must not be allowed to balloon a bounding box ──
  {
    const cssW = 400;
    const cssH = 300;
    const rects = [
      { name: 'f-tl', colour: [253, 7, 251], rect: { x: 8, y: 6, w: 80, h: 24 } },
      { name: 'f-tr', colour: [7, 251, 131], rect: { x: cssW - 8 - 24, y: 6, w: 24, h: 80 } },
      { name: 'f-bl', colour: [251, 131, 7], rect: { x: 8, y: cssH - 8 - 24, w: 80, h: 24 } },
      { name: 'f-mid', colour: [7, 131, 251], rect: { x: 180, y: 135, w: 40, h: 16 } },
    ];
    const bytes = Buffer.alloc(cssW * cssH * 3, 0xff);
    for (const f of rects) {
      for (let y = f.rect.y; y < f.rect.y + f.rect.h; y += 1) {
        for (let x = f.rect.x; x < f.rect.x + f.rect.w; x += 1) {
          const o = (y * cssW + x) * 3;
          bytes[o] = f.colour[0]; bytes[o + 1] = f.colour[1]; bytes[o + 2] = f.colour[2];
        }
      }
    }
    const clean = decodePng(encodePngRaw(cssW, cssH, 2, bytes, 0));
    const cleanMap = verifyMapping(clean, rects, { clientWidth: cssW, clientHeight: cssH, devicePixelRatio: 1 });
    check('the 1:1 control maps cleanly', cleanMap.ok && cleanMap.scaleX === 1,
      'ok=' + cleanMap.ok + ' scaleX=' + cleanMap.scaleX);
    // one stray pixel of f-tl's colour in the far corner
    const strayO = ((cssH - 2) * cssW + (cssW - 2)) * 3;
    bytes[strayO] = 253; bytes[strayO + 1] = 7; bytes[strayO + 2] = 251;
    const dirty = decodePng(encodePngRaw(cssW, cssH, 2, bytes, 0));
    const dirtyMap = verifyMapping(dirty, rects, { clientWidth: cssW, clientHeight: cssH, devicePixelRatio: 1 });
    check('one stray matching pixel makes the mapping FAIL rather than skew',
      dirtyMap.ok === false, 'ok=' + dirtyMap.ok + ' fill=' + JSON.stringify(dirtyMap.fiducialFill));
  }

  const ok = results.every((r) => r.ok);
  return {
    ok,
    passed: results.filter((r) => r.ok).length,
    total: results.length,
    summary: results.filter((r) => r.ok).length + '/' + results.length + ' offline assertions passed'
      + (ok ? '' : ' — FAILED: ' + results.filter((r) => !r.ok).map((r) => r.name).join('; ')),
    results,
  };
}

/** Grab one frame and decode it. */
export async function capture(cdp) {
  const msg = await cdp.send('Page.captureScreenshot', {
    format: 'png', fromSurface: true, captureBeyondViewport: false,
  });
  const data = msg?.result?.data;
  if (!data) throw new Error('Page.captureScreenshot returned no data');
  return decodePng(Buffer.from(data, 'base64'));
}

/** Known-answer checks against the planted swatches. See SWATCH_SPEC for what each one catches. */
export function checkSwatches(sample, points) {
  const byName = new Map(points.map((p) => [p.name, p]));
  const get = (name) => {
    const p = byName.get(name);
    if (!p) return null;
    return sample(p.x, p.y);
  };
  const near = (got, want, tol) => !!got
    && Math.abs(got.r - want[0]) <= tol && Math.abs(got.g - want[1]) <= tol
    && Math.abs(got.b - want[2]) <= tol;
  const asRgb = (s) => (s ? 'rgb(' + s.r + ', ' + s.g + ', ' + s.b + ')' : null);
  const results = [];
  for (const s of SWATCH_SPEC) {
    if (s.kind === 'box') {
      const outerLeft = get(s.name + ':outerLeft');
      const outerTop = get(s.name + ':outerTop');
      const inner = get(s.name + ':inner');
      const okOuter = near(outerLeft, s.expectOuter, s.tol) && near(outerTop, s.expectOuter, s.tol);
      const okInner = near(inner, s.expectInner, s.tol);
      let sampledRatio = null;
      let okRatio = !!(outerLeft && inner);
      if (outerLeft && inner) {
        sampledRatio = round2(ratio(inner, outerLeft));
        if (s.ratio != null) okRatio = Math.abs(sampledRatio - s.ratio) <= s.ratioTol;
      }
      results.push({
        swatch: s.name,
        catches: s.catches,
        ok: okOuter && okInner && okRatio,
        expectedOuter: s.expectOuter,
        sampledOuterLeft: asRgb(outerLeft),
        sampledOuterTop: asRgb(outerTop),
        expectedInner: s.expectInner,
        sampledInner: asRgb(inner),
        tolerance: s.tol,
        expectedRatio: s.ratio,
        sampledRatio,
      });
    } else if (s.kind === 'split') {
      const p25 = get(s.name + ':p25');
      const p75 = get(s.name + ':p75');
      results.push({
        swatch: s.name,
        catches: s.catches,
        ok: near(p25, s.expectP25, s.tol) && near(p75, s.expectP75, s.tol),
        expectedP25: s.expectP25,
        sampledP25: asRgb(p25),
        expectedP75: s.expectP75,
        sampledP75: asRgb(p75),
      });
    } else {
      const p10 = get(s.name + ':p10');
      const p50 = get(s.name + ':p50');
      const p90 = get(s.name + ':p90');
      const monotonic = !!(p10 && p50 && p90) && lum(p10) < lum(p50) && lum(p50) < lum(p90);
      results.push({
        swatch: s.name,
        catches: s.catches,
        ok: monotonic,
        sampledP10: asRgb(p10),
        sampledP50: asRgb(p50),
        sampledP90: asRgb(p90),
        detail: monotonic ? 'luminance strictly increases across the ramp'
          : 'the ramp did not read as position-dependent',
      });
    }
  }
  return { ok: results.every((r) => r.ok), results };
}

/**
 * THE IN-APP PROOF. Returns `{ ok }`, and the caller must report NOTHING when it is false.
 *
 * Order matters: offline first (cheapest and most fundamental), then the mapping, then the
 * stale-frame differential, then the known answers. Each one is a precondition for the next being
 * meaningful — a swatch that reads correctly through an unverified mapping proves nothing.
 */
export async function pixelSelfTest(cdp, { sleep }) {
  const steps = [];
  const record = (name, ok, detail, extra = {}) => {
    steps.push({ name, ok: !!ok, detail, ...extra });
    return !!ok;
  };

  const offline = offlineSelfTest();
  record('B0p-0 the PNG codec, the WCAG maths and the scale detector, offline',
    offline.ok, offline.summary, { results: offline.results });
  if (!offline.ok) return { ok: false, steps };

  let planted;
  try {
    planted = JSON.parse(await cdp.evaluate(PLANT));
  } catch (err) {
    record('B0p-1 fiducials and swatches are planted', false,
      'the plant probe threw: ' + String(err?.message ?? err));
    return { ok: false, steps };
  }
  if (planted.error) {
    record('B0p-1 fiducials and swatches are planted', false, planted.error);
    return { ok: false, steps };
  }
  record('B0p-1 fiducials and swatches are planted', true,
    planted.fiducials.length + ' fiducials, ' + planted.points.length + ' swatch sample points, '
    + 'geometry READ BACK off the DOM rather than trusted from the CSS that declared it');

  await cdp.evaluate(RAF_SETTLE).catch(() => null);
  await sleep(250);

  let frame1;
  try {
    frame1 = await capture(cdp);
  } catch (err) {
    record('B0p-2 the CSS pixel to image pixel mapping', false,
      'capture or decode failed: ' + String(err?.message ?? err));
    await cdp.evaluate(REMOVE).catch(() => null);
    return { ok: false, steps };
  }
  const mapping = verifyMapping(frame1, planted.fiducials, planted.viewport);
  record('B0p-2 the CSS pixel to image pixel mapping is DERIVED and cross-checked, not assumed',
    mapping.ok, mapping.detail, { mapping });
  if (!mapping.ok) {
    await cdp.evaluate(REMOVE).catch(() => null);
    return { ok: false, steps, mapping };
  }

  // ── the stale-frame differential ──
  await cdp.evaluate(RECOLOUR).catch(() => null);
  await cdp.evaluate(RAF_SETTLE).catch(() => null);
  await sleep(250);
  let staleOk = false;
  let staleDetail = '';
  try {
    const frame2 = await capture(cdp);
    const oldColour = FIDUCIAL_SPEC.find((f) => f.name === 'f-mid').colour;
    const fresh = findColourBBox(frame2, STALE_COLOUR);
    const stale = findColourBBox(frame2, oldColour);
    staleOk = !!fresh && !stale;
    staleDetail = 'after repainting f-mid: the NEW colour is '
      + (fresh ? 'present (' + fresh.count + 'px)' : 'ABSENT')
      + ' and the OLD colour is ' + (stale ? 'STILL PRESENT (' + stale.count + 'px) — the capture '
        + 'returned a stale frame' : 'gone');
  } catch (err) {
    staleDetail = 'second capture failed: ' + String(err?.message ?? err);
  }
  record('B0p-3 the capture is a FRESH frame (both halves: new colour present AND old colour gone)',
    staleOk, staleDetail);

  // ── known answers, sampled through the verified mapping, off the first frame ──
  const sample = makeSampler(frame1, mapping);
  const swatches = checkSwatches(sample, planted.points);
  record('B0p-4 the sampler gets KNOWN ANSWERS right before it is believed',
    swatches.ok,
    swatches.results.filter((r) => r.ok).length + '/' + swatches.results.length + ' swatches correct'
    + (swatches.ok ? '' : ' — FAILED: ' + swatches.results.filter((r) => !r.ok).map((r) => r.swatch).join(', ')),
    { swatches: swatches.results });

  await cdp.evaluate(REMOVE).catch(() => null);

  return {
    ok: steps.every((s) => s.ok),
    steps,
    mapping,
    swatches,
    offline: { passed: offline.passed, total: offline.total },
  };
}

// ════════════════════════════════════════════════════════════════════════════════
// CLI
// ════════════════════════════════════════════════════════════════════════════════

/** For the gate's P0 compile check and for --selfcheck. A stub helpers block is enough to parse. */
export function pageExpressions(helpers = 'const __x = 1;', contrastMath = 'const __y = 1;') {
  return {
    PLANT,
    RECOLOUR,
    REMOVE,
    RAF_SETTLE,
    nonTextPixelTargets: nonTextPixelTargets(helpers),
    rectSnapshot: rectSnapshot(helpers),
    textBackdropTargets: textBackdropTargets(helpers, contrastMath),
  };
}

function compileCheck() {
  const broken = [];
  for (const [name, source] of Object.entries(pageExpressions())) {
    try { new Function('return (' + source + ');'); } catch (err) {
      broken.push(name + ': ' + String(err?.message ?? err));
    }
  }
  return broken;
}

const argv = process.argv.slice(2);
const invokedDirectly = process.argv[1]
  && process.argv[1].replaceAll('\\', '/').endsWith('a11y-pixel-sampler.mjs');

if (invokedDirectly && argv.includes('--selfcheck')) {
  const broken = compileCheck();
  console.log(broken.length ? 'BROKEN:\n' + broken.join('\n') : 'all page-side probes compile');
  process.exit(broken.length ? 1 : 0);
}

if (invokedDirectly && argv.includes('--selftest-offline')) {
  const broken = compileCheck();
  if (broken.length) {
    console.log('BROKEN page-side probes:\n' + broken.join('\n'));
    process.exit(1);
  }
  const res = offlineSelfTest();
  for (const r of res.results) {
    console.log((r.ok ? 'ok   ' : 'FAIL ') + r.name + (r.detail ? '  — ' + r.detail : ''));
  }
  console.log('\n' + res.summary);
  console.log(res.ok
    ? '\nThe decoder, the WCAG maths and the scale detector are proven against known answers.\n'
      + 'That is NOT yet a claim about the app: the in-app half (mapping against planted\n'
      + 'fiducials, the stale-frame differential and the swatches) only runs under\n'
      + 'packaged-a11y-deep-gate.mjs --pixels.'
    : '\nDO NOT RUN THE GATE WITH --pixels UNTIL THIS PASSES. Every number it produced would be\n'
      + 'a confident number about nothing.');
  process.exit(res.ok ? 0 : 1);
}
