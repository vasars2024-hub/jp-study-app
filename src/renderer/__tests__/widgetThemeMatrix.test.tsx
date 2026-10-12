// @vitest-environment jsdom
/**
 * wid5 — every widget, in its real frame, under every material it can be
 * shown in: Study OS (no material set), Aero (the frameless Sidebar gadget
 * chrome) and WIRED. Blanc does not host desktop widgets at all; the last case
 * pins that, so a widget never needs a Blanc style it does not have.
 *
 * jsdom has no layout, so "unstyled" and "overflow" are read the way the
 * hit-target guard reads targets: from the stylesheets that window would load.
 *
 *  - Unstyled: every styling hook a widget renders (`wgt-*`, `widget-*`,
 *    `aero-*`, `wired-*`, `ui-*`) must be named by a selector in the base
 *    sheets, the active material's sheets, or a sheet the widget asks for.
 *    A class nobody styles is markup that renders as browser defaults.
 *  - Overflow: no inline pixel width/min-width wider than the frame, at the
 *    default and the minimum size; the frame clips and the body scrolls.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { act, createElement, createRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { WidgetDef } from '../widgets/types';
import { installJsdomShims, stubBridge } from './helpers/axeHarness';
import { rel, walkImportGraph } from './importGraph';

const requestedSheets = new Set<string>();
vi.mock('../theme/useThemeSheets', () => ({
  useThemeSheets: (ids: readonly string[]) => {
    for (const id of ids) requestedSheets.add(id);
  },
}));

const RENDERER = path.join(__dirname, '..');

function cssFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === '__tests__' || name === 'node_modules' || name === '__devharness__') continue;
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) cssFiles(p, out);
    else if (p.endsWith('.css')) out.push(p);
  }
  return out;
}

let MATERIAL_SHEETS: Readonly<Record<string, readonly string[]>> = {};
let SLOT_SHEETS = new Set<string>();
const sheetText = new Map<string, string>();
let baseCss = '';

function sheet(id: string): string {
  const file = id === 'weather' || id === 'atmosphere'
    ? path.join(RENDERER, 'environment', `${id}.css`)
    : path.join(RENDERER, 'theme', `${id}.css`);
  return sheetText.get(file) ?? '';
}

function styled(token: string, corpus: string): boolean {
  return new RegExp(`\\.${token.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}(?![\\w-])`).test(corpus);
}

/** Classes that are styling hooks by name; state words and data hooks are not. */
const HOOK = /^(wgt|widget|aero|wired|ui)-/;

let WIDGETS: WidgetDef[] = [];
let WidgetFrame: typeof import('../components/WidgetFrame').default;

beforeAll(async () => {
  installJsdomShims();
  stubBridge({
    listLibrary: [],
    listMedia: [],
    systemStats: { cpu: 12, memory: { used: 4, total: 16 } },
    getSystemStats: { cpu: 12, memUsed: 4e9, memTotal: 16e9 },
    watchList: { items: [] },
    assetsList: { assets: [], statuses: [] },
  });
  HTMLCanvasElement.prototype.getContext = (() => null) as unknown as typeof HTMLCanvasElement.prototype.getContext;
  localStorage.clear();
  const sheets = await import('../theme/themeSheets');
  MATERIAL_SHEETS = sheets.MATERIAL_SHEETS;
  SLOT_SHEETS = new Set(sheets.THEME_SHEET_ORDER.filter((id) => !(sheets.ALWAYS_SHEETS as readonly string[]).includes(id)));
  for (const file of cssFiles(RENDERER)) {
    const text = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    sheetText.set(file, text);
    const id = path.basename(file, '.css');
    if (!(SLOT_SHEETS.has(id) && path.dirname(file).endsWith('theme'))) baseCss += `\n${text}`;
  }
  WIDGETS = (await import('../widgets/registry')).WIDGETS;
  WidgetFrame = (await import('../components/WidgetFrame')).default;
}, 120_000);

afterAll(() => {
  document.documentElement.removeAttribute('data-materials');
  document.body.replaceChildren();
});

type Material = 'studyos' | 'aero' | 'wired';
const MATERIALS: Material[] = ['studyos', 'aero', 'wired'];

async function mountFramed(def: WidgetDef, size: { w: number; h: number }): Promise<{ host: HTMLElement; root: Root }> {
  const host = document.createElement('div');
  host.style.width = '1280px';
  document.body.append(host);
  const desk = createRef<HTMLDivElement>();
  const root = createRoot(host);
  await act(async () => {
    root.render(
      createElement('div', { ref: desk, className: 'os-desktop' },
        createElement(WidgetFrame, {
          widget: { id: `matrix-${def.type}`, type: def.type, x: 16, y: 16, w: size.w, h: size.h, z: 1, settings: {} },
          deskRef: desk as React.RefObject<HTMLDivElement>,
          focused: true,
          onFocus: () => undefined,
          onPatch: () => undefined,
          onRemove: () => undefined,
          onDuplicate: () => undefined,
        }),
      ),
    );
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 30));
  });
  return { host, root };
}

function pxOver(style: string, prop: 'width' | 'min-width', limit: number): number | null {
  const m = new RegExp(`(?:^|;)\\s*${prop}:\\s*(\\d+(?:\\.\\d+)?)px`).exec(style);
  if (!m) return null;
  const v = Number(m[1]);
  return v > limit + 1 ? v : null;
}

describe('widgets under every material', () => {
  it('has the registry it claims', () => {
    expect(WIDGETS.length).toBeGreaterThanOrEqual(33);
  });

  for (const material of MATERIALS) {
    it(`${material}: every styling hook is styled, nothing is wider than its frame`, async () => {
      if (material === 'studyos') document.documentElement.removeAttribute('data-materials');
      else document.documentElement.setAttribute('data-materials', material);
      const problems: string[] = [];
      for (const def of WIDGETS) {
        for (const [label, size] of [['default', def.defaultSize], ['min', def.minSize]] as const) {
          requestedSheets.clear();
          let mounted: { host: HTMLElement; root: Root } | null = null;
          try {
            mounted = await mountFramed(def, size);
            const corpus = [
              baseCss,
              ...(material === 'studyos' ? [] : (MATERIAL_SHEETS[material] ?? []).map(sheet)),
              ...[...requestedSheets].map(sheet),
            ].join('\n');
            const frame = mounted.host.querySelector('.widget-frame');
            if (!frame) {
              problems.push(`${def.type}@${label}: no frame`);
              continue;
            }
            if (!frame.querySelector('.widget-body')) problems.push(`${def.type}@${label}: no body`);
            const unstyled = new Set<string>();
            for (const el of [frame, ...frame.querySelectorAll('*')]) {
              for (const token of el.classList) {
                if (HOOK.test(token) && !styled(token, corpus)) unstyled.add(token);
              }
              const style = el.getAttribute('style') ?? '';
              const wide = pxOver(style, 'width', size.w) ?? pxOver(style, 'min-width', size.w);
              if (wide != null && el !== frame) problems.push(`${def.type}@${label}: ${el.tagName.toLowerCase()}.${[...el.classList].join('.')} is ${wide}px in a ${size.w}px frame`);
            }
            for (const token of unstyled) problems.push(`${def.type}@${label}: .${token} is not styled under ${material}`);
          } catch (err) {
            problems.push(`${def.type}@${label}: threw ${(err as Error).message}`);
          } finally {
            if (mounted) {
              const m = mounted;
              await act(async () => m.root.unmount());
              m.host.remove();
            }
          }
        }
      }
      expect(problems.join('\n')).toBe('');
    }, 180_000);
  }

  it('the frame clips and the body scrolls in the base sheet, so content can never spill', () => {
    const rule = (selector: string): string => {
      const m = new RegExp(`(?:^|\\})\\s*${selector.replace('.', '\\.')}\\s*\\{([^}]*)\\}`).exec(baseCss);
      return m?.[1] ?? '';
    };
    expect(rule('.widget-frame')).toMatch(/overflow:\s*hidden/);
    expect(rule('.widget-body')).toMatch(/overflow:\s*auto/);
    expect(rule('.widget-body')).toMatch(/min-height:\s*0/);
  });

  it('Blanc never hosts desktop widgets, so it needs no widget styles', () => {
    const graph = walkImportGraph(path.join(RENDERER, 'blancMain.tsx'));
    const reached = [...graph.files.keys()].map(rel).filter((f) => /\/widgets\/registry\.tsx$|\/components\/WidgetFrame\.tsx$/.test(`/${f}`));
    expect(reached).toEqual([]);
  });
});
