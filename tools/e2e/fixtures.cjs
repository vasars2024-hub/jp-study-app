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
  // Enough plain text (no ruby, so the ruby check stays exact) for several
  // pages, so the epub flow can check that a reopened book lands where it was
  // left. 24 paragraphs keeps the chapter one reader part (30 elements).
  const filler = Array.from({ length: 24 }, (_, i) =>
    `<p id="q${i + 1}">第${i + 1}段落。${'窓の外では春の風が静かに吹いていて、猫はその音を聞きながら長い夢を見ていた。'.repeat(5)}</p>`,
  ).join('');
  const chapter = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="ja" lang="ja">
<head><meta charset="UTF-8"/><title>第一章</title><link rel="stylesheet" type="text/css" href="style.css"/></head>
<body>
<h1>第一章\u3000窓辺の猫</h1>
<p id="p1">春の朝、<ruby>小町<rt>こまち</rt></ruby>という<ruby>猫<rt>ねこ</rt></ruby>は<ruby>窓辺<rt>まどべ</rt></ruby>で<span class="tcy">12</span>時まで眠っていた。</p>
<p id="p2">目を覚ますと、猫は台所へ行ってパンを食べる。</p>
<p id="p3">それから<span class="tcy">3</span>匹の雀を眺めて、また静かに目を閉じた。</p>
${filler}
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

/**
 * The manga's speech-box layout: vertical columns, same coordinates in .mokuro. Pages 1
 * and 2 carry one block per column; page 3 carries one block of two lines, right column
 * first, the shape the OCR's line grouping writes for a bubble (`shared/mangaTextLines.ts`).
 */
const MANGA_PAGES = [
  { name: '001', lines: ['おはよう', 'ございます'] },
  { name: '002', lines: ['今日は', '雨ですね'] },
  { name: '003', lines: ['パンを', '食べる'], grouped: true },
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
      blocks: page.grouped
        ? [{
          box: boxes.reduce((u, { box }) => [Math.min(u[0], box[0]), Math.min(u[1], box[1]), Math.max(u[2], box[2]), Math.max(u[3], box[3])], boxes[0].box),
          vertical: true,
          font_size: 44,
          lines_coords: boxes.map(({ box }) => [[box[0], box[1]], [box[2], box[1]], [box[2], box[3]], [box[0], box[3]]]),
          lines: boxes.map(({ line }) => line),
        }]
        : boxes.map(({ box, line }) => ({
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
  return {
    cbz,
    mokuroFile,
    pages: MANGA_PAGES.length,
    expectedLines: MANGA_PAGES.map((p) => p.lines),
    /** Per page, each block's lines in reading order. */
    expectedBlocks: MANGA_PAGES.map((p) => (p.grouped ? [p.lines] : p.lines.map((line) => [line]))),
  };
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

/**
 * Three invented songs (sine tones, AAC) with a synced `.lrc` each. The second is
 * enhanced LRC: its first line carries word times and ends at 4 s with an instrumental
 * break to 8 s (a blank stamp). The third has no sidecar: its `.lrc` sits in a
 * `Lyrics` folder beside it, for the offline folder match.
 */
const SONGS = [
  { title: 'E2E 雨の歌', freq: 392, lines: [[1.0, '雨が静かに降っている'], [4.0, '窓辺で一緒に歌おう'], [8.0, '明日は晴れるかな']] },
  {
    title: 'E2E 朝の歌',
    freq: 523,
    lines: [[1.0, 'おはよう、新しい朝', [[1.0, 'おはよう、'], [2.0, '新しい'], [3.0, '朝']], 4.0], [8.0, 'パンを食べて出かけよう']],
  },
  { title: 'E2E 夜の歌', freq: 330, lines: [[1.0, '星が窓に光る'], [5.0, '静かな夜に眠ろう']], lyricsDir: 'Lyrics' },
];
const lrcTime = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${(s % 60).toFixed(2).padStart(5, '0')}`;
/** One LRC line: `[t]text`, or enhanced `[t]<t1>w1<t2>w2…<end>` plus a blank `[end]` stamp. */
const lrcLine = ([t, l, words, end]) => {
  if (!words) return [`[${lrcTime(t)}]${l}`];
  const body = words.map(([wt, w]) => `<${lrcTime(wt)}>${w}`).join('') + `<${lrcTime(end)}>`;
  return [`[${lrcTime(t)}]${body}`, `[${lrcTime(end)}]`];
};

async function music(dir) {
  const folder = path.join(dir, 'music');
  fs.mkdirSync(folder, { recursive: true });
  const out = [];
  for (const song of SONGS) {
    const file = path.join(folder, `${song.title}.m4a`);
    await ffmpeg(['-f', 'lavfi', '-i', `sine=frequency=${song.freq}:sample_rate=44100:duration=12`, '-c:a', 'aac', '-b:a', '96k',
      '-metadata', `title=${song.title}`, '-metadata', 'artist=Gum E2E', file]);
    const lrcDir = song.lyricsDir ? path.join(folder, song.lyricsDir) : folder;
    fs.mkdirSync(lrcDir, { recursive: true });
    const lrc = path.join(lrcDir, `${song.title}.lrc`);
    fs.writeFileSync(lrc, [`[ti:${song.title}]`, '[ar:Gum E2E]', ...song.lines.flatMap(lrcLine), ''].join('\n'), 'utf8');
    out.push({ ...song, file, lrc });
  }
  return out;
}

/**
 * A "downloaded" YouTube video the way yt-dlp leaves one: `<title> [<id>].mp4` with its
 * Japanese subtitle beside it (`.ja.srt`), in a folder of the run.
 */
async function youtubeDownload(dir) {
  const folder = path.join(dir, 'yt-downloads');
  fs.mkdirSync(folder, { recursive: true });
  const id = 'E2Eyt0001aa';
  const base = path.join(folder, `朝の会話 E2E [${id}]`);
  const mp4 = `${base}.mp4`;
  const srt = `${base}.ja.srt`;
  fs.writeFileSync(srt, SUBS.map(([a, b, text], i) => `${i + 1}\n${srtTime(a)} --> ${srtTime(b)}\n${text}\n`).join('\n'), 'utf8');
  await ffmpeg([
    '-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=25:duration=20',
    '-f', 'lavfi', '-i', 'sine=frequency=262:sample_rate=44100:duration=20',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'veryfast', '-c:a', 'aac', '-shortest', mp4,
  ]);
  return { id, mp4, srt, title: '朝の会話 E2E' };
}

// ----- a library's worth of small books and manga --------------------------------------

const zlib = require('node:zlib');

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * A PNG drawn in plain Node (no ffmpeg): a paper-coloured page with a seeded noise band.
 * The noise keeps the page from compressing to nothing, so importing an archive of them
 * takes measurable time (a Stop pressed part-way has something to stop).
 */
function noisePng(width, height, seed, noiseRows = height) {
  let s = (seed * 2654435761) >>> 0 || 1;
  const rand = () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s & 0xff;
  };
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    const row = y * (width * 3 + 1);
    raw[row] = 0;
    for (let x = 0; x < width; x++) {
      const at = row + 1 + x * 3;
      if (y < noiseRows) {
        raw[at] = rand();
        raw[at + 1] = rand();
        raw[at + 2] = rand();
      } else {
        raw[at] = 0xf4;
        raw[at + 1] = 0xf1;
        raw[at + 2] = 0xe8;
      }
    }
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 1 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** A minimal EPUB 3 (one chapter, optional OPF series / creator / subjects). */
function smallEpubBuffer({ title, uid, body, creator = 'Gum E2E', cover = null }) {
  const opf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid" xml:lang="ja">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="uid">${uid}</dc:identifier>
<dc:title>${title}</dc:title><dc:creator>${creator}</dc:creator><dc:language>ja</dc:language>
<meta property="dcterms:modified">2026-10-01T00:00:00Z</meta>${cover ? '\n<meta name="cover" content="cover"/>' : ''}
</metadata>
<manifest>
<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
<item id="c1" href="chapter1.xhtml" media-type="application/xhtml+xml"/>${cover ? '\n<item id="cover" href="cover.png" media-type="image/png" properties="cover-image"/>' : ''}
</manifest>
<spine><itemref idref="c1"/></spine>
</package>`;
  const page = (head, inner) => `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="ja" lang="ja">
<head><meta charset="UTF-8"/><title>${head}</title></head>
<body>${inner}</body></html>`;
  const zip = new AdmZip();
  zip.addFile('mimetype', Buffer.from('application/epub+zip'));
  zip.getEntry('mimetype').header.method = 0;
  zip.addFile('META-INF/container.xml', Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`));
  zip.addFile('OEBPS/content.opf', Buffer.from(opf));
  zip.addFile('OEBPS/nav.xhtml', Buffer.from(page('目次', '<nav epub:type="toc"><ol><li><a href="chapter1.xhtml">一</a></li></ol></nav>')));
  zip.addFile('OEBPS/chapter1.xhtml', Buffer.from(page(title, body)));
  if (cover) {
    zip.addFile('OEBPS/cover.png', cover);
    zip.getEntry('OEBPS/cover.png').header.method = 0;
  }
  return zip.toBuffer();
}

/**
 * The library flow's media, generated into `<dir>/library-e2e/`:
 *
 *  - `shelf/`: two single books the flow removes, restores and edits (unique titles, so
 *    they never collide with what another flow imported);
 *  - `collection/`: 30 files, the "import my whole folder" case — 18 EPUBs and 10 manga
 *    archives (each different bytes), one byte-for-byte copy of the first EPUB under
 *    another name (a duplicate) and one .cbz with no images in it (a failure).
 *    Natural-sorted names, so the job meets them in that order.
 *
 * The pages carry incompressible noise (~0.7 MB a page), so an import takes long
 * enough for the flow to press Stop part-way through it.
 */
function libraryCollection(dir, { pageWidth = 480, pageHeight = 480 } = {}) {
  const root = path.join(dir, 'library-e2e');
  const shelfDir = path.join(root, 'shelf');
  const collectionDir = path.join(root, 'collection');
  fs.rmSync(root, { recursive: true, force: true });
  fs.mkdirSync(shelfDir, { recursive: true });
  fs.mkdirSync(collectionDir, { recursive: true });
  const uid = (n) => `urn:uuid:00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  const pad = (n) => String(n).padStart(2, '0');

  const shelf = [
    { title: 'E2E 書庫の本 甲', file: 'shokoshelf-ko.epub', body: '<p>甲の本。窓辺で猫が眠る。</p>' },
    { title: 'E2E 書庫の本 乙', file: 'shokoshelf-otsu.epub', body: '<p>乙の本。雨の日に傘を差す。</p>' },
  ].map((b, i) => {
    const file = path.join(shelfDir, b.file);
    fs.writeFileSync(file, smallEpubBuffer({ title: b.title, uid: uid(9000 + i), body: b.body }));
    return { ...b, file };
  });

  const books = [];
  for (let i = 1; i <= 18; i++) {
    const title = `E2E 蔵書 ${pad(i)}`;
    const file = path.join(collectionDir, `${pad(i)}-zousho-${pad(i)}.epub`);
    const cover = noisePng(pageWidth, pageHeight, 1000 + i);
    fs.writeFileSync(file, smallEpubBuffer({ title, uid: uid(1000 + i), body: `<p>第${i}冊。今日は${i}日目です。</p>`, cover }));
    books.push({ title, file, kind: 'book' });
  }
  const manga = [];
  for (let i = 1; i <= 10; i++) {
    const n = 18 + i;
    const title = `${pad(n)}-manga-e2e-${pad(i)}`;
    const zip = new AdmZip();
    for (let p = 1; p <= 2; p++) {
      zip.addFile(`${pad(p)}.png`, noisePng(pageWidth, pageHeight, 5000 + i * 10 + p));
      zip.getEntry(`${pad(p)}.png`).header.method = 0;
    }
    const file = path.join(collectionDir, `${title}.cbz`);
    zip.writeZip(file);
    manga.push({ title, file, kind: 'manga' });
  }
  // The same bytes as the first book, under another name: "already in the library".
  const duplicate = path.join(collectionDir, '29-zousho-01-copy.epub');
  fs.copyFileSync(books[0].file, duplicate);
  // An archive with no page in it: imported as a failure, named in the receipt.
  const broken = path.join(collectionDir, '30-broken-e2e.cbz');
  const empty = new AdmZip();
  empty.addFile('readme.txt', Buffer.from('no pages here'));
  empty.writeZip(broken);

  const files = fs.readdirSync(collectionDir).map((f) => path.join(collectionDir, f));
  return {
    root,
    shelf,
    collectionDir,
    files,
    books,
    manga,
    duplicate,
    broken,
    /** What a complete import of `collectionDir` into a library without these must report. */
    expected: { total: files.length, imported: books.length + manga.length, duplicates: 1, failed: 1 },
  };
}

/**
 * A fake DeepL (`/v2/translate`), answered by the world's providers server for
 * api-free.deepl.com and api.deepl.com (GUM_E2E_REMOTE), so the Translate flow does a real
 * translation through a cloud engine with no key and no internet. A line it knows gets a fixed
 * English sentence, any other line a numbered one, so every result is checkable. A request that
 * asks for more formality (`prefer_more`) gets " (formal)" on every line: the flow's proof that
 * the option reached DeepL. Every request is recorded in `log`, newest last.
 */
const DEEPL_LINES = {
  '猫は窓辺で眠っていた。': 'The cat was sleeping by the window.',
  '今日は雨ですね。': 'It is raining today, isn\'t it?',
};
const DEEPL_AUTH = /^DeepL-Auth-Key \S+/;

function fakeDeeplAnswer(body) {
  const texts = Array.isArray(body && body.text) ? body.text : [];
  const formal = Boolean(body) && (body.formality === 'prefer_more' || body.formality === 'more');
  return {
    translations: texts.map((text) => ({
      detected_source_language: String((body && body.source_lang) || 'JA'),
      text: String(text)
        .split('\n')
        .map((line, index) => `${DEEPL_LINES[line.trim()] || `E2E DeepL line ${index + 1}.`}${formal ? ' (formal)' : ''}`)
        .join('\n'),
    })),
  };
}

/** Answers one request to the fake DeepL; `route` is the path after the host. */
function answerFakeDeepl(req, res, route, log) {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const json = (status, payload) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(payload));
    };
    let body = null;
    try {
      body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
      /* answered below as a bad request */
    }
    const entry = { method: req.method, route, authorized: DEEPL_AUTH.test(String(req.headers.authorization || '')), body };
    log.push(entry);
    if (req.method !== 'POST' || route !== '/v2/translate') return json(404, { message: 'fake DeepL: no such route' });
    if (!entry.authorized) return json(403, { message: 'fake DeepL: no DeepL-Auth-Key' });
    if (!body || !Array.isArray(body.text)) return json(400, { message: 'fake DeepL: the body has no text array' });
    return json(200, fakeDeeplAnswer(body));
  });
}

module.exports = {
  fakeDeeplAnswer,
  answerFakeDeepl,
  yomitanFrequencyZip,
  kanjidicXml,
  epub,
  manga,
  video,
  wordList,
  music,
  youtubeDownload,
  libraryCollection,
  SUBS,
  SONGS,
};
