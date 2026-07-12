const base = 'https://news.web.nhk';
const pageUrl = `${base}/newsweb/na/na-k10015174811000`;
const html = await fetch(pageUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } }).then((r) => r.text());
const js = [...new Set([...html.matchAll(/\/_next\/static\/chunks\/[^"']+\.js/g)].map((m) => m[0]))];

for (const rel of js) {
  const code = await fetch(base + rel, { headers: { 'User-Agent': 'Mozilla/5.0' } }).then((r) => r.text());
  if (!/extendedEntities|ExtendedEntities|addExtended/.test(code)) continue;
  const file = rel.split('/').pop();
  const hits = [...code.matchAll(/extendedEntities[^]{0,80}/g)].slice(0, 5).map((m) => m[0].replace(/\s+/g, ' '));
  console.log('\n', file, hits);
  const newsHits = [...code.matchAll(/NewsArticle[^]{0,120}/g)].filter((m) => /extended|detail|body/i.test(m[0])).slice(0, 5);
  if (newsHits.length) console.log(' news', newsHits.map((m) => m[0].replace(/\s+/g, ' ')));
}

const id = 'na-k10015174811000';
const apiTries = [
  `https://api.web.nhk/r8/t/newsarticle/na/${id}.json?extendedEntities=true`,
  `https://api.web.nhk/r8/t/newsarticle/na/${id}.json?extendedEntities=1`,
  `https://api.web.nhk/r8/t/newsarticle/na/${id}.json?extended=true`,
];
const markers = ['イギリスの海事', 'markedBody', 'detailedArticleBody', 'paragraph'];
for (const api of apiTries) {
  const text = await fetch(api, { headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' } }).then((r) => r.text());
  console.log('\napi', api.split('?')[1], 'len', text.length, markers.filter((m) => text.includes(m)));
  if (text.includes('detailedArticleBody')) console.log('FOUND BODY', text.slice(0, 500));
}