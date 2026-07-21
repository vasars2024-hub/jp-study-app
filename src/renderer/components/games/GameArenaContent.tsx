/**
 * The Game Arena's full implementation — shared by Study OS's `GameArenaView`
 * and Blanc's `BlancGamesPanel`.
 *
 * Pillar 2 (BLANC_REFINEMENT_PLAN.md): Blanc previously had only `mono-blocks`,
 * not the arena. The arena view never wrapped itself in `AppChrome` (it is a
 * self-contained `game-arena` layout that both shells load from `styles.css`),
 * so the whole component moves here verbatim and each shell renders `<GameArena />`
 * — Study OS raw, Blanc inside `blanc-tool-detail`. Nothing here imports
 * `AppChrome`/`MenuBar`/`StatusBar`, and it never did.
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useCountUp } from '../../motion/hooks';
import { fireRewardAt } from '../../motion/rewardBurst';
import { getUserLevel, onLevelChange } from '../../levelService';
import { useT } from '../../i18n';
import Icon from '../Icons';
import { addDeckCards, onDeckChanged } from '../../flashcardDeck';
import { onLevelListsChanged } from '../../levelLists';
import { loadArenaContent, levelCoverage } from '../../games/contentStore';
import { useAssets } from '../../assetStore';
import { formatBytes } from '../../../shared/assetRegistry';
import { MIRROR_TEXTS, type MirrorText } from '../../data/mirrorTexts';
import {
  GAME_DEFINITIONS,
  advanceToNextRound,
  applyRoundOutcome,
  buildGameRound,
  completionScore,
  evaluateRound,
  gamePoolSize,
  isFinalRound,
  roundItemKey,
  type ArenaSessionState,
  type GameContent,
  type BuilderRound,
  type GameRound,
  type MatchRound,
  type RoundOutcome,
  type TypeRound,
} from '../../games/engine';
import {
  loadGameArenaSettings,
  onGameArenaSettingsChanged,
  saveGameArenaSettings,
  type GameArenaSettings,
} from '../../games/settings';
import { KANA_GROUPS, type KanaGroupId, type KanaScript, type KanaSelection } from '../../games/kanaGroups';
import { markItemSeen, onSeenProgressChanged, seenProgress } from '../../games/seenProgress';
import { ArcadeGamePanel, type ArcadeGameId, type ArcadeTheme } from '../../games/ArcadeGames';
import { hasDiscoveredAero, onAeroDiscoveryChanged } from '../../aeroDiscovery';
import { hasDiscoveredWired, onWiredDiscoveryChanged } from '../../wiredDiscovery';
import type { ArenaMistake, GameId } from '../../games/types';
import {
  GAME_PROGRESS_EVENT,
  loadGameProgress,
  recordGameResult,
  type GameProgressData,
} from '../../stats';
import {
  MIRROR_EVALUATOR_ASSET_ID,
  evaluateMirrorWriting,
  type MirrorAxis,
  type MirrorEvaluation,
} from '../../games/mirrorWriting/evaluator';
type FastGameId = Exclude<GameId, 'mirror-writing' | ArcadeGameId>;

const ARCADE_GAME_IDS: readonly ArcadeGameId[] = [
  'star-invaders',
  'comet-courier',
  'capsule-sorter',
  'signal-simon',
];

function isArcadeGame(id: GameId): id is ArcadeGameId {
  return ARCADE_GAME_IDS.includes(id as ArcadeGameId);
}

function preferredArcadeTheme(wiredUnlocked: boolean, aeroUnlocked: boolean): ArcadeTheme {
  if (aeroUnlocked && !wiredUnlocked) return 'aero';
  return 'wired';
}

interface Session extends ArenaSessionState {
  gameId: FastGameId;
  startedAt: number;
  timeLimitMs: number;
  elapsedMs?: number;
  score?: number;
  accuracy?: number;
}

/** How long an answered round stays on screen before the next one loads. */
const REVEAL_MS = 900;

function activeLevel(settings: GameArenaSettings, serviceLevel: number): 1 | 2 | 3 | 4 | 5 | 6 | 7 {
  if (settings.levelOverride !== 'auto') return settings.levelOverride;
  return Math.min(7, Math.max(1, serviceLevel)) as 1 | 2 | 3 | 4 | 5 | 6 | 7;
}

function speakJapanese(text: string): void {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'ja-JP';
  utterance.rate = 0.9;
  window.speechSynthesis.speak(utterance);
}

function openArenaSettings(): void {
  window.dispatchEvent(new CustomEvent('os:open', { detail: 'settings' }));
  window.setTimeout(() => {
    window.dispatchEvent(
      new CustomEvent('settings:navigate', {
        detail: { page: 'study', settingId: 'game-arena' },
      }),
    );
  }, 80);
}

function addMistakeToDeck(mistake: ArenaMistake, answerLabel: string): void {
  addDeckCards([
    {
      word: mistake.jp || mistake.expected,
      reading: mistake.reading ?? '',
      meaning: mistake.meaning || mistake.expected,
      sentence: mistake.jp,
      source: 'import',
      bookId: 'game-arena',
      bookTitle: 'Game Arena',
      folder: 'Game Arena',
      front: mistake.prompt,
      back: `${mistake.expected}${mistake.answer ? `\n\n${answerLabel}: ${mistake.answer}` : ''}`,
    },
  ]);
}

function highScoreFor(progress: GameProgressData, gameId: GameId, level: number, sourceLang: string): number | null {
  const key = `${gameId}|${level}|${sourceLang}`;
  return progress.highScores[key]?.score ?? null;
}

function gameTitleKey(id: GameId): string {
  return `games.def.${id}.title`;
}

function gameDescKey(id: GameId): string {
  return `games.def.${id}.desc`;
}

function makeSession(
  gameId: FastGameId,
  settings: GameArenaSettings,
  level: 1 | 2 | 3 | 4 | 5 | 6 | 7,
  content?: GameContent,
): Session {
  const rounds = Array.from({ length: settings.gameLength }, (_, i) =>
    buildGameRound(gameId, level, settings.sourceLang, i, content),
  );
  return {
    gameId,
    rounds,
    index: 0,
    correct: 0,
    currentCombo: 0,
    bestCombo: 0,
    mistakes: [],
    complete: false,
    reveal: false,
    startedAt: Date.now(),
    timeLimitMs: settings.gameLength * 12_000,
  };
}

export function GameArena() {
  const { t } = useT();
  const [settings, setSettings] = useState(loadGameArenaSettings);
  const [serviceLevel, setServiceLevel] = useState(() => getUserLevel('ja'));
  const [progress, setProgress] = useState(loadGameProgress);
  const [selected, setSelected] = useState<GameId>('sentence-builder');
  const [session, setSession] = useState<Session | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [wiredUnlocked, setWiredUnlocked] = useState(hasDiscoveredWired);
  const [aeroUnlocked, setAeroUnlocked] = useState(hasDiscoveredAero);
  const [arcadeTheme, setArcadeTheme] = useState<ArcadeTheme>(() =>
    preferredArcadeTheme(hasDiscoveredWired(), hasDiscoveredAero()),
  );

  useEffect(() => onGameArenaSettingsChanged(() => setSettings(loadGameArenaSettings())), []);
  useEffect(() => onLevelChange(() => setServiceLevel(getUserLevel('ja'))), []);
  useEffect(() => onWiredDiscoveryChanged(setWiredUnlocked), []);
  useEffect(() => onAeroDiscoveryChanged(setAeroUnlocked), []);
  useEffect(() => {
    const onProgress = () => setProgress(loadGameProgress());
    window.addEventListener(GAME_PROGRESS_EVENT, onProgress);
    return () => window.removeEventListener(GAME_PROGRESS_EVENT, onProgress);
  }, []);
  useEffect(() => {
    if (!session || session.complete) return undefined;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [session?.startedAt, session?.complete]);

  const level = activeLevel(settings, serviceLevel);
  // The player's own deck + mined sentences for this level. Rebuilt when the
  // level changes, the deck is edited, or a level list is uploaded; games fall
  // back to the bundled tables when it can't fill a round (see contentStore).
  const [deckNonce, setDeckNonce] = useState(0);
  useEffect(() => {
    const bump = (): void => setDeckNonce((n) => n + 1);
    const offDeck = onDeckChanged(bump);
    const offLists = onLevelListsChanged(bump);
    return () => {
      offDeck();
      offLists();
    };
  }, []);
  const content = useMemo<GameContent>(
    () => ({ ...loadArenaContent(level), kana: settings.kana }),
    [level, deckNonce, settings.kana],
  );
  const coverage = useMemo(() => levelCoverage(level), [level, deckNonce]);
  // Per-game material coverage: how much of this level's pool the player has
  // actually met in this game (the numerator lives in seenProgress).
  const [seenNonce, setSeenNonce] = useState(0);
  useEffect(() => onSeenProgressChanged(() => setSeenNonce((n) => n + 1)), []);
  const gameSeen = useMemo(() => {
    if (selected === 'mirror-writing' || isArcadeGame(selected)) return null;
    // seenNonce is a storage-read trigger: the store changed, re-derive.
    void seenNonce;
    return seenProgress(selected, level, gamePoolSize(selected, level, content));
  }, [selected, level, content, seenNonce]);
  const arcadeUnlocked = wiredUnlocked || aeroUnlocked;
  const availableGames = useMemo(
    () => GAME_DEFINITIONS.filter((game) => arcadeUnlocked || !isArcadeGame(game.id)),
    [arcadeUnlocked],
  );
  const selectedDef = availableGames.find((game) => game.id === selected) ?? availableGames[0];
  const highScore = highScoreFor(progress, selected, level, settings.sourceLang);

  useEffect(() => {
    if (arcadeUnlocked || !isArcadeGame(selected)) return;
    setSelected('sentence-builder');
    setSession(null);
  }, [arcadeUnlocked, selected]);

  useEffect(() => {
    if (arcadeTheme === 'aero' && !aeroUnlocked) setArcadeTheme(preferredArcadeTheme(wiredUnlocked, aeroUnlocked));
    if (arcadeTheme === 'wired' && !wiredUnlocked) setArcadeTheme(preferredArcadeTheme(wiredUnlocked, aeroUnlocked));
  }, [aeroUnlocked, arcadeTheme, wiredUnlocked]);

  useEffect(() => {
    const onSelect = (event: Event) => {
      const detail = (event as CustomEvent<{ gameId?: GameId; theme?: ArcadeTheme }>).detail;
      const gameId = detail?.gameId;
      if (!gameId) return;
      if (isArcadeGame(gameId) && !arcadeUnlocked) return;
      if (!availableGames.some((game) => game.id === gameId)) return;
      if (detail?.theme === 'aero' && aeroUnlocked) setArcadeTheme('aero');
      if (detail?.theme === 'wired' && wiredUnlocked) setArcadeTheme('wired');
      setSelected(gameId);
      setSession(null);
    };
    window.addEventListener('game-arena:select', onSelect);
    return () => window.removeEventListener('game-arena:select', onSelect);
  }, [arcadeUnlocked, availableGames]);

  const startSelected = (): void => {
    if (selected === 'mirror-writing' || isArcadeGame(selected)) return;
    setSession(makeSession(selected, settings, level, content));
  };

  const finishSession = (next: Session, finishedAt = Date.now()): Session => {
    const elapsedMs = Math.min(next.timeLimitMs, Math.max(0, finishedAt - next.startedAt));
    const { score, accuracy } = completionScore({
      correct: next.correct,
      total: next.rounds.length,
      bestCombo: next.bestCombo,
      elapsedMs,
      timeLimitMs: next.timeLimitMs,
    });
    recordGameResult({
      gameId: next.gameId,
      level,
      sourceLang: settings.sourceLang,
      score,
      accuracy,
      mistakes: next.mistakes,
    });
    return { ...next, complete: true, elapsedMs, score, accuracy };
  };

  // Scoring lands immediately; advancing waits for REVEAL_MS so the player
  // actually sees the correct/wrong state before the next round replaces it.
  const submitOutcome = (outcome: RoundOutcome): void => {
    // Any answered round counts as "met this item" — coverage measures
    // exposure to the material, not getting it right.
    if (currentRound) markItemSeen(currentRound.gameId, level, roundItemKey(currentRound));
    setSession((current) => (current ? applyRoundOutcome(current, outcome) : current));
  };

  useEffect(() => {
    if (!session || session.complete || !session.reveal) return;
    const timer = window.setTimeout(() => {
      setSession((current) => {
        if (!current || current.complete || !current.reveal) return current;
        return isFinalRound(current) ? finishSession({ ...current, reveal: false }) : advanceToNextRound(current);
      });
    }, REVEAL_MS);
    return () => window.clearTimeout(timer);
  }, [session?.reveal, session?.index, session?.complete]);

  const currentRound = session && !session.complete ? session.rounds[session.index] : null;
  const remainingMs = session && !session.complete ? Math.max(0, session.timeLimitMs - (now - session.startedAt)) : 0;
  useEffect(() => {
    if (!session || session.complete || remainingMs > 0) return;
    setSession((current) => (current && !current.complete ? finishSession(current, Date.now()) : current));
  }, [remainingMs, session?.complete, session?.startedAt]);

  return (
    <div className="game-arena">
      <header className="game-arena-top">
        <div>
          <div className="game-arena-kicker">{t('games.kicker')}</div>
          <h2>{t('games.title')}</h2>
          <p className="muted">{t('games.desc')}</p>
        </div>
        <div className="game-arena-progress" aria-label={t('games.progress')}>
          <span>{t('games.xp', { xp: progress.xp })}</span>
          <span>{t('games.streak', { streak: progress.streak })}</span>
          <span>{t('games.badgeCount', { count: progress.badges.length })}</span>
          <button type="button" className="btn small" onClick={openArenaSettings}>
            <Icon name="settings" size={14} /> {t('games.settings')}
          </button>
        </div>
      </header>

      <div className="game-arena-layout">
        <aside className="game-list" aria-label={t('games.list')}>
          {availableGames.map((game) => (
            <button
              key={game.id}
              type="button"
              className={`game-list-item ${selected === game.id ? 'active' : ''}`}
              onClick={() => {
                setSelected(game.id);
                setSession(null);
              }}
            >
              <Icon name={game.mode === 'writing' ? 'edit' : game.mode === 'arcade' ? 'sparkle' : 'dice'} size={16} />
              <span>
                <b>{t(gameTitleKey(game.id))}</b>
                <small>{t(gameDescKey(game.id))}</small>
              </span>
            </button>
          ))}
        </aside>

        <main className="game-stage">
          <section className="game-stage-head">
            <div>
              <h3>{t(gameTitleKey(selectedDef.id))}</h3>
              <p className="muted">{t(gameDescKey(selectedDef.id))}</p>
            </div>
            <div className="game-stage-meta">
              <span>{t('games.level.n', { level })}</span>
              <span>{t(`games.lang.${settings.sourceLang}`)}</span>
              <span>{highScore == null ? t('games.noHighScore') : t('games.highScore', { score: highScore })}</span>
            </div>
          </section>

          {/* How much of this level's list the deck can actually teach, and
              whether the round is running on the player's own material. */}
          {selected !== 'mirror-writing' && !isArcadeGame(selected) && (
            <section className="game-coverage" aria-label={t('games.coverage.label')}>
              <div className="game-coverage-bar">
                <i style={{ transform: `scaleX(${Math.min(1, coverage.pct / 100)})` }} />
              </div>
              <span className="muted">
                {coverage.total > 0
                  ? t('games.coverage.count', {
                      have: coverage.have,
                      total: coverage.total,
                      pct: Math.round(coverage.pct),
                    })
                  : t('games.coverage.noList')}
              </span>
              {content.usingFallback && <span className="game-fallback-tag">{t('games.coverage.fallback')}</span>}
            </section>
          )}

          {/* Per-game exposure: how much of this level's pool this game has
              already shown the player. */}
          {gameSeen && gameSeen.total > 0 && (
            <section className="game-coverage game-seen" aria-label={t('games.seen.label')}>
              <div className="game-coverage-bar">
                <i style={{ transform: `scaleX(${Math.min(1, gameSeen.pct / 100)})` }} />
              </div>
              <span className="muted">
                {t('games.seen.count', {
                  seen: gameSeen.seen,
                  total: gameSeen.total,
                  pct: Math.round(gameSeen.pct),
                  level,
                })}
              </span>
            </section>
          )}

          {selected === 'mirror-writing' ? (
            <MirrorWritingPanel settings={settings} level={level} />
          ) : isArcadeGame(selected) ? (
            <ArcadeGamePanel
              gameId={selected}
              theme={arcadeTheme}
              level={level}
              sourceLang={settings.sourceLang}
              onProgress={() => setProgress(loadGameProgress())}
            />
          ) : (
            <>
              {!session && (
                <div className="game-launch-panel">
                  {selected === 'kana-sprint' && (
                    <KanaScopePicker selection={settings.kana} />
                  )}
                  <button type="button" className="btn primary" onClick={startSelected}>
                    <Icon name="player" size={14} /> {t('games.start')}
                  </button>
                  <span className="muted">{t('games.lengthRounds', { count: settings.gameLength })}</span>
                </div>
              )}
              {currentRound && (
                <RoundPanel
                  key={currentRound.id}
                  round={currentRound}
                  sounds={settings.sounds}
                  roundIndex={session.index + 1}
                  roundTotal={session.rounds.length}
                  currentCombo={session.currentCombo}
                  bestCombo={session.bestCombo}
                  remainingMs={remainingMs}
                  timeLimitMs={session.timeLimitMs}
                  outcome={session.reveal ? session.feedback : undefined}
                  onSubmit={submitOutcome}
                />
              )}
              {session?.complete && (
                <ResultPanel
                  session={session}
                  onRestart={() => setSession(makeSession(session.gameId, settings, level, content))}
                />
              )}
            </>
          )}
        </main>
      </div>

      {!!progress.badges.length && (
        <section className="game-badges" aria-label={t('games.badges')}>
          {progress.badges.slice(0, 8).map((badge) => (
            // Badge reveal choreography (Phase 4.5): 3D flip + radial glow.
            // Both collapse to a plain card under Disabled/reduced motion.
            <div key={badge.id} className="game-badge motion-badge">
              <div className="motion-badge-card">
                <span className="motion-badge-glow" aria-hidden="true" />
                <Icon name="star" size={15} />
                <span>
                  <b>{badge.label}</b>
                  <small>{badge.description}</small>
                </span>
              </div>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

/**
 * Kana Sprint's study scope, mirroring the app's character-select pattern:
 * Automatic follows session progress (gojūon first, voiced/yōon later, then
 * katakana); Manual lets the player drill exactly the groups they choose.
 * Persisted in the Arena settings, so the choice survives restarts.
 */
function KanaScopePicker({ selection }: { selection: KanaSelection }) {
  const { t } = useT();
  const patch = (next: Partial<KanaSelection>): void => {
    saveGameArenaSettings({ kana: { ...selection, ...next } });
  };
  const toggleScript = (script: KanaScript): void => {
    const has = selection.scripts.includes(script);
    const scripts = has ? selection.scripts.filter((s) => s !== script) : [...selection.scripts, script];
    if (!scripts.length) return; // an empty scope has nothing to ask
    patch({ scripts });
  };
  const toggleGroup = (group: KanaGroupId): void => {
    const has = selection.groups.includes(group);
    const groups = has ? selection.groups.filter((g) => g !== group) : [...selection.groups, group];
    if (!groups.length) return;
    patch({ groups });
  };
  const manual = selection.mode === 'manual';
  return (
    <div className="game-kana-picker">
      <div className="os-viz-row">
        <span className="muted">{t('games.kana.scope')}</span>
        <button
          type="button"
          className={`btn small ${manual ? '' : 'primary'}`}
          onClick={() => patch({ mode: 'auto' })}
        >
          {t('games.kana.mode.auto')}
        </button>
        <button
          type="button"
          className={`btn small ${manual ? 'primary' : ''}`}
          onClick={() => patch({ mode: 'manual' })}
        >
          {t('games.kana.mode.manual')}
        </button>
      </div>
      {manual ? (
        <>
          <div className="os-viz-row">
            {(['hiragana', 'katakana'] as const).map((script) => (
              <button
                key={script}
                type="button"
                className={`btn small ${selection.scripts.includes(script) ? 'primary' : ''}`}
                onClick={() => toggleScript(script)}
              >
                {t(`games.kana.script.${script}`)}
              </button>
            ))}
          </div>
          <div className="os-viz-row">
            {KANA_GROUPS.filter((g) => g.scripts.some((s) => selection.scripts.includes(s))).map((group) => (
              <button
                key={group.id}
                type="button"
                className={`btn small ${selection.groups.includes(group.id) ? 'primary' : ''}`}
                onClick={() => toggleGroup(group.id)}
              >
                {t(`games.kana.group.${group.id}`)}
              </button>
            ))}
          </div>
        </>
      ) : (
        <p className="muted os-set-hint">{t('games.kana.autoHint')}</p>
      )}
    </div>
  );
}

function RoundPanel({
  round,
  sounds,
  roundIndex,
  roundTotal,
  currentCombo,
  bestCombo,
  remainingMs,
  timeLimitMs,
  outcome,
  onSubmit,
}: {
  round: GameRound;
  sounds: boolean;
  roundIndex: number;
  roundTotal: number;
  currentCombo: number;
  bestCombo: number;
  remainingMs: number;
  timeLimitMs: number;
  outcome?: RoundOutcome;
  onSubmit: (outcome: RoundOutcome) => void;
}) {
  const { t } = useT();
  const timeLeft = timeLimitMs > 0 ? Math.max(0, Math.min(1, remainingMs / timeLimitMs)) : 0;
  const state = outcome ? (outcome.correct ? 'is-correct' : 'is-wrong') : '';
  return (
    <div className={`game-round-shell ${state}`.trim()}>
      <div
        className={`game-time-bar ${timeLeft <= 0.2 ? 'low' : ''}`.trim()}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(timeLeft * 100)}
        aria-label={t('games.hud.time', { seconds: Math.ceil(remainingMs / 1000) })}
      >
        <i style={{ transform: `scaleX(${timeLeft})` }} />
      </div>
      <div className="game-round-hud">
        <span>{t('games.hud.round', { current: roundIndex, total: roundTotal })}</span>
        <span>{t('games.hud.time', { seconds: Math.ceil(remainingMs / 1000) })}</span>
        <span className={currentCombo > 1 ? 'combo-hot' : ''} key={`combo-${currentCombo}`}>
          {t('games.hud.combo', { combo: currentCombo })}
        </span>
        <span>{t('games.hud.bestCombo', { combo: bestCombo })}</span>
      </div>
      {round.kind === 'type' && <TypeRoundPanel round={round} sounds={sounds} onSubmit={onSubmit} />}
      {round.kind === 'builder' && <BuilderRoundPanel round={round} onSubmit={onSubmit} />}
      {round.kind === 'match' && <MatchRoundPanel round={round} onSubmit={onSubmit} />}
    </div>
  );
}

function PromptBlock({ round }: { round: GameRound }) {
  const { t } = useT();
  const speaks = 'speak' in round && !!round.speak;
  const hint = 'hint' in round ? round.hint : undefined;
  return (
    <div className="game-prompt">
      {/*
        `round.jp` is the mining payload (it feeds the flashcard made from a
        mistake), NOT a display field — it holds the full answer. Rendering it
        here handed the player the answer outright: Speed Type showed the
        sentence it was asking them to type, and Cloze/Particle/Counter showed
        their own blanks already filled in. Only `prompt` is safe to show, and
        an audio round deliberately has none.
      */}
      {speaks ? (
        <div className="game-prompt-sub">{t('games.audioPrompt')}</div>
      ) : (
        <div className="game-prompt-main" lang="ja">
          {round.prompt}
        </div>
      )}
      {/* The translated meaning of the missing word — the only clue in a cloze. */}
      {hint && <div className="game-prompt-hint">{hint}</div>}
    </div>
  );
}

function TypeRoundPanel({
  round,
  sounds,
  onSubmit,
}: {
  round: TypeRound;
  sounds: boolean;
  onSubmit: (outcome: RoundOutcome) => void;
}) {
  const { t } = useT();
  const [value, setValue] = useState('');
  const [result, setResult] = useState<RoundOutcome | null>(null);
  const locked = !!result;
  const submit = (): void => {
    if (locked || !value.trim()) return;
    const outcome = evaluateRound(round, value);
    setResult(outcome);
    onSubmit(outcome);
  };
  // Audio rounds speak on their own so the player isn't hunting for a button
  // before the round can even start; the button is there to hear it again.
  useEffect(() => {
    if (round.speak && sounds) speakJapanese(round.jp);
  }, [round.id]);
  return (
    <div className="game-round">
      <PromptBlock round={round} />
      {round.speak && (
        <button type="button" className="btn" disabled={!sounds} onClick={() => speakJapanese(round.jp)}>
          <Icon name="volume" size={14} /> {t('games.action.listen')}
        </button>
      )}
      <textarea
        lang={round.inputLang === 'ja' ? 'ja' : round.inputLang === 'zh' ? 'zh' : undefined}
        className="game-answer-box"
        value={value}
        disabled={locked}
        rows={3}
        autoFocus
        onChange={(e) => setValue(e.target.value)}
        // isComposing guards the IME: Enter mid-conversion commits the
        // candidate, it must not also submit the round.
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            submit();
          }
        }}
      />
      <RoundVerdict outcome={result} expected={round.answer} />
      <button type="button" className="btn primary" disabled={!value.trim() || locked} onClick={submit}>
        {t('games.action.check')}
      </button>
    </div>
  );
}

/** Shared correct/incorrect line for the games that check on demand. */
function RoundVerdict({ outcome, expected }: { outcome: RoundOutcome | null; expected: string }) {
  const { t } = useT();
  if (!outcome) return null;
  return (
    <div className={`game-verdict ${outcome.correct ? 'ok' : 'bad'}`} role="status">
      {outcome.correct ? (
        <>
          <Icon name="check" size={14} /> {t('games.verdict.correct')}
        </>
      ) : (
        <>
          <Icon name="close" size={14} />{' '}
          <span>
            {t('games.verdict.answer')} <b lang="ja">{expected}</b>
          </span>
        </>
      )}
    </div>
  );
}

function BuilderRoundPanel({
  round,
  onSubmit,
}: {
  round: BuilderRound;
  onSubmit: (outcome: RoundOutcome) => void;
}) {
  const { t } = useT();
  const [bank, setBank] = useState(round.tokens.map((token, i) => ({ token, id: `${i}-${token}` })));
  const [answer, setAnswer] = useState<{ token: string; id: string }[]>([]);
  const [result, setResult] = useState<RoundOutcome | null>(null);
  const locked = !!result;
  const pick = (id: string): void => {
    if (locked) return;
    const item = bank.find((token) => token.id === id);
    if (!item) return;
    setBank((items) => items.filter((token) => token.id !== id));
    setAnswer((items) => [...items, item]);
  };
  const undo = (id: string): void => {
    if (locked) return;
    const item = answer.find((token) => token.id === id);
    if (!item) return;
    setAnswer((items) => items.filter((token) => token.id !== id));
    setBank((items) => [...items, item]);
  };
  const submit = (): void => {
    if (locked) return;
    const outcome = evaluateRound(round, answer.map((token) => token.token));
    setResult(outcome);
    onSubmit(outcome);
  };
  return (
    <div className="game-round">
      <PromptBlock round={round} />
      <div className={`game-builder-answer ${result ? (result.correct ? 'ok' : 'bad') : ''}`.trim()} lang="ja">
        {answer.map((token) => (
          <button key={token.id} type="button" disabled={locked} onClick={() => undo(token.id)}>
            {token.token}
          </button>
        ))}
      </div>
      <div className="game-token-bank" lang="ja">
        {bank.map((token) => (
          <button key={token.id} type="button" disabled={locked} onClick={() => pick(token.id)}>
            {token.token}
          </button>
        ))}
      </div>
      <RoundVerdict outcome={result} expected={round.answerTokens.join('')} />
      <button
        type="button"
        className="btn primary"
        disabled={answer.length !== round.answerTokens.length || locked}
        onClick={submit}
      >
        {t('games.action.check')}
      </button>
    </div>
  );
}

function MatchRoundPanel({
  round,
  onSubmit,
}: {
  round: MatchRound;
  onSubmit: (outcome: RoundOutcome) => void;
}) {
  const { t } = useT();
  const [selected, setSelected] = useState<string | null>(null);
  const [matches, setMatches] = useState<Record<string, string>>({});
  const [result, setResult] = useState<RoundOutcome | null>(null);
  const locked = !!result;
  const pair = (meaning: string): void => {
    if (!selected || locked) return;
    setMatches((current) => {
      const next = { ...current };
      // A meaning belongs to exactly one word: re-using it moves it rather
      // than silently pairing two words to the same meaning.
      for (const [jp, value] of Object.entries(next)) {
        if (value === meaning) delete next[jp];
      }
      next[selected] = meaning;
      return next;
    });
    setSelected(null);
  };
  const clear = (jp: string): void => {
    if (locked) return;
    setMatches((current) => {
      const next = { ...current };
      delete next[jp];
      return next;
    });
    setSelected(jp);
  };
  const submit = (): void => {
    if (locked) return;
    const outcome = evaluateRound(round, matches);
    setResult(outcome);
    onSubmit(outcome);
  };
  return (
    <div className="game-round">
      <PromptBlock round={round} />
      <div className="game-match-grid">
        <div>
          {round.pairs.map((pairItem, i) => {
            const paired = matches[pairItem.jp];
            const verdict = result ? (paired === pairItem.meaning ? 'correct' : 'wrong') : '';
            return (
              <button
                key={pairItem.jp}
                type="button"
                className={`game-match-btn ${selected === pairItem.jp ? 'active' : ''} ${
                  paired ? 'paired' : ''
                } ${verdict}`.replace(/\s+/g, ' ').trim()}
                style={{ '--i': i } as CSSProperties}
                onClick={() => (paired ? clear(pairItem.jp) : setSelected(pairItem.jp))}
              >
                <span lang="ja">
                  {pairItem.jp}
                  <small>{pairItem.reading}</small>
                </span>
                {/* Without this the player cannot see what they paired. */}
                <em className="game-match-tag">{paired ?? t('games.match.pick')}</em>
              </button>
            );
          })}
        </div>
        <div>
          {round.rightChoices.map((meaning, i) => (
            <button
              key={meaning}
              type="button"
              className={`game-match-btn ${Object.values(matches).includes(meaning) ? 'chosen' : ''}`}
              style={{ '--i': i } as CSSProperties}
              disabled={locked || !selected}
              onClick={() => pair(meaning)}
            >
              {meaning}
            </button>
          ))}
        </div>
      </div>
      <RoundVerdict outcome={result} expected={round.pairs.map((p) => `${p.jp} = ${p.meaning}`).join(' / ')} />
      <button
        type="button"
        className="btn primary"
        disabled={Object.keys(matches).length !== round.pairs.length || locked}
        onClick={submit}
      >
        {t('games.action.check')}
      </button>
    </div>
  );
}

function ResultPanel({ session, onRestart }: { session: Session; onRestart: () => void }) {
  const { t } = useT();
  // Shared motion hook (Phase 4.5): routes through the motion tokens, so the
  // Animation Velocity slider reaches the score roll and the tick audio comes
  // off the shared sound engine. The Arena's own copy hard-coded 750ms.
  const score = Math.round(useCountUp(session.score ?? 0, { durationMs: 750 }));
  const scoreRef = useRef<HTMLDivElement>(null);
  const celebratedRef = useRef(false);

  // Confetti for a strong finish only — a burst after every game, including
  // the bad ones, stops meaning anything. Density/mode gating lives in
  // fireReward, so there is nothing to check here.
  useEffect(() => {
    if (celebratedRef.current) return;
    if ((session.accuracy ?? 0) < 0.8) return;
    celebratedRef.current = true;
    // Wait for the score roll to land, so the burst punctuates the total.
    const id = window.setTimeout(() => fireRewardAt(scoreRef.current), 780);
    return () => window.clearTimeout(id);
  }, [session.accuracy]);

  return (
    <div className="game-result">
      <div className="game-result-score motion-ticker" ref={scoreRef}>
        {score}
      </div>
      <div>
        <h3>{t('games.result')}</h3>
        <p className="muted">
          {t('games.resultLine', {
            correct: session.correct,
            total: session.rounds.length,
            accuracy: Math.round((session.accuracy ?? 0) * 100),
          })}
        </p>
        <p className="muted">
          {t('games.resultComboLine', {
            combo: session.bestCombo,
            seconds: Math.ceil((session.elapsedMs ?? session.timeLimitMs) / 1000),
          })}
        </p>
      </div>
      <button type="button" className="btn primary" onClick={onRestart}>
        {t('games.playAgain')}
      </button>
      {!!session.mistakes.length && (
        <div className="game-mistakes">
          {session.mistakes.map((mistake, index) => (
            <div key={`${mistake.createdAt}-${index}`} className="game-mistake">
              <span>
                <b>{mistake.expected}</b>
                {mistake.answer && <small>{mistake.answer}</small>}
              </span>
              <button
                type="button"
                className="btn small"
                onClick={() => {
                  addMistakeToDeck(mistake, t('games.mistake.yourAnswer'));
                  window.dispatchEvent(new CustomEvent('os:toast', { detail: { message: t('games.toast.savedToFlashcards'), kind: 'ok' } }));
                }}
              >
                {t('games.mineMistake')}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function selectMirrorText(level: number): MirrorText {
  return MIRROR_TEXTS.find((text) => text.level === level) ?? MIRROR_TEXTS[0];
}

function MirrorWritingPanel({
  settings,
  level,
}: {
  settings: GameArenaSettings;
  level: 1 | 2 | 3 | 4 | 5 | 6 | 7;
}) {
  const { t } = useT();
  const { views, start } = useAssets();
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [evaluation, setEvaluation] = useState<MirrorEvaluation | null>(null);
  const [error, setError] = useState<string | null>(null);

  const text = useMemo(() => selectMirrorText(level), [level]);
  const asset = views.find((view) => view.spec.id === MIRROR_EVALUATOR_ASSET_ID);
  const installed = asset?.status.state === 'installed';
  const downloadable = asset?.status.state === 'not-installed' || asset?.status.state === 'failed';

  const submit = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    setEvaluation(null);
    const result = await evaluateMirrorWriting(settings, text, draft, installed);
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setEvaluation(result.evaluation);
    recordGameResult({
      gameId: 'mirror-writing',
      level,
      sourceLang: settings.sourceLang,
      score: result.evaluation.total,
      accuracy: result.evaluation.total / 100,
      mistakes: [],
    });
  };

  return (
    <div className="mirror-writing">
      <div className="mirror-idea-map">
        <h4>{text.title}</h4>
        {text.ideaMap.map((idea, index) => (
          <div key={idea.id} className="mirror-idea">
            <b>{index + 1}</b>
            <span>{idea.concepts[settings.sourceLang] || idea.concepts.en}</span>
          </div>
        ))}
      </div>

      <label className="mirror-draft">
        <span>{t('games.mirror.draft')}</span>
        <textarea
          lang="ja"
          rows={8}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={t('games.mirror.placeholder')}
        />
      </label>

      <div className="mirror-actions">
        <button type="button" className="btn primary" disabled={busy || draft.trim().length < 8} onClick={() => void submit()}>
          {busy ? t('games.mirror.evaluating') : t('games.mirror.submit')}
        </button>
        {settings.mirrorBackend === 'local' && asset && (
          <span className="muted">
            {installed
              ? t('games.mirror.modelInstalled')
              : t('games.mirror.modelSize', { size: formatBytes(asset.spec.sizeBytes) })}
          </span>
        )}
        {settings.mirrorBackend === 'local' && downloadable && (
          <button type="button" className="btn" onClick={() => void start(MIRROR_EVALUATOR_ASSET_ID)}>
            <Icon name="download" size={14} /> {t('games.mirror.downloadModel')}
          </button>
        )}
        <button type="button" className="btn small" onClick={openArenaSettings}>
          {t('games.settings')}
        </button>
      </div>

      {error && <div className="mirror-error">{error}</div>}

      {evaluation && (
        <div className="mirror-score-card">
          <div className="mirror-total">
            <b>{evaluation.total}</b>
            <span>{evaluation.summary}</span>
          </div>
          {(['grammar', 'vocabulary', 'flow', 'fidelity'] as MirrorAxis[]).map((axis) => (
            <div key={axis} className="mirror-axis">
              <div>
                <b>{t(`games.mirror.axis.${axis}`)}</b>
                <span>{evaluation.axes[axis].score}/100</span>
              </div>
              {evaluation.axes[axis].tips.map((tip, index) => (
                <p key={`${axis}-${index}`}>
                  {tip.span && <code>{tip.span}</code>} {tip.message}
                </p>
              ))}
            </div>
          ))}
          <details className="mirror-reference">
            <summary>{t('games.mirror.reference')}</summary>
            <p lang="ja">{text.reference}</p>
          </details>
        </div>
      )}
    </div>
  );
}
