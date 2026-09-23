import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { localizeArcadeText } from '../games/arcadeText';

const t = (key: string, vars?: Record<string, string | number>): string =>
  `${key}${vars ? ` ${JSON.stringify(vars)}` : ''}`;

describe('arcade game text', () => {
  it('localizes the static game announcements, titles, and subtitles', () => {
    const source = fs.readFileSync('src/renderer/games/ArcadeGames.tsx', 'utf8');
    const visible = [
      ...[...source.matchAll(/(?:status:|status\s*=)\s*'([^']+)'/g)].map((match) => match[1]),
      ...[...source.matchAll(/(?:title|subtitle)="([^"]+)"/g)].map((match) => match[1]),
      'NAVI Space Invaders',
      'Aero Space Invaders',
      'Terminal LanderSim',
      'Aero LanderSim',
      'NAVI Dr. Capsule',
      'Media Center Dr. Capsule',
      'Terminal Minesweeper',
      'Aero Minesweeper',
    ];
    for (const value of visible) {
      expect(localizeArcadeText(value, t), value).toMatch(/^games\.arcade\./);
    }
  });

  it.each([
    ['Board cleared. Aero tile set 2.', 'breakout.next', 'stage', 2],
    ['1 line cleared.', 'blocks.cleared', 'count', 1],
    ['4 lines cleared.', 'blocks.cleared', 'count', 4],
    ['Aero table 3. Ball speed increased.', 'pong.next', 'stage', 3],
    ['Glass pip collected. Ribbon length 6.', 'snake.pip', 'length', 6],
    ['Wave 4 loaded.', 'invaders.next', 'wave', 4],
    ['Touchdown accepted. Stage 5 pad relocated.', 'lander.next', 'stage', 5],
    ['Bottle clean. Stage 6 loaded.', 'capsule.next', 'stage', 6],
    ['Board cleared. Stage 7 armed.', 'mines.next', 'stage', 7],
  ] as const)('localizes a result with its count: %s', (value, key, variable, count) => {
    expect(localizeArcadeText(value, t)).toBe(
      `games.arcade.${key} ${JSON.stringify({ [variable]: count })}`,
    );
  });
});
