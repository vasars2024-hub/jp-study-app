import { useVisualNovelArt } from '../../visualNovelArt';

/**
 * An `<img>` for a VNDB image, painted from main's `media://` cache. Renders
 * nothing until the cached copy exists, so the CSP never sees the remote URL
 * and a broken frame is never shown.
 */
export default function VisualNovelArt({
  src,
  alt = '',
  className,
}: {
  src: string;
  alt?: string;
  className?: string;
}) {
  const local = useVisualNovelArt(src);
  if (!local) return null;
  return <img className={className} src={local} alt={alt} loading="lazy" />;
}
