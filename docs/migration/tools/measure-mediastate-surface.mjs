#!/usr/bin/env node
// Measure which members of `MediaState` are named nowhere outside the file that
// declares them.
//
// Why this exists: `MediaState` is an *exported* interface whose members are only
// ever read through it (`state.showPlayer`), so a dead member is invisible to
// ESLint's no-unused-vars and to tools/architecture-audit.cjs, which reasons about
// modules rather than members. Slice 32 measured 49 dead members by hand and did
// not execute the removal; this makes the measurement reproducible so the number
// can be re-derived instead of quoted.
//
// Direction of error, stated deliberately: a bare identifier search OVER-reports
// "alive" (an unrelated local named `items` in some other file keeps `items`
// alive). That is the safe direction — this tool never claims a live member is
// dead. It is a *candidate* list whose members are then confirmed by the compiler
// and the suite.
//
// Usage:  node docs/migration/tools/measure-mediastate-surface.mjs [--json]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const declFile = path.join(repoRoot, 'src/renderer/components/media/MediaContent.tsx');

/** Pull the member names out of `export interface MediaState { ... }`. */
function readMembers(source) {
  const start = source.indexOf('export interface MediaState {');
  if (start === -1) throw new Error('MediaState interface not found');
  let depth = 0;
  let end = -1;
  for (let i = source.indexOf('{', start); i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end === -1) throw new Error('MediaState interface is unterminated');
  const body = source.slice(source.indexOf('{', start) + 1, end);

  // One member per top-level line: `name: Type;` or `name?: Type;`. Nested object
  // and function types can span lines, so only take lines at brace depth 0.
  const members = [];
  let d = 0;
  for (const rawLine of body.split('\n')) {
    const line = rawLine.trim();
    if (d === 0) {
      const m = /^(\w+)\??\s*:/.exec(line);
      if (m) members.push({ name: m[1], line: rawLine });
    }
    for (const ch of rawLine) {
      if (ch === '{' || ch === '(' || ch === '[') d++;
      else if (ch === '}' || ch === ')' || ch === ']') d--;
    }
  }
  return members;
}

/** Every .ts/.tsx/.js/.jsx under src/, except the declaring file itself. */
function collectSources(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'jassub') continue;
      collectSources(full, out);
    } else if (/\.(tsx?|jsx?)$/.test(entry.name) && full !== declFile) {
      out.push(full);
    }
  }
  return out;
}

// Blank out string literals and comments before matching. Without this the i18n
// catalogs produce FALSE ALIVE results: a key like
// `'mediaWorkspace.study.translateLine'` matches /\btranslateLine\b/, because \b
// matches after a `.` inside the quoted key. `translateLine` is alive on nothing
// but that, and is in fact dead.
//
// **A template literal's `${...}` interpolations are REAL CODE and must survive.**
// A first cut blanked whole backtick templates and reported `kindFilter` dead —
// it is read at `className={`... ${state.kindFilter === k ? ...}`}`, so acting on
// that would have deleted a live member. That is the failure direction this
// stripping pass introduces, which is why its results are reported as CANDIDATES
// below rather than as a verdict.
function stripLiterals(text) {
  let out = '';
  let i = 0;
  // Stack of template-literal nesting: each `${` inside a template pushes, so a
  // template inside an interpolation inside a template is handled.
  const templates = [];
  let braceDepth = 0;
  while (i < text.length) {
    const ch = text[i];
    const next = text[i + 1];
    if (ch === '/' && next === '*') {
      const end = text.indexOf('*/', i + 2);
      const stop = end === -1 ? text.length : end + 2;
      out += text.slice(i, stop).replace(/[^\n]/g, ' ');
      i = stop;
    } else if (ch === '/' && next === '/') {
      const end = text.indexOf('\n', i);
      const stop = end === -1 ? text.length : end;
      out += ' '.repeat(stop - i);
      i = stop;
    } else if (ch === "'" || ch === '"') {
      const quote = ch;
      out += ' ';
      i++;
      while (i < text.length && text[i] !== quote) {
        if (text[i] === '\\') {
          out += '  ';
          i += 2;
          continue;
        }
        out += text[i] === '\n' ? '\n' : ' ';
        i++;
      }
      out += ' ';
      i++;
    } else if (ch === '`') {
      templates.push(braceDepth);
      out += ' ';
      i++;
      while (i < text.length) {
        if (text[i] === '\\') {
          out += '  ';
          i += 2;
          continue;
        }
        if (text[i] === '`') {
          out += ' ';
          i++;
          templates.pop();
          break;
        }
        if (text[i] === '$' && text[i + 1] === '{') {
          // Hand control back to the main loop so the interpolation is kept.
          out += '  ';
          i += 2;
          braceDepth++;
          break;
        }
        out += text[i] === '\n' ? '\n' : ' ';
        i++;
      }
    } else if (ch === '}' && templates.length > 0 && braceDepth === templates[templates.length - 1] + 1) {
      // End of an interpolation — resume literal text of the enclosing template.
      out += ' ';
      i++;
      braceDepth--;
      while (i < text.length) {
        if (text[i] === '\\') {
          out += '  ';
          i += 2;
          continue;
        }
        if (text[i] === '`') {
          out += ' ';
          i++;
          templates.pop();
          break;
        }
        if (text[i] === '$' && text[i + 1] === '{') {
          out += '  ';
          i += 2;
          braceDepth++;
          break;
        }
        out += text[i] === '\n' ? '\n' : ' ';
        i++;
      }
    } else {
      if (ch === '{') braceDepth++;
      else if (ch === '}') braceDepth--;
      out += ch;
      i++;
    }
  }
  return out;
}

const source = fs.readFileSync(declFile, 'utf8');
const members = readMembers(source);
const files = collectSources(path.join(repoRoot, 'src'));
const corpus = files.map((f) => {
  const raw = fs.readFileSync(f, 'utf8');
  return { file: path.relative(repoRoot, f), raw, text: stripLiterals(raw) };
});

// `MediaContent.tsx` also exports the components that render this state
// (`MediaGrid`, `MediaKindFilter`, `MediaFolderNav`, ...), and those ARE used from
// other files. So a member consumed only as `state.X` by an in-file component is
// alive even though its NAME appears nowhere else — the first cut of this
// measurement called 49 members dead on exactly that mistake.
//
// There is no `const { ... } = state` anywhere in the file (checked), so in-file
// consumption is always a property access. `.X` over-reports alive (an unrelated
// `foo.stepFrame` would count), which is again the safe direction.
const strippedSource = stripLiterals(source);
const rawSource = source;

// Two passes, deliberately not merged into one verdict.
//
//   RAW      — searches the text as written. Over-reports ALIVE (a comment, an
//              i18n key or an unrelated local keeps a member alive). Anything it
//              calls dead is CERTAINLY dead. Safe to act on.
//   STRIPPED — blanks comments and string literals. Finds members kept alive only
//              by a mention rather than a use, but can mis-parse (a regex literal
//              containing a quote is the known hole). Its extra findings are
//              CANDIDATES to be confirmed by eye, not a verdict.
function classify(key, sourceText) {
  const propAccess = (name) => new RegExp(`\\.${name}\\b`).test(sourceText);
  const dead = [];
  const aliveInFile = [];
  const alive = [];
  for (const member of members) {
    const re = new RegExp(`\\b${member.name}\\b`);
    const hits = corpus.filter((c) => re.test(c[key])).map((c) => c.file);
    if (hits.length > 0) alive.push({ name: member.name, files: hits.length, sample: hits.slice(0, 3) });
    else if (propAccess(member.name)) aliveInFile.push(member.name);
    else dead.push(member.name);
  }
  return { dead, aliveInFile, alive };
}

const rawPass = classify('raw', rawSource);
const strippedPass = classify('text', strippedSource);
const { dead, aliveInFile, alive } = rawPass;
const candidates = strippedPass.dead.filter((d) => !dead.includes(d));

// PROVENANCE — the test that decides whether a dead member may be deleted.
//
// "Nothing reads it" has two completely different causes and the deletion is only
// correct for one of them:
//
//   exists at HEAD  -> committed surface that lost its last reader. Retirement
//                      debris. Safe to delete.
//   absent at HEAD  -> added by uncommitted work in this tree. It is unread
//                      because it is NOT WIRED UP YET, not because it was
//                      retired. Deleting it destroys another session's in-flight
//                      feature, and git cannot get it back.
//
// This distinction is the whole reason the removal was not performed: every one
// of the 46 dead members is in the second category. A dead-surface measurement
// alone CANNOT tell "retired" from "not yet wired" — only provenance can.
let provenance = null;
try {
  const { execFileSync } = await import('node:child_process');
  const headText = execFileSync(
    'git',
    ['show', `HEAD:${path.relative(repoRoot, declFile).split(path.sep).join('/')}`],
    { cwd: repoRoot, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
  );
  // Guard against a meaningless comparison: if HEAD's copy is not recognisably
  // the same declaration, every member would look "new" and the answer would be
  // a false alarm rather than a finding.
  const comparable = /export interface MediaState \{/.test(headText);
  // Ask the precise question — "was this a MEMBER of the committed MediaState?" —
  // not "does this name appear in the committed file at all". `nudge` and
  // `converting` both occur at HEAD in comments and in unrelated code, so a
  // whole-file name match calls them committed surface when they are not.
  const headMembers = new Set(comparable ? readMembers(headText).map((m) => m.name) : []);
  const all = [...dead, ...candidates];
  const atHead = all.filter((n) => headMembers.has(n));
  provenance = {
    comparable,
    headLines: headText.split('\n').length,
    retiredSurface: atHead,
    inFlightUnwired: all.filter((n) => !atHead.includes(n)),
  };
} catch {
  provenance = { comparable: false, error: 'HEAD copy unavailable' };
}

const report = {
  declaredIn: path.relative(repoRoot, declFile),
  filesSearched: files.length,
  totalMembers: members.length,
  aliveCount: alive.length,
  aliveInFileCount: aliveInFile.length,
  aliveInFile,
  deadCount: dead.length,
  dead,
  candidateCount: candidates.length,
  candidates,
  provenance,
};

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`MediaState: ${report.totalMembers} members, searched ${report.filesSearched} files under src/`);
  console.log(`  named in another file:                        ${report.aliveCount}`);
  console.log(`  named only here, but read as state.X in-file: ${report.aliveInFileCount}  (ALIVE)`);
  console.log(`  never read anywhere:                          ${report.deadCount}  (dead exposed surface)`);
  console.log('');
  console.log('  alive only via an in-file component:');
  for (const name of aliveInFile) console.log(`    ${name}`);
  console.log('');
  console.log('  dead:');
  for (const name of dead) console.log(`    ${name}`);
  console.log('');
  console.log(`  candidates — alive only via a comment or a string literal (${report.candidateCount}), CONFIRM BY EYE:`);
  for (const name of candidates) console.log(`    ${name}`);
  console.log('');
  if (!provenance.comparable) {
    console.log('  PROVENANCE: unavailable — do not delete anything on this run.');
  } else {
    console.log(`  PROVENANCE vs HEAD (${provenance.headLines} lines):`);
    console.log(`    retired surface, safe to delete:      ${provenance.retiredSurface.length}`);
    console.log(`    absent at HEAD — IN-FLIGHT, DO NOT DELETE: ${provenance.inFlightUnwired.length}`);
    if (provenance.inFlightUnwired.length) {
      console.log('');
      console.log('    These are unread because they are not wired up yet, not because');
      console.log('    they were retired. Deleting them destroys uncommitted work.');
    }
  }
}
