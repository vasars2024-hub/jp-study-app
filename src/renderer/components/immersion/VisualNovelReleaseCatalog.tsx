import type { VisualNovelEntry, VisualNovelVoiceCoverage } from '../../../shared/visualNovel';

const VOICE_LABELS: Record<VisualNovelVoiceCoverage, string> = {
  none: 'Not voiced',
  'ero-only': 'Ero scenes voiced',
  partial: 'Partially voiced',
  full: 'Fully voiced',
  unknown: 'Voice status unknown',
};

export default function VisualNovelReleaseCatalog({ entry }: { entry: VisualNovelEntry }) {
  if (!entry.releases.length) return null;
  return (
    <details className="visual-novel-releases">
      <summary>Release catalog · {entry.releases.length}</summary>
      <div className="visual-novel-release-list">
        {entry.releases.map((release) => (
          <article key={release.id}>
            <div className="visual-novel-release-head">
              <strong>{release.title}</strong>
              <span>{release.releaseDate || 'Date unknown'}</span>
            </div>
            <small>
              {[
                release.releaseType !== 'unknown' ? release.releaseType : '',
                release.official ? 'Official' : 'Unofficial',
                release.patch ? 'Patch' : '',
                release.freeware ? 'Freeware' : '',
                VOICE_LABELS[release.voiceCoverage],
              ].filter(Boolean).join(' · ')}
            </small>
            <small>
              {[
                release.platforms.join(', '),
                release.engine,
                release.publishers.join(', '),
              ].filter(Boolean).join(' · ')}
            </small>
            {release.languages.length > 0 && (
              <div className="visual-novel-release-languages">
                {release.languages.map((language) => (
                  <span key={`${release.id}:${language.code}`}>
                    {language.code.toUpperCase()}
                    {language.machineTranslated ? ' · MTL' : ''}
                  </span>
                ))}
              </div>
            )}
          </article>
        ))}
      </div>
    </details>
  );
}
