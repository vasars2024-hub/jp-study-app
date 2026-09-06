#!/usr/bin/env node
/**
 * Pre-sweep class 6 — "does this setting actually do anything?"
 *
 * A control that persists a value nothing ever reads is the worst defect class on a
 * settings surface, because it looks finished on screen and no accessible-name,
 * keyboard or i18n pass can see it. This scans every exported DEFAULT_* settings
 * object in the tree and reports the keys with no consumer outside the settings MODEL.
 *
 * The rule (pinned 2026-09-06 19:00, and validated on knowns before it was trusted):
 * count referencing files EXCLUDING the model itself — the type declaration, the
 * DEFAULT_* object, the normalizer, `fields.ts`, `*Ipc.ts`, `window.d.ts` and
 * `featureStatus.ts`. That last one is the app's own wired-ness registry: it references
 * every key and destroys the signal. A naive grep does NOT discriminate — a dead key
 * still shows 2-3 hits from its own type and default.
 *
 * A 0-consumer result is a LEAD, not a verdict. Keys can be read dynamically
 * (`config[name]`, a spread into an options object, a string-keyed lookup), so the
 * scanner separates them out and refuses to call them dead:
 *
 *   DEAD        0 consumers, and the name is distinctive enough to trust the search
 *   AMBIGUOUS   0 consumers, but the owning module has dynamic key access nearby
 *   LIVE        >= 1 consumer file, listed
 *
 * Usage:
 *   node src/.coordination/presweep/inert-settings-scan.cjs            # DEAD + AMBIGUOUS
 *   node src/.coordination/presweep/inert-settings-scan.cjs --all      # every key
 *   node src/.coordination/presweep/inert-settings-scan.cjs --key foo  # one key, verbose
 *   node src/.coordination/presweep/inert-settings-scan.cjs --object DEFAULT_TOOLBOX_SETTINGS
 *   node src/.coordination/presweep/inert-settings-scan.cjs --inert    # audit fields.ts flags
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const SRC = path.resolve(__dirname, '..', '..');

// ---------------------------------------------------------------- file index

/** Every .ts/.tsx under src/, with its text, read once. */
function indexSources(dir, out = new Map()) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === 'node_modules' || ent.name === '.git') continue;
      indexSources(full, out);
    } else if (/\.tsx?$/.test(ent.name)) {
      out.set(path.relative(SRC, full).replace(/\\/g, '/'), fs.readFileSync(full, 'utf8'));
    }
  }
  return out;
}

/**
 * Files that are the settings MODEL rather than a consumer of it. Excluding these is
 * the whole rule: leave them in and every key looks alive.
 */
function isModelFile(rel) {
  return (
    rel.includes('/__tests__/') ||
    rel.endsWith('.d.ts') ||
    /(^|\/)fields\.ts$/.test(rel) ||
    /Ipc\.ts$/.test(rel) ||
    /(^|\/)featureStatus\.ts$/.test(rel) ||
    /(^|\/)settingsRegistry\.ts$/.test(rel)
  );
}

// ---------------------------------------------------------- object extraction

/** The balanced `{ ... }` literal that starts at or after `from`. */
function objectLiteralAt(text, from) {
  const open = text.indexOf('{', from);
  if (open < 0) return null;
  let depth = 0;
  for (let i = open; i < text.length; i += 1) {
    const c = text[i];
    if (c === '{') depth += 1;
    else if (c === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(open + 1, i);
    }
  }
  return null;
}

/** Top-level `key:` names of an object literal body, ignoring nested objects. */
function topLevelKeys(body) {
  const keys = [];
  let depth = 0;
  let line = '';
  for (const raw of body.split('\n')) {
    const t = raw.trim();
    if (depth === 0) {
      const m = /^([A-Za-z_$][\w$]*)\s*:/.exec(t);
      if (m) keys.push({ key: m[1], line: t });
    }
    line = t;
    for (const c of raw) {
      if (c === '{' || c === '[' || c === '(') depth += 1;
      else if (c === '}' || c === ']' || c === ')') depth -= 1;
    }
  }
  void line;
  return keys;
}

/** Every exported `DEFAULT_*` object literal in the tree, with the keys it declares. */
function collectDefaultObjects(sources) {
  const objects = [];
  const decl = /export const (DEFAULT_[A-Z0-9_]+)\s*(?::[^=]+)?=\s*\{/g;
  for (const [rel, text] of sources) {
    if (isModelFile(rel)) continue;
    let m;
    decl.lastIndex = 0;
    while ((m = decl.exec(text))) {
      const body = objectLiteralAt(text, m.index + m[0].length - 1);
      if (!body) continue;
      const keys = topLevelKeys(body);
      if (keys.length) objects.push({ name: m[1], file: rel, keys });
    }
  }
  return objects;
}

// -------------------------------------------------------------- consumer scan

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Files that READ this key. Property access and string-index access are the two
 * shapes that mean "somebody uses the value"; a bare identifier match is not, because
 * a key called `mode` collides with hundreds of unrelated locals.
 */
function consumersOf(key, sources, ownFile) {
  const read = new RegExp(`\\.${esc(key)}\\b|\\[['"\`]${esc(key)}['"\`]\\]`);
  // `const { key, ... } = something` — destructuring is a read too.
  const destructure = new RegExp(`\\{[^{}\\n]*\\b${esc(key)}\\b[^{}\\n]*\\}\\s*(?::[^=]*)?=`);
  const hits = [];
  for (const [rel, text] of sources) {
    if (rel === ownFile || isModelFile(rel)) continue;
    if (read.test(text) || destructure.test(text)) hits.push(rel);
  }
  return hits;
}

/**
 * A key can leave its module without ever being named: `{...settings}` spread into an
 * options bag, or `Object.entries(settings)` walked generically. Either makes a
 * 0-consumer result untrustworthy, so those objects report AMBIGUOUS rather than DEAD.
 *
 * Scoped to the OWNING FILE only. An earlier version scanned the whole directory, which
 * for `shared/` is hundreds of files and made literally everything ambiguous — the check
 * has to be about how THIS object escapes, not whether any neighbour indexes anything.
 */
const ESCAPES = /\.\.\.\s*[A-Za-z_$][\w$]*|Object\.(?:entries|keys|values|assign)\s*\(/;
function hasDynamicAccess(ownFile, sources) {
  const text = sources.get(ownFile);
  return Boolean(text) && ESCAPES.test(text);
}

// -------------------------------------------------------- fields.ts inert flags

/** The `inert: true` fields the app flags itself, so both directions can be checked. */
function collectInertFlags(sources) {
  const flagged = [];
  for (const [rel, text] of sources) {
    if (!/(^|\/)fields\.ts$/.test(rel)) continue;
    const lines = text.split('\n');
    lines.forEach((line, i) => {
      if (!/\binert:\s*true\b/.test(line)) return;
      // The field's own `path:` is the nearest one at or above this line.
      for (let j = i; j >= 0 && j > i - 25; j -= 1) {
        const m = /path:\s*['"`]([^'"`]+)['"`]/.exec(lines[j]);
        if (m) {
          flagged.push({ path: m[1], file: rel, line: i + 1 });
          return;
        }
      }
      flagged.push({ path: '(unknown)', file: rel, line: i + 1 });
    });
  }
  return flagged;
}

// ------------------------------------------------------------------- reporting

function main() {
  const argv = process.argv.slice(2);
  const has = (f) => argv.includes(f);
  const val = (f) => {
    const i = argv.indexOf(f);
    return i >= 0 ? argv[i + 1] : null;
  };

  const sources = indexSources(SRC);
  process.stdout.write(`indexed ${sources.size} source files under src/\n\n`);

  const objects = collectDefaultObjects(sources);

  if (has('--inert')) {
    const flagged = collectInertFlags(sources);
    process.stdout.write(`fields.ts self-flagged inert: ${flagged.length}\n\n`);
    for (const f of flagged) {
      const leaf = f.path.split('.').pop();
      // The key's OWN model file must be excluded, exactly as in the main scan. Passing
      // fields.ts as `ownFile` leaves the DEFAULT_* object in scope and reports every
      // flag as having one consumer — itself.
      const owner = objects.find((o) => o.keys.some((k) => k.key === leaf));
      const hits = consumersOf(leaf, sources, owner ? owner.file : f.file);
      const verdict = hits.length ? `WRONG FLAG - ${hits.length} consumer(s)` : 'confirmed dead';
      process.stdout.write(
        `  ${f.path.padEnd(38)} ${verdict}${owner ? '' : '   [no DEFAULT_* owner found]'}\n`,
      );
      if (hits.length) for (const h of hits.slice(0, 4)) process.stdout.write(`      ${h}\n`);
    }
    process.stdout.write(
      '\nA hit here is still only a LEAD: short generic names (minWidth, mode, enabled) ' +
        'collide\nwith unrelated code. Read every listed file before calling a flag wrong.\n',
    );
    return;
  }

  const onlyObject = val('--object');
  const onlyKey = val('--key');
  const showAll = has('--all') || Boolean(onlyKey);

  let dead = 0;
  let ambiguous = 0;
  let live = 0;
  let scanned = 0;

  for (const obj of objects) {
    if (onlyObject && obj.name !== onlyObject) continue;
    const rows = [];
    const dynamic = hasDynamicAccess(obj.file, sources);
    for (const { key } of obj.keys) {
      if (onlyKey && key !== onlyKey) continue;
      scanned += 1;
      const hits = consumersOf(key, sources, obj.file);
      let verdict;
      if (hits.length) {
        verdict = 'LIVE';
        live += 1;
      } else if (dynamic) {
        verdict = 'AMBIGUOUS';
        ambiguous += 1;
      } else {
        verdict = 'DEAD';
        dead += 1;
      }
      if (showAll || verdict !== 'LIVE') rows.push({ key, verdict, hits });
    }
    if (!rows.length) continue;
    process.stdout.write(`${obj.name}  (${obj.file}, ${obj.keys.length} keys)\n`);
    for (const r of rows) {
      process.stdout.write(`  ${r.verdict.padEnd(10)} ${r.key}`);
      if (r.hits.length) {
        process.stdout.write(`  <- ${r.hits.length} file(s): ${r.hits.slice(0, 3).join(', ')}`);
        if (r.hits.length > 3) process.stdout.write(` +${r.hits.length - 3}`);
      }
      process.stdout.write('\n');
    }
    process.stdout.write('\n');
  }

  process.stdout.write(
    `${objects.length} default objects, ${scanned} keys scanned: ` +
      `${live} LIVE, ${dead} DEAD, ${ambiguous} AMBIGUOUS\n`,
  );
  process.stdout.write(
    'DEAD is a LEAD, not a verdict - confirm each one by reading the owning module ' +
      'before filing it.\n',
  );
}

main();
