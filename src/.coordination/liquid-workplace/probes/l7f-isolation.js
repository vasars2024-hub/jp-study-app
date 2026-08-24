/**
 * L7-F leg B ISOLATION CONTROL: block the RENDERER for 1.5 s and confirm `/health`
 * (which touches main only) does not move. If it did move, the /health distribution
 * would be measuring renderer work and every leg-2 number would be uninterpretable.
 */
(function () {
  window.__l7fIso = { started: Date.now(), done: false };
  var end = Date.now() + 1500;
  var n = 0;
  while (Date.now() < end) { n += Math.sqrt(n + 1); }
  window.__l7fIso.done = true;
  window.__l7fIso.ms = Date.now() - window.__l7fIso.started;
  window.__l7fIso.n = Math.round(n);
  return 'blocked';
})()
