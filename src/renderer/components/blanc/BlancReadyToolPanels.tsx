import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from 'react';
import type { BookLevelEstimate } from '../../../shared/bookLevelEstimate';
import type { DictEntry, DictResult } from '../../../shared/types';
import type { ImmersionSite } from '../../../shared/immersion';
import {
  normalizeYtStore,
  youtubeWatchUrl,
  type YtPlaylistsStore,
  type YtVideo,
} from '../../../shared/ytPlaylists';
import { formatBytes, isBusy, type AssetSpec } from '../../../shared/assetRegistry';
import { COMMAND_CATALOG, runCommand } from '../../keyboardShortcuts';
import {
  clearAll,
  dismiss,
  getNotifications,
  onNotificationsChanged,
  type ShellNotification,
} from '../../notificationStore';
import { estimateLevelFromText } from '../../bookLevelEstimate';
import {
  knownPercent,
  scoreTextComprehensibility,
  type ComprehensibilityScore,
} from '../../comprehensibility';
import { getLevel } from '../../knownWords';
import { getTokenizer, tokenizeSync } from '../../tokenizer';
import { parseSubtitles, type Cue } from '../../subtitles';
import { loadSaved } from '../../savedWords';

import { fuzzyScore } from '../../fuzzySearch';
import { KANJI_RADICALS } from '../../../shared/kanjiRadicals';
import { useAssets, type AssetView } from '../../assetStore';
import { useT } from '../../i18n';
import type { TVars } from '../../../shared/i18n/core';
import type {
  AgentExecutionEvent,
  AgentTask,
  AgentTaskStep,
} from '../../../shared/localAgent';
import { selectAgentMemoryContext } from '../../../shared/localAgentMemory';
import { loadLocalAgentMemory } from '../../localAgentMemoryStore';
import { loadLocalAgentSettings, saveLocalAgentSettings } from '../../localAgentSettingsStore';
import type { LocalAgentSettings } from '../../../shared/localAgentSettings';
import {
  addDeckCards,
  loadDeck,
} from '../../flashcardDeck';
import {
  loadLocalAgentAutomations,
  onLocalAgentAutomationsChanged,
  removeLocalAgentAutomation,
  saveLocalAgentAutomation,
} from '../../localAgentAutomationStore';
import type { AgentAutomation } from '../../../shared/localAgentAutomation';
import type { LocalAgentModelInfo, LocalAgentRuntimeStatus } from '../../../shared/localAgentRuntime';
import {
  cancelAgentQueueItem,
  enqueueAgentTask,
  pauseAgentQueueItem,
  prioritizeAgentQueueItem,
  resumeAgentQueueItem,
  type AgentTaskQueue,
} from '../../../shared/localAgentTaskQueue';
import { loadLocalAgentTaskQueue, saveLocalAgentTaskQueue } from '../../localAgentTaskQueueStore';
import {
  applyAgentRunToQueue,
  pendingAgentTaskStep,
  runAgentTaskStep,
  selectAgentQueueRun,
  type AgentQueueRunRefusal,
} from '../../localAgentQueueRun';
import {
  effectiveAgentPermission,
  getActiveAgentProfile,
  type AgentProfileStore,
} from '../../../shared/localAgentProfiles';
import { recommendedLocalAgentModels } from '../../../shared/localAgentModels';
import {
  createLocalAgentProfile,
  loadLocalAgentProfiles,
  saveLocalAgentProfiles,
} from '../../localAgentProfilesStore';
import {
  availableAgentToolOperationIds,
  createCentralAgentToolRegistry,
} from '../../agentToolRegistry';
import { AgentProfileOperationsEditor, agentPermissionLabelKey } from './AgentProfileOperations';

// This panel renders Study OS class names, whose rules live in styles.css.
// Imported here rather than in the boot entry so the 468 KB sheet rides this
// lazy chunk instead of Blanc's boot. See theme/studyos-compat.css.
void import('../../theme/studyos-compat.css');

export type BlancAnalyzerResult = {
  level: BookLevelEstimate | null;
  score: ComprehensibilityScore | null;
  unknownLemmas: string[];
};

function formatImmersionDuration(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  if (safe >= 3600) {
    const hours = Math.floor(safe / 3600);
    const minutes = Math.floor((safe % 3600) / 60);
    return `${hours}h ${minutes.toString().padStart(2, '0')}m`;
  }
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function formatYtDuration(seconds?: number): string {
  if (!seconds || seconds <= 0) return '—';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function notificationTime(ts: number, t: (key: string, vars?: TVars) => string): string {
  const elapsed = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (elapsed < 60) return t('notifications.time.justNow');
  const minutes = Math.floor(elapsed / 60);
  if (minutes < 60) return t('notifications.time.minutes', { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t('notifications.time.hours', { count: hours });
  return t('notifications.time.days', { count: Math.floor(hours / 24) });
}

function openSection(id: string): void {
  window.dispatchEvent(new CustomEvent('os:open', { detail: id }));
}

async function collectUnknownLemmas(text: string, threshold = 2): Promise<string[]> {
  const trimmed = text.trim();
  if (!trimmed) return [];
  try {
    await getTokenizer();
  } catch {
    return [];
  }
  const seen = new Set<string>();
  const unknown: string[] = [];
  for (const token of tokenizeSync(trimmed)) {
    if (!token.content || token.proper || !token.lemma) continue;
    if (seen.has(token.lemma)) continue;
    seen.add(token.lemma);
    if (getLevel(token.lemma) < threshold) unknown.push(token.lemma);
  }
  return unknown.slice(0, 40);
}

function firstSenseSummary(entry: DictEntry | undefined): string {
  if (!entry?.senses?.length) return '';
  const sense = entry.senses[0];
  const pos = sense.partsOfSpeech.length ? `${sense.partsOfSpeech.join(', ')} · ` : '';
  return `${pos}${sense.definitions.slice(0, 2).join('; ')}`;
}

function assetProgressPercent(view: AssetView): number {
  const { receivedBytes, totalBytes } = view.status;
  if (!totalBytes) return 0;
  return Math.min(100, Math.round((receivedBytes / totalBytes) * 100));
}

function assetStatusLine(
  view: AssetView,
  t: (key: string, vars?: TVars) => string,
): string {
  const { status, spec } = view;
  switch (status.state) {
    case 'installed':
      return `${t('storage.state.installed')} · ${formatBytes(status.totalBytes || spec.sizeBytes)} · v${status.installedVersion ?? spec.version}`;
    case 'downloading': {
      const speed = status.bytesPerSecond ? ` · ${formatBytes(status.bytesPerSecond)}/s` : '';
      return `${t('storage.state.progress', {
        received: formatBytes(status.receivedBytes),
        total: formatBytes(status.totalBytes),
      })}${speed}`;
    }
    case 'queued':
      return t('storage.state.queued');
    case 'verifying':
      return t('storage.state.verifying');
    case 'paused':
      return status.receivedBytes > 0
        ? t('storage.state.pausedAt', {
            received: formatBytes(status.receivedBytes),
            total: formatBytes(status.totalBytes),
          })
        : t('storage.state.paused');
    case 'failed':
      return status.error ? t(status.error.key, status.error.vars) : t('storage.state.failed');
    default:
      return t('storage.state.available', { size: formatBytes(spec.sizeBytes) });
  }
}

export function NotificationCenterPanel() {
  const { t, lang } = useT();
  const [, tick] = useState(0);
  useEffect(() => onNotificationsChanged(() => tick((n) => n + 1)), []);
  const items = getNotifications();
  const timeAgo = useCallback((ts: number) => notificationTime(ts, t), [lang]);

  return (
    <div className="blanc-tool-detail">
      <fieldset>
        <legend>{t('notifications.blanc.title')}</legend>
        <div className="blanc-row-actions">
          <button type="button" onClick={() => clearAll()} disabled={!items.length}>
            {t('notifications.clearAll')}
          </button>
          <span className="blanc-status">{t('notifications.blanc.entries', { count: items.length })}</span>
        </div>
        {!items.length ? (
          <p className="blanc-note">{t('notifications.empty')}</p>
        ) : (
          <div className="blanc-table-wrap">
            <table className="blanc-table">
              <thead>
                <tr>
                  <th>{t('notifications.blanc.when')}</th>
                  <th>{t('notifications.blanc.message')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {items.slice(0, 50).map((item: ShellNotification) => (
                  <tr key={item.id}>
                    <td>{timeAgo(item.ts)}</td>
                    <td>
                      {item.title ? <strong>{item.title}: </strong> : null}
                      {item.message}
                    </td>
                    <td>
                      <button type="button" onClick={() => dismiss(item.id)}>
                        {t('notifications.dismiss')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </fieldset>
    </div>
  );
}

// These three live at module scope, so they cannot call `useT()`. They return i18n
// *keys*, resolved with `t()` at the render site — the pattern CLAUDE.md prescribes
// for module-level data (see `widgets/registry.tsx`).
function agentStepLabelKey(status: AgentTask['steps'][number]['status']): string {
  if (status === 'completed') return 'blanc.agent.step.completed';
  if (status === 'running') return 'blanc.agent.step.running';
  if (status === 'waiting-confirmation') return 'blanc.agent.step.waitingConfirmation';
  if (status === 'failed') return 'blanc.agent.step.failed';
  if (status === 'skipped') return 'blanc.agent.step.skipped';
  return 'blanc.agent.step.queued';
}

/** Why a queued plan could not be started, in the panel's own voice. */
const QUEUE_REFUSAL_KEYS: Record<AgentQueueRunRefusal, string> = {
  'no-runnable-item': 'blanc.agent.refusal.noRunnableItem',
  'item-not-found': 'blanc.agent.refusal.itemNotFound',
  'item-not-runnable': 'blanc.agent.refusal.itemNotRunnable',
  'no-pending-step': 'blanc.agent.refusal.noPendingStep',
};

const AGENT_WEEKDAY_KEYS = [
  'common.weekday.sun',
  'common.weekday.mon',
  'common.weekday.tue',
  'common.weekday.wed',
  'common.weekday.thu',
  'common.weekday.fri',
  'common.weekday.sat',
] as const;

export function LocalAgentPanel() {
  const { t, lang } = useT();
  const [settings, setSettings] = useState(() => loadLocalAgentSettings());
  const [objective, setObjective] = useState('');
  const [task, setTask] = useState<AgentTask | null>(null);
  const [taskQueue, setTaskQueue] = useState<AgentTaskQueue>(() => loadLocalAgentTaskQueue());
  const [summary, setSummary] = useState('');
  const [model, setModel] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [events, setEvents] = useState<AgentExecutionEvent[]>([]);
  const [automations, setAutomations] = useState<AgentAutomation[]>(() => loadLocalAgentAutomations());
  const [automationName, setAutomationName] = useState('');
  const [automationObjective, setAutomationObjective] = useState('');
  const [automationTime, setAutomationTime] = useState('09:00');
  const [automationFrequency, setAutomationFrequency] = useState<AgentAutomation['frequency']>('daily');
  const [automationWeekday, setAutomationWeekday] = useState(1);
  const [runtimeStatus, setRuntimeStatus] = useState<LocalAgentRuntimeStatus>({ loaded: false, busy: false });
  const [availableModels, setAvailableModels] = useState<LocalAgentModelInfo[]>([]);
  const [profileStore, setProfileStore] = useState<AgentProfileStore>(() => loadLocalAgentProfiles());
  const [newProfileName, setNewProfileName] = useState('');
  const activeProfile = useMemo(() => getActiveAgentProfile(profileStore), [profileStore]);
  const recommendedModels = useMemo(() => recommendedLocalAgentModels(settings.modelMode), [settings.modelMode]);
  const handlers = useMemo(() => createCentralAgentToolRegistry(t), [lang, t]);
  const availableOperations = useMemo(
    () => availableAgentToolOperationIds(handlers),
    [handlers],
  );
  const executableOperations = useMemo(() => {
    if (!activeProfile) return availableOperations;
    const allowed = new Set(activeProfile.enabledOperations);
    return availableOperations.filter((operation) => allowed.has(operation));
  }, [activeProfile, availableOperations]);

  const updateSettings = (patch: Partial<LocalAgentSettings>): void => {
    setSettings(saveLocalAgentSettings(patch));
  };

  const plan = async (scheduledObjective = objective): Promise<void> => {
    const request = scheduledObjective.trim();
    if (!request) {
      setStatus(t('blanc.agent.status.describeFirst'));
      return;
    }
    setBusy(true);
    setStatus(t('blanc.agent.status.planning'));
    setTask(null);
    setSummary('');
    setEvents([]);
    try {
      const memory = loadLocalAgentMemory();
      const response = await window.api.localAgentPlan({
        objective: request,
        settings,
        profile: activeProfile,
        availableOperations,
        memories: settings.memoryEnabled
          ? selectAgentMemoryContext(memory, request, { maxCharacters: 4_000 })
          : [],
      });
      if (!response.ok) {
        setStatus(response.error ?? t('blanc.agent.status.planFailed'));
        return;
      }
      setSummary(response.summary ?? t('blanc.agent.status.planReady'));
      setTask(response.task ?? null);
      if (response.task) setTaskQueue((previous) => saveLocalAgentTaskQueue(enqueueAgentTask(previous, response.task as AgentTask)));
      setModel(response.modelFileName ?? '');
      setStatus(response.task ? t('blanc.agent.status.planReadyReview') : t('blanc.agent.status.noApprovedAction'));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t('blanc.agent.status.planFailed'));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    window.api.localAgentSyncAutomations(automations);
    return onLocalAgentAutomationsChanged(setAutomations);
  }, [automations]);

  useEffect(() => window.api.onLocalAgentTrigger((entry) => {
    if (!settings.enabled) {
      setStatus(t('blanc.agent.status.scheduledReady', { name: entry.name }));
      return;
    }
    setObjective(entry.objective);
    setStatus(t('blanc.agent.status.runningScheduled', { name: entry.name }));
    void plan(entry.objective);
  }), [plan, settings.enabled]);

  useEffect(() => {
    let active = true;
    const refresh = (): void => {
      void window.api.localAgentStatus().then((next) => {
        if (active) setRuntimeStatus(next);
      }).catch(() => undefined);
    };
    refresh();
    const timer = window.setInterval(refresh, 5_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    let active = true;
    const refresh = (): void => {
      void window.api.localAgentModels().then((models) => {
        if (active) setAvailableModels(models);
      }).catch(() => undefined);
    };
    refresh();
    const timer = window.setInterval(refresh, 15_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  const addAutomation = (): void => {
    const name = automationName.trim();
    const scheduledObjective = automationObjective.trim();
    if (!name || !scheduledObjective) {
      setStatus(t('blanc.agent.status.scheduleNeedsNameAndTask'));
      return;
    }
    const entry: AgentAutomation = {
      id: `agent-auto-${Date.now().toString(36)}`,
      name,
      objective: scheduledObjective,
      frequency: automationFrequency,
      time: automationTime,
      ...(automationFrequency === 'weekly' ? { weekday: automationWeekday } : {}),
      enabled: true,
      permission: effectiveAgentPermission(settings.permission, activeProfile),
      createdAt: Date.now(),
    };
    setAutomations(saveLocalAgentAutomation(entry));
    setAutomationName('');
    setAutomationObjective('');
    setStatus(t('blanc.agent.status.scheduled', { name }));
  };

  const removeAutomation = (id: string): void => {
    setAutomations(removeLocalAgentAutomation(id));
    setStatus(t('blanc.agent.status.scheduleRemoved'));
  };

  const changeProfile = (id: string): void => {
    setProfileStore(saveLocalAgentProfiles({ ...profileStore, activeProfileId: id }));
  };

  const addCustomProfile = (): void => {
    setProfileStore(createLocalAgentProfile(newProfileName));
    setNewProfileName('');
    setStatus(t('blanc.agent.status.profileCreated'));
  };

  /**
   * The panel's one execution call. All three verbs — run next, confirm, and running an item
   * out of the persisted queue — funnel through here, so the profile allow-list is supplied in
   * exactly one place and they cannot drift apart. That drift is the defect slice 47e fixed
   * between the plan and execution boundaries; a third verb was not going to reopen it.
   */
  const runStep = async (source: AgentTask, step: AgentTaskStep, confirmed: boolean): Promise<void> => {
    setBusy(true);
    setStatus(confirmed ? t('blanc.agent.status.runningConfirmed') : t('blanc.agent.status.runningNext'));
    try {
      const result = await runAgentTaskStep(taskQueue, source, step, {
        permission: effectiveAgentPermission(settings.permission, activeProfile),
        // Re-checked at EXECUTION, not only when the plan was built: a queued task outlives
        // the profile that authorized it, so narrowing a profile must take effect on work
        // already sitting in the queue.
        allowedOperations: executableOperations,
        handlers,
        ...(confirmed ? { confirmedCallIds: new Set([step.request.callId]) } : {}),
      });
      setTask(result.task);
      // Folded into the freshest queue, not the one captured before the await: Pause and Cancel
      // stay clickable while a step is in flight and must not be reverted by its write-back.
      setTaskQueue((previous) => saveLocalAgentTaskQueue(applyAgentRunToQueue(previous, result.task)));
      setEvents((previous) => [...previous, ...result.events]);
      const latest = result.task.steps.find((candidate) => candidate.id === step.id);
      if (latest?.status === 'waiting-confirmation') setStatus(t('blanc.agent.status.confirmationRequired'));
      else if (latest?.status === 'failed') setStatus(latest.error ?? t('blanc.agent.status.stepFailed'));
      else if (result.task.status === 'completed') setStatus(t('blanc.agent.status.taskCompleted'));
      else setStatus(t('blanc.agent.status.stepCompleted'));
    } finally {
      setBusy(false);
    }
  };

  const runNext = async (): Promise<void> => {
    if (!task) return;
    const step = pendingAgentTaskStep(task, 'next');
    if (step) await runStep(task, step, false);
  };

  const confirmAndRun = async (): Promise<void> => {
    if (!task) return;
    const step = pendingAgentTaskStep(task, 'confirm');
    if (step) await runStep(task, step, true);
  };

  /**
   * The path the persisted queue never had: an item becomes the live task, and then runs. Given
   * no id this takes the highest-priority queued item, which is what `nextRunnableAgentQueueItem`
   * was written for and never got to do. A step that needs confirmation still only reaches
   * `waiting-confirmation` here — the user confirms it afterwards on the now-live task.
   */
  const runQueued = async (id?: string): Promise<void> => {
    const selection = selectAgentQueueRun(taskQueue, id);
    if (!selection.ok) {
      setStatus(t(QUEUE_REFUSAL_KEYS[selection.reason]));
      return;
    }
    setSummary(selection.item.task.objective);
    setEvents([]);
    setTask(selection.item.task);
    await runStep(selection.item.task, selection.step, false);
  };

  return (
    <div className="blanc-tool-detail">
      <fieldset>
        <legend>{t('blanc.agent.title')}</legend>
        <p className="blanc-note">{t('blanc.agent.intro')}</p>
        <div className="blanc-form-grid">
          <label>
            {t('blanc.agent.field.profile')}
            <select value={activeProfile.id} onChange={(event) => changeProfile(event.currentTarget.value)}>
              {profileStore.profiles.filter((profile) => profile.enabled).map((profile) => (
                <option key={profile.id} value={profile.id}>{profile.name}</option>
              ))}
            </select>
          </label>
          <label>
            {t('blanc.agent.field.newProfile')}
            <input value={newProfileName} maxLength={100} placeholder={t('blanc.agent.placeholder.customTutor')} onChange={(event) => setNewProfileName(event.currentTarget.value)} />
          </label>
          <label>
            <span>{t('blanc.agent.field.enabled')}</span>
            <input type="checkbox" checked={settings.enabled} onChange={(event) => updateSettings({ enabled: event.currentTarget.checked })} />
          </label>
          <label>
            {t('blanc.agent.field.permission')}
            <select value={settings.permission} onChange={(event) => updateSettings({ permission: event.currentTarget.value as LocalAgentSettings['permission'] })}>
              <option value="read-only">{t('blanc.agent.permission.readOnly')}</option>
              <option value="limited-actions">{t('blanc.agent.permission.limitedActions')}</option>
              <option value="full-automation">{t('blanc.agent.permission.fullAutomation')}</option>
            </select>
          </label>
          <label>
            {t('blanc.agent.field.modelFile')}
            <input list="local-agent-model-files" value={settings.modelFileName} placeholder="Qwen3-1.7B.gguf" onChange={(event) => updateSettings({ modelFileName: event.currentTarget.value })} />
            <datalist id="local-agent-model-files">{availableModels.map((entry) => <option key={entry.fileName} value={entry.fileName} />)}</datalist>
          </label>
          <label>
            {t('blanc.agent.field.resourceMode')}
            <select value={settings.resourceMode} onChange={(event) => updateSettings({ resourceMode: event.currentTarget.value as LocalAgentSettings['resourceMode'] })}>
              <option value="battery-saver">{t('blanc.agent.resource.batterySaver')}</option>
              <option value="balanced">{t('blanc.agent.resource.balanced')}</option>
              <option value="maximum-intelligence">{t('blanc.agent.resource.maximumIntelligence')}</option>
            </select>
          </label>
          <label>
            {t('blanc.agent.field.modelStack')}
            <select value={settings.modelMode} onChange={(event) => updateSettings({ modelMode: event.currentTarget.value as LocalAgentSettings['modelMode'] })}>
              <option value="lite">{t('blanc.agent.stack.lite')}</option>
              <option value="standard">{t('blanc.agent.stack.standard')}</option>
              <option value="power">{t('blanc.agent.stack.power')}</option>
            </select>
          </label>
          <label>
            {t('blanc.agent.field.maxTasks')}
            <input type="number" min={1} max={3} value={settings.maxConcurrentTasks} onChange={(event) => updateSettings({ maxConcurrentTasks: Number(event.currentTarget.value) })} />
          </label>
          <label>
            {t('blanc.agent.field.cpuLimit', { pct: settings.cpuLimitPct })}
            <input type="range" min={10} max={100} step={5} value={settings.cpuLimitPct} onChange={(event) => updateSettings({ cpuLimitPct: Number(event.currentTarget.value) })} />
          </label>
          <label>
            {t('blanc.agent.field.gpuLimit', { pct: settings.gpuLimitPct })}
            <input type="range" min={10} max={100} step={5} value={settings.gpuLimitPct} onChange={(event) => updateSettings({ gpuLimitPct: Number(event.currentTarget.value) })} />
          </label>
          <label>
            {t('blanc.agent.field.backgroundProcessing')}
            <input type="checkbox" checked={settings.backgroundProcessing} onChange={(event) => updateSettings({ backgroundProcessing: event.currentTarget.checked })} />
          </label>
          <label>
            <span>{t('blanc.agent.field.privateContext')}</span>
            <input type="checkbox" checked={settings.privacyMode} onChange={(event) => updateSettings({ privacyMode: event.currentTarget.checked })} />
          </label>
        </div>
        <div className="blanc-row-actions">
          <button type="button" onClick={addCustomProfile} disabled={!newProfileName.trim()}>{t('blanc.agent.action.createProfile')}</button>
          <span className="blanc-note">
            {activeProfile.description} · {t('blanc.agent.approvedTools.count', { count: activeProfile.enabledOperations.length })}
            {' · '}
            {t('blanc.agent.effectivePermission', { permission: t(agentPermissionLabelKey(effectiveAgentPermission(settings.permission, activeProfile))) })}
          </span>
        </div>
        {/*
          Slice 63. The count above used to be the WHOLE surface for the allow-list: the
          per-operation refusal was proven end-to-end in Phase 7 and could only be configured by
          hand-editing localStorage. This is the editor that closes that.
        */}
        <AgentProfileOperationsEditor
          store={profileStore}
          profileId={activeProfile.id}
          onStoreChange={setProfileStore}
        />
        <p className="blanc-note">{t('blanc.agent.permissionNote', { permission: t(agentPermissionLabelKey(settings.permission)) })}</p>
        <label>
          {t('blanc.agent.field.request')}
          <textarea rows={4} value={objective} maxLength={500} placeholder={t('blanc.agent.placeholder.request')} onChange={(event) => setObjective(event.currentTarget.value)} />
        </label>
        <div className="blanc-row-actions">
          <button type="button" onClick={() => void plan()} disabled={busy || !settings.enabled || !objective.trim()}>
            {busy ? t('blanc.agent.action.working') : t('blanc.agent.action.createPlan')}
          </button>
          <button type="button" onClick={() => void runNext()} disabled={busy || !task || task.status === 'completed' || task.status === 'failed'}>
            {t('blanc.agent.action.runNext')}
          </button>
          <button type="button" onClick={() => void confirmAndRun()} disabled={busy || !task || !task.steps.some((step) => step.status === 'waiting-confirmation')}>
            {t('blanc.agent.action.confirmStep')}
          </button>
          <button type="button" onClick={() => void runQueued()} disabled={busy || !selectAgentQueueRun(taskQueue).ok}>
            {t('blanc.agent.action.runQueued')}
          </button>
        </div>
        {model && <p className="blanc-note">{t('blanc.agent.modelLine', { model })}</p>}
        <p className="blanc-note" role="status">
          {t('blanc.agent.runtime.label')}: {runtimeStatus.loaded ? t('blanc.agent.runtime.loaded') : t('blanc.agent.runtime.notLoaded')}
          {runtimeStatus.busy ? ` · ${t('blanc.agent.runtime.working')}` : ''}
          {runtimeStatus.contextSize ? ` · ${t('blanc.agent.runtime.context', { size: runtimeStatus.contextSize })}` : ''}
          {runtimeStatus.lastError ? ` · ${runtimeStatus.lastError}` : ''}
        </p>
        <p className="blanc-note">
          {t('blanc.agent.modelsFound', {
            list: availableModels.length
              ? availableModels.map((entry) => `${entry.fileName} (${formatBytes(entry.sizeBytes)}, ${entry.location === 'downloads' ? t('blanc.agent.location.downloads') : t('blanc.agent.location.appModels')})`).join(' · ')
              : t('blanc.agent.none'),
          })}
        </p>
        <p className="blanc-note">
          {t('blanc.agent.recommendedStack', {
            mode: t(`blanc.agent.mode.${settings.modelMode}`),
            list: recommendedModels.map((entry) => `${entry.name} (${entry.roles.join(', ')})`).join(' · ') || t('blanc.agent.recommendedFallback'),
          })}
        </p>
        {status && <p className="blanc-status" role="status">{status}</p>}
      </fieldset>
      {summary && <fieldset><legend>{t('blanc.agent.section.planSummary')}</legend><p className="blanc-result-box">{summary}</p></fieldset>}
      {task && (
        <fieldset>
          <legend>{t('blanc.agent.section.taskPlan')}</legend>
          <div className="blanc-table-wrap">
            <table className="blanc-table">
              <thead><tr><th>{t('blanc.agent.table.step')}</th><th>{t('blanc.agent.table.operation')}</th><th>{t('blanc.agent.table.status')}</th><th>{t('blanc.agent.table.result')}</th></tr></thead>
              <tbody>
                {task.steps.map((step) => (
                  <tr key={step.id}>
                    <td>{step.label}</td>
                    <td>{step.request.operation}</td>
                    <td>{t(agentStepLabelKey(step.status))}</td>
                    <td>{step.error ?? (step.result ? JSON.stringify(step.result).slice(0, 240) : '—')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </fieldset>
      )}
      {events.length > 0 && (
        <fieldset>
          <legend>{t('blanc.agent.section.executionLog')}</legend>
          <ul className="blanc-note-list">
            {events.slice(-20).map((event, index) => <li key={`${event.timestamp}-${index}`}>{event.type} · {event.operation}{event.error ? ` · ${event.error}` : ''}{event.durationMs != null ? ` · ${event.durationMs}ms` : ''}</li>)}
          </ul>
        </fieldset>
      )}
      <fieldset>
        <legend>{t('blanc.agent.section.taskQueue')}</legend>
        <p className="blanc-note">{t('blanc.agent.queueNote')}</p>
        {taskQueue.items.length === 0 ? <p className="blanc-note">{t('blanc.agent.queueEmpty')}</p> : (
          <div className="blanc-table-wrap"><table className="blanc-table"><thead><tr><th>{t('blanc.agent.table.plan')}</th><th>{t('blanc.agent.table.status')}</th><th>{t('blanc.agent.table.priority')}</th><th /></tr></thead><tbody>
            {taskQueue.items.slice().reverse().slice(0, 20).map((item) => (
              <tr key={item.id}><td>{item.task.objective.slice(0, 80)}</td><td>{t(`blanc.agent.queueStatus.${item.status}`)}</td><td>{item.priority}</td><td><div className="blanc-row-actions">
                {item.status === 'queued' && <button type="button" disabled={busy} onClick={() => void runQueued(item.id)}>{t('blanc.agent.action.run')}</button>}
                {item.status === 'queued' && <button type="button" onClick={() => setTaskQueue(saveLocalAgentTaskQueue(pauseAgentQueueItem(taskQueue, item.id)))}>{t('common.pause')}</button>}
                {item.status === 'paused' && <button type="button" onClick={() => setTaskQueue(saveLocalAgentTaskQueue(resumeAgentQueueItem(taskQueue, item.id)))}>{t('common.resume')}</button>}
                {(item.status === 'queued' || item.status === 'paused') && <button type="button" onClick={() => setTaskQueue(saveLocalAgentTaskQueue(cancelAgentQueueItem(taskQueue, item.id)))}>{t('common.cancel')}</button>}
                {item.status === 'queued' && <button type="button" onClick={() => setTaskQueue(saveLocalAgentTaskQueue(prioritizeAgentQueueItem(taskQueue, item.id)))}>{t('blanc.agent.action.prioritize')}</button>}
              </div></td></tr>
            ))}
          </tbody></table></div>
        )}
      </fieldset>
      <fieldset>
        <legend>{t('blanc.agent.section.scheduled')}</legend>
        <p className="blanc-note">{t('blanc.agent.scheduleNote')}</p>
        <div className="blanc-form-grid">
          <label>{t('blanc.agent.field.name')}<input value={automationName} maxLength={120} onChange={(event) => setAutomationName(event.currentTarget.value)} /></label>
          <label>{t('blanc.agent.field.time')}<input type="time" value={automationTime} onChange={(event) => setAutomationTime(event.currentTarget.value)} /></label>
          <label>{t('blanc.agent.field.frequency')}<select value={automationFrequency} onChange={(event) => setAutomationFrequency(event.currentTarget.value as AgentAutomation['frequency'])}><option value="daily">{t('blanc.agent.frequency.daily')}</option><option value="weekly">{t('blanc.agent.frequency.weekly')}</option></select></label>
          {automationFrequency === 'weekly' && <label>{t('blanc.agent.field.day')}<select value={automationWeekday} onChange={(event) => setAutomationWeekday(Number(event.currentTarget.value))}>{[1, 2, 3, 4, 5, 6, 0].map((day) => <option key={day} value={day}>{t(AGENT_WEEKDAY_KEYS[day])}</option>)}</select></label>}
        </div>
        <label>{t('blanc.agent.field.scheduledRequest')}<textarea rows={2} maxLength={500} value={automationObjective} placeholder={t('blanc.agent.placeholder.scheduledRequest')} onChange={(event) => setAutomationObjective(event.currentTarget.value)} /></label>
        <div className="blanc-row-actions"><button type="button" onClick={addAutomation} disabled={!settings.enabled}>{t('blanc.agent.action.addSchedule')}</button><span className="blanc-note">{t('blanc.agent.scheduledCount', { count: automations.length })}</span></div>
        {automations.length > 0 && <div className="blanc-table-wrap"><table className="blanc-table"><thead><tr><th>{t('blanc.agent.table.name')}</th><th>{t('blanc.agent.table.when')}</th><th>{t('blanc.agent.field.permission')}</th><th /></tr></thead><tbody>{automations.map((entry) => <tr key={entry.id}><td>{entry.name}</td><td>{t('blanc.agent.scheduleWhen', { frequency: t(`blanc.agent.frequency.${entry.frequency}`), time: entry.time })}{entry.frequency === 'weekly' && entry.weekday != null ? ` · ${t(AGENT_WEEKDAY_KEYS[entry.weekday])}` : ''}</td><td>{t(agentPermissionLabelKey(entry.permission))}</td><td><button type="button" onClick={() => removeAutomation(entry.id)}>{t('common.remove')}</button></td></tr>)}</tbody></table></div>}
      </fieldset>
    </div>
  );
}

export function DifficultyAnalyzerPanel() {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<BlancAnalyzerResult | null>(null);

  const runCheck = async (): Promise<void> => {
    const sample = text.trim();
    if (!sample) {
      setError('Paste some text first.');
      setResult(null);
      return;
    }
    setBusy(true);
    setError('');
    try {
      const [level, score, unknownLemmas] = await Promise.all([
        estimateLevelFromText(sample),
        scoreTextComprehensibility(sample),
        collectUnknownLemmas(sample),
      ]);
      setResult({ level, score, unknownLemmas });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setResult(null);
    } finally {
      setBusy(false);
    }
  };

  const score = result?.score;
  const unknownFromScore =
    score && 'unknownLemmas' in score && Array.isArray((score as { unknownLemmas?: string[] }).unknownLemmas)
      ? ((score as { unknownLemmas?: string[] }).unknownLemmas ?? [])
      : null;
  const unknownLemmas = unknownFromScore ?? result?.unknownLemmas ?? [];

  return (
    <div className="blanc-tool-detail">
      <fieldset>
        <legend>Level &amp; Difficulty Checker</legend>
        <label>
          Text sample
          <textarea
            rows={6}
            value={text}
            lang="ja"
            placeholder="Paste Japanese or Chinese text to analyze"
            onChange={(event) => setText(event.target.value)}
          />
        </label>
        <div className="blanc-row-actions">
          <button type="button" onClick={() => void runCheck()} disabled={busy || !text.trim()}>
            {busy ? 'Checking…' : 'Check'}
          </button>
        </div>
        {error && <p className="blanc-error">{error}</p>}
        {result?.level && (
          <div className="blanc-result-box">
            <span className="blanc-status">{result.level.label}</span>
            {' · '}
            {Math.round(result.level.confidence * 100)}% band coverage
            {!result.level.metThreshold ? ' (below threshold)' : ''}
          </div>
        )}
        {score && score.totalWords > 0 && (
          <div className="blanc-result-box">
            Comprehension: {knownPercent(score)}% known ({score.knownWords}/{score.totalWords} tokens)
          </div>
        )}
        {unknownLemmas.length > 0 && (
          <p className="blanc-note">
            Unknown lemmas ({unknownLemmas.length}): {unknownLemmas.slice(0, 20).join(', ')}
            {unknownLemmas.length > 20 ? '…' : ''}
          </p>
        )}
        {result && !result.level && score && score.totalWords === 0 && (
          <p className="blanc-warning">No level lists configured or text could not be tokenized.</p>
        )}
      </fieldset>
    </div>
  );
}

export function ImmersionTrackerPanel() {
  const [sites, setSites] = useState<ImmersionSite[]>([]);
  const [error, setError] = useState('');

  const applyStore = useCallback((store: { sites: ImmersionSite[] }) => {
    setSites(
      [...store.sites].sort(
        (a, b) => b.totalSeconds - a.totalSeconds || b.lastVisited - a.lastVisited,
      ),
    );
  }, []);

  useEffect(() => {
    void window.api
      .immersionListSites()
      .then(applyStore)
      .catch(() => setError('Immersion data is not available.'));
    const off = window.api.onImmersionSitesChanged(applyStore);
    return () => off?.();
  }, [applyStore]);

  return (
    <div className="blanc-tool-detail">
      <fieldset>
        <legend>Immersion Tracker</legend>
        <p className="blanc-note">Read-only totals from your immersion site library.</p>
        {error && <p className="blanc-error">{error}</p>}
        {!sites.length ? (
          <p className="blanc-note">No immersion sites tracked yet.</p>
        ) : (
          <div className="blanc-table-wrap">
            <table className="blanc-table">
              <thead>
                <tr>
                  <th>Site</th>
                  <th>Time</th>
                  <th>Chars</th>
                  <th>Streak</th>
                </tr>
              </thead>
              <tbody>
                {sites.map((site) => (
                  <tr key={site.id}>
                    <td title={site.url}>{site.title || site.url}</td>
                    <td>{formatImmersionDuration(site.totalSeconds)}</td>
                    <td>{site.totalChars.toLocaleString()}</td>
                    <td>{site.streakDays}d</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </fieldset>
    </div>
  );
}

export function FrequencyExplorerPanel() {
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<DictResult | null>(null);

  const lookup = async (): Promise<void> => {
    const q = query.trim();
    if (!q) return;
    setBusy(true);
    setError('');
    try {
      const next = await window.api.lookupTerm(q);
      setResult(next);
      if (next.error) setError(next.error);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setResult(null);
    } finally {
      setBusy(false);
    }
  };

  const entry = result?.entries?.[0];

  return (
    <div className="blanc-tool-detail">
      <fieldset>
        <legend>Frequency Explorer</legend>
        <div className="blanc-form-grid">
          <label>
            Term
            <input
              value={query}
              lang="ja"
              placeholder="Lookup word or kanji"
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void lookup();
              }}
            />
          </label>
        </div>
        <div className="blanc-row-actions">
          <button type="button" onClick={() => void lookup()} disabled={busy || !query.trim()}>
            {busy ? 'Looking up…' : 'Lookup'}
          </button>
        </div>
        {error && <p className="blanc-error">{error}</p>}
        {entry && (
          <div className="blanc-result-box">
            <div>
              <strong>{entry.word}</strong>
              {entry.reading ? ` · ${entry.reading}` : ''}
            </div>
            {entry.frequency != null ? (
              <div>Frequency rank: {entry.frequency.toLocaleString()}</div>
            ) : (
              <p className="blanc-note">No frequency rank in installed dictionaries.</p>
            )}
            {firstSenseSummary(entry) && <p className="blanc-note">{firstSenseSummary(entry)}</p>}
          </div>
        )}
        {result && !entry && !error && <p className="blanc-warning">No dictionary entries found.</p>}
      </fieldset>
    </div>
  );
}

export function SubtitleImporterPanel() {
  const [cues, setCues] = useState<Cue[]>([]);
  const [fileName, setFileName] = useState('');
  const [status, setStatus] = useState('');

  const onFile = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const raw = await file.text();
      const parsed = parseSubtitles(raw);
      setCues(parsed);
      setFileName(file.name);
      setStatus(parsed.length ? `Parsed ${parsed.length} cues from ${file.name}.` : 'No cues found.');
    } catch (err) {
      setCues([]);
      setFileName('');
      setStatus(err instanceof Error ? err.message : String(err));
    }
  };

  const sendToFlashcards = (): void => {
    if (!cues.length) {
      setStatus('Load a subtitle file first.');
      return;
    }
    const cards = cues
      .map((cue) => cue.text.trim())
      .filter(Boolean)
      .map((sentence) => ({
        word: sentence.slice(0, 48),
        reading: '',
        meaning: '',
        sentence,
        front: sentence,
        back: '',
        source: 'import' as const,
        folder: 'Subtitles',
      }));
    addDeckCards(cards);
    setStatus(`Added ${cards.length} cards to the Subtitles folder.`);
  };

  return (
    <div className="blanc-tool-detail">
      <fieldset>
        <legend>Subtitle Importer</legend>
        <label>
          Subtitle file
          <input type="file" accept=".srt,.vtt,.ass,.ssa,.lrc,.txt" onChange={(event) => void onFile(event)} />
        </label>
        {fileName && <p className="blanc-note">{fileName}</p>}
        {cues.length > 0 && (
          <>
            <div className="blanc-result-box">{cues.length} cues loaded</div>
            <ul className="blanc-plain-list">
              {cues.slice(0, 5).map((cue, index) => (
                <li key={`${cue.start}-${index}`}>{cue.text.replace(/\n/g, ' / ')}</li>
              ))}
            </ul>
            {cues.length > 5 && <p className="blanc-note">Showing first 5 cues.</p>}
          </>
        )}
        <div className="blanc-row-actions">
          <button type="button" onClick={sendToFlashcards} disabled={!cues.length}>
            Send to flashcards
          </button>
        </div>
        {status && <p className="blanc-note">{status}</p>}
      </fieldset>
    </div>
  );
}

type ContextSearchItem = {
  key: string;
  label: string;
  sub?: string;
  run: () => void;
};

export function ContextSearchPanel() {
  const [query, setQuery] = useState('');
  const [grammarItems, setGrammarItems] = useState<ContextSearchItem[]>([]);

  useEffect(() => {
    let dead = false;
    import('../../data/grammar')
      .then(({ GRAMMAR }) => {
        if (dead) return;
        setGrammarItems(
          GRAMMAR.map((g) => ({
            key: `gr-${g.id}`,
            label: g.title,
            sub: `${g.level} · ${g.meaning}`,
            run: () => openSection('grammar'),
          })),
        );
      })
      .catch(() => {
        /* grammar data unavailable */
      });
    return () => {
      dead = true;
    };
  }, []);

  const items = useMemo<ContextSearchItem[]>(() => {
    const out: ContextSearchItem[] = [];
    for (const command of COMMAND_CATALOG) {
      out.push({
        key: `cmd-${command.id}`,
        label: command.label,
        sub: command.category,
        run: () => {
          void runCommand(command.id);
        },
      });
    }
    for (const saved of loadSaved().slice(0, 200)) {
      out.push({
        key: `sw-${saved.word}`,
        label: saved.word,
        sub: saved.meaning,
        run: () => openSection('dictionary'),
      });
    }
    for (const card of loadDeck().slice(0, 200)) {
      out.push({
        key: `fc-${card.id}`,
        label: card.word,
        sub: card.sentence ?? card.bookTitle,
        run: () => openSection('flashcards'),
      });
    }
    out.push(...grammarItems);
    return out;
  }, [grammarItems]);

  const results = useMemo(() => {
    const q = query.trim();
    if (!q) return items.slice(0, 30);
    const scored: { item: ContextSearchItem; score: number }[] = [];
    for (const item of items) {
      const hay = `${item.label} ${item.sub ?? ''}`;
      const score = fuzzyScore(q, hay);
      if (score != null) scored.push({ item, score });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, 30).map((row) => row.item);
  }, [items, query]);

  return (
    <div className="blanc-tool-detail">
      <fieldset>
        <legend>Personal Context Search</legend>
        <label>
          Search
          <input
            value={query}
            placeholder="Commands, saved words, deck cards, grammar"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        {!results.length ? (
          <p className="blanc-note">No matches.</p>
        ) : (
          <div className="blanc-table-wrap">
            <table className="blanc-table">
              <tbody>
                {results.map((item) => (
                  <tr key={item.key}>
                    <td>
                      <button type="button" onClick={item.run}>
                        {item.label}
                      </button>
                      {item.sub ? <div className="blanc-note">{item.sub}</div> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </fieldset>
    </div>
  );
}

export function KanjiInspectorPanel() {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [entry, setEntry] = useState<DictEntry | null>(null);
  const char = [...value.trim()][0] ?? '';

  const inspect = async (): Promise<void> => {
    if (!char) {
      setError('Enter one kanji character.');
      setEntry(null);
      return;
    }
    setBusy(true);
    setError('');
    try {
      const result = await window.api.lookupTerm(char);
      if (result.error) setError(result.error);
      setEntry(result.entries?.[0] ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setEntry(null);
    } finally {
      setBusy(false);
    }
  };

  const isRadical = char ? KANJI_RADICALS.includes(char) : false;

  return (
    <div className="blanc-tool-detail">
      <fieldset>
        <legend>Kanji Inspector</legend>
        <div className="blanc-form-grid">
          <label>
            Character
            <input
              value={value}
              lang="ja"
              maxLength={8}
              placeholder="一"
              onChange={(event) => setValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void inspect();
              }}
            />
          </label>
        </div>
        <div className="blanc-row-actions">
          <button type="button" onClick={() => void inspect()} disabled={busy || !char}>
            {busy ? 'Inspecting…' : 'Inspect'}
          </button>
        </div>
        {char && (
          <p className="blanc-note">
            {isRadical
              ? `${char} is listed in the common radical set.`
              : `${char} is not in the bundled radical picker list.`}
          </p>
        )}
        {error && <p className="blanc-error">{error}</p>}
        {entry && (
          <div className="blanc-result-box">
            <div>
              <strong>{entry.word}</strong>
              {entry.reading ? ` · ${entry.reading}` : ''}
            </div>
            {firstSenseSummary(entry) && <p className="blanc-note">{firstSenseSummary(entry)}</p>}
          </div>
        )}
      </fieldset>
    </div>
  );
}

export function BlancYoutubePanel() {
  const [store, setStore] = useState<YtPlaylistsStore>(() => normalizeYtStore(null));
  const [url, setUrl] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const applyStore = useCallback((next: YtPlaylistsStore) => {
    setStore(normalizeYtStore(next));
  }, []);

  useEffect(() => {
    void window.api.ytList().then(applyStore);
    return window.api.onYtChanged(applyStore);
  }, [applyStore]);

  const videos = store.videos ?? [];
  const planIds = new Set(store.planToWatchIds ?? []);

  const toggle = (id: string): void => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const addPlaylist = async (): Promise<void> => {
    const trimmed = url.trim();
    if (!trimmed) return;
    setBusy('Syncing playlist…');
    setError('');
    const result = await window.api.ytAddPlaylist(trimmed);
    setBusy('');
    if ('error' in result) {
      setError(result.error);
      return;
    }
    applyStore(result.store);
    setUrl('');
  };

  const downloadSelected = async (): Promise<void> => {
    const ids = [...selected];
    if (!ids.length) return;
    setBusy('Downloading…');
    setError('');
    const result = await window.api.ytDownloadVideos(ids);
    setBusy('');
    applyStore(result.store);
    const fail = result.results.find((row) => !row.ok);
    if (fail?.error) setError(fail.error);
    setSelected(new Set());
  };

  const togglePlan = async (video: YtVideo): Promise<void> => {
    if (planIds.has(video.id)) {
      applyStore(await window.api.ytRemoveFromPlanToWatch([video.id]));
    } else {
      applyStore(await window.api.ytAddToPlanToWatch([video.id]));
    }
  };

  return (
    <div className="blanc-tool-detail">
      <fieldset>
        <legend>YouTube Library</legend>
        <div className="blanc-form-grid">
          <label>
            Playlist URL
            <input
              value={url}
              placeholder="https://www.youtube.com/playlist?list=…"
              onChange={(event) => setUrl(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void addPlaylist();
              }}
            />
          </label>
        </div>
        <div className="blanc-row-actions">
          <button type="button" onClick={() => void addPlaylist()} disabled={!!busy || !url.trim()}>
            Add playlist
          </button>
          <button type="button" onClick={() => void downloadSelected()} disabled={!!busy || !selected.size}>
            Download selected
          </button>
        </div>
        {busy && <p className="blanc-status">{busy}</p>}
        {error && <p className="blanc-error">{error}</p>}
        {!videos.length ? (
          <p className="blanc-note">No videos yet. Add a playlist to populate the list.</p>
        ) : (
          <div className="blanc-table-wrap">
            <table className="blanc-table">
              <thead>
                <tr>
                  <th />
                  <th>Title</th>
                  <th>Duration</th>
                  <th>Plan</th>
                </tr>
              </thead>
              <tbody>
                {videos.map((video) => (
                  <tr key={video.id}>
                    <td>
                      <label className="blanc-check">
                        <input
                          type="checkbox"
                          checked={selected.has(video.id)}
                          onChange={() => toggle(video.id)}
                        />
                      </label>
                    </td>
                    <td>
                      <a href={video.url || youtubeWatchUrl(video.youtubeId)} target="_blank" rel="noreferrer">
                        {video.title}
                      </a>
                    </td>
                    <td>{formatYtDuration(video.durationSec)}</td>
                    <td>
                      <button type="button" onClick={() => void togglePlan(video)}>
                        {planIds.has(video.id) ? 'Remove plan' : 'Plan to watch'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </fieldset>
    </div>
  );
}

export function BlancModelsPanel() {
  const { views, loading, start, pause, cancel } = useAssets();
  const { t } = useT();
  const [notice, setNotice] = useState('');

  const topLevel = useMemo(() => {
    const companionIds = new Set(views.flatMap((view) => view.spec.requires ?? []));
    return views.filter((view) => !companionIds.has(view.spec.id));
  }, [views]);

  const onStart = async (spec: AssetSpec): Promise<void> => {
    setNotice('');
    const result = await start(spec.id);
    if (!result.ok && result.error) setNotice(t(result.error.key, result.error.vars));
  };

  return (
    <div className="blanc-tool-detail">
      {notice && <p className="blanc-warning">{notice}</p>}
      {loading ? (
        <p className="blanc-note">{t('storage.reading')}</p>
      ) : !topLevel.length ? (
        <p className="blanc-note">No downloadable models listed.</p>
      ) : (
        topLevel.map((view) => {
          const busy = isBusy(view.status.state);
          const showBar = busy || view.status.state === 'paused';
          return (
            <div key={view.spec.id} className="blanc-result-box" style={{ marginBottom: '0.75rem' }}>
              <div>
                <strong>{view.spec.name}</strong>
                {view.spec.lang !== 'any' && (
                  <span className="blanc-status"> · {view.spec.lang === 'ja' ? 'JA' : 'ZH'}</span>
                )}
              </div>
              <p className="blanc-note">{view.spec.description}</p>
              <p className={`blanc-status${view.status.state === 'failed' ? ' blanc-error' : ''}`}>
                {assetStatusLine(view, t)}
              </p>
              {showBar && (
                <div className="blanc-result-box" style={{ padding: '0.25rem 0' }}>
                  <div
                    style={{
                      height: '4px',
                      width: `${assetProgressPercent(view)}%`,
                      background: 'var(--blanc-accent, #c41e3a)',
                    }}
                  />
                </div>
              )}
              <div className="blanc-row-actions">
                {view.status.state === 'not-installed' && (
                  <button type="button" onClick={() => void onStart(view.spec)}>
                    Download ({formatBytes(view.spec.sizeBytes)})
                  </button>
                )}
                {view.status.state === 'failed' && (
                  <button type="button" onClick={() => void onStart(view.spec)}>
                    Try again
                  </button>
                )}
                {(view.status.state === 'downloading' || view.status.state === 'queued') && (
                  <button type="button" onClick={() => pause(view.spec.id)}>
                    Pause
                  </button>
                )}
                {view.status.state === 'paused' && (
                  <button type="button" onClick={() => void onStart(view.spec)}>
                    Resume
                  </button>
                )}
                {(busy || view.status.state === 'paused') && view.status.state !== 'verifying' && (
                  <button type="button" onClick={() => cancel(view.spec.id)}>
                    Cancel
                  </button>
                )}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

// Exported so BlancAppDrawerPanel's one-time migration can read this store
// without duplicating the parser — workspace-launcher is retired in favour of
// the App Drawer (BLANC_REFINEMENT_PLAN.md, Pillar 3), and the migration reads
// this exact key non-destructively (it is never written here again).
export const WORKSPACE_LAUNCHER_KEY = 'jp-study.blanc.toolbox.workspaces.v1';

/** One launchable target inside a workspace. */
export interface WorkspaceTarget {
  id: string;
  /** Absolute path from the native picker, or an http(s) URL. */
  target: string;
  label: string;
}

export interface Workspace {
  id: string;
  name: string;
  targets: WorkspaceTarget[];
}

export function readWorkspaces(): Workspace[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(WORKSPACE_LAUNCHER_KEY) ?? '[]') as unknown;
    if (!Array.isArray(parsed)) return [];
    // Rebuild from known keys only — stale shapes must not survive a reload.
    return parsed.flatMap((raw): Workspace[] => {
      if (!raw || typeof raw !== 'object') return [];
      const row = raw as Record<string, unknown>;
      if (typeof row.id !== 'string' || typeof row.name !== 'string') return [];
      const targets = Array.isArray(row.targets) ? row.targets : [];
      return [{
        id: row.id,
        name: row.name,
        targets: targets.flatMap((rawTarget): WorkspaceTarget[] => {
          if (!rawTarget || typeof rawTarget !== 'object') return [];
          const entry = rawTarget as Record<string, unknown>;
          if (typeof entry.id !== 'string' || typeof entry.target !== 'string' || !entry.target) return [];
          return [{ id: entry.id, target: entry.target, label: typeof entry.label === 'string' ? entry.label : entry.target }];
        }),
      }];
    });
  } catch {
    return [];
  }
}

type BatchImageFormat = 'image/png' | 'image/jpeg' | 'image/webp';

const BATCH_FORMAT_EXT: Record<BatchImageFormat, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

function batchOutputName(fileName: string, format: BatchImageFormat): string {
  const base = fileName.replace(/\.[^.]+$/, '') || 'converted-image';
  return `${base}.${BATCH_FORMAT_EXT[format]}`;
}

interface BatchConvertItem {
  id: string;
  file: File;
  state: 'queued' | 'converting' | 'done' | 'failed';
  outputUrl: string;
  outputSize: number;
  error: string;
}

async function convertImageFile(file: File, format: BatchImageFormat, quality: number): Promise<Blob> {
  const sourceUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = 'async';
    image.src = sourceUrl;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas unavailable.');
    if (format === 'image/jpeg') {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.drawImage(image, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, format, format === 'image/png' ? undefined : quality);
    });
    if (!blob) throw new Error('Conversion failed.');
    return blob;
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

export function BatchConverterPanel() {
  const [items, setItems] = useState<BatchConvertItem[]>([]);
  const [format, setFormat] = useState<BatchImageFormat>('image/webp');
  const [quality, setQuality] = useState(0.86);
  const [busy, setBusy] = useState(false);

  const chooseFiles = (list: FileList | null): void => {
    if (!list?.length) return;
    const images = Array.from(list).filter((file) => file.type.startsWith('image/'));
    if (!images.length) return;
    setItems((prev) => [
      ...prev,
      ...images.map((file, index) => ({
        id: `${Date.now()}-${index}-${file.name}`,
        file,
        state: 'queued' as const,
        outputUrl: '',
        outputSize: 0,
        error: '',
      })),
    ]);
  };

  const clearAllItems = (): void => {
    for (const item of items) {
      if (item.outputUrl) URL.revokeObjectURL(item.outputUrl);
    }
    setItems([]);
  };

  const convertAll = async (): Promise<void> => {
    setBusy(true);
    const pending = items.filter((item) => item.state === 'queued' || item.state === 'failed');
    for (const target of pending) {
      setItems((prev) => prev.map((item) => (item.id === target.id ? { ...item, state: 'converting', error: '' } : item)));
      try {
        const blob = await convertImageFile(target.file, format, quality);
        const outputUrl = URL.createObjectURL(blob);
        setItems((prev) => prev.map((item) => {
          if (item.id !== target.id) return item;
          if (item.outputUrl) URL.revokeObjectURL(item.outputUrl);
          return { ...item, state: 'done', outputUrl, outputSize: blob.size };
        }));
      } catch (error) {
        setItems((prev) => prev.map((item) => (
          item.id === target.id
            ? { ...item, state: 'failed', error: error instanceof Error ? error.message : 'Could not convert this image.' }
            : item
        )));
      }
    }
    setBusy(false);
  };

  const doneItems = items.filter((item) => item.state === 'done');
  const pendingCount = items.filter((item) => item.state === 'queued' || item.state === 'failed').length;
  const totalIn = items.reduce((sum, item) => sum + item.file.size, 0);
  const totalOut = doneItems.reduce((sum, item) => sum + item.outputSize, 0);

  const saveAll = (): void => {
    for (const item of doneItems) {
      const link = document.createElement('a');
      link.href = item.outputUrl;
      link.download = batchOutputName(item.file.name, format);
      link.click();
    }
  };

  return (
    <div className="blanc-tool-detail">
      <fieldset>
        <legend>Batch Converter</legend>
        <p className="blanc-note">Convert a queue of images locally through browser canvas. PNG, JPEG, and WebP are supported; other batch formats can use OSS adapters later.</p>
        <label>
          Images
          <input type="file" accept="image/*" multiple onChange={(event) => { chooseFiles(event.target.files); event.target.value = ''; }} />
        </label>
        <div className="blanc-form-grid">
          <label>
            Output
            <select value={format} disabled={busy} onChange={(event) => setFormat(event.target.value as BatchImageFormat)}>
              <option value="image/webp">WebP</option>
              <option value="image/png">PNG</option>
              <option value="image/jpeg">JPEG</option>
            </select>
          </label>
          <label>
            Quality
            <input
              type="range"
              min={0.4}
              max={1}
              step={0.01}
              value={quality}
              disabled={busy || format === 'image/png'}
              onChange={(event) => setQuality(Number(event.target.value))}
            />
          </label>
        </div>
        <div className="blanc-row-actions">
          <button type="button" disabled={busy || !pendingCount} onClick={() => void convertAll()}>
            {busy ? 'Converting...' : 'Convert queued'}
          </button>
          <button type="button" disabled={busy || !doneItems.length} onClick={saveAll}>
            Save all ({doneItems.length})
          </button>
          <button type="button" disabled={busy || !items.length} onClick={clearAllItems}>
            Clear
          </button>
          <span className="blanc-note">
            {items.length
              ? `${items.length} files | In ${formatBytes(totalIn)}${totalOut ? ` | Out ${formatBytes(totalOut)}` : ''}`
              : 'Choose images to queue.'}
          </span>
        </div>
      </fieldset>
      {items.length > 0 && (
        <fieldset>
          <legend>Queue</legend>
          <div className="blanc-table-wrap">
            <table className="blanc-table">
              <thead>
                <tr>
                  <th>File</th>
                  <th>Size</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td>{item.file.name}</td>
                    <td>{formatBytes(item.file.size)}</td>
                    <td>
                      {item.state === 'queued' && 'Queued'}
                      {item.state === 'converting' && 'Converting...'}
                      {item.state === 'done' && `Done (${formatBytes(item.outputSize)})`}
                      {item.state === 'failed' && (item.error || 'Failed')}
                    </td>
                    <td>
                      {item.state === 'done' && (
                        <a className="blanc-file-link" href={item.outputUrl} download={batchOutputName(item.file.name, format)}>
                          Save
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </fieldset>
      )}
    </div>
  );
}
