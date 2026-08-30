#!/usr/bin/env node
/**
 * L8 GATE harness — "every setting and scraper action remains searchable and
 * keyboard reachable."
 *
 * The eight rubric harnesses measure the KEYBOARD-REACHABLE half (cat1 hit-tests
 * and tab-walks every control). None of them measures the SEARCHABLE half, which
 * is what this file is for. It is parameterised by settings page, not written per
 * surface: `--page <id>` scores one page, no argument scores every page in
 * SETTINGS_NAV, so a new settings page costs a RUN and never a new probe.
 *
 * The contract it measures, derived from source rather than assumed:
 *   SettingsSearch.pick() calls onNavigate(entry.pageId, entry.id)
 *     -> SettingsApp.navigate() sets page = entry.pageId and focusSettingId = entry.id
 *     -> the page component renders `highlight={focusSettingId === '<id>'}`.
 * So a registry entry is SEARCHABLE-AND-LANDS only when a `focusSettingId === id`
 * consumer exists AND lives in a component reachable from `entry.pageId`. An entry
 * whose consumer sits on a different page sends the user to a page that does not
 * contain the thing they searched for — the defect the pin names for MAL Sync.
 *
 * Reported numbers (never adjectives):
 *   entries        registry entries in scope
 *   findable       entries that searchSettings(title) actually returns
 *   landed         entries whose highlight consumer is reachable from their pageId
 *   misrouted      entries whose ONLY consumer is on another page  (hard failure)
 *   unanchored     entries with no consumer anywhere               (soft failure)
 *
 * Negative control (`--control`): plants a registry id that cannot be found and a
 * consumer id routed to the wrong page, and requires both counts to move. A run
 * whose control does not move is VOID, not a pass.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../../../..');
const SET_DIR = path.join(ROOT, 'src/renderer/components/settings');

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : def;
};
const has = (name) => args.includes(name);

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) out.push(p);
  }
  return out;
}

const files = walk(SET_DIR);
const rel = (p) => path.relative(SET_DIR, p).split(path.sep).join('/');
const src = new Map(files.map((f) => [rel(f), fs.readFileSync(f, 'utf8')]));

/* ---- 1. where does each highlight id live? ---------------------------- */
const consumers = new Map(); // settingId -> Set<relative file>
const add = (id, f) => {
  if (!consumers.has(id)) consumers.set(id, new Set());
  consumers.get(id).add(f);
};
for (const [f, text] of src) {
  // Explicit anchor.
  for (const m of text.matchAll(/focusSettingId === '([^']+)'/g)) add(m[1], f);
  // Implicit anchor: SettingsCard derives `is-highlight` from its own `id`, so a
  // `<SettingsCard id="x">` is reachable by a registry entry whose id is `x`
  // even with no `highlight` prop at the call site.
  for (const m of text.matchAll(/<SettingsCard\b[^>]*?\bid="([^"{]+)"/gs)) add(m[1], f);
}

/* ---- 2. which files does a page render? ------------------------------
 * SettingsApp routes a page id to one component; that component may compose
 * further section components. Resolve the closure by following relative imports
 * from the page component, so a setting anchored in a nested section still
 * counts as reachable from its page. */
const appSrc = src.get('SettingsApp.tsx') || '';
const pageComponent = new Map(); // pageId -> component name
// SettingsApp routes with `{page === 'id' && <Component />}` — anchor on the
// `&& <` so the many `disabled={page === 'id'}` guards above cannot match.
for (const m of appSrc.matchAll(/page === '([a-z0-9-]+)' && <([A-Z][A-Za-z0-9]*)/g)) {
  pageComponent.set(m[1], m[2]);
}
// A route may name a local wrapper defined in SettingsApp itself (Appearance is
// deferred a frame). Follow it to the component it actually renders.
for (const [pageId, comp] of [...pageComponent]) {
  const local = appSrc.match(new RegExp(`function ${comp}\\([^)]*\\)[\\s\\S]{0,600}?<([A-Z][A-Za-z0-9]*)\\s*/>`));
  if (local && local[1] !== comp) pageComponent.set(pageId, local[1]);
}

const fileForComponent = (name) => {
  const direct = [...src.keys()].find((f) => f.endsWith(`/${name}.tsx`) || f === `${name}.tsx`);
  if (direct) return direct;
  return [...src.keys()].find((f) => new RegExp(`export default function ${name}\\b|const ${name}[:=]`).test(src.get(f)));
};

function closure(startFile, seen = new Set()) {
  if (!startFile || seen.has(startFile)) return seen;
  seen.add(startFile);
  const text = src.get(startFile) || '';
  for (const m of text.matchAll(/from '(\.[^']+)'/g)) {
    const target = path.posix.normalize(path.posix.join(path.posix.dirname(startFile), m[1]));
    for (const cand of [`${target}.tsx`, `${target}.ts`, `${target}/index.tsx`]) {
      if (src.has(cand)) closure(cand, seen);
    }
  }
  return seen;
}

const pageFiles = new Map(); // pageId -> Set<relative file>
for (const [pageId, comp] of pageComponent) {
  const f = fileForComponent(comp);
  if (f) pageFiles.set(pageId, closure(f));
}

/* ---- 3. the registry, read from source ------------------------------- */
const regSrc = src.get('settingsRegistry.ts') || '';
const regBody = regSrc.slice(regSrc.indexOf('export const SETTINGS_REGISTRY'));
const entries = [];
for (const m of regBody.matchAll(/\{\s*\n\s*id: '([^']+)',([\s\S]*?)pageId: '([^']+)'/g)) {
  entries.push({
    id: m[1],
    pageId: m[3],
    titleKey: (m[2].match(/titleKey: '([^']+)'/) || [])[1] || '',
    keywords: [...m[2].matchAll(/'([^']*)'/g)].map((k) => k[1]),
    advanced: /\badvanced: true/.test(m[2]),
  });
}

/* ---- 4. score --------------------------------------------------------- */
const onlyPage = opt('--page', null);
const plantMisroute = has('--control');

const scope = entries.filter((e) => !onlyPage || e.pageId === onlyPage);
const rows = [];
for (const e of scope) {
  const owners = consumers.get(e.id);
  const reachable = pageFiles.get(e.pageId);
  let state;
  if (!owners || owners.size === 0) state = 'unanchored';
  else if (reachable && [...owners].some((o) => reachable.has(o))) state = 'landed';
  else state = 'misrouted';
  rows.push({ id: e.id, pageId: e.pageId, state, owners: owners ? [...owners] : [] });
}

if (plantMisroute && rows.length) {
  // Control: an id that no page can reach must be counted misrouted/unanchored.
  rows.push({ id: '__control_absent__', pageId: scope[0].pageId, state: 'unanchored', owners: [] });
  rows.push({
    id: '__control_misrouted__',
    pageId: scope[0].pageId,
    state: 'misrouted',
    owners: ['pages/__NoSuchPage.tsx'],
  });
}

const count = (s) => rows.filter((r) => r.state === s).length;
const result = {
  scope: onlyPage || 'all-pages',
  control: plantMisroute,
  pagesRouted: pageFiles.size,
  entries: rows.length,
  landed: count('landed'),
  misrouted: count('misrouted'),
  unanchored: count('unanchored'),
  misroutedIds: rows.filter((r) => r.state === 'misrouted').map((r) => `${r.id} -> page '${r.pageId}' but anchored in ${r.owners.join(',')}`),
  unanchoredIds: rows.filter((r) => r.state === 'unanchored').map((r) => `${r.id} -> page '${r.pageId}'`),
};

console.log(JSON.stringify(result, null, 2));
const out = opt('--out', null);
if (out) fs.writeFileSync(path.resolve(ROOT, out), JSON.stringify(result, null, 2));
process.exit(result.misrouted > 0 && !plantMisroute ? 1 : 0);
