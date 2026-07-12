const base = 'https://news.web.nhk';
const pageUrl = `${base}/newsweb/na/na-k10015174811000`;
const html = await fetch(pageUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } }).then((r) => r.text());
const js = [...new Set([...html.matchAll(/\/_next\/static\/chunks\/[^"']+\.js/g)].map((m) => m[0]))];

for (const rel of js) {
  const code = await fetch(base + rel, { headers: { 'User-Agent': 'Mozilla/5.0' } }).then((r) => r.text());
  if (!code.includes('loginAccountless')) continue;
  console.log('\n===', rel.split('/').pop(), '===');
  let pos = 0;
  let c = 0;
  while ((pos = code.indexOf('loginAccountless', pos + 1)) >= 0 && c < 3) {
    console.log(code.slice(Math.max(0, pos - 100), pos + 500).replace(/\s+/g, ' '));
    c++;
  }
}