// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { CalendarWidget } from '../widgets/productivity';

let root: Root | undefined;
const opened = vi.fn();

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  window.removeEventListener('os:open', opened);
  opened.mockClear();
  document.body.replaceChildren();
});

async function mount() {
  const host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root?.render(<CalendarWidget />));
  window.addEventListener('os:open', opened);
  return host.querySelector<HTMLElement>('[role="button"]')!;
}

describe('calendar widget keyboard activation', () => {
  it.each(['Enter', ' '])('opens Calendar with %j and prevents scrolling', async (key) => {
    const widget = await mount();
    widget.focus();
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
    await act(async () => { widget.dispatchEvent(event); });
    expect(opened).toHaveBeenCalledOnce();
    expect((opened.mock.calls[0][0] as CustomEvent).detail).toBe('calendar');
    expect(event.defaultPrevented).toBe(true);
    widget.dispatchEvent(new KeyboardEvent('keydown', { key, repeat: true, bubbles: true }));
    expect(opened).toHaveBeenCalledOnce();
  });

  it('leaves month buttons and shortcut chords alone', async () => {
    const widget = await mount();
    const next = widget.querySelectorAll('button')[1];
    const label = widget.querySelector('.wgt-cal-head span')!;
    const initialMonth = label.textContent;
    const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    next.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    await act(async () => { next.click(); });
    expect(label.textContent).not.toBe(initialMonth);
    for (const modifier of ['ctrlKey', 'altKey', 'metaKey', 'shiftKey']) {
      widget.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, [modifier]: true }));
    }
    expect(opened).not.toHaveBeenCalled();
  });
});
