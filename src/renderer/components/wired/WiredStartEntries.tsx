/**
 * The Wired NODE menu's doors into the study consoles. Rendered inside the
 * Start panel's PORTS list, Wired only; each entry hides when its console is
 * switched off in Settings > Special.
 */
import { useEffect, useState } from 'react';
import { useT } from '../../i18n';
import Icon from '../Icons';
import { openWiredConsole } from '../../wiredMechanics/consoleBus';
import { loadWiredMechanicsSettings, onWiredMechanicsSettingsChanged } from '../../wiredMechanics/settings';

export default function WiredStartEntries({ onPick }: { onPick: () => void }) {
  const { t } = useT();
  const [settings, setSettings] = useState(loadWiredMechanicsSettings);
  useEffect(() => onWiredMechanicsSettingsChanged(setSettings), []);
  return (
    <>
      {settings.signalDecrypt && (
        <button
          type="button"
          className="os-start-aero-tool wired-start-mech"
          onClick={() => {
            onPick();
            openWiredConsole('decrypt');
          }}
        >
          <Icon name="scan" size={17} />
          <span>{t('wiredMech.start.decrypt')}</span>
        </button>
      )}
      {settings.naviTerminal && (
        <button
          type="button"
          className="os-start-aero-tool wired-start-mech"
          onClick={() => {
            onPick();
            openWiredConsole('tty');
          }}
        >
          <Icon name="command" size={17} />
          <span>{t('wiredMech.start.tty')}</span>
        </button>
      )}
    </>
  );
}
