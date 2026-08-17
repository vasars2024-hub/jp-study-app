/**
 * Drives the UI language through all four values via the PRODUCT'S OWN control
 * (Settings > Appearance > the `.sp-seg-btn` group) and runs `l1-raw-keys.js` at each,
 * then restores the language that was active when it started.
 *
 * Why the product control and not `localStorage` + reload: `setUiLang` (renderer/i18n.ts:73)
 * only lands once the language's catalog CHUNK resolves, and it stamps `<html lang>` and
 * pushes the value to main. Writing storage and reloading would skip that path and also
 * destroy the driven Dictionary state the sweep is supposed to measure.
 *
 * Usage (from the repo root): node src/.coordination/liquid-workplace/probes/l1-lang-sweep.cjs
 *
 * Lives beside its probe rather than in debug/, which is gitignored — the evidence document
 * cites this driver by path and a cited instrument that is not committed is not reproducible.
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const cfg = JSON.parse(fs.readFileSync('debug/bridge.json', 'utf8'));
const PROBE = fs.readFileSync(
  path.join('src', '.coordination', 'liquid-workplace', 'probes', 'l1-raw-keys.js'),
  'utf8',
);

async function evaluate(js) {
  const r = await fetch(`http://127.0.0.1:${cfg.port}/eval`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ js }),
  });
  const t = await r.text();
  let parsed;
  try {
    parsed = JSON.parse(t);
  } catch {
    throw new Error(`bridge returned non-JSON: ${t.slice(0, 200)}`);
  }
  if (parsed.result && parsed.result.__error) throw new Error(parsed.result.__error);
  return parsed.result;
}

const clickLang = (tag) => `(()=>{const b=[...document.querySelectorAll('.sp-seg-btn')]
  .find(x=>x.getAttribute('lang')===${JSON.stringify(tag)});
  if(!b) return JSON.stringify({refuse:'no .sp-seg-btn for that lang tag'});
  b.click(); return JSON.stringify({clicked:${JSON.stringify(tag)}});})()`;

const sleep = (ms) => new Promise((res) => { setTimeout(res, ms); });

(async () => {
  const LANGS = [
    { tag: 'en', label: 'English' },
    { tag: 'ja', label: '日本語' },
    { tag: 'zh-Hans', label: '中文' },
    { tag: 'ru', label: 'Русский' },
  ];

  const before = JSON.parse(await evaluate(
    "JSON.stringify({html:document.documentElement.lang,stored:localStorage.getItem('ui-lang')})",
  ));
  console.log('BEFORE', JSON.stringify(before));

  const results = [];
  for (const l of LANGS) {
    console.log(await evaluate(clickLang(l.tag)));
    // The catalog chunk is a dynamic import; the switch lands on its resolution.
    await sleep(1400);
    const raw = await evaluate(PROBE);
    const parsed = JSON.parse(raw);
    // A sweep whose <html lang> did not actually change measured the previous language twice.
    results.push({ requested: l.tag, ...parsed });
    console.log(
      `${l.tag.padEnd(8)} htmlLang=${String(parsed.lang).padEnd(8)} stored=${String(parsed.storedLang).padEnd(8)} ` +
      `candidates=${parsed.totalCandidates} runs=${parsed.windows.reduce((s, w) => s + (w.textRuns || 0), 0)} ` +
      `wins=${parsed.windowCount} refused=${parsed.refusedWindows} dictEntries=${parsed.dictEntriesLive}`,
    );
    console.log('        ', parsed.windows.map((w) => `#${w.index}"${w.titleNow}"=${w.refuse ? 'REFUSE' : w.textRuns}`).join(' '));
  }

  // Restore. `before.stored` is the ground truth; the html tag is `zh-Hans` for `zh`.
  const restoreTag = before.stored === 'zh' ? 'zh-Hans' : (before.stored || 'en');
  console.log(await evaluate(clickLang(restoreTag)));
  await sleep(1400);
  const after = JSON.parse(await evaluate(
    "JSON.stringify({html:document.documentElement.lang,stored:localStorage.getItem('ui-lang')})",
  ));
  console.log('AFTER ', JSON.stringify(after));
  console.log('RESTORED-IDENTICAL:', after.stored === before.stored && after.html === before.html);

  fs.writeFileSync('debug/l1-lang-sweep.json', JSON.stringify({ before, after, results }, null, 2));
  console.log('\nwrote debug/l1-lang-sweep.json');
  for (const r of results) {
    const cands = r.windows.flatMap((w) => (w.candidates || []).map((c) => `${r.requested} ${w.label} ${c.kind} ${c.value} @${c.at}`));
    for (const c of cands) console.log('CANDIDATE', c);
  }
})().catch((e) => { console.error(String(e)); process.exit(1); });
