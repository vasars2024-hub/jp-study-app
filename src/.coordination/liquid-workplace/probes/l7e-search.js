/**
 * L7-E leg B, load 1: ONE real dictionary search, driven while `tools/liquid-perf-probe.ps1`
 * samples `/health`. Fed to that probe as `-DuringJs (Get-Content ... -Raw)`.
 *
 * Why the headword is built with `String.fromCharCode` instead of being written literally:
 * the word has to survive two hops that both mangle non-ASCII (PowerShell's file read and the
 * debug bridge's POST body), and a search for a mangled word returns no rows while the
 * `/health` distribution reads exactly like a fast, healthy main process. Codepoints cannot be
 * mangled. Unicode `u` escapes were tried first and are NOT usable here either: this repo's
 * write path collapses the escape into the character it denotes before the file lands.
 *
 * The run is VOID unless `window.__l7eSearch.done === true` and `after > 0`: a click that
 * produced no rows measured no load.
 */
(function () {
  var win = [].slice.call(document.querySelectorAll('.fwin')).filter(function (w) {
    return w.style.display !== 'none';
  })[0];
  if (!win) return 'VOID: no visible .fwin';
  var input = win.querySelector('input[type="text"], input:not([type]), input[type="search"]');
  if (!input) return 'VOID: no input';
  var kensaku = String.fromCharCode(0x691c, 0x7d22);
  var re = new RegExp('^(Search|' + kensaku + ')');
  var btn = [].slice.call(win.querySelectorAll('button')).filter(function (b) {
    return re.test((b.textContent || '').trim());
  })[0];
  if (!btn) return 'VOID: no Search button';

  // benkyou (U+52C9 U+5F37) — a real headword, cold on this boot: setup searched taberu.
  var word = String.fromCharCode(0x52c9, 0x5f37);
  var before = win.querySelectorAll('.dict-entry').length;
  var set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  set.call(input, word);
  input.dispatchEvent(new Event('input', { bubbles: true }));

  window.__l7eSearch = { word: word, before: before, started: Date.now(), done: false };
  btn.click();
  setTimeout(function () {
    window.__l7eSearch.after = win.querySelectorAll('.dict-entry').length;
    window.__l7eSearch.ms = Date.now() - window.__l7eSearch.started;
    window.__l7eSearch.typed = input.value;
    window.__l7eSearch.done = true;
  }, 3000);
  return 'search-fired';
})()
