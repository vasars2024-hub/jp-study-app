#!/usr/bin/env node
/**
 * Generates the Reading Lens OCR benchmark fixtures.
 *
 * Every image is rendered here from text written for this benchmark (no
 * third-party pages, no screenshots), so the ground truth is exact and the set
 * can be rebuilt byte-for-byte on any Windows machine with the stock Japanese
 * fonts (Yu Gothic, MS Gothic). The categories are the ones the Lens actually
 * meets on screen and the ones the OCR pipeline is weakest on:
 *
 *   horizontal   plain UI / web text
 *   small        12–14 px text (fine print, distant game text)
 *   vertical     tategaki columns, right to left
 *   furigana     ruby over kanji, which a plain recognizer reads as noise
 *   manga        heavy bold glyphs in a bubble on screentone
 *   lowContrast  grey on grey (disabled UI, faded scans)
 *   darkBox      light text in a dark, gradient game dialogue box
 *   subtitle     outlined white text over a busy background
 *   noisy        dark text on a speckled paper texture
 *
 * Output: `src/shared/__tests__/fixtures/lensOcr/*.png` plus `manifest.json`
 * holding the expected text, category and orientation of each. The benchmark
 * (`src/shared/__tests__/lensOcrBenchmark.test.ts`) reads only those files, so it
 * never depends on the fonts of the machine that runs it.
 *
 *   node tools/lens-ocr-fixtures.cjs
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'src', 'shared', '__tests__', 'fixtures', 'lensOcr');
const FONTS = 'C:/Windows/Fonts';

let canvasModule;
try {
  canvasModule = require('@napi-rs/canvas');
} catch {
  console.error('@napi-rs/canvas is not installed (it ships with pdfjs-dist). Run npm install first.');
  process.exit(1);
}
const { createCanvas, GlobalFonts } = canvasModule;

function registerFonts() {
  const fonts = [
    ['YuGothR.ttc', 'LensBenchRegular'],
    ['YuGothB.ttc', 'LensBenchBold'],
    ['msgothic.ttc', 'LensBenchMono'],
  ];
  for (const [file, family] of fonts) {
    const full = path.join(FONTS, file);
    if (!fs.existsSync(full)) {
      console.error(`Missing font ${full}; the fixtures are defined against the stock Windows Japanese fonts.`);
      process.exit(1);
    }
    GlobalFonts.registerFromPath(full, family);
  }
}

/** Deterministic PRNG so the noisy backgrounds are identical on every run. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function horizontalLines(g, lines, { x, y, size, lineGap = 1.6, font = 'LensBenchRegular', fill = '#111', stroke = null, strokeWidth = 0 }) {
  g.font = `${size}px ${font}`;
  g.textBaseline = 'top';
  lines.forEach((text, index) => {
    const ty = y + index * size * lineGap;
    if (stroke) {
      g.lineJoin = 'round';
      g.lineWidth = strokeWidth;
      g.strokeStyle = stroke;
      g.strokeText(text, x, ty);
    }
    g.fillStyle = fill;
    g.fillText(text, x, ty);
  });
}

/** Characters that sit differently in tategaki. */
const ROTATE_IN_VERTICAL = new Set(['ー', '〜', '…', '－', '—']);
const CORNER_IN_VERTICAL = new Set(['、', '。', '，', '．']);
const SMALL_KANA = new Set([...'ぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮヵヶ']);

/** Draw columns top-to-bottom, the first column on the right. */
function verticalColumns(g, columns, { right, top, size, colGap = 1.7, font = 'LensBenchRegular', fill = '#111' }) {
  g.font = `${size}px ${font}`;
  g.textBaseline = 'top';
  g.fillStyle = fill;
  columns.forEach((text, col) => {
    const cx = right - (col + 1) * size * colGap + (colGap - 1) * size;
    let cy = top;
    for (const ch of text) {
      if (ROTATE_IN_VERTICAL.has(ch)) {
        g.save();
        g.translate(cx + size / 2, cy + size / 2);
        g.rotate(Math.PI / 2);
        g.fillText(ch, -size / 2, -size / 2);
        g.restore();
      } else if (CORNER_IN_VERTICAL.has(ch)) {
        g.fillText(ch, cx + size * 0.6, cy - size * 0.55);
      } else if (SMALL_KANA.has(ch)) {
        g.fillText(ch, cx + size * 0.12, cy - size * 0.12);
      } else {
        g.fillText(ch, cx, cy);
      }
      cy += size * 1.05;
    }
  });
}

/** Horizontal text with ruby: `segments` is [[base, reading?], ...]. */
function rubyLine(g, segments, { x, y, size, font = 'LensBenchRegular', fill = '#111' }) {
  const rubySize = Math.round(size * 0.5);
  let cx = x;
  for (const [base, reading] of segments) {
    g.font = `${size}px ${font}`;
    g.textBaseline = 'top';
    g.fillStyle = fill;
    const width = g.measureText(base).width;
    g.fillText(base, cx, y);
    if (reading) {
      g.font = `${rubySize}px ${font}`;
      const rubyWidth = g.measureText(reading).width;
      g.fillText(reading, cx + (width - rubyWidth) / 2, y - rubySize * 1.15);
    }
    cx += width;
  }
}

function canvas(width, height, background) {
  const c = createCanvas(width, height);
  const g = c.getContext('2d');
  if (typeof background === 'function') background(g, width, height);
  else {
    g.fillStyle = background;
    g.fillRect(0, 0, width, height);
  }
  return { c, g };
}

function screentone(g, width, height) {
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, width, height);
  g.fillStyle = '#9a9a9a';
  for (let y = 0; y < height; y += 6) {
    for (let x = (y / 6) % 2 ? 3 : 0; x < width; x += 6) {
      g.beginPath();
      g.arc(x, y, 1.4, 0, Math.PI * 2);
      g.fill();
    }
  }
}

function noisyPaper(seed) {
  return (g, width, height) => {
    const rand = mulberry32(seed);
    const image = g.createImageData(width, height);
    for (let i = 0; i < width * height; i++) {
      const base = 228 + Math.round((rand() - 0.5) * 30);
      const speck = rand() < 0.012 ? -Math.round(90 + rand() * 80) : 0;
      const v = Math.max(0, Math.min(255, base + speck));
      image.data[i * 4] = v;
      image.data[i * 4 + 1] = Math.max(0, v - 6);
      image.data[i * 4 + 2] = Math.max(0, v - 18);
      image.data[i * 4 + 3] = 255;
    }
    g.putImageData(image, 0, 0);
  };
}

function busyBackdrop(seed) {
  return (g, width, height) => {
    const grad = g.createLinearGradient(0, 0, width, height);
    grad.addColorStop(0, '#6d8fb3');
    grad.addColorStop(0.5, '#c9b48a');
    grad.addColorStop(1, '#4f6b3d');
    g.fillStyle = grad;
    g.fillRect(0, 0, width, height);
    const rand = mulberry32(seed);
    for (let i = 0; i < 70; i++) {
      g.fillStyle = `rgba(${Math.round(rand() * 255)},${Math.round(rand() * 255)},${Math.round(rand() * 255)},0.35)`;
      g.beginPath();
      g.arc(rand() * width, rand() * height, 6 + rand() * 40, 0, Math.PI * 2);
      g.fill();
    }
  };
}

const FIXTURES = [
  {
    id: 'horizontal-plain',
    category: 'horizontal',
    orientation: 'horizontal',
    lines: ['今日は雨が降っているので、家で本を読みます。'],
    draw() {
      const { c, g } = canvas(760, 90, '#ffffff');
      horizontalLines(g, this.lines, { x: 20, y: 26, size: 32 });
      return c;
    },
  },
  {
    id: 'horizontal-two-lines',
    category: 'horizontal',
    orientation: 'horizontal',
    lines: ['駅の前に新しい喫茶店ができました。', 'コーヒーがとても美味しいそうです。'],
    draw() {
      const { c, g } = canvas(640, 150, '#f6f4ee');
      horizontalLines(g, this.lines, { x: 18, y: 22, size: 30, font: 'LensBenchMono' });
      return c;
    },
  },
  {
    id: 'small-14px',
    category: 'small',
    orientation: 'horizontal',
    lines: ['明日の会議は午後三時から始まります。'],
    draw() {
      const { c, g } = canvas(290, 30, '#ffffff');
      horizontalLines(g, this.lines, { x: 8, y: 8, size: 14 });
      return c;
    },
  },
  {
    id: 'small-12px-two-lines',
    category: 'small',
    orientation: 'horizontal',
    lines: ['保存する前に内容を確認してください。', '変更は自動的に記録されます。'],
    draw() {
      const { c, g } = canvas(250, 50, '#ffffff');
      horizontalLines(g, this.lines, { x: 6, y: 6, size: 12, lineGap: 1.5 });
      return c;
    },
  },
  {
    id: 'vertical-two-columns',
    category: 'vertical',
    orientation: 'vertical',
    lines: ['春になると桜が咲きます。', 'みんなで花見に行きましょう。'],
    draw() {
      const { c, g } = canvas(150, 470, '#ffffff');
      verticalColumns(g, this.lines, { right: 136, top: 20, size: 30 });
      return c;
    },
  },
  {
    id: 'vertical-three-columns',
    category: 'vertical',
    orientation: 'vertical',
    lines: ['静かな夜だった。', '窓の外では雪が', '音もなく降っている。'],
    draw() {
      const { c, g } = canvas(200, 360, '#fbfaf5');
      verticalColumns(g, this.lines, { right: 186, top: 22, size: 28, font: 'LensBenchMono' });
      return c;
    },
  },
  {
    id: 'furigana-horizontal',
    category: 'furigana',
    orientation: 'horizontal',
    lines: ['昨日、図書館で漢字を勉強した。'],
    draw() {
      const { c, g } = canvas(560, 100, '#ffffff');
      rubyLine(g, [['昨日', 'きのう'], ['、'], ['図書館', 'としょかん'], ['で'], ['漢字', 'かんじ'], ['を'], ['勉強', 'べんきょう'], ['した。']], {
        x: 20, y: 44, size: 32,
      });
      return c;
    },
  },
  {
    id: 'furigana-two-lines',
    category: 'furigana',
    orientation: 'horizontal',
    lines: ['先生は毎朝新聞を読む。', '電車の中で音楽を聴く。'],
    draw() {
      const { c, g } = canvas(440, 170, '#fffdf7');
      rubyLine(g, [['先生', 'せんせい'], ['は'], ['毎朝', 'まいあさ'], ['新聞', 'しんぶん'], ['を'], ['読', 'よ'], ['む。']], {
        x: 18, y: 40, size: 30,
      });
      rubyLine(g, [['電車', 'でんしゃ'], ['の'], ['中', 'なか'], ['で'], ['音楽', 'おんがく'], ['を'], ['聴', 'き'], ['く。']], {
        x: 18, y: 116, size: 30,
      });
      return c;
    },
  },
  {
    id: 'manga-bubble-vertical',
    category: 'manga',
    orientation: 'vertical',
    lines: ['なんだって！？', 'そんなはずはない'],
    draw() {
      const { c, g } = canvas(220, 330, screentone);
      g.fillStyle = '#ffffff';
      g.strokeStyle = '#000000';
      g.lineWidth = 3;
      g.beginPath();
      g.ellipse(110, 165, 98, 156, 0, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      verticalColumns(g, this.lines, { right: 168, top: 42, size: 30, font: 'LensBenchBold', colGap: 1.5 });
      return c;
    },
  },
  {
    id: 'manga-shout-horizontal',
    category: 'manga',
    orientation: 'horizontal',
    lines: ['待ってくれ！行かないで！'],
    draw() {
      const { c, g } = canvas(520, 110, screentone);
      g.fillStyle = '#ffffff';
      g.fillRect(14, 18, 492, 74);
      horizontalLines(g, this.lines, { x: 28, y: 32, size: 40, font: 'LensBenchBold' });
      return c;
    },
  },
  {
    id: 'low-contrast',
    category: 'lowContrast',
    orientation: 'horizontal',
    lines: ['設定を保存しました。再起動は不要です。'],
    draw() {
      const { c, g } = canvas(560, 70, '#b4b4b4');
      horizontalLines(g, this.lines, { x: 16, y: 20, size: 26, fill: '#8e8e8e' });
      return c;
    },
  },
  {
    id: 'low-contrast-light',
    category: 'lowContrast',
    orientation: 'horizontal',
    lines: ['次の駅で降りてください。'],
    draw() {
      const { c, g } = canvas(400, 70, '#f2f2f2');
      horizontalLines(g, this.lines, { x: 16, y: 18, size: 28, fill: '#cfcfcf' });
      return c;
    },
  },
  {
    id: 'dark-dialogue-box',
    category: 'darkBox',
    orientation: 'horizontal',
    lines: ['「おはよう、ずっと待ってたよ。」', '少女はそう言って微笑んだ。'],
    draw() {
      const { c, g } = canvas(620, 150, (ctx, width, height) => {
        const grad = ctx.createLinearGradient(0, 0, 0, height);
        grad.addColorStop(0, '#1d2a4a');
        grad.addColorStop(1, '#0a0f1e');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, width, height);
      });
      horizontalLines(g, this.lines, { x: 22, y: 26, size: 30, fill: '#f4f1e8' });
      return c;
    },
  },
  {
    id: 'subtitle-outline',
    category: 'subtitle',
    orientation: 'horizontal',
    lines: ['それじゃあ、また明日ね。'],
    draw() {
      const { c, g } = canvas(520, 100, busyBackdrop(7));
      horizontalLines(g, this.lines, {
        x: 30, y: 28, size: 38, font: 'LensBenchBold', fill: '#ffffff', stroke: '#000000', strokeWidth: 6,
      });
      return c;
    },
  },
  {
    id: 'small-10px',
    category: 'small',
    orientation: 'horizontal',
    lines: ['音量を調整するには右のつまみを回します。'],
    draw() {
      const { c, g } = canvas(220, 22, '#ffffff');
      horizontalLines(g, this.lines, { x: 5, y: 6, size: 10 });
      return c;
    },
  },
  {
    id: 'furigana-vertical',
    category: 'furigana',
    orientation: 'vertical',
    lines: ['毎日日本語を練習する。', '辞書を引いて覚える。'],
    draw() {
      const { c, g } = canvas(190, 400, '#ffffff');
      verticalColumns(g, this.lines, { right: 150, top: 20, size: 30, colGap: 2.1 });
      // Ruby to the right of each column's kanji runs.
      const ruby = [
        [[0, 'まいにち', 2], [2, 'にほんご', 3], [6, 'れんしゅう', 2]],
        [[0, 'じしょ', 2], [3, 'ひ', 1], [6, 'おぼ', 1]],
      ];
      g.font = '14px LensBenchRegular';
      g.textBaseline = 'top';
      g.fillStyle = '#111';
      ruby.forEach((spans, col) => {
        const cx = 150 - (col + 1) * 30 * 2.1 + 1.1 * 30;
        for (const [start, reading, length] of spans) {
          const top = 20 + start * 30 * 1.05;
          const span = length * 30 * 1.05;
          const step = span / reading.length;
          [...reading].forEach((ch, i) => g.fillText(ch, cx + 32, top + i * step + (step - 14) / 2));
        }
      });
      return c;
    },
  },
  {
    id: 'video-jpeg',
    category: 'subtitle',
    orientation: 'horizontal',
    lines: ['本当にありがとうございました。'],
    jpegQuality: 0.35,
    draw() {
      const { c, g } = canvas(560, 90, busyBackdrop(23));
      g.fillStyle = 'rgba(0,0,0,0.55)';
      g.fillRect(10, 16, 540, 58);
      horizontalLines(g, this.lines, { x: 26, y: 26, size: 34, fill: '#fff9e0' });
      return c;
    },
  },
  {
    id: 'dark-low-contrast',
    category: 'lowContrast',
    orientation: 'horizontal',
    lines: ['通信が切断されました。'],
    draw() {
      const { c, g } = canvas(380, 70, '#333740');
      horizontalLines(g, this.lines, { x: 16, y: 18, size: 30, fill: '#5d626d' });
      return c;
    },
  },
  {
    id: 'mixed-latin',
    category: 'horizontal',
    orientation: 'horizontal',
    lines: ['Wi-Fiの設定を確認してください。', 'エラーコード: 404'],
    draw() {
      const { c, g } = canvas(520, 120, '#ffffff');
      horizontalLines(g, this.lines, { x: 18, y: 18, size: 30 });
      return c;
    },
  },
  {
    id: 'noisy-paper',
    category: 'noisy',
    orientation: 'horizontal',
    lines: ['古い手紙には懐かしい名前が書いてあった。'],
    draw() {
      const { c, g } = canvas(700, 80, noisyPaper(11));
      horizontalLines(g, this.lines, { x: 18, y: 22, size: 30, fill: '#2a2018' });
      return c;
    },
  },
];

/** Round-trip through lossy JPEG, the way a compressed video frame arrives. */
async function jpegRoundTrip(c, quality) {
  const jpeg = c.toBuffer('image/jpeg', Math.round(quality * 100));
  const img = await canvasModule.loadImage(jpeg);
  const out = createCanvas(c.width, c.height);
  out.getContext('2d').drawImage(img, 0, 0);
  return out;
}

async function main() {
  registerFonts();
  fs.mkdirSync(OUT, { recursive: true });
  const manifest = [];
  for (const fixture of FIXTURES) {
    let c = fixture.draw();
    if (fixture.jpegQuality) c = await jpegRoundTrip(c, fixture.jpegQuality);
    const file = `${fixture.id}.png`;
    fs.writeFileSync(path.join(OUT, file), c.toBuffer('image/png'));
    manifest.push({
      id: fixture.id,
      file,
      category: fixture.category,
      orientation: fixture.orientation,
      text: fixture.lines.join('\n'),
      width: c.width,
      height: c.height,
    });
  }
  fs.writeFileSync(path.join(OUT, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Wrote ${manifest.length} fixtures to ${path.relative(ROOT, OUT)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
