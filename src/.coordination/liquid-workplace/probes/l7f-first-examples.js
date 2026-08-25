/**
 * Leg 2, the sample that has never been settled: the boot's FIRST example-sentence lookup.
 *
 * 2026-08-25 measured 1,034.2 ms for the boot's first `Find example sentences` against a 500 ms
 * bar, then exonerated both candidates -- window re-mount alone 5.0 ms, and `dictExamples` on four
 * never-queried words 48/21/164/47 ms. So it is once-per-boot, not per-word. What that turn could
 * not do is measure the first call itself, because by then the boot had already spent it.
 *
 * This probe IS the boot's first call. Nothing may query examples before it runs.
 *
 * Word 1 is the failing click's own word, so this is a reproduction and not a new experiment.
 * Words 2-5 are never-queried and are the PER-WORD CONTROL: if they land near word 1 the cost is
 * per-word and the earlier exoneration was wrong; if they collapse, the cost is infrastructure the
 * first caller pays for everyone.
 *
 * The mechanism under test is SQLite's own per-connection page cache, not the OS page cache. That
 * decides whether it reproduces at all: the OS cache survives an app restart and would make the
 * number vanish, a connection's cache does not. If word 1 is fast on a fresh boot whose OS cache
 * is warm, that is evidence FOR the OS-cache reading, not an absence of the defect -- say so
 * rather than scoring a 10.
 *
 * Words are \u-escaped, never literal: Japanese sent through the bridge's /eval arrives as `??`.
 *
 * TRAP (`/eval` takes ONE expression): this file ends `})()` with no semicolon and no trailing
 * `;`. Fed through `liquid-perf-probe.ps1 -DuringJs`, a throw here is SILENT -- the run reports a
 * clean distribution that looks exactly like a fast surface. Verify `window.__l7fEx.done` before
 * believing any number; never the exit code.
 */
(function () {
  // Built from code points so this file is pure ASCII on disk. Literal Japanese here survives
  // neither the Write tool (which normalises \u escapes back to glyphs) nor the POST to /eval.
  // taberu, umi, itai, mado, hanasu
  var WORDS = [[0x98df, 0x3079, 0x308b], [0x6d77], [0x75db, 0x3044], [0x7a93], [0x8a71, 0x3059]]
    .map(function (cps) { return String.fromCharCode.apply(String, cps); });
  window.__l7fEx = { done: false, rows: [], startedAt: Date.now() };
  var i = 0;
  function next() {
    if (i >= WORDS.length) { window.__l7fEx.done = true; return; }
    var w = WORDS[i++];
    var t0 = performance.now();
    window.api.dictExamples(w, { sourceLangs: ['ja'] }).then(function (r) {
      window.__l7fEx.rows.push({
        i: i, word: w, ms: Math.round((performance.now() - t0) * 10) / 10,
        n: (r && r.examples ? r.examples.length : -1)
      });
      next();
    }, function (e) {
      window.__l7fEx.rows.push({ i: i, word: w, ms: Math.round((performance.now() - t0) * 10) / 10, err: String(e).slice(0, 90) });
      next();
    });
  }
  next();
  return 'l7f-fired'
})()
