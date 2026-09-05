/**
 * Anki connection, deck/note-type binding, field mapping, and the manual-card
 * form — shared by Study OS's `AnkiView` and Blanc's `BlancAnkiPanel`.
 *
 * Pillar 0 (BLANC_REFINEMENT_PLAN.md): the Deck tab's advanced branch used to
 * mount `AnkiView` (and therefore `AppChrome`) inside a Blanc panel. All the
 * state lives in `useAnkiConfig`; the blocks below render bodies only — no
 * headings, no container — so each shell supplies its own framing (`anki-card`
 * + `<h2>` in Study OS, `fieldset`/`legend` in Blanc).
 *
 * Nothing here may import `AppChrome`/`MenuBar`/`StatusBar`, or
 * `ProfileSettingsSection` (which lives in `SettingsView` and would drag the
 * whole settings surface into Blanc's bundle).
 */
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  computeCloze,
  hasFieldTemplates,
  renderFieldTemplate,
  type MiningValues,
  type AnkiLinkStatus,
} from '../../../shared/anki';
import { DEFAULT_CARD_CSS } from '../../../shared/kinomotoCard';
import type { StudyProfile } from '../../../shared/profiles';
import type { AnkiStatus } from '../../../shared/types';
import AnkiCardPreview, { type MappingPreviewState } from '../AnkiCardPreview';
import AnkiSetup from '../AnkiSetup';
import FieldMappingEditor from '../FieldMappingEditor';
import NoteCssEditor from '../NoteCssEditor';
import { getActiveProfile, onProfileChanged, updateProfile } from '../../profileState';
import { useT } from '../../i18n';

export type Msg = { kind: 'ok' | 'err'; text: string };

/** Show the profile's current value even if it isn't in Anki yet (created on first mine). */
export function withCurrent(list: string[], current: string): string[] {
  return current && !list.includes(current) ? [current, ...list] : list;
}

export interface AnkiConfigState {
  status: AnkiStatus | null;
  link: AnkiLinkStatus | null;
  loading: boolean;
  active: StudyProfile;
  deck: string;
  model: string;
  fields: string[];
  fieldsLoading: boolean;
  fieldsErr: string | null;
  mapMsg: Msg | null;
  setMapMsg: (m: Msg | null) => void;
  mappingPreview: MappingPreviewState;
  setMappingPreview: (m: MappingPreviewState) => void;
  previewCss: string;
  setPreviewCss: (css: string) => void;
  waitingCollection: boolean;
  connLabel: string;
  check: () => Promise<void>;
  changeDeck: (value: string) => void;
  ensureNoteType: () => Promise<void>;
  // Manual card form
  term: string;
  setTerm: (v: string) => void;
  reading: string;
  setReading: (v: string) => void;
  meaning: string;
  setMeaning: (v: string) => void;
  sentence: string;
  setSentence: (v: string) => void;
  translation: string;
  setTranslation: (v: string) => void;
  attachImage: boolean;
  setAttachImage: (v: boolean) => void;
  fetchAudio: boolean;
  setFetchAudio: (v: boolean) => void;
  adding: boolean;
  addMsg: Msg | null;
  addCard: (e: FormEvent) => Promise<void>;
  usingTemplates: boolean;
  preview: { field: string; value: string }[];
}

export function useAnkiConfig(): AnkiConfigState {
  const { t } = useT();
  const [status, setStatus] = useState<AnkiStatus | null>(null);
  const [link, setLink] = useState<AnkiLinkStatus | null>(null);
  const [loading, setLoading] = useState(true);

  // The whole "Default deck / Note type / Field mapping" configuration lives on
  // the active profile — switching profiles swaps every value below.
  const [active, setActive] = useState<StudyProfile>(getActiveProfile);

  const [fields, setFields] = useState<string[]>([]);
  const [fieldsLoading, setFieldsLoading] = useState(false);
  const [fieldsErr, setFieldsErr] = useState<string | null>(null);
  const [mapMsg, setMapMsg] = useState<Msg | null>(null);
  const [mappingPreview, setMappingPreview] = useState<MappingPreviewState>({
    templates: {},
    fallbackTemplates: {},
    exampleFallback: true,
  });
  const [previewCss, setPreviewCss] = useState(() => getActiveProfile().noteCss ?? DEFAULT_CARD_CSS);

  // Manual "add a card" form — entered as variables, not raw Front/Back.
  const [term, setTerm] = useState('');
  const [reading, setReading] = useState('');
  const [meaning, setMeaning] = useState('');
  const [sentence, setSentence] = useState('');
  const [translation, setTranslation] = useState('');
  const [attachImage, setAttachImage] = useState(false);
  const [fetchAudio, setFetchAudio] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addMsg, setAddMsg] = useState<Msg | null>(null);

  const deck = active.anki.deckName;
  const model = active.anki.modelName;

  // Keep the local copy in step with the store (profile switches, other views).
  useEffect(
    () =>
      onProfileChanged((snap) => {
        const a = snap.profiles.find((p) => p.id === snap.activeProfileId);
        if (a) {
          setActive(a);
          setPreviewCss(a.noteCss ?? DEFAULT_CARD_CSS);
        }
      }),
    [],
  );

  const check = useCallback(async () => {
    setLoading(true);
    const s = await window.api.ankiStatus();
    setStatus(s);
    setLoading(false);
  }, []);

  useEffect(() => {
    void window.api.ankiLinkState().then(setLink);
    void check();
    return window.api.onAnkiLinkChanged((next) => {
      setLink(next);
      if (next.state === 'connected') {
        void check();
        return;
      }
      if (next.waitingCollection) {
        setStatus({ connected: false, decks: [], models: [], error: next.error });
        setLoading(false);
        return;
      }
      if (next.state === 'disconnected') {
        setStatus((prev) => ({
          connected: false,
          decks: prev?.decks ?? [],
          models: prev?.models ?? [],
          error: next.error,
        }));
        setLoading(false);
      }
    });
  }, [check]);

  // Re-fetch the field list whenever the bound note type changes (or we connect).
  useEffect(() => {
    const specFields = active.anki.noteFields ?? [];
    if (!status?.connected || !model) {
      setFields(specFields.length ? [...specFields] : []);
      return;
    }
    let alive = true;
    setFieldsLoading(true);
    setFieldsErr(null);
    window.api.ankiModelFields(model).then((r) => {
      if (!alive) return;
      setFieldsLoading(false);
      if (r.ok && r.fields.length) {
        setFields(r.fields);
      } else if (specFields.length) {
        setFields([...specFields]);
      } else {
        setFields([]);
        setFieldsErr(r.error ?? t('anki.msg.fieldsReadFailed'));
      }
    });
    return () => {
      alive = false;
    };
    // `t` is stable by design (CLAUDE.md i18n rule 6) — depending on it would go
    // stale rather than error, so it is deliberately not in this list.
  }, [model, status?.connected, active.id, active.anki.noteFields]);

  const changeDeck = useCallback(
    (value: string) => {
      setActive((a) => ({ ...a, anki: { ...a.anki, deckName: value } }));
      void updateProfile(active.id, { anki: { deckName: value } });
    },
    [active.id],
  );

  const ensureNoteType = useCallback(async () => {
    setMapMsg(null);
    const res = await window.api.ankiEnsureModel(active.id);
    if (res.ok) {
      setMapMsg({ kind: 'ok', text: t('anki.msg.noteTypeReady', { model: model ?? '' }) });
      if (active.anki.noteFields?.length) setFields([...active.anki.noteFields]);
    } else {
      setMapMsg({ kind: 'err', text: res.error ?? t('anki.msg.noteTypeCreateFailed') });
    }
  }, [active.id, active.anki.noteFields, model, t]);

  const addCard = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (!term.trim()) return;
      setAdding(true);
      setAddMsg(null);
      const res = await window.api.ankiMineNote({
        term: term.trim(),
        reading: reading.trim() || undefined,
        meaning: meaning.trim() || undefined,
        sentence: sentence.trim() || undefined,
        translation: translation.trim() || undefined,
        captureClipboardImage: attachImage || undefined,
        fetchAudio: fetchAudio || undefined,
      });
      setAdding(false);
      if (res.ok) {
        setAddMsg({ kind: 'ok', text: t('anki.msg.cardAdded') });
        setTerm('');
        setReading('');
        setMeaning('');
        setSentence('');
        setTranslation('');
      } else if (res.error === 'duplicate') {
        setAddMsg({ kind: 'err', text: t('anki.msg.duplicate') });
      } else {
        setAddMsg({ kind: 'err', text: res.error ?? t('anki.msg.addFailed') });
      }
    },
    [term, reading, meaning, sentence, translation, attachImage, fetchAudio, t],
  );

  const templates = active.anki.fieldTemplates ?? {};
  const usingTemplates = hasFieldTemplates(templates);
  const cloze = computeCloze(sentence, undefined, term, reading);
  const previewValues: MiningValues = {
    expression: term,
    reading,
    meaning,
    translation,
    sentence,
    'sentence-translation': '',
    'cloze-before': cloze.before,
    'cloze-inside': cloze.inside,
    'cloze-after': cloze.after,
    pitch: '',
    frequency: '',
    audio: '',
    image: attachImage ? '[clipboard image]' : '',
  };
  const preview = usingTemplates
    ? fields
        .filter((f) => (templates[f] ?? '').trim())
        .map((f) => ({ field: f, value: renderFieldTemplate(templates[f], previewValues) }))
    : [];

  const waitingCollection = Boolean(link?.waitingCollection);
  const connLabel = loading
    ? 'Checking…'
    : status?.connected
      ? 'Connected'
      : waitingCollection
        ? 'Waiting for collection'
        : 'Not connected';

  return {
    status,
    link,
    loading,
    active,
    deck,
    model,
    fields,
    fieldsLoading,
    fieldsErr,
    mapMsg,
    setMapMsg,
    mappingPreview,
    setMappingPreview,
    previewCss,
    setPreviewCss,
    waitingCollection,
    connLabel,
    check,
    changeDeck,
    ensureNoteType,
    term,
    setTerm,
    reading,
    setReading,
    meaning,
    setMeaning,
    sentence,
    setSentence,
    translation,
    setTranslation,
    attachImage,
    setAttachImage,
    fetchAudio,
    setFetchAudio,
    adding,
    addMsg,
    addCard,
    usingTemplates,
    preview,
  };
}

/** Disconnected state: the banner plus the setup walkthrough. */
export function AnkiDisconnected({ state }: { state: AnkiConfigState }) {
  const { t } = useT();
  if (!state.status) return null;

  return (
    <>
      <div className={`status-banner ${state.waitingCollection ? 'warn' : 'bad'}`}>
        <span className={`status-dot ${state.waitingCollection ? 'warn' : 'bad'}`} />
        {state.waitingCollection ? t('anki.waitingCollection') : t('anki.notConnected')}
      </div>
      <AnkiSetup
        status={state.status}
        onRetry={state.check}
        waitingCollection={state.waitingCollection}
      />
    </>
  );
}

export function AnkiDeckNoteType({ state }: { state: AnkiConfigState }) {
  const { t } = useT();
  const { active, deck, model, status } = state;

  return (
    <>
      <div className="anki-selects">
        <label>
          {t('anki.deck.label')}
          <select value={deck} onChange={(e) => state.changeDeck(e.target.value)}>
            {withCurrent(status?.decks ?? [], deck).map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </label>
        <div className="anki-note-type-readonly">
          <span className="anki-note-type-label">{t('anki.noteType.label')}</span>
          <code className="anki-note-type-name">{model || '—'}</code>
          <button
            className="btn small lq-hit"
            type="button"
            onClick={() => void state.ensureNoteType()}
          >
            {t('anki.noteType.create')}
          </button>
        </div>
      </div>

      {active.requiredDictionaries && active.requiredDictionaries.length > 0 && (
        <details className="profile-dicts-details">
          <summary>{t('anki.recommendedDicts')}</summary>
          <ul className="profile-dicts-list">
            {active.requiredDictionaries.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
        </details>
      )}
    </>
  );
}

export function AnkiFieldMapping({ state }: { state: AnkiConfigState }) {
  const { t } = useT();
  const { fields, fieldsLoading, fieldsErr, mapMsg, active, model } = state;

  return (
    <>
      {fieldsLoading && <div className="muted anki-sub">{t('anki.readingFields')}</div>}
      {fieldsErr && <div className="form-msg err">{fieldsErr}</div>}
      {!fieldsLoading && !fieldsErr && fields.length === 0 && (
        <div className="muted anki-sub">{t('anki.noFields')}</div>
      )}
      {fields.length > 0 && (
        <FieldMappingEditor
          key={`${active.id}::${model}`}
          profile={active}
          fields={fields}
          onMessage={state.setMapMsg}
          onChange={state.setMappingPreview}
        />
      )}
      {mapMsg && <div className={`form-msg ${mapMsg.kind}`}>{mapMsg.text}</div>}
    </>
  );
}

export function AnkiNoteCss({ state }: { state: AnkiConfigState }) {
  return (
    <NoteCssEditor
      key={state.active.id}
      profile={state.active}
      onCssChange={state.setPreviewCss}
      onMessage={state.setMapMsg}
    />
  );
}

export function AnkiManualCardForm({ state }: { state: AnkiConfigState }) {
  const { t } = useT();
  const { deck, model, usingTemplates, preview, addMsg, adding } = state;

  return (
    <form className="anki-manual-form" onSubmit={state.addCard}>
      <p className="muted collapse-lead">{t('anki.manualCard.lead')}</p>
      <div className="field-row">
        <label>{t('anki.field.expression')}</label>
        <input
          value={state.term}
          onChange={(e) => state.setTerm(e.target.value)}
          placeholder="例えば 勉強"
          lang="ja"
        />
      </div>
      <div className="anki-selects">
        <label>
          {t('anki.field.reading')}
          <input
            value={state.reading}
            onChange={(e) => state.setReading(e.target.value)}
            placeholder="べんきょう"
            lang="ja"
          />
        </label>
        <label>
          {t('anki.field.translation')}
          <input
            value={state.translation}
            onChange={(e) => state.setTranslation(e.target.value)}
            placeholder="учёба"
          />
        </label>
      </div>
      <div className="field-row">
        <label>{t('anki.field.meaning')}</label>
        <textarea
          value={state.meaning}
          onChange={(e) => state.setMeaning(e.target.value)}
          placeholder="study; diligence"
        />
      </div>
      <div className="field-row">
        <label>{t('anki.field.sentence')}</label>
        <textarea
          value={state.sentence}
          onChange={(e) => state.setSentence(e.target.value)}
          placeholder="毎日日本語を勉強します。"
          lang="ja"
        />
      </div>

      <label className="anki-check lq-check-row">
        <input
          type="checkbox"
          checked={state.attachImage}
          onChange={(e) => state.setAttachImage(e.target.checked)}
        />
        <span>
          {t('anki.attachImagePrefix')} <code>{'{image}'}</code>
          {t('anki.attachImageSuffix')}
        </span>
      </label>

      <label className="anki-check lq-check-row">
        <input
          type="checkbox"
          checked={state.fetchAudio}
          onChange={(e) => state.setFetchAudio(e.target.checked)}
        />
        <span>
          {t('anki.fetchAudioPrefix')} <code>{'{audio}'}</code>
          {t('anki.fetchAudioSuffix')}
        </span>
      </label>

      {usingTemplates && preview.length > 0 && (
        <div className="fm-preview">
          <div className="fm-preview-title muted">{t('anki.preview.willSend')}</div>
          {preview.map((p) => (
            <div className="fm-preview-row" key={p.field}>
              <span className="fm-field-name">{p.field}</span>
              <span
                className="fm-preview-val"
                dangerouslySetInnerHTML={{
                  __html: p.value || `<i>${t('anki.preview.empty')}</i>`,
                }}
              />
            </div>
          ))}
        </div>
      )}

      <button className="btn primary" type="submit" disabled={adding || !state.term.trim()}>
        {adding ? t('anki.adding') : t('anki.addToAnki')}
      </button>
      {addMsg && <div className={`form-msg ${addMsg.kind}`}>{addMsg.text}</div>}
      <p className="muted anki-sub">
        {t('anki.goesIntoPrefix')} <b>{deck || '—'}</b> {t('anki.goesIntoAs')}{' '}
        <b>{model || '—'}</b>, {t('anki.goesIntoTagged')} <code>jp-study-app</code>.
      </p>
    </form>
  );
}

export function AnkiPreviewPane({ state }: { state: AnkiConfigState }) {
  if (state.fields.length === 0) return null;
  return (
    <AnkiCardPreview
      profile={state.active}
      fields={state.fields}
      mapping={state.mappingPreview}
      noteCss={state.previewCss}
    />
  );
}
