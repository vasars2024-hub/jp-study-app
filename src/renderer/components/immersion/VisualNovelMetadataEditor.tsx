import { useEffect, useState } from 'react';
import { useT } from '../../i18n';
import {
  VISUAL_NOVEL_ENGINE_NAMES,
  VISUAL_NOVEL_ENGINES,
  type VisualNovelDatabase,
  type VisualNovelEngine,
  type VisualNovelEntry,
  type VisualNovelMetadataPatch,
} from '../../../shared/visualNovel';

interface MetadataDraft {
  title: string;
  japaneseTitle: string;
  englishTitle: string;
  alternativeTitles: string;
  developer: string;
  publisher: string;
  releaseDate: string;
  originalPlatform: string;
  platforms: string;
  genres: string;
  tags: string;
  themes: string;
  synopsis: string;
  characters: string;
  chapters: string;
  estimatedPlaytimeHours: string;
  installPath: string;
  executablePath: string;
  engine: VisualNovelEngine;
  version: string;
  language: string;
  coverImageUrl: string;
  backgroundImageUrls: string;
  screenshotUrls: string;
}

const join = (values: string[]): string => values.join(', ');
const split = (value: string): string[] => value.split(',').map((item) => item.trim()).filter(Boolean);

function draftFromEntry(entry: VisualNovelEntry): MetadataDraft {
  return {
    title: entry.title,
    japaneseTitle: entry.japaneseTitle,
    englishTitle: entry.englishTitle,
    alternativeTitles: join(entry.alternativeTitles),
    developer: entry.developer,
    publisher: entry.publisher,
    releaseDate: entry.releaseDate,
    originalPlatform: entry.originalPlatform,
    platforms: join(entry.platforms),
    genres: join(entry.genres),
    tags: join(entry.tags),
    themes: join(entry.themes),
    synopsis: entry.synopsis,
    characters: join(entry.characters),
    chapters: join(entry.chapters),
    estimatedPlaytimeHours: String(entry.estimatedPlaytimeHours || ''),
    installPath: entry.installPath,
    executablePath: entry.executablePath,
    engine: entry.engine,
    version: entry.version,
    language: entry.language,
    coverImageUrl: entry.coverImageUrl,
    backgroundImageUrls: join(entry.backgroundImageUrls),
    screenshotUrls: join(entry.screenshotUrls),
  };
}

export default function VisualNovelMetadataEditor({
  entry,
  onSaved,
  onStatus,
}: {
  entry: VisualNovelEntry;
  onSaved: (database: VisualNovelDatabase) => void;
  onStatus: (message: string, error?: boolean) => void;
}) {
  const { t } = useT();
  const [draft, setDraft] = useState<MetadataDraft>(() => draftFromEntry(entry));
  const [saving, setSaving] = useState(false);

  useEffect(() => setDraft(draftFromEntry(entry)), [entry.id]);

  const field = <K extends keyof MetadataDraft>(key: K, value: MetadataDraft[K]): void => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const save = async (): Promise<void> => {
    setSaving(true);
    const patch: VisualNovelMetadataPatch = {
      title: draft.title,
      japaneseTitle: draft.japaneseTitle,
      englishTitle: draft.englishTitle,
      alternativeTitles: split(draft.alternativeTitles),
      developer: draft.developer,
      publisher: draft.publisher,
      releaseDate: draft.releaseDate,
      originalPlatform: draft.originalPlatform,
      platforms: split(draft.platforms),
      genres: split(draft.genres),
      tags: split(draft.tags),
      themes: split(draft.themes),
      synopsis: draft.synopsis,
      characters: split(draft.characters),
      chapters: split(draft.chapters),
      estimatedPlaytimeHours: Number(draft.estimatedPlaytimeHours),
      installPath: draft.installPath,
      executablePath: draft.executablePath,
      engine: draft.engine,
      version: draft.version,
      language: draft.language,
      coverImageUrl: draft.coverImageUrl,
      backgroundImageUrls: split(draft.backgroundImageUrls),
      screenshotUrls: split(draft.screenshotUrls),
    };
    const response = await window.api.visualNovelUpdateMetadata(entry.id, patch);
    setSaving(false);
    if (!response.ok || !response.database) {
      onStatus(response.error ?? t('vnMeta.msg.saveFailed'), true);
      return;
    }
    onSaved(response.database);
    onStatus(t('vnMeta.msg.saved'));
  };

  return (
    <details className="visual-novel-metadata">
      <summary>{t('vnMeta.summary')}</summary>
      <div className="visual-novel-metadata-grid">
        <label>{t('vnMeta.displayTitle')}<input value={draft.title} onChange={(event) => field('title', event.target.value)} /></label>
        <label>{t('vnMeta.japaneseTitle')}<input value={draft.japaneseTitle} onChange={(event) => field('japaneseTitle', event.target.value)} /></label>
        <label>{t('vnMeta.englishTitle')}<input value={draft.englishTitle} onChange={(event) => field('englishTitle', event.target.value)} /></label>
        <label>{t('vnMeta.alternativeTitles')}<input value={draft.alternativeTitles} onChange={(event) => field('alternativeTitles', event.target.value)} placeholder={t('vnMeta.commaSeparated')} /></label>
        <label>{t('vnMeta.developer')}<input value={draft.developer} onChange={(event) => field('developer', event.target.value)} /></label>
        <label>{t('vnMeta.publisher')}<input value={draft.publisher} onChange={(event) => field('publisher', event.target.value)} /></label>
        <label>{t('vnMeta.releaseDate')}<input type="date" value={draft.releaseDate} onChange={(event) => field('releaseDate', event.target.value)} /></label>
        <label>{t('vnMeta.originalPlatform')}<input value={draft.originalPlatform} onChange={(event) => field('originalPlatform', event.target.value)} /></label>
        <label>{t('vnMeta.version')}<input value={draft.version} onChange={(event) => field('version', event.target.value)} /></label>
        <label>{t('vnMeta.platforms')}<input value={draft.platforms} onChange={(event) => field('platforms', event.target.value)} placeholder="Windows, Linux" /></label>
        <label>{t('vnMeta.genres')}<input value={draft.genres} onChange={(event) => field('genres', event.target.value)} placeholder={t('vnMeta.genresPlaceholder')} /></label>
        <label>{t('vnMeta.tags')}<input value={draft.tags} onChange={(event) => field('tags', event.target.value)} placeholder={t('vnMeta.commaSeparated')} /></label>
        <label>{t('vnMeta.themes')}<input value={draft.themes} onChange={(event) => field('themes', event.target.value)} placeholder={t('vnMeta.commaSeparated')} /></label>
        <label>{t('vnMeta.characters')}<input value={draft.characters} onChange={(event) => field('characters', event.target.value)} placeholder={t('vnMeta.commaSeparated')} /></label>
        <label>{t('vnMeta.chapters')}<input value={draft.chapters} onChange={(event) => field('chapters', event.target.value)} placeholder={t('vnMeta.commaSeparated')} /></label>
        <label>{t('vnMeta.estimatedHours')}<input type="number" min="0" value={draft.estimatedPlaytimeHours} onChange={(event) => field('estimatedPlaytimeHours', event.target.value)} /></label>
        <label>{t('vnMeta.language')}<input value={draft.language} onChange={(event) => field('language', event.target.value)} /></label>
        <label>{t('vnMeta.engine')}<select value={draft.engine} onChange={(event) => field('engine', event.target.value as VisualNovelEngine)}>{VISUAL_NOVEL_ENGINES.map((engine) => (
          <option key={engine} value={engine}>
            {engine === 'custom' ? t('vnMeta.engineCustom') : engine === 'unknown' ? t('vnMeta.engineUnknown') : VISUAL_NOVEL_ENGINE_NAMES[engine]}
          </option>
        ))}</select></label>
        <label className="is-wide">{t('vnMeta.installPath')}<input value={draft.installPath} onChange={(event) => field('installPath', event.target.value)} /></label>
        <label className="is-wide">{t('vnMeta.executablePath')}<input value={draft.executablePath} onChange={(event) => field('executablePath', event.target.value)} /></label>
        <label className="is-wide">{t('vnMeta.coverImageUrl')}<input value={draft.coverImageUrl} onChange={(event) => field('coverImageUrl', event.target.value)} /></label>
        <label className="is-wide">{t('vnMeta.backgroundImageUrls')}<input value={draft.backgroundImageUrls} onChange={(event) => field('backgroundImageUrls', event.target.value)} placeholder={t('vnMeta.commaSeparated')} /></label>
        <label className="is-wide">{t('vnMeta.screenshotUrls')}<input value={draft.screenshotUrls} onChange={(event) => field('screenshotUrls', event.target.value)} placeholder={t('vnMeta.commaSeparated')} /></label>
        <label className="is-wide">{t('vnMeta.synopsis')}<textarea value={draft.synopsis} onChange={(event) => field('synopsis', event.target.value)} /></label>
      </div>
      <button className="btn small" type="button" disabled={saving || !draft.title.trim()} onClick={() => void save()}>
        {saving ? t('vnMeta.saving') : t('vnMeta.saveMetadata')}
      </button>
    </details>
  );
}
