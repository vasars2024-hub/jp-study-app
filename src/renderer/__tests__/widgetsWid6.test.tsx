// @vitest-environment jsdom
/**
 * wid6 — alignment guides (the geometry, and the frame drawing them during a
 * drag), the gallery's live preview, and widgets that follow a study-language
 * switch instead of showing the previous language's numbers.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { SNAP_DISTANCE, alignMove, alignResize } from '../widgets/widgetAlign';
import { PREVIEW_STAGE, previewScale } from '../widgets/WidgetPreview';

vi.hoisted(() => {
  const api = new Proxy({}, {
    get: (_target, prop) => (typeof prop === 'string' && prop.startsWith('on') ? () => () => undefined : () => Promise.resolve(null)),
  });
  Object.defineProperty(window, 'api', { value: api, configurable: true, writable: true });
});

const desk = { width: 1200, height: 700 };

describe('wid6 alignment geometry', () => {
  const other = { x: 400, y: 100, w: 200, h: 150 };

  it('catches the nearest edge within reach and draws the guide across both widgets', () => {
    // Left edge 4px right of the other's left edge: it snaps onto it.
    const r = alignMove({ x: 404, y: 400, w: 120, h: 80 }, [other], desk);
    expect(r).toMatchObject({ x: 400, snappedX: true });
    const guide = r.guides.find((g) => g.axis === 'x' && g.at === 400);
    expect(guide).toEqual({ axis: 'x', at: 400, from: 100, to: 480 });
  });

  it('aligns centres, and edges to the desk\'s edges and centre', () => {
    const centred = alignMove({ x: 443, y: 600, w: 120, h: 40 }, [other], desk);
    expect(centred.x + 60).toBe(500);
    const edge = alignMove({ x: 3, y: 2, w: 100, h: 100 }, [], desk);
    expect(edge).toMatchObject({ x: 0, y: 0, snappedX: true, snappedY: true });
    const middle = alignMove({ x: 548, y: 200, w: 100, h: 100 }, [], desk);
    expect(middle.x).toBe(550);
  });

  it('leaves a widget alone when nothing is within reach', () => {
    const r = alignMove({ x: 700 + SNAP_DISTANCE + 5, y: 320, w: 100, h: 100 }, [other], desk);
    expect(r).toMatchObject({ x: 711, y: 320, snappedX: false, snappedY: false, guides: [] });
  });

  it('resizing snaps only the far edges, and never below the minimum', () => {
    const r = alignResize({ x: 100, y: 100, w: 296, h: 120 }, [other], desk, { w: 80, h: 80 });
    expect(r).toMatchObject({ w: 300, snappedW: true });
    expect(r.guides.every((g) => g.axis === 'x' && g.at === 400)).toBe(true);
    const small = alignResize({ x: 395, y: 100, w: 82, h: 90 }, [{ x: 0, y: 0, w: 400, h: 10 }], desk, { w: 80, h: 80 });
    expect(small.w).toBeGreaterThanOrEqual(80);
  });
});

describe('wid6 gallery preview', () => {
  let root: Root | undefined;
  let host: HTMLDivElement;

  beforeAll(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(async () => {
    await act(async () => root?.unmount());
    root = undefined;
    host?.remove();
  });

  it('fits a widget\'s default size into the stage without enlarging it', () => {
    expect(previewScale({ w: 464, h: 176 })).toBeCloseTo(0.5);
    expect(previewScale({ w: 100, h: 100 })).toBe(1);
    expect(previewScale({ w: 320, h: 480 })).toBeCloseTo(PREVIEW_STAGE.h / 480);
  });

  async function mountGallery(onAdd = vi.fn()): Promise<typeof onAdd> {
    const { default: WidgetGallery } = await import('../components/WidgetGallery');
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    await act(async () => {
      root?.render(
        <WidgetGallery onAdd={onAdd} onResetLayout={vi.fn()} hiddenWidgets={[]} onRestore={vi.fn()} onClose={vi.fn()} />,
      );
    });
    return onAdd;
  }

  it('shows the live widget, inert and hidden from the accessibility tree, and follows focus', async () => {
    const onAdd = await mountGallery();
    const pane = host.querySelector<HTMLElement>('.widget-gallery-preview');
    expect(pane).not.toBeNull();
    const firstCard = host.querySelector<HTMLElement>('[data-widget-card]');
    expect(pane?.querySelector('[data-widget-preview]')?.getAttribute('data-widget-preview')).toBe(firstCard?.dataset.widgetCard);
    const frame = pane?.querySelector<HTMLElement>('.widget-preview-frame');
    expect(frame?.hasAttribute('inert')).toBe(true);
    expect(frame?.getAttribute('aria-hidden')).toBe('true');
    // A real widget body rendered inside (the digital clock draws its time).
    expect(frame?.querySelector('.widget-body')?.children.length).toBeGreaterThan(0);
    // Focus moving onto another card moves the preview with it.
    const calc = host.querySelector<HTMLElement>('[data-widget-card="calculator"]');
    await act(async () => {
      calc?.querySelector<HTMLButtonElement>('.widget-card-add')?.focus();
    });
    expect(pane?.querySelector('[data-widget-preview]')?.getAttribute('data-widget-preview')).toBe('calculator');
    expect(pane?.getAttribute('aria-label')).toBe('Preview of Calculator');
    expect(calc?.classList.contains('is-previewed')).toBe(true);
    await act(async () => {
      pane?.querySelector<HTMLButtonElement>('.widget-gallery-preview-add')?.click();
    });
    expect(onAdd).toHaveBeenCalledWith('calculator');
  });

  it('names every card control by its widget', async () => {
    await mountGallery();
    const calc = host.querySelector<HTMLElement>('[data-widget-card="calculator"]');
    expect(calc?.querySelector('.widget-fav')?.getAttribute('aria-label')).toBe('Add Calculator to favorites');
    expect(calc?.querySelector('.widget-card-add')?.getAttribute('aria-label')).toBe('Add Calculator');
    expect(host.querySelector('.widget-gallery-search')?.getAttribute('aria-label')).toBeTruthy();
  });

  it('a widget that reaches outside the app shows its description, not a live mount', async () => {
    await mountGallery();
    const map = host.querySelector<HTMLElement>('[data-widget-card="learner-map"]');
    await act(async () => {
      map?.querySelector<HTMLButtonElement>('.widget-card-add')?.focus();
    });
    expect(host.querySelector('.widget-gallery-preview .widget-preview-fallback')).not.toBeNull();
  });

  it('survives corrupt stored favorites', async () => {
    localStorage.setItem('jp-widget-gallery', JSON.stringify({ favorites: 'clock', recent: [1, 'todo'] }));
    await mountGallery();
    expect(host.querySelector('.widget-gallery')).not.toBeNull();
  });
});

describe('wid6 widget frame: guides while dragging', () => {
  let root: Root | undefined;
  let host: HTMLDivElement;

  beforeAll(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });
  afterEach(async () => {
    await act(async () => root?.unmount());
    root = undefined;
    host?.remove();
    vi.restoreAllMocks();
  });

  it('snaps onto a neighbour\'s edge, draws the guide, and commits the exact edge', async () => {
    const { default: WidgetFrame } = await import('../components/WidgetFrame');
    host = document.createElement('div');
    host.className = 'os-desk';
    document.body.append(host);
    // jsdom has no layout: give the desk a size and each frame its own offsets.
    Object.defineProperty(host, 'clientWidth', { configurable: true, value: 1200 });
    Object.defineProperty(host, 'clientHeight', { configurable: true, value: 800 });
    const geometry = (el: HTMLElement) => {
      const px = (v: string): number => Number.parseFloat(v) || 0;
      return { x: px(el.style.left), y: px(el.style.top), w: px(el.style.width), h: px(el.style.height) };
    };
    vi.spyOn(HTMLElement.prototype, 'offsetParent', 'get').mockImplementation(function (this: HTMLElement) {
      return this.classList.contains('widget-frame') ? host : null;
    });
    vi.spyOn(HTMLElement.prototype, 'offsetLeft', 'get').mockImplementation(function (this: HTMLElement) { return geometry(this).x; });
    vi.spyOn(HTMLElement.prototype, 'offsetTop', 'get').mockImplementation(function (this: HTMLElement) { return geometry(this).y; });
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function (this: HTMLElement) { return geometry(this).w; });
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (this: HTMLElement) { return geometry(this).h; });
    (HTMLElement.prototype as unknown as { setPointerCapture: () => void }).setPointerCapture = () => undefined;
    (HTMLElement.prototype as unknown as { releasePointerCapture: () => void }).releasePointerCapture = () => undefined;
    const deskRef = { current: host };
    const onPatch = vi.fn();
    root = createRoot(host);
    const widget = (id: string, x: number, y: number) => ({ id, type: 'calculator', x, y, w: 240, h: 300, z: 1 });
    await act(async () => {
      root?.render(
        <>
          <WidgetFrame widget={widget('a', 100, 100)} deskRef={deskRef} focused onFocus={vi.fn()} onPatch={onPatch} onRemove={vi.fn()} onDuplicate={vi.fn()} />
          <WidgetFrame widget={widget('b', 500, 205)} deskRef={deskRef} focused={false} onFocus={vi.fn()} onPatch={vi.fn()} onRemove={vi.fn()} onDuplicate={vi.fn()} />
        </>,
      );
    });
    const bar = host.querySelector<HTMLElement>('.widget-frame .widget-bar');
    expect(bar?.getAttribute('title')).toContain('Alt');
    const pointer = (type: string, x: number, y: number, altKey = false) => {
      const ev = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y, altKey });
      Object.defineProperty(ev, 'pointerId', { value: 1 });
      return ev;
    };
    await act(async () => {
      bar?.dispatchEvent(pointer('pointerdown', 0, 0));
    });
    // Drag 397px right and 103 down: the left edge lands 3px short of b's (500) and
    // the top edge 2px short of b's (205) — both within reach.
    await act(async () => {
      bar?.dispatchEvent(pointer('pointermove', 397, 103));
    });
    const guides = host.querySelectorAll('.widget-guides .widget-guide');
    expect(guides.length).toBeGreaterThan(0);
    expect(host.querySelector('.widget-guides')?.getAttribute('aria-hidden')).toBe('true');
    await act(async () => {
      bar?.dispatchEvent(pointer('pointerup', 397, 103));
    });
    expect(host.querySelector('.widget-guides')).toBeNull();
    // On b's edges exactly — not rounded to the 8px grid (which would give 496 / 200).
    expect(onPatch).toHaveBeenLastCalledWith({ x: 500, y: 205 });
  });

  it('holding Alt places freely on the grid', async () => {
    const { default: WidgetFrame } = await import('../components/WidgetFrame');
    host = document.createElement('div');
    document.body.append(host);
    Object.defineProperty(host, 'clientWidth', { configurable: true, value: 1200 });
    Object.defineProperty(host, 'clientHeight', { configurable: true, value: 800 });
    vi.spyOn(HTMLElement.prototype, 'offsetParent', 'get').mockImplementation(function (this: HTMLElement) {
      return this.classList.contains('widget-frame') ? host : null;
    });
    (HTMLElement.prototype as unknown as { setPointerCapture: () => void }).setPointerCapture = () => undefined;
    (HTMLElement.prototype as unknown as { releasePointerCapture: () => void }).releasePointerCapture = () => undefined;
    const onPatch = vi.fn();
    root = createRoot(host);
    await act(async () => {
      root?.render(
        <WidgetFrame widget={{ id: 'a', type: 'calculator', x: 100, y: 100, w: 240, h: 300, z: 1 }} deskRef={{ current: host }} focused onFocus={vi.fn()} onPatch={onPatch} onRemove={vi.fn()} onDuplicate={vi.fn()} />,
      );
    });
    const bar = host.querySelector<HTMLElement>('.widget-bar');
    const pointer = (type: string, x: number, y: number, altKey = false) => {
      const ev = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y, altKey });
      Object.defineProperty(ev, 'pointerId', { value: 1 });
      return ev;
    };
    await act(async () => bar?.dispatchEvent(pointer('pointerdown', 0, 0)));
    // -98 puts the left edge 2px from the desk's: it would snap to 0 without Alt.
    await act(async () => bar?.dispatchEvent(pointer('pointermove', -98, 13, true)));
    expect(host.querySelectorAll('.widget-guides .widget-guide').length).toBe(0);
    await act(async () => bar?.dispatchEvent(pointer('pointerup', -98, 13, true)));
    expect(onPatch).toHaveBeenLastCalledWith({ x: 0, y: 112 });
  });
});

describe('wid6 widgets follow a study-language switch', () => {
  let root: Root | undefined;
  let host: HTMLDivElement;
  afterEach(async () => {
    await act(async () => root?.unmount());
    root = undefined;
    host?.remove();
  });

  it('vocabulary progress re-counts for the new language', async () => {
    vi.resetModules();
    localStorage.clear();
    const known = await import('../knownWords');
    const env = await import('../studyEnvironment');
    const { VocabularyProgress } = await import('../widgets/study');
    env.setStudyLang('ja');
    known.setLevel('食べる', 3);
    known.setLevel('飲む', 3);
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    await act(async () => {
      root?.render(<VocabularyProgress settings={{}} setSettings={vi.fn()} size={{ w: 260, h: 200 }} />);
    });
    const learned = (): string | null | undefined => host.querySelector('.wgt-stat-value')?.textContent;
    expect(learned()).toBe('2');
    await act(async () => env.setStudyLang('zh'));
    expect(learned()).toBe('0');
    await act(async () => env.setStudyLang('ja'));
    expect(learned()).toBe('2');
  });
});
