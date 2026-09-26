// @vitest-environment jsdom
/**
 * Round 3 "no ugly boxes" — media / Gum.
 *
 * The Gum title page's watch-status picker, the legacy Media hub's filters and the Discover
 * subtitle harvest buttons (`scr-btn`, a class with no stylesheet) were native or unstyled
 * controls. The status picker is the ui Select now and still saves a pick.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { GumStatusSelect } from '../components/media/gum/GumTitlePage';
import type { GumTitle } from '../components/media/gum/gumModel';

let root: Root | null = null;
let host: HTMLDivElement;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.replaceChildren();
});

describe('Gum watch-status picker', () => {
  it('is the design-system select and still commits a pick', async () => {
    const onCommit = vi.fn();
    const title = { id: 't1', tracked: true, status: 'watching' } as unknown as GumTitle;
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    await act(async () => {
      root?.render(<GumStatusSelect title={title} busy={false} onCommit={onCommit} />);
    });
    const select = host.querySelector('select');
    expect(select?.classList.contains('ui-select')).toBe(true);
    await act(async () => {
      if (!select) return;
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
      setter?.call(select, 'completed');
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(onCommit).toHaveBeenCalledWith('completed');
  });
});
