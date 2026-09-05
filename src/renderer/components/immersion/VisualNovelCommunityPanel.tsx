import { useMemo, useState } from 'react';
import type {
  VisualNovelCommunityReport,
  VisualNovelDatabase,
  VisualNovelEntry,
} from '../../../shared/visualNovel';
import {
  createVisualNovelCommunityBundle,
  mergeVisualNovelCommunityBundle,
  normalizeVisualNovelCommunityBundle,
  type VisualNovelCommunityBundle,
} from '../../../shared/visualNovelCommunity';
import { addDeckCards, loadDeck } from '../../flashcardDeck';
import { loadMediaStudyDatabase } from '../../mediaStudyStore';
import { useT } from '../../i18n';
import { VN_ACTION_STATE_EMPTY, vnBundleReason, vnSaveReportReason } from '../../../shared/vnActionReason';

interface ReportDraft {
  author: string;
  rating: string;
  difficultyRating: string;
  jlptLevel: string;
  review: string;
  languageNotes: string;
}

const emptyDraft = (): ReportDraft => ({
  author: '',
  rating: '',
  difficultyRating: '',
  jlptLevel: '',
  review: '',
  languageNotes: '',
});

function sameBundleIdentity(entry: VisualNovelEntry, bundle: VisualNovelCommunityBundle): boolean {
  const providerMatch = Object.entries(bundle.visualNovel.providerIds).some(
    ([provider, id]) => entry.sourceIds[provider] === id,
  );
  if (providerMatch) return true;
  const names = [
    entry.title,
    entry.japaneseTitle,
    entry.englishTitle,
    ...entry.alternativeTitles,
  ].map((value) => value.trim().toLocaleLowerCase()).filter(Boolean);
  return names.includes(bundle.visualNovel.title.trim().toLocaleLowerCase())
    || names.includes(bundle.visualNovel.japaneseTitle.trim().toLocaleLowerCase());
}

export default function VisualNovelCommunityPanel({
  entry,
  onDatabase,
  onStatus,
}: {
  entry: VisualNovelEntry;
  onDatabase: (database: VisualNovelDatabase) => void;
  onStatus: (message: string, error?: boolean) => void;
}) {
  const { t } = useT();
  const [draft, setDraft] = useState<ReportDraft>(emptyDraft);
  const [preview, setPreview] = useState<VisualNovelCommunityBundle | null>(null);
  const [busy, setBusy] = useState(false);
  const [mismatchConfirmed, setMismatchConfirmed] = useState(false);
  const identityMatches = preview ? sameBundleIdentity(entry, preview) : true;
  const hasDraftContent = Boolean(
    draft.review.trim()
    || draft.languageNotes.trim()
    || draft.rating
    || draft.difficultyRating
    || draft.jlptLevel,
  );
  // Category 8: `disabled` is DERIVED from the reason, so a bundle button cannot be grey here
  // with nothing saying why. Only the two fields these rules read are supplied; the rest of
  // `VnActionState` belongs to the workspace around this panel.
  const bundleState = { ...VN_ACTION_STATE_EMPTY, busy, hasReportDraft: hasDraftContent };
  const saveReportWhy = vnSaveReportReason(bundleState);
  const bundleWhy = vnBundleReason(bundleState);
  const reportSummary = useMemo(() => {
    const ratings = entry.communityReports.flatMap((report) => report.rating == null ? [] : [report.rating]);
    const difficulties = entry.communityReports.flatMap(
      (report) => report.difficultyRating == null ? [] : [report.difficultyRating],
    );
    return {
      rating: ratings.length ? ratings.reduce((total, value) => total + value, 0) / ratings.length : null,
      difficulty: difficulties.length
        ? difficulties.reduce((total, value) => total + value, 0) / difficulties.length
        : null,
    };
  }, [entry.communityReports]);

  const field = (key: keyof ReportDraft, value: string): void => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const createReport = (): VisualNovelCommunityReport | null => {
    if (!hasDraftContent) return null;
    return {
      id: globalThis.crypto.randomUUID(),
      author: draft.author.trim() || 'Anonymous learner',
      rating: draft.rating ? Number(draft.rating) : null,
      difficultyRating: draft.difficultyRating ? Number(draft.difficultyRating) : null,
      jlptLevel: draft.jlptLevel,
      review: draft.review.trim(),
      languageNotes: draft.languageNotes.trim(),
      createdAt: Date.now(),
      source: 'local',
    };
  };

  const persistReport = async (report: VisualNovelCommunityReport): Promise<VisualNovelDatabase | null> => {
    const response = await window.api.visualNovelUpdateMetadata(entry.id, {
      communityReports: [...entry.communityReports, report],
    });
    if (!response.ok || !response.database) {
      onStatus(response.error ?? 'The community report could not be saved.', true);
      return null;
    }
    onDatabase(response.database);
    setDraft(emptyDraft());
    return response.database;
  };

  const saveReport = async (): Promise<void> => {
    const report = createReport();
    if (!report) return;
    if (await persistReport(report)) onStatus('Language difficulty report saved.');
  };

  const exportBundle = async (): Promise<void> => {
    setBusy(true);
    const draftReport = createReport();
    if (draftReport && !await persistReport(draftReport)) {
      setBusy(false);
      return;
    }
    const report = draftReport ?? entry.communityReports[entry.communityReports.length - 1] ?? null;
    const bookId = `vn:${entry.id}`;
    const cards = loadDeck()
      .filter((card) => card.bookId === bookId)
      .map((card) => ({
        word: card.word,
        reading: card.reading,
        meaning: card.meaning,
        sentence: card.sentence ?? '',
        front: card.front ?? '',
        back: card.back ?? '',
      }));
    const profile = loadMediaStudyDatabase().profiles[bookId] ?? null;
    const bundle = createVisualNovelCommunityBundle(entry, report, cards, profile);
    const response = await window.api.visualNovelExportCommunityBundle(
      entry.title,
      JSON.stringify(bundle, null, 2),
    );
    setBusy(false);
    if (response.canceled) return;
    onStatus(
      response.ok ? `Study bundle exported to ${response.path}.` : response.error ?? 'Bundle export failed.',
      !response.ok,
    );
  };

  const chooseBundle = async (): Promise<void> => {
    setBusy(true);
    const response = await window.api.visualNovelPickCommunityBundle();
    setBusy(false);
    if (response.canceled) return;
    if (!response.ok || !response.content) {
      onStatus(response.error ?? 'Bundle import failed.', true);
      return;
    }
    try {
      const bundle = normalizeVisualNovelCommunityBundle(JSON.parse(response.content));
      if (!bundle) throw new Error('This is not a valid Visual Novel study bundle.');
      setPreview(bundle);
      setMismatchConfirmed(false);
      onStatus('Study bundle loaded for review.');
    } catch (reason) {
      onStatus(reason instanceof Error ? reason.message : String(reason), true);
    }
  };

  const applyBundle = async (): Promise<void> => {
    if (!preview) return;
    if (!identityMatches && !mismatchConfirmed) {
      setMismatchConfirmed(true);
      return;
    }
    setBusy(true);
    const merged = mergeVisualNovelCommunityBundle(entry, preview, () => globalThis.crypto.randomUUID());
    const metadataResponse = await window.api.visualNovelUpdateMetadata(entry.id, {
      communityReports: merged.communityReports,
    });
    if (!metadataResponse.ok || !metadataResponse.database) {
      setBusy(false);
      onStatus(metadataResponse.error ?? 'Community reports could not be imported.', true);
      return;
    }
    const routeResponse = await window.api.visualNovelUpdateRoutes(entry.id, merged.routes);
    if (!routeResponse.ok || !routeResponse.database) {
      setBusy(false);
      onStatus(routeResponse.error ?? 'Route guides could not be imported.', true);
      return;
    }
    const bookId = `vn:${entry.id}`;
    const existing = new Set(loadDeck()
      .filter((card) => card.bookId === bookId)
      .map((card) => `${card.word}\u0000${card.sentence ?? ''}`));
    const cards = preview.deckCards.filter((card) => {
      const key = `${card.word}\u0000${card.sentence}`;
      if (existing.has(key)) return false;
      existing.add(key);
      return true;
    });
    if (cards.length) {
      addDeckCards(cards.map((card) => ({
        ...card,
        source: 'media' as const,
        bookId,
        bookTitle: entry.title,
        folder: 'Media',
      })));
    }
    setBusy(false);
    onDatabase(routeResponse.database);
    setPreview(null);
    setMismatchConfirmed(false);
    onStatus(`Imported ${cards.length} study cards and community guide data.`);
  };

  return (
    <details className="visual-novel-community">
      <summary>Community and study sharing</summary>
      <div className="visual-novel-community-summary">
        <span>{entry.communityReports.length} reports</span>
        <span>{reportSummary.rating == null ? t('vnCommunity.noRating') : t('vnCommunity.ratingValue', { value: Math.round(reportSummary.rating * 10) / 10 })}</span>
        <span>{reportSummary.difficulty == null ? t('vnCommunity.noDifficulty') : t('vnCommunity.difficultyValue', { value: Math.round(reportSummary.difficulty * 10) / 10 })}</span>
      </div>
      <div className="visual-novel-community-form">
        <label>Author<input value={draft.author} onChange={(event) => field('author', event.target.value)} placeholder="Anonymous learner" /></label>
        <label>Rating<input type="number" min="0" max="10" step="0.5" value={draft.rating} onChange={(event) => field('rating', event.target.value)} /></label>
        <label>Difficulty<input type="number" min="0" max="5" step="0.5" value={draft.difficultyRating} onChange={(event) => field('difficultyRating', event.target.value)} /></label>
        <label>JLPT<select value={draft.jlptLevel} onChange={(event) => field('jlptLevel', event.target.value)}><option value="">Unrated</option><option value="N5">N5</option><option value="N4">N4</option><option value="N3">N3</option><option value="N2">N2</option><option value="N1">N1</option><option value="N0">Beyond N1</option></select></label>
        <label className="is-wide">Review<textarea value={draft.review} onChange={(event) => field('review', event.target.value)} /></label>
        <label className="is-wide">Language report<textarea value={draft.languageNotes} onChange={(event) => field('languageNotes', event.target.value)} placeholder="Vocabulary, grammar, dialect, and reading observations" /></label>
      </div>
      <div className="visual-novel-community-actions">
        <button type="button" disabled={!!saveReportWhy} title={saveReportWhy ? t(saveReportWhy) : undefined} onClick={() => void saveReport()}>Save report</button>
        <button type="button" disabled={!!bundleWhy} title={bundleWhy ? t(bundleWhy) : undefined} onClick={() => void exportBundle()}>Export study bundle</button>
        <button type="button" disabled={!!bundleWhy} title={bundleWhy ? t(bundleWhy) : undefined} onClick={() => void chooseBundle()}>Import study bundle</button>
      </div>
      {preview && (
        <article className="visual-novel-community-preview">
          <div>
            <strong>{preview.visualNovel.title}</strong>
            <span>{preview.visualNovel.japaneseTitle}</span>
          </div>
          <p>
            {preview.report ? `Report by ${preview.report.author}. ` : ''}
            {preview.routeGuides.length} route guides and {preview.deckCards.length} study cards.
          </p>
          {!identityMatches && <p className="media-error">The bundle title or provider ID does not match this library entry.</p>}
          <div>
            <button type="button" disabled={!!bundleWhy} title={bundleWhy ? t(bundleWhy) : undefined} onClick={() => setPreview(null)}>Cancel</button>
            <button type="button" disabled={!!bundleWhy} title={bundleWhy ? t(bundleWhy) : undefined} onClick={() => void applyBundle()}>
              {!identityMatches && !mismatchConfirmed ? 'Review title mismatch' : 'Apply bundle'}
            </button>
          </div>
        </article>
      )}
      {entry.communityReports.length > 0 && (
        <div className="visual-novel-community-reports">
          {entry.communityReports.slice().reverse().slice(0, 8).map((report) => (
            <article key={report.id}>
              <div>
                <strong>{report.author}</strong>
                <span>{[report.rating == null ? '' : `${report.rating}/10`, report.difficultyRating == null ? '' : `${report.difficultyRating}/5 difficulty`, report.jlptLevel].filter(Boolean).join(' · ')}</span>
              </div>
              {report.review && <p>{report.review}</p>}
              {report.languageNotes && <small>{report.languageNotes}</small>}
            </article>
          ))}
        </div>
      )}
    </details>
  );
}
