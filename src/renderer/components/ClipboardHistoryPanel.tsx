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
import { useT } from '../i18n';

type FilterKey = 'all' | 'word' | 'sentence' | 'dictionary' | 'reader' | 'manual';

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
  const { t } = useT();
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
          aria-label={t('clipboard.selectEntry')}
        />
        <span className="cbh-badge">{CLIPBOARD_TYPE_LABELS[entry.type]}</span>
        {entry.pinned && (
          <span className="cbh-badge pin" title={t('clipboard.pinned')}>
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
          {expanded ? t('clipboard.showLess') : t('clipboard.showMore')}
        </button>
      )}

      {entry.readerMeta && (entry.readerMeta.book || entry.readerMeta.chapter || entry.readerMeta.position) && (
        <div className="cbh-meta-wrap">
          <button type="button" className="cbh-expand" onClick={() => setMetaOpen((v) => !v)}>
            {metaOpen ? t('clipboard.hideDetails') : t('clipboard.readerDetails')}
          </button>
          {metaOpen && (
            <div className="cbh-meta">
              {entry.readerMeta.book && <div><span className="muted">{t('clipboard.book')}</span> {entry.readerMeta.book}</div>}
              {entry.readerMeta.chapter && <div><span className="muted">{t('clipboard.chapter')}</span> {entry.readerMeta.chapter}</div>}
              {entry.readerMeta.position && <div><span className="muted">{t('clipboard.position')}</span> {entry.readerMeta.position}</div>}
              {entry.readerMeta.language && <div><span className="muted">{t('clipboard.language')}</span> {entry.readerMeta.language}</div>}
            </div>
          )}
        </div>
      )}

      <div className="cbh-actions">
        <button type="button" className="cbh-btn" title={t('clipboard.copyAgain')} onClick={copyAgain}>
          <Icon name="download" size={13} /> {t('clipboard.copy')}
        </button>
        <button type="button" className="cbh-btn" title={t('clipboard.copyPlainTitle')} onClick={copyPlain}>
          <Icon name="edit" size={13} /> {t('clipboard.plain')}
        </button>
        <button
          type="button"
          className={`cbh-btn ${entry.pinned ? 'on' : ''}`}
          title={entry.pinned ? t('clipboard.unpin') : t('clipboard.pin')}
          onClick={() => {
            togglePin(entry.id);
            onChanged();
          }}
        >
          <Icon name="pin" size={13} /> {entry.pinned ? t('clipboard.pinned') : t('clipboard.pin')}
        </button>
        <button
          type="button"
          className={`cbh-btn ${entry.favorite ? 'on' : ''}`}
          title={entry.favorite ? t('clipboard.removeFavorite') : t('clipboard.favorite')}
          onClick={() => {
            toggleFavorite(entry.id);
            onChanged();
          }}
        >
          <Icon name="star" size={13} fill={entry.favorite} /> {t('clipboard.fav')}
        </button>
        <button
          type="button"
          className="cbh-btn"
          title={t('clipboard.sendToFlashcardCollection')}
          onClick={() => sendEntriesToFlashcards([entry])}
        >
          <Icon name="flashcards" size={13} /> {t('clipboard.flashcard')}
        </button>
        <button
          type="button"
          className="cbh-btn danger"
          title={t('clipboard.delete')}
          onClick={() => {
            deleteEntry(entry.id);
            onChanged();
          }}
        >
          <Icon name="close" size={13} /> {t('clipboard.delete')}
        </button>
      </div>
    </li>
  );
}

export default function ClipboardHistoryPanel() {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterKey>('all');
  const [entries, setEntries] = useState<ClipboardEntry[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettingsState] = useState(loadClipboardSettings);

  const FILTERS: { key: FilterKey; label: string }[] = [
    { key: 'all', label: t('clipboard.filter.all') },
    { key: 'word', label: t('clipboard.filter.words') },
    { key: 'sentence', label: t('clipboard.filter.sentences') },
    { key: 'dictionary', label: t('clipboard.filter.dictionary') },
    { key: 'reader', label: t('clipboard.filter.reader') },
    { key: 'manual', label: t('clipboard.filter.manual') },
  ];

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
      <div className="cbh-panel" role="dialog" aria-label={t('clipboard.dialogLabel')}>
        <div className="cbh-head">
          <Icon name="clipboard" size={16} />
          <input
            autoFocus
            className="cbh-search"
            placeholder={t('clipboard.searchPlaceholder')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            // preventDefault, like the palette does: now that this panel sits
            // above the full-screen media workspace, an unmarked Escape bubbles
            // to MediaWorkspaceHost's window listener and closes the workspace
            // underneath as well. That listener already bails on defaultPrevented.
            onKeyDown={(e) => {
              if (e.key !== 'Escape') return;
              e.preventDefault();
              setOpen(false);
            }}
          />
          <button type="button" className="cbh-icon-btn" title={t('clipboard.settings')} onClick={() => setSettingsOpen((v) => !v)}>
            <Icon name="settings" size={15} />
          </button>
          <button type="button" className="cbh-icon-btn" title={t('common.close')} onClick={() => setOpen(false)}>
            <Icon name="close" size={15} />
          </button>
        </div>

        {settingsOpen && (
          <div className="cbh-settings">
            <label className="cbh-setting-row">
              <span>{t('clipboard.maxHistorySize')}</span>
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
              <span>{t('clipboard.dedupeConsecutive')}</span>
            </label>
            <label className="cbh-setting-row">
              <input
                type="checkbox"
                checked={settings.clearOnExit}
                onChange={(e) => setSettingsState(saveClipboardSettings({ clearOnExit: e.target.checked }))}
              />
              <span>{t('clipboard.clearOnExit')}</span>
            </label>
            <label className="cbh-setting-row">
              <input
                type="checkbox"
                checked={settings.monitoringEnabled}
                onChange={(e) => setSettingsState(saveClipboardSettings({ monitoringEnabled: e.target.checked }))}
              />
              <span>{t('clipboard.enableMonitoring')}</span>
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
              <span>{selected.size > 0 ? t('clipboard.selectedCount', { count: selected.size }) : t('clipboard.selectAll')}</span>
            </label>
            {selected.size > 0 && (
              <div className="cbh-bulk-actions">
                <button type="button" className="cbh-btn" onClick={bulkCopy}>{t('clipboard.copy')}</button>
                <button type="button" className="cbh-btn" onClick={bulkFlashcards}>{t('clipboard.sendToFlashcards')}</button>
                <button type="button" className="cbh-btn danger" onClick={bulkDelete}>{t('clipboard.delete')}</button>
              </div>
            )}
            <button
              type="button"
              className="cbh-btn cbh-clear-unpinned"
              title={t('clipboard.clearUnpinnedTitle')}
              onClick={() => clearUnpinned()}
            >
              {t('clipboard.clearUnpinned')}
            </button>
          </div>
        )}

        <ul className="cbh-list">
          {filtered.length === 0 && (
            <li className="cbh-empty muted">
              {entries.length === 0 ? t('clipboard.emptyNothing') : t('clipboard.emptyNoMatch')}
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
