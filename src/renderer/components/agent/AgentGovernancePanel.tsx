import { useEffect, useMemo, useState } from 'react';
import type { AgentPermissionLevel } from '../../../shared/localAgent';
import {
  effectiveAgentPermission,
  getActiveAgentProfile,
  type AgentProfileStore,
} from '../../../shared/localAgentProfiles';
import type { AgentMemoryCategory } from '../../../shared/localAgentMemory';
import {
  LOCAL_AGENT_CHAT_HISTORY_TURNS,
  LOCAL_AGENT_MEMORY_CATEGORIES,
  type LocalAgentChatHistory,
  type LocalAgentSettings,
} from '../../../shared/localAgentSettings';
import {
  activateLocalAgentProfile,
  loadLocalAgentProfiles,
  onLocalAgentProfilesChanged,
} from '../../localAgentProfilesStore';
import {
  loadLocalAgentSettings,
  onLocalAgentSettingsChanged,
  saveLocalAgentSettings,
} from '../../localAgentSettingsStore';
import { useT } from '../../i18n';
import { AgentContextSuggestionSettings } from './AgentContextSuggestionSettings';
import './agentGovernance.css';

const PERMISSION_LEVELS: readonly AgentPermissionLevel[] = [
  'read-only',
  'limited-actions',
  'full-automation',
];

const CHAT_HISTORY_LEVELS: readonly LocalAgentChatHistory[] = ['off', 'recent', 'full'];

export interface AgentGovernancePanelProps {
  /** Optional snapshots make the panel independently testable. Omit them in the live shell. */
  settings?: LocalAgentSettings;
  store?: AgentProfileStore;
  onSettingsChange?: (settings: LocalAgentSettings) => void;
  onStoreChange?: (store: AgentProfileStore) => void;
}

/**
 * The main app's writer for the Agent's own governance — permission ceiling, active profile and
 * the memory switch.
 *
 * Until this file existed the only writer for `localAgentSettings` or the profile store in the
 * whole repository was `BlancReadyToolPanels`, in Blanc's separate shell. So the app that OWNS the
 * central Agent could read its permission ceiling, its active profile and its memory switch and
 * change none of them, while the capability directory a few pixels away told the user an operation
 * was unavailable for `permission-insufficient` — a reason with no route to resolve it anywhere in
 * this shell. This panel is that route, and it sits next to the directory that names the problem.
 *
 * Two rules the writes rest on:
 *
 *  - **Activating a profile enables it in the same write.** `normalizeAgentProfiles` accepts
 *    `activeProfileId` only when the named profile is `enabled`, and silently falls back to
 *    `study-tutor` otherwise. A picker that wrote `activeProfileId` alone would therefore appear to
 *    switch to a disabled profile and actually switch to a different one — a dead control that
 *    reports success. The option says `(disabled)` before it is chosen and the note says what
 *    choosing it will do, so the enable is disclosed rather than silent.
 *  - **The ceiling is shown next to what it actually resolves to.** The profile caps the global
 *    permission (`effectiveAgentPermission` takes the LOWER of the two), so a user who raises the
 *    ceiling to full automation against a read-only profile has changed nothing that runs. The
 *    effective row states that outcome instead of leaving the ceiling to imply it.
 */
export function AgentGovernancePanel({
  settings: settingsSnapshot,
  store: storeSnapshot,
  onSettingsChange,
  onStoreChange,
}: AgentGovernancePanelProps = {}) {
  const { t } = useT();
  const [liveSettings, setLiveSettings] = useState(loadLocalAgentSettings);
  const [liveStore, setLiveStore] = useState(loadLocalAgentProfiles);

  useEffect(() => onLocalAgentSettingsChanged(setLiveSettings), []);
  useEffect(() => onLocalAgentProfilesChanged(setLiveStore), []);

  const settings = settingsSnapshot ?? liveSettings;
  const store = storeSnapshot ?? liveStore;
  const activeProfile = useMemo(() => getActiveAgentProfile(store), [store]);
  const effectivePermission = effectiveAgentPermission(settings.permission, activeProfile);
  const cappedByProfile = effectivePermission !== settings.permission;

  const writeSettings = (patch: Partial<LocalAgentSettings>): void => {
    const next = saveLocalAgentSettings(patch);
    setLiveSettings(next);
    onSettingsChange?.(next);
  };

  const chooseProfile = (id: string): void => {
    const next = activateLocalAgentProfile(store, id);
    setLiveStore(next);
    onStoreChange?.(next);
  };

  // Written as the full list minus the box, in the canonical order, so the
  // stored scope never depends on the order the user clicked the boxes in.
  const toggleScope = (category: AgentMemoryCategory, included: boolean): void => {
    const chosen = new Set(settings.memoryScope);
    if (included) chosen.add(category);
    else chosen.delete(category);
    writeSettings({
      memoryScope: LOCAL_AGENT_MEMORY_CATEGORIES.filter((entry) => chosen.has(entry)),
    });
  };

  const scopeEmpty = settings.memoryScope.length === 0;

  return (
    <section className="agent-governance" aria-labelledby="agent-governance-title">
      <h3 id="agent-governance-title" className="agent-subheading">
        {t('agent.governance.title')}
      </h3>
      <p className="agent-governance-intro">{t('agent.governance.intro')}</p>

      <div className="agent-governance-field">
        <span className="agent-governance-label" id="agent-governance-permission-label">
          {t('agent.governance.permission.label')}
        </span>
        <div
          className="agent-governance-choices"
          role="group"
          aria-labelledby="agent-governance-permission-label"
        >
          {PERMISSION_LEVELS.map((level) => (
            <button
              key={level}
              type="button"
              data-testid={`agent-governance-permission-${level}`}
              className={`agent-governance-choice${settings.permission === level ? ' is-selected' : ''}`}
              aria-pressed={settings.permission === level}
              onClick={() => writeSettings({ permission: level })}
            >
              {t(`agent.capabilities.permission.${level}`)}
            </button>
          ))}
        </div>
        <p className="agent-governance-note" data-testid="agent-governance-effective">
          {cappedByProfile
            ? t('agent.governance.permission.capped', {
              effective: t(`agent.capabilities.permission.${effectivePermission}`),
              profile: activeProfile.name,
            })
            : t('agent.governance.permission.effective', {
              effective: t(`agent.capabilities.permission.${effectivePermission}`),
            })}
        </p>
      </div>

      <div className="agent-governance-field">
        <label className="agent-governance-label" htmlFor="agent-governance-profile">
          {t('agent.governance.profile.label')}
        </label>
        <select
          id="agent-governance-profile"
          data-testid="agent-governance-profile"
          className="agent-governance-select"
          value={activeProfile.id}
          onChange={(event) => chooseProfile(event.target.value)}
        >
          {store.profiles.map((profile) => (
            <option key={profile.id} value={profile.id}>
              {profile.enabled
                ? profile.name
                : t('agent.governance.profile.disabledOption', { name: profile.name })}
            </option>
          ))}
        </select>
        <p className="agent-governance-note">
          {t('agent.governance.profile.note', {
            permission: t(`agent.capabilities.permission.${activeProfile.permission}`),
          })}
        </p>
      </div>

      <div className="agent-governance-field">
        <label className="agent-governance-switch">
          <input
            type="checkbox"
            data-testid="agent-governance-memory"
            checked={settings.memoryEnabled}
            onChange={(event) => writeSettings({ memoryEnabled: event.target.checked })}
          />
          <span>{t('agent.governance.memory.label')}</span>
        </label>
        <p className="agent-governance-note">{t('agent.governance.memory.note')}</p>

        <div
          className="agent-governance-scope"
          role="group"
          aria-labelledby="agent-governance-scope-label"
        >
          <span className="agent-governance-label" id="agent-governance-scope-label">
            {t('agent.governance.scope.label')}
          </span>
          {LOCAL_AGENT_MEMORY_CATEGORIES.map((category) => (
            <label key={category} className="agent-governance-switch">
              <input
                type="checkbox"
                data-testid={`agent-governance-scope-${category}`}
                disabled={!settings.memoryEnabled}
                checked={settings.memoryScope.includes(category)}
                onChange={(event) => toggleScope(category, event.target.checked)}
              />
              <span>{t(`agent.governance.scope.${category}`)}</span>
            </label>
          ))}
        </div>
        <p className="agent-governance-note" data-testid="agent-governance-scope-note">
          {scopeEmpty
            ? t('agent.governance.scope.none')
            : t('agent.governance.scope.note', { count: settings.memoryScope.length })}
        </p>
      </div>

      <div className="agent-governance-field">
        <span className="agent-governance-label" id="agent-governance-history-label">
          {t('agent.governance.history.label')}
        </span>
        <div
          className="agent-governance-choices"
          role="group"
          aria-labelledby="agent-governance-history-label"
        >
          {CHAT_HISTORY_LEVELS.map((level) => (
            <button
              key={level}
              type="button"
              data-testid={`agent-governance-history-${level}`}
              className={`agent-governance-choice${settings.chatHistory === level ? ' is-selected' : ''}`}
              aria-pressed={settings.chatHistory === level}
              onClick={() => writeSettings({ chatHistory: level })}
            >
              {t(`agent.governance.history.${level}`)}
            </button>
          ))}
        </div>
        <p className="agent-governance-note" data-testid="agent-governance-history-note">
          {settings.chatHistory === 'off'
            ? t('agent.governance.history.noneNote')
            : t('agent.governance.history.turnsNote', {
              count: LOCAL_AGENT_CHAT_HISTORY_TURNS[settings.chatHistory],
            })}
        </p>
      </div>

      <div className="agent-governance-field">
        <label className="agent-governance-switch">
          <input
            type="checkbox"
            data-testid="agent-governance-sensitive-exclusion"
            checked={settings.excludeSensitiveContext}
            onChange={(event) => writeSettings({ excludeSensitiveContext: event.target.checked })}
          />
          <span>{t('agent.governance.sensitiveExclusion.label')}</span>
        </label>
        <p className="agent-governance-note" data-testid="agent-governance-sensitive-exclusion-note">
          {settings.excludeSensitiveContext
            ? t('agent.governance.sensitiveExclusion.onNote')
            : t('agent.governance.sensitiveExclusion.offNote')}
        </p>
      </div>

      <AgentContextSuggestionSettings />
    </section>
  );
}
