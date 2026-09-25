/**
 * A CJK-capable font for the libass subtitle renderer — DEFECT S1's other half.
 *
 * The video-core player burns ASS subtitles onto a canvas with JASSUB/libass, and it is
 * constructed with exactly one font:
 *
 *   defaultFont: "roboto medium",
 *   availableFonts: { "roboto medium": Roboto-Medium.ttf }
 *
 * (`vendor/seanime-web/app/(main)/_features/video-core/video-core-subtitles.ts`, and
 * `src/media/jassub/assets/` holds that one `.ttf` and nothing else). Roboto has no kana
 * and no kanji. Every other face libass ever sees comes from the container's own font
 * attachments — `playbackInfo.mkvMetadata.attachments` — so:
 *
 *   - a muxed release that ships its fonts renders correctly;
 *   - a release with no attachments renders **every** Japanese glyph as a box;
 *   - a release whose attachments cover one style but not another renders one line and
 *     boxes its siblings, on the same frame. That is the user's screenshot.
 *
 * The third case is the one that cannot be explained by anything in the DOM, and it is
 * the common case for this app specifically: a Jimaku or nyaa sidecar is a bare `.ass`
 * or `.srt` with no fonts attached to anything.
 *
 * Nothing is bundled to fix it. A Japanese face is 9–13 MB and adding one to the repo to
 * duplicate a file already installed on the machine is the wrong trade; the system font
 * directory is read instead, and an honest `null` is returned when it holds nothing
 * usable rather than a face that would tofu just as badly.
 *
 * Selection is by an explicit ordered list rather than a scan, so the answer is
 * deterministic and testable, and so that a font is never chosen on the strength of its
 * *name* — the mistake the subtitle-track code documents at length.
 */
import fs from 'node:fs';
import path from 'node:path';
import { localFileUrl } from './library';
import type { SubtitleFallbackFont } from '../shared/types';
import { normalizeStudyLang } from '../shared/studyLang';

export interface SubtitleFallbackFontPick {
  /** The face this file carries, for logging and for the renderer's own reporting. */
  family: string;
  /** Absolute path on this machine. */
  path: string;
}

/**
 * Ordered candidates per study language, most-preferred first.
 *
 * Plain `.ttf` before `.ttc`: FreeType loads face 0 of a collection, which is the right
 * face in every entry here, but a single-face file has no such assumption to be wrong
 * about. Simplified Chinese gets its own list because a Japanese face genuinely does not
 * cover 简化字 — 这/说/你 are not in Noto Sans JP — so falling back across languages
 * would trade one tofu for another.
 */
export const SUBTITLE_FALLBACK_FONT_CANDIDATES: Readonly<
  Record<'ja' | 'zh' | 'ru', readonly SubtitleFallbackFontPick[]>
> = {
  ja: [
    { family: 'Noto Sans JP', path: 'NotoSansJP-VF.ttf' },
    { family: 'Meiryo', path: 'meiryo.ttc' },
    { family: 'Yu Gothic', path: 'YuGothR.ttc' },
    { family: 'Yu Gothic', path: 'YuGothM.ttc' },
    { family: 'MS Gothic', path: 'msgothic.ttc' },
    { family: 'MS Mincho', path: 'msmincho.ttc' },
  ],
  zh: [
    { family: 'Noto Sans SC', path: 'NotoSansSC-VF.ttf' },
    { family: 'Microsoft YaHei', path: 'msyh.ttc' },
    { family: 'Microsoft YaHei Light', path: 'msyhl.ttc' },
    { family: 'SimSun', path: 'simsun.ttc' },
  ],
  // Cyrillic is in every Windows UI face, so this list is about a clean sans at
  // subtitle sizes, not about coverage.
  ru: [
    { family: 'Noto Sans', path: 'NotoSans-Regular.ttf' },
    { family: 'Segoe UI', path: 'segoeui.ttf' },
    { family: 'Arial', path: 'arial.ttf' },
    { family: 'Tahoma', path: 'tahoma.ttf' },
  ],
};

/**
 * Where installed fonts live. Both are read because a per-user install (no admin rights,
 * which is how a font usually arrives on a locked-down machine) never reaches
 * `%WINDIR%\Fonts`. The macOS and Linux entries are there so this returns a real answer
 * off Windows rather than an empty list; they are not the platform this was measured on.
 */
export function systemFontDirectories(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): string[] {
  if (platform === 'win32') {
    const dirs = [path.join(env.WINDIR ?? 'C:\\Windows', 'Fonts')];
    if (env.LOCALAPPDATA) {
      dirs.push(path.join(env.LOCALAPPDATA, 'Microsoft', 'Windows', 'Fonts'));
    }
    return dirs;
  }
  if (platform === 'darwin') {
    return ['/System/Library/Fonts', '/Library/Fonts'];
  }
  return ['/usr/share/fonts', '/usr/local/share/fonts'];
}

/**
 * The first candidate that exists, or null.
 *
 * `exists` is injected so the choice can be tested against a stated font set rather than
 * against whichever machine the suite happens to run on — a test that passes only where
 * it was written is the failure this repo keeps meeting.
 */
export function pickSubtitleFallbackFont(
  lang: string,
  dirs: readonly string[],
  exists: (candidate: string) => boolean,
): SubtitleFallbackFontPick | null {
  const candidates = SUBTITLE_FALLBACK_FONT_CANDIDATES[normalizeStudyLang(lang)];
  for (const candidate of candidates) {
    for (const dir of dirs) {
      const full = path.join(dir, candidate.path);
      if (exists(full)) return { family: candidate.family, path: full };
    }
  }
  return null;
}

/** The pick as something the renderer can hand to libass, or null when there is none. */
export function resolveSubtitleFallbackFont(lang: string): SubtitleFallbackFont | null {
  const pick = pickSubtitleFallbackFont(
    lang,
    systemFontDirectories(),
    (candidate) => {
      try {
        return fs.statSync(candidate).isFile();
      } catch {
        return false;
      }
    },
  );
  if (!pick) return null;
  return { family: pick.family, url: localFileUrl(pick.path) };
}
