// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import PlaylistEditor from '../components/PlaylistEditor';
import { DEFAULT_ENVIRONMENT } from '../environment/types';

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
  const onChange = vi.fn();
  await act(async () => {
    root?.render(<PlaylistEditor env={DEFAULT_ENVIRONMENT} onChange={onChange} />);
  });
  const rename = Array.from(host.querySelectorAll('button')).find((button) => button.textContent === 'Rename')!;
  await act(async () => { rename.click(); });
  const input = host.querySelector<HTMLInputElement>('.pl-rename input')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, '日本の風景');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  return { host, input, onChange };
}

describe('wallpaper playlist rename Japanese input', () => {
  it.each([
    { key: 'Enter', isComposing: true },
    { key: 'Escape', isComposing: true },
    { key: 'Enter', keyCode: 229 },
    { key: 'Escape', keyCode: 229 },
  ])('keeps the draft open during IME conversion: %j', async (ime) => {
    const { host, input, onChange } = await mountDraft();
    const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...ime });
    await act(async () => { input.dispatchEvent(event); });
    expect(onChange).not.toHaveBeenCalled();
    expect(host.querySelector('.pl-rename input')).toBe(input);
    expect(input.value).toBe('日本の風景');
    expect(event.defaultPrevented).toBe(false);

    await act(async () => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    expect(onChange).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      playlists: [expect.objectContaining({ name: '日本の風景' })],
    }));
    expect(host.querySelector('.pl-rename')).toBeNull();
  });

  it('still cancels with Escape outside composition', async () => {
    const { host, input, onChange } = await mountDraft();
    await act(async () => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(onChange).not.toHaveBeenCalled();
    expect(host.querySelector('.pl-rename')).toBeNull();
  });

  it('still saves with the save button', async () => {
    const { host, onChange } = await mountDraft();
    await act(async () => { host.querySelector<HTMLButtonElement>('.pl-rename button')!.click(); });
    expect(onChange).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      playlists: [expect.objectContaining({ name: '日本の風景' })],
    }));
    expect(host.querySelector('.pl-rename')).toBeNull();
  });
});
