// Builds catalog-repo/novels.json — the remote, difficulty-levelled novels
// catalogue the app merges into its bundled list. Run manually (NOT app code):
//
//   node tools/build-novels-catalog.mjs                 # embedded seed only
//   node tools/build-novels-catalog.mjs --in list.csv   # + a jpdb-style CSV
//
// CSV columns (header row required, extra columns ignored):
//   titleJp, author, type, difficulty, genres, year, jlpt, freeOnAozora, reading, titleEn, authorEn, synopsis
//   - type:       Classic | Novel | Light Novel   (default: Novel)
//   - difficulty: Beginner | Easy | Moderate | Hard | Very Hard, OR a 1-10 number
//                 (jpdb-style) which is bucketed via DIFFICULTY_FROM_SCORE below.
//   - genres:     semicolon-separated, matched against the app's GENRES list.
//   - freeOnAozora: true/1/yes -> free Aozora links, else store links.
//
// The link builders below mirror src/renderer/data/novels.ts so output entries
// are plain, self-contained data (search URLs never rot into dead links).

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';

// ---- link builders (copied from novels.ts) --------------------------------
function free(title, author) {
  const q = `${title} ${author} site:aozora.gr.jp`;
  return { label: 'Read free · Aozora Bunko', url: `https://duckduckgo.com/?q=${encodeURIComponent(q)}`, kind: 'free' };
}
function store(title) {
  return { label: 'Find the book · BookWalker', url: `https://global.bookwalker.jp/search/?word=${encodeURIComponent(title)}`, kind: 'store' };
}
function info(title, author) {
  return { label: 'Details · Wikipedia', url: `https://ja.wikipedia.org/w/index.php?search=${encodeURIComponent(`${title} ${author}`)}`, kind: 'info' };
}
function links(titleJp, author, freeOnAozora) {
  return freeOnAozora ? [free(titleJp, author), info(titleJp, author)] : [store(titleJp), info(titleJp, author)];
}

const GENRES = new Set([
  'Literary', 'Coming-of-age', 'Mystery', 'Thriller', 'Sci-Fi', 'Fantasy', 'Isekai',
  'Romance', 'Slice of Life', 'Comedy', 'Horror', 'Historical', "Children's", 'Action',
]);
const DIFFICULTIES = new Set(['Beginner', 'Easy', 'Moderate', 'Hard', 'Very Hard']);
const TYPES = new Set(['Classic', 'Novel', 'Light Novel']);

// Map a jpdb-ish 1-10 difficulty score onto the app's five-step scale.
function difficultyFromScore(score) {
  if (score <= 2) return 'Beginner';
  if (score <= 4) return 'Easy';
  if (score <= 6) return 'Moderate';
  if (score <= 8) return 'Hard';
  return 'Very Hard';
}

function buildNovel(spec) {
  const titleJp = String(spec.titleJp || '').trim();
  const author = String(spec.author || '').trim();
  if (!titleJp || !author) return null;

  let difficulty = spec.difficulty;
  if (typeof difficulty === 'number') difficulty = difficultyFromScore(difficulty);
  if (!DIFFICULTIES.has(difficulty)) difficulty = 'Moderate';

  const type = TYPES.has(spec.type) ? spec.type : 'Novel';
  const genres = (Array.isArray(spec.genres) ? spec.genres : [])
    .map((g) => String(g).trim())
    .filter((g) => GENRES.has(g));
  const freeOnAozora = Boolean(spec.freeOnAozora);

  return {
    id: titleJp,
    titleJp,
    reading: spec.reading || undefined,
    titleEn: spec.titleEn || undefined,
    author,
    authorEn: spec.authorEn || undefined,
    type,
    genres,
    year: typeof spec.year === 'number' ? spec.year : undefined,
    difficulty,
    jlpt: ['N5', 'N4', 'N3', 'N2', 'N1'].includes(spec.jlpt) ? spec.jlpt : undefined,
    freeOnAozora,
    synopsis: spec.synopsis || '',
    links: links(titleJp, author, freeOnAozora),
  };
}

// A hand-checked seed of well-known titles so the remote catalogue is useful even
// without a CSV. Overlap with the bundled list is fine — the app de-dupes by
// title+author (bundled entries win).
const SEED = [
  { titleJp: 'キノの旅', reading: 'キノのたび', titleEn: "Kino's Journey", author: '時雨沢恵一', authorEn: 'Sigsawa Keiichi', type: 'Light Novel', genres: ['Sci-Fi', 'Slice of Life'], year: 2000, difficulty: 'Moderate', jlpt: 'N3', freeOnAozora: false, synopsis: 'A traveller and a talking motorrad visit strange countries, each a self-contained parable. Episodic and approachable prose.' },
  { titleJp: 'ソードアート・オンライン', titleEn: 'Sword Art Online', author: '川原礫', authorEn: 'Kawahara Reki', type: 'Light Novel', genres: ['Sci-Fi', 'Action', 'Isekai'], year: 2009, difficulty: 'Moderate', jlpt: 'N3', freeOnAozora: false, synopsis: 'Players are trapped inside a death-game VRMMO. Hugely popular gateway light novel with lots of action vocabulary.' },
  { titleJp: '涼宮ハルヒの憂鬱', reading: 'すずみやハルヒのゆううつ', titleEn: 'The Melancholy of Haruhi Suzumiya', author: '谷川流', authorEn: 'Tanigawa Nagaru', type: 'Light Novel', genres: ['Sci-Fi', 'Comedy', 'Slice of Life'], year: 2003, difficulty: 'Moderate', jlpt: 'N2', freeOnAozora: false, synopsis: 'A cynical narrator is dragged into a club run by a girl who is, unknowingly, almost a god. Witty first-person voice.' },
  { titleJp: 'コンビニ人間', reading: 'コンビニにんげん', titleEn: 'Convenience Store Woman', author: '村田沙耶香', authorEn: 'Murata Sayaka', type: 'Novel', genres: ['Literary', 'Slice of Life'], year: 2016, difficulty: 'Moderate', jlpt: 'N2', freeOnAozora: false, synopsis: 'A woman who has never fit society finds identity in her convenience-store job. Short, modern, and widely translated.' },
  { titleJp: '君の名は。', reading: 'きみのなは', titleEn: 'Your Name.', author: '新海誠', authorEn: 'Shinkai Makoto', type: 'Novel', genres: ['Romance', 'Fantasy'], year: 2016, difficulty: 'Easy', jlpt: 'N3', freeOnAozora: false, synopsis: 'Two teenagers mysteriously swap bodies across time and distance. The film novelization — clear, contemporary prose.' },
  { titleJp: 'ノルウェイの森', reading: 'ノルウェイのもり', titleEn: 'Norwegian Wood', author: '村上春樹', authorEn: 'Murakami Haruki', type: 'Novel', genres: ['Literary', 'Romance'], year: 1987, difficulty: 'Hard', jlpt: 'N2', freeOnAozora: false, synopsis: 'A wistful coming-of-age story of love and loss in 1960s Tokyo. Murakami’s most famous realist novel.' },
  { titleJp: 'キッチン', titleEn: 'Kitchen', author: '吉本ばなな', authorEn: 'Yoshimoto Banana', type: 'Novel', genres: ['Literary', 'Coming-of-age'], year: 1988, difficulty: 'Moderate', jlpt: 'N3', freeOnAozora: false, synopsis: 'A young woman copes with grief, comforted by kitchens and an unconventional family. Gentle, warm, modern prose.' },
  { titleJp: '容疑者Xの献身', reading: 'ようぎしゃエックスのけんしん', titleEn: 'The Devotion of Suspect X', author: '東野圭吾', authorEn: 'Higashino Keigo', type: 'Novel', genres: ['Mystery', 'Thriller'], year: 2005, difficulty: 'Moderate', jlpt: 'N2', freeOnAozora: false, synopsis: 'A mathematician constructs the perfect alibi for his neighbour. A tightly plotted, very popular mystery.' },
  { titleJp: '魔女の宅急便', reading: 'まじょのたっきゅうびん', titleEn: "Kiki's Delivery Service", author: '角野栄子', authorEn: 'Kadono Eiko', type: 'Novel', genres: ["Children's", 'Fantasy', 'Coming-of-age'], year: 1985, difficulty: 'Easy', jlpt: 'N4', freeOnAozora: false, synopsis: 'A young witch sets out to live independently in a seaside town. A gentle children’s novel, great for early readers.' },
  { titleJp: '銀河鉄道の夜', reading: 'ぎんがてつどうのよる', titleEn: 'Night on the Galactic Railroad', author: '宮沢賢治', authorEn: 'Miyazawa Kenji', type: 'Classic', genres: ['Literary', 'Fantasy'], year: 1934, difficulty: 'Hard', jlpt: 'N2', freeOnAozora: true, synopsis: 'A lonely boy rides a train through the stars in a dreamlike meditation on life and death. Free on Aozora.' },
  { titleJp: '注文の多い料理店', reading: 'ちゅうもんのおおいりょうりてん', titleEn: 'The Restaurant of Many Orders', author: '宮沢賢治', authorEn: 'Miyazawa Kenji', type: 'Classic', genres: ['Literary', 'Comedy', "Children's"], year: 1924, difficulty: 'Moderate', jlpt: 'N3', freeOnAozora: true, synopsis: 'Two hunters enter a very accommodating restaurant — a little too accommodating. Short, wry, and free on Aozora.' },
  { titleJp: '時をかける少女', reading: 'ときをかけるしょうじょ', titleEn: 'The Girl Who Leapt Through Time', author: '筒井康隆', authorEn: 'Tsutsui Yasutaka', type: 'Novel', genres: ['Sci-Fi', 'Romance', 'Coming-of-age'], year: 1967, difficulty: 'Moderate', jlpt: 'N3', freeOnAozora: false, synopsis: 'A schoolgirl gains the power to leap through time. A beloved, frequently adapted YA classic.' },
  { titleJp: '夜は短し歩けよ乙女', reading: 'よるはみじかしあるけよおとめ', titleEn: 'The Night Is Short, Walk on Girl', author: '森見登美彦', authorEn: 'Morimi Tomihiko', type: 'Novel', genres: ['Comedy', 'Romance', 'Fantasy'], year: 2006, difficulty: 'Hard', jlpt: 'N2', freeOnAozora: false, synopsis: 'A whimsical night in Kyoto told in playful, ornate prose. Charming but linguistically rich.' },
  { titleJp: 'ビブリア古書堂の事件手帖', reading: 'ビブリアこしょどうのじけんてちょう', titleEn: "Biblia Antiquarian Bookshop's Case Files", author: '三上延', authorEn: 'Mikami En', type: 'Light Novel', genres: ['Mystery', 'Slice of Life'], year: 2011, difficulty: 'Moderate', jlpt: 'N3', freeOnAozora: false, synopsis: 'A shy bookshop owner solves mysteries hidden in old books. Cozy, dialogue-driven, and popular with learners.' },
  { titleJp: 'バッテリー', titleEn: 'Battery', author: 'あさのあつこ', authorEn: 'Asano Atsuko', type: 'Novel', genres: ['Coming-of-age', 'Slice of Life'], year: 1996, difficulty: 'Easy', jlpt: 'N3', freeOnAozora: false, synopsis: 'A gifted young pitcher and his catcher navigate middle-school baseball. A bestselling, accessible YA series.' },
];

// ---- CSV parsing (minimal; handles quoted fields) --------------------------
function parseCsv(text) {
  const rows = [];
  let field = '';
  let row = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (field !== '' || row.length) { row.push(field); rows.push(row); row = []; field = ''; }
      if (c === '\r' && text[i + 1] === '\n') i++;
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function specsFromCsv(text) {
  const rows = parseCsv(text).filter((r) => r.some((c) => c.trim() !== ''));
  if (!rows.length) return [];
  const header = rows[0].map((h) => h.trim());
  return rows.slice(1).map((r) => {
    const o = {};
    header.forEach((h, i) => { o[h] = (r[i] ?? '').trim(); });
    const diffNum = Number(o.difficulty);
    return {
      titleJp: o.titleJp,
      reading: o.reading,
      titleEn: o.titleEn,
      author: o.author,
      authorEn: o.authorEn,
      type: o.type,
      genres: (o.genres || '').split(';').map((g) => g.trim()).filter(Boolean),
      year: o.year ? Number(o.year) : undefined,
      difficulty: o.difficulty && !Number.isNaN(diffNum) && /^\d+(\.\d+)?$/.test(o.difficulty) ? diffNum : o.difficulty,
      jlpt: o.jlpt,
      freeOnAozora: /^(true|1|yes)$/i.test(o.freeOnAozora || ''),
      synopsis: o.synopsis,
    };
  });
}

// ---- main ------------------------------------------------------------------
const args = process.argv.slice(2);
const inIdx = args.indexOf('--in');
const specs = [...SEED];
if (inIdx >= 0 && args[inIdx + 1]) {
  const file = args[inIdx + 1];
  if (!existsSync(file)) throw new Error(`CSV not found: ${file}`);
  specs.push(...specsFromCsv(readFileSync(file, 'utf-8')));
}

const seen = new Set();
const novels = [];
for (const spec of specs) {
  const nv = buildNovel(spec);
  if (!nv) continue;
  const key = `${nv.titleJp}|${nv.author}`.toLowerCase();
  if (seen.has(key)) continue;
  seen.add(key);
  novels.push(nv);
}

const catalog = {
  schemaVersion: 1,
  updatedAt: new Date().toISOString().slice(0, 10),
  novels,
};

mkdirSync('catalog-repo', { recursive: true });
writeFileSync('catalog-repo/novels.json', `${JSON.stringify(catalog, null, 2)}\n`, 'utf-8');
console.log(`Wrote catalog-repo/novels.json (${novels.length} novels)`);
