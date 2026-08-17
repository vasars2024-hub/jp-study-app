/**
 * Step 1 of the two-palette run — parks the LIVE theme engine on `window.__lqTheme`.
 *
 * Separate file because the bridge's /eval is synchronous: a promise serialises to `{}`, so the
 * import cannot be awaited inside the measuring expression. Run this, then
 * `l1-palette-contrast.js`, which refuses if `listThemes()` does not report 13 — an empty
 * registry means `import()` handed back a duplicate module copy and every palette would measure
 * identically.
 */
(() => {
  window.__lqTheme = { state: 'loading' };
  import('/src/renderer/theme/engine.ts')
    .then((m) => {
      window.__lqTheme = { state: 'ready', registered: m.listThemes().length, mod: m };
    })
    .catch((e) => {
      window.__lqTheme = { state: 'error', why: String(e) };
    });
  return 'loading /src/renderer/theme/engine.ts — run l1-palette-contrast.js next'
})()
