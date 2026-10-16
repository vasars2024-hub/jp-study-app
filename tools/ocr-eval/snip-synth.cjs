'use strict';
/* eslint-disable @typescript-eslint/no-var-requires -- CommonJS dev tool, run by node directly */
/**
 * Synthetic snips for the Snip to cards eval (`snip-eval.cjs`): what a learner
 * snips with Win+Shift+S, drawn with the Windows system fonts.
 *
 *   node tools/ocr-eval/snip-synth.cjs <outDir> [--seed 11]
 *
 * The set: Chinese sentences (Simplified in Microsoft YaHei / SimSun, Traditional
 * in Microsoft JhengHei / SimSun), Japanese sentences (Yu Gothic, MS Gothic),
 * short kana-less Japanese words (図書館, 新幹線 …: the case that used to read as
 * Chinese), a few Russian lines, and stylised variants — outlined thumbnail
 * lettering on a busy background, light-on-dark, a drop shadow, a slant, and
 * two vertical (tategaki) columns. Every sentence was written for this tool.
 * The fonts are not redistributed: the PNGs stay in a temp folder, never in git.
 *
 * Writes <name>.png and truth.json ({ files: { name.png: { text, lang, style } } }).
 */
const fs = require('node:fs');
const path = require('node:path');
const { createCanvas, GlobalFonts } = require('@napi-rs/canvas');

const FONT_FILES = [
  ['YuGothM.ttc', 'Yu Gothic Medium'],
  ['YuGothB.ttc', 'Yu Gothic Bold'],
  ['msgothic.ttc', 'MS Gothic'],
  ['msyh.ttc', 'Microsoft YaHei'],
  ['msyhbd.ttc', 'Microsoft YaHei Bold'],
  ['simsun.ttc', 'SimSun'],
  ['msjh.ttc', 'Microsoft JhengHei'],
  ['msjhl.ttc', 'Microsoft JhengHei Light'],
  ['arial.ttf', 'Arial'],
  ['times.ttf', 'Times New Roman'],
  ['segoeui.ttf', 'Segoe UI'],
];

const ZH_HANS = [
  '今天的天气非常好，我们去公园散步吧。',
  '他每天早上六点起床跑步。',
  '这本书我已经看了三遍了。',
  '学习外语需要耐心和坚持。',
  '请问去火车站怎么走？',
  '我觉得这个办法很有道理。',
  '她把钥匙忘在办公室里了。',
  '周末我们一起去看电影怎么样？',
  '这家餐厅的饺子特别好吃。',
  '时间过得真快，转眼又是一年。',
  '只要努力，就一定会成功。',
  '你能帮我把窗户打开吗？',
];
const ZH_HANT = [
  '我們明天早上在車站見面。',
  '這個問題比我想像的複雜得多。',
  '他對音樂一直很有興趣。',
  '圖書館裡的人都在安靜地讀書。',
  '謝謝你們的熱情招待。',
  '臺灣的夜市非常熱鬧。',
  '這件衣服的顏色很漂亮。',
  '學習中文的時候要多聽多說。',
];
const JA = [
  '窓辺の猫は静かに眠っていた。',
  '明日は朝から雨が降るそうです。',
  '駅前の本屋で新しい辞書を買いました。',
  '週末は友達と映画を見に行く予定です。',
  'この問題はもう少し考える必要がある。',
  '彼女は毎朝コーヒーを飲みながら新聞を読む。',
  '日本語の勉強は楽しいけれど難しい。',
  '子供たちが公園で元気に遊んでいる。',
  '冷蔵庫に牛乳が残っていなかった。',
  '夏休みに家族で海へ出かけました。',
  '図書館で古い地図を見つけた。',
  '電車が遅れたので会議に間に合わなかった。',
  '桜の花が咲く季節になりました。',
  '先生の説明はとても分かりやすかった。',
  '富士山に登ったことがありますか。',
  '料理を作るのが好きです。',
  '漢字を覚えるのに時間がかかる。',
  '部屋をきれいに掃除しておいてください。',
  '新しい仕事にもう慣れましたか。',
  '週末の天気はどうなるでしょう。',
];
/** Kana-less Japanese words: told apart from Chinese by their forms, or not at all. */
const JA_KANJI = ['世界記録', '図書館', '駅前広場', '天気予報', '新幹線', '恐竜時代', '経済政策', '国際空港', '自動販売機', '東京大学'];
const RU = [
  'Сегодня очень хорошая погода.',
  'Я изучаю японский язык уже два года.',
  'Где находится ближайшая станция метро?',
  'Спасибо за вашу помощь!',
];

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function registerFonts() {
  const have = new Set();
  for (const [file, family] of FONT_FILES) {
    const full = path.join('C:\\Windows\\Fonts', file);
    if (fs.existsSync(full) && GlobalFonts.registerFromPath(full, family)) have.add(family);
  }
  return have;
}

/** A soft background: paper, a pale wash, or a gradient with blobs (a video frame). */
function paintBackground(ctx, w, h, kind, rand) {
  if (kind === 'dark') {
    ctx.fillStyle = '#1d2230';
    ctx.fillRect(0, 0, w, h);
    return;
  }
  if (kind === 'busy') {
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, '#5aa9e6');
    g.addColorStop(0.5, '#7fc8f8');
    g.addColorStop(1, '#f9c74f');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 14; i++) {
      ctx.fillStyle = `hsla(${Math.floor(rand() * 360)}, 55%, 55%, 0.45)`;
      ctx.beginPath();
      ctx.ellipse(rand() * w, rand() * h, 20 + rand() * 120, 20 + rand() * 80, rand() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
    return;
  }
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, kind === 'wash' ? '#f3f1e7' : '#ffffff');
  g.addColorStop(1, kind === 'wash' ? '#e4ece4' : '#f6f6f6');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  if (kind === 'wash') {
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = `rgba(${200 + Math.floor(rand() * 40)}, ${170 + Math.floor(rand() * 50)}, ${180 + Math.floor(rand() * 40)}, 0.35)`;
      ctx.beginPath();
      ctx.ellipse(rand() * w, rand() * h, 40 + rand() * 90, 30 + rand() * 60, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/** One snip: `text` in `font` at `size`, styled. Returns the PNG. */
function drawSnip(text, { font, size, style = 'plain', bg = 'paper', vertical = false }, rand) {
  const probe = createCanvas(10, 10).getContext('2d');
  probe.font = `${size}px "${font}"`;
  const pad = Math.round(size * 0.7);
  let w;
  let h;
  if (vertical) {
    w = size + pad * 2;
    h = [...text].length * size * 1.08 + pad * 2;
  } else {
    w = Math.ceil(probe.measureText(text).width) + pad * 2 + (style === 'slant' ? size : 0);
    h = Math.round(size * 1.5) + pad * 2;
  }
  w = Math.round(w);
  h = Math.round(h);
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext('2d');
  paintBackground(ctx, w, h, bg, rand);
  ctx.font = `${size}px "${font}"`;
  ctx.textBaseline = 'middle';
  const fill = bg === 'dark' ? '#f2f2f2' : style === 'outline' ? '#e63946' : '#1b1b1b';
  const put = (draw) => {
    if (style === 'outline') {
      ctx.lineJoin = 'round';
      ctx.lineWidth = Math.max(4, size * 0.16);
      ctx.strokeStyle = '#ffffff';
      draw('stroke');
      ctx.lineWidth = Math.max(2, size * 0.05);
      ctx.strokeStyle = '#3a0a0a';
      draw('stroke');
    }
    if (style === 'shadow') {
      ctx.shadowColor = 'rgba(0,0,0,0.55)';
      ctx.shadowOffsetX = size * 0.06;
      ctx.shadowOffsetY = size * 0.06;
      ctx.shadowBlur = size * 0.08;
    }
    ctx.fillStyle = fill;
    draw('fill');
    ctx.shadowColor = 'transparent';
  };
  if (vertical) {
    ctx.textAlign = 'center';
    const chars = [...text];
    put((mode) => chars.forEach((ch, i) => (mode === 'fill' ? ctx.fillText(ch, w / 2, pad + size * 0.5 + i * size * 1.08) : ctx.strokeText(ch, w / 2, pad + size * 0.5 + i * size * 1.08))));
  } else {
    if (style === 'slant') ctx.setTransform(1, 0, -0.18, 1, size * 0.5, 0);
    put((mode) => (mode === 'fill' ? ctx.fillText(text, pad, h / 2) : ctx.strokeText(text, pad, h / 2)));
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
  return canvas.toBuffer('image/png');
}

function main() {
  const outDir = process.argv[2];
  if (!outDir) {
    console.error('usage: node tools/ocr-eval/snip-synth.cjs <outDir> [--seed 11]');
    process.exit(2);
  }
  const seedAt = process.argv.indexOf('--seed');
  const rand = rng(seedAt > 0 ? Number(process.argv[seedAt + 1]) : 11);
  const fonts = registerFonts();
  const pick = (...names) => names.find((n) => fonts.has(n)) ?? names[0];
  fs.mkdirSync(outDir, { recursive: true });
  const truth = {};
  const add = (name, text, lang, opts) => {
    const file = `${name}.png`;
    fs.writeFileSync(path.join(outDir, file), drawSnip(text, opts, rand));
    truth[file] = { text, lang, style: `${opts.font} ${opts.size}px ${opts.style ?? 'plain'}${opts.vertical ? ' vertical' : ''} on ${opts.bg ?? 'paper'}` };
  };
  const bgs = ['paper', 'wash', 'paper', 'wash'];
  const sizes = [30, 38, 46, 56];
  ZH_HANS.forEach((t, i) => add(`zh-hans-${String(i + 1).padStart(2, '0')}`, t, 'zh', {
    font: i % 2 ? pick('SimSun') : pick('Microsoft YaHei'), size: sizes[i % 4], bg: bgs[i % 4],
  }));
  ZH_HANT.forEach((t, i) => add(`zh-hant-${String(i + 1).padStart(2, '0')}`, t, 'zh', {
    font: i % 2 ? pick('SimSun') : pick(i % 4 ? 'Microsoft JhengHei Light' : 'Microsoft JhengHei', 'Microsoft JhengHei'), size: sizes[(i + 1) % 4], bg: bgs[(i + 1) % 4],
  }));
  JA.forEach((t, i) => add(`ja-sent-${String(i + 1).padStart(2, '0')}`, t, 'ja', {
    font: i % 2 ? pick('MS Gothic') : pick('Yu Gothic Medium'), size: sizes[(i + 2) % 4], bg: bgs[(i + 2) % 4],
  }));
  JA_KANJI.forEach((t, i) => add(`ja-kanji-${String(i + 1).padStart(2, '0')}`, t, 'ja', {
    font: i % 2 ? pick('MS Gothic') : pick('Yu Gothic Bold'), size: [44, 56, 64][i % 3], bg: bgs[i % 4],
  }));
  RU.forEach((t, i) => add(`ru-${String(i + 1).padStart(2, '0')}`, t, 'ru', {
    font: [pick('Segoe UI'), pick('Arial'), pick('Times New Roman')][i % 3], size: sizes[(i + 1) % 4], bg: bgs[i % 4],
  }));
  // Stylised: thumbnail lettering, light on dark, a drop shadow, a slant, tategaki.
  add('style-ja-outline', '恐竜の魅力を語る', 'ja', { font: pick('Yu Gothic Bold'), size: 72, style: 'outline', bg: 'busy' });
  add('style-ja-outline2', '週末は温泉へ行こう', 'ja', { font: pick('Yu Gothic Bold'), size: 64, style: 'outline', bg: 'busy' });
  add('style-zh-outline', '一起来学习中文吧', 'zh', { font: pick('Microsoft YaHei Bold', 'Microsoft YaHei'), size: 68, style: 'outline', bg: 'busy' });
  add('style-zh-dark', '这个周末你有什么计划？', 'zh', { font: pick('Microsoft YaHei'), size: 44, bg: 'dark' });
  add('style-ja-dark', '次の駅で降りてください', 'ja', { font: pick('Yu Gothic Medium'), size: 44, bg: 'dark' });
  add('style-ja-shadow', '新しい生活が始まる', 'ja', { font: pick('Yu Gothic Bold'), size: 56, style: 'shadow', bg: 'wash' });
  add('style-zh-slant', '我们下次再见面吧', 'zh', { font: pick('SimSun'), size: 50, style: 'slant', bg: 'paper' });
  add('style-ja-vertical', '春が来た', 'ja', { font: pick('Yu Gothic Medium'), size: 56, vertical: true, bg: 'paper' });
  add('style-zh-vertical', '学而时习之', 'zh', { font: pick('SimSun'), size: 56, vertical: true, bg: 'wash' });
  fs.writeFileSync(path.join(outDir, 'truth.json'), JSON.stringify({ files: truth }, null, 1));
  console.log(`${Object.keys(truth).length} snips in ${outDir} (fonts: ${[...fonts].join(', ')})`);
}

if (require.main === module) main();

module.exports = { drawSnip, ZH_HANS, ZH_HANT, JA, JA_KANJI, RU };
