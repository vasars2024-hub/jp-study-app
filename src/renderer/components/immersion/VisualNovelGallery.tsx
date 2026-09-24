import { useState } from 'react';
import type { VisualNovelEntry } from '../../../shared/visualNovel';
import { useT } from '../../i18n';
import VisualNovelArt from './VisualNovelArt';

export default function VisualNovelGallery({ entry }: { entry: VisualNovelEntry }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const images = [
    ...entry.backgroundImageUrls.map((url) => ({ url, kind: 'background' as const })),
    ...entry.screenshotUrls.map((url) => ({ url, kind: 'screenshot' as const })),
  ].slice(0, 24);
  const hasStoryMetadata = entry.themes.length || entry.chapters.length || entry.characters.length;
  if (!images.length && !hasStoryMetadata) return null;

  return (
    <details
      className="visual-novel-gallery"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>
        {t('vnApp.gallery.head')}
        <span>{t('vnApp.gallery.count', { count: images.length })}</span>
      </summary>
      {open && (
        <>
          {hasStoryMetadata > 0 && (
            <div className="visual-novel-story-tags">
              {entry.themes.map((theme) => <span key={`theme:${theme}`}>{theme}</span>)}
              {entry.chapters.map((chapter) => <span key={`chapter:${chapter}`}>{chapter}</span>)}
              {entry.characters.map((character) => <span key={`character:${character}`}>{character}</span>)}
            </div>
          )}
          {images.length > 0 && (
            <div className="visual-novel-gallery-grid">
              {images.map((image) => (
                <button
                  key={`${image.kind}:${image.url}`}
                  type="button"
                  title={t('vnApp.gallery.open')}
                  onClick={() => void window.api.openExternal(image.url)}
                >
                  {/* VNDB art is painted from main's media:// cache; the CSP blocks t.vndb.org. */}
                  <VisualNovelArt src={image.url} />
                  <span>{image.kind === 'background' ? t('vnApp.gallery.background') : t('vnApp.gallery.screenshot')}</span>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </details>
  );
}
