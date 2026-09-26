/**
 * Music round-2 leftovers: the Focus music picker mounts only the rows in view,
 * and the chrome that printed English (Focus bar, FFT sizes, the empty library)
 * reads the catalogues.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { songListWindow, SONG_ROW_HEIGHT } from '../components/focusMusicWindow';
import { CATALOGS } from '../../shared/i18n/catalogs/all';

const read = (rel: string) => readFileSync(path.join(__dirname, '..', rel), 'utf8');

describe('Focus music picker window', () => {
  it('mounts a screenful plus overscan, not the whole library', () => {
    const win = songListWindow(5000, 0, 320);
    expect(win.start).toBe(0);
    expect(win.end - win.start).toBeLessThan(30);
  });

  it('follows the scroll offset', () => {
    const win = songListWindow(5000, 100 * SONG_ROW_HEIGHT, 320);
    expect(win.start).toBeLessThanOrEqual(100);
    expect(win.end).toBeGreaterThan(100 + Math.floor(320 / SONG_ROW_HEIGHT));
    expect(win.end).toBeLessThanOrEqual(5000);
  });

  it('handles short and empty lists', () => {
    expect(songListWindow(0, 0, 320)).toEqual({ start: 0, end: 0 });
    expect(songListWindow(3, 0, 320)).toEqual({ start: 0, end: 3 });
    expect(songListWindow(3, 99999, 320).end).toBe(3);
  });
});

describe('music chrome is translated', () => {
  it('the Focus bar has no English literals left', () => {
    const src = read('components/FocusMusicBar.tsx');
    for (const literal of ['Previous track', 'Next track', 'Mix on', 'Search songs', 'click to pick', 'No matches.']) {
      expect(src, literal).not.toContain(literal);
    }
  });

  it('the download button and FFT sizes do not print raw words', () => {
    expect(read('components/music/MusicContent.tsx')).not.toContain('`${yt.stage} ');
    expect(read('components/settings/pages/VisualizerPage.tsx')).not.toMatch(/>\s*FFT \{n\}/);
  });

  it('has the new keys in every language', () => {
    const keys = [
      'musicUi.viz.fftOption',
      'musicUi.empty.addFolder',
      'musicUi.empty.noneAdded',
      'musicUi.empty.addFailed',
      'palette.section.visualizer',
    ];
    for (const lang of ['en', 'ja', 'zh', 'ru'] as const) {
      const cat = CATALOGS[lang] as Record<string, unknown>;
      expect(keys.filter((k) => typeof cat[k] !== 'string'), lang).toEqual([]);
    }
  });

  it('the visualizer is reachable from Start and the palette', () => {
    expect(read('components/DesktopShell.tsx')).toMatch(/id: 'visualizer', labelKey: 'palette\.section\.visualizer'/);
    expect(read('components/CommandPalette.tsx')).toMatch(/id: 'visualizer', labelKey: 'palette\.section\.visualizer'/);
  });
});
