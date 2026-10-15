// @vitest-environment jsdom
/**
 * Read-aloud in the immersion reader: the article or the current paragraph,
 * sentence by sentence, in the text's own language, with play / pause / stop,
 * the spoken sentence highlighted, a speed control, and a missing voice shown
 * as a translated message. Asserted on state, never on sound.
 */
import { act, createElement, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ImmersionReadAloud,
  readAloudErrorKey,
  readAloudLangFor,
  readAloudSentences,
  sentenceRange,
  splitSentenceSpans,
  type ReadAloudAudio,
  type ReadAloudDeps,
  type ReadAloudSentence,
} from '../components/immersion/immersionReadAloudPlayer';
import { ImmersionReadAloudControls, useImmersionReadAloud } from '../components/immersion/ImmersionReadAloud';
import { IMMERSION_UI_RU } from '../../shared/i18n/immersionUi/ru';
import { setUiLang } from '../i18n';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ARTICLE = [
  '<h1>雨の日</h1>',
  '<p>雨の日は、<ruby>図書館<rt>としょかん</rt></ruby>で本を読むのが好きです。静かな部屋で、雨の音を聞きます！</p>',
  '<p>「今日は何を読もうか。」と友達が言いました。</p>',
  '<div class="main_text">昔、ある村に一人のおじいさんが住んでいました。<br>おじいさんは毎日山へ行きました。</div>',
].join('');

function readerWith(html: string): HTMLDivElement {
  const div = document.createElement('div');
  div.innerHTML = html;
  document.body.append(div);
  return div;
}

describe('sentences out of the reader', () => {
  it('splits on CJK and Latin ends, keeps closing quotes, ignores decimals', () => {
    const text = '「行こう。」と言った。Pi is 3.14 today. Done!';
    expect(splitSentenceSpans(text).map(([s, e]) => text.slice(s, e))).toEqual([
      '「行こう。」と言った。',
      'Pi is 3.14 today.',
      'Done!',
    ]);
  });

  it('reads blocks and <br> lines as separate sentences, skipping furigana', () => {
    const root = readerWith(ARTICLE);
    const sentences = readAloudSentences(root);
    expect(sentences.map((s) => s.text)).toEqual([
      '雨の日',
      '雨の日は、図書館で本を読むのが好きです。',
      '静かな部屋で、雨の音を聞きます！',
      '「今日は何を読もうか。」と友達が言いました。',
      '昔、ある村に一人のおじいさんが住んでいました。',
      'おじいさんは毎日山へ行きました。',
    ]);
    expect(new Set(sentences.map((s) => s.blockIndex)).size).toBe(4);
    // A range over a sentence that crosses the <ruby> covers exactly its text, furigana aside.
    const range = sentenceRange(sentences[1])!;
    expect(range.toString().replace('としょかん', '')).toBe('雨の日は、図書館で本を読むのが好きです。');
    root.remove();
  });

  it('reads in the language the text is written in', () => {
    expect(readAloudLangFor('雨の日は、図書館で本を読むのが好きです。静かな部屋で雨の音を聞きます。', 'zh')).toBe('ja');
    expect(readAloudLangFor('我喜欢在下雨天去图书馆看书。房间里很安静，可以听到雨声。', 'ja')).toBe('zh');
    expect(readAloudLangFor('Я люблю читать книги в библиотеке в дождливый день.', 'ja')).toBe('ru');
    expect(readAloudLangFor('I like reading books in the library on a rainy day.', 'ja')).toBe('en');
    expect(readAloudLangFor('短い', 'ja')).toBe('ja');
  });

  it('names the missing voice by language', () => {
    expect(readAloudErrorKey('no-voice', 'zh')).toBe('immersionUi.readAloud.noVoice.zh');
    expect(readAloudErrorKey('no-synthesizer', 'ja')).toBe('immersionUi.readAloud.noSynthesizer');
    expect(readAloudErrorKey('failed', 'ja')).toBe('immersionUi.readAloud.failed');
  });
});

class FakeAudio implements ReadAloudAudio {
  static all: FakeAudio[] = [];
  playbackRate = 1;
  playing = false;
  get paused() {
    return !this.playing;
  }
  private readonly handlers = new Map<string, Set<() => void>>();
  constructor(readonly src: string) {
    FakeAudio.all.push(this);
  }
  async play() {
    this.playing = true;
  }
  pause() {
    this.playing = false;
  }
  addEventListener(type: string, fn: () => void) {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type)!.add(fn);
  }
  removeEventListener(type: string, fn: () => void) {
    this.handlers.get(type)?.delete(fn);
  }
  end() {
    this.playing = false;
    for (const fn of this.handlers.get('ended') ?? []) fn();
  }
}

function makeDeps(over: Partial<ReadAloudDeps> = {}) {
  const highlighted: Array<string | null> = [];
  const synthesize = vi.fn(async (text: string) => ({ ok: true, path: `p:${text}` }));
  const deps: ReadAloudDeps = {
    synthesize,
    read: async (path: string) => ({ ok: true, dataUrl: `data:${path}` }),
    createAudio: (src) => new FakeAudio(src),
    voiceFor: () => undefined,
    highlight: (s: ReadAloudSentence | null) => highlighted.push(s?.text ?? null),
    quietOthers: vi.fn(),
    ...over,
  };
  return { deps, highlighted, synthesize };
}

const flush = async () => {
  for (let i = 0; i < 6; i += 1) await Promise.resolve();
};

describe('the player', () => {
  beforeEach(() => {
    FakeAudio.all = [];
  });

  it('reads the article sentence by sentence, highlighting each, then goes idle', async () => {
    const root = readerWith(ARTICLE);
    const sentences = readAloudSentences(root);
    const { deps, highlighted } = makeDeps();
    const player = new ImmersionReadAloud(deps);
    player.start(sentences, 'ja', 'article');
    expect(player.state.status).toBe('loading');
    expect(deps.quietOthers).toHaveBeenCalled();
    await flush();
    expect(player.state).toMatchObject({ status: 'playing', index: 0, total: sentences.length, lang: 'ja' });
    expect(highlighted.at(-1)).toBe('雨の日');
    for (let i = 0; i < sentences.length; i += 1) {
      FakeAudio.all.at(-1)!.end();
      await flush();
    }
    expect(player.state.status).toBe('idle');
    expect(highlighted.filter(Boolean)).toEqual(sentences.map((s) => s.text));
    expect(highlighted.at(-1)).toBeNull();
    root.remove();
  });

  it('pauses and resumes the same clip, stops and clears the highlight', async () => {
    const root = readerWith(ARTICLE);
    const { deps, highlighted } = makeDeps();
    const player = new ImmersionReadAloud(deps);
    player.start(readAloudSentences(root), 'ja', 'article');
    await flush();
    const clip = FakeAudio.all.at(-1)!;
    player.pause();
    expect(player.state.status).toBe('paused');
    expect(clip.playing).toBe(false);
    player.resume();
    expect(player.state.status).toBe('playing');
    expect(clip.playing).toBe(true);
    player.stop();
    expect(player.state).toMatchObject({ status: 'idle', index: -1 });
    expect(clip.playing).toBe(false);
    expect(highlighted.at(-1)).toBeNull();
    root.remove();
  });

  it('a Pause while play() is still pending is a pause, not a failure', async () => {
    const root = readerWith(ARTICLE);
    class SlowAudio extends FakeAudio {
      private reject: ((e: Error) => void) | null = null;
      override play() {
        this.playing = true;
        return new Promise<void>((_resolve, reject) => { this.reject = reject; });
      }
      override pause() {
        super.pause();
        this.reject?.(new Error('AbortError: The play() request was interrupted by a call to pause()'));
      }
    }
    const { deps } = makeDeps({ createAudio: (src) => new SlowAudio(src) });
    const player = new ImmersionReadAloud(deps);
    player.start(readAloudSentences(root), 'ja', 'article');
    await flush();
    expect(player.state.status).toBe('playing');
    player.pause();
    await flush();
    expect(player.state.status).toBe('paused');
    root.remove();
  });

  it('applies the speed to the clip playing now and to the next ones', async () => {
    const root = readerWith(ARTICLE);
    const { deps } = makeDeps();
    const player = new ImmersionReadAloud(deps, 0.8);
    player.start(readAloudSentences(root), 'ja', 'article');
    await flush();
    expect(FakeAudio.all.at(-1)!.playbackRate).toBe(0.8);
    player.setRate(1.5);
    expect(FakeAudio.all.at(-1)!.playbackRate).toBe(1.5);
    FakeAudio.all.at(-1)!.end();
    await flush();
    expect(FakeAudio.all.at(-1)!.playbackRate).toBe(1.5);
    player.setRate(7);
    expect(player.state.rate).toBe(1);
    root.remove();
  });

  it('reads only the paragraph slice it was given', async () => {
    const root = readerWith(ARTICLE);
    const sentences = readAloudSentences(root);
    const { deps, highlighted } = makeDeps();
    const player = new ImmersionReadAloud(deps);
    player.start(sentences, 'ja', 'paragraph', 1, 3);
    await flush();
    FakeAudio.all.at(-1)!.end();
    await flush();
    FakeAudio.all.at(-1)!.end();
    await flush();
    expect(player.state.status).toBe('idle');
    expect(highlighted.filter(Boolean)).toEqual([sentences[1].text, sentences[2].text]);
    root.remove();
  });

  it('a missing voice is an error state with the language named, and nothing plays', async () => {
    const root = readerWith(ARTICLE);
    const { deps } = makeDeps({ synthesize: async () => ({ ok: false, reason: 'no-voice', error: 'No offline voice is installed for ja-JP.' }) });
    const player = new ImmersionReadAloud(deps);
    player.start(readAloudSentences(root), 'ja', 'article');
    await flush();
    expect(player.state).toMatchObject({ status: 'error', errorKey: 'immersionUi.readAloud.noVoice.ja' });
    expect(FakeAudio.all).toHaveLength(0);
    root.remove();
  });

  it('a page with no text says so', () => {
    const { deps } = makeDeps();
    const player = new ImmersionReadAloud(deps);
    player.start([], 'ja', 'article');
    expect(player.state).toMatchObject({ status: 'error', errorKey: 'immersionUi.readAloud.nothing' });
  });
});

describe('the controls in the reader bar', () => {
  let root: Root;
  let host: HTMLDivElement;

  beforeEach(() => {
    FakeAudio.all = [];
    localStorage.clear();
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  });
  afterEach(async () => {
    await act(async () => { root.unmount(); });
    host.remove();
    setUiLang('en');
  });

  // One object, as `readerHtmlProp` is: a new one each render makes React rewrite the article.
  const HTML_PROP = { __html: ARTICLE };
  function Reader() {
    const readerRef = useRef<HTMLDivElement>(null);
    const readAloud = useImmersionReadAloud({ readerRef, readerHtml: ARTICLE, showReader: true, currentUrl: 'https://example.test/a', studyLang: 'ja' });
    return createElement('div', null,
      createElement(ImmersionReadAloudControls, { readAloud }),
      createElement('div', { ref: readerRef, className: 'immersion-reader', dangerouslySetInnerHTML: HTML_PROP }));
  }

  const group = () => host.querySelector('[data-imm-read-aloud]') as HTMLElement;
  const click = async (action: string) => {
    await act(async () => { (host.querySelector(`[data-imm-read-aloud-action="${action}"]`) as HTMLButtonElement).click(); });
    await act(async () => { await flush(); });
  };

  it('Read aloud -> Pause -> Resume -> Stop, with the speed kept for next time', async () => {
    (window as unknown as { api: unknown }).api = {
      flashcardSynthesizeAudio: async (text: string) => ({ ok: true, path: `p:${text}` }),
      flashcardReadAudio: async (path: string) => ({ ok: true, dataUrl: `data:${path}` }),
    };
    const audioSpy = vi.spyOn(window, 'Audio').mockImplementation(function (src?: string) {
      return new FakeAudio(src ?? '') as unknown as HTMLAudioElement;
    } as never);
    await act(async () => { root.render(createElement(Reader)); });
    expect(group().dataset.immReadAloud).toBe('idle');
    await click('article');
    expect(group().dataset.immReadAloud).toBe('playing');
    expect(group().dataset.immReadAloudLang).toBe('ja');
    expect(host.querySelector('.imm-read-aloud-progress')?.textContent).toMatch(/Sentence 1 of 6/);
    expect(host.querySelector('[data-read-aloud-block]')?.textContent).toBe('雨の日');
    await click('pause');
    expect(group().dataset.immReadAloud).toBe('paused');
    await click('resume');
    expect(group().dataset.immReadAloud).toBe('playing');
    await act(async () => {
      const select = host.querySelector('[data-imm-read-aloud-action="rate"]') as HTMLSelectElement;
      select.value = '1.25';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(localStorage.getItem('jp-imm-read-aloud-rate')).toBe('1.25');
    await click('stop');
    expect(group().dataset.immReadAloud).toBe('idle');
    expect(host.querySelector('[data-read-aloud-block]')).toBeNull();
    audioSpy.mockRestore();
  });

  it('a missing voice shows the translated message (Russian UI)', async () => {
    (window as unknown as { api: unknown }).api = {
      flashcardSynthesizeAudio: async () => ({ ok: false, reason: 'no-voice', error: 'No offline voice is installed for ja-JP.' }),
      flashcardReadAudio: async () => ({ ok: false }),
    };
    setUiLang('ru');
    await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
    await act(async () => { root.render(createElement(Reader)); });
    await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
    await click('paragraph');
    expect(group().dataset.immReadAloud).toBe('error');
    expect(host.querySelector('[data-imm-read-aloud-error]')?.textContent).toBe(IMMERSION_UI_RU['immersionUi.readAloud.noVoice.ja']);
  });
});
