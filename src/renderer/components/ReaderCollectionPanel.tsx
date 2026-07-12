// Local Flashcard Collection inbox for the novel reader.
// Writes only to flashcardDeck — never auto-mines Anki. Export is explicit.

import { useEffect, useMemo, useState } from 'react';
import {
  addDeckCards,
  loadDeck,
  onDeckChanged,
  removeDeckCard,
  updateDeckCard,
  type DeckFlashcard,
} from '../flashcardDeck';
import Icon from './Icons';

type SortMode = 'newest' | 'oldest' | 'word';

export interface CollectionAddPayload {
  word: string;
  reading?: string;
  meaning?: string;
  sentence?: string;
}

interface Props {
  bookId: string;
  bookTitle: string;
  open: boolean;
  onClose: () => void;
  /** Optional external add (toolbar / shortcuts). */
  pendingAdd?: CollectionAddPayload | null;
  onPendingConsumed?: () => void;
}

export default function ReaderCollectionPanel({
  bookId,
  bookTitle,
  open,
  onClose,
  pendingAdd,
  onPendingConsumed,
}: Props) {
  const [cards, setCards] = useState<DeckFlashcard[]>(() => loadDeck());
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<SortMode>('newest');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState({ word: '', reading: '', meaning: '', sentence: '' });
  const [exportState, setExportState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');
  const [exportMsg, setExportMsg] = useState('');

  useEffect(() => onDeckChanged(() => setCards(loadDeck())), []);

  useEffect(() => {
    if (!pendingAdd?.word) return;
    addDeckCards([
      {
        word: pendingAdd.word,
        reading: pendingAdd.reading ?? '',
        meaning: pendingAdd.meaning ?? '',
        sentence: pendingAdd.sentence,
        source: 'epub',
        bookId,
        bookTitle,
      },
    ]);
    setCards(loadDeck());
    onPendingConsumed?.();
  }, [pendingAdd, bookId, bookTitle, onPendingConsumed]);

  const mine = useMemo(() => {
    let list = cards.filter((c) => c.bookId === bookId || (!c.bookId && c.bookTitle === bookTitle));
    const needle = q.trim().toLowerCase();
    if (needle) {
      list = list.filter(
        (c) =>
          c.word.toLowerCase().includes(needle) ||
          (c.sentence ?? '').toLowerCase().includes(needle) ||
          (c.meaning ?? '').toLowerCase().includes(needle),
      );
    }
    const sorted = [...list];
    if (sort === 'newest') sorted.sort((a, b) => b.addedAt - a.addedAt);
    else if (sort === 'oldest') sorted.sort((a, b) => a.addedAt - b.addedAt);
    else sorted.sort((a, b) => a.word.localeCompare(b.word, 'ja'));
    return sorted;
  }, [cards, bookId, bookTitle, q, sort]);

  const beginEdit = (c: DeckFlashcard) => {
    setEditing(c.id);
    setDraft({
      word: c.word,
      reading: c.reading ?? '',
      meaning: c.meaning ?? '',
      sentence: c.sentence ?? '',
    });
  };

  const commitEdit = () => {
    if (!editing) return;
    const word = draft.word.trim();
    if (word) {
      updateDeckCard(editing, {
        word,
        reading: draft.reading.trim(),
        meaning: draft.meaning.trim(),
        sentence: draft.sentence.trim() || undefined,
      });
      setCards(loadDeck());
    }
    setEditing(null);
  };

  const toggle = (id: string) => {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const selectAll = () => setSelected(new Set(mine.map((c) => c.id)));
  const clearSel = () => setSelected(new Set());

  const exportAnki = async () => {
    const targets = mine.filter((c) => selected.has(c.id));
    if (!targets.length) {
      setExportMsg('Select cards to export.');
      setExportState('error');
      return;
    }
    setExportState('busy');
    setExportMsg('');
    let ok = 0;
    let fail = 0;
    for (const c of targets) {
      try {
        const res = await window.api.ankiMineNote({
          term: c.word,
          reading: c.reading || undefined,
          meaning: c.meaning || undefined,
          sentence: c.sentence || undefined,
        });
        if (res.ok || res.error === 'duplicate') ok++;
        else fail++;
      } catch {
        fail++;
      }
    }
    setExportState(fail && !ok ? 'error' : 'done');
    setExportMsg(`Exported ${ok}${fail ? `, ${fail} failed` : ''}.`);
  };

  if (!open) return null;

  return (
    <aside className="reader-collection">
      <div className="reader-collection-head">
        <span>Collection</span>
        <button type="button" className="btn small icon-btn" title="Close" onClick={onClose}>
          <Icon name="close" size={14} />
        </button>
      </div>
      <p className="muted reader-collection-hint">
        Local only — use Export to send selected cards to Anki.
      </p>
      <input
        className="reader-collection-search"
        placeholder="Search…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <div className="reader-collection-actions">
        <button type="button" className="btn small" onClick={selectAll}>
          Select all
        </button>
        <button type="button" className="btn small" onClick={clearSel}>
          Clear
        </button>
        <select
          className="reader-collection-sort"
          title="Sort"
          value={sort}
          onChange={(e) => setSort(e.target.value as SortMode)}
        >
          <option value="newest">Newest</option>
          <option value="oldest">Oldest</option>
          <option value="word">Word A–Z</option>
        </select>
        <button
          type="button"
          className="btn small primary"
          disabled={exportState === 'busy' || selected.size === 0}
          onClick={() => void exportAnki()}
        >
          Export → Anki
        </button>
      </div>
      {exportMsg && <div className={`reader-collection-msg ${exportState}`}>{exportMsg}</div>}
      <ul className="reader-collection-list">
        {mine.length === 0 && <li className="muted">No cards from this book yet.</li>}
        {mine.map((c) =>
          editing === c.id ? (
            <li key={c.id} className="editing">
              <div className="reader-collection-edit">
                <input
                  value={draft.word}
                  lang="ja"
                  placeholder="Word"
                  autoFocus
                  onChange={(e) => setDraft((d) => ({ ...d, word: e.target.value }))}
                />
                <input
                  value={draft.reading}
                  lang="ja"
                  placeholder="Reading"
                  onChange={(e) => setDraft((d) => ({ ...d, reading: e.target.value }))}
                />
                <input
                  value={draft.meaning}
                  placeholder="Meaning"
                  onChange={(e) => setDraft((d) => ({ ...d, meaning: e.target.value }))}
                />
                <textarea
                  value={draft.sentence}
                  lang="ja"
                  placeholder="Sentence"
                  onChange={(e) => setDraft((d) => ({ ...d, sentence: e.target.value }))}
                />
                <div className="reader-collection-edit-actions">
                  <button type="button" className="btn small primary" onClick={commitEdit}>
                    Save
                  </button>
                  <button type="button" className="btn small" onClick={() => setEditing(null)}>
                    Cancel
                  </button>
                </div>
              </div>
            </li>
          ) : (
            <li key={c.id} className={selected.has(c.id) ? 'sel' : ''}>
              <label className="reader-collection-row">
                <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} />
                <span className="reader-collection-word" lang="ja">
                  {c.word}
                </span>
                {c.sentence && (
                  <span className="reader-collection-sent muted" lang="ja">
                    {c.sentence.slice(0, 80)}
                  </span>
                )}
              </label>
              <button
                type="button"
                className="btn small icon-btn"
                title="Edit"
                onClick={() => beginEdit(c)}
              >
                <Icon name="edit" size={12} />
              </button>
              <button
                type="button"
                className="btn small icon-btn"
                title="Remove"
                onClick={() => {
                  removeDeckCard(c.id);
                  setCards(loadDeck());
                }}
              >
                <Icon name="close" size={12} />
              </button>
            </li>
          ),
        )}
      </ul>
    </aside>
  );
}
