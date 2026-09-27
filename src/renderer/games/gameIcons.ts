import type { IconName } from '../components/Icons';
import type { GameId } from './types';

/**
 * One glyph per game in the Arena list, drawn from the shared line-icon set.
 * Every game used to show the same die (or one glyph per mode), so the list
 * could only be read by its text. Each picks the thing the player does or meets:
 */
export const GAME_ICONS: Record<GameId, IconName> = {
  'sentence-builder': 'shuffle', // put shuffled pieces back in order
  'speed-type': 'keyboard',
  'word-match': 'flashcards', // word and meaning, a pair of cards
  'kana-sprint': 'translate', // script to Latin letters
  'kanji-reading': 'eye',
  'cloze-blitz': 'note', // a sentence with a line to fill
  'listening-flash': 'headphones',
  'particle-panic': 'grammar',
  'counter-quiz': 'network', // bars rising one, two, three, four
  'reverse-recall': 'chat', // say it in your own words
  'star-invaders': 'shield', // defend the bunkers
  'comet-courier': 'sleep', // the moon a lander sets down on
  'capsule-sorter': 'battery', // a two-colour capsule
  'signal-simon': 'app', // a grid of cells
  'aero-breakout': 'widgets', // a wall of uneven bricks
  'aero-blocks': 'download', // a block dropping into the well
  'aero-pong': 'disc', // the ball
  'aero-snake': 'repeat', // a winding path
  'mirror-writing': 'edit',
};
