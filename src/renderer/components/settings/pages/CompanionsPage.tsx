import { useMemo, useState } from 'react';
import SettingsCard from '../SettingsCard';
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
import { useT } from '../../../i18n';

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
  const { t } = useT();
  const { env, patchEnv, deskPrefs, patchDesk, seg, focusSettingId } = useSettings();
  const routines = env.buddyRoutines?.length ? env.buddyRoutines : getDefaultBuddyRoutines();
  const [editId, setEditId] = useState<string>(routines[0]?.id ?? '');
  const [testMsg, setTestMsg] = useState('');
  const selectedType = COMPANION_DEFS.find((d) => d.id === 'study-buddy')?.id ?? 'study-buddy';
  const [assignType, setAssignType] = useState<CompanionTypeId>(selectedType);

  const STEP_TYPES: { id: BuddyStep['type']; label: string }[] = [
    { id: 'openApp', label: t('settings.companions.step.openApp') },
    { id: 'runCommand', label: t('settings.companions.step.runCommand') },
    { id: 'toggleEnv', label: t('settings.companions.step.toggleEnv') },
    { id: 'setMood', label: t('settings.companions.step.setMood') },
    { id: 'wait', label: t('settings.companions.step.wait') },
    { id: 'notify', label: t('settings.companions.step.notify') },
    { id: 'music', label: t('settings.companions.step.music') },
    { id: 'clipboard', label: t('settings.companions.step.clipboard') },
    { id: 'palette', label: t('settings.companions.step.palette') },
    { id: 'speak', label: t('settings.companions.step.speak') },
    { id: 'dispatch', label: t('settings.companions.step.dispatch') },
    { id: 'routine', label: t('settings.companions.step.routine') },
  ];

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
    const tmp = steps[idx];
    steps[idx] = steps[j];
    steps[j] = tmp;
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

  const deleteRoutine = () => {
    if (!editing || editing.builtin) return;
    if (!window.confirm(t('settings.companions.deleteRoutineConfirm', { name: editing.name }))) return;
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
    setTestMsg(t('settings.companions.testRunning'));
    const res = await runBuddyRoutine(editing.id, {
      companionId: sample.id,
      typeId: assignType,
      patchCompanion: () => undefined,
    });
    setTestMsg(res.ok ? t('settings.companions.testOk') : res.error ?? t('settings.companions.testFailed'));
  };

  const typeRoutines = routines.filter(
    (r) => !r.forType || r.forType === '*' || r.forType === assignType,
  );

  return (
    <>
      <SettingsCard
        id="companions"
        title={t('settings.companions.title')}
        description={t('settings.companions.desc')}
        highlight={focusSettingId === 'companions'}
        trailing={
          <label className="os-toggle os-toggle-compact">
            <input
              type="checkbox"
              checked={env.companionsEnabled}
              disabled={!env.enabled}
              onChange={(e) => patchEnv({ companionsEnabled: e.target.checked })}
              aria-label={t('settings.companions.showInApp')}
            />
            <span>{env.companionsEnabled ? t('common.on') : t('common.off')}</span>
          </label>
        }
      >
        <div className="os-viz-row" style={{ flexWrap: 'wrap' }}>
          <span className="os-viz-label muted">{t('settings.companions.who')}</span>
          {COMPANION_DEFS.map((d) => {
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
          <span className="os-viz-label muted">{t('settings.companions.reactivity')}</span>
          {([
            ['quiet', t('settings.companions.reactivity.quiet')],
            ['normal', t('settings.companions.reactivity.normal')],
            ['playful', t('settings.companions.reactivity.playful')],
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
          <span>{t('settings.companions.celebrateProgress')}</span>
        </label>
        <label className="os-toggle">
          <input
            type="checkbox"
            checked={env.companionPauseWhenStudying}
            disabled={!env.enabled || !env.companionsEnabled}
            onChange={(e) => patchEnv({ companionPauseWhenStudying: e.target.checked })}
          />
          <span>{t('settings.companions.calmerMovement')}</span>
        </label>
      </SettingsCard>

      <SettingsCard
        id="buddy-programmer"
        title={t('settings.companions.buddyProgrammer.title')}
        description={t('settings.companions.buddyProgrammer.desc')}
        highlight={focusSettingId === 'buddy-programmer'}
      >
        <div className="buddy-prog-toolbar">
          <label className="pl-field">
            <span className="muted">{t('settings.companions.buddyType')}</span>
            <select
              className="set-select"
              value={assignType}
              onChange={(e) => setAssignType(e.target.value as CompanionTypeId)}
            >
              {COMPANION_DEFS.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                </option>
              ))}
            </select>
          </label>
          <label className="pl-field">
            <span className="muted">{t('settings.companions.primaryClick')}</span>
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
            <span className="muted">{t('settings.companions.secondaryDoubleClick')}</span>
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
            <span className="muted">{t('settings.companions.editRoutine')}</span>
            <select
              className="set-select"
              value={editing?.id ?? ''}
              onChange={(e) => setEditId(e.target.value)}
            >
              {routines.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                  {r.builtin ? t('settings.companions.builtinSuffix') : ''}
                  {r.forType && r.forType !== '*' ? ` · ${r.forType}` : ''}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="btn small" onClick={createRoutine}>
            {t('settings.companions.newRoutine')}
          </button>
          <button type="button" className="btn small" onClick={() => void testRun()} disabled={!editing}>
            {t('settings.companions.testRun')}
          </button>
          <button
            type="button"
            className="btn small"
            onClick={() => {
              if (!window.confirm(t('settings.companions.resetBuiltinsConfirm')))
                return;
              setRoutines(resetBuiltinRoutines(routines));
            }}
          >
            {t('settings.companions.resetBuiltins')}
          </button>
          {editing && !editing.builtin && (
            <button type="button" className="btn small" onClick={deleteRoutine}>
              {t('settings.companions.delete')}
            </button>
          )}
        </div>
        {testMsg && <p className="muted os-set-hint">{testMsg}</p>}

        {editing && (
          <div className="buddy-prog-editor">
            <div className="buddy-prog-toolbar">
              <label className="pl-field grow">
                <span className="muted">{t('settings.companions.name')}</span>
                <input
                  value={editing.name}
                  disabled={editing.builtin}
                  onChange={(e) => updateRoutine(editing.id, { name: e.target.value })}
                />
              </label>
              <label className="pl-field">
                <span className="muted">{t('settings.companions.forType')}</span>
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
                  <option value="*">{t('settings.companions.any')}</option>
                  {COMPANION_DEFS.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <p className="muted os-set-hint">{t('settings.companions.stepsHint')}</p>
            <ul className="buddy-step-list">
              {editing.steps.map((step, idx) => (
                <li key={idx} className="buddy-step-row">
                  <select
                    className="set-select"
                    disabled={editing.builtin}
                    value={step.type}
                    onChange={(e) => {
                      const nt = e.target.value as BuddyStep['type'];
                      updateStep(idx, blankStep(nt));
                    }}
                  >
                    {STEP_TYPES.map((st) => (
                      <option key={st.id} value={st.id}>
                        {st.label}
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
                        {t('settings.companions.up')}
                      </button>
                      <button type="button" className="btn small" onClick={() => moveStep(idx, 1)}>
                        {t('settings.companions.down')}
                      </button>
                      <button type="button" className="btn small" onClick={() => removeStep(idx)}>
                        {t('common.remove')}
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
            {!editing.builtin && (
              <button type="button" className="btn small" onClick={addStep}>
                {t('settings.companions.addStep')}
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
                    name: `${editing.name}${t('settings.companions.copySuffix')}`,
                    builtin: false,
                    steps: editing.steps.map((s) => sanitizeStep(s)!).filter(Boolean),
                  };
                  setRoutines([...routines, fork]);
                  setEditId(id);
                }}
              >
                {t('settings.companions.duplicateEditable')}
              </button>
            )}
          </div>
        )}
      </SettingsCard>

      <SettingsCard
        id="os-pets"
        title={t('settings.companions.osPets.title')}
        description={t('settings.companions.osPets.desc')}
        highlight={focusSettingId === 'os-pets'}
      >
        <label className="os-toggle">
          <input
            type="checkbox"
            checked={env.companionsOnOsDesktop}
            disabled={!env.enabled || !env.companionsEnabled}
            onChange={(e) => patchEnv({ companionsOnOsDesktop: e.target.checked })}
          />
          <span>{t('settings.companions.showOnDesktop')}</span>
        </label>
        <div className="os-viz-row">
          <span className="os-viz-label muted">{t('settings.companions.monitors')}</span>
          <button
            type="button"
            className={seg(deskPrefs.companionHostDisplays !== 'all')}
            disabled={!env.enabled || !env.companionsEnabled || !env.companionsOnOsDesktop}
            onClick={() => patchDesk({ companionHostDisplays: 'primary' })}
          >
            {t('settings.companions.primary')}
          </button>
          <button
            type="button"
            className={seg(deskPrefs.companionHostDisplays === 'all')}
            disabled={!env.enabled || !env.companionsEnabled || !env.companionsOnOsDesktop}
            onClick={() => patchDesk({ companionHostDisplays: 'all' })}
          >
            {t('settings.companions.allDisplays')}
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
  const { t } = useT();
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
            <option value="particles">{t('settings.companions.toggleKey.particles')}</option>
            <option value="companions">{t('settings.companions.toggleKey.companions')}</option>
            <option value="lighting">{t('settings.companions.toggleKey.lighting')}</option>
            <option value="living">{t('settings.companions.toggleKey.living')}</option>
            <option value="rotation">{t('settings.companions.toggleKey.rotation')}</option>
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
            <option value="toggle">{t('settings.companions.toggleValue.toggle')}</option>
            <option value="on">{t('common.on')}</option>
            <option value="off">{t('common.off')}</option>
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
            <option value="calm">{t('settings.companions.mood.calm')}</option>
            <option value="happy">{t('settings.companions.mood.happy')}</option>
            <option value="sleepy">{t('settings.companions.mood.sleepy')}</option>
            <option value="curious">{t('settings.companions.mood.curious')}</option>
            <option value="celebrate">{t('settings.companions.mood.celebrate')}</option>
          </select>
          <input
            disabled={disabled}
            value={step.status ?? ''}
            placeholder={t('settings.companions.statusPlaceholder')}
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
            placeholder={t('settings.companions.titlePlaceholder')}
            onChange={(e) => onChange({ type: 'notify', title: e.target.value, body: step.body })}
          />
          <input
            disabled={disabled}
            value={step.body ?? ''}
            placeholder={t('settings.companions.bodyPlaceholder')}
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
          <option value="playPause">{t('settings.companions.music.playPause')}</option>
          <option value="next">{t('settings.companions.music.next')}</option>
          <option value="prev">{t('settings.companions.music.previous')}</option>
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
            placeholder={t('settings.companions.eventNamePlaceholder')}
            onChange={(e) => onChange({ type: 'dispatch', event: e.target.value, detail: step.detail })}
          />
          <input
            disabled={disabled}
            value={step.detail ?? ''}
            placeholder={t('settings.companions.detailPlaceholder')}
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
          <option value="commands">{t('settings.companions.palette.commands')}</option>
          <option value="search">{t('settings.companions.palette.search')}</option>
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
      return <span className="muted">{t('settings.companions.opensClipboard')}</span>;
    default:
      return null;
  }
}
