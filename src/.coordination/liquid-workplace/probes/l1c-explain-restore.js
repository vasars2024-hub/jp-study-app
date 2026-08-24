// Put the surface and the store back the way the re-drive found them.
// 猫's explanation was created by the probe; 食べる's was never touched.
(() => {
  const out = { done: false };
  window.__l1cRestore = out;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const lab = (el) => (el?.getAttribute?.('aria-label') || el?.textContent || el?.getAttribute?.('title') || '')
    .replace(/\s+/g, ' ').trim();
  const win = [...document.querySelectorAll('.fwin')].find(
    (w) => (w.querySelector('.fwin-title-text')?.textContent || '').includes('Dictionary'),
  );
  if (!win) return JSON.stringify({ refuse: 'no .fwin titled Dictionary' });

  void (async () => {
    try {
      out.cleared = await window.api.dictExplanationClear({ lang: 'ja', text: '猫', reading: 'ねこ' });
      out.remaining = await window.api.dictExplanationGet({
        lang: 'ja', text: '猫', reading: 'ねこ', glossLang: 'en',
        model: 'cloud:gemini-2.5-flash:default', promptVersion: 1,
      });
      const input = win.querySelector('input[type="search"], input.dict-search-input, input[type="text"]');
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, '食べる');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      const form = input.closest('form');
      if (form) form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      for (let i = 0; i < 25; i += 1) {
        await sleep(400);
        if (win.querySelectorAll('.dict-entry').length > 0) break;
      }
      const auto = [...win.querySelectorAll('button,[role="tab"]')].find((b) => lab(b) === 'Automatic');
      if (auto) auto.click();
      await sleep(600);
      out.surface = {
        entries: win.querySelectorAll('.dict-entry').length,
        savedWords: JSON.parse(localStorage.getItem('jp-saved-words-ja') || '[]').length,
        clipboard: JSON.parse(localStorage.getItem('jp-clipboard-history') || '[]').length,
        explainAsk: lab(win.querySelector('.lexicon-explain-ask')) || null,
        provenance: lab(win.querySelector('.lexicon-explain-provenance')) || null,
      };
    } catch (e) {
      out.error = String(e);
    }
    out.done = true;
  })();
  return 'queued';
})()
