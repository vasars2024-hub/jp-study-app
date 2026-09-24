// @vitest-environment jsdom
/**
 * The renderer half of the Visual Novel reading loop: the tabbed workspace
 * (reading first, state that survives a close), VNDB art painted from the local
 * cache, the reader window's lines and one-click mining, sentence translation
 * into the learner's own language, and finished sessions reaching the shared
 * study statistics.
 *
 * `window.api` is installed before any component is imported, following
 * `visualNovelRemoveReports.test.tsx`: this import graph touches `window.api`
 * at module-eval time.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { normalizeVisualNovelDatabase, type VisualNovelDatabase } from '../../shared/visualNovel';

const seed: VisualNovelDatabase = normalizeVisualNovelDatabase({
  version: 1,
  entries: [{
    id: 'vn-1',
    title: 'Steins;Gate',
    japaneseTitle: 'シュタインズ・ゲート',
    engine: 'kirikiri',
    executablePath: 'C:/Games/SG/sg.exe',
    coverImageUrl: 'https://t.vndb.org/cv/40/35040.jpg',
    tags: ['Science Fiction', 'Time Travel'],
    estimatedPlaytimeHours: 40,
    status: 'reading',
    createdAt: 1,
    updatedAt: 2,
  }],
  captures: Array.from({ length: 8 }, (_, index) => ({
    id: `c${index}`,
    visualNovelId: 'vn-1',
    kind: 'dialogue',
    japanese: `${index}番目の台詞です。`,
    speaker: index % 2 ? '紅莉栖' : '岡部',
    source: 'clipboard',
    capturedAt: 1_700_000_000_000 + index,
  })),
});

const calls = {
  art: [] as string[],
  translate: [] as Array<{ target: string }>,
  drained: 0,
};

function installApiStub(): void {
  const api: Record<string, unknown> = {
    visualNovelList: async () => seed,
    // The panel's import graph reaches the music player's bus, which applies a snapshot at load.
    playerGetSnapshot: async () => null,
    playerWindowId: async () => 1,
    visualNovelHookState: async () => null,
    visualNovelSessionState: async () => ({ visualNovelId: 'vn-1', startedAt: null, tracking: null }),
    visualNovelCaptureState: async () => ({
      visualNovelId: 'vn-1', active: true, test: false, clipboard: 'listening', websocket: 'off',
      websocketUrl: 'ws://localhost:6677', lines: 3, lastLine: null, lastError: '', startedAt: 1,
    }),
    visualNovelReaderTarget: async () => 'vn-1',
    visualNovelArt: async (url: string) => {
      calls.art.push(url);
      return { ok: true, url: 'media://vn-art/abc.jpg' };
    },
    translateRun: async (request: { target: string }) => {
      calls.translate.push({ target: request.target });
      return { ok: true, text: 'translated' };
    },
    visualNovelUpdateCapture: async () => ({ ok: true, database: seed }),
    visualNovelReadCaptureImage: async () => ({ ok: false }),
    visualNovelDrainStudyTime: async () => {
      calls.drained += 1;
      return calls.drained === 1
        ? [{ visualNovelId: 'vn-1', title: 'Steins;Gate', seconds: 1_800, chars: 420, endedAt: 1 }]
        : [];
    },
  };
  (window as unknown as { api: unknown }).api = new Proxy(api, {
    get: (target, prop: string | symbol) => {
      if (prop === 'then') return undefined;
      if (typeof prop === 'string' && prop in target) return target[prop];
      if (typeof prop === 'string' && prop.startsWith('on')) return () => (): undefined => undefined;
      return async (): Promise<unknown> => ({ ok: false });
    },
  });
}

let root: Root | null = null;
let host: HTMLDivElement;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  installApiStub();
});

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  root?.unmount();
  root = null;
  document.body.replaceChildren();
});

async function render(element: JSX.Element): Promise<void> {
  host = document.createElement('div');
  document.body.append(host);
  const mounted = createRoot(host);
  root = mounted;
  await act(async () => { mounted.render(element); });
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
}

describe('the tabbed Visual Novels workspace', () => {
  it('opens on the reading tab, with the other sections one click away rather than ten disclosures down', async () => {
    const { default: Panel } = await import('../components/immersion/VisualNovelPanel');
    await render(<Panel standalone />);
    const tabs = [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
    expect(tabs.map((tab) => tab.textContent)).toEqual(['Read', 'Study', 'Routes', 'Details', 'Capture setup']);
    expect(tabs[0].getAttribute('aria-selected')).toBe('true');
    const panel = (id: string) => host.querySelector<HTMLElement>(`#vn-tabpanel-${id}`)!;
    expect(panel('read').hidden).toBe(false);
    expect(panel('details').hidden).toBe(true);
    // The captured lines are in the reading tab, not below the fold of one long column.
    expect(panel('read').querySelector('.visual-novel-reading-overlay')).not.toBeNull();
    expect(panel('read').querySelector('.vn-capture-bar')).not.toBeNull();

    await act(async () => { tabs[3].click(); });
    expect(panel('details').hidden).toBe(false);
    expect(panel('read').hidden).toBe(true);
    // Persisted, so reopening the app lands where the user left it.
    expect(JSON.parse(localStorage.getItem('vn-panel-state') ?? '{}')).toMatchObject({ tab: 'details', selectedId: 'vn-1' });
  });

  it('restores the last tab on the next open, and as an app it draws no in-window title or back button', async () => {
    localStorage.setItem('vn-panel-state', JSON.stringify({ selectedId: 'vn-1', tab: 'routes' }));
    const { default: Panel } = await import('../components/immersion/VisualNovelPanel');
    await render(<Panel standalone />);
    expect(host.querySelector('#vn-tab-routes')?.getAttribute('aria-selected')).toBe('true');
    expect(host.querySelector('.visual-novel-panel-head .media-study-mode-kicker')).toBeNull();
    expect(host.querySelectorAll('.visual-novel-panel-tools button')).toHaveLength(1);
  });

  it('paints the VNDB cover from the local media:// cache, never from t.vndb.org', async () => {
    const { default: Panel } = await import('../components/immersion/VisualNovelPanel');
    await render(<Panel standalone />);
    const images = [...host.querySelectorAll('img')].map((img) => img.getAttribute('src'));
    expect(calls.art).toContain('https://t.vndb.org/cv/40/35040.jpg');
    expect(images).toContain('media://vn-art/abc.jpg');
    expect(images.some((src) => src?.includes('vndb.org'))).toBe(false);
  });

  it('shows a VNDB difficulty estimate, labelled as one, before enough text is captured', async () => {
    const { default: Panel } = await import('../components/immersion/VisualNovelPanel');
    await render(<Panel standalone />);
    const line = host.querySelector('.visual-novel-difficulty')?.textContent ?? '';
    expect(line).toContain('estimated from VNDB tags');
    expect(line).toContain('22 more lines');
    expect(line).not.toContain('Unrated');
  });
});

describe('the reader window', () => {
  it('shows the last few captured lines with their speakers, newest last', async () => {
    const { default: Reader } = await import('../components/immersion/VisualNovelReaderOverlay');
    await render(<Reader />);
    const lines = [...host.querySelectorAll('.vn-reader-line')];
    expect(lines).toHaveLength(6);
    expect(lines[lines.length - 1].textContent).toContain('7番目の台詞です。');
    expect(lines[lines.length - 1].classList.contains('is-newest')).toBe(true);
    expect(lines[lines.length - 1].querySelector('.vn-reader-speaker')?.textContent).toBe('紅莉栖');
    expect(host.querySelector('.vn-reader-dot')?.classList.contains('is-on')).toBe(true);
  });

  it('mines a line into the deck in one click, once', async () => {
    const { default: Reader } = await import('../components/immersion/VisualNovelReaderOverlay');
    const { loadDeck } = await import('../flashcardDeck');
    await render(<Reader />);
    const before = loadDeck().length;
    const mine = () => [...host.querySelectorAll<HTMLButtonElement>('.vn-reader-line.is-newest button')]
      .find((button) => button.textContent === 'Mine')!;
    await act(async () => { mine().click(); });
    const deck = loadDeck();
    expect(deck.length).toBe(before + 1);
    expect(deck[deck.length - 1]).toMatchObject({
      sentence: '7番目の台詞です。',
      bookId: 'vn:vn-1',
      studyKind: 'sentence',
    });
    expect(host.querySelector('.vn-reader-line.is-newest [role="status"]')?.textContent).toBe('Added to the deck');
    await act(async () => { mine().click(); });
    expect(loadDeck().length).toBe(before + 1);
    expect(host.querySelector('.vn-reader-line.is-newest [role="status"]')?.textContent).toBe('Already in the deck');
  });
});

describe('sentence translation and study time', () => {
  it('translates into the learner\'s translation language instead of always English', async () => {
    const { setTranslateTarget } = await import('../translateTarget');
    setTranslateTarget('ru');
    const { default: Assist } = await import('../components/immersion/VisualNovelSentenceAssist');
    await render(
      <Assist
        entry={seed.entries[0]}
        capture={seed.captures[0]}
        onDatabase={() => undefined}
        onStatus={() => undefined}
        onSaveCard={() => undefined}
      />,
    );
    const button = [...host.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === 'Translate')!;
    await act(async () => { button.click(); });
    expect(calls.translate.at(-1)).toEqual({ target: 'ru' });
  });

  it('banks a finished session in the shared reading statistics exactly once', async () => {
    const { installVisualNovelStudyTimeSync } = await import('../visualNovelStudyTime');
    const { READING_RECORDED_EVENT } = await import('../stats');
    const recorded: Array<{ bookId: string; seconds: number; chars: number }> = [];
    const listener = (event: Event): void => {
      recorded.push((event as CustomEvent).detail);
    };
    window.addEventListener(READING_RECORDED_EVENT, listener);
    const off = installVisualNovelStudyTimeSync();
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    off();
    window.removeEventListener(READING_RECORDED_EVENT, listener);
    expect(recorded).toEqual([expect.objectContaining({ bookId: 'vn:vn-1', seconds: 1_800, chars: 420 })]);
  });
});
