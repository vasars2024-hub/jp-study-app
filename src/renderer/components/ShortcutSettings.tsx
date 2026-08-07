// Settings → Shortcuts: searchable, category-grouped list of every command
// with click-to-capture rebinding (keyboard + mouse), multi-key chords,
// alternative chords, custom user shortcuts, profiles, import/export.

import { useEffect, useMemo, useRef, useState } from 'react';
import { confirmDialog, promptDialog } from './ui';
import { useT } from '../i18n';
import { commandCategory, commandLabel } from '../commandI18n';
import {
  addCustomCommand,
  addShortcutProfile,
  chordFromEvent,
  chordFromMouseEvent,
  COMMAND_CATALOG,
  deleteShortcutProfile,
  exportShortcuts,
  formatKeysDisplay,
  getBindings,
  importShortcuts,
  listShortcutProfiles,
  onShortcutsChanged,
  removeCustomCommand,
  resetAllBindings,
  resetBinding,
  setBinding,
  SHORTCUT_OPEN_APPS,
  switchShortcutProfile,
  type BindingRow,
  type CommandCategory,
  type CustomAction,
} from '../keyboardShortcuts';

// Ordered by purpose, roughly by how often a shortcut in that group gets used:
// moving around the OS first, then arranging it, then the study surfaces
// (reading → looking up → drilling), then media, then tools and user macros.
const CATEGORY_ORDER: CommandCategory[] = [
  'Navigation',
  'Window',
  'Reader',
  'Manga',
  'Dictionary',
  'Flashcards',
  'Immersion',
  'Music',
  'Video',
  'Toolbox',
  'Utility',
  'Custom',
];

type TFn = (key: string, vars?: Record<string, string | number>) => string;

function labelFor(id: string, rows: BindingRow[], t: TFn): string {
  const r = rows.find((row) => row.id === id);
  if (!r) return id;
  if (r.custom) return r.label;
  return commandLabel(r.id, r.label, t);
}

function appSectionLabel(id: string, fallback: string, t: TFn): string {
  const key = `palette.section.${id}`;
  const out = t(key);
  return out === key ? fallback : out;
}

function displayLabel(r: BindingRow, t: TFn): string {
  return r.custom ? r.label : commandLabel(r.id, r.label, t);
}

type CaptureMode = 'replace' | 'add';

export default function ShortcutSettings({ embedded = false }: { embedded?: boolean } = {}) {
  const { t, lang } = useT();
  const [rows, setRows] = useState<BindingRow[]>(() => getBindings());
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
  const [customLabel, setCustomLabel] = useState('');
  const [customKeys, setCustomKeys] = useState('');
  const [customActionType, setCustomActionType] = useState<'openApp' | 'runCommand' | 'runCommands'>(
    'openApp',
  );
  const [customAppId, setCustomAppId] = useState(SHORTCUT_OPEN_APPS[0]?.id ?? 'settings');
  const [customCmdId, setCustomCmdId] = useState(COMMAND_CATALOG[0]?.id ?? 'nav.palette');
  /** Ordered command ids for stacked macros. */
  const [customStack, setCustomStack] = useState<string[]>([]);
  const [stackPick, setStackPick] = useState(COMMAND_CATALOG[0]?.id ?? 'nav.palette');
  /**
   * v1.0 audit 4.2 — every category shipped expanded, so the page was one
   * 8142 px column of 172 rows. Collapsed is the default and only the
   * categories in here are open. Not persisted: which groups you had open is a
   * property of the visit, and a stored set would re-open them weeks later.
   */
  const [openCats, setOpenCats] = useState<Set<CommandCategory>>(() => new Set());
  const captureRef = useRef<string | null>(null);
  const modeRef = useRef<CaptureMode>('replace');
  captureRef.current = capturing;
  modeRef.current = captureMode;

  useEffect(
    () =>
      onShortcutsChanged(() => {
        setRows(getBindings());
        setProfiles(listShortcutProfiles());
      }),
    [],
  );

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
      const conflicts = setBinding(id, chord, modeRef.current);
      setCapturing(null);
      setHoldHint('');
      const pretty = formatKeysDisplay(chord);
      const conflictNames = conflicts.map((c) => labelFor(c, getBindings(), t)).join(', ');
      setMsg(
        conflicts.length
          ? `${t('settings.shortcuts.setTo', { chord: pretty })} — ${t('settings.shortcuts.alsoBound', { names: conflictNames })}`
          : modeRef.current === 'add'
            ? t('settings.shortcuts.addedChord', { chord: pretty })
            : t('settings.shortcuts.setTo', { chord: pretty }),
      );
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
        setBinding(id, '');
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
  }, [capturing, lang]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
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
        (r.note?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [rows, query, lang]);

  const searching = query.trim().length > 0;
  /** Categories with at least one visible row — what the bulk controls act on. */
  const shownCats = useMemo(
    () => CATEGORY_ORDER.filter((cat) => visible.some((r) => r.category === cat)),
    [visible],
  );

  const doExport = async () => {
    try {
      await navigator.clipboard.writeText(exportShortcuts());
      setMsg(t('settings.shortcuts.exported'));
    } catch {
      setMsg(t('settings.shortcuts.clipboardFail'));
    }
  };

  const doImport = () => {
    const res = importShortcuts(importText);
    setMsg(
      res.ok
        ? t('settings.shortcuts.imported')
        : t('settings.shortcuts.importFail', { error: res.error ?? '' }),
    );
    if (res.ok) {
      setImportOpen(false);
      setImportText('');
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
    setCaptureMode(mode);
    setCapturing(capturing === id && captureMode === mode ? null : id);
    setHoldHint(t('settings.shortcuts.holdHintDots'));
  };

  const applyManual = (id: string) => {
    const conflicts = setBinding(id, manualText.trim(), 'replace');
    setManualId(null);
    setManualText('');
    const pretty = formatKeysDisplay(manualText.trim()) || t('settings.shortcuts.unbound');
    const conflictNames = conflicts.map((c) => labelFor(c, getBindings(), t)).join(', ');
    setMsg(
      conflicts.length
        ? `${t('settings.shortcuts.setTo', { chord: pretty })} — ${t('settings.shortcuts.alsoBound', { names: conflictNames })}`
        : manualText.trim()
          ? t('settings.shortcuts.setTo', { chord: pretty })
          : t('settings.shortcuts.removed'),
    );
  };

  const createCustom = () => {
    let action: CustomAction;
    if (customActionType === 'openApp') {
      action = { type: 'openApp', appId: customAppId };
    } else if (customActionType === 'runCommands') {
      if (customStack.length < 2) {
        setMsg(t('settings.shortcuts.stackNeedTwo'));
        return;
      }
      action = { type: 'runCommands', commandIds: [...customStack] };
    } else {
      action = { type: 'runCommand', commandId: customCmdId };
    }
    const res = addCustomCommand({
      label: customLabel,
      keys: customKeys,
      action,
    });
    if (!res.ok) {
      setMsg(res.error);
      return;
    }
    setMsg(t('settings.shortcuts.customAdded', { label: customLabel.trim() }));
    setCustomLabel('');
    setCustomKeys('');
    setCustomStack([]);
    setCustomOpen(false);
    if (!customKeys.trim()) {
      startCapture(res.id, 'replace');
    }
  };

  return (
    <section className={`set-section${embedded ? ' sc-embedded' : ''}`}>
      {!embedded && <h2>{t('settings.shortcuts.title')}</h2>}
      <p className="set-row-desc muted">{t('settings.shortcuts.intro')}</p>

      <div className="sc-toolbar">
        <input
          className="sc-search"
          placeholder={t('settings.shortcuts.searchPlaceholder')}
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
        <button type="button" className="btn small" onClick={() => setImportOpen((o) => !o)}>
          {t('settings.shortcuts.import')}
        </button>
        <button
          type="button"
          className="btn small"
          onClick={async () => {
            const ok = await confirmDialog({
              title: t('settings.shortcuts.resetTitle'),
              message: t('settings.shortcuts.resetMessage'),
              confirmLabel: t('settings.shortcuts.reset'),
              danger: true,
            });
            if (ok) {
              resetAllBindings();
              setMsg(t('settings.shortcuts.resetDone'));
            }
          }}
        >
          {t('settings.shortcuts.resetAll')}
        </button>
      </div>

      {customOpen && (
        <div className="sc-custom">
          <div className="sc-custom-title">{t('settings.shortcuts.customTitle')}</div>
          <div className="sc-custom-grid">
            <label className="sc-field">
              <span className="muted">{t('settings.shortcuts.field.name')}</span>
              <input
                value={customLabel}
                onChange={(e) => setCustomLabel(e.target.value)}
                placeholder={t('settings.shortcuts.field.namePh')}
              />
            </label>
            <label className="sc-field">
              <span className="muted">{t('settings.shortcuts.field.keys')}</span>
              <input
                value={customKeys}
                onChange={(e) => setCustomKeys(e.target.value)}
                placeholder={t('settings.shortcuts.field.keysPh')}
              />
            </label>
            <label className="sc-field">
              <span className="muted">{t('settings.shortcuts.field.action')}</span>
              <select
                className="set-select"
                value={customActionType}
                onChange={(e) =>
                  setCustomActionType(e.target.value as 'openApp' | 'runCommand' | 'runCommands')
                }
              >
                <option value="openApp">{t('settings.shortcuts.action.openApp')}</option>
                <option value="runCommand">{t('settings.shortcuts.action.runCommand')}</option>
                <option value="runCommands">{t('settings.shortcuts.action.runCommands')}</option>
              </select>
            </label>
            {customActionType === 'openApp' ? (
              <label className="sc-field">
                <span className="muted">{t('settings.shortcuts.field.app')}</span>
                <select
                  className="set-select"
                  value={customAppId}
                  onChange={(e) => setCustomAppId(e.target.value)}
                >
                  {SHORTCUT_OPEN_APPS.map((a) => (
                    <option key={a.id} value={a.id}>
                      {appSectionLabel(a.id, a.label, t)}
                    </option>
                  ))}
                </select>
              </label>
            ) : customActionType === 'runCommand' ? (
              <label className="sc-field">
                <span className="muted">{t('settings.shortcuts.field.command')}</span>
                <select
                  className="set-select"
                  value={customCmdId}
                  onChange={(e) => setCustomCmdId(e.target.value)}
                >
                  {COMMAND_CATALOG.map((c) => (
                    <option key={c.id} value={c.id}>
                      {commandCategory(c.category, t)}: {commandLabel(c.id, c.label, t)}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <div className="sc-field sc-stack-field">
                <span className="muted">{t('settings.shortcuts.field.stack')}</span>
                <div className="sc-stack-add">
                  <select
                    className="set-select"
                    value={stackPick}
                    onChange={(e) => setStackPick(e.target.value)}
                  >
                    {COMMAND_CATALOG.map((c) => (
                      <option key={c.id} value={c.id}>
                        {commandCategory(c.category, t)}: {commandLabel(c.id, c.label, t)}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="btn small"
                    onClick={() => {
                      if (!stackPick) return;
                      setCustomStack((s) => [...s, stackPick]);
                    }}
                  >
                    {t('settings.shortcuts.add')}
                  </button>
                </div>
                {customStack.length === 0 ? (
                  <p className="muted sc-stack-empty">{t('settings.shortcuts.stackEmpty')}</p>
                ) : (
                  <ol className="sc-stack-list">
                    {customStack.map((id, i) => {
                      const c = COMMAND_CATALOG.find((x) => x.id === id);
                      return (
                        <li key={`${id}-${i}`}>
                          <span>
                            {i + 1}.{' '}
                            {c
                              ? `${commandCategory(c.category, t)}: ${commandLabel(c.id, c.label, t)}`
                              : id}
                          </span>
                          <button
                            type="button"
                            className="btn small"
                            title={t('settings.shortcuts.remove')}
                            onClick={() => setCustomStack((s) => s.filter((_, j) => j !== i))}
                          >
                            {t('settings.shortcuts.remove')}
                          </button>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </div>
            )}
          </div>
          <button
            type="button"
            className="btn small primary"
            disabled={
              !customLabel.trim() ||
              (customActionType === 'runCommands' && customStack.length < 2)
            }
            onClick={createCustom}
          >
            {t('settings.shortcuts.create')}
          </button>
        </div>
      )}

      {importOpen && (
        <div className="sc-import">
          <textarea
            placeholder={t('settings.shortcuts.importPh')}
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
          />
          <button type="button" className="btn small primary" onClick={doImport} disabled={!importText.trim()}>
            {t('settings.shortcuts.applyImport')}
          </button>
        </div>
      )}

      {msg && <p className="sc-msg muted">{msg}</p>}
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
            <h3 className="sc-group-title">
              <button
                type="button"
                className="sc-group-toggle"
                aria-expanded={open}
                data-sc-toggle={cat}
                disabled={searching}
                onClick={() =>
                  setOpenCats((prev) => {
                    const next = new Set(prev);
                    if (next.has(cat)) next.delete(cat);
                    else next.add(cat);
                    return next;
                  })
                }
              >
                <span className="sc-group-caret" aria-hidden="true" />
                <span className="sc-group-name">{commandCategory(cat, t)}</span>
                <span className="sc-group-count muted">{inCat.length}</span>
              </button>
            </h3>
            {open && inCat.map((r) => (
              // `data-shortcut-id` / `-keys` are the only language-independent handle on a
              // row. Every visible string here goes through `useT()` and the app ships four
              // UI languages, so a driven pass keyed to the English label or to the word
              // "Unbound" passes on an English machine and fails after a language switch.
              // Same idiom as `data-study-action` in the player overlay.
              <div
                key={r.id}
                className={`sc-row ${r.conflictsWith.length ? 'conflict' : ''}`}
                data-shortcut-id={r.id}
                data-shortcut-keys={r.keys}
              >
                <div className="sc-row-text">
                  <span className="sc-label">{displayLabel(r, t)}</span>
                  {r.note && <span className="sc-note muted">{r.note}</span>}
                  {r.conflictsWith.length > 0 && (
                    <span className="sc-conflict">
                      {t('settings.shortcuts.alsoBound', {
                        names: r.conflictsWith.map((c) => labelFor(c, rows, t)).join(', '),
                      })}
                    </span>
                  )}
                </div>
                <div className="sc-row-actions">
                  <button
                    type="button"
                    className={`sc-keys ${capturing === r.id && captureMode === 'replace' ? 'capturing' : ''} ${r.keys ? '' : 'unbound'}`}
                    title={t('settings.shortcuts.captureTitle')}
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
                {manualId === r.id && (
                  <div className="sc-manual">
                    <input
                      className="sc-manual-input"
                      value={manualText}
                      onChange={(e) => setManualText(e.target.value)}
                      placeholder={t('settings.shortcuts.manualPh')}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          applyManual(r.id);
                        }
                        if (e.key === 'Escape') {
                          setManualId(null);
                        }
                      }}
                      autoFocus
                    />
                    <button type="button" className="btn small primary" onClick={() => applyManual(r.id)}>
                      {t('settings.shortcuts.apply')}
                    </button>
                    <button type="button" className="btn small" onClick={() => setManualId(null)}>
                      {t('settings.shortcuts.cancel')}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        );
      })}
    </section>
  );
}
