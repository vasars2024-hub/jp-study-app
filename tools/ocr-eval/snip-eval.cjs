'use strict';
/* eslint-disable @typescript-eslint/no-var-requires -- CommonJS dev tool, run by node directly */
/* global globalThis */
/**
 * Real-model eval of Snip to cards: picture → OCR router → language detection →
 * the words that would become cards, exactly as the app runs it, on a folder of
 * snips (the owner's, or the synthetic set `snip-synth.cjs` renders).
 *
 *   node tools/ocr-eval/snip-eval.cjs --images <dir> --models <modelsDir>
 *        [--dict <dict.db>] [--cedict <cedict_ts.u8>] [--active ja|zh|ru]
 *        [--only <substring>] [--json <out.json>] [--quiet] [--strict]
 *
 * <modelsDir> is laid out like a Gum profile's `models/` folder
 * (`paddle-ocr-det/model.onnx`, `paddle-ocr-ja/model.onnx`, `paddle-ocr-ja-keys/keys.txt`,
 * `manga-ocr/…`): the asset registry's install dirs. Work from a COPY — never
 * the owner's profile. <dict.db> is a copy of a profile's `dictionary/dict.db`
 * (with its -wal): the dictionary the router's dictionary-guided decoding and
 * the cards' readings use. Without it, decoding runs with no dictionary and the
 * cards have only the analyser's readings.
 *
 * <dir>/truth.json (optional) gives the ground truth per file:
 *   { "files": { "a.png": { "text": "我们用准备作为借口", "lang": "zh" }, "ui.png": { "lang": null } } }
 * A file with `lang: null` is read and reported but not scored.
 *
 * What runs is the shipped code, bundled with esbuild on the fly: `main/ocrRouter.ts`
 * (with `paddleOcr.ts` and `mangaOcr.ts` unmodified), `shared/textLangDetect.ts`,
 * `shared/snipToCards.ts`, and the renderer pipeline's own `tokensOf` / `enrichWord`
 * (`renderer/snipToCards.ts`, kuromoji for Japanese). Electron's `nativeImage` is
 * replaced by an @napi-rs/canvas stand-in, the dictionary database by `node:sqlite`
 * over the same `dictService.lookup` the app's read worker runs, and the
 * main-process decision in `readSnip` (`main/snipToCards.ts`) is mirrored below
 * in `snipOutcome` — keep the two in step.
 *
 * Scores, per file and in total: character accuracy (1 − CER over letters and
 * digits, NFKC), language accuracy (the snip's language against the truth), and
 * wrong-language cards: a card that would be made in a language the text is not
 * in, or a Chinese card with a kana reading / a Japanese card with a pinyin one.
 * It must be 0; `--strict` exits 1 otherwise.
 */
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');

const REPO = path.resolve(__dirname, '..', '..');

function parseArgs(argv) {
  const out = { active: 'ja', quiet: false, strict: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--images') out.images = argv[++i];
    else if (a === '--models') out.models = argv[++i];
    else if (a === '--dict') out.dict = argv[++i];
    else if (a === '--cedict') out.cedict = argv[++i];
    else if (a === '--active') out.active = argv[++i];
    else if (a === '--only') out.only = argv[++i];
    else if (a === '--json') out.json = argv[++i];
    else if (a === '--quiet') out.quiet = true;
    else if (a === '--strict') out.strict = true;
    // Another checkout's sources (e.g. HEAD in a worktree), to compare before/after.
    else if (a === '--src') out.src = argv[++i];
  }
  if (!out.images || !out.models) {
    console.error('usage: node tools/ocr-eval/snip-eval.cjs --images <dir> --models <modelsDir> [--dict dict.db] [--active ja] [--json out.json]');
    process.exit(2);
  }
  return out;
}

// ----- stubs -----------------------------------------------------------------

/** Electron, as far as the OCR path uses it: a canvas-backed `nativeImage`. */
const ELECTRON_STUB = `
const { createCanvas, ImageData } = require('@napi-rs/canvas');
const zlib = require('node:zlib');
const decoded = new Map();
/**
 * A synchronous PNG decoder (8-bit, non-interlaced: what snips and the canvas
 * write): nativeImage decodes synchronously, and the canvas's Image does not.
 */
function decodePngSync(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');
  let pos = 8, width = 0, height = 0, depth = 0, type = 0, interlace = 0, palette = null, trns = null;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const kind = buf.toString('latin1', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (kind === 'IHDR') { width = data.readUInt32BE(0); height = data.readUInt32BE(4); depth = data[8]; type = data[9]; interlace = data[12]; }
    else if (kind === 'PLTE') palette = data;
    else if (kind === 'tRNS') trns = data;
    else if (kind === 'IDAT') idat.push(data);
    else if (kind === 'IEND') break;
    pos += 12 + len;
  }
  if (depth !== 8 || interlace) throw new Error('unsupported PNG (' + depth + '-bit, interlace ' + interlace + ')');
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[type];
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const px = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)];
    const src = y * (stride + 1) + 1;
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? px[y * stride + x - channels] : 0;
      const b = y > 0 ? px[(y - 1) * stride + x] : 0;
      const c = x >= channels && y > 0 ? px[(y - 1) * stride + x - channels] : 0;
      let v = raw[src + x];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const p = a + b - c; const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      px[y * stride + x] = v & 255;
    }
  }
  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const s = i * channels, d = i * 4;
    if (type === 6) { px.copy(rgba, d, s, s + 4); continue; }
    if (type === 2) { rgba[d] = px[s]; rgba[d + 1] = px[s + 1]; rgba[d + 2] = px[s + 2]; rgba[d + 3] = 255; continue; }
    if (type === 3) { const k = px[s]; rgba[d] = palette[k * 3]; rgba[d + 1] = palette[k * 3 + 1]; rgba[d + 2] = palette[k * 3 + 2]; rgba[d + 3] = trns && k < trns.length ? trns[k] : 255; continue; }
    rgba[d] = rgba[d + 1] = rgba[d + 2] = px[s];
    rgba[d + 3] = type === 4 ? px[s + 1] : 255;
  }
  return { rgba, width, height };
}
class EvalImage {
  constructor(rgba, width, height) { this.rgba = rgba; this.width = width; this.height = height; }
  static fromEncoded(buf) {
    const { rgba, width, height } = decodePngSync(buf);
    return new EvalImage(rgba, width, height);
  }
  isEmpty() { return !this.width || !this.height; }
  getSize() { return { width: this.width, height: this.height }; }
  toBitmap() {
    const out = Buffer.alloc(this.rgba.length);
    for (let i = 0; i < this.rgba.length; i += 4) {
      out[i] = this.rgba[i + 2]; out[i + 1] = this.rgba[i + 1]; out[i + 2] = this.rgba[i]; out[i + 3] = this.rgba[i + 3];
    }
    return out;
  }
  canvas() {
    const c = createCanvas(this.width, this.height);
    c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(this.rgba.buffer, this.rgba.byteOffset, this.rgba.byteLength), this.width, this.height), 0, 0);
    return c;
  }
  crop({ x, y, width, height }) {
    const w = Math.max(1, Math.min(width, this.width - x));
    const h = Math.max(1, Math.min(height, this.height - y));
    const out = Buffer.alloc(w * h * 4);
    for (let row = 0; row < h; row++) this.rgba.copy(out, row * w * 4, ((row + y) * this.width + x) * 4, ((row + y) * this.width + x + w) * 4);
    return new EvalImage(out, w, h);
  }
  resize({ width, height }) {
    const c = createCanvas(width, height);
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(this.canvas(), 0, 0, width, height);
    const d = ctx.getImageData(0, 0, width, height).data;
    return new EvalImage(Buffer.from(d.buffer, d.byteOffset, d.byteLength), width, height);
  }
  toPNG() { return this.canvas().toBuffer('image/png'); }
  toDataURL() {
    const url = 'data:image/png;base64,' + this.toPNG().toString('base64');
    // The router hands the same picture straight back to the engine: skip the decode.
    decoded.set(url, this);
    if (decoded.size > 64) decoded.delete(decoded.keys().next().value);
    return url;
  }
}
const nativeImage = {
  createFromDataURL(url) {
    const hit = decoded.get(url);
    if (hit) return hit;
    return EvalImage.fromEncoded(Buffer.from(String(url).replace(/^data:[^,]*,/, ''), 'base64'));
  },
  createFromBuffer(buf) { return EvalImage.fromEncoded(buf); },
  createFromPath(file) { return EvalImage.fromEncoded(require('node:fs').readFileSync(file)); },
};
module.exports = {
  nativeImage,
  EvalImage,
  app: { getPath: () => require('node:os').tmpdir(), isPackaged: false, getAppPath: () => ${JSON.stringify(REPO)} },
  BrowserWindow: { getAllWindows: () => [] },
  ipcMain: { handle() {}, on() {} },
};`;

/** Installed models from <modelsDir>, by the asset registry's install dirs. */
function downloadsStub(modelsDir) {
  return `
const path = require('node:path');
const fs = require('node:fs');
const { ASSET_CATALOG } = require(${JSON.stringify(path.join(REPO, 'src', 'shared', 'assetRegistry'))});
const DIR = ${JSON.stringify(path.resolve(modelsDir))};
function target(id) {
  const spec = ASSET_CATALOG.find((a) => a.id === id);
  if (!spec) return null;
  const dir = path.join(DIR, spec.installDir);
  return spec.file ? path.join(dir, spec.file) : dir;
}
exports.isInstalled = (id) => { const t = target(id); return !!t && fs.existsSync(t); };
exports.assetPath = (id) => (exports.isInstalled(id) ? target(id) : null);
exports.registerAssetUnloadHandler = () => () => {};
exports.onAssetInstalled = () => () => {};`;
}

/** Everything else a module imports from src/main or src/renderer: present, but unusable. */
function throwingStub(name) {
  return `module.exports = new Proxy({}, { get: (_t, key) => key === '__esModule' ? false : () => { throw new Error('snip-eval stub: ${name}.' + String(key)); } });`;
}

/** kuromoji's IPADIC from public/kuromoji/dict, read from disk (the app fetches it). */
const TOKENIZER_LOADER_STUB = `
const fs = require('node:fs');
const zlib = require('node:zlib');
const DictionaryLoader = require('@sglkc/kuromoji/src/loader/DictionaryLoader');
const KuromojiTokenizer = require('@sglkc/kuromoji/src/Tokenizer');
function FileLoader(dicPath) { DictionaryLoader.apply(this, [dicPath]); }
FileLoader.prototype = Object.create(DictionaryLoader.prototype);
FileLoader.prototype.loadArrayBuffer = function (url, callback) {
  fs.readFile(url.replace(/\\.dat\\.gz$/, '.dat.bin'), (err, raw) => {
    if (err) return callback(err, null);
    const data = raw[0] === 0x1f && raw[1] === 0x8b ? zlib.gunzipSync(raw) : raw;
    callback(null, data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));
  });
};
exports.buildKuromojiTokenizer = () => new Promise((resolve, reject) => {
  new FileLoader(${JSON.stringify(path.join(REPO, 'public', 'kuromoji', 'dict') + path.sep)}).load((err, dic) => (err || !dic ? reject(err || new Error('no dictionary')) : resolve(new KuromojiTokenizer(dic))));
});`;

const RENDERER_STUBS = {
  i18n: `exports.t = (key) => key; exports.getUiLang = () => 'en';`,
  notificationStore: `exports.isDnd = () => false; exports.notify = () => {};`,
  sectionSurface: `exports.SECTION_OPEN_EVENT = 'gum:section-open';`,
  tokenizerLoader: TOKENIZER_LOADER_STUB,
};

/** The main-process dictionary, answered by the eval's own database handle. */
const DICTIONARY_HOOK = `module.exports = globalThis.__gumSnipEvalDictionary;`;

/** src/main modules bundled as shipped. */
const REAL_MAIN = new Set(['ocrRouter', 'paddleOcr', 'mangaOcr', 'mangaScanQueue']);

const ENTRY = `
export * as router from './ocrRouter';
export * as snipShared from '../shared/snipToCards';
export { detectStudyLangOfText, detectStudyLangOfReads } from '../shared/textLangDetect';
export { dictionaryDecode, wordCoverage } from '../shared/ocrDictionaryDecode';
export { normalizeStudyLang } from '../shared/studyLang';
export { installedPaddleLangs, isInstalledPaddleDetector } from './paddleOcr';
export { mangaOcrAvailable } from './mangaOcr';
export { __snipToCardsRendererTestables as rendererSnip } from '../renderer/snipToCards';
export { lookup as dictLookup } from './dictionary/dictService';
export { lookupResultToPerLanguageDictResult } from './dictionary/lexiconAdapter';
export { lookupChineseTerm, CedictNotInstalledError } from './dictionary/chineseLookup';
export { normalizeLexiconText } from '../shared/lexiconWorkbench';
export { clampLookupLimit } from '../shared/dictionaryLookup';
export { textMatchesLang } from '../shared/langs';
export { EvalImage } from 'electron';
`;

async function loadPipeline(modelsDir, srcRoot = REPO) {
  const esbuild = require(path.join(REPO, 'node_modules', 'esbuild'));
  const src = path.resolve(srcRoot);
  const mainDir = path.join(src, 'src', 'main');
  const rendererDir = path.join(src, 'src', 'renderer');
  const result = await esbuild.build({
    stdin: { contents: ENTRY, resolveDir: mainDir, loader: 'ts', sourcefile: 'snip-eval-entry.ts' },
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node20',
    write: false,
    external: ['onnxruntime-node', '@napi-rs/canvas', '@sglkc/kuromoji', '@sglkc/kuromoji/*', 'node:sqlite'],
    logLevel: 'error',
    plugins: [
      {
        name: 'gum-snip-eval-stubs',
        setup(build) {
          build.onResolve({ filter: /^electron$/ }, () => ({ path: 'electron', namespace: 'stub' }));
          build.onResolve({ filter: /^\.\/dictionary(\/service)?$/ }, (args) => (
            path.resolve(args.resolveDir) === mainDir ? { path: 'dictionary-hook', namespace: 'stub' } : undefined
          ));
          build.onResolve({ filter: /^\.\/[A-Za-z]+$/ }, (args) => {
            const name = args.path.slice(2);
            const dir = path.resolve(args.resolveDir);
            if (dir === mainDir) {
              if (REAL_MAIN.has(name)) return undefined;
              return { path: `main:${name}`, namespace: 'stub' };
            }
            if (dir === rendererDir) {
              if (name === 'snipToCards' || name === 'tokenizer') return undefined;
              return { path: `renderer:${name}`, namespace: 'stub' };
            }
            return undefined;
          });
          build.onLoad({ filter: /.*/, namespace: 'stub' }, (args) => {
            const [where, name] = args.path.includes(':') ? args.path.split(':') : ['', args.path];
            let contents;
            if (args.path === 'electron') contents = ELECTRON_STUB;
            else if (args.path === 'dictionary-hook') contents = DICTIONARY_HOOK;
            else if (where === 'main' && name === 'downloads') contents = downloadsStub(modelsDir);
            else if (where === 'main' && name === 'studyLanguage') contents = `exports.getMainStudyLang = () => globalThis.__gumSnipEvalActive || 'ja'; exports.getMainChineseScript = () => 'simplified';`;
            else if (where === 'renderer' && RENDERER_STUBS[name]) contents = RENDERER_STUBS[name];
            else contents = throwingStub(args.path);
            return { contents, loader: 'js', resolveDir: REPO };
          });
        },
      },
    ],
  });
  const code = result.outputFiles[0].text;
  // Compiled as if it sat next to the sources, so onnxruntime-node, @napi-rs/canvas
  // and kuromoji resolve from the repo's node_modules. Nothing is written into the repo.
  const filename = path.join(REPO, 'src', 'main', '__snipEval.cjs');
  const mod = new Module(filename, module);
  mod.filename = filename;
  mod.paths = Module._nodeModulePaths(path.dirname(filename));
  mod._compile(code, filename);
  return mod.exports;
}

// ----- the dictionary (node:sqlite under the app's own lookup) ------------------

/** better-sqlite3's surface (`main/dictionary/db.ts` SqliteDb) over node:sqlite, read-only use. */
function openDictionary(file) {
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(path.resolve(file), { readOnly: true });
  const bind = (params) => params.map((p) => (typeof p === 'boolean' ? (p ? 1 : 0) : p));
  return {
    open: true,
    name: file,
    exec: (sql) => db.exec(sql),
    prepare(sql) {
      const st = db.prepare(sql);
      return {
        run: (...p) => st.run(...bind(p)),
        get: (...p) => st.get(...bind(p)),
        all: (...p) => st.all(...bind(p)),
        iterate: (...p) => st.iterate(...bind(p)),
      };
    },
    pragma(source, opts = {}) {
      const rows = db.prepare(`PRAGMA ${source}`).all();
      return opts.simple ? (rows[0] ? Object.values(rows[0])[0] : undefined) : rows;
    },
    transaction: (fn) => (...a) => fn(...a),
    close: () => db.close(),
  };
}

/** `main/dictionary.ts` lookupTerm and `service.ts` lookupChineseInDictionary, over `db`. */
function dictionaryHook(p, db, cedictFile) {
  const chineseDeps = {
    db: () => db,
    loadCedictText: async () => {
      if (cedictFile && fs.existsSync(cedictFile)) return fs.readFileSync(cedictFile, 'utf8');
      throw new p.CedictNotInstalledError();
    },
    script: () => 'simplified',
  };
  const lookupChineseInDictionary = (query, limit) => p.lookupChineseTerm(query, chineseDeps, limit);
  const lookupTerm = async (query, limit, lang) => {
    const q = p.normalizeLexiconText(query ?? '');
    if (!q) return { query: q, entries: [] };
    const pageSize = p.clampLookupLimit(limit);
    if (!db) return { query: q, entries: [] };
    if (lang === 'zh') return lookupChineseInDictionary(q, pageSize);
    if (lang === 'ru') {
      const query2 = { text: q, limit: pageSize, sourceLangs: ['ru'], headwordsOnly: p.textMatchesLang('ru', q) };
      return p.lookupResultToPerLanguageDictResult(p.dictLookup(db, query2));
    }
    // The unified any-to-any read, as `lookupTerm` does for Japanese (the legacy
    // Yomitan/Jisho legs only answer while a store waits for its import).
    return p.lookupResultToPerLanguageDictResult(p.dictLookup(db, { text: q, limit: pageSize }));
  };
  return { lookupTerm, lookupChineseInDictionary };
}

// ----- metrics -----------------------------------------------------------------

function normText(s) {
  return String(s ?? '').normalize('NFKC').replace(/[^\p{L}\p{N}]/gu, '');
}

function levenshtein(a, b) {
  const A = [...a];
  const B = [...b];
  let prev = Array.from({ length: B.length + 1 }, (_, i) => i);
  for (let i = 1; i <= A.length; i++) {
    const cur = [i];
    for (let j = 1; j <= B.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (A[i - 1] === B[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[B.length];
}

const KANA = /[\p{Script=Hiragana}\p{Script=Katakana}]/u;
const PINYIN = /[a-zāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜü]/iu;

/** Why a card would be in the wrong language, or null. */
function wrongCard(card, truthLang) {
  if (truthLang && card.lang !== truthLang) return `card in ${card.lang}, text is ${truthLang}`;
  if (card.lang === 'zh' && card.reading && KANA.test(card.reading)) return 'kana reading on a Chinese card';
  if (card.lang === 'ja' && card.reading && PINYIN.test(card.reading) && !KANA.test(card.reading)) return 'pinyin reading on a Japanese card';
  return null;
}

// ----- the snip, as main/snipToCards.ts readSnip + renderer processSnip run it ----------

/**
 * Mirrors `readSnip` (main) and `processSnip` (renderer) for an accurate reader:
 * the router, then the language, the text check, the words and their readings.
 */
async function snipOutcome(p, image, active) {
  const readers = { det: p.isInstalledPaddleDetector(), paddle: p.installedPaddleLangs(), manga: p.mangaOcrAvailable(), tess: [] };
  const langs = p.snipShared.snipCandidateLangs(active, readers);
  const out = { readers, langs };
  if (!langs.some((lang) => p.snipShared.snipAccurateReader(lang, readers))) {
    return { ...out, none: 'no accurate reader installed: the bundled Tesseract would read it (not evaluated)' };
  }
  const t0 = Date.now();
  const read = await p.router.recognizeWithRouter(p.router.routerImageFromNative(image), { langs, purpose: 'snip' });
  out.ms = Date.now() - t0;
  out.read = read;
  out.evidence = p.detectStudyLangOfText(read.text, active, langs);
  if (read.missing && read.text) {
    return { ...out, lang: p.normalizeStudyLang(read.missing.lang, active), status: 'error', error: 'models-missing', none: `looks like ${read.missing.lang}, which no installed reader reads: offers ${read.missing.assetIds.join(', ')}` };
  }
  if (!(read.ok && read.text.trim())) {
    return { ...out, lang: active, none: `router: ${read.error ?? 'nothing read'} → the bundled Tesseract would read it (not evaluated)` };
  }
  const lang = p.normalizeStudyLang(read.lang, active);
  const problem = p.snipShared.snipTextProblem(read.text, lang, read.confidence);
  if (problem) return { ...out, lang, status: 'error', error: problem, none: `no cards: ${problem}` };
  const text = read.text.trim();
  const tokens = await p.rendererSnip.tokensOf(text, lang);
  // A fresh learner: nothing known, nothing in the deck.
  const words = p.snipShared.classifySnipTokens(tokens, lang, { isKnown: () => false, inDeck: () => false }, 12);
  const enriched = [];
  for (const word of words) enriched.push(word.status === 'candidate' ? await p.rendererSnip.enrichWord(word, lang) : word);
  const review = p.snipShared.snipReadCertainty(read.confidence) === 'unsure';
  const cards = enriched
    .filter((w) => w.status === 'candidate')
    .map((w) => ({ word: w.lemma || w.surface, reading: w.reading ?? '', lang, ...(w.meaning ? { meaning: w.meaning.slice(0, 40) } : {}) }));
  return { ...out, lang, status: 'done', review, words: enriched, cards, ...(cards.length ? {} : { none: 'no unknown content words' }) };
}

// ----- run ---------------------------------------------------------------------

function loadTruth(dir) {
  const file = path.join(dir, 'truth.json');
  if (!fs.existsSync(file)) return {};
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  return raw.files ?? raw;
}

async function main() {
  const args = parseArgs(process.argv);
  globalThis.__gumSnipEvalActive = args.active;
  const truth = loadTruth(args.images);
  const files = fs.readdirSync(args.images)
    .filter((f) => /\.png$/i.test(f) && (!args.only || f.includes(args.only)))
    .sort();
  const t0 = Date.now();
  const p = await loadPipeline(args.models, args.src);
  const db = args.dict ? openDictionary(args.dict) : null;
  globalThis.__gumSnipEvalDictionary = dictionaryHook(p, db, args.cedict);
  globalThis.window = {
    api: {
      lookupTerm: (q, limit, lang) => globalThis.__gumSnipEvalDictionary.lookupTerm(q, limit, lang),
      lookupChinese: (q, limit) => globalThis.__gumSnipEvalDictionary.lookupChineseInDictionary(q, limit),
    },
    setTimeout,
    clearTimeout,
  };
  if (!args.quiet) console.log(`pipeline bundled in ${Date.now() - t0} ms; dictionary: ${db ? args.dict : 'none'}; active language ${args.active}`);

  const rows = [];
  for (const file of files) {
    const want = truth[file] ?? null;
    const image = p.EvalImage.fromEncoded(fs.readFileSync(path.join(args.images, file)));
    let o;
    try {
      o = await snipOutcome(p, image, args.active);
    } catch (err) {
      o = { none: `crashed: ${err && err.stack ? err.stack : err}`, crashed: true };
    }
    const read = o.read;
    const text = read?.text ?? '';
    const scored = Boolean(want && want.lang);
    const truthText = normText(want?.text ?? '');
    const edits = scored && truthText ? Math.min(levenshtein(normText(text), truthText), [...truthText].length) : 0;
    const cards = o.cards ?? [];
    const wrong = cards.map((c) => ({ card: c, why: wrongCard(c, scored ? want.lang : null) })).filter((x) => x.why);
    const row = {
      file,
      size: `${image.width}x${image.height}`,
      truth: want,
      text,
      engine: read?.engine,
      engines: read?.engines,
      lineEngines: (read?.lines ?? []).map((l) => `${l.engine}${l.consulted?.length > 1 ? `(+${l.consulted.filter((e) => e !== l.engine).join(',')})` : ''}`),
      confidence: read?.confidence,
      routerLang: read?.lang,
      lang: o.lang,
      evidence: o.evidence?.evidence,
      missing: read?.missing,
      corrected: (read?.lines ?? []).reduce((n, l) => n + (l.corrected ?? 0), 0),
      unsure: (read?.unsure ?? []).map((u) => `${u.ch}@${u.at}(${u.p.toFixed(2)})→${u.alts.join('|')}`),
      status: o.status,
      error: o.error,
      review: o.review,
      cards,
      none: o.none,
      ms: o.ms,
      scored,
      chars: scored ? [...truthText].length : 0,
      edits,
      langOk: scored ? o.lang === want.lang : null,
      wrongCards: wrong.map((w) => `${w.card.word}[${w.card.reading}]: ${w.why}`),
    };
    rows.push(row);
    if (!args.quiet) printRow(row);
  }

  const scoredRows = rows.filter((r) => r.scored);
  const chars = scoredRows.reduce((s, r) => s + r.chars, 0);
  const edits = scoredRows.reduce((s, r) => s + r.edits, 0);
  const summary = {
    files: rows.length,
    scored: scoredRows.length,
    charAccuracy: +(1 - edits / Math.max(1, chars)).toFixed(4),
    langAccuracy: +(scoredRows.filter((r) => r.langOk).length / Math.max(1, scoredRows.length)).toFixed(4),
    langCorrect: `${scoredRows.filter((r) => r.langOk).length}/${scoredRows.length}`,
    exact: scoredRows.filter((r) => r.edits === 0).length,
    wrongLanguageCards: rows.reduce((s, r) => s + r.wrongCards.length, 0),
    cards: rows.reduce((s, r) => s + r.cards.length, 0),
    noCards: rows.filter((r) => !r.cards.length).length,
    review: rows.filter((r) => r.review).length,
    crashed: rows.filter((r) => r.none && /^crashed/.test(r.none)).length,
    msAvg: Math.round(rows.reduce((s, r) => s + (r.ms ?? 0), 0) / Math.max(1, rows.length)),
    byLang: {},
  };
  for (const r of scoredRows) {
    const k = r.truth.lang;
    const b = (summary.byLang[k] ??= { files: 0, chars: 0, edits: 0, langOk: 0, wrongCards: 0 });
    b.files += 1;
    b.chars += r.chars;
    b.edits += r.edits;
    b.langOk += r.langOk ? 1 : 0;
    b.wrongCards += r.wrongCards.length;
  }
  for (const b of Object.values(summary.byLang)) b.charAccuracy = +(1 - b.edits / Math.max(1, b.chars)).toFixed(4);
  console.log(`\nsummary ${JSON.stringify(summary, null, 1)}`);
  if (args.json) fs.writeFileSync(args.json, JSON.stringify({ summary, rows }, null, 1));
  if (args.strict && summary.wrongLanguageCards > 0) process.exitCode = 1;
}

function printRow(r) {
  const truth = r.truth?.lang ? `[${r.truth.lang}] ${r.truth.text ?? ''}` : '(not scored)';
  console.log(`\n== ${r.file} (${r.size})  truth: ${truth}`);
  console.log(`   read: ${JSON.stringify(r.text)}`);
  console.log(`   engine ${r.engine ?? '-'} (${(r.engines ?? []).join('+') || '-'}; lines ${r.lineEngines.join(' ') || '-'}), confidence ${r.confidence !== undefined ? r.confidence.toFixed(3) : '-'}, ${r.ms ?? '-'} ms`);
  console.log(`   language ${r.lang ?? '-'} (router ${r.routerLang ?? '-'}, evidence ${r.evidence ?? '-'}${r.missing ? `, missing ${r.missing.lang}: ${r.missing.assetIds.join(',')}` : ''})${r.langOk === false ? '  <-- WRONG LANGUAGE' : ''}`);
  if (r.corrected) console.log(`   dictionary-corrected characters: ${r.corrected}`);
  if (r.unsure.length) console.log(`   unsure: ${r.unsure.join('  ')}`);
  if (r.cards.length) console.log(`   cards${r.review ? ' (listed for review: unsure read)' : ''}: ${r.cards.map((c) => `${c.word}${c.reading ? `[${c.reading}]` : ''}`).join('  ')} (${r.cards[0].lang})`);
  if (r.none) console.log(`   ${r.cards.length ? 'note' : 'no cards'}: ${r.none}`);
  if (r.scored) console.log(`   char accuracy ${((1 - r.edits / Math.max(1, r.chars)) * 100).toFixed(1)}% (${r.edits} edits / ${r.chars})`);
  for (const w of r.wrongCards) console.log(`   WRONG-LANGUAGE CARD: ${w}`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { loadPipeline, openDictionary, dictionaryHook, snipOutcome, normText, levenshtein, wrongCard };
