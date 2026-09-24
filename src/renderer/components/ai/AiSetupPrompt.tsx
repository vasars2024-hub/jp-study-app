import { useT } from '../../i18n';
import { openAiSettings } from '../../aiSetupClient';
import './aiSetup.css';

/**
 * The one "Set up AI" affordance every AI surface shows while it cannot run.
 *
 * Before this, a surface that could not run pointed somewhere different each
 * time — "Flashcards → AI Card Studio", "the Translate view", "Downloads" —
 * and two of those places had no control for it at all. Now there is one
 * destination, Settings > AI, and one button that opens it from any window.
 *
 * `reasonKey` is an optional one-line i18n key saying what is missing; without
 * it the generic line is used. Renders nothing while AI is switched off — a
 * surface should not even get this far then, but a stray mount must not show a
 * setup prompt for a feature the user turned off.
 */
export function AiSetupPrompt({
  reasonKey,
  compact = false,
  settingId,
  actionKey = 'settings.ai.setup.action',
  offerBoth = false,
}: {
  reasonKey?: string;
  compact?: boolean;
  settingId?: string;
  /** The button's label; "Set up AI" unless the surface is only pointing the way. */
  actionKey?: string;
  /**
   * Nothing is set up yet: offer both ways in, each opening its own row of
   * Settings > AI, instead of one button that leaves the choice unexplained.
   */
  offerBoth?: boolean;
}) {
  const { t } = useT();
  return (
    <div className={`ai-setup-prompt${compact ? ' is-compact' : ''}`} role="note">
      <span className="ai-setup-prompt-text">{t(reasonKey ?? 'settings.ai.setup.notReady')}</span>
      {offerBoth ? (
        <>
          <button type="button" className="btn small ai-setup-prompt-action" onClick={() => openAiSettings('ai-model')}>
            {t('settings.ai.setup.installModel')}
          </button>
          <button type="button" className="btn small ai-setup-prompt-action" onClick={() => openAiSettings('ai-provider')}>
            {t('settings.ai.setup.addKey')}
          </button>
        </>
      ) : (
        <button type="button" className="btn small ai-setup-prompt-action" onClick={() => openAiSettings(settingId)}>
          {t(actionKey)}
        </button>
      )}
    </div>
  );
}

export default AiSetupPrompt;
