'use strict';
/* eslint-disable @typescript-eslint/no-var-requires -- CommonJS dev tool, run by node directly */
/**
 * Synthetic manga pages for the manga-OCR eval (`manga-eval.cjs`).
 *
 * Each page is drawn from scratch: tiered panels with borders, screentone dot
 * fields, hatching and scribbles standing in for art, oval speech bubbles with
 * vertical Japanese columns (right to left), the odd rectangular caption with
 * horizontal text, and furigana on some kanji. The dialogue is written for this
 * tool; no manga is used. Fonts are the Windows Japanese system fonts, which are
 * not redistributed: the PNGs stay in a temp folder and are never committed.
 *
 *   node tools/ocr-eval/manga-pages.cjs <outDir> [pageCount=8] [seed=7] [--hard]
 *
 * `--hard` makes the page look like a cheap scan: shrunk to 62% (glyphs of
 * 16-25 px), grey paper, sensor noise and a soft resample, plus one big SFX
 * outside the bubbles (in truth.json as `sfx`, not counted as dialogue).
 *
 * Writes page-NN.png and truth.json: per page, the bubbles in reading order,
 * each with its box, orientation and lines (text per column/row, in order).
 */
const fs = require('node:fs');
const path = require('node:path');
const { createCanvas, GlobalFonts } = require('@napi-rs/canvas');

const FONTS = [
  ['C:\\Windows\\Fonts\\YuGothM.ttc', 'Yu Gothic Medium'],
  ['C:\\Windows\\Fonts\\YuGothB.ttc', 'Yu Gothic Bold'],
  ['C:\\Windows\\Fonts\\msgothic.ttc', 'MS Gothic'],
];

/** Short lines of everyday dialogue, written for this eval. */
const DIALOGUE = [
  '今日はいい天気だね',
  '早く行かないと遅刻するぞ！',
  'あの人は誰ですか？',
  'ちょっと待って',
  '本当にそれでいいの？',
  '僕はずっと君を探していたんだ',
  'お腹すいた…',
  '明日の試験、大丈夫かな',
  'まさか、こんなところで会うなんて',
  '先生に聞いてみよう',
  '静かにしろ！',
  'ありがとう、助かったよ',
  'どうして黙っているの？',
  'この町には秘密がある',
  '電車が来たぞ',
  '雨が降りそうだな',
  'それは違うと思う',
  '一緒に帰ろうか',
  '忘れ物はないか？',
  'やっと見つけた！',
  '心配しなくていいよ',
  '約束は守るから',
  '何かあったら呼んでね',
  'もう一度だけ話を聞いて',
  '昨日の夜、変な夢を見た',
  'ここから先は危険だ',
  '父さんには内緒だよ',
  '急げ、時間がない！',
  'その手紙、読んでもいい？',
  '新しい学校には慣れた？',
  'お茶でも飲みませんか',
  '冗談はやめてくれ',
  '駅の前で待ってるね',
  '彼女の名前を知ってる？',
  '空が赤く光っている',
  '絶対に諦めない！',
  'ねえ、聞こえてる？',
  '今度の日曜日に海へ行こう',
  '鍵をどこに置いたっけ',
  'さっきの話の続きだけど',
];

const CAPTIONS = ['その日の放課後', '三日後', '一方そのころ', '夏の終わり', '翌朝'];

/** Furigana for a few kanji words that appear above, read right of the column. */
const RUBY = { 秘密: 'ひみつ', 試験: 'しけん', 約束: 'やくそく', 危険: 'きけん', 内緒: 'ないしょ' };

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}

/** Glyphs that turn 90° in vertical writing. */
const ROTATE = new Set('ー〜～…‥（）「」『』【】()-―'.split(''));
/** Glyphs that sit in the top-right of their cell in vertical writing. */
const CORNER = new Set('、。，．'.split(''));
const SMALL = new Set('ぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮ'.split(''));

/** Break a sentence into columns of at most `max` glyphs, never starting one with punctuation. */
function breakColumns(text, max) {
  const chars = [...text];
  const cols = [];
  let cur = [];
  for (const ch of chars) {
    if (cur.length >= max && !/[、。！？…ー」』）]/.test(ch)) {
      cols.push(cur.join(''));
      cur = [];
    }
    cur.push(ch);
  }
  if (cur.length) cols.push(cur.join(''));
  return cols;
}

function drawVerticalColumn(ctx, text, x, y, size, ruby) {
  // x is the column's centre.
  let cy = y;
  const chars = [...text];
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    ctx.save();
    if (ROTATE.has(ch)) {
      ctx.translate(x, cy + size / 2);
      ctx.rotate(Math.PI / 2);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(ch, 0, 0);
    } else if (CORNER.has(ch)) {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(ch, x + size * 0.55, cy + size * 0.05);
    } else if (SMALL.has(ch)) {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(ch, x + size * 0.1, cy + size * 0.45);
    } else {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(ch, x, cy + size / 2);
    }
    ctx.restore();
    cy += size * 1.02;
  }
  if (ruby) {
    const font = ctx.font;
    const rs = Math.round(size * 0.45);
    ctx.font = font.replace(/\d+px/, `${rs}px`);
    for (const { start, len, reading } of ruby) {
      const span = len * size * 1.02;
      const ry0 = y + start * size * 1.02 + (span - [...reading].length * rs) / 2;
      [...reading].forEach((r, k) => {
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(r, x + size * 0.5 + rs * 0.7, ry0 + k * rs + rs / 2);
      });
    }
    ctx.font = font;
  }
  return cy - y;
}

function rubyFor(col) {
  const out = [];
  for (const [word, reading] of Object.entries(RUBY)) {
    const at = col.indexOf(word);
    if (at >= 0) out.push({ start: [...col.slice(0, at)].length, len: [...word].length, reading });
  }
  return out.length ? out : null;
}

function screentone(ctx, x0, y0, x1, y1, r, pitch, gray) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x0, y0, x1 - x0, y1 - y0);
  ctx.clip();
  ctx.fillStyle = `rgb(${gray},${gray},${gray})`;
  for (let y = y0; y < y1; y += pitch) {
    const off = (Math.round((y - y0) / pitch) % 2) * (pitch / 2);
    for (let x = x0 + off; x < x1; x += pitch) {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

function scribbles(ctx, rand, x0, y0, x1, y1, n) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x0, y0, x1 - x0, y1 - y0);
  ctx.clip();
  ctx.strokeStyle = '#111';
  for (let i = 0; i < n; i++) {
    ctx.lineWidth = 1 + rand() * 4;
    ctx.beginPath();
    let x = x0 + rand() * (x1 - x0);
    let y = y0 + rand() * (y1 - y0);
    ctx.moveTo(x, y);
    for (let k = 0; k < 4; k++) {
      const nx = x + (rand() - 0.5) * 260;
      const ny = y + (rand() - 0.5) * 260;
      ctx.quadraticCurveTo(x + (rand() - 0.5) * 200, y + (rand() - 0.5) * 200, nx, ny);
      x = nx;
      y = ny;
    }
    ctx.stroke();
  }
  // hatching block (hair, shadows)
  const hx = x0 + rand() * (x1 - x0) * 0.6;
  const hy = y0 + rand() * (y1 - y0) * 0.6;
  ctx.lineWidth = 1.2;
  for (let k = 0; k < 40; k++) {
    ctx.beginPath();
    ctx.moveTo(hx + k * 5, hy);
    ctx.lineTo(hx + k * 5 - 60, hy + 120);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Lay a page out as tiers of panels. Returns panels in reading order (tiers top
 * to bottom, right to left inside a tier).
 */
function layoutPanels(rand, W, H) {
  const margin = 50;
  const gutter = 18;
  const tiers = 2 + Math.floor(rand() * 2); // 2-3
  const tierH = (H - margin * 2 - gutter * (tiers - 1)) / tiers;
  const panels = [];
  for (let t = 0; t < tiers; t++) {
    const y0 = margin + t * (tierH + gutter);
    const cols = 1 + Math.floor(rand() * 2); // 1-2
    const split = 0.4 + rand() * 0.2;
    const bounds =
      cols === 1
        ? [[margin, W - margin]]
        : [
            [margin + (W - margin * 2) * split + gutter / 2, W - margin],
            [margin, margin + (W - margin * 2) * split - gutter / 2],
          ];
    for (const [x0, x1] of bounds) panels.push({ x0, y0, x1, y1: y0 + tierH });
  }
  return panels;
}

/** Big katakana sound effect drawn over the art, slanted. */
function drawSfx(ctx, rand, panel) {
  const text = ['ドン', 'ゴゴゴ', 'バタン', 'ザッ'][Math.floor(rand() * 4)];
  const size = 70 + Math.floor(rand() * 30);
  ctx.save();
  ctx.translate(panel.x0 + 40 + rand() * 60, panel.y1 - 60 - rand() * 40);
  ctx.rotate(-0.25);
  ctx.font = `${size}px "Yu Gothic Bold"`;
  ctx.lineWidth = 8;
  ctx.strokeStyle = '#fff';
  ctx.strokeText(text, 0, 0);
  ctx.fillStyle = '#000';
  ctx.fillText(text, 0, 0);
  ctx.restore();
  return text;
}

/** Shrink, grey the paper, add noise: a cheap scan of the clean page. */
function degrade(src, rand, scale) {
  const W = Math.round(src.width * scale);
  const H = Math.round(src.height * scale);
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(src, 0, 0, W, H);
  const img = ctx.getImageData(0, 0, W, H);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rand() + rand() + rand() - 1.5) * 24;
    const v = Math.max(0, Math.min(255, 18 + d[i] * 0.88 + n));
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

function drawPage(rand, pageNo) {
  const W = 1150;
  const H = 1650;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, W, H);
  const bubbles = [];
  let sfx = '';
  let dlg = Math.floor(rand() * DIALOGUE.length);
  const panels = layoutPanels(rand, W, H);
  panels.forEach((p, pi) => {
    // art
    if (rand() < 0.6) screentone(ctx, p.x0, p.y0, p.x1, p.y1, 1.6 + rand() * 1.2, 7 + rand() * 4, 40 + Math.floor(rand() * 80));
    scribbles(ctx, rand, p.x0, p.y0, p.x1, p.y1, 6 + Math.floor(rand() * 8));
    // SFX is part of the art: drawn before the bubbles, which sit on top of it.
    if (pi === panels.length - 1) sfx = drawSfx(ctx, rand, p);
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 4;
    ctx.strokeRect(p.x0, p.y0, p.x1 - p.x0, p.y1 - p.y0);

    // a caption in the first panel of some pages, top-left corner, horizontal
    const items = [];
    if (pi === 0 && rand() < 0.5) items.push({ kind: 'caption' });
    const nb = (p.x1 - p.x0) > 500 ? 2 : 1;
    for (let b = 0; b < nb; b++) items.push({ kind: 'bubble', slot: b, of: nb });

    for (const it of items) {
      const fontIx = Math.floor(rand() * FONTS.length);
      const family = FONTS[fontIx][1];
      if (it.kind === 'caption') {
        const text = CAPTIONS[Math.floor(rand() * CAPTIONS.length)];
        const size = 24 + Math.floor(rand() * 6);
        ctx.font = `${size}px "${family}"`;
        const tw = ctx.measureText(text).width;
        const bx = p.x0 + 14;
        const by = p.y0 + 14;
        ctx.fillStyle = '#fff';
        ctx.fillRect(bx, by, tw + 24, size + 22);
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2;
        ctx.strokeRect(bx, by, tw + 24, size + 22);
        ctx.fillStyle = '#000';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, bx + 12, by + (size + 22) / 2);
        bubbles.push({
          panel: pi,
          vertical: false,
          box: [bx + 12, by + 11, bx + 12 + tw, by + 11 + size],
          lines: [text],
          font: family,
          size,
        });
        continue;
      }
      const text = DIALOGUE[dlg % DIALOGUE.length];
      dlg += 1 + Math.floor(rand() * 3);
      const size = 26 + Math.floor(rand() * 14);
      const maxPer = 5 + Math.floor(rand() * 4);
      const cols = breakColumns(text, maxPer);
      const colW = size * 1.45;
      const longest = Math.max(...cols.map((c) => [...c].length));
      const textW = cols.length * colW;
      const textH = longest * size * 1.02;
      // bubble centre: right bubble first in reading order
      const slotW = (p.x1 - p.x0) / it.of;
      const cxRaw = p.x1 - slotW * (it.slot + 0.5) + (rand() - 0.5) * 40;
      const cyRaw = p.y0 + (p.y1 - p.y0) * (it.slot === 0 ? 0.42 : 0.55) + (rand() - 0.5) * 30;
      const rx = textW / 2 + size * 1.2;
      const ry = textH / 2 + size * 1.3;
      const cx = Math.min(p.x1 - rx - 8, Math.max(p.x0 + rx + 8, cxRaw));
      const cy = Math.min(p.y1 - ry - 8, Math.max(p.y0 + ry + 8, cyRaw));
      // bubble
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#fff';
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#000';
      ctx.stroke();
      // tail
      ctx.beginPath();
      ctx.moveTo(cx - rx * 0.2, cy + ry * 0.95);
      ctx.lineTo(cx - rx * 0.5, cy + ry * 1.35);
      ctx.lineTo(cx + rx * 0.05, cy + ry * 0.98);
      ctx.fillStyle = '#fff';
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      // columns right to left
      ctx.fillStyle = '#000';
      ctx.font = `${size}px "${family}"`;
      const x0 = cx + textW / 2 - colW / 2;
      const y0 = cy - textH / 2;
      cols.forEach((col, ci) => {
        drawVerticalColumn(ctx, col, x0 - ci * colW, y0, size, rubyFor(col));
      });
      bubbles.push({
        panel: pi,
        vertical: true,
        box: [Math.round(cx - textW / 2), Math.round(y0), Math.round(cx + textW / 2), Math.round(y0 + textH)],
        lines: cols,
        font: family,
        size,
      });
    }
  });
  // Page reading order: by panel, then right bubble first; a caption leads its panel.
  bubbles.forEach((b, i) => (b.order = i));
  return { canvas, W, H, bubbles, sfx, pageNo };
}

async function main() {
  const outDir = process.argv[2];
  if (!outDir) {
    console.error('usage: node tools/ocr-eval/manga-pages.cjs <outDir> [pageCount] [seed]');
    process.exit(2);
  }
  const positional = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const hard = process.argv.includes('--hard');
  const count = Number(positional[1] || 8);
  const seed = Number(positional[2] || 7);
  for (const [file, name] of FONTS) GlobalFonts.registerFromPath(file, name);
  fs.mkdirSync(outDir, { recursive: true });
  const rand = rng(seed);
  const truth = [];
  for (let i = 1; i <= count; i++) {
    const page = drawPage(rand, i);
    const file = `page-${String(i).padStart(2, '0')}.png`;
    const scale = hard ? 0.62 : 1;
    const canvas = hard ? degrade(page.canvas, rand, scale) : page.canvas;
    fs.writeFileSync(path.join(outDir, file), await canvas.encode('png'));
    const bubbles = page.bubbles.map((b) => ({ ...b, box: b.box.map((v) => Math.round(v * scale)), size: b.size * scale }));
    truth.push({ file, width: canvas.width, height: canvas.height, bubbles, sfx: page.sfx });
  }
  fs.writeFileSync(path.join(outDir, 'truth.json'), JSON.stringify({ seed, hard, pages: truth }, null, 1));
  console.log(`wrote ${count} pages to ${outDir}`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { breakColumns };
