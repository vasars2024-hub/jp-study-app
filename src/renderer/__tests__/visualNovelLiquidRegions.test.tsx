// @vitest-environment jsdom
/**
 * L6 — which Visual Novel regions adopted the contextual primitive.
 *
 * Found by the category-3 harness rather than by reading. Scored at
 * `@.visual-novel-panel`, 782x513, in Liquid presentation, the surface reported
 * **2 Liquid-eligible regions and only 1 treated**: `aside.lq-reading-tool`
 * carries `.lq-liquid` from the shared canvas, and the panel's own title-and-tools
 * row carried nothing at all — so in a Liquid window the chrome stayed a flat
 * plate beside a glass tool. It is navigation/transport by §2.3, so it is now a
 * `ContextualSurface`, and the surface scores 2/2 treated, 2/2 shared.
 *
 * The half that has to stay pinned is what did NOT change. `.lq-contextual`
 * paints nothing outside `.fwin-liquid`, so a conventional window is unaffected —
 * measured live at rgba(0, 0, 0, 0) and 754x66 in standard against a 0.72-alpha
 * 754x84 in Liquid. `.lq-liquid` on the same element would have made every
 * conventional window glass at once, which is why this file asserts its absence.
 *
 * Mounting follows `visualNovelRemoveReports.test.tsx`: `window.api` has to exist
 * before the panel is IMPORTED, because its import graph reads
 * `window.api.onPlayerSync` at module-eval time.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { normalizeVisualNovelDatabase } from '../../shared/visualNovel';

const seed = normalizeVisualNovelDatabase({
  version: 1,
  entries: [{
    id: 'vn-1',
    title: 'Sample Visual Novel',
    japaneseTitle: 'サンプルノベル',
    engine: 'kirikiri',
    executablePath: 'C:/Games/Sample/sample.exe',
    status: 'reading',
    completionPct: 42,
    totalPlaytimeSec: 3600,
    routes: [],
  }],
});

const EMPTY_RESULT = new Proxy({}, { get: () => [] });

function installApiStub(): void {
  const api: Record<string, unknown> = {
    visualNovelList: async () => seed,
    visualNovelHookState: async () => null,
    visualNovelSessionState: async () => ({ startedAt: null }),
  };
  (window as unknown as { api: unknown }).api = new Proxy(api, {
    get: (target, prop: string | symbol) => {
      if (prop === 'then') return undefined;
      if (typeof prop === 'string' && prop in target) return target[prop];
      if (typeof prop === 'string' && prop.startsWith('on')) return () => (): undefined => undefined;
      return async (): Promise<unknown> => EMPTY_RESULT;
    },
  });
}

let Panel: typeof import('../components/immersion/VisualNovelPanel').default;
let root: Root | null = null;
let host: HTMLDivElement;

beforeAll(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  installApiStub();
  Panel = (await import('../components/immersion/VisualNovelPanel')).default;
});

afterEach(() => {
  root?.unmount();
  root = null;
  document.body.replaceChildren();
});

async function mount(): Promise<void> {
  host = document.createElement('div');
  document.body.append(host);
  const mounted = createRoot(host);
  root = mounted;
  await act(async () => { mounted.render(<Panel onClose={() => undefined} />); });
  await act(async () => { await Promise.resolve(); });
}

function must<T>(value: T | null, what: string): T {
  if (value === null) throw new Error(`missing ${what}`);
  return value;
}

describe('visual novel panel — liquid regions', () => {
  it('gives the panel head the contextual role and keeps it a landmark', async () => {
    await mount();
    const head = must(host.querySelector('.visual-novel-panel-head'), '.visual-novel-panel-head');
    // Still a `header`: the primitive takes `as`, and swapping the element for a
    // div would trade a landmark for a material.
    expect(head.tagName).toBe('HEADER');
    expect(head.classList.contains('lq-contextual')).toBe(true);
    expect(head.getAttribute('data-lq-role')).toBe('contextual');
    // What makes it contextual rather than decorative: it carries the panel's
    // transport — the library toggle and the way back to the browser.
    expect(head.querySelectorAll('.visual-novel-panel-tools button').length).toBe(2);
  });

  it('does NOT give the head lq-liquid, which would paint in conventional windows too', async () => {
    await mount();
    const head = must(host.querySelector('.visual-novel-panel-head'), '.visual-novel-panel-head');
    // §2 non-negotiable 1: conventional presentation is the default. `lq-liquid`
    // paints unconditionally; `lq-contextual` is inert until `.fwin-liquid` opts in.
    expect(head.classList.contains('lq-liquid')).toBe(false);
    expect(head.querySelector('.lq-liquid')).toBeNull();
  });

  it('keeps the dense workspace outside the contextual surface', async () => {
    await mount();
    const head = must(host.querySelector('.visual-novel-panel-head'), '.visual-novel-panel-head');
    // Asserted first, so "the workspace is outside it" cannot pass vacuously by
    // there being no contextual surface at all.
    expect(host.querySelectorAll('.lq-contextual').length).toBe(1);
    const workspace = must(host.querySelector('.visual-novel-workspace'), '.visual-novel-workspace');
    // A capture form, a summary, routes and progress are what §2.3 puts on stable
    // opaque anchors — the category-3 number that has to stay 0 is dense work on
    // translucent material.
    expect(head.contains(workspace)).toBe(false);
  });
});
