import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useT } from '../../i18n';
import { useAppMaterialSet } from '../ui';
import * as player from '../../playerBus';
import { useLiveLyrics } from '../../liveLyrics';
import { hasDiscoveredWired, onWiredDiscoveryChanged } from '../../wiredDiscovery';
import {
  isSummonPresent,
  toggleSummonedCompanion,
  usePointerParallax,
  useFindingReadouts,
} from '../../findingReadouts';
import type { VerdictAction } from '../../findingModules';
import {
  loadWiredArchiveSettings,
  onWiredArchiveSettingsChanged,
  type WiredFindingFeature,
} from '../../terminalModeSettings';
import wiredFaceUrl from '../../assets/wired-lain-reference.jpg';
import WiredLyricStream from './WiredLyricStream';
import WiredLyricPreview from './WiredLyricPreview';
import { SYSTEM_METADATA } from '../../lyricTransmission';

function cleanLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function maskLine(text: string): string {
  const src = cleanLine(text);
  if (!src) return '';
  const parts = src.split(' ');
  if (parts.length <= 1) return `${src.slice(0, Math.max(1, Math.floor(src.length * 0.55)))} ____`;
  return `${parts.slice(0, -1).join(' ')} ____`;
}

const MATRIX_GLYPHS = 'あいうえおかきくけこさしすせそたちつてとなにぬねのまみむめもやゆよらりるれろわをん';

function glitchText(text: string, seed: number): string {
  const src = cleanLine(text);
  if (!src) return '';
  return [...src]
    .map((ch, i) => {
      if (/\s/.test(ch)) return ch;
      const n = seed + i * 13;
      if (n % 17 === 0) return MATRIX_GLYPHS[n % MATRIX_GLYPHS.length];
      if (n % 29 === 0) return '・';
      if (n % 43 === 0) return '█';
      return ch;
    })
    .join('');
}

function kanaFlow(seed: number, length = 64): string {
  let out = '';
  for (let i = 0; i < length; i++) {
    out += MATRIX_GLYPHS[(seed + i * 11) % MATRIX_GLYPHS.length];
    if (i % 6 === 5) out += ' ';
  }
  return out;
}

const RADAR_NODES = [
  { x: 18, y: 26, label: 'node-01' },
  { x: 58, y: 18, label: 'node-02' },
  { x: 80, y: 52, label: 'node-03' },
  { x: 34, y: 72, label: 'node-04' },
  { x: 66, y: 84, label: 'node-05' },
];

/**
 * Geometry for the ambient layers.
 *
 * Computed once and never regenerated. The previous version rebuilt these on a
 * 180ms tick, which restarted every CSS animation mid-flight — the particles
 * stuttered in place instead of drifting, and the whole overlay re-rendered
 * five times a second. Motion belongs to CSS; the DOM here is static.
 */
const PARTICLES = Array.from({ length: 26 }, (_, i) => {
  const seed = (i * 73 + 19) % 1000;
  return {
    left: (seed % 1000) / 10,
    top: ((seed * 47) % 1000) / 10,
    delay: (seed % 900) / 1000,
    duration: 4.5 + ((seed * 29) % 240) / 100,
    size: 2 + (seed % 4),
  };
});

const MATRIX_COLUMNS = Array.from({ length: 10 }, (_, i) => ({
  id: i,
  left: 4 + i * 8.8,
  delay: i * 0.22,
  duration: 14 + (i % 3) * 2.4,
  text: kanaFlow(i * 13, 72),
}));

/** Fiction codes for the MAGI units — content-neutral, deliberately literal. */
const MAGI_UNIT_CODES = {
  balthasar: 'BALTHASAR-2',
  melchior: 'MELCHIOR-1',
  casper: 'CASPER-3',
} as const;

/** Synthetic per-line window for untimed (plain) lyrics, so the transmission
 *  still travels continuously instead of sitting frozen mid-screen. */
const LYRIC_BUCKET_SECONDS = 6.4;

export default function WiredFindingOverlay() {
  const { t, lang } = useT();
  const material = useAppMaterialSet();
  const wired = material === 'wired';
  const [discovered, setDiscovered] = useState(hasDiscoveredWired);
  const [wiredSettings, setWiredSettings] = useState(() => loadWiredArchiveSettings());
  const [state, setState] = useState(player.getState);
  const [terminal, setTerminal] = useState<string[]>([]);
  const [answer, setAnswer] = useState('');
  const [glitchSeed, setGlitchSeed] = useState(0);
  const [summoned, setSummoned] = useState(false);
  const [vkPick, setVkPick] = useState<number | null>(null);
  const [ghostOpen, setGhostOpen] = useState(false);
  const [railEntries, setRailEntries] = useState<{ id: number; text: string; kind: 'semantic' | 'metadata' }[]>([]);
  const railIdRef = useRef(0);
  const metaCursorRef = useRef(0);

  useEffect(() => onWiredDiscoveryChanged(setDiscovered), []);
  useEffect(() => onWiredArchiveSettingsChanged(setWiredSettings), []);
  useEffect(() => player.subscribe(setState), []);

  const live = useLiveLyrics(state.current, state.duration, state.time);

  // The overlay itself no longer waits on lyrics. Only the two lyric-driven
  // modules do — the eye, the radar and the study instruments have nothing to
  // do with music, and gating them behind a synced track made most of the
  // feature set unreachable.
  const enabled = wired && discovered && wiredSettings.findingOverlayEnabled;
  const hasLyrics = live.lyrics.kind === 'synced' || live.lyrics.kind === 'plain';
  const featureOn = useCallback(
    (id: WiredFindingFeature) => wiredSettings.findingFeatures.includes(id),
    [wiredSettings.findingFeatures],
  );

  const idle = wiredSettings.idleAnimations && wiredSettings.motionLevel !== 'off';
  const readouts = useFindingReadouts(enabled);
  const parallaxRef = usePointerParallax<HTMLDivElement>(enabled);

  useEffect(() => {
    setTerminal([t('wired.found.term.scan'), t('wired.found.term.waiting')]);
  }, [lang, t]);

  useEffect(() => setSummoned(isSummonPresent('wired')), [enabled]);

  const lines = useMemo(() => {
    if (live.lyrics.kind === 'synced') {
      const current = live.activeIndex >= 0 ? live.lyrics.cues[live.activeIndex]?.text ?? '' : live.lyrics.cues[0]?.text ?? '';
      const all = live.lyrics.cues.slice(0, 3).map((cue) => cue.text).filter(Boolean);
      return { current: cleanLine(current), all };
    }
    if (live.lyrics.kind === 'plain') {
      const all = live.lyrics.lines.slice(0, 3);
      return { current: cleanLine(all[0] ?? ''), all };
    }
    return { current: '', all: [] as string[] };
  }, [live.activeIndex, live.lyrics]);

  const reducedMotion = useMemo(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true,
    [],
  );

  // The line currently being transmitted. Synced lyrics use their real cue
  // window; plain (untimed) lyrics get a synthetic clock (see
  // LYRIC_BUCKET_SECONDS) so the stream still travels continuously instead
  // of sitting frozen mid-screen.
  const lyricLine = useMemo(() => {
    if (live.lyrics.kind === 'synced' && live.activeIndex >= 0) {
      const cue = live.lyrics.cues[live.activeIndex];
      const text = cleanLine(cue.text);
      if (!text) return null;
      const end = Math.max(cue.start + 1.2, Math.min(cue.end, cue.start + 11));
      return { key: `synced:${live.activeIndex}`, text, start: cue.start, end };
    }
    const pool =
      live.lyrics.kind === 'plain'
        ? live.lyrics.lines
        : live.lyrics.kind === 'synced'
          ? live.lyrics.cues.slice(0, 3).map((c) => c.text).filter(Boolean)
          : [];
    if (!pool.length) return null;
    const bucket = Math.floor(state.time / LYRIC_BUCKET_SECONDS);
    const text = cleanLine(pool[((bucket % pool.length) + pool.length) % pool.length]);
    if (!text) return null;
    return {
      key: `plain:${bucket}`,
      text,
      start: bucket * LYRIC_BUCKET_SECONDS,
      end: (bucket + 1) * LYRIC_BUCKET_SECONDS,
    };
  }, [live.lyrics, live.activeIndex, state.time]);

  // The "back lane" conveyor: the line arriving NEXT, mirrored and small,
  // bound to the exact same time window as the current front line. It always
  // reaches the far edge right as the front line finishes exiting — what was
  // small and backwards back here is what shows up big and readable next.
  const nextLyricLine = useMemo(() => {
    if (!lyricLine) return null;
    if (live.lyrics.kind === 'synced' && live.activeIndex >= 0) {
      const cue = live.lyrics.cues[live.activeIndex + 1];
      const text = cue ? cleanLine(cue.text) : '';
      return text ? { text, start: lyricLine.start, end: lyricLine.end } : null;
    }
    const pool =
      live.lyrics.kind === 'plain'
        ? live.lyrics.lines
        : live.lyrics.kind === 'synced'
          ? live.lyrics.cues.slice(0, 3).map((c) => c.text).filter(Boolean)
          : [];
    if (!pool.length) return null;
    const bucket = Math.floor(state.time / LYRIC_BUCKET_SECONDS) + 1;
    const text = cleanLine(pool[((bucket % pool.length) + pool.length) % pool.length]);
    return text ? { text, start: lyricLine.start, end: lyricLine.end } : null;
  }, [lyricLine, live.lyrics, live.activeIndex, state.time]);

  // Rail entries self-expire — the analysis rail should read as a live feed,
  // not an ever-growing log.
  const pushRail = useCallback((text: string, kind: 'semantic' | 'metadata') => {
    railIdRef.current += 1;
    const id = railIdRef.current;
    setRailEntries((prev) => [...prev.slice(-5), { id, text, kind }]);
    window.setTimeout(() => {
      setRailEntries((prev) => prev.filter((e) => e.id !== id));
    }, 9000);
  }, []);
  const handleLyricArchive = useCallback((fragment: string) => pushRail(fragment, 'semantic'), [pushRail]);
  const handleLyricMetadata = useCallback(() => {
    const label = SYSTEM_METADATA[metaCursorRef.current % SYSTEM_METADATA.length];
    metaCursorRef.current += 1;
    pushRail(label, 'metadata');
  }, [pushRail]);

  const pushTerminal = useCallback((line: string) => {
    setTerminal((prev) => [...prev.slice(-12), line]);
  }, []);

  useEffect(() => {
    if (!enabled || !state.current) return;
    setAnswer('');
    pushTerminal(`> ${t('wired.found.term.tune')} ${cleanLine(state.current.title ?? state.current.fileName ?? '')}`);
  }, [enabled, pushTerminal, state.current, t]);

  // The glitch tick drives text distortion only. It is deliberately separate
  // from any input state: the old version listed `answer` alongside the
  // interval, so every keystroke tore the timer down and rebuilt it.
  useEffect(() => {
    if (!enabled || !idle) return undefined;
    const tick = window.setInterval(() => setGlitchSeed((n) => n + 1), 320);
    return () => window.clearInterval(tick);
  }, [enabled, idle]);

  const guideText = lines.current ? maskLine(lines.current) : t('wired.found.guideFallback');
  const sourceLine = lines.current || lines.all[0] || '';

  const submitGuess = useCallback(() => {
    const target = cleanLine(lines.current || lines.all[0] || '');
    const ok = !!target && cleanLine(answer).toLowerCase() === target.toLowerCase();
    pushTerminal(ok ? `> ${t('wired.found.term.granted')}` : `> ${t('wired.found.term.mismatch')}`);
    setAnswer('');
  }, [answer, lines.all, lines.current, pushTerminal, t]);

  const onSummon = useCallback(() => {
    const now = toggleSummonedCompanion('wired');
    setSummoned(now);
    pushTerminal(`> ${now ? t('wired.found.summon.on') : t('wired.found.summon.off')}`);
  }, [pushTerminal, t]);

  const verdictLabel = useCallback(
    (action: VerdictAction) => t(`wired.found.magi.action.${action}`),
    [t],
  );

  const challenge = readouts.challenge;
  const onVkPick = useCallback(
    (index: number) => {
      if (!challenge || vkPick !== null) return;
      setVkPick(index);
      pushTerminal(
        `> ${index === challenge.answerIndex ? t('wired.found.vk.correct') : t('wired.found.vk.wrong')}`,
      );
    },
    [challenge, pushTerminal, t, vkPick],
  );

  const nextChallenge = useCallback(() => {
    setVkPick(null);
    readouts.reroll();
  }, [readouts.reroll]);

  const protocolsOn =
    featureOn('magiVote') ||
    featureOn('voightKampff') ||
    featureOn('akiraCapsule') ||
    featureOn('ghostProtocol') ||
    featureOn('bebopBounty') ||
    featureOn('wiredShimeji');

  if (!enabled) return null;

  return (
    <div className="wired-found-overlay" ref={parallaxRef}>
      {featureOn('particleAtmosphere') && idle && (
        <div className="wired-found-matrix" aria-hidden="true">
          {MATRIX_COLUMNS.map((col) => (
            <div
              key={col.id}
              className="wired-found-matrix-col"
              style={{
                left: `${col.left}%`,
                animationDelay: `${col.delay}s`,
                animationDuration: `${col.duration}s`,
              }}
            >
              {col.text}
            </div>
          ))}
        </div>
      )}

      {featureOn('lyricRibbon') && hasLyrics && lyricLine && (
        <div className="wlyric-stage" aria-hidden="true">
          {nextLyricLine && (
            <WiredLyricPreview
              key={lyricLine.key}
              text={nextLyricLine.text}
              cueStart={nextLyricLine.start}
              cueEnd={nextLyricLine.end}
              motionLevel={wiredSettings.motionLevel}
              reducedMotion={reducedMotion}
            />
          )}
          <WiredLyricStream
            key={lyricLine.key}
            text={lyricLine.text}
            cueStart={lyricLine.start}
            cueEnd={lyricLine.end}
            motionLevel={wiredSettings.motionLevel}
            reducedMotion={reducedMotion}
            onArchive={handleLyricArchive}
            onMetadata={handleLyricMetadata}
          />
        </div>
      )}

      {featureOn('lyricRibbon') && hasLyrics && (
        <aside
          className="wired-found-lyric-rail wired-found-panel"
          aria-label={t('wired.found.ariaLyricRail')}
        >
          <header>{t('wired.found.lyricRail.title')}</header>
          <ul>
            {railEntries.map((entry) => (
              <li key={entry.id} className={`is-${entry.kind}`} lang={entry.kind === 'semantic' ? 'ja' : undefined}>
                {entry.text}
              </li>
            ))}
          </ul>
        </aside>
      )}

      {featureOn('hackerTerminal') && (
        <aside className="wired-found-terminal wired-found-panel">
          <div className="wired-found-terminal-body">
            <div className="wired-found-terminal-glass" />
            {terminal.map((line, i) => (
              <div
                key={`${line}-${i}`}
                className={`wired-found-terminal-line${i === terminal.length - 1 ? ' is-current' : ''}`}
              >
                {line}
              </div>
            ))}
          </div>
        </aside>
      )}

      {featureOn('naviGuide') && hasLyrics && (
        <section className="wired-found-guide wired-found-panel" aria-label={t('wired.found.ariaGuide')}>
          <div className="wired-found-guide-face" aria-hidden="true">
            <img className="wired-found-guide-image" src={wiredFaceUrl} alt="" draggable={false} />
            <span className="wired-found-guide-glitch wired-found-guide-glitch-a" />
            <span className="wired-found-guide-glitch wired-found-guide-glitch-b" />
            <span className="wired-found-guide-scan" />
          </div>
          <div className="wired-found-guide-copy">
            <strong>{t('wired.found.guideTitle')}</strong>
            <span>{guideText}</span>
          </div>
          {/* Typing is captured by this input alone. The previous build listened
              on `window`, swallowing Enter/Backspace and every printable key
              across the entire app while the overlay was open. */}
          <form
            className="wired-found-guide-input"
            onSubmit={(e) => {
              e.preventDefault();
              submitGuess();
            }}
          >
            <span>{t('wired.found.answerLabel')}</span>
            <input
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder={t('wired.found.answerPlaceholder')}
            />
          </form>
        </section>
      )}

      {featureOn('surveillanceEye') && (
        <section className="wired-found-eye wired-found-panel" aria-label={t('wired.found.ariaEye')}>
          <div className="wired-found-eye-core">
            <div className="wired-found-eye-iris" />
            <div className="wired-found-eye-glint" />
          </div>
          <div className="wired-found-eye-copy">{t('wired.found.eyeNote')}</div>
        </section>
      )}

      {featureOn('networkMap') && (
        <section className="wired-found-map wired-found-panel" aria-label={t('wired.found.ariaMap')}>
          <div className="wired-found-map-canvas">
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              {RADAR_NODES.map((node, idx) => {
                const prev = idx > 0 ? RADAR_NODES[idx - 1] : null;
                return (
                  <g key={node.label}>
                    {prev && <line x1={prev.x} y1={prev.y} x2={node.x} y2={node.y} />}
                    <circle cx={node.x} cy={node.y} r="2.1" />
                  </g>
                );
              })}
            </svg>
            {RADAR_NODES.map((node) => (
              <span key={node.label} className="wired-found-map-node" style={{ left: `${node.x}%`, top: `${node.y}%` }}>
                {node.label}
              </span>
            ))}
            <span className="wired-found-map-sweep" />
          </div>
        </section>
      )}

      {featureOn('networkRadar') && (
        <section className="wired-found-radar wired-found-panel" aria-label={t('wired.found.ariaRadar')}>
          <div className="wired-found-radar-core">
            <span className="wired-found-radar-ring" />
            <span className="wired-found-radar-ring" />
            <span className="wired-found-radar-sweep" />
            <span className="wired-found-radar-point" />
          </div>
        </section>
      )}

      {featureOn('particleAtmosphere') && idle && (
        <section className="wired-found-particles" aria-hidden="true">
          {PARTICLES.map((p, i) => (
            <span
              key={i}
              className="wired-found-particle"
              style={{
                left: `${p.left}%`,
                top: `${p.top}%`,
                animationDelay: `${p.delay}s`,
                animationDuration: `${p.duration}s`,
                width: `${p.size}px`,
                height: `${p.size}px`,
              }}
            />
          ))}
        </section>
      )}

      {protocolsOn && (
        <section className="wired-found-protocols" aria-label={t('wired.found.ariaProtocols')}>
          {/* MAGI deliberation — three units read three different signals from
              the real session (backlog, deck growth, fatigue) and vote. */}
          {featureOn('magiVote') && (
            <article className="wired-found-protocol wired-found-magi">
              <header>
                <span>{t('wired.found.magi.title')}</span>
                <strong>
                  {t('wired.found.magi.consensus', {
                    agree: readouts.verdict.agreement,
                    total: readouts.verdict.total,
                    action: verdictLabel(readouts.verdict.consensus),
                  })}
                </strong>
              </header>
              <ul className="wired-found-magi-units">
                {readouts.verdict.units.map((unit) => (
                  <li
                    key={unit.id}
                    className={unit.vote === readouts.verdict.consensus ? 'is-agree' : 'is-dissent'}
                  >
                    <b>{MAGI_UNIT_CODES[unit.id]}</b>
                    <i>{verdictLabel(unit.vote)}</i>
                  </li>
                ))}
              </ul>
            </article>
          )}

          {/* Voight-Kampff — a reading test on the user's own kanji. The
              interrogation framing is the joke; the question is real. */}
          {featureOn('voightKampff') && (
            <article className="wired-found-protocol wired-found-vk">
              <header>
                <span>{t('wired.found.vk.title')}</span>
                {challenge && <strong>{challenge.meaning}</strong>}
              </header>
              {challenge ? (
                <>
                  <div className="wired-found-vk-word" lang="ja">
                    {challenge.word}
                  </div>
                  <ul className="wired-found-vk-choices">
                    {challenge.choices.map((choice, i) => {
                      const revealed = vkPick !== null;
                      const isAnswer = i === challenge.answerIndex;
                      const cls = !revealed
                        ? ''
                        : isAnswer
                          ? ' is-correct'
                          : i === vkPick
                            ? ' is-wrong'
                            : '';
                      return (
                        <li key={choice}>
                          <button
                            type="button"
                            className={`wired-found-vk-choice${cls}`}
                            onClick={() => onVkPick(i)}
                            disabled={revealed}
                            lang="ja"
                          >
                            {choice}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                  {vkPick !== null && (
                    <button type="button" className="wired-found-vk-next" onClick={nextChallenge}>
                      {t('wired.found.vk.next')}
                    </button>
                  )}
                </>
              ) : (
                <p className="wired-found-empty">{t('wired.found.vk.empty')}</p>
              )}
            </article>
          )}

          {/* Capsule sync — today's study time against a 30-minute target. */}
          {featureOn('akiraCapsule') && (
            <article className="wired-found-protocol wired-found-capsule" data-band={readouts.gauge.band}>
              <header>
                <span>{t('wired.found.capsule.title')}</span>
                <strong>{Math.round(readouts.gauge.pct * 100)}%</strong>
              </header>
              <div className="wired-found-capsule-bar">
                <i style={{ transform: `scaleX(${Math.max(0.02, readouts.gauge.pct)})` }} />
              </div>
              <footer>
                <span>{t(`wired.found.capsule.band.${readouts.gauge.band}`)}</span>
                <span>{t('wired.found.capsule.streak', { count: readouts.gauge.streak })}</span>
              </footer>
            </article>
          )}

          {/* Ghost line — one term from the deck, meaning withheld until asked. */}
          {featureOn('ghostProtocol') && (
            <article className="wired-found-protocol wired-found-ghost">
              <header>
                <span>{t('wired.found.ghost.title')}</span>
              </header>
              {readouts.intercepted ? (
                <>
                  <div className="wired-found-ghost-term" lang="ja">
                    {readouts.intercepted.word}
                    {readouts.intercepted.reading && <em>{readouts.intercepted.reading}</em>}
                  </div>
                  <button
                    type="button"
                    className="wired-found-ghost-reveal"
                    onClick={() => setGhostOpen((v) => !v)}
                  >
                    {ghostOpen ? readouts.intercepted.meaning : t('wired.found.ghost.decrypt')}
                  </button>
                </>
              ) : (
                <p className="wired-found-empty">{t('wired.found.ghost.empty')}</p>
              )}
            </article>
          )}

          {/* Bounty board — the user's genuinely weakest words, priced. */}
          {featureOn('bebopBounty') && (
            <article className="wired-found-protocol wired-found-bounty">
              <header>
                <span>{t('wired.found.bounty.title')}</span>
              </header>
              {readouts.bounties.length ? (
                <ul className="wired-found-bounty-list">
                  {readouts.bounties.map((b) => (
                    <li key={b.word}>
                      <b lang="ja">{b.word}</b>
                      <span>{b.meaning}</span>
                      <i>{t('wired.found.bounty.reward', { amount: b.bounty })}</i>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="wired-found-empty">{t('wired.found.bounty.empty')}</p>
              )}
            </article>
          )}

          {/* Summon — drives the real companion layer, not a dead flag. */}
          {featureOn('wiredShimeji') && (
            <article className="wired-found-protocol wired-found-summon">
              <header>
                <span>{t('wired.found.summon.title')}</span>
              </header>
              <button type="button" className="wired-found-summon-btn" onClick={onSummon}>
                {summoned ? t('wired.found.summon.dismiss') : t('wired.found.summon.call')}
              </button>
            </article>
          )}
        </section>
      )}

      {featureOn('broadcastTicker') && (
        <section className="wired-found-ticker" aria-hidden="true">
          <div className="wired-found-ticker-track">
            {[0, 1].map((rep) => (
              <span key={rep} className="wired-found-ticker-group">
                <span>{glitchText(t('wired.found.ticker.link'), glitchSeed + 21)}</span>
                <span>{glitchText(t('wired.found.ticker.node'), glitchSeed + 22)}</span>
                <span>
                  {glitchText(
                    sourceLine || t('wired.found.ticker.idle', { count: readouts.vocab.length }),
                    glitchSeed + 23,
                  )}
                </span>
                <span>{glitchText(t('wired.found.ticker.feed'), glitchSeed + 24)}</span>
              </span>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
