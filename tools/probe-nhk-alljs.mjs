const base = 'https://news.web.nhk';
const pageUrl = `${base}/newsweb/na/na-k10015174811000`;
const html = await fetch(pageUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } }).then((r) => r.text());
const js = [...new Set([...html.matchAll(/\/_next\/static\/chunks\/[^"']+\.js[^"']*/g)].map((m) => m[0]))];
console.log('js files', js.length);

for (const rel of js) {
  const url = rel.startsWith('http') ? rel : base + rel;
  const code = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }).then((r) => r.text());
  if (!code.includes('detailedArticleBody') && !code.includes('markedBody') && !code.includes('detailFlg')) continue;
  console.log('\n===', rel.split('/').slice(-1)[0], '===');
  for (const needle of ['detailedArticleBody', 'markedBody', 'detailFlg', 'getNewsArticleDetail', 'newsarticledetail', 'articleDetail', 'detail.json']) {
    const i = code.indexOf(needle);
    if (i >= 0) console.log(needle, '@', i, code.slice(i, i + 200).replace(/\s+/g, ' '));
  }
  const apis = [...new Set([...code.matchAll(/`t\/[^`]+`/g)].map((m) => m[0]))];
  const detailApis = apis.filter((a) => /detail|body|marked|paragraph/i.test(a));
  if (detailApis.length) console.log('template apis', detailApis.slice(0, 20));
}