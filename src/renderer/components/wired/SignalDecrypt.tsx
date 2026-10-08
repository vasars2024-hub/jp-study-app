/**
 * DCR — Signal decrypt. A Wired-native review sitting over the real deck.
 *
 * Each due card arrives as glyph noise that resolves in stepped frames (instant
 * under reduced motion); the operator decodes it, then grades with the normal
 * four ratings. Grades go through `reviewDeckCard` — the Flashcards app's own
 * seam — so the schedule, review log, stats and knowledge levels move exactly
 * as they would there. Answers are logged as ACK / NAK packets; consecutive
 * ACKs drive the signal meter; the sitting ends with a transmission report.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useT } from '../../i18n';
import WiredConsole from './WiredConsole';
import { dueDeckCards, loadDeck, reviewDeckCard, type DeckFlashcard } from '../../flashcardDeck';
import type { LocalSrsRating } from '../../../shared/localSrs';
import { loadWiredArchiveSettings } from '../../terminalModeSettings';
import { speak, ttsAvailable } from '../../tts';
import {
  buildPrompt,
  decryptFrame,
  decryptPlan,
  intervalCode,
  logPacket,
  newDecryptSession,
  packetCode,
  signalBars,
  SIGNAL_BARS,
  transmissionReport,
  type DecryptChannel,
  type DecryptSession,
} from '../../wiredMechanics/decrypt';
import { formatLayer, isUnlocked, requiredLayer } from '../../wiredMechanics/layer';
import { getWiredLayerState, refreshWiredLayer, useWiredLayer } from '../../wiredMechanics/layerStore';
import { closeWiredConsole } from '../../wiredMechanics/consoleBus';
import { cardHasOwnMedia, playCardMedia, stopCardMedia, type CardMediaFields } from '../../wiredMechanics/cardMedia';

const SESSION_CAP = 40;
const FORCE_SCAN_SIZE = 10;
const MAX_REQUEUES = 2;

interface QueueItem {
  card: DeckFlashcard;
  requeues: number;
}

type Phase = 'empty' | 'decrypting' | 'armed' | 'revealed' | 'report';

function reducedMotionNow(): boolean {
  if (typeof window === 'undefined') return true;
  return (
    document.documentElement.classList.contains('reduce-motion') ||
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
  );
}

function batteryNow(): boolean {
  return typeof document !== 'undefined' && document.documentElement.dataset.perf === 'battery';
}

function seedFor(id: string, index: number): number {
  let h = index * 97;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h;
}

function buildDueQueue(): QueueItem[] {
  return dueDeckCards(loadDeck())
    .slice(0, SESSION_CAP)
    .map((card) => ({ card, requeues: 0 }));
}

/** No cards due: the ten whose turn comes soonest (new cards last). */
function buildForcedQueue(): QueueItem[] {
  return [...loadDeck()]
    .sort((a, b) => (a.srs?.dueAt ?? Number.MAX_SAFE_INTEGER) - (b.srs?.dueAt ?? Number.MAX_SAFE_INTEGER))
    .slice(0, FORCE_SCAN_SIZE)
    .map((card) => ({ card, requeues: 0 }));
}

const CHANNELS: Array<{ id: DecryptChannel; code: string }> = [
  { id: 'forward', code: 'FWD' },
  { id: 'reverse', code: 'REV' },
  { id: 'cloze', code: 'CLZ' },
];

const GRADES: Array<{ rating: LocalSrsRating; key: string; labelKey: string }> = [
  { rating: 'again', key: '1', labelKey: 'wiredMech.dcr.again' },
  { rating: 'hard', key: '2', labelKey: 'wiredMech.dcr.hard' },
  { rating: 'good', key: '3', labelKey: 'wiredMech.dcr.good' },
  { rating: 'easy', key: '4', labelKey: 'wiredMech.dcr.easy' },
];

function cue(name: 'wired:decrypt' | 'wired:sync-ok' | 'wired:sync-fail'): void {
  window.dispatchEvent(new CustomEvent(name));
}

export default function SignalDecrypt({ stackIndex, top }: { stackIndex: number; top: boolean }) {
  const { t } = useT();
  const { layer } = useWiredLayer();
  const [queue, setQueue] = useState<QueueItem[]>(buildDueQueue);
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>(() => (queue.length ? 'decrypting' : 'empty'));
  const [frame, setFrame] = useState(0);
  const [channel, setChannel] = useState<DecryptChannel>('forward');
  const [session, setSession] = useState<DecryptSession>(() => newDecryptSession());
  const [layerAtStart, setLayerAtStart] = useState(() => getWiredLayerState().layer);
  const [layerAtEnd, setLayerAtEnd] = useState<number | null>(null);
  const [forced, setForced] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const logRef = useRef<HTMLOListElement | null>(null);

  const item = queue[index];
  const plan = useMemo(
    () => decryptPlan(loadWiredArchiveSettings().motionLevel, reducedMotionNow(), batteryNow()),
    // A fresh plan per card picks up a motion setting changed mid-sitting.
    [index, queue],
  );
  const prompt = useMemo(() => (item ? buildPrompt(item.card, channel) : null), [item, channel]);
  const seed = item ? seedFor(item.card.id, index) : 0;

  // Run the stepped decrypt for each new card.
  useEffect(() => {
    if (phase !== 'decrypting' || !item) return undefined;
    if (plan.frames <= 0) {
      setFrame(0);
      setPhase('armed');
      return undefined;
    }
    cue('wired:decrypt');
    setFrame(0);
    let f = 0;
    const id = window.setInterval(() => {
      f += 1;
      setFrame(f);
      if (f >= plan.frames) {
        window.clearInterval(id);
        setPhase('armed');
      }
    }, plan.frameMs);
    return () => window.clearInterval(id);
  }, [phase, item, plan]);

  useEffect(() => {
    rootRef.current?.focus();
  }, []);

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [session.packets.length]);

  const reveal = useCallback(() => {
    if (phase === 'decrypting') {
      // Impatient operator: skip straight to the plaintext.
      setFrame(plan.frames);
      setPhase('armed');
      return;
    }
    if (phase === 'armed') setPhase('revealed');
  }, [phase, plan.frames]);

  const finish = useCallback(() => {
    refreshWiredLayer(true);
    setLayerAtEnd(getWiredLayerState().layer);
    setPhase('report');
  }, []);

  const grade = useCallback(
    (rating: LocalSrsRating) => {
      if (phase !== 'revealed' || !item) return;
      const cards = reviewDeckCard(item.card.id, rating);
      const after = cards.find((c) => c.id === item.card.id);
      setSession((s) =>
        logPacket(s, { word: item.card.word || item.card.front || '?', rating, intervalDays: after?.srs?.intervalDays ?? 0 }),
      );
      cue(rating === 'again' ? 'wired:sync-fail' : 'wired:sync-ok');
      let nextQueue = queue;
      if (rating === 'again' && item.requeues < MAX_REQUEUES) {
        nextQueue = [...queue, { card: after ?? item.card, requeues: item.requeues + 1 }];
        setQueue(nextQueue);
      }
      if (index + 1 >= nextQueue.length) {
        finish();
        return;
      }
      setIndex(index + 1);
      setPhase('decrypting');
    },
    [finish, index, item, phase, queue],
  );

  const restart = useCallback((force: boolean) => {
    const next = force ? buildForcedQueue() : buildDueQueue();
    setForced(force);
    setQueue(next);
    setIndex(0);
    setSession(newDecryptSession());
    setLayerAtStart(getWiredLayerState().layer);
    setLayerAtEnd(null);
    setPhase(next.length ? 'decrypting' : 'empty');
    rootRef.current?.focus();
  }, []);

  const play = useCallback(() => {
    if (!item || phase !== 'revealed') return;
    const card = item.card;
    // The card's own mined clip or line audio first; the OS voice when it has none or it fails.
    void playCardMedia(card as CardMediaFields, () => speak(card.reading || card.word, 'ja'));
  }, [item, phase]);

  // Leaving a card (grade, new sitting) or the console silences its playback.
  useEffect(() => stopCardMedia, [item]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    if ((e.target as HTMLElement).closest('button') && (e.key === 'Enter' || e.key === ' ')) return;
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      reveal();
      return;
    }
    if (phase === 'revealed') {
      const g = GRADES.find((x) => x.key === e.key);
      if (g) {
        e.preventDefault();
        grade(g.rating);
        return;
      }
      if (e.key.toLowerCase() === 'p') play();
    }
  };

  const bars = signalBars(session.signal);
  const report = phase === 'report' ? transmissionReport(session) : null;
  const card = item?.card;
  const meaning = card ? card.meaning || card.back || '' : '';
  const word = card ? card.word || card.front || '' : '';
  const shownPrompt = prompt ? decryptFrame(prompt.prompt, phase === 'decrypting' ? frame : plan.frames, plan.frames, seed) : '';
  const remaining = Math.max(0, queue.length - index);

  return (
    <WiredConsole
      id="decrypt"
      code="DCR"
      title={t('wiredMech.dcr.title')}
      width={760}
      stackIndex={stackIndex}
      top={top}
      className="wmc-dcr"
      onClose={() => {
        stopCardMedia();
        window.speechSynthesis?.cancel?.();
      }}
      status={
        <>
          <span>{t('wiredMech.dcr.queue', { left: remaining, total: queue.length })}</span>
          <span>CH:{CHANNELS.find((c) => c.id === (prompt?.channel ?? channel))?.code}</span>
          <span className="wmc-status-right">{formatLayer(layer)}</span>
        </>
      }
    >
      <div className="wmc-dcr-grid" ref={rootRef} tabIndex={-1} onKeyDown={onKeyDown}>
        <div className="wmc-dcr-main">
          <div className="wmc-dcr-channels" role="group" aria-label={t('wiredMech.dcr.channel')}>
            {CHANNELS.map((c) => {
              const open = isUnlocked(layer, 'channel', c.id) || c.id === 'forward';
              return (
                <button
                  key={c.id}
                  type="button"
                  className={`wmc-seg${channel === c.id ? ' is-on' : ''}`}
                  aria-pressed={channel === c.id}
                  disabled={!open}
                  title={open ? t(`wiredMech.dcr.ch.${c.id}`) : t('wiredMech.term.sealedUntil', { layer: formatLayer(requiredLayer('channel', c.id)) })}
                  onClick={() => setChannel(c.id)}
                >
                  {c.code}
                </button>
              );
            })}
            <span className="wmc-dcr-meter" aria-label={t('wiredMech.dcr.signal', { count: session.signal })} role="meter" aria-valuemin={0} aria-valuemax={SIGNAL_BARS} aria-valuenow={bars}>
              {Array.from({ length: SIGNAL_BARS }, (_, i) => (
                <i key={i} className={i < bars ? 'on' : ''} />
              ))}
            </span>
          </div>

          {phase === 'empty' && (
            <div className="wmc-dcr-empty">
              <strong>{t('wiredMech.dcr.noCarrier')}</strong>
              <p>{loadDeck().length ? t('wiredMech.dcr.noneDue') : t('wiredMech.dcr.emptyDeck')}</p>
              <div className="wmc-row">
                {loadDeck().length > 0 && (
                  <button type="button" className="wmc-btn" onClick={() => restart(true)}>
                    {t('wiredMech.dcr.forceScan', { count: FORCE_SCAN_SIZE })}
                  </button>
                )}
                <button type="button" className="wmc-btn is-ghost" onClick={() => closeWiredConsole('decrypt')}>
                  {t('wiredMech.console.close')}
                </button>
              </div>
            </div>
          )}

          {(phase === 'decrypting' || phase === 'armed' || phase === 'revealed') && card && prompt && (
            <div className={`wmc-dcr-packet is-${phase}`}>
              <div className="wmc-dcr-kicker">
                <span>{packetCode(session.packets.length + 1)}</span>
                <span>{phase === 'decrypting' ? t('wiredMech.dcr.decrypting') : phase === 'armed' ? t('wiredMech.dcr.armed') : t('wiredMech.dcr.decoded')}</span>
                {forced && <span className="is-amber">{t('wiredMech.dcr.forced')}</span>}
              </div>
              <div className="wmc-dcr-prompt" lang={prompt.promptIsTarget ? 'ja' : undefined} aria-live="polite">
                {shownPrompt}
              </div>
              {phase === 'revealed' ? (
                <div className="wmc-dcr-answer">
                  {prompt.channel !== 'forward' && (
                    <div className="wmc-dcr-word" lang="ja">
                      {word}
                    </div>
                  )}
                  {card.reading && card.reading !== word && (
                    <div className="wmc-dcr-reading" lang="ja">
                      {card.reading}
                    </div>
                  )}
                  {prompt.channel !== 'reverse' && meaning && <div className="wmc-dcr-meaning">{meaning}</div>}
                  {card.sentence && (
                    <div className="wmc-dcr-sentence" lang="ja">
                      {card.sentence}
                    </div>
                  )}
                </div>
              ) : (
                <button type="button" className="wmc-btn wmc-dcr-decode" onClick={reveal}>
                  {t('wiredMech.dcr.decode')} <kbd>SPACE</kbd>
                </button>
              )}
              {phase === 'revealed' && (
                <div className="wmc-dcr-grades">
                  {GRADES.map((g) => (
                    <button
                      key={g.rating}
                      type="button"
                      className={`wmc-btn wmc-grade is-${g.rating}`}
                      onClick={() => grade(g.rating)}
                    >
                      <kbd>{g.key}</kbd> {g.rating === 'again' ? 'NAK' : 'ACK'} · {t(g.labelKey)}
                    </button>
                  ))}
                  {(ttsAvailable() || cardHasOwnMedia(card as CardMediaFields)) && (
                    <button type="button" className="wmc-btn is-ghost" onClick={play}>
                      <kbd>P</kbd> {t('wiredMech.dcr.play')}
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {phase === 'report' && report && (
            <div className="wmc-dcr-report" role="status">
              <div className="wmc-dcr-kicker">
                <span>{t('wiredMech.dcr.reportTitle')}</span>
              </div>
              <dl>
                <dt>{t('wiredMech.dcr.sent')}</dt>
                <dd>{report.sent}</dd>
                <dt>ACK / NAK</dt>
                <dd>
                  {report.ack} / {report.nak}
                </dd>
                <dt>{t('wiredMech.dcr.accuracy')}</dt>
                <dd>{report.accuracy}%</dd>
                <dt>{t('wiredMech.dcr.peak')}</dt>
                <dd>{report.peakSignal}</dd>
                <dt>{t('wiredMech.dcr.elapsed')}</dt>
                <dd>
                  {String(Math.floor(report.elapsedSec / 60)).padStart(2, '0')}:{String(report.elapsedSec % 60).padStart(2, '0')}
                </dd>
                <dt>{t('wiredMech.dcr.depth')}</dt>
                <dd>
                  {formatLayer(layerAtStart)}
                  {layerAtEnd !== null && layerAtEnd > layerAtStart ? ` → ${formatLayer(layerAtEnd)}` : ''}
                </dd>
              </dl>
              <div className="wmc-row">
                <button type="button" className="wmc-btn" onClick={() => restart(false)}>
                  {t('wiredMech.dcr.newSession')}
                </button>
                <button type="button" className="wmc-btn is-ghost" onClick={() => closeWiredConsole('decrypt')}>
                  {t('wiredMech.console.close')}
                </button>
              </div>
            </div>
          )}
        </div>

        <aside className="wmc-dcr-log" aria-label={t('wiredMech.dcr.log')}>
          <header>{t('wiredMech.dcr.log')}</header>
          <ol ref={logRef}>
            {session.packets.map((p) => (
              <li key={p.seq} className={p.kind === 'ACK' ? 'is-ack' : 'is-nak'}>
                <span>{packetCode(p.seq)}</span>
                <b>{p.kind}</b>
                <span lang="ja">{p.word}</span>
                <i>{p.kind === 'ACK' ? intervalCode(p.intervalDays) : 'RESYNC'}</i>
              </li>
            ))}
          </ol>
        </aside>
      </div>
    </WiredConsole>
  );
}
