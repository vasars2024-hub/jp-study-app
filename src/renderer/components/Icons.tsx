// Minimal line-glyph icons for the Study OS desktop — no emoji. Each is a
// 24×24 stroke icon that inherits `currentColor`, so the red/white theme drives
// their colour. `name` maps to a desktop section or a UI action.
import type { CSSProperties } from 'react';

export type IconName =
  | 'player'
  | 'music'
  | 'dictionary'
  | 'library'
  | 'novels'
  | 'translate'
  | 'grammar'
  | 'anki'
  | 'flashcards'
  | 'stats'
  | 'resources'
  | 'note'
  | 'settings'
  | 'app'
  | 'logo'
  | 'pause'
  | 'skip-back'
  | 'skip-forward'
  | 'repeat'
  | 'shuffle'
  | 'search'
  | 'folder'
  | 'chevron'
  | 'caption'
  | 'volume'
  | 'window'
  | 'refresh'
  | 'power'
  | 'download'
  | 'image'
  | 'video'
  | 'sparkle'
  | 'eye'
  | 'monitor'
  | 'dice'
  | 'globe'
  | 'external'
  | 'bookmark'
  | 'scan'
  | 'check'
  | 'close'
  | 'star'
  | 'heart'
  | 'flame'
  | 'chart-bar'
  | 'confetti'
  | 'wrench'
  | 'headphones'
  | 'chat'
  | 'brush'
  | 'edit'
  | 'command'
  | 'keyboard'
  | 'calendar'
  | 'clipboard'
  | 'pin'
  | 'plus'
  | 'lock'
  | 'city'
  | 'widgets';

const P: Record<IconName, string> = {
  player: 'M8 5v14l11-7z',
  music: 'M9 18V6l10-2v12 M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0z M19 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z',
  dictionary: 'M4 5a2 2 0 0 1 2-2h13v18H6a2 2 0 0 1-2-2z M8 3v18 M12 8h5 M12 12h5',
  library: 'M4 4h5v16H4z M10 4h5v16h-5z M16 5l4 1-3 15-4-1z',
  novels: 'M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z M9 3v14',
  translate: 'M4 5h9 M8 3v2 M6 5c0 5-2 8-4 9 M5 8c0 3 3 6 6 7 M13 20l4-10 4 10 M14.5 16h5',
  grammar: 'M4 20l4-1L20 7l-3-3L5 16z M14 6l3 3',
  anki: 'M5 4h9l5 5v11H5z M14 4v5h5 M8 13h7 M8 16h7',
  flashcards: 'M4 7h11v11H4z M8 4h11v11 M7 11h5 M7 14h5',
  stats: 'M4 20V4 M4 20h16 M8 20v-6 M13 20V9 M18 20v-9',
  resources: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18 M3 12h18 M12 3c3 3 3 15 0 18 M12 3c-3 3-3 15 0 18',
  note: 'M6 3h9l4 4v14H6z M15 3v4h4 M9 12h7 M9 16h5',
  settings:
    'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6 M19 12a7 7 0 0 0-.1-1l2-1.6-2-3.4-2.3 1a7 7 0 0 0-1.7-1l-.4-2.5H9.5L9 4.5a7 7 0 0 0-1.7 1l-2.3-1-2 3.4 2 1.6a7 7 0 0 0 0 2l-2 1.6 2 3.4 2.3-1a7 7 0 0 0 1.7 1l.5 2.5h4l.4-2.5a7 7 0 0 0 1.7-1l2.3 1 2-3.4-2-1.6c.1-.3.1-.7.1-1z',
  app: 'M4 4h7v7H4z M13 4h7v7h-7z M4 13h7v7H4z M13 13h7v7h-7z',
  city: 'M3 20h18 M5 20V11l3-2v11 M10 20V6l4-2 3 2v14 M17 20v-7h3v7 M12 10h2 M12 13h2',
  widgets: 'M4 4h7v7H4z M13 4h7v4h-7z M13 10h7v10h-7z M4 13h7v7H4z',
  logo: 'M12 3l7 4v10l-7 4-7-4V7z M12 8v8 M8.5 10l3.5 2 3.5-2',
  pause: 'M8 5h3v14H8z M13 5h3v14h-3z',
  'skip-back': 'M11 5 2 12l9 7z M21 5 12 12l9 7z',
  'skip-forward': 'M13 5l9 7-9 7z M3 5l9 7-9 7z',
  repeat: 'M4 7h11a4 4 0 0 1 4 4v1 M7 4 4 7l3 3 M20 17H9a4 4 0 0 1-4-4v-1 M17 20l3-3-3-3',
  shuffle: 'M3 6h4l12 12h2 M3 18h4l4-5 M15 6h4 M15 6l4-2 M15 6l4 2 M15 18l4 2 M15 18l4-2',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z M20 20l-4.5-4.5',
  folder: 'M4 6a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z',
  chevron: 'M9 5l7 7-7 7',
  caption: 'M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9l-4 3v-3H6a2 2 0 0 1-2-2z M7 9h10 M7 12h6',
  volume: 'M4 9v6h4l5 4V5L8 9z M16.5 8a5 5 0 0 1 0 8 M19 5.5a9 9 0 0 1 0 13',
  window: 'M4 5h16v14H4z M4 9h16',
  refresh: 'M4 12a8 8 0 0 1 14-5.3 M20 4v5h-5 M20 12a8 8 0 0 1-14 5.3 M4 20v-5h5',
  power: 'M12 3v9 M6.5 7a8 8 0 1 0 11 0',
  download: 'M12 4v10 M8 10l4 4 4-4 M4 18h16',
  image:
    'M4 5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z M9 10.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z M4 17l5-5 4 4 3-3 4 4',
  video: 'M4 6a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z M17 9.5l4-2.5v10l-4-2.5z',
  sparkle: 'M12 2l1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8z',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  monitor: 'M4 4h16v11H4z M9 20h6 M12 15v5',
  dice:
    'M5 5h14v14H5z M7 8a1 1 0 1 0 2 0a1 1 0 1 0-2 0 M15 8a1 1 0 1 0 2 0a1 1 0 1 0-2 0 M11 12a1 1 0 1 0 2 0a1 1 0 1 0-2 0 M7 16a1 1 0 1 0 2 0a1 1 0 1 0-2 0 M15 16a1 1 0 1 0 2 0a1 1 0 1 0-2 0',
  globe: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M3 12h18 M12 3c3 3 3 15 0 18 M12 3c-3 3-3 15 0 18',
  external: 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6 M15 3h6v6 M10 14 21 3',
  bookmark: 'M6 3h11a1 1 0 0 1 1 1v17l-6.5-4-6.5 4V4a1 1 0 0 1 1-1z',
  check: 'M4 12.5l5 5L20 6',
  close: 'M5 5l14 14 M19 5L5 19',
  star: 'M12 3l2.6 5.6 6.1.6-4.6 4.1 1.3 6-5.4-3.2-5.4 3.2 1.3-6-4.6-4.1 6.1-.6z',
  heart:
    'M12 20s-7-4.35-9.5-8.5C1 8.5 2 5 5.5 5c2 0 3.7 1.3 4.5 3 .8-1.7 2.5-3 4.5-3 3.5 0 4.5 3.5 3 6.5C19 15.65 12 20 12 20z',
  flame: 'M12 2c-1.5 3-5 5.5-5 10a5 5 0 0 0 10 0c0-1.8-.7-3.2-1.7-4.3.2 1.6-.6 3-1.8 3a1.7 1.7 0 0 1-1.7-1.7c0-2.3 2-3.4.2-7z',
  // ---- Declared for future use; not currently rendered anywhere ----
  'chart-bar': 'M4 20V4 M4 20h16 M8 20v-6 M13 20V9 M18 20v-9',
  scan: 'M4 8V5a1 1 0 0 1 1-1h3 M16 4h3a1 1 0 0 1 1 1v3 M20 16v3a1 1 0 0 1-1 1h-3 M8 20H5a1 1 0 0 1-1-1v-3',
  confetti: 'M4 20l4-4 M9 20l3-6 M15 20l2-8 M6 6l2 2 M14 4l1 3 M18 8l3 1',
  wrench:
    'M14.7 6.3a4 4 0 0 1-5.4 5.4L4 17l3 3 5.3-5.3a4 4 0 0 1 5.4-5.4l-3 3-2-2z',
  headphones:
    'M4 14a8 8 0 0 1 16 0 M4 14h2a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H4z M20 14h-2a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1h2z',
  chat: 'M4 5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9l-5 4z',
  brush: 'M4 20c0-3 2-5 5-5h1 M9 15l9-9 3 3-9 9-3-3z',
  edit: 'M4 20h4L19 9l-4-4L4 16v4z M13 7l4 4',
  command:
    'M9 9V6a2 2 0 1 0-2 2h3z M15 9h3a2 2 0 1 0-2-2v3z M9 15H6a2 2 0 1 0 2 2v-3z M15 15v3a2 2 0 1 0 2-2h-3z M9 9h6v6H9z',
  keyboard: 'M3 7h18v10H3z M6 10h1 M9.5 10h1 M13 10h1 M16.5 10h1 M7 14h10',
  calendar: 'M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z M4 10h16 M8 2v4 M16 2v4 M8 14h2 M8 17h2 M14 14h2 M14 17h2',
  clipboard: 'M9 3h6a1 1 0 0 1 1 1v2H8V4a1 1 0 0 1 1-1z M6 5h12v16H6z M9 10h6 M9 13h6 M9 16h4',
  pin: 'M12 2v6 M8 8h8l1 4H7z M12 12v10 M9 12h6',
  plus: 'M12 5v14 M5 12h14',
  lock: 'M7 11V8a5 5 0 0 1 10 0v3 M6 11h12v10H6z',
};

export default function Icon({
  name,
  size = 22,
  style,
  className,
  fill = false,
}: {
  name: IconName;
  size?: number;
  style?: CSSProperties;
  className?: string;
  fill?: boolean;
}) {
  const filled = fill || name === 'player' || name === 'pause' || name === 'skip-back' || name === 'skip-forward';
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={filled ? 0 : 1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
      className={className}
      aria-hidden="true"
    >
      <path d={P[name]} />
    </svg>
  );
}
