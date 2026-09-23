type Translate = (key: string, vars?: Record<string, string | number>) => string;

const keys: Record<string, string> = {
  'Aero Breakout': 'breakout.title',
  'jakesgordon-style Breakout logic under glossy desktop glass': 'breakout.subtitle',
  'Arrow keys move the glass paddle. Clear every tile before the ball drops.': 'breakout.start',
  'Tile cleared.': 'breakout.tile',
  'Clean paddle return.': 'breakout.return',
  'Ball lost below the glass shelf.': 'breakout.lost',
  'Ball dropped. Relaunching from center.': 'breakout.retry',
  'Aero Blocks': 'blocks.title',
  'jakesgordon-style Tetris mechanics in a frosted glass well': 'blocks.subtitle',
  'Arrow keys move and rotate. Space hard-drops the glass block.': 'blocks.start',
  'Block locked.': 'blocks.locked',
  'Glass well topped out.': 'blocks.lost',
  'Well overflow. Fresh glass well loaded.': 'blocks.retry',
  'Aero Pong': 'pong.title',
  'jakesgordon-style Pong with glass paddles and a soft center court': 'pong.subtitle',
  'Arrow Up and Down move the left paddle. First to ten rallies advances the glass table.': 'pong.start',
  'Player paddle returned.': 'pong.playerReturn',
  'Remote paddle returned.': 'pong.remoteReturn',
  'Ball passed your paddle.': 'pong.missed',
  'Aero Snake': 'snake.title',
  'patorjk-style Snake rules with Vista ribbon tiles': 'snake.subtitle',
  'Arrow keys guide the ribbon. Eat glass pips and avoid your own trail.': 'snake.start',
  'Ribbon hit the glass border.': 'snake.borderLost',
  'Ribbon crossed itself.': 'snake.trailLost',
  'Border hit. Ribbon reset.': 'snake.borderRetry',
  'Trail collision. Ribbon reset.': 'snake.trailRetry',
  'NAVI Space Invaders': 'invaders.wiredTitle',
  'Aero Space Invaders': 'invaders.aeroTitle',
  'Spyder-0 pygame structure, redressed as terminal packet defense': 'invaders.wiredSubtitle',
  'Spyder-0 pygame structure, redressed as glossy desktop aliens': 'invaders.aeroSubtitle',
  'Arrow keys move. Space fires. Alien lasers and bunkers follow the open-source pygame pattern.': 'invaders.start',
  'Alien deleted. Formation compressed.': 'invaders.hit',
  'Extra NAVI carrier intercepted.': 'invaders.wiredBonus',
  'Bonus saucer popped cleanly.': 'invaders.aeroBonus',
  'Incoming laser hit the base.': 'invaders.hitBase',
  'Formation breached the bunker line.': 'invaders.breached',
  'Base offline.': 'invaders.lost',
  'Terminal LanderSim': 'lander.wiredTitle',
  'Aero LanderSim': 'lander.aeroTitle',
  'Nick Rehm-style 3DOF lander physics compacted for the arcade panel': 'lander.subtitle',
  'Arrow Up applies throttle. Left and Right vector thrust. Land level, slow, and on the pad.': 'lander.start',
  'The pad was missed.': 'lander.missed',
  'Touchdown forces exceeded the sim limits.': 'lander.crashed',
  'NAVI Dr. Capsule': 'capsule.wiredTitle',
  'Media Center Dr. Capsule': 'capsule.aeroTitle',
  'Open-source capsule-puzzle style play, themed for the active shell': 'capsule.subtitle',
  'Arrow keys move and rotate. Space drops. Match four colors to clear viruses.': 'capsule.start',
  'Color chain cleared.': 'capsule.chain',
  'Capsule locked.': 'capsule.locked',
  'Bottle overflow. New bottle installed.': 'capsule.retry',
  'Capsule stack overflowed.': 'capsule.lost',
  'Terminal Minesweeper': 'mines.wiredTitle',
  'Aero Minesweeper': 'mines.aeroTitle',
  'RaemondBW recursive board logic, restyled for the active shell': 'mines.subtitle',
  'Left click opens cells. Right click flags. Empty cells flood-fill like the Python source.': 'mines.start',
  'Safe cell opened.': 'mines.safe',
  'Mine hit.': 'mines.hit',
  'Minefield lost.': 'mines.lost',
  'Cell flagged.': 'mines.flagged',
  'Flag removed.': 'mines.unflagged',
};

export function localizeArcadeText(value: string, t: Translate): string {
  const key = keys[value];
  if (key) return t(`games.arcade.${key}`);
  const patterns: Array<[RegExp, string, string]> = [
    [/^Board cleared\. Aero tile set (\d+)\.$/, 'breakout.next', 'stage'],
    [/^(\d+) lines? cleared\.$/, 'blocks.cleared', 'count'],
    [/^Aero table (\d+)\. Ball speed increased\.$/, 'pong.next', 'stage'],
    [/^Glass pip collected\. Ribbon length (\d+)\.$/, 'snake.pip', 'length'],
    [/^Wave (\d+) loaded\.$/, 'invaders.next', 'wave'],
    [/^Touchdown accepted\. Stage (\d+) pad relocated\.$/, 'lander.next', 'stage'],
    [/^Bottle clean\. Stage (\d+) loaded\.$/, 'capsule.next', 'stage'],
    [/^Board cleared\. Stage (\d+) armed\.$/, 'mines.next', 'stage'],
  ];
  for (const [pattern, name, variable] of patterns) {
    const match = pattern.exec(value);
    if (match) return t(`games.arcade.${name}`, { [variable]: Number(match[1]) });
  }
  return value;
}
