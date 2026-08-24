/**
 * L8 instrument — rubric category 8's last number: **fabricated or placeholder values rendered as
 * real**.
 *
 * `honesty-probe` probe B says to test this on an **empty scratch profile**, "because real data on
 * a populated profile and a hardcoded constant look identical". This profile is not empty — it
 * carries 697k dictionary rows, 234,982 Tatoeba examples and real study grades — and switching the
 * active profile to a scratch one would change the very knowledge levels and saved words the
 * surface renders, which is a mutation of the thing under audit.
 *
 * SO THE RULE IS TAKEN AT ITS WORD RATHER THAN ITS METHOD. What makes an empty profile decisive is
 * that a constant survives when its data is taken away. The same distinguishing power comes from
 * VARYING THE INPUT: a value traced to the headword changes when the headword changes; a
 * module-level constant does not. Three different words are looked up through the product's own
 * search box and every rendered leaf inside the entries is compared position by position.
 *
 * WHAT COUNTS AS A CANDIDATE. An invariant leaf is not automatically a fabrication — a column
 * heading, a button, a unit and a section label are all *supposed* to be constant, and counting
 * them would produce a number so noisy it means nothing. Chrome is excluded STRUCTURALLY, by tag
 * and by role, not by whether the string looks like a label: `button`, `summary`, `label`, `th`,
 * `h1`-`h6`, `legend` and anything with an `aria-label`-only text. What remains is text rendered in
 * a data position, and an invariant one is reported by class and text for adjudication.
 *
 * THE CONTROL, which this probe needs more than most. `--control` plants a leaf inside a
 * `.dict-entry` carrying a status word that traces to nothing — the shipped precedent
 * `honesty-probe` cites, where `Connected` / `Ready` / `Available` / `Configured` sat under four
 * green dots and nothing checked anything. It must be flagged in all three passes, and its removal
 * must bring the count back. A probe that returns 0 candidates without that is returning 0 because
 * it cannot see, and this repo has paid for that shape three times.
 *
 * Run: node src/.coordination/liquid-workplace/probes/l8-fabricated.cjs [--control]
 */
'use strict';
const fs = require('node:fs');

const cfg = JSON.parse(fs.readFileSync('debug/bridge.json', 'utf8'));
const CONTROL_ALL = process.argv.includes('--control-all');
const CONTROL = CONTROL_ALL || process.argv.includes('--control');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Three headwords, by code point, chosen to differ in every badge the entry can render: a common
 * N5 ichidan verb, a common noun, and a word that is none of those.
 */
const WORDS = [
  { name: 'taberu', chars: [0x98df, 0x3079, 0x308b] }, // 食べる
  { name: 'mizu', chars: [0x6c34] }, // 水
  { name: 'sogo', chars: [0x9f5f, 0x9f6c] }, // 齟齬
];
const textOf = (w) => String.fromCharCode(...w.chars);

async function ev(js) {
  const r = await fetch(`http://127.0.0.1:${cfg.port}/eval`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ js }),
  });
  const t = await r.json();
  if (!t.ok) throw new Error(`eval failed: ${JSON.stringify(t).slice(0, 300)}`);
  try {
    return JSON.parse(t.result);
  } catch {
    return t.result;
  }
}

async function search(term) {
  await ev(`(() => {
    const win = document.querySelector('.fwin');
    const input = [...win.querySelectorAll('input[type=text]')].find((i) => (i.placeholder || '').length > 8);
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(input, ${JSON.stringify(term)});
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return 'set';
  })()`);
  await sleep(120);
  await ev(`(() => {
    const win = document.querySelector('.fwin');
    [...win.querySelectorAll('button')].find((b) => (b.textContent || '').trim() === 'Search').click();
    return 'clicked';
  })()`);
  await sleep(2200);
}

/**
 * Every text leaf inside the result entries, keyed by where it sits rather than by what it says.
 * The key is `entryIndex|class|tag|ordinal`, so the same slot across two different words is
 * compared against itself — comparing by text alone would call every repeated gloss a constant.
 */
const CAPTURE = `(() => {
  const win = document.querySelector('.fwin');
  if (!win) return JSON.stringify({ refuse: 'no .fwin' });
  const CHROME = new Set(['BUTTON', 'SUMMARY', 'LABEL', 'TH', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LEGEND', 'OPTION']);
  const entries = [...win.querySelectorAll('.dict-entry')];
  const leaves = [];
  entries.forEach((entry, ei) => {
    const seen = Object.create(null);
    for (const el of entry.querySelectorAll('*')) {
      if (el.children.length) continue;
      const text = (el.textContent || '').trim();
      if (!text) continue;
      if (CHROME.has(el.tagName)) continue;
      if (el.closest('button,summary,label,th,legend')) continue;
      const cls = String(el.className || '').trim() || el.tagName.toLowerCase();
      const key = cls + '|' + el.tagName;
      seen[key] = (seen[key] || 0) + 1;
      leaves.push({ slot: ei + '|' + key + '|' + seen[key], key: key + '|' + seen[key], ei, cls, text });
    }
  });
  return JSON.stringify({ entries: entries.length, leaves });
})()`;

/** Status words that in this repo's shipped precedent sat under a dot with nothing behind them. */
const STATUS = /^(connected|ready|available|configured|active|enabled|online|ok|healthy|synced|up to date)$/i;

/**
 * `--control` plants into the FIRST entry only, which is what the across-words measure needs.
 * `--control-all` plants into EVERY entry, which is what the within-pass measure needs — a leaf
 * that repeats in one entry and nowhere else is invisible to a cross-entry comparison, so the two
 * measures need two different plants or one of them is scored by a control it cannot see.
 */
async function plantControl(all) {
  return ev(`(() => {
    const entries = [...document.querySelectorAll('.fwin .dict-entry')];
    if (!entries.length) return JSON.stringify({ ok: false, why: 'no .dict-entry' });
    document.querySelectorAll('.l8-fab-control').forEach((n) => n.remove());
    for (const entry of (${all ? 'entries' : 'entries.slice(0, 1)'})) {
      const span = document.createElement('span');
      span.className = 'l8-fab-control dict-status';
      span.textContent = 'Connected';
      entry.append(span);
    }
    return JSON.stringify({ ok: true, planted: document.querySelectorAll('.l8-fab-control').length });
  })()`);
}

async function removeControl() {
  return ev(`(() => {
    const before = document.querySelectorAll('.l8-fab-control').length;
    document.querySelectorAll('.l8-fab-control').forEach((n) => n.remove());
    return JSON.stringify({ before, remaining: document.querySelectorAll('.l8-fab-control').length });
  })()`);
}

(async () => {
  const out = { at: new Date().toISOString(), control: CONTROL, controlAll: CONTROL_ALL, passes: [] };

  for (const w of WORDS) {
    await search(textOf(w));
    if (CONTROL) out[`planted_${w.name}`] = await plantControl(CONTROL_ALL);
    const cap = await ev(CAPTURE);
    out.passes.push({ word: w.name, entries: cap.entries, leafCount: cap.leaves.length, leaves: cap.leaves });
  }

  if (CONTROL) out.controlRemoved = await removeControl();

  // A leaf is invariant when the SAME slot renders the SAME text in all three passes.
  const [a, b, c] = out.passes;
  const byslot = (p) => Object.fromEntries(p.leaves.map((l) => [l.slot, l]));
  const [A, B, C] = [byslot(a), byslot(b), byslot(c)];
  const invariant = [];
  for (const slot of Object.keys(A)) {
    if (!B[slot] || !C[slot]) continue;
    if (A[slot].text === B[slot].text && B[slot].text === C[slot].text) {
      invariant.push({ slot, cls: A[slot].cls, text: A[slot].text });
    }
  }

  /**
   * SECOND MEASURE, because the first one's denominator is thin. Only slots that exist at the same
   * entry index in all three passes are comparable across words, and that was **15** of ~55 leaves
   * on the first honest run. A fabrication sitting in any of the other forty would not have been
   * looked at. So each pass is also compared against ITSELF: a leaf whose slot repeats across the
   * 7-8 entries of one search, rendering identical text for eight different words, is the same
   * defect seen along the other axis, and the denominator is every repeated slot rather than the
   * intersection of three searches.
   */
  const withinPass = out.passes.map((p) => {
    const byKey = Object.create(null);
    for (const l of p.leaves) (byKey[l.key] ||= []).push(l);
    const repeated = Object.entries(byKey).filter(([, ls]) => ls.length > 1);
    const constant = repeated
      .filter(([, ls]) => ls.every((l) => l.text === ls[0].text))
      .map(([key, ls]) => ({ key, cls: ls[0].cls, text: ls[0].text, acrossEntries: ls.length }));
    return {
      word: p.word,
      entries: p.entries,
      repeatedSlots: repeated.length,
      constantAcrossEntries: constant.length,
      constant,
      statusWordCandidates: constant.filter((l) => STATUS.test(l.text)),
    };
  });

  out.summary = {
    entriesPerPass: out.passes.map((p) => `${p.word}:${p.entries}`),
    leavesPerPass: out.passes.map((p) => `${p.word}:${p.leafCount}`),
    acrossWords: {
      comparableSlots: Object.keys(A).filter((s) => B[s] && C[s]).length,
      invariantCount: invariant.length,
      invariant,
      statusWordCandidates: invariant.filter((l) => STATUS.test(l.text)),
    },
    withinPass,
    withinPassTotals: {
      repeatedSlots: withinPass.reduce((n, p) => n + p.repeatedSlots, 0),
      constantAcrossEntries: withinPass.reduce((n, p) => n + p.constantAcrossEntries, 0),
      statusWordCandidates: withinPass.reduce((n, p) => n + p.statusWordCandidates.length, 0),
    },
  };

  console.log(JSON.stringify(out.summary, null, 1));
  fs.writeFileSync(
    'src/.coordination/liquid-workplace/baselines/l8-fabricated-' +
      (CONTROL_ALL ? 'control-all' : CONTROL ? 'control' : 'run') +
      '.json',
    JSON.stringify(out, null, 1),
  );
})().catch(async (e) => {
  console.error('PROBE FAILED', e.message);
  try {
    console.error('CONTROL CLEANUP', JSON.stringify(await removeControl()));
  } catch {
    /* the window may be gone; the plant is DOM-only and dies with the render */
  }
  process.exit(1);
});
