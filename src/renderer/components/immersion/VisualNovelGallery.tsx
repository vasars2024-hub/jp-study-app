import { useState } from 'react';
import type { VisualNovelEntry } from '../../../shared/visualNovel';

export default function VisualNovelGallery({ entry }: { entry: VisualNovelEntry }) {
  const [open, setOpen] = useState(false);
  const images = [
    ...entry.backgroundImageUrls.map((url) => ({ url, kind: 'Background' })),
    ...entry.screenshotUrls.map((url) => ({ url, kind: 'Screenshot' })),
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
        Story and gallery
        <span>{images.length} images</span>
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
                  title={`Open ${image.kind.toLocaleLowerCase()}`}
                  onClick={() => void window.api.openExternal(image.url)}
                >
                  <img src={image.url} alt="" loading="lazy" />
                  <span>{image.kind}</span>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </details>
  );
}
