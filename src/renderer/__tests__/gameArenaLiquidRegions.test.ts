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

  it('keeps the gameplay canvas on an opaque semantic work material', () => {
    expect(LIQUID_CSS).toMatch(/\.game-stage\s*\{[^}]*background: var\(--lq-work-bg\)/s);
  });

  it('reflows against its own frame rather than the desktop viewport', () => {
    // The Arena renders inside a floating window, so `@media (max-width: …)` in
    // styles.css cannot fire while the window is narrow and the desktop is wide.
    expect(LIQUID_CSS).toMatch(/\.game-arena\s*\{[^}]*container-type: inline-size/s);
    expect(LIQUID_CSS).toContain('@container (max-width: 560px)');
  });

  it('turns the catalogue and stage into one vertical document when narrow', () => {
    const compact = LIQUID_CSS.slice(LIQUID_CSS.indexOf('@container (max-width: 560px)'));
    expect(compact).toMatch(/\.game-arena-layout\s*\{[^}]*flex-direction: column/s);
    expect(compact).toMatch(/\.game-list\s*\{[^}]*max-height: 200px/s);
    expect(compact).toMatch(/\.game-stage\s*\{[^}]*flex: 1 1 auto/s);
    // Four 76px HUD chips and the two-column match board are both wider than
    // the frame at 260px and would otherwise scroll the stage horizontally.
    expect(compact).toMatch(/\.game-round-hud,\s*\.game-arena \.game-match-grid\s*\{[^}]*minmax\(0, 1fr\)/s);
    expect(compact).toMatch(/\.game-coverage\s*\{[^}]*flex-direction: column/s);
    expect(compact).toMatch(/\.game-history-list\s*\{[^}]*minmax\(0, 1fr\)/s);
  });

  it('shows the recorded rounds the store has always kept, with an honest empty state', () => {
    expect(CONTENT).toContain('<ContextualSurface as="section" className="game-history"');
    expect(CONTENT).toContain("t('games.history.label')");
    expect(CONTENT).toContain("t('games.history.empty')");
    expect(CONTENT).toContain("t('games.history.line'");
    expect(CONTENT).toContain("progress.recent.filter((entry) => entry.gameId === selected)");
    // Locale-aware: a bare toLocaleDateString() follows the OS, not the UI language.
    expect(CONTENT).toContain('toLocaleDateString(LANG_TAGS[lang])');
    // The records wrap into columns; one per row left a 568px empty band
    // between each row's summary and its right-aligned date at stage width.
    // The floor is clamped with `min(…, 100%)`, which `gridTrackFloorsFitTheWindow`
    // requires of every auto-fill grid whose track floor exceeds the 212px window minimum.
    expect(LIQUID_CSS).toMatch(/\.game-history-list\s*\{[^}]*repeat\(auto-fill, minmax\(min\(230px, 100%\), 1fr\)\)/s);
    expect(LIQUID_CSS).toMatch(/\.game-ready\s*\{[^}]*flex: 1 1 auto/s);
  });
});
