import { useCallback, useEffect, useRef, useState } from 'react';
import {
  LEXICON_NOTES_CHANGED_EVENT,
  NOTE_FILTER_MAX_CHARS,
  NOTE_LIST_DEFAULT_LIMIT,
  type LexiconNote,
} from '../../../shared/lexiconNotes';
import { LANG_TAGS } from '../../../shared/i18n/core';
import { useT } from '../../i18n';
import './notesBrowser.css';

interface Props {
  /** The Workbench's current study language, used for the "this language only" scope. */
  lang: string;
  /** Look this word up in the Workbench, switching the study language to the note's own. */
  onOpen: (word: string, lang: string) => void;
}

/** Enough of a note to recognise which one it is without unfolding the whole thing. */
const EXCERPT_CHARS = 160;

function excerpt(note: string): string {
  const oneLine = note.replace(/\s+/g, ' ').trim();
  return oneLine.length > EXCERPT_CHARS ? `${oneLine.slice(0, EXCERPT_CHARS)}…` : oneLine;
}

function noteRowKey(note: LexiconNote): string {
  // JSON rather than a separator character: a reading may legitimately contain
  // any punctuation, and two rows must never collapse onto one React key.
  return JSON.stringify([note.lang, note.text, note.reading]);
}

/**
 * Every note the user has written, in one list.
 *
 * A note is stored against a word, so until now it was reachable only by looking
 * that exact word up again — which requires already remembering which words were
 * annotated. This is the surface that answers "what have I written down", and it
 * is deliberately read-only: opening a note here runs the ordinary lookup, so a
 * note is always edited in the one place that also shows the entry it describes.
 *
 * Collapsed by default. The Workbench's job is the word in the search box, and a
 * permanently expanded archive above the results would push it off screen.
 */
export default function NotesBrowser({ lang, onOpen }: Props) {
  const { t, lang: uiLang } = useT();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const [thisLangOnly, setThisLangOnly] = useState(false);
  const [notes, setNotes] = useState<LexiconNote[]>([]);
  const [total, setTotal] = useState(0);
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [limit, setLimit] = useState(NOTE_LIST_DEFAULT_LIMIT);
  const run = useRef(0);

  const scope = thisLangOnly ? lang : '';

  const load = useCallback((): void => {
    const attempt = ++run.current;
    if (typeof window.api?.dictNoteList !== 'function') return;
    setState('loading');
    void window.api
      .dictNoteList({ lang: scope, filter, limit, offset: 0 })
      .then((result) => {
        // A slow reply for a filter the user has already retyped must not land
        // under the newer one.
        if (attempt !== run.current) return;
        setNotes(result.notes);
        setTotal(result.total);
        setState('idle');
      })
      .catch(() => {
        if (attempt === run.current) setState('error');
      });
  }, [scope, filter, limit]);

  useEffect(() => {
    if (!open) return;
    load();
  }, [open, load]);

  // A note saved in the entry below has to show up here, or the two disagree.
  useEffect(() => {
    if (!open) return;
    const handler = (): void => load();
    window.addEventListener(LEXICON_NOTES_CHANGED_EVENT, handler);
    return () => window.removeEventListener(LEXICON_NOTES_CHANGED_EVENT, handler);
  }, [open, load]);

  // A preload without the binding cannot list anything. The surface stays absent
  // rather than offering a control that would answer "no notes" for a user who
  // has plenty — the note editor makes the same call for the same reason.
  if (typeof window.api?.dictNoteList !== 'function') return null;

  return (
    <details
      className="lexicon-notes-browser"
      open={open}
      onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}
    >
      <summary>{t('lexicon.notes.title')}</summary>
      <div className="lexicon-notes-controls">
        <input
          type="search"
          className="lexicon-notes-filter"
          aria-label={t('lexicon.notes.filter')}
          placeholder={t('lexicon.notes.filterPlaceholder')}
          maxLength={NOTE_FILTER_MAX_CHARS}
          value={filter}
          onChange={(e) => {
            setFilter(e.target.value);
            setLimit(NOTE_LIST_DEFAULT_LIMIT);
          }}
        />
        <label className="lexicon-notes-scope">
          <input
            type="checkbox"
            checked={thisLangOnly}
            onChange={(e) => {
              setThisLangOnly(e.target.checked);
              setLimit(NOTE_LIST_DEFAULT_LIMIT);
            }}
          />
          <span>{t('lexicon.notes.thisLanguage')}</span>
        </label>
      </div>

      {state === 'error' ? (
        <p className="lexicon-notes-error" role="alert">{t('lexicon.notes.failed')}</p>
      ) : notes.length === 0 ? (
        <p className="muted lexicon-notes-empty">
          {t(filter || thisLangOnly ? 'lexicon.notes.noMatches' : 'lexicon.notes.empty')}
        </p>
      ) : (
        <>
          <ul className="lexicon-notes-list">
            {notes.map((note) => (
              <li key={noteRowKey(note)} className="lexicon-notes-row">
                <button
                  type="button"
                  className="lexicon-notes-open"
                  onClick={() => onOpen(note.text, note.lang)}
                >
                  <span className="lexicon-notes-word" lang={note.lang}>{note.text}</span>
                  {note.reading && (
                    <span className="muted lexicon-notes-reading" lang={note.lang}>{note.reading}</span>
                  )}
                </button>
                {note.note && <p className="lexicon-notes-excerpt">{excerpt(note.note)}</p>}
                <div className="lexicon-notes-meta">
                  {note.tags.map((tag) => (
                    <span className="lexicon-notes-tag" key={tag}>{tag}</span>
                  ))}
                  {note.updatedAt > 0 && (
                    <span className="muted lexicon-notes-date">
                      {new Date(note.updatedAt).toLocaleDateString(LANG_TAGS[uiLang], {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
          <div className="lexicon-notes-foot">
            <span className="muted">
              {t('lexicon.notes.count', { shown: notes.length, total })}
            </span>
            {notes.length < total && (
              <button
                type="button"
                className="lexicon-notes-more"
                disabled={state === 'loading'}
                onClick={() => setLimit((current) => current + NOTE_LIST_DEFAULT_LIMIT)}
              >
                {t('lexicon.notes.more')}
              </button>
            )}
          </div>
        </>
      )}
    </details>
  );
}
