const base = 'https://news.web.nhk';
const pageUrl = `${base}/newsweb/na/na-k10015174811000`;
const html = await fetch(pageUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } }).then((r) => r.text());
const m = html.match(/page-[a-f0-9]+\.js/);
const dpl = html.match(/dpl=([a-f0-9]+)/)?.[1] ?? '';
const jsUrl = `${base}/_next/static/chunks/app/newsweb/na/%5Bid%5D/${m[0]}?dpl=${dpl}`;
console.log('js', jsUrl);
const code = await fetch(jsUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } }).then((r) => r.text());
const needles = ['markedBody', 'markedLead', 'detailedArticleBody', 'newsarticle', 'fetch', 'api.web.nhk', 'paragraph'];
for (const n of needles) {
  const i = code.indexOf(n);
  console.log(n, i >= 0 ? `yes @${i}` : 'no');
  if (i >= 0) console.log(' ', code.slice(i, i + 200).replace(/\s+/g, ' '));
}
const apis = [...new Set([...code.matchAll(/api\.web\.nhk[^"'`]+/g)].map((x) => x[0]))];
console.log('apis', apis.slice(0, 20));
const r8 = [...new Set([...code.matchAll(/\/r8\/[a-zA-Z0-9_/-]+/g)].map((x) => x[0]))];
console.log('r8', r8.filter((u) => /article|body|detail|paragraph/i.test(u)));