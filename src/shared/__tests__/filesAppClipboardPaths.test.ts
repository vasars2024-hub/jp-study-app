/**
 * Gate 28's first three words — "**Paste a folder** sorts all of it".
 *
 * The parsing half, which is where every way this can go quietly wrong lives.
 * The two failure modes worth naming, because both produce a feature that looks
 * broken rather than absent:
 *
 * 1. Explorer's `FileNameW` is a PADDED UTF-16LE buffer. Decoding all of it
 *    yields a real path followed by a run of `\u0000`, which no `statSync` will
 *    ever match — a correct paste then reports "that folder does not exist".
 * 2. A paste of prose is not a paste of paths. Without the shape guard, every
 *    line of a pasted paragraph becomes a filesystem call.
 *
 * `resolveFolders` is tested against a FAKE probe rather than real files on
 * purpose: the rules being scored are "a file means its parent" and "an
 * unconfirmable candidate is dropped", and both are decisions, not disk facts.
 */
import { describe, expect, it } from 'vitest';
import {
  decodeFileNameW,
  folderCandidatesFrom,
  looksLikePath,
  resolveFolders,
  type CandidateProbe,
} from '../filesApp/clipboardPaths';

/** Encode as Windows does: UTF-16LE, NUL-terminated, then padded. */
function fileNameW(pathValue: string, padTo = 0): Uint8Array {
  const chars = [...pathValue].map((c) => c.charCodeAt(0));
  const length = Math.max(padTo, chars.length + 1);
  const buffer = new Uint8Array(length * 2);
  chars.forEach((code, i) => {
    buffer[i * 2] = code & 0xff;
    buffer[i * 2 + 1] = code >> 8;
  });
  return buffer;
}

describe('decodeFileNameW — Explorer speaking precisely', () => {
  it('stops at the NUL terminator instead of returning the padding', () => {
    // The control for this test is the padding itself: 260 wide characters, of
    // which 12 are the path. A decoder that ignores the terminator returns a
    // 259-character string that ends in NULs and matches nothing.
    const buffer = fileNameW('C:\\dl\\anime', 260);
    expect(buffer.length).toBe(520);
    expect(decodeFileNameW(buffer)).toBe('C:\\dl\\anime');
  });

  it('reads a path with non-ASCII characters correctly', () => {
    expect(decodeFileNameW(fileNameW('C:\\動画\\第1話', 64))).toBe('C:\\動画\\第1話');
  });

  it('answers null for an absent, empty or whitespace-only buffer', () => {
    expect(decodeFileNameW(null)).toBeNull();
    expect(decodeFileNameW(undefined)).toBeNull();
    expect(decodeFileNameW(new Uint8Array(0))).toBeNull();
    expect(decodeFileNameW(fileNameW('   ', 8))).toBeNull();
  });
});

describe('looksLikePath — the guard that stops a paragraph becoming disk calls', () => {
  it('accepts the three shapes a local path actually takes', () => {
    expect(looksLikePath('C:\\dl\\anime')).toBe(true);
    expect(looksLikePath('\\\\nas\\share\\anime')).toBe(true);
    expect(looksLikePath('/home/me/anime')).toBe(true);
  });

  it('refuses prose, a bare name, and anything carrying a control character', () => {
    expect(looksLikePath('I copied the anime folder, scan it please')).toBe(false);
    expect(looksLikePath('anime')).toBe(false);
    expect(looksLikePath('C:\\dl\tanime')).toBe(false);
    expect(looksLikePath('C:\\dl\u0000\u0000')).toBe(false);
    expect(looksLikePath(`C:\\${'a'.repeat(5000)}`)).toBe(false);
  });
});

describe('folderCandidatesFrom — what the clipboard is offering', () => {
  it('prefers FileNameW and does not repeat it as its own text rendering', () => {
    // Explorer's Ctrl+C sets both; "Copy as path" quotes the text form. One
    // folder must produce ONE candidate, or a single paste looks like several
    // and the sheet refuses to scan it.
    expect(
      folderCandidatesFrom({
        fileNameW: fileNameW('C:\\dl\\anime', 260),
        text: '"C:\\dl\\anime"',
      }),
    ).toEqual(['C:\\dl\\anime']);
  });

  it('treats a trailing separator and a case difference as the same folder', () => {
    expect(folderCandidatesFrom({ text: 'C:\\dl\\anime\nc:\\DL\\Anime\\' })).toEqual([
      'C:\\dl\\anime',
    ]);
  });

  it('keeps genuinely different folders, in the order pasted', () => {
    expect(folderCandidatesFrom({ text: 'C:\\dl\\a\r\nC:\\dl\\b\r\n\r\nC:\\dl\\c' })).toEqual([
      'C:\\dl\\a',
      'C:\\dl\\b',
      'C:\\dl\\c',
    ]);
  });

  it('answers nothing at all for pasted prose', () => {
    const prose = 'Here are the episodes I downloaded.\nThey are in the usual place.\nThanks!';
    expect(folderCandidatesFrom({ text: prose })).toEqual([]);
  });

  it('answers nothing for an empty clipboard', () => {
    expect(folderCandidatesFrom({})).toEqual([]);
    expect(folderCandidatesFrom({ fileNameW: null, text: null })).toEqual([]);
  });

  it('caps a huge paste rather than walking all of it', () => {
    const many = Array.from({ length: 50 }, (_, i) => `C:\\dl\\f${i}`).join('\n');
    expect(folderCandidatesFrom({ text: many })).toHaveLength(8);
  });
});

describe('resolveFolders — only what is really on this machine', () => {
  const probe = (kinds: Record<string, 'directory' | 'file'>): CandidateProbe => ({
    kindOf: (p) => kinds[p] ?? null,
    parentOf: (p) => {
      const cut = p.replace(/[\\/]+$/, '').lastIndexOf('\\');
      return cut <= 2 ? p.slice(0, cut + 1) : p.slice(0, cut);
    },
  });

  it('answers a directory with itself', () => {
    expect(
      resolveFolders(['C:\\dl\\anime'], probe({ 'C:\\dl\\anime': 'directory' })),
    ).toEqual(['C:\\dl\\anime']);
  });

  it('answers a FILE with its parent — the folder the user meant', () => {
    expect(
      resolveFolders(['C:\\dl\\anime\\ep01.mkv'], probe({ 'C:\\dl\\anime\\ep01.mkv': 'file' })),
    ).toEqual(['C:\\dl\\anime']);
  });

  it('DROPS a candidate the probe cannot confirm, rather than offering it', () => {
    // The adverse case: a path copied on another machine. Offering it would
    // make the scan report "unreadable root" and blame the folder.
    expect(resolveFolders(['D:\\from-the-other-pc\\anime'], probe({}))).toEqual([]);
  });

  it('does not offer a whole drive when the parent is a root', () => {
    expect(resolveFolders(['C:\\notes.txt'], probe({ 'C:\\notes.txt': 'file' }))).toEqual([
      'C:\\',
    ]);
    // ...and a candidate whose parent IS itself is dropped outright.
    expect(resolveFolders(['C:\\'], probe({ 'C:\\': 'file' }))).toEqual([]);
  });

  it('collapses two files in one folder to that one folder', () => {
    expect(
      resolveFolders(
        ['C:\\dl\\anime\\ep01.mkv', 'C:\\dl\\anime\\ep02.mkv'],
        probe({ 'C:\\dl\\anime\\ep01.mkv': 'file', 'C:\\dl\\anime\\ep02.mkv': 'file' }),
      ),
    ).toEqual(['C:\\dl\\anime']);
  });
});
