// @vitest-environment jsdom
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { promptDialog } from '../components/ui/dialogService';

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

afterEach(async () => {
  await act(async () => {
    document.querySelector<HTMLButtonElement>('.ui-dialog__foot button')?.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

describe('prompt dialog keyboard submission', () => {
  it.each([
    { isComposing: true },
    { keyCode: 229 },
  ])('keeps the prompt open during IME confirmation (%j)', async (ime) => {
    const resolved = vi.fn();
    await act(async () => {
      void promptDialog({ message: '名前', defaultValue: 'にほんご' }).then(resolved);
    });
    const input = document.querySelector<HTMLInputElement>('.ui-dialog input')!;
    const confirmation = new KeyboardEvent('keydown', {
      key: 'Enter', bubbles: true, cancelable: true, ...ime,
    });
    await act(async () => { input.dispatchEvent(confirmation); });

    expect(resolved).not.toHaveBeenCalled();
    expect(confirmation.defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(input);

    // The IME commits the converted text; a separate Enter submits it.
    await act(async () => {
      const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      setValue.call(input, '日本語');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const submit = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    await act(async () => { input.dispatchEvent(submit); });

    expect(resolved).toHaveBeenCalledExactlyOnceWith('日本語');
    expect(submit.defaultPrevented).toBe(true);
  });
});
