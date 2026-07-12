const base = 'https://news.web.nhk';
const code = await fetch(`${base}/_next/static/chunks/1748-9be20a0e983065f0.js`, { headers: { 'User-Agent': 'Mozilla/5.0' } }).then((r) => r.text());

let pos = code.indexOf('detailedArticleBody');
while (pos >= 0) {
  console.log('\n--- @', pos, '---');
  console.log(code.slice(Math.max(0, pos - 300), pos + 600).replace(/\s+/g, ' '));
  pos = code.indexOf('detailedArticleBody', pos + 1);
  if (pos > 20000) break;
}

const apis = [...new Set([...code.matchAll(/`t\/[^`]{5,80}`/g)].map((m) => m[0]))];
console.log('\nall t/ apis', apis);