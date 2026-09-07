import { useMemo, useState } from 'react';
import {
  removeVerifiedSite,
  findVerifiedSiteDuplicateGroups,
  promoteVerifiedSite,
  reconcileVerifiedSiteDuplicates,
  reviewPromotionEligibility,
  upsertVerifiedSite,
  type VerifiedSiteCompatibility,
  type VerifiedSiteContent,
  type VerifiedSiteRecord,
  type VerifiedSitesDocument,
} from '../../../../shared/verifiedSites';
import {
  exportVerifiedSitesDocument,
  importVerifiedSitesDocument,
  loadFmhyDirectorySnapshot,
  loadVerifiedSitesDocument,
  saveFmhyDirectorySnapshot,
  saveVerifiedSitesDocument,
} from '../../../verifiedSitesStore';
import {
  FMHY_VIDEO_DIRECTORY_URL,
  applyFmhyDirectoryReconciliation,
  parseFmhyVideoDirectory,
  reconcileFmhyDirectoryEntries,
  type FmhyDirectoryImportResult,
  type FmhyDirectoryReconciliation,
} from '../../../../shared/fmhyDirectoryImport';
import SettingsCard from '../SettingsCard';
import { useT } from '../../../i18n';
import { LANG_TAGS } from '../../../../shared/i18n/core';

// These are module-level arrays, so they cannot call useT() at declaration time
// -- each entry carries an i18n KEY the consumer resolves at render (CLAUDE.md
// i18n rule 7, the settingsRegistry.ts pattern).
const COMPATIBILITY: { key: keyof VerifiedSiteCompatibility; labelKey: string }[] = [
  { key: 'episodeLists', labelKey: 'verifiedSites.compat.episodeLists' },
  { key: 'metadata', labelKey: 'verifiedSites.compat.metadata' },
  { key: 'thumbnails', labelKey: 'verifiedSites.compat.thumbnails' },
  { key: 'synopsis', labelKey: 'verifiedSites.compat.synopsis' },
  { key: 'genres', labelKey: 'verifiedSites.compat.genres' },
  { key: 'ratings', labelKey: 'verifiedSites.compat.ratings' },
  { key: 'streamLinks', labelKey: 'verifiedSites.compat.streamLinks' },
  { key: 'multipleSeasons', labelKey: 'verifiedSites.compat.multipleSeasons' },
  { key: 'search', labelKey: 'verifiedSites.compat.search' },
  { key: 'pagination', labelKey: 'verifiedSites.compat.pagination' },
  { key: 'infiniteScroll', labelKey: 'verifiedSites.compat.infiniteScroll' },
  { key: 'javascriptRequired', labelKey: 'verifiedSites.compat.javascriptRequired' },
  { key: 'loginRequired', labelKey: 'verifiedSites.compat.loginRequired' },
  { key: 'cloudflareDetected', labelKey: 'verifiedSites.compat.cloudflareDetected' },
  { key: 'captchaDetected', labelKey: 'verifiedSites.compat.captchaDetected' },
];
const CONTENT: { key: VerifiedSiteContent; labelKey: string }[] = [
  { key: 'anime', labelKey: 'verifiedSites.content.anime' },
  { key: 'movies', labelKey: 'verifiedSites.content.movies' },
  { key: 'tv', labelKey: 'verifiedSites.content.tv' },
  { key: 'ovas', labelKey: 'verifiedSites.content.ovas' },
  { key: 'specials', labelKey: 'verifiedSites.content.specials' },
];

// Status, category and promotion are STORED enum values -- they are written to
// the document and compared against, so only their display moves.
const STATUS_KEY: Record<string, string> = {
  unverified: 'verifiedSites.status.unverified',
  verified: 'verifiedSites.status.verified',
  experimental: 'verifiedSites.status.experimental',
  'community-tested': 'verifiedSites.status.communityTested',
  broken: 'verifiedSites.status.broken',
  deprecated: 'verifiedSites.status.deprecated',
};
const CATEGORY_KEY: Record<string, string> = {
  mixed: 'verifiedSites.category.mixed',
  streaming: 'verifiedSites.category.streaming',
  metadata: 'verifiedSites.category.metadata',
  subtitles: 'verifiedSites.category.subtitles',
};
const PROMOTION_KEY: Record<string, string> = {
  'not-reviewed': 'verifiedSites.promotion.notReviewed',
  eligible: 'verifiedSites.promotion.eligible',
  ineligible: 'verifiedSites.promotion.ineligible',
};

/**
 * `site.source` is a machine token — `built-in`, `user-imported`, `community`,
 * `fmhy` — and three call sites printed it raw, so the panel read
 * `Source: user-imported` in every language. `verifiedSites.source.*` had been
 * written and translated in all four catalogs and was reached by nothing (D181).
 *
 * Falls back to the token itself rather than to the key, because a source this
 * panel has not met yet is better shown as its raw name than as
 * `verifiedSites.source.whatever`.
 */
function sourceLabel(source: string, t: (key: string) => string): string {
  const key = `verifiedSites.source.${source}`;
  const label = t(key);
  return label === key ? source : label;
}

type Draft = Omit<VerifiedSiteRecord, 'createdAt' | 'updatedAt'> & Partial<Pick<VerifiedSiteRecord, 'createdAt' | 'updatedAt'>>;

function blankDraft(): Draft {
  return {
    id: '', name: '', baseUrl: '', iconUrl: null, description: '', languages: [], countryCode: null,
    category: 'mixed', supportedContent: ['anime'], scraperVersion: '', lastVerifiedAt: null,
    lastSuccessfulScrapeAt: null, averageScrapeTimeMs: null, successRate: null, reliabilityScore: 0,
    active: true, status: 'experimental', notes: '', tags: [],
    source: 'user-imported', sourceCategory: null, sourcePageUrl: null,
    promotionEligibility: 'not-reviewed', promotionReviewedAt: null, promotionNote: '',
    compatibility: Object.fromEntries(COMPATIBILITY.map(({ key }) => [key, false])) as unknown as VerifiedSiteCompatibility,
  };
}

function splitList(value: string): string[] {
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

function localDate(value: string | null): string {
  return value ? value.slice(0, 10) : '';
}

export default function VerifiedSitesManager() {
  const { t, lang } = useT();
  const [document, setDocument] = useState<VerifiedSitesDocument>(loadVerifiedSitesDocument);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [portableJson, setPortableJson] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [fmhyHtml, setFmhyHtml] = useState('');
  const [fmhyReview, setFmhyReview] = useState<{ parsed: FmhyDirectoryImportResult; reconciliation: FmhyDirectoryReconciliation; html: string } | null>(null);
  const [fmhySnapshot, setFmhySnapshot] = useState(loadFmhyDirectorySnapshot);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return document.sites.filter((site) => (status === 'all' || site.status === status)
      && (!needle || [site.name, site.baseUrl, ...site.languages, ...site.tags].join(' ').toLowerCase().includes(needle)));
  }, [document, query, status]);
  const duplicateGroups = useMemo(() => findVerifiedSiteDuplicateGroups(document), [document]);

  const persist = (next: VerifiedSitesDocument) => {
    const saved = saveVerifiedSitesDocument(next);
    setDocument(saved.value);
    return saved;
  };
  const patch = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((current) => current ? { ...current, [key]: value } : current);
  const startEdit = (site?: VerifiedSiteRecord) => {
    setDraft(site ? { ...site, compatibility: { ...site.compatibility }, supportedContent: [...site.supportedContent] } : blankDraft());
    setMessage(null);
  };
  const saveDraft = () => {
    if (!draft) return;
    const baseId = draft.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'site';
    let id = draft.id || baseId;
    for (let suffix = 2; !draft.id && document.sites.some((site) => site.id === id); suffix += 1) {
      id = `${baseId}-${suffix}`;
    }
    const result = upsertVerifiedSite(document, { ...draft, id });
    if (result.issues.length) {
      setMessage(result.issues.map((issue) => `${issue.path || 'document'}: ${issue.message}`).join(' '));
      return;
    }
    persist(result.value);
    setDraft(null);
    setMessage(t('verifiedSites.msg.saved'));
  };

  return (
    <SettingsCard
      id="verified-sites"
      title={t('verifiedSites.title')}
      description={t('verifiedSites.desc')}
      trailing={<span className="os-set-adv-badge">{t('verifiedSites.count', { count: document.sites.length })}</span>}
    >
      <div className="verified-sites-toolbar">
        <input aria-label={t('verifiedSites.searchAria')} type="search" value={query} placeholder={t('verifiedSites.searchPlaceholder')} onChange={(event) => setQuery(event.currentTarget.value)} />
        <select aria-label={t('verifiedSites.filterAria')} value={status} onChange={(event) => setStatus(event.currentTarget.value)}>
          <option value="all">{t('verifiedSites.status.all')}</option>
          {Object.entries(STATUS_KEY).map(([value, key]) => (
            <option key={value} value={value}>{t(key)}</option>
          ))}
        </select>
        <button type="button" className="btn primary" onClick={() => startEdit()}>{t('verifiedSites.add')}</button>
      </div>

      <div className="verified-sites-list">
        {filtered.map((site) => (
          <article key={site.id} className="verified-site-row">
            <div className="verified-site-row-main">
              <strong>{site.name}</strong>
              <a href={site.baseUrl} onClick={(event) => event.preventDefault()}>{site.baseUrl}</a>
              <span className="muted">{site.source === 'fmhy' ? `FMHY · ${site.sourceCategory ?? t('verifiedSites.uncategorized')}` : t(CATEGORY_KEY[site.category] ?? 'verifiedSites.category.mixed')} · {site.languages.join(', ') || t('verifiedSites.noLanguages')} · {t('verifiedSites.reliability', { score: site.reliabilityScore })}</span>
              <span className="muted">{t('verifiedSites.rowMeta', { source: sourceLabel(site.source, t), promotion: t(PROMOTION_KEY[site.promotionEligibility] ?? 'verifiedSites.promotion.notReviewed') })}</span>
            </div>
            <span className={`verified-site-status status-${site.status}`}>{t(STATUS_KEY[site.status] ?? 'verifiedSites.status.unverified')}</span>
            <button type="button" className="btn small" onClick={() => startEdit(site)}>{t('verifiedSites.edit')}</button>
            {site.status !== 'verified' && <button type="button" className="btn small" disabled={site.source !== 'built-in' && site.promotionEligibility !== 'eligible'} onClick={() => {
              const promoted = promoteVerifiedSite(document, site.id);
              if (promoted.issues.length) setMessage(promoted.issues[0].message);
              else { persist(promoted.value); setMessage(t('verifiedSites.msg.promoted', { name: site.name })); }
            }}>{t('verifiedSites.promote')}</button>}
            <button type="button" className="btn small danger" onClick={() => {
              if (!window.confirm(t('verifiedSites.confirmDelete', { name: site.name }))) return;
              persist(removeVerifiedSite(document, site.id));
              if (draft?.id === site.id) setDraft(null);
              setMessage(t('verifiedSites.msg.deleted'));
            }}>{t('verifiedSites.delete')}</button>
          </article>
        ))}
        {!filtered.length && <p className="muted">{document.sites.length ? t('verifiedSites.empty.filtered') : t('verifiedSites.empty.none')}</p>}
      </div>

      {draft && (
        <div className="verified-site-editor" aria-label={t('verifiedSites.editorAria')}>
          <div className="verified-sites-grid">
            <label>{t('verifiedSites.field.name')}<input required value={draft.name} onChange={(event) => patch('name', event.currentTarget.value)} /></label>
            <label>{t('verifiedSites.field.baseUrl')}<input required type="url" value={draft.baseUrl} placeholder="https://example.org" onChange={(event) => patch('baseUrl', event.currentTarget.value)} /></label>
            <label>{t('verifiedSites.field.status')}<select value={draft.status} onChange={(event) => patch('status', event.currentTarget.value as Draft['status'])}>{Object.entries(STATUS_KEY).map(([value, key]) => <option key={value} value={value}>{t(key)}</option>)}</select></label>
            <label>{t('verifiedSites.field.category')}<select value={draft.category} onChange={(event) => patch('category', event.currentTarget.value as Draft['category'])}>{Object.entries(CATEGORY_KEY).map(([value, key]) => <option key={value} value={value}>{t(key)}</option>)}</select></label>
            <label>{t('verifiedSites.field.languages')}<input value={draft.languages.join(', ')} placeholder="ja, en" onChange={(event) => patch('languages', splitList(event.currentTarget.value))} /></label>
            <label>{t('verifiedSites.field.countryCode')}<input maxLength={2} value={draft.countryCode ?? ''} placeholder="JP" onChange={(event) => patch('countryCode', event.currentTarget.value || null)} /></label>
            <label>{t('verifiedSites.field.scraperVersion')}<input value={draft.scraperVersion} onChange={(event) => patch('scraperVersion', event.currentTarget.value)} /></label>
            <label>{t('verifiedSites.field.reliability')}<input type="number" min={0} max={100} value={draft.reliabilityScore} onChange={(event) => patch('reliabilityScore', Number(event.currentTarget.value))} /></label>
            <label>{t('verifiedSites.field.successRate')}<input type="number" min={0} max={100} value={draft.successRate ?? ''} onChange={(event) => patch('successRate', event.currentTarget.value === '' ? null : Number(event.currentTarget.value))} /></label>
            <label>{t('verifiedSites.field.avgScrapeTime')}<input type="number" min={0} value={draft.averageScrapeTimeMs ?? ''} onChange={(event) => patch('averageScrapeTimeMs', event.currentTarget.value === '' ? null : Number(event.currentTarget.value))} /></label>
            <label>{t('verifiedSites.field.lastVerified')}<input type="date" value={localDate(draft.lastVerifiedAt)} onChange={(event) => patch('lastVerifiedAt', event.currentTarget.value || null)} /></label>
            <label>{t('verifiedSites.field.lastScrape')}<input type="date" value={localDate(draft.lastSuccessfulScrapeAt)} onChange={(event) => patch('lastSuccessfulScrapeAt', event.currentTarget.value || null)} /></label>
            <label>{t('verifiedSites.field.iconUrl')}<input type="url" value={draft.iconUrl ?? ''} onChange={(event) => patch('iconUrl', event.currentTarget.value || null)} /></label>
            <label>{t('verifiedSites.field.tags')}<input value={draft.tags.join(', ')} onChange={(event) => patch('tags', splitList(event.currentTarget.value))} /></label>
          </div>
          <label className="verified-site-wide">{t('verifiedSites.field.description')}<textarea value={draft.description} onChange={(event) => patch('description', event.currentTarget.value)} /></label>
          <label className="verified-site-wide">{t('verifiedSites.field.notes')}<textarea value={draft.notes} onChange={(event) => patch('notes', event.currentTarget.value)} /></label>
          {draft.source !== 'built-in' && <div className="verified-site-wide">
            <strong>{t('verifiedSites.promotion.title')}</strong>
            <p className="muted">{t('verifiedSites.promotion.hint')}</p>
            <label>{t('verifiedSites.promotion.note')}<textarea value={draft.promotionNote} onChange={(event) => patch('promotionNote', event.currentTarget.value)} /></label>
            <div className="verified-sites-actions">
              <button type="button" className="btn" onClick={() => {
                if (!draft.id) { patch('promotionEligibility', 'eligible'); patch('promotionReviewedAt', new Date().toISOString()); return; }
                const next = reviewPromotionEligibility(document, draft.id, 'eligible', draft.promotionNote);
                persist(next); setDraft(next.sites.find((site) => site.id === draft.id) ?? null); setMessage(t('verifiedSites.msg.markedEligible'));
              }}>{t('verifiedSites.promotion.markEligible')}</button>
              <button type="button" className="btn" onClick={() => {
                if (!draft.id) { patch('promotionEligibility', 'ineligible'); patch('promotionReviewedAt', new Date().toISOString()); return; }
                const next = reviewPromotionEligibility(document, draft.id, 'ineligible', draft.promotionNote);
                persist(next); setDraft(next.sites.find((site) => site.id === draft.id) ?? null); setMessage(t('verifiedSites.msg.markedIneligible'));
              }}>{t('verifiedSites.promotion.markIneligible')}</button>
            </div>
          </div>}
          <div className="verified-site-options"><strong>{t('verifiedSites.supportedContent')}</strong>{CONTENT.map((item) => <label key={item.key}><input type="checkbox" checked={draft.supportedContent.includes(item.key)} onChange={(event) => patch('supportedContent', event.currentTarget.checked ? [...draft.supportedContent, item.key] : draft.supportedContent.filter((value) => value !== item.key))} /> {t(item.labelKey)}</label>)}</div>
          <div className="verified-site-options"><strong>{t('verifiedSites.compatRecord')}</strong>{COMPATIBILITY.map((item) => <label key={item.key}><input type="checkbox" checked={draft.compatibility[item.key]} onChange={(event) => patch('compatibility', { ...draft.compatibility, [item.key]: event.currentTarget.checked })} /> {t(item.labelKey)}</label>)}</div>
          <label className="verified-site-active"><input type="checkbox" checked={draft.active} onChange={(event) => patch('active', event.currentTarget.checked)} /> {t('verifiedSites.activeInDb')}</label>
          <div className="verified-sites-actions"><button type="button" className="btn primary" onClick={saveDraft}>{t('verifiedSites.save')}</button><button type="button" className="btn" onClick={() => setDraft(null)}>{t('common.cancel')}</button></div>
        </div>
      )}

      {!!duplicateGroups.length && <details className="verified-sites-portable">
        <summary>{t('verifiedSites.dupes.title', { count: duplicateGroups.length })}</summary>
        <p className="muted">{t('verifiedSites.dupes.hint')}</p>
        {duplicateGroups.map((group) => <div key={group.origin} className="verified-site-editor">
          <strong>{group.origin}</strong>
          {group.sites.map((site) => <div key={site.id} className="verified-sites-actions">
            <span>{site.name} · {sourceLabel(site.source, t)} · {site.baseUrl}</span>
            <button type="button" className="btn small" onClick={() => {
              const next = reconcileVerifiedSiteDuplicates(document, site.id, group.sites.filter((item) => item.id !== site.id).map((item) => item.id));
              persist(next); setMessage(t('verifiedSites.msg.reconciled', { name: site.name, source: sourceLabel(site.source, t) }));
            }}>{t('verifiedSites.dupes.keep')}</button>
          </div>)}
        </div>)}
      </details>}

      <details className="verified-sites-portable">
        <summary>{t('verifiedSites.json.title')}</summary>
        <textarea aria-label={t('verifiedSites.json.aria')} value={portableJson} placeholder={t('verifiedSites.json.placeholder')} spellCheck={false} onChange={(event) => setPortableJson(event.currentTarget.value)} />
        <div className="verified-sites-actions">
          <button type="button" className="btn" onClick={() => { setPortableJson(exportVerifiedSitesDocument(document)); setMessage(t('verifiedSites.msg.exported')); }}>{t('verifiedSites.json.export')}</button>
          <button type="button" className="btn primary" disabled={!portableJson.trim()} onClick={() => {
            try {
              const result = importVerifiedSitesDocument(portableJson);
              setDocument(result.value); setDraft(null);
              setMessage(result.issues.length ? t('verifiedSites.msg.importedWithIssues', { count: result.issues.length }) : t('verifiedSites.msg.imported'));
            } catch (error) { setMessage(error instanceof Error ? error.message : t('verifiedSites.msg.importFailed')); }
          }}>{t('verifiedSites.json.import')}</button>
        </div>
      </details>
      <details className="verified-sites-portable">
        <summary>{t('verifiedSites.fmhy.title')}</summary>
        <p className="muted">{t('verifiedSites.fmhy.hintBefore')}<a href={FMHY_VIDEO_DIRECTORY_URL} onClick={(event) => event.preventDefault()}>{FMHY_VIDEO_DIRECTORY_URL}</a>{t('verifiedSites.fmhy.hintAfter')}</p>
        <textarea aria-label={t('verifiedSites.fmhy.aria')} value={fmhyHtml} placeholder={t('verifiedSites.fmhy.placeholder')} spellCheck={false} onChange={(event) => setFmhyHtml(event.currentTarget.value)} />
        <div className="verified-sites-actions">
          <button type="button" className="btn primary" disabled={!fmhyHtml.trim()} onClick={() => {
            const html = fmhyHtml;
            const parsed = parseFmhyVideoDirectory(new DOMParser().parseFromString(html, 'text/html').documentElement);
            setFmhyReview({ parsed, reconciliation: reconcileFmhyDirectoryEntries(document, parsed.entries), html });
            setMessage(parsed.entries.length ? t('verifiedSites.msg.refreshParsed') : t('verifiedSites.msg.refreshEmpty'));
          }}>{t('verifiedSites.fmhy.reviewHtml')}</button>
          <button type="button" className="btn" disabled={!fmhySnapshot} onClick={() => {
            if (!fmhySnapshot) return;
            const parsed = parseFmhyVideoDirectory(new DOMParser().parseFromString(fmhySnapshot.html, 'text/html').documentElement);
            setFmhyReview({ parsed, reconciliation: reconcileFmhyDirectoryEntries(document, parsed.entries), html: fmhySnapshot.html });
            setMessage(t('verifiedSites.msg.snapshotLoaded'));
          }}>{t('verifiedSites.fmhy.reviewCached')}</button>
        </div>
        {fmhySnapshot && <p className="muted">{t('verifiedSites.fmhy.cached', { at: new Date(fmhySnapshot.capturedAt).toLocaleString(LANG_TAGS[lang]), count: fmhySnapshot.entryCount })}</p>}
        {fmhyReview && (
          <div className="verified-site-editor" aria-label={t('verifiedSites.fmhy.previewAria')}>
            <strong>{t('verifiedSites.fmhy.preview')}</strong>
            <p className="muted">{t('verifiedSites.fmhy.stats', { added: fmhyReview.reconciliation.added.length, changed: fmhyReview.reconciliation.changed.length, unchanged: fmhyReview.reconciliation.unchanged.length, absent: fmhyReview.reconciliation.absent.length, encoded: fmhyReview.parsed.skippedEncoded, duplicate: fmhyReview.parsed.skippedDuplicate })}</p>
            {!!fmhyReview.reconciliation.added.length && <p>{t('verifiedSites.fmhy.new', { names: fmhyReview.reconciliation.added.map((entry) => entry.name).join(', ') })}</p>}
            {!!fmhyReview.reconciliation.changed.length && <p>{t('verifiedSites.fmhy.changed', { names: fmhyReview.reconciliation.changed.map((change) => `${change.previousName} → ${change.entry.name} (${change.previousCategory ?? t('verifiedSites.uncategorized')} → ${change.entry.category})`).join(', ') })}</p>}
            {!!fmhyReview.reconciliation.absent.length && <p>{t('verifiedSites.fmhy.absent', { names: fmhyReview.reconciliation.absent.map((entry) => entry.name).join(', ') })}</p>}
            <div className="verified-sites-actions">
              <button type="button" className="btn primary" disabled={!fmhyReview.parsed.entries.length} onClick={() => {
                const applied = applyFmhyDirectoryReconciliation(document, fmhyReview.reconciliation);
                persist(applied.value);
                const snapshot = saveFmhyDirectorySnapshot(fmhyReview.html, fmhyReview.parsed.entries.length);
                setFmhySnapshot(snapshot); setFmhyReview(null);
                setMessage(t('verifiedSites.msg.refreshApplied', { added: applied.added, updated: applied.updated }));
              }}>{t('verifiedSites.fmhy.apply')}</button>
              <button type="button" className="btn" onClick={() => setFmhyReview(null)}>{t('verifiedSites.fmhy.discard')}</button>
            </div>
          </div>
        )}
      </details>
      {message && <p className="form-msg" role="status">{message}</p>}
    </SettingsCard>
  );
}
