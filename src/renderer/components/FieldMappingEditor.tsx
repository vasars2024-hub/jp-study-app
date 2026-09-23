import { useEffect, useId, useRef, useState } from 'react';
import {
  EXAMPLE_COUNT_LANGS,
  MINING_VARS,
  MINING_LANGS,
  MINING_TRANSLATABLE_BASES,
  resolveExampleCount,
  type ExampleCountLang,
} from '../../shared/anki';
import {
  seedFallbackForModel,
  seedTemplatesForModel,
} from '../../shared/profileFields';
import { SEED_PROFILES, type SeedProfileId } from '../../shared/seedProfiles';
import type { StudyProfile } from '../../shared/profiles';
import { useT } from '../i18n';
import { updateProfile } from '../profileState';
import type { MappingPreviewState } from './AnkiCardPreview';
import CollapsibleSection from './CollapsibleSection';

// Jidoujisho-style dynamic field mapping. For the note type bound to the
// active profile we render one input per Anki field; the user drops
// {placeholders} (from the palette) into each field. Saving persists the map
// to profile.anki.fieldTemplates, which the mining gateway renders at card
// creation time (src/main/anki/index.ts). The component is remounted by its
// parent (via `key`) whenever the profile or note type changes, so its local
// draft always starts from the right note type.

type Msg = { kind: 'ok' | 'err'; text: string };

const FIELD_GUESSES: { re: RegExp; key: string }[] = [
  { re: /(image|picture|screenshot|画像|snapshot)/i, key: 'image' },
  { re: /(audio|音声|sound|発音|pronunciation)/i, key: 'audio' },
  { re: /(pitch|accent|アクセント|高低)/i, key: 'pitch' },
  { re: /(frequency|freq|頻度)/i, key: 'frequency' },
  { re: /cloze[-_ ]?(before|prefix)/i, key: 'cloze-before' },
  { re: /cloze[-_ ]?(after|suffix)/i, key: 'cloze-after' },
  { re: /(cloze[-_ ]?(inside|body|word)|^\s*cloze\s*$)/i, key: 'cloze-inside' },
  { re: /(sentence|context|例文|用例)/i, key: 'sentence' },
  { re: /(reading|furigana|kana|yomi|読み|よみ|ルビ|hiragana)/i, key: 'reading' },
  { re: /(translation|翻訳|訳|native|russian)/i, key: 'translation' },
  { re: /(meaning|definition|gloss|意味|定義|back|english)/i, key: 'meaning' },
  { re: /(expression|term|word|vocab|単語|表現|front|kanji|target|headword|見出)/i, key: 'expression' },
];

function guessVar(field: string): string {
  for (const g of FIELD_GUESSES) if (g.re.test(field)) return g.key;
  return '';
}

function guessTemplates(fields: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  let hasExpression = false;
  for (const f of fields) {
    const key = guessVar(f);
    out[f] = key ? `{${key}}` : '';
    if (key === 'expression') hasExpression = true;
  }
  if (!hasExpression && fields[0]) out[fields[0]] = '{expression}';
  return out;
}

function seedTemplates(profile: StudyProfile, fields: string[], usePackDefaults?: boolean): Record<string, string> {
  const packProfile = usePackDefaults ? SEED_PROFILES[profile.id as SeedProfileId] : undefined;
  const seeded = seedTemplatesForModel(packProfile ?? profile, fields);
  const guessed = guessTemplates(fields);
  const out: Record<string, string> = {};
  for (const f of fields) out[f] = seeded[f]?.trim() ? seeded[f] : (guessed[f] ?? '');
  return out;
}

export default function FieldMappingEditor({
  profile,
  fields,
  onMessage,
  onChange,
  hideExamplesFallback = false,
  usePackDefaults = false,
}: {
  profile: StudyProfile;
  fields: string[];
  onMessage?: (m: Msg) => void;
  onChange?: (state: MappingPreviewState) => void;
  /** AI studio fills all fields — skip Tatoeba example counts and expression fallback. */
  hideExamplesFallback?: boolean;
  /** Show canonical pack templates instead of saved empty overrides (AI studio). */
  usePackDefaults?: boolean;
}) {
  const [templates, setTemplates] = useState<Record<string, string>>(() =>
    seedTemplates(profile, fields, usePackDefaults),
  );
  const [exampleCounts, setExampleCounts] = useState<Partial<Record<ExampleCountLang, number>>>(
    () => ({ ...(profile.anki.exampleCounts ?? {}) }),
  );
  const [exampleFallback, setExampleFallback] = useState(
    () => profile.anki.exampleFallback !== false,
  );
  const [fallbackTemplates, setFallbackTemplates] = useState<Record<string, string>>(() => {
    const fromProfile = seedFallbackForModel(profile, fields);
    const hasAny = Object.values(fromProfile).some((v) => v.trim());
    if (hasAny) return fromProfile;
    return seedTemplates(profile, fields, usePackDefaults);
  });
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const { t } = useT();

  useEffect(() => {
    onChange?.({ templates, fallbackTemplates, exampleFallback });
  }, [templates, fallbackTemplates, exampleFallback, onChange]);

  const inputRefs = useRef(new Map<string, HTMLInputElement>());
  const lastFocused = useRef<string | null>(null);

  function setField(field: string, value: string) {
    setTemplates((prev) => ({ ...prev, [field]: value }));
    setDirty(true);
  }

  function insertVar(varKey: string) {
    const token = `{${varKey}}`;
    const field = lastFocused.current ?? fields[0];
    if (!field) return;
    const el = inputRefs.current.get(field);
    const current = templates[field] ?? '';
    let next: string;
    let caret: number;
    if (el && document.activeElement === el && el.selectionStart != null) {
      const start = el.selectionStart;
      const end = el.selectionEnd ?? start;
      next = current.slice(0, start) + token + current.slice(end);
      caret = start + token.length;
    } else {
      next = current ? `${current} ${token}` : token;
      caret = next.length;
    }
    setField(field, next);
    requestAnimationFrame(() => {
      const again = inputRefs.current.get(field);
      if (again) {
        again.focus();
        again.setSelectionRange(caret, caret);
      }
    });
  }

  function setExampleCount(lang: ExampleCountLang, raw: string) {
    const n = raw === '' ? undefined : Math.max(0, Math.min(10, parseInt(raw, 10) || 0));
    setExampleCounts((prev) => {
      const next = { ...prev };
      if (n === undefined) delete next[lang];
      else next[lang] = n;
      return next;
    });
    setDirty(true);
  }

  async function save() {
    // `aria-disabled` leaves the button clickable, which is the whole point (a
    // `disabled` button is not focusable, so its reason never reaches a keyboard
    // or screen-reader user). The refusal therefore has to live here.
    if (saving || !dirty) return;
    setSaving(true);
    const mergedFallback: Record<string, string> = {};
    if (exampleFallback) {
      for (const f of fields) {
        mergedFallback[f] = (fallbackTemplates[f] ?? '').trim() || (templates[f] ?? '');
      }
    }
    const res = await updateProfile(profile.id, {
      anki: {
        fieldTemplates: templates,
        exampleCounts,
        exampleFallback,
        exampleFallbackTemplates: exampleFallback ? mergedFallback : {},
      },
    });
    setSaving(false);
    if (res.ok) {
      setDirty(false);
      onMessage?.({ kind: 'ok', text: t('fm.msg.saved') });
    } else {
      onMessage?.({ kind: 'err', text: res.error ?? t('fm.msg.saveFailed') });
    }
  }

  async function resetToAuto() {
    setSaving(true);
    const res = await updateProfile(profile.id, { anki: { fieldTemplates: {} } });
    setSaving(false);
    if (res.ok) {
      setTemplates(seedTemplates(profile, fields));
      setDirty(false);
      onMessage?.({ kind: 'ok', text: t('fm.msg.reverted') });
    } else {
      onMessage?.({ kind: 'err', text: res.error ?? t('fm.msg.resetFailed') });
    }
  }

  const mappedCount = fields.filter((f) => (templates[f] ?? '').trim()).length;
  const saveReasonId = `${useId()}-fm-save-reason`;
  const saveDisabledReason = saving
    ? t('anki.fieldMapping.saveDisabled.saving')
    : dirty
      ? undefined
      : t('anki.fieldMapping.saveDisabled.clean');

  return (
    <div className="fm-editor">
      <CollapsibleSection
        title={t('fm.section.templates')}
        summary={t('fm.summary.mapped', { mapped: mappedCount, total: fields.length })}
        defaultOpen
      >
        <p className="muted collapse-lead">{t('fm.lead.templates')}</p>
        <div className="fm-rows">
          {fields.map((field) => (
            <label className="fm-row" key={field}>
              <span className="fm-field-name" lang="ja">
                {field}
              </span>
              <input
                className="fm-input"
                value={templates[field] ?? ''}
                spellCheck={false}
                placeholder={t('fm.placeholder.auto')}
                ref={(el) => {
                  if (el) inputRefs.current.set(field, el);
                  else inputRefs.current.delete(field);
                }}
                onFocus={() => {
                  lastFocused.current = field;
                }}
                onChange={(e) => setField(field, e.target.value)}
              />
            </label>
          ))}
        </div>
        <div className="fm-actions">
          {/* Rubric category 8 measured this as the surface's one mute pair: a disabled
              control whose only account of itself is its own label. "Saved" says what
              happened, not why the button will not respond, and the harness ignores a
              control's own text for exactly that reason.

              Boss audit F4: carrying that reason in `title` alone made it mouse-only. A
              `disabled` button is not keyboard-focusable and `title` is not reliably
              announced, so a keyboard or screen-reader user still got the bare word
              "Saved". The button now stays focusable with `aria-disabled`, the reason is
              rendered as visible text beside it, and `aria-describedby` binds the two.
              `title` is kept for the hover affordance it already had. */}
          <button
            className="btn primary"
            type="button"
            onClick={save}
            aria-disabled={saving || !dirty}
            aria-describedby={saveDisabledReason ? saveReasonId : undefined}
            title={saveDisabledReason}
          >
            {saving ? t('fm.btn.saving') : dirty ? t('fm.btn.save') : t('fm.btn.saved')}
          </button>
          <button className="btn" type="button" onClick={resetToAuto} disabled={saving}>
            {t('fm.btn.reset')}
          </button>
          {saveDisabledReason ? (
            <p className="fm-action-reason" id={saveReasonId}>
              {saveDisabledReason}
            </p>
          ) : null}
        </div>
      </CollapsibleSection>

      <CollapsibleSection title={t('fm.section.palette')} summary={t('fm.summary.palette')}>
        <p className="muted collapse-lead">
          {t('fm.lead.palette.before')} <code>{'{expression:ru}'}</code>{' '}
          {t('fm.lead.palette.after')}
        </p>
        <div className="fm-palette lq-hit-scope" aria-label={t('fm.aria.insertVar')}>
          <span className="fm-palette-label">{t('fm.label.base')}</span>
          {MINING_VARS.map((v) => (
            <button
              key={v.key}
              type="button"
              className="fm-chip"
              title={t(`mining.vars.${v.key}.hint`)}
              onClick={() => insertVar(v.key)}
            >
              {`{${v.key}}`}
            </button>
          ))}
        </div>

        <div className="fm-translated lq-hit-scope" aria-label={t('fm.aria.insertTranslated')}>
          <span className="fm-palette-label">{t('fm.label.translated')}</span>
          <div className="fm-translated-grid">
            {MINING_LANGS.map((lang) => (
              <div key={lang.code} className="fm-lang-col">
                <span className="fm-lang-head">{lang.label}</span>
                {(lang.code === 'ja'
                  ? ['reading', ...MINING_TRANSLATABLE_BASES]
                  : [...MINING_TRANSLATABLE_BASES]
                ).map((base) => (
                  <button
                    key={`${base}:${lang.code}`}
                    type="button"
                    className="fm-chip fm-chip-lang"
                    title={t('fm.title.translatedTo', { base, lang: lang.label })}
                    onClick={() => insertVar(`${base}:${lang.code}`)}
                  >
                    {`{${base}:${lang.code}}`}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>

        <div className="fm-palette lq-hit-scope" aria-label={t('fm.aria.insertPair')}>
          <span className="fm-palette-label">{t('fm.label.pairs')}</span>
          <button
            type="button"
            className="fm-chip"
            title={t('fm.title.pairs.ru')}
            onClick={() => insertVar('example-pairs:ru:ja')}
          >
            {`{example-pairs:ru:ja}`}
          </button>
          <button
            type="button"
            className="fm-chip"
            title={t('fm.title.pairs.en')}
            onClick={() => insertVar('example-pairs:en:ja')}
          >
            {`{example-pairs:en:ja}`}
          </button>
          <button
            type="button"
            className="fm-chip"
            title={t('fm.title.pairs.zh')}
            onClick={() => insertVar('example-pairs:zh:ja')}
          >
            {`{example-pairs:zh:ja}`}
          </button>
        </div>
      </CollapsibleSection>

      {!hideExamplesFallback && (
      <CollapsibleSection
        title={t('fm.section.examples')}
        summary={
          exampleFallback ? t('fm.summary.examplesOn') : t('fm.summary.examplesOff')
        }
      >
        <div className="fm-example-counts" aria-label={t('fm.aria.exampleCounts')}>
          <p className="muted collapse-lead">{t('fm.lead.examples')}</p>
          <div className="fm-example-count-grid">
            {EXAMPLE_COUNT_LANGS.map(({ code, label }) => (
              <label className="fm-example-count" key={code}>
                <span className="fm-example-count-label">{label}</span>
                <input
                  type="number"
                  min={0}
                  max={10}
                  value={exampleCounts[code] ?? resolveExampleCount(undefined, code)}
                  onChange={(e) => setExampleCount(code, e.target.value)}
                />
              </label>
            ))}
          </div>
        </div>

        <div className="fm-example-fallback">
          <label className="fm-fallback-toggle lq-check-row">
            <input
              type="checkbox"
              checked={exampleFallback}
              onChange={(e) => {
                setExampleFallback(e.target.checked);
                setDirty(true);
              }}
            />
            {t('fm.toggle.fallback')}
          </label>
          <p className="muted collapse-lead">
            {t('fm.lead.fallback.before')}{' '}
            <code>{'{expression:ru}'}</code> {t('fm.lead.fallback.middle')}{' '}
            <code>{'{example-sentence:ru}'}</code>.
          </p>
          {exampleFallback && (
            <div className="fm-rows fm-fallback-rows">
              {fields.map((field) => (
                <label className="fm-row" key={`fb-${field}`}>
                  <span className="fm-field-name" lang="ja">
                    {t('fm.field.fallbackSuffix', { field })}
                  </span>
                  <input
                    className="fm-input"
                    value={fallbackTemplates[field] ?? ''}
                    spellCheck={false}
                    placeholder={t('fm.placeholder.fallbackEg')}
                    onChange={(e) => {
                      setFallbackTemplates((prev) => ({ ...prev, [field]: e.target.value }));
                      setDirty(true);
                    }}
                  />
                </label>
              ))}
            </div>
          )}
        </div>
      </CollapsibleSection>
      )}
    </div>
  );
}
