import { useEffect, useRef, useState } from 'react';
import { supportsLexiconAudio } from '../../../shared/lexiconAudio';
import { useT } from '../../i18n';
import './wordAudio.css';

interface Props {
  /** The headword as the entry shows it — the provider matches on the written form. */
  word: string;
  /** The kana reading, when the entry has one distinct from the word. */
  reading?: string;
  /** Source language of the entry. A control appears only where a provider exists. */
  lang: string;
}

/** What the last play attempt produced. `idle` has never been clicked. */
type AudioState = 'idle' | 'loading' | 'ready' | 'none' | 'offline';

/**
 * Say a word out loud, beside the word.
 *
 * ## Why a click and not a lookup
 *
 * This is the only reader on the entry that can leave the machine. Every panel
 * around it — etymology, cross references, compounds — is an indexed probe into
 * the local database and runs unasked because it costs nothing and discloses
 * nothing. A pronunciation is fetched from a CDN, so firing it with the lookup
 * would mail every word the user searches to a third party without them ever
 * asking to hear one. It waits for the click, and the main process caches the
 * answer so the second click is offline.
 *
 * ## Why `none` is a state and not an error
 *
 * The provider has no recording for most rare words, and answers that with a
 * placeholder clip rather than a 404 — a distinction `dictionary/audio.ts`
 * makes, not this component. "No recording" is a fact about the word that will
 * not change, so the control retires itself and says so; `offline` is a fact
 * about the moment, so the control stays live and can be clicked again. Showing
 * one as the other is how a working feature starts looking broken.
 */
export default function WordAudio({ word, reading, lang }: Props) {
  const { t } = useT();
  const [state, setState] = useState<AudioState>('idle');
  /** The decoded clip, so a replay costs neither IPC nor disk. */
  const clip = useRef<string | null>(null);
  const run = useRef(0);

  useEffect(() => {
    // A new word invalidates the last one's clip, and any request still in
    // flight for it: a reply must never play under the word that replaced it.
    run.current += 1;
    clip.current = null;
    setState('idle');
  }, [word, reading, lang]);

  if (!word || !supportsLexiconAudio(lang)) return null;

  /**
   * A rejected `play()` is never reported as a network problem: the clip is in
   * hand and cached, and the only realistic cause is Chromium's user-activation
   * window having expired while the fetch was in flight. The state stays
   * `ready`, so the next click replays from the ref under a fresh gesture.
   */
  const start = (src: string) => {
    void new Audio(src).play().catch(() => undefined);
  };

  const play = async () => {
    if (clip.current) {
      start(clip.current);
      return;
    }
    const attempt = ++run.current;
    setState('loading');
    let result;
    try {
      result = await window.api.dictAudio({ lang, term: word, reading });
    } catch {
      // A rejected invoke means the handler is not there — an older main
      // process behind a reloaded renderer. Retryable from the user's side,
      // which is what `offline` already means.
      if (attempt === run.current) setState('offline');
      return;
    }
    if (attempt !== run.current) return;
    if (result.status === 'ready' && result.clip) {
      clip.current = `data:${result.clip.mimeType};base64,${result.clip.dataBase64}`;
      setState('ready');
      start(clip.current);
      return;
    }
    // `unsupported` cannot be reached from here — the control does not render
    // for a language without a provider — but if the main process ever widens
    // the rule, a word it declines is a word with no recording.
    setState(result.status === 'offline' ? 'offline' : 'none');
  };

  const label = state === 'loading'
    ? t('lexicon.audio.loading')
    : state === 'none'
      ? t('lexicon.audio.none')
      : state === 'offline'
        ? t('lexicon.audio.offline')
        : t('lexicon.audio.play', { word });

  return (
    <button
      aria-label={label}
      className={`word-audio is-${state}`}
      disabled={state === 'loading' || state === 'none'}
      onClick={() => void play()}
      title={label}
      type="button"
    >
      <svg aria-hidden="true" height="14" viewBox="0 0 16 16" width="14">
        <path
          d="M8.5 2.2 4.9 5H2.6a.6.6 0 0 0-.6.6v4.8c0 .33.27.6.6.6h2.3l3.6 2.8a.5.5 0 0 0 .8-.4V2.6a.5.5 0 0 0-.8-.4Z"
          fill="currentColor"
        />
        {state !== 'none' && (
          <path
            d="M11.4 5.1a3.8 3.8 0 0 1 0 5.8M13.3 3.1a6.5 6.5 0 0 1 0 9.8"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeWidth="1.3"
          />
        )}
      </svg>
    </button>
  );
}
