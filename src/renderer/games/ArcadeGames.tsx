import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { useT } from '../i18n';
import { localizeArcadeText } from './arcadeText';
import type { SourceLang } from './types';
import { recordGameResult } from '../stats';

export type ArcadeGameId =
  | 'star-invaders'
  | 'comet-courier'
  | 'capsule-sorter'
  | 'signal-simon'
  | 'aero-breakout'
  | 'aero-blocks'
  | 'aero-pong'
  | 'aero-snake';

/** The four Aero-only games (the Special page's Aero collection). */
export const AERO_ARCADE_IDS: readonly ArcadeGameId[] = ['aero-breakout', 'aero-blocks', 'aero-pong', 'aero-snake'];
export type ArcadeTheme = 'wired' | 'aero';

interface ArcadeGamePanelProps {
  gameId: ArcadeGameId;
  theme: ArcadeTheme;
  level: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  sourceLang: SourceLang;
  onProgress: () => void;
  /**
   * The host asks for a few study answers before another run (`ArcadeStudyGate` in the
   * Arena), so the shell's own Restart button is not offered: the host offers it instead.
   */
  restartGated?: boolean;
}

interface ArcadeShellProps extends ArcadeGamePanelProps {
  title: string;
  subtitle: string;
  score: number;
  lives: number;
  stage: number;
  status: string;
  complete: boolean;
  onReset: () => void;
  children: ReactNode;
}

type CapsuleColor = 'mint' | 'rose' | 'gold' | 'cyan';

const CAPSULE_COLORS: CapsuleColor[] = ['mint', 'rose', 'gold', 'cyan'];
const DR_COLS = 8;
const DR_ROWS = 12;
const LANDER_TOUCHDOWN_TOP = 72;
const LANDER_ALTITUDE_TRAVEL = 62;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function pct(value: number): string {
  return `${value}%`;
}

function runScore(points: number, lives: number, stage: number): number {
  return Math.round(clamp(points * 2.4 + stage * 12 + lives * 5, 0, 100));
}

function runAccuracy(points: number, misses: number): number {
  return points + misses <= 0 ? 0 : points / (points + misses);
}

/**
 * A keydown aimed at a text field or a control that owns its own arrows/Space
 * (select, slider, listbox, menu). The arcade listens on `window`, so without
 * this a running game swallowed Space and arrows in every input app-wide.
 */
export function arcadeIgnoresKeyTarget(target: EventTarget | null): boolean {
  if (!target || typeof (target as Element).closest !== 'function') return false;
  const el = target as HTMLElement;
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (el.isContentEditable) return true;
  return !!el.closest(
    '[contenteditable=""], [contenteditable="true"], [role="textbox"], [role="combobox"], [role="slider"], [role="listbox"], [role="menu"], [role="menubar"], [role="tablist"], [role="spinbutton"]',
  );
}

function usePressedKeys(): React.MutableRefObject<Set<string>> {
  const keys = useRef(new Set<string>());
  useEffect(() => {
    const down = (event: KeyboardEvent): void => {
      if (arcadeIgnoresKeyTarget(event.target)) return;
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' '].includes(event.key)) {
        event.preventDefault();
      }
      keys.current.add(event.key);
    };
    const up = (event: KeyboardEvent): void => {
      keys.current.delete(event.key);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      keys.current.clear();
    };
  }, []);
  return keys;
}

function useArcadeResult({
  gameId,
  level,
  sourceLang,
  onProgress,
}: Pick<ArcadeGamePanelProps, 'gameId' | 'level' | 'sourceLang' | 'onProgress'>) {
  return useCallback((score: number, accuracy: number): void => {
    recordGameResult({
      gameId,
      level,
      sourceLang,
      score,
      accuracy,
      mistakes: [],
    });
    onProgress();
  }, [gameId, level, onProgress, sourceLang]);
}

function ArcadeShell({
  gameId,
  theme,
  title,
  subtitle,
  score,
  lives,
  stage,
  status,
  complete,
  onReset,
  children,
  restartGated,
}: ArcadeShellProps) {
  const { t } = useT();
  return (
    <div className={`arcade-game arcade-game--${theme} arcade-game--${gameId}`}>
      <div className="arcade-game__head">
        <div>
          <b>{localizeArcadeText(title, t)}</b>
          <span>{localizeArcadeText(subtitle, t)}</span>
        </div>
        <div className="arcade-game__hud">
          <span>{t('games.arcade.hud.score', { score })}</span>
          <span>{t(theme === 'wired' ? 'games.arcade.hud.signal' : 'games.arcade.hud.lives', { lives })}</span>
          <span>{t('games.arcade.hud.stage', { stage })}</span>
        </div>
      </div>
      {children}
      {/*
        Every arcade game reports what just happened through this one line, and
        it changed silently: a hit, a cleared board, a lost run all rewrote a
        plain div. A screen reader has no other channel here — the games are
        drawn, not described — so this is the only place the outcome exists as
        text, and it has to announce itself.
      */}
      <div className="arcade-game__status" role="status" aria-live="polite">{localizeArcadeText(status, t)}</div>
      {complete && !restartGated && (
        <button type="button" className="btn primary" onClick={onReset}>
          {t('games.arcade.restart')}
        </button>
      )}
    </div>
  );
}

/**
 * One game per id, in either theme. The Aero theme used to swap every title for
 * a different game (Space Invaders launched Breakout, LanderSim launched the
 * block puzzle…), while the themed games already carry their own Aero look;
 * the four Aero-only games now have ids of their own.
 */
export function ArcadeGamePanel(props: ArcadeGamePanelProps) {
  if (props.gameId === 'aero-breakout') return <AeroBreakout {...props} />;
  if (props.gameId === 'aero-blocks') return <AeroTetris {...props} />;
  if (props.gameId === 'aero-pong') return <AeroPong {...props} />;
  if (props.gameId === 'aero-snake') return <AeroSnake {...props} />;
  if (props.gameId === 'star-invaders') return <ThemedInvaders {...props} />;
  if (props.gameId === 'comet-courier') return <ThemedLander {...props} />;
  if (props.gameId === 'capsule-sorter') return <ThemedCapsuleStack {...props} />;
  return <ThemedMinesweeper {...props} />;
}

interface BreakoutBrick {
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
  color: CapsuleColor;
}

interface BreakoutState {
  stage: number;
  paddle: number;
  ball: { x: number; y: number; vx: number; vy: number };
  bricks: BreakoutBrick[];
  score: number;
  lives: number;
  misses: number;
  complete: boolean;
  status: string;
}

function makeBreakoutBricks(stage: number): BreakoutBrick[] {
  const rows = Math.min(6, 3 + Math.floor(stage / 2));
  return Array.from({ length: rows * 7 }, (_, index) => {
    const col = index % 7;
    const row = Math.floor(index / 7);
    return {
      id: stage * 100 + index,
      x: 5 + col * 13,
      y: 9 + row * 7,
      w: 11,
      h: 4.8,
      color: CAPSULE_COLORS[(row + col + stage) % CAPSULE_COLORS.length],
    };
  });
}

function initialBreakout(): BreakoutState {
  return {
    stage: 1,
    paddle: 41,
    ball: { x: 50, y: 70, vx: 1.15, vy: -1.35 },
    bricks: makeBreakoutBricks(1),
    score: 0,
    lives: 3,
    misses: 0,
    complete: false,
    status: 'Arrow keys move the glass paddle. Clear every tile before the ball drops.',
  };
}

function AeroBreakout(props: ArcadeGamePanelProps) {
  const { t } = useT();
  const record = useArcadeResult(props);
  const keys = usePressedKeys();
  const [state, setState] = useState<BreakoutState>(() => initialBreakout());
  const reset = (): void => setState(initialBreakout());

  useEffect(() => {
    const id = window.setInterval(() => {
      setState((current) => {
        if (current.complete) return current;
        let paddle = current.paddle;
        if (keys.current.has('ArrowLeft')) paddle -= 3.2;
        if (keys.current.has('ArrowRight')) paddle += 3.2;
        paddle = clamp(paddle, 0, 82);

        let { x, y, vx, vy } = current.ball;
        x += vx;
        y += vy;
        if (x <= 2 || x >= 98) vx *= -1;
        if (y <= 2) vy = Math.abs(vy);

        let bricks = current.bricks;
        let score = current.score;
        let status = current.status;
        const hit = bricks.find((brick) => x >= brick.x && x <= brick.x + brick.w && y >= brick.y && y <= brick.y + brick.h);
        if (hit) {
          bricks = bricks.filter((brick) => brick.id !== hit.id);
          score += 5 + current.stage;
          vy = Math.abs(vy);
          vx += (x - (hit.x + hit.w / 2)) / 80;
          status = 'Tile cleared.';
        }

        if (y >= 83 && y <= 89 && x >= paddle && x <= paddle + 18 && vy > 0) {
          vy = -Math.abs(vy) - current.stage * 0.015;
          vx += (x - (paddle + 9)) / 16;
          status = 'Clean paddle return.';
        }

        if (!bricks.length) {
          const stage = current.stage + 1;
          return {
            ...current,
            stage,
            paddle,
            ball: { x: 50, y: 70, vx: 1.05 + stage * 0.08, vy: -1.3 - stage * 0.04 },
            bricks: makeBreakoutBricks(stage),
            score: score + 20,
            lives: Math.min(5, current.lives + 1),
            status: `Board cleared. Aero tile set ${stage}.`,
          };
        }

        if (y > 102) {
          const lives = current.lives - 1;
          const misses = current.misses + 1;
          if (lives <= 0) {
            record(runScore(score, 0, current.stage), runAccuracy(score, misses * 20));
            return { ...current, paddle, score, lives: 0, misses, complete: true, status: 'Ball lost below the glass shelf.' };
          }
          return {
            ...current,
            paddle,
            ball: { x: 50, y: 70, vx: 1.15, vy: -1.35 },
            score,
            lives,
            misses,
            status: 'Ball dropped. Relaunching from center.',
          };
        }

        return { ...current, paddle, ball: { x: clamp(x, 2, 98), y: clamp(y, 0, 104), vx, vy }, bricks, score, status };
      });
    }, 32);
    return () => window.clearInterval(id);
  }, [keys, record]);

  return (
    <ArcadeShell {...props} title={t('games.arcade.breakout.title')} subtitle="jakesgordon-style Breakout logic under glossy desktop glass" score={state.score} lives={state.lives} stage={state.stage} status={state.status} complete={state.complete} onReset={reset}>
      <div className="arcade-aero-field arcade-aero-breakout">
        {state.bricks.map((brick) => (
          <span key={brick.id} className={`arcade-aero-brick capsule-${brick.color}`} style={{ left: pct(brick.x), top: pct(brick.y), width: pct(brick.w), height: pct(brick.h) }} />
        ))}
        <span className="arcade-aero-ball" style={{ left: pct(state.ball.x), top: pct(state.ball.y) }} />
        <span className="arcade-aero-paddle" style={{ left: pct(state.paddle) }} />
      </div>
    </ArcadeShell>
  );
}

type TetrisColor = CapsuleColor | 'blue' | 'violet' | 'silver';
type TetrisShapeKey = 'i' | 'o' | 't' | 's' | 'z' | 'j' | 'l';

interface TetrisPiece {
  key: TetrisShapeKey;
  x: number;
  y: number;
  rot: number;
  color: TetrisColor;
}

interface TetrisState {
  stage: number;
  grid: (TetrisColor | null)[];
  piece: TetrisPiece;
  score: number;
  lines: number;
  lives: number;
  ticks: number;
  complete: boolean;
  status: string;
}

const TETRIS_W = 10;
const TETRIS_H = 16;
const TETRIS_SHAPES: Record<TetrisShapeKey, number[][]> = {
  i: [[0, 1], [1, 1], [2, 1], [3, 1]],
  o: [[1, 0], [2, 0], [1, 1], [2, 1]],
  t: [[1, 0], [0, 1], [1, 1], [2, 1]],
  s: [[1, 0], [2, 0], [0, 1], [1, 1]],
  z: [[0, 0], [1, 0], [1, 1], [2, 1]],
  j: [[0, 0], [0, 1], [1, 1], [2, 1]],
  l: [[2, 0], [0, 1], [1, 1], [2, 1]],
};
const TETRIS_KEYS: TetrisShapeKey[] = ['i', 'o', 't', 's', 'z', 'j', 'l'];
const TETRIS_COLORS: TetrisColor[] = ['cyan', 'gold', 'violet', 'mint', 'rose', 'blue', 'silver'];

function tetrisIndex(x: number, y: number): number {
  return y * TETRIS_W + x;
}

function rotatePoint([x, y]: number[], rot: number): number[] {
  let px = x;
  let py = y;
  for (let i = 0; i < rot % 4; i += 1) {
    [px, py] = [3 - py, px];
  }
  return [px, py];
}

function pieceCells(piece: TetrisPiece): { x: number; y: number; color: TetrisColor }[] {
  return TETRIS_SHAPES[piece.key].map((point) => {
    const [x, y] = rotatePoint(point, piece.key === 'o' ? 0 : piece.rot);
    return { x: piece.x + x, y: piece.y + y, color: piece.color };
  });
}

function makeTetrisPiece(seed: number): TetrisPiece {
  const index = Math.abs(seed) % TETRIS_KEYS.length;
  return { key: TETRIS_KEYS[index], x: 3, y: -1, rot: 0, color: TETRIS_COLORS[index] };
}

function canTetrisPlace(grid: (TetrisColor | null)[], piece: TetrisPiece): boolean {
  return pieceCells(piece).every((cell) =>
    cell.x >= 0 && cell.x < TETRIS_W && cell.y < TETRIS_H && (cell.y < 0 || !grid[tetrisIndex(cell.x, cell.y)]),
  );
}

function initialTetris(): TetrisState {
  return {
    stage: 1,
    grid: Array.from({ length: TETRIS_W * TETRIS_H }, () => null),
    piece: makeTetrisPiece(1),
    score: 0,
    lines: 0,
    lives: 3,
    ticks: 0,
    complete: false,
    status: 'Arrow keys move and rotate. Space hard-drops the glass block.',
  };
}

function AeroTetris(props: ArcadeGamePanelProps) {
  const { t } = useT();
  const record = useArcadeResult(props);
  const keys = usePressedKeys();
  const [state, setState] = useState<TetrisState>(() => initialTetris());
  const rotateLatch = useRef(false);
  const dropLatch = useRef(false);
  const reset = (): void => setState(initialTetris());

  useEffect(() => {
    const id = window.setInterval(() => {
      setState((current) => {
        if (current.complete) return current;
        let piece = current.piece;
        let grid = current.grid;
        let status = current.status;
        const tryPiece = (candidate: TetrisPiece): boolean => {
          if (!canTetrisPlace(grid, candidate)) return false;
          piece = candidate;
          return true;
        };

        if (keys.current.has('ArrowLeft')) tryPiece({ ...piece, x: piece.x - 1 });
        if (keys.current.has('ArrowRight')) tryPiece({ ...piece, x: piece.x + 1 });
        if (keys.current.has('ArrowDown')) tryPiece({ ...piece, y: piece.y + 1 });
        if (keys.current.has('ArrowUp')) {
          if (!rotateLatch.current) tryPiece({ ...piece, rot: (piece.rot + 1) % 4 });
          rotateLatch.current = true;
        } else {
          rotateLatch.current = false;
        }
        if (keys.current.has(' ')) {
          if (!dropLatch.current) while (tryPiece({ ...piece, y: piece.y + 1 })) { /* hard drop */ }
          dropLatch.current = true;
        } else {
          dropLatch.current = false;
        }

        let score = current.score;
        let lines = current.lines;
        let stage = current.stage;
        let lives = current.lives;
        let complete = false;
        const falling = current.ticks % Math.max(3, 11 - stage) === 0;
        if (falling && !tryPiece({ ...piece, y: piece.y + 1 })) {
          const nextGrid = [...grid];
          pieceCells(piece).forEach((cell) => {
            if (cell.y >= 0) nextGrid[tetrisIndex(cell.x, cell.y)] = cell.color;
          });
          const keptRows: (TetrisColor | null)[][] = [];
          let cleared = 0;
          for (let y = 0; y < TETRIS_H; y += 1) {
            const row = nextGrid.slice(y * TETRIS_W, y * TETRIS_W + TETRIS_W);
            if (row.every(Boolean)) cleared += 1;
            else keptRows.push(row);
          }
          while (keptRows.length < TETRIS_H) keptRows.unshift(Array.from({ length: TETRIS_W }, () => null));
          grid = keptRows.flat();
          if (cleared) {
            lines += cleared;
            score += [0, 40, 100, 300, 1200][cleared] * stage;
            stage = 1 + Math.floor(lines / 6);
            status = `${cleared} line${cleared > 1 ? 's' : ''} cleared.`;
          } else {
            score += 2;
            status = 'Block locked.';
          }
          piece = makeTetrisPiece(current.ticks + score + lines);
          if (!canTetrisPlace(grid, piece)) {
            lives -= 1;
            if (lives <= 0) {
              complete = true;
              status = 'Glass well topped out.';
              record(runScore(score / 10, 0, stage), runAccuracy(lines + score / 100, 3));
            } else {
              grid = Array.from({ length: TETRIS_W * TETRIS_H }, () => null);
              status = 'Well overflow. Fresh glass well loaded.';
            }
          }
        }
        return { ...current, grid, piece, score, lines, stage, lives, complete, status, ticks: current.ticks + 1 };
      });
    }, 75);
    return () => window.clearInterval(id);
  }, [keys, record]);

  const cells = useMemo(() => {
    const overlay = new Map<number, TetrisColor>();
    pieceCells(state.piece).forEach((cell) => {
      if (cell.y >= 0) overlay.set(tetrisIndex(cell.x, cell.y), cell.color);
    });
    return state.grid.map((cell, index) => overlay.get(index) ?? cell);
  }, [state.grid, state.piece]);

  return (
    <ArcadeShell {...props} title={t('games.arcade.blocks.title')} subtitle="jakesgordon-style Tetris mechanics in a frosted glass well" score={state.score} lives={state.lives} stage={state.stage} status={state.status} complete={state.complete} onReset={reset}>
      <div className="arcade-aero-tetris">
        {cells.map((cell, index) => <span key={index} className={cell ? `arcade-tetris-cell tetris-${cell}` : 'arcade-tetris-cell'} />)}
      </div>
    </ArcadeShell>
  );
}

interface PongState {
  stage: number;
  player: number;
  ai: number;
  ball: { x: number; y: number; vx: number; vy: number };
  score: number;
  lives: number;
  misses: number;
  complete: boolean;
  status: string;
}

function initialPong(): PongState {
  return {
    stage: 1,
    player: 43,
    ai: 43,
    ball: { x: 50, y: 50, vx: 1.35, vy: 1.05 },
    score: 0,
    lives: 3,
    misses: 0,
    complete: false,
    status: 'Arrow Up and Down move the left paddle. First to ten rallies advances the glass table.',
  };
}

function AeroPong(props: ArcadeGamePanelProps) {
  const { t } = useT();
  const record = useArcadeResult(props);
  const keys = usePressedKeys();
  const [state, setState] = useState<PongState>(() => initialPong());
  const reset = (): void => setState(initialPong());

  useEffect(() => {
    const id = window.setInterval(() => {
      setState((current) => {
        if (current.complete) return current;
        let player = current.player;
        if (keys.current.has('ArrowUp')) player -= 3.2;
        if (keys.current.has('ArrowDown')) player += 3.2;
        player = clamp(player, 4, 82);
        let ai = current.ai + Math.sign(current.ball.y - (current.ai + 9)) * (1.45 + current.stage * 0.12);
        ai = clamp(ai, 4, 82);
        let { x, y, vx, vy } = current.ball;
        x += vx;
        y += vy;
        if (y <= 3 || y >= 97) vy *= -1;
        let score = current.score;
        let lives = current.lives;
        let misses = current.misses;
        let stage = current.stage;
        let complete = false;
        let status = current.status;

        if (x <= 8 && y >= player && y <= player + 18 && vx < 0) {
          vx = Math.abs(vx) + 0.05;
          vy += (y - (player + 9)) / 12;
          score += 1;
          status = 'Player paddle returned.';
        }
        if (x >= 92 && y >= ai && y <= ai + 18 && vx > 0) {
          vx = -Math.abs(vx) - 0.04;
          vy += (y - (ai + 9)) / 14;
          status = 'Remote paddle returned.';
        }
        if (x < -2) {
          lives -= 1;
          misses += 1;
          x = 50;
          y = 50;
          vx = 1.35 + stage * 0.08;
          vy = misses % 2 ? 1.05 : -1.05;
          status = 'Ball passed your paddle.';
          if (lives <= 0) {
            complete = true;
            record(runScore(score, 0, stage), runAccuracy(score, misses));
          }
        } else if (x > 102 || score >= stage * 10) {
          stage += 1;
          x = 50;
          y = 50;
          vx = -(1.35 + stage * 0.08);
          vy = score % 2 ? 1.1 : -1.1;
          status = `Aero table ${stage}. Ball speed increased.`;
        }
        return { ...current, player, ai, ball: { x, y: clamp(y, 3, 97), vx, vy }, score, lives, misses, stage, complete, status };
      });
    }, 32);
    return () => window.clearInterval(id);
  }, [keys, record]);

  return (
    <ArcadeShell {...props} title={t('games.arcade.pong.title')} subtitle="jakesgordon-style Pong with glass paddles and a soft center court" score={state.score} lives={state.lives} stage={state.stage} status={state.status} complete={state.complete} onReset={reset}>
      <div className="arcade-aero-field arcade-aero-pong">
        <span className="arcade-pong-net" />
        <span className="arcade-pong-paddle player" style={{ top: pct(state.player) }} />
        <span className="arcade-pong-paddle ai" style={{ top: pct(state.ai) }} />
        <span className="arcade-aero-ball" style={{ left: pct(state.ball.x), top: pct(state.ball.y) }} />
      </div>
    </ArcadeShell>
  );
}

type SnakeDir = 'up' | 'down' | 'left' | 'right';

interface SnakePoint {
  x: number;
  y: number;
}

interface SnakeState {
  stage: number;
  snake: SnakePoint[];
  food: SnakePoint;
  dir: SnakeDir;
  nextDir: SnakeDir;
  score: number;
  lives: number;
  misses: number;
  ticks: number;
  complete: boolean;
  status: string;
}

const SNAKE_W = 14;
const SNAKE_H = 12;

function makeFood(snake: SnakePoint[], seed: number): SnakePoint {
  for (let i = 0; i < SNAKE_W * SNAKE_H; i += 1) {
    const x = (seed * 5 + i * 3) % SNAKE_W;
    const y = (seed * 7 + i * 5) % SNAKE_H;
    if (!snake.some((point) => point.x === x && point.y === y)) return { x, y };
  }
  return { x: 0, y: 0 };
}

function initialSnake(): SnakeState {
  const snake = [{ x: 6, y: 6 }, { x: 5, y: 6 }, { x: 4, y: 6 }];
  return {
    stage: 1,
    snake,
    food: makeFood(snake, 4),
    dir: 'right',
    nextDir: 'right',
    score: 0,
    lives: 3,
    misses: 0,
    ticks: 0,
    complete: false,
    status: 'Arrow keys guide the ribbon. Eat glass pips and avoid your own trail.',
  };
}

function nextSnakeHead(head: SnakePoint, dir: SnakeDir): SnakePoint {
  if (dir === 'up') return { x: head.x, y: head.y - 1 };
  if (dir === 'down') return { x: head.x, y: head.y + 1 };
  if (dir === 'left') return { x: head.x - 1, y: head.y };
  return { x: head.x + 1, y: head.y };
}

function oppositeDir(a: SnakeDir, b: SnakeDir): boolean {
  return (a === 'up' && b === 'down') || (a === 'down' && b === 'up') || (a === 'left' && b === 'right') || (a === 'right' && b === 'left');
}

function AeroSnake(props: ArcadeGamePanelProps) {
  const { t } = useT();
  const record = useArcadeResult(props);
  const keys = usePressedKeys();
  const [state, setState] = useState<SnakeState>(() => initialSnake());
  const reset = (): void => setState(initialSnake());

  useEffect(() => {
    const id = window.setInterval(() => {
      setState((current) => {
        if (current.complete) return current;
        let nextDir = current.nextDir;
        if (keys.current.has('ArrowUp') && !oppositeDir(current.dir, 'up')) nextDir = 'up';
        if (keys.current.has('ArrowDown') && !oppositeDir(current.dir, 'down')) nextDir = 'down';
        if (keys.current.has('ArrowLeft') && !oppositeDir(current.dir, 'left')) nextDir = 'left';
        if (keys.current.has('ArrowRight') && !oppositeDir(current.dir, 'right')) nextDir = 'right';

        if (current.ticks % Math.max(3, 9 - current.stage) !== 0) {
          return { ...current, nextDir, ticks: current.ticks + 1 };
        }

        const head = nextSnakeHead(current.snake[0], nextDir);
        const hitWall = head.x < 0 || head.x >= SNAKE_W || head.y < 0 || head.y >= SNAKE_H;
        const hitSelf = current.snake.some((point) => point.x === head.x && point.y === head.y);
        if (hitWall || hitSelf) {
          const lives = current.lives - 1;
          const misses = current.misses + 1;
          if (lives <= 0) {
            record(runScore(current.score, 0, current.stage), runAccuracy(current.score, misses));
            return { ...current, lives: 0, misses, complete: true, status: hitWall ? 'Ribbon hit the glass border.' : 'Ribbon crossed itself.' };
          }
          const fresh = initialSnake();
          return { ...fresh, score: current.score, stage: current.stage, lives, misses, status: hitWall ? 'Border hit. Ribbon reset.' : 'Trail collision. Ribbon reset.' };
        }

        const ate = head.x === current.food.x && head.y === current.food.y;
        const snake = [head, ...current.snake];
        if (!ate) snake.pop();
        const score = current.score + (ate ? 1 : 0);
        const stage = 1 + Math.floor(score / 7);
        const food = ate ? makeFood(snake, current.ticks + score * 11) : current.food;
        return {
          ...current,
          snake,
          food,
          dir: nextDir,
          nextDir,
          score,
          stage,
          status: ate ? `Glass pip collected. Ribbon length ${snake.length}.` : current.status,
          ticks: current.ticks + 1,
        };
      });
    }, 55);
    return () => window.clearInterval(id);
  }, [keys, record]);

  return (
    <ArcadeShell {...props} title={t('games.arcade.snake.title')} subtitle="patorjk-style Snake rules with Vista ribbon tiles" score={state.score} lives={state.lives} stage={state.stage} status={state.status} complete={state.complete} onReset={reset}>
      <div className="arcade-aero-snake">
        {Array.from({ length: SNAKE_W * SNAKE_H }, (_, index) => {
          const x = index % SNAKE_W;
          const y = Math.floor(index / SNAKE_W);
          const segment = state.snake.findIndex((point) => point.x === x && point.y === y);
          const food = state.food.x === x && state.food.y === y;
          return <span key={index} className={`${segment >= 0 ? segment === 0 ? 'snake-head' : 'snake-body' : ''} ${food ? 'snake-food' : ''}`.trim()} />;
        })}
      </div>
    </ArcadeShell>
  );
}

type AlienKind = 'red' | 'green' | 'yellow';

interface Alien {
  id: number;
  x: number;
  y: number;
  kind: AlienKind;
}

interface Laser {
  id: number;
  x: number;
  y: number;
}

interface BarrierBlock {
  id: number;
  x: number;
  y: number;
  hp: number;
}

interface InvadersState {
  wave: number;
  playerX: number;
  aliens: Alien[];
  playerLasers: Laser[];
  alienLasers: Laser[];
  blocks: BarrierBlock[];
  direction: number;
  lives: number;
  score: number;
  misses: number;
  ticks: number;
  cooldown: number;
  extra?: { x: number; dir: number };
  complete: boolean;
  status: string;
}

function makeAliens(wave: number): Alien[] {
  return Array.from({ length: 48 }, (_, index) => {
    const row = Math.floor(index / 8);
    return {
      id: wave * 1000 + index,
      x: 12 + (index % 8) * 9.5,
      y: 13 + row * 6.6,
      kind: row === 0 ? 'yellow' : row <= 2 ? 'green' : 'red',
    };
  });
}

function makeBlocks(): BarrierBlock[] {
  const pattern = [
    [0, 1], [1, 0], [1, 1], [1, 2], [2, 0], [2, 1],
  ];
  return [18, 39, 60, 81].flatMap((x, bunker) =>
    pattern.map(([px, py], index) => ({
      id: bunker * 20 + index,
      x: x + px * 2.4,
      y: 76 + py * 3,
      hp: 2,
    })),
  );
}

function initialInvaders(): InvadersState {
  return {
    wave: 1,
    playerX: 50,
    aliens: makeAliens(1),
    playerLasers: [],
    alienLasers: [],
    blocks: makeBlocks(),
    direction: 1,
    lives: 3,
    score: 0,
    misses: 0,
    ticks: 0,
    cooldown: 0,
    complete: false,
    status: 'Arrow keys move. Space fires. Alien lasers and bunkers follow the open-source pygame pattern.',
  };
}

function alienValue(kind: AlienKind): number {
  if (kind === 'yellow') return 300;
  if (kind === 'green') return 200;
  return 100;
}

function ThemedInvaders(props: ArcadeGamePanelProps) {
  const record = useArcadeResult(props);
  const keys = usePressedKeys();
  const [state, setState] = useState<InvadersState>(() => initialInvaders());

  const reset = (): void => setState(initialInvaders());

  useEffect(() => {
    const id = window.setInterval(() => {
      setState((current) => {
        if (current.complete) return current;
        const speed = 0.62 + current.wave * 0.05;
        let playerX = current.playerX;
        if (keys.current.has('ArrowLeft')) playerX -= 2.4;
        if (keys.current.has('ArrowRight')) playerX += 2.4;
        playerX = clamp(playerX, 4, 96);

        let cooldown = Math.max(0, current.cooldown - 1);
        let playerLasers = current.playerLasers.map((laser) => ({ ...laser, y: laser.y - 4.4 })).filter((laser) => laser.y > -6);
        if (keys.current.has(' ') && cooldown === 0) {
          playerLasers = [...playerLasers, { id: current.ticks * 11 + 1, x: playerX, y: 84 }];
          cooldown = 12;
        }

        let direction = current.direction;
        let drop = false;
        if (current.aliens.some((alien) => alien.x + direction * speed < 4 || alien.x + direction * speed > 96)) {
          direction *= -1;
          drop = true;
        }
        let aliens = current.aliens.map((alien) => ({
          ...alien,
          x: alien.x + direction * speed,
          y: alien.y + (drop ? 3.4 : 0),
        }));

        let alienLasers = current.alienLasers.map((laser) => ({ ...laser, y: laser.y + 3.2 + current.wave * 0.08 })).filter((laser) => laser.y < 104);
        if (current.aliens.length && current.ticks % Math.max(18, 42 - current.wave * 2) === 0) {
          const shooter = current.aliens[(current.ticks * 7 + current.wave) % current.aliens.length];
          alienLasers = [...alienLasers, { id: current.ticks * 13 + 3, x: shooter.x, y: shooter.y + 3 }];
        }

        let blocks = current.blocks;
        const hitBlock = (laser: Laser): boolean => {
          const block = blocks.find((item) => Math.abs(item.x - laser.x) < 2.4 && Math.abs(item.y - laser.y) < 3.4);
          if (!block) return false;
          blocks = blocks.map((item) => item.id === block.id ? { ...item, hp: item.hp - 1 } : item).filter((item) => item.hp > 0);
          return true;
        };

        const scored: number[] = [];
        playerLasers = playerLasers.filter((laser) => {
          if (hitBlock(laser)) return false;
          const hit = aliens.find((alien) => Math.abs(alien.x - laser.x) < 4.6 && Math.abs(alien.y - laser.y) < 3.8);
          if (!hit) return true;
          scored.push(alienValue(hit.kind));
          aliens = aliens.filter((alien) => alien.id !== hit.id);
          return false;
        });

        alienLasers = alienLasers.filter((laser) => !hitBlock(laser));
        const playerHit = alienLasers.some((laser) => Math.abs(laser.x - playerX) < 4.8 && laser.y > 84);
        if (playerHit) alienLasers = alienLasers.filter((laser) => !(Math.abs(laser.x - playerX) < 4.8 && laser.y > 84));

        let extra = current.extra;
        let extraScore = 0;
        if (!extra && current.ticks % 240 === 120) {
          extra = { x: current.ticks % 480 === 120 ? -8 : 108, dir: current.ticks % 480 === 120 ? 1 : -1 };
        } else if (extra) {
          extra = { ...extra, x: extra.x + extra.dir * 1.6 };
          const ufoX = extra.x;
          const hitUfo = playerLasers.some((laser) => Math.abs(laser.x - ufoX) < 5 && Math.abs(laser.y - 8) < 4);
          if (hitUfo) {
            extraScore = 500;
            playerLasers = playerLasers.filter((laser) => !(Math.abs(laser.x - ufoX) < 5 && Math.abs(laser.y - 8) < 4));
            extra = undefined;
          } else if (extra.x < -10 || extra.x > 110) {
            extra = undefined;
          }
        }

        const score = current.score + scored.reduce((sum, value) => sum + value, 0) + extraScore;
        let lives = current.lives - (playerHit ? 1 : 0);
        let misses = current.misses + (playerHit ? 1 : 0);
        let wave = current.wave;
        let status = current.status;
        let complete = false;

        if (scored.length) status = 'Alien deleted. Formation compressed.';
        if (extraScore) status = props.theme === 'wired' ? 'Extra NAVI carrier intercepted.' : 'Bonus saucer popped cleanly.';
        if (playerHit) status = 'Incoming laser hit the base.';
        if (aliens.some((alien) => alien.y > 82)) {
          lives -= 1;
          misses += 1;
          aliens = aliens.map((alien) => ({ ...alien, y: alien.y - 12 }));
          status = 'Formation breached the bunker line.';
        }
        if (lives <= 0) {
          complete = true;
          status = 'Base offline.';
          record(runScore(score / 100, 0, wave), runAccuracy(score / 100, misses));
        } else if (!aliens.length) {
          wave += 1;
          aliens = makeAliens(wave);
          blocks = makeBlocks();
          status = `Wave ${wave} loaded.`;
        }

        return {
          ...current,
          playerX,
          aliens,
          playerLasers,
          alienLasers,
          blocks,
          direction,
          lives,
          misses,
          score,
          wave,
          cooldown,
          extra,
          complete,
          status,
          ticks: current.ticks + 1,
        };
      });
    }, 38);
    return () => window.clearInterval(id);
  }, [keys, props.theme, record]);

  const title = props.theme === 'wired' ? 'NAVI Space Invaders' : 'Aero Space Invaders';
  const subtitle = props.theme === 'wired'
    ? 'Spyder-0 pygame structure, redressed as terminal packet defense'
    : 'Spyder-0 pygame structure, redressed as glossy desktop aliens';

  return (
    <ArcadeShell {...props} title={title} subtitle={subtitle} score={Math.floor(state.score / 100)} lives={state.lives} stage={state.wave} status={state.status} complete={state.complete} onReset={reset}>
      <div className="arcade-pixel-field arcade-pixel-field--invaders">
        {state.extra && <span className="arcade-ufo" style={{ left: pct(state.extra.x), top: '8%' }} />}
        {state.aliens.map((alien) => (
          <span key={alien.id} className={`arcade-invader-sprite arcade-invader-sprite--${alien.kind}`} style={{ left: pct(alien.x), top: pct(alien.y) }} />
        ))}
        {state.blocks.map((block) => (
          <span key={block.id} className={`arcade-bunker-block hp-${block.hp}`} style={{ left: pct(block.x), top: pct(block.y) }} />
        ))}
        {state.playerLasers.map((laser) => <span key={laser.id} className="arcade-laser arcade-laser--player" style={{ left: pct(laser.x), top: pct(laser.y) }} />)}
        {state.alienLasers.map((laser) => <span key={laser.id} className="arcade-laser arcade-laser--alien" style={{ left: pct(laser.x), top: pct(laser.y) }} />)}
        <span className="arcade-player-cannon" style={{ left: pct(state.playerX) }} />
      </div>
    </ArcadeShell>
  );
}

interface LanderState {
  stage: number;
  x: number;
  z: number;
  vx: number;
  vz: number;
  phi: number;
  p: number;
  fuel: number;
  score: number;
  misses: number;
  thrust: number;
  angle: number;
  padX: number;
  complete: boolean;
  status: string;
}

function initialLander(): LanderState {
  return {
    stage: 1,
    x: -8,
    z: 18,
    vx: 1,
    vz: -0.45,
    phi: 0,
    p: 0,
    fuel: 100,
    score: 0,
    misses: 0,
    thrust: 0,
    angle: 0,
    padX: 0,
    complete: false,
    status: 'Arrow Up applies throttle. Left and Right vector thrust. Land level, slow, and on the pad.',
  };
}

function ThemedLander(props: ArcadeGamePanelProps) {
  const record = useArcadeResult(props);
  const keys = usePressedKeys();
  const [state, setState] = useState<LanderState>(() => initialLander());
  const gravity = props.theme === 'wired' ? 2.4 : 1.62;
  const reset = (): void => setState(initialLander());

  useEffect(() => {
    const id = window.setInterval(() => {
      setState((current) => {
        if (current.complete) return current;
        const dt = 0.045;
        const stageGravity = gravity + current.stage * 0.08;
        const turning = (keys.current.has('ArrowLeft') ? -1 : 0) + (keys.current.has('ArrowRight') ? 1 : 0);
        const angle = clamp(current.angle + turning * 1.8, -16, 16);
        const thrust = current.fuel > 0 && keys.current.has('ArrowUp') ? 78 : Math.max(0, current.thrust - 10);
        const fuel = Math.max(0, current.fuel - (thrust > 0 ? 0.72 : 0));
        const thrustAccel = (thrust / 50) * stageGravity;
        const thrustAngle = (angle + current.phi) * Math.PI / 180;
        const ax = Math.sin(thrustAngle) * thrustAccel;
        const az = Math.cos(thrustAngle) * thrustAccel - stageGravity;
        const vx = clamp(current.vx + ax * dt, -8, 8);
        const vz = clamp(current.vz + az * dt, -10, 8);
        const p = clamp(current.p + (-Math.sin(angle * Math.PI / 180) * thrustAccel * 8) * dt, -55, 55);
        const phi = clamp(current.phi + p * dt, -100, 100);
        const x = clamp(current.x + vx * dt, -16, 16);
        const z = current.z + vz * dt;

        if (z > 0) {
          return { ...current, x, z, vx, vz, phi, p, fuel, thrust, angle };
        }

        const soft = Math.abs(vx) < 1.55 && Math.abs(vz) < 2.15 && Math.abs(phi) < 12;
        const onPad = Math.abs(x - current.padX) < 3.2;
        if (soft && onPad) {
          const stageScore = Math.round(clamp(18 + fuel * 0.12 + (2.15 - Math.abs(vz)) * 3, 12, 34));
          const stage = current.stage + 1;
          return {
            ...initialLander(),
            stage,
            x: -10 + ((stage * 7) % 20),
            vx: stage % 2 ? 1.2 : -1.2,
            fuel: Math.min(100, fuel + 28),
            score: current.score + stageScore,
            padX: -8 + ((stage * 5) % 17),
            status: `Touchdown accepted. Stage ${stage} pad relocated.`,
          };
        }

        const score = runScore(current.score, Math.ceil(fuel / 25), current.stage);
        record(score, clamp(current.score / Math.max(1, current.stage * 24), 0, 1));
        return {
          ...current,
          x,
          z: 0,
          vx,
          vz,
          phi,
          p,
          fuel,
          thrust,
          angle,
          complete: true,
          misses: current.misses + 1,
          status: soft ? 'The pad was missed.' : 'Touchdown forces exceeded the sim limits.',
        };
      });
    }, 32);
    return () => window.clearInterval(id);
  }, [gravity, keys, record]);

  const left = ((state.x + 16) / 32) * 100;
  const top = LANDER_TOUCHDOWN_TOP - clamp(state.z / 20, 0, 1) * LANDER_ALTITUDE_TRAVEL;
  const padLeft = ((state.padX + 16) / 32) * 100;
  const title = props.theme === 'wired' ? 'Terminal LanderSim' : 'Aero LanderSim';

  return (
    <ArcadeShell {...props} title={title} subtitle="Nick Rehm-style 3DOF lander physics compacted for the arcade panel" score={state.score} lives={Math.ceil(state.fuel / 25)} stage={state.stage} status={state.status} complete={state.complete} onReset={reset}>
      <div className="arcade-pixel-field arcade-pixel-field--lander">
        <span className="arcade-ground" />
        <span className="arcade-pad" style={{ left: pct(padLeft) }} />
        <span className="arcade-lander-body" style={{ left: pct(left), top: pct(top), transform: `translate(-50%, -50%) rotate(${state.phi}deg)` }}>
          {state.thrust > 0 && <i style={{ height: `${18 + state.thrust / 3}px` }} />}
        </span>
        <span className="arcade-lander-vector" style={{ left: pct(left), top: pct(top), transform: `translate(-50%, -50%) rotate(${state.angle + state.phi}deg)` }} />
        <span className="arcade-readout">
          ALT {Math.max(0, state.z).toFixed(1)} / VZ {state.vz.toFixed(1)} / VX {state.vx.toFixed(1)} / ATT {state.phi.toFixed(0)} / FUEL {Math.round(state.fuel)}
        </span>
      </div>
    </ArcadeShell>
  );
}

interface DrCell {
  color: CapsuleColor;
  kind: 'virus' | 'pill';
}

interface ActiveCapsule {
  x: number;
  y: number;
  orientation: 'h' | 'v';
  colors: [CapsuleColor, CapsuleColor];
}

interface CapsuleState {
  stage: number;
  grid: (DrCell | null)[];
  active: ActiveCapsule;
  score: number;
  lives: number;
  misses: number;
  ticks: number;
  complete: boolean;
  status: string;
}

function gridIndex(x: number, y: number): number {
  return y * DR_COLS + x;
}

function capsuleParts(active: ActiveCapsule): { x: number; y: number; color: CapsuleColor }[] {
  const second = active.orientation === 'h'
    ? { x: active.x + 1, y: active.y, color: active.colors[1] }
    : { x: active.x, y: active.y + 1, color: active.colors[1] };
  return [{ x: active.x, y: active.y, color: active.colors[0] }, second];
}

function canPlace(grid: (DrCell | null)[], active: ActiveCapsule): boolean {
  return capsuleParts(active).every((part) =>
    part.x >= 0 && part.x < DR_COLS && part.y >= 0 && part.y < DR_ROWS && !grid[gridIndex(part.x, part.y)],
  );
}

function makeCapsule(seed: number): ActiveCapsule {
  return {
    x: 3,
    y: 0,
    orientation: 'h',
    colors: [CAPSULE_COLORS[seed % CAPSULE_COLORS.length], CAPSULE_COLORS[(seed * 3 + 1) % CAPSULE_COLORS.length]],
  };
}

function makeBottle(stage: number): (DrCell | null)[] {
  const grid = Array.from({ length: DR_COLS * DR_ROWS }, () => null as DrCell | null);
  const virusCount = Math.min(28, 8 + stage * 3);
  for (let i = 0; i < virusCount; i += 1) {
    const x = (i * 5 + stage * 2) % DR_COLS;
    const y = DR_ROWS - 1 - ((i * 7 + stage) % 7);
    const index = gridIndex(x, y);
    if (!grid[index]) grid[index] = { kind: 'virus', color: CAPSULE_COLORS[(i + stage) % CAPSULE_COLORS.length] };
  }
  return grid;
}

function initialCapsules(): CapsuleState {
  return {
    stage: 1,
    grid: makeBottle(1),
    active: makeCapsule(1),
    score: 0,
    lives: 3,
    misses: 0,
    ticks: 0,
    complete: false,
    status: 'Arrow keys move and rotate. Space drops. Match four colors to clear viruses.',
  };
}

function clearMatches(grid: (DrCell | null)[]): { grid: (DrCell | null)[]; clearedViruses: number; clearedAny: boolean } {
  const clear = new Set<number>();
  const scan = (x: number, y: number, dx: number, dy: number): void => {
    const cell = grid[gridIndex(x, y)];
    if (!cell) return;
    const run: number[] = [];
    let xx = x;
    let yy = y;
    while (xx >= 0 && xx < DR_COLS && yy >= 0 && yy < DR_ROWS) {
      const next = grid[gridIndex(xx, yy)];
      if (!next || next.color !== cell.color) break;
      run.push(gridIndex(xx, yy));
      xx += dx;
      yy += dy;
    }
    if (run.length >= 4) run.forEach((index) => clear.add(index));
  };
  for (let y = 0; y < DR_ROWS; y += 1) {
    for (let x = 0; x < DR_COLS; x += 1) {
      scan(x, y, 1, 0);
      scan(x, y, 0, 1);
    }
  }
  if (!clear.size) return { grid, clearedViruses: 0, clearedAny: false };
  const next = [...grid];
  let clearedViruses = 0;
  clear.forEach((index) => {
    if (next[index]?.kind === 'virus') clearedViruses += 1;
    next[index] = null;
  });

  for (let x = 0; x < DR_COLS; x += 1) {
    let write = DR_ROWS - 1;
    for (let y = DR_ROWS - 1; y >= 0; y -= 1) {
      const cell = next[gridIndex(x, y)];
      if (cell?.kind === 'virus') {
        write = y - 1;
      } else if (cell?.kind === 'pill') {
        next[gridIndex(x, y)] = null;
        next[gridIndex(x, write)] = cell;
        write -= 1;
      }
    }
  }
  return { grid: next, clearedViruses, clearedAny: true };
}

function ThemedCapsuleStack(props: ArcadeGamePanelProps) {
  const record = useArcadeResult(props);
  const keys = usePressedKeys();
  const [state, setState] = useState<CapsuleState>(() => initialCapsules());
  const rotateLatch = useRef(false);
  const dropLatch = useRef(false);
  const reset = (): void => setState(initialCapsules());

  useEffect(() => {
    const id = window.setInterval(() => {
      setState((current) => {
        if (current.complete) return current;
        let active = current.active;
        let grid = current.grid;
        let status = current.status;
        const move = (dx: number, dy: number, candidate = active): boolean => {
          const next = { ...candidate, x: candidate.x + dx, y: candidate.y + dy };
          if (!canPlace(grid, next)) return false;
          active = next;
          return true;
        };
        if (keys.current.has('ArrowLeft')) move(-1, 0);
        if (keys.current.has('ArrowRight')) move(1, 0);
        if (keys.current.has('ArrowUp')) {
          if (!rotateLatch.current) {
            const rotated: ActiveCapsule = { ...active, orientation: active.orientation === 'h' ? 'v' : 'h' };
            if (canPlace(grid, rotated)) active = rotated;
          }
          rotateLatch.current = true;
        } else {
          rotateLatch.current = false;
        }
        if (keys.current.has(' ')) {
          if (!dropLatch.current) while (move(0, 1)) { /* hard drop */ }
          dropLatch.current = true;
        } else {
          dropLatch.current = false;
        }

        let score = current.score;
        let stage = current.stage;
        let lives = current.lives;
        let misses = current.misses;
        let complete = false;
        const shouldFall = current.ticks % Math.max(4, 14 - stage) === 0;
        if (shouldFall && !move(0, 1)) {
          const placed = [...grid];
          capsuleParts(active).forEach((part) => {
            placed[gridIndex(part.x, part.y)] = { kind: 'pill', color: part.color };
          });
          grid = placed;
          let chain = clearMatches(grid);
          let chainCount = 0;
          while (chain.clearedAny && chainCount < 6) {
            chainCount += 1;
            grid = chain.grid;
            score += chain.clearedViruses * (8 + chainCount * 3);
            chain = clearMatches(grid);
          }
          const viruses = grid.filter((cell) => cell?.kind === 'virus').length;
          if (viruses === 0) {
            stage += 1;
            grid = makeBottle(stage);
            active = makeCapsule(stage + score);
            status = `Bottle clean. Stage ${stage} loaded.`;
          } else {
            active = makeCapsule(current.ticks + score + stage);
            status = chainCount ? 'Color chain cleared.' : 'Capsule locked.';
          }
          if (!canPlace(grid, active)) {
            lives -= 1;
            misses += 1;
            grid = makeBottle(stage);
            active = makeCapsule(stage + score);
            status = 'Bottle overflow. New bottle installed.';
            if (lives <= 0) {
              complete = true;
              status = 'Capsule stack overflowed.';
              record(runScore(score, 0, stage), runAccuracy(score, misses));
            }
          }
        }
        return { ...current, grid, active, score, stage, lives, misses, complete, status, ticks: current.ticks + 1 };
      });
    }, 70);
    return () => window.clearInterval(id);
  }, [keys, record]);

  const cells = useMemo(() => {
    const overlay = new Map<number, CapsuleColor>();
    capsuleParts(state.active).forEach((part) => overlay.set(gridIndex(part.x, part.y), part.color));
    return state.grid.map((cell, index) => ({ cell, active: overlay.get(index) }));
  }, [state.active, state.grid]);
  const title = props.theme === 'wired' ? 'NAVI Dr. Capsule' : 'Media Center Dr. Capsule';

  return (
    <ArcadeShell {...props} title={title} subtitle="Open-source capsule-puzzle style play, themed for the active shell" score={state.score} lives={state.lives} stage={state.stage} status={state.status} complete={state.complete} onReset={reset}>
      <div className="arcade-dr-bottle">
        {cells.map(({ cell, active }, index) => {
          const color = active ?? cell?.color;
          const kind = active ? 'pill' : cell?.kind;
          return <span key={index} className={color ? `arcade-dr-cell capsule-${color} is-${kind}` : 'arcade-dr-cell'} />;
        })}
      </div>
    </ArcadeShell>
  );
}

interface MineCell {
  mine: boolean;
  value: number;
  selected: boolean;
  flagged: boolean;
}

interface MineState {
  stage: number;
  size: number;
  mines: number;
  board: MineCell[];
  selectable: number;
  score: number;
  lives: number;
  misses: number;
  complete: boolean;
  status: string;
}

function mineIndex(x: number, y: number, size: number): number {
  return y * size + x;
}

function makeMineBoard(stage: number): MineState {
  const size = Math.min(8, 5 + Math.floor(stage / 2));
  const mines = Math.min(size * size - 4, 5 + stage * 2);
  const board = Array.from({ length: size * size }, () => ({
    mine: false,
    value: 0,
    selected: false,
    flagged: false,
  }));
  let placed = 0;
  let seed = stage * 37 + 11;
  while (placed < mines) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const index = seed % board.length;
    if (board[index].mine) continue;
    board[index].mine = true;
    placed += 1;
  }
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const cell = board[mineIndex(x, y, size)];
      if (cell.mine) {
        cell.value = -1;
        continue;
      }
      let count = 0;
      for (let yy = y - 1; yy <= y + 1; yy += 1) {
        for (let xx = x - 1; xx <= x + 1; xx += 1) {
          if (xx === x && yy === y) continue;
          if (xx < 0 || xx >= size || yy < 0 || yy >= size) continue;
          if (board[mineIndex(xx, yy, size)].mine) count += 1;
        }
      }
      cell.value = count;
    }
  }
  return {
    stage,
    size,
    mines,
    board,
    selectable: size * size - mines,
    score: 0,
    lives: 2,
    misses: 0,
    complete: false,
    status: 'Left click opens cells. Right click flags. Empty cells flood-fill like the Python source.',
  };
}

function ThemedMinesweeper(props: ArcadeGamePanelProps) {
  const record = useArcadeResult(props);
  const { t, lang } = useT();
  const [state, setState] = useState<MineState>(() => makeMineBoard(1));
  const reset = (): void => setState(makeMineBoard(1));

  /**
   * What one cell is called.
   *
   * The board is 25 bare `<button>`s whose only content appears once they are
   * revealed, so an unplayed board announced itself as "button" twenty-five
   * times over — no position, no state, and a revealed 0 reads the same as an
   * untouched square because its label is the empty string. The name has to
   * carry both halves: where it is, and what it is now.
   */
  const cellLabel = useCallback(
    (cell: MineState['board'][number], index: number): string => {
      const row = Math.floor(index / state.size) + 1;
      const col = (index % state.size) + 1;
      if (cell.flagged && !cell.selected) return t('games.arcade.mines.cellFlagged', { row, col });
      if (!cell.selected) return t('games.arcade.mines.cellHidden', { row, col });
      if (cell.mine) return t('games.arcade.mines.cellMine', { row, col });
      if (!cell.value) return t('games.arcade.mines.cellEmpty', { row, col });
      return t('games.arcade.mines.cellCount', { row, col, count: cell.value });
    },
    // `lang`, never `t` — `t`'s identity is stable by design, so depending on it
    // goes stale after a language switch instead of erroring.
    [lang, state.size, t],
  );

  const reveal = (start: number): void => {
    setState((current) => {
      if (current.complete || current.board[start].selected || current.board[start].flagged) return current;
      const board = current.board.map((cell) => ({ ...cell }));
      let selectable = current.selectable;
      let score = current.score;
      let lives = current.lives;
      let misses = current.misses;
      let complete = false;
      let status = 'Safe cell opened.';

      const open = (index: number): void => {
        const cell = board[index];
        if (cell.selected || cell.flagged) return;
        cell.selected = true;
        if (!cell.mine) {
          selectable -= 1;
          score += 1;
        }
        if (cell.value !== 0 || cell.mine) return;
        const x = index % current.size;
        const y = Math.floor(index / current.size);
        for (let yy = y - 1; yy <= y + 1; yy += 1) {
          for (let xx = x - 1; xx <= x + 1; xx += 1) {
            if (xx < 0 || xx >= current.size || yy < 0 || yy >= current.size) continue;
            open(mineIndex(xx, yy, current.size));
          }
        }
      };

      if (board[start].mine) {
        board[start].selected = true;
        lives -= 1;
        misses += 1;
        status = 'Mine hit.';
        if (lives <= 0) {
          complete = true;
          status = 'Minefield lost.';
          record(runScore(score, 0, current.stage), runAccuracy(score, misses));
        }
      } else {
        open(start);
        if (selectable <= 0) {
          const next = makeMineBoard(current.stage + 1);
          return {
            ...next,
            score,
            lives: Math.min(3, lives + 1),
            misses,
            status: `Board cleared. Stage ${current.stage + 1} armed.`,
          };
        }
      }
      return { ...current, board, selectable, score, lives, misses, complete, status };
    });
  };

  // A right click, or F on a focused cell: flagging was mouse-only.
  const flag = (event: Pick<MouseEvent, 'preventDefault'>, index: number): void => {
    event.preventDefault();
    setState((current) => {
      if (current.complete || current.board[index].selected) return current;
      const board = current.board.map((cell, i) => i === index ? { ...cell, flagged: !cell.flagged } : cell);
      return { ...current, board, status: board[index].flagged ? 'Cell flagged.' : 'Flag removed.' };
    });
  };

  const title = props.theme === 'wired' ? 'Terminal Minesweeper' : 'Aero Minesweeper';

  return (
    <ArcadeShell {...props} title={title} subtitle="RaemondBW recursive board logic, restyled for the active shell" score={state.score} lives={state.lives} stage={state.stage} status={state.status} complete={state.complete} onReset={reset}>
      <div
        className="arcade-mines"
        role="group"
        aria-label={t('games.arcade.mines.board', { size: state.size })}
        style={{ gridTemplateColumns: `repeat(${state.size}, minmax(0, 1fr))` }}
      >
        {state.board.map((cell, index) => (
          <button
            key={index}
            type="button"
            aria-label={cellLabel(cell, index)}
            className={`${cell.selected ? cell.mine ? 'mine' : 'open' : ''} ${cell.flagged ? 'flagged' : ''}`.trim()}
            onClick={() => reveal(index)}
            onContextMenu={(event) => flag(event, index)}
            onKeyDown={(event) => {
              if (event.key === 'f' || event.key === 'F') flag(event, index);
            }}
            aria-keyshortcuts="F"
          >
            {cell.selected ? (cell.mine ? '!' : cell.value || '') : cell.flagged ? 'F' : ''}
          </button>
        ))}
      </div>
    </ArcadeShell>
  );
}
