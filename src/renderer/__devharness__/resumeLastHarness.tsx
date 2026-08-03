/**
 * Dev-only harness for Phase 6 slices 10 + 11 together — the chain neither slice
 * can prove alone.
 *
 *   npx vite --config vite.renderer.config.ts --port 5174
 *   → http://localhost:5174/src/renderer/__devharness__/resume-last-harness.html
 *
 * jsdom covers the command's outcomes (`resumeLastCommand.test.ts`) and the token
 * ordering (`shellLayerScale.test.ts`). What neither can answer is whether the
 * palette is *visible and hittable* over the opaque workspace and whether Enter
 * on a matched row actually reaches the resume handler — stacking and hit testing
 * do not exist in jsdom.
 *
 * Not imported by the app and absent from the production build: `vite build`
 * emits index.html only.
 */
import { createRoot } from 'react-dom/client';
import { createElement, Fragment, useEffect } from 'react';
import { VIDEO_CORE_RESUME_STORAGE_KEY } from '../../shared/videoCoreStudy';
import {
  MEDIA_WORKSPACE_OPEN_EVENT,
  registerMediaWorkspaceHost,
} from '../../shared/mediaWorkspace';
import '../styles.css';

/**
 * `CommandPalette` → `keyboardShortcuts` → `playerBus`, which touches `window.api`
 * at MODULE EVALUATION time. Stubbing it after the import is too late and the
 * symptom is a blank page rather than an error, so the palette is pulled in
 * dynamically below, after this runs.
 */
const api = new Proxy({}, {
  get: (_target, prop) => (typeof prop === 'string' && prop.startsWith('on')
    ? () => () => undefined
    : () => Promise.resolve(null)),
});
(window as unknown as { api: typeof api }).api = api;

const NEWEST = 'C:\\Anime\\Frieren\\Sousou no Frieren - 07.mkv';
const OLDER = 'C:\\Anime\\The Big O\\The Big O - 03.mkv';

localStorage.setItem(VIDEO_CORE_RESUME_STORAGE_KEY, JSON.stringify([
  // Deliberately store-order-first but older, so "most recent" is a real choice.
  { key: `file:${OLDER.replace(/\\/g, '/').toLowerCase()}`, positionSec: 120, updatedAt: 1_000 },
  { key: `file:${NEWEST.replace(/\\/g, '/').toLowerCase()}`, positionSec: 742, updatedAt: 9_000 },
]));

const opens: unknown[] = [];
window.addEventListener(MEDIA_WORKSPACE_OPEN_EVENT, (event) => {
  opens.push((event as CustomEvent).detail);
});

/**
 * A stand-in for the open workspace: same class, same opaque full-screen rule.
 *
 * Slice 14: it also registers as a host. The real `MediaWorkspaceHost` publishes its
 * presence from the effect that owns its window listeners, and `video.resumeLast` now
 * asks *that* rather than looking for `.seanime-host` in the DOM — so a fixture wearing
 * only the class name would make this probe measure the command declining, not the
 * palette reaching it. A stand-in has to stand in for what the thing does, not for how
 * it looks; the class name is still what the z-index rules bind to.
 */
function WorkspaceFixture() {
  useEffect(() => registerMediaWorkspaceHost(), []);
  return createElement(
    'div',
    { className: 'seanime-host', role: 'dialog', 'aria-modal': true, 'aria-label': 'workspace' },
    createElement(
      'header',
      { className: 'seanime-host-bar' },
      createElement('strong', { className: 'seanime-host-title' }, 'Media workspace'),
    ),
    createElement('div', { className: 'seanime-host-body' }),
  );
}

function report(lines: string[], ok: boolean): void {
  const out = document.getElementById('probe-report') as HTMLElement;
  out.textContent = [`resume-last chain — ${ok ? 'ALL PASS' : 'FAILURES PRESENT'}`, '', ...lines].join('\n');
  out.className = ok ? 'probe-pass' : 'probe-fail';
}

// The repo's `module` setting rejects top-level `await`, so the dynamic import
// that must run after the api stub goes in an async IIFE.
void (async () => {
  const { default: CommandPalette } = await import('../components/CommandPalette');

  createRoot(document.getElementById('root') as HTMLElement).render(
    createElement(
      Fragment,
      null,
      // App.tsx's own order: the palette first, the workspace after it. That DOM
      // order is half of why the old z-index lost — a later sibling wins ties.
      createElement(CommandPalette),
      createElement(WorkspaceFixture),
    ),
  );

  function layerAt(x: number, y: number): string {
    let el = document.elementFromPoint(x, y) as HTMLElement | null;
    while (el && el !== document.body) {
      for (const name of ['palette', 'palette-row', 'palette-input', 'seanime-host']) {
        if (el.classList.contains(name)) return name;
      }
      el = el.parentElement;
    }
    return el ? `<${el.tagName.toLowerCase()}>` : 'nothing';
  }

  /**
   * React flushes state from a plain `window` event listener AFTER the dispatch
   * returns, and `createRoot().render()` is asynchronous too. A first cut of this
   * probe queried `.palette` on the line after `dispatchEvent` and reported "the
   * palette did not mount over the workspace" — which reads exactly like the
   * stacking defect it exists to catch. Every step here settles first.
   */
  const settle = () => new Promise((r) => { window.setTimeout(r, 40); });

  async function runProbe() {
    const lines: string[] = [];
    let ok = true;
    const say = (pass: boolean, text: string) => {
      lines.push(`${pass ? 'PASS' : 'FAIL'}  ${text}`);
      if (!pass) ok = false;
    };

    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;
    if (vw < 320 || vh < 320) {
      report([`SKIPPED — viewport is ${vw}x${vh}. Size the pane, then call window.runResumeLastProbe().`], false);
      return (window as never as { __resumeLastProbe: unknown }).__resumeLastProbe = { ok: null, skipped: true };
    }

    opens.length = 0;

    // Ctrl+Space's mode. The whole point of slice 11 is that this mode has no
    // continue-watching LIST — it has to carry an action instead.
    window.dispatchEvent(new CustomEvent('palette:open', { detail: 'commands' }));
    await settle();

    const palette = document.querySelector('.palette') as HTMLElement | null;
    say(palette != null, 'the palette mounted over the workspace');
    if (!palette) { report(lines, false); return { ok: false }; }

    const rect = palette.getBoundingClientRect();
    const hit = layerAt(Math.round(rect.left + rect.width / 2), Math.round(rect.top + 8));
    say(hit === 'palette-input' || hit === 'palette',
      `a click at the palette reaches the palette, not the workspace (hit: ${hit})`);
    say(document.activeElement === document.querySelector('.palette-input'),
      'the palette input holds focus — which is what keeps the player keymap off');

    const input = document.querySelector('.palette-input') as HTMLInputElement;
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setValue?.call(input, 'resume');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await settle();

    const rows = [...document.querySelectorAll('.palette-row')] as HTMLElement[];
    const labels = rows.map((r) => r.textContent ?? '');
    const resumeRow = labels.findIndex((l) => /resume last episode|前回の続き|继续播放|Продолжить/i.test(l));
    say(resumeRow >= 0, `"resume" matches the command in COMMANDS mode (rows: ${rows.length})`);

    // Read the layer BEFORE Enter. `pick()` closes the palette, and a detached
    // node's getComputedStyle returns an empty declaration — not `auto` — so a
    // read taken afterwards reports the z-index as '' and looks like a token
    // that failed to resolve.
    const paletteZ = getComputedStyle(palette).zIndex;
    const workspaceZ = getComputedStyle(document.querySelector('.seanime-host') as HTMLElement).zIndex;

    if (resumeRow >= 0) {
      // Arrow to it, then Enter — the keyboard path a user actually takes. Each
      // arrow is its own React state update, so they settle one at a time.
      for (let i = 0; i < resumeRow; i += 1) {
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
        await settle();
      }
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    }
    // `pick()` defers the action a tick so focus lands where it expects.
    await settle();

    const detail = opens[0] as { localFilePath?: string; startAtSec?: number } | undefined;
    say(opens.length === 1, `Enter dispatched exactly one open request (got ${opens.length})`);
    // Case-insensitive: a resume key is lower-cased and forward-slashed on the
    // way into the store, so the path that comes back out is not the one seeded.
    say(/frieren - 07\.mkv$/i.test(detail?.localFilePath ?? ''),
      `it opened the most recent file, not the first in the store (${detail?.localFilePath ?? 'none'})`);
    say(typeof detail?.startAtSec === 'number' && detail.startAtSec > 700,
      `with a resume position (${detail?.startAtSec ?? 'none'}s of 742s watched)`);

    lines.push('');
    lines.push(`note  viewport ${vw}x${vh}`);
    lines.push(`note  palette z-index ${paletteZ} vs workspace ${workspaceZ}`);
    report(lines, ok);
    const result = { ok, lines, detail, viewport: `${vw}x${vh}` };
    (window as never as { __resumeLastProbe: unknown }).__resumeLastProbe = result;
    return result;
  }

  (window as never as { runResumeLastProbe: unknown }).runResumeLastProbe = runProbe;
  // Let the first render commit before the first run.
  await settle();
  void runProbe();
  window.addEventListener('resize', () => void runProbe());
})();
