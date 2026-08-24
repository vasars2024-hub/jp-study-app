// Category 2, one target: `Forget this explanation`, driven ALONE on a self-made fixture.
//
// Why it exists. The 2026-08-24 sweep (`l1-deadend.js`) reported this control as a dead end,
// which would have been category 2's only remaining product defect. It is not one: the control
// removes the stored explanation and the panel collapses back to `Explain in Agent`, which is a
// large observable effect. The sweep missed it because it rebinds a target by
// `label|tag|type|class` + ORDINAL, and eight sibling entries carry a button with that identical
// key — the node it re-resolved after the click was a different entry's, whose signature had not
// moved. Same shape as every other category-1/2 "product decision" on this surface: an instrument.
//
// It is driven on 猫, built by the product's own `Explain in Agent`, for the reason
// `l1c-explain-deadend.js` states: forgetting deletes a stored explanation with no restore path,
// so driving it on the user's 食べる destroys real data to measure a control.
(() => {
  const out = { done: false, steps: [] };
  window.__l1cForget = out;
  const lab = (el) => (el?.getAttribute?.('aria-label') || el?.textContent || el?.getAttribute?.('title') || '')
    .replace(/\s+/g, ' ').trim();
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const win = [...document.querySelectorAll('.fwin')].find(
    (w) => (w.querySelector('.fwin-title-text')?.textContent || '').includes('Dictionary'),
  );
  if (!win) return JSON.stringify({ refuse: 'no .fwin titled Dictionary' });

  const signature = () => {
    const controls = [...win.querySelectorAll('button,input,select,textarea,[role="button"],[role="tab"]')];
    return JSON.stringify({
      chars: (win.textContent || '').length,
      controls: controls.length,
      entries: win.querySelectorAll('.dict-entry').length,
      marks: controls.map((c) => [
        lab(c), c.className, c.getAttribute('title') || '', c.getAttribute('aria-pressed') || '',
        c.disabled === true ? 1 : 0,
      ].join('|')).join('\u00a6'),
      open: win.querySelectorAll('details[open]').length,
    });
  };

  const search = async (word) => {
    const input = win.querySelector('input[type="search"], input.dict-search-input, input[type="text"]');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(input, word);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    const btn = [...win.querySelectorAll('button')].find((b) => /^(Search|\u691c\u7d22)/.test(lab(b)));
    await sleep(300);
    if (btn) btn.click();
    for (let i = 0; i < 25; i += 1) {
      await sleep(400);
      if (win.querySelectorAll('.dict-entry').length > 0) break;
    }
  };

  const askButton = () => win.querySelector('.lexicon-explain-ask');
  const forgetButton = () => win.querySelector('.lexicon-explain-forget');
  const answerText = () => (win.querySelector('.lexicon-explain-summary')?.textContent || '').trim();

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
      await search('\u732b');
      let det = null;
      for (let i = 0; i < 20; i += 1) {
        det = win.querySelector('details.lexicon-explain-entry');
        if (det) break;
        await sleep(500);
      }
      if (!det) { out.error = 'no explain panel on the fixture word'; out.done = true; return; }
      det.open = true;
      await sleep(900);
      out.steps.push({ stage: 'fixture-start', ask: lab(askButton()), forget: lab(forgetButton()) });

      if (lab(askButton()) !== 'Explain again') {
        askButton().click();
        for (let i = 0; i < 40; i += 1) {
          await sleep(700);
          if (lab(askButton()) === 'Explain again') break;
        }
      }
      if (lab(askButton()) !== 'Explain again') { out.error = 'fixture never produced Explain again'; out.done = true; return; }
      out.steps.push({ stage: 'fixture-built', ask: lab(askButton()), forget: lab(forgetButton()), answerChars: answerText().length });

      out.quiesce = await quiesce();
      const before = signature();
      out.beforeAnswer = answerText();
      out.beforeForgetPresent = Boolean(forgetButton());
      if (!out.beforeForgetPresent) { out.error = 'no forget control after building the fixture'; out.done = true; return; }

      const seen = [];
      const obs = new MutationObserver(() => { seen.push(Date.now()); });
      obs.observe(win, { subtree: true, childList: true, characterData: true, attributes: true });
      const t0 = Date.now();
      forgetButton().click();
      let at3000 = null;
      for (let i = 0; i < 30; i += 1) {
        await sleep(400);
        const dt = Date.now() - t0;
        if (at3000 === null && dt >= 3000) at3000 = { dt, sig: signature() };
        if (dt > 3200) break;
      }
      obs.disconnect();
      out.result = {
        elapsedMs: Date.now() - t0,
        mutations: seen.length,
        firstMutationMs: seen.length ? seen[0] - t0 : null,
        changedAt3000: at3000 ? at3000.sig !== before : null,
        changedFinal: signature() !== before,
        forgetGone: !forgetButton(),
        askNow: lab(askButton()),
        answerBeforeChars: out.beforeAnswer.length,
        answerAfterChars: answerText().length,
        errorEl: Boolean(win.querySelector('.lexicon-explain-error')),
      };
    } catch (e) {
      out.error = String(e);
    }
    out.done = true;
  })();
  return 'queued';
})()
