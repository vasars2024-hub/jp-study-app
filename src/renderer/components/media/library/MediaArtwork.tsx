/**
 * The image block of a library card, in all four of its real states: loading,
 * loaded, artless, and broken.
 *
 * The artless case is the one that decides whether a library looks finished. A
 * repeated placeholder glyph across 300 tiles reads as "this app is broken"; a
 * per-title colour with its initial reads as a deliberate design, and — because
 * the hue is derived from the title — the same show is the same colour every
 * time, which is enough for the eye to navigate by.
 */

import { useMemo, useState, type ReactNode } from 'react';
import { useMediaArtwork, type MediaArtworkVariant } from './useMediaArtwork';

/** FNV-1a. Small, stable, and no dependency — the value only picks a hue. */
function hashTitle(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * First *meaningful* character of the title, uppercased.
 *
 * Skips leading punctuation and brackets, because Japanese titles routinely open
 * with 「 or 【 and a whole shelf of tiles rendering the same bracket defeats the
 * point of showing an initial at all. Iterates code points so surrogate pairs
 * (and most emoji-adjacent glyphs) are not split in half.
 */
function initial(title: string): string {
  for (const char of title.trim()) {
    if (/[\p{L}\p{N}]/u.test(char)) return char.toLocaleUpperCase();
  }
  return '?';
}

export interface MediaArtworkBaseProps {
  /** Media id to resolve artwork for; null renders the fallback immediately. */
  id: string | null;
  title: string;
  /** Which image to resolve. `banner` falls back to the poster on its own. */
  variant?: MediaArtworkVariant;
  /** `2 / 3` for posters, `16 / 9` for stills. */
  ratio?: string;
  /** Overlays drawn above the scrim — badges, progress, menu triggers. */
  children?: ReactNode;
  className?: string;
}

/**
 * The accessible-name decision, required and mutually exclusive.
 *
 * This used to be a hardcoded `alt=""` — correct on every surface that exists
 * today (each one names the item in its own text or `aria-label`; see
 * `docs/migration/SLICE_68_ARTWORK_ALT.md` §2 for the call-site table) and a trap
 * for the first one that does not. A default is a decision taken on behalf of
 * surfaces that have not been written yet, and the packaged gate cannot catch it
 * being wrong: its "is this card textless" check resolves to the image's own
 * class name, so it flags all twelve correct posters and would flag a genuinely
 * nameless one identically.
 *
 * So there is no default. `decorative` is a claim about the *card*, which is
 * where the evidence is and what a reviewer can check two lines down; `alt` is
 * for the case where the art is the only thing identifying the item.
 * `decorative={false}` does not typecheck, because there is no third state.
 */
export type MediaArtworkAlt =
  | { decorative: true; alt?: never }
  | { alt: string; decorative?: never };

export type MediaArtworkProps = MediaArtworkBaseProps & MediaArtworkAlt;

export default function MediaArtwork(props: MediaArtworkProps) {
  const {
    id,
    title,
    variant = 'poster',
    ratio = '2 / 3',
    children,
    className = '',
  } = props;
  // '' is the DOM's "skip me", and it must be the attribute present-and-empty
  // rather than absent — an absent alt makes a screen reader read the file name.
  const alt = props.decorative === true ? '' : props.alt;
  const primary = useMediaArtwork(id, variant);
  // Wide art is provider-only, so a hero walks down: backdrop (16:9) → banner →
  // poster, rather than dropping to a flat gradient, which reads as "no art" when
  // there is art. Each step is only asked once the one above it has said "none".
  const primaryMissing = primary.url === null && !primary.loading;
  const banner = useMediaArtwork(variant === 'backdrop' && primaryMissing ? id : null, 'banner');
  const bannerMissing = variant === 'banner' ? primaryMissing : banner.url === null && !banner.loading;
  const wide = variant === 'banner' || variant === 'backdrop';
  const fallback = useMediaArtwork(wide && primaryMissing && bannerMissing ? id : null, 'poster');
  const { url, loading } = !wide || !primaryMissing
    ? primary
    : variant === 'backdrop' && !bannerMissing
      ? banner
      : fallback;
  const [failed, setFailed] = useState(false);

  const fallbackStyle = useMemo(() => {
    const hue = hashTitle(title) % 360;
    return {
      background: `linear-gradient(145deg, hsl(${hue} 32% 22%), hsl(${(hue + 24) % 360} 28% 14%))`,
    };
  }, [title]);

  const showImage = url !== null && !failed;

  return (
    <div
      className={`medialib-card__art ${className}`.trim()}
      style={{ '--medialib-art-ratio': ratio } as React.CSSProperties}
    >
      {showImage ? (
        <img
          className="medialib-card__img"
          src={url}
          alt={alt}
          loading="lazy"
          decoding="async"
          draggable={false}
          onError={() => setFailed(true)}
        />
      ) : (
        // The artless state has to make the SAME decision as the image, or a
        // labelled caller is announced only for the items that happen to have
        // art — silent for exactly the ones the label was needed for. `role=img`
        // makes the subtree presentational, so the initial glyph is not read out
        // on top of the name.
        <div
          className="medialib-card__fallback"
          style={fallbackStyle}
          aria-hidden={alt === '' || undefined}
          role={alt === '' ? undefined : 'img'}
          aria-label={alt === '' ? undefined : alt}
        >
          {initial(title)}
        </div>
      )}
      {/* Only while the first answer is outstanding. A file we know has no art
          must settle on the fallback rather than shimmer forever. */}
      {loading && !showImage && <div className="medialib-skeleton" aria-hidden="true" />}
      <div className="medialib-card__scrim" aria-hidden="true" />
      {children}
    </div>
  );
}
