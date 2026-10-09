import { describe, expect, it } from 'vitest';
import {
  sanitizeDeclarations,
  sanitizeInlineStyle,
  sanitizePublisherCss,
  scopeSelector,
} from '../epubPublisherCss';

/** A trimmed real-world Denden Amigo / 電書協 style sheet. */
const DENDEN = `
@charset "UTF-8";
@import url("https://evil.example/x.css");
/* vertical book */
html.vrtl, body.vrtl { -epub-writing-mode: vertical-rl; writing-mode: vertical-rl; margin: 0; }
.vrtl .tcy, .tcy { -epub-text-combine: horizontal; -webkit-text-combine: horizontal; text-combine-upright: all; }
.upright { -epub-text-orientation: upright; }
.em-sesame { -epub-text-emphasis-style: filled sesame; -webkit-text-emphasis-style: filled sesame; }
.gfont { font-family: "MS Gothic", sans-serif; }
.align-end { text-align: right; }
p.indent { text-indent: 1em !important; color: #000; background: url(img/bg.png); }
.fit { width: 100%; height: auto; position: fixed; }
@font-face { font-family: X; src: url(fonts/x.otf); }
@media amzn-kf8 { .tcy { display: none; } }
@media screen { .k-indent-2 { text-indent: 2em; } }
img.pagefit::after { content: "x"; }
`;

describe('sanitizePublisherCss', () => {
  const css = sanitizePublisherCss(DENDEN, { rootClasses: ['vrtl'] });

  it('keeps 縦中横, upright text, 傍点, gothic emphasis and alignment, scoped to the reader', () => {
    expect(css).toContain('.epub-pub .tcy { text-combine-upright: all; }');
    expect(css).toContain('.epub-pub .upright { text-orientation: upright; }');
    expect(css).toContain('.epub-pub .em-sesame { text-emphasis-style: filled sesame; }');
    expect(css).toContain('.epub-pub .gfont { font-family: sans-serif; }');
    expect(css).toContain('.epub-pub .align-end { text-align: right; }');
    expect(css).toContain('.epub-pub p.indent { text-indent: 1em; }');
    expect(css).toContain('.epub-pub .fit { width: 100%; height: auto; }');
    expect(css).toContain('@media screen {\n.epub-pub .k-indent-2 { text-indent: 2em; }\n}');
  });

  it('drops the root rule, external loads, colours, positioning, fonts and generated content', () => {
    expect(css).not.toMatch(/vertical-rl/);
    expect(css).not.toMatch(/url|@import|@font-face|evil|#000|color|position|content|!important/);
    expect(css).not.toMatch(/amzn/);
    // `.vrtl .tcy` lost its root class, leaving one scoped `.tcy` selector (deduplicated by CSS itself).
    expect(css).not.toMatch(/\.vrtl/);
  });

  it('never emits a selector outside the scope', () => {
    for (const line of css.split('\n')) {
      if (!line.includes('{') || line.startsWith('@media')) continue;
      for (const selector of line.slice(0, line.indexOf('{')).split(',')) {
        expect(selector.trim().startsWith('.epub-pub ')).toBe(true);
      }
    }
  });

  it('survives unbalanced and hostile input without throwing', () => {
    expect(() => sanitizePublisherCss('p { color: red; .x { ')).not.toThrow();
    expect(sanitizePublisherCss('</style><script>alert(1)</script> p { text-align: center }')).toBe('');
    expect(sanitizePublisherCss('p{text-align:center}')).toBe('.epub-pub p { text-align: center; }');
    expect(sanitizePublisherCss('; ; p { text-align: center }')).toBe('.epub-pub p { text-align: center; }');
  });
});

describe('scopeSelector', () => {
  const roots = new Set(['vrtl', 'p-text']);
  it.each([
    ['html', null],
    ['body.p-text', null],
    ['.vrtl', null],
    ['body > p', '.epub-pub p'],
    [':root .x', '.epub-pub .x'],
    ['.vrtl div.main > p', '.epub-pub div.main > p'],
    ['ruby rt', '.epub-pub ruby rt'],
    ['p:nth-child(2n+1)', '.epub-pub p:nth-child(2n+1)'],
    ['a[href^="http"]', '.epub-pub a[href^="http"]'],
    ['p::before', null],
    ['p\\:x', null],
    ['p{', null],
  ])('%s -> %s', (selector, scoped) => {
    expect(scopeSelector(selector, '.epub-pub', roots)).toBe(scoped);
  });
});

describe('declarations', () => {
  it('maps the -epub- and -webkit- names to the standard ones, last one winning', () => {
    expect(sanitizeDeclarations('-epub-writing-mode: tb-rl; -webkit-text-combine: digits 2')).toEqual([
      'writing-mode: vertical-rl',
      'text-combine-upright: all',
    ]);
    expect(sanitizeDeclarations('-epub-ruby-position: under; ruby-position: over')).toEqual(['ruby-position: over']);
  });

  it('refuses absolute font sizes, escapes and expressions', () => {
    expect(sanitizeDeclarations('font-size: 40px; font-size: 1.2em')).toEqual(['font-size: 1.2em']);
    expect(sanitizeDeclarations('width: expression(alert(1)); margin: 0 \\61 uto')).toEqual([]);
  });

  it('cleans an inline style attribute', () => {
    expect(sanitizeInlineStyle('text-align:center; color:red; background-image:url(x.png)')).toBe('text-align: center');
    expect(sanitizeInlineStyle('position:fixed')).toBe('');
  });
});
