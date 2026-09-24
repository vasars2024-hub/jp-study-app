import { useState } from 'react';
import type { MediaEpisodeMark, MediaTrackingDocument, MediaTrackingRecord, MediaTrackingStatus } from '../../../../shared/mediaTracking';
import type { MediaTrackingManagementAction } from '../../../../shared/mediaTrackingManagement';
import { loadMediaTrackingDocument, manageMediaTrackingEntry, removeMediaTrackingEntry } from '../../../mediaTrackingStore';
import SettingsCard from '../SettingsCard';
import { useT } from '../../../i18n';

const STATUSES: MediaTrackingStatus[] = ['planned', 'watching', 'completed', 'on-hold', 'dropped'];

// i18n keys, resolved at render: the stored enum stays the <option value> and
// only its label is translated.
const STATUS_KEY: Record<MediaTrackingStatus, string> = {
  planned: 'trackingMgmt.status.planned',
  watching: 'trackingMgmt.status.watching',
  completed: 'trackingMgmt.status.completed',
  'on-hold': 'trackingMgmt.status.on-hold',
  dropped: 'trackingMgmt.status.dropped',
};

// One per `reason` a rejected MediaTrackingManagementResult can carry.
const REJECTION_KEY: Record<string, string> = {
  'partition-mismatch': 'trackingMgmt.reason.partition-mismatch',
  'not-found': 'trackingMgmt.reason.not-found',
  'content-type-mismatch': 'trackingMgmt.reason.content-type-mismatch',
  'invalid-progress': 'trackingMgmt.reason.invalid-progress',
};

function optionalNumber(value: string): number | null {
  return value.trim() === '' ? null : Number(value);
}

export default function MediaTrackingManager() {
  const { t } = useT();
  const [document, setDocument] = useState<MediaTrackingDocument>(loadMediaTrackingDocument);
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState('');
  const records = document.records.filter((record) => record.identityId.includes(query.trim().toLowerCase()));

  const apply = (record: MediaTrackingRecord, action: MediaTrackingManagementAction) => {
    const result = manageMediaTrackingEntry({
      identityId: record.identityId,
      identityPartition: record.contentType,
      contentType: record.contentType,
    }, action);
    if (result.ok) {
      setDocument(result.value);
      setMessage(t('trackingMgmt.saved'));
    } else setMessage(t('trackingMgmt.rejected', { reason: REJECTION_KEY[result.reason] ? t(REJECTION_KEY[result.reason]) : result.reason }));
  };

  return (
    <SettingsCard id="media-tracking-manager" title={t('trackingMgmt.title')} description={t('trackingMgmt.description')}>
      <div className="field-row">
        <label htmlFor="tracking-management-filter">{t('trackingMgmt.find')}</label>
        <input id="tracking-management-filter" type="search" value={query} onChange={(event) => setQuery(event.currentTarget.value)} placeholder={t('trackingMgmt.findPlaceholder')} />
      </div>
      {records.length === 0 && <p className="muted">{t('trackingMgmt.noMatches')}</p>}
      <div className="tracking-management-list">
        {records.map((record) => <TrackingRecordEditor key={record.identityId} record={record} apply={apply} remove={() => {
          setDocument(removeMediaTrackingEntry(record.identityId));
          setMessage(t('trackingMgmt.removed'));
        }} />)}
      </div>
      {message && <p className="form-msg" role="status">{message}</p>}
      <p className="muted">{t('trackingMgmt.offlineNote')}</p>
    </SettingsCard>
  );
}

function TrackingRecordEditor({ record, apply, remove }: {
  record: MediaTrackingRecord;
  apply: (record: MediaTrackingRecord, action: MediaTrackingManagementAction) => void;
  remove: () => void;
}) {
  const { t } = useT();
  const target = (action: MediaTrackingManagementAction) => apply(record, action);
  const updateMark = (from: MediaEpisodeMark, field: keyof MediaEpisodeMark, value: number) => target({ type: 'episode/replace', from, to: { ...from, [field]: value } });
  return (
    <fieldset className="tracking-management-record" data-identity-partition={record.contentType}>
      <legend>{record.identityId}</legend>
      <small className="muted">{t('trackingMgmt.partition', { type: record.contentType })}</small>
      <div className="tracking-management-grid">
        <label>{t('trackingMgmt.statusLabel')}<select value={record.status} onChange={(event) => target({ type: 'details/set', status: event.currentTarget.value as MediaTrackingStatus })}>{STATUSES.map((status) => <option key={status} value={status}>{t(STATUS_KEY[status])}</option>)}</select></label>
        <label>{t('trackingMgmt.rating')}<input type="number" min="0" max="100" value={record.rating ?? ''} onChange={(event) => target({ type: 'details/set', rating: optionalNumber(event.currentTarget.value) })} /></label>
        <label><input type="checkbox" checked={record.favorite} onChange={(event) => target({ type: 'details/set', favorite: event.currentTarget.checked })} /> {t('trackingMgmt.favorite')}</label>
        <label>{t('trackingMgmt.audioLanguage')}<input value={record.preferences.audioLanguage ?? ''} onChange={(event) => target({ type: 'details/set', preferences: { audioLanguage: event.currentTarget.value || null } })} /></label>
        <label>{t('trackingMgmt.subtitleLanguage')}<input value={record.preferences.subtitleLanguage ?? ''} onChange={(event) => target({ type: 'details/set', preferences: { subtitleLanguage: event.currentTarget.value || null } })} /></label>
        <label>{t('trackingMgmt.secondarySubtitles')}<input value={record.preferences.secondarySubtitleLanguage ?? ''} onChange={(event) => target({ type: 'details/set', preferences: { secondarySubtitleLanguage: event.currentTarget.value || null } })} /></label>
        <label>{t('trackingMgmt.subtitleStyle')}<select value={record.preferences.subtitleStyle} onChange={(event) => target({ type: 'details/set', preferences: { subtitleStyle: event.currentTarget.value as 'full' | 'signs-songs' | 'forced' } })}><option value="full">{t('trackingMgmt.style.full')}</option><option value="signs-songs">{t('trackingMgmt.style.signs-songs')}</option><option value="forced">{t('trackingMgmt.style.forced')}</option></select></label>
      </div>
      <label className="tracking-management-notes">{t('trackingMgmt.notes')}<textarea value={record.notes} maxLength={2000} onChange={(event) => target({ type: 'details/set', notes: event.currentTarget.value })} /></label>
      {record.progress.kind === 'unit' ? (
        <label><input type="checkbox" checked={record.progress.watched} onChange={(event) => target({ type: 'unit/set', watched: event.currentTarget.checked })} /> {t('trackingMgmt.watched')}</label>
      ) : (
        <>
          <div className="tracking-management-grid">
            <label>{t('trackingMgmt.totalEpisodes')}<input type="number" min="0" value={record.progress.totalEpisodes ?? ''} onChange={(event) => target({ type: 'totals/set', totalEpisodes: optionalNumber(event.currentTarget.value), totalSeasons: record.progress.kind === 'episodic' ? record.progress.totalSeasons : null })} /></label>
            <label>{t('trackingMgmt.totalSeasons')}<input type="number" min="0" value={record.progress.totalSeasons ?? ''} onChange={(event) => target({ type: 'totals/set', totalEpisodes: record.progress.kind === 'episodic' ? record.progress.totalEpisodes : null, totalSeasons: optionalNumber(event.currentTarget.value) })} /></label>
          </div>
          <div className="tracking-management-marks">
            {record.progress.watchedEpisodes.map((mark) => <div key={`${mark.season}-${mark.episode}`} className="sp-seg">
              <label>{t('trackingMgmt.season')}<input aria-label={t('trackingMgmt.seasonAria', { episode: mark.episode })} type="number" min="0" value={mark.season} onChange={(event) => updateMark(mark, 'season', Number(event.currentTarget.value))} /></label>
              <label>{t('trackingMgmt.episode')}<input aria-label={t('trackingMgmt.episodeAria', { episode: mark.episode })} type="number" min="1" value={mark.episode} onChange={(event) => updateMark(mark, 'episode', Number(event.currentTarget.value))} /></label>
              <button type="button" className="btn" onClick={() => target({ type: 'episode/remove', mark })}>{t('trackingMgmt.removeMark')}</button>
            </div>)}
            <button type="button" className="btn" onClick={() => target({ type: 'episode/add', mark: { season: 1, episode: 1 } })}>{t('trackingMgmt.addMark')}</button>
          </div>
        </>
      )}
      <button type="button" className="btn" onClick={remove}>{t('trackingMgmt.removeEntry')}</button>
    </fieldset>
  );
}
