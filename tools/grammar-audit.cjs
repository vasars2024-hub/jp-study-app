/**
 * Grammar corpus audit — the evidence base for GrammarX corpus work.
 *
 * Corpus claims in this repo have historically been assertions ("HSK 1-10
 * supported") rather than measurements. This script measures. It is rerunnable
 * and emits a machine-readable report alongside the human summary, so a
 * before/after comparison across a corpus change is a diff, not a memory.
 *
 * `src/renderer/data/grammar/*` is TypeScript with no runtime deps but plenty of
 * cross-imports, so unlike tools/i18n-check.cjs (which type-strips a single
 * file) this bundles the entry point. esbuild is already a transitive Vite dep.
 *
 * Usage: node tools/grammar-audit.cjs [--json] [--out <path>] [--compare <path>]
 * Always exits 0 — this reports, it does not gate. Findings are the point.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');

const ENTRY = path.join(__dirname, '..', 'src', 'renderer', 'data', 'grammar', 'index.ts');
const FILTERS_ENTRY = path.join(
  __dirname,
  '..',
  'src',
  'renderer',
  'data',
  'grammar',
  'practiceFilters.ts',
);
const DEFAULT_OUT = path.join(__dirname, '..', 'grammar-audit.json');

const JLPT = ['N5', 'N4', 'N3', 'N2', 'N1'];
// HSK7-9 is one combined band upstream; this list used to split it into three,
// which reported two levels the standard does not publish as permanently empty.
const HSK = ['HSK1', 'HSK2', 'HSK3', 'HSK4', 'HSK5', 'HSK6', 'HSK7-9', 'HSK10'];

function loadCorpus(entry = ENTRY) {
  const { outputFiles } = esbuild.buildSync({
    entryPoints: [entry],
    bundle: true,
    write: false,
    format: 'cjs',
    platform: 'node',
    target: 'node18',
    logLevel: 'silent',
  });
  const code = outputFiles[0].text;
  const mod = { exports: {} };
  // eslint-disable-next-line no-new-func -- trusted local source, not user input
  new Function('module', 'exports', 'require', code)(mod, mod.exports, require);
  return mod.exports;
}

/** Collapse a pattern to its comparable core: strip tildes, spaces, punctuation. */
function normalizeTitle(title) {
  return String(title || '')
    .replace(/[〜~\s・.,()（）「」【】]/g, '')
    .toLowerCase();
}

function tally(list, keyFn) {
  const out = {};
  for (const item of list) {
    const k = keyFn(item);
    if (k === undefined || k === null) continue;
    out[k] = (out[k] || 0) + 1;
  }
  return out;
}

function sortedTally(obj) {
  return Object.fromEntries(Object.entries(obj).sort((a, b) => b[1] - a[1]));
}

function audit(corpus, filters) {
  const points = corpus.GRAMMAR;
  const ja = points.filter((p) => p.lang === 'ja');
  const zh = points.filter((p) => p.lang === 'zh');

  // ---- level distribution, measured not declared ----
  const byLevel = tally(points, (p) => p.level);
  const levels = {};
  for (const lv of [...JLPT, ...HSK]) levels[lv] = byLevel[lv] || 0;

  // ---- field completeness ----
  const missingField = {
    meaning: [],
    structure: [],
    explanation: [],
    examples: [],
    exampleTranslation: [],
    exampleReading: [],
    source: [],
  };
  for (const p of points) {
    if (!p.meaning || !String(p.meaning).trim()) missingField.meaning.push(p.id);
    if (!p.structure || !String(p.structure).trim()) missingField.structure.push(p.id);
    if (!p.explanation || !String(p.explanation).trim()) missingField.explanation.push(p.id);
    const ex = Array.isArray(p.examples) ? p.examples : [];
    if (ex.length === 0) missingField.examples.push(p.id);
    else {
      if (ex.some((e) => !e.en || !String(e.en).trim())) missingField.exampleTranslation.push(p.id);
      if (ex.some((e) => !e.reading || !String(e.reading).trim()))
        missingField.exampleReading.push(p.id);
    }
    // `source`/provenance does not exist on the model yet — every record is unsourced.
    if (!p.source) missingField.source.push(p.id);
  }

  // ---- duplicates ----
  const byId = new Map();
  const duplicateIds = [];
  for (const p of points) {
    if (byId.has(p.id)) duplicateIds.push(p.id);
    else byId.set(p.id, p);
  }

  const titleGroups = new Map();
  for (const p of points) {
    const key = `${p.lang}|${normalizeTitle(p.title)}`;
    if (!titleGroups.has(key)) titleGroups.set(key, []);
    titleGroups.get(key).push(p);
  }
  const nearDuplicates = [];
  const conflictingLevels = [];
  for (const [key, group] of titleGroups) {
    if (group.length < 2) continue;
    nearDuplicates.push({
      key,
      count: group.length,
      ids: group.map((p) => p.id),
      levels: [...new Set(group.map((p) => p.level))],
    });
    const distinctLevels = new Set(group.map((p) => p.level));
    if (distinctLevels.size > 1) {
      conflictingLevels.push({
        title: group[0].title,
        lang: group[0].lang,
        levels: [...distinctLevels],
        ids: group.map((p) => p.id),
      });
    }
  }

  /*
   * The counts above measure the RAW sources: every point before dedupe, keyed
   * by this script's own normalizeTitle(). That is a useful measure of how
   * inconsistently the sources write the same pattern, but it is not what a
   * user sees, and quoting it as "unresolved duplicates" overstates the
   * backlog — it was reading 220 while the shipped list had 26.
   *
   * So also measure the shipped pipeline: real grammarTitleKey(), applied to
   * the real dedupeGrammarByTitle() output. That number is the curation queue.
   */
  const survivingGroups = [];
  if (filters) {
    const deduped = filters.dedupeGrammarByTitle(points);
    const shippedGroups = new Map();
    for (const p of deduped) {
      // Compare under a fuzzier key than the pipeline's own, so this reports
      // what still LOOKS duplicated to a reader rather than certifying itself.
      const k = `${p.lang}|${normalizeTitle(p.title).replace(/[()（）/／]/g, '')}`;
      if (!shippedGroups.has(k)) shippedGroups.set(k, []);
      shippedGroups.get(k).push(p);
    }
    for (const [key, group] of shippedGroups) {
      if (group.length < 2) continue;
      const withExamples = group.filter((p) => p.examples?.length).length;
      survivingGroups.push({
        key,
        count: group.length,
        ids: group.map((p) => p.id),
        titles: group.map((p) => p.title),
        levels: [...new Set(group.map((p) => p.level))],
        // 0 = every copy is hollow; === count = a real editorial conflict.
        withExamples,
      });
    }
  }

  // ---- language / level coherence ----
  const langLevelMismatch = [];
  for (const p of points) {
    const levelIsHsk = HSK.includes(p.level);
    const levelIsJlpt = JLPT.includes(p.level);
    if (p.lang === 'ja' && levelIsHsk)
      langLevelMismatch.push({ id: p.id, lang: p.lang, level: p.level });
    if (p.lang === 'zh' && levelIsJlpt)
      langLevelMismatch.push({ id: p.id, lang: p.lang, level: p.level });
    if (!levelIsHsk && !levelIsJlpt)
      langLevelMismatch.push({ id: p.id, lang: p.lang, level: p.level, reason: 'unknown-level' });
  }

  // ---- taxonomy health ----
  const knownFunctionIds = new Set(corpus.GRAMMAR_FUNCTION_IDS || []);
  const byFunction = {};
  const unknownFunctionIds = new Set();
  let otherOnly = 0;
  let noFunctions = 0;
  for (const p of points) {
    const fns = Array.isArray(p.functions) ? p.functions : [];
    if (fns.length === 0) {
      noFunctions += 1;
      continue;
    }
    if (fns.length === 1 && fns[0] === 'other') otherOnly += 1;
    for (const f of fns) {
      byFunction[f] = (byFunction[f] || 0) + 1;
      if (knownFunctionIds.size && !knownFunctionIds.has(f)) unknownFunctionIds.add(f);
    }
  }
  const unusedFunctionIds = [...knownFunctionIds].filter((id) => !byFunction[id]);

  // ---- register ----
  const byRegister = tally(points, (p) => p.register);
  const registerByLang = {
    ja: tally(ja, (p) => p.register),
    zh: tally(zh, (p) => p.register),
  };

  // ---- canonical taxonomy coverage ----
  const byCategory = {};
  let uncategorized = 0;
  for (const p of points) {
    const cats = Array.isArray(p.categories) ? p.categories : [];
    if (cats.length === 0) uncategorized += 1;
    for (const c of cats) byCategory[c] = (byCategory[c] || 0) + 1;
  }
  const declaredCategories = corpus.CATEGORY_IDS || [];
  const emptyCategories = declaredCategories.filter((c) => !byCategory[c]);

  /*
   * Categories-per-point. Grammar function is not a partition — 〜ば〜ほど is
   * both proportion and condition — so a corpus where most tagged records carry
   * exactly one category is under-classified, not cleanly classified.
   *
   * Watch the ceiling here: the deleted gloss-regex tagger stopped at three
   * hits (`if (hits.length >= 3) break;`) and its output was frozen into the
   * Mazii files, so no imported record can exceed 3 no matter how many
   * functions it really serves. A max of 3 is evidence of that cap, not of the
   * language.
   */
  /*
   * Field presence is not field content.
   *
   * The first version of this audit reported meaning/structure/explanation as
   * "0% missing" — technically true, and badly misleading: in every Mazii
   * record `structure` is a verbatim copy of `title` and `explanation` is a
   * verbatim copy of `meaning`. The fields are populated with nothing. That is
   * the same failure mode as the `['other']` tag the rest of this work exists
   * to undo, so it gets measured rather than trusted.
   */
  const eq = (a, b) => String(a || '').trim() === String(b || '').trim() && String(a || '').trim();
  const hollow = {
    structureCopiesTitle: points.filter((p) => eq(p.structure, p.title)).length,
    explanationCopiesMeaning: points.filter((p) => eq(p.explanation, p.meaning)).length,
    noDistinctContent: points.filter(
      (p) => eq(p.structure, p.title) && eq(p.explanation, p.meaning),
    ).length,
  };

  const perPoint = {};
  for (const p of points) {
    const n = Array.isArray(p.categories) ? p.categories.length : 0;
    perPoint[n] = (perPoint[n] || 0) + 1;
  }
  const tagged = points.filter((p) => (p.categories || []).length > 0);
  const avgCategories = tagged.length
    ? tagged.reduce((s, p) => s + p.categories.length, 0) / tagged.length
    : 0;

  const legacyPerPoint = {};
  for (const p of points) {
    const n = Array.isArray(p.functions) ? p.functions.length : 0;
    legacyPerPoint[n] = (legacyPerPoint[n] || 0) + 1;
  }

  /*
   * Tag provenance. This is the number that explains the Business filter: how
   * many records' tags are gloss-regex output rather than authored or derived
   * from the pattern itself.
   */
  const tagProvenance = tally(points, (p) => p.provenance && p.provenance.tagSource);
  const verification = tally(points, (p) => p.provenance && p.provenance.verification);
  const bySourceModule = tally(points, (p) => p.provenance && p.provenance.source);

  /*
   * Records that would actually answer a register query under verifiedTagsOnly.
   *
   * This calls the app's own predicate rather than restating it. The inline
   * copy that used to live here would have kept reporting the old numbers
   * after `trusted()` changed — an audit that can silently disagree with the
   * code it audits is worse than no audit.
   */
  const trustworthyRegister = points.filter(
    (p) => p.provenance && corpus.hasTrustworthyRegister(p) && p.register !== 'neutral',
  );
  const answerableRegister = tally(trustworthyRegister, (p) => p.register);

  /*
   * Register coverage as three states, which is the distinction the tables
   * exist to make: known and marked, known and deliberately unmarked, and
   * never examined. Collapsing the last two into one 'neutral' count is what
   * made the old report read as though the corpus had been fully checked.
   */
  const registerKnown = points.filter((p) => p.provenance && corpus.hasTrustworthyRegister(p));
  const registerCoverage = {
    carriesRegister: trustworthyRegister.length,
    knownNeutral: registerKnown.length - trustworthyRegister.length,
    unchecked: points.length - registerKnown.length,
  };

  const heuristic = {
    functions: tagProvenance.heuristic || 0,
    register: tagProvenance.heuristic || 0,
    both: tagProvenance.heuristic || 0,
  };

  // ---- sparse levels ----
  const sparseLevels = Object.entries(levels)
    .filter(([, n]) => n > 0 && n < 30)
    .map(([lv, n]) => ({ level: lv, count: n }));
  const emptyLevels = Object.entries(levels)
    .filter(([, n]) => n === 0)
    .map(([lv]) => lv);

  return {
    generatedAt: new Date().toISOString(),
    totals: {
      all: points.length,
      ja: ja.length,
      zh: zh.length,
      uniqueIds: byId.size,
    },
    levels,
    levelsByLang: {
      ja: Object.fromEntries(JLPT.map((lv) => [lv, levels[lv]])),
      zh: Object.fromEntries(HSK.map((lv) => [lv, levels[lv]])),
    },
    completeness: Object.fromEntries(
      Object.entries(missingField).map(([k, ids]) => [
        k,
        { missing: ids.length, pct: +((ids.length / points.length) * 100).toFixed(1) },
      ]),
    ),
    taxonomy: {
      declaredIds: knownFunctionIds.size,
      usedIds: Object.keys(byFunction).length,
      unusedIds: unusedFunctionIds.length,
      unusedIdList: unusedFunctionIds,
      unknownIdList: [...unknownFunctionIds],
      otherOnly,
      noFunctions,
      distribution: sortedTally(byFunction),
    },
    hollowFields: hollow,
    categories: {
      declared: declaredCategories.length,
      used: Object.keys(byCategory).length,
      empty: emptyCategories.length,
      emptyList: emptyCategories,
      uncategorized,
      perPoint,
      avgCategoriesWhenTagged: Number(avgCategories.toFixed(2)),
      legacyTagsPerPoint: legacyPerPoint,
      distribution: sortedTally(byCategory),
    },
    register: {
      all: byRegister,
      byLang: registerByLang,
      /** Records a register filter can honestly return. */
      answerable: answerableRegister,
      /** known-and-marked vs known-and-unmarked vs never-examined. */
      coverage: registerCoverage,
    },
    provenance: {
      tagSource: sortedTally(tagProvenance),
      verification: sortedTally(verification),
      bySourceModule: sortedTally(bySourceModule),
    },
    tagProvenance: heuristic,
    duplicates: {
      duplicateIdCount: duplicateIds.length,
      duplicateIdList: duplicateIds.slice(0, 50),
      nearDuplicateGroups: nearDuplicates.length,
      nearDuplicateSample: nearDuplicates.slice(0, 25),
      conflictingLevelGroups: conflictingLevels.length,
      conflictingLevelSample: conflictingLevels.slice(0, 25),
      // What survives the shipped dedupe — the actual curation queue.
      survivingGroups: survivingGroups.length,
      survivingSpanningLevels: survivingGroups.filter((g) => g.levels.length > 1).length,
      survivingAllHollow: survivingGroups.filter((g) => g.withExamples === 0).length,
      survivingRecoverable: survivingGroups.filter(
        (g) => g.withExamples > 0 && g.withExamples < g.count,
      ).length,
      survivingEditorialConflict: survivingGroups.filter((g) => g.withExamples === g.count).length,
      survivingSample: survivingGroups.slice(0, 40),
    },
    coherence: {
      langLevelMismatch: langLevelMismatch.length,
      langLevelMismatchSample: langLevelMismatch.slice(0, 25),
    },
    sparseLevels,
    emptyLevels,
  };
}

function pct(n, total) {
  if (!total) return '0%';
  return `${((n / total) * 100).toFixed(1)}%`;
}

function printSummary(r, prev) {
  const d = (cur, before) => {
    if (!before && before !== 0) return '';
    const diff = cur - before;
    if (diff === 0) return ' (=)';
    return diff > 0 ? ` (+${diff})` : ` (${diff})`;
  };

  console.log(`\nGrammar corpus audit — ${r.generatedAt}`);
  if (prev) console.log(`Compared against ${prev.generatedAt}`);
  console.log('='.repeat(64));

  console.log(`\nTotals: ${r.totals.all} points${d(r.totals.all, prev?.totals.all)}`);
  console.log(`  Japanese (ja): ${r.totals.ja}${d(r.totals.ja, prev?.totals.ja)}`);
  console.log(`  Chinese  (zh): ${r.totals.zh}${d(r.totals.zh, prev?.totals.zh)}`);
  if (r.totals.uniqueIds !== r.totals.all) {
    console.log(`  !! ${r.totals.all - r.totals.uniqueIds} duplicate ids`);
  }

  console.log('\nBy level:');
  console.log('  JLPT  ' + JLPT.map((lv) => `${lv}=${r.levels[lv]}`).join('  '));
  console.log('  HSK   ' + HSK.map((lv) => `${lv}=${r.levels[lv]}`).join(' '));
  if (prev) {
    const changed = [...JLPT, ...HSK].filter((lv) => r.levels[lv] !== prev.levels[lv]);
    if (changed.length) {
      console.log(
        '  changed: ' +
          changed.map((lv) => `${lv} ${prev.levels[lv]}→${r.levels[lv]}`).join(', '),
      );
    } else {
      console.log('  (no level counts changed)');
    }
  }

  console.log('\nField completeness (missing / % of corpus):');
  for (const [field, v] of Object.entries(r.completeness)) {
    const flag = v.pct > 50 ? '  <-- majority missing' : '';
    console.log(`  ${field.padEnd(20)} ${String(v.missing).padStart(5)}  ${String(v.pct).padStart(5)}%${flag}`);
  }

  console.log('\nTaxonomy:');
  console.log(`  declared ids:      ${r.taxonomy.declaredIds}`);
  console.log(`  actually used:     ${r.taxonomy.usedIds}`);
  console.log(`  never used:        ${r.taxonomy.unusedIds}`);
  console.log(
    `  tagged 'other' only: ${r.taxonomy.otherOnly} (${pct(r.taxonomy.otherOnly, r.totals.all)} of corpus)`,
  );
  if (r.taxonomy.noFunctions) console.log(`  !! no functions at all: ${r.taxonomy.noFunctions}`);
  if (r.taxonomy.unknownIdList.length)
    console.log(`  !! ids not in the declared list: ${r.taxonomy.unknownIdList.join(', ')}`);
  const topFns = Object.entries(r.taxonomy.distribution).slice(0, 8);
  console.log(`  most common: ${topFns.map(([k, n]) => `${k}(${n})`).join(', ')}`);

  if (r.hollowFields) {
    console.log('\nPopulated but empty of information:');
    console.log(
      `  structure is a copy of title:     ${String(r.hollowFields.structureCopiesTitle).padStart(5)}  ${pct(r.hollowFields.structureCopiesTitle, r.totals.all)}`,
    );
    console.log(
      `  explanation is a copy of meaning: ${String(r.hollowFields.explanationCopiesMeaning).padStart(5)}  ${pct(r.hollowFields.explanationCopiesMeaning, r.totals.all)}`,
    );
    console.log(
      `  BOTH — record is title + gloss:   ${String(r.hollowFields.noDistinctContent).padStart(5)}  ${pct(r.hollowFields.noDistinctContent, r.totals.all)}`,
    );
    if (r.hollowFields.noDistinctContent > 0) {
      console.log(
        '  !! these records cannot be classified from their content, because they\n' +
          '     have none beyond the gloss the old regex tagger already used. They are\n' +
          '     a pattern index, not study material. Fixing them is content acquisition,\n' +
          '     not recategorization.',
      );
    }
  }

  if (r.categories) {
    console.log('\nCanonical categories:');
    console.log(`  declared:        ${r.categories.declared}`);
    console.log(`  populated:       ${r.categories.used}`);
    console.log(`  empty:           ${r.categories.empty}`);
    if (r.categories.empty) console.log(`    ${r.categories.emptyList.join(', ')}`);
    console.log(
      `  uncategorized records: ${r.categories.uncategorized} (${pct(r.categories.uncategorized, r.totals.all)})`,
    );

    if (r.categories.perPoint) {
      console.log('\n  categories per point:');
      for (const n of Object.keys(r.categories.perPoint).sort((a, b) => a - b)) {
        const count = r.categories.perPoint[n];
        const flag = n === '0' ? '  <-- no function tag at all' : '';
        console.log(
          `    ${n} categories: ${String(count).padStart(5)}  ${pct(count, r.totals.all)}${flag}`,
        );
      }
      console.log(`  average when tagged: ${r.categories.avgCategoriesWhenTagged}`);

      const maxLegacy = Math.max(...Object.keys(r.categories.legacyTagsPerPoint).map(Number));
      if (maxLegacy <= 3) {
        console.log(
          `  !! no source record carries more than ${maxLegacy} legacy tags — the deleted\n` +
            '     gloss-regex tagger capped at 3 hits, so multi-category coverage is\n' +
            '     limited by that cap, not by the grammar. Needs human classification.',
        );
      }
    }
  }

  console.log('\nRegister (tagged):');
  for (const [reg, n] of Object.entries(r.register.all)) {
    console.log(`  ${reg.padEnd(10)} ${String(n).padStart(5)}  ${pct(n, r.totals.all)}`);
  }
  if (r.register.answerable) {
    const ans = Object.entries(r.register.answerable);
    console.log('  a register filter can honestly return:');
    if (ans.length === 0) console.log('    (nothing — no record has a trustworthy register)');
    for (const [reg, n] of ans) console.log(`    ${reg.padEnd(10)} ${n}`);
  }
  if (r.register.coverage) {
    const c = r.register.coverage;
    console.log('  coverage:');
    console.log(`    carries a register  ${String(c.carriesRegister).padStart(5)}  ${pct(c.carriesRegister, r.totals.all)}`);
    console.log(`    checked, no register${String(c.knownNeutral).padStart(5)}  ${pct(c.knownNeutral, r.totals.all)}`);
    console.log(`    never examined      ${String(c.unchecked).padStart(5)}  ${pct(c.unchecked, r.totals.all)}`);
    console.log('    !! "never examined" records read as neutral in the UI but');
    console.log('       nothing has confirmed that. Only the first two rows are claims.');
  }

  if (r.provenance) {
    console.log('\nTag provenance:');
    for (const [src, n] of Object.entries(r.provenance.tagSource)) {
      console.log(`  ${src.padEnd(12)} ${String(n).padStart(5)}  ${pct(n, r.totals.all)}`);
    }
    console.log('\nVerification status:');
    for (const [v, n] of Object.entries(r.provenance.verification)) {
      console.log(`  ${v.padEnd(20)} ${String(n).padStart(5)}  ${pct(n, r.totals.all)}`);
    }
  }

  console.log('\nDuplicates:');
  console.log('  in the raw sources (before dedupe):');
  console.log(`    near-duplicate title groups: ${r.duplicates.nearDuplicateGroups}`);
  console.log(`    groups spanning >1 level:    ${r.duplicates.conflictingLevelGroups}`);
  if (r.duplicates.survivingGroups !== undefined) {
    console.log('  still visible after the shipped dedupe  <-- the curation queue:');
    console.log(`    groups:                      ${r.duplicates.survivingGroups}`);
    console.log(`    spanning >1 level:           ${r.duplicates.survivingSpanningLevels}`);
    console.log(`      every copy hollow:         ${r.duplicates.survivingAllHollow}`);
    console.log(
      `      one real + hollow shadow:  ${r.duplicates.survivingRecoverable}  (content recoverable by merging)`,
    );
    console.log(
      `      all copies have content:   ${r.duplicates.survivingEditorialConflict}  (genuine editorial conflict)`,
    );
  }

  console.log('\nCoherence:');
  console.log(`  lang/level mismatches: ${r.coherence.langLevelMismatch}`);

  if (r.sparseLevels.length) {
    console.log('\nSparse levels (<30 points):');
    for (const s of r.sparseLevels) console.log(`  ${s.level.padEnd(6)} ${s.count}`);
  }
  if (r.emptyLevels.length) console.log(`\nEmpty levels: ${r.emptyLevels.join(', ')}`);
  console.log('');
}

function main() {
  const argv = process.argv.slice(2);
  const asJson = argv.includes('--json');
  const outIdx = argv.indexOf('--out');
  const outPath = outIdx >= 0 ? argv[outIdx + 1] : DEFAULT_OUT;
  const cmpIdx = argv.indexOf('--compare');
  const comparePath = cmpIdx >= 0 ? argv[cmpIdx + 1] : null;

  const corpus = loadCorpus();
  const filters = loadCorpus(FILTERS_ENTRY);
  const report = audit(corpus, filters);

  let prev = null;
  if (comparePath && fs.existsSync(comparePath)) {
    try {
      prev = JSON.parse(fs.readFileSync(comparePath, 'utf8'));
    } catch {
      console.error(`(could not read comparison report at ${comparePath})`);
    }
  }

  if (asJson) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printSummary(report, prev);
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
    console.log(`Machine-readable report written to ${path.relative(process.cwd(), outPath)}`);
  }
}

main();
