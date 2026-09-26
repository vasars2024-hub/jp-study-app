// @vitest-environment node
/**
 * DEFECT S1, the half that is not DOM text — libass must be given a face that draws kana.
 *
 * The mechanism, re-derived from source and NOT from the plan's recorded lead (which was
 * wrong twice over — see the correction in the plan bullet): the player burns ASS onto a
 * canvas with JASSUB, and `video-core-subtitles.ts` constructs it with
 *
 *   defaultFont: "roboto medium",  availableFonts: { "roboto medium": Roboto-Medium.ttf }
 *
 * `src/media/jassub/assets/` holds exactly that one face. Roboto has no kana and no kanji.
 * The only other fonts libass ever sees are the container's own attachments, which is why
 *
 *   - a muxed release that ships its fonts renders correctly;
 *   - a bare sidecar — every Jimaku or nyaa track, which is this app's whole pipeline —
 *     renders every Japanese glyph as a box;
 *   - a release whose attachments cover one style and not another renders one readable
 *     line beside boxes on the SAME frame.
 *
 * That third case is the user's screenshot and nothing in the DOM can produce it, because
 * Chromium's own per-character fallback would have found a system face.
 *
 * What this pins is the CHOICE, not a screenshot: the ordered candidate list, that it is
 * language-separated (a Japanese face does not cover 简化字), that a missing font is an
 * honest null rather than a guess, and that both the Windows system and per-user font
 * directories are searched. `exists` is injected throughout so the answer does not depend
 * on which machine the suite runs on.
 */
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  app: { getPath: () => '.', getName: () => 'test' },
  ipcMain: { handle: () => undefined, removeHandler: () => undefined },
  dialog: {},
  shell: {},
  BrowserWindow: { getAllWindows: () => [] },
  protocol: { registerSchemesAsPrivileged: () => undefined, handle: () => undefined },
  nativeImage: { createFromPath: () => ({ isEmpty: () => true }) },
}));

const {
  SUBTITLE_FALLBACK_FONT_CANDIDATES,
  pickSubtitleFallbackFont,
  systemFontDirectories,
} = await import('../subtitleFallbackFont');

const WINDOWS_FONTS = 'C:\\Windows\\Fonts';
const USER_FONTS = 'C:\\Users\\test\\AppData\\Local\\Microsoft\\Windows\\Fonts';

/** An `exists` that says yes to exactly the named leaf files, in any of the given dirs. */
function installed(...leaves: string[]): (candidate: string) => boolean {
  const wanted = new Set(leaves.map((leaf) => leaf.toLowerCase()));
  return (candidate) => wanted.has(path.basename(candidate).toLowerCase());
}

describe('pickSubtitleFallbackFont', () => {
  it('returns null when the machine has no CJK face, rather than a Latin guess', () => {
    expect(pickSubtitleFallbackFont('ja', [WINDOWS_FONTS], installed('arial.ttf', 'tahoma.ttf')))
      .toBeNull();
  });

  it('takes the first candidate in order, not merely the first that exists', () => {
    const pick = pickSubtitleFallbackFont(
      'ja',
      [WINDOWS_FONTS],
      installed('msgothic.ttc', 'meiryo.ttc', 'NotoSansJP-VF.ttf'),
    );
    expect(pick).toEqual({
      family: 'Noto Sans JP',
      path: path.join(WINDOWS_FONTS, 'NotoSansJP-VF.ttf'),
    });
  });

  it('falls through the list when the preferred faces are absent', () => {
    expect(pickSubtitleFallbackFont('ja', [WINDOWS_FONTS], installed('msgothic.ttc')))
      .toEqual({ family: 'MS Gothic', path: path.join(WINDOWS_FONTS, 'msgothic.ttc') });
  });

  it('searches the per-user font directory too, where a non-admin install lands', () => {
    expect(pickSubtitleFallbackFont(
      'ja',
      [WINDOWS_FONTS, USER_FONTS],
      (candidate) => candidate === path.join(USER_FONTS, 'meiryo.ttc'),
    )).toEqual({ family: 'Meiryo', path: path.join(USER_FONTS, 'meiryo.ttc') });
  });

  it('does not answer a Chinese study language with a Japanese face', () => {
    // 这/说/你 are absent from Noto Sans JP, so this would trade one tofu for another.
    expect(pickSubtitleFallbackFont('zh', [WINDOWS_FONTS], installed('NotoSansJP-VF.ttf')))
      .toBeNull();
    expect(pickSubtitleFallbackFont('zh', [WINDOWS_FONTS], installed('msyh.ttc')))
      .toEqual({ family: 'Microsoft YaHei', path: path.join(WINDOWS_FONTS, 'msyh.ttc') });
  });

  it('treats an unknown study language as Japanese, which is the app default', () => {
    expect(pickSubtitleFallbackFont('en', [WINDOWS_FONTS], installed('meiryo.ttc'))?.family)
      .toBe('Meiryo');
  });
});

describe('the candidate list itself', () => {
  it('names no Latin-only face on either CJK list', () => {
    // The whole defect is a face with no CJK coverage being treated as good enough.
    // Russian is exempt: Segoe UI, Arial and Tahoma all carry Cyrillic, which is the
    // coverage that list is about.
    const latinOnly = /roboto|arial|tahoma|segoe|liberation|helvetica|verdana|calibri/i;
    for (const candidates of [SUBTITLE_FALLBACK_FONT_CANDIDATES.ja, SUBTITLE_FALLBACK_FONT_CANDIDATES.zh]) {
      for (const candidate of candidates) {
        expect(candidate.family).not.toMatch(latinOnly);
        expect(candidate.path).not.toMatch(latinOnly);
      }
    }
  });

  it('prefers a single-face .ttf over a collection, whose face 0 is an assumption', () => {
    for (const candidates of Object.values(SUBTITLE_FALLBACK_FONT_CANDIDATES)) {
      expect(candidates[0].path.endsWith('.ttf')).toBe(true);
    }
  });
});

describe('systemFontDirectories', () => {
  it('reads WINDIR rather than hardcoding a drive, and adds the per-user directory', () => {
    expect(systemFontDirectories(
      { WINDIR: 'D:\\Windows', LOCALAPPDATA: 'D:\\u\\AppData\\Local' },
      'win32',
    )).toEqual([
      path.join('D:\\Windows', 'Fonts'),
      path.join('D:\\u\\AppData\\Local', 'Microsoft', 'Windows', 'Fonts'),
    ]);
  });

  it('still answers when LOCALAPPDATA is unset', () => {
    expect(systemFontDirectories({ WINDIR: 'C:\\Windows' }, 'win32'))
      .toEqual([path.join('C:\\Windows', 'Fonts')]);
  });

  it('returns real directories off Windows rather than an empty list', () => {
    expect(systemFontDirectories({}, 'darwin').length).toBeGreaterThan(0);
    expect(systemFontDirectories({}, 'linux').length).toBeGreaterThan(0);
  });
});
