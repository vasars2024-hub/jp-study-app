const base = 'https://news.web.nhk';
const pageUrl = `${base}/newsweb/na/na-k10015174811000`;
const html = await fetch(pageUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } }).then((r) => r.text());
const js = [...new Set([...html.matchAll(/\/_next\/static\/chunks\/[^"']+\.js/g)].map((m) => m[0]))];

for (const rel of js) {
  const code = await fetch(base + rel, { headers: { 'User-Agent': 'Mozilla/5.0' } }).then((r) => r.text());
  if (!/getNewsArticle|detailedArticleBody|detailFlg|markedBody/.test(code)) continue;
  const file = rel.split('/').pop();
  const gets = [...code.matchAll(/getNewsArticle[A-Za-z]*\([^)]{0,120}\)/g)].map((m) => m[0]);
  if (gets.length) {
    console.log('\n', file, gets.slice(0, 8));
  }
  const fetches = [...code.matchAll(/fetch\(([^)]{10,120})\)/g)].map((m) => m[1]).filter((s) => /nhk|newsarticle|r8|detail/i.test(s));
  if (fetches.length) console.log(' fetch', file, fetches.slice(0, 6));
}