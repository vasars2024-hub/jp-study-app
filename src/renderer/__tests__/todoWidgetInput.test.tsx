// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { TodoList } from '../widgets/productivity';

let root: Root | undefined;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  document.body.replaceChildren();
});

async function mountDraft() {
  const host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  const setSettings = vi.fn();
  await act(async () => {
    root?.render(<TodoList settings={{ items: [] }} setSettings={setSettings} size={{ w: 240, h: 200 }} />);
  });
  const input = host.querySelector('input')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, '漢字を復習');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  return { host, input, setSettings };
}

describe('to-do widget Japanese input', () => {
  it.each([
    { isComposing: true },
    { keyCode: 229 },
  ])('preserves the draft while confirming an IME conversion: %j', async (ime) => {
    const { input, setSettings } = await mountDraft();
    const confirmation = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true, ...ime });
    await act(async () => { input.dispatchEvent(confirmation); });
    expect(setSettings).not.toHaveBeenCalled();
    expect(input.value).toBe('漢字を復習');
    expect(confirmation.defaultPrevented).toBe(false);

    await act(async () => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    expect(setSettings).toHaveBeenCalledExactlyOnceWith({
      items: [{ id: expect.any(String), text: '漢字を復習', done: false }],
    });
    expect(input.value).toBe('');
  });

  it('still adds a task with the add button', async () => {
    const { host, input, setSettings } = await mountDraft();
    await act(async () => { host.querySelector('button')!.click(); });
    expect(setSettings).toHaveBeenCalledExactlyOnceWith({
      items: [{ id: expect.any(String), text: '漢字を復習', done: false }],
    });
    expect(input.value).toBe('');
  });
});
