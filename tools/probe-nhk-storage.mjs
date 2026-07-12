const base = 'https://news.web.nhk';
const pageUrl = `${base}/newsweb/na/na-k10015174811000`;
const html = await fetch(pageUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } }).then((r) => r.text());
const js = [...new Set([...html.matchAll(/\/_next\/static\/chunks\/[^"']+\.js/g)].map((m) => m[0]))];

for (const rel of js) {
  const code = await fetch(base + rel, { headers: { 'User-Agent': 'Mozilla/5.0' } }).then((r) => r.text());
  if (!/localStorage|sessionStorage|ctu|consent|利用意向|termsAccepted|agreement/i.test(code)) continue;
  const file = rel.split('/').pop();
  const hits = [...code.matchAll(/localStorage\.[a-zA-Z0-9_$.]+/g)].map((m) => m[0]);
  const keys = [...code.matchAll(/localStorage\.(?:getItem|setItem)\(["'`]([^"'`]+)["'`]/g)].map((m) => m[1]);
  if (keys.length || hits.length) {
    console.log('\n', file);
    console.log(' keys', [...new Set(keys)].slice(0, 20));
    console.log(' ops', [...new Set(hits)].slice(0, 15));
  }
}