/**
 * packaged-surface-sweep.mjs — open EVERY surface in the packaged app and record what appears.
 *
 * The brief this was written for asks a specific question per feature area: **does it mount, does
 * it render real content, and does it degrade honestly when its dependency is missing?** That is
 * three different answers and this tool keeps them apart, because collapsing them is how "the
 * surface is fine" gets recorded about a window that mounted and displayed nothing.
 *
 * HOW A SURFACE IS OPENED
 *   The desktop shell listens for a CustomEvent, `os:open`, whose detail is a `WinSection`
 *   (`src/renderer/components/DesktopShell.tsx:75-79,1091`). That is the same bus the command
 *   palette and the Blanc tool panels use, so this drives the app the way the app drives itself
 *   rather than hunting for pixels to click.
 *
 * WHAT THE VERDICTS MEAN — and why "empty" is not "broken"
 *   CONTENT        the window mounted AND rendered substantive content.
 *   EMPTY-HONEST   the window mounted and showed an explicit empty/placeholder state. On a
 *                  throwaway profile with no library, no account and no sidecar data this is the
 *                  CORRECT behaviour and is reported as a pass for degradation.
 *   EMPTY-SILENT   the window mounted, rendered nothing substantive, and offered no empty state
 *                  either. This is the one that is a defect: a blank panel with no explanation.
 *   ERROR          visible error text, or a crash//unmount.
 *   NOT-OPENED     the event was dispatched and no window appeared.
 *
 *   A surface that cannot be reached because its dependency is absent is NOT-REACHABLE in the
 *   write-up, and the reason is recorded here so that call can be made from evidence.
 *
 * NOTE ON THE PROBE STRINGS
 *   No backticks inside the page-side templates — a backtick ends the probe string and the file
 *   stops parsing with an error pointing at prose. It has caught several authors on this track.
 *   Regexes inside them need doubled backslashes for the same reason.
 *
 * Usage:
 *   node docs/migration/tools/packaged-surface-sweep.mjs [--selfcheck]
 */
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../..');
const arg = (name, fallback = '') => {
  const hit = process.argv.slice(2).find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const EXE = path.resolve(arg('exe')
  || path.join(REPO, 'out', 'jp-study-app-win32-x64', 'jp-study-app.exe'));
const stamp = process.env.RUN_STAMP
  || new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
const workRoot = path.join(REPO, 'docs/migration/proof', `packaged-surface-${stamp}`);

/** Every WinSection in DesktopShell.tsx:75-79, in the brief's feature order where possible. */
const SECTIONS = [
  'dictionary', 'grammar', 'translate', 'notebook', 'note',
  'anki', 'flashcards', 'stats',
  'reading', 'novels', 'resources',
  'library', 'player', 'video', 'music', 'musicwidget', 'visualizer',
  'immersion', 'youtube', 'scraper',
  'games', 'city', 'calendar', 'settings',
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const logLines = [];
const log = (m) => { const l = `[surface] ${m}`; logLines.push(l); console.log(l); };
const out = { gate: 'packaged-surface-sweep', stamp, exe: EXE, surfaces: [] };

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => { const { port } = srv.address(); srv.close(() => resolve(port)); });
  });
}

async function findTarget(port, deadline) {
  let seen = [];
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/list`);
      const targets = await res.json();
      seen = targets.filter((t) => t.type === 'page').map((t) => t.url);
      const page = targets.find((t) => t.type === 'page' && /^app:\/\//.test(t.url));
      if (page?.webSocketDebuggerUrl) return page;
    } catch { /* not up */ }
    await sleep(400);
  }
  throw new Error(`no CDP target; saw ${JSON.stringify(seen)}`);
}

class Cdp {
  constructor(url) { this.url = url; this.nextId = 1; this.pending = new Map(); }
  async open() {
    this.socket = new WebSocket(this.url);
    this.socket.addEventListener('message', (event) => {
      let msg; try { msg = JSON.parse(String(event.data)); } catch { return; }
      if (msg.id == null) return;
      const entry = this.pending.get(msg.id);
      if (!entry) return;
      this.pending.delete(msg.id); entry.resolve(msg);
    });
    await new Promise((resolve, reject) => {
      this.socket.addEventListener('open', resolve, { once: true });
      this.socket.addEventListener('error', () => reject(new Error('CDP socket failed')), { once: true });
    });
    return this;
  }
  send(method, params) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve });
      this.socket.send(JSON.stringify({ id, method, params }));
      setTimeout(() => { if (this.pending.delete(id)) reject(new Error(`${method} timed out`)); }, 60_000);
    });
  }
  async evaluate(expression) {
    const msg = await this.send('Runtime.evaluate', {
      expression, awaitPromise: true, returnByValue: true, userGesture: true,
    });
    if (msg.result?.exceptionDetails) {
      throw new Error(msg.result.exceptionDetails.exception?.description ?? 'evaluate threw');
    }
    return msg.result?.result?.value;
  }
  close() { try { this.socket?.close(); } catch { /* gone */ } }
}

const CLOSE_ALL = '(() => {'
  + " const btns = [...document.querySelectorAll('.fwin-close')];"
  + ' btns.forEach((b) => b.click());'
  + " return document.querySelectorAll('.fwin').length;"
  + '})()';

/**
 * The inspection probe. Everything it counts is scoped to the OPENED WINDOW, not the document,
 * so the taskbar and desktop icons cannot make an empty panel look populated.
 */
const INSPECT = '(() => {'
  + " const wins = [...document.querySelectorAll('.fwin')];"
  + ' const w = wins[wins.length - 1] || null;'
  + ' if (!w) return JSON.stringify({ windows: 0 });'
  + ' const body = w.querySelector(".fwin-body") || w;'
  + ' const txt = (body.innerText || "").trim();'
  + ' const vis = (el) => { const r = el.getBoundingClientRect();'
  + '   return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden"; };'
  + ' const q = (sel) => [...body.querySelectorAll(sel)].filter(vis);'
  + ' const imgs = q("img");'
  + ' const decoded = imgs.filter((i) => i.complete && i.naturalWidth > 0);'
  // An empty state is a deliberate marker OR a short body whose text says so. Both are recorded.
  + ' const emptyEl = body.querySelector('
  + '   "[class*=empty],[class*=Empty],[data-empty],[class*=placeholder],[class*=no-results]");'
  + ' const errEl = body.querySelector("[class*=error],[class*=Error],[role=alert]");'
  + ' return JSON.stringify({'
  + '   windows: wins.length,'
  + '   winClass: (w.className || "").slice(0, 80),'
  + '   textLen: txt.length,'
  + '   textHead: txt.slice(0, 160),'
  + '   buttons: q("button").length,'
  + '   inputs: q("input,textarea,select").length,'
  + '   rows: q("li,tr,[role=row],[class*=row],[class*=item],[class*=card]").length,'
  + '   canvases: q("canvas").length,'
  + '   imgs: imgs.length,'
  + '   imgsDecoded: decoded.length,'
  + '   hasEmptyState: !!emptyEl,'
  + '   emptyText: emptyEl ? (emptyEl.innerText || "").trim().slice(0, 120) : null,'
  + '   hasErrorEl: !!errEl,'
  + '   errorText: errEl ? (errEl.innerText || "").trim().slice(0, 160) : null'
  + ' });'
  + '})()';

/**
 * Substantive content, deliberately conservative: chrome alone must not qualify.
 *
 * CORRECTED after the first run, which is the whole reason this comment is long.
 *
 * The first classifier had only CONTENT / EMPTY-HONEST / EMPTY-SILENT and put **five** surfaces in
 * EMPTY-SILENT. Reading what they actually rendered, **none of the five was a defect**:
 *
 *   dictionary  205 chars of real UI: "Search Japanese or English - powered by Jisho (JMdict)",
 *               two language toggles, a Search button and a usage tip. It was one input away from
 *               a query and 15 characters short of the 220-char threshold.
 *   translate   185 chars: "Offline translation via Qwen3 on your machine", Translate/History
 *               tabs and four language selectors.
 *   note        textLen 0 with one input — which is exactly what a NEW NOTE should be.
 *   player      "The media workspace is open in front of this window. / Bring it forward"
 *   video       the same deliberate handoff message, with the affordance to act on it.
 *
 * Those last two are an explicit, honest explanation of state; they were only missed because the
 * element carrying the message has no class matching the empty-state selector. Reporting any of
 * these five as a defect would have been this track's recurring failure — an instrument artifact
 * written up as a finding, exactly like the `closest()` that manufactured 13 phantom defects.
 *
 * So two verdicts were added, and EMPTY-SILENT now means what it was supposed to mean: a panel
 * that mounted, said nothing, and offered nothing to do.
 */
function classify(i) {
  if (!i || !i.windows) return { verdict: 'NOT-OPENED', why: 'no .fwin appeared after os:open' };
  if (i.hasErrorEl && i.errorText) return { verdict: 'ERROR', why: `visible error: ${i.errorText}` };

  const substantive = i.rows >= 3 || i.imgsDecoded >= 1 || i.canvases >= 1
    || i.textLen >= 220 || i.inputs >= 3;
  if (substantive) return { verdict: 'CONTENT', why: null };

  // An editable affordance IS the content on an input-driven surface. A blank note editor and a
  // dictionary with no query yet are both working correctly.
  if (i.inputs >= 1) {
    return {
      verdict: 'CONTENT-AWAITING-INPUT',
      why: `${i.inputs} input(s) ready; this surface is driven by what the user types`,
    };
  }
  if (i.hasEmptyState) {
    return { verdict: 'EMPTY-HONEST', why: i.emptyText || 'explicit empty-state element present' };
  }
  // Explains its own state and gives the user something to do about it.
  if (i.textLen >= 40 && i.buttons >= 1) {
    return { verdict: 'EMPTY-HONEST', why: `explains its state in prose: ${i.textHead}` };
  }
  return {
    verdict: 'EMPTY-SILENT',
    why: `mounted but nothing substantive, no input, no empty state and no explanation `
      + `(textLen ${i.textLen}, rows ${i.rows}, buttons ${i.buttons}, inputs ${i.inputs})`,
  };
}

async function main() {
  if (!fs.existsSync(EXE)) throw new Error(`no packaged build at ${EXE}`);
  out.exeBuiltAt = fs.statSync(EXE).mtime.toISOString();
  fs.mkdirSync(workRoot, { recursive: true });

  const userDataDir = path.join(os.tmpdir(), `jp-surface-${stamp}-${process.pid}`);
  if (fs.existsSync(userDataDir)) throw new Error(`scratch profile ${userDataDir} already exists`);
  fs.mkdirSync(userDataDir, { recursive: true });
  out.userDataDir = userDataDir;

  const cdpPort = await freePort();
  const child = spawn(EXE, [`--user-data-dir=${userDataDir}`, `--remote-debugging-port=${cdpPort}`], {
    stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
    env: { ...process.env, SEANIME_DATADIR: path.join(userDataDir, 'seanime-scratch') },
  });
  child.stdout.resume(); child.stderr.resume();

  try {
    const target = await findTarget(cdpPort, Date.now() + 180_000);
    const cdp = await new Cdp(target.webSocketDebuggerUrl).open();
    out.documentUrl = target.url;

    const deadline = Date.now() + 120_000;
    let ready = null;
    while (Date.now() < deadline) {
      ready = await cdp.evaluate(
        'JSON.stringify({ ready: document.readyState, desktop: !!document.querySelector(".desktop-root") })',
      ).catch(() => null);
      if (ready && JSON.parse(ready).ready === 'complete' && JSON.parse(ready).desktop) break;
      await sleep(500);
    }
    if (!ready || !JSON.parse(ready).desktop) throw new Error(`the desktop never mounted (${ready})`);
    log(`desktop mounted: ${ready}`);

    await cdp.evaluate("(()=>{const b=document.querySelector('.consent-no');if(b){b.click();return 1;}return 0;})()");
    await sleep(2000);

    for (const section of SECTIONS) {
      await cdp.evaluate(CLOSE_ALL).catch(() => 0);
      await sleep(500);
      await cdp.evaluate(
        `(() => { window.dispatchEvent(new CustomEvent('os:open', { detail: ${JSON.stringify(section)} })); return 1; })()`,
      ).catch(() => 0);
      await sleep(2600);
      let info = null;
      try { info = JSON.parse(await cdp.evaluate(INSPECT)); }
      catch (err) { info = null; out.probeError = String(err?.message || err); }
      const { verdict, why } = classify(info);
      out.surfaces.push({ section, verdict, why, ...info });
      log(`${verdict.padEnd(13)} ${section.padEnd(12)} `
        + `${info ? `win=${info.windows} text=${info.textLen} rows=${info.rows} btn=${info.buttons} `
          + `in=${info.inputs} img=${info.imgsDecoded}/${info.imgs} cv=${info.canvases}` : 'no probe'}`
        + `${why ? ` :: ${why}` : ''}`);
    }
    cdp.close();
  } finally {
    try { child.kill(); } catch { /* gone */ }
    await sleep(1200);
  }

  const tally = {};
  for (const s of out.surfaces) tally[s.verdict] = (tally[s.verdict] ?? 0) + 1;
  out.tally = tally;
  log(`tally: ${JSON.stringify(tally)} across ${out.surfaces.length} surfaces`);

  fs.writeFileSync(path.join(workRoot, 'packaged-surface.json'), JSON.stringify(out, null, 2), 'utf-8');
  fs.writeFileSync(path.join(workRoot, 'packaged-surface.log'), logLines.join('\n'), 'utf-8');
  log(`record: ${path.join(workRoot, 'packaged-surface.json')}`);

  // A silently-empty panel is the only verdict that is unambiguously a defect.
  if ((tally['EMPTY-SILENT'] ?? 0) > 0 || (tally.ERROR ?? 0) > 0 || (tally['NOT-OPENED'] ?? 0) > 0) {
    process.exitCode = 1;
  }
}

if (process.argv.slice(2).includes('--selfcheck')) {
  for (const [name, src] of Object.entries({ CLOSE_ALL, INSPECT })) {
    try { new Function(`return ${src}`); } catch (err) {
      console.error(`${name} does not compile: ${err.message}`); process.exit(1);
    }
  }
  // The classifier must not call a bare mount a pass, and must not call an honest empty a defect.
  const base = { windows: 1, rows: 0, textLen: 0, imgsDecoded: 0, canvases: 0, inputs: 0, buttons: 0 };
  const cases = [
    [{ windows: 0 }, 'NOT-OPENED'],
    [{ ...base, rows: 9, textLen: 50 }, 'CONTENT'],
    [{ ...base, textLen: 20, hasEmptyState: true }, 'EMPTY-HONEST'],
    [{ ...base, textLen: 20 }, 'EMPTY-SILENT'],
    [{ windows: 1, hasErrorEl: true, errorText: 'boom' }, 'ERROR'],
    // The five real cases the first run misclassified, as regressions.
    [{ ...base, textLen: 205, buttons: 3, inputs: 1 }, 'CONTENT-AWAITING-INPUT'],   // dictionary
    [{ ...base, textLen: 185, buttons: 10, inputs: 1 }, 'CONTENT-AWAITING-INPUT'],  // translate
    [{ ...base, textLen: 0, inputs: 1 }, 'CONTENT-AWAITING-INPUT'],                 // blank note
    [{ ...base, textLen: 70, buttons: 1, textHead: 'workspace in front' }, 'EMPTY-HONEST'], // player
    // and a genuinely blank panel must still be caught
    [{ ...base, textLen: 5, buttons: 0, inputs: 0 }, 'EMPTY-SILENT'],
  ];
  for (const [input, want] of cases) {
    const got = classify(input).verdict;
    if (got !== want) { console.error(`classifier: expected ${want}, got ${got}`); process.exit(1); }
  }
  console.log(`all page-side probes compile; classifier correct on ${cases.length} cases`);
  process.exit(0);
}

main().catch((error) => {
  log(`ERROR ${error?.stack || error}`);
  try {
    fs.mkdirSync(workRoot, { recursive: true });
    fs.writeFileSync(path.join(workRoot, 'packaged-surface.json'),
      JSON.stringify({ ...out, error: String(error?.message || error) }, null, 2), 'utf-8');
  } catch { /* nothing more to do */ }
  process.exit(1);
});
