/**
 * The player's keyboard help: every study key and every player key, as bound right now.
 *
 * asbplayer and Language Reactor both put their keys one press away inside the player;
 * here they were only in Settings › Help, behind the full-screen workspace, so a learner
 * mid-episode had no way to find out that R replays a line or that the delay keys exist.
 *
 * Read LIVE: the study rows from the shortcut store (a rebind shows at once, an unbound
 * row says so — it exists and can be bound), the player rows from `playerKeymap`, which is
 * the adopted player's own map with the user's overrides laid over it.
 *
 * Its own module because it imports the shortcut store, which `StudyBottomBar` must not:
 * the bar is imported by node-env tests for its pure helpers, and the store pulls the music
 * bus at import. The overlay renders this and hands it to the bar's Keys sheet.
 */
import React from 'react';
import { useT } from '../renderer/i18n';
import { commandLabel } from '../renderer/commandI18n';
import {
  formatKeysDisplay,
  getBindings,
  onShortcutsChanged,
  type BindingRow,
} from '../renderer/keyboardShortcuts';
import { PLAYER_KEYBINDINGS_STORAGE_KEY, readPlayerKeymap, type PlayerKeyRow } from '../renderer/playerKeymap';
import { studyKeyHelpRows } from './studyKeyHelp';

function safeBindings(): BindingRow[] {
  try {
    return getBindings();
  } catch {
    return [];
  }
}

function safePlayerKeys(): PlayerKeyRow[] {
  try {
    return readPlayerKeymap();
  } catch {
    return [];
  }
}

export default function StudyKeyboardHelp(): React.ReactElement {
  const { t, lang } = useT();
  const [bindings, setBindings] = React.useState<BindingRow[]>(safeBindings);
  React.useEffect(() => onShortcutsChanged(() => setBindings(safeBindings())), []);
  const [playerKeys, setPlayerKeys] = React.useState<PlayerKeyRow[]>(safePlayerKeys);
  React.useEffect(() => {
    const onStorage = (event: StorageEvent): void => {
      if (event.key === PLAYER_KEYBINDINGS_STORAGE_KEY) setPlayerKeys(safePlayerKeys());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const studyRows = React.useMemo(
    () => studyKeyHelpRows(bindings).map((row) => ({
      id: row.id,
      label: commandLabel(row.id, row.label, t),
      keys: row.keys ? formatKeysDisplay(row.keys) : '',
    })),
    // `lang`, not `t`: the labels follow a language switch (CLAUDE.md i18n rule 6).
    [bindings, lang],
  );

  return (
    <div className="study-keys-help" data-study-keys-help="">
      <p className="study-tool-note">{t('vstudy.keys.note')}</p>
      <section className="study-keys-group" aria-label={t('vstudy.keys.study')}>
        <h3 className="study-keys-heading">{t('vstudy.keys.study')}</h3>
        <dl className="study-keys-list">
          {studyRows.map((row) => (
            <div key={row.id} className="study-keys-row" data-command={row.id}>
              <dt>{row.label}</dt>
              <dd>
                {row.keys
                  ? <kbd>{row.keys}</kbd>
                  : <span className="study-keys-unbound">{t('vstudy.keys.unbound')}</span>}
              </dd>
            </div>
          ))}
        </dl>
      </section>
      <section className="study-keys-group" aria-label={t('helpKeys.player.group')}>
        <h3 className="study-keys-heading">{t('helpKeys.player.group')}</h3>
        <dl className="study-keys-list">
          {playerKeys.map((row) => (
            <div key={row.action} className="study-keys-row" data-player-action={row.action}>
              <dt>{t(row.labelKey, row.params)}</dt>
              <dd><kbd>{row.keys}</kbd></dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
