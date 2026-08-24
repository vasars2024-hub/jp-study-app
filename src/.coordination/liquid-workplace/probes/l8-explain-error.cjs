/**
 * L8 instrument — rubric category 8's ERROR state, the one row `l8-honest-states.cjs` could not
 * reach.
 *
 * Against a refused AnkiConnect, `addToAnki` never gets as far as `ankiMineNote`: `ensureAnki()`
 * reads `connected:false` and returns, so `res.error` and its `.dict-add.error` render are
 * unreachable by construction. The offline state is the honest answer there, and it is measured.
 * The error branch needs a dependency that ACCEPTS the request and then fails it.
 *
 * THE INDUCTION. `EntryExplain` calls `dict:explain`, which runs the app's configured AI provider
 * and maps a provider failure to `lexicon.wordExplain.failedProvider` (`lexiconExplainView.ts:61`).
 * This probe configures the `deepseek` bucket with a key that is syntactically a key and is not a
 * credential, switches to `deepseek-v4-pro`, and clicks the product's own button. A real HTTPS
 * request goes to a real host and is rejected. Nothing is stubbed and nothing is monkeypatched.
 *
 * WHY THIS IS REVERSIBLE, WHICH IS THE WHOLE REASON IT IS ALLOWED. `deepseek` is currently
 * UNCONFIGURED (`aiProviderHealth`: `configured:false`), so nothing of the user's is overwritten,
 * and the bucket is `store: 'vault'` in `credentialRegistry.ts:135-154`, so `credentials:clear`
 * removes it — `ai:setApiKey` cannot, because it refuses an empty key at `mining.ts:1959` before
 * `writeAiProviderSecret` would have cleared it. That asymmetry is why the restore goes through
 * `clearCredential` and not through the setter. The user's real Gemini key is never read, never
 * written and never sent anywhere.
 *
 * THE CONTROL. The same `.lexicon-explain-error` element is read BEFORE the induction and after —
 * it must be absent first and named second, or the probe is reporting an error it did not cause.
 * `failure.code` is captured for the same reason: a code carrying the provider's own HTTP status
 * is proof the request left the machine, as opposed to a client-side precheck that never called
 * anyone. The positive direction — this control returning a real grounded answer — was measured on
 * 2026-08-23 with the real provider and is NOT re-run here, because that is a paid call on the
 * user's account and the relay escalates rather than spends.
 *
 * Run: node src/.coordination/liquid-workplace/probes/l8-explain-error.cjs [--restore-only]
 */
'use strict';
const fs = require('node:fs');

const cfg = JSON.parse(fs.readFileSync('debug/bridge.json', 'utf8'));
const RESTORE_ONLY = process.argv.includes('--restore-only');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Shaped like a key, is not one. Never a real credential, never a real user's value. */
const FAKE_KEY = 'sk-l8probe000000000000000000000000invalid';

async function ev(js) {
  const r = await fetch(`http://127.0.0.1:${cfg.port}/eval`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ js }),
  });
  const t = await r.json();
  if (!t.ok) throw new Error(`eval failed: ${JSON.stringify(t).slice(0, 300)}`);
  try {
    return JSON.parse(t.result);
  } catch {
    return t.result;
  }
}

/**
 * The bridge never awaits: a promise serialises to `{}`. Every async call parks its answer on a
 * global under a key and is read back after a settle.
 */
async function call(expr, key, settle = 3000) {
  await ev(`(() => { window.__l8e = window.__l8e || {};
    (${expr}).then((v) => { window.__l8e[${JSON.stringify(key)}] = v; })
      .catch((e) => { window.__l8e[${JSON.stringify(key)}] = 'THREW ' + e.message; });
    return 'asked'; })()`);
  await sleep(settle);
  // `ev` already parses a JSON reply. Wrapping this in another JSON.parse threw
  // `"[object Object]" is not valid JSON` on the first run, before any mutation had happened.
  return ev(`JSON.stringify(window.__l8e[${JSON.stringify(key)}] ?? null)`);
}

const READ_EXPLAIN = `(() => {
  const win = document.querySelector('.fwin');
  const txt = (sel) => [...win.querySelectorAll(sel)].map((e) => (e.textContent || '').trim()).filter(Boolean);
  const details = win.querySelector('.lexicon-explain-entry');
  return JSON.stringify({
    detailsOpen: details ? details.open : null,
    error: txt('.lexicon-explain-error'),
    errorRole: [...win.querySelectorAll('.lexicon-explain-error')].map((e) => e.getAttribute('role')),
    code: txt('.lexicon-explain-code'),
    blocked: txt('.lexicon-explain-blocked'),
    answer: txt('.lexicon-explain-summary'),
    askLabel: txt('.lexicon-explain-ask'),
    askDisabled: [...win.querySelectorAll('.lexicon-explain-ask')].map((b) => b.disabled),
  });
})()`;

const RAW_KEY = /^[a-z][a-zA-Z0-9]*(\.[a-zA-Z0-9_]+){2,}$/;

async function restore() {
  const cleared = await call(`window.api.clearCredential('deepseek')`, 'cleared');
  const back = await call(`window.api.aiSetProvider('gemini-2.5-flash')`, 'back');
  const after = await call(`window.api.aiGetConfig()`, 'cfgAfter');
  return { cleared, back, config: after };
}

(async () => {
  const out = { at: new Date().toISOString() };

  if (RESTORE_ONLY) {
    out.restore = await restore();
    console.log(JSON.stringify(out, null, 1));
    return;
  }

  // ---- 1. capture, so the restore has something to be verified against -------------------------
  out.configBefore = (await call(`window.api.aiGetConfig()`, 'cfgBefore'));
  out.healthBefore = (await call(`window.api.aiProviderHealth()`, 'healthBefore'));

  // Open the disclosure, so the state measured is one a user would actually see painted.
  await ev(`(() => {
    const d = document.querySelector('.fwin .lexicon-explain-entry');
    if (d && !d.open) d.open = true;
    return 'opened';
  })()`);
  out.before = await ev(READ_EXPLAIN);

  // ---- 2. the induction ------------------------------------------------------------------------
  out.keySet = await call(
    `window.api.aiSetApiKey({ provider: 'deepseek', apiKey: ${JSON.stringify(FAKE_KEY)} })`,
    'keySet',
  );
  out.providerSet = (await call(`window.api.aiSetProvider('deepseek-v4-pro')`, 'providerSet'));
  await sleep(600);
  out.duringConfig = (await call(`window.api.aiGetConfig()`, 'cfgDuring'));

  // ---- 3. drive the product's own control -------------------------------------------------------
  await ev(`(() => {
    const d = document.querySelector('.fwin .lexicon-explain-entry');
    if (d && !d.open) d.open = true;
    document.querySelector('.fwin .lexicon-explain-ask').click();
    return 'asked';
  })()`);
  await sleep(12000);
  out.after = await ev(READ_EXPLAIN);

  out.verdict = {
    errorAbsentBefore: out.before.error.length === 0,
    errorNamedAfter: out.after.error.length > 0,
    rawKeys: out.after.error.filter((s) => RAW_KEY.test(s)),
    roleAlert: out.after.errorRole,
    providerCode: out.after.code,
    /**
     * A stored answer left on screen beside the error is NOT a false success — `EntryExplain`
     * keeps it deliberately, because a failed refresh leaves the database row untouched and
     * replacing it with an error would claim the stored answer was gone. The false success is an
     * answer that CHANGED: a new one manufactured out of a failed call.
     */
    answerBefore: out.before.answer,
    answerAfter: out.after.answer,
    falseSuccess: JSON.stringify(out.after.answer) !== JSON.stringify(out.before.answer),
  };

  // ---- 4. restore, and prove it -----------------------------------------------------------------
  out.restore = await restore();
  out.healthAfter = (await call(`window.api.aiProviderHealth()`, 'healthAfter'));
  out.restored =
    JSON.stringify(out.restore.config) === JSON.stringify(out.configBefore) &&
    JSON.stringify(out.healthAfter) === JSON.stringify(out.healthBefore);

  console.log(JSON.stringify(out, null, 1));
})().catch(async (e) => {
  console.error('PROBE FAILED', e.message);
  // A probe that dies mid-induction must not leave a fabricated key in the user's vault.
  try {
    console.error('EMERGENCY RESTORE', JSON.stringify(await restore()));
  } catch (e2) {
    console.error('EMERGENCY RESTORE ALSO FAILED', e2.message);
  }
  process.exit(1);
});
