/**
 * wid5 — the one place a widget's own settings live.
 *
 * Before this, configuration was wherever each widget happened to put it: the
 * digital clock read `hour24` / `showSeconds` and offered no way to change
 * either, the Pomodoro and Countdown kept number fields in their bodies, and the
 * reading-list widgets a bare picker. Every configurable widget now declares its
 * fields (`WidgetDef.settingsSchema`) and the frame's menu opens them here, in
 * every theme, with translated labels.
 */
import { useEffect, useId, useRef } from 'react';
import { useT } from '../i18n';
import { readSetting, type WidgetSettingField } from './types';
import './wid5.css';

interface PopoverProps {
  title: string;
  schema: readonly WidgetSettingField[];
  settings: Record<string, unknown>;
  setSettings: (patch: Record<string, unknown>) => void;
  onClose: () => void;
}

function SelectField({
  field,
  value,
  onChange,
}: {
  field: Extract<WidgetSettingField, { kind: 'select' }>;
  value: string;
  onChange: (v: string) => void;
}) {
  const { t } = useT();
  const options = field.useOptions();
  return (
    <label className="widget-settings-field">
      <span>{t(field.labelKey)}</span>
      <select className="wgt-select" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export default function WidgetSettingsPopover({ title, schema, settings, setSettings, onClose }: PopoverProps) {
  const { t } = useT();
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  const returnTo = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const active = document.activeElement;
    returnTo.current = active instanceof HTMLElement ? active : null;
    ref.current?.querySelector<HTMLElement>('input, select, button')?.focus();
    return () => {
      if (returnTo.current?.isConnected) returnTo.current.focus({ preventScroll: true });
    };
  }, []);

  const reset = (): void => {
    const patch: Record<string, unknown> = {};
    for (const field of schema) patch[field.key] = undefined;
    setSettings(patch);
  };

  return (
    <div
      ref={ref}
      className="widget-settings"
      role="dialog"
      aria-labelledby={`${id}-title`}
      data-widget-settings
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <div className="widget-settings-title" id={`${id}-title`}>
        {title}
      </div>
      {schema.map((field) => {
        if (field.kind === 'toggle') {
          const value = readSetting(settings, field.key, field.fallback) === true;
          return (
            <label key={field.key} className="widget-settings-field widget-settings-toggle">
              <input
                type="checkbox"
                checked={value}
                data-setting-key={field.key}
                onChange={(e) => setSettings({ [field.key]: e.target.checked })}
              />
              <span>{t(field.labelKey)}</span>
            </label>
          );
        }
        if (field.kind === 'number') {
          const value = Number(readSetting(settings, field.key, field.fallback));
          return (
            <label key={field.key} className="widget-settings-field">
              <span>{t(field.labelKey)}</span>
              <input
                type="number"
                min={field.min}
                max={field.max}
                step={field.step ?? 1}
                value={Number.isFinite(value) ? value : field.fallback}
                data-setting-key={field.key}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  setSettings({
                    [field.key]: Number.isFinite(n) && e.target.value !== ''
                      ? Math.min(field.max, Math.max(field.min, n))
                      : field.fallback,
                  });
                }}
              />
            </label>
          );
        }
        return (
          <SelectField
            key={field.key}
            field={field}
            value={String(readSetting(settings, field.key, field.fallback))}
            onChange={(v) => setSettings({ [field.key]: v })}
          />
        );
      })}
      <div className="widget-settings-actions">
        <button type="button" className="wgt-btn" onClick={reset}>
          {t('wid5.settings.reset')}
        </button>
        <button type="button" className="wgt-btn primary" onClick={onClose}>
          {t('wid5.settings.done')}
        </button>
      </div>
    </div>
  );
}
