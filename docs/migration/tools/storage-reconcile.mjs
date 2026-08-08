#!/usr/bin/env node
/**
 * storage-reconcile.mjs — item 6.1, the three-way comparison.
 *
 * Joins the source-derived census (storage-key-census.mjs) against a live snapshot of the
 * running profile's localStorage, and classifies every key by what the source does with it
 * versus whether it is actually there.
 *
 * The classes it names, in the audit's vocabulary:
 *   dead-default    read by source, written by nothing — the setting can only ever be its
 *                   default, and no amount of using the app will create it
 *   dead-control    written by source, read by nothing — a control that persists into a void
 *   untouched       written by some path, simply not exercised on this profile — benign
 *   live-orphan     present in the store, named by no source key or pattern — a leftover
 *   sweep-only      reached only by a whole-store sweep (migration / restore / inventory),
 *                   never by a named read or write
 *
 * Usage:
 *   node docs/migration/tools/storage-reconcile.mjs --live <live-storage.json> [--md <out.md>]
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..', '..');

const args = process.argv.slice(2);
const argValue = (flag, fallback) => {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const censusPath = path.resolve(REPO, argValue('--census', 'docs/audit/STORAGE_CENSUS.json'));
const livePath = path.resolve(argValue('--live', ''));
const mdPath = path.resolve(REPO, argValue('--md', 'docs/audit/STORAGE_RECONCILIATION.md'));

if (!livePath || !fs.existsSync(livePath)) {
  console.error('--live <path to live snapshot json> is required');
  process.exit(2);
}

const census = JSON.parse(fs.readFileSync(censusPath, 'utf8'));
const live = JSON.parse(fs.readFileSync(livePath, 'utf8'));

/**
 * Verified rulings, so a re-run does not re-argue a flag a human already read.
 * The tool classifies structurally; this file records what the reading concluded.
 */
const adjudicationsPath = path.resolve(REPO, argValue('--adjudications', 'docs/audit/STORAGE_ADJUDICATIONS.json'));
const adjudications = fs.existsSync(adjudicationsPath)
  ? JSON.parse(fs.readFileSync(adjudicationsPath, 'utf8'))
  : {};
const rulingFor = (key) => (key.startsWith('_') ? null : adjudications[key] ?? null);

const DYNAMIC = '${…}';
const liveByKey = new Map(live.entries.map((e) => [e.key, e]));

/** Census rows that name a real key, split from the sweep pseudo-keys. */
const sweepRows = census.keys.filter((r) => r.key.includes('(whole-store sweep)') || r.key.includes('(localStorage.key sweep)'));
const namedRows = census.keys.filter((r) => !sweepRows.includes(r));

const patternRows = namedRows.filter((r) => r.key.includes(DYNAMIC));
const staticRows = namedRows.filter((r) => !r.key.includes(DYNAMIC));

const patternRegex = (pattern) =>
  new RegExp(`^${pattern.split(DYNAMIC).map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.+')}$`);

const matchedByPattern = new Map(); // live key -> pattern
for (const row of patternRows) {
  const re = patternRegex(row.key);
  for (const key of liveByKey.keys()) {
    if (re.test(key) && !matchedByPattern.has(key)) matchedByPattern.set(key, row.key);
  }
}

const rows = staticRows.map((row) => {
  const liveEntry = liveByKey.get(row.key);
  const present = Boolean(liveEntry);
  // A key read by current code but written by none is only a defect when it is not a
  // migration inbox. Two structural signals say "inbox": the constant is named LEGACY_*,
  // or the read is paired with a removeItem that consumes it once.
  const legacyInbound = row.class === 'read-never-written' && (row.legacyNamed || row.removes > 0);

  let verdict;
  if (legacyInbound) verdict = present ? 'legacy-inbound-present' : 'legacy-inbound';
  else if (row.class === 'read-never-written') verdict = present ? 'read-never-written-but-present' : 'dead-default';
  else if (row.class === 'written-never-read') verdict = 'dead-control';
  else if (row.class === 'test-only') verdict = present ? 'test-only-but-present' : 'test-only';
  else verdict = present ? 'live' : 'untouched';

  return {
    key: row.key,
    sourceClass: row.class,
    verdict,
    ruling: rulingFor(row.key),
    constNames: row.constNames ?? [],
    present,
    reads: row.reads,
    writes: row.writes,
    removes: row.removes,
    readSites: row.readSites,
    writeSites: row.writeSites,
    live: liveEntry
      ? {
          chars: liveEntry.chars,
          type: liveEntry.type,
          layers: liveEntry.layers,
          fields: liveEntry.fields ?? [],
          fieldTypes: liveEntry.fieldTypes ?? {},
          length: liveEntry.length,
          sample: liveEntry.sample,
        }
      : null,
  };
});

const declaredKeys = new Set(staticRows.map((r) => r.key));
const orphans = [...liveByKey.values()]
  .filter((e) => !declaredKeys.has(e.key))
  .map((e) => ({
    key: e.key,
    chars: e.chars,
    type: e.type,
    matchedPattern: matchedByPattern.get(e.key) ?? null,
    fields: e.fields ?? [],
  }));

const byVerdict = rows.reduce((acc, r) => ({ ...acc, [r.verdict]: (acc[r.verdict] ?? 0) + 1 }), {});

const summary = {
  generated: new Date().toISOString(),
  censusGenerated: census.summary.generated,
  liveKeys: live.count,
  liveChars: live.totalChars,
  declaredStaticKeys: staticRows.length,
  declaredPatterns: patternRows.length,
  sweepSites: sweepRows.reduce((a, r) => a + r.reads + r.writes + r.removes, 0),
  byVerdict,
  liveOrphans: orphans.filter((o) => !o.matchedPattern).length,
  liveExplainedByPattern: orphans.filter((o) => o.matchedPattern).length,
  overEncodedLiveKeys: live.entries.filter((e) => e.layers > 1).length,
  unruledFlags: rows.filter((r) => ['dead-default', 'dead-control'].includes(r.verdict) && !r.ruling).length,
  confirmedDefects: rows.filter((r) => r.ruling?.ruling === 'defect').length,
};

// ---------------------------------------------------------------------------
// markdown report
// ---------------------------------------------------------------------------

const table = (headers, bodyRows) =>
  [`| ${headers.join(' | ')} |`, `|${headers.map(() => '---').join('|')}|`, ...bodyRows.map((r) => `| ${r.join(' | ')} |`)].join('\n');

const section = (title, body) => `\n### ${title}\n\n${body}\n`;

const deadDefaults = rows.filter((r) => r.verdict === 'dead-default');
const legacyInbound = rows.filter((r) => r.verdict.startsWith('legacy-inbound'));
const deadControls = rows.filter((r) => r.verdict === 'dead-control');
const presentUnwritten = rows.filter((r) => r.verdict === 'read-never-written-but-present');
const untouched = rows.filter((r) => r.verdict === 'untouched');
const liveRows = rows.filter((r) => r.verdict === 'live');

let md = `# Storage reconciliation — audit item 6.1

Generated ${summary.generated} by \`docs/migration/tools/storage-reconcile.mjs\`, joining
\`docs/migration/tools/storage-key-census.mjs\` (source, ${census.summary.filesScanned} files) against a
live snapshot of the running profile (${summary.liveKeys} keys, ${summary.liveChars.toLocaleString('en-US')} chars).

Regenerate both halves with:

\`\`\`
node docs/migration/tools/storage-key-census.mjs
# snapshot the live store through the debug bridge, then:
node docs/migration/tools/storage-reconcile.mjs --live <snapshot.json>
\`\`\`

## Summary

${table(
  ['Measure', 'Value'],
  [
    ['Keys named by a literal or constant in source', String(summary.declaredStaticKeys)],
    ['Dynamic key patterns in source', String(summary.declaredPatterns)],
    ['Keys live in the profile', String(summary.liveKeys)],
    ['Live and over-encoded (6.A defect)', String(summary.overEncodedLiveKeys)],
    ['**Dead defaults** — read, never written, no migration role', `**${deadDefaults.length}**`],
    ['Legacy inboxes — read for a one-way migration', String(legacyInbound.length)],
    ['**Dead controls** — written, never read', `**${deadControls.length}**`],
    ['Present but written by nothing', String(presentUnwritten.length)],
    ['Declared, writable, simply not exercised here', String(untouched.length)],
    ['Live orphans — in the store, named nowhere', String(summary.liveOrphans)],
    ['Live, explained by a dynamic pattern', String(summary.liveExplainedByPattern)],
    ['**Confirmed defects after adjudication**', `**${summary.confirmedDefects}**`],
    ['**Flags still unruled**', `**${summary.unruledFlags}**`],
  ],
)}
`;

const openDeadDefaults = deadDefaults.filter((r) => !r.ruling);

md += section(
  `Dead defaults — ${deadDefaults.length} flagged, ${openDeadDefaults.length} unruled`,
  deadDefaults.length
    ? `Read by source, written by nothing, so the key can only ever hold its compiled-in default.\nRows carrying a ruling were read by hand and recorded in \`docs/audit/STORAGE_ADJUDICATIONS.json\`;\nonly the unruled ones need attention.\n\n${table(
        ['Key', 'Ruling', 'Read sites'],
        deadDefaults.map((r) => [
          `\`${r.key}\``,
          r.ruling ? `**${r.ruling.ruling}** — ${r.ruling.why}` : '_unruled_',
          r.readSites.slice(0, 2).join('<br>'),
        ]),
      )}`
    : '_None._',
);

md += section(
  `Legacy inboxes — ${legacyInbound.length} keys read only to migrate an older shape`,
  legacyInbound.length
    ? `Not defects. Each is read by current code, written by none, and either removed after\nconsumption or deliberately left in place. Listed so they are not re-flagged next pass.\n\n${table(
        ['Key', 'Present live', 'Constant', 'Removed after read'],
        legacyInbound.map((r) => [
          `\`${r.key}\``,
          r.present ? 'yes' : 'no',
          r.constNames.map((n) => `\`${n}\``).join(', ') || '—',
          r.removes > 0 ? 'yes' : 'no',
        ]),
      )}`
    : '_None._',
);

md += section(
  `Dead controls — ${deadControls.length} keys written by source and read by nothing`,
  deadControls.length
    ? `A control that persists a value no code ever loads. The write succeeds, so nothing looks\nwrong, and the setting silently does not survive anything.\n\n${table(
        ['Key', 'Ruling', 'Present live', 'Write sites'],
        deadControls.map((r) => [
          `\`${r.key}\``,
          r.ruling ? `**${r.ruling.ruling}** — ${r.ruling.why}` : '_unruled_',
          r.present ? 'yes' : 'no',
          r.writeSites.slice(0, 2).join('<br>'),
        ]),
      )}`
    : '_None._',
);

md += section(
  `Present but written by nothing — ${presentUnwritten.length}`,
  presentUnwritten.length
    ? `The value exists in the profile, so something wrote it once — but no current source path\ndoes. Either a removed feature left it, or the writer moved and the reader did not.\n\n${table(
        ['Key', 'Chars', 'Type', 'Read sites'],
        presentUnwritten.map((r) => [`\`${r.key}\``, String(r.live.chars), r.live.type, r.readSites.slice(0, 2).join('<br>')]),
      )}`
    : '_None._',
);

md += section(
  `Live orphans — ${summary.liveOrphans}`,
  summary.liveOrphans
    ? `Present in the profile, named by no key or pattern in \`src/\`. A ruling of **scope** means\nthe owner was found outside \`src/\` — the vendored Seanime frontend, or another build sharing\nthis Chromium profile origin.\n\n${table(
        ['Key', 'Chars', 'Type', 'Ruling'],
        orphans
          .filter((o) => !o.matchedPattern)
          .map((o) => {
            const ruling = rulingFor(o.key);
            return [
              `\`${o.key}\``,
              String(o.chars),
              o.type,
              ruling ? `**${ruling.ruling}** — ${ruling.why}` : '_unruled_',
            ];
          }),
      )}`
    : '_None — every live key is named by a literal, a constant, or a dynamic pattern._',
);

md += section(
  `Live keys with a named reader and writer — ${liveRows.length}`,
  table(
    ['Key', 'Chars', 'Type', 'Layers', 'Reads', 'Writes', 'Top-level fields'],
    liveRows
      .sort((a, b) => b.live.chars - a.live.chars)
      .map((r) => [
        `\`${r.key}\``,
        String(r.live.chars),
        r.live.type,
        String(r.live.layers),
        String(r.reads),
        String(r.writes),
        r.live.fields.length ? r.live.fields.join(', ') : r.live.sample ? `_${r.live.sample}_` : '—',
      ]),
  ),
);

md += section(
  `Declared and writable but absent on this profile — ${untouched.length}`,
  `Expected for an inventory this size: a setting nobody has changed has no reason to exist.\nThese are listed for completeness, not as defects.\n\n${untouched
    .map((r) => `\`${r.key}\``)
    .join(', ')}`,
);

fs.mkdirSync(path.dirname(mdPath), { recursive: true });
fs.writeFileSync(mdPath, md, 'utf8');
fs.writeFileSync(
  mdPath.replace(/\.md$/, '.json'),
  JSON.stringify({ summary, rows, orphans }, null, 2),
  'utf8',
);

console.log(JSON.stringify(summary, null, 2));
console.log(`\nwrote ${path.relative(REPO, mdPath).replace(/\\/g, '/')}`);
