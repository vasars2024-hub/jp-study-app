'use strict';
/* eslint-disable @typescript-eslint/no-var-requires -- CommonJS tooling, run by node directly */
/**
 * Page-side helpers shared by the flows. `PAGE_HELPERS` is evaluated once per flow and
 * installs `window.__e2e` in the renderer: text-matched clicks, React-safe input fills and
 * key presses, so flows read as user steps instead of DOM plumbing.
 */
const PAGE_HELPERS = `(() => {
  const vis = (el) => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
  const norm = (s) => String(s ?? '').replace(/\\s+/g, ' ').trim();
  const api = {
    vis,
    all: (sel, root = document) => [...root.querySelectorAll(sel)].filter(vis),
    byText(sel, text, root = document) {
      const label = (el) => norm(el.innerText || el.textContent || el.getAttribute('aria-label'));
      const els = api.all(sel, root);
      if (text instanceof RegExp) return els.find((el) => text.test(label(el))) ?? null;
      return els.find((el) => label(el) === text) ?? els.find((el) => label(el).includes(text)) ?? null;
    },
    click(target) {
      const el = typeof target === 'string' ? document.querySelector(target) : target;
      if (!el) return false;
      el.scrollIntoView?.({ block: 'center' });
      el.click();
      return true;
    },
    clickText(sel, text, root) {
      const el = api.byText(sel, text, root);
      return el ? api.click(el) : false;
    },
    fill(target, value) {
      const el = typeof target === 'string' ? document.querySelector(target) : target;
      if (!el) return false;
      el.focus();
      const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    },
    key(key, opts = {}, target = document.activeElement || document.body) {
      const init = { key, code: opts.code ?? (key.length === 1 ? 'Key' + key.toUpperCase() : key), bubbles: true, cancelable: true, ...opts };
      target.dispatchEvent(new KeyboardEvent('keydown', init));
      target.dispatchEvent(new KeyboardEvent('keyup', init));
      return true;
    },
    open(section) {
      window.dispatchEvent(new CustomEvent('os:open', { detail: section }));
      return true;
    },
    text: (sel = 'body') => norm(document.querySelector(sel)?.innerText ?? ''),
    /** Viewport centre of the first occurrence of \`needle\` inside \`sel\` (character-precise, via Range). */
    textPoint(sel, needle, offset = 0) {
      const root = document.querySelector(sel);
      if (!root) return null;
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const at = node.data.indexOf(needle);
        if (at < 0) continue;
        const range = document.createRange();
        range.setStart(node, at + offset);
        range.setEnd(node, at + offset + 1);
        range.startContainer.parentElement?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
        const r = range.getBoundingClientRect();
        return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), w: r.width, h: r.height };
      }
      return null;
    },
  };
  window.__e2e = api;
  return true;
})()`;

async function installHelpers(ctx) {
  await ctx.eval(PAGE_HELPERS);
}

/** Poll a page expression until truthy; returns the value, or null on timeout (no throw). */
async function poll(ctx, expr, timeout = 15000, interval = 250) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      const v = await ctx.eval(expr);
      if (v) return v;
    } catch {
      /* page mid-render */
    }
    await ctx.sleep(interval);
  }
  return null;
}

/** `poll` for an expression that yields a Promise (an IPC call): settled before it is judged. */
async function pollAsync(ctx, expr, timeout = 15000, interval = 250) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      const v = await ctx.eval(expr, { await: true });
      if (v) return v;
    } catch {
      /* page mid-render */
    }
    await ctx.sleep(interval);
  }
  return null;
}

/** Deck cards (renderer localStorage), as the flows read them. */
const DECK = `(() => { const d = JSON.parse(localStorage.getItem('jp-flashcard-deck') || '{"cards":[]}'); return d.cards || d; })()`;

/**
 * Back to the desktop: a reader (book or manga) replaces the whole shell, so a flow that
 * opens one and fails half-way would leave the next flow's `os:open` going nowhere.
 */
async function toDesktop(ctx) {
  await installHelpers(ctx);
  for (let i = 0; i < 3; i++) {
    const onDesktop = await ctx.eval(`!!document.querySelector('.desktop-root')`);
    if (onDesktop) return true;
    await ctx.eval(`(() => { const b = [...document.querySelectorAll('button')].find((x) => __e2e.vis(x) && x.innerText.trim() === 'Library'); if (b) b.click(); return !!b; })()`);
    await poll(ctx, `!!document.querySelector('.desktop-root')`, 5000);
  }
  return ctx.eval(`!!document.querySelector('.desktop-root')`);
}

/**
 * Wait until the built-in dictionary answers a lookup. In a fresh profile it is still
 * loading when the first flows run; a flow that looks words up used to pass only when the
 * `dictionary` flow had run before it and paid that wait. Each such flow now waits itself
 * (returns at once when it is already ready). Returns `{ ready, ms, entries }`.
 */
async function ensureDictionaryReady(ctx, { word = '猫', lang = 'ja', timeout = 180000 } = {}) {
  const t0 = Date.now();
  let entries = 0;
  while (Date.now() - t0 < timeout) {
    try {
      entries = await ctx.eval(
        `window.api.lookupTermOffline(${JSON.stringify(word)}, ${JSON.stringify(lang)}).then((r) => (r && Array.isArray(r.entries) ? r.entries.length : 0)).catch(() => 0)`,
        { await: true },
      );
      if (entries > 0) return { ready: true, ms: Date.now() - t0, entries };
    } catch {
      /* page mid-render */
    }
    await ctx.sleep(1000);
  }
  return { ready: false, ms: Date.now() - t0, entries };
}

/**
 * Run one dictionary import job (`window.api.dictImportStart(request)`) to its end.
 *
 * The main process runs one import at a time, and a Yomitan store imported a moment
 * earlier queues its own database job that starts the instant the slot frees. So a
 * start can be refused `busy` even right after the status read idle, and the job
 * after ours can start before a status poll sees ours settle. This retries a busy
 * start (waiting for the job that holds the slot) and reads our job's outcome from
 * the `dictImport:changed` stream by id, all under one deadline instead of a fixed
 * wait. Returns `{ start, job, busyRetries, ms }`; `job` is the terminal snapshot,
 * or null when the deadline passed first.
 */
async function runDictionaryImport(ctx, request, { timeout = 360000 } = {}) {
  const t0 = Date.now();
  const left = () => timeout - (Date.now() - t0);
  const status = () => ctx.eval(`window.api.dictImportStatus()`, { await: true }).catch(() => null);
  await ctx.eval(`(() => {
    if (!window.__e2eDictJobs) {
      window.__e2eDictJobs = {};
      window.api.onDictImportChanged((s) => { if (s && s.jobId) window.__e2eDictJobs[s.jobId] = s; });
    }
    return true;
  })()`);

  let start = null;
  let busyRetries = 0;
  while (left() > 0) {
    start = await ctx
      .eval(`window.api.dictImportStart(${JSON.stringify(request)})`, { await: true })
      .catch((error) => ({ ok: false, error: String(error && error.message ? error.message : error) }));
    if (!start || start.ok || start.error !== 'busy') break;
    busyRetries += 1;
    const holder = start.snapshot && start.snapshot.jobId;
    while (left() > 0) {
      const s = await status();
      if (!s || s.status !== 'running' || (holder && s.jobId !== holder)) break;
      await ctx.sleep(500);
    }
  }
  if (!start || !start.ok) return { start, job: null, busyRetries, ms: Date.now() - t0 };

  const jobId = start.snapshot.jobId;
  let job = start.snapshot.status !== 'running' ? start.snapshot : null;
  while (!job && left() > 0) {
    job = await ctx
      .eval(`(async () => {
        const seen = window.__e2eDictJobs && window.__e2eDictJobs[${JSON.stringify(jobId)}];
        if (seen && seen.status !== 'running') return seen;
        const s = await window.api.dictImportStatus();
        return s && s.jobId === ${JSON.stringify(jobId)} && s.status !== 'running' ? s : null;
      })()`, { await: true })
      .catch(() => null);
    if (!job) await ctx.sleep(500);
  }
  return { start, job, busyRetries, ms: Date.now() - t0 };
}

/** A real (CDP) mouse click on the first occurrence of `needle` inside `sel`. */
async function clickText(ctx, sel, needle, offset = 0) {
  const pt = await ctx.eval(`__e2e.textPoint(${JSON.stringify(sel)}, ${JSON.stringify(needle)}, ${offset})`);
  if (!pt) return { ok: false, error: `no "${needle}" in ${sel}` };
  const r = await ctx.request('/click', { window: 'main', x: pt.x, y: pt.y });
  return { ...r, point: pt };
}

module.exports = { PAGE_HELPERS, installHelpers, poll, pollAsync, clickText, toDesktop, ensureDictionaryReady, runDictionaryImport, DECK };
