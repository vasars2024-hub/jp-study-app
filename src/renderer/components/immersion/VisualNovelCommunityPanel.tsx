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

/**
 * Report cap. The header renders `{entry.communityReports.length} reports`, so a silent
 * cap here made the two numbers disagree on screen — D137.
 */
const REPORT_ROWS = 8;

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
      author: draft.author.trim() || t('vnCommunity.anonymous'),
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
      onStatus(response.error ?? t('vnCommunity.msg.saveFailed'), true);
      return null;
    }
    onDatabase(response.database);
    setDraft(emptyDraft());
    return response.database;
  };

  const saveReport = async (): Promise<void> => {
    const report = createReport();
    if (!report) return;
    if (await persistReport(report)) onStatus(t('vnCommunity.msg.saved'));
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
      response.ok
        ? t('vnCommunity.msg.exported', { path: response.path })
        : response.error ?? t('vnCommunity.msg.exportFailed'),
      !response.ok,
    );
  };

  const chooseBundle = async (): Promise<void> => {
    setBusy(true);
    const response = await window.api.visualNovelPickCommunityBundle();
    setBusy(false);
    if (response.canceled) return;
    if (!response.ok || !response.content) {
      onStatus(response.error ?? t('vnCommunity.msg.importFailed'), true);
      return;
    }
    try {
      const bundle = normalizeVisualNovelCommunityBundle(JSON.parse(response.content));
      if (!bundle) throw new Error(t('vnCommunity.msg.notValid'));
      setPreview(bundle);
      setMismatchConfirmed(false);
      onStatus(t('vnCommunity.msg.loaded'));
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
      onStatus(metadataResponse.error ?? t('vnCommunity.msg.reportsImportFailed'), true);
      return;
    }
    const routeResponse = await window.api.visualNovelUpdateRoutes(entry.id, merged.routes);
    if (!routeResponse.ok || !routeResponse.database) {
      setBusy(false);
      onStatus(routeResponse.error ?? t('vnCommunity.msg.routesImportFailed'), true);
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
    onStatus(t('vnCommunity.msg.imported', { count: cards.length }));
  };

  return (
    <details className="visual-novel-community">
      <summary>{t('vnCommunity.summary')}</summary>
      <div className="visual-novel-community-summary">
        <span>{t('vnCommunity.reports', { count: entry.communityReports.length })}</span>
        <span>{reportSummary.rating == null ? t('vnCommunity.noRating') : t('vnCommunity.ratingValue', { value: Math.round(reportSummary.rating * 10) / 10 })}</span>
        <span>{reportSummary.difficulty == null ? t('vnCommunity.noDifficulty') : t('vnCommunity.difficultyValue', { value: Math.round(reportSummary.difficulty * 10) / 10 })}</span>
      </div>
      <div className="visual-novel-community-form">
        <label>{t('vnCommunity.author')}<input value={draft.author} onChange={(event) => field('author', event.target.value)} placeholder={t('vnCommunity.anonymous')} /></label>
        <label>{t('vnCommunity.ratingLabel')}<input type="number" min="0" max="10" step="0.5" value={draft.rating} onChange={(event) => field('rating', event.target.value)} /></label>
        <label>{t('vnCommunity.difficultyLabel')}<input type="number" min="0" max="5" step="0.5" value={draft.difficultyRating} onChange={(event) => field('difficultyRating', event.target.value)} /></label>
        <label>{t('vnCommunity.jlpt')}<select value={draft.jlptLevel} onChange={(event) => field('jlptLevel', event.target.value)}><option value="">{t('vnCommunity.unrated')}</option><option value="N5">N5</option><option value="N4">N4</option><option value="N3">N3</option><option value="N2">N2</option><option value="N1">N1</option><option value="N0">{t('vnCommunity.beyondN1')}</option></select></label>
        <label className="is-wide">{t('vnCommunity.review')}<textarea value={draft.review} onChange={(event) => field('review', event.target.value)} /></label>
        <label className="is-wide">{t('vnCommunity.languageReport')}<textarea value={draft.languageNotes} onChange={(event) => field('languageNotes', event.target.value)} placeholder={t('vnCommunity.languagePlaceholder')} /></label>
      </div>
      <div className="visual-novel-community-actions">
        <button className="btn small" type="button" disabled={!!saveReportWhy} title={saveReportWhy ? t(saveReportWhy) : undefined} onClick={() => void saveReport()}>{t('vnCommunity.saveReport')}</button>
        <button className="btn small" type="button" disabled={!!bundleWhy} title={bundleWhy ? t(bundleWhy) : undefined} onClick={() => void exportBundle()}>{t('vnCommunity.exportBundle')}</button>
        <button className="btn small" type="button" disabled={!!bundleWhy} title={bundleWhy ? t(bundleWhy) : undefined} onClick={() => void chooseBundle()}>{t('vnCommunity.importBundle')}</button>
      </div>
      {preview && (
        <article className="visual-novel-community-preview">
          <div>
            <strong>{preview.visualNovel.title}</strong>
            <span>{preview.visualNovel.japaneseTitle}</span>
          </div>
          <p>
            {preview.report ? t('vnCommunity.reportBy', { author: preview.report.author }) : ''}
            {t('vnCommunity.bundleCounts', {
              routes: preview.routeGuides.length,
              cards: preview.deckCards.length,
            })}
          </p>
          {!identityMatches && <p className="media-error">{t('vnCommunity.mismatch')}</p>}
          <div>
            <button className="btn small" type="button" disabled={!!bundleWhy} title={bundleWhy ? t(bundleWhy) : undefined} onClick={() => setPreview(null)}>{t('common.cancel')}</button>
            <button className="btn small" type="button" disabled={!!bundleWhy} title={bundleWhy ? t(bundleWhy) : undefined} onClick={() => void applyBundle()}>
              {!identityMatches && !mismatchConfirmed ? t('vnCommunity.reviewMismatch') : t('vnCommunity.applyBundle')}
            </button>
          </div>
        </article>
      )}
      {entry.communityReports.length > 0 && (
        <div className="visual-novel-community-reports">
          {entry.communityReports.slice().reverse().slice(0, REPORT_ROWS).map((report) => (
            <article key={report.id}>
              <div>
                <strong>{report.author}</strong>
                <span>{[
                  report.rating == null ? '' : t('vnCommunity.reportRating', { value: report.rating }),
                  report.difficultyRating == null ? '' : t('vnCommunity.reportDifficulty', { value: report.difficultyRating }),
                  // D182: the picker offers "Beyond N1" and stores the sentinel
                  // `N0`, so every report saved at that level listed a JLPT
                  // level that does not exist. The other five are real names and
                  // are data, so they pass through untranslated.
                  report.jlptLevel === 'N0' ? t('vnCommunity.beyondN1') : report.jlptLevel,
                ].filter(Boolean).join(' · ')}</span>
              </div>
              {report.review && <p>{report.review}</p>}
              {report.languageNotes && <small>{report.languageNotes}</small>}
            </article>
          ))}
          {entry.communityReports.length > REPORT_ROWS && (
            <small>{t('common.moreNotShown', { count: entry.communityReports.length - REPORT_ROWS })}</small>
          )}
        </div>
      )}
    </details>
  );
}
