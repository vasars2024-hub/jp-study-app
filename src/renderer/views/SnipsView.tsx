import SnipPanel from '../components/snip/SnipPanel';

/**
 * The Snips app (desktop section `snips`): Snip to cards' analysis and history.
 *
 * A snip taken with Win+Shift+S anywhere on screen lands here as it is read —
 * the picture, the text with furigana, the translation, the word-by-word
 * breakdown and the cards it made. Lazy-loaded like every app, so a session
 * that never opens it pays nothing for it.
 */
export default function SnipsView() {
  return <SnipPanel />;
}
