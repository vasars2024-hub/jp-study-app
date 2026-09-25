// @vitest-environment jsdom
/**
 * The card-styling editor tells the truth about Anki (round-2 audit F, Anki
 * items 10 and 15): it was English-only, and "Card styling saved." was shown
 * whether or not the note type in Anki ever changed (it never did).
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { en } from '../../shared/i18n/catalogs/en';

vi.mock('../profileState', () => ({ updateProfile: vi.fn(async () => ({ ok: true })) }));

import NoteCssEditor from '../components/NoteCssEditor';

let host: HTMLDivElement;
let root: Root;
const push = vi.fn();

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('api', { ankiPushNoteStyling: push });
  (window as unknown as { api: unknown }).api = { ankiPushNoteStyling: push };
  push.mockReset();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

async function open(): Promise<void> {
  const toggle = host.querySelector<HTMLButtonElement>('button[aria-expanded]')!;
  await act(async () => toggle.click());
}

async function editAndSave(onMessage: (m: { kind: string; text: string }) => void): Promise<void> {
  const profile = { id: 'p1', noteCss: '.a{}', anki: { modelName: 'Kinomoto' } } as never;
  await act(async () => root.render(<NoteCssEditor profile={profile} onMessage={onMessage} />));
  await open();
  const area = host.querySelector('textarea')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(area, '.b{}');
    area.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const save = [...host.querySelectorAll('button')].find((b) => b.textContent === en['noteCss.save'])!;
  await act(async () => save.click());
}

describe('NoteCssEditor', () => {
  it('pushes to Anki on save and reports "Updated in Anki"', async () => {
    push.mockResolvedValue({ ok: true, status: 'updated', modelName: 'Kinomoto' });
    const onMessage = vi.fn();
    await editAndSave(onMessage);
    expect(push).toHaveBeenCalledWith('p1');
    expect(onMessage).toHaveBeenCalledWith({
      kind: 'ok',
      text: en['noteCss.pushUpdated'].replace('{model}', 'Kinomoto'),
    });
  });

  it('says it is queued when Anki is closed', async () => {
    push.mockResolvedValue({ ok: true, status: 'queued', modelName: 'Kinomoto' });
    const onMessage = vi.fn();
    await editAndSave(onMessage);
    expect(onMessage).toHaveBeenCalledWith({ kind: 'ok', text: en['noteCss.pushQueued'] });
  });

  it('renders its chrome through the catalog', async () => {
    const profile = { id: 'p1', noteCss: '.a{}', anki: { modelName: 'Kinomoto' } } as never;
    await act(async () => root.render(<NoteCssEditor profile={profile} />));
    await open();
    expect(host.textContent).toContain(en['noteCss.title']);
    expect(host.textContent).toContain(en['noteCss.reset']);
  });
});
