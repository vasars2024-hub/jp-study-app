// @vitest-environment jsdom
/**
 * Round 3 "no ugly boxes" — study apps.
 *
 * The EPUB card-layout preset picker was a bare native select, and the Level panel's
 * threshold was an unstyled range under a bare textarea for pasted word lists. They are the
 * design system's Select / slider / textarea now, still wired to the same state.
 */
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

let root: Root | null = null;
let host: HTMLDivElement;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const api = new Proxy(
    {},
    {
      get: (_t, prop) => {
        if (typeof prop !== 'string') return undefined;
        if (prop.startsWith('on')) return () => () => undefined;
        return () => Promise.resolve(null);
      },
    },
  );
  Object.defineProperty(window, 'api', { value: api, configurable: true, writable: true });
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.replaceChildren();
});

async function mount(node: ReactElement): Promise<void> {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root?.render(node);
  });
}

describe('EPUB card layout editor', () => {
  it('picks a preset with the ui Select and still applies it', async () => {
    const { default: EpubCardLayoutEditor } = await import('../components/EpubCardLayoutEditor');
    const onApply = vi.fn();
    await mount(<EpubCardLayoutEditor preset="custom" front="{expression}" back="{meaning}" onApply={onApply} />);
    const select = host.querySelector<HTMLSelectElement>('.epub-layout-preset select');
    expect(select?.classList.contains('ui-select')).toBe(true);
    const target = [...(select?.options ?? [])].find((o) => o.value === 'ja-en');
    expect(target).toBeTruthy();
    await act(async () => {
      if (!select) return;
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
      setter?.call(select, 'ja-en');
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ preset: 'ja-en' }));
  });
});

describe('Level settings', () => {
  it('uses the design-system slider for the known-word threshold', async () => {
    const { LevelSettingsSection } = await import('../components/LevelMeter');
    await mount(<LevelSettingsSection />);
    const range = host.querySelector<HTMLInputElement>('#level-threshold-range');
    expect(range?.type).toBe('range');
    expect(range?.classList.contains('ui-slider')).toBe(true);
  });
});
