import { describe, expect, it } from 'vitest';
import {
  classifyByExtension,
  classifyDirectory,
  needsTriage,
  preferredTarget,
  targetLabelKey,
  type DropTargetId,
} from '../fileRouting';

const first = (p: string): DropTargetId => classifyByExtension(p)[0].target;

describe('fileRouting', () => {
  describe('unambiguous formats route without asking', () => {
    const cases: [string, DropTargetId][] = [
      ['C:/x/book.epub', 'library-book'],
      ['C:/x/book.pdf', 'library-book'],
      ['C:/x/ep01.mkv', 'media'],
      ['C:/x/ep01.mp4', 'media'],
      ['C:/x/track.flac', 'media'],
      ['C:/x/ep01.srt', 'subtitle'],
      ['C:/x/ep01.ass', 'subtitle'],
      ['C:/x/song.lrc', 'subtitle'],
      ['C:/x/vol1.cbz', 'library-manga'],
      ['C:/x/tool.lnk', 'shortcut'],
      ['C:/x/site.url', 'shortcut'],
    ];

    it.each(cases)('%s -> %s', (path, target) => {
      const candidates = classifyByExtension(path);
      expect(candidates[0].target).toBe(target);
      expect(candidates[0].confidence).toBe('exact');
      expect(needsTriage(candidates)).toBe(false);
    });
  });

  describe('the two ambiguities the app genuinely has', () => {
    it('a .apkg offers the card import first, and the level check as a second reading', () => {
      // Both readings are now real importers. Dropping a deck most often means
      // "add this deck", so card import leads — but the level check must stay
      // reachable, and neither may be a silent default.
      const candidates = classifyByExtension('C:/x/core2k.apkg');
      expect(candidates[0].target).toBe('anki-cards');
      expect(candidates[0].confidence).toBe('likely');
      expect(candidates.map((c) => c.target)).toContain('anki-level');
      // Never routed to the CSV table importer, which cannot read a zip.
      expect(candidates.map((c) => c.target)).not.toContain('deck-csv');
    });

    it('a bare image always asks, and never silently replaces the wallpaper', () => {
      for (const path of ['C:/x/page.png', 'C:/x/page.jpg', 'C:/x/page.webp']) {
        const candidates = classifyByExtension(path);
        expect(needsTriage(candidates)).toBe(true);
        const targets = candidates.map((c) => c.target);
        expect(targets).toContain('wallpaper');
        expect(targets).toContain('library-manga');
      }
    });

    it('offers no wallpaper option for an image the wallpaper pipeline rejects', () => {
      // WALL_EXT is deliberately narrower than IMAGE_EXT.
      const targets = classifyByExtension('C:/x/page.avif').map((c) => c.target);
      expect(targets).not.toContain('wallpaper');
      expect(targets).toContain('library-manga');
    });
  });

  describe('formats that need content sniffing', () => {
    it('a .zip is left ambiguous between dictionary and manga', () => {
      const candidates = classifyByExtension('C:/x/jmdict.zip');
      expect(needsTriage(candidates)).toBe(true);
      expect(candidates.map((c) => c.target)).toEqual(
        expect.arrayContaining(['dictionary-yomitan', 'library-manga']),
      );
    });

    it('a .json lists all three of its consumers', () => {
      const targets = classifyByExtension('C:/x/data.json').map((c) => c.target);
      expect(targets).toEqual(expect.arrayContaining(['backup', 'frequency-dict', 'vn-script']));
      expect(needsTriage(classifyByExtension('C:/x/data.json'))).toBe(true);
    });
  });

  describe('never silently discards', () => {
    it('always returns at least one candidate', () => {
      for (const path of ['C:/x/thing.qqq', 'C:/x/noext', 'C:/x/.hidden', '']) {
        expect(classifyByExtension(path).length).toBeGreaterThan(0);
      }
    });

    it('marks an unrecognised extension as unknown rather than guessing', () => {
      expect(first('C:/x/thing.qqq')).toBe('unknown');
      expect(needsTriage(classifyByExtension('C:/x/thing.qqq'))).toBe(true);
    });

    it('treats a file with no extension as unknown', () => {
      expect(first('C:/x/README')).toBe('unknown');
    });

    it('recognises a partial download instead of trying to import it', () => {
      const candidates = classifyByExtension('C:/x/movie.mkv.crdownload');
      expect(candidates[0].target).toBe('unknown');
      expect(candidates[0].reasonKey).toBe('fileDrop.reason.partialDownload');
    });
  });

  describe('case and separators', () => {
    it('is case-insensitive on the extension', () => {
      expect(first('C:/x/BOOK.EPUB')).toBe('library-book');
      expect(first('C:/x/EP01.MKV')).toBe('media');
    });

    it('handles Windows backslash paths', () => {
      expect(first('C:\\Users\\a\\Desktop\\book.epub')).toBe('library-book');
    });

    it('does not treat a dot in a directory name as the extension', () => {
      expect(first('C:/my.folder/book.epub')).toBe('library-book');
    });
  });

  describe('directories — entirely unhandled before this module', () => {
    it('classifies a plain folder as a folder', () => {
      expect(classifyDirectory('C:/x/Some Series')[0].target).toBe('folder');
    });

    it('reads a wallpaper-ish folder name as a hint, not a certainty', () => {
      const candidates = classifyDirectory('C:/x/Wallpapers');
      expect(candidates[0].target).toBe('wallpaper');
      expect(candidates[0].confidence).toBe('likely');
      expect(candidates.map((c) => c.target)).toContain('folder');
    });

    it('handles a trailing separator', () => {
      expect(classifyDirectory('C:/x/backgrounds/')[0].target).toBe('wallpaper');
    });
  });

  describe('reason keys are i18n keys, never English text', () => {
    it('every candidate from every branch carries a dotted key', () => {
      const paths = [
        'C:/x/a.epub', 'C:/x/a.mkv', 'C:/x/a.srt', 'C:/x/a.zip', 'C:/x/a.cbz',
        'C:/x/a.png', 'C:/x/a.avif', 'C:/x/a.apkg', 'C:/x/a.json', 'C:/x/a.txt',
        'C:/x/a.csv', 'C:/x/a.lnk', 'C:/x/a.ks', 'C:/x/a.qqq', 'C:/x/noext',
      ];
      for (const path of paths) {
        for (const candidate of classifyByExtension(path)) {
          expect(candidate.reasonKey).toMatch(/^fileDrop\.reason\.[a-zA-Z]+$/);
        }
      }
      for (const candidate of classifyDirectory('C:/x/Wallpapers')) {
        expect(candidate.reasonKey).toMatch(/^fileDrop\.reason\.[a-zA-Z]+$/);
      }
    });

    it('targetLabelKey builds the key the UI resolves', () => {
      expect(targetLabelKey('library-manga')).toBe('fileDrop.target.library-manga');
    });
  });

  describe('preferredTarget', () => {
    it('is the first candidate', () => {
      expect(preferredTarget(classifyByExtension('C:/x/a.epub')).target).toBe('library-book');
    });

    it('degrades to unknown on an empty list rather than throwing', () => {
      expect(preferredTarget([]).target).toBe('unknown');
    });
  });
});
