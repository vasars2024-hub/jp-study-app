// @vitest-environment node
//
// A book is mined in its own language: Japanese through kuromoji, Chinese and
// Russian by ICU word boundaries. A Russian book used to throw "no vocabulary"
// (the fallback splitter only knew Latin letters) and a Chinese one went
// through the Japanese analyser.
import { describe, expect, it, vi } from 'vitest';

const dirs = vi.hoisted(() => ({
  userData: `${process.env.TEMP || process.env.TMPDIR || '/tmp'}/jp-mining-lang-${process.pid}`,
}));

vi.mock('electron', () => ({
  app: { getPath: (): string => dirs.userData, on: (): undefined => undefined, whenReady: () => Promise.resolve() },
  dialog: { showOpenDialog: () => Promise.resolve({ canceled: true, filePaths: [] }) },
  ipcMain: { handle: (): undefined => undefined, on: (): undefined => undefined },
  BrowserWindow: { getAllWindows: () => [], fromWebContents: () => null },
}));

vi.mock('../dictionary/yomitan', () => ({
  getFrequencyRank: (): number | undefined => undefined,
  initYomitan: () => Promise.resolve(),
  lookupGlossary: () => [],
}));

const { miningTextLanguage, tokenizeStudyLanguage } = await import('../mining');

describe('miningTextLanguage', () => {
  it('reads the book\'s script', () => {
    expect(miningTextLanguage('猫が好きです。', 'zh')).toBe('ja');
    expect(miningTextLanguage('Я видела кошку в парке.', 'ja')).toBe('ru');
    expect(miningTextLanguage('今天天气很好。', 'zh')).toBe('zh');
    expect(miningTextLanguage('今天天气很好。', 'ja')).toBe('ja');
    expect(miningTextLanguage('An English book.', 'ja')).toBeNull();
  });
});

describe('tokenizeStudyLanguage', () => {
  it('splits Chinese into words', () => {
    const tokens = tokenizeStudyLanguage('今天天气很好。今天我在公园。', 'zh');
    expect(tokens.get('今天')?.count).toBe(2);
    expect(tokens.has('天气')).toBe(true);
    expect(tokens.has('公园')).toBe(true);
  });

  it('counts the forms of one Russian word together, shown as the commonest form', () => {
    const tokens = tokenizeStudyLanguage('Это книга. Я читаю книгу. Где книга? Нет книги.', 'ru');
    expect(tokens.get('книга')?.count).toBe(4);
    expect(tokens.has('книгу')).toBe(false);
    expect(tokens.get('книга')?.sampleSentence).toBe('Это книга.');
  });
});
