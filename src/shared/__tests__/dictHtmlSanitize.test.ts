// @vitest-environment jsdom
//
// The dictionary pop-ups (reader, Dictionary view, the browser extension's hover
// pop-up) insert glossary HTML with innerHTML, and that HTML comes from
// dictionary files the user imported. These tests pin the allowlist: string
// checks for the exact output, and a DOM parse of the output for the property
// that matters — no element or attribute that can run script survives.

import { describe, expect, it } from 'vitest';
import {
  DICT_HTML_MAX_OUTPUT,
  decodeBasicEntities,
  escapeHtmlText,
  sanitizeDictHtml,
  sanitizeDictStyle,
  stripDictHtml,
} from '../dictHtmlSanitize';

const ALLOWED = new Set([
  'b', 'i', 'em', 'strong', 'u', 's', 'sub', 'sup', 'small', 'span', 'div', 'p', 'br',
  'ul', 'ol', 'li', 'ruby', 'rt', 'rp', 'rb', 'table', 'thead', 'tbody', 'tr', 'td', 'th',
  'details', 'summary', 'hr',
]);
const ALLOWED_ATTRS = new Set(['class', 'lang', 'title', 'colspan', 'rowspan', 'style']);

/** Parse sanitized output the way a pop-up would and assert nothing live survived. */
function assertInert(html: string): HTMLElement {
  const host = document.createElement('div');
  host.innerHTML = html;
  for (const el of Array.from(host.querySelectorAll('*'))) {
    expect(ALLOWED.has(el.tagName.toLowerCase()), `unexpected <${el.tagName}>`).toBe(true);
    for (const attr of Array.from(el.attributes)) {
      expect(ALLOWED_ATTRS.has(attr.name), `unexpected attribute ${attr.name}`).toBe(true);
    }
    const style = el.getAttribute('style') ?? '';
    expect(style).not.toMatch(/url\(|expression|javascript:/i);
  }
  return host;
}

function clean(html: string): string {
  const out = sanitizeDictHtml(html);
  assertInert(out);
  return out;
}

describe('sanitizeDictHtml: hostile input', () => {
  it('drops <img onerror>', () => {
    expect(clean('<img src=x onerror=alert(1)>ok')).toBe('ok');
  });

  it('drops <a href="javascript:"> but keeps its text', () => {
    expect(clean('<a href="javascript:alert(1)">x</a>')).toBe('x');
  });

  it('strips event handlers from allowed tags', () => {
    expect(clean('<span onclick="alert(1)" class="gloss">x</span>')).toBe('<span class="gloss">x</span>');
    expect(clean('<b ONMOUSEOVER=alert(1)>x</b>')).toBe('<b>x</b>');
  });

  it('removes <script> together with its content', () => {
    expect(clean('a<script>alert(1)</script>b')).toBe('ab');
    expect(clean('a<SCRIPT type="text/javascript">alert("<b>x</b>")</SCRIPT >b')).toBe('ab');
    expect(clean('a<script>never closed')).toBe('a');
  });

  it('removes <style>, <iframe>, <textarea>, <title>, <noscript> with content', () => {
    expect(clean('a<style>body{background:url(x)}</style>b')).toBe('ab');
    expect(clean('a<iframe src="javascript:alert(1)">inner</iframe>b')).toBe('ab');
    expect(clean('a<textarea><img src=x onerror=alert(1)></textarea>b')).toBe('ab');
    expect(clean('a<title>t</title>b')).toBe('ab');
    expect(clean('a<noscript><p title="</noscript><img src=x onerror=alert(1)>"></noscript>b')).not.toMatch(/<img/i);
  });

  it('rejects style values that load resources or run script', () => {
    expect(clean('<span style="background:url(javascript:alert(1))">x</span>')).toBe('<span>x</span>');
    expect(clean('<span style="color:red;background-image:url(x)">x</span>')).toBe('<span>x</span>');
    expect(clean('<span style="width:expression(alert(1))">x</span>')).toBe('<span>x</span>');
    expect(clean('<span style="color:red;}body{color:blue">x</span>')).toBe('<span>x</span>');
    expect(clean('<span style="color:\\72 ed">x</span>')).toBe('<span>x</span>');
    expect(clean('<span style="@import \'x\'">x</span>')).toBe('<span>x</span>');
    // Entity-encoded parenthesis is decoded before the check.
    expect(clean('<span style="background:url&#40;x&#41;">x</span>')).toBe('<span>x</span>');
  });

  it('keeps only whitelisted declarations', () => {
    expect(clean('<span style="color:red;position:fixed;top:0">x</span>')).toBe('<span style="color:red">x</span>');
    expect(clean('<span style="display:flex">x</span>')).toBe('<span>x</span>');
    expect(sanitizeDictStyle('font-weight:bold;font-style:italic')).toBe('font-weight:bold;font-style:italic');
    expect(sanitizeDictStyle('color:#ff0000;color:rgb(1, 2, 3)')).toBe('color:#ff0000;color:rgb(1, 2, 3)');
    expect(sanitizeDictStyle('color:red !important')).toBe('');
  });

  it('cannot be broken out of an attribute value', () => {
    const out = clean(`<span title='" onmouseover=alert(1) x="'>x</span>`);
    expect(out).toBe('<span title="&quot; onmouseover=alert(1) x=&quot;">x</span>');
    const host = assertInert(out);
    const span = host.querySelector('span');
    expect(span?.getAttribute('title')).toBe('" onmouseover=alert(1) x="');
    expect(span?.getAttributeNames()).toEqual(['title']);
  });

  it('keeps escaped markup as text', () => {
    expect(clean('&lt;script&gt;alert(1)&lt;/script&gt;')).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
    const host = assertInert(sanitizeDictHtml('&lt;img src=x onerror=alert(1)&gt;'));
    expect(host.querySelector('img')).toBeNull();
    expect(host.textContent).toBe('<img src=x onerror=alert(1)>');
  });

  it('escapes stray < > " & in text', () => {
    expect(clean('a < b && c > "d"')).toBe('a &lt; b &amp;&amp; c &gt; &quot;d&quot;');
    expect(clean('A&amp;B &#12354; &#x3042; &nbsp;')).toBe('A&amp;B &#12354; &#x3042; &nbsp;');
    expect(clean('&#0; &#99999999;')).toBe('&amp;#0; &amp;#99999999;');
  });

  it('drops <svg><script> and <math> with their content', () => {
    expect(clean('a<svg><script>alert(1)</script><g onload="alert(1)"></g></svg>b')).toBe('ab');
    expect(clean('a<svg onload=alert(1)>b')).toBe('a');
    expect(clean('a<math><mi xlink:href="javascript:alert(1)">x</mi></math>b')).toBe('ab');
    expect(clean('a<template><img src=x onerror=alert(1)></template>b')).toBe('ab');
  });

  it('handles uppercase tags and attributes', () => {
    expect(clean('<B CLASS="x">bold</B><IMG SRC=x ONERROR=alert(1)>')).toBe('<b class="x">bold</b>');
  });

  it('removes comments, doctypes and CDATA', () => {
    expect(clean('a<!-- <img src=x onerror=alert(1)> -->b')).toBe('ab');
    expect(clean('a<!---->b<!-->c')).toBe('abc');
    expect(clean('a<!-- never closed <script>')).toBe('a');
    expect(clean('<!DOCTYPE html>a')).toBe('a');
    expect(clean('a<?xml version="1.0"?>b')).toBe('ab');
  });

  it('closes unclosed tags, ignores stray close tags, and re-nests', () => {
    expect(clean('<b>bold')).toBe('<b>bold</b>');
    expect(clean('</div>text</span>')).toBe('text');
    expect(clean('<b><i>x</b>y</i>')).toBe('<b><i>x</i></b>y');
    expect(clean('<ul><li>one<li>two</ul>')).toBe('<ul><li>one<li>two</li></li></ul>');
  });

  it('drops a tag cut off by the end of input', () => {
    expect(clean('ok<span title="x')).toBe('ok');
    expect(clean('ok<img src=x onerror=alert(1)')).toBe('ok');
  });

  it('drops disallowed attributes on allowed tags', () => {
    expect(clean('<div id="a" data-x="1" href="x" src="y" srcset="z" formaction="q" xlink:href="w">t</div>'))
      .toBe('<div>t</div>');
    expect(clean('<td colspan="2" rowspan="x">c</td><span colspan="2">s</span>'))
      .toBe('<td colspan="2">c</td><span>s</span>');
    expect(clean('<span class="ok bad!token other_one" lang="ja-Latn">x</span>'))
      .toBe('<span class="ok other_one" lang="ja-Latn">x</span>');
    expect(clean('<span lang="javascript:alert(1)">x</span>')).toBe('<span>x</span>');
  });

  it('caps the output length and stays well formed', () => {
    const huge = `<div>${'<b>abc</b>'.repeat(20000)}`;
    const out = clean(huge);
    expect(out.length).toBeLessThanOrEqual(DICT_HTML_MAX_OUTPUT);
    expect(out.endsWith('</div>')).toBe(true);
    const text = clean('&amp;'.repeat(20000));
    expect(text.length).toBeLessThanOrEqual(DICT_HTML_MAX_OUTPUT);
    expect(text.endsWith('&amp;')).toBe(true);
  });

  it('returns empty for empty or non-string input', () => {
    expect(sanitizeDictHtml('')).toBe('');
    expect(sanitizeDictHtml(undefined as unknown as string)).toBe('');
  });
});

describe('sanitizeDictHtml: legitimate dictionary markup survives', () => {
  it('keeps ruby annotations', () => {
    const html = '<ruby>漢<rp>(</rp><rt>かん</rt><rp>)</rp>字<rt>じ</rt></ruby>';
    expect(clean(html)).toBe(html);
  });

  it('keeps glossary lists and line breaks', () => {
    const html = '<ul><li>to eat</li><li>to live on</li></ul><br><ol><li>x</li></ol>';
    expect(clean(html)).toBe(html);
    expect(clean('a<br/>b<BR />c')).toBe('a<br>b<br>c');
  });

  it('keeps the pitch-accent span style exactly', () => {
    const html =
      '<span style="border-top:2px solid currentColor;padding-top:1px;display:inline-block">た</span>' +
      '<span style="display:inline-block">べる</span>';
    expect(clean(html)).toBe(html);
  });

  it('keeps tables, details and simple formatting', () => {
    const html =
      '<table><thead><tr><th>a</th></tr></thead><tbody><tr><td rowspan="2">b</td></tr></tbody></table>' +
      '<details><summary>more</summary><p><em>x</em> <strong>y</strong> <sub>1</sub><sup>2</sup> <small>s</small> <u>u</u> <s>s</s></p></details><hr>';
    expect(clean(html)).toBe(html);
  });
});

describe('helpers', () => {
  it('escapeHtmlText escapes every markup character', () => {
    expect(escapeHtmlText(`<a href="x" title='y'>&</a>`))
      .toBe('&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;');
  });

  it('decodeBasicEntities decodes only the basic five and numeric references', () => {
    expect(decodeBasicEntities('A&amp;B &lt;x&gt; &quot;q&quot; &apos;a&apos; &#12354;&#x3042; &nbsp; &bogus;'))
      .toBe('A&B <x> "q" \'a\' ああ &nbsp; &bogus;');
    expect(decodeBasicEntities('&amp;lt;')).toBe('&lt;');
  });

  it('stripDictHtml returns plain text without dropped content', () => {
    expect(stripDictHtml('<ul><li>one</li><li>two&amp;three</li></ul><script>x</script><svg><text>y</text></svg>'))
      .toBe('one two&three');
  });
});
