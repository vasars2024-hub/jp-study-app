// The custom-shortcut form: one component for "Add custom shortcut" and for
// editing one in place (D264 — a custom shortcut used to be fixable only by
// deleting it and building it again, losing its binding on the way).

import { useId, useState } from 'react';
import { useT } from '../../i18n';
import { commandCategory, commandLabel } from '../../commandI18n';
import { COMMAND_CATALOG, SHORTCUT_OPEN_APPS, type CustomAction, type CustomCommandDef } from '../../keyboardShortcuts';

type TFn = (key: string, vars?: Record<string, string | number>) => string;

type ActionType = 'openApp' | 'runCommand' | 'runCommands';

function appSectionLabel(id: string, fallback: string, t: TFn): string {
  const key = `palette.section.${id}`;
  const out = t(key);
  return out === key ? fallback : out;
}

export interface CustomShortcutFormProps {
  /** Present when editing; absent when creating. */
  initial?: CustomCommandDef;
  /** Creating asks for keys too; editing leaves keys to the row's capture button. */
  showKeys: boolean;
  title: string;
  submitLabel: string;
  onSubmit: (input: { label: string; keys: string; action: CustomAction }) => void;
  onCancel?: () => void;
  /** Shown when a stack has fewer than two steps. */
  onInvalid?: (message: string) => void;
}

function initialType(action?: CustomAction): ActionType {
  if (!action) return 'openApp';
  if (action.type === 'runCommands') return 'runCommands';
  if (action.type === 'runCommand') return 'runCommand';
  return 'openApp';
}

export default function CustomShortcutForm({
  initial,
  showKeys,
  title,
  submitLabel,
  onSubmit,
  onCancel,
  onInvalid,
}: CustomShortcutFormProps) {
  const { t } = useT();
  const formId = useId();
  const action = initial?.action;
  const [label, setLabel] = useState(initial?.label ?? '');
  const [keys, setKeys] = useState('');
  const [type, setType] = useState<ActionType>(initialType(action));
  const [appId, setAppId] = useState(
    action?.type === 'openApp' ? action.appId : (SHORTCUT_OPEN_APPS[0]?.id ?? 'settings'),
  );
  const [cmdId, setCmdId] = useState(
    action?.type === 'runCommand' ? action.commandId : (COMMAND_CATALOG[0]?.id ?? 'nav.palette'),
  );
  const [stack, setStack] = useState<string[]>(action?.type === 'runCommands' ? [...action.commandIds] : []);
  const [stackPick, setStackPick] = useState(COMMAND_CATALOG[0]?.id ?? 'nav.palette');
  // A `dispatch` action is only made by imports; editing keeps it unless the type changes.
  const keepsDispatch = action?.type === 'dispatch';
  const [typeTouched, setTypeTouched] = useState(false);

  const submit = (): void => {
    let next: CustomAction;
    if (keepsDispatch && !typeTouched && action) {
      next = action;
    } else if (type === 'openApp') {
      next = { type: 'openApp', appId };
    } else if (type === 'runCommands') {
      if (stack.length < 2) {
        onInvalid?.(t('settings.shortcuts.stackNeedTwo'));
        return;
      }
      next = { type: 'runCommands', commandIds: [...stack] };
    } else {
      next = { type: 'runCommand', commandId: cmdId };
    }
    onSubmit({ label, keys, action: next });
  };

  return (
    <div className="sc-custom" role="group" aria-labelledby={`${formId}-title`}>
      <div className="sc-custom-title" id={`${formId}-title`}>
        {title}
      </div>
      <div className="sc-custom-grid">
        <label className="sc-field">
          <span className="muted">{t('settings.shortcuts.field.name')}</span>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={t('settings.shortcuts.field.namePh')}
          />
        </label>
        {showKeys && (
          <label className="sc-field">
            <span className="muted">{t('settings.shortcuts.field.keys')}</span>
            <input
              value={keys}
              onChange={(e) => setKeys(e.target.value)}
              placeholder={t('settings.shortcuts.field.keysPh')}
            />
          </label>
        )}
        <label className="sc-field">
          <span className="muted">{t('settings.shortcuts.field.action')}</span>
          <select
            className="set-select"
            value={type}
            onChange={(e) => {
              setType(e.target.value as ActionType);
              setTypeTouched(true);
            }}
          >
            <option value="openApp">{t('settings.shortcuts.action.openApp')}</option>
            <option value="runCommand">{t('settings.shortcuts.action.runCommand')}</option>
            <option value="runCommands">{t('settings.shortcuts.action.runCommands')}</option>
          </select>
        </label>
        {type === 'openApp' ? (
          <label className="sc-field">
            <span className="muted">{t('settings.shortcuts.field.app')}</span>
            <select className="set-select" value={appId} onChange={(e) => setAppId(e.target.value)}>
              {SHORTCUT_OPEN_APPS.map((a) => (
                <option key={a.id} value={a.id}>
                  {appSectionLabel(a.id, a.label, t)}
                </option>
              ))}
            </select>
          </label>
        ) : type === 'runCommand' ? (
          <label className="sc-field">
            <span className="muted">{t('settings.shortcuts.field.command')}</span>
            <select className="set-select" value={cmdId} onChange={(e) => setCmdId(e.target.value)}>
              {COMMAND_CATALOG.map((c) => (
                <option key={c.id} value={c.id}>
                  {commandCategory(c.category, t)}: {commandLabel(c.id, c.label, t)}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <div className="sc-field sc-stack-field">
            <span className="muted">{t('settings.shortcuts.field.stack')}</span>
            <div className="sc-stack-add">
              <select
                className="set-select"
                value={stackPick}
                aria-label={t('settings.shortcuts.field.stack')}
                onChange={(e) => setStackPick(e.target.value)}
              >
                {COMMAND_CATALOG.map((c) => (
                  <option key={c.id} value={c.id}>
                    {commandCategory(c.category, t)}: {commandLabel(c.id, c.label, t)}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="btn small"
                onClick={() => {
                  if (stackPick) setStack((s) => [...s, stackPick]);
                }}
              >
                {t('settings.shortcuts.add')}
              </button>
            </div>
            {stack.length === 0 ? (
              <p className="muted sc-stack-empty">{t('settings.shortcuts.stackEmpty')}</p>
            ) : (
              <ol className="sc-stack-list">
                {stack.map((id, i) => {
                  const c = COMMAND_CATALOG.find((x) => x.id === id);
                  return (
                    <li key={`${id}-${i}`}>
                      <span>
                        {i + 1}. {c ? `${commandCategory(c.category, t)}: ${commandLabel(c.id, c.label, t)}` : id}
                      </span>
                      <button
                        type="button"
                        className="btn small"
                        title={t('settings.shortcuts.remove')}
                        onClick={() => setStack((s) => s.filter((_, j) => j !== i))}
                      >
                        {t('settings.shortcuts.remove')}
                      </button>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        )}
      </div>
      <div className="sc-resolve-actions">
        <button
          type="button"
          className="btn small primary"
          disabled={!label.trim() || (type === 'runCommands' && stack.length < 2 && !(keepsDispatch && !typeTouched))}
          onClick={submit}
        >
          {submitLabel}
        </button>
        {onCancel && (
          <button type="button" className="btn small" onClick={onCancel}>
            {t('settings.shortcuts.cancel')}
          </button>
        )}
      </div>
    </div>
  );
}
