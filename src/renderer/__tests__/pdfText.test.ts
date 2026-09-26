// @vitest-environment node
/**
 * A PDF's text layer, made readable and lookup-able (round-4 journeys audit).
 *
 * Measured on the packaged app with a Japanese PDF printed by Edge: the reader
 * showed 台所で魚の匂い, but the text it held was 台所で⿂の匂い — U+2FC2 KANGXI
 * RADICAL FISH, which the font maps the glyph to — so clicking 魚 looked up a
 * radical and the dictionary found nothing. And the paragraph rebuild joined
 * wrapped lines without a space in every script, gluing Russian (and English)
 * words together across line breaks.
 */
import { describe, expect, it } from 'vitest';
import { cleanPdfText, linesToParagraphs } from '../pdfText';

describe('cleanPdfText', () => {
  it('folds Kangxi radicals to the ideograph the page shows', () => {
    expect(cleanPdfText('台所で⿂の匂い')).toBe('台所で魚の匂い');
    expect(cleanPdfText('⽇⽉')).toBe('日月');
  });

  it('folds CJK compatibility ideographs, but leaves full-width punctuation and digits alone', () => {
    expect(cleanPdfText('豈')).toBe('豈');
    expect(cleanPdfText('（１２３）、「本」。')).toBe('（１２３）、「本」。');
    expect(cleanPdfText('ｶﾀｶﾅ')).toBe('ｶﾀｶﾅ');
  });
});

describe('linesToParagraphs', () => {
  it('joins Japanese and Chinese lines without a space', () => {
    expect(linesToParagraphs(['朝、ねこは窓の', 'そばで眠りました。'])).toEqual(['朝、ねこは窓のそばで眠りました。']);
    expect(linesToParagraphs(['早上，小猫在窗', '边晒太阳。'])).toEqual(['早上，小猫在窗边晒太阳。']);
  });

  it('joins Russian and English lines with the space the break stood for', () => {
    expect(linesToParagraphs(['Утром кошка грелась', 'на солнце у окна.'])).toEqual(['Утром кошка грелась на солнце у окна.']);
    expect(linesToParagraphs(['The cat slept', 'by the window.'])).toEqual(['The cat slept by the window.']);
  });

  it('rejoins a word hyphenated across the break', () => {
    expect(linesToParagraphs(['Кошка смотрела в ок-', 'но весь день.'])).toEqual(['Кошка смотрела в окно весь день.']);
  });

  it('still starts a new paragraph after sentence-ending punctuation', () => {
    expect(linesToParagraphs(['一文目。', '二文目。'])).toEqual(['一文目。', '二文目。']);
    expect(linesToParagraphs(['«Да», — сказала она.', 'Потом ушла.'])).toEqual(['«Да», — сказала она.', 'Потом ушла.']);
  });
});
