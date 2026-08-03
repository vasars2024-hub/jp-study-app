// Minimal line-glyph icons for the Study OS desktop — no emoji. Each is a
// 24×24 stroke icon that inherits `currentColor`, so the red/white theme drives
// their colour. `name` maps to a desktop section or a UI action.
//
// Phase 5 · M7: a theme may also install an icon pack (theme/iconPacks.ts). When
// one is active, any name it covers renders as that pack's dimensional icon
// instead; everything else still falls through to the line glyph below. The
// registry import is type-light on purpose — this module is on every boot path.
import { useId, useSyncExternalStore, type CSSProperties } from 'react';
import { getActiveIconPackId, resolveIcon, subscribeIconPack } from '../theme/iconPacks';

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
  | 'bell'
  | 'pin'
  | 'plus'
  | 'lock'
  | 'city'
  | 'widgets'
  // ---- Shell objects, status and lifecycle (Phase 5 · M7) ----
  | 'folder-open'
  | 'file'
  | 'file-text'
  | 'file-audio'
  | 'file-video'
  | 'file-image'
  | 'drive'
  | 'disc'
  | 'trash'
  | 'sleep'
  | 'restart'
  | 'logout'
  | 'shield'
  | 'info'
  | 'warning'
  | 'error'
  | 'success'
  | 'network'
  | 'battery'
  | 'help'
  | 'trophy';

/**
 * The monochrome line glyphs. Exported so an icon pack's coverage can be
 * checked against the full name list, and so the M7 icon sheet draws from the
 * shipped data rather than a copy of it.
 */
export const BASE_PATHS: Record<IconName, string> = {
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
  city: 'M3 19h18 M6 12c0-4 2.7-7 6-7s6 3 6 7c0 1.2-.9 2-2 2h-2v5h-4v-5H8c-1.1 0-2-.8-2-2Z M9 10h.01 M13 8h.01 M16 11h.01',
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
  bell: 'M12 3a5 5 0 0 1 5 5v3l1 2H6l1-2V8a5 5 0 0 1 5-5z M10 19a2 2 0 0 0 4 0',
  pin: 'M12 2v6 M8 8h8l1 4H7z M12 12v10 M9 12h6',
  plus: 'M12 5v14 M5 12h14',
  lock: 'M7 11V8a5 5 0 0 1 10 0v3 M6 11h12v10H6z',
  // ---- Shell objects, status and lifecycle (Phase 5 · M7) ----
  // These are the monochrome fallbacks. Under the Secret Aero icon pack they
  // are replaced by dimensional silhouettes — see theme/aeroIconPack.ts.
  'folder-open': 'M3 8a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v1 M3 8v11h14.5l3.5-8H6.5z',
  file: 'M6 3h8l5 5v13H6z M14 3v5h5',
  'file-text': 'M6 3h8l5 5v13H6z M14 3v5h5 M9 12h7 M9 15h7 M9 18h4',
  'file-audio': 'M6 3h8l5 5v13H6z M14 3v5h5 M11 18v-5l4-1v5 M11 18a1.2 1.2 0 1 1-2.4 0 1.2 1.2 0 0 1 2.4 0z',
  'file-video': 'M6 3h8l5 5v13H6z M14 3v5h5 M10 13v5l5-2.5z',
  'file-image': 'M6 3h8l5 5v13H6z M14 3v5h5 M9 19l3-3.5 2 2.2 1.8-2L18 19z M10.4 12.6a1.1 1.1 0 1 1-2.2 0 1.1 1.1 0 0 1 2.2 0z',
  drive: 'M3 6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M3 13h18 M6 16.5h5',
  disc: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z',
  trash: 'M5 6h14 M9 6V3.5h6V6 M7 6l1 14.5h8L17 6 M10.5 10v7 M13.5 10v7',
  sleep: 'M20.5 15.5A9 9 0 0 1 8.5 3.5 9 9 0 1 0 20.5 15.5z',
  restart: 'M12 4a8 8 0 1 1-7.8 6.2 M12 1.5 15.5 4 12 6.5z',
  logout: 'M13 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1v-3 M10 12h11 M17.5 8.5 21 12l-3.5 3.5',
  shield: 'M12 3l8 3v6c0 4.8-3.4 8-8 9.5C7.4 20 4 16.8 4 12V6z M8.6 12l2.6 2.6L15.8 9.5',
  info: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M12 11v6 M12 7.6h.01',
  warning: 'M12 3.6 21.6 20a1 1 0 0 1-.9 1.5H3.3a1 1 0 0 1-.9-1.5z M12 9.5v5 M12 18h.01',
  error: 'M8.6 3h6.8L20.5 8.6v6.8L15.4 21H8.6L3.5 15.4V8.6z M9.4 9.4l5.2 5.2 M14.6 9.4l-5.2 5.2',
  success: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M8 12.2l2.8 2.8L16 9.6',
  network: 'M3 20.5h3V17H3z M8.5 20.5h3v-6.8h-3z M14 20.5h3v-10h-3z M19.5 20.5h3V7h-3z',
  battery: 'M2.5 8.5a1.5 1.5 0 0 1 1.5-1.5h13a1.5 1.5 0 0 1 1.5 1.5v7a1.5 1.5 0 0 1-1.5 1.5H4a1.5 1.5 0 0 1-1.5-1.5z M20 10.5h1.7v3H20 M5 9.5h8v5H5z',
  help: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M9.4 9.6a2.7 2.7 0 1 1 3.4 2.6v1.6 M12.8 17.2h.01',
  trophy:
    'M7 4h10v5a5 5 0 0 1-10 0z M7 5H4v2a3 3 0 0 0 3 3 M17 5h3v2a3 3 0 0 1-3 3 M12 14v3 M9 21h6 M9 21v-2.4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1V21',
};

/** Stroke weight the line glyph should end up at once a tile has scaled it. */
const TILE_GLYPH_WEIGHT = 1.75;

export default function Icon({
  name,
  size = 22,
  style,
  className,
  fill = false,
  flat = false,
}: {
  name: IconName;
  size?: number;
  style?: CSSProperties;
  className?: string;
  fill?: boolean;
  /** Force the monochrome line glyph even when an icon pack covers `name`. */
  flat?: boolean;
}) {
  const filled = fill || name === 'player' || name === 'pause' || name === 'skip-back' || name === 'skip-forward';
  // Subscribing per instance is what lets a theme switch repaint every icon
  // without any consumer having to know icon packs exist. The snapshot is the
  // pack id, so a re-render only happens when the pack actually changes.
  useSyncExternalStore(subscribeIconPack, getActiveIconPackId, () => null);
  const uid = useId().replace(/:/g, '');

  const resolved = resolveIcon(name, size, flat);

  if (!resolved) {
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
        <path d={BASE_PATHS[name]} />
      </svg>
    );
  }

  const { glyph, family } = resolved;
  const bodyId = `ip-${uid}-b`;
  const glossId = `ip-${uid}-g`;
  const ink = family.detail ?? '#ffffff';
  const scale = glyph.glyphScale ?? 0.62;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      style={style}
      className={className}
      // Non-colour differentiation cue: the shape family is readable by
      // assistive tooling and assertable by tests, not just visible.
      data-icon-shape={glyph.shape}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={bodyId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={family.top} />
          <stop offset="1" stopColor={family.bottom} />
        </linearGradient>
        {/* A whisper of top light — kept faint so the icons read flat and matte
            rather than glossy. */}
        <linearGradient id={glossId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.12" />
          <stop offset="0.46" stopColor="#ffffff" stopOpacity="0.04" />
          <stop offset="0.5" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
      </defs>
      {glyph.form === 'tile' ? (
        <>
          <rect
            x="2.25"
            y="2.25"
            width="19.5"
            height="19.5"
            rx="5"
            fill={`url(#${bodyId})`}
            stroke={family.edge}
            strokeWidth="1"
          />
          <rect x="2.25" y="2.25" width="19.5" height="19.5" rx="5" fill={`url(#${glossId})`} />
          <g transform={`translate(12 12) scale(${scale}) translate(-12 -12)`}>
            <path
              d={BASE_PATHS[name]}
              fill={filled ? ink : 'none'}
              stroke={filled ? 'none' : ink}
              strokeWidth={filled ? 0 : TILE_GLYPH_WEIGHT / scale}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
        </>
      ) : (
        <>
          <path
            d={glyph.body}
            fill={`url(#${bodyId})`}
            stroke={family.edge}
            strokeWidth="0.9"
            strokeLinejoin="round"
          />
          {glyph.accent ? (
            <path
              d={glyph.accent}
              fill={family.accent}
              stroke={family.edge}
              strokeWidth="0.9"
              strokeLinejoin="round"
            />
          ) : null}
          <path d={glyph.gloss ?? glyph.body} fill={`url(#${glossId})`} />
          {glyph.detail ? (
            <path
              d={glyph.detail}
              fill="none"
              stroke={ink}
              strokeWidth={glyph.detailWidth ?? 1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}
        </>
      )}
    </svg>
  );
}
