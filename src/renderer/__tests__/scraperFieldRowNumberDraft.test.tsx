// @vitest-environment jsdom
/**
 * Settings number fields: typed as a draft, validated on commit, and a draft
 * that fails validation is visibly unsaved.
 *
 * Every keystroke used to be committed, so the validator clamped mid-number:
 * clearing "Retry Attempts" to type 5 saved 0 the moment the box was empty.
 */
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import FieldRow from '../components/scraper/settings/FieldRow';
import { SCRAPER_FIELDS } from '../components/scraper/settings/fields';
import { DEFAULT_SCRAPER_SETTINGS } from '../../shared/scraperSettings';

const FIELD_PATH = 'network.retryAttempts';

let host: HTMLDivElement;
let root: Root;
let onChange: ReturnType<typeof vi.fn>;

function field() {
  const found = SCRAPER_FIELDS.find((entry) => entry.path === FIELD_PATH);
  if (!found || found.kind !== 'number') throw new Error(`${FIELD_PATH} is not a number field`);
  return found;
}

async function render(): Promise<HTMLInputElement> {
  await act(async () => {
    root.render(createElement(FieldRow, {
      field: field(),
      settings: DEFAULT_SCRAPER_SETTINGS,
      onChange: onChange as unknown as (path: string, value: unknown) => void,
      onAction: () => undefined,
    }));
  });
  const input = host.querySelector<HTMLInputElement>('input[type="number"]');
  if (!input) throw new Error('no number input');
  return input;
}

function typeInto(input: HTMLInputElement, text: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  act(() => {
    setter?.call(input, text);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function blur(input: HTMLInputElement): void {
  act(() => {
    input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
  });
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  onChange = vi.fn();
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe('FieldRow number fields', () => {
  it('does not save while typing, only on blur', async () => {
    const input = await render();
    typeInto(input, '');
    typeInto(input, '5');
    expect(onChange).not.toHaveBeenCalled();
    expect(input.value).toBe('5');
    blur(input);
    expect(onChange).toHaveBeenCalledWith(FIELD_PATH, 5);
  });

  it('commits on Enter', async () => {
    const input = await render();
    typeInto(input, '7');
    act(() => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    expect(onChange).toHaveBeenCalledWith(FIELD_PATH, 7);
  });

  it('marks an empty draft invalid and does not save it', async () => {
    const input = await render();
    typeInto(input, '');
    blur(input);
    expect(onChange).not.toHaveBeenCalled();
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(host.querySelector('.scr-field-error')?.textContent).toContain('Not saved');
  });

  it('marks an out-of-range draft invalid instead of silently clamping it', async () => {
    const input = await render();
    const { max } = field();
    typeInto(input, String((max ?? 10) + 5));
    blur(input);
    expect(onChange).not.toHaveBeenCalled();
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.value).toBe(String((max ?? 10) + 5));
  });

  it('clears the error once a valid value is committed', async () => {
    const input = await render();
    typeInto(input, 'abc');
    blur(input);
    expect(input.getAttribute('aria-invalid')).toBe('true');
    typeInto(input, '4');
    blur(input);
    expect(input.getAttribute('aria-invalid')).toBeNull();
    expect(onChange).toHaveBeenCalledWith(FIELD_PATH, 4);
  });
});
