/**
 * ATTRIBUTION control for leg 2's single 1,034.2 ms sample.
 *
 * That sample was taken on the first `Find example sentences` run AFTER `l7d-restore.cjs`
 * un-hid Media, Video and Settings; the two re-runs on the settled desk read 4.0 / 3.9 ms.
 * Two candidate causes: the action has a first-call cost, or re-mounting three hidden windows
 * does main-process work whose tail landed inside the first sample window.
 *
 * This drives ONLY the visibility change -- no dictionary action at all. If main blocks near a
 * second here, the action is exonerated and the cost belongs to window re-mount.
 */
(function () {
  var titles = /Media|Video|Settings/i;
  var wins = [].slice.call(document.querySelectorAll('.fwin')).filter(function (w) {
    var t = w.querySelector('.fwin-title-text, .fwin-title');
    return !!t && titles.test(t.textContent || '');
  });
  if (wins.length !== 3) return 'VOID: expected 3 windows, found ' + wins.length;
  window.__l7dVis = { started: Date.now(), hid: wins.length, done: false };
  wins.forEach(function (w) { w.style.display = 'none'; });
  setTimeout(function () {
    wins.forEach(function (w) { w.style.display = ''; });
    window.__l7dVis.done = true;
    window.__l7dVis.ms = Date.now() - window.__l7dVis.started;
  }, 600);
  return 'driving';
})()
