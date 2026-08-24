// Category 2 re-drive, one target: `Explain again`, on the fix's own tree.
//
// Same protocol as `probes/l1-deadend.js` — quiesce to two identical signatures, take `before`,
// click, diff — but scoped to the single control the fix changed, and run on a SELF-MADE FIXTURE
// rather than on the user's stored answer. A refresh overwrites the stored explanation and there
// is no restore path, so driving it on 食べる would destroy real user data to measure a control.
// 猫 is created by this probe through the product's own button and cleared by `-restore.js`.
//
// The settle horizon is reported twice on purpose. `l1-deadend.js` votes at 3000 ms
// (`--slow-settle`); a real cloud round trip is longer than that, so a control can be honestly
// alive at 3000 ms (label + disabled moved) and only finish later.
(() => {
  const out = { done: false, steps: [] };
  window.__l1cDead = out;
  const lab = (el) => (el?.getAttribute?.('aria-label') || el?.textContent || el?.getAttribute?.('title') || '')
    .replace(/\s+/g, ' ').trim();
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const win = [...document.querySelectorAll('.fwin')].find(
    (w) => (w.querySelector('.fwin-title-text')?.textContent || '').includes('Dictionary'),
  );
  if (!win) return JSON.stringify({ refuse: 'no .fwin titled Dictionary' });

  // The signature `l1-deadend.js` settled on: text, plus every control's class/title/aria/disabled,
  // plus open/expanded counts — an icon-only toggle moves none of the first three alone.
  const signature = () => {
    const controls = [...win.querySelectorAll('button,input,select,textarea,[role="button"],[role="tab"]')];
    return JSON.stringify({
      chars: (win.textContent || '').length,
      controls: controls.length,
      entries: win.querySelectorAll('.dict-entry').length,
      marks: controls.map((c) => [
        lab(c), c.className, c.getAttribute('title') || '', c.getAttribute('aria-pressed') || '',
        c.disabled === true ? 1 : 0,
      ].join('|')).join('¦'),
      open: win.querySelectorAll('details[open]').length,
    });
  };

  const search = async (word) => {
    const input = win.querySelector('input[type="search"], input.dict-search-input, input[type="text"]');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(input, word);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    const form = input.closest('form');
    if (form) form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    for (let i = 0; i < 25; i += 1) {
      await sleep(400);
      if (win.querySelectorAll('.dict-entry').length > 0) break;
    }
  };

  const askButton = () => win.querySelector('.lexicon-explain-ask');
  const answerText = () => (win.querySelector('.lexicon-explain-summary')?.textContent || '').trim();

  // Two consecutive identical signatures, so a click's effect is never confused with the room's
  // weather. Sub-second timers are throttled to ~1 Hz in an unfocused window, so this is coarse
  // by design rather than by accident.
  const quiesce = async (tries = 12) => {
    let last = null;
    for (let i = 0; i < tries; i += 1) {
      const s = signature();
      if (s === last) return { settled: true, tries: i + 1 };
      last = s;
      await sleep(700);
    }
    return { settled: false, tries };
  };

  void (async () => {
    try {
      await search('猫');
      // `EntryExplain` renders nothing until `aiGetConfig()` resolves, so the panel appears a
      // beat after the entries do. Polling for it, not sampling once, is the difference between
      // "no explain panel" and "not yet".
      let det = null;
      for (let i = 0; i < 20; i += 1) {
        det = win.querySelector('details.lexicon-explain-entry');
        if (det) break;
        await sleep(500);
      }
      if (!det) {
        out.error = 'no explain panel on 猫';
        out.diag = {
          entries: win.querySelectorAll('.dict-entry').length,
          details: win.querySelectorAll('details').length,
          headword: lab(win.querySelector('.dict-entry')).slice(0, 60),
        };
        out.done = true;
        return;
      }
      det.open = true;
      await sleep(900);
      out.steps.push({ stage: 'fixture-start', ask: lab(askButton()), answer: answerText().slice(0, 60) });

      // Build the fixture with the product's own first-ask button.
      if (lab(askButton()) !== 'Explain again') {
        askButton().click();
        for (let i = 0; i < 40; i += 1) {
          await sleep(700);
          if (lab(askButton()) === 'Explain again') break;
        }
      }
      out.steps.push({ stage: 'fixture-built', ask: lab(askButton()), answer: answerText().slice(0, 60) });
      if (lab(askButton()) !== 'Explain again') { out.error = 'fixture never produced Explain again'; out.done = true; return; }

      out.quiesce = await quiesce();
      const before = signature();
      out.beforeAnswer = answerText();

      const seen = [];
      const obs = new MutationObserver(() => {
        seen.push({ t: Date.now(), ask: lab(askButton()), disabled: askButton()?.disabled ?? null });
      });
      obs.observe(win, { subtree: true, childList: true, characterData: true, attributes: true });
      const t0 = Date.now();
      askButton().click();

      let at3000 = null;
      for (let i = 0; i < 60; i += 1) {
        await sleep(500);
        const dt = Date.now() - t0;
        if (at3000 === null && dt >= 3000) at3000 = { dt, sig: signature(), ask: lab(askButton()) };
        if (dt > 4000 && lab(askButton()) === 'Explain again' && answerText() !== out.beforeAnswer) break;
        if (dt > 45000) break;
      }
      obs.disconnect();
      const finalSig = signature();
      out.afterAnswer = answerText();
      out.result = {
        elapsedMs: Date.now() - t0,
        mutations: seen.length,
        changedAt3000: at3000 ? at3000.sig !== before : null,
        askAt3000: at3000 ? at3000.ask : null,
        changedFinal: finalSig !== before,
        answerChanged: out.afterAnswer !== out.beforeAnswer,
        errorEl: Boolean(win.querySelector('.lexicon-explain-error')),
        blockedEl: Boolean(win.querySelector('.lexicon-explain-blocked')),
        provenance: lab(win.querySelector('.lexicon-explain-provenance')) || null,
      };
    } catch (e) {
      out.error = String(e);
    }
    out.done = true;
  })();
  return 'queued';
})()
