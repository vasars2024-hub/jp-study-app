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
 *     [--drive-input "<css>"] [--drive-click "<css>" [--drive-undo "<css>"]] [--drive-value "<text>"]
 *
 * --drive-click and --drive-input may be given TOGETHER (correction 36): the click is then the
 * OPENER for a filter that is not mounted at rest, and the typing leg runs inside it.
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
 *   rawKeyCount        rendered text that is a bare i18n key (bar: 0, in every language run).
 *                      A KEY IS ONE THAT EXISTS IN THE CATALOGS — see correction 19 beside
 *                      `refineRawKeys`; the shape alone also matches every hostname on screen.
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
 * 10. MOST SURFACES HERE FILTER BY BUTTON, NOT BY TEXT. Library's only text input lives inside its
 *     Import modal; the manga reader, the VN panel and Novels have none at all — so correction 9's
 *     leg alone left four of L6's six surfaces UNMEASURED. `--drive-click` presses a filter and
 *     `--drive-undo` presses the way back, because these are SETS of chips (`all | L1 … L7`), not
 *     toggles. Both legs assert the restore by text hash, which is what makes pressing a real
 *     control on a real profile safe to do here.
 * 11. A NEIGHBOURING CONTROL'S LABEL IS NOT AN EXPLANATION, and reading the parent's textContent
 *     minus the button's own text made it one. Scraper's six disabled buttons scored 0 mute pairs
 *     purely because they share a row with each other's long captions; Translate scored 1 rather
 *     than 2 because its neighbour is the short word "Translate". The explanation now excludes text
 *     inside any interactive sibling, so prose beside a control still counts and a caption never
 *     does. Expect previously-0 surfaces to rise: that is the repair, not a regression.
 * 12. THE >= 12-CHARACTER BAR WAS A LATIN-ALPHABET ASSUMPTION, in both the mute detector and
 *     `textOf`. A complete Japanese sentence runs 10-12 characters and a Chinese one 9-10, so an
 *     honest ja/zh title scored as MUTE and an honest ja/zh empty state scored as not-a-message.
 *     Found by a test, not by a run: `grammarDisabledReasons.test.ts` applies the same bar to all
 *     four catalogs and went red on ja `noForward` (11) and zh `noSelection` (10) for strings that
 *     read as full sentences. The bar is now WEIGHTED - a CJK ideograph, kana or fullwidth mark
 *     counts 2 - so 12 still means "about a dozen Latin letters" and no copy has to be padded to
 *     satisfy an English-shaped constant. Lowering the constant instead would have let a genuinely
 *     mute two-word English hint through.
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
/**
 * CORRECTION 37, Scraper 2026-09-04. A SURFACE THAT WRITES ITS OWN LIVE METRICS CANNOT BE
 * RESTORED, so the drive leg VOIDs a surface with no defect.
 *
 * The Scraper rail paints `Memory: NNN MB` and `CPU: N%`. At rest they are stable — sampled
 * 7 s apart, `innerText` diff 0 lines — but a drive is exactly the thing that moves them:
 * clicking Downloads and clicking back to History produced a ONE-LINE diff,
 * `Memory: 777 MB` -> `Memory: 778 MB`, and `restored` compares `textHash`, so the run VOIDed
 * with `surfaceChanged: true, restored: false` on a round trip that genuinely restored.
 *
 * This is category 2's correction 19 arriving at the other harness. It is deliberately
 * NARROWER here: a churn region is dropped from the HASH only. Its runs still count in
 * `textRuns`/`wordRuns` and are still scanned for raw keys, placeholders and status text, so
 * no bar term is weakened and an empty surface cannot hide behind the flag.
 *
 * The exclusion is not taken on trust, for the same reason cat2 does not take it on trust:
 * `churnHash` must actually MOVE between the base and the driven reading, or the flag is
 * widening the pass band for nothing and the run VOIDs. A selector that matches no text VOIDs
 * too — silence is how the wrong exclusion gets banked.
 */
const CHURN = arg('churn', '');
const DRIVE_INPUT = arg('drive-input', '');
// Nonsense on purpose: it must match nothing in ANY catalogue, in any of the four languages.
const DRIVE_VALUE = arg('drive-value', 'zzqqxxnosuchthing');
// Correction 10: most surfaces here filter by BUTTON, not by text. Library's only text input is
// inside its Import modal; the manga reader, the VN panel and Novels have none at all. A harness
// that can only type can score a third of the app.
const DRIVE_CLICK = arg('drive-click', '');
const DRIVE_UNDO = arg('drive-undo', '');
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
  // `ok:true` WITH `{__error}` IS A THROW, not an answer: main caught the exception, so
  // the REQUEST succeeded and `.ok` is true. Readers that JSON.parse the result then report
  // `"[object Object]" is not valid JSON`, which names neither the throw nor the expression.
  // Measured 2026-09-03: a null deref inside one cat6 mutation surfaced only as that message.
  if (t.result && typeof t.result === 'object' && t.result.__error) {
    throw new Error(`eval THREW in the renderer: ${t.result.__error} :: ${js.trim().slice(0, 200)}`);
  }
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
  /*
   * CORRECTION 29, Wired shell 2026-08-31. The desktop CONTAINS every floating
   * application window. Scanning root.querySelectorAll therefore charged the shell for
   * Media Center empty states and Settings disabled controls, while the language leg
   * compared whichever hosted app happened to be open. Categories 3 through 6 already
   * carry this boundary. The category-8 population is likewise what the shell authors:
   * descendants of a hosted .fwin are excluded, and the exclusion count is published.
   * (No backtick or dollar-brace syntax in this in-page comment; correction 8.)
   */
  var isShell = root.classList.contains('os-desktop');
  function rq(sel){
    var list = [].slice.call(root.querySelectorAll(sel));
    return isShell ? list.filter(function(e){ return !e.closest('.fwin'); }) : list;
  }
  function name(e){
    return e.tagName.toLowerCase() + '.' + String(e.className || '').split(' ')[0];
  }
  // Correction 37: the declared self-writing regions, dropped from the HASH and from nothing
  // else. Membership is by ancestry so a metric line's own text node is reached.
  var churnSel = ${JSON.stringify(CHURN)};
  var churnEls = churnSel ? rq(churnSel) : [];
  function inChurn(e){
    if (!churnEls.length || !e) return false;
    for (var a = e; a && a !== root.parentElement; a = a.parentElement) {
      for (var ci = 0; ci < churnEls.length; ci++) if (churnEls[ci] === a) return true;
    }
    return false;
  }
  // Correction 13: a mute pair reported as \`button.\` with an empty label is a finding NOBODY
  // CAN ACT ON. An icon-only button has no class and no text, so two separate surfaces both
  // reported the identical unidentifiable row and the only way to find the actual control was a
  // bespoke second probe per surface - exactly the per-surface cost RULE 1 exists to remove.
  // Identity here is everything that survives having no text: the ancestor chain that carries
  // the classes, the icon's own shape, the DOM index, and the box.
  function identify(e){
    var chain = [];
    for (var a = e.parentElement, n = 0; a && a !== root && n < 3; a = a.parentElement, n++) {
      var c = String(a.className || '').split(' ').filter(Boolean)[0];
      if (c) chain.push(a.tagName.toLowerCase() + '.' + c);
    }
    var svg = e.querySelector && e.querySelector('svg');
    var r = e.getBoundingClientRect();
    var sibs = e.parentElement ? [].slice.call(e.parentElement.children).indexOf(e) : -1;
    return {
      el: name(e),
      label: (e.textContent || '').trim().slice(0, 40),
      ariaLabel: e.getAttribute('aria-label') || null,
      title: e.getAttribute('title') || null,
      // The icon is often the ONLY thing that distinguishes two identical-looking buttons.
      icon: svg ? (String(svg.getAttribute('class') || '') || (svg.querySelector('path')
        ? 'path:' + String(svg.querySelector('path').getAttribute('d') || '').slice(0, 24)
        : 'svg')) : null,
      ancestors: chain,
      childIndex: sibs,
      box: Math.round(r.left) + ',' + Math.round(r.top) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height),
    };
  }

  // Correction 2: two dots minimum. One dot matches filenames and version strings.
  var KEY = /^[a-z][a-zA-Z0-9]*(?:\\.[a-zA-Z0-9]+){2,}$/;
  // Correction 7: these are wrong on ANY profile, unlike a status word, so they get a verdict.
  var PLACEHOLDER = /\\b(lorem ipsum|dolor sit amet|todo|tbd|fixme|placeholder text|coming soon|example\\.com|foo ?bar|xxx-xxx|sample data)\\b/i;
  var STATUS = /^(connected|ready|available|configured|active|enabled|online|ok)$/i;

  // Correction 12: the length bar is WEIGHTED, because 12 Latin letters and 12 Japanese
  // characters are not the same amount of sentence. CJK ideographs, kana and fullwidth marks
  // count 2, so the bar keeps meaning "about a dozen Latin letters" in every language.
  var CJK = /[\\u3000-\\u303f\\u3040-\\u30ff\\u3400-\\u4dbf\\u4e00-\\u9fff\\uf900-\\ufaff\\uff00-\\uffef]/;
  function weigh(s){
    var w = 0;
    for (var c = 0; c < s.length; c++) w += CJK.test(s.charAt(c)) ? 2 : 1;
    return w;
  }

  var rawKeys = [], placeholders = [], statusCandidates = [];
  var textRuns = 0, textAcc = [], devOnlyRuns = 0, hostedTextRunsExcluded = 0, wordRuns = 0;
  var churnTextRuns = 0, churnAcc = [];
  var tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (var t = tw.nextNode(); t; t = tw.nextNode()) {
    var s = t.nodeValue && t.nodeValue.trim();
    if (!s || !t.parentElement || !painted(t.parentElement)) continue;
    if (isShell && t.parentElement.closest('.fwin')) { hostedTextRunsExcluded++; continue; }
    /*
     * CORRECTION 28, City 2026-08-31. A data-dev-only subtree renders behind
     * import.meta.env.DEV and is absent from every packaged build, so scoring a surface on
     * it scores text no user can see. Category 4's correction 21 already excludes exactly
     * this element on exactly this surface; this is the same rule reaching the other
     * harness, not a new exemption. It matters here rather than anywhere else because
     * City's ENTIRE painted text is three window glyphs plus the seven runs of
     * .reading-garden-sky-console -- with the console counted, cat8 read languagesDiffer
     * false and scored the surface FAIL on an untranslated DEBUG panel. The count is
     * reported, never silently dropped, so a reader can add it back.
     * (No backtick anywhere in here: correction 8 -- one ends the template literal.)
     */
    if (t.parentElement.closest('[data-dev-only]')) { devOnlyRuns++; continue; }
    textRuns++;
    // A run that is WORDS. languagesDiffer can only be answered by text a catalog could
    // hold; City's surviving population after the exclusion above is the three window
    // control glyphs, which are identical in every language BY DESIGN. Scoring that as
    // languagesDiffer false files a localisation defect against a surface that has no
    // localisable text at all -- a fabricated finding of exactly the shape correction 21
    // was written for, pointing the other way.
    if (/\\p{L}/u.test(s)) wordRuns++;
    if (inChurn(t.parentElement)) { churnTextRuns++; churnAcc.push(s); } else textAcc.push(s);
    var toks = s.split(/\\s+/);
    for (var i = 0; i < toks.length; i++) {
      if (KEY.test(toks[i])) rawKeys.push({ token: toks[i], el: name(t.parentElement) });
    }
    if (PLACEHOLDER.test(s)) placeholders.push({ text: s.slice(0, 80), el: name(t.parentElement) });
    if (STATUS.test(s)) statusCandidates.push({ text: s, el: name(t.parentElement) });
  }

  /*
   * A native input placeholder is painted text, even though TreeWalker cannot see it because
   * it is an attribute rather than a text node. On a deliberately minimal editor it is also
   * the empty-state message. Count it only while the field is actually empty, so a hidden
   * placeholder behind user content does not earn either the text or state bar. This is a
   * form-control rule, not a sticky-note selector; every surface gets the same accounting.
   */
  var emptyFormPrompts = [];
  var promptControls = rq('input[placeholder],textarea[placeholder]');
  for (var pi = 0; pi < promptControls.length; pi++) {
    var pe = promptControls[pi];
    var ps = (pe.getAttribute('placeholder') || '').trim();
    if (!painted(pe) || String(pe.value || '').length > 0 || !ps) continue;
    textRuns++;
    if (/\\p{L}/u.test(ps)) wordRuns++;
    if (inChurn(pe)) { churnTextRuns++; churnAcc.push(ps); } else textAcc.push(ps);
    var ptoks = ps.split(/\\s+/);
    for (var pti = 0; pti < ptoks.length; pti++) {
      if (KEY.test(ptoks[pti])) rawKeys.push({ token: ptoks[pti], el: name(pe), source: 'placeholder' });
    }
    /*
     * CORRECTION 47 -- A FORMAT HINT IN A placeholder ATTRIBUTE IS NOT FAKE DATA.
     * (Written without backticks on purpose: this whole PROBE is a template literal, and one
     * backtick in a comment closes it -- the file then does not parse at all.)
     *
     * novels failed this bar on ONE string: https://example.com/book.epub, the placeholder of
     * the "Direct EPUB URL" input (NovelsContent.tsx:992). Correction 7's own words for this
     * list are "these are wrong on ANY profile", and the harm the bar names is content that
     * MASQUERADES AS THE USER'S DATA. A URL-shaped hint in an empty URL field is the opposite
     * of that: it is visibly not data, it vanishes the moment the user types, it is the
     * standard way to show the expected input shape, and RFC 2606 reserves example.com for
     * exactly this. Scoring it dishonest would push the product toward a WORSE placeholder --
     * this repo's own convention next door is https://api.jiten.moe/api and
     * https://proxy.example:8080, i.e. a plausible-looking host, which is strictly MORE
     * confusable with real data.
     *
     * NARROW ON PURPOSE, and only along the axis that argument covers:
     *  - Only in the placeholder ATTRIBUTE. The same token in a rendered TEXT RUN stays fatal
     *    -- there it IS pretending to be content, and that is where the control plants it.
     *  - Only the example-host terms. lorem ipsum / todo / tbd / fixme / coming soon /
     *    sample data / foo bar stay fatal even as a placeholder: those name unfinished work
     *    rather than an input format, and no field legitimately hints them.
     */
    var HINT_OK = /^(?:https?:\\/\\/)?[^\\s]*\\bexample\\.(?:com|org|net)\\b/i;
    if (PLACEHOLDER.test(ps) && !HINT_OK.test(ps)) placeholders.push({ text: ps.slice(0, 80), el: name(pe), source: 'placeholder' });
    if (STATUS.test(ps)) statusCandidates.push({ text: ps, el: name(pe), source: 'placeholder' });
    emptyFormPrompts.push({ el: name(pe), message: ps, named: weigh(ps) >= 12 && !KEY.test(ps) });
  }

  // MUTE PAIRS: a control the user cannot act on AND cannot find out why. Disabled is honest only
  // when the surface says what would enable it, so an explanation is looked for in the control's
  // own accessible name extras, its title, its aria-describedby target, and the text of its
  // parent - a hint rendered beside the button is a real explanation and must not read as absent.
  // Correction 11: a NEIGHBOURING CONTROL'S LABEL IS NOT AN EXPLANATION. The old reading was the
  // parent's textContent minus the button's own text, so a row of six disabled buttons explained
  // each other and Scraper scored 0 mute pairs on six unexplained controls, while Translate scored
  // 1 only because its neighbour happened to be the short word "Translate". Prose beside a control
  // is a real explanation and still counts; another button's caption never is.
  var INTERACTIVE = 'button,a,input,select,textarea,summary,label,[role="button"],[role="link"],'
    + '[role="tab"],[role="menuitem"],[role="checkbox"],[role="switch"],[role="radio"],[role="option"]';
  function explanatoryText(el){
    var p = el.parentElement;
    if (!p) return '';
    var out = '';
    var w = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
    for (var n = w.nextNode(); n; n = w.nextNode()) {
      var host = n.parentElement;
      if (!host || el === host || el.contains(host)) continue;
      if (!painted(host)) continue;
      var interactive = false;
      for (var a = host; a && a !== p.parentElement; a = a.parentElement) {
        if (a.matches && a.matches(INTERACTIVE)) { interactive = true; break; }
      }
      if (interactive) continue;
      out += ' ' + (n.nodeValue || '');
    }
    return out;
  }

  var mutePairs = [];
  var disabled = rq('[disabled],[aria-disabled="true"]');
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
    var ownText = (el.textContent || '').trim();
    var explanation = [el.getAttribute('title') || '', describedText,
      explanatoryText(el)].join(' ').trim();
    if (weigh(explanation) < 12) {
      var row = identify(el);
      row.ownText = ownText.slice(0, 40);
      mutePairs.push(row);
    }
  }

  // Correction 5: a state counts only when it RENDERS a real message, and correction 6: a state
  // this surface cannot currently be in is reported as unobservable rather than scored either way.
  // Correction 39: hosts used to be found.length - the RAW query count - while messages was
  // filtered by painted(). So any UNPAINTED host put a member in the denominator that could
  // never put one in the numerator, i.e. a guaranteed FAIL that no product change could clear.
  // Measured on Dictionary 2026-09-02: p.muted.lexicon-notes-empty carries a real, correct,
  // translated empty message ("You have not written any notes yet...") but sits inside a CLOSED
  // details.lexicon-notes-browser, so checkVisibility() is false - hosts 1, messages 0,
  // statesNamed "0 of 1 observable", FAIL on an honest surface. This is the recorded
  // closed-details-rect-lies trap: a collapsed group's child still answers a query and still
  // reports a box. An unpainted host means the user is not being shown that state at all,
  // which is precisely correction 6's "cannot currently be in it" - so it belongs in NEITHER
  // column. Note this cannot hide the defect it exists to catch: a PAINTED host whose text is
  // absent or under the weight bar still scores hosts 1 with messages 0.
  // (No backtick or dollar-brace syntax in this in-page comment; correction 8.)
  function textOf(sel){
    var out = [];
    var found = rq(sel);
    var live = 0;
    var unpainted = [];
    for (var j = 0; j < found.length; j++) {
      if (!painted(found[j])) {
        unpainted.push(identify(found[j]));
        continue;
      }
      live++;
      var v = (found[j].textContent || '').trim();
      if (weigh(v) >= 12 && !KEY.test(v)) out.push(v);
    }
    return { hosts: live, messages: out, unpaintedHosts: unpainted.length, unpainted: unpainted };
  }
  var states = {
    empty: textOf('[class*="empty"],[class*="placeholder"],[class*="no-results"]'),
    loading: textOf('[class*="loading"],[class*="spinner"],[aria-busy="true"]'),
    error: textOf('[class*="error"],[class*="err"],[role="alert"]'),
    offline: textOf('[class*="offline"],[class*="unreachable"],[class*="disconnected"]')
  };
  if (emptyFormPrompts.length) {
    states.empty.hosts += emptyFormPrompts.length;
    states.empty.messages = states.empty.messages.concat(
      emptyFormPrompts.filter(function(p){ return p.named; }).map(function(p){ return p.message; })
    );
    states.empty.formPrompts = emptyFormPrompts;
  }

  var joined = textAcc.join('\\u0000');
  var hash = 0;
  for (var h = 0; h < joined.length; h++) { hash = ((hash * 31) + joined.charCodeAt(h)) | 0; }
  var cjoined = churnAcc.join('\\u0000');
  var churnHash = 0;
  for (var ch = 0; ch < cjoined.length; ch++) { churnHash = ((churnHash * 31) + cjoined.charCodeAt(ch)) | 0; }

  return JSON.stringify({
    lang: document.documentElement.getAttribute('lang') || null,
    storedLang: (function(){ try { return localStorage.getItem('ui-lang'); } catch (e) { return null; } })(),
    theme: document.documentElement.getAttribute('data-theme'),
    rect: Math.round(WR.width) + 'x' + Math.round(WR.height),
    textRuns: textRuns,
    devOnlyRuns: devOnlyRuns,
    hostedTextRunsExcluded: hostedTextRunsExcluded,
    hostedWindowsExcluded: isShell ? root.querySelectorAll('.fwin').length : 0,
    wordRuns: wordRuns,
    textHash: hash,
    churnTextRuns: churnTextRuns,
    churnHash: churnHash,
    // Correction 19: the WHOLE candidate list, not the first ten. The node side decides
    // which of these are real catalog keys, and it cannot subtract from a truncated list.
    // Capped anyway, with the cap declared, so a pathological surface refuses rather than
    // silently reporting a partial count as a whole one.
    rawKeyCount: rawKeys.length,
    rawKeys: rawKeys.slice(0, 200),
    rawKeysTruncated: rawKeys.length > 200,
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

const CONTROL_INJECT_HOSTED = `(function(){
  var root = ${ROOT_EXPR};
  if (!root || !root.classList.contains('os-desktop')) return JSON.stringify({ skipped: true });
  var win = root.querySelector('.fwin');
  if (!win) return JSON.stringify({ refuse: 'shell has no hosted window for the isolation control' });
  var host = document.createElement('div');
  host.id = '__lq_cat8_hosted_control';
  host.className = 'cat8-error';
  host.innerHTML = '<span>dict.results.err.addFailed</span><p>Lorem ipsum dolor sit amet.</p><button disabled>Go</button>';
  win.appendChild(host);
  return JSON.stringify({ injected: true });
})()`;

const CONTROL_REMOVE_HOSTED = `(function(){
  var n = document.getElementById('__lq_cat8_hosted_control');
  if (n && n.parentElement) n.parentElement.removeChild(n);
  return JSON.stringify({ removed: !!n });
})()`;

/**
 * Correction 14: `.sp-seg-btn[lang]` IS NOT UNIQUE, and the unscoped form clicked a real
 * setting that has nothing to do with the UI language.
 *
 * `sp-seg` is the shared segmented-control class, so `.sp-seg-btn` with a `lang` attribute
 * also matches the **Subtitle & transcription** language segment in `MediaContent.tsx`
 * (`.sp-seg.media-modelseg`, buttons lang="ja" and lang="zh"). Measured live: with the
 * Settings window open on any page other than Appearance, the UI-language card is not
 * rendered at all, and `document.querySelectorAll('.sp-seg-btn')` returned ONLY those two.
 * Asking for `ja` therefore clicked the transcription control — which calls
 * `setStudyLang('ja')` and, when that is a real change, silently rewrites the user's
 * `jp-study-whisper-model` to the language default.
 *
 * The `storedLang !== l.stored` guard below did catch the miss and VOID the run, so no
 * false number was ever recorded — but it catches it AFTER the wrong control has already
 * been pressed, which is too late for a setting. Scoping to the card is what makes the
 * leg safe. Note the attribute: `SettingsCard` renders its `id` prop as `data-setting-id`,
 * NOT as a DOM `id` (`SettingsCard.tsx:51`), so `getElementById('ui-language')` is null and
 * would have made this refuse every time — a scoping fix that never runs is not a fix.
 * If the card is absent the leg refuses and names the page to open, rather than falling
 * back to whatever else on screen happens to carry the class.
 */
/**
 * CORRECTION 35, measured 2026-08-31 on the Blanc shell — THE SETTINGS CARD IS ONE SHELL'S
 * VOCABULARY, NOT THE CONTRACT. `[data-setting-id="ui-language"]` is a Study OS Settings card.
 * Blanc runs in its own BrowserWindow, renders no Settings page at all, and owns its language
 * control outright (`BlancShell.tsx:700`, a `<select>` whose options already carry the same
 * `lang` tags). With only the card path, `--langs` refused on every tag, `languagesDiffer` came
 * back UNMEASURED, and the cell could never score better than UNMEASURED — an instrument
 * verdict wearing a product one, which is exactly the shape corrections 30-33 removed from
 * category 5.
 *
 * The fallback is deliberately narrow, because the reason the card scoping exists is still
 * true: a bare `.sp-seg-btn` also matches the subtitle segment, and a bare `<select>` matches
 * every dropdown on screen. So the select must carry an option for ALL FOUR tags — that is a
 * language chooser and nothing else is.
 *
 * Two things the select path must do that the button path does not:
 *  - REACT'S VALUE TRACKER. Assigning `.value` updates the tracker, so React's change handler
 *    dedupes the event away and the language silently does not move. The native prototype
 *    setter is what makes the dispatched `change` real.
 *  - THE DISCLOSURE. Blanc's control lives inside the `Context tools` drawer, so at rest it is
 *    `display:none` and not a user path. The leg opens the disclosure that `aria-controls` an
 *    ancestor of the control, and CLOSES IT AGAIN before returning — every `run()` in the leg
 *    must see the same resting chrome the baseline was measured on.
 */
const clickLang = (tag) => `(function(){
  var TAG = ${JSON.stringify(tag)};
  var card = document.querySelector('[data-setting-id="ui-language"]');
  if (card) {
    var b = [].slice.call(card.querySelectorAll('.sp-seg-btn')).filter(function(x){
      return x.getAttribute('lang') === TAG; })[0];
    if (!b) return JSON.stringify({ refuse: 'no .sp-seg-btn for that lang tag inside #ui-language' });
    b.click();
    return JSON.stringify({ clicked: TAG, via: 'settings-card' });
  }
  var WANT = ['en', 'ja', 'zh-Hans', 'ru'];
  var sel = [].slice.call(document.querySelectorAll('select')).filter(function(s){
    var tags = [].slice.call(s.options).map(function(o){ return o.getAttribute('lang'); });
    return WANT.every(function(w){ return tags.indexOf(w) >= 0; });
  })[0];
  if (!sel) return JSON.stringify({ refuse: 'no ui-language card on screen and no select carrying all four lang tags - open Settings > Appearance, or give this surface a language control; refusing to click a bare .sp-seg-btn, which also matches the Subtitle & transcription segment' });
  var opt = [].slice.call(sel.options).filter(function(o){ return o.getAttribute('lang') === TAG; })[0];
  if (!opt) return JSON.stringify({ refuse: 'the language select has no option for ' + TAG });
  var opened = null;
  var visible = typeof sel.checkVisibility === 'function'
    ? sel.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) : true;
  if (!visible) {
    opened = [].slice.call(document.querySelectorAll('[aria-expanded="false"][aria-controls]')).filter(function(t){
      var region = document.getElementById(t.getAttribute('aria-controls'));
      return !!region && region.contains(sel);
    })[0] || null;
    if (!opened) return JSON.stringify({ refuse: 'the language select is not painted and no aria-controls disclosure owns it' });
    opened.click();
  }
  var setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
  setter.call(sel, opt.value);
  sel.dispatchEvent(new Event('change', { bubbles: true }));
  var took = sel.value === opt.value;
  if (opened) opened.click();
  if (!took) return JSON.stringify({ refuse: 'the select did not accept ' + TAG + ' (value is ' + sel.value + ')' });
  return JSON.stringify({ clicked: TAG, via: 'surface-select', reopened: !!opened });
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

/**
 * CORRECTION 19, measured 2026-08-28 on Resources — A DOTTED TOKEN IS NOT AN i18n KEY.
 *
 * The in-page scanner matches `^[a-z][a-zA-Z0-9]*(\.[a-zA-Z0-9]+){2,}$`, which is the SHAPE
 * of a key and equally the shape of a hostname. Resources renders the host of every catalogue
 * entry on purpose — `apps.ankiweb.net`, `kanji.koohii.com`, `www3.nhk.or.jp`, `aozora.gr.jp`,
 * `heavenlypath.notion.site` — and the harness reported five raw keys and scored the surface
 * FAIL on a bar whose own words are "rendered text that is a bare i18n key". Five deliberate,
 * correct, user-facing strings. Package names, file names and version strings are the same
 * class of false positive and would have arrived next.
 *
 * The discriminator is not a better regex, it is the CATALOGS: a raw key is a key that exists.
 * The browser half stays a cheap shape filter and returns candidates; this half looks each one
 * up in the union of `src/shared/i18n/catalogs/*.ts`. Nothing is dropped silently — the
 * discarded candidates are reported as `keyShapedNonCatalog` and the catalog size is published
 * with every scan, so a run against a missing or unparsable catalog is visible rather than
 * being a free pass. If the catalogs cannot be read at all the harness keeps the old
 * shape-only count and says so, because scoring 0 on an unread catalog would be the flattery
 * the pin forbids.
 *
 * THE HOLE THIS WOULD OTHERWISE OPEN, closed in the same pass: `t('foo.bar')` for a key that
 * is missing from every catalog renders the key itself, and that is the WORST raw key there
 * is — a membership test alone would discard exactly it. So a candidate also counts when its
 * first segment is a known catalog NAMESPACE (105 of them: `dict`, `resources`, `media`, ...),
 * which a deleted or mistyped key keeps and a hostname does not. Checked, not assumed: none of
 * the five hostnames above starts with a namespace. A host like `media.example.com` would be
 * reported, and that is the right way round — a false positive is investigated, a false
 * negative flatters.
 *
 * The negative control still falsifies: it injects `dict.results.err.addFailed`, which IS a
 * real key (`catalogs/en.ts:2315`). That is not a coincidence to rely on — a control that
 * injected a made-up token would now be testing the wrong thing, and this is the note that
 * says so.
 */
const CATALOG_KEYS = (() => {
  const keys = new Set();
  try {
    const dir = path.join(__dirname, '..', '..', '..', 'shared', 'i18n', 'catalogs');
    for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.ts'))) {
      const src = fs.readFileSync(path.join(dir, f), 'utf8');
      const re = /^\s*'([A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)+)'\s*:/gm;
      let m = re.exec(src);
      while (m) { keys.add(m[1]); m = re.exec(src); }
    }
  } catch {
    return new Set();
  }
  return keys;
})();
const CATALOG_NAMESPACES = new Set([...CATALOG_KEYS].map((k) => k.split('.')[0]));
const isRawKey = (token) => CATALOG_KEYS.has(token)
  || CATALOG_NAMESPACES.has(token.split('.')[0]);

const refineRawKeys = (r) => {
  if (!r || !Array.isArray(r.rawKeys)) return r;
  r.rawKeyCatalogSize = CATALOG_KEYS.size;
  if (!CATALOG_KEYS.size || r.rawKeysTruncated) {
    r.rawKeyBasis = CATALOG_KEYS.size
      ? 'shape only - candidate list truncated at 200'
      : 'shape only - i18n catalogs could not be read';
    return r;
  }
  const real = r.rawKeys.filter((k) => isRawKey(k.token));
  r.keyShapedNonCatalog = r.rawKeys.filter((k) => !isRawKey(k.token));
  r.rawKeyCount = real.length;
  r.rawKeys = real.slice(0, 10);
  r.rawKeyBasis = `${CATALOG_KEYS.size} catalog keys / ${CATALOG_NAMESPACES.size} namespaces`;
  return r;
};

const run = async () => refineRawKeys(JSON.parse(await ev(PROBE)));

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

/**
 * Correction 10: the same leg, driven by a click.
 *
 * `--drive-undo` is a second selector because most of these filters are a SET of chips, not a
 * toggle: Library's level row is `all | L1 … L7`, so the way back is the "all" chip, not a second
 * press of L1. Omitted, it re-presses the same control, which is right for a real toggle. The
 * restore is asserted by text hash either way, which is what makes a click safe to make here.
 */
const clickEl = (sel, which) => `(function(){
  var root = ${ROOT_EXPR};
  if (!root) return JSON.stringify({ refuse: 'surface not found for drive' });
  var el = root.querySelector(${JSON.stringify(sel)});
  if (!el) return JSON.stringify({ refuse: 'drive-' + ${JSON.stringify(which)} + ' target not found: ' + ${JSON.stringify(sel)} });
  el.focus();
  el.click();
  return JSON.stringify({ clicked: ${JSON.stringify(sel)}, label: (el.textContent || '').trim().slice(0, 40) });
})()`;

/**
 * Correction 37's receipt. Three readings of the declared self-writing regions, so a reader can
 * see the exclusion earn itself instead of taking the flag's word for it. `moved` is what the
 * caller VOIDs on: a churn set that never differs across the drive was excluded for nothing.
 */
const churnWitness = (base, driven, restored) => (CHURN
  ? {
      selector: CHURN,
      runs: base.churnTextRuns,
      hashes: { base: base.churnHash, driven: driven.churnHash, restored: restored.churnHash },
      moved: base.churnHash !== driven.churnHash || base.churnHash !== restored.churnHash,
    }
  : null);

/**
 * CORRECTION 36, measured 2026-08-31 on the Blanc shell — A FILTER BEHIND A DISCLOSURE IS
 * STILL THIS SURFACE'S FILTER.
 *
 * Corrections 9 and 10 gave this harness a typing leg and a clicking leg, and treated them as
 * alternatives: `--drive-click` short-circuits before `--drive-input` is ever read. That is
 * right for a chip set and wrong for a SHELL, whose one authored adverse state usually lives
 * behind its master search. Blanc at rest paints three inputs — a volume range and two
 * checkboxes — and no text field at all; `.blanc-top-search` mounts one (346 -> 516 elements),
 * and typing nonsense into it renders `Nothing in Blanc matched.` A click-only leg measures the
 * search OPEN AND EMPTY, which names no state, so the cell reads UNMEASURED on a surface whose
 * empty state is real and correct.
 *
 * Given BOTH, the click is treated as the opener and the input leg runs inside it. The undo is
 * `--drive-undo` if given and otherwise the input leg's own Escape, and `restored` is still
 * asserted against the RESTING text hash — so a disclosure left open fails the restore exactly
 * as a stranded query does. Neither leg alone changes behaviour.
 */
/**
 * Read the surface until `pred` holds, then return that read; return the LAST read if the budget
 * runs out. The read is the caller's own `run()`, so nothing about what is measured changes -
 * only when. Deliberately returns rather than throws on exhaustion: the caller's guards already
 * report `surfaceChanged` and `restored` with real values, and a drive that truly never restores
 * must still VOID with those values rather than with a timeout.
 */
async function settleUntil(read, pred, tries = 16, everyMs = 400) {
  let last = null;
  for (let i = 0; i < tries; i += 1) {
    await sleep(everyMs);
    last = await read();
    if (last && last.refuse) return last;
    if (pred(last)) return last;
  }
  return last;
}

async function driveLeg(base) {
  let opener = null;
  if (DRIVE_CLICK && DRIVE_INPUT) {
    const hit = JSON.parse(await ev(clickEl(DRIVE_CLICK, 'click')));
    if (hit.refuse) return { refuse: `opener: ${hit.refuse}` };
    await sleep(600);
    const mounted = JSON.parse(await ev(
      `(function(){ var e = document.querySelector(${JSON.stringify(DRIVE_INPUT)});`
      + ' return JSON.stringify({ present: !!e }) })()',
    ));
    if (!mounted.present) return { refuse: `opener ${DRIVE_CLICK} did not mount ${DRIVE_INPUT}` };
    opener = { click: DRIVE_CLICK, clickedLabel: hit.label };
  } else if (DRIVE_CLICK) {
    const hit = JSON.parse(await ev(clickEl(DRIVE_CLICK, 'click')));
    if (hit.refuse) return { refuse: hit.refuse };
    // CORRECTION 50, the same lesson as 49 one leg over: 600ms is a stopwatch, not a settle.
    // Immersion's undo re-opens a REAL page over the network, so `restored` was read while the
    // navigation was still in flight and the leg VOIDed with `surfaceChanged: true,
    // restored: false` on a round trip that had in fact restored - the exact false negative the
    // header at line 131 already warns about, arriving through a different door. Both waits are
    // now polls for the condition each one is actually waiting for, and both return the LAST
    // read when the budget runs out, so a drive that genuinely does not restore still VOIDs
    // with the same numbers it always did.
    const driven = await settleUntil(run, (r) => r.textHash !== base.textHash);
    const undo = JSON.parse(await ev(clickEl(DRIVE_UNDO || DRIVE_CLICK, 'undo')));
    const restored = await settleUntil(run, (r) => r.textHash === base.textHash);
    if (driven.refuse) return { refuse: `driven: ${driven.refuse}` };
    return {
      click: DRIVE_CLICK,
      clickedLabel: hit.label,
      undo: DRIVE_UNDO || DRIVE_CLICK,
      undoLabel: undo.label || null,
      churn: churnWitness(base, driven, restored),
      surfaceChanged: driven.textHash !== base.textHash,
      restored: restored.textHash === base.textHash,
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
  const set = JSON.parse(await ev(setInput(DRIVE_INPUT, DRIVE_VALUE)));
  if (set.refuse) return { refuse: set.refuse };
  await sleep(600);
  const driven = await run();
  if (driven.refuse) { await ev(setInput(DRIVE_INPUT, set.was)); return { refuse: `driven: ${driven.refuse}` }; }
  const back = JSON.parse(await ev(setInput(DRIVE_INPUT, set.was)));
  await sleep(600);
  let restored = await run();
  /*
   * CORRECTION 21 — RESTORING AN INPUT'S VALUE IS NOT RESTORING THE SURFACE.
   *
   * A combobox opens its listbox on input and closes it on blur. This driver never blurs
   * (it writes `.value` and dispatches `input`), so on Settings the panel was still open
   * with an empty query after the value came back: 258 painted runs against a 257-run
   * baseline, `restored: false`, and the whole run VOIDed on a surface with no defect.
   * The state it had just measured — a real "No matching settings" empty message — was
   * thrown away with it.
   *
   * Escape is the one gesture every disclosure in this app honours (`SettingsSearch`,
   * `.scr-search`, the command palette), and it is synchronous. It is sent ONLY when the
   * surface has not already come back, so a run that never opened anything is byte-identical
   * to every baseline taken before this correction, and the second reading is reported as
   * `restoredAfterEscape` rather than folded into `restored` — if Escape is what fixed it,
   * the record says so.
   */
  let restoredAfterEscape = null;
  if (restored.textHash !== base.textHash) {
    await ev(`(function(){var e=document.querySelector(${JSON.stringify(DRIVE_INPUT)});`
      + 'if(!e)return "absent";'
      + 'e.dispatchEvent(new KeyboardEvent("keydown",{bubbles:true,cancelable:true,key:"Escape"}));'
      + 'return "escaped"})()');
    await sleep(600);
    const second = await run();
    restoredAfterEscape = second.textHash === base.textHash;
    if (restoredAfterEscape) restored = second;
  }
  // Correction 36: an explicit way back, for an opener whose disclosure does not honour Escape.
  // Only pressed when the surface is still not back, so no run that already restored changes.
  let restoredAfterUndo = null;
  if (DRIVE_UNDO && restored.textHash !== base.textHash) {
    await ev(clickEl(DRIVE_UNDO, 'undo'));
    await sleep(600);
    const third = await run();
    restoredAfterUndo = third.textHash === base.textHash;
    if (restoredAfterUndo) restored = third;
  }
  return {
    input: DRIVE_INPUT,
    value: DRIVE_VALUE,
    originalValue: set.was,
    openedBy: opener,
    restoredAfterEscape,
    restoredAfterUndo,
    churn: churnWitness(base, driven, restored),
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
      // Correction 39: carried through, or the reason a host left the denominator is invisible
      // in the banked baseline and the next worker re-derives it from scratch.
      unpaintedHosts: Math.max(a[k].unpaintedHosts || 0, b ? b[k].unpaintedHosts || 0 : 0),
      unpainted: (a[k].unpainted || []).concat(b ? b[k].unpainted || [] : []),
    };
  }
  return out;
}

/**
 * Correction 21: HOW MANY runs moved between languages, not merely whether the hash did.
 *
 * Stashes the first language's ordered runs on the page and, for each later language, counts the
 * positions whose text changed. Kept on the page rather than shipped back per language because
 * four arrays of ~1,200 strings through `/eval` is the payload this harness is meant not to send.
 */
const langRuns = (isBase) => `(function(){
  var r = ${ROOT_EXPR};
  if (!r) return JSON.stringify({ diffRuns: null, examples: [] });
  var acc = [];
  var w = document.createTreeWalker(r, NodeFilter.SHOW_TEXT);
  for (var t = w.nextNode(); t; t = w.nextNode()) {
    var s = t.nodeValue && t.nodeValue.trim();
    if (!s || !t.parentElement) continue;
    if (typeof t.parentElement.checkVisibility === 'function'
      && !t.parentElement.checkVisibility({ checkOpacity:true, checkVisibilityCSS:true, contentVisibilityAuto:true })) continue;
    if (r.classList.contains('os-desktop') && t.parentElement.closest('.fwin')) continue;
    // Correction 28, the language leg's half: the same [data-dev-only] exclusion as the
    // snapshot above. Both walkers or neither — a base array built from a different
    // population than the per-language ones compares positions that are not the same run.
    if (t.parentElement.closest('[data-dev-only]')) continue;
    acc.push(s);
  }
  // Keep this population byte-for-byte aligned with PROBE: an empty native field paints
  // its placeholder even though TreeWalker cannot see attribute text. Without this half,
  // the per-language hashes moved while diffRuns stayed zero on a fully translated note.
  var promptControls = [].slice.call(r.querySelectorAll('input[placeholder],textarea[placeholder]'));
  for (var p = 0; p < promptControls.length; p++) {
    var pe = promptControls[p];
    if (String(pe.value || '').length > 0) continue;
    if (typeof pe.checkVisibility === 'function'
      && !pe.checkVisibility({ checkOpacity:true, checkVisibilityCSS:true, contentVisibilityAuto:true })) continue;
    if (r.classList.contains('os-desktop') && pe.closest('.fwin')) continue;
    if (pe.closest('[data-dev-only]')) continue;
    var ps = (pe.getAttribute('placeholder') || '').trim();
    if (ps) acc.push(ps);
  }
  if (${isBase ? 'true' : 'false'}) { window.__cat8LangBase = acc; return JSON.stringify({ diffRuns: 0, examples: [] }); }
  var base = window.__cat8LangBase || [];
  var n = Math.max(base.length, acc.length), diff = 0, ex = [];
  for (var i = 0; i < n; i++) {
    if (base[i] !== acc[i]) {
      diff++;
      if (ex.length < 6) ex.push({ i: i, was: String(base[i] || '').slice(0, 30), now: String(acc[i] || '').slice(0, 30) });
    }
  }
  return JSON.stringify({ diffRuns: diff, examples: ex });
})()`;

/**
 * Correction 3: run the surface in all four languages and compare RENDERED TEXT, not key counts.
 *
 * A per-language key count catches a missing catalog entry. It cannot catch an untranslated
 * interpolation, which renders as a real English sentence in every language — the defect this
 * repo has now shipped twice. Two languages whose text hashes are identical on a surface with
 * text runs are either both untranslated or both the same language, and neither is a pass.
 */
/**
 * Wait for a language click to LAND, rather than for a stopwatch. Polls `<html lang>` and the
 * effective stored language (absent === 'en', correction 37) until both name the tag that was
 * asked for, or the budget runs out - in which case it returns anyway and the caller's guard
 * reports the refusal with the real values, exactly as it did before. It never waits for a
 * language nobody asked for, so a click that hit the wrong control still refuses immediately
 * after the budget rather than being polled into a pass.
 */
async function settleLang(tag, stored, tries = 24, everyMs = 250) {
  for (let i = 0; i < tries; i += 1) {
    await sleep(everyMs);
    let s;
    try {
      s = JSON.parse(await ev(
        "JSON.stringify({html:document.documentElement.lang,stored:localStorage.getItem('ui-lang')})",
      ));
    } catch (e) { continue; }
    const effective = s.stored === null || s.stored === undefined ? 'en' : s.stored;
    if (s.html === tag && effective === stored) return { landed: true, afterMs: (i + 1) * everyMs };
  }
  return { landed: false, afterMs: tries * everyMs };
}

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
  const restoreTag = before.stored === 'zh' ? 'zh-Hans' : (before.stored || 'en');
  const perLang = [];
  // Correction 15: A REFUSE INSIDE THIS LOOP USED TO RETURN WITHOUT PUTTING THE LANGUAGE BACK,
  // and the damage outlives the run. The leg died on `ja: surface not found` (a title-named
  // surface cannot be found once its window title is translated) and left the whole app in
  // Japanese. Nothing about that reads as probe residue: the very next run captured `ja` as
  // `before.stored`, restored to it faithfully, and reported `restored: true` on a language the
  // user never chose. Every exit from here now walks through the restore.
  try {
    for (const l of tags) {
      const clicked = JSON.parse(await ev(clickLang(l.tag)));
      if (clicked.refuse) return { refuse: `${clicked.refuse} (${l.tag}) - the Settings language control must be on screen` };
      // CORRECTION 49. A FIXED SLEEP IS NOT A SETTLE, and this one produced BOTH failure modes
      // in one run on 2026-09-05: the `ja` leg refused with `<html lang> says en` while 日本語
      // was in fact the active segment by the time a human looked, and the `finally` restore
      // then clicked English INSIDE the window the ja import was still resolving in, so the app
      // was left in Japanese - the exact residue correction 15 exists to prevent. The catalog is
      // a dynamic import and its resolution time is a function of machine load, so 1400ms is a
      // guess that gets slower under exactly the conditions a relay run creates. Poll for the
      // landing instead; the guard below is unchanged and still fires when the click genuinely
      // hit the wrong control, because the poll only ever waits for the tag that was asked for.
      await settleLang(l.tag, l.stored);
      const r = await run();
      if (r.refuse) return { refuse: `${l.tag}: ${r.refuse}` };
      // Correction 37: AN ABSENT `ui-lang` IS ENGLISH, and reading it as "the switch did not
      // take" VOIDs every profile that has never changed language. `renderer/i18n.ts:26`
      // `readStored()` falls back to `DEFAULT_LANG` when the key is missing or unparseable, and
      // the product writes the key only on a real change — so on a profile whose localStorage
      // was wiped (which a restart of the dev app has done here), the FIRST tag `en` clicks an
      // already-active control, nothing is written, and the guard fired on a leg that had in
      // fact landed. Measured 2026-09-03: `{html:'en', ui-lang:null}` on the live app, and the
      // Calendar cell VOIDed twice before this was read rather than assumed.
      //
      // The guard is still needed — correction 14's whole point is that it catches a click that
      // hit the wrong control. So it is not relaxed, it is re-based on what the app actually
      // renders: the effective language (stored, or the default when absent) AND the `lang`
      // attribute the switch stamps on <html> (`applyLangAttribute`). Both must agree with the
      // tag asked for, so a language that genuinely did not move still refuses.
      const effectiveStored = r.storedLang === null || r.storedLang === undefined ? 'en' : r.storedLang;
      if (effectiveStored !== l.stored || r.lang !== l.tag) {
        return {
          refuse: `language did not take: asked ${l.stored}/${l.tag}, storage says ${r.storedLang} (effective ${effectiveStored}) and <html lang> says ${r.lang} - the previous language would have been measured twice`,
        };
      }
      // Correction 21: HOW MANY runs moved, not merely whether the hash did. See the bar below.
      const moved = JSON.parse(await ev(langRuns(perLang.length === 0)));
      perLang.push({
        lang: l.stored, htmlLang: r.lang, textRuns: r.textRuns, textHash: r.textHash,
        rawKeyCount: r.rawKeyCount, rawKeys: r.rawKeys,
        diffRuns: moved.diffRuns, diffExamples: moved.examples,
      });
    }
  } finally {
    await ev(clickLang(restoreTag));
    // Correction 49, second half and the half that actually caused damage: the restore used the
    // same 1400ms guess, so when a refusal fired mid-loop the restore click landed INSIDE the
    // window the refused language's import was still resolving in, and that import then won.
    // The app was left in Japanese by a leg whose whole purpose was to put it back.
    await settleLang(restoreTag, restoreTag === 'zh-Hans' ? 'zh' : restoreTag);
    // Correction 37, second half: the leg must put back the ABSENCE of the key too. When the
    // profile arrived with no `ui-lang` at all, clicking English restores the language but
    // leaves `ui-lang: "en"` written — the same effective state, a different profile. The repo
    // rule for a persisted setting is capture-patch-restore verified byte-identical, and
    // `restored` below compares raw values, so without this the leg VOIDs itself on its own
    // residue (measured 2026-09-03: `before {stored:null}` vs `after {stored:"en"}`).
    if (before.stored === null || before.stored === undefined) {
      await ev("(function(){ try { localStorage.removeItem('ui-lang'); } catch (e) {} return 'removed'; })()");
      await sleep(200);
    }
  }
  if (perLang.length !== tags.length) return { refuse: 'language leg did not complete all four tags' };
  const after = JSON.parse(await ev(
    "JSON.stringify({html:document.documentElement.lang,stored:localStorage.getItem('ui-lang')})",
  ));
  const hashes = perLang.map((p) => p.textHash);
  // Correction 21: the SHARE of runs that moved. The best case across the three non-base
  // languages, so a surface is judged on the language it localises best, not its worst.
  const baseRuns = perLang[0] ? perLang[0].textRuns : 0;
  const diffRunsMax = Math.max(0, ...perLang.map((p) => p.diffRuns || 0));
  return {
    perLang,
    before,
    after,
    restored: after.stored === before.stored && after.html === before.html,
    rawKeyCountMax: Math.max(...perLang.map((p) => p.rawKeyCount)),
    // Distinct hashes are the evidence that the surface actually re-rendered per language.
    distinctHashes: new Set(hashes).size,
    diffRunsMax,
    baseRuns,
    diffShare: baseRuns ? Number((diffRunsMax / baseRuns).toFixed(4)) : 0,
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

  if (DRIVE_INPUT || DRIVE_CLICK) {
    base.drive = await driveLeg(base);
    if (base.drive.refuse) { console.error(`VOID - drive leg: ${base.drive.refuse}`); process.exit(3); }
    if (!base.drive.restored) {
      console.error(`VOID - drive did not restore the surface: ${JSON.stringify(base.drive)}`);
      process.exit(3);
    }
    if (!base.drive.surfaceChanged) {
      console.error('VOID - the drive changed nothing; it is not this surface\'s filter');
      process.exit(3);
    }
    // Correction 37: the exclusion has to earn itself, both ways round.
    if (CHURN) {
      const w = base.drive.churn;
      if (!w || !w.runs) {
        console.error(`VOID - --churn "${CHURN}" matched no painted text run on this surface; `
          + 'an exclusion that names nothing is not an exclusion');
        process.exit(3);
      }
      // An exclusion that did not move is provably INERT rather than a widening, and this is
      // the one place the cat2 rule does NOT transfer. Every hash here is only ever compared
      // for equality against another hash from the same run; a set of runs that is byte-identical
      // in all three readings shifts base, driven and restored alike, so including it could not
      // change a single verdict. The metric this flag exists for is nondeterministic — the
      // Scraper's memory line moved on one drive and not the next — so VOIDing here would make
      // a correct surface pass or fail by luck. Recorded, never silently dropped.
      if (!w.moved) w.inert = true;
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
    // Correction 20: WITHOUT --langs this read `!LANGS || …`, i.e. vacuously TRUE, so a run
    // that never opened Settings printed `PASS 10/10` with one of its five bars unmeasured.
    // Measured on the Scraper, 2026-08-30: the surface renders ONE text hash across all four
    // languages (588 English-only keys in `scraper/strings.ts`), and a no-`--langs` run scored
    // it 10/10 anyway. That is the fabricated 10 the rubric exists to catch, produced by the
    // instrument itself. It is UNMEASURED now, which the verdict already knows how to report.
    // Correction 21: DISTINCT HASHES ALONE IS SATISFIED BY ONE LABEL. Measured on the Scraper,
    // 2026-08-30: four distinct hashes, and the diff was exactly ONE run of 1,186 — the `.fwin`
    // title, "Scraper" -> "スクレイパー", which is shared window chrome outside the app's own
    // content. The other 1,180 runs are the 588 English-only keys in `scraper/strings.ts` and
    // never moved. So the bar read 10/10 on a surface that is not localised at all.
    // The share floor is 1%: low enough that a Japanese-content-heavy surface (Dictionary, the
    // reader) is not failed for having little chrome, high enough that no single chrome label
    // can carry it. It is a floor, not proof of coverage — 0.08% is what it exists to reject.
    // Correction 28: A SURFACE WITH NO WORDS CANNOT ANSWER THIS, AND `false` IS A
    // FABRICATED DEFECT. City (`@.fwin-frameless`, the Mooncap Garden) is a canvas: after
    // the `[data-dev-only]` exclusion above, its entire painted text is the three
    // window-control glyphs `⧉ ─ ×`, which are identical in all four languages by design.
    // Scored as-is it read `distinctHashes 1, diffShare 0` -> `languagesDiffer false` ->
    // **FAIL**, i.e. a localisation defect filed against a surface that has no localisable
    // text. `wordRuns` is the run count containing at least one Unicode letter; at 0 the
    // bar is UNMEASURED, which the verdict already knows how to report and which is neither
    // a 10 nor a fail. It is deliberately 0 and not a threshold: one real word is enough to
    // ask the question, and correction 21's 1% share floor is what stops one label carrying it.
    languagesDiffer: !LANGS ? 'UNMEASURED'
      : base.wordRuns === 0 ? 'UNMEASURED'
      : base.languages.distinctHashes > 1 && base.languages.diffShare > 0.01,
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
        ? `UNMEASURED - ${unmeasured.join(',')}; drive the surface with --drive-input and --langs, or score 0, never 10`
        : 'FAIL'),
    failedBars: Object.entries(bars).filter(([, v]) => v === false).map(([k]) => k),
    unmeasuredBars: unmeasured,
    notMeasuredHere: [
      'dead-control count (honesty-probe A - every control driven for a side effect)',
      'fabricated-value verdict (honesty-probe B - needs an empty scratch profile)',
    ],
  };

  if (CONTROL) {
    let hostedIsolation = null;
    if (base.hostedWindowsExcluded > 0) {
      const hostedInj = JSON.parse(await ev(CONTROL_INJECT_HOSTED));
      if (hostedInj.refuse) { console.error(`REFUSE - hosted isolation control: ${hostedInj.refuse}`); process.exit(2); }
      const hostedDirty = await run();
      await ev(CONTROL_REMOVE_HOSTED);
      hostedIsolation = hostedDirty.textHash === base.textHash
        && hostedDirty.rawKeyCount === base.rawKeyCount
        && hostedDirty.placeholderCount === base.placeholderCount
        && hostedDirty.mutePairCount === base.mutePairCount
        && JSON.stringify(hostedDirty.states) === JSON.stringify(base.states);
    }
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
      hostedIsolation,
      counts: {
        base: [base.rawKeyCount, base.placeholderCount, base.mutePairCount],
        dirty: [dirty.rawKeyCount, dirty.placeholderCount, dirty.mutePairCount],
        restored: [restored.rawKeyCount, restored.placeholderCount, restored.mutePairCount],
      },
    };
    if (!Object.values(moved).every(Boolean) || !backToBaseline || hostedIsolation === false) {
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
