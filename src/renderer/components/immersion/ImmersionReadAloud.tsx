/**
 * Read-aloud in the immersion reader: the hook that owns the player for one
 * reader, and its controls in the Reader Mode bar (both shells render that bar,
 * so Study OS, Aero, Wired and Blanc all get it). The player itself is
 * `immersionReadAloudPlayer.ts`.
 */
import { useCallback, useEffect, useMemo, useState, type RefObject } from 'react';
import { cardAudio } from '../../cardAudioPlayback';
import { preferredVoiceFor } from '../../flashcardVoicePreference';
import { trackForegroundMedia } from '../../foregroundAudio';
import { writeLocalStorage } from '../../localStorageWrite';
import type { StudyLang } from '../../../shared/studyLang';
import {
  ImmersionReadAloud,
  READ_ALOUD_RATES,
  currentParagraphIndex,
  readAloudLangFor,
  readAloudSentences,
  sentenceRange,
  type ReadAloudAudio,
  type ReadAloudSentence,
  type ReadAloudSnapshot,
} from './immersionReadAloudPlayer';
import { useImmersionUi } from './immersionUiStrings';

const RATE_KEY = 'jp-imm-read-aloud-rate';
/** The CSS Custom Highlight the spoken sentence is painted with (`imm5.css`). */
export const READ_ALOUD_HIGHLIGHT = 'imm-read-aloud';
const BLOCK_ATTR = 'data-read-aloud-block';

function loadRate(): number {
  try {
    const n = Number(localStorage.getItem(RATE_KEY));
    return READ_ALOUD_RATES.includes(n) ? n : 1;
  } catch {
    return 1;
  }
}

function domAudio(src: string): ReadAloudAudio {
  const el = new Audio(src);
  trackForegroundMedia(el);
  return {
    play() {
      const started = el.play();
      trackForegroundMedia(el);
      return started;
    },
    pause() {
      el.pause();
      trackForegroundMedia(el);
    },
    get playbackRate() {
      return el.playbackRate;
    },
    set playbackRate(rate: number) {
      el.playbackRate = rate;
    },
    addEventListener: (type, listener) => el.addEventListener(type, listener),
    removeEventListener: (type, listener) => el.removeEventListener(type, listener),
  };
}

type HighlightRegistry = { set(name: string, h: unknown): void; delete(name: string): void };

function highlightRegistry(): HighlightRegistry | null {
  const registry = (globalThis.CSS as unknown as { highlights?: HighlightRegistry } | undefined)?.highlights;
  return registry && typeof (globalThis as { Highlight?: unknown }).Highlight === 'function' ? registry : null;
}

export interface ReadAloudParams {
  readerRef: RefObject<HTMLDivElement | null>;
  readerHtml: string;
  showReader: boolean;
  currentUrl: string;
  studyLang: StudyLang;
}

export function useImmersionReadAloud({ readerRef, readerHtml, showReader, currentUrl, studyLang }: ReadAloudParams) {
  /** Mark the sentence being spoken, and its paragraph; null clears both. */
  const paint = useCallback((sentence: ReadAloudSentence | null) => {
    const root = readerRef.current;
    root?.querySelectorAll(`[${BLOCK_ATTR}]`).forEach((el) => el.removeAttribute(BLOCK_ATTR));
    const registry = highlightRegistry();
    if (!sentence) {
      registry?.delete(READ_ALOUD_HIGHLIGHT);
      return;
    }
    if (sentence.block !== root) sentence.block.setAttribute(BLOCK_ATTR, '');
    const range = sentenceRange(sentence);
    if (registry && range) {
      const HighlightCtor = (globalThis as unknown as { Highlight: new (...r: Range[]) => unknown }).Highlight;
      registry.set(READ_ALOUD_HIGHLIGHT, new HighlightCtor(range));
    }
    // Keep the spoken sentence on screen, without yanking a reader who scrolled ahead a little.
    const box = (range ?? sentence.block).getBoundingClientRect?.();
    const view = root?.getBoundingClientRect();
    if (box && view && view.height > 0 && (box.bottom > view.bottom || box.top < view.top)) {
      sentence.block.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
    }
  }, [readerRef]);

  const player = useMemo(() => new ImmersionReadAloud({
    synthesize: (text, lang, voice) => window.api.flashcardSynthesizeAudio(text, lang, voice),
    read: (path) => window.api.flashcardReadAudio(path),
    createAudio: domAudio,
    voiceFor: (lang) => preferredVoiceFor(lang),
    highlight: (sentence) => paint(sentence),
    quietOthers: () => cardAudio.stop(),
    refresh: () => (readerRef.current ? readAloudSentences(readerRef.current) : null),
  }, loadRate()), [paint, readerRef]);

  const [state, setState] = useState<ReadAloudSnapshot>(player.state);
  useEffect(() => player.subscribe(setState), [player]);

  // A different article, page or mode ends the reading; so does leaving the reader.
  useEffect(() => () => player.stop(), [player, readerHtml, currentUrl, showReader]);

  const begin = useCallback((scope: 'article' | 'paragraph') => {
    const root = readerRef.current;
    if (!root) return;
    const sentences = readAloudSentences(root);
    const lang = readAloudLangFor(sentences.map((s) => s.text).join('\n'), studyLang);
    if (scope === 'article' || !sentences.length) {
      player.start(sentences, lang, scope);
      return;
    }
    const block = currentParagraphIndex(sentences, root);
    const from = sentences.findIndex((s) => s.blockIndex === block);
    let to = from;
    while (to < sentences.length && sentences[to].blockIndex === block) to += 1;
    player.start(sentences, lang, 'paragraph', Math.max(0, from), to);
  }, [player, readerRef, studyLang]);

  const setRate = useCallback((rate: number) => {
    player.setRate(rate);
    writeLocalStorage(RATE_KEY, String(player.state.rate));
  }, [player]);

  return {
    state,
    available: showReader && !!readerHtml,
    readArticle: useCallback(() => begin('article'), [begin]),
    readParagraph: useCallback(() => begin('paragraph'), [begin]),
    pause: useCallback(() => player.pause(), [player]),
    resume: useCallback(() => player.resume(), [player]),
    stop: useCallback(() => player.stop(), [player]),
    setRate,
  };
}

export type ImmersionReadAloudState = ReturnType<typeof useImmersionReadAloud>;

/** Read aloud / This paragraph, Pause or Resume, Stop, speed, and where it is. */
export function ImmersionReadAloudControls({ readAloud }: { readAloud: ImmersionReadAloudState }) {
  const { it } = useImmersionUi();
  const { state } = readAloud;
  const active = state.status === 'loading' || state.status === 'playing' || state.status === 'paused';
  return (
    <span
      className="imm-read-aloud"
      role="group"
      aria-label={it('immersionUi.readAloud.aria')}
      data-imm-read-aloud={state.status}
      data-imm-read-aloud-lang={state.lang ?? ''}
    >
      {!active && (
        <>
          <button
            type="button"
            className="btn small"
            data-imm-read-aloud-action="article"
            title={it('immersionUi.readAloud.articleTitle')}
            disabled={!readAloud.available}
            onClick={readAloud.readArticle}
          >
            {it('immersionUi.readAloud.article')}
          </button>
          <button
            type="button"
            className="btn small"
            data-imm-read-aloud-action="paragraph"
            title={it('immersionUi.readAloud.paragraphTitle')}
            disabled={!readAloud.available}
            onClick={readAloud.readParagraph}
          >
            {it('immersionUi.readAloud.paragraph')}
          </button>
        </>
      )}
      {(state.status === 'loading' || state.status === 'playing') && (
        <button type="button" className="btn small" data-imm-read-aloud-action="pause" onClick={readAloud.pause}>
          {it('immersionUi.readAloud.pause')}
        </button>
      )}
      {state.status === 'paused' && (
        <button type="button" className="btn small" data-imm-read-aloud-action="resume" onClick={readAloud.resume}>
          {it('immersionUi.readAloud.resume')}
        </button>
      )}
      {active && (
        <button type="button" className="btn small" data-imm-read-aloud-action="stop" onClick={readAloud.stop}>
          {it('immersionUi.readAloud.stop')}
        </button>
      )}
      <select
        className="imm-read-aloud-rate"
        aria-label={it('immersionUi.readAloud.speed')}
        title={it('immersionUi.readAloud.speed')}
        data-imm-read-aloud-action="rate"
        value={String(state.rate)}
        onChange={(event) => readAloud.setRate(Number(event.target.value))}
      >
        {READ_ALOUD_RATES.map((rate) => (
          <option key={rate} value={String(rate)}>{`${rate}×`}</option>
        ))}
      </select>
      {active && (
        <span className="imm-read-aloud-progress" role="status" data-imm-read-aloud-index={state.index}>
          {state.status === 'loading'
            ? it('immersionUi.readAloud.loading')
            : it('immersionUi.readAloud.progress', { current: state.index - state.from + 1, total: state.total - state.from })}
        </span>
      )}
      {state.status === 'error' && state.errorKey && (
        <span className="imm-read-aloud-error" role="alert" data-imm-read-aloud-error="">
          {it(state.errorKey)}
        </span>
      )}
    </span>
  );
}
