/**
 * Settings > Help — the keyboard shortcuts, as currently bound.
 *
 * Help's own description ("Guided tour and keyboard shortcuts") promised a list
 * that was not on the page. This is it: every command that has a key, grouped by
 * the Shortcuts page's categories, read LIVE from `getBindings()` so a rebind
 * shows here at once, with one click through to change them.
 *
 * The video player's own keys follow in a separate "Player" group (round-2
 * K12). The player handles those itself — they are not app commands and are
 * rebound in the player's Preferences, not on the Shortcuts page — so they
 * are read from `playerKeymap`, and the group says where they apply.
 */
import { useEffect, useMemo, useState } from 'react';
import SettingsCard from '../SettingsCard';
import { useT } from '../../../i18n';
import { commandCategory, commandLabel } from '../../../commandI18n';
import { formatKeysDisplay, getBindings, onShortcutsChanged, type BindingRow } from '../../../keyboardShortcuts';
import { PLAYER_KEYBINDINGS_STORAGE_KEY, readPlayerKeymap, type PlayerKeyRow } from '../../../playerKeymap';
import './helpShortcuts.css';

export default function HelpShortcutsCard() {
  const { t, lang } = useT();
  const [rows, setRows] = useState<BindingRow[]>(() => safeBindings());
  useEffect(() => onShortcutsChanged(() => setRows(safeBindings())), []);
  const [playerKeys, setPlayerKeys] = useState<PlayerKeyRow[]>(readPlayerKeymap);
  // A rebind in the player's Preferences in another window arrives as `storage`.
  useEffect(() => {
    const onStorage = (event: StorageEvent): void => {
      if (event.key === PLAYER_KEYBINDINGS_STORAGE_KEY) setPlayerKeys(readPlayerKeymap());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const groups = useMemo(() => {
    const out = new Map<string, { label: string; items: { id: string; label: string; keys: string }[] }>();
    for (const row of rows) {
      if (!row.keys) continue;
      const group = out.get(row.category) ?? { label: commandCategory(row.category, t), items: [] };
      group.items.push({
        id: row.id,
        label: row.custom ? row.label : commandLabel(row.id, row.label, t),
        keys: formatKeysDisplay(row.keys),
      });
      out.set(row.category, group);
    }
    return [...out.values()];
    // `lang`, not `t`: the labels must follow a language switch (CLAUDE.md i18n rule 6).
  }, [rows, lang]);

  return (
    <SettingsCard id="help-shortcuts" title={t('help.shortcuts.title')} description={t('help.shortcuts.desc')}>
      {groups.length === 0 ? (
        <p className="muted">{t('help.shortcuts.none')}</p>
      ) : (
        groups.map((group) => (
          <section key={group.label} className="help-shortcuts-group">
            <h3 className="help-shortcuts-heading">{group.label}</h3>
            <dl className="help-shortcuts-list">
              {group.items.map((item) => (
                <div key={item.id} className="help-shortcuts-row">
                  <dt>{item.label}</dt>
                  <dd>
                    <kbd>{item.keys}</kbd>
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))
      )}
      <section className="help-shortcuts-group" data-group="player">
        <h3 className="help-shortcuts-heading">{t('helpKeys.player.group')}</h3>
        <p className="muted help-shortcuts-note">{t('helpKeys.player.note')}</p>
        <dl className="help-shortcuts-list">
          {playerKeys.map((row) => (
            <div key={row.action} className="help-shortcuts-row" data-player-action={row.action}>
              <dt>{t(row.labelKey, row.params)}</dt>
              <dd>
                <kbd>{row.keys}</kbd>
              </dd>
            </div>
          ))}
        </dl>
      </section>
      <div className="fm-actions">
        <button
          type="button"
          className="btn"
          onClick={() =>
            window.dispatchEvent(new CustomEvent('settings:navigate', { detail: { page: 'shortcuts' } }))
          }
        >
          {t('help.shortcuts.edit')}
        </button>
      </div>
    </SettingsCard>
  );
}

function safeBindings(): BindingRow[] {
  try {
    return getBindings();
  } catch {
    return [];
  }
}
