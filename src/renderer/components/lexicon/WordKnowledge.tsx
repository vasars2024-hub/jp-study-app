import { useT } from '../../i18n';
import type { WkLevel } from '../../knownWords';
import './wordKnowledge.css';

/**
 * One key per level, in `WkLevel` order. `wordKnowledgeOverlay.test.tsx` asserts
 * this stays the same length as `WK_LEVELS`, because a fifth level added there
 * and not here would render `undefined` as a label rather than fail.
 */
export const KNOWLEDGE_LEVEL_KEYS = [
  'lexicon.knowledge.new',
  'lexicon.knowledge.learning',
  'lexicon.knowledge.familiar',
  'lexicon.knowledge.known',
] as const;

/**
 * The one-letter face of each level on the grading buttons (popup, Lens reader).
 * Its own key rather than the label's first letter: that letter was English
 * (N/L/F/K) in every language, and two Russian labels start with the same one.
 */
export const KNOWLEDGE_LEVEL_SHORT_KEYS = [
  'lexicon.knowledge.short.new',
  'lexicon.knowledge.short.learning',
  'lexicon.knowledge.short.familiar',
  'lexicon.knowledge.short.known',
] as const;

interface Props {
  /** The dictionary headword this level is stored against. */
  word: string;
  level: WkLevel;
  onCycle: (word: string) => void;
  /**
   * A compound graded as its parts (`knowledgeTargets`): each part's own level.
   * `level` is then their combined state, and the control says so.
   */
  parts?: ReadonlyArray<{ key: string; level: WkLevel }>;
}

/**
 * What the reader already knows about a headword, shown on the result itself.
 *
 * Grading has so far existed only in the dictionary popup and the Lens reader,
 * both of which grade the one token the reader clicked. A results list shows
 * several headwords at once, so the level belongs to each row rather than to
 * the surface — and the row's own word is already the dictionary form the
 * knowledge store is keyed by, so nothing has to be deinflected here.
 *
 * One cycling control rather than four buttons per row: eight results would
 * otherwise put thirty-two controls in a reading surface, and the level scale
 * is short enough that cycling reaches any value. The palette is the popup's
 * `wk-g-*` scale so the same word reads the same in both places.
 */
export default function WordKnowledge({ word, level, onCycle, parts }: Props) {
  const { t } = useT();
  const label = t(KNOWLEDGE_LEVEL_KEYS[level]);
  const next = t(KNOWLEDGE_LEVEL_KEYS[(((level as number) + 1) % KNOWLEDGE_LEVEL_KEYS.length) as WkLevel]);
  const compound = parts && parts.length > 1 ? parts : null;
  // The word is named in the accessible name: in a list of eight rows the
  // control's position is the only other thing that says which word it grades.
  // A compound names each part with its own level: 携帯電話 has no level of its
  // own once its knowledge lives under 携帯 and 電話.
  const description = compound
    ? t('dict4.knowledge.partsAction', {
        word,
        parts: compound.map((part) => `${part.key} ${t(KNOWLEDGE_LEVEL_KEYS[part.level])}`).join(', '),
        next,
      })
    : t('lexicon.knowledge.action', { word, level: label, next });

  return (
    <button
      type="button"
      className={`lexicon-knowledge lq-hit wk-g-${level}${level > 0 ? ' active' : ''}`}
      title={description}
      aria-label={description}
      onClick={() => onCycle(word)}
    >
      {label}
      {compound && (
        <span className="lexicon-knowledge-parts" aria-hidden="true">
          {compound.map((part) => t(KNOWLEDGE_LEVEL_SHORT_KEYS[part.level])).join('')}
        </span>
      )}
    </button>
  );
}
