import { useEffect, useState, type FormEvent } from 'react';
import {
  computeCloze,
  hasFieldTemplates,
  renderFieldTemplate,
  type MiningValues,
  type AnkiLinkStatus,
} from '../../shared/anki';
import { DEFAULT_CARD_CSS } from '../../shared/kinomotoCard';
import type { StudyProfile } from '../../shared/profiles';
import type { AnkiStatus } from '../../shared/types';
import { AppChrome, StatusBarField, StatusBarSpacer, type MenuBarMenu } from '../components/ui';
import AnkiCardPreview, { type MappingPreviewState } from '../components/AnkiCardPreview';
import AnkiSetup from '../components/AnkiSetup';
import CollapsibleSection from '../components/CollapsibleSection';
import FieldMappingEditor from '../components/FieldMappingEditor';
import NoteCssEditor from '../components/NoteCssEditor';
import { getActiveProfile, onProfileChanged, updateProfile } from '../profileState';
import { ProfileSettingsSection } from './SettingsView';

type Msg = { kind: 'ok' | 'err'; text: string };

/** Show the profile's current value even if it isn't in Anki yet (created on first mine). */
function withCurrent(list: string[], current: string): string[] {
  return current && !list.includes(current) ? [current, ...list] : list;
}

export default function AnkiView() {
  const [status, setStatus] = useState<AnkiStatus | null>(null);
  const [link, setLink] = useState<AnkiLinkStatus | null>(null);
  const [loading, setLoading] = useState(true);

  // The whole "Default deck / Note type / Field mapping" configuration now
  // lives on the active profile — switching profiles swaps every value below.
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
  const [previewCss, setPreviewCss] = useState(
    () => getActiveProfile().noteCss ?? DEFAULT_CARD_CSS,
  );

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

  async function check() {
    setLoading(true);
    const s = await window.api.ankiStatus();
    setStatus(s);
    setLoading(false);
  }

  useEffect(() => {
    void window.api.ankiLinkState().then(setLink);
    check();
    return window.api.onAnkiLinkChanged((next) => {
      setLink(next);
      if (next.state === 'connected') {
        void check();
        return;
      }
      if (next.waitingCollection) {
        setStatus({
          connected: false,
          decks: [],
          models: [],
          error: next.error,
        });
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
  }, []);

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
        setFieldsErr(r.error ?? 'Could not read this note type’s fields.');
      }
    });
    return () => {
      alive = false;
    };
  }, [model, status?.connected, active.id, active.anki.noteFields]);

  function changeDeck(value: string) {
    setActive((a) => ({ ...a, anki: { ...a.anki, deckName: value } }));
    void updateProfile(active.id, { anki: { deckName: value } });
  }

  async function ensureNoteType() {
    setMapMsg(null);
    const res = await window.api.ankiEnsureModel(active.id);
    if (res.ok) {
      setMapMsg({ kind: 'ok', text: `Note type "${model}" is ready in Anki.` });
      if (active.anki.noteFields?.length) setFields([...active.anki.noteFields]);
    } else {
      setMapMsg({ kind: 'err', text: res.error ?? 'Could not create the note type.' });
    }
  }

  async function addCard(e: FormEvent) {
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
      setAddMsg({ kind: 'ok', text: 'Card added to Anki.' });
      setTerm('');
      setReading('');
      setMeaning('');
      setSentence('');
      setTranslation('');
    } else if (res.error === 'duplicate') {
      setAddMsg({ kind: 'err', text: 'That card already exists in Anki.' });
    } else {
      setAddMsg({ kind: 'err', text: res.error ?? 'Could not add the card.' });
    }
  }

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
    image: attachImage ? '🖼 (clipboard image)' : '',
  };
  const preview = usingTemplates
    ? fields
        .filter((f) => (templates[f] ?? '').trim())
        .map((f) => ({ field: f, value: renderFieldTemplate(templates[f], previewValues) }))
    : [];

  const waitingCollection = Boolean(link?.waitingCollection);

  const ankiMenus: MenuBarMenu[] = [
    {
      id: 'anki',
      label: 'Anki',
      items: [{ id: 'recheck', label: 'Recheck connection', disabled: loading, onSelect: check }],
    },
  ];
  const connLabel = loading
    ? 'Checking…'
    : status?.connected
      ? 'Connected'
      : waitingCollection
        ? 'Waiting for collection'
        : 'Not connected';
  const ankiStatus = (
    <>
      <StatusBarField live>{connLabel}</StatusBarField>
      <StatusBarSpacer />
      {active.label && <StatusBarField>Profile: {active.label}</StatusBarField>}
    </>
  );

  return (
    <AppChrome menus={ankiMenus} status={ankiStatus}>
    <div className="anki-view">
      <ProfileSettingsSection />

      <div className="view-head">
        <p className="muted">Create cards in your real Anki collection via AnkiConnect.</p>
        <div className="actions">
          <button className="btn" onClick={check} disabled={loading}>
            {loading ? 'Checking…' : 'Recheck'}
          </button>
        </div>
      </div>

      {loading && <div className="banner">Checking your Anki connection…</div>}

      {!loading && status && !status.connected && (
        <div className="anki-card">
          <div className={`status-banner ${waitingCollection ? 'warn' : 'bad'}`}>
            <span className={`status-dot ${waitingCollection ? 'warn' : 'bad'}`} />
            {waitingCollection ? 'Waiting for Anki collection…' : 'Not connected to Anki.'}
          </div>
          <AnkiSetup status={status} onRetry={check} waitingCollection={waitingCollection} />
        </div>
      )}

      {!loading && status?.connected && (
        <div className="anki-workspace">
          <div className="anki-workspace-main">
            <div className="status-banner ok">
              <span className="status-dot ok" />
              Connected — {status.decks.length} decks, {status.models.length} note types.
            </div>

            <div className="anki-card">
              <h2>Deck &amp; note type</h2>
              <p className="muted anki-sub">
                Bound to <b>{active.label}</b>
                {active.description ? ` — ${active.description}` : ''}. Switch profiles above to
                change deck, mapping, and card layout together.
              </p>
              <div className="anki-selects">
                <label>
                  Deck
                  <select value={deck} onChange={(e) => changeDeck(e.target.value)}>
                    {withCurrent(status.decks, deck).map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="anki-note-type-readonly">
                  <span className="anki-note-type-label">Note type</span>
                  <code className="anki-note-type-name">{model || '—'}</code>
                  <button className="btn small" type="button" onClick={() => void ensureNoteType()}>
                    Create in Anki
                  </button>
                </div>
              </div>

              {active.requiredDictionaries && active.requiredDictionaries.length > 0 && (
                <details className="profile-dicts-details">
                  <summary>Recommended dictionaries &amp; data</summary>
                  <ul className="profile-dicts-list">
                    {active.requiredDictionaries.map((d) => (
                      <li key={d}>{d}</li>
                    ))}
                  </ul>
                </details>
              )}
            </div>

            <div className="anki-card">
              <h2>Field mapping</h2>
              <p className="muted anki-sub">
                Control what goes into each field of <b>{model || '—'}</b>. The preview panel on the
                right updates as you edit.
              </p>

              {fieldsLoading && <div className="muted anki-sub">Reading this note type’s fields…</div>}
              {fieldsErr && <div className="form-msg err">{fieldsErr}</div>}
              {!fieldsLoading && !fieldsErr && fields.length === 0 && (
                <div className="muted anki-sub">This note type has no fields.</div>
              )}
              {fields.length > 0 && (
                <FieldMappingEditor
                  key={`${active.id}::${model}`}
                  profile={active}
                  fields={fields}
                  onMessage={setMapMsg}
                  onChange={setMappingPreview}
                />
              )}
              {mapMsg && <div className={`form-msg ${mapMsg.kind}`}>{mapMsg.text}</div>}
            </div>

            <div className="anki-card anki-card-flush">
              <NoteCssEditor
                key={active.id}
                profile={active}
                onCssChange={setPreviewCss}
                onMessage={setMapMsg}
              />
            </div>

            <div className="anki-card anki-card-flush">
              <CollapsibleSection title="Add a card by hand" summary="Manual test without mining">
                <form className="anki-manual-form" onSubmit={addCard}>
                <p className="muted collapse-lead">
                  Fill variables — they flow into your mapped fields. Useful for testing a profile
                  before mining from the dictionary.
                </p>
                <div className="field-row">
                  <label>Expression (word) *</label>
                  <input
                    value={term}
                    onChange={(e) => setTerm(e.target.value)}
                    placeholder="例えば 勉強"
                    lang="ja"
                  />
                </div>
                <div className="anki-selects">
                  <label>
                    Reading
                    <input
                      value={reading}
                      onChange={(e) => setReading(e.target.value)}
                      placeholder="べんきょう"
                      lang="ja"
                    />
                  </label>
                  <label>
                    Translation
                    <input
                      value={translation}
                      onChange={(e) => setTranslation(e.target.value)}
                      placeholder="учёба"
                    />
                  </label>
                </div>
                <div className="field-row">
                  <label>Meaning</label>
                  <textarea
                    value={meaning}
                    onChange={(e) => setMeaning(e.target.value)}
                    placeholder="study; diligence"
                  />
                </div>
                <div className="field-row">
                  <label>Sentence</label>
                  <textarea
                    value={sentence}
                    onChange={(e) => setSentence(e.target.value)}
                    placeholder="毎日日本語を勉強します。"
                    lang="ja"
                  />
                </div>

                <label className="anki-check">
                  <input
                    type="checkbox"
                    checked={attachImage}
                    onChange={(e) => setAttachImage(e.target.checked)}
                  />
                  <span>Attach clipboard image (fills <code>{'{image}'}</code>)</span>
                </label>

                <label className="anki-check">
                  <input
                    type="checkbox"
                    checked={fetchAudio}
                    onChange={(e) => setFetchAudio(e.target.checked)}
                  />
                  <span>Fetch native audio (fills <code>{'{audio}'}</code>)</span>
                </label>

                {usingTemplates && preview.length > 0 && (
                  <div className="fm-preview">
                    <div className="fm-preview-title muted">This card will send:</div>
                    {preview.map((p) => (
                      <div className="fm-preview-row" key={p.field}>
                        <span className="fm-field-name">{p.field}</span>
                        <span
                          className="fm-preview-val"
                          dangerouslySetInnerHTML={{ __html: p.value || '<i>(empty)</i>' }}
                        />
                      </div>
                    ))}
                  </div>
                )}

                <button className="btn primary" type="submit" disabled={adding || !term.trim()}>
                  {adding ? 'Adding…' : 'Add to Anki'}
                </button>
                {addMsg && <div className={`form-msg ${addMsg.kind}`}>{addMsg.text}</div>}
                <p className="muted anki-sub">
                  Goes into <b>{deck || '—'}</b> as <b>{model || '—'}</b>, tagged{' '}
                  <code>jp-study-app</code>.
                </p>
                </form>
              </CollapsibleSection>
            </div>
          </div>

          {fields.length > 0 && (
            <AnkiCardPreview
              profile={active}
              fields={fields}
              mapping={mappingPreview}
              noteCss={previewCss}
            />
          )}
        </div>
      )}
    </div>
    </AppChrome>
  );
}
