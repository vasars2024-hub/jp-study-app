#!/usr/bin/env node
// ────────────────────────────────────────────────────────────────────────────────
// SCAN FOR THE SILENT PROBE-ESCAPE BUG.  Slice 62.
//
// WHY THIS EXISTS
//
// The packaged a11y gate builds its page-side probes as template literals and sends them to the
// browser. A regex written inside one of those literals must DOUBLE its backslashes: `\s` in a
// template literal is just `s` by the time the page sees it.
//
// `ringOf` in `packaged-a11y-deep-gate.mjs` got this wrong and emitted
//
//     /(rgba?([^)]*)|color([^)]*))s+(-?[d.]+)px.../
//
// which is a perfectly valid regex that matches nothing, forever, and throws no error. It ran that
// way through slices 60 and 61: `ringRatio` was `null` in every row of every run.
//
// The reason it survived two slices is the part worth internalising:
//
//     a broken probe and an app with no rings produce BYTE-IDENTICAL output.
//
// So it read as a finding about the app ("this app marks state with fills, not rings") rather than
// as a broken instrument, and that false finding was then used to justify writing MORE parsing.
// Nothing about the output could have distinguished the two. What actually caught it was noticing
// that the two parsers ten lines above had doubled their backslashes and this one had not — the
// bug was only ever visible as an INCONSISTENCY WITHIN THE FILE, never as a wrong number.
//
// That is why this is a scanner and not a code review note. A defect with no observable signature
// has to be found structurally or not at all.
//
// WHAT IT FLAGS  — a single backslash before a regex metacharacter, inside a backtick span.
//
// KNOWN FALSE POSITIVES (all confirmed by hand in the slice-62 audit of all 49 tools):
//   * regexes inside `${…}` interpolations — that is real Node code, single backslashes correct
//   * regexes in ordinary code that merely SHARE a line-range with a template literal, because
//     span detection here is naive backtick pairing
//   * comments containing a Windows path (`C:\Users\…`) or an escaped backtick
// Triage each hit by asking one question: DOES THIS STRING GET SENT TO A PAGE? If it runs in Node,
// a single backslash is right and the hit is noise.
//
// USAGE
//   node scan-probe-escapes.mjs <file> [<file> …]   exit 1 if any suspect escape is found
//   node scan-probe-escapes.mjs --selfcheck         proves the scanner discriminates, exit 0
// ────────────────────────────────────────────────────────────────────────────────
import fs from 'node:fs';

const B = String.fromCharCode(92); // a single backslash, written this way so that no shell,
// heredoc or JSON layer between here and the file can silently halve it. The first attempt at the
// self-test fixture below was written as a shell heredoc and its "correct" case arrived with its
// backslashes already collapsed — the identical bug, one layer up, which made the fixture claim
// the scanner was broken when it was not.
const TICK = String.fromCharCode(96);

const META = 'sdwSDWbB';
const GROUPING = '(){}[]+*?^$|.';

/** Backtick-delimited spans. Naive by construction; see KNOWN FALSE POSITIVES above. */
function templateSpans(src) {
  const spans = [];
  let open = -1;
  for (let i = 0; i < src.length; i += 1) {
    if (src[i] !== TICK) continue;
    if (src[i - 1] === B) continue;
    if (open === -1) open = i;
    else {
      spans.push([open + 1, i]);
      open = -1;
    }
  }
  return spans;
}

function scan(src) {
  const lines = src.split('\n');
  const lineOf = (idx) => src.slice(0, idx).split('\n').length;
  const byLine = new Map();
  for (const [start, end] of templateSpans(src)) {
    const body = src.slice(start, end);
    for (let i = 0; i < body.length; i += 1) {
      if (body[i] !== B) continue;
      if (body[i + 1] === B) { i += 1; continue; } // correctly doubled — consume both
      const next = body[i + 1];
      if (!next) continue;
      if (!META.includes(next) && !GROUPING.includes(next)) continue;
      const line = lineOf(start + i);
      if (!byLine.has(line)) byLine.set(line, { line, escapes: new Set(), text: (lines[line - 1] || '').trim() });
      byLine.get(line).escapes.add(B + next);
    }
  }
  return [...byLine.values()].sort((a, b) => a.line - b.line);
}

function selfcheck() {
  // Built the same way the real bug looks: one probe with single backslashes, one with doubled.
  const bad = 'const badRx = /(rgba?' + B + '([^)]*' + B + '))' + B + 's+/g;';
  const good = 'const goodRx = /(rgba?' + B + B + '([^)]*' + B + B + '))' + B + B + 's+/g;';
  const src = [
    'const probeBad = ' + TICK, '  ' + bad, TICK + ';',
    'const probeGood = ' + TICK, '  ' + good, TICK + ';',
  ].join('\n');
  const rows = scan(src);
  const flaggedBad = rows.some((r) => r.text.includes('badRx'));
  const flaggedGood = rows.some((r) => r.text.includes('goodRx'));
  // Both assertions matter. Without the second, a scanner that flags EVERY line would pass — and
  // that is the failure mode a scanner for silent bugs is most likely to have.
  if (!flaggedBad) { console.error('SELFCHECK FAIL: did not flag the single-backslash probe'); process.exit(1); }
  if (flaggedGood) { console.error('SELFCHECK FAIL: flagged the correctly-doubled probe'); process.exit(1); }
  console.log('selfcheck ok — flags the broken probe, passes the correct one');
  process.exit(0);
}

const args = process.argv.slice(2);
if (args.includes('--selfcheck')) selfcheck();
if (!args.length) {
  console.error('usage: node scan-probe-escapes.mjs <file> […]   |   --selfcheck');
  process.exit(2);
}

let suspect = 0;
for (const file of args) {
  const rows = scan(fs.readFileSync(file, 'utf8'));
  if (!rows.length) continue;
  suspect += 1;
  console.log('### ' + file);
  for (const r of rows) {
    console.log('  line ' + r.line + '  [' + [...r.escapes].join(' ') + ']');
    console.log('    ' + (r.text.length > 140 ? r.text.slice(0, 140) + '…' : r.text));
  }
  console.log('');
}
console.log('files scanned: ' + args.length + ' | files with suspect escapes: ' + suspect);
process.exit(suspect ? 1 : 0);
