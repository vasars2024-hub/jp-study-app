// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { LensLineEditor } from '../components/lens/ReadingLensOverlay';

let root: Root | null = null;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = null;
  document.body.replaceChildren();
});

function typeInto(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('Reading Lens editable OCR line', () => {
  it('commits the controlled draft on Enter without racing Japanese composition', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    const onCommit = vi.fn(() => true);

    await act(async () => {
      root?.render(
        <LensLineEditor
          text="猫てある"
          vertical={false}
          confidenceLevel="low"
          style={{ left: 4, top: 8, minWidth: 90, minHeight: 20, fontSize: 16 }}
          label="Edit OCR line 2"
          onCommit={onCommit}
        />,
      );
    });

    const input = host.querySelector<HTMLInputElement>('input');
    if (!input) throw new Error('missing line editor');
    input.focus();
    await act(async () => typeInto(input, '猫である'));
    await act(async () => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });

    expect(onCommit).toHaveBeenCalledOnce();
    expect(onCommit).toHaveBeenCalledWith('猫である');
    expect(input.className).toContain('lens-confidence-low');
    expect(input.getAttribute('aria-label')).toBe('Edit OCR line 2');
  });

  it('restores the source line when the correction boundary rejects a draft', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);

    await act(async () => {
      root?.render(
        <LensLineEditor
          text="原文"
          vertical={false}
          confidenceLevel="high"
          style={{ left: 0, top: 0, minWidth: 80, minHeight: 20, fontSize: 16 }}
          label="Edit OCR line 1"
          onCommit={() => false}
        />,
      );
    });

    const input = host.querySelector<HTMLInputElement>('input');
    if (!input) throw new Error('missing line editor');
    input.focus();
    await act(async () => typeInto(input, '   '));
    await act(async () => input.blur());
    expect(input.value).toBe('原文');
  });
});
