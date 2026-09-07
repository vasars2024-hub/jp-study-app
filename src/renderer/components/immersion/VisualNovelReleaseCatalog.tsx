import type {
  VisualNovelEntry,
  VisualNovelRelease,
  VisualNovelVoiceCoverage,
} from '../../../shared/visualNovel';
import { useT } from '../../i18n';

/**
 * Wire value -> catalog key, resolved with `t()` at render time.
 *
 * `VOICE_LABELS` used to hold the English SENTENCES, which is why five
 * translated `vnRelease.voice.*` keys sat with no consumer and this panel read
 * `Fully voiced` in Japanese. Module-level data cannot call `useT()` at
 * declaration time (CLAUDE.md i18n rule 7), so it holds keys instead.
 *
 * `unknown` is absent from `RELEASE_TYPE_KEYS` on purpose: the row already
 * omits an unknown release type rather than printing the word, and that
 * behaviour is unchanged.
 */
const VOICE_KEYS: Record<VisualNovelVoiceCoverage, string> = {
  none: 'vnRelease.voice.none',
  'ero-only': 'vnRelease.voice.ero-only',
  partial: 'vnRelease.voice.partial',
  full: 'vnRelease.voice.full',
  unknown: 'vnRelease.voice.unknown',
};

const RELEASE_TYPE_KEYS: Partial<Record<VisualNovelRelease['releaseType'], string>> = {
  trial: 'vnRelease.type.trial',
  partial: 'vnRelease.type.partial',
  complete: 'vnRelease.type.complete',
};

export default function VisualNovelReleaseCatalog({ entry }: { entry: VisualNovelEntry }) {
  const { t } = useT();
  if (!entry.releases.length) return null;
  return (
    <details className="visual-novel-releases">
      <summary>{t('vnRelease.head', { count: entry.releases.length })}</summary>
      <div className="visual-novel-release-list">
        {entry.releases.map((release) => (
          <article key={release.id}>
            <div className="visual-novel-release-head">
              <strong>{release.title}</strong>
              <span>{release.releaseDate || t('vnRelease.dateUnknown')}</span>
            </div>
            <small>
              {[
                RELEASE_TYPE_KEYS[release.releaseType] ? t(RELEASE_TYPE_KEYS[release.releaseType] as string) : '',
                release.official ? t('vnRelease.official') : t('vnRelease.unofficial'),
                release.patch ? t('vnRelease.patch') : '',
                release.freeware ? t('vnRelease.freeware') : '',
                t(VOICE_KEYS[release.voiceCoverage]),
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
