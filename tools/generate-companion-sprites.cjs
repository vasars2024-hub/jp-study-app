#!/usr/bin/env node
/**
 * Draws Gum's own desktop-companion sprite packs and writes them as PNG frames to
 * src/renderer/assets/companions/<pack>/shime<N>.png.
 *
 * Every character here is original, drawn from primitives in this file — no
 * traced, sampled or referenced third-party art. The frames use the classic
 * Shimeji file names so a pack made here is also a valid Shimeji-layout pack, and
 * so the engine's standard frame map (src/shared/companionPacks.ts) reads it with
 * no special case. Licence: CC0-1.0 (see src/renderer/assets/companions/NOTICE.md).
 *
 * Usage: node tools/generate-companion-sprites.cjs [--sheet <out.png>]
 *   --sheet  also write a contact sheet of every frame (for review; not committed)
 *
 * Dev-time only. It needs `sharp` (already present in node_modules through the
 * toolchain) to rasterise the SVG; the app itself never runs this.
 */
'use strict';
/* eslint-disable @typescript-eslint/no-var-requires -- a plain CommonJS build script */

const fs = require('node:fs');
const path = require('node:path');

const OUT_ROOT = path.join(__dirname, '..', 'src', 'renderer', 'assets', 'companions');
const SIZE = 128;
const GROUND = 123;

// ---------------------------------------------------------------------------
// Frame table. Names match STANDARD_SHIMEJI_SEQUENCES in shared/companionPacks.ts.
// Arm/leg angles are absolute screen angles in degrees: 0 = straight down,
// +90 = pointing right (the way every character faces), 180 = straight up.
// ---------------------------------------------------------------------------

const BASE = {
  dy: 0,
  tilt: 0,
  squash: 1,
  armL: -14,
  armR: 16,
  legL: -5,
  legR: 6,
  liftL: 0,
  liftR: 0,
  eyes: 'open',
  mouth: 'smile',
  sit: false,
  swing: 0,
  fx: [],
};

const FRAMES = {
  'shime1.png': {},
  'shime2.png': { dy: -2, armL: -30, armR: 4, legL: -20, legR: 16, liftR: 3 },
  'shime3.png': { dy: -2, armL: 2, armR: 32, legL: 14, legR: -18, liftL: 3 },
  'shime4.png': { armL: -150, armR: 150, legL: -26, legR: 28, eyes: 'wide', mouth: 'o', fx: ['speed'] },
  'shime5.png': { dy: -9, armL: -155, armR: 155, legL: -14, legR: 14, liftL: 2, liftR: 2, eyes: 'happy', mouth: 'open', fx: ['sparkle', 'bubble'] },
  'shime6.png': { squash: 0.93, armL: -70, armR: 70, eyes: 'happy', mouth: 'open', fx: ['sparkle'] },
  'shime7.png': { swing: -9, armL: -120, armR: 120, legL: -12, legR: 10, eyes: 'wide', mouth: 'o', drag: true },
  'shime8.png': { swing: 0, armL: -135, armR: 135, legL: -6, legR: 14, eyes: 'wide', mouth: 'o', drag: true },
  'shime9.png': { swing: 9, armL: -120, armR: 120, legL: -14, legR: 6, eyes: 'wide', mouth: 'flat', drag: true },
  'shime10.png': { swing: 3, armL: -140, armR: 140, legL: -2, legR: 12, eyes: 'closed', mouth: 'flat', drag: true },
  'shime11.png': { sit: true, armL: -30, armR: 34 },
  'shime26.png': { sit: true, armL: -26, armR: 30, eyes: 'closed', mouth: 'flat', fx: ['zz'] },
  // Wall and ceiling: the engine rotates the sprite onto the edge, so these are
  // drawn as a low crawl on the "floor" and read as climbing once rotated.
  'shime12.png': { crawl: true, tilt: 24, dy: 6, armL: 62, armR: 96, legL: -40, legR: -8, liftR: 2 },
  'shime13.png': { crawl: true, tilt: 24, dy: 7, armL: 88, armR: 70, legL: -12, legR: -40, liftL: 2 },
  'shime14.png': { crawl: true, tilt: 20, dy: 5, armL: 76, armR: 84, legL: -26, legR: -24 },
  'shime23.png': { crawl: true, tilt: 24, dy: 6, armL: 60, armR: 98, legL: -42, legR: -6, liftR: 2 },
  'shime24.png': { crawl: true, tilt: 24, dy: 7, armL: 90, armR: 68, legL: -8, legR: -42, liftL: 2 },
  'shime25.png': { crawl: true, tilt: 20, dy: 5, armL: 78, armR: 82, legL: -26, legR: -24 },
};

// ---------------------------------------------------------------------------
// Small SVG helpers
// ---------------------------------------------------------------------------

const f = (n) => Number(n.toFixed(2));
const rad = (d) => (d * Math.PI) / 180;
const endPoint = (x, y, len, deg) => [f(x + len * Math.sin(rad(deg))), f(y + len * Math.cos(rad(deg)))];

function limb(x, y, len, deg, width, color, outline) {
  const [ex, ey] = endPoint(x, y, len, deg);
  return (
    `<line x1="${f(x)}" y1="${f(y)}" x2="${ex}" y2="${ey}" stroke="${outline}" stroke-width="${width + 3}" stroke-linecap="round"/>` +
    `<line x1="${f(x)}" y1="${f(y)}" x2="${ex}" y2="${ey}" stroke="${color}" stroke-width="${width}" stroke-linecap="round"/>`
  );
}

function blob(cx, cy, r, fill, outline, extra = '') {
  return `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" fill="${fill}" stroke="${outline}" stroke-width="1.6" ${extra}/>`;
}

function ellipse(cx, cy, rx, ry, fill, outline, extra = '') {
  const stroke = outline ? ` stroke="${outline}" stroke-width="1.6"` : '';
  return `<ellipse cx="${f(cx)}" cy="${f(cy)}" rx="${f(rx)}" ry="${f(ry)}" fill="${fill}"${stroke} ${extra}/>`;
}

/** Two eyes at (x1,y) and (x2,y) in the requested expression. */
function eyes(p, x1, x2, y, r, ink, shine = '#ffffff') {
  const one = (x) => {
    switch (p.eyes) {
      case 'closed':
        return `<path d="M${f(x - r)} ${f(y)} q${f(r)} ${f(r * 0.7)} ${f(2 * r)} 0" fill="none" stroke="${ink}" stroke-width="2.4" stroke-linecap="round"/>`;
      case 'happy':
        return `<path d="M${f(x - r)} ${f(y + r * 0.3)} q${f(r)} ${f(-r * 1.3)} ${f(2 * r)} 0" fill="none" stroke="${ink}" stroke-width="2.6" stroke-linecap="round"/>`;
      case 'calm':
        // a soft almond eye: relaxed, never a frown line above it
        return (
          `<path d="M${f(x - r)} ${f(y + r * 0.1)} q${f(r)} ${f(-r * 1.1)} ${f(2 * r)} 0 q${f(-r)} ${f(r * 0.9)} ${f(-2 * r)} 0 z" fill="${ink}"/>` +
          `<circle cx="${f(x + r * 0.3)}" cy="${f(y - r * 0.2)}" r="${f(r * 0.24)}" fill="${shine}"/>`
        );
      case 'wide':
        return (
          `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r * 1.12)}" fill="#ffffff" stroke="${ink}" stroke-width="1.6"/>` +
          `<circle cx="${f(x + r * 0.15)}" cy="${f(y)}" r="${f(r * 0.5)}" fill="${ink}"/>`
        );
      default:
        return (
          `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(r * 0.82)}" ry="${f(r)}" fill="${ink}"/>` +
          `<circle cx="${f(x + r * 0.28)}" cy="${f(y - r * 0.38)}" r="${f(r * 0.32)}" fill="${shine}"/>`
        );
    }
  };
  return one(x1) + one(x2);
}

function mouth(p, x, y, w, ink, inner = '#8a2030') {
  switch (p.mouth) {
    case 'open':
      return `<path d="M${f(x - w)} ${f(y)} q${f(w)} ${f(w * 1.3)} ${f(2 * w)} 0 z" fill="${inner}" stroke="${ink}" stroke-width="1.6" stroke-linejoin="round"/>`;
    case 'o':
      return `<ellipse cx="${f(x)}" cy="${f(y + 1)}" rx="${f(w * 0.45)}" ry="${f(w * 0.6)}" fill="${inner}" stroke="${ink}" stroke-width="1.4"/>`;
    case 'flat':
      return `<path d="M${f(x - w * 0.6)} ${f(y + 1)} h${f(w * 1.2)}" stroke="${ink}" stroke-width="2" stroke-linecap="round"/>`;
    default:
      return `<path d="M${f(x - w)} ${f(y)} q${f(w)} ${f(w * 0.9)} ${f(2 * w)} 0" fill="none" stroke="${ink}" stroke-width="2" stroke-linecap="round"/>`;
  }
}

/** Effects drawn in unrotated frame space, above the character. */
function effects(p, accent, topY) {
  let out = '';
  if (p.fx.includes('sparkle')) {
    const star = (x, y, s) =>
      `<path d="M${x} ${y - s} L${x + s * 0.28} ${y - s * 0.28} L${x + s} ${y} L${x + s * 0.28} ${y + s * 0.28} L${x} ${y + s} L${x - s * 0.28} ${y + s * 0.28} L${x - s} ${y} L${x - s * 0.28} ${y - s * 0.28} Z" fill="${accent}" stroke="#ffffff" stroke-width="1"/>`;
    out += star(18, topY + 8, 7) + star(110, topY + 2, 6) + star(104, topY + 30, 4);
  }
  if (p.fx.includes('speed')) {
    for (const [x, len] of [[40, 12], [64, 16], [88, 12]]) {
      out += `<path d="M${x} 6 v${len}" stroke="${accent}" stroke-opacity="0.55" stroke-width="3" stroke-linecap="round"/>`;
    }
  }
  if (p.fx.includes('zz')) {
    out +=
      `<text x="96" y="${topY + 12}" font-family="Segoe UI, Arial, sans-serif" font-weight="700" font-size="14" fill="${accent}">z</text>` +
      `<text x="106" y="${topY + 2}" font-family="Segoe UI, Arial, sans-serif" font-weight="700" font-size="10" fill="${accent}">z</text>`;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Character rigs. Each returns an SVG body for one pose. A rig names its hip,
// shoulders and head; `compose` does the pose maths shared by all of them.
// ---------------------------------------------------------------------------

/**
 * Shared composition: legs from the hip, the upper body tilted about the hip,
 * arms from the shoulders, then effects. `rig` supplies the parts.
 */
function compose(rig, p) {
  const outline = rig.outline;
  const sit = !!p.sit;
  const hipY = sit ? GROUND - rig.legWidth / 2 - 2 : GROUND - rig.legLen - rig.footRy + 1;
  const hip = { x: 64 + (rig.hipDx || 0), y: hipY + p.dy };
  const legs = [];
  const legAt = (dx, deg, lift, far) => {
    const x = hip.x + dx;
    const y = hip.y - lift;
    const len = sit ? rig.legLen + 3 : rig.legLen;
    const angle = sit ? (far ? 78 : 86) : deg;
    const [ex, ey] = endPoint(x, y, len, angle);
    const color = far ? rig.farLeg || rig.leg : rig.leg;
    return (
      limb(x, y, len, angle, rig.legWidth, color, outline) +
      ellipse(ex + (sit ? 1 : 3), ey + (sit ? 0 : 1), rig.footRx, rig.footRy, rig.foot || color, outline)
    );
  };
  legs.push(legAt(-rig.hipSpread, p.legL, p.liftL, true));
  const nearLeg = legAt(rig.hipSpread, p.legR, p.liftR, false);

  const upper = rig.upper(p, hip);
  const shoulderL = upper.shoulderL;
  const shoulderR = upper.shoulderR;
  const armL = limb(shoulderL.x, shoulderL.y, rig.armLen, p.armL, rig.armWidth, rig.farArm || rig.arm, outline) +
    blob(...endPoint(shoulderL.x, shoulderL.y, rig.armLen, p.armL), rig.handR, rig.hand || rig.farArm || rig.arm, outline);
  const armR = limb(shoulderR.x, shoulderR.y, rig.armLen, p.armR, rig.armWidth, rig.arm, outline) +
    blob(...endPoint(shoulderR.x, shoulderR.y, rig.armLen, p.armR), rig.handR, rig.hand || rig.arm, outline);

  const squash = p.squash !== 1 ? ` translate(0 ${f(GROUND * (1 - p.squash))}) scale(1 ${p.squash})` : '';
  const tilt = `rotate(${p.tilt} ${f(hip.x)} ${f(hip.y)})`;
  const behind = rig.behind ? rig.behind(p, hip) : '';
  const figure =
    `<g transform="${squash.trim()}">` +
    `<g transform="${tilt}">${behind}${armL}</g>` +
    legs.join('') +
    `<g transform="${tilt}">${upper.svg}</g>` +
    nearLeg +
    `<g transform="${tilt}">${armR}${upper.front || ''}</g>` +
    `</g>`;

  // Dragged: the whole figure hangs from a point above its head and swings.
  const body = p.drag
    ? `<g transform="translate(0 -6) rotate(${p.swing} 64 14)">${figure}</g>`
    : figure;
  return rig.defs + body + effects(p, rig.accent, 8) + (p.fx.includes('bubble') && rig.bubble ? rig.bubble(p) : '');
}

/** Beni — a round, deep-red study mascot with a bookmark ribbon. */
const beni = {
  id: 'beni',
  outline: '#4a0d17',
  accent: '#e8475f',
  leg: '#7c1624',
  arm: '#9d1f31',
  farArm: '#7c1624',
  foot: '#5f1019',
  hand: '#f4dccf',
  legLen: 9,
  legWidth: 9,
  footRx: 8,
  footRy: 5,
  hipSpread: 11,
  armLen: 15,
  armWidth: 8,
  handR: 5,
  defs:
    '<defs>' +
    '<radialGradient id="beniBody" cx="0.38" cy="0.3" r="0.8">' +
    '<stop offset="0" stop-color="#e2485d"/><stop offset="0.55" stop-color="#b0243a"/><stop offset="1" stop-color="#7d1627"/>' +
    '</radialGradient>' +
    '<linearGradient id="beniRibbon" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f7c948"/><stop offset="1" stop-color="#d99a1e"/></linearGradient>' +
    '</defs>',
  upper(p, hip) {
    const cx = hip.x;
    const cy = hip.y - 30;
    const face = cx + 9;
    const svg =
      // one bookmark tab tucked into the top, leaning back, notched at the tip
      `<path d="M${f(cx - 2)} ${f(cy - 28)} l-4 -17 l5 3 l4 -5 l4 17 z" fill="url(#beniRibbon)" stroke="${this.outline}" stroke-width="1.6" stroke-linejoin="round"/>` +
      ellipse(cx, cy, 36, 32, 'url(#beniBody)', this.outline) +
      // soft cream belly and a glossy highlight
      ellipse(cx + 4, cy + 14, 21, 15, '#f6e3d8', null, 'opacity="0.95"') +
      ellipse(cx - 14, cy - 16, 10, 6, '#ffffff', null, 'opacity="0.35" transform="rotate(-24 ' + f(cx - 14) + ' ' + f(cy - 16) + ')"') +
      eyes(p, face - 8, face + 12, cy - 4, 5.2, '#2a0a10') +
      ellipse(face - 15, cy + 5, 5, 3, '#ff8fa0', null, 'opacity="0.7"') +
      ellipse(face + 19, cy + 5, 4, 3, '#ff8fa0', null, 'opacity="0.7"') +
      mouth(p, face + 2, cy + 6, 4, '#2a0a10');
    return { svg, shoulderL: { x: cx - 31, y: cy + 8 }, shoulderR: { x: cx + 31, y: cy + 8 } };
  },
};

/** Yuzu — a calm orange fox-cat with a big cream-tipped tail. */
const yuzu = {
  id: 'yuzu',
  outline: '#5a2e0e',
  accent: '#ffb347',
  leg: '#e0893c',
  farLeg: '#c9722b',
  arm: '#e0893c',
  farArm: '#c9722b',
  foot: '#fff1dc',
  hand: '#fff1dc',
  legLen: 12,
  legWidth: 8,
  footRx: 6.5,
  footRy: 4,
  hipSpread: 8,
  armLen: 13,
  armWidth: 7,
  handR: 4.2,
  defs:
    '<defs>' +
    '<radialGradient id="yuzuFur" cx="0.4" cy="0.3" r="0.85"><stop offset="0" stop-color="#ffb866"/><stop offset="1" stop-color="#d9752b"/></radialGradient>' +
    '<linearGradient id="yuzuTail" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#d9752b"/><stop offset="0.7" stop-color="#ffb866"/><stop offset="0.72" stop-color="#fff1dc"/><stop offset="1" stop-color="#fff8ec"/></linearGradient>' +
    '</defs>',
  behind(p, hip) {
    const x = hip.x - 14;
    const y = hip.y - 6;
    const wag = p.eyes === 'happy' ? -8 : p.drag ? 10 : 0;
    return `<path d="M${f(x)} ${f(y)} C${f(x - 26)} ${f(y + 4)} ${f(x - 34 + wag)} ${f(y - 30)} ${f(x - 16 + wag)} ${f(y - 46)} C${f(x - 12 + wag)} ${f(y - 30)} ${f(x - 8)} ${f(y - 14)} ${f(x + 6)} ${f(y - 8)} Z" fill="url(#yuzuTail)" stroke="${this.outline}" stroke-width="1.6" stroke-linejoin="round"/>`;
  },
  upper(p, hip) {
    const bx = hip.x;
    const by = hip.y - 14;
    const hx = hip.x + 4;
    const hy = hip.y - 46;
    const calm = { ...p, eyes: p.eyes === 'open' ? 'calm' : p.eyes };
    const ear = (x, lean) =>
      `<path d="M${f(x - 10)} ${f(hy - 12)} L${f(x + lean)} ${f(hy - 38)} L${f(x + 10)} ${f(hy - 14)} Z" fill="url(#yuzuFur)" stroke="${this.outline}" stroke-width="1.6" stroke-linejoin="round"/>` +
      `<path d="M${f(x - 5)} ${f(hy - 15)} L${f(x + lean * 0.8)} ${f(hy - 31)} L${f(x + 5)} ${f(hy - 16)} Z" fill="#fff1dc"/>`;
    const svg =
      ellipse(bx, by, 19, 17, 'url(#yuzuFur)', this.outline) +
      ellipse(bx + 3, by + 3, 11, 11, '#fff1dc', null) +
      ear(hx - 13, -4) +
      ear(hx + 13, 5) +
      ellipse(hx, hy, 27, 23, 'url(#yuzuFur)', this.outline) +
      // cream muzzle and cheek fluff
      `<path d="M${f(hx - 6)} ${f(hy + 4)} q${f(14)} ${f(-8)} ${f(30)} ${f(2)} q${f(-4)} ${f(14)} ${f(-16)} ${f(14)} q${f(-12)} 0 ${f(-14)} ${f(-16)} z" fill="#fff1dc"/>` +
      eyes(calm, hx - 2, hx + 16, hy - 3, 4.4, '#2b1a0c') +
      ellipse(hx + 21, hy + 5, 3, 2.2, '#3a2010', null) +
      mouth(p, hx + 17, hy + 10, 3, '#3a2010', '#c0493e');
    return { svg, shoulderL: { x: bx - 15, y: by - 6 }, shoulderR: { x: bx + 15, y: by - 6 } };
  },
};

/** Tock — a brass owl with a clock face on its chest. */
const tock = {
  id: 'tock',
  outline: '#3d2a0b',
  accent: '#f2c94c',
  leg: '#e58a2b',
  foot: '#e58a2b',
  arm: '#b58426',
  farArm: '#946a1d',
  legLen: 7,
  legWidth: 5,
  footRx: 7,
  footRy: 3.4,
  hipSpread: 10,
  armLen: 17,
  armWidth: 11,
  handR: 5.4,
  defs:
    '<defs>' +
    '<radialGradient id="tockBody" cx="0.4" cy="0.28" r="0.85"><stop offset="0" stop-color="#f3cf6b"/><stop offset="0.6" stop-color="#c9982f"/><stop offset="1" stop-color="#8f6716"/></radialGradient>' +
    '</defs>',
  upper(p, hip) {
    const cx = hip.x;
    const cy = hip.y - 36;
    const tuft = (x, dir) =>
      `<path d="M${f(x - 8)} ${f(cy - 30)} L${f(x + dir * 6)} ${f(cy - 48)} L${f(x + 8)} ${f(cy - 28)} Z" fill="#b58426" stroke="${this.outline}" stroke-width="1.6" stroke-linejoin="round"/>`;
    const eyeDisc = (x) => blob(x, cy - 10, 12, '#fff7df', '#8f6716');
    const owlEyes = eyes(p, cx - 4, cx + 20, cy - 10, 5.2, '#1d1405');
    // clock face with hands at ten past ten
    const clock =
      blob(cx + 6, cy + 20, 13, '#fff7df', this.outline) +
      [0, 90, 180, 270].map((a) => {
        const [x1, y1] = endPoint(cx + 6, cy + 20, 10, a);
        const [x2, y2] = endPoint(cx + 6, cy + 20, 12, a);
        return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${this.outline}" stroke-width="1.6"/>`;
      }).join('') +
      `<line x1="${f(cx + 6)}" y1="${f(cy + 20)}" x2="${endPoint(cx + 6, cy + 20, 6, 200)[0]}" y2="${endPoint(cx + 6, cy + 20, 6, 200)[1]}" stroke="${this.outline}" stroke-width="2" stroke-linecap="round"/>` +
      `<line x1="${f(cx + 6)}" y1="${f(cy + 20)}" x2="${endPoint(cx + 6, cy + 20, 9, 120)[0]}" y2="${endPoint(cx + 6, cy + 20, 9, 120)[1]}" stroke="#c0392b" stroke-width="1.6" stroke-linecap="round"/>` +
      blob(cx + 6, cy + 20, 1.6, this.outline, this.outline);
    const svg =
      tuft(cx - 18, -1) +
      tuft(cx + 26, 1) +
      ellipse(cx, cy, 34, 38, 'url(#tockBody)', this.outline) +
      ellipse(cx - 12, cy - 22, 9, 5, '#ffffff', null, 'opacity="0.35"') +
      eyeDisc(cx - 4) +
      eyeDisc(cx + 20) +
      owlEyes +
      `<path d="M${f(cx + 6)} ${f(cy - 2)} l5 0 l-2.5 7 z" fill="#e58a2b" stroke="${this.outline}" stroke-width="1.2" stroke-linejoin="round"/>` +
      clock;
    return { svg, shoulderL: { x: cx - 29, y: cy + 2 }, shoulderR: { x: cx + 29, y: cy + 2 } };
  },
};

/**
 * Orbi — the Aero theme's desktop helper: a glossy glass-bubble head with a
 * visor face, a hovering antenna light and a speech bubble when it is pleased.
 */
const orbi = {
  id: 'orbi',
  outline: '#231a5c',
  accent: '#7fd6ff',
  leg: '#4a57d8',
  farLeg: '#3a44b0',
  foot: '#eef3ff',
  arm: '#5a64e6',
  farArm: '#444dc0',
  hand: '#ffffff',
  legLen: 11,
  legWidth: 7,
  footRx: 7.5,
  footRy: 4.6,
  hipSpread: 8,
  armLen: 15,
  armWidth: 5,
  handR: 5.6,
  defs:
    '<defs>' +
    '<radialGradient id="orbiGlass" cx="0.35" cy="0.3" r="0.9"><stop offset="0" stop-color="#c9b6ff"/><stop offset="0.45" stop-color="#7a63f0"/><stop offset="1" stop-color="#2f3fb8"/></radialGradient>' +
    '<linearGradient id="orbiBody" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6fc3ff"/><stop offset="1" stop-color="#3b5ad6"/></linearGradient>' +
    '<linearGradient id="orbiVisor" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#16124a"/><stop offset="1" stop-color="#241d6e"/></linearGradient>' +
    '<radialGradient id="orbiGlow" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#e9fbff"/><stop offset="0.6" stop-color="#7fd6ff"/><stop offset="1" stop-color="#7fd6ff" stop-opacity="0"/></radialGradient>' +
    '</defs>',
  upper(p, hip) {
    const bx = hip.x;
    const by = hip.y - 12;
    const hx = hip.x + 2;
    const hy = hip.y - 46;
    const vx = hx + 6;
    const vy = hy + 2;
    const pixelEyes = (() => {
      const ink = '#7fe9ff';
      const at = (x) => {
        switch (p.eyes) {
          case 'closed':
            return `<rect x="${f(x - 5)}" y="${f(vy + 1)}" width="10" height="2.6" rx="1.3" fill="${ink}"/>`;
          case 'happy':
            return `<path d="M${f(x - 5)} ${f(vy + 3)} l5 -5 l5 5" fill="none" stroke="${ink}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>`;
          case 'wide':
            return `<rect x="${f(x - 4.5)}" y="${f(vy - 5)}" width="9" height="11" rx="4.5" fill="${ink}"/>`;
          default:
            return `<rect x="${f(x - 3.5)}" y="${f(vy - 5)}" width="7" height="10" rx="3.5" fill="${ink}"/>`;
        }
      };
      return at(vx - 9) + at(vx + 9);
    })();
    const talk =
      p.mouth === 'open' || p.mouth === 'o'
        ? `<rect x="${f(vx - 4)}" y="${f(vy + 8)}" width="8" height="4" rx="2" fill="#7fe9ff"/>`
        : p.mouth === 'flat'
          ? `<rect x="${f(vx - 4)}" y="${f(vy + 9)}" width="8" height="2" rx="1" fill="#7fe9ff"/>`
          : `<path d="M${f(vx - 5)} ${f(vy + 8)} q5 4 10 0" fill="none" stroke="#7fe9ff" stroke-width="2" stroke-linecap="round"/>`;
    const svg =
      // antenna and its glowing tip
      `<path d="M${f(hx + 4)} ${f(hy - 28)} q2 -9 -3 -15" fill="none" stroke="${this.outline}" stroke-width="2.4" stroke-linecap="round"/>` +
      blob(hx + 1, hy - 45, 7, 'url(#orbiGlow)', 'none') +
      blob(hx + 1, hy - 45, 3.4, '#ffffff', '#7fd6ff') +
      // capsule body with a chest light
      `<rect x="${f(bx - 17)}" y="${f(by - 14)}" width="34" height="28" rx="14" fill="url(#orbiBody)" stroke="${this.outline}" stroke-width="1.6"/>` +
      ellipse(bx - 6, by - 6, 7, 3.5, '#ffffff', null, 'opacity="0.5"') +
      blob(bx + 4, by + 3, 3.6, '#ffe36e', this.outline) +
      // glass head
      blob(hx, hy, 29, 'url(#orbiGlass)', this.outline) +
      `<rect x="${f(vx - 20)}" y="${f(vy - 11)}" width="40" height="26" rx="12" fill="url(#orbiVisor)" stroke="#9fb4ff" stroke-width="1.2"/>` +
      pixelEyes +
      talk +
      // the glossy Aero highlight
      ellipse(hx - 11, hy - 16, 13, 7, '#ffffff', null, `opacity="0.55" transform="rotate(-28 ${f(hx - 11)} ${f(hy - 16)})"`) +
      blob(hx + 17, hy - 14, 2.4, '#ffffff', 'none', 'opacity="0.8"');
    return { svg, shoulderL: { x: bx - 15, y: by - 7 }, shoulderR: { x: bx + 15, y: by - 7 } };
  },
  bubble() {
    return (
      `<g><rect x="84" y="4" width="38" height="22" rx="10" fill="#ffffff" stroke="#3b5ad6" stroke-width="1.6"/>` +
      `<path d="M92 25 l-5 8 l11 -8" fill="#ffffff" stroke="#3b5ad6" stroke-width="1.6" stroke-linejoin="round"/>` +
      `<rect x="90" y="23" width="10" height="3" fill="#ffffff"/>` +
      `<circle cx="94" cy="15" r="2.4" fill="#3b5ad6"/><circle cx="103" cy="15" r="2.4" fill="#6a5cff"/><circle cx="112" cy="15" r="2.4" fill="#7fd6ff"/></g>`
    );
  },
};

/** Ping — a small signal guide with a terminal-screen head, for the Wired theme. */
const ping = {
  id: 'ping',
  outline: '#07161d',
  accent: '#39f3d0',
  leg: '#1f2f3f',
  farLeg: '#172533',
  foot: '#39f3d0',
  arm: '#26394c',
  farArm: '#1c2b3a',
  hand: '#9ffff0',
  legLen: 13,
  legWidth: 6,
  footRx: 6,
  footRy: 3.4,
  hipSpread: 7,
  armLen: 15,
  armWidth: 5.5,
  handR: 3.8,
  defs:
    '<defs>' +
    '<linearGradient id="pingCase" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3b4b5c"/><stop offset="1" stop-color="#1f2a36"/></linearGradient>' +
    '<radialGradient id="pingScreen" cx="0.5" cy="0.45" r="0.7"><stop offset="0" stop-color="#0f4a4a"/><stop offset="1" stop-color="#04191d"/></radialGradient>' +
    '<pattern id="pingScan" width="4" height="3" patternUnits="userSpaceOnUse"><rect width="4" height="1" fill="#39f3d0" opacity="0.12"/></pattern>' +
    '</defs>',
  upper(p, hip) {
    const bx = hip.x;
    const by = hip.y - 13;
    const hx = hip.x + 3;
    const hy = hip.y - 46;
    const glow = '#39f3d0';
    const face = (() => {
      const at = (x) => {
        switch (p.eyes) {
          case 'closed':
            return `<rect x="${f(x - 4)}" y="${f(hy)}" width="8" height="2" fill="${glow}"/>`;
          case 'happy':
            return `<path d="M${f(x - 4)} ${f(hy + 2)} l4 -4 l4 4" fill="none" stroke="${glow}" stroke-width="2.2"/>`;
          case 'wide':
            return `<rect x="${f(x - 4)}" y="${f(hy - 5)}" width="8" height="9" fill="${glow}"/>`;
          default:
            return `<rect x="${f(x - 3)}" y="${f(hy - 4)}" width="6" height="7" fill="${glow}"/>`;
        }
      };
      const m =
        p.mouth === 'open' || p.mouth === 'o'
          ? `<rect x="${f(hx + 2)}" y="${f(hy + 7)}" width="8" height="4" fill="${glow}"/>`
          : `<path d="M${f(hx)} ${f(hy + 8)} h3 v2 h6 v-2 h3" fill="none" stroke="${glow}" stroke-width="1.8"/>`;
      return at(hx - 2) + at(hx + 14) + m;
    })();
    const svg =
      // hooded body with a signal stripe
      `<path d="M${f(bx - 16)} ${f(by + 13)} q-2 -24 16 -28 q18 4 16 28 z" fill="#1f2f3f" stroke="${this.outline}" stroke-width="1.6"/>` +
      `<path d="M${f(bx - 2)} ${f(by - 14)} v26" stroke="${glow}" stroke-width="2" opacity="0.8"/>` +
      // cable antenna
      `<path d="M${f(hx - 12)} ${f(hy - 20)} q-10 -6 -6 -18" fill="none" stroke="#5b6f84" stroke-width="2.2" stroke-linecap="round"/>` +
      blob(hx - 18, hy - 38, 3.2, glow, this.outline) +
      // screen head
      `<rect x="${f(hx - 26)}" y="${f(hy - 22)}" width="54" height="44" rx="10" fill="url(#pingCase)" stroke="${this.outline}" stroke-width="1.6"/>` +
      `<rect x="${f(hx - 20)}" y="${f(hy - 16)}" width="42" height="32" rx="6" fill="url(#pingScreen)" stroke="#5b6f84" stroke-width="1"/>` +
      `<rect x="${f(hx - 20)}" y="${f(hy - 16)}" width="42" height="32" rx="6" fill="url(#pingScan)"/>` +
      face +
      ellipse(hx - 12, hy - 12, 6, 2.4, '#ffffff', null, 'opacity="0.25"');
    return { svg, shoulderL: { x: bx - 13, y: by - 6 }, shoulderR: { x: bx + 13, y: by - 6 } };
  },
};

const RIGS = [beni, yuzu, tock, orbi, ping];

function svgFor(rig, frame) {
  const pose = { ...BASE, ...FRAMES[frame] };
  // Bind `this` for the parts that read rig colours.
  const bound = { ...rig };
  bound.upper = rig.upper.bind(rig);
  if (rig.behind) bound.behind = rig.behind.bind(rig);
  if (rig.bubble) bound.bubble = rig.bubble.bind(rig);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">` +
    compose(bound, pose) +
    `</svg>`
  );
}

/** A face-on portrait for surfaces that show a guide's face rather than a sprite. */
function portraitSvg() {
  const pose = { ...BASE, eyes: 'open', mouth: 'smile' };
  const up = ping.upper.call(ping, pose, { x: 64, y: 118 });
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="192" height="192" viewBox="18 30 92 92">` +
    `<rect x="18" y="30" width="92" height="92" fill="#04191d"/>` +
    ping.defs +
    up.svg +
    `</svg>`
  );
}

async function main(argv = process.argv.slice(2)) {
  let sharp;
  try {
    sharp = require('sharp');
  } catch {
    console.error('[companion-sprites] `sharp` is not installed; it is needed only to regenerate the sprites.');
    process.exit(1);
  }
  const frames = Object.keys(FRAMES);
  const written = [];
  for (const rig of RIGS) {
    const dir = path.join(OUT_ROOT, rig.id);
    fs.mkdirSync(dir, { recursive: true });
    for (const frame of frames) {
      const png = await sharp(Buffer.from(svgFor(rig, frame))).png({ compressionLevel: 9 }).toBuffer();
      fs.writeFileSync(path.join(dir, frame), png);
      written.push({ rig: rig.id, frame, png });
    }
  }
  const portrait = await sharp(Buffer.from(portraitSvg())).png({ compressionLevel: 9 }).toBuffer();
  fs.writeFileSync(path.join(OUT_ROOT, 'guide-portrait.png'), portrait);
  console.log(`[companion-sprites] wrote ${written.length} frames for ${RIGS.length} packs + guide-portrait.png`);

  const sheetAt = argv.indexOf('--sheet');
  if (sheetAt >= 0 && argv[sheetAt + 1]) {
    const cols = frames.length;
    const composites = written.map((w, i) => ({
      input: w.png,
      left: (i % cols) * SIZE,
      top: Math.floor(i / cols) * SIZE,
    }));
    await sharp({
      create: { width: cols * SIZE, height: RIGS.length * SIZE, channels: 4, background: '#e9e4e6' },
    })
      .composite(composites)
      .png()
      .toFile(argv[sheetAt + 1]);
    console.log(`[companion-sprites] contact sheet: ${argv[sheetAt + 1]}`);
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { FRAMES, RIGS: RIGS.map((r) => r.id), svgFor };
