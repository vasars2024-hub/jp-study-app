import { useEffect, useState } from 'react';
import { getTokenizer, tokenizeSync, type JpToken } from '../tokenizer';
import { hasKanji } from '../../shared/furigana';

interface Props {
  text: string;
  furigana: boolean;
  className?: string;
  style?: React.CSSProperties;
  onMouseDown?: (e: React.MouseEvent) => void;
  onMouseUp?: (e: React.MouseEvent) => void;
}

function katakanaToHiragana(s: string): string {
  return s.replace(/[\u30a1-\u30f6]/g, (ch) =>
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
 * optional furigana via kuromoji readings.
 */
export default function SubtitleCueLine({
  text,
  furigana,
  className,
  style,
  onMouseDown,
  onMouseUp,
}: Props) {
  const [tokens, setTokens] = useState<JpToken[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getTokenizer()
      .then(() => {
        if (!cancelled) setTokens(tokenizeSync(text));
      })
      .catch(() => {
        if (!cancelled) setTokens(null);
      });
    return () => {
      cancelled = true;
    };
  }, [text]);

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
      {tokens && tokens.length > 0
        ? tokens.map((tok, i) => <TokenSpan key={`${i}-${tok.surface}`} token={tok} furigana={furigana} />)
        : text}
    </div>
  );
}
