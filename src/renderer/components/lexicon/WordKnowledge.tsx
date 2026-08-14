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

interface Props {
  /** The dictionary headword this level is stored against. */
  word: string;
  level: WkLevel;
  onCycle: (word: string) => void;
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
export default function WordKnowledge({ word, level, onCycle }: Props) {
  const { t } = useT();
  const label = t(KNOWLEDGE_LEVEL_KEYS[level]);
  const next = t(KNOWLEDGE_LEVEL_KEYS[(((level as number) + 1) % KNOWLEDGE_LEVEL_KEYS.length) as WkLevel]);
  // The word is named in the accessible name: in a list of eight rows the
  // control's position is the only other thing that says which word it grades.
  const description = t('lexicon.knowledge.action', { word, level: label, next });

  return (
    <button
      type="button"
      className={`lexicon-knowledge wk-g-${level}${level > 0 ? ' active' : ''}`}
      title={description}
      aria-label={description}
      onClick={() => onCycle(word)}
    >
      {label}
    </button>
  );
}
