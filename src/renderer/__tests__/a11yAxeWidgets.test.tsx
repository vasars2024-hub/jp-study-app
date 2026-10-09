// @vitest-environment jsdom
/**
 * a11y3 — axe-core (plus the house ARIA audit) over every registered widget,
 * mounted for real at its default and its minimum size in an empty profile,
 * the way widgetsAudit.test.tsx mounts them. (The frame chrome around a
 * widget on the desktop is covered by a11yAxeShell's whole-desktop pass.)
 */
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { WidgetDef } from '../widgets/types';
import { a11yViolations } from './helpers/axeAudit';
import { installJsdomShims, stubBridge } from './helpers/axeHarness';

let WIDGETS: WidgetDef[] = [];

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
  localStorage.clear();
  WIDGETS = (await import('../widgets/registry')).WIDGETS;
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
      instanceId: `axe-${def.type}`,
    }));
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 30));
  });
  return { host, root };
}

describe('widgets — axe-core', () => {
  it('every widget at default and minimum size', async () => {
    expect(WIDGETS.length).toBeGreaterThanOrEqual(33);
    const problems: string[] = [];
    for (const def of WIDGETS) {
      for (const [label, size] of [['default', def.defaultSize], ['min', def.minSize]] as const) {
        let mounted: { host: HTMLElement; root: Root } | null = null;
        try {
          mounted = await mount(def, size);
          for (const line of await a11yViolations(mounted.host)) problems.push(`${def.type}@${label}: ${line}`);
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
    expect(problems).toEqual([]);
  }, 180_000);
});
