/**
 * Listen: a deck's clips as a shuffled, hands-free playlist.
 *
 * The companion to an audio sentence deck: every card that has a clip, in the
 * chosen order, each played (optionally more than once) with a pause after it,
 * then the next — no grading, no clicking. Listening first: the sentence is
 * hidden while it plays and, when "show after" is on, revealed in the pause so
 * the ear gets the first try. Cards without audio have nothing to play and are
 * left out; the header says how many that was.
 *
 * Exiting is always one control away, and leaving stops the sound.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { planListenQueue, type ReviewOrder } from '../../../shared/flashcardReview';
import { loadPracticeDeck, type DeckFlashcard, type DeckFolderFilter } from '../../flashcardDeck';
import { cardAudio } from '../../cardAudioPlayback';
import { useT } from '../../i18n';
import { cardContentLang } from '../../studyEnvironment';
import Icon from '../Icons';
import { Button, Group, Select, SwitchRow, ControlRow } from '../ui';

type ListenCard = DeckFlashcard & { reviewGroup: string };

function listenQueue(deck: DeckFolderFilter, order: ReviewOrder): ListenCard[] {
  return planListenQueue(
    loadPracticeDeck(deck).map((card) => ({ ...card, reviewGroup: `${card.bookId ?? card.source}:${card.bookTitle ?? card.folder ?? ''}` })),
    order,
  );
}

async function clipSource(card: DeckFlashcard): Promise<string | null> {
  if (card.audioDataUrl) return card.audioDataUrl;
  if (!card.audioPath) return null;
  try {
    const managed = await window.api.flashcardReadAudio(card.audioPath);
    if (managed.ok && managed.dataUrl) return managed.dataUrl;
    const captured = await window.api.visualNovelReadCaptureAudio?.(card.audioPath);
    return captured?.ok && captured.dataUrl ? captured.dataUrl : null;
  } catch {
    return null;
  }
}

export default function ListenMode({ onExit, deck = 'all' }: {
  onExit?: () => void;
  /** Which local deck this sitting draws from. `all` is the whole collection. */
  deck?: DeckFolderFilter;
}) {
  const { t } = useT();
  const [order, setOrder] = useState<ReviewOrder>('spread');
  const [queue, setQueue] = useState<ListenCard[]>(() => listenQueue(deck, 'spread'));
  const deckSize = useMemo(() => loadPracticeDeck(deck).length, [deck]);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [finished, setFinished] = useState(false);
  const [heard, setHeard] = useState(false);
  const [repeats, setRepeats] = useState(1);
  const [gapSec, setGapSec] = useState(2);
  const [revealAfter, setRevealAfter] = useState(true);
  const [error, setError] = useState('');
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playsRef = useRef(0);
  // Read when a line ends, not when it starts: changing either while a line is
  // playing must not start that line over (it did — the play effect re-ran).
  const repeatsRef = useRef(repeats);
  const gapRef = useRef(gapSec);
  repeatsRef.current = repeats;
  gapRef.current = gapSec;

  const clearTimer = (): void => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
  };
  const stopAudio = useCallback((): void => {
    clearTimer();
    const audio = audioRef.current;
    if (audio) {
      audio.onended = null;
      try { audio.pause(); } catch { /* detached */ }
    }
  }, []);

  useEffect(() => () => stopAudio(), [stopAudio]);

  const reshuffle = (next: ReviewOrder = order): void => {
    stopAudio();
    setQueue(listenQueue(deck, next));
    setIndex(0);
    setFinished(false);
    setHeard(false);
    playsRef.current = 0;
  };

  const advance = useCallback((): void => {
    setHeard(false);
    playsRef.current = 0;
    setIndex((current) => {
      if (current + 1 >= queue.length) {
        setPlaying(false);
        setFinished(true);
        return current;
      }
      return current + 1;
    });
  }, [queue.length]);

  // Play the current card whenever it (or play/pause) changes.
  useEffect(() => {
    if (!playing || finished) return;
    const card = queue[index];
    if (!card) return;
    let alive = true;
    const playbackFailed = (): void => {
      if (!alive) return;
      setError(t('flash.audioPlaybackFailed'));
      // A rejected play never fires `ended`; leave the learner a working retry.
      setPlaying(false);
    };
    cardAudio.stop();
    void clipSource(card).then((src) => {
      if (!alive) return;
      if (!src) {
        setError(t('flash.listen.clipMissing'));
        timerRef.current = setTimeout(advance, 400);
        return;
      }
      setError('');
      const audio = audioRef.current ?? new Audio();
      audioRef.current = audio;
      audio.src = src;
      audio.onended = () => {
        playsRef.current += 1;
        setHeard(true);
        if (playsRef.current < repeatsRef.current) {
          timerRef.current = setTimeout(() => { void audio.play()?.catch(playbackFailed); }, gapRef.current * 1000);
          return;
        }
        timerRef.current = setTimeout(advance, gapRef.current * 1000);
      };
      const started = audio.play();
      if (started && typeof started.catch === 'function') {
        started.catch(playbackFailed);
      }
    });
    return () => {
      alive = false;
      stopAudio();
    };
    // `t` is stable across language switches; the clip does not change with the language.
  }, [playing, finished, index, queue, advance, stopAudio]);

  const go = (delta: number): void => {
    stopAudio();
    setFinished(false);
    setHeard(false);
    playsRef.current = 0;
    setIndex((current) => Math.max(0, Math.min(queue.length - 1, current + delta)));
  };

  const current = queue[index];
  const dropped = deckSize - queue.length;
  // Listening first: hidden until it has been heard (or when the reveal is switched off).
  const showText = !revealAfter || heard || finished;

  if (!queue.length) {
    return (
      <section className="flash-listen" aria-labelledby="flash-listen-title">
        <Group title={<span id="flash-listen-title">{t('flash.listen.title')}</span>}>
          <p className="muted">{t('flash.listen.noAudio')}</p>
          {onExit && <Button onClick={onExit}>{t('flash.listen.exit')}</Button>}
        </Group>
      </section>
    );
  }

  return (
    <section className="flash-listen" aria-labelledby="flash-listen-title" data-listen-index={index} data-listen-total={queue.length}>
      <Group
        title={<span id="flash-listen-title">{t('flash.listen.title')}</span>}
        description={dropped > 0 ? t('flash.listen.dropped', { count: dropped }) : undefined}
      >
        <p className="flash-listen__position muted" role="status">
          {finished
            ? t('flash.listen.finished', { count: queue.length })
            : t('flash.listen.position', { index: index + 1, total: queue.length })}
        </p>
        <div className="flash-listen__card" aria-live="polite">
          {current && showText ? (
            <>
              <span className="flash-listen__sentence" lang={cardContentLang(current)}>
                {current.sentence || current.word}
              </span>
              {current.meaning && <span className="flash-listen__meaning muted">{current.meaning}</span>}
              {current.bookTitle && <span className="flash-listen__source muted">{current.bookTitle}</span>}
            </>
          ) : (
            <span className="flash-listen__hidden muted">
              <Icon name="headphones" size={18} />
              {t('flash.listen.listening')}
            </span>
          )}
        </div>
        {error && <p className="flash-audio-error" role="status">{error}</p>}
        <ControlRow className="flash-listen__controls">
          <Button onClick={() => go(-1)} disabled={index === 0} aria-label={t('flash.listen.previous')}>
            <Icon name="skip-back" size={14} />
          </Button>
          <Button
            variant="primary"
            data-listen-action="toggle"
            onClick={() => {
              if (finished) {
                setFinished(false);
                setIndex(0);
                playsRef.current = 0;
                setPlaying(true);
                return;
              }
              if (playing) stopAudio();
              setPlaying((value) => !value);
            }}
          >
            <Icon name={playing ? 'pause' : 'player'} size={14} />
            {playing ? t('flash.listen.pause') : finished ? t('flash.listen.again') : t('flash.listen.play')}
          </Button>
          <Button onClick={() => go(1)} disabled={index >= queue.length - 1} aria-label={t('flash.listen.next')}>
            <Icon name="skip-forward" size={14} />
          </Button>
          <Button onClick={() => reshuffle()}>
            <Icon name="shuffle" size={14} />
            {t('flash.shuffle')}
          </Button>
        </ControlRow>
        <ControlRow className="flash-listen__options">
          <label>
            {t('flash.reviewOrder')}
            <Select
              value={order}
              onChange={(event) => {
                const next = event.currentTarget.value as ReviewOrder;
                setOrder(next);
                reshuffle(next);
              }}
            >
              <option value="spread">{t('flash.reviewOrder.spread')}</option>
              <option value="by-deck">{t('flash.reviewOrder.byDeck')}</option>
              <option value="source">{t('flash.reviewOrder.source')}</option>
            </Select>
          </label>
          <label>
            {t('flash.listen.repeat')}
            <Select value={String(repeats)} onChange={(event) => setRepeats(Number(event.currentTarget.value))}>
              {[1, 2, 3].map((n) => (
                <option key={n} value={n}>{t('flash.listen.times', { count: n })}</option>
              ))}
            </Select>
          </label>
          <label>
            {t('flash.listen.gap')}
            <Select value={String(gapSec)} onChange={(event) => setGapSec(Number(event.currentTarget.value))}>
              {[1, 2, 4, 6].map((n) => (
                <option key={n} value={n}>{t('flash.listen.seconds', { count: n })}</option>
              ))}
            </Select>
          </label>
        </ControlRow>
        <SwitchRow
          title={t('flash.listen.revealAfter')}
          description={t('flash.listen.revealAfter.desc')}
          checked={revealAfter}
          onChange={(event) => setRevealAfter(event.currentTarget.checked)}
        />
        {onExit && (
          <Button onClick={onExit}>{t('flash.listen.exit')}</Button>
        )}
      </Group>
    </section>
  );
}
