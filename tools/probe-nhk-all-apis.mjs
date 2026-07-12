const base = 'https://news.web.nhk';
const pageUrl = `${base}/newsweb/na/na-k10015174811000`;
const html = await fetch(pageUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } }).then((r) => r.text());
const js = [...new Set([...html.matchAll(/\/_next\/static\/chunks\/[^"']+\.js/g)].map((m) => m[0]))];
const all = new Set();
for (const rel of js) {
  const code = await fetch(base + rel, { headers: { 'User-Agent': 'Mozilla/5.0' } }).then((r) => r.text());
  for (const m of code.matchAll(/api\.web\.nhk[^"'`\s)]+/g)) all.add(m[0]);
  for (const m of code.matchAll(/\/r8\/[a-zA-Z0-9_/${}.-]+/g)) all.add(m[0]);
  for (const m of code.matchAll(/"\/newsweb\/[^"]+"/g)) all.add(m[0]);
}
console.log([...all].sort().join('\n'));