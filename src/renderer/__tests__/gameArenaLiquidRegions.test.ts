import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const CONTENT = readFileSync(
  new URL('../components/games/GameArenaContent.tsx', import.meta.url),
  'utf8',
);
const LIQUID_CSS = readFileSync(
  new URL('../components/games/gameArenaLiquid.css', import.meta.url),
  'utf8',
);

describe('Game Arena Liquid regions', () => {
  it('uses the sanctioned contextual primitive for navigation and study context', () => {
    expect(CONTENT).toContain(
      "import { ContextualSurface } from '../liquid/LiquidSurface'",
    );
    expect(CONTENT).toContain(
      '<ContextualSurface as="header" className="game-arena-top">',
    );
    expect(CONTENT).toContain(
      '<ContextualSurface as="aside" className="game-list"',
    );
    expect(CONTENT).toContain(
      '<ContextualSurface as="section" className="game-stage-head">',
    );
    expect(CONTENT.match(/<ContextualSurface as="section" className="game-coverage/g)).toHaveLength(2);
    expect(CONTENT).toContain('<ContextualSurface className="game-result">');
  });

  it('keeps timing-sensitive gameplay and answer controls off contextual material', () => {
    expect(CONTENT).toContain('<main className="game-stage">');
    expect(CONTENT).toContain('<div className="game-round-hud">');
    expect(CONTENT).toContain('className="game-answer-box"');
    expect(CONTENT).not.toContain('<ContextualSurface className="game-round');
    expect(CONTENT).not.toContain('<ContextualSurface className="game-answer');
  });

  it('keeps every game description readable instead of clipping study context', () => {
    expect(CONTENT).toContain("import './gameArenaLiquid.css'");
    expect(LIQUID_CSS).toContain('.game-list .game-list-item small');
    expect(LIQUID_CSS).toContain('overflow: visible');
    expect(LIQUID_CSS).toContain('-webkit-line-clamp: unset');
  });
});
