// @vitest-environment node
/**
 * Which key a frequency list is asked for, and in what order.
 *
 * `parseFrequencyDictionaryPayload` writes **two** keys for every entry it
 * imports — the bare expression and `expression\x01reading` — and it writes the
 * bare one unconditionally. So for a homograph the bare key is overwritten once
 * per entry and ends up holding whichever reading the list file happened to
 * store last. That is an arbitrary pick, not a fallback, and asking for it first
 * makes a common word answer with a rare homograph's rank.
 *
 * These tests pin the resolution order rather than any one rank, because the
 * order is the whole correction: reading-keyed first, bare expression last, and
 * the katakana/hiragana variants in between for lists imported before readings
 * were normalised. A regression here is silent — a plausible number appears in
 * the difficulty profile and the mining table, just the wrong word's.
 */
import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

// `vi.hoisted` runs before this file's own imports are initialised, so the
// directory is composed from `process` alone — reaching for `os`/`path` here is
// a `Cannot access '__vi_import_0__' before initialization`, not a lint nit.
const dirs = vi.hoisted(() => ({
  userData: `${process.env.TEMP || process.env.TMPDIR || '/tmp'}/jp-freq-key-${process.pid}`,
}));

vi.mock('electron', () => ({
  app: { getPath: (): string => dirs.userData, on: (): undefined => undefined, whenReady: () => Promise.resolve() },
  dialog: { showOpenDialog: () => Promise.resolve({ canceled: true, filePaths: [] }) },
  ipcMain: { handle: (): undefined => undefined, on: (): undefined => undefined },
  BrowserWindow: { getAllWindows: () => [], fromWebContents: () => null },
}));

// The Yomitan store is the fallback leg of `resolveCustomFrequencyRanks`. It is
// stubbed to know nothing so that a rank in these assertions can only have come
// from the list files this test wrote.
vi.mock('../dictionary/yomitan', () => ({
  getFrequencyRank: (): number | undefined => undefined,
  initYomitan: () => Promise.resolve(),
  lookupGlossary: () => [],
}));

const freqRoot = path.join(dirs.userData, 'mining', 'frequency-dicts');

/** The separator the import writes between expression and reading. */
const SEP = String.fromCharCode(1);

/**
 * A list file written the way an import writes one: both keys per entry, and the
 * bare key left holding the *last* entry — here the rare homograph, which is the
 * shape that produced the wrong answer in production.
 */
function writeList(
  id: string,
  label: string,
  ranks: Record<string, number>,
  language: string | undefined = 'ja',
): void {
  fs.mkdirSync(freqRoot, { recursive: true });
  fs.writeFileSync(
    path.join(freqRoot, `${id}.json`),
    JSON.stringify({
      summary: {
        id,
        label,
        source: 'test',
        entryCount: Object.keys(ranks).length,
        enabled: true,
        importedAt: 0,
        ...(language ? { language } : {}),
      },
      ranks,
    }),
    'utf-8',
  );
}

async function load(): Promise<typeof import('../mining')> {
  vi.resetModules();
  return import('../mining');
}

beforeEach(() => {
  fs.rmSync(freqRoot, { force: true, recursive: true });
  fs.mkdirSync(freqRoot, { recursive: true });
});

afterAll(() => {
  fs.rmSync(dirs.userData, { force: true, recursive: true });
});

describe('resolveCustomFrequencyRanks key order', () => {
  it('answers with the reading the caller asked for, not the bare key the import left behind', async () => {
    writeList('homograph', 'Homograph list', {
      [`私${SEP}わたし`]: 32,
      [`私${SEP}わたくし`]: 291_201,
      // What the import leaves in the bare key: the last entry parsed.
      私: 291_201,
    });
    const { resolveCustomFrequencyRanks } = await load();
    expect(resolveCustomFrequencyRanks('私', 'わたし').primary).toBe(32);
  });

  it('still uses the bare key when the caller has no reading', async () => {
    writeList('homograph', 'Homograph list', { [`私${SEP}わたし`]: 32, 私: 291_201 });
    const { resolveCustomFrequencyRanks } = await load();
    expect(resolveCustomFrequencyRanks('私', undefined).primary).toBe(291_201);
  });

  it('still uses the bare key when the list stores no reading at all', async () => {
    writeList('bare', 'Bare list', { 猫: 1_509 });
    const { resolveCustomFrequencyRanks } = await load();
    expect(resolveCustomFrequencyRanks('猫', 'ねこ').primary).toBe(1_509);
  });

  it('matches a list imported before readings were stored as hiragana', async () => {
    writeList('katakana', 'Katakana-keyed list', { [`猫${SEP}ネコ`]: 1_509 });
    const { resolveCustomFrequencyRanks } = await load();
    expect(resolveCustomFrequencyRanks('猫', 'ねこ').primary).toBe(1_509);
  });

  it('attributes the rank to the list that supplied it, and keeps the lowest as primary', async () => {
    writeList('a', 'List A', { [`猫${SEP}ねこ`]: 2_000 });
    writeList('b', 'List B', { [`猫${SEP}ねこ`]: 1_509 });
    const { resolveCustomFrequencyRanks } = await load();
    const ranks = resolveCustomFrequencyRanks('猫', 'ねこ');
    expect(ranks.primary).toBe(1_509);
    expect(ranks.byDictionary['List A']).toBe(2_000);
    expect(ranks.byDictionary['List B']).toBe(1_509);
  });

  it('ignores a disabled list rather than ranking from it', async () => {
    writeList('off', 'Disabled list', { [`猫${SEP}ねこ`]: 1_509 });
    const file = path.join(freqRoot, 'off.json');
    const parsed = JSON.parse(fs.readFileSync(file, 'utf-8')) as { summary: { enabled: boolean } };
    parsed.summary.enabled = false;
    fs.writeFileSync(file, JSON.stringify(parsed), 'utf-8');
    const { resolveCustomFrequencyRanks } = await load();
    expect(resolveCustomFrequencyRanks('猫', 'ねこ').primary).toBeUndefined();
  });
});

/**
 * The bundled lists cover three languages and two of them share a script, so
 * "lowest rank across every enabled list" lets a 390-entry Chinese list outbid a
 * 550,408-entry Japanese one on a kanji they both contain. Reproduced here with
 * the real shape: 本 is 357 in the Japanese list and 81 in the Chinese one.
 */
describe('resolveCustomFrequencyRanks language filter', () => {
  const bilingual = (): void => {
    writeList('ja', 'Japanese frequency', { [`本${SEP}ほん`]: 357, 本: 357 }, 'ja');
    writeList('zh', 'Chinese core frequency', { 本: 81 }, 'zh');
  };

  it('lets a Chinese list win the minimum when no language is given', async () => {
    bilingual();
    const { resolveCustomFrequencyRanks } = await load();
    const ranks = resolveCustomFrequencyRanks('本', 'ほん');
    expect(ranks.primary).toBe(81);
    expect(ranks.byDictionary['Chinese core frequency']).toBe(81);
  });

  it('ranks a Japanese word against Japanese lists alone when told the language', async () => {
    bilingual();
    const { resolveCustomFrequencyRanks } = await load();
    const ranks = resolveCustomFrequencyRanks('本', 'ほん', 'ja');
    expect(ranks.primary).toBe(357);
    // Not merely outvoted — the Chinese list must not be attributable at all,
    // since the profile names every source it used.
    expect(ranks.byDictionary).toEqual({ 'Japanese frequency': 357 });
  });

  it('still consults a list that declares no language of its own', async () => {
    writeList('ja', 'Japanese frequency', { [`本${SEP}ほん`]: 357 }, 'ja');
    writeList('custom', 'Imported list', { 本: 12 }, undefined);
    const { resolveCustomFrequencyRanks } = await load();
    const ranks = resolveCustomFrequencyRanks('本', 'ほん', 'ja');
    expect(ranks.primary).toBe(12);
    expect(ranks.byDictionary['Imported list']).toBe(12);
  });

  it('narrows to the asked-for language, not away from one language', async () => {
    bilingual();
    const { resolveCustomFrequencyRanks } = await load();
    expect(resolveCustomFrequencyRanks('本', undefined, 'zh').byDictionary)
      .toEqual({ 'Chinese core frequency': 81 });
  });
});
