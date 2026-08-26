/**
 * RUBRIC CATEGORY 8 HARNESS — "Honest states", parameterised by surface.
 *
 * ONE harness for every surface in the app, per RULE 1. It consolidates the one-off probes that
 * each hardcoded their surface and each had to be rewritten for the next one:
 *   - `l1-honest-states.js`          raw keys + the four states + status candidates, `.fwin` title
 *                                    in a module-level `TITLE`, Dictionary by default
 *   - `l1-honest-states-control.js`  the negative control, as a separate manual step a worker had
 *                                    to remember to run and to interpret
 *   - `l1-raw-keys.js`               the same key sweep again, over EVERY window at once
 *   - `l1-lang-sweep.cjs`            the four-language driver, wired to `l1-raw-keys.js` by path
 * Nothing here names a surface: the root, the window and the label are all arguments, the
 * four-language sweep is a leg rather than a second script, and the negative control runs in the
 * same process as the measurement it has to falsify.
 *
 * Run:
 *   node src/.coordination/liquid-workplace/probes/cat8-honest-states.cjs \
 *     --surface "Dictionary" [--win main] [--label dictionary] [--langs] [--control] [--out <file>] \
 *     [--drive-input "<css>"] [--drive-value "<text>"]
 *
 * --surface takes the same two forms as the category-1 and category-4 harnesses, deliberately, so
 * a surface is named identically in all three: a leading `@` is a CSS SELECTOR (a section of the
 * main window — opening a book replaces the desktop shell, so the `.fwin` count is 0 and a title
 * finds nothing), anything else is a floating window's TITLE. Never an index:
 * `probe-picks-first-visible-fwin` is a recorded false-scoring in this repo.
 * --win pins every bridge call to ONE OS window, mandatory whenever the surface is not in the
 * main window, or `/eval` resolves the FOCUSED window and a run silently scores another surface.
 * --langs adds the four-language leg. It drives Settings, so it costs ~8 s and moves global state;
 * it restores and asserts the restore, and a failed restore VOIDS rather than passes.
 *
 * THE FOUR NUMBERS, and the rubric's 10 needs all four:
 *   rawKeyCount        rendered text that is a bare i18n key (bar: 0, in every language run)
 *   placeholderCount   rendered text that is scaffolding shown as real data (bar: 0)
 *   mutePairCount      a control the user cannot act on and cannot find out why (bar: 0)
 *   statesNamed        of the states OBSERVABLE on this surface, how many render a real message
 *
 * CORRECTIONS CARRIED OVER RATHER THAN RE-DERIVED — each already produced a false result here:
 *  1. `translate()` returns the BARE KEY on a miss (`i18n/core.ts`), so a missing translation
 *     renders as `dict.results.err.addFailed` in the UI. `i18n-check` cannot see this: it compares
 *     catalogs against each other, and a key NO catalog has is missing from all of them equally
 *     and so passes. Detection has to be on RENDERED TEXT.
 *  2. The key pattern requires >= 2 dots. One dot matches real content — `ep01.mkv`, version
 *     strings, `n5.grammar` tags, ordinary prose abbreviations. Candidates are reported
 *     individually, never as a bare count, because the first thing to do with a non-zero is
 *     check it is not a filename.
 *  3. An UNTRANSLATED INTERPOLATION is invisible to both standard guards: a raw-key sweep sees a
 *     real English sentence and a key-count check sees nothing missing. Only asserting that the
 *     rendered string CHANGES between languages finds it — that is what `--langs` is for, and it
 *     is why the leg reports per-language text hashes and not merely per-language key counts.
 *  4. A minimised or 0x0 root measures as perfect. This harness REFUSES rather than record zeros.
 *  5. Presence of a container is NOT the state test. `honesty-probe` records five surfaces
 *     mis-bucketed as EMPTY-SILENT by a selector that never read what was rendered, so a state
 *     counts only when it renders a >= 12-character run that is not itself a key.
 *  6. A state that this surface cannot currently be in has not been measured. It is reported as
 *     `notObservable` and EXCLUDED from the denominator — scoring it as a pass would be the same
 *     fabrication the category exists to catch, and scoring it as a fail would penalise a surface
 *     for a state it does not have.
 *  9. PASSIVE OBSERVATION MEASURES NOTHING ON A HEALTHY SURFACE, and this one bit on the first
 *     surface ever run: Reading Finder rendered 71 text runs, 0 raw keys, 0 placeholders and
 *     0 mute pairs, and all four states came back `hosts: 0` — because the list had 8 results and
 *     nothing had gone wrong. The old code scored `observable.length > 0 && …`, i.e. **FAIL**, on a
 *     surface with no defect. A state must be DRIVEN to be measured. `--drive-input` types an
 *     adverse query into the surface's own filter, re-probes, restores, and ASSERTS the restore by
 *     text hash; a surface with no such input reports `statesNamed: 'UNMEASURED'`, which is neither
 *     a 10 nor a FAIL — it is the honest verdict and it exits 3.
 *  7. The FABRICATED-VALUE verdict still needs an empty scratch profile: on a populated profile
 *     real data and a hardcoded constant look identical. This harness reports status-word
 *     candidates and does NOT issue that verdict. What it DOES decide is the placeholder shapes,
 *     which are wrong on any profile.
 *  8. A comment inside `PROBE`'s template literal must contain no backtick and no dollar-brace.
 *     Both are a `SyntaxError` in the harness rather than in the browser, so the failure names the
 *     wrong file.
 *
 * NEGATIVE CONTROL (`--control`), required by the rubric and run against the SAME root: three
 * deliberate failures are injected into the surface — a bare i18n key as rendered text, a
 * `Lorem ipsum` placeholder, and a disabled button with no explanation of any kind — the probe is
 * re-run, and the harness asserts each count MOVED. Then the node is removed and a third run
 * asserts the numbers returned to baseline. A probe that has not returned a failure this session
 * is unproven, so a `--control` run that fails to move all three exits non-zero and VOIDS the
 * score rather than passing.
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
};
const has = (name) => process.argv.indexOf(`--${name}`) >= 0;

const SURFACE = arg('surface', '');
const WIN = arg('win', '');
const OUT = arg('out', '');
const CONTROL = has('control');
const LANGS = has('langs');
const DRIVE_INPUT = arg('drive-input', '');
// Nonsense on purpose: it must match nothing in ANY catalogue, in any of the four languages.
const DRIVE_VALUE = arg('drive-value', 'zzqqxxnosuchthing');
if (!SURFACE) {
  console.error('REFUSE - --surface is required; this harness names no surface of its own');
  process.exit(2);
}
// A run that dies before it writes leaves the PREVIOUS run's file sitting there looking current.
// That happened on this harness's second surface and a stale FAIL was nearly recorded as fresh.
if (OUT && fs.existsSync(OUT)) fs.unlinkSync(OUT);
const IS_SELECTOR = SURFACE.startsWith('@');
const SELECTOR = IS_SELECTOR ? SURFACE.slice(1) : null;
const LABEL = arg('label', (SELECTOR || SURFACE).replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, ''));

const cfg = JSON.parse(fs.readFileSync(
  path.join(__dirname, '..', '..', '..', '..', 'debug', 'bridge.json'), 'utf8',
));
const H = { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' };
async function post(route, body) {
  const r = await fetch(`http://127.0.0.1:${cfg.port}${route}`, {
    method: 'POST',
    headers: H,
    body: JSON.stringify({ ...(WIN ? { window: WIN } : {}), ...(body || {}) }),
  });
  const t = await r.text();
  try { return JSON.parse(t); } catch { return { raw: t, status: r.status }; }
}
// One expression per /eval; a trailing `;` reads as "Script failed to execute".
async function ev(js) {
  const t = await post('/eval', { js: js.replace(/\s*;\s*$/, '').trimEnd() });
  if (!t.ok) throw new Error(`eval failed: ${JSON.stringify(t).slice(0, 400)}`);
  return t.result;
}
const sleep = (ms) => new Promise((s) => { setTimeout(s, ms); });

const ROOT_EXPR = IS_SELECTOR
  ? `document.querySelector(${JSON.stringify(SELECTOR)})`
  : `[].slice.call(document.querySelectorAll('.fwin')).filter(function(w){
       var r = w.getBoundingClientRect();
       if (!(r.width > 0 && r.height > 0)) return false;
       var t = w.querySelector('.fwin-title-text, .fwin-title');
       return !!t && (t.textContent || '').indexOf(${JSON.stringify(SURFACE)}) >= 0;
     })[0]`;

const PROBE = `(function(){
  var root = ${ROOT_EXPR};
  if (!root) return JSON.stringify({ refuse: 'surface not found: ' + ${JSON.stringify(SURFACE)} });
  var WR = root.getBoundingClientRect();
  if (!WR.width || !WR.height) return JSON.stringify({ refuse: 'surface is 0x0 (minimised or unmounted) - refusing to record zeros' });

  function painted(e){
    return typeof e.checkVisibility === 'function'
      ? e.checkVisibility({ checkOpacity:true, checkVisibilityCSS:true, contentVisibilityAuto:true })
      : true;
  }
  function name(e){
    return e.tagName.toLowerCase() + '.' + String(e.className || '').split(' ')[0];
  }

  // Correction 2: two dots minimum. One dot matches filenames and version strings.
  var KEY = /^[a-z][a-zA-Z0-9]*(?:\\.[a-zA-Z0-9]+){2,}$/;
  // Correction 7: these are wrong on ANY profile, unlike a status word, so they get a verdict.
  var PLACEHOLDER = /\\b(lorem ipsum|dolor sit amet|todo|tbd|fixme|placeholder text|coming soon|example\\.com|foo ?bar|xxx-xxx|sample data)\\b/i;
  var STATUS = /^(connected|ready|available|configured|active|enabled|online|ok)$/i;

  var rawKeys = [], placeholders = [], statusCandidates = [];
  var textRuns = 0, textAcc = [];
  var tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (var t = tw.nextNode(); t; t = tw.nextNode()) {
    var s = t.nodeValue && t.nodeValue.trim();
    if (!s || !t.parentElement || !painted(t.parentElement)) continue;
    textRuns++;
    textAcc.push(s);
    var toks = s.split(/\\s+/);
    for (var i = 0; i < toks.length; i++) {
      if (KEY.test(toks[i])) rawKeys.push({ token: toks[i], el: name(t.parentElement) });
    }
    if (PLACEHOLDER.test(s)) placeholders.push({ text: s.slice(0, 80), el: name(t.parentElement) });
    if (STATUS.test(s)) statusCandidates.push({ text: s, el: name(t.parentElement) });
  }

  // MUTE PAIRS: a control the user cannot act on AND cannot find out why. Disabled is honest only
  // when the surface says what would enable it, so an explanation is looked for in the control's
  // own accessible name extras, its title, its aria-describedby target, and the text of its
  // parent - a hint rendered beside the button is a real explanation and must not read as absent.
  var mutePairs = [];
  var disabled = [].slice.call(root.querySelectorAll('[disabled],[aria-disabled="true"]'));
  for (var d = 0; d < disabled.length; d++) {
    var el = disabled[d];
    if (!painted(el)) continue;
    var described = el.getAttribute('aria-describedby');
    var describedText = '';
    if (described) {
      var ids = described.split(/\\s+/);
      for (var k = 0; k < ids.length; k++) {
        var host = document.getElementById(ids[k]);
        if (host) describedText += ' ' + (host.textContent || '');
      }
    }
    var parentText = el.parentElement ? (el.parentElement.textContent || '') : '';
    var ownText = (el.textContent || '').trim();
    var explanation = [el.getAttribute('title') || '', describedText,
      parentText.replace(ownText, '')].join(' ').trim();
    if (explanation.length < 12) {
      mutePairs.push({ el: name(el), label: ownText.slice(0, 40) });
    }
  }

  // Correction 5: a state counts only when it RENDERS a real message, and correction 6: a state
  // this surface cannot currently be in is reported as unobservable rather than scored either way.
  function textOf(sel){
    var out = [];
    var found = [].slice.call(root.querySelectorAll(sel));
    for (var j = 0; j < found.length; j++) {
      if (!painted(found[j])) continue;
      var v = (found[j].textContent || '').trim();
      if (v.length >= 12 && !KEY.test(v)) out.push(v);
    }
    return { hosts: found.length, messages: out };
  }
  var states = {
    empty: textOf('[class*="empty"],[class*="placeholder"],[class*="no-results"]'),
    loading: textOf('[class*="loading"],[class*="spinner"],[aria-busy="true"]'),
    error: textOf('[class*="error"],[class*="err"],[role="alert"]'),
    offline: textOf('[class*="offline"],[class*="unreachable"],[class*="disconnected"]')
  };

  var joined = textAcc.join('\\u0000');
  var hash = 0;
  for (var h = 0; h < joined.length; h++) { hash = ((hash * 31) + joined.charCodeAt(h)) | 0; }

  return JSON.stringify({
    lang: document.documentElement.getAttribute('lang') || null,
    storedLang: (function(){ try { return localStorage.getItem('ui-lang'); } catch (e) { return null; } })(),
    theme: document.documentElement.getAttribute('data-theme'),
    rect: Math.round(WR.width) + 'x' + Math.round(WR.height),
    textRuns: textRuns,
    textHash: hash,
    rawKeyCount: rawKeys.length,
    rawKeys: rawKeys.slice(0, 10),
    placeholderCount: placeholders.length,
    placeholders: placeholders.slice(0, 8),
    mutePairCount: mutePairs.length,
    mutePairs: mutePairs.slice(0, 8),
    disabledTotal: disabled.length,
    states: states,
    statusCandidatesNeedingEmptyProfile: statusCandidates.slice(0, 8)
  });
})()`;

const CONTROL_INJECT = `(function(){
  var root = ${ROOT_EXPR};
  if (!root) return JSON.stringify({ refuse: 'surface not found for control injection' });
  var host = document.createElement('div');
  host.id = '__lq_cat8_control';
  var key = document.createElement('span');
  key.textContent = 'dict.results.err.addFailed';
  var ph = document.createElement('p');
  ph.textContent = 'Lorem ipsum dolor sit amet, consectetur.';
  // The three failures must be INDEPENDENT. Injected as siblings of one div they were not: the
  // mute detector reads the control's parent text as an explanation, so the Lorem paragraph
  // explained the disabled button and moved.mutePairs came back false on a working detector.
  var muteHost = document.createElement('div');
  var mute = document.createElement('button');
  mute.disabled = true;
  mute.textContent = 'Go';
  muteHost.appendChild(mute);
  host.appendChild(key);
  host.appendChild(ph);
  host.appendChild(muteHost);
  root.appendChild(host);
  return JSON.stringify({ injected: true });
})()`;

const CONTROL_REMOVE = `(function(){
  var n = document.getElementById('__lq_cat8_control');
  if (n && n.parentElement) n.parentElement.removeChild(n);
  return JSON.stringify({ removed: !!n });
})()`;

const clickLang = (tag) => `(function(){
  var b = [].slice.call(document.querySelectorAll('.sp-seg-btn')).filter(function(x){
    return x.getAttribute('lang') === ${JSON.stringify('TAG')}.replace('TAG', ${JSON.stringify(tag)}); })[0];
  if (!b) return JSON.stringify({ refuse: 'no .sp-seg-btn for that lang tag' });
  b.click();
  return JSON.stringify({ clicked: ${JSON.stringify(tag)} });
})()`;

/**
 * Raise the surface's window before measuring.
 *
 * `document.elementFromPoint` and `checkVisibility` are document-global, so with overlapping
 * `.fwin` windows a probe silently measures whichever is on top. The taskbar button is the only
 * safe raise: a pointerdown on the frame fires edge-snap and persists a full-desk resize.
 */
async function raise() {
  if (IS_SELECTOR) return 'root surface - no taskbar button';
  const r = await ev(`(function(){
    var w = ${ROOT_EXPR};
    if (!w) return 'no window';
    var b = [].slice.call(document.querySelectorAll('.os-task-win')).filter(function(x){
      return (x.getAttribute('title') || '').indexOf(${JSON.stringify(SURFACE)}) >= 0; })[0];
    if (!b) return 'no-taskbar-button';
    var hidden = getComputedStyle(w).display === 'none';
    var zs = [].slice.call(document.querySelectorAll('.fwin')).map(function(x){ return Number(getComputedStyle(x).zIndex) || 0; });
    var onTop = (Number(getComputedStyle(w).zIndex) || 0) >= Math.max.apply(null, zs);
    if (hidden || !onTop) { b.click(); return hidden ? 'restored' : 'raised'; }
    return 'already-on-top';
  })()`);
  await post('/focus', {});
  await sleep(300);
  return r;
}

const run = async () => JSON.parse(await ev(PROBE));

/**
 * Correction 9: DRIVE the empty state rather than waiting for it.
 *
 * Typed through the native value setter plus a bubbling `input` event, because React listens on
 * `input` and assigning `.value` directly leaves its state a render behind — a recorded false
 * result in this repo. The original value is captured first and put back the same way, and the
 * restore is asserted on the surface's own text hash rather than by eye.
 */
const setInput = (sel, value) => `(function(){
  var root = ${ROOT_EXPR};
  if (!root) return JSON.stringify({ refuse: 'surface not found for drive' });
  var el = root.querySelector(${JSON.stringify(sel)});
  if (!el) return JSON.stringify({ refuse: 'drive input not found: ' + ${JSON.stringify(sel)} });
  var was = el.value;
  var proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  var setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
  el.focus();
  setter.call(el, ${JSON.stringify(value)});
  el.dispatchEvent(new Event('input', { bubbles: true }));
  return JSON.stringify({ was: was, now: el.value });
})()`;

async function driveLeg(base) {
  const set = JSON.parse(await ev(setInput(DRIVE_INPUT, DRIVE_VALUE)));
  if (set.refuse) return { refuse: set.refuse };
  await sleep(600);
  const driven = await run();
  if (driven.refuse) { await ev(setInput(DRIVE_INPUT, set.was)); return { refuse: `driven: ${driven.refuse}` }; }
  const back = JSON.parse(await ev(setInput(DRIVE_INPUT, set.was)));
  await sleep(600);
  const restored = await run();
  return {
    input: DRIVE_INPUT,
    value: DRIVE_VALUE,
    originalValue: set.was,
    // A drive that changed nothing has not driven anything; scoring its states would be fabrication.
    surfaceChanged: driven.textHash !== base.textHash,
    restored: restored.textHash === base.textHash && back.now === set.was,
    driven: {
      textRuns: driven.textRuns,
      states: driven.states,
      mutePairCount: driven.mutePairCount,
      mutePairs: driven.mutePairs,
      rawKeyCount: driven.rawKeyCount,
      rawKeys: driven.rawKeys,
      placeholderCount: driven.placeholderCount,
    },
  };
}

/** A state is observable if EITHER the resting surface or the driven one renders its host. */
function mergeStates(a, b) {
  const out = {};
  for (const k of Object.keys(a)) {
    out[k] = {
      hosts: Math.max(a[k].hosts, b ? b[k].hosts : 0),
      messages: a[k].messages.concat(b ? b[k].messages : []),
    };
  }
  return out;
}

/**
 * Correction 3: run the surface in all four languages and compare RENDERED TEXT, not key counts.
 *
 * A per-language key count catches a missing catalog entry. It cannot catch an untranslated
 * interpolation, which renders as a real English sentence in every language — the defect this
 * repo has now shipped twice. Two languages whose text hashes are identical on a surface with
 * text runs are either both untranslated or both the same language, and neither is a pass.
 */
async function langLeg() {
  const tags = [
    { tag: 'en', stored: 'en' },
    { tag: 'ja', stored: 'ja' },
    { tag: 'zh-Hans', stored: 'zh' },
    { tag: 'ru', stored: 'ru' },
  ];
  const before = JSON.parse(await ev(
    "JSON.stringify({html:document.documentElement.lang,stored:localStorage.getItem('ui-lang')})",
  ));
  const perLang = [];
  for (const l of tags) {
    const clicked = JSON.parse(await ev(clickLang(l.tag)));
    if (clicked.refuse) return { refuse: `${clicked.refuse} (${l.tag}) - the Settings language control must be on screen` };
    // The catalog is a dynamic import; the switch lands on its resolution, not on the click.
    await sleep(1400);
    const r = await run();
    if (r.refuse) return { refuse: `${l.tag}: ${r.refuse}` };
    if (r.storedLang !== l.stored) {
      return { refuse: `language did not take: asked ${l.stored}, storage says ${r.storedLang} - the previous language would have been measured twice` };
    }
    perLang.push({
      lang: l.stored, htmlLang: r.lang, textRuns: r.textRuns, textHash: r.textHash,
      rawKeyCount: r.rawKeyCount, rawKeys: r.rawKeys,
    });
  }
  const restoreTag = before.stored === 'zh' ? 'zh-Hans' : (before.stored || 'en');
  await ev(clickLang(restoreTag));
  await sleep(1400);
  const after = JSON.parse(await ev(
    "JSON.stringify({html:document.documentElement.lang,stored:localStorage.getItem('ui-lang')})",
  ));
  const hashes = perLang.map((p) => p.textHash);
  return {
    perLang,
    before,
    after,
    restored: after.stored === before.stored && after.html === before.html,
    rawKeyCountMax: Math.max(...perLang.map((p) => p.rawKeyCount)),
    // Distinct hashes are the evidence that the surface actually re-rendered per language.
    distinctHashes: new Set(hashes).size,
  };
}

(async () => {
  const raised = await raise();
  const base = await run();
  if (base.refuse) { console.error(`REFUSE - ${base.refuse}`); process.exit(2); }
  base.raised = raised;
  // Correction 4's sibling: a surface with nothing rendered has not been measured, and the rubric
  // caps an empty measurement at 0 rather than letting it read as four clean zeros.
  if (base.textRuns === 0) {
    console.error('VOID - 0 rendered text runs; an empty surface scores 0, not 10');
    process.exit(3);
  }

  if (LANGS) {
    base.languages = await langLeg();
    if (base.languages.refuse) { console.error(`VOID - language leg: ${base.languages.refuse}`); process.exit(3); }
    if (!base.languages.restored) {
      console.error(`VOID - language not restored: ${JSON.stringify({ before: base.languages.before, after: base.languages.after })}`);
      process.exit(3);
    }
  }

  if (DRIVE_INPUT) {
    base.drive = await driveLeg(base);
    if (base.drive.refuse) { console.error(`VOID - drive leg: ${base.drive.refuse}`); process.exit(3); }
    if (!base.drive.restored) {
      console.error(`VOID - drive did not restore the surface: ${JSON.stringify(base.drive)}`);
      process.exit(3);
    }
    if (!base.drive.surfaceChanged) {
      console.error('VOID - the drive input changed nothing; it is not this surface\'s filter');
      process.exit(3);
    }
  }

  // Correction 9: the driven pass contributes its states, and its mute pairs — a control that only
  // goes disabled when the list empties is invisible to a resting probe.
  const allStates = mergeStates(base.states, base.drive ? base.drive.driven.states : null);
  const observable = Object.entries(allStates).filter(([, v]) => v.hosts > 0);
  const named = observable.filter(([, v]) => v.messages.length > 0);
  const muteWorst = Math.max(base.mutePairCount, base.drive ? base.drive.driven.mutePairCount : 0);
  const bars = {
    rawKeys: LANGS ? base.languages.rawKeyCountMax === 0 : base.rawKeyCount === 0,
    placeholders: base.placeholderCount === 0,
    mutePairs: muteWorst === 0,
    // Correction 6: only the states this surface can be in are in the denominator.
    // Correction 9: zero observable states is UNMEASURED, not a fail and not a 10.
    statesNamed: observable.length === 0 ? 'UNMEASURED' : named.length === observable.length,
    // Correction 3: with --langs, the surface must demonstrably differ between languages.
    languagesDiffer: !LANGS || base.languages.distinctHashes > 1,
  };
  const unmeasured = Object.entries(bars).filter(([, v]) => v === 'UNMEASURED').map(([k]) => k);
  const pass = Object.values(bars).every((v) => v === true);

  const out = {
    label: LABEL,
    surface: SURFACE,
    win: WIN || '(focused)',
    ...base,
    statesObservable: observable.map(([k]) => k),
    statesNotObservable: Object.entries(allStates).filter(([, v]) => v.hosts === 0).map(([k]) => k),
    statesNamed: `${named.length} of ${observable.length} observable`,
    mutePairCountWorst: muteWorst,
    bars,
    verdict: pass
      ? 'PASS 10/10'
      : (unmeasured.length && !Object.values(bars).some((v) => v === false)
        ? `UNMEASURED - ${unmeasured.join(',')}; drive the surface with --drive-input or score 0, never 10`
        : 'FAIL'),
    failedBars: Object.entries(bars).filter(([, v]) => v === false).map(([k]) => k),
    unmeasuredBars: unmeasured,
    notMeasuredHere: [
      'dead-control count (honesty-probe A - every control driven for a side effect)',
      'fabricated-value verdict (honesty-probe B - needs an empty scratch profile)',
    ],
  };

  if (CONTROL) {
    const inj = JSON.parse(await ev(CONTROL_INJECT));
    if (inj.refuse) { console.error(`REFUSE - control: ${inj.refuse}`); process.exit(2); }
    const dirty = await run();
    await ev(CONTROL_REMOVE);
    const restored = await run();
    const moved = {
      rawKeys: dirty.rawKeyCount > base.rawKeyCount,
      placeholders: dirty.placeholderCount > base.placeholderCount,
      mutePairs: dirty.mutePairCount > base.mutePairCount,
    };
    const backToBaseline = restored.rawKeyCount === base.rawKeyCount
      && restored.placeholderCount === base.placeholderCount
      && restored.mutePairCount === base.mutePairCount;
    out.control = {
      moved,
      backToBaseline,
      counts: {
        base: [base.rawKeyCount, base.placeholderCount, base.mutePairCount],
        dirty: [dirty.rawKeyCount, dirty.placeholderCount, dirty.mutePairCount],
        restored: [restored.rawKeyCount, restored.placeholderCount, restored.mutePairCount],
      },
    };
    if (!Object.values(moved).every(Boolean) || !backToBaseline) {
      out.verdict = 'VOID - negative control did not falsify';
    }
  }

  const text = JSON.stringify(out, null, 2);
  if (OUT) fs.writeFileSync(OUT, text);
  console.log(text);
  // 0 pass, 1 a real failure, 3 unmeasured/void — an unmeasured surface must never be filed as a
  // clean fail, because a fail is a defect list and this one has no defects to fix.
  process.exit(out.verdict.startsWith('PASS') ? 0 : (out.verdict.startsWith('UNMEASURED') ? 3 : 1));
})().catch((e) => { console.error(String(e && e.message ? e.message : e)); process.exit(4); });
