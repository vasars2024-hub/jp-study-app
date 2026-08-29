/**
 * The Match practice mode, playable from any local deck.
 *
 * Buttons, not a drag surface: matching is a keyboard-reachable exercise here,
 * every tile is tabbable, and the pair is made by choosing two tiles rather
 * than by pointer precision. Exiting is always one control away — a mode with
 * no way back is the failure this repo keeps finding.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  buildMatchRound,
  matchScore,
  tilesMatch,
  type MatchRound,
  type MatchTile,
} from '../../../shared/flashcardMatch';
import { loadPracticeDeck, type DeckFolderFilter } from '../../flashcardDeck';
import { useT } from '../../i18n';
import './autoAudio.css';

export default function MatchMode({ onExit, deck = 'all' }: {
  onExit?: () => void;
  /** Which local deck this sitting draws from. `all` is the whole collection. */
  deck?: DeckFolderFilter;
}) {
  const { t } = useT();
  const [round, setRound] = useState<MatchRound | null>(null);
  const [startedAt, setStartedAt] = useState(0);
  const [matched, setMatched] = useState<string[]>([]);
  const [picked, setPicked] = useState<MatchTile | null>(null);
  const [wrong, setWrong] = useState<string | null>(null);
  const [misses, setMisses] = useState(0);

  const deal = useCallback((): void => {
    setRound(buildMatchRound(loadPracticeDeck(deck)));
    setStartedAt(Date.now());
    setMatched([]);
    setPicked(null);
    setWrong(null);
    setMisses(0);
  }, [deck]);

  useEffect(() => { deal(); }, [deal]);

  function choose(tile: MatchTile): void {
    if (matched.includes(tile.pairId)) return;
    setWrong(null);
    if (!picked) {
      setPicked(tile);
      return;
    }
    if (picked.id === tile.id) {
      setPicked(null);
      return;
    }
    if (tilesMatch(picked, tile)) {
      setMatched((ids) => [...ids, tile.pairId]);
      setPicked(null);
      return;
    }
    // A miss is shown and counted, never silently swallowed or penalised twice.
    setMisses((count) => count + 1);
    setWrong(tile.id);
    setPicked(null);
  }

  if (!round) return null;

  if (round.refusal) {
    return (
      <fieldset className="auto-reading-options">
        <legend>{t('flash.match.title')}</legend>
        <p className="auto-reading-options__report">
          {round.refusal === 'too-few-cards'
            ? t('flash.match.tooFewCards')
            : t('flash.match.noUsablePairs')}
        </p>
        {onExit && (
          <button type="button" onClick={onExit}>{t('flash.match.exit')}</button>
        )}
      </fieldset>
    );
  }

  const score = matchScore(round.pairs, matched.length, misses, Date.now() - startedAt);

  return (
    <fieldset className="auto-reading-options">
      <legend>{t('flash.match.title')}</legend>
      <p className="muted">{t('flash.match.lead')}</p>

      <div className="flash-match-board">
        {round.tiles.map((tile) => {
          const done = matched.includes(tile.pairId);
          return (
            <button
              key={tile.id}
              type="button"
              className={`flash-match-tile${done ? ' is-matched' : ''}`
                + `${picked?.id === tile.id ? ' is-picked' : ''}`
                + `${wrong === tile.id ? ' is-wrong' : ''}`}
              aria-pressed={picked?.id === tile.id}
              disabled={done}
              onClick={() => choose(tile)}
            >
              {tile.text}
            </button>
          );
        })}
      </div>

      <p className="auto-reading-options__report" aria-live="polite">
        {score.done
          ? t('flash.match.done', {
            pairs: score.pairs,
            misses: score.misses,
            seconds: Math.round(score.elapsedMs / 1000),
          })
          : t('flash.match.progress', { matched: score.matched, pairs: score.pairs })}
        {round.skipped > 0 && ` ${t('flash.match.skipped', { count: round.skipped })}`}
      </p>

      <div className="flash-match-actions">
        <button type="button" onClick={deal}>{t('flash.match.again')}</button>
        {onExit && (
          <button type="button" onClick={onExit}>{t('flash.match.exit')}</button>
        )}
      </div>
    </fieldset>
  );
}
