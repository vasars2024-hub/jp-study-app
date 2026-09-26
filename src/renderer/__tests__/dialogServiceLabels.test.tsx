// @vitest-environment jsdom
/**
 * The app's confirm / prompt / alert dialogs speak the UI language even when a
 * caller passes no labels. Most callers (74 of them, the companion-pack rename
 * and delete among them) pass none, and the service fell back to hard-coded
 * English: a Japanese, Chinese or Russian UI showed "Cancel", "OK", "Confirm".
 */
import { act } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { alertDialog, confirmDialog, promptDialog } from '../components/ui/dialogService';
import { setUiLang } from '../i18n';

beforeAll(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  setUiLang('ja');
  // setUiLang lands once the catalog chunk resolves.
  // The Japanese catalog is a lazily imported chunk; under a busy machine it takes a while.
  await vi.waitFor(() => expect(document.documentElement.lang).toBe('ja'), { timeout: 20_000, interval: 50 });
}, 30_000);

afterEach(async () => {
  await act(async () => {
    document.querySelector<HTMLButtonElement>('.ui-dialog__foot button')?.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  document.body.replaceChildren();
});

const texts = (): string[] => [...document.querySelectorAll('.ui-dialog__foot button, .ui-dialog__title, .ui-dialog h2')]
  .map((el) => el.textContent ?? '');

describe('dialog service fallbacks follow the UI language', () => {
  it('confirm: title and both buttons', async () => {
    await act(async () => { void confirmDialog({ message: '削除しますか？', danger: true }); });
    expect(texts()).toEqual(expect.arrayContaining(['確認', 'キャンセル', 'OK']));
    expect(texts()).not.toEqual(expect.arrayContaining(['Cancel']));
  });

  it('prompt: title and Cancel', async () => {
    await act(async () => { void promptDialog({ message: '名前' }); });
    expect(texts()).toEqual(expect.arrayContaining(['値を入力', 'キャンセル']));
  });

  it('alert: title', async () => {
    await act(async () => { void alertDialog({ message: '完了しました。' }); });
    expect(texts()).toEqual(expect.arrayContaining(['お知らせ', 'OK']));
  });
});
