const base = 'https://news.web.nhk';
const pageUrl = `${base}/newsweb/na/na-k10015174811000`;
const html = await fetch(pageUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } }).then((r) => r.text());
const js = [...new Set([...html.matchAll(/\/_next\/static\/chunks\/[^"']+\.js/g)].map((m) => m[0]))];

for (const rel of js) {
  const code = await fetch(base + rel, { headers: { 'User-Agent': 'Mozilla/5.0' } }).then((r) => r.text());
  if (!/markedBody|MarkedBody|detailedArticleBody|renderMarked/.test(code)) continue;
  const file = rel.split('/').pop();
  console.log('\n###', file, 'size', code.length);
  for (const pat of [/markedBody[^]{0,120}/g, /detailedArticleBody[^]{0,120}/g, /getNewsArticle[^]{0,120}/g]) {
    const ms = [...code.matchAll(pat)].slice(0, 3);
    for (const m of ms) console.log(' ', m[0].replace(/\s+/g, ' ').slice(0, 150));
  }
}