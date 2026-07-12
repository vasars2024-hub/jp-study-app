import fs from 'node:fs';
import { parseHTML } from 'linkedom';

const url = 'https://news.web.nhk/newsweb/na/na-k10015174811000';
const html = await fetch(url, {
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept-Language': 'ja',
  },
}).then((r) => r.text());

const markers = [
  'イギリスの海事機関',
  '官房副長官',
  'UAE',
  'ペルシャ湾内',
  'イランメディア',
  'ヘグセス',
];
for (const m of markers) console.log('SSR has', m, html.includes(m));

// Look for embedded JSON / API hints
const nextData = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
console.log('__NEXT_DATA__', !!nextData, nextData?.[1]?.length ?? 0);

const jsonLd = [...html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)];
console.log('json-ld blocks', jsonLd.length);
for (const [, body] of jsonLd.slice(0, 3)) {
  try {
    const j = JSON.parse(body);
    const s = JSON.stringify(j);
    console.log('  ld type', j['@type'], 'has markers', markers.filter((m) => s.includes(m)).join(','));
    if (j.articleBody) console.log('  articleBody len', j.articleBody.length);
  } catch {
    console.log('  ld parse fail', body.slice(0, 80));
  }
}

// NHK often embeds article id in URL path na-k10015174811000
const articleId = 'na-k10015174811000';
const apiCandidates = [
  `https://news.web.nhk/newsweb/api/article/${articleId}`,
  `https://news.web.nhk/newsweb/api/na/${articleId}`,
  `https://news.web.nhk/newsweb/na/${articleId}/json`,
  `https://www3.nhk.or.jp/news/parts/domestic/json/na-k10015174811000.json`,
];
for (const api of apiCandidates) {
  try {
    const res = await fetch(api, { headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' } });
    const ct = res.headers.get('content-type') ?? '';
    const text = (await res.text()).slice(0, 500);
    console.log('API', res.status, api.split('/').slice(-2).join('/'), ct.split(';')[0], text.slice(0, 120));
  } catch (e) {
    console.log('API fail', api, e.message);
  }
}

// Search script tags for article id or body fragments
const hits = [...html.matchAll(/<script[^>]*>([\s\S]{0,8000}?)<\/script>/gi)]
  .filter(([, body]) => body.includes('イギリス') || body.includes('articleBody') || body.includes('paragraph'))
  .slice(0, 5);
console.log('script hits', hits.length);
for (const [, body] of hits) console.log(' script sample', body.slice(0, 200).replace(/\s+/g, ' '));

// DOM: look for data attributes
const { document } = parseHTML(html);
const main = document.querySelector('main');
console.log('main inner text len', (main?.textContent ?? '').replace(/\s/g, '').length);
console.log('main p count', main?.querySelectorAll('p').length);
const scripts = document.querySelectorAll('script[type="application/json"]');
console.log('json scripts', scripts.length);
for (const s of [...scripts].slice(0, 5)) {
  const t = s.textContent ?? '';
  console.log(' json script len', t.length, 'has イギリス', t.includes('イギリス'));
}