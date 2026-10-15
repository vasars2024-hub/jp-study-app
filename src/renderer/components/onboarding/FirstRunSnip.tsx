/**
 * First-run setup, finish step: Snip to cards, offered with one click.
 *
 * Watching the clipboard is off by default since v1 (the owner's decision), so
 * this is where a new learner hears about it: one sentence on what it does, the
 * privacy note, and a switch. The switch writes main's setting directly
 * (`snip:setSettings`), the same one Settings → Reading Lens, the tray and the
 * Snips view change, so it is never a second copy of the choice. Turning it on
 * here still leaves main's one-time notice for the first snip that makes cards,
 * and offers the accurate reader (`SnipReaderSetup`): a fresh profile reads
 * snips with the bundled offline recognizer until the learner sets it up.
 */
import { useEffect, useId, useState } from 'react';
import { useT } from '../../i18n';
import { Toggle } from '../ui/Toggle';
import { useSnipStatus } from '../snip/SnipSettingsForm';
import { SnipReaderSetup } from '../snip/SnipReaderSetup';

export default function FirstRunSnip() {
  const { t } = useT();
  const hintId = useId();
  // null until main answers: the switch is not drawn "off" before it knows.
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [failed, setFailed] = useState(false);
  // Which readers are installed: turned on, the learner is offered the accurate one.
  const [status] = useSnipStatus();

  useEffect(() => {
    let alive = true;
    Promise.resolve(window.api?.snipGetStatus?.())
      .then((s) => {
        if (alive) setEnabled(s ? s.enabled === true : false);
      })
      .catch(() => {
        if (alive) setEnabled(false);
      });
    const off = window.api?.onSnipSettingsChanged?.((s) => {
      if (alive && s && typeof s === 'object') setEnabled((s as { enabled?: unknown }).enabled === true);
    });
    return () => {
      alive = false;
      if (typeof off === 'function') off();
    };
  }, []);

  const change = async (next: boolean): Promise<void> => {
    setFailed(false);
    setEnabled(next);
    try {
      const s = await window.api.snipSetSettings({ enabled: next });
      setEnabled(s?.enabled === true);
    } catch {
      setEnabled(!next);
      setFailed(true);
    }
  };

  return (
    <section className="frs-optin" data-first-run-optin="snip" aria-labelledby={`${hintId}-t`}>
      <p className="frs-legend" id={`${hintId}-t`}>{t('onb4.snip.title')}</p>
      <p className="frs-note frs-optin-what" id={hintId}>{t('onb4.snip.what')}</p>
      <p className="frs-note frs-optin-privacy">{t('onb4.snip.privacy')}</p>
      <Toggle
        className="os-toggle os-toggle-compact frs-optin-toggle"
        checked={enabled === true}
        disabled={enabled === null}
        aria-describedby={hintId}
        onChange={(e) => void change(e.target.checked)}
        label={t('onb4.snip.enable')}
      />
      {enabled === true && <p className="frs-note frs-note--ok" role="status">{t('onb4.snip.on')}</p>}
      {enabled === true && <SnipReaderSetup readers={status.readers} studyLang={status.studyLang} compact />}
      {failed && <p className="frs-note frs-note--error" role="alert">{t('onb4.snip.failed')}</p>}
    </section>
  );
}
