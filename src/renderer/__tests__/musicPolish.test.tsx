// @vitest-environment jsdom
/**
 * music2 — the lyric study switches, their commands, instant line clips, and
 * the Media Center lyric lookup that used to draw nothing.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import MusicStudyBar from '../components/music/MusicStudyBar';
import {
  DEFAULT_MUSIC_STUDY_PREFS,
  MUSIC_STUDY_PREFS_KEY,
  loadMusicStudyPrefs,
  patchMusicStudyPrefs,
} from '../musicStudyPrefs';
import { COMMAND_CATALOG, runCommand } from '../keyboardShortcuts';
import { CATALOGS } from '../../shared/i18n/catalogs/all';
import type { VideoCoreStudyCue } from '../../shared/videoCoreStudy';

const SRC = resolve(__dirname, '..', '..');
const read = (rel: string): string => readFileSync(resolve(SRC, rel), 'utf8');
const en = (key: string): string => String(CATALOGS.en[key]);

let root: Root | null = null;
let host: HTMLDivElement;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  root?.unmount();
  root = null;
  document.body.replaceChildren();
});

const CUES: VideoCoreStudyCue[] = [
  { index: 0, trackNumber: 0, text: '春よ', startMs: 0, endMs: 2000 },
  { index: 1, trackNumber: 0, text: '遠き春よ', startMs: 2000, endMs: 4000 },
];

async function mount(props: Partial<React.ComponentProps<typeof MusicStudyBar>> = {}) {
  const onMineCurrent = vi.fn();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root?.render(
      <MusicStudyBar cues={CUES} trackKey="t1" seek={() => undefined} onMineCurrent={onMineCurrent} {...props} />,
    );
  });
  return onMineCurrent;
}

const toggle = (label: string): HTMLButtonElement | undefined =>
  [...host.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === label);

describe('music study prefs', () => {
  it('default to colouring on and the timing switches off, and survive a corrupt value', () => {
    expect(loadMusicStudyPrefs()).toEqual(DEFAULT_MUSIC_STUDY_PREFS);
    localStorage.setItem(MUSIC_STUDY_PREFS_KEY, '{"autoPause":"yes","lineLoop":true}');
    expect(loadMusicStudyPrefs()).toEqual({ ...DEFAULT_MUSIC_STUDY_PREFS, lineLoop: true });
    localStorage.setItem(MUSIC_STUDY_PREFS_KEY, 'nope');
    expect(loadMusicStudyPrefs()).toEqual(DEFAULT_MUSIC_STUDY_PREFS);
  });
});

describe('MusicStudyBar', () => {
  it('shows pressed-state switches and flips them', async () => {
    await mount();
    const pause = toggle(en('music2.study.autoPause'));
    expect(pause?.getAttribute('aria-pressed')).toBe('false');
    await act(async () => {
      pause?.click();
    });
    expect(loadMusicStudyPrefs().autoPause).toBe(true);
    expect(toggle(en('music2.study.autoPause'))?.getAttribute('aria-pressed')).toBe('true');
    expect(host.querySelector('[role="group"]')?.getAttribute('aria-label')).toBe(en('music2.study.label'));
  });

  it('hides the timing switches and the mine button for a plain sheet', async () => {
    await mount({ cues: [] });
    expect(toggle(en('music2.study.autoPause'))).toBeUndefined();
    expect(toggle(en('music2.study.lineLoop'))).toBeUndefined();
    expect(toggle(en('music2.study.mine'))).toBeUndefined();
    expect(toggle(en('music2.study.known'))).toBeDefined();
  });

  it('registers its three music.* commands and nothing else', async () => {
    const onMine = await mount();
    runCommand('music.toggleLineLoop');
    expect(loadMusicStudyPrefs().lineLoop).toBe(true);
    runCommand('music.toggleAutoPause');
    expect(loadMusicStudyPrefs().autoPause).toBe(true);
    runCommand('music.mineLine');
    expect(onMine).toHaveBeenCalledTimes(1);
    const source = read('renderer/components/music/MusicStudyBar.tsx');
    const ids = [...source.matchAll(/registerCommandHandler\('([^']+)'/g)].map((m) => m[1]);
    expect(ids.sort()).toEqual(['music.mineLine', 'music.toggleAutoPause', 'music.toggleLineLoop']);
  });

  it('keeps a switch click from becoming a dictionary lookup', async () => {
    // The pane's lookup is a React `onMouseUp` on an ancestor, so that is what is tested.
    const onMouseUp = vi.fn();
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    await act(async () => {
      root?.render(
        <div onMouseUp={onMouseUp}>
          <MusicStudyBar cues={CUES} trackKey="t1" seek={() => undefined} onMineCurrent={() => undefined} />
        </div>,
      );
    });
    await act(async () => {
      toggle(en('music2.study.lineLoop'))?.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    });
    expect(onMouseUp).not.toHaveBeenCalled();
    patchMusicStudyPrefs({ lineLoop: false });
  });
});

describe('catalog', () => {
  it('the new commands exist, unbound, and are labelled in every language', () => {
    for (const id of ['music.toggleAutoPause', 'music.toggleLineLoop', 'music.mineLine']) {
      const command = COMMAND_CATALOG.find((c) => c.id === id);
      expect(command?.defaultKeys, id).toBe('');
      for (const lang of ['en', 'ja', 'zh', 'ru'] as const) {
        expect(CATALOGS[lang][`cmd.${id}`], `${lang} ${id}`).toBeTruthy();
        expect(CATALOGS[lang][`cmd.note.${id}`], `${lang} note ${id}`).toBeTruthy();
      }
    }
  });
});

describe('wiring (source guards)', () => {
  it('a local song is cut from the file before falling back to recording', () => {
    const source = read('renderer/components/music/useMusicMining.ts');
    expect(source.indexOf('extractAudioClip(')).toBeGreaterThan(0);
    expect(source.indexOf('extractAudioClip(')).toBeLessThan(source.indexOf('recordCueAudio(media'));
    expect(source).toContain('if (media && !draft.audioBase64)');
  });

  it('the Media Center draws the lyric lookup popup', () => {
    expect(read('renderer/views/MediaCenterView.tsx')).toContain('<MusicLookupPopup state={state} />');
    expect(read('renderer/components/music/MusicContent.tsx')).toMatch(/export function MusicLookupPopup/);
  });

  it('the coloured line is lazy, so no boot graph carries the tokenizer for it', () => {
    const pane = read('renderer/components/music/MusicContent.tsx');
    expect(pane).toContain("lazy(() => import('./MusicLyricText'))");
    expect(pane).not.toMatch(/^import .*SubtitleCueLine/m);
  });
});
