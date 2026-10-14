// @vitest-environment jsdom
/**
 * G12: grammar had no audio. Examples are now read aloud through the card-audio
 * path (main's offline synthesizer + the shared study-clip channel). What must
 * hold: the example's own language speaks it, the previous example is silenced
 * before the next is synthesized, a second click on the playing example stops it,
 * and a missing voice is a translated message naming the language.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  GrammarExampleAudio,
  grammarAudioErrorKey,
  normalizeGrammarAudioLang,
  type GrammarAudioDeps,
  type GrammarAudioLang,
} from '../components/grammar/grammarAudioPlayer';
import GrammarExampleAudioButton from '../components/grammar/GrammarExampleAudio';
import { GRAMMAR_UI_EN } from '../../shared/i18n/grammarUi/en';
import { GRAMMAR_UI_JA } from '../../shared/i18n/grammarUi/ja';
import { GRAMMAR_UI_ZH } from '../../shared/i18n/grammarUi/zh';
import { GRAMMAR_UI_RU } from '../../shared/i18n/grammarUi/ru';
import { loadGrammarUiStrings } from '../components/grammar/grammarUiStrings';

function fakeChannel() {
  let generation = 0;
  let current: string | null = null;
  const log: string[] = [];
  return {
    log,
    get playing() {
      return current !== null;
    },
    play: vi.fn(async (src: string) => {
      generation += 1;
      current = src;
      log.push(`play ${src}`);
    }),
    stop: vi.fn((src?: string) => {
      if (src !== undefined && src !== current) return;
      generation += 1;
      log.push(`stop ${src ?? '*'}`);
      current = null;
    }),
    claim: () => {
      const mine = ++generation;
      return () => generation === mine;
    },
    /** The clip ended on its own. */
    end() {
      current = null;
    },
  };
}

function deps(overrides: Partial<GrammarAudioDeps> = {}) {
  const channel = fakeChannel();
  const synthesize = vi.fn(async (text: string, lang: GrammarAudioLang) => ({ ok: true, path: `${lang}/${text}.wav` }));
  const read = vi.fn(async (path: string) => ({ ok: true, dataUrl: `data:${path}` }));
  const voiceFor = vi.fn((lang: GrammarAudioLang) => (lang === 'zh' ? 'voice-zh' : undefined));
  return { channel, synthesize, read, voiceFor, all: { channel, synthesize, read, voiceFor, pollMs: 5, ...overrides } };
}

describe('grammar example audio', () => {
  it('speaks in the example language with that language\'s chosen voice', async () => {
    const d = deps();
    const player = new GrammarExampleAudio(d.all);
    await player.play('zh:我没有钱。', '我没有钱。', 'zh');
    expect(d.synthesize).toHaveBeenCalledWith('我没有钱。', 'zh', 'voice-zh');
    expect(d.channel.play).toHaveBeenCalledWith('data:zh/我没有钱。.wav');
    expect(player.state).toEqual({ key: 'zh:我没有钱。', status: 'playing' });
  });

  it('stops the previous example before the next one is synthesized', async () => {
    const d = deps();
    const player = new GrammarExampleAudio(d.all);
    await player.play('ja:一', '一', 'ja');
    let stoppedBeforeSynthesis = false;
    d.synthesize.mockImplementationOnce(async (text: string, lang: GrammarAudioLang) => {
      stoppedBeforeSynthesis = d.channel.log.includes('stop data:ja/一.wav');
      return { ok: true, path: `${lang}/${text}.wav` };
    });
    await player.play('ja:二', '二', 'ja');
    expect(stoppedBeforeSynthesis).toBe(true);
    expect(d.channel.log).toEqual(['play data:ja/一.wav', 'stop data:ja/一.wav', 'play data:ja/二.wav']);
    expect(player.state.key).toBe('ja:二');
  });

  it('a click on the playing example stops it; the end of the clip returns to idle', async () => {
    const d = deps();
    const player = new GrammarExampleAudio(d.all);
    await player.toggle('ja:a', 'a', 'ja');
    await player.toggle('ja:a', 'a', 'ja');
    expect(player.state.status).toBe('idle');
    expect(d.channel.log.at(-1)).toBe('stop data:ja/a.wav');

    await player.toggle('ja:b', 'b', 'ja');
    expect(player.state.status).toBe('playing');
    d.channel.end();
    await vi.waitFor(() => expect(player.state.status).toBe('idle'));
  });

  it('a superseded synthesis never plays', async () => {
    const d = deps();
    let release!: () => void;
    d.synthesize.mockImplementationOnce(
      (text: string, lang: GrammarAudioLang) =>
        new Promise((resolve) => {
          release = () => resolve({ ok: true, path: `${lang}/${text}.wav` });
        }),
    );
    const player = new GrammarExampleAudio(d.all);
    const slow = player.play('ja:slow', 'slow', 'ja');
    await player.play('ja:fast', 'fast', 'ja');
    release();
    await slow;
    expect(d.channel.play).toHaveBeenCalledTimes(1);
    expect(d.channel.play).toHaveBeenCalledWith('data:ja/fast.wav');
    expect(player.state.key).toBe('ja:fast');
  });

  it('a missing voice is a translated message naming the language', async () => {
    const d = deps();
    d.synthesize.mockResolvedValueOnce({ ok: false, reason: 'no-voice', error: 'No offline voice is installed for ru-RU.' } as never);
    const player = new GrammarExampleAudio(d.all);
    await player.play('ru:Я читаю.', 'Я читаю.', 'ru');
    expect(player.state).toEqual({ key: 'ru:Я читаю.', status: 'error', errorKey: 'grammarUi.audio.noVoice.ru' });
    expect(d.channel.play).not.toHaveBeenCalled();
    expect(grammarAudioErrorKey('no-synthesizer', 'ja')).toBe('grammarUi.audio.noSynthesizer');
    expect(grammarAudioErrorKey(undefined, 'ja')).toBe('grammarUi.audio.failed');
    // A rejected invoke (handler missing) is a failure, not a crash.
    d.synthesize.mockRejectedValueOnce(new Error('No handler registered'));
    await player.play('ja:x', 'x', 'ja');
    expect(player.state.errorKey).toBe('grammarUi.audio.failed');
  });

  it('defaults an unknown or legacy language to Japanese', () => {
    expect(normalizeGrammarAudioLang(undefined)).toBe('ja');
    expect(normalizeGrammarAudioLang('zh')).toBe('zh');
    expect(normalizeGrammarAudioLang('ru')).toBe('ru');
  });
});

describe('the speaker button', () => {
  let host: HTMLDivElement | null = null;
  let root: Root | null = null;
  afterEach(() => {
    if (root) act(() => root?.unmount());
    host?.remove();
    root = null;
    host = null;
  });

  it('exposes its state for the E2E flow and shows the no-voice message', async () => {
    const d = deps();
    d.synthesize.mockResolvedValueOnce({ ok: false, reason: 'no-voice' } as never);
    const player = new GrammarExampleAudio(d.all);
    host = document.createElement('div');
    document.body.appendChild(host);
    const r = createRoot(host);
    root = r;
    act(() => r.render(<GrammarExampleAudioButton text="我没有钱。" lang="zh" player={player} />));
    const button = host.querySelector<HTMLButtonElement>('.gram-ex-audio')!;
    expect(button.dataset.audioState).toBe('idle');
    expect(button.getAttribute('aria-label')).toBe('Listen to this example');
    await act(async () => {
      button.click();
    });
    expect(button.dataset.audioState).toBe('error');
    expect(host.querySelector('[role="alert"]')?.textContent).toBe(GRAMMAR_UI_EN['grammarUi.audio.noVoice.zh']);
    await act(async () => {
      button.click();
    });
    expect(button.dataset.audioState).toBe('playing');
    expect(button.getAttribute('aria-pressed')).toBe('true');
  });
});

describe('grammarUi pack', () => {
  it('has every key in all four languages, translated, with Russian plural forms', async () => {
    const keys = Object.keys(GRAMMAR_UI_EN).sort();
    for (const pack of [GRAMMAR_UI_JA, GRAMMAR_UI_ZH, GRAMMAR_UI_RU]) {
      expect(Object.keys(pack).sort()).toEqual(keys);
      for (const key of keys) expect(JSON.stringify(pack[key])).not.toBe(JSON.stringify(GRAMMAR_UI_EN[key]));
    }
    for (const [key, entry] of Object.entries(GRAMMAR_UI_RU)) {
      if (typeof entry === 'string') continue;
      expect(Object.keys(entry).sort(), key).toEqual(['few', 'many', 'one', 'other']);
    }
    await expect(loadGrammarUiStrings('ru')).resolves.toBeUndefined();
  });
});
