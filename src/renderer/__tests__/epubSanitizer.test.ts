// @vitest-environment jsdom
/**
 * EPUB chapters are injected into the app's own DOM, so the sanitizer is the
 * inner guard behind CSP. Scorecard: the old block-list left iframe, object,
 * embed, form and SVG `xlink:href` through.
 */
import { describe, expect, it } from 'vitest';
import { isSafeEpubUrl, sanitizeChapterBody } from '../epubLoader';

function clean(html: string, type: DOMParserSupportedType = 'text/html'): Element {
  const doc =
    type === 'text/html'
      ? new DOMParser().parseFromString(`<body>${html}</body>`, type)
      : new DOMParser().parseFromString(
          `<html xmlns="http://www.w3.org/1999/xhtml" xmlns:xlink="http://www.w3.org/1999/xlink"><body>${html}</body></html>`,
          type,
        );
  const body = doc.querySelector('body')!;
  sanitizeChapterBody(body);
  return body;
}

describe('sanitizeChapterBody', () => {
  it('drops embedded browsing contexts, plugins and form controls with their content', () => {
    const body = clean(
      '<p>本文</p><iframe src="https://evil.test"></iframe><object data="x.swf"><p>fallback</p></object>' +
        '<embed src="x.swf"><frameset><frame src="a.html"></frameset><form action="https://evil.test"><input name="q"><button>送信</button><select><option>a</option></select><textarea>t</textarea></form>',
    );
    expect(body.querySelector('iframe, object, embed, frame, frameset, form, input, button, select, textarea, option')).toBeNull();
    expect(body.textContent).toBe('本文');
  });

  it('still drops scripts, styles, links and inline handlers, and keeps the text', () => {
    const body = clean('<p onclick="alert(1)" id="p1">猫<script>alert(1)</script></p><style>p{}</style><link rel="stylesheet" href="x.css">');
    expect(body.innerHTML).toBe('<p id="p1">猫</p>');
  });

  it('removes javascript: in xlink:href, href and src — including obfuscated schemes', () => {
    const body = clean(
      '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">' +
        '<a xlink:href="javascript:alert(1)"><text>x</text></a><a href=" JaVa&#9;Script:alert(1)"><text>y</text></a>' +
        '<image xlink:href="images/p1.png"/></svg>' +
        '<a href="vbscript:msgbox(1)">v</a><img src="data:text/html,%3Cscript%3Ealert(1)%3C/script%3E"/><a href="ch02.xhtml#s1">next</a>',
      'application/xhtml+xml',
    );
    const anchors = Array.from(body.querySelectorAll('a'));
    for (const a of anchors) {
      const href = a.getAttribute('href') ?? a.getAttributeNS('http://www.w3.org/1999/xlink', 'href') ?? '';
      expect(isSafeEpubUrl(href)).toBe(true);
    }
    expect(body.querySelector('img')?.hasAttribute('src')).toBe(false);
    // Book-internal references survive.
    expect(body.querySelector('image')?.getAttributeNS('http://www.w3.org/1999/xlink', 'href')).toBe('images/p1.png');
    expect(anchors.find((a) => a.textContent === 'next')?.getAttribute('href')).toBe('ch02.xhtml#s1');
  });

  it('drops SVG animation that could rewrite an attribute after sanitising', () => {
    const body = clean(
      '<svg xmlns="http://www.w3.org/2000/svg"><a><set attributeName="href" to="javascript:alert(1)"/><animate attributeName="href" values="javascript:alert(1)"/><text>t</text></a></svg>',
      'application/xhtml+xml',
    );
    expect(body.querySelector('set, animate')).toBeNull();
    expect(body.textContent).toBe('t');
  });

  it('strips srcdoc/srcset/formaction-style attributes', () => {
    const body = clean('<img src="a.png" srcset="https://evil.test/a.png 2x"><div ping="https://evil.test" background="https://evil.test/x.png">x</div>');
    const img = body.querySelector('img')!;
    expect(img.getAttribute('src')).toBe('a.png');
    expect(img.hasAttribute('srcset')).toBe(false);
    expect(body.querySelector('div')!.attributes.length).toBe(0);
  });
});

describe('isSafeEpubUrl', () => {
  it('allows relative, fragment, blob, data:image and web links only', () => {
    for (const ok of ['', 'ch01.xhtml', '../img/a.png', '#note1', 'blob:app://x/1', 'data:image/png;base64,AA', 'https://example.com', 'mailto:a@b.c', '//cdn.example.com/a.png']) {
      expect(isSafeEpubUrl(ok)).toBe(true);
    }
    for (const bad of ['javascript:alert(1)', ' JAVASCRIPT:alert(1)', 'java\tscript:alert(1)', 'vbscript:x', 'data:text/html,<b>', 'file:///C:/x', 'app://x']) {
      expect(isSafeEpubUrl(bad)).toBe(false);
    }
  });
});
