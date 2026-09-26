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
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import './gameArenaLiquid.css';
import { useCountUp } from '../../motion/hooks';
import { fireRewardAt } from '../../motion/rewardBurst';
import { getUserLevel, onLevelChange } from '../../levelService';
import { useT } from '../../i18n';
import { LANG_TAGS } from '../../../shared/i18n/core';
import Icon from '../Icons';
import { ContextualSurface } from '../liquid/LiquidSurface';
import { addDeckCards, loadDeckFolders, onDeckChanged } from '../../flashcardDeck';
import { onLevelListsChanged } from '../../levelLists';
import { loadArenaContent, levelCoverage } from '../../games/contentStore';
import { mirrorRotation, mirrorTextsFor, type MirrorText } from '../../data/mirrorTexts';
import { useStudyLanguage } from '../../useStudyLanguage';
import { useAiReadiness } from '../../aiSetupClient';
import { handOffToAgent, routeAgentContext } from '../../agentContextHandoff';
import { AGENT_NAVIGATION_SECTION_LABEL_KEYS } from '../../../shared/agentNavigation';
import type { StudyLang } from '../../../shared/levelScale';
import { bankArenaAnswer, bankArenaSession } from '../../games/arenaStudyBridge';
import {
  GAME_LIST_TEMPLATE_CSV,
  GAME_LIST_TEMPLATE_JSON,
  addGameList,
  deleteGameList,
  loadGameLists,
  onGameListsChanged,
  parseGameList,
  type GameListRow,
} from '../../games/gameItemImport';
import {
  MIRROR_TEMPLATE_CSV,
  MIRROR_TEMPLATE_JSON,
  MIRROR_USER_EVENT,
  addUserMirrorTexts,
  loadUserMirrorTexts,
  parseMirrorTexts,
} from '../../games/mirrorTextImport';
import ContentImportDialog from '../ContentImportDialog';
import { Button, Select } from '../ui';
import {
  GAME_DEFINITIONS,
  advanceToNextRound,
  applyRoundOutcome,
  buildSessionRounds,
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
import { markItemSeen, onSeenProgressChanged, seenItems, seenProgress } from '../../games/seenProgress';
import { AERO_ARCADE_IDS, ArcadeGamePanel, type ArcadeGameId, type ArcadeTheme } from '../../games/ArcadeGames';
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
  buildMirrorFeedbackRequest,
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
  ...AERO_ARCADE_IDS,
];

/** The Aero-only games reuse the Special page's names for them. */
const AERO_GAME_KEYS: Partial<Record<GameId, string>> = {
  'aero-breakout': 'special.game.aero.breakout',
  'aero-blocks': 'special.game.aero.blocks',
  'aero-pong': 'special.game.aero.pong',
  'aero-snake': 'special.game.aero.snake',
};

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

/**
 * Badge wall cap. The header's own `games.badgeCount` reads the FULL length, so the overflow
 * has to be disclosed or the two numbers contradict each other on screen — D137.
 */
const BADGE_ROWS = 8;

function activeLevel(settings: GameArenaSettings, serviceLevel: number): 1 | 2 | 3 | 4 | 5 | 6 | 7 {
  if (settings.levelOverride !== 'auto') return settings.levelOverride;
  return Math.min(7, Math.max(1, serviceLevel)) as 1 | 2 | 3 | 4 | 5 | 6 | 7;
}

const SPEECH_TAG: Record<StudyLang, string> = { ja: 'ja-JP', zh: 'zh-CN', ru: 'ru-RU' };

function speakStudy(text: string, lang: StudyLang): void {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = SPEECH_TAG[lang];
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

/**
 * Mined mistakes land in a folder named in the UI language (it used to be the
 * English "Game Arena" for everyone), and carry their study language so a
 * Chinese mistake never turns up in a Japanese review.
 */
function addMistakeToDeck(mistake: ArenaMistake, answerLabel: string, folder: string): void {
  addDeckCards([
    {
      word: mistake.word || mistake.jp || mistake.expected,
      reading: mistake.reading ?? '',
      meaning: mistake.meaning || mistake.expected,
      sentence: mistake.jp,
      source: 'import',
      bookId: 'game-arena',
      bookTitle: folder,
      folder,
      ...(mistake.studyLang ? { studyLang: mistake.studyLang } : {}),
      front: mistake.prompt,
      back: `${mistake.expected}${mistake.answer ? `\n\n${answerLabel}: ${mistake.answer}` : ''}`,
    },
  ]);
}

function highScoreFor(progress: GameProgressData, gameId: GameId, level: number, sourceLang: string): number | null {
  const key = `${gameId}|${level}|${sourceLang}`;
  return progress.highScores[key]?.score ?? null;
}

/**
 * Four games test a different skill per study language (kana → pinyin tones /
 * the Cyrillic alphabet; kanji readings → pinyin / stress; particles → Chinese
 * particles / Russian case endings; counters → measure words / number
 * agreement), so they carry their own names there.
 */
const PER_LANGUAGE_GAMES = new Set<GameId>(['kana-sprint', 'kanji-reading', 'particle-panic', 'counter-quiz']);

function gameTitleKey(id: GameId, lang: StudyLang = 'ja'): string {
  if (AERO_GAME_KEYS[id]) return `${AERO_GAME_KEYS[id]}.title`;
  return lang !== 'ja' && PER_LANGUAGE_GAMES.has(id) ? `games.def.${id}.${lang}.title` : `games.def.${id}.title`;
}

function gameDescKey(id: GameId, lang: StudyLang = 'ja'): string {
  if (AERO_GAME_KEYS[id]) return `${AERO_GAME_KEYS[id]}.desc`;
  return lang !== 'ja' && PER_LANGUAGE_GAMES.has(id) ? `games.def.${id}.${lang}.desc` : `games.def.${id}.desc`;
}

/**
 * A fresh session. The salt makes every session a new draw (the seed used to be
 * the round index, so "play again" replayed the same questions); items the
 * player has not met yet come first, and recently missed ones come back.
 */
export function makeSession(
  gameId: FastGameId,
  settings: GameArenaSettings,
  level: 1 | 2 | 3 | 4 | 5 | 6 | 7,
  content?: GameContent,
  history?: { seen?: ReadonlySet<string>; weak?: ReadonlySet<string> },
  now = Date.now(),
): Session {
  const salt = (now ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0;
  const rounds = buildSessionRounds(gameId, level, settings.sourceLang, settings.gameLength, content, {
    salt,
    seen: history?.seen,
    weak: history?.weak,
  });
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
    startedAt: now,
    timeLimitMs: settings.gameLength * 12_000,
  };
}

export function GameArena() {
  const { t, lang } = useT();
  const [settings, setSettings] = useState(loadGameArenaSettings);
  const { lang: studyLang, tag: studyTag } = useStudyLanguage();
  const [serviceLevel, setServiceLevel] = useState(() => getUserLevel(studyLang));
  const [importOpen, setImportOpen] = useState(false);
  const [listName, setListName] = useState('');
  const [listsNonce, setListsNonce] = useState(0);
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
  useEffect(() => {
    setServiceLevel(getUserLevel(studyLang));
    return onLevelChange(() => setServiceLevel(getUserLevel(studyLang)));
  }, [studyLang]);
  useEffect(() => onGameListsChanged(() => setListsNonce((n) => n + 1)), []);
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
  const content = useMemo<GameContent & { usingFallback: boolean }>(
    () => ({ ...loadArenaContent(level, settings.material), kana: settings.kana }),
    [level, deckNonce, listsNonce, settings.kana, settings.material, studyLang],
  );
  // Where a session can draw from: everything, one deck folder, or one imported list.
  const gameLists = useMemo(() => loadGameLists().filter((l) => l.lang === studyLang), [listsNonce, studyLang]);
  const deckFolders = useMemo(() => loadDeckFolders(), [deckNonce]);
  const coverage = useMemo(() => levelCoverage(level), [level, deckNonce]);
  // Per-game material coverage: how much of this level's pool the player has
  // actually met in this game (the numerator lives in seenProgress).
  const [seenNonce, setSeenNonce] = useState(0);
  useEffect(() => onSeenProgressChanged(() => setSeenNonce((n) => n + 1)), []);
  const gameSeen = useMemo(() => {
    if (selected === 'mirror-writing' || isArcadeGame(selected)) return null;
    // seenNonce is a storage-read trigger: the store changed, re-derive.
    void seenNonce;
    return seenProgress(selected, level, gamePoolSize(selected, level, content), studyLang);
  }, [selected, level, content, seenNonce, studyLang]);
  // Every finished round is already persisted with its score, accuracy and
  // missed items (`stats.ts` keeps the last 30), and nothing has ever shown it
  // back to the player. The ready state is where it belongs: it is the only
  // moment the stage has nothing else to say, and reviewing your own last
  // rounds spoils no prompt the way a preview of the material pool would.
  const recentForGame = useMemo(
    () => progress.recent.filter((entry) => entry.gameId === selected).slice(0, 12),
    [progress.recent, selected],
  );
  const arcadeUnlocked = wiredUnlocked || aeroUnlocked;
  const availableGames = useMemo(
    () =>
      GAME_DEFINITIONS.filter((game) =>
        AERO_ARCADE_IDS.includes(game.id as ArcadeGameId)
          ? aeroUnlocked
          : arcadeUnlocked || !isArcadeGame(game.id),
      ),
    [arcadeUnlocked, aeroUnlocked],
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

  // Items met before, and items recently missed, for this game in this language.
  const historyFor = useCallback(
    (gameId: FastGameId) => ({
      seen: seenItems(gameId, level, studyLang),
      weak: new Set(
        progress.recent
          .filter((entry) => entry.gameId === gameId)
          .flatMap((entry) => entry.mistakes)
          .filter((m) => (m.studyLang ?? 'ja') === studyLang && !!m.jp)
          .map((m) => m.jp as string),
      ),
    }),
    [level, progress.recent, studyLang],
  );

  const startSelected = (): void => {
    if (selected === 'mirror-writing' || isArcadeGame(selected)) return;
    setSession(makeSession(selected, settings, level, content, historyFor(selected)));
  };

  // Both call sites are `setSession` updaters, and a React updater must be
  // PURE — React is free to run it more than once for the same transition, and
  // StrictMode does exactly that on every development render. Banking the round
  // from in here therefore banked it twice: measured live 2026-09-06, one
  // Word Match session left TWO identical entries in `recent` 1 ms apart and
  // paid 10 XP for a 5 XP session. So this only computes; the write is an
  // effect below, keyed on the session and guarded by a ref.
  const finishSession = (next: Session, finishedAt = Date.now()): Session => {
    const elapsedMs = Math.min(next.timeLimitMs, Math.max(0, finishedAt - next.startedAt));
    const { score, accuracy } = completionScore({
      correct: next.correct,
      total: next.rounds.length,
      bestCombo: next.bestCombo,
      elapsedMs,
      timeLimitMs: next.timeLimitMs,
    });
    return { ...next, complete: true, elapsedMs, score, accuracy };
  };

  // `startedAt` is the session's identity — makeSession stamps a fresh one per
  // round, so replaying the same game banks again while a re-run of the same
  // effect does not.
  const bankedSessionRef = useRef<number | null>(null);
  useEffect(() => {
    if (!session?.complete) return;
    if (bankedSessionRef.current === session.startedAt) return;
    bankedSessionRef.current = session.startedAt;
    recordGameResult({
      gameId: session.gameId,
      level,
      sourceLang: settings.sourceLang,
      score: session.score ?? 0,
      accuracy: session.accuracy ?? 0,
      mistakes: session.mistakes,
    });
    // Session time is study time: it reaches the day's totals in Statistics.
    bankArenaSession(session.startedAt, session.startedAt + (session.elapsedMs ?? 0));
  }, [session?.complete, session?.startedAt]);

  // Scoring lands immediately; advancing waits for REVEAL_MS so the player
  // actually sees the correct/wrong state before the next round replaces it.
  const submitOutcome = (outcome: RoundOutcome): void => {
    // Any answered round counts as "met this item" — coverage measures
    // exposure to the material, not getting it right.
    if (currentRound) {
      markItemSeen(currentRound.gameId, level, roundItemKey(currentRound), studyLang);
      // Each answer is study evidence: review log, and the word's card or known level.
      bankArenaAnswer(currentRound, outcome.correct);
    }
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
      <ContextualSurface as="header" className="game-arena-top">
        {/* No in-window "Game Arena" heading: the window title already names it
            (CLAUDE.md window minimalism). The one-line description stays. */}
        <div>
          <p className="muted">{t('games.desc')}</p>
        </div>
        <div className="game-arena-progress" aria-label={t('games.progress')}>
          <span>{t('games.xp', { xp: progress.xp })}</span>
          <span>{t('games.streak', { streak: progress.streak })}</span>
          <span>{t('games.badgeCount', { count: progress.badges.length })}</span>
        </div>
      </ContextualSurface>

      <div className="game-arena-layout">
        <ContextualSurface as="aside" className="game-list" aria-label={t('games.list')}>
          {availableGames.map((game) => (
            <button
              key={game.id}
              type="button"
              className={`game-list-item ${selected === game.id ? 'active game-list-item--primary' : ''}`}
              aria-current={selected === game.id ? 'true' : undefined}
              onClick={() => {
                setSelected(game.id);
                setSession(null);
              }}
            >
              <Icon name={game.mode === 'writing' ? 'edit' : game.mode === 'arcade' ? 'sparkle' : 'dice'} size={16} />
              {/* Names and blurbs are cut with an ellipsis in the narrow list (Russian
                  names run long), so the full text is the tooltip. */}
              <span title={`${t(gameTitleKey(game.id, studyLang))} — ${t(gameDescKey(game.id, studyLang))}`}>
                <b>{t(gameTitleKey(game.id, studyLang))}</b>
                <small>{t(gameDescKey(game.id, studyLang))}</small>
              </span>
            </button>
          ))}
        </ContextualSurface>

        <main className="game-stage">
          <ContextualSurface as="section" className="game-stage-head">
            <div>
              <h3>{t(gameTitleKey(selectedDef.id, studyLang))}</h3>
              <p className="muted">{t(gameDescKey(selectedDef.id, studyLang))}</p>
            </div>
            <div className="game-stage-meta">
              <span>{t('games.level.n', { level })}</span>
              <span>{t(`games.lang.${settings.sourceLang}`)}</span>
              <span>{highScore == null ? t('games.noHighScore') : t('games.highScore', { score: highScore })}</span>
            </div>
          </ContextualSurface>

          {/* How much of this level's list the deck can actually teach, and
              whether the round is running on the player's own material. */}
          {selected !== 'mirror-writing' && !isArcadeGame(selected) && (
            <ContextualSurface as="section" className="game-coverage" aria-label={t('games.coverage.label')}>
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
            </ContextualSurface>
          )}

          {/* Per-game exposure: how much of this level's pool this game has
              already shown the player. */}
          {gameSeen && gameSeen.total > 0 && (
            <ContextualSurface as="section" className="game-coverage game-seen" aria-label={t('games.seen.label')}>
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
            </ContextualSurface>
          )}

          {selected === 'mirror-writing' ? (
            <MirrorWritingPanel settings={settings} level={level} />
          ) : isArcadeGame(selected) ? (
            <ArcadeGamePanel
              gameId={selected}
              theme={AERO_ARCADE_IDS.includes(selected) ? 'aero' : arcadeTheme}
              level={level}
              sourceLang={settings.sourceLang}
              onProgress={() => setProgress(loadGameProgress())}
            />
          ) : (
            <>
              {!session && (
                <div className="game-ready">
                  <div className="game-launch-panel">
                    <details className="game-ready-options">
                      <summary>
                        <Icon name="settings" size={14} /> {t('games.roundOptions')}
                      </summary>
                      <div className="game-ready-options-body">
                        {selected === 'kana-sprint' && studyLang === 'ja' && (
                          <KanaScopePicker selection={settings.kana} />
                        )}
                        {/* "Make a game from my deck or list": any deck folder or imported list can be the whole session. */}
                        <label className="game-material">
                          <span>{t('games.material.label')}</span>
                          <Select
                            value={settings.material}
                            onChange={(e) => saveGameArenaSettings({ material: e.target.value })}
                            options={[
                              { value: 'auto', label: t('games.material.auto') },
                              ...deckFolders.map((f) => ({ value: `folder:${f}`, label: t('games.material.folder', { name: f }) })),
                              ...gameLists.map((l) => ({ value: `list:${l.id}`, label: t('games.material.list', { name: l.name, count: l.rows.length }) })),
                            ]}
                          />
                        </label>
                        <div className="game-material-actions">
                          <Button size="sm" onClick={() => setImportOpen(true)}>
                            {t('games.lists.import')}
                          </Button>
                          {settings.material.startsWith('list:') && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                deleteGameList(settings.material.slice(5));
                                saveGameArenaSettings({ material: 'auto' });
                              }}
                            >
                              {t('games.lists.delete')}
                            </Button>
                          )}
                        </div>
                        <button type="button" className="btn small" onClick={openArenaSettings}>
                          <Icon name="settings" size={14} /> {t('games.settings')}
                        </button>
                      </div>
                    </details>
                    <button type="button" className="btn primary" onClick={startSelected}>
                      <Icon name="player" size={14} /> {t('games.start')}
                    </button>
                    <span className="muted">{t('games.lengthRounds', { count: settings.gameLength })}</span>
                  </div>
                  {/* Post-round detail, which §11's Games split assigns to the
                      contextual seam rather than the gameplay canvas. */}
                  <ContextualSurface as="section" className="game-history" aria-label={t('games.history.label')}>
                    <h4>{t('games.history.label')}</h4>
                    {recentForGame.length === 0 ? (
                      <p className="muted game-history-empty">{t('games.history.empty')}</p>
                    ) : (
                      <ol className="game-history-list">
                        {recentForGame.map((entry) => (
                          <li key={entry.id} className="game-history-row">
                            <b>{entry.score}</b>
                            <span>
                              {t('games.history.line', {
                                accuracy: Math.round((entry.accuracy ?? 0) * 100),
                                level: entry.level,
                                missed: entry.mistakes.length,
                              })}
                            </span>
                            {/* Locale-aware: a bare toLocaleDateString() follows the
                                OS, not the UI language. */}
                            <em className="muted">
                              {new Date(entry.createdAt).toLocaleDateString(LANG_TAGS[lang])}
                            </em>
                          </li>
                        ))}
                      </ol>
                    )}
                  </ContextualSurface>
                </div>
              )}
              {/*
                The new question, spoken. `RoundPanel` is keyed on the round id
                and therefore REMOUNTS on every question, so a live region
                inside it would be brand new each time and announce nothing — a
                region has to already exist for its text to count as a change.
                This one sits outside the key and simply retitles itself, which
                is what a screen-reader player hears after the verdict.
              */}
              <p className="sr-only" role="status" aria-live="polite">
                {currentRound && session
                  ? 'speak' in currentRound && currentRound.speak
                    ? t('games.a11y.roundAudio', {
                        current: session.index + 1,
                        total: session.rounds.length,
                      })
                    : t('games.a11y.roundPrompt', {
                        current: session.index + 1,
                        total: session.rounds.length,
                        prompt: currentRound.prompt,
                      })
                  : ''}
              </p>
              {currentRound && session && (
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
                  onRestart={() => setSession(makeSession(session.gameId, settings, level, content, historyFor(session.gameId)))}
                />
              )}
            </>
          )}
        </main>
      </div>

      <ContentImportDialog<GameListRow>
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title={t('games.lists.importTitle')}
        description={t('games.lists.importDesc')}
        templates={{ csv: GAME_LIST_TEMPLATE_CSV, json: GAME_LIST_TEMPLATE_JSON }}
        templateName="game-word-list"
        parse={(text, fileName) => parseGameList(text, fileName, studyLang)}
        columns={[
          { label: t('games.lists.col.word'), value: (r) => r.word, lang: () => studyTag },
          { label: t('games.lists.col.reading'), value: (r) => r.reading ?? '' },
          { label: t('games.lists.col.meaning'), value: (r) => r.meaning },
          { label: t('games.lists.col.sentence'), value: (r) => r.sentence ?? '', lang: () => studyTag },
        ]}
        extra={
          <label className="content-import-name">
            <span>{t('games.lists.name')}</span>
            <input className="ui-input" value={listName} onChange={(e) => setListName(e.target.value)} placeholder={t('games.lists.namePlaceholder')} />
          </label>
        }
        commitBlockedReason={listName.trim() ? undefined : t('games.lists.nameRequired')}
        onCommit={(rows) => {
          const list = addGameList(listName, studyLang, rows);
          saveGameArenaSettings({ material: `list:${list.id}` });
          setListName('');
          return t('games.lists.imported', { count: rows.length, name: list.name });
        }}
      />

      {!!progress.badges.length && (
        <section className="game-badges" aria-label={t('games.badges')}>
          {progress.badges.slice(0, BADGE_ROWS).map((badge) => (
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
          {progress.badges.length > BADGE_ROWS && (
            <p className="muted">
              {t('common.moreNotShown', { count: progress.badges.length - BADGE_ROWS })}
            </p>
          )}
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
          aria-pressed={!manual}
          onClick={() => patch({ mode: 'auto' })}
        >
          {t('games.kana.mode.auto')}
        </button>
        <button
          type="button"
          className={`btn small ${manual ? 'primary' : ''}`}
          aria-pressed={manual}
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
                aria-pressed={selection.scripts.includes(script)}
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
                aria-pressed={selection.groups.includes(group.id)}
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
        // `lang` follows the prompt rather than the game: Sentence Builder and
        // Speed Type ask in the player's own language, so a fixed `ja` put
        // English behind a Japanese voice and a Japanese font stack. A keyed
        // prompt is UI chrome, renders in the UI language, and so declares
        // nothing — it inherits the document's language, which is correct.
        <div className="game-prompt-main" lang={round.promptKey ? undefined : round.promptLang}>
          {round.promptKey ? t(round.promptKey) : round.prompt}
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
    if (round.speak && sounds) speakStudy(round.jp, round.studyLang);
  }, [round.id]);
  return (
    <div className="game-round">
      <PromptBlock round={round} />
      {round.speak && (
        <button type="button" className="btn" disabled={!sounds} onClick={() => speakStudy(round.jp, round.studyLang)}>
          <Icon name="volume" size={14} /> {t('games.action.listen')}
        </button>
      )}
      <textarea
        lang={round.inputLang === 'en' ? undefined : round.inputLang}
        className="game-answer-box"
        // The one unnamed control on the surface: no label, no placeholder and
        // no id to point a label at, so it announced as a bare edit field while
        // the question it belongs to sat in an unrelated div.
        aria-label={t('games.a11y.answer')}
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
      <RoundVerdict outcome={result} expected={round.answer} lang={round.inputLang === 'en' || round.inputLang === round.sourceLang ? undefined : round.studyLang} />
      <button type="button" className="btn primary" disabled={!value.trim() || locked} onClick={submit}>
        {t('games.action.check')}
      </button>
    </div>
  );
}

/** Shared correct/incorrect line for the games that check on demand. */
function RoundVerdict({ outcome, expected, lang }: { outcome: RoundOutcome | null; expected: string; lang?: string }) {
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
            {t('games.verdict.answer')} <b lang={lang}>{expected}</b>
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
      <div className={`game-builder-answer ${result ? (result.correct ? 'ok' : 'bad') : ''}`.trim()} lang={round.studyLang}>
        {answer.map((token) => (
          <button key={token.id} type="button" disabled={locked} onClick={() => undo(token.id)}>
            {token.token}
          </button>
        ))}
      </div>
      <div className="game-token-bank" lang={round.studyLang}>
        {bank.map((token) => (
          <button key={token.id} type="button" disabled={locked} onClick={() => pick(token.id)}>
            {token.token}
          </button>
        ))}
      </div>
      <RoundVerdict outcome={result} expected={round.answerTokens.join(round.studyLang === 'ru' ? ' ' : '')} lang={round.studyLang} />
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
                // `active` was the ONLY signal that this word is the one the
                // meaning buttons will pair with, so the selection existed in
                // colour and nowhere else.
                aria-pressed={selected === pairItem.jp}
                style={{ '--i': i } as CSSProperties}
                onClick={() => (paired ? clear(pairItem.jp) : setSelected(pairItem.jp))}
              >
                <span lang={round.studyLang}>
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
              // Same as the Japanese side: `chosen` was a tint and nothing else.
              aria-pressed={Object.values(matches).includes(meaning)}
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
    <ContextualSurface className="game-result">
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
                  addMistakeToDeck(mistake, t('games.mistake.yourAnswer'), t('games.deck.folder'));
                  window.dispatchEvent(new CustomEvent('os:toast', { detail: { message: t('games.toast.savedToFlashcards'), kind: 'ok' } }));
                }}
              >
                {t('games.mineMistake')}
              </button>
            </div>
          ))}
        </div>
      )}
    </ContextualSurface>
  );
}

function MirrorWritingPanel({
  settings,
  level,
}: {
  settings: GameArenaSettings;
  level: 1 | 2 | 3 | 4 | 5 | 6 | 7;
}) {
  const { t } = useT();
  const { lang: studyLang, tag: studyTag } = useStudyLanguage();
  const ai = useAiReadiness();
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [evaluation, setEvaluation] = useState<MirrorEvaluation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [ownNonce, setOwnNonce] = useState(0);
  useEffect(() => {
    const bump = () => setOwnNonce((n) => n + 1);
    window.addEventListener(MIRROR_USER_EVENT, bump);
    return () => window.removeEventListener(MIRROR_USER_EVENT, bump);
  }, []);

  // Every text for this language, the current level first. The picker used to
  // take the first text at the level, so 7 of 98 could ever appear.
  const rotation = useMemo(
    () => mirrorRotation(mirrorTextsFor(studyLang, loadUserMirrorTexts()), level),
    [studyLang, level, ownNonce],
  );
  const [offset, setOffset] = useState(() => Math.floor(Math.random() * 1000));
  const levelCount = useMemo(() => rotation.filter((r) => r.level === level).length || rotation.length, [rotation, level]);
  const text: MirrorText = rotation[offset % Math.max(1, levelCount)] ?? rotation[0];

  const nextText = (): void => {
    setOffset((o) => o + 1);
    setDraft('');
    setEvaluation(null);
    setError(null);
  };

  const submit = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    setEvaluation(null);
    const result = await evaluateMirrorWriting(settings, text, draft);
    setBusy(false);
    if (!result.ok) {
      // The evaluator is a plain module, so it hands back a key and resolves it
      // here — D332. A platform exception has no key and stays verbatim.
      setError(result.messageKey ? t(result.messageKey, result.messageVars) : result.message);
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

  const askAi = (): void => {
    const request = buildMirrorFeedbackRequest(text, draft);
    void handOffToAgent(
      {
        kind: 'selected-text',
        label: draft.trim().slice(0, 80),
        preview: request,
        source: { app: 'games', entityId: text.id },
        identity: `mirror/${text.id}/${draft.trim().slice(0, 200)}`,
        now: Date.now(),
      },
      t('games.mirror.aiConversation', { title: text.title }),
      routeAgentContext('games', t(AGENT_NAVIGATION_SECTION_LABEL_KEYS.games)),
    );
  };

  return (
    <div className="mirror-writing">
      <div className="mirror-idea-map">
        <h4>{text.title}</h4>
        {text.ideaMap.map((idea, index) => (
          <div key={idea.id} className="mirror-idea">
            <b>{index + 1}</b>
            <span>{(settings.sourceLang as string) === studyLang ? idea.concepts.en : idea.concepts[settings.sourceLang] || idea.concepts.en}</span>
          </div>
        ))}
      </div>

      <label className="mirror-draft">
        <span>{t('games.mirror.draft')}</span>
        <textarea
          lang={studyTag}
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
        {settings.mirrorBackend === 'local' && <span className="muted">{t('games.mirror.quickCheckNote')}</span>}
        {ai.loaded && ai.enabled && ai.ready && (
          <button
            data-ai-entry
            type="button"
            className="btn"
            disabled={draft.trim().length < 8}
            title={draft.trim().length < 8 ? t('games.mirror.aiNeedsDraft') : undefined}
            onClick={askAi}
          >
            {t('games.mirror.aiFeedback')}
          </button>
        )}
        <button type="button" className="btn" onClick={nextText}>
          {t('games.mirror.nextText')}
        </button>
        <button type="button" className="btn small" onClick={() => setImportOpen(true)}>
          {t('games.mirror.importTexts')}
        </button>
        <button type="button" className="btn small" onClick={openArenaSettings}>
          {t('games.settings')}
        </button>
      </div>

      {error && <div className="mirror-error">{error}</div>}

      {evaluation && (
        <div className="mirror-score-card">
          <div className="mirror-total">
            <b>{evaluation.total}</b>
            <span>{evaluation.summaryKey ? t(evaluation.summaryKey) : evaluation.summary}</span>
          </div>
          {(['grammar', 'vocabulary', 'flow', 'fidelity'] as MirrorAxis[]).map((axis) => (
            <div key={axis} className="mirror-axis">
              <div>
                <b>{t(`games.mirror.axis.${axis}`)}</b>
                <span>{evaluation.axes[axis].score}/100</span>
              </div>
              {evaluation.axes[axis].tips.map((tip, index) => (
                <p key={`${axis}-${index}`}>
                  {tip.span && <code>{tip.span}</code>} {tip.messageKey ? t(tip.messageKey) : tip.message}
                </p>
              ))}
            </div>
          ))}
          <details className="mirror-reference">
            <summary>{t('games.mirror.reference')}</summary>
            <p lang={studyTag}>{text.reference}</p>
          </details>
        </div>
      )}

      <ContentImportDialog<MirrorText>
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title={t('games.mirror.importTitle')}
        description={t('games.mirror.importDesc')}
        templates={{ csv: MIRROR_TEMPLATE_CSV, json: MIRROR_TEMPLATE_JSON }}
        templateName="mirror-writing-texts"
        parse={(raw, fileName) => parseMirrorTexts(raw, fileName, studyLang)}
        columns={[
          { label: t('games.mirror.col.title'), value: (r) => r.title },
          { label: t('games.mirror.col.level'), value: (r) => t('games.level.n', { level: r.level }) },
          { label: t('games.mirror.col.ideas'), value: (r) => r.ideaMap.length },
          { label: t('games.mirror.col.reference'), value: (r) => r.reference, lang: (r) => r.lang },
        ]}
        onCommit={(rows) => t('games.mirror.imported', { count: addUserMirrorTexts(rows) })}
      />
    </div>
  );
}
