// Global Clipboard History overlay — a productivity utility, not a Home
// Workspace widget. Opens from anywhere (toolbar button, Ctrl+Shift+V, or the
// command palette) via the 'clipboard:open' CustomEvent, same pattern as
// CommandPalette. Mounted once in App.tsx.

import { useEffect, useMemo, useState } from 'react';
import Icon from './Icons';
import {
  CLIPBOARD_TYPE_LABELS,
  clearUnpinned,
  deleteEntries,
  deleteEntry,
  loadClipboardHistory,
  loadClipboardSettings,
  onClipboardHistoryChanged,
  recordClipboardEntry,
  saveClipboardSettings,
  sendEntriesToFlashcards,
  startClipboardMonitor,
  toggleFavorite,
  togglePin,
  type ClipboardEntry,
  type ClipboardEntryType,
} from '../clipboardHistory';
import { registerCommandHandler } from '../keyboardShortcuts';

type FilterKey = 'all' | 'word' | 'sentence' | 'dictionary' | 'reader' | 'manual';

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'word', label: 'Words' },
  { key: 'sentence', label: 'Sentences' },
  { key: 'dictionary', label: 'Dictionary' },
  { key: 'reader', label: 'Reader' },
  { key: 'manual', label: 'Manual Copy' },
];

function matchesFilter(e: ClipboardEntry, f: FilterKey): boolean {
  if (f === 'all') return true;
  if (f === 'reader') return e.type === 'reader' || e.type === 'paragraph' || !!e.readerMeta;
  if (f === 'word') return e.type === 'word';
  if (f === 'sentence') return e.type === 'sentence';
  if (f === 'dictionary') return e.type === 'dictionary';
  if (f === 'manual') return e.type === 'manual' || e.type === 'text';
  return true;
}

const COLLAPSE_LEN = 220;

function EntryCard({
  entry,
  selected,
  onToggleSelect,
  onChanged,
}: {
  entry: ClipboardEntry;
  selected: boolean;
  onToggleSelect: () => void;
  onChanged: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [metaOpen, setMetaOpen] = useState(false);
  const isLong = entry.text.length > COLLAPSE_LEN;
  const shown = expanded || !isLong ? entry.text : `${entry.text.slice(0, COLLAPSE_LEN)}…`;

  const copyAgain = () => void navigator.clipboard.writeText(entry.text);
  const copyPlain = () => void navigator.clipboard.writeText(entry.text.replace(/\s+/g, ' ').trim());

  return (
    <li className={`cbh-card ${entry.pinned ? 'pinned' : ''}`}>
      <div className="cbh-card-top">
        <input
          type="checkbox"
          className="cbh-check"
          checked={selected}
          onChange={onToggleSelect}
          aria-label="Select entry"
        />
        <span className="cbh-badge">{CLIPBOARD_TYPE_LABELS[entry.type]}</span>
        {entry.pinned && (
          <span className="cbh-badge pin" title="Pinned">
            <Icon name="pin" size={11} />
          </span>
        )}
        <span className="cbh-time muted">{new Date(entry.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
      </div>

      {entry.dictMeta ? (
        <div className="cbh-dict">
          <span className="cbh-dict-expr" lang="ja">{entry.dictMeta.expression}</span>
          {entry.dictMeta.reading && <span className="cbh-dict-reading" lang="ja">{entry.dictMeta.reading}</span>}
          {entry.dictMeta.meaning && <div className="cbh-dict-meaning muted">{entry.dictMeta.meaning}</div>}
        </div>
      ) : (
        <div className="cbh-text" lang="ja">{shown}</div>
      )}

      {isLong && !entry.dictMeta && (
        <button type="button" className="cbh-expand" onClick={() => setExpanded((v) => !v)}>
          {expanded ? 'Show less' : 'Show more'}
        </button>
      )}

      {entry.readerMeta && (entry.readerMeta.book || entry.readerMeta.chapter || entry.readerMeta.position) && (
        <div className="cbh-meta-wrap">
          <button type="button" className="cbh-expand" onClick={() => setMetaOpen((v) => !v)}>
            {metaOpen ? 'Hide details' : 'Reader details'}
          </button>
          {metaOpen && (
            <div className="cbh-meta">
              {entry.readerMeta.book && <div><span className="muted">Book:</span> {entry.readerMeta.book}</div>}
              {entry.readerMeta.chapter && <div><span className="muted">Chapter:</span> {entry.readerMeta.chapter}</div>}
              {entry.readerMeta.position && <div><span className="muted">Position:</span> {entry.readerMeta.position}</div>}
              {entry.readerMeta.language && <div><span className="muted">Language:</span> {entry.readerMeta.language}</div>}
            </div>
          )}
        </div>
      )}

      <div className="cbh-actions">
        <button type="button" className="cbh-btn" title="Copy again" onClick={copyAgain}>
          <Icon name="download" size={13} /> Copy
        </button>
        <button type="button" className="cbh-btn" title="Copy as plain text" onClick={copyPlain}>
          <Icon name="edit" size={13} /> Plain
        </button>
        <button
          type="button"
          className={`cbh-btn ${entry.pinned ? 'on' : ''}`}
          title={entry.pinned ? 'Unpin' : 'Pin'}
          onClick={() => {
            togglePin(entry.id);
            onChanged();
          }}
        >
          <Icon name="pin" size={13} /> {entry.pinned ? 'Pinned' : 'Pin'}
        </button>
        <button
          type="button"
          className={`cbh-btn ${entry.favorite ? 'on' : ''}`}
          title={entry.favorite ? 'Remove favorite' : 'Favorite'}
          onClick={() => {
            toggleFavorite(entry.id);
            onChanged();
          }}
        >
          <Icon name="star" size={13} fill={entry.favorite} /> Fav
        </button>
        <button
          type="button"
          className="cbh-btn"
          title="Send to Flashcard Collection"
          onClick={() => sendEntriesToFlashcards([entry])}
        >
          <Icon name="flashcards" size={13} /> Flashcard
        </button>
        <button
          type="button"
          className="cbh-btn danger"
          title="Delete"
          onClick={() => {
            deleteEntry(entry.id);
            onChanged();
          }}
        >
          <Icon name="close" size={13} /> Delete
        </button>
      </div>
    </li>
  );
}

export default function ClipboardHistoryPanel() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterKey>('all');
  const [entries, setEntries] = useState<ClipboardEntry[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettingsState] = useState(loadClipboardSettings);

  // Start monitoring once, globally — gated internally by settings.monitoringEnabled.
  useEffect(() => startClipboardMonitor(), []);

  useEffect(() => {
    const refresh = () => setEntries(loadClipboardHistory());
    refresh();
    return onClipboardHistoryChanged(refresh);
  }, []);

  useEffect(() => {
    const onOpenEvt = () => {
      setEntries(loadClipboardHistory());
      setOpen((o) => !o);
    };
    window.addEventListener('clipboard:open', onOpenEvt);
    return () => window.removeEventListener('clipboard:open', onOpenEvt);
  }, []);

  // Also live-respond to the rebindable command while this panel is mounted
  // (it always is), so Ctrl+Shift+V works everywhere without a per-view hook.
  useEffect(() => registerCommandHandler('clipboard.open', () => window.dispatchEvent(new CustomEvent('clipboard:open'))), []);

  useEffect(() => {
    if (!open) setSelected(new Set());
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries
      .filter((e) => matchesFilter(e, filter))
      .filter((e) => !q || e.text.toLowerCase().includes(q) || e.dictMeta?.expression.toLowerCase().includes(q))
      .sort((a, b) => {
        if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
        return b.createdAt - a.createdAt;
      });
  }, [entries, query, filter]);

  const toggleSelectAll = () => {
    setSelected((s) => (s.size === filtered.length ? new Set() : new Set(filtered.map((e) => e.id))));
  };

  const bulkDelete = () => {
    deleteEntries(selected);
    setSelected(new Set());
  };
  const bulkCopy = () => {
    const text = filtered.filter((e) => selected.has(e.id)).map((e) => e.text).join('\n');
    void navigator.clipboard.writeText(text);
  };
  const bulkFlashcards = () => {
    sendEntriesToFlashcards(filtered.filter((e) => selected.has(e.id)));
    setSelected(new Set());
  };

  if (!open) return null;

  return (
    <>
      <div className="cbh-backdrop" onMouseDown={() => setOpen(false)} />
      <div className="cbh-panel" role="dialog" aria-label="Clipboard history">
        <div className="cbh-head">
          <Icon name="clipboard" size={16} />
          <input
            autoFocus
            className="cbh-search"
            placeholder="Search clipboard history…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
          />
          <button type="button" className="cbh-icon-btn" title="Settings" onClick={() => setSettingsOpen((v) => !v)}>
            <Icon name="settings" size={15} />
          </button>
          <button type="button" className="cbh-icon-btn" title="Close" onClick={() => setOpen(false)}>
            <Icon name="close" size={15} />
          </button>
        </div>

        {settingsOpen && (
          <div className="cbh-settings">
            <label className="cbh-setting-row">
              <span>Max history size</span>
              <input
                type="number"
                min={10}
                max={2000}
                value={settings.maxSize}
                onChange={(e) => setSettingsState(saveClipboardSettings({ maxSize: Math.max(10, Number(e.target.value) || 200) }))}
              />
            </label>
            <label className="cbh-setting-row">
              <input
                type="checkbox"
                checked={settings.dedupeConsecutive}
                onChange={(e) => setSettingsState(saveClipboardSettings({ dedupeConsecutive: e.target.checked }))}
              />
              <span>Remove consecutive duplicates automatically</span>
            </label>
            <label className="cbh-setting-row">
              <input
                type="checkbox"
                checked={settings.clearOnExit}
                onChange={(e) => setSettingsState(saveClipboardSettings({ clearOnExit: e.target.checked }))}
              />
              <span>Clear unpinned history when the app exits</span>
            </label>
            <label className="cbh-setting-row">
              <input
                type="checkbox"
                checked={settings.monitoringEnabled}
                onChange={(e) => setSettingsState(saveClipboardSettings({ monitoringEnabled: e.target.checked }))}
              />
              <span>Enable clipboard monitoring (record system copies)</span>
            </label>
          </div>
        )}

        <div className="cbh-filters">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              className={`cbh-filter ${filter === f.key ? 'active' : ''}`}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>

        {filtered.length > 0 && (
          <div className="cbh-bulkbar">
            <label className="cbh-selall">
              <input type="checkbox" checked={selected.size > 0 && selected.size === filtered.length} onChange={toggleSelectAll} />
              <span>{selected.size > 0 ? `${selected.size} selected` : 'Select all'}</span>
            </label>
            {selected.size > 0 && (
              <div className="cbh-bulk-actions">
                <button type="button" className="cbh-btn" onClick={bulkCopy}>Copy</button>
                <button type="button" className="cbh-btn" onClick={bulkFlashcards}>Send to Flashcards</button>
                <button type="button" className="cbh-btn danger" onClick={bulkDelete}>Delete</button>
              </div>
            )}
            <button
              type="button"
              className="cbh-btn cbh-clear-unpinned"
              title="Clear Unpinned Entries"
              onClick={() => clearUnpinned()}
            >
              Clear unpinned
            </button>
          </div>
        )}

        <ul className="cbh-list">
          {filtered.length === 0 && (
            <li className="cbh-empty muted">
              {entries.length === 0 ? 'Nothing copied yet. Copy some text to get started.' : 'No entries match this search/filter.'}
            </li>
          )}
          {filtered.map((e) => (
            <EntryCard
              key={e.id}
              entry={e}
              selected={selected.has(e.id)}
              onToggleSelect={() =>
                setSelected((s) => {
                  const next = new Set(s);
                  if (next.has(e.id)) next.delete(e.id);
                  else next.add(e.id);
                  return next;
                })
              }
              onChanged={() => setEntries(loadClipboardHistory())}
            />
          ))}
        </ul>
      </div>
    </>
  );
}

/** Record arbitrary text as a manual clipboard-history entry (exposed for other views). */
export function recordManualCopy(text: string, type: ClipboardEntryType = 'text'): void {
  recordClipboardEntry(text, { type });
}
