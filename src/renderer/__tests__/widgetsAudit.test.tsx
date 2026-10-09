// @vitest-environment jsdom
/**
 * wid2 — every registered widget, mounted for real at its default and its
 * minimum size, in an empty profile:
 *
 *  - it renders without throwing, and says something (an empty widget must
 *    still tell the user what it is waiting for, not paint a blank box);
 *  - it passes the ARIA contract audit (names, roles, required states);
 *  - in a Japanese UI it shows no English chrome (i18n);
 *  - it is reachable by keyboard when it has controls.
 */
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { auditAria, tabOrder, type AriaFinding } from './helpers/ariaAudit';
import type { WidgetDef } from '../widgets/types';

function stubApi(): void {
  const shapes: Record<string, unknown> = {
    listLibrary: [],
    listMedia: [],
    systemStats: { cpu: 12, memory: { used: 4, total: 16 } },
    getSystemStats: { cpu: 12, memUsed: 4e9, memTotal: 16e9 },
  };
  const api = new Proxy({}, {
    get: (_t, prop) => {
      if (typeof prop !== 'string') return undefined;
      if (prop.startsWith('on')) return () => () => undefined;
      return () => Promise.resolve(prop in shapes ? shapes[prop] : null);
    },
  });
  Object.defineProperty(window, 'api', { value: api, configurable: true, writable: true });
}

const fmt = (findings: AriaFinding[]): string[] => findings.map((f) => `${f.rule}: ${f.where}${f.detail ? ` (${f.detail})` : ''}`);

let WIDGETS: WidgetDef[] = [];
let setUiLang: (lang: 'en' | 'ja') => void;

beforeAll(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  stubApi();
  const none = (): void => undefined;
  (globalThis as Record<string, unknown>).ResizeObserver ??= class {
    observe = none;
    unobserve = none;
    disconnect = none;
  };
  Element.prototype.scrollIntoView ??= (): undefined => undefined;
  window.matchMedia ??= ((query: string) => ({
    matches: false, media: query, onchange: null,
    addEventListener: none, removeEventListener: none, addListener: none, removeListener: none,
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  HTMLCanvasElement.prototype.getContext = (() => null) as unknown as typeof HTMLCanvasElement.prototype.getContext;
  localStorage.clear();
  WIDGETS = (await import('../widgets/registry')).WIDGETS;
  const i18n = await import('../i18n');
  setUiLang = i18n.setUiLang as (lang: 'en' | 'ja') => void;
}, 120_000);

afterAll(() => {
  document.body.replaceChildren();
});

async function mount(def: WidgetDef, size: { w: number; h: number }): Promise<{ host: HTMLElement; root: Root }> {
  const host = document.createElement('div');
  host.className = 'widget-body';
  document.body.append(host);
  const root = createRoot(host);
  let settings: Record<string, unknown> = {};
  await act(async () => {
    root.render(createElement(def.component, {
      settings,
      setSettings: (patch: Record<string, unknown>) => {
        settings = { ...settings, ...patch };
      },
      size,
      instanceId: `audit-${def.type}`,
    }));
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 30));
  });
  return { host, root };
}

async function unmount({ host, root }: { host: HTMLElement; root: Root }): Promise<void> {
  await act(async () => root.unmount());
  host.remove();
}

/** Visible words a user would read, minus aria-hidden decoration. */
function visibleText(el: Element): string {
  let out = '';
  for (const node of el.childNodes) {
    if (node.nodeType === 3) out += `${node.textContent ?? ''} `;
    else if (node.nodeType === 1 && (node as Element).getAttribute('aria-hidden') !== 'true') out += visibleText(node as Element);
  }
  return out.replace(/\s+/g, ' ').trim();
}

describe('widgets — the whole registry', () => {
  it('has the registry it claims', () => {
    expect(WIDGETS.length).toBeGreaterThanOrEqual(33);
  });

  it('every widget renders, says something, and audits clean at default and minimum size', async () => {
    const problems: string[] = [];
    for (const def of WIDGETS) {
      for (const [label, size] of [['default', def.defaultSize], ['min', def.minSize]] as const) {
        let mounted: { host: HTMLElement; root: Root } | null = null;
        try {
          mounted = await mount(def, size);
          const text = visibleText(mounted.host);
          const labelled = mounted.host.querySelector('[aria-label], [role="img"], svg title');
          if (!text && !labelled) problems.push(`${def.type}@${label}: renders nothing a user can read`);
          for (const finding of fmt(auditAria(mounted.host))) problems.push(`${def.type}@${label}: ${finding}`);
        } catch (err) {
          problems.push(`${def.type}@${label}: threw ${(err as Error).message}`);
        } finally {
          if (mounted) await unmount(mounted);
        }
      }
    }
    expect(problems).toEqual([]);
  }, 120_000);

  it('every widget with controls can be reached by keyboard', async () => {
    const unreachable: string[] = [];
    for (const def of WIDGETS) {
      const mounted = await mount(def, def.defaultSize);
      const controls = mounted.host.querySelectorAll('button, input, select, textarea, [role="button"], [role="slider"], [role="switch"]');
      const visibleControls = [...controls].filter((c) => !c.closest('[aria-hidden="true"]'));
      if (visibleControls.length && tabOrder(mounted.host).length === 0) unreachable.push(def.type);
      await unmount(mounted);
    }
    expect(unreachable).toEqual([]);
  }, 120_000);

  it('shows no English chrome in a Japanese UI', async () => {
    const { ensureCatalog } = await import('../../shared/i18n/catalogs');
    await ensureCatalog('ja');
    setUiLang('ja');
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    const { getUiLang } = await import('../i18n');
    expect(getUiLang()).toBe('ja');
    const english: string[] = [];
    // Words that are legitimately Latin in every UI language: units, product
    // names, and format tokens. Anything else in a Japanese UI is a missed key.
    const ALLOWED = /^(CPU|RAM|GB|MB|KB|AM|PM|JLPT|HSK|CEFR|N[1-5]|A[12]|B[12]|C[12]|Anki|Gum|Wi-?Fi|OK|SRS|UTC|GMT|IANA|BPM|Hz|dB|Lv|XP|ms|min|sec|km|kg)$/i;
    for (const def of WIDGETS) {
      const mounted = await mount(def, def.defaultSize);
      const words = visibleText(mounted.host).match(/[A-Za-z][A-Za-z'-]{2,}/g) ?? [];
      const strays = words.filter((w) => !ALLOWED.test(w));
      if (strays.length) english.push(`${def.type}: ${[...new Set(strays)].slice(0, 6).join(', ')}`);
      const labels = [...mounted.host.querySelectorAll('[aria-label], [title]')]
        .flatMap((el) => [el.getAttribute('aria-label') ?? '', el.getAttribute('title') ?? ''])
        .join(' ')
        .match(/[A-Za-z][A-Za-z'-]{2,}/g) ?? [];
      const labelStrays = labels.filter((w) => !ALLOWED.test(w));
      if (labelStrays.length) english.push(`${def.type} (labels): ${[...new Set(labelStrays)].slice(0, 6).join(', ')}`);
      await unmount(mounted);
    }
    setUiLang('en');
    expect(english).toEqual([]);
  }, 120_000);
});
