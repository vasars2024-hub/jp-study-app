import { useEffect, useMemo, useState } from 'react';
import type { AgentToolId } from '../../../shared/localAgent';
import { getActiveAgentProfile, type AgentProfile } from '../../../shared/localAgentProfiles';
import type { LocalAgentSettings } from '../../../shared/localAgentSettings';
import {
  agentCapabilityOperationLabelKey,
  buildAgentCapabilityDirectory,
  type AgentCapabilityDirectoryRow,
} from '../../agentCapabilityDirectory';
import {
  agentToolCapabilityMatrix,
  createCentralAgentToolRegistry,
  type AgentToolCapability,
} from '../../agentToolRegistry';
import {
  loadLocalAgentProfiles,
  onLocalAgentProfilesChanged,
} from '../../localAgentProfilesStore';
import {
  loadLocalAgentSettings,
  onLocalAgentSettingsChanged,
} from '../../localAgentSettingsStore';
import { useT } from '../../i18n';
import './agentCapabilityDirectory.css';

type CapabilityFilter = 'all' | 'available' | 'unavailable';

const TOOL_ORDER: readonly AgentToolId[] = [
  'media',
  'anime',
  'visual-novel',
  'flashcard',
  'study',
  'dictionary',
  'calendar',
  'settings',
];

export interface AgentCapabilityDirectoryProps {
  /** Optional snapshots make the view independently testable. Omit them in the live shell. */
  capabilities?: readonly AgentToolCapability[];
  settings?: LocalAgentSettings;
  profile?: AgentProfile;
}

function filterRows(
  rows: readonly AgentCapabilityDirectoryRow[],
  filter: CapabilityFilter,
): AgentCapabilityDirectoryRow[] {
  if (filter === 'available') return rows.filter((row) => row.available);
  if (filter === 'unavailable') return rows.filter((row) => !row.available);
  return [...rows];
}

export function AgentCapabilityDirectory({
  capabilities: capabilitySnapshot,
  settings: settingsSnapshot,
  profile: profileSnapshot,
}: AgentCapabilityDirectoryProps = {}) {
  const { t, lang } = useT();
  const [filter, setFilter] = useState<CapabilityFilter>('all');
  const [liveSettings, setLiveSettings] = useState(loadLocalAgentSettings);
  const [liveProfile, setLiveProfile] = useState(() => getActiveAgentProfile(loadLocalAgentProfiles()));

  useEffect(() => onLocalAgentSettingsChanged(setLiveSettings), []);
  useEffect(() => onLocalAgentProfilesChanged((store) => setLiveProfile(getActiveAgentProfile(store))), []);

  const derivedCapabilities = useMemo(() => (
    capabilitySnapshot ?? agentToolCapabilityMatrix(createCentralAgentToolRegistry(t))
  ), [capabilitySnapshot, lang, t]);
  const settings = settingsSnapshot ?? liveSettings;
  const profile = profileSnapshot ?? liveProfile;
  const rows = useMemo(
    () => buildAgentCapabilityDirectory(derivedCapabilities, settings, profile),
    [derivedCapabilities, profile, settings],
  );
  const visibleRows = filterRows(rows, filter);
  const availableCount = rows.filter((row) => row.available).length;
  const unavailableCount = rows.length - availableCount;

  return (
    <section className="agent-capability-directory" aria-labelledby="agent-capability-title">
      <div className="agent-capability-heading">
        <div>
          <h3 id="agent-capability-title" className="agent-subheading">
            {t('agent.capabilities.title')}
          </h3>
          <p>{t('agent.capabilities.profile', { name: profile.name })}</p>
        </div>
        <span className="agent-capability-total">
          {t('agent.capabilities.summary', {
            available: availableCount,
            unavailable: unavailableCount,
          })}
        </span>
      </div>

      <div className="agent-capability-filters" role="group" aria-label={t('agent.capabilities.filter.label')}>
        {(['all', 'available', 'unavailable'] as const).map((value) => (
          <button
            key={value}
            type="button"
            className={`agent-capability-filter${filter === value ? ' is-selected' : ''}`}
            aria-pressed={filter === value}
            onClick={() => setFilter(value)}
          >
            {t(`agent.capabilities.filter.${value}`)}
          </button>
        ))}
      </div>

      <div className="agent-capability-groups">
        {TOOL_ORDER.map((tool) => {
          const operations = visibleRows.filter((row) => row.tool === tool);
          if (!operations.length) return null;
          return (
            <details key={tool} className="agent-capability-group" open>
              <summary>
                <span>{t(`agent.capabilities.category.${tool}`)}</span>
                <span>{operations.length}</span>
              </summary>
              <ul>
                {operations.map((row) => (
                  <li key={row.id} className={row.available ? 'is-available' : 'is-unavailable'}>
                    <div className="agent-capability-operation">
                      <strong>{t(agentCapabilityOperationLabelKey(row.id))}</strong>
                      <code>{row.id}</code>
                    </div>
                    <dl>
                      <div>
                        <dt>{t('agent.capabilities.availability')}</dt>
                        <dd className="agent-capability-status">
                          <span aria-hidden="true" />
                          {t(`agent.capabilities.reason.${row.reason}`)}
                        </dd>
                      </div>
                      <div>
                        <dt>{t('agent.capabilities.permission')}</dt>
                        <dd>{t(`agent.capabilities.permission.${row.minimumPermission}`)}</dd>
                      </div>
                      <div>
                        <dt>{t('agent.capabilities.confirmation')}</dt>
                        <dd>
                          {row.confirmation
                            ? t(`agent.capabilities.confirmation.${row.confirmation}`)
                            : t('agent.capabilities.confirmation.none')}
                        </dd>
                      </div>
                    </dl>
                  </li>
                ))}
              </ul>
            </details>
          );
        })}
      </div>
    </section>
  );
}

