// Advanced Settings — the right-hand drawer from the reference design.
//
// Its own search box, its own category rail, a body of controls, and a
// Reset / Save footer. Everything it edits goes through scraperSettingsStore so
// the Settings app's copy of the same document stays in step; writing to
// localStorage directly here would desync both the UI and the change event.

import { startTransition, useEffect, useMemo, useState } from 'react';
import Icon from '../../Icons';
import { Button, IconButton, Toggle } from '../../ui';
import { AnchorSurface, ContextualSurface } from '../../liquid/LiquidSurface';
import StatusDot from '../StatusDot';
import FieldRow from './FieldRow';
import {
  SCRAPER_SETTINGS_GROUPS,
  fieldsForGroup,
  fieldPatch,
  groupMeta,
  readField,
  searchScraperFields,
  type ScraperFieldDef,
  type ScraperSettingsGroupId,
} from './fields';
import { useScraper } from '../ScraperContext';
import { SCRAPER_SETTINGS_DRAWER_ID } from '../drawerId';
import { sx, sxs } from '../strings';
import { useScraperPort } from '../data/scraperPort';
import {
  chooseScraperPreset,
  loadScraperSettingsDocument,
  onScraperSettingsChanged,
  saveScraperSettingsDocument,
  updateActiveScraperSettings,
} from '../../../scraperSettingsStore';
import { resolveScraperSettings, type ScraperSettingsDocument } from '../../../../shared/scraperSettings';
import {
  cookieHeaderToPairs,
  headerRecordToPairs,
  pairsToCookieHeader,
  pairsToHeaderRecord,
  type ScraperSettingPair,
} from './pairEditor';
import {
  normalizeScraperSettingList,
  resolveScraperSettingAction,
  type ScraperSettingActionId,
} from './settingActions';

interface PairEditorState {
  kind: 'headers' | 'cookies';
  title: string;
  path: string;
  rows: ScraperSettingPair[];
}

interface ListEditorState {
  title: string;
  path: string;
  rows: string[];
}

interface CredentialEditorState {
  title: string;
  path: string;
  /** The lookup name kept in settings. */
  value: string;
  /** The secret itself, held only for as long as this dialog is open. */
  secret: string;
  /** Whether main already holds a secret under `value`. */
  stored: boolean;
}

export default function ScraperSettingsDrawer() {
  const ctl = useScraper();
  const port = useScraperPort();
  const [doc, setDoc] = useState<ScraperSettingsDocument>(() => loadScraperSettingsDocument());
  const [query, setQuery] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const [pairEditor, setPairEditor] = useState<PairEditorState | null>(null);
  const [listEditor, setListEditor] = useState<ListEditorState | null>(null);
  const [credentialEditor, setCredentialEditor] = useState<CredentialEditorState | null>(null);

  // The Settings app edits the same document. Subscribing keeps the drawer from
  // showing a stale value after a change made in the other window.
  useEffect(() => onScraperSettingsChanged(setDoc), []);

  const settings = useMemo(() => resolveScraperSettings(doc), [doc]);
  const activeProfile = doc.profiles.find((p) => p.id === doc.activeProfileId);

  const category = (groupMeta(ctl.drawerCategory)?.id ?? 'network') as ScraperSettingsGroupId;
  const meta = groupMeta(category);

  const searching = query.trim().length > 0;
  const results = useMemo(
    () => (searching ? searchScraperFields(query, ctl.advancedMode, settings) : []),
    [query, searching, ctl.advancedMode, settings],
  );
  const fields = useMemo(
    () => (searching ? results : fieldsForGroup(category, ctl.advancedMode, settings)),
    [searching, results, category, ctl.advancedMode, settings],
  );

  const change = (path: string, value: unknown) => {
    setDoc(updateActiveScraperSettings(fieldPatch(path, value)));
    setNote(null);
  };

  const testQbit = async () => {
    setNote(sx('set.qbitTesting'));
    try {
      const report = await port.qbitTest(settings.qbittorrent);
      setDoc(updateActiveScraperSettings({
        qbittorrent: { connectionStatus: report.status },
      }));
      const timing = report.latencyMs > 0 ? ` · ${report.latencyMs} ms` : '';
      const version = report.version ? ` · v${report.version}` : '';
      // Which credential answered. Without it, a user holding both a password
      // and a key cannot tell which one this result is about.
      const via = report.authMode ? ` · ${sxs('torrent.authVia', report.authMode)}` : '';
      setNote(sxs('set.qbitTestResult', `${report.message}${version}${timing}${via}`));
    } catch {
      setNote(sx('set.qbitTestFailed'));
    }
  };

  const runAction = (action: ScraperSettingActionId, field: ScraperFieldDef) => {
    const resolution = resolveScraperSettingAction(action);
    switch (resolution.kind) {
      case 'navigate':
        ctl.navigate(resolution.page);
        ctl.closeDrawer();
        return;
      case 'pairs':
        setPairEditor({
          kind: action === 'headers' ? 'headers' : 'cookies',
          title: field.label,
          path: field.path,
          rows: action === 'headers'
            ? headerRecordToPairs(settings.network.headers)
            : cookieHeaderToPairs(settings.network.cookieHeader),
        });
        return;
      case 'list':
        setListEditor({
          title: field.label,
          path: field.path,
          rows: settings.torrents.extraTrackers.length
            ? [...settings.torrents.extraTrackers]
            : [''],
        });
        return;
      case 'test':
        void testQbit();
        return;
      case 'credential': {
        // The ref comes from the field's own path, not a hardcoded one: there
        // are two credentials on this panel now (password and API key) and a
        // fixed path would have opened the password editor for both.
        const ref = typeof readField(settings, field.path) === 'string'
          ? (readField(settings, field.path) as string)
          : '';
        setCredentialEditor({ title: field.label, path: field.path, value: ref, secret: '', stored: false });
        // Whether a secret exists is main's answer, not something the settings
        // document can be trusted to know.
        void window.api?.scraperHasCredential?.(ref)
          .then((stored) => setCredentialEditor((current) => current && { ...current, stored }))
          .catch(() => undefined);
        return;
      }
    }
  };

  const resetProfile = () => {
    // Reset means "back to this profile's preset", not "wipe everything": the
    // preset is the documented baseline the profile was created from.
    const preset = activeProfile?.preset;
    if (!preset || preset === 'custom') {
      setNote(sx('set.resetCustom'));
      return;
    }
    setDoc(chooseScraperPreset(preset));
    setNote(sx('set.resetDone'));
  };

  const updatePair = (id: string, patch: Partial<ScraperSettingPair>) => {
    setPairEditor((current) => current && {
      ...current,
      rows: current.rows.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    });
  };

  const savePairs = () => {
    if (!pairEditor) return;
    const value = pairEditor.kind === 'headers'
      ? pairsToHeaderRecord(pairEditor.rows)
      : pairsToCookieHeader(pairEditor.rows);
    change(pairEditor.path, value);
    setNote(`${pairEditor.title} saved.`);
    setPairEditor(null);
  };

  const saveList = () => {
    if (!listEditor) return;
    change(listEditor.path, normalizeScraperSettingList(listEditor.rows));
    setNote(sxs('set.listSaved', listEditor.title));
    setListEditor(null);
  };

  const saveCredential = async () => {
    if (!credentialEditor) return;
    const ref = credentialEditor.value.trim();
    change(credentialEditor.path, ref);
    // An untouched password field means "keep what is stored" — the dialog
    // never learns the current secret, so blank cannot mean "clear it".
    if (credentialEditor.secret) {
      const result = await window.api?.scraperSetCredential?.(ref, credentialEditor.secret);
      if (result && !result.ok) {
        setNote(sxs('set.credentialSaveFailed', result.message));
        return;
      }
    }
    setNote(sx('set.credentialSaved'));
    setCredentialEditor(null);
  };

  const clearCredential = async () => {
    if (!credentialEditor) return;
    await window.api?.scraperClearCredential?.(credentialEditor.value.trim());
    setCredentialEditor((current) => current && { ...current, stored: false, secret: '' });
    setNote(sx('set.credentialCleared'));
  };

  const selectProfile = (id: string) => {
    setDoc(saveScraperSettingsDocument({ ...doc, activeProfileId: id }));
    setNote('Active profile changed.');
  };

  if (!ctl.drawerOpen) return null;

  return (
    // A temporary inspector over the page behind it — §2.3's canonical Liquid
    // region. Only the DRAWER takes the material: its head, category rail, pane
    // head and footer read it through their own transparent boxes, and the field
    // body below is an opaque anchor, because editing is work and work never goes
    // on glass.
    <ContextualSurface
      as="aside"
      id={SCRAPER_SETTINGS_DRAWER_ID}
      className="scr-drawer"
      aria-label={sx('app.settings')}
    >
      <header className="scr-drawer-head">
        <h2 className="scr-drawer-title">{sx('set.title')}</h2>
        <IconButton label={sx('common.close')} size="sm" onClick={ctl.closeDrawer}>
          <Icon name="close" size={16} />
        </IconButton>
      </header>

      <AnchorSurface bare className="scr-drawer-search">
        <span className="scr-search-icon" aria-hidden>
          <Icon name="search" size={14} />
        </span>
        <input
          type="search"
          className="scr-search-input"
          value={query}
          placeholder={sx('set.searchPlaceholder')}
          aria-label={sx('set.search')}
          onChange={(e) => setQuery(e.target.value)}
        />
      </AnchorSurface>

      <div className="scr-drawer-body">
        <nav className="scr-drawer-rail" aria-label={sx('set.categories')}>
          {SCRAPER_SETTINGS_GROUPS.map((group) => {
            const active = !searching && group.id === category;
            return (
              <button
                key={group.id}
                type="button"
                className={`scr-drawer-cat${active ? ' is-active' : ''}`}
                aria-current={active ? 'true' : undefined}
                onClick={() => {
                  setQuery('');
                  // Changing the shared shell category also re-renders the mounted
                  // Scraper page behind the drawer. Keep that non-urgent tree swap
                  // interruptible so the category click receives a paint first.
                  startTransition(() => ctl.openDrawer(group.id));
                }}
              >
                <Icon name={group.icon} size={15} />
                <span className="scr-drawer-cat-label">{group.label}</span>
                <StatusDot id={group.statusId} />
              </button>
            );
          })}
        </nav>

        <div className="scr-drawer-pane">
          {searching ? (
            <header className="scr-drawer-pane-head">
              <h3 className="scr-drawer-pane-title">{sx('set.searchResults')}</h3>
              <p className="scr-drawer-pane-desc">
                {results.length ? `${results.length} matching settings.` : sx('app.searchEmpty')}
              </p>
            </header>
          ) : (
            <header className="scr-drawer-pane-head">
              <h3 className="scr-drawer-pane-title">
                {meta?.label ?? 'Network'}
                <StatusDot id={meta?.statusId ?? 'set.network'} />
              </h3>
              <p className="scr-drawer-pane-desc">{meta?.description ?? 'Configure scraper behavior.'}</p>
            </header>
          )}

          <AnchorSurface bare className="scr-fields">
            {fields.map((field) => (
              <FieldRow
                key={`${field.path}-${field.label}`}
                field={field}
                settings={settings}
                onChange={change}
                onAction={runAction}
                highlight={ctl.focusSettingId === field.path}
              />
            ))}
            {!searching && category === 'profiles' && (
              <div className="scr-drawer-special">
                <div className="scr-setting-metric-grid">
                  <span><small>Saved profiles</small><b>{doc.profiles.length}</b></span>
                  <span><small>Active preset</small><b>{activeProfile?.preset ?? 'custom'}</b></span>
                  <span><small>Revisions</small><b>{doc.profiles.reduce((sum, profile) => sum + profile.history.length, 0)}</b></span>
                  <span><small>Site overrides</small><b>{Object.keys(doc.siteOverrides).length}</b></span>
                </div>
                <label className="scr-special-field">
                  <span>Active profile</span>
                  <select className="scr-input" value={doc.activeProfileId} onChange={(event) => selectProfile(event.target.value)}>
                    {doc.profiles.map((profile) => (
                      <option key={profile.id} value={profile.id}>{profile.name}</option>
                    ))}
                  </select>
                  <small>Changing profile swaps every scraper behavior setting as one revisioned unit.</small>
                </label>
                <div className="scr-setting-profile-list">
                  {doc.profiles.map((profile) => (
                    <button
                      key={profile.id}
                      type="button"
                      className={profile.id === doc.activeProfileId ? 'is-active' : ''}
                      onClick={() => selectProfile(profile.id)}
                    >
                      <span><b>{profile.name}</b><small>{profile.description}</small></span>
                      <span>{profile.history.length} revisions</span>
                    </button>
                  ))}
                </div>
                <Button
                  size="sm"
                  leftIcon={<Icon name="app" size={13} />}
                  onClick={() => {
                    ctl.closeDrawer();
                    ctl.navigate('profiles');
                  }}
                >
                  Open profile manager
                </Button>
              </div>
            )}
            {!searching && category === 'ui' && (
              <div className="scr-drawer-special">
                <div className="scr-setting-metric-grid">
                  <span><small>Window mode</small><b>{ctl.compact ? 'Compact' : 'Full'}</b></span>
                  <span><small>Table density</small><b>{ctl.density}</b></span>
                  <span><small>Page size</small><b>{ctl.pageSize}</b></span>
                  <span><small>Visible columns</small><b>{ctl.visibleColumns.length}</b></span>
                </div>
                <label className="scr-special-toggle">
                  <span><b>Compact scraper window</b><small>Use the narrow standalone layout from the compact reference.</small></span>
                  <Toggle checked={ctl.compact} onChange={(event) => ctl.setCompact(event.target.checked)} />
                </label>
                <label className="scr-special-toggle">
                  <span><b>Collapsed navigation rail</b><small>Keep icons visible while reclaiming workspace width.</small></span>
                  <Toggle checked={ctl.railCollapsed} onChange={() => ctl.toggleRail()} />
                </label>
                <label className="scr-special-toggle">
                  <span><b>Advanced controls</b><small>Show expert-only settings and diagnostic pages.</small></span>
                  <Toggle checked={ctl.advancedMode} onChange={(event) => ctl.setAdvancedMode(event.target.checked)} />
                </label>
                <div className="scr-special-field-grid">
                  <label className="scr-special-field">
                    <span>Result density</span>
                    <select className="scr-input" value={ctl.density} onChange={(event) => ctl.setDensity(event.target.value as 'compact' | 'cozy')}>
                      <option value="cozy">Cozy</option>
                      <option value="compact">Compact</option>
                    </select>
                  </label>
                  <label className="scr-special-field">
                    <span>Rows per page</span>
                    <select className="scr-input" value={ctl.pageSize} onChange={(event) => ctl.setPageSize(Number(event.target.value))}>
                      {[10, 25, 50, 100, 200].map((size) => <option key={size} value={size}>{size}</option>)}
                    </select>
                  </label>
                  <label className="scr-special-field">
                    <span>Default result tab</span>
                    <select className="scr-input" value={ctl.resultTab} onChange={(event) => ctl.setResultTab(event.target.value as typeof ctl.resultTab)}>
                      {['episodes', 'details', 'streams', 'torrents', 'images', 'metadata', 'logs'].map((tab) => (
                        <option key={tab} value={tab}>{tab[0].toUpperCase() + tab.slice(1)}</option>
                      ))}
                    </select>
                  </label>
                  <div className="scr-special-field">
                    <span>Recent destinations</span>
                    <div className="scr-recent-setting-list">
                      {ctl.recentPages.slice(0, 4).map((page) => <code key={page}>{page}</code>)}
                      {!ctl.recentPages.length && <small>No recent pages yet</small>}
                    </div>
                  </div>
                </div>
              </div>
            )}
            {!fields.length && category !== 'profiles' && category !== 'ui' && <p className="scr-muted">{sx('app.searchEmpty')}</p>}
          </AnchorSurface>
        </div>
      </div>

      <footer className="scr-drawer-foot">
        {note && <span className="scr-drawer-note">{note}</span>}
        <span className="scr-drawer-profile">
          {sx('set.activeProfile')}: <b>{activeProfile?.name ?? '—'}</b>
        </span>
        <Button size="sm" onClick={resetProfile}>
          {sx('set.reset')}
        </Button>
        <Button
          size="sm"
          variant="primary"
          onClick={() => setNote(sx('set.savedAlready'))}
        >
          {sx('set.save')}
        </Button>
      </footer>

      {pairEditor && (
        <div className="scr-pair-editor-backdrop">
          <section
            className="scr-pair-editor"
            role="dialog"
            aria-modal="true"
            aria-label={`Edit ${pairEditor.title}`}
          >
            <header className="scr-pair-editor-head">
              <div>
                <h3>{pairEditor.title}</h3>
                <p>
                  {pairEditor.kind === 'headers'
                    ? 'Headers are sent with every request in this profile.'
                    : 'Cookies are stored in the standard name/value header format.'}
                </p>
              </div>
              <IconButton label={sx('common.close')} size="sm" onClick={() => setPairEditor(null)}>
                <Icon name="close" size={15} />
              </IconButton>
            </header>

            <div className="scr-pair-editor-labels" aria-hidden>
              <span>{pairEditor.kind === 'headers' ? 'Header' : 'Cookie'}</span>
              <span>Value</span>
            </div>
            <div className="scr-pair-editor-rows">
              {pairEditor.rows.map((row, index) => (
                <div className="scr-pair-editor-row" key={row.id}>
                  <input
                    className="scr-input"
                    value={row.key}
                    aria-label={`${pairEditor.title} name ${index + 1}`}
                    placeholder={pairEditor.kind === 'headers' ? 'Accept-Language' : 'session'}
                    onChange={(event) => updatePair(row.id, { key: event.target.value })}
                  />
                  <input
                    className="scr-input"
                    value={row.value}
                    aria-label={`${pairEditor.title} value ${index + 1}`}
                    placeholder={pairEditor.kind === 'headers' ? 'ja,en;q=0.8' : 'value'}
                    onChange={(event) => updatePair(row.id, { value: event.target.value })}
                  />
                  <IconButton
                    label={`Remove row ${index + 1}`}
                    size="sm"
                    onClick={() =>
                      setPairEditor((current) => current && {
                        ...current,
                        rows: current.rows.length === 1
                          ? [{ ...current.rows[0], key: '', value: '' }]
                          : current.rows.filter((candidate) => candidate.id !== row.id),
                      })
                    }
                  >
                    <Icon name="close" size={13} />
                  </IconButton>
                </div>
              ))}
            </div>

            <Button
              size="sm"
              leftIcon={<Icon name="plus" size={13} />}
              onClick={() =>
                setPairEditor((current) => current && {
                  ...current,
                  rows: [
                    ...current.rows,
                    {
                      id: `pair-${Date.now()}-${current.rows.length}`,
                      key: '',
                      value: '',
                    },
                  ],
                })
              }
            >
              Add row
            </Button>

            <footer className="scr-pair-editor-foot">
              <Button size="sm" variant="ghost" onClick={() => setPairEditor(null)}>
                {sx('common.cancel')}
              </Button>
              <Button size="sm" variant="primary" onClick={savePairs}>
                Save {pairEditor.title}
              </Button>
            </footer>
          </section>
        </div>
      )}

      {listEditor && (
        <div className="scr-pair-editor-backdrop">
          <section
            className="scr-pair-editor"
            role="dialog"
            aria-modal="true"
            aria-label={`Edit ${listEditor.title}`}
          >
            <header className="scr-pair-editor-head">
              <div>
                <h3>{listEditor.title}</h3>
                <p>{sx('set.trackersDescription')}</p>
              </div>
              <IconButton label={sx('common.close')} size="sm" onClick={() => setListEditor(null)}>
                <Icon name="close" size={15} />
              </IconButton>
            </header>

            <div className="scr-pair-editor-rows">
              {listEditor.rows.map((row, index) => (
                <div className="scr-list-editor-row" key={`${row}-${index}`}>
                  <input
                    className="scr-input"
                    value={row}
                    aria-label={sxs('set.entry', `${listEditor.title} ${index + 1}`)}
                    placeholder="udp://tracker.example:80/announce"
                    onChange={(event) =>
                      setListEditor((current) => current && {
                        ...current,
                        rows: current.rows.map((value, rowIndex) =>
                          rowIndex === index ? event.target.value : value),
                      })
                    }
                  />
                  <IconButton
                    label={sxs('set.removeEntry', `${listEditor.title} ${index + 1}`)}
                    size="sm"
                    onClick={() =>
                      setListEditor((current) => current && {
                        ...current,
                        rows: current.rows.filter((_, rowIndex) => rowIndex !== index),
                      })
                    }
                  >
                    <Icon name="close" size={13} />
                  </IconButton>
                </div>
              ))}
            </div>

            <Button
              size="sm"
              leftIcon={<Icon name="plus" size={13} />}
              onClick={() =>
                setListEditor((current) => current && {
                  ...current,
                  rows: [...current.rows, ''],
                })
              }
            >
              {sx('set.addEntry')}
            </Button>

            <footer className="scr-pair-editor-foot">
              <Button size="sm" variant="ghost" onClick={() => setListEditor(null)}>
                {sx('common.cancel')}
              </Button>
              <Button size="sm" variant="primary" onClick={saveList}>
                {sxs('set.saveItem', listEditor.title)}
              </Button>
            </footer>
          </section>
        </div>
      )}

      {credentialEditor && (
        <div className="scr-pair-editor-backdrop">
          <section
            className="scr-pair-editor"
            role="dialog"
            aria-modal="true"
            aria-label={`Edit ${credentialEditor.title}`}
          >
            <header className="scr-pair-editor-head">
              <div>
                <h3>{credentialEditor.title}</h3>
                <p>{sx('set.credentialDescription')}</p>
              </div>
              <IconButton
                label={sx('common.close')}
                size="sm"
                onClick={() => setCredentialEditor(null)}
              >
                <Icon name="close" size={15} />
              </IconButton>
            </header>

            <label className="scr-special-field">
              <span>{sx('set.credentialReference')}</span>
              <input
                className="scr-input"
                value={credentialEditor.value}
                placeholder={sx('set.credentialPlaceholder')}
                onChange={(event) =>
                  setCredentialEditor((current) => current && {
                    ...current,
                    value: event.target.value,
                  })
                }
              />
            </label>

            <label className="scr-special-field">
              <span>{sx('set.credentialSecret')}</span>
              <input
                className="scr-input"
                type="password"
                autoComplete="off"
                value={credentialEditor.secret}
                placeholder={sx('set.credentialSecretPlaceholder')}
                onChange={(event) =>
                  setCredentialEditor((current) => current && {
                    ...current,
                    secret: event.target.value,
                  })
                }
              />
            </label>

            <p className="scr-field-hint">
              {credentialEditor.stored ? sx('set.credentialStored') : sx('set.credentialMissing')}
            </p>

            <footer className="scr-pair-editor-foot">
              {credentialEditor.stored && (
                <Button size="sm" variant="ghost" onClick={() => void clearCredential()}>
                  {sx('common.clear')}
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={() => setCredentialEditor(null)}>
                {sx('common.cancel')}
              </Button>
              <Button size="sm" variant="primary" onClick={() => void saveCredential()}>
                {sx('set.save')}
              </Button>
            </footer>
          </section>
        </div>
      )}
    </ContextualSurface>
  );
}
