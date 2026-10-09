/**
 * music2 — one lyric line, coloured by how well each word is known.
 *
 * The subtitle line's own renderer (`SubtitleCueLine`), so a word that is new
 * in an episode is new in a song by the same rule. Lazy-loaded by the lyrics
 * pane: it brings the tokenizer, which no shell boot graph should carry.
 * Lookup still works the pane's way — a mouse-up anywhere on the text — so this
 * adds no handlers of its own.
 */
import SubtitleCueLine from '../SubtitleCueLine';
import './musicStudy.css';

export default function MusicLyricText({
  text,
  knownHighlight,
  readingAid,
}: {
  text: string;
  knownHighlight: boolean;
  readingAid: boolean;
}) {
  return (
    <SubtitleCueLine
      text={text}
      furigana={readingAid}
      knownHighlight={knownHighlight}
      className="music-line-text music-line-tokens"
    />
  );
}
