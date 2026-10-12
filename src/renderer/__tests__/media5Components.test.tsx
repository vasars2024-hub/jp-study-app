// @vitest-environment jsdom
/**
 * Product pass 7.5 surfaces, rendered: the VN line-study bar (hold + Next with
 * a queue), the YouTube pre-study list built from cached captions, and the
 * immersion reading list and per-site stats. Russian is checked for CLDR plurals.
 */
import { act, useState, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const idb = new Map<string, unknown>();
vi.mock('../storage/db', () => ({
  kvGet: async (key: string) => idb.get(key),
  kvSet: async (key: string, value: unknown) => {
    idb.set(key, JSON.parse(JSON.stringify(value)));
  },
  kvDelete: async (key: string) => {
    idb.delete(key);
  },
  kvUpdate: async (key: string, update: (current: unknown) => unknown) => {
    const next = update(idb.get(key));
    if (next !== undefined) idb.set(key, JSON.parse(JSON.stringify(next)));
    return idb.get(key);
  },
}));
vi.mock('../flashcardAutoEnrich', () => ({ enrichNewCards: async () => ({ audio: null, reading: null }) }));

import type { VisualNovelTextCapture } from '../../shared/visualNovel';
import { getUiLang, setUiLang } from '../i18n';
import { useVn5LineStudy, Vn5LineStudyBar } from '../components/immersion/VisualNovelLineStudy';
import { useVn5StudyPrefs } from '../visualNovelStudy5Prefs';
import YoutubePreStudyPanel from '../components/discover/YoutubePreStudyPanel';
import { Imm5ReadingListView, Imm5SiteDayStats, type Imm5Study } from '../components/immersion/ImmersionStudy5';
import { __resetImm5StoreForTests, imm5RecordSiteDay, imm5SaveForLater } from '../immersionStudy5Store';
import { loadDeck } from '../flashcardDeck';

let root: Root | null = null;
let host: HTMLDivElement;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
  localStorage.clear();
  idb.clear();
  __resetImm5StoreForTests();
  (window as unknown as { api: unknown }).api = {};
});

afterEach(async () => {
  root?.unmount();
  root = null;
  document.body.replaceChildren();
  setUiLang('en');
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
});

async function render(element: ReactElement): Promise<void> {
  host = document.createElement('div');
  document.body.append(host);
  const mounted = createRoot(host);
  root = mounted;
  await act(async () => { mounted.render(element); });
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
}

const flush = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 5)); });

const vnLine = (id: string): VisualNovelTextCapture => ({
  id,
  visualNovelId: 'vn',
  kind: 'dialogue',
  japanese: `${id}の行。`,
  translation: '',
  speaker: '',
  routeId: '',
  chapter: '',
  scene: '',
  screenshotPath: '',
  audioPath: '',
  source: 'hook',
  capturedAt: 1,
});

let pushLines: (lines: VisualNovelTextCapture[]) => void = () => undefined;

function LineStudyHarness() {
  const [lines, setLines] = useState<VisualNovelTextCapture[]>([vnLine('a')]);
  pushLines = setLines;
  const [prefs, setPrefs] = useVn5StudyPrefs();
  const study = useVn5LineStudy(lines, prefs);
  return (
    <>
      <Vn5LineStudyBar study={study} prefs={prefs} onPrefs={setPrefs} />
      <ol>{study.visible.map((line) => <li key={line.id}>{line.id}</li>)}</ol>
    </>
  );
}

describe('VN line study', () => {
  it('holds new lines behind Next and releases them one at a time', async () => {
    await render(<LineStudyHarness />);
    const hold = host.querySelector('.vn5-line-study-toggle input') as HTMLInputElement;
    await act(async () => { hold.click(); });
    await act(async () => { pushLines([vnLine('a'), vnLine('b'), vnLine('c')]); });
    await act(async () => { pushLines([vnLine('a'), vnLine('b'), vnLine('c'), vnLine('d')]); });
    const next = () => host.querySelector('[data-vn5-action="next"]') as HTMLButtonElement;
    expect([...host.querySelectorAll('li')].map((li) => li.textContent)).toEqual(['a']);
    expect(next().textContent).toBe('Next (3 waiting)');
    await act(async () => { next().click(); });
    expect([...host.querySelectorAll('li')].map((li) => li.textContent)).toEqual(['a', 'b']);
    expect(next().textContent).toBe('Next (2 waiting)');
    // Turning hold off follows the game again: everything shows.
    const hold2 = host.querySelector('.vn5-line-study-toggle input') as HTMLInputElement;
    await act(async () => { hold2.click(); });
    expect([...host.querySelectorAll('li')].map((li) => li.textContent)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('uses Russian plural forms for the queue', async () => {
    setUiLang('ru');
    // The Russian catalog is a lazy chunk; the switch lands once it resolves.
    for (let i = 0; i < 200 && getUiLang() !== 'ru'; i++) await flush();
    expect(getUiLang()).toBe('ru');
    await render(<LineStudyHarness />);
    const hold = host.querySelector('.vn5-line-study-toggle input') as HTMLInputElement;
    await act(async () => { hold.click(); });
    await act(async () => { pushLines([vnLine('a'), vnLine('b')]); });
    await act(async () => { pushLines([vnLine('a'), vnLine('b'), vnLine('c')]); });
    await act(async () => { pushLines([vnLine('a'), vnLine('b'), vnLine('c'), vnLine('d')]); });
    expect(host.querySelector('[data-vn5-action="next"]')?.textContent).toBe('Дальше (ждут 3 строки)');
  });
});

const VTT = `WEBVTT

00:00:01.000 --> 00:00:03.000
我 喜欢 猫

00:00:05.000 --> 00:00:07.000
猫 和 狗
`;

describe('YouTube pre-study', () => {
  it('builds the unknown-word list and a comprehension estimate from cached captions, and saves a word with its scene link', async () => {
    (window as unknown as { api: unknown }).api = {
      ytCachedCaptionText: async () => ({ text: VTT, file: 'x.zh.vtt' }),
    };
    await render(<YoutubePreStudyPanel videoId="dQw4w9WgXcQ" title="猫の動画" studyLang="zh" onClose={() => undefined} />);
    await flush();
    await flush();
    const words = [...host.querySelectorAll('[data-yt5-word]')].map((li) => li.getAttribute('data-yt5-word'));
    expect(words.length).toBeGreaterThan(0);
    expect(host.querySelector('.yt5-comprehension')?.textContent).toMatch(/% of words known/);
    expect(JSON.parse(localStorage.getItem('jp-yt5-comprehension') ?? '{}')).toHaveProperty('dQw4w9WgXcQ');
    const save = host.querySelector('[data-yt5-word] .btn:not(.ghost)') as HTMLButtonElement;
    await act(async () => { save.click(); });
    await flush();
    const [card] = loadDeck();
    expect(card.sourceRef?.webUrl).toMatch(/^https:\/\/www\.youtube\.com\/watch\?v=dQw4w9WgXcQ/);
    expect(card.bookTitle).toBe('猫の動画');
  });

  it('offers manual tracks before auto-generated ones in the picker', async () => {
    (window as unknown as { api: unknown }).api = {
      ytCachedCaptionText: async () => ({ text: null, file: null }),
      ytDiscoveryProbe: async () => ({
        state: 'ready',
        videoId: 'dQw4w9WgXcQ',
        probe: {
          videoId: 'dQw4w9WgXcQ',
          captions: [
            { key: 'ja', lang: 'ja', kind: 'auto' },
            { key: 'en', lang: 'en', kind: 'human' },
            { key: 'ja', lang: 'ja', kind: 'human' },
          ],
          audioLangs: [],
          categories: [],
          tags: [],
          probedAt: 1,
        },
      }),
    };
    await render(<YoutubePreStudyPanel videoId="dQw4w9WgXcQ" title="t" studyLang="ja" onClose={() => undefined} />);
    await act(async () => { (host.querySelector('.yt5-prestudy-tracks .btn') as HTMLButtonElement).click(); });
    await flush();
    const options = [...host.querySelectorAll('option')].map((o) => o.textContent);
    expect(options).toEqual([
      'ja — manual, study language',
      'ja — auto-generated, study language',
      'en — manual, helper language',
    ]);
  });
});

describe('immersion reading list and per-site stats', () => {
  const study = { openOffline: async () => true } as unknown as Imm5Study;

  it('lists saved articles unread first and filters by the rail search', async () => {
    await imm5SaveForLater({ url: 'https://www3.nhk.or.jp/news/a', title: '天気', snapshotHtml: '<p>台風</p>' });
    await imm5SaveForLater({ url: 'https://example.jp/b', title: '料理' });
    await render(<Imm5ReadingListView study={study} query="site:nhk.or.jp" onOpen={() => undefined} />);
    const rows = [...host.querySelectorAll('[data-imm5-reading] strong')].map((el) => el.textContent);
    expect(rows).toEqual(['天気']);
    expect(host.querySelector('[data-imm5-action="offline"]')).not.toBeNull();
  });

  it('shows minutes, lookups, mined and new words per site', async () => {
    await imm5RecordSiteDay('https://www.nhk.or.jp/a', { seconds: 600, lookups: 4, mined: 2, newWords: 9 });
    await render(<Imm5SiteDayStats />);
    const cells = [...host.querySelectorAll('tr[data-host="nhk.or.jp"] td')].map((td) => td.textContent);
    expect(cells).toEqual(['10', '4', '2', '9']);
  });
});
