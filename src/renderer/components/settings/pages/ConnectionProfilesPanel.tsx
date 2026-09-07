import { useEffect, useMemo, useState } from 'react';
import { useT } from '../../../i18n';
import { LANG_TAGS } from '../../../../shared/i18n/core';
import SettingsCard from '../SettingsCard';
import {
  CONNECTION_ERROR_CATEGORIES,
  CONNECTION_LOG_CHANNELS,
  CONNECTION_LOG_LEVELS,
  CONNECTION_PRESET_IDS,
  CONNECTION_PROFILE_ICONS,
  applyConnectionPreset,
  assignSiteProfile,
  cancelConnectionJob,
  clearConnectionLogs,
  clearFinishedConnectionJobs,
  clearSiteProfile,
  cloneConnectionProfile,
  compareConnectionProfiles,
  connectionInheritanceChain,
  deleteConnectionProfile,
  diagnoseConnectionProfile,
  enqueueConnectionJob,
  exportConnectionLogs,
  filterConnectionLogs,
  findConnectionProfile,
  profilePerformance,
  requestHistoryFor,
  rollbackConnectionProfile,
  setActiveConnectionProfile,
  setConnectionDebugMode,
  setConnectionJobPriority,
  setConnectionProfileParent,
  setConnectionQueueConcurrency,
  setConnectionQueuePaused,
  updateConnectionProfileDetails,
  type ConnectionLogChannel,
  type ConnectionLogLevel,
  type ConnectionPresetId,
  type ConnectionProfileIcon,
  type ConnectionProfilesDocument,
} from '../../../../shared/connectionProfiles';
import {
  exportConnectionProfilesJson,
  importConnectionProfilesJson,
  loadConnectionProfilesDocument,
  nextConnectionId,
  nowIso,
  onConnectionProfilesChanged,
  saveConnectionProfilesDocument,
} from '../../../connectionProfilesStore';

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export default function ConnectionProfilesPanel() {
  const { t, lang } = useT();
  const [document, setDocument] = useState<ConnectionProfilesDocument>(loadConnectionProfilesDocument);
  const [message, setMessage] = useState<string | null>(null);
  const [cloneName, setCloneName] = useState('');
  const [siteInput, setSiteInput] = useState('');
  const [compareWith, setCompareWith] = useState('');
  const [channel, setChannel] = useState<ConnectionLogChannel | ''>('');
  const [level, setLevel] = useState<ConnectionLogLevel>('debug');
  const [jobSite, setJobSite] = useState('');
  const [portableJson, setPortableJson] = useState('');

  useEffect(() => onConnectionProfilesChanged(setDocument), []);

  const active = findConnectionProfile(document, document.activeProfileId) ?? document.profiles[0];
  const performance = useMemo(
    () => (active ? profilePerformance(document, active.id) : null),
    [document, active],
  );
  const diagnostics = useMemo(
    () => (active ? diagnoseConnectionProfile(document, active.id) : null),
    [document, active],
  );
  const differences = useMemo(
    () => (active && compareWith && findConnectionProfile(document, compareWith)
      ? compareConnectionProfiles(document, active.id, compareWith)
      : []),
    [document, active, compareWith],
  );
  const logs = useMemo(
    () => filterConnectionLogs(document, { channel: channel || undefined, level }).slice(-40).reverse(),
    [document, channel, level],
  );
  // Deliberately not memoized. `t`'s identity is stable by design, so a memo keyed on
  // it would go stale after a language switch; `useT()` already re-renders this
  // component on a switch, so resolving at render time is both simpler and correct.
  const presetLabel = (preset: ConnectionPresetId) => t(`connection.preset.${preset}`);

  if (!active || !performance || !diagnostics) return null;

  const commit = (next: ConnectionProfilesDocument, note?: string) => {
    setMessage(note ?? null);
    setDocument(saveConnectionProfilesDocument(next));
  };
  const guard = (run: () => ConnectionProfilesDocument, note?: string) => {
    try {
      commit(run(), note);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t('connection.error.generic'));
    }
  };
  const chain = connectionInheritanceChain(document, active.id);
  const profileName = (profile: { id: string; name: string; builtIn: boolean }) =>
    (profile.builtIn ? presetLabel(profile.id as ConnectionPresetId) : profile.name);

  return (
    <>
      <SettingsCard
        id="connection-profiles"
        title={t('connection.title')}
        description={t('connection.desc')}
        trailing={<span className="os-set-adv-badge">{presetLabel(active.preset)}</span>}
      >
        <div className="field-row">
          <label htmlFor="connection-active">{t('connection.active')}</label>
          <select
            id="connection-active"
            className="media-model-select"
            value={active.id}
            onChange={(event) => guard(() => setActiveConnectionProfile(document, event.currentTarget.value))}
          >
            {document.profiles.map((profile) => (
              <option key={profile.id} value={profile.id}>{profileName(profile)}</option>
            ))}
          </select>
        </div>

        <div className="sp-seg" role="group" aria-label={t('connection.presets')}>
          {CONNECTION_PRESET_IDS.map((preset) => (
            <button
              key={preset}
              type="button"
              className={`sp-seg-btn ${active.preset === preset ? 'active' : ''}`}
              aria-pressed={active.preset === preset}
              onClick={() => guard(
                () => applyConnectionPreset(document, active.id, preset, {
                  now: nowIso(),
                  versionId: nextConnectionId('v'),
                }),
                t('connection.msg.presetApplied'),
              )}
            >
              {presetLabel(preset)}
            </button>
          ))}
        </div>

        <div className="field-row">
          <label htmlFor="connection-name">{t('connection.name')}</label>
          <input
            key={active.id}
            id="connection-name"
            defaultValue={profileName(active)}
            onBlur={(event) => guard(
              () => updateConnectionProfileDetails(document, active.id, { name: event.currentTarget.value }, nowIso()),
            )}
          />
        </div>
        <div className="field-row">
          <label htmlFor="connection-description">{t('connection.description')}</label>
          <input
            id="connection-description"
            value={active.description}
            onChange={(event) => guard(
              () => updateConnectionProfileDetails(document, active.id, { description: event.currentTarget.value }, nowIso()),
            )}
          />
        </div>
        <div className="field-row">
          <label htmlFor="connection-icon">{t('connection.icon')}</label>
          <select
            id="connection-icon"
            className="media-model-select"
            value={active.icon}
            onChange={(event) => guard(() => updateConnectionProfileDetails(
              document,
              active.id,
              { icon: event.currentTarget.value as ConnectionProfileIcon },
              nowIso(),
            ))}
          >
            {CONNECTION_PROFILE_ICONS.map((icon) => (
              <option key={icon} value={icon}>{t(`connection.icon.${icon}`)}</option>
            ))}
          </select>
        </div>
        <div className="field-row">
          <label htmlFor="connection-tags">{t('connection.tags')}</label>
          <input
            id="connection-tags"
            key={`${active.id}-tags`}
            defaultValue={active.tags.join(', ')}
            placeholder={t('connection.tagsPlaceholder')}
            onBlur={(event) => guard(() => updateConnectionProfileDetails(
              document,
              active.id,
              { tags: event.currentTarget.value.split(',').map((tag) => tag.trim()).filter(Boolean) },
              nowIso(),
            ))}
          />
        </div>

        <div className="field-row">
          <label htmlFor="connection-parent">{t('connection.inheritsFrom')}</label>
          <select
            id="connection-parent"
            className="media-model-select"
            value={active.inheritsFrom ?? ''}
            onChange={(event) => guard(() => setConnectionProfileParent(
              document,
              active.id,
              event.currentTarget.value || null,
              nowIso(),
            ))}
          >
            <option value="">{t('connection.inheritsFromNone')}</option>
            {document.profiles
              .filter((profile) => profile.id !== active.id)
              .map((profile) => (
                <option key={profile.id} value={profile.id}>{profileName(profile)}</option>
              ))}
          </select>
          <small className="muted">
            {t('connection.chain', { chain: chain.map(profileName).join(' → ') })}
          </small>
        </div>

        <div className="field-row">
          <label htmlFor="connection-clone-name">{t('connection.cloneName')}</label>
          <input
            id="connection-clone-name"
            value={cloneName}
            placeholder={t('connection.cloneNamePlaceholder')}
            onChange={(event) => setCloneName(event.currentTarget.value)}
          />
          <button
            type="button"
            onClick={() => guard(() => {
              const next = cloneConnectionProfile(document, active.id, {
                id: nextConnectionId('profile'),
                name: cloneName,
                now: nowIso(),
              });
              setCloneName('');
              return next;
            }, t('connection.msg.cloned'))}
          >
            {t('connection.clone')}
          </button>
          <button
            type="button"
            onClick={() => guard(() => {
              const next = cloneConnectionProfile(document, active.id, {
                id: nextConnectionId('profile'),
                name: cloneName,
                now: nowIso(),
                inherit: true,
              });
              setCloneName('');
              return next;
            }, t('connection.msg.clonedInherit'))}
          >
            {t('connection.cloneInherit')}
          </button>
        </div>

        <div className="field-row">
          <label htmlFor="connection-health">{t('connection.healthInterval')}</label>
          <input
            id="connection-health"
            type="number"
            min={0}
            max={10080}
            value={active.healthCheckIntervalMinutes}
            onChange={(event) => {
              const value = Number(event.currentTarget.value);
              if (!Number.isFinite(value)) return;
              guard(() => updateConnectionProfileDetails(
                document,
                active.id,
                { healthCheckIntervalMinutes: value },
                nowIso(),
              ));
            }}
          />
          <small className="muted">{t('connection.healthIntervalHint')}</small>
        </div>

        <div className="sp-seg" role="group" aria-label={t('connection.profileActions')}>
          <button
            type="button"
            className="sp-seg-btn"
            disabled={active.builtIn}
            onClick={() => guard(() => deleteConnectionProfile(document, active.id), t('connection.msg.deleted'))}
          >
            {t('connection.delete')}
          </button>
        </div>
        {active.builtIn && <p className="muted">{t('connection.builtInNote')}</p>}
        {message && <p className="form-msg" role="status">{message}</p>}
      </SettingsCard>

      <SettingsCard
        id="connection-monitoring"
        title={t('connection.monitoring')}
        description={t('connection.monitoringDesc')}
        trailing={<span className="os-set-adv-badge">{t(`connection.grade.${diagnostics.grade}`)}</span>}
      >
        <div className="field-row">
          <span>
            <strong>{t('connection.quality')}</strong>
            <small className="muted">{t('connection.qualityDesc')}</small>
          </span>
          <span>{diagnostics.connectionQuality}</span>
        </div>
        <div className="field-row">
          <span><strong>{t('connection.parsing')}</strong></span>
          <span>{diagnostics.parsingSuccess}</span>
        </div>
        <div className="field-row">
          <span><strong>{t('connection.cacheEfficiency')}</strong></span>
          <span>{diagnostics.cacheEfficiency}</span>
        </div>
        <div className="field-row">
          <span><strong>{t('connection.successRate')}</strong></span>
          <span>{percent(performance.successRate)} · {t('connection.attemptsCount', { count: performance.attempts })}</span>
        </div>
        <div className="field-row">
          <span><strong>{t('connection.response')}</strong></span>
          <span>{performance.averageResponseMs} / {performance.p50ResponseMs} / {performance.p95ResponseMs} ms</span>
        </div>
        <div className="field-row">
          <span><strong>{t('connection.lastSuccess')}</strong></span>
          <span>
            {performance.lastSuccessAt
              ? new Date(performance.lastSuccessAt).toLocaleString(LANG_TAGS[lang])
              : t('connection.never')}
          </span>
        </div>
        <ul className="muted">
          {diagnostics.notes.map((note) => <li key={note}>{t(`connection.note.${note}`)}</li>)}
        </ul>
        {performance.topErrors.length > 0 && (
          <div className="field-row">
            <span><strong>{t('connection.errorCategories')}</strong></span>
            <span>
              {performance.topErrors
                .map((entry) => `${t(`connection.error.${entry.category}`)} ${entry.count}`)
                .join(' · ')}
            </span>
          </div>
        )}
        {requestHistoryFor(document, active.id, 8).map((entry) => (
          <div className="field-row" key={entry.id}>
            <span>
              <strong>{entry.site || t('connection.unknownSite')}</strong>
              <small className="muted">
                {new Date(entry.startedAt).toLocaleString(LANG_TAGS[lang])} · {entry.durationMs} ms
                {entry.fromCache ? ` · ${t('connection.cached')}` : ''}
              </small>
            </span>
            <span>
              {entry.outcome === 'success'
                ? t('connection.outcome.success')
                : t(`connection.error.${entry.errorCategory ?? 'unknown'}`)}
            </span>
          </div>
        ))}
        {performance.attempts === 0 && <p className="muted">{t('connection.noAttempts')}</p>}
      </SettingsCard>

      <SettingsCard
        id="connection-compare"
        title={t('connection.compare')}
        description={t('connection.compareDesc')}
      >
        <div className="field-row">
          <label htmlFor="connection-compare-with">{t('connection.compareWith')}</label>
          <select
            id="connection-compare-with"
            className="media-model-select"
            value={compareWith}
            onChange={(event) => setCompareWith(event.currentTarget.value)}
          >
            <option value="">{t('connection.compareNone')}</option>
            {document.profiles
              .filter((profile) => profile.id !== active.id)
              .map((profile) => (
                <option key={profile.id} value={profile.id}>{profileName(profile)}</option>
              ))}
          </select>
        </div>
        {compareWith && differences.length === 0 && <p className="muted">{t('connection.compareIdentical')}</p>}
        {differences.map((difference) => (
          <div className="field-row" key={difference.path}>
            <span><strong>{difference.path}</strong></span>
            <span>{JSON.stringify(difference.left)} → {JSON.stringify(difference.right)}</span>
          </div>
        ))}
      </SettingsCard>

      <SettingsCard
        id="connection-sites"
        title={t('connection.sites')}
        description={t('connection.sitesDesc')}
      >
        <div className="field-row">
          <label htmlFor="connection-site">{t('connection.siteHost')}</label>
          <input
            id="connection-site"
            value={siteInput}
            placeholder="example.org"
            spellCheck={false}
            onChange={(event) => setSiteInput(event.currentTarget.value)}
          />
          <button
            type="button"
            onClick={() => guard(() => {
              const next = assignSiteProfile(document, siteInput, active.id);
              setSiteInput('');
              return next;
            }, t('connection.msg.siteAssigned'))}
          >
            {t('connection.assignSite')}
          </button>
        </div>
        {Object.entries(document.siteAssignments).length === 0 && (
          <p className="muted">{t('connection.noSites')}</p>
        )}
        {Object.entries(document.siteAssignments).map(([site, profileId]) => {
          const profile = findConnectionProfile(document, profileId);
          return (
            <div className="field-row" key={site}>
              <span>
                <strong>{site}</strong>
                <small className="muted">{profile ? profileName(profile) : profileId}</small>
              </span>
              <button type="button" onClick={() => guard(() => clearSiteProfile(document, site))}>
                {t('connection.removeSite')}
              </button>
            </div>
          );
        })}
      </SettingsCard>

      <SettingsCard
        id="connection-queue"
        title={t('connection.queue')}
        description={t('connection.queueDesc')}
        trailing={(
          <span className="os-set-adv-badge">
            {document.queue.paused ? t('connection.queuePaused') : t('connection.queueRunning')}
          </span>
        )}
      >
        <label className="os-set-toggle-row">
          <span>
            <strong>{t('connection.pauseQueue')}</strong>
            <small className="muted">{t('connection.pauseQueueDesc')}</small>
          </span>
          <input
            type="checkbox"
            checked={document.queue.paused}
            onChange={(event) => commit(setConnectionQueuePaused(document, event.currentTarget.checked))}
          />
        </label>
        <div className="field-row">
          <label htmlFor="connection-concurrency">{t('connection.concurrency')}</label>
          <input
            id="connection-concurrency"
            type="number"
            min={1}
            max={16}
            value={document.queue.concurrency}
            onChange={(event) => {
              const value = Number(event.currentTarget.value);
              if (Number.isFinite(value)) commit(setConnectionQueueConcurrency(document, value));
            }}
          />
        </div>
        <div className="field-row">
          <label htmlFor="connection-job-site">{t('connection.enqueue')}</label>
          <input
            id="connection-job-site"
            value={jobSite}
            placeholder="example.org"
            spellCheck={false}
            onChange={(event) => setJobSite(event.currentTarget.value)}
          />
          <button
            type="button"
            disabled={!jobSite.trim()}
            onClick={() => guard(() => {
              const next = enqueueConnectionJob(
                document,
                { id: nextConnectionId('job'), profileId: active.id, site: jobSite, label: jobSite },
                nowIso(),
              );
              setJobSite('');
              return next;
            }, t('connection.msg.queued'))}
          >
            {t('connection.enqueueAction')}
          </button>
        </div>
        {document.queue.items.length === 0 && <p className="muted">{t('connection.queueEmpty')}</p>}
        {document.queue.items.map((item) => (
          <div className="field-row" key={item.id}>
            <span>
              <strong>{item.label || item.site}</strong>
              <small className="muted">
                {t(`connection.jobState.${item.state}`)} · {t('connection.priority')} {item.priority}
              </small>
            </span>
            <button
              type="button"
              onClick={() => guard(() => setConnectionJobPriority(document, item.id, item.priority + 1))}
            >
              {t('connection.raisePriority')}
            </button>
            <button type="button" onClick={() => guard(() => cancelConnectionJob(document, item.id, nowIso()))}>
              {t('connection.cancelJob')}
            </button>
          </div>
        ))}
        {document.queue.items.length > 0 && (
          <button type="button" className="btn" onClick={() => commit(clearFinishedConnectionJobs(document))}>
            {t('connection.clearFinished')}
          </button>
        )}
      </SettingsCard>

      <SettingsCard
        id="connection-logs"
        title={t('connection.logs')}
        description={t('connection.logsDesc')}
      >
        <label className="os-set-toggle-row">
          <span>
            <strong>{t('connection.debugMode')}</strong>
            <small className="muted">{t('connection.debugModeDesc')}</small>
          </span>
          <input
            type="checkbox"
            checked={document.debugMode}
            onChange={(event) => commit(setConnectionDebugMode(document, event.currentTarget.checked))}
          />
        </label>
        <div className="field-row">
          <label htmlFor="connection-log-channel">{t('connection.logChannel')}</label>
          <select
            id="connection-log-channel"
            className="media-model-select"
            value={channel}
            onChange={(event) => setChannel(event.currentTarget.value as ConnectionLogChannel | '')}
          >
            <option value="">{t('connection.logChannelAll')}</option>
            {CONNECTION_LOG_CHANNELS.map((entry) => (
              <option key={entry} value={entry}>{t(`connection.logChannel.${entry}`)}</option>
            ))}
          </select>
        </div>
        <div className="field-row">
          <label htmlFor="connection-log-level">{t('connection.logLevel')}</label>
          <select
            id="connection-log-level"
            className="media-model-select"
            value={level}
            onChange={(event) => setLevel(event.currentTarget.value as ConnectionLogLevel)}
          >
            {CONNECTION_LOG_LEVELS.map((entry) => (
              <option key={entry} value={entry}>{t(`connection.logLevel.${entry}`)}</option>
            ))}
          </select>
        </div>
        {logs.length === 0 && <p className="muted">{t('connection.noLogs')}</p>}
        {logs.map((entry) => (
          <div className="field-row" key={entry.id}>
            <span>
              <strong>{entry.code}</strong>
              <small className="muted">
                {new Date(entry.at).toLocaleString(LANG_TAGS[lang])} · {t(`connection.logChannel.${entry.channel}`)}
                {entry.durationMs !== null ? ` · ${entry.durationMs} ms` : ''}
              </small>
            </span>
            <span>{t(`connection.logLevel.${entry.level}`)}</span>
          </div>
        ))}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn"
            onClick={() => {
              setPortableJson(exportConnectionLogs(document, { channel: channel || undefined, level }));
              setMessage(t('connection.msg.logsExported'));
            }}
          >
            {t('connection.exportLogs')}
          </button>
          <button type="button" className="btn" onClick={() => commit(clearConnectionLogs(document))}>
            {t('connection.clearLogs')}
          </button>
        </div>
      </SettingsCard>

      <SettingsCard
        id="connection-history"
        title={t('connection.versions')}
        description={t('connection.versionsDesc')}
      >
        {active.history.length === 0 && <p className="muted">{t('connection.noVersions')}</p>}
        {active.history.map((version) => (
          <div className="field-row" key={version.id}>
            <span>
              <strong>{t(`connection.reason.${version.reason}`)}</strong>
              <small className="muted">
                {new Date(version.createdAt).toLocaleString(LANG_TAGS[lang])} · {presetLabel(version.preset)}
              </small>
            </span>
            <button
              type="button"
              className="btn"
              onClick={() => guard(
                () => rollbackConnectionProfile(document, active.id, version.id, {
                  now: nowIso(),
                  versionId: nextConnectionId('v'),
                }),
                t('connection.msg.restored'),
              )}
            >
              {t('connection.restore')}
            </button>
          </div>
        ))}
      </SettingsCard>

      <SettingsCard
        id="connection-portability"
        title={t('connection.portability')}
        description={t('connection.portabilityDesc')}
      >
        <div className="field-row">
          <label htmlFor="connection-json">{t('connection.json')}</label>
          <textarea
            id="connection-json"
            value={portableJson}
            spellCheck={false}
            placeholder={t('connection.jsonPlaceholder')}
            onChange={(event) => setPortableJson(event.currentTarget.value)}
            style={{ minHeight: 140 }}
          />
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn"
            onClick={() => {
              setPortableJson(exportConnectionProfilesJson(document));
              setMessage(t('connection.msg.exported'));
            }}
          >
            {t('connection.export')}
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={!portableJson.trim()}
            onClick={() => {
              try {
                const result = importConnectionProfilesJson(portableJson);
                setDocument(result.document);
                setMessage(result.issues.length
                  ? t('connection.msg.importedWithIssues', { count: result.issues.length })
                  : t('connection.msg.imported'));
              } catch (error) {
                setMessage(error instanceof Error ? error.message : t('connection.error.generic'));
              }
            }}
          >
            {t('connection.import')}
          </button>
        </div>
        <p className="muted">{t('connection.exportNote')}</p>
        {/* Error categories are listed so the vocabulary the logs use is discoverable
            without waiting for each failure kind to happen. */}
        <p className="muted">
          {CONNECTION_ERROR_CATEGORIES.map((category) => t(`connection.error.${category}`)).join(' · ')}
        </p>
      </SettingsCard>
    </>
  );
}
