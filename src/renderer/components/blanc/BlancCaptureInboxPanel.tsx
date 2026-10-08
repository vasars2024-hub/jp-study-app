/**
 * The Capture inbox UI (a lazy chunk): the keyboard triage list, used on its
 * own as an overlay and as the inbox stage of a Flow run.
 *
 *   Up/Down  move        a  add a card (the normal mining path)
 *   e        edit        x / Delete  discard
 *
 * Readings and meanings of captured WORDS are looked up only here, when the
 * list is on screen — capturing stays a single synchronous write.
 */
import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useT } from '../../i18n';
import { getStudyLang } from '../../studyEnvironment';
import { studyLangOfText } from '../../../shared/studyLang';
import { LANG_TAGS } from '../../../shared/i18n/core';
import {
  dispatchCapture,
  loadCaptureInbox,
  nextCaptureIndex,
  subscribeCaptureInbox,
  type CaptureItem,
} from './blancCaptureInbox';
import { loadBlancMechSettings } from './blancMechSettings';
// Lazy with this chunk: the overlays' sheet is not startup CSS.
import '../../theme/blanc-mechanics-overlays.css';

const LOOKUP_BATCH = 12;

function useCaptureItems(): readonly CaptureItem[] {
  const [items, setItems] = useState<readonly CaptureItem[]>(() => loadCaptureInbox());
  useEffect(() => subscribeCaptureInbox(setItems), []);
  return items;
}

/** Look up captured words that have no reading/meaning yet, a few at a time. */
function useLazyLookups(items: readonly CaptureItem[]): void {
  const running = useRef(false);
  useEffect(() => {
    if (running.current || !loadBlancMechSettings().captureLookup) return;
    const pending = items.filter((item) => item.kind === 'word' && !item.lookedUp).slice(0, LOOKUP_BATCH);
    const lookup = window.api?.lookupTerm;
    if (!pending.length || typeof lookup !== 'function') return;
    running.current = true;
    let alive = true;
    void (async () => {
      for (const item of pending) {
        if (!alive) break;
        const lang = studyLangOfText(item.text, getStudyLang());
        try {
          const result = await lookup(item.text, 1, lang);
          const entry = result?.entries?.[0];
          const meaning = (entry?.senses ?? [])
            .flatMap((sense) => sense.definitions ?? [])
            .filter((definition): definition is string => typeof definition === 'string' && definition.length > 0)
            .slice(0, 3)
            .join('; ');
          const reading = typeof entry?.reading === 'string' ? entry.reading : '';
          dispatchCapture({
            type: 'update',
            id: item.id,
            patch: {
              lookedUp: true,
              ...(reading && !item.reading ? { reading } : {}),
              ...(meaning && !item.meaning ? { meaning } : {}),
            },
          });
        } catch {
          dispatchCapture({ type: 'update', id: item.id, patch: { lookedUp: true } });
        }
      }
      running.current = false;
    })();
    return () => {
      alive = false;
    };
  }, [items]);
}

async function mineCapture(item: CaptureItem): Promise<boolean> {
  const { mineToStudy } = await import('../../studyMining');
  const word = item.kind === 'word';
  const result = await mineToStudy({
    word: item.text,
    reading: item.reading ?? '',
    meaning: item.meaning ?? '',
    sentence: word ? undefined : item.text,
    source: word ? 'dictionary' : 'analysis',
    studyKind: word ? 'vocabulary' : 'sentence',
    studyLang: studyLangOfText(item.text, getStudyLang()),
  });
  return Boolean(result.card);
}

interface TriageListProps {
  /** Called after each add / discard, for the Flow report. */
  onTriaged?: (result: { added?: number; discarded?: number }) => void;
  autoFocus?: boolean;
  /** Extra hint shown under the key legend (the Flow's "Enter: continue"). */
  extraHint?: string;
}

export function CaptureTriageList({ onTriaged, autoFocus = true, extraHint }: TriageListProps) {
  const { t, lang } = useT();
  const items = useCaptureItems();
  useLazyLookups(items);
  const [index, setIndex] = useState(0);
  const [editing, setEditing] = useState<{ id: string; text: string; reading: string; meaning: string } | null>(null);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const safeIndex = items.length ? Math.min(index, items.length - 1) : -1;
  const selected = safeIndex >= 0 ? items[safeIndex] : null;
  const dateFormat = useMemo(
    () => new Intl.DateTimeFormat(LANG_TAGS[lang], { dateStyle: 'short', timeStyle: 'short' }),
    [lang],
  );

  useEffect(() => {
    if (autoFocus) (listRef.current ?? wrapRef.current)?.focus();
  }, [autoFocus]);

  useEffect(() => {
    if (safeIndex < 0) return;
    document.getElementById(`blanc-capture-${items[safeIndex]?.id}`)?.scrollIntoView?.({ block: 'nearest' });
  }, [safeIndex, items]);

  // Back to the list after an edit or an add: through an effect, so it lands
  // after the commit that put the list back (a frame callback can be
  // throttled in a background window and leave focus on <body>).
  const [focusTick, setFocusTick] = useState(0);
  useEffect(() => {
    if (focusTick) (listRef.current ?? wrapRef.current)?.focus();
  }, [focusTick]);
  // The last item went: the list unmounts, so keep the keyboard inside the
  // dialog (Escape closes, Enter continues a Flow) instead of on <body>.
  const empty = items.length === 0;
  useEffect(() => {
    if (empty && (document.activeElement === document.body || !document.activeElement)) wrapRef.current?.focus();
  }, [empty]);
  const focusList = (): void => setFocusTick((n) => n + 1);

  const discard = (item: CaptureItem, at: number): void => {
    const next = dispatchCapture({ type: 'remove', id: item.id });
    setIndex(Math.max(0, nextCaptureIndex(next.length, at)));
    setStatus(t('blanc.mech.inbox.discarded', { text: item.text }));
    onTriaged?.({ discarded: 1 });
  };

  const add = async (item: CaptureItem, at: number): Promise<void> => {
    if (busy) return;
    setBusy(true);
    try {
      const ok = await mineCapture(item);
      if (!ok) throw new Error('not saved');
      const next = dispatchCapture({ type: 'remove', id: item.id });
      setIndex(Math.max(0, nextCaptureIndex(next.length, at)));
      setStatus(t('blanc.mech.inbox.added', { text: item.text }));
      onTriaged?.({ added: 1 });
    } catch {
      setStatus(t('blanc.mech.inbox.addFailed', { text: item.text }));
    } finally {
      setBusy(false);
      focusList();
    }
  };

  const startEdit = (item: CaptureItem): void => {
    setEditing({ id: item.id, text: item.text, reading: item.reading ?? '', meaning: item.meaning ?? '' });
  };

  const saveEdit = (): void => {
    if (!editing) return;
    dispatchCapture({
      type: 'update',
      id: editing.id,
      patch: { text: editing.text, reading: editing.reading.trim(), meaning: editing.meaning.trim() },
    });
    setEditing(null);
    setStatus(t('blanc.mech.inbox.saved'));
    focusList();
  };

  const onListKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (editing || event.ctrlKey || event.altKey || event.metaKey) return;
    if (event.target !== event.currentTarget) return;
    const key = event.key;
    if (key === 'ArrowDown' || key === 'ArrowUp' || key === 'Home' || key === 'End') {
      event.preventDefault();
      event.stopPropagation();
      if (!items.length) return;
      if (key === 'Home') setIndex(0);
      else if (key === 'End') setIndex(items.length - 1);
      else setIndex((current) => {
        const base = Math.min(current, items.length - 1);
        return key === 'ArrowDown' ? Math.min(items.length - 1, base + 1) : Math.max(0, base - 1);
      });
      return;
    }
    if (!selected) return;
    const lower = key.toLowerCase();
    if (lower === 'a') {
      event.preventDefault();
      event.stopPropagation();
      void add(selected, safeIndex);
    } else if (lower === 'x' || key === 'Delete') {
      event.preventDefault();
      event.stopPropagation();
      discard(selected, safeIndex);
    } else if (lower === 'e') {
      event.preventDefault();
      event.stopPropagation();
      startEdit(selected);
    }
  };

  return (
    <div className="blanc-capture" ref={wrapRef} tabIndex={-1}>
      <p className="blanc-mech-keys" aria-hidden="true">
        {t('blanc.mech.inbox.keys')}
        {extraHint ? ` · ${extraHint}` : ''}
      </p>
      {items.length === 0 ? (
        <p className="blanc-note">{t('blanc.mech.inbox.empty')}</p>
      ) : (
        <div
          ref={listRef}
          className="blanc-capture-list"
          role="listbox"
          tabIndex={0}
          aria-label={t('blanc.mech.inbox.listLabel', { count: items.length })}
          aria-activedescendant={selected && !editing ? `blanc-capture-${selected.id}` : undefined}
          aria-describedby="blanc-capture-help"
          aria-busy={busy}
          onKeyDown={onListKeyDown}
        >
          {items.map((item, itemIndex) => {
            const isSelected = itemIndex === safeIndex;
            const isEditing = editing?.id === item.id;
            return (
              <div
                key={item.id}
                id={`blanc-capture-${item.id}`}
                role="option"
                aria-selected={isSelected}
                className={`blanc-capture-item${isSelected ? ' is-selected' : ''}`}
                onMouseDown={(event) => {
                  if (isEditing) return;
                  event.preventDefault();
                  setIndex(itemIndex);
                  listRef.current?.focus();
                }}
              >
                {isEditing && editing ? (
                  <form
                    className="blanc-capture-edit"
                    onSubmit={(event) => {
                      event.preventDefault();
                      saveEdit();
                    }}
                    onKeyDown={(event) => {
                      event.stopPropagation();
                      if (event.key === 'Escape') {
                        event.preventDefault();
                        setEditing(null);
                        focusList();
                      }
                    }}
                  >
                    <label>
                      <span>{t('blanc.mech.inbox.field.text')}</span>
                      <input
                        autoFocus
                        value={editing.text}
                        onChange={(event) => setEditing({ ...editing, text: event.target.value })}
                      />
                    </label>
                    <label>
                      <span>{t('blanc.mech.inbox.field.reading')}</span>
                      <input
                        value={editing.reading}
                        onChange={(event) => setEditing({ ...editing, reading: event.target.value })}
                      />
                    </label>
                    <label>
                      <span>{t('blanc.mech.inbox.field.meaning')}</span>
                      <input
                        value={editing.meaning}
                        onChange={(event) => setEditing({ ...editing, meaning: event.target.value })}
                      />
                    </label>
                    <div className="blanc-row-actions">
                      <button type="submit">{t('blanc.mech.inbox.save')}</button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditing(null);
                          focusList();
                        }}
                      >
                        {t('blanc.mech.inbox.cancel')}
                      </button>
                    </div>
                  </form>
                ) : (
                  <>
                    <span className="blanc-capture-kind">
                      {t(item.kind === 'word' ? 'blanc.mech.inbox.kind.word' : 'blanc.mech.inbox.kind.sentence')}
                    </span>
                    <span className="blanc-capture-text" lang={studyLangOfText(item.text, getStudyLang())}>
                      {item.text}
                    </span>
                    <span className="blanc-capture-gloss">
                      {[item.reading, item.meaning].filter(Boolean).join(' · ')
                        || (item.kind === 'word' && !item.lookedUp && loadBlancMechSettings().captureLookup
                          ? t('blanc.mech.inbox.lookingUp')
                          : '')}
                    </span>
                    <time className="blanc-capture-time" dateTime={new Date(item.capturedAt).toISOString()}>
                      {dateFormat.format(item.capturedAt)}
                    </time>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
      <p id="blanc-capture-help" className="sr-only">{t('blanc.mech.inbox.keysLong')}</p>
      {selected && !editing && (
        <div className="blanc-row-actions">
          <button type="button" disabled={busy} onClick={() => void add(selected, safeIndex)}>
            {t('blanc.mech.inbox.add')}
          </button>
          <button type="button" onClick={() => startEdit(selected)}>{t('blanc.mech.inbox.edit')}</button>
          <button type="button" onClick={() => discard(selected, safeIndex)}>{t('blanc.mech.inbox.discard')}</button>
        </div>
      )}
      <p className="blanc-note" role="status" aria-live="polite">{status}</p>
    </div>
  );
}

/** The inbox as its own overlay (top-bar chip, the `i` verb). */
export default function BlancCaptureInboxDialog({ onClose }: { onClose: () => void }) {
  const { t } = useT();
  const items = useCaptureItems();
  const previousFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    return () => previousFocus.current?.focus();
  }, []);
  return (
    <div className="blanc-mech-backdrop" onMouseDown={onClose}>
      <section
        className="blanc-mech-dialog blanc-capture-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="blanc-capture-title"
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            onClose();
          }
        }}
      >
        <header className="blanc-mech-dialog-head">
          <h2 id="blanc-capture-title">{t('blanc.mech.inbox.title', { count: items.length })}</h2>
          <button type="button" className="blanc-small-btn" onClick={onClose}>
            {t('blanc.mech.close')}
          </button>
        </header>
        <CaptureTriageList />
      </section>
    </div>
  );
}
