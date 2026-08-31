// @vitest-environment node
/**
 * Gate 3, the read half: real files on disk, read through the app's OWN
 * readers.
 *
 * The point every assertion here defends is that this module adds no extractor.
 * The epub case is the one that proves it — the sentence count comes out of
 * `extractEpubSections` + `splitSentences`, so a Files-app mine and the mining
 * analyzer cannot disagree about how many sentences a book holds.
 *
 * Every failure path is checked for a NAMED reason key. An empty passage list
 * returned to mean "something went wrong" is the state the plan calls a
 * FINDING, so the tests distinguish `ok: true, passages: []` from `ok: false`
 * deliberately rather than treating both as "nothing came back".
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import AdmZip from 'adm-zip';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'files-mine-test-'));

// `mineSource.ts` pulls in `main/mining.ts`, which registers IPC and reads app
// paths at import time. Same stub the epub range test uses, same reason.
vi.mock('electron', () => ({
  app: { getPath: () => tmpRoot, getName: () => 'test' },
  ipcMain: { handle: () => undefined, removeHandler: () => undefined },
  dialog: {},
  shell: {},
  BrowserWindow: { getAllWindows: () => [] },
  protocol: { registerSchemesAsPrivileged: () => undefined, handle: () => undefined },
  nativeImage: { createFromPath: () => ({ isEmpty: () => true }) },
}));

let readFilesMineSource: typeof import('../filesApp/mineSource').readFilesMineSource;
let splitSentences: typeof import('../mining').splitSentences;

beforeAll(async () => {
  ({ readFilesMineSource } = await import('../filesApp/mineSource'));
  ({ splitSentences } = await import('../mining'));
});

afterAll(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

function write(name: string, contents: string): string {
  const target = path.join(tmpRoot, name);
  fs.writeFileSync(target, contents, 'utf-8');
  return target;
}

/**
 * The splitter this mine shares with the mining analyzer. It is tested here
 * because this gate is what exposed the defect: `[。！？!?.]\s+` required a
 * space after the terminator, Japanese does not write one, and so every
 * Japanese book produced ONE sentence and every card mined from one carried a
 * whole paragraph as its example.
 */
describe('splitSentences', () => {
  it('splits Japanese on 。！？ with no space after them', () => {
    expect(splitSentences('吾輩は猫である。名前はまだ無い。')).toEqual([
      '吾輩は猫である。',
      '名前はまだ無い。',
    ]);
    expect(splitSentences('本当？そうです！はい。')).toEqual(['本当？', 'そうです！', 'はい。']);
  });

  it('does not shed a closing bracket as its own sentence', () => {
    expect(splitSentences('「行くぞ。」と彼は言った。次の日。')).toEqual([
      '「行くぞ。」と彼は言った。',
      '次の日。',
    ]);
    expect(splitSentences('（そうか。）と思った。')).toEqual(['（そうか。）と思った。']);
  });

  it('keeps a run of terminators together', () => {
    expect(splitSentences('えっ！？本当に。')).toEqual(['えっ！？', '本当に。']);
    expect(splitSentences('そう…。だね。')).toEqual(['そう…。', 'だね。']);
  });

  it('still requires whitespace after an ASCII stop, so URLs and decimals survive', () => {
    // The negative control for the change: this is what the old rule was
    // protecting, and it must keep working.
    expect(splitSentences('See example.com for 3.5 details. Next one here.')).toEqual([
      'See example.com for 3.5 details.',
      'Next one here.',
    ]);
  });

  it('still splits on newlines', () => {
    expect(splitSentences('Line one\nLine two')).toEqual(['Line one', 'Line two']);
    expect(splitSentences('一行目\r\n二行目')).toEqual(['一行目', '二行目']);
  });
});

describe('readFilesMineSource — transcripts', () => {
  it('reads the Cue[] shape the app itself persists, with timings in ms', () => {
    // Exactly what `yt:markTranscribed` is handed: seconds, not milliseconds.
    const file = write(
      'ep1.json',
      JSON.stringify([
        { start: 1.5, end: 3, text: 'これはペンです' },
        { start: 3, end: 5.25, text: '猫が好き' },
      ]),
    );
    const result = readFilesMineSource(file, 'transcript');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.readCount).toBe(2);
    expect(result.passages).toEqual([
      { index: 1, text: 'これはペンです', startMs: 1500, endMs: 3000 },
      { index: 2, text: '猫が好き', startMs: 3000, endMs: 5250 },
    ]);
  });

  it('drops blank cues from the passages but keeps readCount honest', () => {
    const file = write(
      'blanks.json',
      JSON.stringify([{ text: '   ' }, { text: '犬' }, { text: '' }]),
    );
    const result = readFilesMineSource(file, 'transcript');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // readCount is what the file held; passages is what could be read out of it.
    // Collapsing the two would hide a transcript that is mostly empty.
    expect(result.readCount).toBe(3);
    expect(result.passages).toHaveLength(1);
  });

  it('refuses a JSON file of the wrong SHAPE rather than returning zero cues', () => {
    const file = write('object.json', JSON.stringify({ cues: [{ text: 'x' }] }));
    const result = readFilesMineSource(file, 'transcript');
    expect(result).toEqual({ ok: false, reasonKey: 'filesApp.mine.refuse.badTranscript' });
  });

  it('refuses unparseable JSON, naming the parse error', () => {
    const file = write('broken.json', '{not json');
    const result = readFilesMineSource(file, 'transcript');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reasonKey).toBe('filesApp.mine.refuse.badTranscript');
    expect(result.detail).toBeTruthy();
  });
});

describe('readFilesMineSource — subtitles', () => {
  it('parses an SRT through the same parser the player uses', () => {
    const file = write(
      'ep1.srt',
      '1\n00:00:01,000 --> 00:00:03,000\nこれはペンです\n\n2\n00:00:03,500 --> 00:00:05,000\n猫が好き\n',
    );
    const result = readFilesMineSource(file, 'subtitle');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.passages.map((p) => p.text)).toEqual(['これはペンです', '猫が好き']);
    expect(result.passages[0].startMs).toBe(1000);
  });

  it('sends a transcript-shaped .json down the transcript reader', () => {
    // The fusion pipeline writes both shapes, so the row kind alone cannot
    // decide which parser runs.
    const file = write('sub-as-json.json', JSON.stringify([{ start: 0, end: 1, text: '犬' }]));
    const result = readFilesMineSource(file, 'subtitle');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.passages.map((p) => p.text)).toEqual(['犬']);
  });

  it('refuses an extension it does not read, by name', () => {
    const file = write('notes.txt', 'これはペンです');
    expect(readFilesMineSource(file, 'subtitle')).toEqual({
      ok: false,
      reasonKey: 'filesApp.mine.refuse.unknownSubtitleFormat',
    });
  });
});

describe('readFilesMineSource — books', () => {
  function writeEpub(name: string): string {
    const zip = new AdmZip();
    zip.addFile(
      'META-INF/container.xml',
      Buffer.from(
        '<?xml version="1.0"?><container><rootfiles>'
          + '<rootfile full-path="OEBPS/content.opf"/></rootfiles></container>',
        'utf-8',
      ),
    );
    zip.addFile(
      'OEBPS/c1.xhtml',
      Buffer.from(
        '<html><body><h1>第一章</h1><p>吾輩は猫である。名前はまだ無い。</p></body></html>',
        'utf-8',
      ),
    );
    zip.addFile(
      'OEBPS/content.opf',
      Buffer.from(
        '<?xml version="1.0"?><package><metadata><dc:title>Test Novel</dc:title></metadata>'
          + '<manifest><item id="c1" href="c1.xhtml" media-type="application/xhtml+xml"/></manifest>'
          + '<spine><itemref idref="c1"/></spine></package>',
        'utf-8',
      ),
    );
    const target = path.join(tmpRoot, name);
    zip.writeZip(target);
    return target;
  }

  it('splits an epub into sentences and tags each with its section title', () => {
    const result = readFilesMineSource(writeEpub('novel.epub'), 'book');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Two sentences, split on 。 by the analyzer's own splitter. The heading is
    // part of `section.text` — that is `extractEpubSections`'s behaviour, not
    // this reader's, and it stays that way so the two surfaces agree. The title
    // is ALSO available separately, as `context`.
    expect(result.passages.map((p) => p.text)).toEqual([
      '第一章 吾輩は猫である。',
      '名前はまだ無い。',
    ]);
    expect(result.passages[0].context).toBe('第一章');
    // An epub sentence has no timing and must not be given a fabricated zero.
    expect(result.passages.every((p) => p.startMs === undefined)).toBe(true);
    expect(result.readCount).toBe(result.passages.length);
  });

  it('renumbers passages 1..n across sections', () => {
    const result = readFilesMineSource(writeEpub('novel2.epub'), 'book');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.passages.map((p) => p.index)).toEqual(
      result.passages.map((_, i) => i + 1),
    );
  });

  it('refuses a non-epub book row instead of trying to unzip it', () => {
    const dir = path.join(tmpRoot, 'manga-volume');
    fs.mkdirSync(dir, { recursive: true });
    const page = path.join(dir, 'p001.png');
    fs.writeFileSync(page, 'not really a png');
    expect(readFilesMineSource(page, 'book')).toEqual({
      ok: false,
      reasonKey: 'filesApp.mine.refuse.notEpub',
    });
  });

  it('refuses an .epub that is not a zip, naming the reader error', () => {
    const file = write('corrupt.epub', 'this is not a zip archive');
    const result = readFilesMineSource(file, 'book');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reasonKey).toBe('filesApp.mine.refuse.badEpub');
  });
});

describe('readFilesMineSource — the paths that must refuse', () => {
  it('reports a missing file as a broken link, not as an unreadable one', () => {
    expect(readFilesMineSource(path.join(tmpRoot, 'gone.json'), 'transcript')).toEqual({
      ok: false,
      reasonKey: 'filesApp.mine.refuse.brokenLink',
    });
  });

  it('refuses a directory', () => {
    const dir = path.join(tmpRoot, 'a-folder');
    fs.mkdirSync(dir, { recursive: true });
    expect(readFilesMineSource(dir, 'transcript')).toEqual({
      ok: false,
      reasonKey: 'filesApp.mine.refuse.notAFile',
    });
  });
});
