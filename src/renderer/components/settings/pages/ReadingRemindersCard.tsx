/**
 * Reading Lists §11.3 — where the four reminder kinds are switched on.
 *
 * They are all off by default, deliberately: §11.3 says a feature that nags
 * before it has been used once gets turned off and never turned back on. That
 * makes this card the only route into the feature, so it is not optional polish
 * — without it the scheduler is correct, silent and unreachable.
 *
 * The settings live in MAIN, beside the lists, not in `SettingsContext`. Two
 * reasons, both §11.3's: the scheduler has to read them with no renderer alive,
 * and "never again" pressed on a notification writes the same `silenced` list
 * this card reads — so the two can never disagree about whether a kind is off.
 *
 * A silenced kind is shown as silenced rather than hidden. A user who dismissed
 * something forever from a toast at 2am must be able to find it again, or
 * "forever" is a trap instead of a choice.
 */
import { Fragment, useCallback, useEffect, useState } from 'react';
import SettingsCard from '../SettingsCard';
import { Button, Select, Toggle } from '../../ui';
import { useSettings } from '../SettingsContext';
import { useT } from '../../../i18n';
import {
  READING_REMINDER_KINDS,
  type ReadingReminderKind,
  type ReadingReminderSettings,
} from '../../../../shared/readingListReminders';

const LABEL: Record<ReadingReminderKind, string> = {
  'new-binding': 'settings.readingReminders.newBinding',
  'stalled-book': 'settings.readingReminders.stalled',
  'challenge-pace': 'settings.readingReminders.pace',
  'daily-read': 'settings.readingReminders.daily',
};

const DESC: Record<ReadingReminderKind, string> = {
  'new-binding': 'settings.readingReminders.newBinding.desc',
  'stalled-book': 'settings.readingReminders.stalled.desc',
  'challenge-pace': 'settings.readingReminders.pace.desc',
  'daily-read': 'settings.readingReminders.daily.desc',
};

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

export default function ReadingRemindersCard() {
  const { t } = useT();
  const { focusSettingId } = useSettings();
  const [settings, setSettings] = useState<ReadingReminderSettings | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    let live = true;
    // Guarded: a build whose main process predates this handler must say so,
    // not render four switches that silently persist nothing.
    const read = window.api?.readingRemindersGet?.();
    if (!read) {
      setUnavailable(true);
      return;
    }
    void read
      .then((value) => {
        if (live) setSettings(value);
      })
      .catch(() => {
        if (live) setUnavailable(true);
      });
    return () => {
      live = false;
    };
  }, []);

  const patch = useCallback(async (next: Partial<ReadingReminderSettings>) => {
    const applied = await window.api?.readingRemindersSet?.(next);
    // Main returns the normalized result, so the card shows what was actually
    // stored rather than what it hoped would be.
    if (applied) setSettings(applied);
  }, []);

  return (
    <SettingsCard
      id="reading-reminders"
      title={t('settings.readingReminders.title')}
      description={t('settings.readingReminders.desc')}
      highlight={focusSettingId === 'reading-reminders'}
    >
      {unavailable ? (
        <p className="muted">{t('settings.readingReminders.unavailable')}</p>
      ) : !settings ? (
        <p className="muted">{t('settings.readingReminders.loading')}</p>
      ) : (
        <div>
          {READING_REMINDER_KINDS.map((kind) => {
            const silenced = settings.silenced.includes(kind);
            return (
              // A fragment, not a wrapper: `.os-viz-row` is a horizontal flex
              // row, so a hint nested inside it lands beside the switch instead
              // of under it, and the row wraps at a width nobody chose.
              <Fragment key={kind}>
                <div className="os-viz-row">
                  <Toggle
                    label={t(LABEL[kind])}
                    checked={settings.enabled[kind] && !silenced}
                    onChange={(event) =>
                      void patch({
                        enabled: { ...settings.enabled, [kind]: event.target.checked },
                        // Turning a kind on here undoes a "never again": the user
                        // is asking for it by name, and leaving it silenced would
                        // be a switch that turns on and changes nothing.
                        silenced: event.target.checked
                          ? settings.silenced.filter((entry) => entry !== kind)
                          : settings.silenced,
                      })
                    }
                  />
                </div>
                <p className="muted os-set-hint">{t(DESC[kind])}</p>
                {silenced ? (
                  <p className="muted os-set-hint">{t('settings.readingReminders.silenced')}</p>
                ) : null}
              </Fragment>
            );
          })}

          <label className="os-viz-row">
            <span className="os-viz-label muted">{t('settings.readingReminders.hour')}</span>
            <Select
              value={String(settings.dailyHour)}
              onChange={(event) => void patch({ dailyHour: Number(event.target.value) })}
            >
              {HOURS.map((hour) => (
                <option key={hour} value={hour}>
                  {`${String(hour).padStart(2, '0')}:00`}
                </option>
              ))}
            </Select>
          </label>

          <label className="os-viz-row">
            <span className="os-viz-label muted">{t('settings.readingReminders.stalledDays')}</span>
            <Select
              value={String(settings.stalledAfterDays)}
              onChange={(event) => void patch({ stalledAfterDays: Number(event.target.value) })}
            >
              {[7, 14, 30, 60, 90].map((days) => (
                <option key={days} value={days}>
                  {String(days)}
                </option>
              ))}
            </Select>
          </label>

          {settings.silenced.length > 0 ? (
            <Button
              variant="ghost"
              onClick={() => void patch({ silenced: [] })}
            >
              {t('settings.readingReminders.unsilenceAll')}
            </Button>
          ) : null}

          {/* Stated, because it is the rule most likely to read as a bug: a
              user who switches all four on still sees at most one a day. */}
          <p className="muted os-set-hint">{t('settings.readingReminders.cap')}</p>
        </div>
      )}
    </SettingsCard>
  );
}
