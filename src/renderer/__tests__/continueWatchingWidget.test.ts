// @vitest-environment jsdom
/**
 * Structure and behaviour proof for the Phase 6 slice 7 "Continue watching" widget.
 *
 * Two of these assertions exist because the alternative is a *silent* wrong answer rather
 * than a visible break: a progress bar rendered for a file whose duration nothing measured,
 * and a row rendered while the sidecar flag is off, where nothing in the app listens for the
 * event it raises and the click does nothing at all.
 *
 * A real `createRoot` render, not `renderToStaticMarkup`: every row this widget shows is
 * derived in effects (localStorage read, `listMedia` IPC, sidecar status), so under SSR it
 * never leaves its loading branch and every assertion below would pass vacuously — the exact
 * trap recorded for `videoCoreMiningPanelStructure.test.ts`.
 */
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MEDIA_WORKSPACE_OPEN_EVENT,
  STUDY_REVIEW_FOCUS_EVENT,
} from '../../shared/mediaWorkspace';
import { CONTINUE_WATCHING_REWIND_SEC } from '../../shared/seanimeContinueWatching';
import {
  createVideoCoreMiningDraft,
  createVideoCoreMiningHistoryEntry,
  VIDEO_CORE_MINING_HISTORY_KEY,
  type VideoCoreMiningSource,
} from '../../shared/videoCoreMining';
import {
  VIDEO_CORE_RESUME_STORAGE_KEY,
  type VideoCoreStudyCue,
} from '../../shared/videoCoreStudy';
import type { MediaItem } from '../../shared/types';

const CUE: VideoCoreStudyCue = {
  index: 0,
  trackNumber: 3,
  text: '猫が窓辺で寝ている。',
  startMs: 2148,
  endMs: 5148,
};

const SOURCE: VideoCoreMiningSource = {
  playbackId: 'harness-playback',
  playbackType: 'localfile',
  streamType: 'directstream',
  mediaTitle: 'Fixture media',
  localFilePath: 'C:/Media/Ep1.mkv',
};

const store = new Map<string, string>();
let host: HTMLDivElement | null = null;

function setResume(entries: Array<{ key: string; positionSec: number; updatedAt: number }>): void {
  store.set(VIDEO_CORE_RESUME_STORAGE_KEY, JSON.stringify(entries));
}

/** Built through the production factory: a hand-written literal is silently dropped. */
function setMinedOnce(): void {
  const draft = { ...createVideoCoreMiningDraft(CUE, CUE.text, SOURCE), term: '窓辺' };
  const entry = createVideoCoreMiningHistoryEntry(draft, {
    ok: true,
    noteId: 1785396692600,
    deckName: 'StudyOS::_Probe',
  });
  store.set(VIDEO_CORE_MINING_HISTORY_KEY, JSON.stringify([entry]));
}

beforeEach(() => {
  store.clear();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
    clear: () => store.clear(),
    key: () => null,
    length: 0,
  });
});

afterEach(() => {
  host?.remove();
  host = null;
  vi.unstubAllGlobals();
});

interface RenderOptions {
  sidecar?: string;
  mediaItems?: MediaItem[];
  size?: { w: number; h: number };
}

async function render(options: RenderOptions = {}): Promise<HTMLDivElement> {
  const api = {
    listMedia: () => Promise.resolve(options.mediaItems ?? []),
    seanimeStatus: () => Promise.resolve({ kind: options.sidecar ?? 'ready' }),
    onSeanimeStatus: () => () => undefined,
  };
  Object.defineProperty(window, 'api', { value: api, configurable: true, writable: true });

  const { ContinueWatchingWidget } = await import('../widgets/continueWatching');
  host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(createElement(ContinueWatchingWidget, {
      settings: {},
      setSettings: () => undefined,
      size: options.size ?? { w: 320, h: 190 },
    }));
  });
  return host;
}

describe('ContinueWatchingWidget', () => {
  it('says the media server is off instead of rendering rows nothing listens to', async () => {
    setResume([{ key: 'file:c:/media/ep1.mkv', positionSec: 620, updatedAt: 5000 }]);
    const el = await render({ sidecar: 'disabled' });
    expect(el.textContent).toContain('media server is off');
    // Structural, not textual: the row is what would silently do nothing.
    expect(el.querySelectorAll('.wgt-cw-row')).toHaveLength(0);
  });

  it('renders a row per resumable file with its position', async () => {
    setResume([{ key: 'file:c:/media/ep1.mkv', positionSec: 620, updatedAt: 5000 }]);
    const el = await render();
    expect(el.querySelectorAll('.wgt-cw-row')).toHaveLength(1);
    expect(el.querySelector('.wgt-cw-title')?.textContent).toBe('ep1.mkv');
    expect(el.querySelector('.wgt-cw-meta')?.textContent).toContain('10:20');
  });

  it('prefers the media library title and its original-cased path', async () => {
    setResume([{ key: 'file:c:/media/ep1.mkv', positionSec: 620, updatedAt: 5000 }]);
    const el = await render({
      mediaItems: [{
        id: '1',
        title: 'The Big O',
        path: 'C:/Media/Ep1.mkv',
        fileName: 'Ep1.mkv',
        addedAt: 0,
      } as MediaItem],
    });
    expect(el.querySelector('.wgt-cw-title')?.textContent).toBe('The Big O');
    expect(el.querySelector('.wgt-cw-row')?.getAttribute('title')).toBe('C:/Media/Ep1.mkv');
  });

  it('renders a progress bar only for a file whose duration was measured', async () => {
    setResume([{ key: 'file:c:/media/ep1.mkv', positionSec: 300, updatedAt: 5000 }]);
    const withoutDuration = await render();
    expect(withoutDuration.querySelectorAll('.wgt-cw-bar')).toHaveLength(0);

    host?.remove();
    host = null;
    const withDuration = await render({
      mediaItems: [{
        id: '1',
        title: 'The Big O',
        path: 'C:/Media/Ep1.mkv',
        fileName: 'Ep1.mkv',
        addedAt: 0,
        durationSec: 1200,
      } as MediaItem],
    });
    const fill = withDuration.querySelector<HTMLElement>('.wgt-cw-bar-fill');
    expect(fill).not.toBeNull();
    expect(fill?.style.width).toBe('25%');
  });

  it('resumes through the workspace event with an explicit rewound destination', async () => {
    setResume([{ key: 'file:c:/media/ep1.mkv', positionSec: 620, updatedAt: 5000 }]);
    const el = await render();
    const seen: Array<{ localFilePath?: string; startAtSec?: number }> = [];
    const listener = (event: Event): void => {
      seen.push((event as CustomEvent).detail);
    };
    window.addEventListener(MEDIA_WORKSPACE_OPEN_EVENT, listener);
    await act(async () => {
      el.querySelector<HTMLButtonElement>('.wgt-cw-row')?.click();
    });
    window.removeEventListener(MEDIA_WORKSPACE_OPEN_EVENT, listener);

    expect(seen).toHaveLength(1);
    expect(seen[0]?.localFilePath).toBe('c:/media/ep1.mkv');
    // Explicit, so it outranks the stored resume rather than depending on it.
    expect(seen[0]?.startAtSec).toBe(620 - CONTINUE_WATCHING_REWIND_SEC);
  });

  it('offers the card handoff only for a file that produced cards', async () => {
    setResume([{ key: 'file:c:/media/ep1.mkv', positionSec: 620, updatedAt: 5000 }]);
    const bare = await render();
    expect(bare.querySelectorAll('.wgt-cw-cards')).toHaveLength(0);

    host?.remove();
    host = null;
    setMinedOnce();
    const mined = await render();
    expect(mined.querySelectorAll('.wgt-cw-cards')).toHaveLength(1);
    expect(mined.querySelector('.wgt-cw-meta')?.textContent).toContain('1 card');
  });

  it('hands off to Review by join key, never by raw path', async () => {
    setResume([{ key: 'file:c:/media/ep1.mkv', positionSec: 620, updatedAt: 5000 }]);
    setMinedOnce();
    const el = await render();
    const seen: Array<{ pathKey?: string; title?: string }> = [];
    const listener = (event: Event): void => {
      seen.push((event as CustomEvent).detail);
    };
    window.addEventListener(STUDY_REVIEW_FOCUS_EVENT, listener);
    await act(async () => {
      el.querySelector<HTMLButtonElement>('.wgt-cw-cards')?.click();
    });
    window.removeEventListener(STUDY_REVIEW_FOCUS_EVENT, listener);

    expect(seen).toHaveLength(1);
    expect(seen[0]?.pathKey).toBe('c:/media/ep1.mkv');
    expect(seen[0]?.title).toBe('Fixture media');
  });

  it('fits the list to the frame and states what it left out', async () => {
    setResume([
      { key: 'file:c:/media/a.mkv', positionSec: 620, updatedAt: 1000 },
      { key: 'file:c:/media/b.mkv', positionSec: 620, updatedAt: 2000 },
      { key: 'file:c:/media/c.mkv', positionSec: 620, updatedAt: 3000 },
    ]);
    // 180 - 20 padding - 21 for the truncation line = 139: two 55px rows and their gap.
    const el = await render({ size: { w: 320, h: 180 } });
    expect(el.querySelectorAll('.wgt-cw-row')).toHaveLength(2);
    // A silent truncation reads as "that is all of them".
    expect(el.querySelector('.wgt-cw-more')?.textContent).toContain('1');
  });

  it('does not reserve the truncation line when nothing is truncated', async () => {
    // 197 - 20 = 177, exactly three rows and two gaps. The naive fix for the clipping this
    // widget's first cut had — always reserving the line — would drop one of them here.
    setResume([
      { key: 'file:c:/media/a.mkv', positionSec: 620, updatedAt: 1000 },
      { key: 'file:c:/media/b.mkv', positionSec: 620, updatedAt: 2000 },
      { key: 'file:c:/media/c.mkv', positionSec: 620, updatedAt: 3000 },
    ]);
    const el = await render({ size: { w: 320, h: 197 } });
    expect(el.querySelectorAll('.wgt-cw-row')).toHaveLength(3);
    expect(el.querySelector('.wgt-cw-more')).toBeNull();
  });

  it('still shows one row at the smallest frame it can be resized to', async () => {
    setResume([{ key: 'file:c:/media/a.mkv', positionSec: 620, updatedAt: 1000 }]);
    // minSize.h is 130, so WidgetFrame passes 100. A floor of 1 keeps the widget useful
    // rather than empty however far the user shrinks the frame.
    const el = await render({ size: { w: 240, h: 40 } });
    expect(el.querySelectorAll('.wgt-cw-row')).toHaveLength(1);
  });

  it('shows its own empty state when nothing has been started', async () => {
    const el = await render();
    expect(el.querySelectorAll('.wgt-cw-row')).toHaveLength(0);
    expect(el.textContent).toContain('Nothing to continue');
  });

  it('survives a corrupt resume store instead of crashing the desktop', async () => {
    store.set(VIDEO_CORE_RESUME_STORAGE_KEY, '{not json');
    const el = await render();
    expect(el.textContent).toContain('Nothing to continue');
  });
});
