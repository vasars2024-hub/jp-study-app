// @vitest-environment jsdom
import { act, type ComponentType } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

let host: HTMLDivElement;
let root: Root;
let trigger: HTMLButtonElement;
let CommandPalette: ComponentType;

function stubApi(): void {
  const api = new Proxy({}, {
    get: (_target, prop) => (typeof prop === 'string' && prop.startsWith('on')
      ? () => () => undefined
      : () => Promise.resolve(null)),
  });
  Object.defineProperty(window, 'api', { value: api, configurable: true, writable: true });
}

async function openPalette(): Promise<HTMLInputElement> {
  trigger.focus();
  await act(async () => {
    window.dispatchEvent(new CustomEvent('palette:open', { detail: 'toolbox' }));
  });
  const input = document.querySelector<HTMLInputElement>('.palette-input');
  expect(input).not.toBeNull();
  expect(document.activeElement).toBe(input);
  return input as HTMLInputElement;
}

beforeEach(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  stubApi();
  ({ default: CommandPalette } = await import('../components/CommandPalette'));
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    value: () => undefined,
    configurable: true,
  });
  trigger = document.createElement('button');
  trigger.textContent = 'Open commands';
  host = document.createElement('div');
  document.body.append(trigger, host);
  root = createRoot(host);
  await act(async () => root.render(<CommandPalette />));
});

afterEach(async () => {
  await act(async () => root.unmount());
  trigger.remove();
  host.remove();
});

describe('CommandPalette focus round trip', () => {
  it('returns keyboard focus to the launcher after Escape', async () => {
    const input = await openPalette();
    await act(async () => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });

    expect(document.querySelector('.palette')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('returns focus after a backdrop close as well', async () => {
    await openPalette();
    const backdrop = document.querySelector<HTMLElement>('.palette-backdrop');
    await act(async () => {
      backdrop?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    });

    expect(document.querySelector('.palette')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});
