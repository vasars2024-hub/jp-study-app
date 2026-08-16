/**
 * Recipe 13's own panel: the parameters a deck split needs, and nothing else.
 *
 * It sits beside the tray's kind select rather than inside it because
 * `split-deck` is the one action whose scope is a **named deck** rather than the
 * selection — see `shared/ankiDeckSplit.ts`. A parent deck, an axis and (for
 * frequency) a set of band edges do not fit the one-row form every other kind
 * shares, and putting them there would have offered them to kinds that have no
 * use for them. `split-deck` is deliberately absent from `ACTION_KINDS` for the
 * same reason.
 *
 * The panel queues; it never applies. Everything after Add — the preview, the
 * outcome counts, the refusals, Apply and Undo — is the tray's, unchanged, which
 * is what keeps one tray to one Apply.
 *
 * **Validation is borrowed, not re-implemented.** `deckSplitParameterProblem` is
 * the same function `planChangeTray` blocks on and `planDeckSplit` calls, so the
 * Add button cannot disagree with the refusal the tray would produce.
 */
import { useMemo, useState } from 'react';
import type { AnkiDraftDeck } from '../../../shared/ankiDraft';
import {
  DECK_SPLIT_AXES,
  deckSplitParameterProblem,
  type DeckSplitAxis,
  type DeckSplitParameters,
  type DeckSplitUnmatched,
} from '../../../shared/ankiDeckSplit';
import { useT } from '../../i18n';

const UNMATCHED: readonly DeckSplitUnmatched[] = ['leave', 'collect'];

/**
 * `"1000, 5000"` → `[1000, 5000]`. Anything that is not a positive integer list
 * stays as typed and is rejected by `deckSplitParameterProblem`, which owns the
 * rule — parsing leniently here would let the form and the planner disagree.
 */
function parseBands(text: string): number[] {
  return text
    .split(/[,\s]+/)
    .filter((part) => part !== '')
    .map((part) => (/^\d+$/.test(part) ? Number(part) : Number.NaN));
}

/** The subdeck names a frequency split would mint, in order. */
function bandSegments(bands: readonly number[]): string[] {
  const names: string[] = [];
  let low = 1;
  for (const edge of bands) {
    names.push(`${low}-${edge}`);
    low = edge + 1;
  }
  names.push(`${low}+`);
  return names;
}

export default function DeckWorkbenchSplit({
  decks,
  onQueue,
}: {
  decks: readonly AnkiDraftDeck[];
  onQueue: (params: DeckSplitParameters) => void;
}): JSX.Element {
  const { t } = useT();
  const [axis, setAxis] = useState<DeckSplitAxis>('jlpt');
  const [parentDeckId, setParentDeckId] = useState('');
  const [unmatched, setUnmatched] = useState<DeckSplitUnmatched>('leave');
  const [unmatchedSegment, setUnmatchedSegment] = useState('');
  const [bandText, setBandText] = useState('');

  const params = useMemo<DeckSplitParameters>(
    () => ({
      axis,
      parentDeckId,
      unmatched,
      ...(unmatched === 'collect' ? { unmatchedSegment } : {}),
      ...(axis === 'frequency' ? { bands: parseBands(bandText) } : {}),
    }),
    [axis, parentDeckId, unmatched, unmatchedSegment, bandText],
  );

  const problem = useMemo(
    () => deckSplitParameterProblem(decks, params),
    [decks, params],
  );

  /* A filtered deck holds its cards on loan, so it has none of its own to file.
     Listed and disabled rather than hidden: a user looking for a deck they can
     see in Anki deserves to find out why it cannot be split, not to wonder
     whether the workbench lost it. */
  const filteredCount = decks.filter((deck) => deck.filtered).length;
  const bands = axis === 'frequency' ? parseBands(bandText) : [];
  const bandsValid = axis === 'frequency' && problem !== 'invalid-bands' && bands.length > 0;

  return (
    <section className="wb-tray-split" aria-label={t('ankiWorkbench.tray.split.title')}>
      <h4>{t('ankiWorkbench.tray.split.title')}</h4>
      <p className="muted">{t('ankiWorkbench.tray.split.scope')}</p>

      <div className="wb-tray-split-controls">
        <label>
          {t('ankiWorkbench.tray.split.parent')}
          <select value={parentDeckId} onChange={(e) => setParentDeckId(e.target.value)}>
            <option value="">{t('ankiWorkbench.tray.split.parent.none')}</option>
            {/* Deck names are the collection's own text and are never translated. */}
            {decks.map((deck) => (
              <option key={deck.id} value={deck.id} disabled={deck.filtered}>
                {deck.name}
              </option>
            ))}
          </select>
        </label>

        <label>
          {t('ankiWorkbench.tray.split.axis')}
          <select value={axis} onChange={(e) => setAxis(e.target.value as DeckSplitAxis)}>
            {DECK_SPLIT_AXES.map((value) => (
              <option key={value} value={value}>
                {t(`ankiWorkbench.tray.split.axis.${value}`)}
              </option>
            ))}
          </select>
        </label>

        <label>
          {t('ankiWorkbench.tray.split.unmatched')}
          <select
            value={unmatched}
            onChange={(e) => setUnmatched(e.target.value as DeckSplitUnmatched)}
          >
            {UNMATCHED.map((value) => (
              <option key={value} value={value}>
                {t(`ankiWorkbench.tray.split.unmatched.${value}`)}
              </option>
            ))}
          </select>
        </label>

        {unmatched === 'collect' && (
          <label>
            {t('ankiWorkbench.tray.split.unmatchedSegment')}
            <input
              value={unmatchedSegment}
              placeholder={t('ankiWorkbench.tray.split.unmatchedSegment.hint')}
              onChange={(e) => setUnmatchedSegment(e.target.value)}
            />
          </label>
        )}

        {axis === 'frequency' && (
          <label>
            {t('ankiWorkbench.tray.split.bands')}
            <input
              value={bandText}
              inputMode="numeric"
              placeholder={t('ankiWorkbench.tray.split.bands.hint')}
              onChange={(e) => setBandText(e.target.value)}
            />
          </label>
        )}

        <button
          type="button"
          className="btn"
          disabled={problem !== null}
          onClick={() => onQueue(params)}
        >
          {t('ankiWorkbench.tray.split.add')}
        </button>
      </div>

      {filteredCount > 0 && (
        <p className="muted">
          {t('ankiWorkbench.tray.split.filteredDecks', { count: filteredCount })}
        </p>
      )}

      {/* The band names are shown before the split is queued, because "1000,
          5000" does not obviously mean three decks, and the third one has no
          upper bound at all. Built from the same rule `planDeckSplit` names them
          with. */}
      {bandsValid && (
        <p className="muted">
          {t('ankiWorkbench.tray.split.bands.preview', {
            detail: bandSegments(bands).join(', '),
          })}
        </p>
      )}

      {/* An unchosen deck is a question not yet answered, not an error: the
          select is still showing its own prompt. Every other refusal is stated
          as soon as it is true, rather than waiting for a disabled button to be
          clicked — which it cannot be. */}
      {problem !== null && parentDeckId !== '' && (
        <p className="wb-tray-blocking" role="alert">
          {t('ankiWorkbench.tray.problem.split-refused', {
            detail: t(`ankiWorkbench.tray.split.refusal.${problem}`),
          })}
        </p>
      )}
    </section>
  );
}
