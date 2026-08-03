import { useState } from 'react';
import type { MediaEpisodeMark, MediaTrackingDocument, MediaTrackingRecord, MediaTrackingStatus } from '../../../../shared/mediaTracking';
import type { MediaTrackingManagementAction } from '../../../../shared/mediaTrackingManagement';
import { loadMediaTrackingDocument, manageMediaTrackingEntry, removeMediaTrackingEntry } from '../../../mediaTrackingStore';
import SettingsCard from '../SettingsCard';

const STATUSES: MediaTrackingStatus[] = ['planned', 'watching', 'completed', 'on-hold', 'dropped'];

function optionalNumber(value: string): number | null {
  return value.trim() === '' ? null : Number(value);
}

export default function MediaTrackingManager() {
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
      setMessage('Tracking changes saved locally.');
    } else setMessage(`Change rejected: ${result.reason}.`);
  };

  return (
    <SettingsCard id="media-tracking-manager" title="Tracking management" description="Correct local progress, totals, ratings, notes, favorites, and playback-language preferences.">
      <div className="field-row">
        <label htmlFor="tracking-management-filter">Find tracked identity</label>
        <input id="tracking-management-filter" type="search" value={query} onChange={(event) => setQuery(event.currentTarget.value)} placeholder="Identity ID" />
      </div>
      {records.length === 0 && <p className="muted">No matching tracked titles.</p>}
      <div className="tracking-management-list">
        {records.map((record) => <TrackingRecordEditor key={record.identityId} record={record} apply={apply} remove={() => {
          setDocument(removeMediaTrackingEntry(record.identityId));
          setMessage('Tracking entry removed locally.');
        }} />)}
      </div>
      {message && <p className="form-msg" role="status">{message}</p>}
      <p className="muted">Offline only. This surface does not contact or execute media providers.</p>
    </SettingsCard>
  );
}

function TrackingRecordEditor({ record, apply, remove }: {
  record: MediaTrackingRecord;
  apply: (record: MediaTrackingRecord, action: MediaTrackingManagementAction) => void;
  remove: () => void;
}) {
  const target = (action: MediaTrackingManagementAction) => apply(record, action);
  const updateMark = (from: MediaEpisodeMark, field: keyof MediaEpisodeMark, value: number) => target({ type: 'episode/replace', from, to: { ...from, [field]: value } });
  return (
    <fieldset className="tracking-management-record" data-identity-partition={record.contentType}>
      <legend>{record.identityId}</legend>
      <small className="muted">{record.contentType} partition</small>
      <div className="tracking-management-grid">
        <label>Status<select value={record.status} onChange={(event) => target({ type: 'details/set', status: event.currentTarget.value as MediaTrackingStatus })}>{STATUSES.map((status) => <option key={status}>{status}</option>)}</select></label>
        <label>Rating (0–100)<input type="number" min="0" max="100" value={record.rating ?? ''} onChange={(event) => target({ type: 'details/set', rating: optionalNumber(event.currentTarget.value) })} /></label>
        <label><input type="checkbox" checked={record.favorite} onChange={(event) => target({ type: 'details/set', favorite: event.currentTarget.checked })} /> Favorite</label>
        <label>Audio language<input value={record.preferences.audioLanguage ?? ''} onChange={(event) => target({ type: 'details/set', preferences: { audioLanguage: event.currentTarget.value || null } })} /></label>
        <label>Subtitle language<input value={record.preferences.subtitleLanguage ?? ''} onChange={(event) => target({ type: 'details/set', preferences: { subtitleLanguage: event.currentTarget.value || null } })} /></label>
        <label>Secondary subtitles<input value={record.preferences.secondarySubtitleLanguage ?? ''} onChange={(event) => target({ type: 'details/set', preferences: { secondarySubtitleLanguage: event.currentTarget.value || null } })} /></label>
        <label>Subtitle style<select value={record.preferences.subtitleStyle} onChange={(event) => target({ type: 'details/set', preferences: { subtitleStyle: event.currentTarget.value as 'full' | 'signs-songs' | 'forced' } })}><option value="full">full</option><option value="signs-songs">signs and songs</option><option value="forced">forced</option></select></label>
      </div>
      <label className="tracking-management-notes">Notes<textarea value={record.notes} maxLength={2000} onChange={(event) => target({ type: 'details/set', notes: event.currentTarget.value })} /></label>
      {record.progress.kind === 'unit' ? (
        <label><input type="checkbox" checked={record.progress.watched} onChange={(event) => target({ type: 'unit/set', watched: event.currentTarget.checked })} /> Watched</label>
      ) : (
        <>
          <div className="tracking-management-grid">
            <label>Total episodes<input type="number" min="0" value={record.progress.totalEpisodes ?? ''} onChange={(event) => target({ type: 'totals/set', totalEpisodes: optionalNumber(event.currentTarget.value), totalSeasons: record.progress.kind === 'episodic' ? record.progress.totalSeasons : null })} /></label>
            <label>Total seasons<input type="number" min="0" value={record.progress.totalSeasons ?? ''} onChange={(event) => target({ type: 'totals/set', totalEpisodes: record.progress.kind === 'episodic' ? record.progress.totalEpisodes : null, totalSeasons: optionalNumber(event.currentTarget.value) })} /></label>
          </div>
          <div className="tracking-management-marks">
            {record.progress.watchedEpisodes.map((mark) => <div key={`${mark.season}-${mark.episode}`} className="sp-seg">
              <label>Season<input aria-label={`Season for episode ${mark.episode}`} type="number" min="0" value={mark.season} onChange={(event) => updateMark(mark, 'season', Number(event.currentTarget.value))} /></label>
              <label>Episode<input aria-label={`Episode ${mark.episode}`} type="number" min="1" value={mark.episode} onChange={(event) => updateMark(mark, 'episode', Number(event.currentTarget.value))} /></label>
              <button type="button" className="btn" onClick={() => target({ type: 'episode/remove', mark })}>Remove mark</button>
            </div>)}
            <button type="button" className="btn" onClick={() => target({ type: 'episode/add', mark: { season: 1, episode: 1 } })}>Add episode mark</button>
          </div>
        </>
      )}
      <button type="button" className="btn" onClick={remove}>Remove tracking entry</button>
    </fieldset>
  );
}
