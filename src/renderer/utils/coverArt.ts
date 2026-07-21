import type { CSSProperties } from 'react';

/**
 * Shared cover-art styling for anything backed by a `media://<ownerId>/<relPath>`
 * file (library books/manga, and cached Jiten deck covers — see main/jiten.ts's
 * jitenCacheCover, which stores under the same itemDir(ownerId) convention).
 * Falls back to a title-derived gradient so uncovered items still look distinct.
 */
export function coverStyleFor(title: string, coverPath?: string, ownerId?: string): CSSProperties {
  if (coverPath && ownerId) {
    return { backgroundImage: `url("media://${ownerId}/${coverPath}")` };
  }
  const hue = [...title].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  return {
    background: `linear-gradient(135deg, hsl(${hue} 45% 32%), hsl(${(hue + 40) % 360} 50% 18%))`,
  };
}
