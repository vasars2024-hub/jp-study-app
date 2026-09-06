// @vitest-environment jsdom
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { confirmDialog } from '../components/ui/dialogService';

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.useFakeTimers();
});

afterEach(async () => {
  await act(async () => {
    document.querySelector<HTMLButtonElement>('.ui-dialog__foot button')?.click();
    vi.runAllTimers();
  });
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function open(danger = true) {
  let result: boolean | undefined;
  await act(async () => {
    void confirmDialog({ title: 'Remove deck', message: 'Remove these cards?', danger })
      .then((value) => { result = value; });
  });
  return () => result;
}

// jsdom does not implement the browser's Enter -> button activation default.
// Dispatch the real cancelable key first, then perform that default ONLY when
// no handler canceled it. The old window-capture handler returns true first.
async function enter() {
  const focused = document.activeElement;
  if (!(focused instanceof HTMLButtonElement)) throw new Error('No focused dialog choice');
  await act(async () => {
    const key = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    if (focused.dispatchEvent(key)) focused.click();
  });
}

describe('confirmation honors the focused keyboard choice', () => {
  it('Enter on the initially focused Cancel refuses a destructive action', async () => {
    const result = await open();
    expect(document.activeElement?.textContent).toBe('Cancel');
    await enter();
    expect(result()).toBe(false);
  });

  it('Enter on an explicitly focused confirmation still accepts', async () => {
    const result = await open();
    const confirm = document.querySelector<HTMLButtonElement>('.ui-btn--danger');
    if (!confirm) throw new Error('Missing confirm choice');
    confirm.focus();
    await enter();
    expect(result()).toBe(true);
  });

  it('Enter on Cancel also refuses a non-destructive confirmation', async () => {
    const result = await open(false);
    expect(document.activeElement?.textContent).toBe('OK');
    document.querySelector<HTMLButtonElement>('.ui-dialog__foot button')?.focus();
    await enter();
    expect(result()).toBe(false);
  });

  it('the initially focused non-destructive default still accepts Enter', async () => {
    const result = await open(false);
    await enter();
    expect(result()).toBe(true);
  });

  it('Escape still cancels and teardown returns focus to the caller', async () => {
    const trigger = document.createElement('button');
    document.body.append(trigger);
    trigger.focus();
    const result = await open();
    await act(async () => {
      document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      vi.runAllTimers();
    });
    expect(result()).toBe(false);
    expect(document.querySelector('[role=dialog]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });
});
