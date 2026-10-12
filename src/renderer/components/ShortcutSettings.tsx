// Settings → Shortcuts: the one place every key in Gum is listed and changed.
//
// kbd5 made it the unified editor: the app catalog (Toolbox/Blanc and the
// system-wide rows included), the user's custom shortcuts (now editable in
// place, D264), the video player's own keys, and the Chrome extension's
// commands (read-only — Chrome owns them, so the card says where to change
// them). A captured chord is checked against every scope BEFORE it is
// committed; a real collision offers swap / replace / keep both.

import { useEffect, useMemo, useRef, useState } from 'react';
import { confirmDialog, promptDialog } from './ui';
import { useT } from '../i18n';
import { commandCategory, commandLabel, commandNote } from '../commandI18n';
import {
  addCustomCommand,
  addShortcutProfile,
  chordFromEvent,
  chordFromMouseEvent,
  COMMAND_CATALOG,
  deleteShortcutProfile,
  formatKeysDisplay,
  getBindings,
  getGlobalCommandStatuses,
  globalCommandErrorText,
  listCustomCommands,
  listShortcutProfiles,
  normalizeChord,
  onGlobalCommandStatus,
  onShortcutsChanged,
  removeCustomCommand,
  resetBinding,
  switchShortcutProfile,
  updateCustomCommand,
  type BindingRow,
  type CommandCategory,
} from '../keyboardShortcuts';
import {
  bindWithResolution,
  CHROME_SHORTCUTS_URL,
  chordToPlayerCode,
  conflictMap,
  entryChords,
  CHROME_KEY_COMMANDS,
  exportKeymap,
  findConflicts,
  importKeymap,
  keymapEntries,
  onPlayerKeymapChanged,
  PLAYER_ENTRY_PREFIX,
  PLAYER_FIXED_CHORDS,
  playerActionLabelKey,
  playerRows,
  resetPlayerBinding,
  resetWholeKeymap,
  scopeOfCommand,
  setEntryChords,
  type ConflictResolution,
  type KeymapConflict,
  type KeymapImportError,
  type KeymapScope,
} from '../keymapEditor';
import { SHORTCUT_REVEAL_EVENT, takePendingShortcutReveal, type ShortcutRevealTarget } from '../shortcutReveal';
import CustomShortcutForm from './settings/CustomShortcutForm';
import './companion/companion.css';
import './kbd5.css';

// Ordered by purpose, roughly by how often a shortcut in that group gets used:
// moving around the OS first, then arranging it, then the study surfaces
// (reading → looking up → drilling), then media, then tools and user macros.
const CATEGORY_ORDER: CommandCategory[] = [
  'Navigation',
  'Window',
  'Reader',
  'Manga',
  'Dictionary',
  // System-wide: reach Gum from any other app. Next to Dictionary because most of
  // what it does is look something up.
  'Companion',
  'Flashcards',
  'Immersion',
  'Music',
  'Video',
  'Toolbox',
  'Utility',
  'Custom',
];

/** The two groups that are not catalog categories. */
const PLAYER_GROUP = 'Player';
const EXTENSION_GROUP = 'Extension';

type TFn = (key: string, vars?: Record<string, string | number>) => string;

function displayLabel(r: BindingRow, t: TFn): string {
  return r.custom ? r.label : commandLabel(r.id, r.label, t);
}

/** Custom rows describe themselves in the live language already (keyboardShortcuts). */
function displayNote(r: BindingRow, t: TFn): string | undefined {
  return r.custom ? r.note : commandNote(r.id, r.note, t, r.category === 'Toolbox' ? r.scope : undefined);
}

function playerParams(action: string, value: number | undefined): Record<string, string | number> | undefined {
  if (value == null) return undefined;
  if (action.startsWith('seek')) return { seconds: value };
  if (action.startsWith('volume')) return { percent: value };
  if (action.endsWith('Speed')) return { step: Number(value.toFixed(2)) };
  return undefined;
}

/** A human name for any keymap entry: app command, player action or Chrome command. */
function entryLabel(id: string, rows: BindingRow[], t: TFn): string {
  if (id.startsWith(PLAYER_ENTRY_PREFIX)) {
    const action = id.slice(PLAYER_ENTRY_PREFIX.length);
    const row = playerRows().find((p) => p.action === action);
    return t(playerActionLabelKey(action), playerParams(action, row?.value));
  }
  if (id.startsWith('extension.')) {
    const ext = CHROME_KEY_COMMANDS.find((e) => `extension.${e.name}` === id);
    return ext ? t(ext.labelKey) : id;
  }
  const r = rows.find((row) => row.id === id);
  return r ? displayLabel(r, t) : id;
}

function scopeText(scope: KeymapScope, t: TFn): string {
  return t(`kbd5.scope.${scope}`);
}

function conflictNames(list: KeymapConflict[], rows: BindingRow[], t: TFn): string {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const c of list) {
    if (seen.has(c.id)) continue;
    seen.add(c.id);
    names.push(t('kbd5.conflict.item', { name: entryLabel(c.id, rows, t), scope: scopeText(c.scope, t) }));
  }
  return names.join(', ');
}

type CaptureMode = 'replace' | 'add';

interface PendingBind {
  id: string;
  chord: string;
  mode: CaptureMode;
  conflicts: KeymapConflict[];
}

function importErrorText(error: KeymapImportError, detail: string | undefined, t: TFn): string {
  if (error === 'notJson') return t('kbd5.io.error.notJson');
  if (error === 'notKeymap') return t('kbd5.io.error.notKeymap');
  return t('kbd5.io.error.rejected', { detail: detail ?? '' });
}

export default function ShortcutSettings({ embedded = false }: { embedded?: boolean } = {}) {
  const { t, lang } = useT();
  const [rows, setRows] = useState<BindingRow[]>(() => getBindings());
  const [playerRev, setPlayerRev] = useState(0);
  const [profiles, setProfiles] = useState(() => listShortcutProfiles());
  const [query, setQuery] = useState('');
  const [capturing, setCapturing] = useState<string | null>(null);
  const [captureMode, setCaptureMode] = useState<CaptureMode>('replace');
  const [holdHint, setHoldHint] = useState('');
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [msg, setMsg] = useState('');
  const [manualId, setManualId] = useState<string | null>(null);
  const [manualText, setManualText] = useState('');
  const [customOpen, setCustomOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingBind | null>(null);
  /**
   * v1.0 audit 4.2 — every category shipped expanded, so the page was one
   * 8142 px column of 172 rows. Collapsed is the default and only the
   * categories in here are open. Not persisted: which groups you had open is a
   * property of the visit, and a stored set would re-open them weeks later.
   */
  const [openCats, setOpenCats] = useState<Set<string>>(() => new Set());
  /** Main's registration result per system-wide row ("Windows refused …"). */
  const [globalStatus, setGlobalStatus] = useState(() => getGlobalCommandStatuses());
  const [revealId, setRevealId] = useState<string | null>(null);
  const captureRef = useRef<string | null>(null);
  const modeRef = useRef<CaptureMode>('replace');
  const fileRef = useRef<HTMLInputElement>(null);
  captureRef.current = capturing;
  modeRef.current = captureMode;

  useEffect(() => onGlobalCommandStatus(setGlobalStatus), []);
  useEffect(() => onPlayerKeymapChanged(() => setPlayerRev((n) => n + 1)), []);

  // "Change in Shortcuts" from the Lens / popup-dictionary pages, the tray or the
  // companion wheel: open that group and bring the row into view.
  useEffect(() => {
    const apply = (target: ShortcutRevealTarget | null): void => {
      if (!target) return;
      const cat = target.category ?? COMMAND_CATALOG.find((c) => c.id === target.id)?.category;
      if (cat) setOpenCats((prev) => new Set(prev).add(cat));
      setQuery('');
      setRevealId(target.id ?? null);
    };
    apply(takePendingShortcutReveal());
    const onReveal = (ev: Event): void => {
      takePendingShortcutReveal();
      apply((ev as CustomEvent<ShortcutRevealTarget>).detail ?? null);
    };
    window.addEventListener(SHORTCUT_REVEAL_EVENT, onReveal);
    return () => window.removeEventListener(SHORTCUT_REVEAL_EVENT, onReveal);
  }, []);

  useEffect(() => {
    if (!revealId) return;
    const el = document.querySelector(`[data-shortcut-id="${CSS.escape(revealId)}"]`);
    el?.scrollIntoView?.({ block: 'center' });
  }, [revealId, openCats]);

  useEffect(
    () =>
      onShortcutsChanged(() => {
        setRows(getBindings());
        setProfiles(listShortcutProfiles());
      }),
    [],
  );

  /** Commit a chord, or hold it for a decision when it collides in an overlapping scope. */
  const commitChord = (id: string, chord: string, mode: CaptureMode): void => {
    const normalized = normalizeChord(chord);
    if (!normalized) {
      setEntryChords(id, []);
      setMsg(t('settings.shortcuts.removed'));
      return;
    }
    if (id.startsWith(PLAYER_ENTRY_PREFIX) && !chordToPlayerCode(normalized)) {
      setMsg(t('kbd5.player.bareOnly'));
      return;
    }
    const conflicts = findConflicts(id, normalized);
    const blocking = conflicts.filter((c) => c.overlapping);
    if (blocking.length) {
      setPending({ id, chord: normalized, mode, conflicts: blocking });
      setMsg('');
      return;
    }
    bindWithResolution(id, normalized, mode, 'keep');
    const pretty = formatKeysDisplay(normalized);
    const base = mode === 'add'
      ? t('settings.shortcuts.addedChord', { chord: pretty })
      : t('settings.shortcuts.setTo', { chord: pretty });
    const shared = conflicts.filter((c) => !c.overlapping);
    setMsg(shared.length ? `${base} ${t('kbd5.conflict.shared', { names: conflictNames(shared, getBindings(), t) })}` : base);
  };

  const resolvePending = (resolution: ConflictResolution | 'cancel'): void => {
    const p = pending;
    setPending(null);
    if (!p || resolution === 'cancel') return;
    const before = entryChords(p.id);
    const res = bindWithResolution(p.id, p.chord, p.mode, resolution);
    const all = getBindings();
    const pretty = formatKeysDisplay(p.chord);
    if (!res.ok) {
      setMsg(t('kbd5.player.bareOnly'));
      return;
    }
    if (resolution === 'keep') {
      setMsg(t('kbd5.conflict.kept', { chord: pretty, names: conflictNames(p.conflicts, all, t) }));
    } else if (resolution === 'swap' && res.changed.length && before.length) {
      const first = res.changed[0] as string;
      setMsg(
        t('kbd5.conflict.swapped', {
          name: entryLabel(first, all, t),
          keys: formatKeysDisplay(entryChords(first).join('|')) || t('kbd5.keys.unset'),
        }),
      );
    } else {
      setMsg(t('kbd5.conflict.replaced', { chord: pretty, names: conflictNames(p.conflicts, all, t) }));
    }
  };

  // Capture mode: next key or mouse button becomes the binding.
  // Esc cancels; Backspace/Delete unbinds (replace mode only).
  useEffect(() => {
    if (!capturing) {
      setHoldHint('');
      return;
    }
    const finish = (chord: string) => {
      const id = captureRef.current;
      if (!id) return;
      setCapturing(null);
      setHoldHint('');
      commitChord(id, chord, modeRef.current);
    };

    const modPreview = (e: KeyboardEvent) => {
      const mods: string[] = [];
      if (e.ctrlKey) mods.push('Ctrl');
      if (e.altKey) mods.push('Alt');
      if (e.shiftKey) mods.push('Shift');
      if (e.metaKey) mods.push('Meta');
      setHoldHint(mods.length ? `${mods.join('+')}+…` : t('settings.shortcuts.holdHint'));
    };

    const onKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const id = captureRef.current;
      if (!id) return;
      if (e.key === 'Escape') {
        setCapturing(null);
        setHoldHint('');
        return;
      }
      if ((e.key === 'Backspace' || e.key === 'Delete') && modeRef.current === 'replace') {
        setEntryChords(id, []);
        setCapturing(null);
        setHoldHint('');
        setMsg(t('settings.shortcuts.removed'));
        return;
      }
      if (e.key === 'Control' || e.key === 'Shift' || e.key === 'Alt' || e.key === 'Meta') {
        modPreview(e);
        return;
      }
      const chord = chordFromEvent(e);
      if (!chord) return;
      finish(chord);
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Control' || e.key === 'Shift' || e.key === 'Alt' || e.key === 'Meta') {
        modPreview(e);
      }
    };

    const onMouse = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const chord = chordFromMouseEvent(e);
      if (!chord) {
        if (e.button === 0) setHoldHint(t('settings.shortcuts.leftClickNeedsMod'));
        return;
      }
      finish(chord);
    };

    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keyup', onKeyUp, true);
    window.addEventListener('mousedown', onMouse, true);
    window.addEventListener('auxclick', onMouse, true);
    window.addEventListener('contextmenu', onMouse, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('keyup', onKeyUp, true);
      window.removeEventListener('mousedown', onMouse, true);
      window.removeEventListener('auxclick', onMouse, true);
      window.removeEventListener('contextmenu', onMouse, true);
    };
    // commitChord reads only refs and stable setters besides `t`, which is stable.
  }, [capturing, lang]);

  /** Overlapping conflicts per entry, across every scope. */
  const conflicts = useMemo(() => conflictMap(keymapEntries(rows)), [rows, playerRev]);
  const players = useMemo(() => playerRows(), [playerRev]);

  const q = query.trim().toLowerCase();
  const visible = useMemo(() => {
    if (!q) return rows;
    return rows.filter((r) => {
      const label = displayLabel(r, t);
      const cat = commandCategory(r.category, t);
      return (
        label.toLowerCase().includes(q) ||
        r.keys.toLowerCase().includes(q) ||
        r.id.toLowerCase().includes(q) ||
        cat.toLowerCase().includes(q) ||
        r.category.toLowerCase().includes(q) ||
        scopeText(scopeOfCommand(r), t).toLowerCase().includes(q) ||
        (displayNote(r, t)?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [rows, q, lang]);

  const visiblePlayers = useMemo(() => {
    const groupName = t('kbd5.player.title').toLowerCase();
    return players.filter((p) => {
      if (!q) return true;
      const label = t(playerActionLabelKey(p.action), playerParams(p.action, p.value)).toLowerCase();
      return label.includes(q) || p.keys.toLowerCase().includes(q) || p.action.toLowerCase().includes(q) || groupName.includes(q);
    });
  }, [players, q, lang]);

  const visibleExtension = useMemo(() => {
    const groupName = t('kbd5.ext.title').toLowerCase();
    return CHROME_KEY_COMMANDS.filter(
      (e) => !q || t(e.labelKey).toLowerCase().includes(q) || e.suggested.toLowerCase().includes(q) || groupName.includes(q),
    );
  }, [q, lang]);

  const searching = q.length > 0;
  /** Groups with at least one visible row — what the bulk controls act on. */
  const shownCats = useMemo(() => {
    const cats: string[] = CATEGORY_ORDER.filter((cat) => visible.some((r) => r.category === cat));
    if (visiblePlayers.length) cats.push(PLAYER_GROUP);
    if (visibleExtension.length) cats.push(EXTENSION_GROUP);
    return cats;
  }, [visible, visiblePlayers, visibleExtension]);

  const doExport = async () => {
    try {
      await navigator.clipboard.writeText(exportKeymap());
      setMsg(t('settings.shortcuts.exported'));
    } catch {
      setMsg(t('settings.shortcuts.clipboardFail'));
    }
  };

  const saveFile = () => {
    const name = `gum-keymap-${new Date().toISOString().slice(0, 10)}.json`;
    try {
      const url = URL.createObjectURL(new Blob([exportKeymap()], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      a.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMsg(t('kbd5.io.saved', { name }));
    } catch {
      setMsg(t('settings.shortcuts.clipboardFail'));
    }
  };

  const runImport = (text: string): boolean => {
    const res = importKeymap(text);
    if (res.ok) {
      setMsg(res.player > 0 ? t('kbd5.io.importedWithPlayer', { count: res.player }) : t('settings.shortcuts.imported'));
      setPlayerRev((n) => n + 1);
      return true;
    }
    setMsg(t('settings.shortcuts.importFail', { error: importErrorText(res.error, res.detail, t) }));
    return false;
  };

  const doImport = () => {
    if (runImport(importText)) {
      setImportOpen(false);
      setImportText('');
    }
  };

  const loadFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      runImport(await file.text());
    } catch {
      setMsg(t('kbd5.io.error.notJson'));
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const copyChromeUrl = async () => {
    try {
      await navigator.clipboard.writeText(CHROME_SHORTCUTS_URL);
      setMsg(t('kbd5.ext.copied'));
    } catch {
      setMsg(t('settings.shortcuts.clipboardFail'));
    }
  };

  const addProfile = async () => {
    const name = await promptDialog({
      title: t('settings.shortcuts.newProfileTitle'),
      message: t('settings.shortcuts.newProfileMsg'),
    });
    if (name) addShortcutProfile(name);
  };

  const startCapture = (id: string, mode: CaptureMode) => {
    setManualId(null);
    setPending(null);
    setCaptureMode(mode);
    setCapturing(capturing === id && captureMode === mode ? null : id);
    setHoldHint(t('settings.shortcuts.holdHintDots'));
  };

  const applyManual = (id: string) => {
    const text = manualText.trim();
    setManualId(null);
    setManualText('');
    commitChord(id, text, 'replace');
  };

  const toggleGroup = (cat: string) =>
    setOpenCats((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });

  const groupHeader = (cat: string, name: string, count: number, open: boolean) => (
    <h3 className="sc-group-title">
      <button
        type="button"
        className="sc-group-toggle"
        aria-expanded={open}
        data-sc-toggle={cat}
        disabled={searching}
        onClick={() => toggleGroup(cat)}
      >
        <span className="sc-group-caret" aria-hidden="true" />
        <span className="sc-group-name">{name}</span>
        <span className="sc-group-count muted">{count}</span>
      </button>
    </h3>
  );

  /** The swap / replace / keep panel for a held chord, rendered under its row. */
  const resolver = (id: string) => {
    if (!pending || pending.id !== id) return null;
    const editable = pending.conflicts.some((c) => c.editable);
    const canSwap = editable && pending.mode === 'replace' && entryChords(id).length > 0;
    const readOnly = pending.conflicts.filter((c) => !c.editable);
    const all = getBindings();
    return (
      <div className="sc-resolve" role="group" aria-label={t('kbd5.conflict.groupLabel')} data-sc-resolve={id}>
        <span role="status">{t('kbd5.conflict.title', { chord: formatKeysDisplay(pending.chord) })}</span>
        <ul className="sc-resolve-list">
          {[...new Set(pending.conflicts.map((c) => c.id))].map((cid) => {
            const c = pending.conflicts.find((x) => x.id === cid) as KeymapConflict;
            return (
              <li key={cid}>{t('kbd5.conflict.item', { name: entryLabel(cid, all, t), scope: scopeText(c.scope, t) })}</li>
            );
          })}
        </ul>
        {readOnly.length > 0 && (
          <span className="sc-info">{t('kbd5.conflict.readOnly', { names: conflictNames(readOnly, all, t) })}</span>
        )}
        <div className="sc-resolve-actions">
          {canSwap && (
            <button
              type="button"
              className="btn small primary"
              data-sc-resolution="swap"
              title={t('kbd5.conflict.swapHint', { keys: formatKeysDisplay(entryChords(id).join('|')) })}
              onClick={() => resolvePending('swap')}
            >
              {t('kbd5.conflict.swap')}
            </button>
          )}
          {editable && (
            <button
              type="button"
              className={`btn small${canSwap ? '' : ' primary'}`}
              data-sc-resolution="replace"
              title={t('kbd5.conflict.replaceHint')}
              onClick={() => resolvePending('replace')}
            >
              {t('kbd5.conflict.replace')}
            </button>
          )}
          <button
            type="button"
            className="btn small"
            data-sc-resolution="keep"
            title={t('kbd5.conflict.keepHint')}
            onClick={() => resolvePending('keep')}
          >
            {t('kbd5.conflict.keep')}
          </button>
          <button type="button" className="btn small" data-sc-resolution="cancel" onClick={() => resolvePending('cancel')}>
            {t('settings.shortcuts.cancel')}
          </button>
        </div>
      </div>
    );
  };

  const manualRow = (id: string) => {
    if (manualId !== id) return null;
    const live = manualText.trim() ? findConflicts(id, manualText).filter((c) => c.overlapping) : [];
    return (
      <>
        <div className="sc-manual">
          <input
            className="sc-manual-input"
            value={manualText}
            onChange={(e) => setManualText(e.target.value)}
            placeholder={t('settings.shortcuts.manualPh')}
            aria-label={t('settings.shortcuts.typeTitle')}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229) return;
              if (e.key === 'Enter') {
                e.preventDefault();
                applyManual(id);
              }
              if (e.key === 'Escape') {
                setManualId(null);
              }
            }}
            autoFocus
          />
          <button type="button" className="btn small primary" onClick={() => applyManual(id)}>
            {t('settings.shortcuts.apply')}
          </button>
          <button type="button" className="btn small" onClick={() => setManualId(null)}>
            {t('settings.shortcuts.cancel')}
          </button>
        </div>
        {/* Live: what the typed chord would collide with, before Apply. */}
        {live.length > 0 && (
          <p className="sc-live" role="status">
            {t('kbd5.live.taken', { names: conflictNames(live, rows, t) })}
          </p>
        )}
      </>
    );
  };

  const customDef = editId ? listCustomCommands().find((c) => c.id === editId) : undefined;

  return (
    <section className={`set-section${embedded ? ' sc-embedded' : ''}`}>
      {!embedded && <h2>{t('settings.shortcuts.title')}</h2>}
      <p className="set-row-desc muted">{t('settings.shortcuts.intro')}</p>

      <div className="sc-toolbar">
        <input
          className="sc-search"
          placeholder={t('settings.shortcuts.searchPlaceholder')}
          aria-label={t('settings.shortcuts.searchPlaceholder')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select
          className="set-select"
          value={profiles.active}
          onChange={(e) => switchShortcutProfile(e.target.value)}
          aria-label={t('settings.shortcuts.profileAria')}
          title={t('settings.shortcuts.profileAria')}
        >
          {profiles.names.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        <button type="button" className="btn small" onClick={addProfile}>
          {t('settings.shortcuts.newProfile')}
        </button>
        {profiles.active !== 'Default' && (
          <button type="button" className="btn small" onClick={() => deleteShortcutProfile(profiles.active)}>
            {t('settings.shortcuts.deleteProfile')}
          </button>
        )}
        <button type="button" className="btn small" onClick={() => setCustomOpen((o) => !o)}>
          {customOpen ? t('settings.shortcuts.cancelCustom') : t('settings.shortcuts.addCustom')}
        </button>
        <button type="button" className="btn small" onClick={() => void doExport()}>
          {t('settings.shortcuts.export')}
        </button>
        <button type="button" className="btn small" data-sc-save-file onClick={saveFile}>
          {t('kbd5.io.saveFile')}
        </button>
        <button type="button" className="btn small" onClick={() => setImportOpen((o) => !o)}>
          {t('settings.shortcuts.import')}
        </button>
        <button type="button" className="btn small" onClick={() => fileRef.current?.click()}>
          {t('kbd5.io.loadFile')}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          hidden
          data-sc-file-input
          onChange={(e) => void loadFile(e.target.files?.[0])}
        />
        <button
          type="button"
          className="btn small"
          onClick={async () => {
            const ok = await confirmDialog({
              title: t('settings.shortcuts.resetTitle'),
              message: t('kbd5.resetAll.message'),
              confirmLabel: t('settings.shortcuts.reset'),
              danger: true,
            });
            if (ok) {
              resetWholeKeymap();
              setPlayerRev((n) => n + 1);
              setMsg(t('settings.shortcuts.resetDone'));
            }
          }}
        >
          {t('settings.shortcuts.resetAll')}
        </button>
      </div>

      {customOpen && (
        <CustomShortcutForm
          showKeys
          title={t('settings.shortcuts.customTitle')}
          submitLabel={t('settings.shortcuts.create')}
          onInvalid={setMsg}
          onSubmit={({ label, keys, action }) => {
            const res = addCustomCommand({ label, keys, action });
            if (!res.ok) {
              setMsg(res.error);
              return;
            }
            setMsg(t('settings.shortcuts.customAdded', { label: label.trim() }));
            setCustomOpen(false);
            if (!keys.trim()) startCapture(res.id, 'replace');
          }}
        />
      )}

      {importOpen && (
        <div className="sc-import">
          <textarea
            placeholder={t('settings.shortcuts.importPh')}
            aria-label={t('settings.shortcuts.import')}
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
          />
          <button type="button" className="btn small primary" onClick={doImport} disabled={!importText.trim()}>
            {t('settings.shortcuts.applyImport')}
          </button>
        </div>
      )}

      {msg && (
        <p className="sc-msg muted" role="status">
          {msg}
        </p>
      )}
      {capturing && holdHint && <p className="sc-msg sc-capture-hint">{holdHint}</p>}

      {shownCats.length > 1 && (
        <div className="sc-group-bulk">
          <button
            type="button"
            className="btn small"
            data-sc-expand-all
            disabled={searching || openCats.size === shownCats.length}
            onClick={() => setOpenCats(new Set(shownCats))}
          >
            {t('settings.shortcuts.expandAll')}
          </button>
          <button
            type="button"
            className="btn small"
            data-sc-collapse-all
            disabled={searching || openCats.size === 0}
            onClick={() => setOpenCats(new Set())}
          >
            {t('settings.shortcuts.collapseAll')}
          </button>
          {searching && <span className="muted sc-group-bulk-note">{t('settings.shortcuts.searchExpands')}</span>}
        </div>
      )}

      {CATEGORY_ORDER.map((cat) => {
        const inCat = visible.filter((r) => r.category === cat);
        if (!inCat.length) return null;
        // A search that matched rows inside a collapsed group would show the
        // user nothing and read as "no results". While a query is live every
        // matching group is open regardless of the toggles.
        const open = searching || openCats.has(cat);
        return (
          <div key={cat} className={`sc-group${open ? ' open' : ''}`} data-sc-category={cat}>
            {groupHeader(cat, commandCategory(cat, t), inCat.length, open)}
            {open && inCat.map((r) => {
              const scope = scopeOfCommand(r);
              const rowConflicts = conflicts.get(r.id) ?? [];
              return (
                // `data-shortcut-id` / `-keys` are the only language-independent handle on a
                // row. Every visible string here goes through `useT()` and the app ships four
                // UI languages, so a driven pass keyed to the English label or to the word
                // "Unbound" passes on an English machine and fails after a language switch.
                // Same idiom as `data-study-action` in the player overlay.
                <div
                  key={r.id}
                  className={`sc-row ${rowConflicts.length ? 'conflict' : ''}`}
                  data-shortcut-id={r.id}
                  data-shortcut-keys={r.keys}
                  data-shortcut-scope={scope}
                >
                  <div className="sc-row-text">
                    <span className="sc-label">
                      {displayLabel(r, t)}
                      {r.global && <span className="sc-global-tag">{t('shortcut.global.tag')}</span>}
                      {!r.global && (
                        <span className="sc-scope" data-scope={scope} title={t('kbd5.scope.hint')}>
                          {scopeText(scope, t)}
                        </span>
                      )}
                    </span>
                    {r.note && <span className="sc-note muted">{displayNote(r, t)}</span>}
                    {r.global && (() => {
                      const status = globalStatus.find((g) => g.id === r.id);
                      const text = status?.error ? globalCommandErrorText(status) : '';
                      return text ? <span className="sc-conflict sc-global-error">{text}</span> : null;
                    })()}
                    {rowConflicts.length > 0 && (
                      <span className="sc-conflict">
                        {t('settings.shortcuts.alsoBound', { names: conflictNames(rowConflicts, rows, t) })}
                      </span>
                    )}
                  </div>
                  <div className="sc-row-actions">
                    <button
                      type="button"
                      className={`sc-keys ${capturing === r.id && captureMode === 'replace' ? 'capturing' : ''} ${r.keys ? '' : 'unbound'}`}
                      title={t('settings.shortcuts.captureTitle')}
                      aria-label={`${displayLabel(r, t)}: ${formatKeysDisplay(r.keys) || t('settings.shortcuts.unbound')}`}
                      data-shortcut-capture={r.id}
                      onClick={() => startCapture(r.id, 'replace')}
                    >
                      {capturing === r.id && captureMode === 'replace'
                        ? holdHint || t('settings.shortcuts.pressKeys')
                        : formatKeysDisplay(r.keys) || t('settings.shortcuts.unbound')}
                    </button>
                    <button
                      type="button"
                      className={`btn small ${capturing === r.id && captureMode === 'add' ? 'primary' : ''}`}
                      aria-pressed={capturing === r.id && captureMode === 'add'}
                      title={t('settings.shortcuts.addKeyTitle')}
                      onClick={() => startCapture(r.id, 'add')}
                    >
                      {t('settings.shortcuts.addKey')}
                    </button>
                    <button
                      type="button"
                      className="btn small"
                      title={t('settings.shortcuts.typeTitle')}
                      onClick={() => {
                        setCapturing(null);
                        setPending(null);
                        setManualId(manualId === r.id ? null : r.id);
                        setManualText(r.keys);
                      }}
                    >
                      {t('settings.shortcuts.type')}
                    </button>
                    {!r.isDefault && (
                      <button
                        type="button"
                        className="btn small"
                        data-sc-reset={r.id}
                        title={t('settings.shortcuts.resetTo', {
                          keys: formatKeysDisplay(r.defaultKeys) || t('settings.shortcuts.unbound'),
                        })}
                        onClick={() => resetBinding(r.id)}
                      >
                        {t('settings.shortcuts.reset')}
                      </button>
                    )}
                    {r.custom && (
                      <button
                        type="button"
                        className="btn small"
                        data-sc-edit={r.id}
                        aria-expanded={editId === r.id}
                        title={t('kbd5.custom.editTitle')}
                        onClick={() => setEditId(editId === r.id ? null : r.id)}
                      >
                        {t('kbd5.custom.edit')}
                      </button>
                    )}
                    {r.custom && (
                      <button
                        type="button"
                        className="btn small"
                        title={t('settings.shortcuts.deleteTitle')}
                        onClick={async () => {
                          const ok = await confirmDialog({
                            title: t('settings.shortcuts.deleteConfirmTitle'),
                            message: t('settings.shortcuts.deleteConfirmMsg', { label: r.label }),
                            confirmLabel: t('settings.shortcuts.delete'),
                            danger: true,
                          });
                          if (ok) {
                            removeCustomCommand(r.id);
                            setMsg(t('settings.shortcuts.deleted'));
                          }
                        }}
                      >
                        {t('settings.shortcuts.delete')}
                      </button>
                    )}
                  </div>
                  {resolver(r.id)}
                  {manualRow(r.id)}
                  {r.custom && editId === r.id && customDef && (
                    <div className="sc-edit">
                      <CustomShortcutForm
                        key={customDef.id}
                        initial={customDef}
                        showKeys={false}
                        title={t('kbd5.custom.editTitle')}
                        submitLabel={t('kbd5.custom.save')}
                        onInvalid={setMsg}
                        onCancel={() => setEditId(null)}
                        onSubmit={({ label, action }) => {
                          const res = updateCustomCommand(r.id, { label, action });
                          setEditId(null);
                          setMsg(res.ok ? t('kbd5.custom.saved', { label: label.trim() || r.label }) : (res.error ?? ''));
                        }}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}

      {visiblePlayers.length > 0 && (() => {
        const open = searching || openCats.has(PLAYER_GROUP);
        return (
          <div className={`sc-group${open ? ' open' : ''}`} data-sc-category={PLAYER_GROUP}>
            {groupHeader(PLAYER_GROUP, t('kbd5.player.title'), visiblePlayers.length, open)}
            {open && (
              <>
                <p className="sc-info">{t('kbd5.player.desc')}</p>
                {visiblePlayers.map((p) => {
                  const label = t(playerActionLabelKey(p.action), playerParams(p.action, p.value));
                  const rowConflicts = conflicts.get(p.id) ?? [];
                  return (
                    <div
                      key={p.id}
                      className={`sc-row ${rowConflicts.length ? 'conflict' : ''}`}
                      data-shortcut-id={p.id}
                      data-shortcut-keys={entryChords(p.id).join('|')}
                      data-shortcut-scope="player"
                    >
                      <div className="sc-row-text">
                        <span className="sc-label">
                          {label}
                          <span className="sc-scope" data-scope="player" title={t('kbd5.scope.hint')}>
                            {scopeText('player', t)}
                          </span>
                        </span>
                        {rowConflicts.length > 0 && (
                          <span className="sc-conflict">
                            {t('settings.shortcuts.alsoBound', { names: conflictNames(rowConflicts, rows, t) })}
                          </span>
                        )}
                      </div>
                      <div className="sc-row-actions">
                        <button
                          type="button"
                          className={`sc-keys ${capturing === p.id ? 'capturing' : ''} ${p.keys ? '' : 'unbound'}`}
                          title={t('settings.shortcuts.captureTitle')}
                          aria-label={`${label}: ${p.keys || t('settings.shortcuts.unbound')}`}
                          data-shortcut-capture={p.id}
                          onClick={() => startCapture(p.id, 'replace')}
                        >
                          {capturing === p.id ? holdHint || t('settings.shortcuts.pressKeys') : p.keys || t('settings.shortcuts.unbound')}
                        </button>
                        {!p.isDefault && (
                          <button
                            type="button"
                            className="btn small"
                            data-sc-reset={p.id}
                            onClick={() => {
                              resetPlayerBinding(p.action);
                              setPlayerRev((n) => n + 1);
                            }}
                          >
                            {t('settings.shortcuts.reset')}
                          </button>
                        )}
                      </div>
                      {resolver(p.id)}
                    </div>
                  );
                })}
                {!searching && (
                  <div className="sc-row" data-shortcut-fixed>
                    <div className="sc-row-text">
                      <span className="sc-label">{t('kbd5.player.fixedTitle')}</span>
                      <span className="sc-note muted">
                        {PLAYER_FIXED_CHORDS.map((f) => `${t(playerActionLabelKey(f.action))}: ${f.chords.length > 3 ? `${f.chords[0]}–${f.chords[f.chords.length - 1]}` : f.chords.join(' · ')}`).join(' / ')}
                      </span>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        );
      })()}

      {visibleExtension.length > 0 && (() => {
        const open = searching || openCats.has(EXTENSION_GROUP);
        return (
          <div className={`sc-group${open ? ' open' : ''}`} data-sc-category={EXTENSION_GROUP}>
            {groupHeader(EXTENSION_GROUP, t('kbd5.ext.title'), visibleExtension.length, open)}
            {open && (
              <div className="sc-ext">
                <p className="sc-info">{t('kbd5.ext.desc')}</p>
                <div className="sc-resolve-actions">
                  <code className="sc-ext-url">{CHROME_SHORTCUTS_URL}</code>
                  <button type="button" className="btn small" data-sc-copy-chrome onClick={() => void copyChromeUrl()}>
                    {t('kbd5.ext.copy')}
                  </button>
                </div>
                {visibleExtension.map((e) => (
                  <div key={e.name} className="sc-ext-row" data-shortcut-id={`extension.${e.name}`}>
                    <span>{t(e.labelKey)}</span>
                    <span className="sc-ext-keys" title={t('kbd5.ext.suggested')}>
                      {e.suggested || t('kbd5.ext.none')}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })()}
    </section>
  );
}
