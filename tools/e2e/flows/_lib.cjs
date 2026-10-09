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

/** A real (CDP) mouse click on the first occurrence of `needle` inside `sel`. */
async function clickText(ctx, sel, needle, offset = 0) {
  const pt = await ctx.eval(`__e2e.textPoint(${JSON.stringify(sel)}, ${JSON.stringify(needle)}, ${offset})`);
  if (!pt) return { ok: false, error: `no "${needle}" in ${sel}` };
  const r = await ctx.request('/click', { window: 'main', x: pt.x, y: pt.y });
  return { ...r, point: pt };
}

module.exports = { PAGE_HELPERS, installHelpers, poll, clickText, toDesktop };
