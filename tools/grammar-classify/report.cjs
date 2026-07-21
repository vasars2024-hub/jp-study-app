/**
 * Step 4: build the human review page for the classification run.
 *
 * Groups every point under its assigned function, sorts buckets by size, and
 * surfaces the two things worth a human's attention first: points the model
 * declined to classify, and buckets so large they probably need splitting.
 *
 *   node tools/grammar-classify/report.cjs > review.html
 */
const fs = require('fs');
const path = require('path');
const { CANONICAL } = require('./labels.cjs');

const rows = fs.readFileSync(path.join(__dirname, 'assignments.jsonl'), 'utf-8')
  .trim().split('\n').map((l) => JSON.parse(l));

const buckets = new Map();
const unresolved = [];
for (const r of rows) {
  if (!r.fn) { unresolved.push(r); continue; }
  if (!buckets.has(r.fn)) buckets.set(r.fn, []);
  buckets.get(r.fn).push(r);
}

const sorted = [...buckets.entries()].sort((a, b) => b[1].length - a[1].length);
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const lowConf = rows.filter((r) => r.fn && r.confidence !== 'high').length;

const out = [];
out.push(`<title>Grammar function tagging — review</title>`);
out.push(`<style>
:root{--bg:#fff;--fg:#1a1a1a;--muted:#666;--line:#e3e3e3;--accent:#8b5cf6;--warn:#b45309;--warnbg:#fef3c7}
@media (prefers-color-scheme:dark){:root{--bg:#131316;--fg:#ececec;--muted:#9a9a9a;--line:#2c2c31;--accent:#a78bfa;--warn:#fbbf24;--warnbg:#3a2e12}}
:root[data-theme=dark]{--bg:#131316;--fg:#ececec;--muted:#9a9a9a;--line:#2c2c31;--accent:#a78bfa;--warn:#fbbf24;--warnbg:#3a2e12}
:root[data-theme=light]{--bg:#fff;--fg:#1a1a1a;--muted:#666;--line:#e3e3e3;--accent:#8b5cf6;--warn:#b45309;--warnbg:#fef3c7}
body{background:var(--bg);color:var(--fg);font:15px/1.55 ui-sans-serif,system-ui,sans-serif;margin:0;padding:32px 24px;max-width:1000px;margin-inline:auto}
h1{font-size:24px;margin:0 0 4px}
.sub{color:var(--muted);margin-bottom:28px}
.stats{display:flex;flex-wrap:wrap;gap:12px;margin-bottom:32px}
.stat{border:1px solid var(--line);border-radius:10px;padding:12px 16px;min-width:120px}
.stat b{display:block;font-size:22px}
.stat span{color:var(--muted);font-size:12px}
details{border-top:1px solid var(--line);padding:10px 0}
summary{cursor:pointer;font-weight:600;display:flex;justify-content:space-between;gap:12px}
summary .n{color:var(--muted);font-weight:400}
.hint{color:var(--muted);font-size:13px;margin:6px 0 10px}
table{width:100%;border-collapse:collapse;font-size:13px}
td{padding:4px 8px 4px 0;vertical-align:top;border-bottom:1px solid var(--line)}
td.jp{font-weight:600;white-space:nowrap;width:1%}
td.m{color:var(--muted)}
td.v{color:var(--muted);text-align:right;white-space:nowrap;font-size:11px}
.warn{background:var(--warnbg);border-radius:10px;padding:14px 16px;margin-bottom:24px}
.scroll{overflow-x:auto}
</style>`);

out.push(`<h1>Grammar function tagging — review</h1>`);
out.push(`<p class="sub">${rows.length} points classified into ${buckets.size} of ${Object.keys(CANONICAL).length} canonical functions. Nothing has been written to the app yet.</p>`);

out.push(`<div class="stats">
<div class="stat"><b>${rows.length}</b><span>points total</span></div>
<div class="stat"><b>${rows.length - unresolved.length}</b><span>assigned</span></div>
<div class="stat"><b>${unresolved.length}</b><span>need a human</span></div>
<div class="stat"><b>${lowConf}</b><span>model-picked</span></div>
<div class="stat"><b>0</b><span>tagged "other"</span></div>
</div>`);

if (unresolved.length) {
  out.push(`<div class="warn"><b>${unresolved.length} points could not be classified confidently.</b> These are left with their existing tag rather than guessed at — the shortlist did not contain a fitting label, which usually means the canonical set is missing a category.</div>`);
  out.push(`<div class="scroll"><table>`);
  for (const r of unresolved.slice(0, 200)) {
    out.push(`<tr><td class="jp">${esc(r.title)}</td><td class="m">${esc(r.meaning)}</td><td class="v">${esc(r.via)}</td></tr>`);
  }
  out.push(`</table></div>`);
  if (unresolved.length > 200) out.push(`<p class="sub">…and ${unresolved.length - 200} more.</p>`);
}

for (const [fn, items] of sorted) {
  out.push(`<details><summary><span>${esc(CANONICAL[fn].label)}</span><span class="n">${items.length}</span></summary>`);
  out.push(`<p class="hint">${esc(CANONICAL[fn].hint)}</p><div class="scroll"><table>`);
  for (const r of items) {
    out.push(`<tr><td class="jp">${esc(r.title)}</td><td class="m">${esc(r.meaning)}</td><td class="v">${esc(r.via)}</td></tr>`);
  }
  out.push(`</table></div></details>`);
}

process.stdout.write(out.join('\n'));
