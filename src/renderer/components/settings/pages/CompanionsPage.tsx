import { useEffect, useMemo, useState } from 'react';
import SettingsCard from '../SettingsCard';
import { confirmDialog } from '../../ui';
import { useSettings } from '../SettingsContext';
import {
  COMPANION_DEFS,
  type CompanionReactivity,
  type CompanionTypeId,
} from '../../../environment';
import {
  getDefaultBuddyRoutines,
  resetBuiltinRoutines,
  resolvePrimaryRoutineId,
  resolveSecondaryRoutineId,
  runBuddyRoutine,
  sanitizeStep,
  type BuddyRoutine,
  type BuddyStep,
} from '../../../environment/buddyRoutines';
import { COMMAND_CATALOG, SHORTCUT_OPEN_APPS } from '../../../keyboardShortcuts';
import { hasDiscoveredAero, onAeroDiscoveryChanged } from '../../../aeroDiscovery';

const STEP_TYPES: { id: BuddyStep['type']; label: string }[] = [
  { id: 'openApp', label: 'Open app' },
  { id: 'runCommand', label: 'Run command' },
  { id: 'toggleEnv', label: 'Toggle atmosphere' },
  { id: 'setMood', label: 'Set mood / status' },
  { id: 'wait', label: 'Wait' },
  { id: 'notify', label: 'Notify' },
  { id: 'music', label: 'Music control' },
  { id: 'clipboard', label: 'Open clipboard' },
  { id: 'palette', label: 'Command palette' },
  { id: 'speak', label: 'Speak (TTS)' },
  { id: 'dispatch', label: 'Dispatch event' },
  { id: 'routine', label: 'Run another routine' },
];

function blankStep(type: BuddyStep['type']): BuddyStep {
  switch (type) {
    case 'openApp':
      return { type, appId: 'flashcards' };
    case 'runCommand':
      return { type, commandId: COMMAND_CATALOG[0]?.id ?? 'nav.palette' };
    case 'toggleEnv':
      return { type, key: 'particles', value: 'toggle' };
    case 'setMood':
      return { type, mood: 'happy', status: 'Ready' };
    case 'wait':
      return { type, ms: 500 };
    case 'notify':
      return { type, title: 'Buddy', body: '' };
    case 'music':
      return { type, action: 'playPause' };
    case 'clipboard':
      return { type, action: 'open' };
    case 'palette':
      return { type, mode: 'commands' };
    case 'speak':
      return { type, text: 'こんにちは' };
    case 'dispatch':
      return { type, event: 'noctis:pulse', detail: '' };
    case 'routine':
      return { type, routineId: 'br-buddy-review' };
  }
}

export default function CompanionsPage() {
  const { env, patchEnv, deskPrefs, patchDesk, seg, focusSettingId } = useSettings();
  const [aeroDiscovered, setAeroDiscovered] = useState(hasDiscoveredAero);
  useEffect(() => onAeroDiscoveryChanged(setAeroDiscovered), []);
  const companionDefs = useMemo(() => COMPANION_DEFS(), [aeroDiscovered]);
  const routines = env.buddyRoutines?.length ? env.buddyRoutines : getDefaultBuddyRoutines();
  const [editId, setEditId] = useState<string>(routines[0]?.id ?? '');
  const [testMsg, setTestMsg] = useState('');
  const selectedType = companionDefs.find((d) => d.id === 'study-buddy')?.id ?? 'study-buddy';
  const [assignType, setAssignType] = useState<CompanionTypeId>(selectedType);

  const editing = useMemo(
    () => routines.find((r) => r.id === editId) ?? routines[0] ?? null,
    [routines, editId],
  );

  const instancesOfType = (env.companions ?? []).filter((c) => c.typeId === assignType);
  const sample =
    instancesOfType[0] ??
    ({
      id: `template-${assignType}`,
      typeId: assignType,
      x: 0,
      y: 0,
      facing: 1 as const,
      mood: 'calm' as const,
    });

  const setRoutines = (next: BuddyRoutine[]) => patchEnv({ buddyRoutines: next });

  const updateRoutine = (id: string, patch: Partial<BuddyRoutine>) => {
    setRoutines(routines.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const updateStep = (idx: number, step: BuddyStep) => {
    if (!editing) return;
    const steps = editing.steps.map((s, i) => (i === idx ? step : s));
    updateRoutine(editing.id, { steps });
  };

  const addStep = () => {
    if (!editing) return;
    updateRoutine(editing.id, { steps: [...editing.steps, blankStep('openApp')] });
  };

  const removeStep = (idx: number) => {
    if (!editing) return;
    updateRoutine(editing.id, { steps: editing.steps.filter((_, i) => i !== idx) });
  };

  const moveStep = (idx: number, dir: -1 | 1) => {
    if (!editing) return;
    const j = idx + dir;
    if (j < 0 || j >= editing.steps.length) return;
    const steps = [...editing.steps];
    const t = steps[idx];
    steps[idx] = steps[j];
    steps[j] = t;
    updateRoutine(editing.id, { steps });
  };

  const createRoutine = () => {
    const id = `br-user-${Date.now().toString(36)}`;
    const r: BuddyRoutine = {
      id,
      name: 'New routine',
      forType: assignType,
      steps: [blankStep('openApp'), blankStep('setMood')],
      builtin: false,
    };
    setRoutines([...routines, r]);
    setEditId(id);
  };

  const deleteRoutine = async () => {
    if (!editing || editing.builtin) return;
    const ok = await confirmDialog({
      title: 'Delete routine',
      message: `Delete routine “${editing.name}”?`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    const next = routines.filter((r) => r.id !== editing.id);
    setRoutines(next);
    setEditId(next[0]?.id ?? '');
  };

  const assignPrimary = (routineId: string) => {
    const companions = (env.companions ?? []).map((c) =>
      c.typeId === assignType ? { ...c, primaryRoutineId: routineId } : c,
    );
    // If no instances yet, still store on a seed via companions array after enable
    patchEnv({ companions });
  };

  const assignSecondary = (routineId: string) => {
    const companions = (env.companions ?? []).map((c) =>
      c.typeId === assignType ? { ...c, secondaryRoutineId: routineId } : c,
    );
    patchEnv({ companions });
  };

  const testRun = async () => {
    if (!editing) return;
    setTestMsg('Running…');
    const res = await runBuddyRoutine(editing.id, {
      companionId: sample.id,
      typeId: assignType,
      patchCompanion: () => undefined,
    });
    setTestMsg(res.ok ? 'OK — routine finished.' : res.error ?? 'Failed.');
  };

  const typeRoutines = routines.filter(
    (r) => !r.forType || r.forType === '*' || r.forType === assignType,
  );

  return (
    <>
      <SettingsCard
        id="companions"
        title="Companions"
        description="Desktop buddies. Enable the living layer first (Atmosphere). Click a buddy to run its primary routine; right-click for the menu."
        highlight={focusSettingId === 'companions'}
        trailing={
          <label className="os-toggle os-toggle-compact">
            <input
              type="checkbox"
              checked={env.companionsEnabled}
              disabled={!env.enabled}
              onChange={(e) => patchEnv({ companionsEnabled: e.target.checked })}
              aria-label="Show in-app companions"
            />
            <span>{env.companionsEnabled ? 'On' : 'Off'}</span>
          </label>
        }
      >
        <div className="os-viz-row" style={{ flexWrap: 'wrap' }}>
          <span className="os-viz-label muted">Who</span>
          {companionDefs.map((d) => {
            const on = env.companionTypes.includes(d.id);
            return (
              <button
                key={d.id}
                type="button"
                className={seg(on)}
                disabled={!env.enabled || !env.companionsEnabled}
                title={d.blurb}
                onClick={() => {
                  const next: CompanionTypeId[] = on
                    ? env.companionTypes.filter((id) => id !== d.id)
                    : [...env.companionTypes, d.id];
                  patchEnv({
                    companionTypes: next.length ? next : [d.id],
                    companions: [],
                  });
                }}
              >
                {d.label}
              </button>
            );
          })}
        </div>
        <div className="os-viz-row">
          <span className="os-viz-label muted">Reactivity</span>
          {([
            ['quiet', 'Quiet'],
            ['normal', 'Normal'],
            ['playful', 'Playful'],
          ] as [CompanionReactivity, string][]).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={seg(env.companionReactivity === id)}
              disabled={!env.enabled || !env.companionsEnabled}
              onClick={() => patchEnv({ companionReactivity: id })}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="os-toggle">
          <input
            type="checkbox"
            checked={env.companionCelebrate}
            disabled={!env.enabled || !env.companionsEnabled}
            onChange={(e) => patchEnv({ companionCelebrate: e.target.checked })}
          />
          <span>Celebrate study / card progress</span>
        </label>
        <label className="os-toggle">
          <input
            type="checkbox"
            checked={env.companionPauseWhenStudying}
            disabled={!env.enabled || !env.companionsEnabled}
            onChange={(e) => patchEnv({ companionPauseWhenStudying: e.target.checked })}
          />
          <span>Calmer movement while focused</span>
        </label>
      </SettingsCard>

      <SettingsCard
        id="buddy-programmer"
        title="Buddy programmer"
        description="Build command chains. Left-click runs primary; double-click runs secondary; menu lists more."
        highlight={focusSettingId === 'buddy-programmer'}
      >
        <div className="buddy-prog-toolbar">
          <label className="pl-field">
            <span className="muted">Buddy type</span>
            <select
              className="set-select"
              value={assignType}
              onChange={(e) => setAssignType(e.target.value as CompanionTypeId)}
            >
              {companionDefs.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                </option>
              ))}
            </select>
          </label>
          <label className="pl-field">
            <span className="muted">Primary (click)</span>
            <select
              className="set-select"
              value={resolvePrimaryRoutineId(sample)}
              onChange={(e) => assignPrimary(e.target.value)}
            >
              {typeRoutines.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>
          <label className="pl-field">
            <span className="muted">Secondary (double-click)</span>
            <select
              className="set-select"
              value={resolveSecondaryRoutineId(sample)}
              onChange={(e) => assignSecondary(e.target.value)}
            >
              {typeRoutines.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="buddy-prog-toolbar">
          <label className="pl-field grow">
            <span className="muted">Edit routine</span>
            <select
              className="set-select"
              value={editing?.id ?? ''}
              onChange={(e) => setEditId(e.target.value)}
            >
              {routines.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                  {r.builtin ? ' (built-in)' : ''}
                  {r.forType && r.forType !== '*' ? ` · ${r.forType}` : ''}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="btn small" onClick={createRoutine}>
            New routine
          </button>
          <button type="button" className="btn small" onClick={() => void testRun()} disabled={!editing}>
            Test run
          </button>
          <button
            type="button"
            className="btn small"
            onClick={async () => {
              const ok = await confirmDialog({
                title: 'Reset built-in routines',
                message: 'Reset all built-in routines to defaults? Custom routines are kept.',
                confirmLabel: 'Reset',
                danger: true,
              });
              if (!ok) return;
              setRoutines(resetBuiltinRoutines(routines));
            }}
          >
            Reset built-ins
          </button>
          {editing && !editing.builtin && (
            <button type="button" className="btn small" onClick={deleteRoutine}>
              Delete
            </button>
          )}
        </div>
        {testMsg && <p className="muted os-set-hint">{testMsg}</p>}

        {editing && (
          <div className="buddy-prog-editor">
            <div className="buddy-prog-toolbar">
              <label className="pl-field grow">
                <span className="muted">Name</span>
                <input
                  value={editing.name}
                  disabled={editing.builtin}
                  onChange={(e) => updateRoutine(editing.id, { name: e.target.value })}
                />
              </label>
              <label className="pl-field">
                <span className="muted">For type</span>
                <select
                  className="set-select"
                  value={editing.forType ?? '*'}
                  disabled={editing.builtin}
                  onChange={(e) =>
                    updateRoutine(editing.id, {
                      forType: e.target.value === '*' ? '*' : (e.target.value as CompanionTypeId),
                    })
                  }
                >
                  <option value="*">Any</option>
                  {companionDefs.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <p className="muted os-set-hint">Steps run top to bottom. Built-ins are read-only (duplicate via New).</p>
            <ul className="buddy-step-list">
              {editing.steps.map((step, idx) => (
                <li key={idx} className="buddy-step-row">
                  <select
                    className="set-select"
                    disabled={editing.builtin}
                    value={step.type}
                    onChange={(e) => {
                      const t = e.target.value as BuddyStep['type'];
                      updateStep(idx, blankStep(t));
                    }}
                  >
                    {STEP_TYPES.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                  <StepFields
                    step={step}
                    disabled={!!editing.builtin}
                    routines={routines}
                    onChange={(s) => updateStep(idx, s)}
                  />
                  {!editing.builtin && (
                    <div className="buddy-step-actions">
                      <button type="button" className="btn small" onClick={() => moveStep(idx, -1)}>
                        Up
                      </button>
                      <button type="button" className="btn small" onClick={() => moveStep(idx, 1)}>
                        Down
                      </button>
                      <button type="button" className="btn small" onClick={() => removeStep(idx)}>
                        Remove
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
            {!editing.builtin && (
              <button type="button" className="btn small" onClick={addStep}>
                Add step
              </button>
            )}
            {editing.builtin && (
              <button
                type="button"
                className="btn small"
                onClick={() => {
                  const id = `br-user-${Date.now().toString(36)}`;
                  const fork: BuddyRoutine = {
                    ...editing,
                    id,
                    name: `${editing.name} (copy)`,
                    builtin: false,
                    steps: editing.steps.map((s) => sanitizeStep(s)!).filter(Boolean),
                  };
                  setRoutines([...routines, fork]);
                  setEditId(id);
                }}
              >
                Duplicate as editable
              </button>
            )}
          </div>
        )}
      </SettingsCard>

      <SettingsCard
        id="os-pets"
        title="Windows desktop pets"
        description="Transparent always-on-top overlay. Click a pet to focus Study OS and run its primary routine."
        highlight={focusSettingId === 'os-pets'}
      >
        <label className="os-toggle">
          <input
            type="checkbox"
            checked={env.companionsOnOsDesktop}
            disabled={!env.enabled || !env.companionsEnabled}
            onChange={(e) => patchEnv({ companionsOnOsDesktop: e.target.checked })}
          />
          <span>Show on Windows desktop</span>
        </label>
        <div className="os-viz-row">
          <span className="os-viz-label muted">Monitors</span>
          <button
            type="button"
            className={seg(deskPrefs.companionHostDisplays !== 'all')}
            disabled={!env.enabled || !env.companionsEnabled || !env.companionsOnOsDesktop}
            onClick={() => patchDesk({ companionHostDisplays: 'primary' })}
          >
            Primary
          </button>
          <button
            type="button"
            className={seg(deskPrefs.companionHostDisplays === 'all')}
            disabled={!env.enabled || !env.companionsEnabled || !env.companionsOnOsDesktop}
            onClick={() => patchDesk({ companionHostDisplays: 'all' })}
          >
            All displays
          </button>
        </div>
      </SettingsCard>
    </>
  );
}

function StepFields({
  step,
  disabled,
  routines,
  onChange,
}: {
  step: BuddyStep;
  disabled: boolean;
  routines: BuddyRoutine[];
  onChange: (s: BuddyStep) => void;
}) {
  switch (step.type) {
    case 'openApp':
      return (
        <select
          className="set-select"
          disabled={disabled}
          value={step.appId}
          onChange={(e) => onChange({ type: 'openApp', appId: e.target.value })}
        >
          {SHORTCUT_OPEN_APPS.map((a) => (
            <option key={a.id} value={a.id}>
              {a.label}
            </option>
          ))}
        </select>
      );
    case 'runCommand':
      return (
        <select
          className="set-select"
          disabled={disabled}
          value={step.commandId}
          onChange={(e) => onChange({ type: 'runCommand', commandId: e.target.value })}
        >
          {COMMAND_CATALOG.map((c) => (
            <option key={c.id} value={c.id}>
              {c.category}: {c.label}
            </option>
          ))}
        </select>
      );
    case 'toggleEnv':
      return (
        <>
          <select
            className="set-select"
            disabled={disabled}
            value={step.key}
            onChange={(e) =>
              onChange({
                type: 'toggleEnv',
                key: e.target.value as 'particles' | 'companions' | 'lighting' | 'living' | 'rotation',
                value: step.value,
              })
            }
          >
            <option value="particles">Particles</option>
            <option value="companions">Companions</option>
            <option value="lighting">Lighting</option>
            <option value="living">Living layer</option>
            <option value="rotation">Wallpaper rotation</option>
          </select>
          <select
            className="set-select"
            disabled={disabled}
            value={step.value ?? 'toggle'}
            onChange={(e) =>
              onChange({
                type: 'toggleEnv',
                key: step.key,
                value: e.target.value as 'on' | 'off' | 'toggle',
              })
            }
          >
            <option value="toggle">Toggle</option>
            <option value="on">On</option>
            <option value="off">Off</option>
          </select>
        </>
      );
    case 'setMood':
      return (
        <>
          <select
            className="set-select"
            disabled={disabled}
            value={step.mood}
            onChange={(e) =>
              onChange({
                type: 'setMood',
                mood: e.target.value as BuddyStep extends { type: 'setMood'; mood: infer M } ? M : never,
                status: step.status,
              })
            }
          >
            <option value="calm">Calm</option>
            <option value="happy">Happy</option>
            <option value="sleepy">Sleepy</option>
            <option value="curious">Curious</option>
            <option value="celebrate">Celebrate</option>
          </select>
          <input
            disabled={disabled}
            value={step.status ?? ''}
            placeholder="Status text"
            onChange={(e) => onChange({ type: 'setMood', mood: step.mood, status: e.target.value })}
          />
        </>
      );
    case 'wait':
      return (
        <input
          type="number"
          min={0}
          max={10000}
          disabled={disabled}
          value={step.ms}
          onChange={(e) => onChange({ type: 'wait', ms: Number(e.target.value) })}
        />
      );
    case 'notify':
      return (
        <>
          <input
            disabled={disabled}
            value={step.title}
            placeholder="Title"
            onChange={(e) => onChange({ type: 'notify', title: e.target.value, body: step.body })}
          />
          <input
            disabled={disabled}
            value={step.body ?? ''}
            placeholder="Body"
            onChange={(e) => onChange({ type: 'notify', title: step.title, body: e.target.value })}
          />
        </>
      );
    case 'music':
      return (
        <select
          className="set-select"
          disabled={disabled}
          value={step.action}
          onChange={(e) =>
            onChange({
              type: 'music',
              action: e.target.value as 'playPause' | 'next' | 'prev',
            })
          }
        >
          <option value="playPause">Play / pause</option>
          <option value="next">Next</option>
          <option value="prev">Previous</option>
        </select>
      );
    case 'speak':
      return (
        <input
          disabled={disabled}
          value={step.text}
          onChange={(e) => onChange({ type: 'speak', text: e.target.value })}
        />
      );
    case 'dispatch':
      return (
        <>
          <input
            disabled={disabled}
            value={step.event}
            placeholder="event name"
            onChange={(e) => onChange({ type: 'dispatch', event: e.target.value, detail: step.detail })}
          />
          <input
            disabled={disabled}
            value={step.detail ?? ''}
            placeholder="detail"
            onChange={(e) => onChange({ type: 'dispatch', event: step.event, detail: e.target.value })}
          />
        </>
      );
    case 'palette':
      return (
        <select
          className="set-select"
          disabled={disabled}
          value={step.mode ?? 'commands'}
          onChange={(e) =>
            onChange({ type: 'palette', mode: e.target.value === 'search' ? 'search' : 'commands' })
          }
        >
          <option value="commands">Commands</option>
          <option value="search">Search</option>
        </select>
      );
    case 'routine':
      return (
        <select
          className="set-select"
          disabled={disabled}
          value={step.routineId}
          onChange={(e) => onChange({ type: 'routine', routineId: e.target.value })}
        >
          {routines.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      );
    case 'clipboard':
      return <span className="muted">Opens clipboard history</span>;
    default:
      return null;
  }
}
