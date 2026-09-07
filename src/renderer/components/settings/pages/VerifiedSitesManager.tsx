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

const COMPATIBILITY: { key: keyof VerifiedSiteCompatibility; label: string }[] = [
  { key: 'episodeLists', label: 'Episode lists' }, { key: 'metadata', label: 'Metadata' },
  { key: 'thumbnails', label: 'Thumbnails' }, { key: 'synopsis', label: 'Synopsis' },
  { key: 'genres', label: 'Genres' }, { key: 'ratings', label: 'Ratings' },
  { key: 'streamLinks', label: 'Stream links' }, { key: 'multipleSeasons', label: 'Multiple seasons' },
  { key: 'search', label: 'Search' }, { key: 'pagination', label: 'Pagination' },
  { key: 'infiniteScroll', label: 'Infinite scroll' }, { key: 'javascriptRequired', label: 'JavaScript required' },
  { key: 'loginRequired', label: 'Login required' }, { key: 'cloudflareDetected', label: 'Cloudflare noted' },
  { key: 'captchaDetected', label: 'CAPTCHA noted' },
];
const CONTENT: { key: VerifiedSiteContent; label: string }[] = [
  { key: 'anime', label: 'Anime' }, { key: 'movies', label: 'Movies' }, { key: 'tv', label: 'TV' },
  { key: 'ovas', label: 'OVAs' }, { key: 'specials', label: 'Specials' },
];

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
  // Only `lang` is taken here. This panel's own prose is still English literals
  // (D100's class, filed separately) — but a date stamp reading US-style inside
  // a Russian UI is a different, measured defect and is fixed on its own.
  const { lang } = useT();
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
    setMessage('Site saved locally.');
  };

  return (
    <SettingsCard
      id="verified-sites"
      title="Verified Sites"
      description="Maintain a local curated database. Status and compatibility values are user-entered; this manager performs no network verification."
      trailing={<span className="os-set-adv-badge">{document.sites.length} sites</span>}
    >
      <div className="verified-sites-toolbar">
        <input aria-label="Search verified sites" type="search" value={query} placeholder="Search name, URL, language, or tag" onChange={(event) => setQuery(event.currentTarget.value)} />
        <select aria-label="Filter by status" value={status} onChange={(event) => setStatus(event.currentTarget.value)}>
          <option value="all">All statuses</option><option value="unverified">Unverified</option><option value="verified">Verified</option>
          <option value="experimental">Experimental</option><option value="community-tested">Community tested</option>
          <option value="broken">Broken</option><option value="deprecated">Deprecated</option>
        </select>
        <button type="button" className="btn primary" onClick={() => startEdit()}>Add site</button>
      </div>

      <div className="verified-sites-list">
        {filtered.map((site) => (
          <article key={site.id} className="verified-site-row">
            <div className="verified-site-row-main">
              <strong>{site.name}</strong>
              <a href={site.baseUrl} onClick={(event) => event.preventDefault()}>{site.baseUrl}</a>
              <span className="muted">{site.source === 'fmhy' ? `FMHY · ${site.sourceCategory ?? 'Uncategorized'}` : site.category} · {site.languages.join(', ') || 'No languages'} · {site.reliabilityScore}/100 reliability</span>
              <span className="muted">Source: {site.source} · Promotion: {site.promotionEligibility.replace('-', ' ')}</span>
            </div>
            <span className={`verified-site-status status-${site.status}`}>{site.status.replace('-', ' ')}</span>
            <button type="button" className="btn small" onClick={() => startEdit(site)}>Edit</button>
            {site.status !== 'verified' && <button type="button" className="btn small" disabled={site.source !== 'built-in' && site.promotionEligibility !== 'eligible'} onClick={() => {
              const promoted = promoteVerifiedSite(document, site.id);
              if (promoted.issues.length) setMessage(promoted.issues[0].message);
              else { persist(promoted.value); setMessage(`${site.name} promoted to Verified.`); }
            }}>Promote</button>}
            <button type="button" className="btn small danger" onClick={() => {
              if (!window.confirm(`Delete ${site.name} from the local database?`)) return;
              persist(removeVerifiedSite(document, site.id));
              if (draft?.id === site.id) setDraft(null);
              setMessage('Site deleted.');
            }}>Delete</button>
          </article>
        ))}
        {!filtered.length && <p className="muted">{document.sites.length ? 'No sites match these filters.' : 'No verified sites saved yet.'}</p>}
      </div>

      {draft && (
        <div className="verified-site-editor" aria-label="Verified site editor">
          <div className="verified-sites-grid">
            <label>Name<input required value={draft.name} onChange={(event) => patch('name', event.currentTarget.value)} /></label>
            <label>Base URL<input required type="url" value={draft.baseUrl} placeholder="https://example.org" onChange={(event) => patch('baseUrl', event.currentTarget.value)} /></label>
            <label>Status<select value={draft.status} onChange={(event) => patch('status', event.currentTarget.value as Draft['status'])}><option value="unverified">Unverified</option><option value="verified">Verified</option><option value="experimental">Experimental</option><option value="community-tested">Community tested</option><option value="broken">Broken</option><option value="deprecated">Deprecated</option></select></label>
            <label>Category<select value={draft.category} onChange={(event) => patch('category', event.currentTarget.value as Draft['category'])}><option value="mixed">Mixed</option><option value="streaming">Streaming</option><option value="metadata">Metadata</option><option value="subtitles">Subtitles</option></select></label>
            <label>Languages<input value={draft.languages.join(', ')} placeholder="ja, en" onChange={(event) => patch('languages', splitList(event.currentTarget.value))} /></label>
            <label>Country code<input maxLength={2} value={draft.countryCode ?? ''} placeholder="JP" onChange={(event) => patch('countryCode', event.currentTarget.value || null)} /></label>
            <label>Scraper version<input value={draft.scraperVersion} onChange={(event) => patch('scraperVersion', event.currentTarget.value)} /></label>
            <label>Reliability (0–100)<input type="number" min={0} max={100} value={draft.reliabilityScore} onChange={(event) => patch('reliabilityScore', Number(event.currentTarget.value))} /></label>
            <label>Success rate (%)<input type="number" min={0} max={100} value={draft.successRate ?? ''} onChange={(event) => patch('successRate', event.currentTarget.value === '' ? null : Number(event.currentTarget.value))} /></label>
            <label>Average scrape time (ms)<input type="number" min={0} value={draft.averageScrapeTimeMs ?? ''} onChange={(event) => patch('averageScrapeTimeMs', event.currentTarget.value === '' ? null : Number(event.currentTarget.value))} /></label>
            <label>Last verified<input type="date" value={localDate(draft.lastVerifiedAt)} onChange={(event) => patch('lastVerifiedAt', event.currentTarget.value || null)} /></label>
            <label>Last successful scrape<input type="date" value={localDate(draft.lastSuccessfulScrapeAt)} onChange={(event) => patch('lastSuccessfulScrapeAt', event.currentTarget.value || null)} /></label>
            <label>Icon URL<input type="url" value={draft.iconUrl ?? ''} onChange={(event) => patch('iconUrl', event.currentTarget.value || null)} /></label>
            <label>Tags<input value={draft.tags.join(', ')} onChange={(event) => patch('tags', splitList(event.currentTarget.value))} /></label>
          </div>
          <label className="verified-site-wide">Description<textarea value={draft.description} onChange={(event) => patch('description', event.currentTarget.value)} /></label>
          <label className="verified-site-wide">Notes<textarea value={draft.notes} onChange={(event) => patch('notes', event.currentTarget.value)} /></label>
          {draft.source !== 'built-in' && <div className="verified-site-wide">
            <strong>Promotion review</strong>
            <p className="muted">Record a local, user-controlled eligibility decision. This does not run a compatibility test.</p>
            <label>Review note<textarea value={draft.promotionNote} onChange={(event) => patch('promotionNote', event.currentTarget.value)} /></label>
            <div className="verified-sites-actions">
              <button type="button" className="btn" onClick={() => {
                if (!draft.id) { patch('promotionEligibility', 'eligible'); patch('promotionReviewedAt', new Date().toISOString()); return; }
                const next = reviewPromotionEligibility(document, draft.id, 'eligible', draft.promotionNote);
                persist(next); setDraft(next.sites.find((site) => site.id === draft.id) ?? null); setMessage('Promotion eligibility marked eligible.');
              }}>Mark eligible</button>
              <button type="button" className="btn" onClick={() => {
                if (!draft.id) { patch('promotionEligibility', 'ineligible'); patch('promotionReviewedAt', new Date().toISOString()); return; }
                const next = reviewPromotionEligibility(document, draft.id, 'ineligible', draft.promotionNote);
                persist(next); setDraft(next.sites.find((site) => site.id === draft.id) ?? null); setMessage('Promotion eligibility marked ineligible.');
              }}>Mark ineligible</button>
            </div>
          </div>}
          <div className="verified-site-options"><strong>Supported content</strong>{CONTENT.map((item) => <label key={item.key}><input type="checkbox" checked={draft.supportedContent.includes(item.key)} onChange={(event) => patch('supportedContent', event.currentTarget.checked ? [...draft.supportedContent, item.key] : draft.supportedContent.filter((value) => value !== item.key))} /> {item.label}</label>)}</div>
          <div className="verified-site-options"><strong>Compatibility record</strong>{COMPATIBILITY.map((item) => <label key={item.key}><input type="checkbox" checked={draft.compatibility[item.key]} onChange={(event) => patch('compatibility', { ...draft.compatibility, [item.key]: event.currentTarget.checked })} /> {item.label}</label>)}</div>
          <label className="verified-site-active"><input type="checkbox" checked={draft.active} onChange={(event) => patch('active', event.currentTarget.checked)} /> Active in the local database</label>
          <div className="verified-sites-actions"><button type="button" className="btn primary" onClick={saveDraft}>Save site</button><button type="button" className="btn" onClick={() => setDraft(null)}>Cancel</button></div>
        </div>
      )}

      {!!duplicateGroups.length && <details className="verified-sites-portable">
        <summary>Reconcile cross-source duplicates ({duplicateGroups.length})</summary>
        <p className="muted">Records sharing the same normalized origin are retained until you explicitly choose which source record to keep.</p>
        {duplicateGroups.map((group) => <div key={group.origin} className="verified-site-editor">
          <strong>{group.origin}</strong>
          {group.sites.map((site) => <div key={site.id} className="verified-sites-actions">
            <span>{site.name} · {site.source} · {site.baseUrl}</span>
            <button type="button" className="btn small" onClick={() => {
              const next = reconcileVerifiedSiteDuplicates(document, site.id, group.sites.filter((item) => item.id !== site.id).map((item) => item.id));
              persist(next); setMessage(`Duplicate records reconciled; kept ${site.name} from ${site.source}.`);
            }}>Keep this record</button>
          </div>)}
        </div>)}
      </details>}

      <details className="verified-sites-portable">
        <summary>Import or export JSON</summary>
        <textarea aria-label="Verified Sites JSON" value={portableJson} placeholder="Export the current database or paste a versioned Verified Sites document" spellCheck={false} onChange={(event) => setPortableJson(event.currentTarget.value)} />
        <div className="verified-sites-actions">
          <button type="button" className="btn" onClick={() => { setPortableJson(exportVerifiedSitesDocument(document)); setMessage('Database exported to the JSON field.'); }}>Export JSON</button>
          <button type="button" className="btn primary" disabled={!portableJson.trim()} onClick={() => {
            try {
              const result = importVerifiedSitesDocument(portableJson);
              setDocument(result.value); setDraft(null);
              setMessage(result.issues.length ? `Imported with ${result.issues.length} corrected or ignored value(s).` : 'Database imported.');
            } catch (error) { setMessage(error instanceof Error ? error.message : 'Database could not be imported.'); }
          }}>Validate and import</button>
        </div>
      </details>
      <details className="verified-sites-portable">
        <summary>Review a manual FMHY directory refresh</summary>
        <p className="muted">Reviews only displayed site names, section categories, and direct public HTTP(S) URLs from manually supplied HTML for <a href={FMHY_VIDEO_DIRECTORY_URL} onClick={(event) => event.preventDefault()}>{FMHY_VIDEO_DIRECTORY_URL}</a>. Applying caches that source snapshot locally. Missing entries are reported but never deleted; encoded links are skipped. The app does not contact FMHY or listed sites, inspect catalogs, decode links, or run connectors.</p>
        <textarea aria-label="FMHY video directory HTML" value={fmhyHtml} placeholder="Paste the saved HTML source of https://fmhy.net/video" spellCheck={false} onChange={(event) => setFmhyHtml(event.currentTarget.value)} />
        <div className="verified-sites-actions">
          <button type="button" className="btn primary" disabled={!fmhyHtml.trim()} onClick={() => {
            const html = fmhyHtml;
            const parsed = parseFmhyVideoDirectory(new DOMParser().parseFromString(html, 'text/html').documentElement);
            setFmhyReview({ parsed, reconciliation: reconcileFmhyDirectoryEntries(document, parsed.entries), html });
            setMessage(parsed.entries.length ? 'Refresh parsed. Review the reconciliation before applying.' : 'No direct public directory entries were found; nothing can be applied.');
          }}>Review supplied HTML</button>
          <button type="button" className="btn" disabled={!fmhySnapshot} onClick={() => {
            if (!fmhySnapshot) return;
            const parsed = parseFmhyVideoDirectory(new DOMParser().parseFromString(fmhySnapshot.html, 'text/html').documentElement);
            setFmhyReview({ parsed, reconciliation: reconcileFmhyDirectoryEntries(document, parsed.entries), html: fmhySnapshot.html });
            setMessage('Cached source snapshot loaded for review.');
          }}>Review cached snapshot</button>
        </div>
        {fmhySnapshot && <p className="muted">Cached snapshot: {new Date(fmhySnapshot.capturedAt).toLocaleString(LANG_TAGS[lang])} · {fmhySnapshot.entryCount} direct entries.</p>}
        {fmhyReview && (
          <div className="verified-site-editor" aria-label="FMHY refresh reconciliation preview">
            <strong>Reconciliation preview</strong>
            <p className="muted">{fmhyReview.reconciliation.added.length} new · {fmhyReview.reconciliation.changed.length} metadata changes · {fmhyReview.reconciliation.unchanged.length} unchanged · {fmhyReview.reconciliation.absent.length} absent (retained) · {fmhyReview.parsed.skippedEncoded} encoded skipped · {fmhyReview.parsed.skippedDuplicate} duplicate URLs skipped.</p>
            {!!fmhyReview.reconciliation.added.length && <p>New: {fmhyReview.reconciliation.added.map((entry) => entry.name).join(', ')}</p>}
            {!!fmhyReview.reconciliation.changed.length && <p>Changed: {fmhyReview.reconciliation.changed.map((change) => `${change.previousName} → ${change.entry.name} (${change.previousCategory ?? 'Uncategorized'} → ${change.entry.category})`).join(', ')}</p>}
            {!!fmhyReview.reconciliation.absent.length && <p>Absent but retained: {fmhyReview.reconciliation.absent.map((entry) => entry.name).join(', ')}</p>}
            <div className="verified-sites-actions">
              <button type="button" className="btn primary" disabled={!fmhyReview.parsed.entries.length} onClick={() => {
                const applied = applyFmhyDirectoryReconciliation(document, fmhyReview.reconciliation);
                persist(applied.value);
                const snapshot = saveFmhyDirectorySnapshot(fmhyReview.html, fmhyReview.parsed.entries.length);
                setFmhySnapshot(snapshot); setFmhyReview(null);
                setMessage(`Applied manual FMHY refresh: ${applied.added} added and ${applied.updated} metadata record(s) updated. Absent records were retained.`);
              }}>Apply reviewed refresh</button>
              <button type="button" className="btn" onClick={() => setFmhyReview(null)}>Discard preview</button>
            </div>
          </div>
        )}
      </details>
      {message && <p className="form-msg" role="status">{message}</p>}
    </SettingsCard>
  );
}
