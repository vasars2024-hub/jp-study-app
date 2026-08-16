/**
 * Recipe 14's own panel: pick a second deck, say which of its fields fill which
 * of this one's, and queue the merge.
 *
 * It sits beside the tray's kind select for the same reason recipe 13's does —
 * `merge-glossary` reads a **second package**, and a file, a key field, a list
 * of field pairs and a mode do not fit the one-row form every other kind
 * shares. `merge-glossary` is deliberately absent from `ACTION_KINDS`.
 *
 * **The glossary is built when Add is pressed, not while the form is edited.**
 * A source built as the user types would keep changing identity under an action
 * already sitting in the tray; built once at Add, the queued action and the
 * payload it plans against are the same merge by construction. Re-picking or
 * re-adding mints a new id, and a tray still holding the previous one refuses
 * by name (`glossary-mismatch`) rather than merging a file the user has moved
 * on from. One tray therefore carries one glossary — a second Add replaces it.
 *
 * The panel queues; it never applies. The preview, the outcome counts, the
 * refusals, Apply and Undo are all the tray's, unchanged.
 */
import { useCallback, useMemo, useState } from 'react';
import { ANKI_DRAFT_MAX_PAGE_SIZE, type AnkiDraft } from '../../../shared/ankiDraft';
import {
  buildGlossarySource,
  type GlossaryMergeMode,
  type GlossarySource,
} from '../../../shared/ankiGlossaryMerge';
import { useT } from '../../i18n';

const MODES: readonly GlossaryMergeMode[] = ['fill-empty', 'prefer-stronger', 'merge-senses'];

export interface GlossaryQueueParams {
  sourceId: string;
  keyField: string;
  fieldPairs: { fromField: string; toField: string }[];
  mode: GlossaryMergeMode;
}

/** Every field name any note type in a draft declares, once, in first-seen order. */
export function draftFieldNames(draft: AnkiDraft): string[] {
  const names: string[] = [];
  for (const noteType of draft.noteTypes) {
    for (const field of noteType.fields) if (!names.includes(field.name)) names.push(field.name);
  }
  return names;
}

export default function DeckWorkbenchGlossary({
  draft,
  onQueue,
}: {
  draft: AnkiDraft;
  onQueue: (source: GlossarySource, params: GlossaryQueueParams) => void;
}): JSX.Element {
  const { t } = useT();
  const [secondary, setSecondary] = useState<AnkiDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickSeq, setPickSeq] = useState(0);
  const [keyField, setKeyField] = useState('');
  const [mode, setMode] = useState<GlossaryMergeMode>('fill-empty');
  const [pairs, setPairs] = useState<{ fromField: string; toField: string }[]>([
    { fromField: '', toField: '' },
  ]);

  const myFields = useMemo(() => draftFieldNames(draft), [draft]);
  const theirFields = useMemo(() => (secondary ? draftFieldNames(secondary) : []), [secondary]);

  const pick = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      // No path: this is the one place the user names the second file, so the
      // OS dialog is the control. A cancelled dialog is a decision, not a
      // failure, and leaves whatever was already loaded alone.
      //
      // The largest page main will return, because a glossary is read once and
      // every row past the page is a word this merge silently cannot fill. The
      // shortfall is reported rather than hidden — see `partial` below.
      const res = await window.api.readApkgDraft({ noteLimit: ANKI_DRAFT_MAX_PAGE_SIZE });
      if (!res.ok || !res.draft) {
        if (res.error && res.error !== 'cancelled') setError(res.error);
        return;
      }
      setSecondary(res.draft);
      setPickSeq((n) => n + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, []);

  const usable = pairs.filter((p) => p.fromField !== '' && p.toField !== '');
  // The same rule `blockingProblems` applies, checked here so the button cannot
  // offer a merge the tray would refuse: a pair writing into the key field
  // would rewrite the value the match was made on.
  const writesKey = usable.some((p) => p.toField.toLowerCase() === keyField.toLowerCase());
  const ready = secondary !== null && keyField !== '' && usable.length > 0 && !writesKey;

  const queue = useCallback(() => {
    if (!secondary) return;
    const source = buildGlossarySource({
      id: `glossary-${pickSeq}-${Date.now()}`,
      label: secondary.source.label,
      notes: secondary.notes,
      noteTypes: secondary.noteTypes,
      keyField,
      fieldNames: usable.map((p) => p.fromField),
    });
    onQueue(source, { sourceId: source.id, keyField, fieldPairs: usable, mode });
  }, [secondary, pickSeq, keyField, usable, mode, onQueue]);

  return (
    <section className="wb-tray-glossary" aria-label={t('ankiWorkbench.tray.glossary.title')}>
      <h4>{t('ankiWorkbench.tray.glossary.title')}</h4>
      <p className="muted">{t('ankiWorkbench.tray.glossary.scope')}</p>

      <div className="wb-tray-glossary-controls">
        <button type="button" className="btn" disabled={busy} onClick={() => void pick()}>
          {t(secondary ? 'ankiWorkbench.tray.glossary.repick' : 'ankiWorkbench.tray.glossary.pick')}
        </button>

        {secondary && (
          <label>
            {t('ankiWorkbench.tray.glossary.keyField')}
            <select value={keyField} onChange={(e) => setKeyField(e.target.value)}>
              <option value="">{t('ankiWorkbench.tray.glossary.keyField.none')}</option>
              {/* Only a field both decks declare can match them, so the list is
                  the intersection rather than this deck's fields. Field names
                  are the collections' own text and are never translated. */}
              {myFields
                .filter((name) => theirFields.some((other) => other.toLowerCase() === name.toLowerCase()))
                .map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
            </select>
          </label>
        )}

        {secondary && (
          <label>
            {t('ankiWorkbench.tray.glossary.mode')}
            <select value={mode} onChange={(e) => setMode(e.target.value as GlossaryMergeMode)}>
              {MODES.map((value) => (
                <option key={value} value={value}>
                  {t(`ankiWorkbench.tray.glossary.mode.${value}`)}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {secondary && (
        <p className="muted">
          {/* The rows this glossary actually holds, before any merge: a
              glossary that read 0 rows must not look the same as one the key
              field simply missed. `notes.length` and NOT `counts.notes` —
              `counts` describes the whole collection, and main returns one page
              of at most `ANKI_DRAFT_MAX_PAGE_SIZE`, so a 3,359-note deck read
              as 2,000 rows would otherwise claim all 3,359 were in the merge. */}
          {t('ankiWorkbench.tray.glossary.loaded', {
            label: secondary.source.label,
            count: secondary.notes.length,
          })}
        </p>
      )}

      {secondary && secondary.notes.length < secondary.counts.notes && (
        <p className="wb-tray-warn">
          {t('ankiWorkbench.tray.glossary.partial', {
            count: secondary.notes.length,
            total: secondary.counts.notes,
          })}
        </p>
      )}

      {secondary && (
        <ul className="wb-tray-glossary-pairs">
          {pairs.map((pair, i) => (
            <li key={i}>
              <select
                aria-label={t('ankiWorkbench.tray.glossary.from')}
                value={pair.fromField}
                onChange={(e) =>
                  setPairs((prev) =>
                    prev.map((p, j) => (i === j ? { ...p, fromField: e.target.value } : p)),
                  )
                }
              >
                <option value="">{t('ankiWorkbench.tray.glossary.from')}</option>
                {theirFields.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
              <span aria-hidden="true">→</span>
              <select
                aria-label={t('ankiWorkbench.tray.glossary.to')}
                value={pair.toField}
                onChange={(e) =>
                  setPairs((prev) =>
                    prev.map((p, j) => (i === j ? { ...p, toField: e.target.value } : p)),
                  )
                }
              >
                <option value="">{t('ankiWorkbench.tray.glossary.to')}</option>
                {myFields.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
              {pairs.length > 1 && (
                <button
                  type="button"
                  className="btn"
                  onClick={() => setPairs((prev) => prev.filter((_, j) => j !== i))}
                >
                  {t('ankiWorkbench.tray.glossary.removePair')}
                </button>
              )}
            </li>
          ))}
          <li>
            <button
              type="button"
              className="btn"
              onClick={() => setPairs((prev) => [...prev, { fromField: '', toField: '' }])}
            >
              {t('ankiWorkbench.tray.glossary.addPair')}
            </button>
          </li>
        </ul>
      )}

      <button type="button" className="btn" disabled={!ready} onClick={queue}>
        {t('ankiWorkbench.tray.glossary.add')}
      </button>

      {/* Stated as soon as it is true rather than behind a disabled button the
          user cannot click, the rule recipe 13's panel follows. */}
      {writesKey && (
        <p className="wb-tray-blocking" role="alert">
          {t('ankiWorkbench.tray.glossary.refusal.writesKey', { detail: keyField })}
        </p>
      )}
      {error !== null && (
        <p className="wb-tray-blocking" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
