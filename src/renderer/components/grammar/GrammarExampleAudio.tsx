/**
 * The speaker button beside a grammar example (see `grammarAudioPlayer.ts`).
 *
 * `data-audio-state` mirrors the player for this example (idle / loading /
 * playing / error), which is what the E2E flow asserts on: it runs with
 * `--mute-audio`, so there is nothing to hear, only a state to read.
 */
import { useEffect, useState } from 'react';
import {
  grammarExampleAudio,
  normalizeGrammarAudioLang,
  type GrammarAudioSnapshot,
  type GrammarExampleAudio as Player,
} from './grammarAudioPlayer';
import { useGrammarUi } from './grammarUiStrings';
import './grammarAudio.css';

export function useGrammarAudioSnapshot(player: Player = grammarExampleAudio): GrammarAudioSnapshot {
  const [snapshot, setSnapshot] = useState(player.state);
  useEffect(() => {
    setSnapshot(player.state);
    return player.subscribe(setSnapshot);
  }, [player]);
  return snapshot;
}

export default function GrammarExampleAudio({
  text,
  lang,
  player = grammarExampleAudio,
}: {
  /** The example sentence, in the study language. */
  text: string;
  /** The grammar point's language; the example is spoken in it. */
  lang: string | undefined;
  player?: Player;
}) {
  const { gt } = useGrammarUi();
  const snapshot = useGrammarAudioSnapshot(player);
  const audioLang = normalizeGrammarAudioLang(lang);
  // One key per sentence and language: the same sentence in two lists is one clip.
  const key = `${audioLang}:${text}`;
  const mine = snapshot.key === key;
  const status = mine ? snapshot.status : 'idle';

  // Leaving the point (or the list re-rendering without this example) stops it.
  useEffect(() => () => {
    if (player.isActive(key)) player.stop();
  }, [player, key]);

  if (!text.trim()) return null;
  const label =
    status === 'loading' ? gt('grammarUi.audio.loading') : status === 'playing' ? gt('grammarUi.audio.stop') : gt('grammarUi.audio.play');

  return (
    <>
      <button
        type="button"
        className={`gram-ex-audio is-${status}`}
        data-audio-state={status}
        aria-label={label}
        aria-pressed={status === 'playing'}
        title={label}
        onClick={() => void player.toggle(key, text, audioLang)}
      >
        <svg aria-hidden="true" height="14" viewBox="0 0 16 16" width="14">
          <path
            d="M8.5 2.2 4.9 5H2.6a.6.6 0 0 0-.6.6v4.8c0 .33.27.6.6.6h2.3l3.6 2.8a.5.5 0 0 0 .8-.4V2.6a.5.5 0 0 0-.8-.4Z"
            fill="currentColor"
          />
          {status === 'playing' ? (
            <path d="M11 5.5v5M13.5 5.5v5" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.4" />
          ) : (
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
      {status === 'error' && snapshot.errorKey ? (
        <span className="gram-ex-audio-error" role="alert">
          {gt(snapshot.errorKey)}
        </span>
      ) : null}
    </>
  );
}
