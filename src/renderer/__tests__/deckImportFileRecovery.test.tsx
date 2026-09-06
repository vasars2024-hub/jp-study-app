// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { en } from '../../shared/i18n/catalogs/en';
import DeckImportPanel from '../components/DeckImportPanel';

const imported = vi.hoisted(() => vi.fn());
vi.mock('../flashcardDeck', () => ({ importDeckFromEntries: imported }));
vi.mock('../profileState', () => ({ getActiveProfile: () => ({ targetLang: 'ja' }) }));

let host: HTMLDivElement;
let root: Root;
const onImported = vi.fn();

async function selectFile(name: string, read: () => Promise<string>) {
  const input = host.querySelector<HTMLInputElement>('input[type=file]');
  if (!input) throw new Error('Missing file input');
  Object.defineProperty(input, 'files', { value: [{ name, text: read }], configurable: true });
  await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
}

beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  imported.mockReset();
  onImported.mockReset();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(<DeckImportPanel onImported={onImported} />));
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

describe('deck file import recovery', () => {
  it('replaces an earlier success with a visible read failure without changing the deck', async () => {
    await selectFile('good.txt', async () => '猫\tねこ\tcat');
    expect(imported).toHaveBeenCalledTimes(1);
    expect(host.querySelector('.deck-import-status.ok')).not.toBeNull();
    await selectFile('unreadable.txt', async () => { throw new Error('private filesystem details'); });
    expect(host.querySelector('[role=alert]')?.textContent).toBe(en['flash.import.readFailed']);
    expect(host.textContent).not.toContain('private filesystem details');
    expect(host.querySelector('.deck-import-status.ok')).toBeNull();
    expect(imported).toHaveBeenCalledTimes(1);
    expect(onImported).toHaveBeenCalledTimes(1);
  });

  it('shows loading and lets a retry succeed after a read failure', async () => {
    await selectFile('bad.txt', async () => { throw new Error('unreadable'); });
    let resolve!: (text: string) => void;
    await selectFile('retry.txt', () => new Promise((done) => { resolve = done; }));
    expect(host.querySelector('[role=status]')?.textContent).toBe(en['common.loading']);
    await act(async () => resolve('猫\tねこ\tcat'));
    expect(imported).toHaveBeenCalledTimes(1);
    expect(host.querySelector('.deck-import-status.ok')?.textContent).toContain('retry');
    expect(host.querySelector('[role=alert]')).toBeNull();
  });

  it('an older slow read cannot replace the newer file import', async () => {
    let resolve!: (text: string) => void;
    await selectFile('older.txt', () => new Promise((done) => { resolve = done; }));
    await selectFile('newer.txt', async () => '犬\tいぬ\tdog');
    await act(async () => resolve('猫\tねこ\tcat'));
    expect(imported).toHaveBeenCalledTimes(1);
    expect(imported.mock.calls[0][0][0]).toMatchObject({ word: '犬', bookTitle: 'newer' });
    expect(host.querySelector('.deck-import-status')?.textContent).toContain('newer');
  });

  it('an older failed read cannot hide the newer success', async () => {
    let reject!: (error: Error) => void;
    await selectFile('older.txt', () => new Promise((_, fail) => { reject = fail; }));
    await selectFile('newer.txt', async () => '犬\tいぬ\tdog');
    await act(async () => reject(new Error('late failure')));
    expect(host.querySelector('.deck-import-status.ok')?.textContent).toContain('newer');
    expect(host.querySelector('[role=alert]')).toBeNull();
  });

  it('closing the import panel prevents a pending file from mutating the deck', async () => {
    let resolve!: (text: string) => void;
    await selectFile('late.txt', () => new Promise((done) => { resolve = done; }));
    await act(async () => root.render(null));
    await act(async () => resolve('猫\tねこ\tcat'));
    expect(imported).not.toHaveBeenCalled();
    expect(onImported).not.toHaveBeenCalled();
  });
});
