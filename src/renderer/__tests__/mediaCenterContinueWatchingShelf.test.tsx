// @vitest-environment jsdom
/**
 * Media Center Home — "Continue watching" shows what the user actually watched.
 *
 * The defect: after three episodes in the media workspace the shelf said "Nothing in
 * progress yet". The shelf read `MediaItem.positionSec` only, which just the retired
 * inline player wrote; the workspace records positions in `jp-video-core-resume-v1`,
 * keyed `file:<lower-cased path>`. The fix reuses `readContinueWatching`, the join the
 * widget and the palette already share, so this pins the case that failed: library items
 * with NO position of their own and three workspace positions for the same files.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { setMediaWorkspaceOpen } from '../../shared/mediaWorkspace';
import { CONTINUE_WATCHING_REWIND_SEC } from '../../shared/seanimeContinueWatching';
import type { MediaItem } from '../../shared/types';
import { VIDEO_CORE_RESUME_STORAGE_KEY } from '../../shared/videoCoreStudy';
import {
  ContinueWatchingTile,
  continueWatchingOpenRequest,
  continueWatchingRows,
  useContinueWatchingRows,
  type ContinueWatchingRow,
} from '../components/media/ContinueWatchingShelf';

const DIR = 'C:\\Anime\\Frieren';

function episode(n: number, patch: Partial<MediaItem> = {}): MediaItem {
  const file = `Sousou no Frieren - 0${n}.mkv`;
  return {
    id: `ep-${n}`,
    title: `Frieren ${n}`,
    path: `${DIR}\\${file}`,
    fileName: file,
    addedAt: 1,
    episode: n,
    kind: 'video',
    ...patch,
  } as MediaItem;
}

/** What `StudyPlayerSlice` writes: the lower-cased, forward-slashed path, no duration. */
function position(n: number, positionSec: number, updatedAt: number) {
  return {
    key: `file:c:/anime/frieren/sousou no frieren - 0${n}.mkv`,
    positionSec,
    updatedAt,
  };
}

function store(entries: ReturnType<typeof position>[]): void {
  localStorage.setItem(VIDEO_CORE_RESUME_STORAGE_KEY, JSON.stringify(entries));
}

/** The single row a case set up — failing loudly if the join produced anything else. */
function onlyRow(rows: ContinueWatchingRow[]): ContinueWatchingRow {
  expect(rows).toHaveLength(1);
  const [row] = rows;
  if (!row) throw new Error('no continue-watching row');
  return row;
}

let host: HTMLDivElement | null = null;
let root: Root | null = null;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
  localStorage.clear();
});

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = null;
  host?.remove();
  host = null;
  setMediaWorkspaceOpen(false);
});

async function mount(node: ReturnType<typeof createElement>): Promise<HTMLDivElement> {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => { root?.render(node); });
  return host;
}

describe('continueWatchingRows', () => {
  it('lists workspace positions for library items that have none of their own', () => {
    // The reported state: three episodes watched, the library items untouched.
    store([position(1, 1300, 1000), position(2, 742, 3000), position(3, 400, 2000)]);
    const rows = continueWatchingRows([episode(1), episode(2), episode(3)]);
    // Most recent first — episode 2 was the last write.
    expect(rows.map((row) => row.entry.title)).toEqual(['Frieren 2', 'Frieren 3', 'Frieren 1']);
    // Bridged to the library item despite the key's lower-casing and slashes.
    expect(rows.map((row) => row.item?.id)).toEqual(['ep-2', 'ep-3', 'ep-1']);
    expect(rows[0]?.entry.positionSec).toBe(742);
  });

  it('leaves out a file stopped near its end once a duration is known', () => {
    store([position(1, 1410, 2000), position(2, 742, 1000)]);
    const rows = continueWatchingRows([
      episode(1, { durationSec: 1420 }),
      episode(2, { durationSec: 1420 }),
    ]);
    expect(rows.map((row) => row.entry.title)).toEqual(['Frieren 2']);
    expect(rows[0]?.entry.percent).toBeCloseTo(742 / 1420, 5);
  });

  it('keeps a file the workspace played but Study OS never imported', () => {
    store([position(4, 600, 1000)]);
    const rows = continueWatchingRows([]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.item).toBeUndefined();
    expect(rows[0]?.entry.title).toBe('sousou no frieren - 04.mkv');
  });

  it('resumes with the same rewound request the widget and palette dispatch', () => {
    store([position(2, 742, 3000)]);
    const row = onlyRow(continueWatchingRows([episode(2)]));
    expect(continueWatchingOpenRequest(row.entry)).toEqual({
      localFilePath: `${DIR}\\Sousou no Frieren - 02.mkv`,
      startAtSec: 742 - CONTINUE_WATCHING_REWIND_SEC,
    });
  });
});

describe('useContinueWatchingRows', () => {
  let latest: ContinueWatchingRow[] = [];
  const items = [episode(1), episode(2)];
  function Probe() {
    latest = useContinueWatchingRows(items);
    return null;
  }

  it('re-reads the store when the workspace overlay closes', async () => {
    store([position(1, 300, 1000)]);
    await mount(createElement(Probe));
    expect(latest).toHaveLength(1);
    // The player writes while the overlay covers this view; closing it is the refresh.
    store([position(1, 300, 1000), position(2, 500, 2000)]);
    await act(async () => { setMediaWorkspaceOpen(true); });
    await act(async () => { setMediaWorkspaceOpen(false); });
    expect(latest.map((row) => row.entry.title)).toEqual(['Frieren 2', 'Frieren 1']);
  });
});

describe('ContinueWatchingTile', () => {
  it('shows the title, the resume time and a measured progress bar', async () => {
    store([position(2, 742, 3000)]);
    const row = onlyRow(continueWatchingRows([episode(2, { durationSec: 1420 })]));
    const el = await mount(createElement(ContinueWatchingTile, { row, onResume: () => undefined }));
    expect(el.querySelector('.mc-tile-copy strong')?.textContent).toBe('Frieren 2');
    expect(el.querySelector('.mc-tile-copy small')?.textContent).toBe('Resume at 12:22 · 52%');
    expect(el.querySelector('.mc-tile-episode')?.textContent).toBe('E02');
    expect(el.querySelector<HTMLElement>('.mc-tile-progress i')?.style.width).toBe('52%');
    expect(el.querySelector('button')?.getAttribute('aria-label')).toBe('Resume Frieren 2 at 12:22');
  });

  it('states the time and draws no bar when no duration was measured', async () => {
    store([position(4, 600, 1000)]);
    const row = onlyRow(continueWatchingRows([]));
    const el = await mount(createElement(ContinueWatchingTile, { row, onResume: () => undefined }));
    expect(el.querySelector('.mc-tile-copy small')?.textContent).toBe('Resume at 10:00');
    expect(el.querySelector('.mc-tile-progress')).toBeNull();
  });

  it('hands its row to onResume', async () => {
    store([position(2, 742, 3000)]);
    const row = onlyRow(continueWatchingRows([episode(2)]));
    const seen: ContinueWatchingRow[] = [];
    const el = await mount(createElement(ContinueWatchingTile, {
      row,
      onResume: (picked: ContinueWatchingRow) => { seen.push(picked); },
    }));
    await act(async () => { el.querySelector('button')?.click(); });
    expect(seen).toEqual([row]);
  });
});

/**
 * `MediaCenterView` pulls the whole media stack at module eval, so the wiring is pinned
 * from source: the shelf reads the shared rows, and resumes through the view's own
 * workspace open path rather than the legacy `playItem`.
 */
describe('HomePanel wiring', () => {
  const view = readFileSync(resolve(__dirname, '../views/MediaCenterView.tsx'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

  it('builds the shelf from both resume stores', () => {
    expect(view).toContain('const continueRows = useContinueWatchingRows(state.items);');
    // The old single-store filter must be gone, not merely unused.
    expect(view).not.toMatch(/\.filter\(\(item\) => \(item\.positionSec \?\? 0\) > 0\)/);
  });

  it('resumes video through onOpenSeanime with the rewound request', () => {
    expect(view).toContain('if (onOpenSeanime(continueWatchingOpenRequest(entry))) return;');
    expect(view).toMatch(/<HomePanel[\s\S]*?onOpenSeanime=\{openSeanime\}[\s\S]*?workspace=\{workspace\}/);
  });
});
