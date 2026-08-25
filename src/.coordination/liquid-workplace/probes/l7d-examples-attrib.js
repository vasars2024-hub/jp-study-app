/**
 * ATTRIBUTION for leg 2's 1,034.2 ms sample: is it a first-call-in-boot infrastructure cost
 * (open/prepare the example corpus) or does EVERY cold word cost a second?
 *
 * The panel re-run cannot answer it -- `search()` re-queries the SAME word, and the probe's
 * node-growth VOID rule only discriminates on the first run (415 -> 415 on a refill).
 * So call the IPC directly, one word at a time, with words this boot has never queried.
 */
(function () {
  var WORDS = ['\u732b', '\u5b66\u6821', '\u6e05\u3044', '\u9243'];
  window.__l7dEx = { done: false, rows: [] };
  var i = 0;
  function next() {
    if (i >= WORDS.length) { window.__l7dEx.done = true; return; }
    var w = WORDS[i++];
    var t0 = Date.now();
    window.api.dictExamples(w, { sourceLangs: ['ja'] }).then(function (r) {
      window.__l7dEx.rows.push({ word: w, ms: Date.now() - t0, n: (r && r.examples ? r.examples.length : -1) });
      next();
    }, function (e) {
      window.__l7dEx.rows.push({ word: w, ms: Date.now() - t0, err: String(e).slice(0, 80) });
      next();
    });
  }
  next();
  return 'attrib-fired'
})()

/*
 * TRAP, paid for on 2026-08-25: `/eval` takes ONE expression. A probe file ending `})();`
 * fails with the renderer's generic "Script failed to execute" and, fed through
 * `liquid-perf-probe.ps1 -DuringJs`, that failure is SILENT — the run completes, reports a
 * clean distribution, and looks exactly like a surface that is fast. Every probe file here
 * ends `})()` with no semicolon for that reason. Verify the parked global exists before
 * believing any number: `window.__l7dEx.done`, not the probe's exit code.
 */
