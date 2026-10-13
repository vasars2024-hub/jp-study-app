// @vitest-environment jsdom
/**
 * wid7 — widget gestures that cannot get stuck, a keyboard-operable options
 * menu, resizing that stays on the desk, a gallery preview that waits for the
 * pointer to settle, and Wired preview text that reaches 4.5:1.
 *
 * SCORECARD bug 34: drag and resize listened for `pointerup` only, so a gesture
 * that lost its pointer capture (Alt+Tab mid-drag) left the widget following
 * the mouse until the next click. Row 17: the Wired gallery's description text
 * measured about 3.35:1.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { clampResizeToDesk } from '../widgets/widgetAlign';
import { nextMenuIndex } from '../components/WidgetFrame';
import type { WidgetSnapshot } from '../../shared/desktop';

vi.hoisted(() => {
  const api = new Proxy({}, {
    get: (_target, prop) => (typeof prop === 'string' && prop.startsWith('on') ? () => () => undefined : () => Promise.resolve(null)),
  });
  Object.defineProperty(window, 'api', { value: api, configurable: true, writable: true });
});

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

/** A pointer event jsdom can dispatch: a MouseEvent carrying the pointer fields the frame reads. */
function pointer(
  type: string,
  x: number,
  y: number,
  extra: { pointerId?: number; pointerType?: string; buttons?: number; altKey?: boolean } = {},
): MouseEvent {
  const ev = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y, altKey: extra.altKey ?? false, buttons: extra.buttons ?? 0 });
  Object.defineProperty(ev, 'pointerId', { value: extra.pointerId ?? 1 });
  if (extra.pointerType) Object.defineProperty(ev, 'pointerType', { value: extra.pointerType });
  return ev;
}

describe('wid7 geometry', () => {
  it('keeps a resize inside the desk, but never below the minimum', () => {
    const desk = { width: 1200, height: 700 };
    const min = { w: 120, h: 80 };
    expect(clampResizeToDesk({ x: 1000, y: 600, w: 400, h: 300 }, desk, min)).toEqual({ w: 200, h: 100 });
    expect(clampResizeToDesk({ x: 100, y: 100, w: 300, h: 200 }, desk, min)).toEqual({ w: 300, h: 200 });
    // Already past the edge: the minimum wins rather than collapsing the widget.
    expect(clampResizeToDesk({ x: 1150, y: 650, w: 300, h: 300 }, desk, min)).toEqual({ w: 120, h: 80 });
    expect(clampResizeToDesk({ x: 0, y: 0, w: 10, h: 10 }, desk, min)).toEqual({ w: 120, h: 80 });
  });

  it('walks a menu with arrows (wrapping), Home and End, and ignores other keys', () => {
    expect(nextMenuIndex('ArrowDown', -1, 4)).toBe(0);
    expect(nextMenuIndex('ArrowDown', 3, 4)).toBe(0);
    expect(nextMenuIndex('ArrowUp', 0, 4)).toBe(3);
    expect(nextMenuIndex('ArrowUp', -1, 4)).toBe(3);
    expect(nextMenuIndex('Home', 2, 4)).toBe(0);
    expect(nextMenuIndex('End', 0, 4)).toBe(3);
    expect(nextMenuIndex('a', 0, 4)).toBeNull();
    expect(nextMenuIndex('ArrowDown', -1, 0)).toBeNull();
  });
});

describe('wid7 widget frame', () => {
  let root: Root | undefined;
  let host: HTMLDivElement;
  let released: number[];

  beforeEach(() => {
    host = document.createElement('div');
    host.className = 'os-desk';
    document.body.append(host);
    Object.defineProperty(host, 'clientWidth', { configurable: true, value: 1200 });
    Object.defineProperty(host, 'clientHeight', { configurable: true, value: 800 });
    const px = (v: string): number => Number.parseFloat(v) || 0;
    vi.spyOn(HTMLElement.prototype, 'offsetParent', 'get').mockImplementation(function (this: HTMLElement) {
      return this.classList.contains('widget-frame') ? host : null;
    });
    vi.spyOn(HTMLElement.prototype, 'offsetLeft', 'get').mockImplementation(function (this: HTMLElement) { return px(this.style.left); });
    vi.spyOn(HTMLElement.prototype, 'offsetTop', 'get').mockImplementation(function (this: HTMLElement) { return px(this.style.top); });
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function (this: HTMLElement) { return px(this.style.width); });
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (this: HTMLElement) { return px(this.style.height); });
    released = [];
    (HTMLElement.prototype as unknown as { setPointerCapture: () => void }).setPointerCapture = () => undefined;
    (HTMLElement.prototype as unknown as { releasePointerCapture: (id: number) => void }).releasePointerCapture = (id: number) => {
      released.push(id);
    };
    // The drag draws through requestAnimationFrame; run it at once so the transform is observable.
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
      cb(0);
      return 1;
    });
  });

  afterEach(async () => {
    await act(async () => root?.unmount());
    root = undefined;
    host.remove();
    document.documentElement.removeAttribute('data-materials');
    vi.restoreAllMocks();
  });

  const calculator = (patch: Partial<WidgetSnapshot> = {}): WidgetSnapshot => ({
    id: 'a', type: 'calculator', x: 100, y: 100, w: 240, h: 300, z: 1, ...patch,
  });

  async function mount(widget: WidgetSnapshot = calculator()) {
    const { default: WidgetFrame } = await import('../components/WidgetFrame');
    const onPatch = vi.fn();
    root = createRoot(host);
    const render = async (w: WidgetSnapshot): Promise<void> => {
      await act(async () => {
        root?.render(
          <WidgetFrame widget={w} deskRef={{ current: host }} focused onFocus={vi.fn()} onPatch={onPatch} onRemove={vi.fn()} onDuplicate={vi.fn()} />,
        );
      });
    };
    await render(widget);
    const frame = host.querySelector<HTMLElement>('.widget-frame');
    return { onPatch, frame, render };
  }

  it('a cancelled drag puts the widget back, clears its guides and commits nothing', async () => {
    const { onPatch, frame } = await mount();
    const bar = host.querySelector<HTMLElement>('.widget-bar');
    await act(async () => bar?.dispatchEvent(pointer('pointerdown', 0, 0)));
    await act(async () => bar?.dispatchEvent(pointer('pointermove', 2, 3)));
    expect(frame?.style.transform).not.toBe('');
    expect(host.querySelector('.widget-guides')).not.toBeNull();
    await act(async () => bar?.dispatchEvent(pointer('pointercancel', 2, 3)));
    expect(frame?.style.transform).toBe('');
    expect(host.querySelector('.widget-guides')).toBeNull();
    expect(onPatch).not.toHaveBeenCalled();
    expect(released).toContain(1);
    // The gesture is over: the widget no longer follows the pointer.
    await act(async () => bar?.dispatchEvent(pointer('pointermove', 300, 300)));
    expect(frame?.style.transform).toBe('');
    await act(async () => bar?.dispatchEvent(pointer('pointerup', 300, 300)));
    expect(onPatch).not.toHaveBeenCalled();
  });

  it('a drag that loses pointer capture (Alt+Tab) ends instead of sticking to the mouse', async () => {
    const { onPatch, frame } = await mount();
    const bar = host.querySelector<HTMLElement>('.widget-bar');
    await act(async () => bar?.dispatchEvent(pointer('pointerdown', 0, 0)));
    await act(async () => bar?.dispatchEvent(pointer('pointermove', 40, 40)));
    await act(async () => bar?.dispatchEvent(pointer('lostpointercapture', 40, 40)));
    expect(frame?.style.transform).toBe('');
    expect(host.querySelector('.widget-guides')).toBeNull();
    await act(async () => bar?.dispatchEvent(pointer('pointermove', 400, 400)));
    expect(frame?.style.transform).toBe('');
    expect(onPatch).not.toHaveBeenCalled();
  });

  it('a mouse move with no button held ends the drag where it was last drawn', async () => {
    const { onPatch, frame } = await mount();
    const bar = host.querySelector<HTMLElement>('.widget-bar');
    await act(async () => bar?.dispatchEvent(pointer('pointerdown', 0, 0, { pointerType: 'mouse', buttons: 1 })));
    await act(async () => bar?.dispatchEvent(pointer('pointermove', 196, 196, { pointerType: 'mouse', buttons: 1, altKey: true })));
    // The release happened over another window; the next move arrives with no button down.
    await act(async () => bar?.dispatchEvent(pointer('pointermove', 600, 600, { pointerType: 'mouse', buttons: 0 })));
    expect(onPatch).toHaveBeenCalledTimes(1);
    expect(onPatch).toHaveBeenLastCalledWith({ x: 296, y: 296 });
    expect(frame?.style.transform).toBe('');
    await act(async () => bar?.dispatchEvent(pointer('pointermove', 700, 700, { pointerType: 'mouse', buttons: 1 })));
    expect(frame?.style.transform).toBe('');
    expect(onPatch).toHaveBeenCalledTimes(1);
  });

  it('ignores another pointer\'s events during a gesture', async () => {
    const { onPatch } = await mount();
    const bar = host.querySelector<HTMLElement>('.widget-bar');
    await act(async () => bar?.dispatchEvent(pointer('pointerdown', 0, 0)));
    await act(async () => bar?.dispatchEvent(pointer('pointercancel', 0, 0, { pointerId: 2 })));
    await act(async () => bar?.dispatchEvent(pointer('pointermove', 64, 64, { altKey: true })));
    await act(async () => bar?.dispatchEvent(pointer('pointerup', 64, 64, { altKey: true })));
    expect(onPatch).toHaveBeenLastCalledWith({ x: 168, y: 168 });
  });

  it('unmounting mid-drag takes the guide lines and listeners with it', async () => {
    const { onPatch } = await mount();
    const bar = host.querySelector<HTMLElement>('.widget-bar');
    await act(async () => bar?.dispatchEvent(pointer('pointerdown', 0, 0)));
    await act(async () => bar?.dispatchEvent(pointer('pointermove', 3, 2)));
    expect(host.querySelector('.widget-guides')).not.toBeNull();
    await act(async () => root?.render(<></>));
    expect(host.querySelector('.widget-guides')).toBeNull();
    bar?.dispatchEvent(pointer('pointerup', 3, 2));
    expect(onPatch).not.toHaveBeenCalled();
  });

  it('a cancelled resize restores the size; a committed one stays inside the desk', async () => {
    const { onPatch, frame } = await mount(calculator({ x: 900, y: 400 }));
    const grip = host.querySelector<HTMLElement>('.widget-resize');
    await act(async () => grip?.dispatchEvent(pointer('pointerdown', 0, 0)));
    await act(async () => grip?.dispatchEvent(pointer('pointermove', 40, 40, { altKey: true })));
    expect(frame?.style.width).toBe('280px');
    await act(async () => grip?.dispatchEvent(pointer('lostpointercapture', 40, 40)));
    expect(frame?.style.width).toBe('240px');
    expect(frame?.style.height).toBe('300px');
    expect(onPatch).not.toHaveBeenCalled();

    // Desk 1200 x (800 - 48 taskbar): from (900, 400) the frame can reach 300 x 352.
    await act(async () => grip?.dispatchEvent(pointer('pointerdown', 0, 0)));
    await act(async () => grip?.dispatchEvent(pointer('pointermove', 900, 900, { altKey: true })));
    expect(frame?.style.width).toBe('300px');
    expect(frame?.style.height).toBe('352px');
    await act(async () => grip?.dispatchEvent(pointer('pointerup', 900, 900, { altKey: true })));
    expect(onPatch).toHaveBeenLastCalledWith({ w: 300, h: 352 });
  });

  it('the plain options menu is a menu: focus moves in, arrows walk it, Escape returns to its button', async () => {
    await mount();
    const button = host.querySelector<HTMLButtonElement>('.widget-b[aria-haspopup="menu"]');
    expect(button?.getAttribute('aria-expanded')).toBe('false');
    await act(async () => button?.click());
    const menu = host.querySelector<HTMLElement>('.widget-menu');
    expect(menu?.getAttribute('role')).toBe('menu');
    expect(menu?.getAttribute('aria-label')).toBe('Options for Calculator');
    const items = [...(menu?.querySelectorAll<HTMLButtonElement>('button') ?? [])];
    expect(items.length).toBeGreaterThan(3);
    expect(items.every((b) => b.getAttribute('role') === 'menuitem')).toBe(true);
    expect(document.activeElement).toBe(items[0]);
    const key = async (k: string) => act(async () => {
      document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
    });
    await key('ArrowDown');
    expect(document.activeElement).toBe(items[1]);
    await key('ArrowUp');
    await key('ArrowUp');
    expect(document.activeElement).toBe(items[items.length - 1]);
    await key('Home');
    expect(document.activeElement).toBe(items[0]);
    await key('End');
    expect(document.activeElement).toBe(items[items.length - 1]);
    await key('Escape');
    expect(host.querySelector('.widget-menu')).toBeNull();
    expect(document.activeElement).toBe(button);
  });

  it('an item that closes the menu hands focus back to its button, not the page', async () => {
    await mount();
    const button = host.querySelector<HTMLButtonElement>('.widget-b[aria-haspopup="menu"]');
    await act(async () => button?.click());
    const lock = [...host.querySelectorAll<HTMLButtonElement>('.widget-menu [role="menuitem"]')].find((b) => b.textContent === 'Lock');
    expect(lock).toBeDefined();
    await act(async () => {
      lock?.focus();
      lock?.click();
    });
    expect(host.querySelector('.widget-menu')).toBeNull();
    expect(document.activeElement).toBe(button);
  });

  it('Tab closes the menu onto its button so Tab carries on from there', async () => {
    await mount();
    const button = host.querySelector<HTMLButtonElement>('.widget-b[aria-haspopup="menu"]');
    await act(async () => button?.click());
    await act(async () => {
      document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
    });
    expect(host.querySelector('.widget-menu')).toBeNull();
    expect(document.activeElement).toBe(button);
  });

  it('the Aero gadget menu takes Escape and arrow keys too', async () => {
    document.documentElement.setAttribute('data-materials', 'aero');
    await mount();
    expect(host.querySelector('.aero-gadget')).not.toBeNull();
    const options = host.querySelector<HTMLButtonElement>('.aero-gadget-tool.is-options');
    await act(async () => options?.click());
    const menu = host.querySelector<HTMLElement>('.widget-menu');
    expect(menu?.getAttribute('role')).toBe('menu');
    const items = [...(menu?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])];
    expect(document.activeElement).toBe(items[0]);
    await act(async () => {
      items[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
    });
    expect(document.activeElement).toBe(items[1]);
    const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    const outside = vi.fn();
    window.addEventListener('keydown', outside);
    await act(async () => {
      items[1].dispatchEvent(escape);
    });
    window.removeEventListener('keydown', outside);
    expect(host.querySelector('.widget-menu')).toBeNull();
    expect(document.activeElement).toBe(options);
    expect(options?.getAttribute('aria-expanded')).toBe('false');
    // Escape belonged to the menu: the desktop's own Escape handling never saw it.
    expect(outside).not.toHaveBeenCalled();
  });
});

describe('wid7 gallery preview waits for the pointer to settle', () => {
  let root: Root | undefined;
  let host: HTMLDivElement;

  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
  });
  afterEach(async () => {
    await act(async () => root?.unmount());
    root = undefined;
    host?.remove();
    vi.useRealTimers();
  });

  async function mountGallery() {
    const { default: WidgetGallery, PREVIEW_HOVER_MS } = await import('../components/WidgetGallery');
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    await act(async () => {
      root?.render(
        <WidgetGallery onAdd={vi.fn()} onResetLayout={vi.fn()} hiddenWidgets={[]} onRestore={vi.fn()} onClose={vi.fn()} />,
      );
    });
    return PREVIEW_HOVER_MS;
  }

  const previewed = (): string | null | undefined =>
    host.querySelector('.widget-gallery-preview [data-widget-preview]')?.getAttribute('data-widget-preview');
  const card = (type: string) => host.querySelector<HTMLElement>(`[data-widget-card="${type}"]`);
  const enter = (el: HTMLElement | null) => el?.dispatchEvent(new MouseEvent('pointerover', { bubbles: true }));
  const leave = (el: HTMLElement | null) => el?.dispatchEvent(new MouseEvent('pointerout', { bubbles: true }));

  it('does not remount the preview for every card the pointer crosses', async () => {
    const wait = await mountGallery();
    expect(wait).toBeGreaterThanOrEqual(100);
    const first = previewed();
    const types = [...host.querySelectorAll<HTMLElement>('[data-widget-card]')].map((c) => c.dataset.widgetCard ?? '');
    const sweep = types.filter((t) => t !== first).slice(0, 4);
    expect(sweep.length).toBe(4);
    // Sweep across four cards, a few ms on each: the preview never changes.
    for (const type of sweep) {
      await act(async () => {
        enter(card(type));
        vi.advanceTimersByTime(30);
        leave(card(type));
      });
      expect(previewed()).toBe(first);
    }
    // Resting on the last one shows it once the pointer has settled.
    const target = sweep[sweep.length - 1];
    await act(async () => {
      enter(card(target));
      vi.advanceTimersByTime(wait - 1);
    });
    expect(previewed()).toBe(first);
    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    expect(previewed()).toBe(target);
  });

  it('keyboard focus still moves the preview at once', async () => {
    await mountGallery();
    await act(async () => {
      card('calculator')?.querySelector<HTMLButtonElement>('.widget-card-add')?.focus();
    });
    expect(previewed()).toBe('calculator');
  });
});

describe('wid7 Wired preview text contrast', () => {
  const css = readFileSync(join(__dirname, '..', 'widgets', 'wid6.css'), 'utf8');
  const tokens = readFileSync(join(__dirname, '..', 'theme', 'wired-archive.css'), 'utf8');

  const rgba = (src: string): [number, number, number, number] => {
    const m = /rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)/.exec(src);
    if (!m) throw new Error(`no colour in ${src}`);
    return [Number(m[1]), Number(m[2]), Number(m[3]), m[4] === undefined ? 1 : Number(m[4])];
  };
  const hex = (src: string): [number, number, number] => {
    const m = /#([0-9a-f]{6})/i.exec(src);
    if (!m) throw new Error(`no hex in ${src}`);
    const n = Number.parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const token = (name: string): string => {
    const m = new RegExp(`${name}:\\s*([^;]+);`).exec(tokens);
    if (!m) throw new Error(`no token ${name}`);
    return m[1];
  };
  const over = (fg: number[], a: number, bg: number[]): number[] => fg.map((v, i) => v * a + bg[i] * (1 - a));
  const lum = (c: number[]): number => {
    const [r, g, b] = c.map((v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ratio = (a: number[], b: number[]): number => {
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };

  it('the description and size lines reach 4.5:1 on the preview glass', () => {
    const rule = /\[data-materials='wired'\] \.widget-gallery-preview-meta\s*\{([^}]*)\}/.exec(css);
    expect(rule).not.toBeNull();
    const colour = /color:\s*([^;]+);/.exec(rule?.[1] ?? '')?.[1] ?? '';
    // A var() here would hide the value from this check (and was the bug: the 42% line token).
    expect(colour).not.toContain('var(');
    const [r, g, b, a] = rgba(colour);
    const black = hex(token('--wired-black'));
    const [gr, gg, gb, ga] = rgba(token('--wired-glass'));
    const glass = over([gr, gg, gb], ga, black);
    const text = over([r, g, b], a, glass);
    expect(ratio(text, glass)).toBeGreaterThanOrEqual(4.5);
    // The control: the old token really was under the bar, so this test can fail.
    const [dr, dg, db, da] = rgba(token('--wired-cyan-dim'));
    expect(ratio(over([dr, dg, db], da, glass), glass)).toBeLessThan(4.5);
  });
});
