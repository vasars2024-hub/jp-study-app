/**
 * Settings > Speed & memory: the knobs of Blanc's own mechanics (memory
 * budget, Flow, Capture inbox). Reads and writes `blancMechSettings.ts`.
 */
import { useT } from '../../i18n';
import {
  FLOW_SPRINT_OPTIONS,
  RAM_BUDGET_MAX_MB,
  RAM_BUDGET_MIN_MB,
  WARM_TOOL_LIMIT_MAX,
  resetBlancMechSettings,
  saveBlancMechSettings,
  type FlowSprintMinutes,
} from './blancMechSettings';
import { useBlancMechSettings } from './BlancMechanicsChrome';
import { blancToolLabel } from './blancToolLabels';

export function BlancMechanicsSettings() {
  const { t } = useT();
  const settings = useBlancMechSettings();

  return (
    <fieldset data-blanc-setting="mechanics" tabIndex={-1}>
      <legend>{t('blanc.mech.settings.legend')}</legend>
      <p className="blanc-note">{t('blanc.mech.settings.note')}</p>

      <label>
        {t('blanc.mech.settings.warmLimit')}
        <input
          type="number"
          min={0}
          max={WARM_TOOL_LIMIT_MAX}
          value={settings.warmToolLimit}
          aria-describedby="blanc-mech-warm-help"
          onChange={(event) => saveBlancMechSettings({ warmToolLimit: Number(event.target.value) })}
        />
      </label>
      <p id="blanc-mech-warm-help" className="blanc-note">{t('blanc.mech.settings.warmLimitHelp')}</p>
      {settings.keepWarm.length > 0 && (
        <div className="blanc-status-row">
          <span>{t('blanc.mech.settings.keepWarmList', { count: settings.keepWarm.length })}</span>
          {settings.keepWarm.map((id) => (
            <button
              key={id}
              type="button"
              className="blanc-small-btn"
              aria-label={t('blanc.mech.warm.unpinNamed', { name: blancToolLabel(t, id) })}
              onClick={() => saveBlancMechSettings({ keepWarm: settings.keepWarm.filter((item) => item !== id) })}
            >
              {blancToolLabel(t, id)} ×
            </button>
          ))}
        </div>
      )}

      <label className="blanc-check">
        <input
          type="checkbox"
          checked={settings.ramChip}
          onChange={(event) => saveBlancMechSettings({ ramChip: event.target.checked })}
        />
        <span>{t('blanc.mech.settings.ramChip')}</span>
      </label>
      <label>
        {t('blanc.mech.settings.ramBudget')}
        <input
          type="number"
          min={RAM_BUDGET_MIN_MB}
          max={RAM_BUDGET_MAX_MB}
          step={50}
          value={settings.ramBudgetMb}
          onChange={(event) => saveBlancMechSettings({ ramBudgetMb: Number(event.target.value) })}
        />
      </label>
      <label className="blanc-check">
        <input
          type="checkbox"
          checked={settings.autoTrim}
          onChange={(event) => saveBlancMechSettings({ autoTrim: event.target.checked })}
        />
        <span>{t('blanc.mech.settings.autoTrim')}</span>
      </label>

      <label>
        {t('blanc.mech.settings.sprint')}
        <select
          value={settings.flowSprintMinutes}
          onChange={(event) => saveBlancMechSettings({ flowSprintMinutes: Number(event.target.value) as FlowSprintMinutes })}
        >
          {FLOW_SPRINT_OPTIONS.map((minutes) => (
            <option key={minutes} value={minutes}>
              {minutes === 0 ? t('blanc.mech.flow.sprintNone') : t('blanc.mech.flow.sprintMinutes', { count: minutes })}
            </option>
          ))}
        </select>
      </label>
      <label className="blanc-check">
        <input
          type="checkbox"
          checked={settings.flowIncludeInbox}
          onChange={(event) => saveBlancMechSettings({ flowIncludeInbox: event.target.checked })}
        />
        <span>{t('blanc.mech.settings.flowInbox')}</span>
      </label>
      <label className="blanc-check">
        <input
          type="checkbox"
          checked={settings.flowIncludeReading}
          onChange={(event) => saveBlancMechSettings({ flowIncludeReading: event.target.checked })}
        />
        <span>{t('blanc.mech.settings.flowReading')}</span>
      </label>
      <label className="blanc-check">
        <input
          type="checkbox"
          checked={settings.captureLookup}
          onChange={(event) => saveBlancMechSettings({ captureLookup: event.target.checked })}
        />
        <span>{t('blanc.mech.settings.captureLookup')}</span>
      </label>
      <p className="blanc-note">{t('blanc.mech.settings.keys')}</p>
      <div className="blanc-row-actions">
        <button type="button" onClick={() => resetBlancMechSettings()}>{t('blanc.mech.settings.reset')}</button>
      </div>
    </fieldset>
  );
}
