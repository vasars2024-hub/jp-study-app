#!/usr/bin/env node
/**
 * Pre-sweep class 4 — count-vs-truth, the mechanical half.
 *
 * Class 4 asks: does the number on screen agree with the store? Most of it is a hand walk,
 * but one shape produces the disagreement automatically and can be found by machine:
 *
 *   a MUTATING `window.api.*` call whose RESULT IS DISCARDED.
 *
 * When main answers a mutation with the new state — `{ removed, items }`, the new snapshot,
 * the new list — and the caller throws it away, the store has changed and the screen has not.
 * The user clicks Remove, the row stays, the count beside it stays, and the control reads as
 * broken. This is exactly D113: `onClick={() => void window.api.pruneMedia()}` next to a
 * "Missing files: N" that never moves.
 *
 * A discarded result is only a defect when there is nothing else to refresh the screen, so
 * this reports LEADS. Three shapes are legitimate and common:
 *   - the caller subscribes to a push (`onXChanged`) and is refreshed that way;
 *   - the value is a snapshot the caller genuinely does not need (fire-and-forget telemetry);
 *   - the call is followed by an explicit refetch.
 * The report prints whether the file subscribes to any `on*Changed` listener, which settles
 * most of them at a glance.
 *
 * Usage:
 *   node src/.coordination/presweep/discarded-result-scan.cjs
 *   node src/.coordination/presweep/discarded-result-scan.cjs --api pruneMedia
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const SRC = path.resolve(__dirname, '..', '..');

/** Verbs that change state in main. A getter's discarded result is not interesting. */
const MUTATING = /^(add|append|apply|clear|create|delete|discard|import|insert|mark|merge|mine|move|prune|record|register|remove|rename|reorder|reset|save|set|sort|store|toggle|unregister|update|upsert|write)/;

/** `name: (...) => Promise<T>` in preload, with T. Names answering void are not scored. */
function preloadReturns() {
  const text = fs.readFileSync(path.join(SRC, 'preload.ts'), 'utf8');
  const out = new Map();
  const re = /^ {2}([a-zA-Z0-9_]+): \([^)]*\)(?::\s*(Promise<[^=]*?>|[^=]*?))? =>/gm;
  let m;
  while ((m = re.exec(text))) {
    const ret = (m[2] ?? '').trim();
    if (!ret) continue;
    out.set(m[1], ret);
  }
  return out;
}

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === 'node_modules' || ent.name === '.git') continue;
      walk(full, out);
    } else if (/\.tsx?$/.test(ent.name) && !/\.d\.ts$/.test(ent.name)) out.push(full);
  }
  return out;
}

const returns = preloadReturns();
const args = process.argv.slice(2);
const onlyApi = args.includes('--api') ? args[args.indexOf('--api') + 1] : null;

const files = walk(path.join(SRC, 'renderer'))
  .concat(walk(path.join(SRC, 'media')))
  .filter((f) => !/__tests__|__devharness__/.test(f));

const leads = [];
for (const file of files) {
  const text = fs.readFileSync(file, 'utf8');
  const subscribes = /window\.api\.on[A-Z][A-Za-z0-9_]*\(/.test(text);
  const lines = text.split('\n');
  lines.forEach((line, i) => {
    const m = /(^|[^.\w])(?:void\s+)?window\.api\.([a-zA-Z0-9_]+)\s*\(/.exec(line);
    if (!m) return;
    const api = m[2];
    if (onlyApi ? api !== onlyApi : !MUTATING.test(api)) return;
    const ret = returns.get(api);
    // Nothing to discard if main answers nothing.
    if (!ret || /^Promise<void>$/.test(ret) || ret === 'void') return;
    // Discarded means the call stands as a STATEMENT: nothing receives its value.
    // Matching that shape directly beats trying to detect "used" — `setCredentials(await
    // window.api.x())` fooled the first version of this, which looked backwards for an
    // operator and saw a bare `await`.
    const call = `window.api.${api}(`;
    let stmt = line.trim();
    // `for (const id of ids) await window.api.removeItem(id);` is still a statement.
    if (stmt.startsWith('for (')) stmt = stmt.slice(stmt.indexOf(') ') + 2).trimStart();
    for (const lead of ['await void ', 'await ', 'void ']) {
      if (stmt.startsWith(lead)) { stmt = stmt.slice(lead.length); break; }
    }
    const arrow = stmt.indexOf('=> ');
    const body = arrow >= 0 ? stmt.slice(arrow + 3).replace(/^void /, '') : stmt;
    if (!body.startsWith(call)) return;
    // A call can start a line and still be consumed, when the consumer is on the line above:
    //   const next = await enrichInboxItems(
    //     await window.api.importGenerated({ … }),
    //   );
    // Four of the first run's twenty leads were exactly this. Look up one non-blank line.
    let prev = i - 1;
    while (prev >= 0 && lines[prev].trim() === '') prev--;
    if (prev >= 0 && /[([,=:?]$|=>$|\breturn$|\bawait$|\|\|$|&&$/.test(lines[prev].trimEnd())) return;
    if (/\.then\s*\(/.test(line.slice(m.index))) return; // chained — the result is handled
    leads.push({
      file: path.relative(SRC, file).replace(/\\/g, '/'),
      line: i + 1,
      api,
      ret: ret.length > 46 ? `${ret.slice(0, 44)}…` : ret,
      subscribes,
      text: line.trim().slice(0, 96),
    });
  });
}

const unsubscribed = leads.filter((l) => !l.subscribes);
console.log(`mutating calls whose answer is discarded: ${leads.length}`);
console.log(`  of those, in a file with NO on*Changed subscription: ${unsubscribed.length}  <- read these first\n`);
const show = (list) => {
  for (const l of list.sort((a, b) => a.file.localeCompare(b.file))) {
    console.log(`  ${l.file}:${l.line}`);
    console.log(`      ${l.api} -> ${l.ret}`);
    console.log(`      ${l.text}`);
  }
};
show(unsubscribed);

/**
 * Printed, not hidden. "The file subscribes" is a FILE-level fact and a file can hold more
 * than one component: `MediaContent.tsx` subscribes, but the dead `MediaHubDashboard` inside
 * it does not, and its discarded `pruneMedia` is D113. Suppressing this list would have
 * hidden the one finding that motivated the scanner.
 */
console.log(`\nIn a file that DOES subscribe somewhere — weaker leads, but not clear:\n`);
show(leads.filter((l) => l.subscribes));
