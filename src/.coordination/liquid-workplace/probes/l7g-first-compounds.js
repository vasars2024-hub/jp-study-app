/**
 * The live half of the compound/collocation finding: does the `USE TEMP B-TREE FOR ORDER BY` scan
 * in `findLexiconCompounds` actually block Electron's main event loop, or is that only true of the
 * statement measured outside the app?
 *
 * Same shape as `l7f-first-examples.js` and the same rules apply. Fed to
 * `tools/liquid-perf-probe.ps1 -DuringJs <this path>`, which samples `/health` across it.
 *
 * MUST be the boot's first `dict:compounds`, and the `examples`/`headwords` pages must have been
 * evicted first (`tools/evict-file-cache.ps1`) or this measures the warm path — 70-160 ms rather
 * than the 10,904.4 ms the cold statement cost. A warm run is not a passing run, it is a VOID one.
 *
 * Word 1 is the word every other leg on this surface used. Words 2-5 are never-queried controls: if
 * they collapse the cost is page residency, if they do not it is per-word work.
 *
 * TRAP (`/eval` takes ONE expression): no trailing semicolon below. A throw here is silent and the
 * harness reports a clean distribution. Verify `window.__l7gCmp.done`, never the exit code.
 */
(function () {
  // Code points, never literal Japanese: the Write tool normalises \u escapes back to glyphs and
  // the POST to /eval turns those into `??`.
  // taberu, umi, itai, mado, hanasu
  var WORDS = [[0x98df, 0x3079, 0x308b], [0x6d77], [0x75db, 0x3044], [0x7a93], [0x8a71, 0x3059]]
    .map(function (cps) { return String.fromCharCode.apply(String, cps); });
  window.__l7gCmp = { done: false, rows: [], startedAt: Date.now() };
  var i = 0;
  function next() {
    if (i >= WORDS.length) { window.__l7gCmp.done = true; return; }
    var w = WORDS[i++];
    var t0 = performance.now();
    window.api.dictCompounds(w, { sourceLangs: ['ja'] }).then(function (r) {
      window.__l7gCmp.rows.push({
        i: i, word: w, ms: Math.round((performance.now() - t0) * 10) / 10,
        n: (r && r.compounds ? r.compounds.length : -1)
      });
      next();
    }, function (e) {
      window.__l7gCmp.rows.push({ i: i, word: w, ms: Math.round((performance.now() - t0) * 10) / 10, err: String(e).slice(0, 90) });
      next();
    });
  }
  next();
  return 'l7g-fired'
})()
