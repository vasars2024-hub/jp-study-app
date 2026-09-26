import { useEffect, useState } from 'react';
import { useT } from '../../i18n';
import {
  effectiveKeys,
  formatKeysDisplay,
  getGlobalCommandStatuses,
  globalCommandErrorText,
  onGlobalCommandStatus,
  onShortcutsChanged,
} from '../../keyboardShortcuts';
import { revealShortcut } from '../../shortcutReveal';
import { Button, ControlRow } from '../ui';

/**
 * A system-wide chord shown where its feature is configured, with the one way
 * to change it: Settings → Shortcuts. The Lens and popup-dictionary pages had
 * hotkey fields of their own, which could disagree with Shortcuts and could
 * hand one chord to two features; this row only reads.
 */
export default function GlobalChordRow({ commandId, label }: { commandId: string; label: string }) {
  const { t } = useT();
  const [keys, setKeys] = useState(() => effectiveKeys(commandId));
  const [status, setStatus] = useState(() => getGlobalCommandStatuses().find((s) => s.id === commandId));

  useEffect(() => onShortcutsChanged(() => setKeys(effectiveKeys(commandId))), [commandId]);
  useEffect(
    () => onGlobalCommandStatus((list) => setStatus(list.find((s) => s.id === commandId))),
    [commandId],
  );

  const error = status?.error ? globalCommandErrorText(status) : '';
  return (
    <>
      <ControlRow className="global-chord-row" data-global-chord={commandId}>
        <span className="muted">{label}</span>
        <kbd className={`sc-keys${keys ? '' : ' unbound'}`}>
          {formatKeysDisplay(keys) || t('settings.shortcuts.unbound')}
        </kbd>
        <Button size="sm" onClick={() => revealShortcut({ id: commandId })}>
          {t('shortcut.global.changeInShortcuts')}
        </Button>
      </ControlRow>
      {error && <p className="dict-add-err">{error}</p>}
    </>
  );
}
