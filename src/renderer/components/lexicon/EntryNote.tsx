import { useEffect, useRef, useState } from 'react';
import {
  NOTE_MAX_CHARS,
  TAG_MAX_CHARS,
  normalizeNoteTags,
  type LexiconNote,
} from '../../../shared/lexiconNotes';
import { useT } from '../../i18n';
import './entryNote.css';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

interface Props {
  /** The matched headword, not the raw query — a note belongs to the word that was found. */
  word: string;
  reading: string;
  lang: string;
}

/** The tags field is one line of comma-separated text; this is the only place that is decided. */
function parseTagField(value: string): string[] {
  return normalizeNoteTags(value.split(','));
}

/**
 * The user's own note on the looked-up word.
 *
 * Collapsed unless there is already a note, which is the only reason to take
 * vertical space on a result the reader came here to read. Saving is explicit:
 * an autosave would have to decide when someone has stopped typing, and getting
 * that wrong silently truncates a note rather than merely annoying them.
 *
 * A save reports what the database now holds rather than what was sent, so
 * "saved" cannot be shown for a write that did not land. Clearing both fields and
 * saving deletes the note — the copy says so, because a note that is an empty
 * string and a note that is gone must not look the same.
 */
export default function EntryNote({ word, reading, lang }: Props) {
  const { t } = useT();
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [tagField, setTagField] = useState('');
  const [saved, setSaved] = useState<{ note: string; tags: string }>({ note: '', tags: '' });
  const [state, setState] = useState<SaveState>('idle');
  const run = useRef(0);

  useEffect(() => {
    const attempt = ++run.current;
    setLoaded(false);
    setOpen(false);
    setText('');
    setTagField('');
    setSaved({ note: '', tags: '' });
    setState('idle');
    if (!word || !lang) return;
    // A preload without these bindings cannot read a note and cannot store one
    // either, so the surface stays absent rather than offering a box that would
    // silently swallow what someone typed. The renderer reloads independently of
    // the main process, so this is a state that really occurs.
    if (typeof window.api?.dictNoteGet !== 'function') return;
    void window.api
      .dictNoteGet({ lang, text: word, reading })
      .then((note: LexiconNote | null) => {
        // A slow read for the previous word must never land under the current
        // one, and must never overwrite something already being typed.
        if (attempt !== run.current) return;
        const tags = note ? note.tags.join(', ') : '';
        setText(note?.note ?? '');
        setTagField(tags);
        setSaved({ note: note?.note ?? '', tags });
        setOpen(Boolean(note));
        setLoaded(true);
      })
      .catch(() => {
        // No database yet is the same state as no note, which this already renders.
        if (attempt === run.current) setLoaded(true);
      });
  }, [word, reading, lang]);

  const dirty = text !== saved.note || tagField !== saved.tags;

  async function save(): Promise<void> {
    if (state === 'saving' || !dirty) return;
    const attempt = run.current;
    setState('saving');
    try {
      const result = await window.api.dictNoteSet(
        { lang, text: word, reading },
        { note: text, tags: parseTagField(tagField) },
      );
      if (attempt !== run.current) return;
      if (!result.ok) {
        setState('error');
        return;
      }
      // Echo back what was stored, not what was typed: the main process trims and
      // bounds both fields, and the box has to show the note that actually exists.
      const storedTags = result.note ? result.note.tags.join(', ') : '';
      setText(result.note?.note ?? '');
      setTagField(storedTags);
      setSaved({ note: result.note?.note ?? '', tags: storedTags });
      setState('saved');
    } catch {
      if (attempt === run.current) setState('error');
    }
  }

  if (!loaded) return null;

  return (
    <details
      className="lexicon-note"
      open={open}
      onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}
    >
      <summary>{t('lexicon.note.title')}</summary>
      <p className="muted lexicon-note-about">{t('lexicon.note.about')}</p>
      <textarea
        className="lexicon-note-text"
        aria-label={t('lexicon.note.title')}
        placeholder={t('lexicon.note.placeholder')}
        maxLength={NOTE_MAX_CHARS}
        rows={4}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setState('idle');
        }}
      />
      <label className="lexicon-note-tags">
        <span>{t('lexicon.note.tags')}</span>
        <input
          type="text"
          placeholder={t('lexicon.note.tagsPlaceholder')}
          maxLength={(TAG_MAX_CHARS + 2) * 12}
          value={tagField}
          onChange={(e) => {
            setTagField(e.target.value);
            setState('idle');
          }}
        />
      </label>
      <div className="lexicon-note-actions">
        <button
          className="lexicon-note-save"
          type="button"
          disabled={state === 'saving' || !dirty}
          onClick={() => void save()}
        >
          {t(state === 'saving' ? 'lexicon.note.saving' : 'lexicon.note.save')}
        </button>
        {state === 'saved' && !dirty && (
          <span className="muted lexicon-note-status">{t('lexicon.note.saved')}</span>
        )}
        {state === 'error' && (
          <span className="lexicon-note-error" role="alert">{t('lexicon.note.failed')}</span>
        )}
      </div>
    </details>
  );
}
