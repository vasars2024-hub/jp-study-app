import { useEffect, useState, type FormEvent } from 'react';
import { PROFILE_GROUPS, type ProfileId } from '../../shared/profiles';
import { KNOWN_LANGS } from '../../shared/langs';
import type { YomitanDictInfo } from '../../shared/types';
import {
  bumpZoom,
  getZoom,
  onZoomChanged,
  setZoom,
  ZOOM_DEFAULT,
  ZOOM_MAX,
  ZOOM_MIN,
  ZOOM_STEP,
} from '../appZoom';
import {
  createProfile,
  DEFAULT_PROFILE_ID,
  deleteProfile,
  getActiveProfile,
  getActiveProfileId,
  getProfiles,
  isSeedProfile,
  onProfileChanged,
  switchProfile,
} from '../profileState';
import ShortcutSettings from '../components/ShortcutSettings';
import { loadClipboardSettings, saveClipboardSettings } from '../clipboardHistory';

function CreateProfileModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (msg: { kind: 'ok' | 'err'; text: string }) => void;
}) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await createProfile(name);
    setBusy(false);
    if (res.ok) {
      onCreated({ kind: 'ok', text: 'Profile created.' });
      onClose();
      return;
    }
    onCreated({ kind: 'err', text: res.error ?? 'Could not create the profile.' });
  }

  return (
    <div className="nov-modal-backdrop" onClick={onClose}>
      <div className="set-modal" onClick={(e) => e.stopPropagation()}>
        <button className="nov-modal-x" onClick={onClose} aria-label="Close">
          ×
        </button>
        <div className="set-modal-body">
          <h3 className="set-modal-title">Create New Profile</h3>
          <p className="set-row-desc muted">Enter a name for the new study profile.</p>
          <form onSubmit={submit}>
            <div className="field-row">
              <label htmlFor="profile-name">Profile name</label>
              <input
                id="profile-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. JLPT N3 Focus"
                autoFocus
              />
            </div>
            <div className="set-profile-actions">
              <button type="button" className="btn" onClick={onClose} disabled={busy}>
                Cancel
              </button>
              <button type="submit" className="btn primary" disabled={busy || !name.trim()}>
                {busy ? 'Creating…' : 'Create'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

/** Study-profile picker and controls — shared by Settings and Anki views. */
export function ProfileSettingsSection() {
  const [profiles, setProfiles] = useState(getProfiles);
  const [activeId, setActiveId] = useState<ProfileId>(getActiveProfileId);
  const [switching, setSwitching] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const active = profiles.find((p) => p.id === activeId) ?? getActiveProfile();
  const isDefault = activeId === DEFAULT_PROFILE_ID;
  const isSeed = isSeedProfile(activeId);

  useEffect(
    () =>
      onProfileChanged((snap) => {
        setProfiles(snap.profiles);
        setActiveId(snap.activeProfileId);
      }),
    [],
  );

  async function onSelect(id: ProfileId) {
    if (id === activeId || switching) return;
    setSwitching(true);
    setMsg(null);
    const res = await switchProfile(id);
    setSwitching(false);
    if (!res.ok) {
      setMsg({ kind: 'err', text: res.error ?? 'Could not switch profile.' });
    }
  }

  async function onDelete() {
    if (isDefault || deleting) return;
    const question = isSeed
      ? `Reset "${active.label}" to its default configuration?`
      : `Delete the profile "${active.label}"? This can't be undone.`;
    if (!window.confirm(question)) return;
    setDeleting(true);
    setMsg(null);
    const res = await deleteProfile(activeId);
    setDeleting(false);
    if (res.ok) {
      setMsg({ kind: 'ok', text: isSeed ? 'Profile reset to defaults.' : 'Profile deleted.' });
    } else {
      setMsg({ kind: 'err', text: res.error ?? 'Could not remove the profile.' });
    }
  }

  return (
    <section className="set-section">
      <h2>Profiles</h2>

      <div className="set-row">
        <div className="set-row-text">
          <div className="set-row-title">Active profile</div>
          <div className="set-row-desc muted">
            {active.description ??
              'Controls card direction, Anki deck binding, and dictionary pipeline for mining.'}
          </div>
        </div>
        <span className="set-profile-badge" aria-live="polite">
          <span className="status-dot ok" />
          {active.label}
        </span>
      </div>

      <div className="set-row set-profile-picker">
        <div className="set-row-text">
          <div className="set-row-title">Switch profile</div>
        </div>
        <select
          className="set-select"
          value={activeId}
          disabled={switching}
          onChange={(e) => void onSelect(e.target.value as ProfileId)}
          aria-label="Study profile"
        >
          {PROFILE_GROUPS.map((group) => {
            const items = group.ids
              .map((id) => profiles.find((p) => p.id === id))
              .filter((p): p is NonNullable<typeof p> => Boolean(p));
            if (items.length === 0) return null;
            return (
              <optgroup key={group.label} label={group.label}>
                {items.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                    {p.description
                      ? ` — ${p.description.slice(0, 48)}${p.description.length > 48 ? '…' : ''}`
                      : ''}
                  </option>
                ))}
              </optgroup>
            );
          })}
          {profiles.some((p) => !PROFILE_GROUPS.some((g) => g.ids.includes(p.id))) && (
            <optgroup label="Custom">
              {profiles
                .filter((p) => !PROFILE_GROUPS.some((g) => g.ids.includes(p.id)))
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                    {p.description
                      ? ` — ${p.description.slice(0, 48)}${p.description.length > 48 ? '…' : ''}`
                      : ''}
                  </option>
                ))}
            </optgroup>
          )}
        </select>
      </div>

      <div className="set-profile-actions">
        <button className="btn" onClick={() => setShowCreate(true)}>
          Create New Profile
        </button>
        <button
          className="btn"
          onClick={() => void onDelete()}
          disabled={isDefault || deleting}
          title={
            isDefault
              ? 'The default profile cannot be deleted'
              : isSeed
                ? 'Reset this built-in profile to its defaults'
                : 'Delete this profile'
          }
        >
          {deleting
            ? isSeed
              ? 'Resetting…'
              : 'Deleting…'
            : isSeed
              ? 'Reset to defaults'
              : 'Delete Profile'}
        </button>
      </div>

      {msg && <div className={`form-msg ${msg.kind}`}>{msg.text}</div>}

      {showCreate && (
        <CreateProfileModal onClose={() => setShowCreate(false)} onCreated={setMsg} />
      )}
    </section>
  );
}

function dictKindLabel(d: YomitanDictInfo): string {
  const parts: string[] = [];
  if (d.hasTerms) parts.push('terms');
  if (d.hasPitch) parts.push('pitch');
  if (d.hasFreq) parts.push('frequency');
  return parts.length ? parts.join(' + ') : 'metadata';
}

/** Import / remove offline Yomitan dictionaries for the pop-up and mining. */
export function DictionarySettingsSection() {
  const [dicts, setDicts] = useState<YomitanDictInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [exOffline, setExOffline] = useState<{ installed: boolean; sentenceCount: number; updatedAt: number } | null>(null);
  const [exImporting, setExImporting] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      const [list, offline] = await Promise.all([
        window.api.dictListYomitan(),
        window.api.examplesOfflineStatus(),
      ]);
      setDicts(list);
      setExOffline(offline);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function onImport() {
    setImporting(true);
    setMsg(null);
    const res = await window.api.dictImportYomitan();
    setImporting(false);
    if (res.error === 'cancelled') return;
    if (res.ok) {
      setMsg({ kind: 'ok', text: `Imported “${res.info?.title ?? 'dictionary'}”.` });
      await refresh();
    } else {
      setMsg({ kind: 'err', text: res.error ?? 'Import failed.' });
    }
  }

  async function onImportExamples() {
    setExImporting(true);
    setMsg(null);
    const res = await window.api.examplesImportOffline();
    setExImporting(false);
    if (res.error === 'cancelled') return;
    if (res.ok) {
      setMsg({
        kind: 'ok',
        text: `Indexed ${res.added.toLocaleString()} Tatoeba sentence${res.added === 1 ? '' : 's'}.`,
      });
      await refresh();
    } else {
      setMsg({ kind: 'err', text: res.error ?? 'Import failed.' });
    }
  }

  async function onRemove(id: string, title: string) {
    if (!window.confirm(`Remove “${title}” from offline dictionaries?`)) return;
    setRemoving(id);
    setMsg(null);
    const res = await window.api.dictRemoveYomitan(id);
    setRemoving(null);
    if (res.ok) {
      setMsg({ kind: 'ok', text: 'Dictionary removed.' });
      await refresh();
    } else {
      setMsg({ kind: 'err', text: res.error ?? 'Could not remove the dictionary.' });
    }
  }

  async function onToggle(id: string, enabled: boolean) {
    setMsg(null);
    const res = await window.api.dictSetYomitanEnabled(id, enabled);
    if (res.ok) await refresh();
    else setMsg({ kind: 'err', text: res.error ?? 'Could not update the dictionary.' });
  }

  async function onMove(id: string, dir: number) {
    setMsg(null);
    const res = await window.api.dictMoveYomitan(id, dir);
    if (res.ok) await refresh();
    else if (res.error !== 'Already at the edge.') {
      setMsg({ kind: 'err', text: res.error ?? 'Could not reorder the dictionary.' });
    }
  }

  async function onSetLang(id: string, lang: string) {
    setMsg(null);
    const res = await window.api.dictSetYomitanLang(id, lang);
    if (res.ok) await refresh();
    else setMsg({ kind: 'err', text: res.error ?? 'Could not set the dictionary language.' });
  }

  return (
    <section className="set-section">
      <h2>Dictionaries</h2>
      <p className="set-row-desc muted">
        Offline Yomitan dictionaries power the reader pop-up and fill{' '}
        <code>{'{pitch}'}</code> / <code>{'{frequency}'}</code> when mining. Kanjium pitch
        accents are bundled automatically on first launch (requires internet once). Import a term
        dictionary for richer offline glossaries; import a frequency list for rank badges. The{' '}
        <b>top</b> dictionary wins when several define the same word — use ↑/↓ to reorder, or the
        checkbox to switch one off.
      </p>

      <div className="set-profile-actions">
        <button className="btn primary" onClick={() => void onImport()} disabled={importing}>
          {importing ? 'Importing…' : 'Import Yomitan dictionary (.zip)'}
        </button>
      </div>

      {loading && <div className="form-msg">Loading dictionaries…</div>}
      {!loading && dicts.length === 0 && (
        <div className="form-msg">No dictionaries loaded yet. Bundled pitch seeds on first boot.</div>
      )}
      {!loading && dicts.length > 0 && (
        <ul className="dict-manage-list">
          {dicts.map((d, i) => (
            <li className={`dict-manage-row ${d.enabled === false ? 'off' : ''}`} key={d.id}>
              <label className="dict-manage-toggle" title="Use this dictionary">
                <input
                  type="checkbox"
                  checked={d.enabled !== false}
                  onChange={(e) => void onToggle(d.id, e.target.checked)}
                />
              </label>
              <div className="dict-manage-info">
                <div className="set-row-title">
                  {d.title}
                  {d.bundled && <span className="dict-badge bundled">bundled</span>}
                </div>
                <div className="set-row-desc muted">
                  {dictKindLabel(d)}
                  {d.revision ? ` · rev ${d.revision}` : ''}
                  {d.hasTerms && !d.glossLangOverride && d.glossLangs?.length
                    ? ` · language: ${d.glossLangs.join(', ')} (detected)`
                    : ''}
                </div>
              </div>
              <div className="dict-manage-actions">
                {d.hasTerms && (
                  <select
                    className="dict-lang-select"
                    title="Definition language of this dictionary — auto-detected, override if wrong"
                    value={d.glossLangOverride ?? ''}
                    onChange={(e) => void onSetLang(d.id, e.target.value)}
                  >
                    <option value="">
                      Auto{d.glossLangs?.length ? ` (${d.glossLangs.join(', ')})` : ''}
                    </option>
                    {KNOWN_LANGS.map((l) => (
                      <option key={l.code} value={l.code}>
                        {l.label}
                      </option>
                    ))}
                  </select>
                )}
                <button
                  className="btn small"
                  title="Higher priority"
                  disabled={i === 0}
                  onClick={() => void onMove(d.id, -1)}
                >
                  ↑
                </button>
                <button
                  className="btn small"
                  title="Lower priority"
                  disabled={i === dicts.length - 1}
                  onClick={() => void onMove(d.id, 1)}
                >
                  ↓
                </button>
                {!d.bundled && (
                  <button
                    className="btn small"
                    disabled={removing === d.id}
                    onClick={() => void onRemove(d.id, d.title)}
                  >
                    {removing === d.id ? 'Removing…' : 'Remove'}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <h3 className="set-subhead">Offline example sentences</h3>
      <p className="set-row-desc muted">
        Tatoeba examples work online by default. Import the Japanese sentences CSV from{' '}
        <a href="https://tatoeba.org/en/downloads" target="_blank" rel="noreferrer">
          tatoeba.org/downloads
        </a>{' '}
        for offline lookup; the app also caches examples from successful online searches. Optional:
        re-use the same sentences file plus a links CSV to attach English glosses during import.
      </p>
      <div className="set-profile-actions">
        <button className="btn" onClick={() => void onImportExamples()} disabled={exImporting}>
          {exImporting ? 'Importing…' : 'Import Tatoeba sentences (CSV)'}
        </button>
      </div>
      {!loading && exOffline && (
        <div className="form-msg">
          {exOffline.sentenceCount > 0
            ? `${exOffline.sentenceCount.toLocaleString()} sentences in offline index.`
            : 'No offline examples yet — online Tatoeba still works when connected.'}
        </div>
      )}

      {msg && <div className={`form-msg ${msg.kind}`}>{msg.text}</div>}
    </section>
  );
}

function ClipboardSettingsSection() {
  const [settings, setSettings] = useState(loadClipboardSettings);
  return (
    <section className="set-section">
      <h2>Clipboard History</h2>
      <p className="set-row-desc muted">
        Open it any time with <kbd>Ctrl</kbd> <kbd>Shift</kbd> <kbd>V</kbd>, the command palette, or the
        clipboard icon in the taskbar.
      </p>

      <div className="set-row">
        <div className="set-row-text">
          <div className="set-row-title">Maximum history size</div>
          <div className="set-row-desc muted">Oldest unpinned entries are dropped once this limit is reached.</div>
        </div>
        <input
          type="number"
          min={10}
          max={2000}
          className="set-number"
          value={settings.maxSize}
          onChange={(e) => setSettings(saveClipboardSettings({ maxSize: Math.max(10, Number(e.target.value) || 200) }))}
        />
      </div>

      <div className="set-row">
        <div className="set-row-text">
          <div className="set-row-title">Remove consecutive duplicates</div>
          <div className="set-row-desc muted">Copying the same text twice in a row won't add a second entry.</div>
        </div>
        <input
          type="checkbox"
          checked={settings.dedupeConsecutive}
          onChange={(e) => setSettings(saveClipboardSettings({ dedupeConsecutive: e.target.checked }))}
        />
      </div>

      <div className="set-row">
        <div className="set-row-text">
          <div className="set-row-title">Clear on application exit</div>
          <div className="set-row-desc muted">Unpinned history is wiped when the app closes; pinned entries are kept.</div>
        </div>
        <input
          type="checkbox"
          checked={settings.clearOnExit}
          onChange={(e) => setSettings(saveClipboardSettings({ clearOnExit: e.target.checked }))}
        />
      </div>

      <div className="set-row">
        <div className="set-row-text">
          <div className="set-row-title">Clipboard monitoring</div>
          <div className="set-row-desc muted">Automatically record text copied anywhere on your system, not just in the app.</div>
        </div>
        <input
          type="checkbox"
          checked={settings.monitoringEnabled}
          onChange={(e) => setSettings(saveClipboardSettings({ monitoringEnabled: e.target.checked }))}
        />
      </div>
    </section>
  );
}

export default function SettingsView() {
  const [zoom, setZoomState] = useState<number>(getZoom());

  useEffect(() => onZoomChanged(setZoomState), []);

  const pct = Math.round(zoom * 100);
  const atMin = zoom <= ZOOM_MIN + 1e-9;
  const atMax = zoom >= ZOOM_MAX - 1e-9;

  return (
    <div className="settings-view">
      <div className="view-head">
        <div>
          <h1>Settings</h1>
          <p className="muted">Make the app comfortable to read and use.</p>
        </div>
      </div>

      <ProfileSettingsSection />

      <DictionarySettingsSection />

      <ShortcutSettings />

      <ClipboardSettingsSection />

      <section className="set-section">
        <h2>Accessibility</h2>

        <div className="set-row">
          <div className="set-row-text">
            <div className="set-row-title">App zoom</div>
            <div className="set-row-desc muted">
              Scales the whole app — text, buttons, and every screen. Use this if the interface
              feels too small or too large.
            </div>
          </div>
          <div className="zoom-control">
            <button
              className="zoom-btn"
              onClick={() => bumpZoom(-ZOOM_STEP)}
              disabled={atMin}
              aria-label="Decrease app zoom"
            >
              −
            </button>
            <span className="zoom-val">{pct}%</span>
            <button
              className="zoom-btn"
              onClick={() => bumpZoom(ZOOM_STEP)}
              disabled={atMax}
              aria-label="Increase app zoom"
            >
              ＋
            </button>
            <button
              className="btn small"
              onClick={() => setZoom(ZOOM_DEFAULT)}
              disabled={pct === Math.round(ZOOM_DEFAULT * 100)}
            >
              Reset
            </button>
          </div>
        </div>

        <input
          className="set-range"
          type="range"
          min={ZOOM_MIN}
          max={ZOOM_MAX}
          step={ZOOM_STEP}
          value={zoom}
          onChange={(e) => setZoom(Number(e.target.value))}
          aria-label="App zoom"
        />
      </section>

      <section className="set-section">
        <h2>Reader</h2>
        <p className="set-row-desc muted">
          While reading a book, change the <strong>text size</strong> (now up to 400%) by holding{' '}
          <kbd>Ctrl</kbd> and scrolling, or pressing <kbd>Ctrl</kbd> <kbd>+</kbd> /{' '}
          <kbd>Ctrl</kbd> <kbd>−</kbd>. Theme, font, and furigana live in the reader’s own settings
          panel. The app zoom above applies on top of this, everywhere in the app.
        </p>
      </section>
    </div>
  );
}
