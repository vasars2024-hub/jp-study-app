import { useMemo } from 'react';
import {
  AGENT_TOOL_OPERATIONS,
  type AgentPermissionLevel,
  type AgentToolId,
  type AgentToolOperationDefinition,
  type AgentToolOperationId,
} from '../../../shared/localAgent';
import {
  agentProfileOperationsAreFactoryDefault,
  factoryAgentProfileOperations,
  type AgentProfileStore,
} from '../../../shared/localAgentProfiles';
import { setLocalAgentProfileOperations } from '../../localAgentProfilesStore';
import { useT } from '../../i18n';

/**
 * Shared with `BlancReadyToolPanels`, which had its own copy until this file existed. One
 * mapping rather than two that can drift, since both surfaces name the same three levels.
 */
export function agentPermissionLabelKey(value: AgentPermissionLevel): string {
  if (value === 'limited-actions') return 'blanc.agent.permission.limitedActions';
  if (value === 'full-automation') return 'blanc.agent.permission.fullAutomation';
  return 'blanc.agent.permission.readOnly';
}

const TOOL_GROUP_KEYS: Record<AgentToolId, string> = {
  media: 'blanc.agent.operations.group.media',
  anime: 'blanc.agent.operations.group.anime',
  'visual-novel': 'blanc.agent.operations.group.visualNovel',
  flashcard: 'blanc.agent.operations.group.flashcard',
  study: 'blanc.agent.operations.group.study',
  dictionary: 'blanc.agent.operations.group.dictionary',
  calendar: 'blanc.agent.operations.group.calendar',
  settings: 'blanc.agent.operations.group.settings',
};

/**
 * Grouped once at module scope, not per render, and deliberately WITHOUT calling `t()`.
 *
 * Grouping by tool id keeps this free of the language, so there is no memo whose staleness a
 * language switch could expose — the CLAUDE.md trap where a `useMemo` that calls `t()` depends
 * on `t` (whose identity is stable by design) instead of `lang`, and silently goes stale. The
 * headings are translated at render time below, where a switch re-renders them for free.
 */
const OPERATION_GROUPS: readonly { tool: AgentToolId; operations: readonly AgentToolOperationDefinition[] }[] = (() => {
  const byTool = new Map<AgentToolId, AgentToolOperationDefinition[]>();
  for (const definition of AGENT_TOOL_OPERATIONS) {
    const bucket = byTool.get(definition.tool);
    if (bucket) bucket.push(definition);
    else byTool.set(definition.tool, [definition]);
  }
  // Map preserves insertion order, so the groups appear in catalogue order.
  return [...byTool].map(([tool, operations]) => ({ tool, operations }));
})();

export interface AgentProfileOperationsEditorProps {
  store: AgentProfileStore;
  profileId: string;
  onStoreChange: (next: AgentProfileStore) => void;
}

/**
 * The allow-list editor. Slice 63.
 *
 * Phase 7 proved that narrowing a profile makes the executor refuse a step outside the list, and
 * proved it by hand-editing localStorage — because that was the only way. The panel rendered this
 * list as a COUNT and offered nothing to change it, so `disabledOperations` appeared nowhere in
 * `src/renderer` at all. A control no user can operate is not a control.
 *
 * Two deliberate choices:
 *
 *  - **The whole catalogue is listed, not just the profile's current operations.** A list of only
 *    what is already enabled can be narrowed and never widened or restored, which is a one-way
 *    door out of a working profile.
 *  - **Built-ins are editable.** They are all a fresh user has, and disabling the editor for
 *    `builtIn: true` would reproduce slice 56's defect exactly — the narrowing UI present, the
 *    narrowing impossible where it matters.
 *
 * The write itself goes through `setLocalAgentProfileOperations`, which persists a DELTA against
 * the factory list rather than a copy of it. That is a hard contract, not a preference — see
 * `setAgentProfileOperations` for why an empty delta must never be written as `[]`.
 *
 * Operation labels come from `AGENT_TOOL_OPERATIONS` and stay in English, by the same scope rule
 * that leaves profile names and plan objectives alone: they are a data module, they are what the
 * model is shown in its prompt, and they are the exact words the refusal quotes back
 * ("Search local knowledge is not enabled for the active agent profile"). Translating them here
 * would make the editor and the refusal disagree about what the user just switched off.
 */
export function AgentProfileOperationsEditor({ store, profileId, onStoreChange }: AgentProfileOperationsEditorProps) {
  const { t } = useT();
  const profile = store.profiles.find((entry) => entry.id === profileId);
  const enabled = useMemo(
    () => new Set<AgentToolOperationId>(profile?.enabledOperations ?? []),
    [profile?.enabledOperations],
  );

  if (!profile) return null;

  const factoryOperations = factoryAgentProfileOperations(profile.id);
  const isFactoryDefault = agentProfileOperationsAreFactoryDefault(profile);

  const commit = (next: readonly AgentToolOperationId[]): void => {
    onStoreChange(setLocalAgentProfileOperations(store, profile.id, next));
  };

  const toggle = (operation: AgentToolOperationId): void => {
    const next = new Set(enabled);
    if (next.has(operation)) next.delete(operation);
    else next.add(operation);
    // Emitted in catalogue order rather than click order, so the stored delta of a given
    // selection is the same however the user arrived at it.
    commit(AGENT_TOOL_OPERATIONS.filter((definition) => next.has(definition.id)).map((definition) => definition.id));
  };

  return (
    <fieldset>
      <legend>{t('blanc.agent.operations.title')}</legend>
      <p className="blanc-note">{t('blanc.agent.operations.intro')}</p>
      <div className="blanc-row-actions">
        <button
          type="button"
          data-testid="agent-operations-enable-all"
          onClick={() => commit(AGENT_TOOL_OPERATIONS.map((definition) => definition.id))}
        >
          {t('blanc.agent.operations.enableAll')}
        </button>
        <button
          type="button"
          data-testid="agent-operations-disable-all"
          onClick={() => commit([])}
        >
          {t('blanc.agent.operations.disableAll')}
        </button>
        {factoryOperations && (
          <button
            type="button"
            data-testid="agent-operations-restore-defaults"
            disabled={isFactoryDefault}
            onClick={() => commit(factoryOperations)}
          >
            {t('blanc.agent.operations.restoreDefaults')}
          </button>
        )}
        <span className="blanc-note">
          {t('blanc.agent.operations.enabledCount', {
            count: profile.enabledOperations.length,
            total: AGENT_TOOL_OPERATIONS.length,
          })}
          {factoryOperations
            ? ` · ${t(isFactoryDefault ? 'blanc.agent.operations.usingDefaults' : 'blanc.agent.operations.customized')}`
            : ''}
        </span>
      </div>
      {profile.enabledOperations.length === 0 && (
        <p className="blanc-note" role="status">{t('blanc.agent.operations.noneApproved')}</p>
      )}
      {OPERATION_GROUPS.map(({ tool, operations }) => (
        <div key={tool} role="group" aria-labelledby={`agent-operations-${tool}`}>
          <p className="blanc-note" id={`agent-operations-${tool}`}>{t(TOOL_GROUP_KEYS[tool])}</p>
          <div className="blanc-form-grid">
            {operations.map((definition) => (
              <label key={definition.id} className="blanc-check" title={definition.id}>
                <input
                  type="checkbox"
                  data-operation={definition.id}
                  checked={enabled.has(definition.id)}
                  onChange={() => toggle(definition.id)}
                />
                <span>
                  {definition.label}
                  {' '}
                  <span className="blanc-note">
                    ({t(agentPermissionLabelKey(definition.minimumPermission))})
                  </span>
                </span>
              </label>
            ))}
          </div>
        </div>
      ))}
    </fieldset>
  );
}
