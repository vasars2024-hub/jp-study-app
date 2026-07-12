const base = 'https://news.web.nhk';
const pageUrl = `${base}/newsweb/na/na-k10015174811000`;
const html = await fetch(pageUrl, { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'ja' } }).then((r) => r.text());

// Search RSC flight for escaped Japanese markers
const escaped = [
  '\\u30a4\\u30ae\\u30ea\\u30b9', // イギリス
  '\\u30da\\u30eb\\u30b7\\u30e3', // ペルシャ
  'detailedArticleBody',
  'markedBody',
  'detailFlg',
];
for (const m of escaped) {
  const i = html.indexOf(m);
  console.log(m, i >= 0 ? `yes @${i}` : 'no');
}

// Fetch chunks that mention newsarticle
const jsUrls = [
  `${base}/_next/static/chunks/9435-84fbb4254a29e972.js`,
  `${base}/_next/static/chunks/2457-7615a65e1c1d9a51.js`,
  `${base}/_next/static/chunks/4788-b18606c716529b34.js`,
];
for (const url of jsUrls) {
  const code = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }).then((r) => r.text());
  const hits = ['detailedArticleBody', 'detailFlg', 'markedBody', '/r8/', 'newsarticle', 'paragraph', 'detail'];
  const found = hits.filter((h) => code.includes(h));
  console.log('\n', url.split('/').pop(), found.join(', '));
  const r8 = [...new Set([...code.matchAll(/["'`](\/r8\/[^"'`]+)["'`]/g)].map((m) => m[1]))];
  const articleApis = r8.filter((u) => /article|body|detail|paragraph|news/i.test(u));
  if (articleApis.length) console.log('  apis', articleApis.slice(0, 15));
  const idx = code.indexOf('detailedArticleBody');
  if (idx >= 0) console.log('  snippet', code.slice(Math.max(0, idx - 80), idx + 300).replace(/\s+/g, ' '));
}

// Try detailFlg-related API patterns
const id = 'na-k10015174811000';
const tries = [
  `https://api.web.nhk/r8/t/newsarticle/na/${id}/detail.json`,
  `https://api.web.nhk/r8/t/newsarticledetail/na/${id}.json`,
  `https://api.web.nhk/r8/t/newsarticledetail/na/${id}.json`,
  `https://api.web.nhk/r8/t/newsarticle/na/${id}/markedbody.json`,
  `https://api.web.nhk/r8/t/newsarticlebody/na/${id}.json`,
  `https://api.web.nhk/r8/t/newsarticle/na/${id}?detailFlg=true`,
  `https://api.web.nhk/r8/t/newsarticle/na/${id}.json?detailFlg=true`,
  `https://api.web.nhk/r8/t/newsarticle/na/${id}.json?detail=true`,
  `https://api.web.nhk/r8/t/newsarticle/na/${id}.json?extended=detail`,
  `https://api.web.nhk/r8/t/newsarticle/na/${id}.json?include=detailedArticleBody`,
  `https://api.web.nhk/r8/t/newsarticle/na/${id}/detailedArticleBody.json`,
  `https://api.web.nhk/r8/t/newsarticle/na/${id}/markedBody.json`,
];
const markers = ['イギリスの海事', 'UAE', 'markedBody', 'paragraph'];
for (const api of tries) {
  const res = await fetch(api, { headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' } });
  const text = await res.text();
  const found = markers.filter((m) => text.includes(m));
  if (res.status === 200 && text.length > 8000) console.log('BIG', res.status, api, text.length, found);
  else console.log(res.status, api.split('/r8/')[1] ?? api, 'len', text.length, found.join(',') || '-');
}