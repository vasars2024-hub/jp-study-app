// @vitest-environment jsdom
/**
 * a11y3 — axe-core (plus the house ARIA audit) over the video player's study
 * chrome: the subtitle overlay on its own (plain, highlighted, furigana), and the
 * whole `VideoCoreStudyOverlay` (cue overlay, study bar, docks, customizer)
 * driven by a stand-in subtitle manager, the way the adopted player feeds it.
 *
 * The adopted player's own canvas/video pipeline is not mountable in jsdom; its
 * three manager atoms and the video-element atom are replaced by plain jotai
 * atoms here, which is all the overlay reads from it.
 */
import { act, createElement, useRef } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDefaultStore, type PrimitiveAtom } from 'jotai';
import { a11yViolations } from './helpers/axeAudit';
import { cleanup, installJsdomShims, mount, settle, stubBridge } from './helpers/axeHarness';

// The atoms the overlay reads from the adopted player, captured as the mocks
// create them so a test can set them through the default store.
const player = vi.hoisted(() => ({
  subtitleManager: null as PrimitiveAtom<unknown> | null,
  videoElement: null as PrimitiveAtom<HTMLVideoElement | null> | null,
}));

vi.mock('@/app/(main)/_features/video-core/video-core', async () => {
  const { atom } = await import('jotai');
  player.subtitleManager = atom<unknown>(null);
  return {
    vc_subtitleManager: player.subtitleManager,
    vc_mediaCaptionsManager: atom<unknown>(null),
    vc_audioManager: atom<unknown>(null),
  };
});
vi.mock('@/app/(main)/_features/video-core/video-core-atoms', async () => {
  const { atom } = await import('jotai');
  player.videoElement = atom<HTMLVideoElement | null>(null);
  return { vc_paused: atom(true), vc_videoElement: player.videoElement };
});
vi.mock('../playerBus', () => ({
  next: vi.fn(),
  prev: vi.fn(),
  toggle: vi.fn(),
  setVolume: vi.fn(),
  getState: vi.fn(() => ({ volume: 1 })),
}));
vi.mock('../translator', () => ({ translateTo: async () => '' }));
// The kuromoji dictionary is fetched from the app's own origin; jsdom has none.
// Untokenized, the line renders as plain text, which is what is audited.
vi.mock('../tokenizer', async (importOriginal) => ({
  ...await importOriginal<typeof import('../tokenizer')>(),
  getTokenizer: () => new Promise(() => undefined),
  tokenizerReady: () => false,
  tokenizeSync: () => [],
  pretokenizeInIdle: () => () => undefined,
  lemmaOf: async (word: string) => word,
}));

interface Cue { index: number; trackNumber: number; text: string; startMs: number; endMs: number }

const CUES: Cue[] = [
  { index: 0, trackNumber: 1, text: '行ってきます。', startMs: 1_000, endMs: 3_000 },
  { index: 1, trackNumber: 1, text: 'この町が好き。', startMs: 4_000, endMs: 6_000 },
  { index: 2, trackNumber: 1, text: 'みんな優しいから。', startMs: 7_000, endMs: 9_000 },
];

/** The slice of the adopted subtitle manager the overlay calls. */
class FakeSubtitleManager extends EventTarget {
  active: Cue[] = [CUES[1]];
  getTracks() {
    return [{ type: 'event', number: 1, label: 'Japanese', language: 'jpn', languageIETF: 'ja', default: true, forced: false }];
  }
  getSelectedTrackNumberOrNull() { return 1; }
  getCues() { return CUES.map((c) => ({ ...c })); }
  getCuesForTrack() { return this.getCues(); }
  getActiveCues() { return this.active.map((c) => ({ ...c })); }
  getTrackContent() { return null; }
  libassRenderer = null;
  selectTrack() { return Promise.resolve(); }
  setNoTrack() { return undefined; }
  setSubtitleDelay() { return Promise.resolve(); }
  onSubtitleEvents() { return Promise.resolve(); }
  addEventTrack() { return Promise.resolve(); }
}

beforeAll(() => {
  installJsdomShims();
  // `media-captions` (the caption adapter's parser) subclasses `window.VTTCue` at
  // import time; jsdom has no text-track cues.
  const w = window as unknown as { VTTCue?: unknown };
  w.VTTCue ??= class {
    constructor(public startTime: number, public endTime: number, public text: string) {}
  };
});

beforeEach(() => {
  localStorage.clear();
  stubBridge({
    sentenceGetPrefs: {},
    onSentencePrefsChanged: () => () => undefined,
    ankiStatus: { connected: false, decks: [], models: [] },
    listMedia: [],
    mediaList: [],
  });
});

afterEach(async () => {
  await cleanup();
  const store = getDefaultStore();
  if (player.subtitleManager) store.set(player.subtitleManager, null);
  if (player.videoElement) store.set(player.videoElement, null);
  localStorage.clear();
});

/** The overlay inside the slice and workspace provider it is mounted into in the app. */
async function overlayHarness(): Promise<HTMLElement> {
  const { default: StudyWorkspaceProvider } = await import('../../media/StudyWorkspaceProvider');
  const { default: VideoCoreStudyOverlay } = await import('../../media/VideoCoreStudyOverlay');
  // Importing the overlay ran both mock factories, so the atoms exist now.
  if (!player.subtitleManager || !player.videoElement) throw new Error('player atoms were not created');
  const video = document.createElement('video');
  Object.defineProperty(video, 'duration', { value: 600, configurable: true });
  video.currentTime = 4.5;
  const store = getDefaultStore();
  store.set(player.videoElement, video);
  store.set(player.subtitleManager, new FakeSubtitleManager());

  function Harness() {
    const hostRef = useRef<HTMLDivElement | null>(null);
    return (
      <div ref={hostRef} className="study-player-slice">
        <StudyWorkspaceProvider hostRef={hostRef}>
          <VideoCoreStudyOverlay playbackInfo={null} localFilePath="C:\\Anime\\Shirobako - 03.mkv" />
        </StudyWorkspaceProvider>
      </div>
    );
  }
  const { host } = await mount(createElement(Harness), 80);
  await settle(80);
  return host;
}

describe('Video subtitle overlay — axe-core', () => {
  it('a plain cue line, a highlighted one with a selected span, and furigana', async () => {
    const { default: SubtitleCueLine } = await import('../components/SubtitleCueLine');
    const { alignAnnotations } = await import('../../shared/sentenceAnalysisCore');
    const sentence = 'この町が好き。';
    const annotations = alignAnnotations(sentence, [
      { text: 'この', category: 'grammar', meaning: 'this', explanation: '', examples: [], vocabulary: [] },
      { text: '町', category: 'vocabulary', meaning: 'town', explanation: '', examples: [], vocabulary: [] },
      { text: 'が', category: 'particle', meaning: 'subject marker', explanation: '', examples: [], vocabulary: [] },
      { text: '好き', category: 'expression', meaning: 'to like', explanation: '', examples: [], vocabulary: [] },
    ]);
    const { host } = await mount(
      <div className="study-player-slice">
        <aside className="study-cue-overlay" lang="ja">
          <SubtitleCueLine className="study-cue-text sa-palette" text={sentence} furigana={false} lang="ja" />
        </aside>
        <aside className="study-cue-overlay" lang="ja">
          <SubtitleCueLine
            className="study-cue-text sa-palette"
            text={sentence}
            furigana={false}
            lang="ja"
            annotations={annotations}
            selectedAnnotation={1}
            onSelectAnnotation={() => undefined}
          />
        </aside>
        <aside className="study-cue-overlay" lang="ja">
          <SubtitleCueLine className="study-cue-text" text={sentence} furigana lang="ja" />
        </aside>
      </div>,
      60,
    );
    expect(host.textContent, 'cue text painted').toContain('好き');
    expect(await a11yViolations(host)).toEqual([]);
  });

  it('the grammar card beside the line: idle, loading, failed, and an analysis (online and offline)', async () => {
    const { default: VideoCoreGrammarPanel } = await import('../../media/VideoCoreGrammarPanel');
    const { alignAnnotations } = await import('../../shared/sentenceAnalysisCore');
    const sentence = 'この町が好き。';
    const result = {
      sentence,
      translations: { en: 'I like this town.' },
      literal: 'this town SUBJ likeable',
      formality: { level: 'Casual', note: 'Plain form.' },
      difficulty: 'N5',
      structure: 'Subject marked by が; 好き is the predicate.',
      annotations: alignAnnotations(sentence, [
        { text: '町', category: 'vocabulary', meaning: 'town', explanation: 'Noun.', examples: [], vocabulary: [] },
        { text: 'が', category: 'particle', meaning: 'subject marker', explanation: 'Marks 町.', examples: [], vocabulary: [] },
      ]),
      nuance: ['Settled affection.'],
      pitfalls: ['好き takes が, not を.'],
    };
    const noop = (): undefined => undefined;
    const states = [
      { kind: 'idle' },
      { kind: 'loading' },
      { kind: 'error', message: 'Network down', needsKey: false, needsLocalModel: false },
      { kind: 'error', message: '', needsKey: true, needsLocalModel: false },
      { kind: 'ready', result },
      { kind: 'ready', result, offline: { ai: 'idle' } },
    ] as const;
    const { host } = await mount(
      <div className="study-player-slice">
        {states.map((state, i) => (
          <VideoCoreGrammarPanel
            key={i}
            state={state as never}
            lang="ja"
            selectedIndex={1}
            onSelectedIndexChange={noop}
            onLookup={noop}
            onAnalyzeNow={noop}
          />
        ))}
      </div>,
      60,
    );
    expect(host.querySelectorAll('.study-grammar-panel').length).toBe(states.length);
    expect(host.textContent, 'analysis painted').toContain('I like this town.');
    expect(await a11yViolations(host)).toEqual([]);
  });

  it('the whole study overlay, with a line on screen', async () => {
    const host = await overlayHarness();
    const overlay = host.querySelector('.study-cue-overlay');
    expect(overlay, 'cue overlay painted').not.toBeNull();
    expect(overlay?.getAttribute('data-study-active-cue')).toBe('present');
    expect(overlay?.textContent, 'line painted').toContain('好き');
    expect(host.querySelector('[data-study-sheet-toggle]'), 'study bar painted').not.toBeNull();
    expect(await a11yViolations(host)).toEqual([]);
  });

  it('every workspace layout (the docks: transcript, grammar, mining, practice, AI)', async () => {
    const host = await overlayHarness();
    const SWITCH = 'select[data-study-action="switch-workspace"]';
    const select = host.querySelector<HTMLSelectElement>(SWITCH);
    if (!select) throw new Error('layout switch missing');
    const layouts = [...select.options].map((o) => o.value);
    expect(layouts.length).toBeGreaterThanOrEqual(3);
    const blocksSeen = new Set<string>();
    for (const layout of layouts) {
      await act(async () => {
        const el = host.querySelector<HTMLSelectElement>(SWITCH);
        if (!el) throw new Error('layout switch went away');
        Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set?.call(el, layout);
        el.dispatchEvent(new Event('change', { bubbles: true }));
      });
      await settle(40);
      for (const block of host.querySelectorAll<HTMLElement>('.study-block')) {
        if (!block.hidden && block.textContent?.trim()) blocksSeen.add(block.dataset.block ?? '');
      }
      expect(await a11yViolations(host), `layout ${layout}`).toEqual([]);
    }
    // Watch and Immersion keep the picture clear; the others dock real panels.
    expect([...blocksSeen].length, `docked blocks painted: ${[...blocksSeen].join(', ')}`).toBeGreaterThanOrEqual(3);
  });

  it('the study overlay with every study-bar sheet opened in turn', async () => {
    const host = await overlayHarness();
    const toggles = [...host.querySelectorAll<HTMLButtonElement>('[data-study-sheet-toggle]')]
      .map((b) => b.getAttribute('data-study-sheet-toggle') as string);
    expect(toggles.length).toBeGreaterThanOrEqual(3);
    for (const name of toggles) {
      const toggle = host.querySelector<HTMLButtonElement>(`[data-study-sheet-toggle="${name}"]`);
      await act(async () => toggle?.click());
      await settle(10);
      expect(host.querySelector(`#study-sheet-${name}`), `sheet ${name} open`).not.toBeNull();
      expect(await a11yViolations(host), `sheet ${name}`).toEqual([]);
      await act(async () => toggle?.click());
    }
  });
});
