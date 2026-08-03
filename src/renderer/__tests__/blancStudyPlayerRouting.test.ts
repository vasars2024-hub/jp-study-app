// @vitest-environment jsdom
/**
 * Blanc's Player fieldset routes to the adopted surface — Phase 6 slices 15 and 16.
 *
 * The defect this closes, measured before the fix: `BlancMediaPanels.tsx:106` rendered
 * `MediaPlayerStage` whenever a source was loaded, with **no sidecar gate of any kind** —
 * no `seanimeStatus` call, no `useMediaWorkspaceAvailability`. Old-player retirement swept
 * the desktop sections and Media Center's nav and then recorded that the legacy player was
 * "unreachable in normal use"; Blanc's toolbox was a third shell nobody enumerated, so the
 * claim was false for a day. Open the toolbox, load a file, get the old player.
 *
 * Driven against the REAL `useMediaWorkspaceAvailability` through a stubbed `window.api`,
 * not a mocked hook. The whole question is whether Blanc consults the shared rule at all,
 * and mocking that rule would answer it by construction. Only the adopted surface itself is
 * mocked, because resolving it would pull the 46-package `@/` tree into a node test run.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, relative } from 'node:path';

const surfaceProps: { conn: unknown; playbackRequest: unknown; className?: string }[] = [];

vi.mock('../../media/MediaPlayerSurface', () => ({
  default: (props: { conn: unknown; playbackRequest: unknown; className?: string }) => {
    surfaceProps.push(props);
    return createElement('div', { 'data-testid': 'adopted-player' });
  },
}));

let statusKind = 'ready';
let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  surfaceProps.length = 0;
  statusKind = 'ready';
  container = document.createElement('div');
  document.body.appendChild(container);
  Object.defineProperty(window, 'api', {
    value: new Proxy({}, {
      get: (_target, prop) => {
        if (typeof prop === 'string' && prop.startsWith('on')) return () => () => undefined;
        if (prop === 'seanimeStatus') {
          return () => Promise.resolve({ kind: statusKind, pid: 1, port: 1234 });
        }
        if (prop === 'seanimeConnection') {
          return () => Promise.resolve({ baseUrl: 'http://127.0.0.1:43110', token: 'tok' });
        }
        return () => Promise.resolve(null);
      },
    }),
    configurable: true,
    writable: true,
  });
});

afterEach(() => {
  act(() => root?.unmount());
  container.remove();
  document.body.innerHTML = '';
});

const ITEM = {
  id: 'item-1',
  title: 'Frieren 01',
  path: 'C:/media/frieren-01.mkv',
  fileName: 'frieren-01.mkv',
  addedAt: 0,
  positionSec: 412,
};

async function render(): Promise<void> {
  const { default: BlancStudyPlayer } = await import('../components/blanc/BlancStudyPlayer');
  root = createRoot(container);
  await act(async () => {
    root.render(createElement(BlancStudyPlayer, { item: ITEM }));
  });
  // Let the availability IPC and the connection bootstrap settle.
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
}

describe('Blanc routes to the adopted player', () => {
  it('renders the adopted surface when the sidecar is ready', async () => {
    // This used to also assert the absence of a `legacy-stage` marker. Slice 16 deleted the
    // component that rendered it, so nothing can produce that marker any more and the
    // assertion became one that cannot fail — removed rather than left as decoration.
    // What replaces it is the repository sweep at the bottom of this file.
    await render();

    expect(container.querySelector('[data-testid="adopted-player"]')).not.toBeNull();
  });

  it('hands the surface the item path and its resume position', async () => {
    await render();

    expect(surfaceProps.at(-1)?.playbackRequest).toMatchObject({
      kind: 'local',
      localFilePath: 'C:/media/frieren-01.mkv',
      startAtSec: 412,
    });
  });

  it('passes the bounded Blanc frame class', async () => {
    // Blanc's toolbox is 560x460 by default; the adopted dock was laid out full-screen.
    await render();
    expect(surfaceProps.at(-1)?.className).toBe('blanc-study-player');
  });

  it('gives the request a stable id so a re-render does not restart playback', async () => {
    await render();
    const first = (surfaceProps.at(-1)?.playbackRequest as { requestId: number }).requestId;

    const { default: BlancStudyPlayer } = await import('../components/blanc/BlancStudyPlayer');
    await act(async () => {
      root.render(createElement(BlancStudyPlayer, { item: { ...ITEM } }));
    });

    expect((surfaceProps.at(-1)?.playbackRequest as { requestId: number }).requestId)
      .toBe(first);
  });
});

describe('the SEANIME_SIDECAR=0 rollback says what it lost', () => {
  it('states that playback needs the media server, rather than rendering nothing', async () => {
    // Slice 16 deleted `MediaPlayerStage` on an explicit user decision, so there is no
    // fallback player left. An empty fieldset would read as a broken panel; the cost of
    // the deletion has to be VISIBLE, which is the whole difference between a documented
    // trade-off and a regression.
    statusKind = 'disabled';
    await render();

    expect(container.querySelector('[data-testid="adopted-player"]')).toBeNull();
    expect(container.textContent ?? '').not.toBe('');
    expect(container.querySelector('.blanc-status-row')).not.toBeNull();
  });

  it('renders nothing at all while the status is still pending', async () => {
    // A message during the round trip would be a claim the app cannot yet support, and on
    // a fast resolve that flash is all some users would ever see.
    const { default: BlancStudyPlayer } = await import('../components/blanc/BlancStudyPlayer');
    root = createRoot(container);
    act(() => {
      root.render(createElement(BlancStudyPlayer, { item: ITEM }));
    });

    expect(container.textContent).toBe('');
    expect(container.querySelector('[data-testid="adopted-player"]')).toBeNull();
    await act(async () => { await Promise.resolve(); });
  });
});

describe('the real BlancMediaPanel puts the gate in front of the player', () => {
  /**
   * The tests above drive `BlancStudyPlayer` directly, so on their own they prove the gate
   * WORKS without proving Blanc USES it — reverting the panel wiring leaves them all green.
   * This renders the actual panel. `MediaContent` is mocked because `useMedia` reaches the
   * whole legacy media stack (watch folders, transcription, IPC); every export it needs is
   * stubbed to a marker so what the panel chose to render is unambiguous.
   */
  it('renders BlancStudyPlayer in the Player fieldset', async () => {
    vi.resetModules();
    const stubs: Record<string, unknown> = {
      useMedia: () => ({
        items: [ITEM],
        current: ITEM,
        cues: [],
        src: 'blob:x',
        subName: null,
        genState: 'idle',
        generating: false,
        displayedItems: [ITEM],
        hasFolders: false,
        searchActive: false,
        selectedFolder: null,
        setItems: () => undefined,
        clearPlayback: () => undefined,
        setSelectedFolder: () => undefined,
        openFile: () => Promise.resolve(),
        openFolder: () => Promise.resolve(),
        openSubs: () => Promise.resolve(),
        runGeneration: () => Promise.resolve(),
      }),
    };
    for (const name of [
      'MediaEmptyLibrary', 'MediaFolderNav', 'MediaGenerationStatus', 'MediaGrid',
      'MediaKindFilter', 'MediaLibraryActions', 'MediaLookupPopup', 'MediaSearchBox',
      'MediaTranscriptionControls', 'MediaWatchFolder', 'MediaYoutubeBar',
    ]) {
      stubs[name] = () => null;
    }
    vi.doMock('../components/media/MediaContent', () => stubs);
    vi.doMock('../components/flashcards/FlashcardsContent', () => ({
      useFlashcards: () => ({ mode: 'overview' }),
      FlashcardAiMode: () => null,
      FlashcardCsvMode: () => null,
      FlashcardDeckOverview: () => null,
      FlashcardMiningMode: () => null,
      FlashcardReviewMode: () => null,
    }));

    const { BlancMediaPanel } = await import('../components/blanc/BlancMediaPanels');
    root = createRoot(container);
    await act(async () => {
      root.render(createElement(BlancMediaPanel));
    });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    expect(container.querySelector('[data-testid="adopted-player"]')).not.toBeNull();
    vi.doUnmock('../components/media/MediaContent');
    vi.doUnmock('../components/flashcards/FlashcardsContent');
  });
});

describe('the panel wiring, so the gate cannot be bypassed', () => {
  const PANEL = resolve(__dirname, '../components/blanc/BlancMediaPanels.tsx');

  it('renders BlancStudyPlayer and reaches MediaPlayerStage nowhere', async () => {
    // Slice 15 allowed exactly one use — the `legacyStage` fallback prop. Slice 16 deleted
    // the component, so the correct count is now zero. This fails on BOTH pre-fix shapes:
    // the original ungated `<MediaPlayerStage state={state} />`, and slice 15's prop.
    const source = readFileSync(PANEL, 'utf8');

    expect([...source.matchAll(/<MediaPlayerStage\b/g)]).toHaveLength(0);
    expect(source).not.toContain('legacyStage');
    expect(source).toContain('<BlancStudyPlayer');
  });

  it('keeps BlancStudyPlayer free of any import edge into the legacy media stack', async () => {
    // Checked against the IMPORT statements, not the file text: the header comment
    // explains the routing and names `MediaContent.tsx` in prose, which a substring match
    // would flag.
    const source = readFileSync(
      resolve(__dirname, '../components/blanc/BlancStudyPlayer.tsx'),
      'utf8',
    );
    const specifiers = [...source.matchAll(/from\s*['"]([^'"]+)['"]/g)]
      .flatMap((m) => (m[1] ? [m[1]] : []));

    expect(specifiers.length).toBeGreaterThan(0);
    expect(specifiers.filter((s) => s.includes('MediaContent'))).toEqual([]);
    expect(specifiers.filter((s) => s.includes('components/media/'))).toEqual([]);
  });
});

describe('the legacy player is gone from the repository — slice 16', () => {
  const SRC = resolve(__dirname, '../..');

  it('MediaContent.tsx no longer defines or exports MediaPlayerStage', () => {
    // Comments stripped first — the same rule the sibling test below already states, and
    // for the same reason. Slice 19 removed the ten `video.*` shortcut registrations that
    // acted on the `videoRef` this deletion left unattached, and the comment standing where
    // they were has to name the component in order to explain itself. A blanket substring
    // search over raw source reads that explanation as a re-introduction. (Slice 12 lost a
    // round to exactly this, on a CSS value quoted in its own fix note.)
    const source = readFileSync(resolve(SRC, 'renderer/components/media/MediaContent.tsx'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n')
      .filter((line) => {
        const trimmed = line.trimStart();
        return !trimmed.startsWith('//') && !trimmed.startsWith('*');
      })
      .join('\n');

    expect(source).not.toContain('function MediaPlayerStage');
    expect(source).not.toContain('MediaPlayerStage');
  });

  it('nothing in src/ imports or renders it', () => {
    // A source sweep rather than a type check: tsc would catch a broken import, but not a
    // re-introduction of the component itself, which is the thing this slice removed.
    const offenders: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = resolve(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name !== 'node_modules') walk(full);
        } else if (/\.tsx?$/.test(entry.name) && !entry.name.endsWith('.test.ts')) {
          if (readFileSync(full, 'utf8').includes('MediaPlayerStage')) {
            offenders.push(relative(SRC, full).replace(/\\/g, '/'));
          }
        }
      }
    };
    walk(SRC);

    // Comments that narrate the deletion are allowed; a real reference is not. Both
    // remaining mentions are prose in files that explain why the component is gone.
    const real = offenders.filter((f) => {
      const text = readFileSync(resolve(SRC, f), 'utf8');
      return /<MediaPlayerStage|MediaPlayerStage,|MediaPlayerStage }|function MediaPlayerStage/
        .test(text);
    });
    expect(real).toEqual([]);
  });
});
