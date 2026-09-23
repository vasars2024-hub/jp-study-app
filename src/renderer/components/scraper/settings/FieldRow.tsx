// One settings row: label on the left, control on the right.
//
// Every control in the drawer renders through here so the twenty groups cannot
// drift apart in spacing, hint placement or how a bound is enforced.

import { useEffect, useState } from 'react';
import { Button, Select, Toggle } from '../../ui';
import Icon from '../../Icons';
import { readField, type ScraperFieldDef } from './fields';
import {
  CREDENTIAL_PRESENCE_TONE,
  KEY_PRESENCE_TEXT,
  PASSWORD_PRESENCE_TEXT,
  resolveCredentialPresence,
  type VaultAnswer,
} from '../data/credentialPresence';
import { sx } from '../strings';
import type { ScraperSettingActionId } from './settingActions';
import type { ScraperSettings } from '../../../../shared/scraperSettings';
import { useT } from '../../../i18n';

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function asList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((v) => String(v));
}

/** How many things a "counted" field is standing in for. */
function countOf(value: unknown): number {
  if (Array.isArray(value)) return value.length;
  if (value && typeof value === 'object') return Object.keys(value).length;
  if (typeof value === 'string') {
    return value.trim() ? value.split(';').filter((p) => p.trim()).length : 0;
  }
  return 0;
}

export default function FieldRow({
  field,
  settings,
  onChange,
  onAction,
  highlight,
}: {
  field: ScraperFieldDef;
  settings: ScraperSettings;
  onChange: (path: string, value: unknown) => void;
  onAction: (action: ScraperSettingActionId, field: ScraperFieldDef) => void;
  highlight?: boolean;
}) {
  const { t } = useT();
  const value = readField(settings, field.path);

  // Text inputs are kept local while typing: committing every keystroke to the
  // settings document would run the validator (and its clamps) mid-word, which
  // makes fields like a URL impossible to edit.
  const [draft, setDraft] = useState(() => asString(value));
  useEffect(() => {
    setDraft(asString(value));
  }, [value]);

  /**
   * The OS store's answer for a 'secret' row's ref. `null` until it comes back,
   * so a user who has a credential never sees "no password" flash on mount.
   *
   * Only main can ask, so this is the one row kind that reaches past its props.
   * The alternative — threading an answer per field path down from the drawer —
   * would put vault knowledge in the one component whose whole job is that it
   * knows nothing about any particular field.
   */
  const [vaultHas, setVaultHas] = useState<VaultAnswer>(null);
  const secretRef = field.kind === 'secret' ? asString(value).trim() : '';
  useEffect(() => {
    if (!secretRef) return undefined;
    let alive = true;
    setVaultHas(null);
    const probe = window.api?.scraperHasCredential;
    if (typeof probe !== 'function') {
      setVaultHas('error');
      return undefined;
    }
    void probe(secretRef)
      .then((has) => { if (alive) setVaultHas(has); })
      .catch(() => { if (alive) setVaultHas('error'); });
    return () => { alive = false; };
  }, [secretRef]);

  const control = (() => {
    switch (field.kind) {
      case 'toggle':
        return (
          <Toggle
            checked={value === true}
            onChange={(e) => onChange(field.path, e.target.checked)}
            aria-label={field.label}
          />
        );

      case 'number':
        return (
          <div className="scr-field-num">
            <input
              type="number"
              className="scr-input"
              value={asNumber(value)}
              min={field.min}
              max={field.max}
              step={field.step ?? 1}
              aria-label={field.label}
              onChange={(e) => {
                const next = Number(e.target.value);
                if (Number.isFinite(next)) onChange(field.path, next);
              }}
            />
            {field.unit && <span className="scr-field-unit">{field.unit}</span>}
          </div>
        );

      case 'select':
        return (
          <Select
            value={asString(value)}
            aria-label={field.label}
            options={field.options ?? []}
            onChange={(e) => onChange(field.path, e.target.value)}
          />
        );

      case 'text':
        return (
          <input
            type="text"
            className="scr-input"
            value={draft}
            placeholder={field.placeholder}
            aria-label={field.label}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => onChange(field.path, draft)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onChange(field.path, draft);
            }}
          />
        );

      case 'textarea':
        return (
          <textarea
            className="scr-input scr-input--area"
            value={draft}
            rows={4}
            placeholder={field.placeholder}
            aria-label={field.label}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => onChange(field.path, draft)}
          />
        );

      case 'tags': {
        const list = asList(value);
        return (
          <div className="scr-tags">
            {list.map((item, index) => (
              <span key={`${item}-${index}`} className="scr-tag">
                {item}
                <button
                  type="button"
                  className="scr-tag-x"
                  aria-label={t('scraperDrawer.field.removeTag', { item })}
                  onClick={() => onChange(field.path, list.filter((_, i) => i !== index))}
                >
                  <Icon name="close" size={10} />
                </button>
              </span>
            ))}
            <input
              type="text"
              className="scr-tag-input"
              placeholder={t('scraperDrawer.field.addPlaceholder')}
              aria-label={t('scraperDrawer.field.addTo', { label: field.label })}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return;
                const next = e.currentTarget.value.trim();
                if (!next) return;
                // Numeric lists (resolutions) must stay numbers or the model
                // will reject the whole list on the next validate.
                const isNumeric = list.every((v) => /^\d+$/.test(v)) && /^\d+$/.test(next);
                onChange(field.path, [...list, isNumeric ? Number(next) : next]);
                e.currentTarget.value = '';
              }}
            />
          </div>
        );
      }

      case 'range': {
        const toPath = field.toPath ?? field.path;
        const isClock = field.path.includes('quietHours');
        const toValue = readField(settings, toPath);
        return (
          <div className="scr-field-range">
            <input
              type={isClock ? 'time' : 'number'}
              className="scr-input"
              value={isClock ? asString(value) : asNumber(value)}
              min={field.min}
              max={field.max}
              step={field.step ?? 1}
              aria-label={t('scraperDrawer.field.from', { label: field.label })}
              onChange={(e) =>
                onChange(field.path, isClock ? e.target.value : Number(e.target.value))
              }
            />
            <span className="scr-field-dash" aria-hidden>
              –
            </span>
            <input
              type={isClock ? 'time' : 'number'}
              className="scr-input"
              value={isClock ? asString(toValue) : asNumber(toValue)}
              min={field.min}
              max={field.max}
              step={field.step ?? 1}
              aria-label={t('scraperDrawer.field.to', { label: field.label })}
              onChange={(e) =>
                onChange(toPath, isClock ? e.target.value : Number(e.target.value))
              }
            />
            {field.unit && <span className="scr-field-unit">{field.unit}</span>}
          </div>
        );
      }

      case 'counted':
        return (
          <Button
            size="sm"
            disabled={!field.action}
            onClick={() => field.action && onAction(field.action, field)}
          >
            {`${field.label} (${countOf(value)})`}
          </Button>
        );

      case 'status': {
        const text = asString(value);
        return (
          <div className="scr-field-status">
            <span className={`scr-conn scr-conn--${text || 'unknown'}`}>
              {text ? t(`scraperDrawer.status.${text}`) : t('scraperDrawer.field.notSet')}
            </span>
            <Button
              size="sm"
              disabled={!field.action}
              onClick={() => field.action && onAction(field.action, field)}
            >
              {t(field.action === 'qbit-test' ? 'scraperDrawer.field.test' : 'scraperDrawer.field.change')}
            </Button>
          </div>
        );
      }

      case 'secret': {
        // Never the ref, and never the secret: only whether one is there. The
        // ref printed verbatim is what this case was split off to stop — a row
        // labelled "Password" reading `qbit/webui` over an empty store.
        const presence = resolveCredentialPresence({ ref: secretRef, vaultHas });
        const text = field.path.endsWith('apiKeyRef')
          ? KEY_PRESENCE_TEXT[presence]
          : PASSWORD_PRESENCE_TEXT[presence];
        return (
          <div className="scr-field-status">
            <span className={`scr-conn scr-conn--cred-${CREDENTIAL_PRESENCE_TONE[presence]}`}>
              {sx(text)}
            </span>
            <Button
              size="sm"
              disabled={!field.action}
              onClick={() => field.action && onAction(field.action, field)}
            >
              {t(presence === 'unset' ? 'scraperDrawer.field.set' : 'scraperDrawer.field.change')}
            </Button>
          </div>
        );
      }

      case 'note':
        // No control by design: the row exists to state a guarantee, and the
        // hint under the label carries it. Rendering anything operable here
        // would suggest the guarantee is negotiable.
        return (
          <span className="scr-field-note-mark" aria-hidden>
            <Icon name="shield" size={14} />
          </span>
        );

      default:
        return null;
    }
  })();

  return (
    <div
      className={`scr-field${highlight ? ' is-highlight' : ''}${field.inert ? ' is-inert' : ''}`}
      data-field-path={field.path}
      data-inert={field.inert ? 'true' : undefined}
    >
      <div className="scr-field-label">
        <label htmlFor={undefined}>
          {field.label}
          {/* A control that saves a value but changes no behaviour looked
              exactly like one that works — audit F5. The badge is the only
              thing on the row that can tell those apart, so it sits with the
              label rather than in a tooltip. */}
          {field.inert && (
            <span className="scr-field-inert" title={sx('set.inertHint')}>
              {sx('set.inert')}
            </span>
          )}
        </label>
        {field.hint && <p className="scr-field-hint">{field.hint}</p>}
      </div>
      <div className="scr-field-control">{control}</div>
    </div>
  );
}
