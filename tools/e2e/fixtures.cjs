'use strict';
/* eslint-disable @typescript-eslint/no-var-requires -- CommonJS tooling, run by node directly */
/**
 * Test media the flows import, generated per run into the run's temp `media/` folder.
 * Every text is invented for the harness. Images and the video are drawn by the
 * repo's own ffmpeg-static (drawtext with a Windows CJK font), zips by adm-zip.
 */
const { execFile } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const REPO = path.resolve(__dirname, '..', '..');
const AdmZip = require(path.join(REPO, 'node_modules', 'adm-zip'));
const FFMPEG = path.join(REPO, 'node_modules', 'ffmpeg-static', 'ffmpeg.exe');
const FONT = ['C:/Windows/Fonts/msgothic.ttc', 'C:/Windows/Fonts/YuGothM.ttc', 'C:/Windows/Fonts/meiryo.ttc'].find((f) => fs.existsSync(f));

function ffmpeg(args) {
  return new Promise((resolve, reject) => {
    execFile(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', ...args], { windowsHide: true, timeout: 120000 }, (err, _o, stderr) =>
      err ? reject(new Error(`ffmpeg: ${stderr || err.message}`)) : resolve(),
    );
  });
}

/** `C:/x` → `C\:/x`, the filtergraph spelling of a Windows path. */
const filterPath = (p) => p.replace(/\\/g, '/').replace(/:/g, '\\:');

/** A Yomitan frequency dictionary (term_meta_bank) as a .zip. */
function yomitanFrequencyZip(dir) {
  const zip = new AdmZip();
  zip.addFile('index.json', Buffer.from(JSON.stringify({ title: 'E2E Frequency', format: 3, revision: 'e2e-1', frequencyMode: 'rank-based', sourceLanguage: 'ja' })));
  const rows = [
    ['食べる', 'freq', { reading: 'たべる', frequency: { value: 245, displayValue: '245' } }],
    ['飲む', 'freq', { reading: 'のむ', frequency: { value: 610, displayValue: '610' } }],
    ['窓辺', 'freq', { reading: 'まどべ', frequency: { value: 18250, displayValue: '18250' } }],
  ];
  zip.addFile('term_meta_bank_1.json', Buffer.from(JSON.stringify(rows)));
  const file = path.join(dir, 'e2e-frequency.zip');
  zip.writeZip(file);
  return file;
}

/** A two-character KANJIDIC2 excerpt in the real file's XML shape. */
function kanjidicXml(dir) {
  const ch = (literal, strokes, grade, freq, on, kun, meanings) => `<character><literal>${literal}</literal>
<misc><grade>${grade}</grade><stroke_count>${strokes}</stroke_count><freq>${freq}</freq><jlpt>4</jlpt></misc>
<reading_meaning><rmgroup>${on.map((r) => `<reading r_type="ja_on">${r}</reading>`).join('')}${kun.map((r) => `<reading r_type="ja_kun">${r}</reading>`).join('')}
${meanings.map((m) => `<meaning>${m}</meaning>`).join('')}<meaning m_lang="fr">manger</meaning></rmgroup></reading_meaning></character>`;
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<kanjidic2><header><file_version>4</file_version><database_version>e2e</database_version></header>
${ch('食', 9, 2, 328, ['ショク', 'ジキ'], ['く.う', 'た.べる'], ['eat', 'food'])}
${ch('窓', 11, 6, 1311, ['ソウ'], ['まど'], ['window', 'pane'])}
</kanjidic2>`;
  const file = path.join(dir, 'kanjidic2-e2e.xml');
  fs.writeFileSync(file, xml, 'utf8');
  return file;
}

/**
 * A small EPUB 3 with publisher CSS for vertical writing, ruby and 縦中横. The story is
 * invented for the harness. `mimetype` is stored first and uncompressed, per OCF.
 */
function epub(dir) {
  const css = `html { writing-mode: vertical-rl; -epub-writing-mode: vertical-rl; -webkit-writing-mode: vertical-rl; }
body { font-family: serif; line-height: 1.8; }
.tcy { text-combine-upright: all; -webkit-text-combine: horizontal; -epub-text-combine: horizontal; }
rt { font-size: 0.5em; }`;
  const chapter = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="ja" lang="ja">
<head><meta charset="UTF-8"/><title>第一章</title><link rel="stylesheet" type="text/css" href="style.css"/></head>
<body>
<h1>第一章\u3000窓辺の猫</h1>
<p id="p1">春の朝、<ruby>小町<rt>こまち</rt></ruby>という<ruby>猫<rt>ねこ</rt></ruby>は<ruby>窓辺<rt>まどべ</rt></ruby>で<span class="tcy">12</span>時まで眠っていた。</p>
<p id="p2">目を覚ますと、猫は台所へ行ってパンを食べる。</p>
<p id="p3">それから<span class="tcy">3</span>匹の雀を眺めて、また静かに目を閉じた。</p>
</body></html>`;
  const nav = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="ja" lang="ja">
<head><meta charset="UTF-8"/><title>目次</title></head>
<body><nav epub:type="toc"><ol><li><a href="chapter1.xhtml">第一章</a></li></ol></nav></body></html>`;
  const opf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid" xml:lang="ja">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="uid">urn:uuid:7d2e0e5a-e2e0-4c1e-9a1e-000000000e2e</dc:identifier>
<dc:title>窓辺の猫（E2E）</dc:title><dc:creator>Gum E2E</dc:creator><dc:language>ja</dc:language>
<meta property="dcterms:modified">2026-10-01T00:00:00Z</meta>
<meta name="primary-writing-mode" content="vertical-rl"/>
</metadata>
<manifest>
<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
<item id="css" href="style.css" media-type="text/css"/>
<item id="c1" href="chapter1.xhtml" media-type="application/xhtml+xml"/>
</manifest>
<spine page-progression-direction="rtl"><itemref idref="c1"/></spine>
</package>`;
  const container = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`;
  const zip = new AdmZip();
  zip.addFile('mimetype', Buffer.from('application/epub+zip'));
  zip.getEntry('mimetype').header.method = 0;
  zip.addFile('META-INF/container.xml', Buffer.from(container));
  zip.addFile('OEBPS/content.opf', Buffer.from(opf));
  zip.addFile('OEBPS/nav.xhtml', Buffer.from(nav));
  zip.addFile('OEBPS/style.css', Buffer.from(css));
  zip.addFile('OEBPS/chapter1.xhtml', Buffer.from(chapter));
  const file = path.join(dir, 'madobe-no-neko-e2e.epub');
  zip.writeZip(file);
  return file;
}

/** The manga's speech-box layout: one vertical box per page, same coordinates in .mokuro. */
const MANGA_PAGES = [
  { name: '001', lines: ['おはよう', 'ございます'] },
  { name: '002', lines: ['今日は', '雨ですね'] },
  { name: '003', lines: ['パンを', '食べる'] },
];
const PAGE_W = 600;
const PAGE_H = 900;

/** Three PNG pages with drawn speech boxes, a .cbz of them, and the matching .mokuro. */
async function manga(dir) {
  const work = path.join(dir, 'manga-pages');
  fs.mkdirSync(work, { recursive: true });
  const pages = [];
  for (const [index, page] of MANGA_PAGES.entries()) {
    const boxes = [];
    const filters = [`drawbox=x=0:y=0:w=${PAGE_W}:h=40:color=gray@0.5:t=fill`];
    page.lines.forEach((line, col) => {
      // Right-to-left columns, one character per row: vertical text the way a page sets it.
      const x = 420 - col * 70;
      const y = 120;
      const h = line.length * 52 + 20;
      boxes.push({ box: [x - 10, y - 10, x + 60, y + h], line });
      const textFile = path.join(work, `${page.name}-${col}.txt`);
      fs.writeFileSync(textFile, [...line].join('\n'), 'utf8');
      filters.push(`drawbox=x=${x - 10}:y=${y - 10}:w=70:h=${h + 10}:color=black:t=3`);
      filters.push(`drawtext=fontfile='${filterPath(FONT)}':textfile='${filterPath(textFile)}':x=${x}:y=${y}:fontsize=44:fontcolor=black:line_spacing=8`);
    });
    filters.push(`drawtext=fontfile='${filterPath(FONT)}':text='${index + 1}':x=20:y=${PAGE_H - 50}:fontsize=28:fontcolor=gray`);
    const out = path.join(work, `${page.name}.png`);
    await ffmpeg(['-f', 'lavfi', '-i', `color=c=white:s=${PAGE_W}x${PAGE_H}`, '-frames:v', '1', '-vf', filters.join(','), out]);
    pages.push({ page, out, boxes });
  }
  const zip = new AdmZip();
  for (const { page, out } of pages) zip.addLocalFile(out, '', `${page.name}.png`);
  const cbz = path.join(dir, 'ame-no-hi-e2e.cbz');
  zip.writeZip(cbz);
  const mokuro = {
    version: '0.2.1',
    title: 'ame-no-hi-e2e',
    title_uuid: '00000000-0000-4000-8000-00000000e2e0',
    volume: 'ame-no-hi-e2e',
    volume_uuid: '00000000-0000-4000-8000-00000000e2e1',
    pages: pages.map(({ page, boxes }) => ({
      version: '0.2.1',
      img_width: PAGE_W,
      img_height: PAGE_H,
      img_path: `${page.name}.png`,
      blocks: boxes.map(({ box, line }) => ({
        box,
        vertical: true,
        font_size: 44,
        lines_coords: [[[box[0], box[1]], [box[2], box[1]], [box[2], box[3]], [box[0], box[3]]]],
        lines: [line],
      })),
    })),
  };
  const mokuroFile = path.join(dir, 'ame-no-hi-e2e.mokuro');
  fs.writeFileSync(mokuroFile, JSON.stringify(mokuro, null, 2), 'utf8');
  return { cbz, mokuroFile, pages: MANGA_PAGES.length, expectedLines: MANGA_PAGES.map((p) => p.lines) };
}

const SUBS = [
  [1.0, 4.0, 'おはようございます。'],
  [4.5, 8.0, '今日はいい天気ですね。'],
  [8.5, 12.0, '一緒にパンを食べる？'],
  [12.5, 16.0, 'うん、食べよう。'],
  [16.5, 19.5, 'じゃあ、行きましょう。'],
];

const srtTime = (s) => {
  const ms = Math.round(s * 1000);
  const hh = String(Math.floor(ms / 3600000)).padStart(2, '0');
  const mm = String(Math.floor((ms % 3600000) / 60000)).padStart(2, '0');
  const ss = String(Math.floor((ms % 60000) / 1000)).padStart(2, '0');
  return `${hh}:${mm}:${ss},${String(ms % 1000).padStart(3, '0')}`;
};

/** A 20 s H.264/AAC clip with burnt-in cue text, plus `<name>.ja.srt` beside it. */
async function video(dir) {
  const base = path.join(dir, 'asa-no-kaiwa-e2e');
  const mp4 = `${base}.mp4`;
  const srt = `${base}.ja.srt`;
  fs.writeFileSync(srt, SUBS.map(([a, b, text], i) => `${i + 1}\n${srtTime(a)} --> ${srtTime(b)}\n${text}\n`).join('\n'), 'utf8');
  const draws = SUBS.map(([a, b], i) => `drawtext=fontfile='${filterPath(FONT)}':text='${i + 1}':x=40:y=40:fontsize=48:fontcolor=white:enable='between(t,${a},${b})'`);
  await ffmpeg([
    '-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=25:duration=20',
    '-f', 'lavfi', '-i', 'sine=frequency=330:sample_rate=44100:duration=20',
    '-vf', draws.join(','),
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'veryfast', '-c:a', 'aac', '-shortest', mp4,
  ]);
  return { mp4, srt, cues: SUBS.length };
}

/** A plain word list, one word per line, with a header comment and a duplicate. */
function wordList(dir) {
  const file = path.join(dir, 'known-words-e2e.txt');
  fs.writeFileSync(file, ['# e2e list', '窓辺', '雀', '台所', '眺める', '静か', '雀', ''].join('\n'), 'utf8');
  return { file, unique: ['窓辺', '雀', '台所', '眺める', '静か'] };
}

module.exports = { yomitanFrequencyZip, kanjidicXml, epub, manga, video, wordList, SUBS };
