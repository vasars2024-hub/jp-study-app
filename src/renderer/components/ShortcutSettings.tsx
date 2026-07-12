// Settings → Shortcuts: searchable, category-grouped list of every command
// with click-to-capture rebinding (keyboard + mouse), multi-key chords,
// alternative chords, custom user shortcuts, profiles, import/export.

import { useEffect, useMemo, useRef, useState } from 'react';
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

const CATEGORY_ORDER: CommandCategory[] = [
  'Navigation',
  'Reader',
  'Manga',
  'Dictionary',
  'Flashcards',
  'Immersion',
  'Utility',
  'Music',
  'Custom',
];

function labelFor(id: string, rows: BindingRow[]): string {
  return rows.find((r) => r.id === id)?.label ?? id;
}

type CaptureMode = 'replace' | 'add';

export default function ShortcutSettings({ embedded = false }: { embedded?: boolean } = {}) {
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
  const [customActionType, setCustomActionType] = useState<'openApp' | 'runCommand'>('openApp');
  const [customAppId, setCustomAppId] = useState(SHORTCUT_OPEN_APPS[0]?.id ?? 'settings');
  const [customCmdId, setCustomCmdId] = useState(COMMAND_CATALOG[0]?.id ?? 'nav.palette');
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
      setMsg(
        conflicts.length
          ? `Bound to ${pretty} — also used by: ${conflicts.map((c) => labelFor(c, getBindings())).join(', ')}`
          : modeRef.current === 'add'
            ? `Added alternative ${pretty}.`
            : `Bound to ${pretty}.`,
      );
    };

    const modPreview = (e: KeyboardEvent) => {
      const mods: string[] = [];
      if (e.ctrlKey) mods.push('Ctrl');
      if (e.altKey) mods.push('Alt');
      if (e.shiftKey) mods.push('Shift');
      if (e.metaKey) mods.push('Meta');
      setHoldHint(mods.length ? `${mods.join('+')}+…` : 'Press a key or mouse button…');
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
        setMsg('Shortcut removed.');
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
        if (e.button === 0) setHoldHint('Left click needs Ctrl/Alt/Shift (or use another button)');
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
  }, [capturing]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.label.toLowerCase().includes(q) ||
        r.keys.toLowerCase().includes(q) ||
        r.id.toLowerCase().includes(q) ||
        r.category.toLowerCase().includes(q) ||
        (r.note?.toLowerCase().includes(q) ?? false),
    );
  }, [rows, query]);

  const doExport = async () => {
    try {
      await navigator.clipboard.writeText(exportShortcuts());
      setMsg('Shortcut profiles copied to the clipboard as JSON.');
    } catch {
      setMsg('Could not access the clipboard.');
    }
  };

  const doImport = () => {
    const res = importShortcuts(importText);
    setMsg(res.ok ? 'Shortcuts imported.' : `Import failed: ${res.error}`);
    if (res.ok) {
      setImportOpen(false);
      setImportText('');
    }
  };

  const addProfile = () => {
    const name = window.prompt('Name for the new shortcut profile (copies the current one):');
    if (name) addShortcutProfile(name);
  };

  const startCapture = (id: string, mode: CaptureMode) => {
    setManualId(null);
    setCaptureMode(mode);
    setCapturing(capturing === id && captureMode === mode ? null : id);
    setHoldHint('Press keys or a mouse button…');
  };

  const applyManual = (id: string) => {
    const conflicts = setBinding(id, manualText.trim(), 'replace');
    setManualId(null);
    setManualText('');
    const pretty = formatKeysDisplay(manualText.trim()) || '(empty)';
    setMsg(
      conflicts.length
        ? `Bound to ${pretty} — also used by: ${conflicts.map((c) => labelFor(c, getBindings())).join(', ')}`
        : manualText.trim()
          ? `Bound to ${pretty}.`
          : 'Shortcut removed.',
    );
  };

  const createCustom = () => {
    const action: CustomAction =
      customActionType === 'openApp'
        ? { type: 'openApp', appId: customAppId }
        : { type: 'runCommand', commandId: customCmdId };
    const res = addCustomCommand({
      label: customLabel,
      keys: customKeys,
      action,
    });
    if (!res.ok) {
      setMsg(res.error);
      return;
    }
    setMsg(`Custom shortcut “${customLabel.trim()}” added.`);
    setCustomLabel('');
    setCustomKeys('');
    setCustomOpen(false);
    if (!customKeys.trim()) {
      startCapture(res.id, 'replace');
    }
  };

  return (
    <section className={`set-section${embedded ? ' sc-embedded' : ''}`}>
      {!embedded && <h2>Shortcuts</h2>}
      <p className="set-row-desc muted">
        Click a key combo to rebind — multi-key chords (<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+…), mouse
        buttons (<kbd>MouseRight</kbd>, <kbd>MouseMiddle</kbd>, side buttons), and alternatives
        (e.g. <kbd>Space</kbd> · <kbd>Enter</kbd>). <kbd>Backspace</kbd> unbinds, <kbd>Esc</kbd>{' '}
        cancels. Changes apply immediately.
      </p>

      <div className="sc-toolbar">
        <input
          className="sc-search"
          placeholder="Search shortcuts…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select
          className="set-select"
          value={profiles.active}
          onChange={(e) => switchShortcutProfile(e.target.value)}
          aria-label="Shortcut profile"
          title="Shortcut profile"
        >
          {profiles.names.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        <button type="button" className="btn small" onClick={addProfile}>
          New profile
        </button>
        {profiles.active !== 'Default' && (
          <button type="button" className="btn small" onClick={() => deleteShortcutProfile(profiles.active)}>
            Delete profile
          </button>
        )}
        <button type="button" className="btn small" onClick={() => setCustomOpen((o) => !o)}>
          {customOpen ? 'Cancel custom' : 'Add custom'}
        </button>
        <button type="button" className="btn small" onClick={() => void doExport()}>
          Export
        </button>
        <button type="button" className="btn small" onClick={() => setImportOpen((o) => !o)}>
          Import
        </button>
        <button
          type="button"
          className="btn small"
          onClick={() => {
            if (window.confirm('Reset every shortcut in this profile to its default?')) {
              resetAllBindings();
              setMsg('All shortcuts reset.');
            }
          }}
        >
          Reset all
        </button>
      </div>

      {customOpen && (
        <div className="sc-custom">
          <div className="sc-custom-title">New custom shortcut</div>
          <div className="sc-custom-grid">
            <label className="sc-field">
              <span className="muted">Name</span>
              <input
                value={customLabel}
                onChange={(e) => setCustomLabel(e.target.value)}
                placeholder="e.g. Open flashcards fast"
              />
            </label>
            <label className="sc-field">
              <span className="muted">Keys (optional — capture after create)</span>
              <input
                value={customKeys}
                onChange={(e) => setCustomKeys(e.target.value)}
                placeholder="Ctrl+Shift+F or MouseMiddle"
              />
            </label>
            <label className="sc-field">
              <span className="muted">Action</span>
              <select
                className="set-select"
                value={customActionType}
                onChange={(e) => setCustomActionType(e.target.value as 'openApp' | 'runCommand')}
              >
                <option value="openApp">Open app / section</option>
                <option value="runCommand">Run existing command</option>
              </select>
            </label>
            {customActionType === 'openApp' ? (
              <label className="sc-field">
                <span className="muted">App</span>
                <select
                  className="set-select"
                  value={customAppId}
                  onChange={(e) => setCustomAppId(e.target.value)}
                >
                  {SHORTCUT_OPEN_APPS.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <label className="sc-field">
                <span className="muted">Command</span>
                <select
                  className="set-select"
                  value={customCmdId}
                  onChange={(e) => setCustomCmdId(e.target.value)}
                >
                  {COMMAND_CATALOG.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.category}: {c.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          <button
            type="button"
            className="btn small primary"
            disabled={!customLabel.trim()}
            onClick={createCustom}
          >
            Create shortcut
          </button>
        </div>
      )}

      {importOpen && (
        <div className="sc-import">
          <textarea
            placeholder="Paste a shortcuts JSON export here…"
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
          />
          <button type="button" className="btn small primary" onClick={doImport} disabled={!importText.trim()}>
            Apply import
          </button>
        </div>
      )}

      {msg && <p className="sc-msg muted">{msg}</p>}
      {capturing && holdHint && <p className="sc-msg sc-capture-hint">{holdHint}</p>}

      {CATEGORY_ORDER.map((cat) => {
        const inCat = visible.filter((r) => r.category === cat);
        if (!inCat.length) return null;
        return (
          <div key={cat} className="sc-group">
            <h3 className="sc-group-title">{cat}</h3>
            {inCat.map((r) => (
              <div key={r.id} className={`sc-row ${r.conflictsWith.length ? 'conflict' : ''}`}>
                <div className="sc-row-text">
                  <span className="sc-label">{r.label}</span>
                  {r.note && <span className="sc-note muted">{r.note}</span>}
                  {r.conflictsWith.length > 0 && (
                    <span className="sc-conflict">
                      Also bound to: {r.conflictsWith.map((c) => labelFor(c, rows)).join(', ')}
                    </span>
                  )}
                </div>
                <div className="sc-row-actions">
                  <button
                    type="button"
                    className={`sc-keys ${capturing === r.id && captureMode === 'replace' ? 'capturing' : ''} ${r.keys ? '' : 'unbound'}`}
                    title="Click, then press the new key combination or mouse button"
                    onClick={() => startCapture(r.id, 'replace')}
                  >
                    {capturing === r.id && captureMode === 'replace'
                      ? holdHint || 'Press keys…'
                      : formatKeysDisplay(r.keys) || 'Unbound'}
                  </button>
                  <button
                    type="button"
                    className={`btn small ${capturing === r.id && captureMode === 'add' ? 'primary' : ''}`}
                    title="Add another key or mouse button that also triggers this command"
                    onClick={() => startCapture(r.id, 'add')}
                  >
                    + Key
                  </button>
                  <button
                    type="button"
                    className="btn small"
                    title="Type a chord manually (Ctrl+Shift+H, Space|Enter, MouseRight…)"
                    onClick={() => {
                      setCapturing(null);
                      setManualId(manualId === r.id ? null : r.id);
                      setManualText(r.keys);
                    }}
                  >
                    Type
                  </button>
                  {!r.isDefault && (
                    <button
                      type="button"
                      className="btn small"
                      title={`Reset to ${formatKeysDisplay(r.defaultKeys) || 'unbound'}`}
                      onClick={() => resetBinding(r.id)}
                    >
                      Reset
                    </button>
                  )}
                  {r.custom && (
                    <button
                      type="button"
                      className="btn small"
                      title="Delete this custom shortcut"
                      onClick={() => {
                        if (window.confirm(`Delete custom shortcut “${r.label}”?`)) {
                          removeCustomCommand(r.id);
                          setMsg('Custom shortcut deleted.');
                        }
                      }}
                    >
                      Delete
                    </button>
                  )}
                </div>
                {manualId === r.id && (
                  <div className="sc-manual">
                    <input
                      className="sc-manual-input"
                      value={manualText}
                      onChange={(e) => setManualText(e.target.value)}
                      placeholder="Ctrl+Alt+S · or Space|Enter · or Ctrl+MouseRight"
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
                      Apply
                    </button>
                    <button type="button" className="btn small" onClick={() => setManualId(null)}>
                      Cancel
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
