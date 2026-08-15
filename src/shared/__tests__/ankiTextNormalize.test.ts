// Field text normalisation — Phase 4.
//
// Every test here is a way the naive version of this loses data: cloze markers
// that look like formatting, sound tags that look like furigana, Japanese
// punctuation that looks like full-width ASCII, and `<br>`-separated lines that
// fuse into one word when the markup goes.
import { describe, expect, it } from 'vitest';
import {
  TEXT_NORMALIZE_ORDER,
  normalizeFieldText,
  type TextNormalizeOp,
} from '../ankiTextNormalize';

const all = TEXT_NORMALIZE_ORDER as TextNormalizeOp[];

describe('normalizeFieldText', () => {
  it('changes nothing when no op is chosen', () => {
    expect(normalizeFieldText('<b>ねこ</b>  ', [])).toBe('<b>ねこ</b>  ');
  });

  it('strips tags and decodes entities, and keeps line breaks as spaces', () => {
    // `</div>` and `<br>` each leave a space behind; tidying that up is
    // `collapse-space`'s job, not this op's, so on its own it leaves two.
    expect(normalizeFieldText('<div>one</div><br>two', ['strip-html'])).toBe('one  two');
    expect(normalizeFieldText('<div>one</div><br>two', ['strip-html', 'collapse-space'])).toBe(
      'one two',
    );
    expect(normalizeFieldText('a &amp; b &#12354; c', ['strip-html'])).toBe('a & b あ c');
  });

  it('drops the reading inside ruby rather than fusing it onto the word', () => {
    const ruby = '<ruby>漢<rt>かん</rt>字<rt>じ</rt></ruby>';
    expect(normalizeFieldText(ruby, ['strip-html'])).toBe('漢字');
  });

  it('leaves cloze markers alone — they are card structure, not formatting', () => {
    const cloze = '{{c1::食べる::verb}} を<b>使う</b>';
    expect(normalizeFieldText(cloze, all)).toBe('{{c1::食べる::verb}} を使う');
  });

  it('removes bracket furigana but never a sound tag', () => {
    expect(normalizeFieldText('漢字[かんじ]を読む', ['strip-furigana'])).toBe('漢字を読む');
    // Full-width brackets, the form some importers write.
    expect(normalizeFieldText('漢字［かんじ］', ['strip-furigana'])).toBe('漢字');
    expect(normalizeFieldText('ねこ [sound:cat.mp3]', ['strip-furigana'])).toBe('ねこ [sound:cat.mp3]');
    // Both in one field, with the sound tag first — the position a naive
    // "strip the last bracket span" rule gets wrong.
    expect(normalizeFieldText('[sound:a.mp3] 漢字[かんじ]', ['strip-furigana'])).toBe(
      '[sound:a.mp3] 漢字',
    );
  });

  it('folds full-width ASCII but not Japanese punctuation', () => {
    expect(normalizeFieldText('ＡＢＣ１２３！', ['ascii-width'])).toBe('ABC123!');
    // 、。「」 are not full-width ASCII; folding them would be a translation.
    expect(normalizeFieldText('「ねこ」、いぬ。', ['ascii-width'])).toBe('「ねこ」、いぬ。');
    expect(normalizeFieldText('ねこ　いぬ', ['ascii-width'])).toBe('ねこ いぬ');
  });

  it('collapses every kind of run of whitespace, including a decoded nbsp', () => {
    expect(normalizeFieldText('a&nbsp;&nbsp;b', ['strip-html', 'collapse-space'])).toBe('a b');
    expect(normalizeFieldText('a \t\n b', ['collapse-space'])).toBe('a b');
  });

  it('runs the ops in the canonical order whatever order they were listed', () => {
    const messy = '  <b>ＡＢ</b>&nbsp;&nbsp;漢字[かんじ]　 ';
    const forwards = normalizeFieldText(messy, all);
    const backwards = normalizeFieldText(messy, [...all].reverse());
    expect(forwards).toBe('AB 漢字');
    expect(backwards).toBe(forwards);
  });

  it('is idempotent: normalising an already-normalised field changes nothing', () => {
    const once = normalizeFieldText('  <div>Ａ</div><br>漢字[かんじ]&nbsp;', all);
    expect(normalizeFieldText(once, all)).toBe(once);
  });

  it('drops an image tag, which is how its media reference goes away', () => {
    // Deliberate and reported: the tray runs every write through `writeNoteField`,
    // which raises `media-dropped` for exactly this.
    expect(normalizeFieldText('ねこ<img src="cat.jpg">', ['strip-html'])).toBe('ねこ');
  });
});
