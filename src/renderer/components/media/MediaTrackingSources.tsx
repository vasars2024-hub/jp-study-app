import { useMemo, useState } from 'react';
import { assignTrackingSource, buildTrackingSourceCatalogue, projectMediaTrackingAggregates, projectMediaTrackingSources, type TrackingSourceStatus } from '../../../shared/mediaTrackingSources';
import { clearTrackingSourceAudit, exportTrackingSourceAudit, loadMediaTrackingSourcesDocument, loadTrackingSourceAudit, loadTrackingSourceAuditRetention, saveTrackingSourceAuditRetention, setTrackingSourceEnabled, setTrackingSourceOrder, updateTrackingSource } from '../../mediaTrackingSourcesStore';
import { loadVerifiedSitesDocument } from '../../verifiedSitesStore';
import { loadMediaProvidersDocument } from '../../mediaProviderStore';

const statuses: TrackingSourceStatus[] = ['unknown', 'working', 'slow', 'failed', 'disabled'];

export function MediaTrackingSources({ identityId, titleFor }: { identityId?: string; titleFor?: (identityId: string) => string }) {
  const [trackingDocument, setDocument] = useState(loadMediaTrackingSourcesDocument);
  const [audit, setAudit] = useState(loadTrackingSourceAudit);
  const [auditRetention, setAuditRetention] = useState(loadTrackingSourceAuditRetention);
  const [catalogue] = useState(() => buildTrackingSourceCatalogue(loadVerifiedSitesDocument().sites, loadMediaProvidersDocument().providers));
  const [sourceToAdd, setSourceToAdd] = useState('');
  const [exportStatus, setExportStatus] = useState('');
  const rows = useMemo(() => projectMediaTrackingSources(trackingDocument, identityId), [trackingDocument, identityId]);
  const aggregates = useMemo(() => projectMediaTrackingAggregates(trackingDocument), [trackingDocument]);
  if (!rows.length && !aggregates.length && !audit.length) return null;
  const move = (sourceId: string, delta: -1 | 1) => {
    const order = [...trackingDocument.sourceOrder];
    const index = order.indexOf(sourceId);
    const next = index + delta;
    if (index < 0) order.push(sourceId);
    else if (next >= 0 && next < order.length) [order[index], order[next]] = [order[next], order[index]];
    setDocument(setTrackingSourceOrder(order));
  };
  const update = (sourceId: string, patch: Parameters<typeof updateTrackingSource>[2]) => {
    setDocument(updateTrackingSource(identityId ?? '', sourceId, patch));
    setAudit(loadTrackingSourceAudit());
  };
  const commitAuditRetention = (value: number) => {
    const next = saveTrackingSourceAuditRetention(value);
    setAuditRetention(next);
    setAudit(loadTrackingSourceAudit());
  };
  const handleExport = () => {
    const blob = new Blob([exportTrackingSourceAudit()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = window.document.createElement('a');
    anchor.href = url;
    anchor.download = 'media-tracking-source-audit.json';
    anchor.click();
    URL.revokeObjectURL(url);
    setExportStatus('Exported local audit history.');
  };
  const handleClear = () => {
    clearTrackingSourceAudit();
    setAudit([]);
    setExportStatus('Cleared local audit history.');
  };
  return (
    <section className="media-tracking-sources" aria-label="Source monitoring">
      <div className="media-tracking-sources-head">
        <h3>Source monitoring</h3>
        <span className="muted">Local signals · configured order</span>
      </div>
      {identityId && (
        <div className="media-tracking-source-editor">
          <label>
            Add catalogue source
            <select value={sourceToAdd} onChange={(event) => setSourceToAdd(event.target.value)}>
              <option value="">Choose a local site or provider</option>
              {catalogue.filter((source) => !trackingDocument.rows.some((row) => row.identityId === identityId && row.sourceId === source.sourceId)).map((source) => <option key={source.sourceId} value={source.sourceId}>{source.sourceName} · {source.kind}</option>)}
            </select>
          </label>
          <button type="button" className="btn" disabled={!sourceToAdd} onClick={() => { const source = catalogue.find((item) => item.sourceId === sourceToAdd); if (source) setDocument(assignTrackingSource(trackingDocument, identityId, source)); setSourceToAdd(''); }}>Assign</button>
        </div>
      )}
      <div className="media-tracking-source-aggregate">
        {aggregates.map((item) => <div key={item.identityId}><strong>{titleFor?.(item.identityId) ?? item.identityId}</strong><span className="muted">{item.availableCount}/{item.monitoredCount} working · {item.confidenceScore === null ? 'Confidence unknown' : `${item.confidenceScore}% confidence`}{item.newEpisodeCount ? ` · ${item.newEpisodeCount} new` : ''}</span></div>)}
      </div>
      <div className="media-tracking-source-audit">
        <div className="media-tracking-source-audit-head">
          <strong>Health edit history</strong>
          <span className="muted">{audit.length} stored · newest first</span>
        </div>
        <div className="media-tracking-source-audit-controls">
          <label>Retention <input type="number" min="1" max="200" value={auditRetention} onChange={(event) => commitAuditRetention(event.target.value === '' ? 1 : Number(event.target.value))} /></label>
          <button type="button" className="btn" onClick={handleExport}>Export JSON</button>
          <button type="button" className="btn" onClick={handleClear}>Clear history</button>
        </div>
        {exportStatus && <span className="muted">{exportStatus}</span>}
        {audit.length === 0 ? <span className="muted">No local health edits yet.</span> : <div className="media-tracking-source-audit-list">{audit.map((entry) => <div key={`${entry.sequence}:${entry.identityId}:${entry.sourceId}`} className="media-tracking-source-audit-entry"><strong>{titleFor?.(entry.identityId) ?? entry.identityId}</strong><span className="muted">{entry.sourceName} · {entry.changedAt.slice(0, 19).replace('T', ' ')}</span><span className="muted">Seq {entry.sequence} · {entry.before.status ?? 'unknown'} to {entry.after.status ?? 'unknown'}{typeof entry.after.reliabilityScore === 'number' ? ` · ${entry.after.reliabilityScore}%` : ''}</span></div>)}</div>}
      </div>
      <div className="media-tracking-source-list">
        {rows.map((row) => <div className={`media-tracking-source-row ${row.enabled ? '' : 'is-disabled'}`} key={`${row.identityId}:${row.sourceId}`}>
          <strong>{row.sourceName}</strong>
          <label>Status <select value={row.status} onChange={(event) => update(row.sourceId, { status: event.target.value as TrackingSourceStatus })}>{statuses.map((status) => <option key={status} value={status}>{status}</option>)}</select></label>
          <label>Last checked <input type="datetime-local" value={row.lastCheckedAt ? row.lastCheckedAt.slice(0, 16) : ''} onChange={(event) => update(row.sourceId, { lastCheckedAt: event.target.value ? new Date(event.target.value).toISOString() : null })} /></label>
          <label>Reliability <input type="number" min="0" max="100" value={row.reliabilityScore ?? ''} onChange={(event) => update(row.sourceId, { reliabilityScore: event.target.value === '' ? null : Number(event.target.value) })} /></label>
          <label><input type="checkbox" checked={row.newEpisodeDetected} onChange={(event) => update(row.sourceId, { newEpisodeDetected: event.currentTarget.checked })} /> New episode</label>
          <label>Next episode <input type="number" min="1" value={row.nextEpisodeNumber ?? ''} onChange={(event) => update(row.sourceId, { nextEpisodeNumber: event.target.value === '' ? null : Number(event.target.value) })} /></label>
          <label><input type="checkbox" checked={row.enabled} onChange={(event) => setDocument(setTrackingSourceEnabled(row.sourceId, event.currentTarget.checked))} /> Monitor</label>
          <span><button type="button" className="btn" aria-label={`Move ${row.sourceName} up`} onClick={() => move(row.sourceId, -1)}>Up</button> <button type="button" className="btn" aria-label={`Move ${row.sourceName} down`} onClick={() => move(row.sourceId, 1)}>Down</button></span>
        </div>)}
      </div>
    </section>
  );
}
