/**
 * The handful of glyphs the shared `Icon` set does not have (grip, sort, grid/list,
 * sliders, half star). Inline, stroke-based, `currentColor`, and always
 * `aria-hidden` — every control that uses one carries its own text or label.
 */
import type { CSSProperties, ReactElement } from 'react';

export type { GumGlyph } from './gumGlyphs';
import type { GumGlyph } from './gumGlyphs';

const PATHS: Record<GumGlyph, ReactElement> = {
  grip: (
    <>
      <circle cx="9" cy="6" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="15" cy="6" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="9" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="15" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="9" cy="18" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="15" cy="18" r="1.4" fill="currentColor" stroke="none" />
    </>
  ),
  sort: <path d="M4 6h10M4 12h7M4 18h4M18 5v14M15 16l3 3 3-3" />,
  grid: (
    <>
      <rect x="4" y="4" width="7" height="7" rx="1" />
      <rect x="13" y="4" width="7" height="7" rx="1" />
      <rect x="4" y="13" width="7" height="7" rx="1" />
      <rect x="13" y="13" width="7" height="7" rx="1" />
    </>
  ),
  list: <path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" />,
  sliders: <path d="M4 7h10M18 7h2M4 17h4M12 17h8M14 4v6M8 14v6" />,
  play: <path d="M7 4l13 8-13 8z" fill="currentColor" stroke="none" />,
  download: <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />,
  check: <path d="M5 12l5 5 9-10" />,
  'chevron-down': <path d="M6 9l6 6 6-6" />,
  'arrow-up': <path d="M12 19V5M6 11l6-6 6 6" />,
  'arrow-down': <path d="M12 5v14M6 13l6 6 6-6" />,
  pin: <path d="M9 4h6l-1 6 4 3v2H6v-2l4-3zM12 15v5" />,
  'eye-off': <path d="M3 3l18 18M10.6 6.1A9.8 9.8 0 0 1 12 6c5 0 9 6 9 6a15.6 15.6 0 0 1-3.2 3.8M6.5 7.6C4.4 9.1 3 12 3 12s4 6 9 6a8.8 8.8 0 0 0 3.4-.7M9.9 10a3 3 0 0 0 4.1 4.1" />,
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  star: <path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.8z" fill="currentColor" stroke="none" />,
  import: <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />,
  more: (
    <>
      <circle cx="6" cy="12" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="18" cy="12" r="1.5" fill="currentColor" stroke="none" />
    </>
  ),
};

export default function GumIcon({ name, size = 16, style, className }: { name: GumGlyph; size?: number; style?: CSSProperties; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
      style={style}
    >
      {PATHS[name]}
    </svg>
  );
}
