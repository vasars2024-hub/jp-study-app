/**
 * Line cleanup and filters for captured visual novel text (VN 7.6), the
 * texthooker-ui / LunaTranslator feature: built-in cleanup (control characters,
 * inline furigana, hook character repetition), an optional recent-duplicate
 * filter, and the user's own regular expressions — each either removing what
 * it matches or dropping the line. A live preview runs the draft over the
 * novel's last captured lines and over a line typed in to try.
 *
 * Main applies the saved filters to every hooked, copied or relayed line
 * (`main/immersion/visualNovelCaptureSession.ts`); a running session picks a
 * change up at once.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useT } from '../../i18n';
import {
  capturesForVisualNovel,
  visualNovelSettings,
  type VisualNovelDatabase,
  type VisualNovelEntry,
} from '../../../shared/visualNovel';
import {
  VN5_FILTER_PATTERN_MAX,
  VN5_FILTER_RULE_MAX,
  vn5FilterPreview,
  type Vn5FilterMode,
  type Vn5LineFilters,
} from '../../../shared/visualNovelLineFilters';
import './vn5.css';

const PREVIEW_LINES = 6;

export default function VisualNovelLineFilters({
  entry,
  database,
  onDatabase,
}: {
  entry: VisualNovelEntry;
  database: VisualNovelDatabase;
  onDatabase: (database: VisualNovelDatabase) => void;
}) {
  const { t } = useT();
  const saved = visualNovelSettings(database).lineFilters;
  const savedKey = JSON.stringify(saved);
  const [draft, setDraft] = useState<Vn5LineFilters>(saved);
  const [sample, setSample] = useState('');
  const [busy, setBusy] = useState(false);

  // Another window (or a save here) changed the stored filters: follow them, but
  // keep rule edits that are not saved yet (a switch saved meanwhile must not eat them).
  const lastSaved = useRef(saved);
  useEffect(() => {
    const next = JSON.parse(savedKey) as Vn5LineFilters;
    const previous = lastSaved.current;
    lastSaved.current = next;
    setDraft((current) => (
      JSON.stringify(current.rules) !== JSON.stringify(previous.rules) ? { ...next, rules: current.rules } : next
    ));
  }, [savedKey]);

  const dirty = JSON.stringify(draft) !== savedKey;
  const recent = useMemo(
    () => capturesForVisualNovel(database, entry.id).slice(-PREVIEW_LINES).map((capture) => capture.japanese),
    [database, entry.id],
  );
  const preview = useMemo(
    () => vn5FilterPreview(sample.trim() ? [sample, ...recent] : recent, draft),
    [sample, recent, draft],
  );
  const invalid = new Set(preview.invalidRules);

  const save = async (next: Vn5LineFilters): Promise<void> => {
    setBusy(true);
    try {
      onDatabase(await window.api.visualNovelUpdateSettings({ lineFilters: next }));
    } finally {
      setBusy(false);
    }
  };

  // A built-in switch is one click and applies at once, like every other checkbox here.
  const toggle = (key: 'collapseRepeats' | 'stripRuby' | 'dedupeRecent', value: boolean): void => {
    const next = { ...draft, [key]: value };
    setDraft(next);
    void save({ ...JSON.parse(savedKey) as Vn5LineFilters, [key]: value });
  };

  const setRule = (index: number, patch: Partial<Vn5LineFilters['rules'][number]>): void => {
    setDraft((current) => ({
      ...current,
      rules: current.rules.map((rule, i) => (i === index ? { ...rule, ...patch } : rule)),
    }));
  };

  return (
    <fieldset className="vn5-filters" data-vn5-filters="">
      <legend>{t('vn5.filter.head')}</legend>
      <p className="muted">{t('vn5.filter.intro')}</p>
      <label>
        <input
          type="checkbox"
          checked={draft.collapseRepeats}
          disabled={busy}
          data-vn5-filter="collapse-repeats"
          onChange={(event) => toggle('collapseRepeats', event.target.checked)}
        />
        {t('vn5.filter.collapseRepeats')}
      </label>
      <label>
        <input
          type="checkbox"
          checked={draft.stripRuby}
          disabled={busy}
          data-vn5-filter="strip-ruby"
          onChange={(event) => toggle('stripRuby', event.target.checked)}
        />
        {t('vn5.filter.stripRuby')}
      </label>
      <label>
        <input
          type="checkbox"
          checked={draft.dedupeRecent}
          disabled={busy}
          data-vn5-filter="dedupe"
          onChange={(event) => toggle('dedupeRecent', event.target.checked)}
        />
        {t('vn5.filter.dedupe')}
      </label>

      <div className="vn5-filter-rules">
        <strong>{t('vn5.filter.rulesHead')}</strong>
        {draft.rules.length === 0 && <p className="muted">{t('vn5.filter.noRules')}</p>}
        {draft.rules.map((rule, index) => (
          // Rules have no id; their position is their identity while the list is edited.
          <div key={index} className={`vn5-filter-rule${invalid.has(index) ? ' is-invalid' : ''}`} data-vn5-rule={index}>
            <input
              type="checkbox"
              checked={rule.enabled}
              aria-label={t('vn5.filter.ruleEnabled', { index: index + 1 })}
              onChange={(event) => setRule(index, { enabled: event.target.checked })}
            />
            <input
              className="vn5-filter-pattern"
              value={rule.pattern}
              spellCheck={false}
              maxLength={VN5_FILTER_PATTERN_MAX}
              placeholder={t('vn5.filter.patternPlaceholder')}
              aria-label={t('vn5.filter.pattern', { index: index + 1 })}
              aria-invalid={invalid.has(index) || undefined}
              onChange={(event) => setRule(index, { pattern: event.target.value })}
            />
            <select
              value={rule.mode}
              aria-label={t('vn5.filter.mode', { index: index + 1 })}
              onChange={(event) => setRule(index, { mode: event.target.value as Vn5FilterMode })}
            >
              <option value="remove">{t('vn5.filter.modeRemove')}</option>
              <option value="drop">{t('vn5.filter.modeDrop')}</option>
            </select>
            <button
              type="button"
              className="btn small"
              aria-label={t('vn5.filter.removeRule', { index: index + 1 })}
              onClick={() => setDraft((current) => ({ ...current, rules: current.rules.filter((_, i) => i !== index) }))}
            >
              {t('vn5.filter.remove')}
            </button>
            {invalid.has(index) && <small className="media-error">{t('vn5.filter.invalid')}</small>}
          </div>
        ))}
        <div className="vn5-filter-actions">
          <button
            type="button"
            className="btn small"
            data-vn5-action="add-rule"
            disabled={draft.rules.length >= VN5_FILTER_RULE_MAX}
            onClick={() => setDraft((current) => ({
              ...current,
              rules: [...current.rules, { pattern: '', mode: 'remove', enabled: true }],
            }))}
          >
            {t('vn5.filter.addRule')}
          </button>
          <button
            type="button"
            className="btn small primary"
            data-vn5-action="save-filters"
            disabled={!dirty || busy}
            onClick={() => void save({ ...draft, rules: draft.rules.filter((rule) => rule.pattern.trim()) })}
          >
            {t('vn5.filter.save')}
          </button>
          {dirty && <small className="muted">{t('vn5.filter.unsaved')}</small>}
        </div>
      </div>

      <div className="vn5-filter-preview">
        <strong>{t('vn5.filter.previewHead')}</strong>
        <input
          value={sample}
          lang="ja"
          spellCheck={false}
          placeholder={t('vn5.filter.samplePlaceholder')}
          aria-label={t('vn5.filter.sample')}
          data-vn5-filter-sample=""
          onChange={(event) => setSample(event.target.value)}
        />
        {preview.rows.length === 0 && <p className="muted">{t('vn5.filter.previewEmpty')}</p>}
        <ul aria-label={t('vn5.filter.previewHead')}>
          {preview.rows.map((row, index) => (
            <li key={index} className={row.dropped ? 'is-dropped' : row.changed ? 'is-changed' : undefined} data-vn5-preview-row={index}>
              <span lang="ja" className="vn5-filter-before">{row.before}</span>
              <span aria-hidden="true">{' → '}</span>
              {row.dropped
                ? <em>{t('vn5.filter.dropped')}</em>
                : <span lang="ja" className="vn5-filter-after">{row.changed ? row.text : t('vn5.filter.unchanged')}</span>}
            </li>
          ))}
        </ul>
      </div>
    </fieldset>
  );
}
