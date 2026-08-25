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
 * TWO SURFACES, ONE INSTRUMENT (2026-08-25). Category 8 has to produce this number on the Video
 * window too, and the Video window is the **Media Center** — no `.dict-entry`, no headword, no
 * Search button. What ports is the METHOD, not the selectors: vary the input, compare each data
 * leaf against ITSELF at the same slot. On the Media Center the varying input is the SHELF, and
 * the repeated unit is the card. `--surface video` swaps the entry selector and the driver and
 * changes nothing else, so both surfaces are scored by the same comparison.
 *
 * AND THE WINDOW IS NOW PICKED BY TITLE. Every selector here used to be
 * `document.querySelector('.fwin')` — the first in DOM order. On this desk that is the Media
 * window, so a run labelled Dictionary would have captured leaves from a different surface
 * entirely and never refused. Same defect, same fix, as `l8-dead-controls.cjs` and
 * `l8-honest-states.cjs`; a no-match is a refusal, not a fallback.
 *
 * Run: node src/.coordination/liquid-workplace/probes/l8-fabricated.cjs
 *      [--surface dictionary|video] [--title <window>] [--control|--control-all]
 */
'use strict';
const fs = require('node:fs');

const cfg = JSON.parse(fs.readFileSync('debug/bridge.json', 'utf8'));
const CONTROL_ALL = process.argv.includes('--control-all');
const CONTROL = CONTROL_ALL || process.argv.includes('--control');
const argOf = (name, dflt) => {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
};
const SURFACE = argOf('--surface', 'dictionary');
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

/**
 * Three SHELVES for the Media Center, which is this surface's equivalent of three headwords: each
 * renders a different set of titles into the same card slots, so a leaf that traces to the item
 * changes and a constant does not. Chosen to differ in category, era and episode counts rather
 * than to be convenient — `Anime` and `TV shows` disagree on almost every badge a card can draw.
 */
const SHELVES = [
  { name: 'recentlyAdded', label: 'Recently added' },
  { name: 'anime', label: 'Anime' },
  { name: 'unsorted', label: 'Unsorted' },
];
/**
 * `TV shows` and `Continue watching` are NOT usable here and the reason is a real product fact
 * rather than a bad pick: measured on this profile they hold 29 files and 2 files but **one grouped
 * entry each**, and a one-entry shelf renders `.medialib-spotlight-wrap`, not a card
 * (`MediaLibraryBrowser.tsx:270`). Zero cards is an empty harness, which the rubric caps at 0, so
 * the probe refuses such a pass rather than averaging it in.
 */
const SHELF_RESTORE = 'Recently added';

/** The window under test, by TITLE. A no-match refuses by name rather than taking window one. */
const TITLE = argOf('--title', SURFACE === 'video' ? 'Video' : 'Dictionary');
const WIN = `(() => {
  const wanted = ${JSON.stringify(TITLE)};
  const painted = [...document.querySelectorAll('.fwin')].filter((w) => {
    const r = w.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  });
  return painted.find((w) => {
    const t = w.querySelector('.fwin-title-text, .fwin-title');
    return !!t && (t.textContent || '').includes(wanted);
  }) || null;
})()`;

/** Per-surface: what an "entry" is, and how the input is varied. Nothing else differs. */
const ENTRY_SEL = SURFACE === 'video' ? '.medialib-card' : '.dict-entry';
const PASSES = SURFACE === 'video' ? SHELVES : WORDS;

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
    const win = ${WIN};
    if (!win) return 'REFUSED';
    const input = [...win.querySelectorAll('input[type=text]')].find((i) => (i.placeholder || '').length > 8);
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(input, ${JSON.stringify(term)});
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return 'set';
  })()`);
  await sleep(120);
  await ev(`(() => {
    const win = ${WIN};
    [...win.querySelectorAll('button')].find((b) => (b.textContent || '').trim() === 'Search').click();
    return 'clicked';
  })()`);
  await sleep(2200);
}

/**
 * The Media Center's equivalent of a search: select a shelf on the library rail. The rail row is
 * matched on the shelf NAME as a prefix, because each row appends its own count ("TV shows29") and
 * that count is exactly the sort of derived value this probe is here to check — matching on the
 * whole string would make the driver depend on the number under test.
 */
async function selectShelf(label) {
  const picked = await ev(`(() => {
    const win = ${WIN};
    if (!win) return JSON.stringify({ refuse: 'no painted .fwin titled ' + ${JSON.stringify(TITLE)} });
    const row = [...win.querySelectorAll('.ui-sidebar__item')]
      .find((b) => (b.textContent || '').trim().startsWith(${JSON.stringify(label)}));
    if (!row) return JSON.stringify({ refuse: 'no rail row starting ' + ${JSON.stringify(label)} });
    row.click();
    return JSON.stringify({ clicked: (row.textContent || '').trim() });
  })()`);
  if (picked.refuse) throw new Error(picked.refuse);
  await sleep(1600);
  return picked;
}

/**
 * Every text leaf inside the result entries, keyed by where it sits rather than by what it says.
 * The key is `entryIndex|class|tag|ordinal`, so the same slot across two different words is
 * compared against itself — comparing by text alone would call every repeated gloss a constant.
 */
const CAPTURE = `(() => {
  const win = ${WIN};
  if (!win) return JSON.stringify({ refuse: 'no painted .fwin titled ' + ${JSON.stringify(TITLE)} });
  const CHROME = new Set(['BUTTON', 'SUMMARY', 'LABEL', 'TH', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LEGEND', 'OPTION']);
  const entries = [...win.querySelectorAll(${JSON.stringify(ENTRY_SEL)})];
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
    const win = ${WIN};
    if (!win) return JSON.stringify({ ok: false, why: 'no painted .fwin titled ' + ${JSON.stringify(TITLE)} });
    const entries = [...win.querySelectorAll(${JSON.stringify(ENTRY_SEL)})];
    if (!entries.length) return JSON.stringify({ ok: false, why: 'no ' + ${JSON.stringify(ENTRY_SEL)} });
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
  const out = {
    at: new Date().toISOString(), surface: SURFACE, title: TITLE, entrySelector: ENTRY_SEL,
    control: CONTROL, controlAll: CONTROL_ALL, drove: [], passes: [],
  };

  for (const p of PASSES) {
    // The only per-surface branch in the run: what "vary the input" means here.
    out.drove.push(SURFACE === 'video' ? await selectShelf(p.label) : { search: textOf(p) });
    if (SURFACE !== 'video') await search(textOf(p));
    if (CONTROL) out[`planted_${p.name}`] = await plantControl(CONTROL_ALL);
    const cap = await ev(CAPTURE);
    if (cap.refuse) throw new Error(cap.refuse);
    // An empty pass caps this category at 0 per the rubric, so it is a refusal and not a zero.
    if (!cap.entries) throw new Error(`pass ${p.name} rendered 0 ${ENTRY_SEL} — an empty harness is not a measurement`);
    out.passes.push({ word: p.name, entries: cap.entries, leafCount: cap.leaves.length, leaves: cap.leaves });
  }

  if (CONTROL) out.controlRemoved = await removeControl();
  // The census owes the next probe the surface it borrowed. Three shelf changes leave the library
  // on `Unsorted`, and the next instrument would then score a four-card shelf as this window.
  if (SURFACE === 'video') out.restored = await selectShelf(SHELF_RESTORE);

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
    surface: SURFACE,
    measuredWindow: TITLE,
    drove: out.drove,
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
    'src/.coordination/liquid-workplace/baselines/l8-fabricated-' + SURFACE + '-' +
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
