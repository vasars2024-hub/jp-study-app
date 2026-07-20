import { GX_LEVELS, type GxLevel } from '../../grammarFamiliarity';
import { useT } from '../../i18n';

const BAND_KEYS = ['new', 'learning', 'familiar', 'known'] as const;

/**
 * Manual familiarity setter for a single grammar point.
 *
 * Deliberately the same four-button band picker the vocabulary side uses in
 * `DictionaryPopup` (the `wk-grade` control), reusing its palette classes so the
 * two knowledge scales read identically — one visual language for "how well do I
 * know this", whether it is a word or a pattern. Clicking the active band clears
 * it back to New, matching `setFamiliarity`'s manual-New-deletes rule.
 */
export default function GrammarBandControl({
  level,
  manual,
  onSet,
}: {
  level: GxLevel;
  manual: boolean;
  onSet: (level: GxLevel) => void;
}) {
  const { t } = useT();
  return (
    <div className="wk-grade gram-x-band" role="group" aria-label={t('grammar.familiarity.legend')}>
      {GX_LEVELS.map((_label, i) => {
        const band = i as GxLevel;
        const active = level === band;
        const name = t(`grammar.familiarity.${BAND_KEYS[band]}`);
        return (
          <button
            key={band}
            type="button"
            className={`wk-grade-btn wk-g-${band}${active ? ' active' : ''}`}
            title={manual && active ? `${name} · ${t('grammar.familiarity.manual')}` : name}
            aria-label={name}
            aria-pressed={active}
            onClick={() => onSet(active ? 0 : band)}
          >
            {name.charAt(0)}
          </button>
        );
      })}
    </div>
  );
}
