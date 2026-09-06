/**
 * Settings → Help → "Ask about a setting". Aero v1.0 audit item 5.6, the
 * offline-assistant half.
 *
 * The reasoning for search-and-answer over a model lives in
 * `renderer/settingsAssistant.ts`. What this file owns is the honesty: the
 * heading above the results says how the answer was reached, and an empty
 * result says so plainly instead of falling back to a list of popular settings.
 * Every row is a real navigation into the setting it names — the same
 * `onNavigate(pageId, id)` contract `SettingsSearch.pick` uses, so a
 * `movedTo: 'files'` entry still routes through `SettingsApp.navigate` and
 * opens the Files app rather than a page that no longer exists.
 */
import { useState } from 'react';
import SettingsCard from '../SettingsCard';
import { useSettings } from '../SettingsContext';
import { useT } from '../../../i18n';
import { answerSettingsQuestion, type AssistantAnswer } from '../../../settingsAssistant';

const STRATEGY_KEY = {
  phrase: 'help.assistant.foundPhrase',
  keywords: 'help.assistant.foundKeywords',
  widest: 'help.assistant.foundWidest',
  none: 'help.assistant.foundNothing',
} as const;

export default function SettingsAssistantCard() {
  const { t } = useT();
  const { advancedMode, navigate } = useSettings();
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<AssistantAnswer | null>(null);

  const ask = () => {
    if (!question.trim()) return;
    // Advanced-mode visibility is passed through, so the assistant can never
    // offer a setting the user's current view would refuse to render.
    setAnswer(answerSettingsQuestion(question, t, { advanced: advancedMode }));
  };

  return (
    <SettingsCard
      id="help-assistant"
      title={t('help.assistant.title')}
      description={t('help.assistant.desc')}
    >
      <form
        className="field-row"
        onSubmit={(event) => {
          event.preventDefault();
          ask();
        }}
      >
        <label htmlFor="help-assistant-input">{t('help.assistant.label')}</label>
        <input
          id="help-assistant-input"
          type="search"
          value={question}
          placeholder={t('help.assistant.placeholder')}
          onChange={(event) => setQuestion(event.currentTarget.value)}
        />
        <button type="submit" className="btn primary" disabled={!question.trim()}>
          {t('help.assistant.ask')}
        </button>
      </form>

      {answer && (
        <div className="help-assistant-answer">
          <p className="muted" role="status">
            {t(STRATEGY_KEY[answer.strategy], { query: answer.usedQuery })}
          </p>
          {answer.entries.length > 0 && (
            <ul className="help-assistant-hits">
              {answer.entries.map((entry) => (
                <li key={entry.id}>
                  <button
                    type="button"
                    className="btn small"
                    onClick={() =>
                      // The assistant answers from the whole registry, advanced
                      // entries included, so its hits must route guided — an
                      // answer you cannot follow is worse than no answer.
                      navigate(
                        entry.pageId,
                        entry.id.startsWith('page-') ? undefined : entry.id,
                        { guided: true },
                      )
                    }
                  >
                    {t(entry.titleKey)}
                  </button>
                  {entry.descKey ? <span className="muted"> {t(entry.descKey)}</span> : null}
                </li>
              ))}
            </ul>
          )}
          {answer.strategy === 'none' && (
            // Not a dead end: the thing a user should try next is named, rather
            // than left for them to guess.
            <p className="muted">{t('help.assistant.nothingNext')}</p>
          )}
        </div>
      )}
    </SettingsCard>
  );
}
