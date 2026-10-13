/**
 * The Notes app: every note the learner wrote or saved, in one place.
 *
 * Search (width-, case- and kana-insensitive; `#tag` matches tags), folders and
 * tags, Markdown with preview, links to cards / web pages / the note's source,
 * autosave with a save indicator, edit history with restore, a trash with
 * restore and "Delete forever", and Markdown / JSON export and import.
 *
 * One component for every shell: the Study OS, Aero and Wired shells open it as
 * a dialog (`openNotesManager`), Blanc shows it inline as Quick Notes. It is
 * styled from the shared tokens (`notesManager.css`), so it follows the theme.
 *
 * Storage is `userNotesStore.ts`: nothing here caps or shortens anything.
 */
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type JSX } from 'react';
import { useT } from '../../i18n';
import { formatDate } from '../filesapp/format';
import { confirmDialog } from '../ui/dialogService';
import { useUnsavedWork } from '../../unsavedWork';
import NoteBody from './NoteBody';
import { NOTE_FOCUS_EVENT, takeNoteFocus } from './notesFocus';
import {
  createUserNote,
  discardEmptyUserNote,
  getUserNote,
  importUserNotes,
  allUserNotes,
  onUserNotesChanged,
  purgeUserNote,
  restoreUserNote,
  restoreUserNoteVersion,
  trashUserNote,
  updateUserNote,
  userNoteSaveState,
  userNotesHydrated,
  whenUserNotesReady,
  type NoteSaveState,
  type UserNote,
} from '../../userNotesStore';
import {
  NOTE_BODY_SOFT_LIMIT,
  NOTE_HISTORY_LIMIT,
  NotesImportError,
  userNoteTags,
  noteFolderCounts,
  notePreview,
  noteTagCounts,
  notesToJson,
  notesToMarkdown,
  parseNotesImport,
  safeNoteUrl,
  searchUserNotes,
  type NoteLink,
} from '../../../shared/userNotes';
import { getStudyLang } from '../../studyEnvironment';
import './notesManager.css';

// Writing help (docs/AI_AUDIT.md N19), as the note viewer and the old Quick Notes had it.
const WritingCorrection = lazy(() => import('../speak/WritingCorrection'));

/** Rows rendered at once; "Show more" adds this many. The count of the rest is always shown. */
const PAGE = 200;
const AUTOSAVE_MS = 700;

function useNotesVersion(): number {
  const [version, setVersion] = useState(0);
  useEffect(() => onUserNotesChanged(() => setVersion((v) => v + 1)), []);
  return version;
}

function downloadText(fileName: string, text: string, mime: string): void {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function stampForFile(): string {
  const d = new Date();
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Open a card in the shell that is showing us. */
function openCard(id: string): void {
  if (document.querySelector('.blanc-root')) {
    window.dispatchEvent(new CustomEvent('blanc:select-tab', { detail: 'flashcards' }));
    return;
  }
  void Promise.all([import('../filesapp/filesAppScope'), import('../../../shared/filesApp/catalog')])
    .then(([scope, catalog]) =>
      scope.openFilesAppScoped({ categoryId: catalog.categoryForKind('mined-card'), focusItemId: `deck-card:${id}` }),
    )
    .catch(() => undefined);
}

function openUrl(url: string): void {
  try {
    const api = (window as { api?: { openExternal?: (u: string) => unknown } }).api;
    if (api?.openExternal) void api.openExternal(url);
    else window.open(url, '_blank', 'noopener,noreferrer');
  } catch {
    /* nowhere to open it */
  }
}

export interface NotesManagerProps {
  /** `blanc` renders inside Blanc's tool chrome (fieldsets, its own controls). */
  variant?: 'dialog' | 'blanc';
  /** Where a note's source (`href`) opens. Absent: the source button is hidden. */
  onOpenSection?: (href: string) => void;
  /** Start with a fresh note selected (Blanc's Ctrl+N, "New note" elsewhere). */
  startWithNewNote?: boolean;
  /** Placeholder for the body (Blanc keeps its Quick Notes wording). */
  bodyPlaceholder?: string;
  /** Lets a host trigger "new note" (Blanc's command handler). */
  newNoteRef?: { current: (() => void) | null };
}

export default function NotesManager({
  variant = 'dialog',
  onOpenSection,
  startWithNewNote,
  bodyPlaceholder,
  newNoteRef,
}: NotesManagerProps): JSX.Element {
  const { t, lang } = useT();
  const version = useNotesVersion();
  const [ready, setReady] = useState(userNotesHydrated);
  const [query, setQuery] = useState('');
  const [folder, setFolder] = useState('');
  const [tag, setTag] = useState('');
  const [trash, setTrash] = useState(false);
  const [limit, setLimit] = useState(PAGE);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [status, setStatus] = useState<{ text: string; undoId?: string } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    void whenUserNotesReady().then(() => {
      if (alive) setReady(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  const all = useMemo(() => allUserNotes({ includeTrashed: true }), [version]);
  const live = useMemo(() => all.filter((n) => !n.deletedAt), [all]);
  const trashCount = all.length - live.length;
  const results = useMemo(
    () => searchUserNotes(all, { query, folder: folder || null, tag: tag || null, trash }),
    [all, query, folder, tag, trash],
  );
  const folders = useMemo(() => noteFolderCounts(live), [live]);
  const tags = useMemo(() => noteTagCounts(live), [live]);
  const selected = selectedId ? getUserNote(selectedId) : null;

  // A note made with "New note" here and left empty is not kept as a blank row.
  // Only those: an empty note that came from anywhere else is the learner's row.
  const createdHere = useRef(new Set<string>());
  useEffect(() => {
    if (!selectedId || !createdHere.current.has(selectedId)) return undefined;
    const id = selectedId;
    return () => {
      window.setTimeout(() => {
        if (discardEmptyUserNote(id)) createdHere.current.delete(id);
      }, 0);
    };
  }, [selectedId]);

  // A folder or tag that no longer exists must not leave an invisible filter.
  useEffect(() => {
    if (folder && !folders.some((f) => f.folder === folder)) setFolder('');
    if (tag && !tags.some((x) => x.tag === tag)) setTag('');
  }, [folder, tag, folders, tags]);
  useEffect(() => setLimit(PAGE), [query, folder, tag, trash]);

  const focus = useCallback((id: string) => {
    const note = getUserNote(id);
    if (!note) return;
    setTrash(Boolean(note.deletedAt));
    setQuery('');
    setFolder('');
    setTag('');
    setSelectedId(id);
  }, []);

  useEffect(() => {
    const parked = takeNoteFocus();
    if (parked) focus(parked);
    const onFocus = (event: Event): void => {
      const id = (event as CustomEvent<string>).detail;
      if (typeof id === 'string') {
        takeNoteFocus();
        focus(id);
      }
    };
    window.addEventListener(NOTE_FOCUS_EVENT, onFocus);
    return () => window.removeEventListener(NOTE_FOCUS_EVENT, onFocus);
  }, [focus]);

  const newNote = useCallback(() => {
    const note = createUserNote({ title: '', detail: '', folder: folder || undefined, tags: tag ? [tag] : undefined });
    createdHere.current.add(note.id);
    setTrash(false);
    setQuery('');
    setSelectedId(note.id);
    setStatus(null);
    window.setTimeout(() => document.querySelector<HTMLInputElement>('.notes-editor-title')?.focus(), 0);
  }, [folder, tag]);

  useEffect(() => {
    if (!newNoteRef) return undefined;
    newNoteRef.current = newNote;
    return () => {
      newNoteRef.current = null;
    };
  }, [newNote, newNoteRef]);

  const startedNew = useRef(false);
  useEffect(() => {
    if (startWithNewNote && !startedNew.current) {
      startedNew.current = true;
      newNote();
    }
  }, [startWithNewNote, newNote]);

  const remove = async (note: UserNote): Promise<void> => {
    const name = note.title.trim() || t('notes.app.untitled');
    const ok = await confirmDialog({
      title: t('notes.delete.title'),
      message: t('notes.delete.message', { name }),
      confirmLabel: t('notes.delete.action'),
      danger: true,
    });
    if (!ok) return;
    if (trashUserNote(note.id)) {
      setSelectedId(null);
      setStatus({ text: t('notes.delete.done'), undoId: note.id });
    }
  };

  const purge = async (note: UserNote): Promise<void> => {
    const name = note.title.trim() || t('notes.app.untitled');
    const ok = await confirmDialog({
      title: t('notes.trash.purgeTitle'),
      message: t('notes.trash.purgeMessage', { name }),
      confirmLabel: t('notes.trash.purge'),
      danger: true,
    });
    if (!ok) return;
    if (purgeUserNote(note.id)) setSelectedId(null);
  };

  const exportAs = (format: 'md' | 'json'): void => {
    if (format === 'md') {
      const notes = searchUserNotes(all, { trash: false });
      downloadText(`gum-notes-${stampForFile()}.md`, notesToMarkdown(notes), 'text/markdown');
      setStatus({ text: t('notes.app.exported', { count: notes.length }) });
    } else {
      downloadText(`gum-notes-${stampForFile()}.json`, notesToJson(all), 'application/json');
      setStatus({ text: t('notes.app.exported', { count: all.length }) });
    }
  };

  const importFile = async (file: File): Promise<void> => {
    try {
      const notes = parseNotesImport(await file.text(), file.name);
      const plan = importUserNotes(notes);
      setStatus({
        text: t('notes.app.importDone', {
          added: plan.added,
          updated: plan.updated,
          unchanged: plan.unchanged,
          kept: plan.keptAsVersion,
        }),
      });
      if (plan.writes.length === 1) focus(plan.writes[0].id);
    } catch (err) {
      setStatus({ text: err instanceof NotesImportError && err.reason === 'empty' ? t('notes.app.importEmpty') : t('notes.app.importFailed') });
    }
  };

  const shown = results.slice(0, limit);
  const blanc = variant === 'blanc';

  return (
    <div className={`notes-app${blanc ? ' notes-app--blanc' : ''}`} data-command-scope="notes">
      <div className="notes-toolbar" role="toolbar" aria-label={t('notes.app.title')}>
        <input
          type="search"
          className="ui-input notes-search"
          value={query}
          aria-label={t('notes.app.search')}
          placeholder={t('notes.app.searchPlaceholder')}
          onChange={(e) => setQuery(e.target.value)}
        />
        {query || folder || tag ? (
          <button
            type="button"
            className="notes-btn"
            onClick={() => {
              setQuery('');
              setFolder('');
              setTag('');
            }}
          >
            {blanc ? t('blanc.tb.clear') : t('notes.app.clearFilters')}
          </button>
        ) : null}
        <select className="ui-select notes-filter" value={folder} aria-label={t('notes.app.folder')} onChange={(e) => setFolder(e.target.value)}>
          <option value="">{t('notes.app.folderAll')}</option>
          {folders.map((f) => (
            <option key={f.folder} value={f.folder}>
              {f.folder} ({f.count})
            </option>
          ))}
        </select>
        <select className="ui-select notes-filter" value={tag} aria-label={t('notes.app.tag')} onChange={(e) => setTag(e.target.value)}>
          <option value="">{t('notes.app.tagAll')}</option>
          {tags.map((x) => (
            <option key={x.tag} value={x.tag}>
              #{x.tag} ({x.count})
            </option>
          ))}
        </select>
        <button type="button" className="notes-btn notes-btn--primary" onClick={newNote}>
          {t('notes.app.new')}
        </button>
        <button type="button" className="notes-btn" aria-pressed={trash} onClick={() => setTrash((v) => !v)}>
          {trash ? t('notes.app.allNotes') : t('notes.app.trashCount', { count: trashCount })}
        </button>
        <span className="notes-toolbar-spacer" />
        <button type="button" className="notes-btn" onClick={() => fileInput.current?.click()}>
          {t('notes.app.import')}
        </button>
        <button type="button" className="notes-btn" onClick={() => exportAs('md')}>
          {t('notes.app.exportMarkdown')}
        </button>
        <button type="button" className="notes-btn" onClick={() => exportAs('json')}>
          {t('notes.app.exportJson')}
        </button>
        <input
          ref={fileInput}
          type="file"
          hidden
          accept=".json,.md,.markdown,.txt,application/json,text/markdown,text/plain"
          aria-label={t('notes.app.import')}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) void importFile(file);
          }}
        />
      </div>

      <p className="notes-status" role="status" aria-live="polite">
        {!ready ? t('notes.app.loading') : status?.text ?? ''}
        {status?.undoId ? (
          <button
            type="button"
            className="notes-btn notes-btn--link"
            onClick={() => {
              if (status.undoId && restoreUserNote(status.undoId)) focus(status.undoId);
              setStatus(null);
            }}
          >
            {t('notes.delete.undo')}
          </button>
        ) : null}
      </p>

      <div className="notes-body">
        <nav className="notes-list" aria-label={trash ? t('notes.app.trash') : t('notes.app.allNotes')}>
          <p className="notes-list-count">
            {trash ? t('notes.trash.note') : t('notes.app.count', { count: live.length })}
          </p>
          {results.length === 0 ? (
            <p className="notes-empty">
              {trash ? t('notes.app.trashEmpty') : live.length === 0 ? t('notes.app.empty') : t('notes.app.noMatch')}
            </p>
          ) : (
            <ul>
              {shown.map((note) => (
                <li key={note.id}>
                  <button
                    type="button"
                    className={`notes-row${note.id === selectedId ? ' is-selected' : ''}`}
                    aria-current={note.id === selectedId ? 'true' : undefined}
                    onClick={() => setSelectedId(note.id)}
                  >
                    <span className="notes-row-title">
                      {note.pinned ? <span className="notes-row-pin">{t('notes.app.pinned')} · </span> : null}
                      {note.title.trim() || t('notes.app.untitled')}
                    </span>
                    <span className="notes-row-preview">{notePreview(note.detail, 120)}</span>
                    <span className="notes-row-meta">
                      {note.deletedAt
                        ? t('notes.app.trashedOn', { date: formatDate(note.deletedAt, lang) })
                        : formatDate(note.updatedAt, lang)}
                      {note.tags?.length ? ` · ${note.tags.map((x) => `#${x}`).join(' ')}` : ''}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {results.length > shown.length ? (
            <div className="notes-more">
              <span>{t('notes.app.showing', { shown: shown.length, total: results.length })}</span>
              <button type="button" className="notes-btn" onClick={() => setLimit((n) => n + PAGE)}>
                {t('notes.app.showMore')}
              </button>
            </div>
          ) : null}
        </nav>

        <section className="notes-pane">
          {selected ? (
            selected.deletedAt ? (
              <TrashedNote note={selected} onRestore={() => restoreUserNote(selected.id) && focus(selected.id)} onPurge={() => void purge(selected)} />
            ) : (
              <NoteEditor
                key={selected.id}
                note={selected}
                version={version}
                folders={folders.map((f) => f.folder)}
                onDelete={() => void remove(selected)}
                onOpenSection={onOpenSection}
                bodyPlaceholder={bodyPlaceholder}
                blanc={blanc}
              />
            )
          ) : (
            <p className="notes-empty">{t('notes.app.pick')}</p>
          )}
        </section>
      </div>
    </div>
  );
}

function TrashedNote({ note, onRestore, onPurge }: { note: UserNote; onRestore: () => void; onPurge: () => void }): JSX.Element {
  const { t, lang } = useT();
  return (
    <div className="notes-editor">
      <h3 className="notes-trashed-title">{note.title.trim() || t('notes.app.untitled')}</h3>
      <p className="notes-row-meta">{t('notes.app.trashedOn', { date: formatDate(note.deletedAt ?? null, lang) })}</p>
      {note.detail ? <NoteBody text={note.detail} /> : <p className="notes-empty">{t('notes.viewer.empty')}</p>}
      <div className="notes-actions">
        <button type="button" className="notes-btn notes-btn--primary" onClick={onRestore}>
          {t('notes.trash.restore')}
        </button>
        <button type="button" className="notes-btn notes-btn--danger" onClick={onPurge}>
          {t('notes.trash.purge')}
        </button>
      </div>
    </div>
  );
}

interface Draft {
  title: string;
  detail: string;
  folder: string;
  tags: string;
}

function draftOf(note: UserNote): Draft {
  return { title: note.title, detail: note.detail ?? '', folder: note.folder ?? '', tags: (note.tags ?? []).join(', ') };
}

/** Do two drafts mean different notes? (Tag spacing and a trailing comma do not count.) */
function draftsDiffer(a: Draft, b: Draft): boolean {
  return (
    a.title !== b.title ||
    a.detail !== b.detail ||
    a.folder.trim() !== b.folder.trim() ||
    userNoteTags(a.tags).join('\u0000') !== userNoteTags(b.tags).join('\u0000')
  );
}

function draftDiffers(draft: Draft, note: UserNote): boolean {
  return draftsDiffer(draft, draftOf(note));
}

function NoteEditor({
  note,
  version,
  folders,
  onDelete,
  onOpenSection,
  bodyPlaceholder,
  blanc = false,
}: {
  note: UserNote;
  version: number;
  folders: string[];
  onDelete: () => void;
  onOpenSection?: (href: string) => void;
  bodyPlaceholder?: string;
  /** Blanc keeps its Quick Notes wording for the save state and the count. */
  blanc?: boolean;
}): JSX.Element {
  const { t, lang } = useT();
  const [draft, setDraft] = useState<Draft>(() => draftOf(note));
  const [mode, setMode] = useState<'write' | 'preview'>('write');
  const [saveState, setSaveState] = useState<NoteSaveState>(() => userNoteSaveState(note.id));
  const [linkStatus, setLinkStatus] = useState('');
  const [selection, setSelection] = useState<{ start: number; end: number } | null>(null);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  // What the draft was last in step with. "Dirty" is typing since then — not
  // any difference from the stored note, which another window may have changed.
  const baseRef = useRef<Draft>(draftOf(note));
  // Both this editor and another window changed the note: the typing here
  // wins, and the other text is kept as a version when it is saved.
  const conflictRef = useRef(false);
  const dirty = draftsDiffer(draft, baseRef.current);
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  const save = useCallback((checkpoint: boolean): void => {
    const current = getUserNote(note.id);
    if (!current || current.deletedAt) return;
    const d = draftRef.current;
    if (draftDiffers(d, current)) {
      updateUserNote(
        note.id,
        { title: d.title, detail: d.detail, folder: d.folder.trim(), tags: d.tags },
        { checkpoint: checkpoint || conflictRef.current },
      );
    }
    conflictRef.current = false;
    baseRef.current = d;
    dirtyRef.current = false;
  }, [note.id]);

  // Autosave after a pause in typing.
  useEffect(() => {
    if (!dirty) return undefined;
    const timer = window.setTimeout(() => save(false), AUTOSAVE_MS);
    return () => window.clearTimeout(timer);
  }, [draft, dirty, save]);

  // Leaving the note (another note, closing the dialog or panel) saves what is typed.
  useEffect(() => () => {
    if (dirtyRef.current) save(true);
  }, [save]);

  // The stored note changed: our own save (nothing to do), another window or a
  // version restore while nothing is typed here (show it), or both (keep the
  // typing, mark the conflict so the other text becomes a version).
  useEffect(() => {
    setSaveState(userNoteSaveState(note.id));
    const stored = draftOf(note);
    if (!draftsDiffer(stored, draftRef.current)) {
      baseRef.current = draftRef.current;
      return;
    }
    if (!draftsDiffer(draftRef.current, baseRef.current)) {
      baseRef.current = stored;
      setDraft(stored);
      return;
    }
    conflictRef.current = true;
  }, [version, note]);

  // "Restart to update" lists a note that is not in durable storage yet.
  useUnsavedWork('note-editor', dirty || saveState === 'saving' || saveState === 'failed');

  const indicator = dirty
    ? t('notes.save.unsaved')
    : saveState === 'saving'
      ? t('notes.save.saving')
      : saveState === 'local'
        ? t('notes.save.local')
        : saveState === 'failed'
          ? t('notes.save.failed')
          : blanc
            ? t('blanc.tb.saved')
            : t('notes.save.saved');

  const links = note.links ?? [];
  const setLinks = (next: NoteLink[]): void => {
    updateUserNote(note.id, { links: next });
  };

  return (
    <div className="notes-editor">
      <div className="notes-editor-head">
        <input
          className="ui-input notes-editor-title"
          value={draft.title}
          aria-label={t('notes.editor.title')}
          placeholder={t('notes.app.untitled')}
          onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
        />
        <span className={`notes-save notes-save--${dirty ? 'unsaved' : saveState}`} role="status" aria-live="polite">
          {indicator}
        </span>
      </div>

      <div className="notes-editor-meta">
        <label className="notes-field">
          <span>{t('notes.editor.folder')}</span>
          <input
            className="ui-input"
            list={`notes-folders-${note.id}`}
            value={draft.folder}
            onChange={(e) => setDraft((d) => ({ ...d, folder: e.target.value }))}
          />
          <datalist id={`notes-folders-${note.id}`}>
            {folders.map((f) => (
              <option key={f} value={f} />
            ))}
          </datalist>
        </label>
        <label className="notes-field notes-field--wide">
          <span>{t('notes.editor.tags')}</span>
          <input
            className="ui-input"
            value={draft.tags}
            placeholder={t('notes.editor.tagsHint')}
            onChange={(e) => setDraft((d) => ({ ...d, tags: e.target.value }))}
          />
        </label>
        <button type="button" className="notes-btn" aria-pressed={Boolean(note.pinned)} onClick={() => updateUserNote(note.id, { pinned: !note.pinned })}>
          {note.pinned ? t('notes.editor.unpin') : t('notes.editor.pin')}
        </button>
      </div>

      <div className="notes-tabs" role="tablist" aria-label={t('notes.editor.body')}>
        <button type="button" role="tab" aria-selected={mode === 'write'} className="notes-tab" onClick={() => setMode('write')}>
          {t('notes.editor.edit')}
        </button>
        <button type="button" role="tab" aria-selected={mode === 'preview'} className="notes-tab" onClick={() => setMode('preview')}>
          {t('notes.editor.preview')}
        </button>
      </div>
      {mode === 'write' ? (
        <textarea
          className="ui-input notes-editor-body"
          value={draft.detail}
          aria-label={t('notes.editor.body')}
          placeholder={bodyPlaceholder ?? t('notes.editor.bodyHint')}
          onChange={(e) => setDraft((d) => ({ ...d, detail: e.target.value }))}
          onSelect={(e) => setSelection({ start: e.currentTarget.selectionStart, end: e.currentTarget.selectionEnd })}
          onBlur={() => save(false)}
        />
      ) : (
        <div className="notes-preview">
          {draft.detail ? <NoteBody text={draft.detail} /> : <p className="notes-empty">{t('notes.viewer.empty')}</p>}
        </div>
      )}
      <p className="notes-editor-count">
        {blanc
          ? t('blanc.tb.characters', { count: draft.detail.length })
          : t('notes.editor.chars', { count: draft.detail.length })}
        {draft.detail.length > NOTE_BODY_SOFT_LIMIT ? (
          <span className="notes-warning"> {t('notes.editor.large', { count: draft.detail.length })}</span>
        ) : null}
      </p>

      {mode === 'write' ? (
        // Applied corrections land in the draft, which autosaves like typing.
        <Suspense fallback={null}>
          <WritingCorrection
            text={draft.detail}
            selection={selection}
            studyLang={getStudyLang()}
            onApply={(next) => setDraft((d) => ({ ...d, detail: next }))}
          />
        </Suspense>
      ) : null}

      <LinksSection
        links={links}
        onChange={setLinks}
        status={linkStatus}
        setStatus={setLinkStatus}
        sourceHref={note.href}
        onOpenSection={onOpenSection}
      />

      <details className="notes-history">
        <summary>
          {t('notes.history.title')} ({note.history?.length ?? 0})
        </summary>
        <p className="notes-hint">{t('notes.history.limit', { count: NOTE_HISTORY_LIMIT })}</p>
        {note.history?.length ? (
          <ul>
            {note.history.map((rev) => (
              <li key={rev.at} className="notes-history-row">
                <span>
                  {t('notes.history.at', { date: formatDate(rev.at, lang) })}
                  {' · '}
                  {rev.title.trim() || t('notes.app.untitled')}
                  {' · '}
                  {notePreview(rev.detail, 60)}
                </span>
                <button
                  type="button"
                  className="notes-btn"
                  onClick={() => {
                    save(true);
                    if (restoreUserNoteVersion(note.id, rev.at)) {
                      const restored = getUserNote(note.id);
                      if (restored) setDraft(draftOf(restored));
                      setLinkStatus(t('notes.history.restored'));
                    }
                  }}
                >
                  {t('notes.history.restore')}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="notes-empty">{t('notes.history.empty')}</p>
        )}
      </details>

      <div className="notes-actions">
        <span className="notes-row-meta">{formatDate(note.ts, lang)}</span>
        <span className="notes-toolbar-spacer" />
        <button type="button" className="notes-btn notes-btn--danger" onClick={onDelete}>
          {t('notes.delete.action')}
        </button>
      </div>
    </div>
  );
}

function LinksSection({
  links,
  onChange,
  status,
  setStatus,
  sourceHref,
  onOpenSection,
}: {
  links: NoteLink[];
  onChange: (next: NoteLink[]) => void;
  status: string;
  setStatus: (text: string) => void;
  sourceHref?: string;
  onOpenSection?: (href: string) => void;
}): JSX.Element {
  const { t } = useT();
  const [url, setUrl] = useState('');
  const [cardQuery, setCardQuery] = useState('');
  const [cards, setCards] = useState<Array<{ id: string; word: string; meaning: string }> | null>(null);

  // The deck is read only when someone looks for a card to link.
  useEffect(() => {
    if (!cardQuery.trim() || cards) return;
    let alive = true;
    void import('../../flashcardDeck').then(({ loadDeck }) => {
      if (alive) setCards(loadDeck().map((c) => ({ id: c.id, word: c.word, meaning: c.meaning })));
    });
    return () => {
      alive = false;
    };
  }, [cardQuery, cards]);

  const matches = useMemo(() => {
    const q = cardQuery.trim().toLocaleLowerCase();
    if (!q || !cards) return [];
    return cards.filter((c) => c.word.toLocaleLowerCase().includes(q) || c.meaning.toLocaleLowerCase().includes(q)).slice(0, 8);
  }, [cardQuery, cards]);

  const label = (link: NoteLink): string => link.label || (link.kind === 'url' ? link.url : link.kind === 'card' ? link.id : link.href);
  const open = (link: NoteLink): void => {
    if (link.kind === 'url') openUrl(link.url);
    else if (link.kind === 'card') openCard(link.id);
    else onOpenSection?.(link.href);
  };

  return (
    <section className="notes-links" aria-label={t('notes.links.title')}>
      <h4>{t('notes.links.title')}</h4>
      {sourceHref && onOpenSection ? (
        <button type="button" className="notes-btn" onClick={() => onOpenSection(sourceHref)}>
          {t('notes.source.open')}
        </button>
      ) : null}
      {links.length ? (
        <ul className="notes-link-list">
          {links.map((link, i) => (
            <li key={`${link.kind}-${i}`} className="notes-link">
              <span className="notes-link-kind">{t(`notes.links.kind.${link.kind}`)}</span>
              <button type="button" className="notes-btn notes-btn--link" aria-label={t('notes.links.open', { label: label(link) })} onClick={() => open(link)}>
                {label(link)}
              </button>
              <button
                type="button"
                className="notes-btn"
                aria-label={t('notes.links.remove', { label: label(link) })}
                onClick={() => onChange(links.filter((_, k) => k !== i))}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="notes-hint">{t('notes.links.empty')}</p>
      )}
      <div className="notes-link-add">
        <input
          className="ui-input"
          value={url}
          aria-label={t('notes.links.urlLabel')}
          placeholder={t('notes.links.urlPlaceholder')}
          onChange={(e) => setUrl(e.target.value)}
        />
        <button
          type="button"
          className="notes-btn"
          onClick={() => {
            const safe = safeNoteUrl(url);
            if (!safe) {
              setStatus(t('notes.links.badUrl'));
              return;
            }
            onChange([...links, { kind: 'url', url: safe, label: '' }]);
            setUrl('');
            setStatus('');
          }}
        >
          {t('notes.links.addUrl')}
        </button>
      </div>
      <div className="notes-link-add">
        <input
          className="ui-input"
          value={cardQuery}
          aria-label={t('notes.links.cardSearch')}
          placeholder={t('notes.links.cardSearch')}
          onChange={(e) => setCardQuery(e.target.value)}
        />
      </div>
      {cardQuery.trim() && cards ? (
        matches.length ? (
          <ul className="notes-card-matches">
            {matches.map((card) => (
              <li key={card.id}>
                <button
                  type="button"
                  className="notes-btn"
                  onClick={() => {
                    onChange([...links, { kind: 'card', id: card.id, label: card.word }]);
                    setCardQuery('');
                  }}
                >
                  {t('notes.links.addCard')}: {card.word}
                  {card.meaning ? ` (${card.meaning})` : ''}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="notes-hint">{t('notes.links.cardNone')}</p>
        )
      ) : null}
      {status ? <p className="notes-hint" role="status">{status}</p> : null}
    </section>
  );
}
