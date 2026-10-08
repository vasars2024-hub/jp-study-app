import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
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
import { KANJI_RADICALS } from '../../../shared/kanjiRadicals';
import { useAssets, type AssetView } from '../../assetStore';
import { useT } from '../../i18n';
import { useVisibleInterval } from '../../useVisibleInterval';
import { LANG_TAGS, type TVars } from '../../../shared/i18n/core';
import { blancToolLabel } from './blancToolLabels';
import type {
  AgentExecutionEvent,
  AgentTask,
  AgentTaskStep,
} from '../../../shared/localAgent';
import { selectAgentMemoryContext } from '../../../shared/localAgentMemory';
import { loadLocalAgentMemory } from '../../localAgentMemoryStore';
import { registerLocalAgentTriggerHandler } from '../../localAgentTriggerRunner';
import { loadLocalAgentSettings, saveLocalAgentSettings } from '../../localAgentSettingsStore';
import type { LocalAgentSettings } from '../../../shared/localAgentSettings';
import { addDeckCards } from '../../flashcardDeck';
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
import {
  loadLocalAgentTaskQueue,
  onLocalAgentTaskQueueChanged,
  saveLocalAgentTaskQueue,
} from '../../localAgentTaskQueueStore';
import {
  pendingAgentTaskStep,
  runAgentTaskStep,
  selectAgentQueueRun,
  type AgentQueueRunRefusal,
} from '../../localAgentQueueRun';
import {
  resolveAgentQueuedStepApproval,
  type AgentQueuedStepApprovalFailureCode,
} from '../../../shared/agentStepApproval';
import {
  DEFAULT_AGENT_PROFILES,
  effectiveAgentPermission,
  getActiveAgentProfile,
  underPermissionCeiling,
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
import { AgentAutomationEditor } from '../agent/AgentAutomationEditor';

// No Study OS stylesheet here: every panel in this file renders Blanc's own
// classes (`blanc-*`), so it does not need `studyos-compat.css` (~500 KB). It
// used to pull it at module load, which — while the shell imported this file
// statically — put the whole Study OS sheet into Blanc's startup.

export type BlancAnalyzerResult = {
  level: BookLevelEstimate | null;
  score: ComprehensibilityScore | null;
  unknownLemmas: string[];
};

function formatImmersionDuration(
  totalSeconds: number,
  t: (key: string, vars?: TVars) => string,
): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  if (safe >= 3600) {
    const hours = Math.floor(safe / 3600);
    const minutes = Math.floor((safe % 3600) / 60);
    return t('blanc.ready.immersion.hoursMinutes', { h: hours, m: minutes.toString().padStart(2, '0') });
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

/** Row cap for the notifications table. The overflow is disclosed beneath it — see D137. */
const NOTIFICATION_ROWS = 50;

function notificationTime(ts: number, t: (key: string, vars?: TVars) => string): string {
  const elapsed = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (elapsed < 60) return t('notifications.time.justNow');
  const minutes = Math.floor(elapsed / 60);
  if (minutes < 60) return t('notifications.time.minutes', { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t('notifications.time.hours', { count: hours });
  return t('notifications.time.days', { count: Math.floor(hours / 24) });
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
                {items.slice(0, NOTIFICATION_ROWS).map((item: ShellNotification) => (
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
            {items.length > NOTIFICATION_ROWS && (
              <p className="blanc-note">
                {t('common.moreNotShown', { count: items.length - NOTIFICATION_ROWS })}
              </p>
            )}
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

/**
 * Why a sensitive step could not be confirmed — the same shape as the map above,
 * over the approval gate's own codes.
 *
 * The record is keyed by `AgentQueuedStepApprovalFailureCode`, the strict subset
 * of the gate's failure codes that a caller without a conversation can produce.
 * Keying it by the full union would have meant writing panel text for
 * `stale-provenance` and friends, which no button here can ever reach; keying it
 * by the subset means a code added to the gate breaks this file until it has
 * something to say.
 */
const APPROVAL_REFUSAL_KEYS: Record<AgentQueuedStepApprovalFailureCode, string> = {
  'task-not-found': 'blanc.agent.approvalRefusal.taskNotFound',
  'task-not-runnable': 'blanc.agent.approvalRefusal.taskNotRunnable',
  'step-not-found': 'blanc.agent.approvalRefusal.stepNotFound',
  'step-not-awaiting': 'blanc.agent.approvalRefusal.stepNotAwaiting',
  'step-not-current': 'blanc.agent.approvalRefusal.stepNotCurrent',
  'operation-denied': 'blanc.agent.approvalRefusal.operationDenied',
};

/** Catalog keys for the four built-in agent profiles' names. */
const BUILT_IN_PROFILE_NAME_KEYS: Record<string, string> = {
  'study-tutor': 'blanc.refine.agentProfile.studyTutor',
  'media-assistant': 'blanc.refine.agentProfile.mediaAssistant',
  'research-assistant': 'blanc.refine.agentProfile.researchAssistant',
  'automation-assistant': 'blanc.refine.agentProfile.automationAssistant',
};

/**
 * A profile's name in the UI language. The built-ins are stored with an
 * English factory name; one the user has not renamed is shown translated, and
 * a name the user typed is theirs and shown as typed.
 */
function agentProfileName(
  profile: { id: string; name: string; builtIn?: boolean },
  t: (key: string, vars?: TVars) => string,
): string {
  const key = BUILT_IN_PROFILE_NAME_KEYS[profile.id];
  const factory = DEFAULT_AGENT_PROFILES.find((candidate) => candidate.id === profile.id);
  return key && factory && profile.name === factory.name ? t(key) : profile.name;
}

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


  /**
   * `permissionCeiling` is supplied only by the scheduler path. It is the level the
   * automation was created under, which the automation list already shows the user
   * as that entry's permission; it rides on the queue row so it still applies when
   * the task is run later, from another window, or after a restart.
   */
  const plan = async (
    scheduledObjective = objective,
    permissionCeiling?: LocalAgentSettings['permission'],
  ): Promise<void> => {
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
        // Bounded here and not only at execution: main builds the system prompt and
        // the approved-operation set from these settings, so an automation created at
        // a narrower level would otherwise plan steps its own ceiling then refuses.
        settings: underPermissionCeiling(settings, permissionCeiling),
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
      if (response.task) setTaskQueue((previous) => saveLocalAgentTaskQueue(enqueueAgentTask(previous, response.task as AgentTask, 0, Date.now(), undefined, permissionCeiling)));
      setModel(response.modelFileName ?? '');
      setStatus(response.task ? t('blanc.agent.status.planReadyReview') : t('blanc.agent.status.noApprovedAction'));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t('blanc.agent.status.planFailed'));
    } finally {
      setBusy(false);
    }
  };

  // Both the schedule and the queue are main-owned now. Nothing is pushed *to*
  // main at mount — the scheduler reads the store itself — and a change made in
  // another window arrives as a push, so the panel subscribes instead of
  // trusting the copy it read at mount.
  //
  // Each effect re-reads on subscribe: hydration is asynchronous and can land
  // between the `useState` initializer and the passive effect, which would
  // otherwise leave the panel showing an empty queue until the next edit.
  useEffect(() => {
    setTaskQueue(loadLocalAgentTaskQueue());
    return onLocalAgentTaskQueueChanged(setTaskQueue);
  }, []);



  // This panel is a real automation handler, so it registers as one: main
  // delivers a fire to one claiming renderer and records a fire with none as
  // `missed`. Leaving the tool therefore makes the schedule honestly report
  // "nothing was listening" rather than appear to run — unless the app's
  // background host is mounted, which is the whole reason that host exists.
  //
  // `interactive`, not `background`: while this panel is open it is the surface
  // the user is watching, so it outranks the headless host and the fire is shown
  // rather than only enqueued. The registry owns the claim and the subscription
  // and hands a fire to exactly one handler; claiming here directly would revoke
  // the host's claim on unmount and run the same automation twice until then.
  //
  // The handler is held in a ref and the effect depends on nothing. `plan` is a
  // new function every render, so depending on it re-subscribed — and re-claimed
  // — on every keystroke in the objective box.
  const triggerHandler = useRef<(entry: AgentAutomation) => void>(() => undefined);
  triggerHandler.current = (entry: AgentAutomation): void => {
    if (!settings.enabled) {
      setStatus(t('blanc.agent.status.scheduledReady', { name: entry.name }));
      return;
    }
    setObjective(entry.objective);
    setStatus(t('blanc.agent.status.runningScheduled', { name: entry.name }));
    void plan(entry.objective, entry.permission);
  };

  useEffect(() => registerLocalAgentTriggerHandler(
    'interactive',
    (entry) => triggerHandler.current(entry),
  ), []);

  // Runtime status and the model list are polled only while the window is
  // visible (useVisibleInterval) — they used to poll every 5 s / 15 s in a
  // minimised window too.
  const pollAlive = useRef(true);
  useEffect(() => {
    pollAlive.current = true;
    return () => {
      pollAlive.current = false;
    };
  }, []);
  const refreshRuntimeStatus = (): void => {
    void window.api.localAgentStatus().then((next) => {
      if (pollAlive.current) setRuntimeStatus(next);
    }).catch(() => undefined);
  };
  const refreshModels = (): void => {
    void window.api.localAgentModels().then((models) => {
      if (pollAlive.current) setAvailableModels(models);
    }).catch(() => undefined);
  };
  useEffect(() => {
    refreshRuntimeStatus();
    refreshModels();
  }, []);
  useVisibleInterval(refreshRuntimeStatus, 5_000);
  useVisibleInterval(refreshModels, 15_000);

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
  const readExecutionAuthority = (): {
    permission: LocalAgentSettings['permission'];
    allowedOperations: typeof executableOperations;
  } => {
    // Read at the click, not from the render that made the button. Settings and
    // profiles are shared across windows and may have narrowed meanwhile.
    const liveSettings = loadLocalAgentSettings();
    const liveProfile = getActiveAgentProfile(loadLocalAgentProfiles());
    const enabled = new Set(liveProfile?.enabledOperations ?? []);
    return {
      permission: effectiveAgentPermission(liveSettings.permission, liveProfile),
      allowedOperations: liveProfile
        ? availableOperations.filter((operation) => enabled.has(operation))
        : availableOperations,
    };
  };

  const runStep = async (
    liveQueue: AgentTaskQueue,
    source: AgentTask,
    step: AgentTaskStep,
    confirmed: boolean,
    activateQueuedTask = false,
  ): Promise<void> => {
    setBusy(true);
    setStatus(confirmed ? t('blanc.agent.status.runningConfirmed') : t('blanc.agent.status.runningNext'));
    try {
      const authority = readExecutionAuthority();
      const result = await runAgentTaskStep(liveQueue, source, step, {
        permission: authority.permission,
        // Re-checked at EXECUTION, not only when the plan was built: a queued task outlives
        // the profile that authorized it, so narrowing a profile must take effect on work
        // already sitting in the queue.
        allowedOperations: authority.allowedOperations,
        handlers,
        ...(confirmed ? { confirmedCallIds: new Set([step.request.callId]) } : {}),
      });
      if (result.leaseRefusal || result.leaseCommitFailure) {
        setStatus(t('blanc.agent.status.stepFailed'));
        return;
      }
      if (result.refusal) {
        setStatus(t(APPROVAL_REFUSAL_KEYS[result.refusal.code]));
        return;
      }
      if (activateQueuedTask) {
        setSummary(source.objective);
        setEvents(result.events);
      } else {
        setEvents((previous) => [...previous, ...result.events]);
      }
      setTask(result.task);
      // Main committed the outcome against the freshest leased row and kept a
      // Pause/Cancel made while the handler was awaiting.
      setTaskQueue(result.queue);
      const latest = result.task.steps.find((candidate) => candidate.id === step.id);
      if (latest?.status === 'waiting-confirmation') setStatus(t('blanc.agent.status.confirmationRequired'));
      else if (latest?.status === 'failed') setStatus(latest.error ?? t('blanc.agent.status.stepFailed'));
      else if (result.task.status === 'completed') setStatus(t('blanc.agent.status.taskCompleted'));
      else setStatus(t('blanc.agent.status.stepCompleted'));
    } catch (error) {
      // A rejected IPC or a throwing handler used to escape as an unhandled
      // rejection with the panel's status still saying "Running…".
      setStatus(t('blanc.agent.status.stepFailedDetail', {
        detail: error instanceof Error ? error.message : String(error),
      }));
    } finally {
      setBusy(false);
    }
  };

  const runNext = async (): Promise<void> => {
    if (!task) return;
    const live = loadLocalAgentTaskQueue();
    const selection = selectAgentQueueRun(live, task.id);
    if (!selection.ok) {
      setStatus(t(QUEUE_REFUSAL_KEYS[selection.reason]));
      return;
    }
    await runStep(live, selection.item.task, selection.step, false);
  };

  /**
   * The confirm verb — the one verb here that *grants a permission*, and so the
   * one that has to ask the gate.
   *
   * It used to call `runStep(task, step, true)` off the panel's own in-memory
   * task and consult `resolveAgentStepApproval` not at all. Not out of neglect:
   * that resolver wanted an `AgentConversation`, a message id and a card id, and
   * this panel has never had any of the three, so the only shape of the gate
   * that existed was one it could not call. It answered the question itself
   * instead, and answered a shorter version — the profile allow-list, and
   * nothing about the queue row, the step's own status, or whether the task is
   * even on that step. Cancel a plan in the queue table below and this button,
   * sitting a few pixels above it, still ran the step.
   *
   * `resolveAgentQueuedStepApproval` is that gate with the card half lifted off,
   * so both surfaces now ask one question. The panel's `task` supplies a task id
   * and a step id and nothing else; every decision — and the step that actually
   * runs — comes from the live queue.
   */
  const confirmAndRun = async (): Promise<void> => {
    if (!task) return;
    const candidate = pendingAgentTaskStep(task, 'confirm');
    if (!candidate) {
      setStatus(t(APPROVAL_REFUSAL_KEYS['step-not-awaiting']));
      return;
    }
    // Read now, not from `taskQueue` state: the gate's whole value is that it
    // runs against the queue as it is at the moment of the grant, and a pause or
    // a cancel from another window lands in the store before it lands in state.
    const live = loadLocalAgentTaskQueue();
    const authority = readExecutionAuthority();
    const resolution = resolveAgentQueuedStepApproval(
      live,
      task.id,
      candidate.id,
      authority.permission,
      authority.allowedOperations,
    );
    if (!resolution.ok) {
      setStatus(t(APPROVAL_REFUSAL_KEYS[resolution.code]));
      return;
    }
    // The queue's copy of both, not the panel's: that is the pair the gate just
    // judged, and running a different one would put the check back beside the
    // thing it was supposed to be checking.
    const item = live.items.find((entry) => entry.task.id === resolution.approval.taskId);
    const step = item?.task.steps.find((entry) => entry.id === resolution.approval.stepId);
    if (!item || !step) {
      setStatus(t(APPROVAL_REFUSAL_KEYS['step-not-found']));
      return;
    }
    await runStep(live, item.task, step, true);
  };

  /**
   * The path the persisted queue never had: an item becomes the live task, and then runs. Given
   * no id this takes the highest-priority queued item, which is what `nextRunnableAgentQueueItem`
   * was written for and never got to do. A step that needs confirmation still only reaches
   * `waiting-confirmation` here — the user confirms it afterwards on the now-live task.
   */
  const runQueued = async (id?: string): Promise<void> => {
    const live = loadLocalAgentTaskQueue();
    const selection = selectAgentQueueRun(live, id);
    if (!selection.ok) {
      setStatus(t(QUEUE_REFUSAL_KEYS[selection.reason]));
      return;
    }
    await runStep(live, selection.item.task, selection.step, false, true);
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
                <option key={profile.id} value={profile.id}>{agentProfileName(profile, t)}</option>
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
            {events.slice(-20).map((event, index) => <li key={`${event.timestamp}-${index}`}>{event.type} · {event.operation}{event.error ? ` · ${event.error}` : ''}{event.durationMs != null ? ` · ${t('blanc.ready.agent.durationMs', { ms: event.durationMs })}` : ''}</li>)}
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
                {item.status === 'paused' && !item.execution && <button type="button" onClick={() => setTaskQueue(saveLocalAgentTaskQueue(resumeAgentQueueItem(taskQueue, item.id)))}>{t('common.resume')}</button>}
                {(item.status === 'queued' || item.status === 'paused') && <button type="button" onClick={() => setTaskQueue(saveLocalAgentTaskQueue(cancelAgentQueueItem(taskQueue, item.id)))}>{t('common.cancel')}</button>}
                {item.status === 'queued' && <button type="button" onClick={() => setTaskQueue(saveLocalAgentTaskQueue(prioritizeAgentQueueItem(taskQueue, item.id)))}>{t('blanc.agent.action.prioritize')}</button>}
              </div></td></tr>
            ))}
          </tbody></table></div>
        )}
      </fieldset>
      <fieldset>
        <legend>{t('blanc.agent.section.scheduled')}</legend>
        {/*
          The schedule editor is shared with Settings > AI, which is where the
          main Agent's automations are managed; Blanc renders the same one.
        */}
        <AgentAutomationEditor variant="blanc" />
      </fieldset>
    </div>
  );
}

export function DifficultyAnalyzerPanel() {
  const { t } = useT();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<BlancAnalyzerResult | null>(null);

  const runCheck = async (): Promise<void> => {
    const sample = text.trim();
    if (!sample) {
      setError(t('blanc.ready.difficulty.pasteFirst'));
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
        <legend>{blancToolLabel(t, 'difficulty-analyzer')}</legend>
        <label>
          {t('blanc.ready.difficulty.textSample')}
          <textarea
            rows={6}
            value={text}
            lang="ja"
            placeholder={t('blanc.ready.difficulty.placeholder')}
            onChange={(event) => setText(event.target.value)}
          />
        </label>
        <div className="blanc-row-actions">
          <button type="button" onClick={() => void runCheck()} disabled={busy || !text.trim()}>
            {busy ? t('blanc.ready.difficulty.checking') : t('blanc.ready.difficulty.check')}
          </button>
        </div>
        {error && <p className="blanc-error">{error}</p>}
        {result?.level && (
          <div className="blanc-result-box">
            <span className="blanc-status">{result.level.label}</span>
            {' · '}
            {t(
              result.level.metThreshold
                ? 'blanc.ready.difficulty.bandCoverage'
                : 'blanc.ready.difficulty.bandCoverageBelow',
              { pct: Math.round(result.level.confidence * 100) },
            )}
          </div>
        )}
        {score && score.totalWords > 0 && (
          <div className="blanc-result-box">
            {t('blanc.ready.difficulty.comprehension', {
              pct: knownPercent(score),
              known: score.knownWords,
              count: score.totalWords,
            })}
          </div>
        )}
        {unknownLemmas.length > 0 && (
          <p className="blanc-note">
            {t('blanc.ready.difficulty.unknownLemmas', {
              n: unknownLemmas.length,
              list: unknownLemmas.slice(0, 20).join(', '),
            })}
            {unknownLemmas.length > 20 ? '…' : ''}
          </p>
        )}
        {result && !result.level && score && score.totalWords === 0 && (
          <p className="blanc-warning">{t('blanc.ready.difficulty.noLevel')}</p>
        )}
      </fieldset>
    </div>
  );
}

export function ImmersionTrackerPanel() {
  const { t, lang } = useT();
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
      .catch(() => setError(t('blanc.ready.immersion.unavailable')));
    const off = window.api.onImmersionSitesChanged(applyStore);
    return () => off?.();
  }, [applyStore, lang]);

  return (
    <div className="blanc-tool-detail">
      <fieldset>
        <legend>{blancToolLabel(t, 'immersion-tracker')}</legend>
        <p className="blanc-note">{t('blanc.ready.immersion.note')}</p>
        {error && <p className="blanc-error">{error}</p>}
        {!sites.length ? (
          <p className="blanc-note">{t('blanc.ready.immersion.empty')}</p>
        ) : (
          <div className="blanc-table-wrap">
            <table className="blanc-table">
              <thead>
                <tr>
                  <th>{t('blanc.ready.immersion.col.site')}</th>
                  <th>{t('blanc.ready.immersion.col.time')}</th>
                  <th>{t('blanc.ready.immersion.col.chars')}</th>
                  <th>{t('blanc.ready.immersion.col.streak')}</th>
                </tr>
              </thead>
              <tbody>
                {sites.map((site) => (
                  <tr key={site.id}>
                    <td title={site.url}>{site.title || site.url}</td>
                    <td>{formatImmersionDuration(site.totalSeconds, t)}</td>
                    <td>{site.totalChars.toLocaleString(LANG_TAGS[lang])}</td>
                    <td>{t('blanc.ready.immersion.streakDays', { count: site.streakDays })}</td>
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
  const { t } = useT();
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
        <legend>{blancToolLabel(t, 'frequency-explorer')}</legend>
        <div className="blanc-form-grid">
          <label>
            {t('blanc.ready.frequency.term')}
            <input
              value={query}
              lang="ja"
              placeholder={t('blanc.ready.frequency.placeholder')}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                // Enter confirms an IME conversion; it must not look up yet.
                if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
                if (event.key === 'Enter') void lookup();
              }}
            />
          </label>
        </div>
        <div className="blanc-row-actions">
          <button type="button" onClick={() => void lookup()} disabled={busy || !query.trim()}>
            {busy ? t('blanc.ready.frequency.lookingUp') : t('blanc.ready.frequency.lookup')}
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
              <div>
                {t('blanc.ready.frequency.rank', { rank: entry.frequency })}
              </div>
            ) : (
              <p className="blanc-note">{t('blanc.ready.frequency.noRank')}</p>
            )}
            {firstSenseSummary(entry) && <p className="blanc-note">{firstSenseSummary(entry)}</p>}
          </div>
        )}
        {result && !entry && !error && <p className="blanc-warning">{t('blanc.ready.frequency.noEntries')}</p>}
      </fieldset>
    </div>
  );
}

/** Deck folder the importer files cards under — a stored folder name, not UI text. */
const SUBTITLE_FOLDER = 'Subtitles';

export function SubtitleImporterPanel() {
  const { t } = useT();
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
      setStatus(
        parsed.length
          ? t('blanc.ready.subtitle.parsed', { count: parsed.length, file: file.name })
          : t('blanc.ready.subtitle.noCues'),
      );
    } catch (err) {
      setCues([]);
      setFileName('');
      setStatus(err instanceof Error ? err.message : String(err));
    }
  };

  const sendToFlashcards = (): void => {
    if (!cues.length) {
      setStatus(t('blanc.ready.subtitle.loadFirst'));
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
        folder: SUBTITLE_FOLDER,
      }));
    addDeckCards(cards);
    setStatus(t('blanc.ready.subtitle.added', { count: cards.length, folder: SUBTITLE_FOLDER }));
  };

  return (
    <div className="blanc-tool-detail">
      <fieldset>
        <legend>{blancToolLabel(t, 'subtitle-importer')}</legend>
        <label>
          {t('blanc.ready.subtitle.file')}
          <input type="file" accept=".srt,.vtt,.ass,.ssa,.lrc,.txt" onChange={(event) => void onFile(event)} />
        </label>
        {fileName && <p className="blanc-note">{fileName}</p>}
        {cues.length > 0 && (
          <>
            <div className="blanc-result-box">{t('blanc.ready.subtitle.cuesLoaded', { count: cues.length })}</div>
            <ul className="blanc-plain-list">
              {cues.slice(0, 5).map((cue, index) => (
                <li key={`${cue.start}-${index}`}>{cue.text.replace(/\n/g, ' / ')}</li>
              ))}
            </ul>
            {cues.length > 5 && <p className="blanc-note">{t('blanc.ready.subtitle.showingFirst', { count: 5 })}</p>}
          </>
        )}
        <div className="blanc-row-actions">
          <button type="button" onClick={sendToFlashcards} disabled={!cues.length}>
            {t('blanc.ready.subtitle.send')}
          </button>
        </div>
        {status && <p className="blanc-note">{status}</p>}
      </fieldset>
    </div>
  );
}

export function KanjiInspectorPanel() {
  const { t } = useT();
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [entry, setEntry] = useState<DictEntry | null>(null);
  const char = [...value.trim()][0] ?? '';

  const inspect = async (): Promise<void> => {
    if (!char) {
      setError(t('blanc.ready.kanji.enterOne'));
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
        <legend>{blancToolLabel(t, 'kanji-inspector')}</legend>
        <div className="blanc-form-grid">
          <label>
            {t('blanc.ready.kanji.character')}
            <input
              value={value}
              lang="ja"
              maxLength={8}
              placeholder="一"
              onChange={(event) => setValue(event.target.value)}
              onKeyDown={(event) => {
                // Enter confirms an IME conversion; it must not inspect yet.
                if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
                if (event.key === 'Enter') void inspect();
              }}
            />
          </label>
        </div>
        <div className="blanc-row-actions">
          <button type="button" onClick={() => void inspect()} disabled={busy || !char}>
            {busy ? t('blanc.ready.kanji.inspecting') : t('blanc.ready.kanji.inspect')}
          </button>
        </div>
        {char && (
          <p className="blanc-note">
            {t(isRadical ? 'blanc.ready.kanji.isRadical' : 'blanc.ready.kanji.notRadical', { char })}
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
  const { t } = useT();
  const [store, setStore] = useState<YtPlaylistsStore>(() => normalizeYtStore(null));
  const [url, setUrl] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const applyStore = useCallback((next: YtPlaylistsStore) => {
    setStore(normalizeYtStore(next));
  }, []);

  useEffect(() => {
    void window.api.ytList().then(applyStore).catch((err: unknown) => {
      setError(err instanceof Error ? err.message : String(err));
    });
    return window.api.onYtChanged(applyStore);
  }, [applyStore]);

  // Every IPC here can reject (network, yt-dlp missing, a main-side throw). The
  // busy line is cleared in `finally`, so a failure reads as an error instead of
  // a panel stuck on "Syncing…" forever.
  const runYt = async (busyLabel: string, work: () => Promise<void>): Promise<void> => {
    setBusy(busyLabel);
    setError('');
    try {
      await work();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy('');
    }
  };

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
    await runYt(t('blanc.ready.youtube.syncing'), async () => {
      const result = await window.api.ytAddPlaylist(trimmed);
      if ('error' in result) {
        setError(result.error);
        return;
      }
      applyStore(result.store);
      setUrl('');
    });
  };

  const downloadSelected = async (): Promise<void> => {
    const ids = [...selected];
    if (!ids.length) return;
    await runYt(t('blanc.ready.youtube.downloading'), async () => {
      const result = await window.api.ytDownloadVideos(ids);
      applyStore(result.store);
      const fail = result.results.find((row) => !row.ok);
      if (fail?.error) setError(fail.error);
      setSelected(new Set());
    });
  };

  const togglePlan = async (video: YtVideo): Promise<void> => {
    try {
      if (planIds.has(video.id)) {
        applyStore(await window.api.ytRemoveFromPlanToWatch([video.id]));
      } else {
        applyStore(await window.api.ytAddToPlanToWatch([video.id]));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="blanc-tool-detail">
      <fieldset>
        <legend>{blancToolLabel(t, 'youtube-library')}</legend>
        <div className="blanc-form-grid">
          <label>
            {t('blanc.ready.youtube.playlistUrl')}
            <input
              value={url}
              placeholder="https://www.youtube.com/playlist?list=…"
              onChange={(event) => setUrl(event.target.value)}
              onKeyDown={(event) => {
                // Enter confirms an IME conversion; it must not add the playlist yet.
                if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
                if (event.key === 'Enter') void addPlaylist();
              }}
            />
          </label>
        </div>
        <div className="blanc-row-actions">
          <button type="button" onClick={() => void addPlaylist()} disabled={!!busy || !url.trim()}>
            {t('blanc.ready.youtube.addPlaylist')}
          </button>
          <button type="button" onClick={() => void downloadSelected()} disabled={!!busy || !selected.size}>
            {t('blanc.ready.youtube.downloadSelected')}
          </button>
        </div>
        {busy && <p className="blanc-status">{busy}</p>}
        {error && <p className="blanc-error">{error}</p>}
        {!videos.length ? (
          <p className="blanc-note">{t('blanc.ready.youtube.empty')}</p>
        ) : (
          <div className="blanc-table-wrap">
            <table className="blanc-table">
              <thead>
                <tr>
                  <th />
                  <th>{t('blanc.ready.youtube.col.title')}</th>
                  <th>{t('blanc.ready.youtube.col.duration')}</th>
                  <th>{t('blanc.ready.youtube.col.plan')}</th>
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
                        {planIds.has(video.id)
                          ? t('blanc.ready.youtube.removePlan')
                          : t('blanc.ready.youtube.planToWatch')}
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
        <p className="blanc-note">{t('blanc.ready.models.empty')}</p>
      ) : (
        topLevel.map((view) => {
          const busy = isBusy(view.status.state);
          const showBar = busy || view.status.state === 'paused';
          return (
            <div key={view.spec.id} className="blanc-result-box" style={{ marginBottom: '0.75rem' }}>
              <div>
                <strong>{view.spec.name}</strong>
                {view.spec.lang !== 'any' && (
                  <span className="blanc-status">
                    {' · '}
                    {view.spec.lang === 'ja' ? t('blanc.ready.models.langJa') : t('blanc.ready.models.langZh')}
                  </span>
                )}
              </div>
              <p className="blanc-note">
                {view.spec.descriptionKey ? t(view.spec.descriptionKey) : view.spec.description}
              </p>
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
                    {t('common.downloadSize', { size: formatBytes(view.spec.sizeBytes) })}
                  </button>
                )}
                {view.status.state === 'failed' && (
                  <button type="button" onClick={() => void onStart(view.spec)}>
                    {t('common.tryAgain')}
                  </button>
                )}
                {(view.status.state === 'downloading' || view.status.state === 'queued') && (
                  <button type="button" onClick={() => pause(view.spec.id)}>
                    {t('common.pause')}
                  </button>
                )}
                {view.status.state === 'paused' && (
                  <button type="button" onClick={() => void onStart(view.spec)}>
                    {t('common.resume')}
                  </button>
                )}
                {(busy || view.status.state === 'paused') && view.status.state !== 'verifying' && (
                  <button type="button" onClick={() => cancel(view.spec.id)}>
                    {t('common.cancel')}
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

// The retired workspace-launcher store lives in its own tiny module, so the
// App Drawer's one-time migration does not pull this whole panel file (and the
// agent registry behind it) into the App Drawer's chunk.
export { WORKSPACE_LAUNCHER_KEY, readWorkspaces, type Workspace, type WorkspaceTarget } from './blancWorkspaces';

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
  /** The format this item was actually converted to (the picker may have changed since). */
  outputFormat?: BatchImageFormat;
  error: string;
}

async function convertImageFile(
  file: File,
  format: BatchImageFormat,
  quality: number,
  t: (key: string, vars?: TVars) => string,
): Promise<Blob> {
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
    if (!ctx) throw new Error(t('blanc.ready.batch.canvasUnavailable'));
    if (format === 'image/jpeg') {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.drawImage(image, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, format, format === 'image/png' ? undefined : quality);
    });
    if (!blob) throw new Error(t('blanc.ready.batch.conversionFailed'));
    return blob;
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

export function BatchConverterPanel() {
  const { t } = useT();
  const [items, setItems] = useState<BatchConvertItem[]>([]);
  const [format, setFormat] = useState<BatchImageFormat>('image/webp');
  const [quality, setQuality] = useState(0.86);
  const [busy, setBusy] = useState(false);
  // Converted files are blob: URLs; the ones still held when the user leaves
  // the tool were never revoked, so each batch's output stayed in memory for
  // the rest of the session.
  const itemsRef = useRef(items);
  itemsRef.current = items;
  useEffect(() => () => {
    for (const item of itemsRef.current) {
      if (item.outputUrl) URL.revokeObjectURL(item.outputUrl);
    }
  }, []);

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
    // The format and quality of THIS run: the picker can change while it runs.
    const runFormat = format;
    for (const target of pending) {
      setItems((prev) => prev.map((item) => (item.id === target.id ? { ...item, state: 'converting', error: '' } : item)));
      try {
        const blob = await convertImageFile(target.file, runFormat, quality, t);
        const outputUrl = URL.createObjectURL(blob);
        setItems((prev) => prev.map((item) => {
          if (item.id !== target.id) return item;
          if (item.outputUrl) URL.revokeObjectURL(item.outputUrl);
          return { ...item, state: 'done', outputUrl, outputSize: blob.size, outputFormat: runFormat };
        }));
      } catch (error) {
        setItems((prev) => prev.map((item) => (
          item.id === target.id
            ? { ...item, state: 'failed', error: error instanceof Error ? error.message : t('blanc.ready.batch.couldNotConvert') }
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
      // Named for the format it was converted to, not whatever is selected now.
      link.download = batchOutputName(item.file.name, item.outputFormat ?? format);
      link.click();
    }
  };

  return (
    <div className="blanc-tool-detail">
      <fieldset>
        <legend>{blancToolLabel(t, 'batch-converter')}</legend>
        <p className="blanc-note">{t('blanc.ready.batch.note')}</p>
        <label>
          {t('blanc.ready.batch.images')}
          <input type="file" accept="image/*" multiple onChange={(event) => { chooseFiles(event.target.files); event.target.value = ''; }} />
        </label>
        <div className="blanc-form-grid">
          <label>
            {t('blanc.ready.batch.output')}
            <select value={format} disabled={busy} onChange={(event) => setFormat(event.target.value as BatchImageFormat)}>
              <option value="image/webp">WebP</option>
              <option value="image/png">PNG</option>
              <option value="image/jpeg">JPEG</option>
            </select>
          </label>
          <label>
            {t('blanc.ready.batch.quality')}
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
            {busy ? t('blanc.ready.batch.converting') : t('blanc.ready.batch.convertQueued')}
          </button>
          <button type="button" disabled={busy || !doneItems.length} onClick={saveAll}>
            {t('blanc.ready.batch.saveAll', { count: doneItems.length })}
          </button>
          <button type="button" disabled={busy || !items.length} onClick={clearAllItems}>
            {t('blanc.ready.batch.clear')}
          </button>
          <span className="blanc-note">
            {!items.length
              ? t('blanc.ready.batch.chooseImages')
              : totalOut
                ? t('blanc.ready.batch.summaryWithOut', {
                    count: items.length,
                    in: formatBytes(totalIn),
                    out: formatBytes(totalOut),
                  })
                : t('blanc.ready.batch.summary', { count: items.length, in: formatBytes(totalIn) })}
          </span>
        </div>
      </fieldset>
      {items.length > 0 && (
        <fieldset>
          <legend>{t('blanc.ready.batch.queue')}</legend>
          <div className="blanc-table-wrap">
            <table className="blanc-table">
              <thead>
                <tr>
                  <th>{t('blanc.ready.batch.col.file')}</th>
                  <th>{t('blanc.ready.batch.col.size')}</th>
                  <th>{t('blanc.ready.batch.col.status')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td>{item.file.name}</td>
                    <td>{formatBytes(item.file.size)}</td>
                    <td>
                      {item.state === 'queued' && t('blanc.ready.batch.state.queued')}
                      {item.state === 'converting' && t('blanc.ready.batch.converting')}
                      {item.state === 'done' && t('blanc.ready.batch.state.done', { size: formatBytes(item.outputSize) })}
                      {item.state === 'failed' && (item.error || t('blanc.ready.batch.state.failed'))}
                    </td>
                    <td>
                      {item.state === 'done' && (
                        <a className="blanc-file-link" href={item.outputUrl} download={batchOutputName(item.file.name, item.outputFormat ?? format)}>
                          {t('common.save')}
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
