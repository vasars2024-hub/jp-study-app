import { useEffect, useMemo, useState } from 'react';
import { getTokenizer, tokenizeSync, type JpToken } from '../tokenizer';
import { hasKanji } from '../../shared/furigana';
import { sentencePieces, type SentenceAnnotation } from '../../shared/sentenceAnalysisCore';

interface Props {
  text: string;
  furigana: boolean;
  className?: string;
  style?: React.CSSProperties;
  /**
   * Colour-coded analysis spans over `text`. When present the line is drawn as
   * clickable segments instead of one run.
   *
   * Offsets are indexes into the *analyzed* sentence, so the caller must pass
   * `result.sentence` as `text` — not the raw cue. `normalizeAnalysisText`
   * collapses whitespace and applies NFKC, and painting those offsets onto the
   * un-normalized line would shift every highlight by however much it changed.
   */
  annotations?: readonly SentenceAnnotation[];
  /** Index of the span drawn as selected. */
  selectedAnnotation?: number;
  onSelectAnnotation?: (index: number) => void;
  onMouseDown?: (e: React.MouseEvent) => void;
  onMouseUp?: (e: React.MouseEvent) => void;
}

/** One rendered run: a plain stretch, or an annotated span carrying its index. */
interface CueRun {
  text: string;
  annotation?: SentenceAnnotation;
  index?: number;
}

function katakanaToHiragana(s: string): string {
  return s.replace(/[ァ-ヶ]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0x60),
  );
}

function TokenSpan({ token, furigana }: { token: JpToken; furigana: boolean }) {
  const reading = token.reading ? katakanaToHiragana(token.reading) : '';
  if (furigana && reading && hasKanji(token.surface) && reading !== token.surface) {
    return (
      <ruby className="media-sub-ruby">
        <span className="media-sub-morpheme">{token.surface}</span>
        <rt>{reading}</rt>
      </ruby>
    );
  }
  return <span className="media-sub-morpheme">{token.surface}</span>;
}

/**
 * Tokenized subtitle line: each morpheme is selectable for dictionary lookup;
 * optional furigana via kuromoji readings; optional grammar highlighting, where
 * each analyzed span becomes its own clickable, category-coloured segment.
 */
export default function SubtitleCueLine({
  text,
  furigana,
  className,
  style,
  annotations,
  selectedAnnotation,
  onSelectAnnotation,
  onMouseDown,
  onMouseUp,
}: Props) {
  const runs = useMemo<CueRun[]>(() => {
    if (!annotations || annotations.length === 0) return [{ text }];
    return sentencePieces(text, annotations).map((piece) =>
      (piece.kind === 'annotation'
        ? { text: piece.text, annotation: piece.annotation, index: piece.index }
        : { text: piece.text }));
  }, [text, annotations]);

  // Each run is tokenized on its own rather than tokenizing the line and then
  // splitting: annotation boundaries are word boundaries in practice, and
  // per-run tokenization keeps readings aligned to the text actually rendered
  // without any offset arithmetic to get wrong.
  const [tokenRuns, setTokenRuns] = useState<JpToken[][] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getTokenizer()
      .then(() => {
        if (!cancelled) setTokenRuns(runs.map((run) => tokenizeSync(run.text)));
      })
      .catch(() => {
        if (!cancelled) setTokenRuns(null);
      });
    return () => {
      cancelled = true;
    };
  }, [runs]);

  return (
    <div
      className={className}
      style={style}
      lang="ja"
      data-lookup-block=""
      // Owns its own click lookup — keeps GlobalDictionaryOverlay's plain-click
      // mode from opening a second popup over this line.
      data-dict-owner=""
      onMouseDown={onMouseDown}
      onMouseUp={onMouseUp}
    >
      {runs.map((run, runIndex) => {
        const tokens = tokenRuns?.[runIndex];
        const content = tokens && tokens.length > 0
          ? tokens.map((tok, i) => (
            <TokenSpan key={`${i}-${tok.surface}`} token={tok} furigana={furigana} />
          ))
          : run.text;

        if (!run.annotation || run.index === undefined) {
          return <span key={runIndex}>{content}</span>;
        }
        const index = run.index;
        return (
          <button
            key={runIndex}
            type="button"
            className={`sa-seg sa-cat-${run.annotation.category}${
              index === selectedAnnotation ? ' active' : ''
            }`}
            data-annotation-index={index}
            aria-pressed={index === selectedAnnotation}
            title={run.annotation.meaning}
            // The line's own mouse handlers drive dictionary lookup by
            // selection. A segment click means "explain this span", so it must
            // not also open a popup — hence both phases are stopped, not just
            // the click.
            onMouseDown={(event) => event.stopPropagation()}
            onMouseUp={(event) => event.stopPropagation()}
            onClick={() => onSelectAnnotation?.(index)}
          >
            {content}
          </button>
        );
      })}
    </div>
  );
}
