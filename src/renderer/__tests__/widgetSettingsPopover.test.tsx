// @vitest-environment jsdom
/**
 * wid5 — widget settings live in one place, and widgets can be placed without
 * a pointer.
 *
 *  - Every setting a widget READS is declared in its `settingsSchema` (found by
 *    rendering each widget with a settings bag that records what is read), and
 *    every declared field is one the widget reads — no dead or missing knobs.
 *  - Every field label exists in all four languages; the popover renders in a
 *    Japanese UI without English.
 *  - The frame's menu opens the popover in every material; changes persist
 *    through the frame; Escape closes it.
 *  - "Move or resize with keyboard": arrows move, Shift+arrows resize, Ctrl is
 *    a bigger step, Escape puts the widget back.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, createElement, createRef, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { WidgetSnapshot } from '../../shared/desktop';
import type { WidgetDef } from '../widgets/types';
import { installJsdomShims, stubBridge } from './helpers/axeHarness';
import { nudgeWidget } from '../widgets/widgetKeyboard';

let WIDGETS: WidgetDef[] = [];
let WidgetFrame: typeof import('../components/WidgetFrame').default;
let CATALOGS: Record<string, Record<string, unknown>>;

/** Settings that are the widget's own DATA (edited inline), not configuration. */
const DATA_KEYS = new Set(['items', 'goals', 'habits', 'zones']);

/**
 * In an empty profile the reading-list widgets show "make a list" and never get
 * as far as reading which list was chosen; the source check below pins that
 * they do read it once a list exists.
 */
const EMPTY_PROFILE_UNREAD: Record<string, string> = {
  'reading-list-progress': 'listId',
  'reading-next-up': 'listId',
  'reading-challenge-pace': 'listId',
};

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
  WIDGETS = (await import('../widgets/registry')).WIDGETS;
  WidgetFrame = (await import('../components/WidgetFrame')).default;
  CATALOGS = (await import('../../shared/i18n/catalogs/all')).CATALOGS as unknown as Record<string, Record<string, unknown>>;
}, 120_000);

afterEach(() => {
  document.documentElement.removeAttribute('data-materials');
  document.body.replaceChildren();
});

afterAll(async () => {
  const { setUiLang } = await import('../i18n');
  setUiLang('en');
});

async function renderRecording(def: WidgetDef): Promise<Set<string>> {
  const read = new Set<string>();
  const settings = new Proxy({} as Record<string, unknown>, {
    get: (target, prop) => {
      if (typeof prop === 'string') read.add(prop);
      return Reflect.get(target, prop);
    },
  });
  const host = document.createElement('div');
  host.className = 'widget-body';
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(createElement(def.component, { settings, setSettings: () => undefined, size: def.defaultSize, instanceId: `rec-${def.type}` }));
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 20));
  });
  await act(async () => root.unmount());
  host.remove();
  return read;
}

function FramedHarness({ def, onPatchSpy }: { def: WidgetDef; onPatchSpy: (p: Partial<WidgetSnapshot>) => void }) {
  const desk = createRef<HTMLDivElement>();
  const [widget, setWidget] = useState<WidgetSnapshot>({
    id: `pop-${def.type}`, type: def.type, x: 40, y: 40, w: def.defaultSize.w, h: def.defaultSize.h, z: 1, settings: {},
  });
  return createElement('div', { ref: desk, className: 'os-desktop' },
    createElement(WidgetFrame, {
      widget,
      deskRef: desk as React.RefObject<HTMLDivElement>,
      focused: true,
      onFocus: () => undefined,
      onPatch: (p: Partial<WidgetSnapshot>) => {
        onPatchSpy(p);
        setWidget((w) => ({ ...w, ...p }));
      },
      onRemove: () => undefined,
      onDuplicate: () => undefined,
    }),
  );
}

async function mountFramed(def: WidgetDef): Promise<{ host: HTMLElement; root: Root; patches: Partial<WidgetSnapshot>[] }> {
  const patches: Partial<WidgetSnapshot>[] = [];
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(createElement(FramedHarness, { def, onPatchSpy: (p) => patches.push(p) }));
  });
  return { host, root, patches };
}

async function openMenuItem(host: HTMLElement, item: string): Promise<void> {
  const options = host.querySelector<HTMLButtonElement>('.aero-gadget-tool.is-options, .widget-bar .widget-b');
  await act(async () => options?.click());
  await act(async () => host.querySelector<HTMLButtonElement>(`[data-widget-menu="${item}"]`)?.click());
}

describe('settings schemas match what widgets read', () => {
  it('every read setting is declared, every declared field is read', async () => {
    const problems: string[] = [];
    for (const def of WIDGETS) {
      const read = [...(await renderRecording(def))].filter((k) => !k.startsWith('__') && !DATA_KEYS.has(k) && k !== 'then' && k !== 'toJSON');
      const declared = (def.settingsSchema ?? []).map((f) => f.key);
      for (const key of read) if (!declared.includes(key)) problems.push(`${def.type}: reads "${key}" but has no field for it`);
      for (const key of declared) {
        if (read.includes(key) || EMPTY_PROFILE_UNREAD[def.type] === key) continue;
        problems.push(`${def.type}: field "${key}" is never read`);
      }
    }
    expect(problems).toEqual([]);
    // The exemption is not a blind spot: those widgets read exactly that key once lists exist.
    const source = readFileSync(resolve(__dirname, '../widgets/readingLists.tsx'), 'utf8');
    expect(source).toMatch(/const LIST_SETTING = 'listId'/);
    expect(source.match(/readSetting\(settings, LIST_SETTING/g)?.length).toBeGreaterThanOrEqual(2);
  }, 120_000);

  it('the configurable widgets are the ones expected', () => {
    expect(WIDGETS.filter((w) => w.settingsSchema?.length).map((w) => w.type).sort()).toEqual([
      'clock-digital', 'countdown', 'pomodoro', 'reading-challenge-pace', 'reading-list-progress', 'reading-next-up', 'word-slideshow',
    ]);
  });

  it('every field label exists in en, ja, zh and ru', () => {
    const missing: string[] = [];
    for (const def of WIDGETS) {
      for (const field of def.settingsSchema ?? []) {
        for (const lang of ['en', 'ja', 'zh', 'ru']) {
          if (typeof CATALOGS[lang]?.[field.labelKey] !== 'string') missing.push(`${lang}:${field.labelKey}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });
});

describe('the settings popover', () => {
  for (const material of ['studyos', 'aero', 'wired'] as const) {
    it(`opens from the frame menu and writes through the frame (${material})`, async () => {
      if (material !== 'studyos') document.documentElement.setAttribute('data-materials', material);
      const def = WIDGETS.find((w) => w.type === 'clock-digital')!;
      const { host, root, patches } = await mountFramed(def);
      await openMenuItem(host, 'settings');
      const popover = host.querySelector('[data-widget-settings]');
      expect(popover).not.toBeNull();
      expect(popover?.getAttribute('role')).toBe('dialog');
      const box = popover?.querySelector<HTMLInputElement>('[data-setting-key="hour24"]');
      expect(box?.checked).toBe(true);
      expect(document.activeElement).toBe(box);
      await act(async () => box?.click());
      expect(patches.at(-1)?.settings).toMatchObject({ hour24: false });
      await act(async () => {
        popover?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      });
      expect(host.querySelector('[data-widget-settings]')).toBeNull();
      await act(async () => root.unmount());
    });
  }

  it('a number field is clamped to its range', async () => {
    const def = WIDGETS.find((w) => w.type === 'pomodoro')!;
    const { host, root, patches } = await mountFramed(def);
    await openMenuItem(host, 'settings');
    const input = host.querySelector<HTMLInputElement>('[data-setting-key="workMin"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, '500');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(patches.at(-1)?.settings).toMatchObject({ workMin: 90 });
    await act(async () => root.unmount());
  });

  it('shows no English in a Japanese UI', async () => {
    const { ensureCatalog } = await import('../../shared/i18n/catalogs');
    await ensureCatalog('ja');
    const { setUiLang } = await import('../i18n');
    setUiLang('ja');
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    const strays: string[] = [];
    for (const def of WIDGETS.filter((w) => w.settingsSchema?.length)) {
      const { host, root } = await mountFramed(def);
      await openMenuItem(host, 'settings');
      const text = host.querySelector('[data-widget-settings]')?.textContent ?? '';
      const words = (text.match(/[A-Za-z][A-Za-z'-]{2,}/g) ?? []).filter((w) => !/^(Gum|Anki)$/.test(w));
      if (words.length) strays.push(`${def.type}: ${words.join(', ')}`);
      await act(async () => root.unmount());
    }
    setUiLang('en');
    expect(strays).toEqual([]);
  });

  it('its classes are styled', () => {
    const css = readFileSync(resolve(__dirname, '../widgets/wid5.css'), 'utf8');
    for (const cls of ['widget-settings', 'widget-settings-title', 'widget-settings-field', 'widget-settings-actions', 'widget-keyboard-hint', 'is-keyboard-moving']) {
      expect(css, cls).toMatch(new RegExp(`\\.${cls}(?![\\w-])`));
    }
  });
});

describe('moving and resizing without a pointer', () => {
  it('arrows move, Shift+arrows resize, Escape restores', async () => {
    const def = WIDGETS.find((w) => w.type === 'todo')!;
    const { host, root, patches } = await mountFramed(def);
    await openMenuItem(host, 'keyboard-move');
    const frame = host.querySelector<HTMLElement>('.widget-frame')!;
    expect(frame.classList.contains('is-keyboard-moving')).toBe(true);
    expect(document.activeElement).toBe(frame);
    expect(host.querySelector('.widget-keyboard-hint')?.getAttribute('role')).toBe('status');
    const key = async (k: string, init: KeyboardEventInit = {}) =>
      act(async () => {
        frame.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init }));
      });
    await key('ArrowRight');
    expect(patches.at(-1)).toMatchObject({ x: 48, y: 40 });
    await key('ArrowDown', { ctrlKey: true });
    expect(patches.at(-1)).toMatchObject({ x: 48, y: 80 });
    await key('ArrowRight', { shiftKey: true });
    expect(patches.at(-1)).toMatchObject({ w: def.defaultSize.w + 8 });
    await key('Escape');
    expect(patches.at(-1)).toEqual({ x: 40, y: 40, w: def.defaultSize.w, h: def.defaultSize.h });
    expect(frame.classList.contains('is-keyboard-moving')).toBe(false);
    await act(async () => root.unmount());
  });

  it('the arithmetic keeps the widget on the desk and above its minimum', () => {
    const bounds = { width: 800, height: 600 };
    const min = { w: 200, h: 120 };
    expect(nudgeWidget({ x: 0, y: 0, w: 240, h: 140 }, 'ArrowLeft', { shift: false, ctrl: false }, bounds, min)).toMatchObject({ x: 0 });
    expect(nudgeWidget({ x: 736, y: 0, w: 240, h: 140 }, 'ArrowRight', { shift: false, ctrl: true }, bounds, min)).toMatchObject({ x: 740 });
    expect(nudgeWidget({ x: 0, y: 0, w: 204, h: 140 }, 'ArrowLeft', { shift: true, ctrl: false }, bounds, min)).toMatchObject({ w: 200 });
    expect(nudgeWidget({ x: 600, y: 0, w: 196, h: 140 }, 'ArrowRight', { shift: true, ctrl: true }, bounds, min)).toMatchObject({ w: 200 });
  });
});
