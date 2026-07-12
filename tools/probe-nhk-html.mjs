import fs from 'node:fs';

const url = 'https://news.web.nhk/newsweb/na/na-k10015174811000';
const html = await fetch(url, {
  headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 'Accept-Language': 'ja' },
}).then((r) => r.text());

// Extract large JSON blobs from script tags
const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]).filter((s) => s.length > 5000);
console.log('large scripts', scripts.length, scripts.map((s) => s.length));

for (const s of scripts) {
  if (s.includes('newsarticleId') || s.includes('apiBaseUrl')) {
    const snippet = s.slice(0, 300);
    console.log('config script start', snippet.replace(/\s+/g, ' '));
    // try parse if JSON
    for (const start of ['{', 'window.__', 'self.__']) {
      const i = s.indexOf('{');
      if (i >= 0) {
        try {
          const j = JSON.parse(s.slice(i));
          console.log('parsed keys', Object.keys(j).slice(0, 20));
        } catch {
          /* */
        }
      }
    }
  }
}

// Search for detail/content endpoints in whole html
const endpointHits = [...html.matchAll(/\/r8\/[a-zA-Z0-9_/-]+/g)].map((m) => m[0]);
const uniq = [...new Set(endpointHits)].filter((e) => e.includes('news') || e.includes('article') || e.includes('body') || e.includes('detail'));
console.log('\nendpoints', uniq.slice(0, 30));

// Try common NHK detail APIs
const id = 'na-k10015174811000';
const tries = [
  `https://api.web.nhk/r8/t/newsarticle/na/${id}.json`,
  `https://api.web.nhk/r8/t/newsarticlebody/na/${id}.json`,
  `https://api.web.nhk/r8/t/newsarticle/detail/na/${id}.json`,
  `https://api.web.nhk/r8/t/newsarticle/na/${id}/body.json`,
  `https://api.web.nhk/r8/t/newsarticlecontent/na/${id}.json`,
  `https://api.web.nhk/r8/t/newsarticle/na/${id}/detail.json`,
  `https://api.web.nhk/r8/t/newsarticle/na/${id}/paragraphs.json`,
];
for (const api of tries) {
  const res = await fetch(api, { headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' } });
  const text = await res.text();
  console.log(res.status, api.split('/r8/')[1], 'len', text.length, text.includes('イギリス'), text.slice(0, 80).replace(/\s+/g, ' '));
}

// Look for self.__next_f or similar RSC payload
const rsc = html.includes('self.__next_f');
console.log('has next_f', rsc);
const chunks = [...html.matchAll(/\{"id":"[^"]+","name":"[^"]+","chunks":[^\]]+\]/g)].slice(0, 3);
console.log('rsc chunks', chunks.length);