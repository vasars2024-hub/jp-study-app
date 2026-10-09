/**
 * Memory Defragmenter — the due-review session as a disk defragment.
 *
 * The deck is the volume and each card a block, coloured by its real SRS
 * state. Analyze reports fragmentation: the share of scheduled cards that are
 * due. Defragment runs the actual due reviews, most overdue first, one card at
 * a time; every answer goes through `reviewDeckCard`, and the answered card's
 * block is written to the contiguous run growing from the start of the map.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { reviewDeckCard, type DeckFlashcard } from '../../../flashcardDeck';
import type { LocalSrsRating } from '../../../../shared/localSrs';
import {
  analyzeDeck,
  buildBlockMap,
  defragQueue,
  formatPct,
  type BlockState,
  type DeckAnalysis,
} from '../../../aeroMechanics/aeroMechLogic';
import { readMark, writeMark } from '../../../aeroMechanics/aeroMechSettings';
import { AERO_MECH_SESSION_ATTR, wantsStillness } from '../../../aeroMechanics/aeroMechEnv';
import type { AeroDeckSnapshot } from '../../../aeroMechanics/useAeroDeck';
import { playSound } from '../../../audio/soundEngine';
import { useT } from '../../../i18n';
import { LANG_TAGS } from '../../../../shared/i18n/core';
import AeroMechCard from './AeroMechCard';

type Phase = 'idle' | 'analyzing' | 'analyzed' | 'running' | 'paused' | 'done';

const ALL = '__all__';
const UNFILED = '__unfiled__';
const MAX_BLOCKS = 640;
const LEGEND: { state: BlockState; key: string }[] = [
  { state: 'overdue', key: 'aeroMech.defrag.legend.overdue' },
  { state: 'due', key: 'aeroMech.defrag.legend.due' },
  { state: 'learning', key: 'aeroMech.defrag.legend.learning' },
  { state: 'young', key: 'aeroMech.defrag.legend.young' },
  { state: 'mature', key: 'aeroMech.defrag.legend.mature' },
  { state: 'leech', key: 'aeroMech.defrag.legend.leech' },
  { state: 'new', key: 'aeroMech.defrag.legend.new' },
];

function volumeCards(cards: DeckFlashcard[], volume: string): DeckFlashcard[] {
  if (volume === ALL) return cards;
  if (volume === UNFILED) return cards.filter((card) => !card.folder);
  return cards.filter((card) => card.folder === volume);
}

export interface DefragAppProps {
  deck: AeroDeckSnapshot;
  /** A card to put first (balloon "Review now"); starts the pass at once. */
  focusCardId?: string | null;
}

export default function DefragApp({ deck, focusCardId }: DefragAppProps) {
  const { t, lang } = useT();
  const rootRef = useRef<HTMLDivElement>(null);
  const [volume, setVolume] = useState(ALL);
  const [phase, setPhase] = useState<Phase>('idle');
  const [scan, setScan] = useState(1);
  const [report, setReport] = useState<DeckAnalysis | null>(null);
  const [queue, setQueue] = useState<string[]>([]);
  const [index, setIndex] = useState(0);
  const [written, setWritten] = useState<string[]>([]);
  const [answered, setAnswered] = useState(0);
  const [lastRun, setLastRun] = useState(() => readMark('defrag-last'));
  const startedFor = useRef<string | null>(null);

  const now = deck.at || Date.now();
  const cards = useMemo(() => volumeCards(deck.cards, volume), [deck.cards, volume]);
  const analysis = useMemo(() => analyzeDeck(cards, now), [cards, now]);
  const byId = useMemo(() => new Map(deck.cards.map((card) => [card.id, card])), [deck.cards]);

  const volumes = useMemo(() => {
    const folders = [...new Set(deck.cards.map((card) => card.folder).filter((f): f is string => !!f))].sort();
    const list = [{ id: ALL, label: t('aeroMech.defrag.volumeAll') }];
    for (const folder of folders) list.push({ id: folder, label: folder });
    if (folders.length && deck.cards.some((card) => !card.folder)) {
      list.push({ id: UNFILED, label: t('aeroMech.defrag.volumeUnfiled') });
    }
    return list.map((v) => ({ ...v, analysis: analyzeDeck(volumeCards(deck.cards, v.id), now) }));
  }, [deck.cards, lang, now]);

  const current = phase === 'running' ? byId.get(queue[index] ?? '') ?? null : null;
  const cells = useMemo(
    () => buildBlockMap(cards, now, { maxBlocks: MAX_BLOCKS, written, readingId: current?.id ?? null }),
    [cards, now, written, current?.id],
  );

  // The session marker keeps balloons and the screensaver away mid-pass.
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return undefined;
    el.setAttribute(AERO_MECH_SESSION_ATTR, phase === 'running' ? 'on' : 'off');
    return () => el.removeAttribute(AERO_MECH_SESSION_ATTR);
  }, [phase]);

  const finish = useCallback(() => {
    const stamp = String(Date.now());
    writeMark('defrag-last', stamp);
    setLastRun(stamp);
    setPhase('done');
    void playSound('achievement', 'milestone', { volume: 0.7 });
  }, []);

  const analyze = useCallback(() => {
    setReport(null);
    if (wantsStillness()) {
      setScan(1);
      setReport(analyzeDeck(cards, Date.now()));
      setPhase('analyzed');
      return;
    }
    setPhase('analyzing');
    setScan(0);
  }, [cards]);

  // The analysis sweep: a short, stepped reveal of the map (12 steps).
  useEffect(() => {
    if (phase !== 'analyzing') return undefined;
    const id = window.setInterval(() => {
      setScan((s) => {
        const next = Math.min(1, s + 1 / 12);
        if (next >= 1) {
          window.clearInterval(id);
          setReport(analyzeDeck(cards, Date.now()));
          setPhase('analyzed');
        }
        return next;
      });
    }, 85);
    return () => window.clearInterval(id);
  }, [phase, cards]);

  const start = useCallback(
    (focus?: string | null) => {
      const q = defragQueue(cards, Date.now(), focus ?? null);
      setReport(analyzeDeck(cards, Date.now()));
      setScan(1);
      setWritten([]);
      setAnswered(0);
      setQueue(q);
      setIndex(0);
      if (q.length === 0) {
        setPhase('done');
        return;
      }
      setPhase('running');
    },
    [cards],
  );

  // "Review now" from a balloon: start on that card as soon as the deck is in.
  useEffect(() => {
    if (!focusCardId || startedFor.current === focusCardId || deck.cards.length === 0) return;
    startedFor.current = focusCardId;
    setVolume(ALL);
    const q = defragQueue(deck.cards, Date.now(), focusCardId);
    setReport(analyzeDeck(deck.cards, Date.now()));
    setScan(1);
    setWritten([]);
    setAnswered(0);
    setQueue(q);
    setIndex(0);
    setPhase(q.length ? 'running' : 'done');
  }, [deck.cards, focusCardId]);

  const grade = useCallback(
    (rating: LocalSrsRating) => {
      const id = queue[index];
      if (!id) return;
      reviewDeckCard(id, rating);
      setAnswered((n) => n + 1);
      setWritten((w) => (w.includes(id) ? w : [...w, id]));
      // Again comes back once more at the end of the pass, as in Flashcards.
      const nextQueue = rating === 'again' && !queue.slice(index + 1).includes(id) ? [...queue, id] : queue;
      if (nextQueue !== queue) setQueue(nextQueue);
      if (index + 1 >= nextQueue.length) finish();
      else setIndex(index + 1);
    },
    [finish, index, queue],
  );

  const remaining = Math.max(0, queue.length - index);
  const progress = queue.length ? Math.min(1, index / queue.length) : phase === 'done' ? 1 : 0;
  const running = phase === 'running' || phase === 'paused';
  const shownReport = report ?? (phase === 'idle' ? null : analysis);
  const lastRunText = lastRun
    ? new Date(Number(lastRun)).toLocaleString(LANG_TAGS[lang], { dateStyle: 'medium', timeStyle: 'short' })
    : t('aeroMech.defrag.never');

  let status: string;
  if (phase === 'idle') status = t('aeroMech.defrag.status.idle');
  else if (phase === 'analyzing') status = t('aeroMech.defrag.status.analyzing', { pct: Math.round(scan * 100) });
  else if (phase === 'running' && current) {
    status = t('aeroMech.defrag.status.running', { pct: Math.round(progress * 100), word: current.word });
  } else if (phase === 'paused') status = t('aeroMech.defrag.status.paused');
  else if (phase === 'done') {
    status = answered > 0
      ? t('aeroMech.defrag.status.done', { count: answered, pct: analysis.fragmentation })
      : t('aeroMech.defrag.status.clean');
  } else if (shownReport) {
    status = shownReport.recommend
      ? t('aeroMech.defrag.report.should', { pct: shownReport.fragmentation, count: shownReport.dueReviews })
      : t('aeroMech.defrag.report.fine', { pct: shownReport.fragmentation });
  } else status = '';

  const scanned = Math.round(scan * cells.length);

  return (
    <div className="aero-mech-defrag" ref={rootRef}>
      <div className="aero-mech-hero">
        <span className="aero-mech-hero-icon is-defrag" aria-hidden="true">
          <i /><i /><i /><i />
        </span>
        <p>{t('aeroMech.defrag.intro')}</p>
      </div>

      <table className="aero-mech-volumes">
        <thead>
          <tr>
            <th>{t('aeroMech.defrag.col.volume')}</th>
            <th>{t('aeroMech.defrag.col.status')}</th>
            <th>{t('aeroMech.defrag.col.fragmented')}</th>
            <th>{t('aeroMech.defrag.col.cards')}</th>
          </tr>
        </thead>
        <tbody>
          {volumes.map((v, i) => {
            const a = v.analysis;
            const selected = v.id === volume;
            return (
              <tr
                key={v.id}
                className={selected ? 'is-selected' : undefined}
                aria-selected={selected}
                onClick={() => {
                  if (running) return;
                  setVolume(v.id);
                  setPhase('idle');
                  setReport(null);
                  setScan(1);
                }}
              >
                <td>
                  <span className="aero-mech-drive" aria-hidden="true" />
                  {`(${String.fromCharCode(67 + Math.min(i, 23))}:) `}
                  {v.label}
                </td>
                <td>{selected && running ? t('aeroMech.defrag.col.running') : lastRunText}</td>
                <td>{formatPct(a.fragmentation, LANG_TAGS[lang])}</td>
                <td>{a.total}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <section className="aero-mech-map-wrap" aria-label={t('aeroMech.defrag.mapLabel')}>
        <div className="aero-mech-map-label">
          {running || phase === 'done' ? t('aeroMech.defrag.mapDefrag') : t('aeroMech.defrag.mapAnalysis')}
        </div>
        <div className={`aero-mech-map${phase === 'idle' ? ' is-blank' : ''}`} role="img" aria-label={status}>
          {cells.map((cell, i) => {
            const cls = [
              'aero-mech-block',
              `is-${cell.state}`,
              phase === 'analyzing' && i >= scanned ? 'is-unscanned' : '',
              cell.written ? 'is-written' : '',
              cell.written && i === written.length - 1 ? 'is-fresh' : '',
              cell.reading ? 'is-reading' : '',
            ].filter(Boolean).join(' ');
            return <span key={i} className={cls} />;
          })}
          {cells.length === 0 && <span className="aero-mech-map-empty">{t('aeroMech.defrag.empty')}</span>}
        </div>
        <ul className="aero-mech-legend">
          {LEGEND.map((row) => (
            <li key={row.state}>
              <span className={`aero-mech-block is-${row.state}`} aria-hidden="true" />
              {t(row.key)}
              <b>{analysis.counts[row.state]}</b>
            </li>
          ))}
        </ul>
      </section>

      <div className="aero-mech-status" aria-live="polite">
        <span>{status}</span>
        {(running || phase === 'analyzing') && (
          <div className="aero-mech-progress" role="progressbar" aria-label={t(phase === 'analyzing' ? 'aeroMech.defrag.mapAnalysis' : 'aeroMech.defrag.mapDefrag')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((phase === 'analyzing' ? scan : progress) * 100)}>
            <i style={{ transform: `scaleX(${Math.max(0.01, phase === 'analyzing' ? scan : progress)})` }} />
          </div>
        )}
        {running && <small>{t('aeroMech.defrag.remaining', { count: remaining })}</small>}
      </div>

      {phase === 'running' && current && (
        <AeroMechCard key={`${current.id}-${index}`} card={current} mode="review" onGrade={grade} />
      )}

      <div className="aero-mech-footer">
        <button type="button" className="aero-mech-btn" onClick={analyze} disabled={running || phase === 'analyzing' || cards.length === 0}>
          {t('aeroMech.defrag.analyze')}
        </button>
        {!running ? (
          <button
            type="button"
            className="aero-mech-btn is-default"
            onClick={() => start(null)}
            disabled={phase === 'analyzing' || analysis.dueReviews === 0}
          >
            {t('aeroMech.defrag.defragment')}
          </button>
        ) : (
          <>
            <button type="button" className="aero-mech-btn" onClick={() => setPhase(phase === 'paused' ? 'running' : 'paused')}>
              {phase === 'paused' ? t('aeroMech.defrag.resume') : t('aeroMech.defrag.pause')}
            </button>
            <button type="button" className="aero-mech-btn" onClick={finish}>
              {t('aeroMech.defrag.stop')}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
