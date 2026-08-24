/**
 * L8 instrument — rubric category 8's four states, driven against a dependency that is
 * genuinely down.
 *
 * `L1_HONEST_STATES.md` recorded the category VOID with a named reason: *"Two induced-failure
 * attempts both SUCCEEDED, so the error and offline states were never observed."* AnkiConnect was
 * running and an AI provider answered, so nothing failed and there was nothing to score. The
 * rubric's rule is explicit — a control that does not fail voids the score rather than earning it.
 *
 * THIS RUN HAS A REAL ONE. `127.0.0.1:8765` refuses connections, and this probe proves that from
 * node with its own TCP connect before it touches the app, so the induction is not taken on faith
 * from the renderer's own report of it. That is the rubric's "unreachable host", not a stub, not a
 * monkeypatched `window.api`, not a simulated `navigator.onLine`.
 *
 * WHY CLICKING `+ Add to Anki` IS SAFE HERE AND WAS NOT SAFE IN THE CENSUS. `l8-dead-controls.cjs`
 * excludes all eight of them because they write a real note into the user's real collection. With
 * the port refused, `addToAnki` awaits `ensureAnki()`, gets `connected:false` and returns BEFORE
 * `ankiMineNote` — measured, not assumed: the run records `ankiStatus().connected` immediately
 * before the click. No note can be written to a server that is not listening.
 *
 * WHAT THE FOUR STATES MAP TO ON THIS SURFACE, and why they are four distinct renders:
 *
 *   empty    `.dict-empty`      — a query with no match, naming the query back
 *   loading  `.dict-loading`    — the lookup in flight
 *   offline  `.anki-setup`      — `AnkiLinkState 'disconnected'`, the dependency's own word for
 *                                 unreachable, carrying `status.error` from the failed probe
 *   error    driven separately by `l8-explain-error.cjs`; a mine failure cannot be reached while
 *            the port is refused, because `ensureAnki` short-circuits ahead of it
 *
 * THE RESTORE PROBLEM, WHICH IS ALSO A FINDING. `DictionaryResults` renders `AnkiSetup` from an
 * early return (`:844`) that replaces the whole result list, and passes `onBack` only when
 * `variant === 'popup'`. The floating Dictionary window is `variant='page'`. So on this surface
 * the panel's only control is Retry, which calls `ensureAnki` again, which sets `showSetup` again.
 * The probe measures that loop rather than assuming it, and refuses to leave the surface parked
 * in it: `--restore-only` re-runs the install-time query after the fix lands.
 *
 * Run: node src/.coordination/liquid-workplace/probes/l8-honest-states.cjs [--restore-only]
 */
'use strict';
const fs = require('node:fs');
const net = require('node:net');

const cfg = JSON.parse(fs.readFileSync('debug/bridge.json', 'utf8'));
const RESTORE_ONLY = process.argv.includes('--restore-only');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** The install-time query, by code point — a literal here has been mangled by two tool layers. */
const TERM = String.fromCharCode(0x98df, 0x3079, 0x308b); // 食べる
const NONSENSE = 'zzzqqqxxwv';

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

/**
 * The induction's own proof, from outside the app.
 *
 * The renderer reporting `connected:false` is the thing under test; it cannot also be the evidence
 * that the dependency is down. A refused TCP connect from this process is independent of every
 * layer the probe is measuring.
 */
function tcpProbe(port, host = '127.0.0.1', timeoutMs = 2000) {
  return new Promise((resolve) => {
    const sock = new net.Socket();
    const done = (verdict, detail) => {
      sock.destroy();
      resolve({ verdict, detail });
    };
    sock.setTimeout(timeoutMs);
    sock.once('connect', () => done('LISTENING', 'connect succeeded'));
    sock.once('timeout', () => done('TIMEOUT', `no answer in ${timeoutMs} ms`));
    sock.once('error', (e) => done('REFUSED', e.code || e.message));
    sock.connect(port, host);
  });
}

/** Every rendered text run inside the measured window, so a state is read rather than inferred. */
const READ = `(() => {
  const win = document.querySelector('.fwin');
  if (!win) return JSON.stringify({ refuse: 'no .fwin' });
  const txt = (sel) => [...win.querySelectorAll(sel)].map((e) => (e.textContent || '').trim()).filter(Boolean);
  return JSON.stringify({
    entries: win.querySelectorAll('.dict-entry').length,
    chars: (win.textContent || '').length,
    empty: txt('.dict-empty'),
    loading: txt('.dict-loading'),
    setup: txt('.anki-setup-msg,.anki-setup-sub'),
    setupSteps: txt('.anki-steps li').length,
    setupButtons: [...win.querySelectorAll('.anki-setup-actions button')].map((b) => (b.textContent || '').trim()),
    addLabels: [...new Set([...win.querySelectorAll('.dict-add')].map((b) => (b.textContent || '').trim()))],
    audioStates: [...win.querySelectorAll('.word-audio')].map((b) => ({
      state: (String(b.className).match(/is-([a-z]+)/) || [])[1],
      label: b.getAttribute('aria-label') || '',
      disabled: b.disabled,
    })),
  });
})()`;

/** A raw i18n key reaches the user as its own dotted name; every state message is checked for one. */
const RAW_KEY = /^[a-z][a-zA-Z0-9]*(\.[a-zA-Z0-9_]+){2,}$/;
const rawKeysIn = (strings) => strings.filter((s) => RAW_KEY.test(s.trim()));

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
    const btn = [...win.querySelectorAll('button')].find((b) => (b.textContent || '').trim() === 'Search');
    btn.click();
    return 'clicked';
  })()`);
}

/**
 * The loading state is transient by definition, and POLLING IT OVER THE BRIDGE RETURNS AN EMPTY
 * SET. The first run of this probe sampled `.dict-loading` every 40 ms for 1500 ms and recorded
 * `[]` on a lookup that provably ran (8 entries after). A local SQLite lookup finishes inside one
 * `/eval` round trip, so the sampler's own latency is longer than the state it is sampling — and
 * the `[]` it returns is indistinguishable from a surface that says nothing while it works. That
 * is `L1_HONEST_STATES.md`'s `loading: 0` again with a different cause, so it is recorded here
 * rather than fixed silently.
 *
 * The instrument that can see it observes IN THE PAGE: a MutationObserver installed before the
 * click records every `.dict-loading` render at full fidelity and is read back afterwards.
 */
async function armLoadingObserver() {
  await ev(`(() => {
    const win = document.querySelector('.fwin');
    if (window.__l8load && window.__l8load.obs) window.__l8load.obs.disconnect();
    const seen = [];
    const capture = () => {
      for (const e of win.querySelectorAll('.dict-loading')) {
        const s = (e.textContent || '').trim();
        if (s && !seen.includes(s)) seen.push(s);
      }
      for (const e of win.querySelectorAll('[aria-busy="true"]')) {
        const s = '[aria-busy] ' + (e.className || e.tagName);
        if (!seen.includes(s)) seen.push(s);
      }
    };
    const obs = new MutationObserver(capture);
    obs.observe(win, { childList: true, subtree: true, attributes: true, characterData: true });
    window.__l8load = { obs, seen, capture };
    capture();
    return 'armed';
  })()`);
}

async function readLoadingObserver() {
  const seen = await ev(`(() => {
    const rec = window.__l8load;
    if (!rec) return JSON.stringify({ refuse: 'observer never armed' });
    rec.obs.disconnect();
    return JSON.stringify(rec.seen);
  })()`);
  return seen;
}

async function main() {
  const report = { at: new Date().toISOString(), term: [...TERM].map((c) => c.codePointAt(0)) };

  if (RESTORE_ONLY) {
    await search(TERM);
    await sleep(1600);
    report.restored = await ev(READ);
    console.log(JSON.stringify(report, null, 1));
    return;
  }

  // ---- 1. the induction, proven from outside the app -----------------------------------------
  report.induction = {
    ankiConnect: await tcpProbe(8765),
    // A port that IS listening, run through the same instrument. A prober that returns REFUSED for
    // everything proves nothing; this is the control on the control.
    viteControl: await tcpProbe(5173),
  };

  report.baseline = await ev(READ);

  // ---- 2. the app's own reading of the same dependency ----------------------------------------
  await ev(`(() => { window.__l8h = {};
    window.api.ankiStatus().then((s) => { window.__l8h.status = s; }).catch((e) => { window.__l8h.status = 'THREW ' + e.message; });
    window.api.ankiLinkState().then((l) => { window.__l8h.link = l; }).catch((e) => { window.__l8h.link = 'THREW ' + e.message; });
    return 'asked'; })()`);
  await sleep(3000);
  report.dependency = await ev(`JSON.stringify({ status: window.__l8h.status, link: window.__l8h.link })`);

  // ---- 3. empty ------------------------------------------------------------------------------
  await search(NONSENSE);
  await sleep(1800);
  const emptyRead = await ev(READ);
  report.empty = {
    rendered: emptyRead.empty,
    entries: emptyRead.entries,
    namesTheQuery: emptyRead.empty.some((s) => s.includes(NONSENSE)),
    rawKeys: rawKeysIn(emptyRead.empty),
  };

  // ---- 4. loading (observed in-page across a real lookup) --------------------------------------
  await armLoadingObserver();
  await search(TERM);
  await sleep(1600);
  report.loading = { observed: await readLoadingObserver() };
  const back = await ev(READ);
  report.loading.entriesAfter = back.entries;
  report.loading.rawKeys = rawKeysIn(Array.isArray(report.loading.observed) ? report.loading.observed : []);

  // ---- 5. offline: the dependency's own disconnected render -----------------------------------
  report.offline = { statusBeforeClick: report.dependency };
  await ev(`(() => {
    const win = document.querySelector('.fwin');
    const btn = win.querySelector('.dict-add');
    btn.click();
    return 'clicked';
  })()`);
  await sleep(3000);
  const setupRead = await ev(READ);
  report.offline.rendered = setupRead.setup;
  report.offline.steps = setupRead.setupSteps;
  report.offline.buttons = setupRead.setupButtons;
  report.offline.entriesNowVisible = setupRead.entries;
  report.offline.rawKeys = rawKeysIn([...setupRead.setup, ...setupRead.setupButtons]);
  report.offline.namesTheDependency = setupRead.setup.some((s) => /anki/i.test(s));
  report.offline.falseSuccess = setupRead.addLabels.some((l) => /added/i.test(l));

  // ---- 6. the way back, measured rather than assumed -------------------------------------------
  const hasBack = setupRead.setupButtons.some((b) => /back/i.test(b));
  report.reversibility = { backButtonPresent: hasBack, retryLoop: null };
  const retry = setupRead.setupButtons.findIndex((b) => !/back/i.test(b));
  if (retry >= 0) {
    await ev(`(() => {
      const win = document.querySelector('.fwin');
      [...win.querySelectorAll('.anki-setup-actions button')][${retry}].click();
      return 'retried';
    })()`);
    await sleep(3000);
    const afterRetry = await ev(READ);
    report.reversibility.retryLoop = {
      stillSetup: afterRetry.setup.length > 0,
      entries: afterRetry.entries,
    };
  }

  // ---- 7. audio: the surface's own offline-vs-none distinction ---------------------------------
  report.audio = report.baseline.audioStates;

  console.log(JSON.stringify(report, null, 1));
}

main().catch((e) => {
  console.error('PROBE FAILED', e.message);
  process.exit(1);
});
