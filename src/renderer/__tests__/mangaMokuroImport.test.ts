// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { importMokuroFile, mokuroImportMessage } from '../mangaMokuroImport';
import { MOKURO_VOLUME_MAX_BYTES } from '../../shared/mokuroVolume';
import { en } from '../../shared/i18n/catalogs/en';

/** The real English catalog, with CLDR plural records resolved the simple way. */
function t(key: string, vars: Record<string, string | number> = {}): string {
  const entry = (en as Record<string, unknown>)[key];
  let text = '';
  if (typeof entry === 'string') text = entry;
  else if (entry && typeof entry === 'object') {
    const forms = entry as Record<string, string>;
    text = (vars.count === 1 ? forms.one : forms.other) ?? '';
  }
  expect(text, `missing catalog key ${key}`).not.toBe('');
  return text.replace(/\{(\w+)\}/g, (_, name: string) => String(vars[name] ?? `{${name}}`));
}

afterEach(() => {
  delete (window as { api?: unknown }).api;
});

describe('mokuroImportMessage', () => {
  it('says how many pages came in, and when they were paired by order', () => {
    expect(mokuroImportMessage({ ok: true, pages: 1, unmatched: 0, matchedBy: 'name' }, t)).toMatch(/1 page/);
    const ordered = mokuroImportMessage({ ok: true, pages: 3, unmatched: 2, matchedBy: 'order' }, t);
    expect(ordered).toContain(t('read2.manga.mokuro.byOrder'));
    expect(ordered).toContain(t('read2.manga.mokuro.unmatched', { count: 2 }));
  });

  it('has a sentence for every failure reason', () => {
    for (const reason of ['invalid', 'tooLarge', 'noMatch', 'noPages'] as const) {
      expect(mokuroImportMessage({ ok: false, reason }, t)).toBe(t(`read2.manga.mokuro.error.${reason}`));
    }
  });
});

describe('importMokuroFile', () => {
  it('sends the file text to main and reports the result', async () => {
    const run = vi.fn(async () => ({ ok: true as const, pages: 2, unmatched: 0, matchedBy: 'name' as const }));
    (window as unknown as { api: unknown }).api = { mangaOcrImportMokuro: run };
    const outcome = await importMokuroFile('item-1', { size: 10, text: async () => '{"x":1}' }, t);
    expect(run).toHaveBeenCalledWith('item-1', '{"x":1}');
    expect(outcome.ok).toBe(true);
  });

  it('refuses an oversized file before reading it', async () => {
    const text = vi.fn(async () => '');
    (window as unknown as { api: unknown }).api = { mangaOcrImportMokuro: vi.fn() };
    const outcome = await importMokuroFile('item-1', { size: MOKURO_VOLUME_MAX_BYTES + 1, text }, t);
    expect(outcome).toEqual({ ok: false, message: t('read2.manga.mokuro.error.tooLarge') });
    expect(text).not.toHaveBeenCalled();
  });

  it('never throws when main does', async () => {
    (window as unknown as { api: unknown }).api = { mangaOcrImportMokuro: async () => { throw new Error('boom'); } };
    const outcome = await importMokuroFile('item-1', { size: 1, text: async () => '{}' }, t);
    expect(outcome.ok).toBe(false);
  });
});
