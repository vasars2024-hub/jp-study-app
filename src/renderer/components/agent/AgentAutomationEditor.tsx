import { useEffect, useState, type ReactNode } from 'react';
import { useT } from '../../i18n';
import { LANG_TAGS } from '../../../shared/i18n/core';
import { effectiveAgentPermission, getActiveAgentProfile } from '../../../shared/localAgentProfiles';
import type { AgentAutomation } from '../../../shared/localAgentAutomation';
import {
  latestAgentAutomationRun,
  type AgentAutomationRunLog,
} from '../../../shared/localAgentAutomationRuns';
import {
  loadLocalAgentAutomations,
  onLocalAgentAutomationsChanged,
  removeLocalAgentAutomation,
  saveLocalAgentAutomation,
} from '../../localAgentAutomationStore';
import {
  loadLocalAgentAutomationRuns,
  onLocalAgentAutomationRunsChanged,
} from '../../localAgentAutomationRunsStore';
import { loadLocalAgentSettings, onLocalAgentSettingsChanged } from '../../localAgentSettingsStore';
import { loadLocalAgentProfiles, onLocalAgentProfilesChanged } from '../../localAgentProfilesStore';
import { agentPermissionLabelKey } from '../blanc/AgentProfileOperations';
import { Select } from '../ui';

const AGENT_WEEKDAY_KEYS = [
  'common.weekday.sun',
  'common.weekday.mon',
  'common.weekday.tue',
  'common.weekday.wed',
  'common.weekday.thu',
  'common.weekday.fri',
  'common.weekday.sat',
] as const;

/** The class names each host styles the editor with. */
const VARIANT_CLASSES = {
  blanc: {
    grid: 'blanc-form-grid',
    actions: 'blanc-row-actions',
    note: 'blanc-note',
    tableWrap: 'blanc-table-wrap',
    table: 'blanc-table',
    status: 'blanc-status',
  },
  settings: {
    grid: 'ai-page-grid',
    actions: 'sp-row',
    note: 'muted',
    tableWrap: 'ai-page-table-wrap',
    table: 'ai-page-rates',
    status: 'ai-page-status muted',
  },
} as const;

/**
 * The Agent's scheduled automations: add, list with an honest "last run", remove.
 *
 * Extracted from Blanc's Agent panel, which was the only place in the app a
 * schedule could be created or seen — so a feature of the main Agent lived only
 * in an optional alternate shell. Settings > AI and Blanc now render this same
 * editor; the schedule itself stays main-owned (`localAgentAutomationStore`),
 * and the background host fires it whichever window is open.
 *
 * An automation records the permission it was created under — the ceiling the
 * active profile allows at that moment — and runs under it later.
 */
export function AgentAutomationEditor({ variant = 'settings' }: { variant?: keyof typeof VARIANT_CLASSES }) {
  const { t, lang } = useT();
  const cls = VARIANT_CLASSES[variant];
  const [settings, setSettings] = useState(loadLocalAgentSettings);
  const [profiles, setProfiles] = useState(loadLocalAgentProfiles);
  const [automations, setAutomations] = useState<AgentAutomation[]>(() => loadLocalAgentAutomations());
  const [runs, setRuns] = useState<AgentAutomationRunLog>(() => loadLocalAgentAutomationRuns());
  const [name, setName] = useState('');
  const [objective, setObjective] = useState('');
  const [time, setTime] = useState('09:00');
  const [frequency, setFrequency] = useState<AgentAutomation['frequency']>('daily');
  const [weekday, setWeekday] = useState(1);
  const [status, setStatus] = useState('');

  useEffect(() => onLocalAgentSettingsChanged(setSettings), []);
  useEffect(() => onLocalAgentProfilesChanged(setProfiles), []);
  // Re-read on subscribe: hydration is asynchronous and can land between the
  // initialiser and the effect.
  useEffect(() => {
    setAutomations(loadLocalAgentAutomations());
    return onLocalAgentAutomationsChanged(setAutomations);
  }, []);
  useEffect(() => {
    setRuns(loadLocalAgentAutomationRuns());
    return onLocalAgentAutomationRunsChanged(setRuns);
  }, []);

  const add = (): void => {
    const trimmedName = name.trim();
    const trimmedObjective = objective.trim();
    if (!trimmedName || !trimmedObjective) {
      setStatus(t('blanc.agent.status.scheduleNeedsNameAndTask'));
      return;
    }
    const entry: AgentAutomation = {
      id: `agent-auto-${Date.now().toString(36)}`,
      name: trimmedName,
      objective: trimmedObjective,
      frequency,
      time,
      ...(frequency === 'weekly' ? { weekday } : {}),
      enabled: true,
      permission: effectiveAgentPermission(settings.permission, getActiveAgentProfile(profiles)),
      createdAt: Date.now(),
    };
    setAutomations(saveLocalAgentAutomation(entry));
    setName('');
    setObjective('');
    setStatus(t('blanc.agent.status.scheduled', { name: trimmedName }));
  };

  const remove = (id: string): void => {
    setAutomations(removeLocalAgentAutomation(id));
    setStatus(t('blanc.agent.status.scheduleRemoved'));
  };

  /** "Not yet", delivered, failed, or missed — the last two are why the column exists. */
  const lastRunCell = (automationId: string): ReactNode => {
    const run = latestAgentAutomationRun(runs, automationId);
    if (!run) return <span className={cls.note}>{t('blanc.agent.run.never')}</span>;
    const at = new Date(run.at).toLocaleString(LANG_TAGS[lang], {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
    if (run.outcome === 'failed') {
      const reason = t(`blanc.agent.run.failure.${run.failureCode ?? 'unknown'}`);
      return <span className={cls.note} title={reason}>{t('blanc.agent.run.failed', { time: at, reason })}</span>;
    }
    if (run.outcome === 'delivered') return t('blanc.agent.run.delivered', { time: at });
    return (
      <span className={cls.note} title={t('blanc.agent.run.missedHint')}>
        {t('blanc.agent.run.missed', { time: at })}
      </span>
    );
  };

  return (
    <div className="agent-automation-editor" data-variant={variant}>
      <p className={cls.note}>{t('blanc.agent.scheduleNote')}</p>
      <div className={cls.grid}>
        <label>{t('blanc.agent.field.name')}<input className="ui-input" value={name} maxLength={120} onChange={(event) => setName(event.currentTarget.value)} /></label>
        <label>{t('blanc.agent.field.time')}<input className="ui-input" type="time" value={time} onChange={(event) => setTime(event.currentTarget.value)} /></label>
        <label>
          {t('blanc.agent.field.frequency')}
          <Select value={frequency} onChange={(event) => setFrequency(event.currentTarget.value as AgentAutomation['frequency'])}>
            <option value="daily">{t('blanc.agent.frequency.daily')}</option>
            <option value="weekly">{t('blanc.agent.frequency.weekly')}</option>
          </Select>
        </label>
        {frequency === 'weekly' && (
          <label>
            {t('blanc.agent.field.day')}
            <Select value={weekday} onChange={(event) => setWeekday(Number(event.currentTarget.value))}>
              {[1, 2, 3, 4, 5, 6, 0].map((day) => <option key={day} value={day}>{t(AGENT_WEEKDAY_KEYS[day])}</option>)}
            </Select>
          </label>
        )}
      </div>
      <label>
        {t('blanc.agent.field.scheduledRequest')}
        <textarea className="ui-textarea" rows={2} maxLength={500} value={objective} placeholder={t('blanc.agent.placeholder.scheduledRequest')} onChange={(event) => setObjective(event.currentTarget.value)} />
      </label>
      <div className={cls.actions}>
        <button type="button" className="btn" onClick={add} disabled={!settings.enabled}>{t('blanc.agent.action.addSchedule')}</button>
        <span className={cls.note}>{t('blanc.agent.scheduledCount', { count: automations.length })}</span>
      </div>
      {status && <p className={cls.status} role="status">{status}</p>}
      {automations.length > 0 && (
        <div className={cls.tableWrap}>
          <table className={cls.table}>
            <thead>
              <tr>
                <th>{t('blanc.agent.table.name')}</th>
                <th>{t('blanc.agent.table.when')}</th>
                <th>{t('blanc.agent.field.permission')}</th>
                <th>{t('blanc.agent.table.lastRun')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {automations.map((entry) => (
                <tr key={entry.id}>
                  <td>{entry.name}</td>
                  <td>
                    {t('blanc.agent.scheduleWhen', { frequency: t(`blanc.agent.frequency.${entry.frequency}`), time: entry.time })}
                    {entry.frequency === 'weekly' && entry.weekday != null ? ` · ${t(AGENT_WEEKDAY_KEYS[entry.weekday])}` : ''}
                  </td>
                  <td>{t(agentPermissionLabelKey(entry.permission))}</td>
                  <td>{lastRunCell(entry.id)}</td>
                  <td><button type="button" className="btn small" onClick={() => remove(entry.id)}>{t('common.remove')}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default AgentAutomationEditor;
