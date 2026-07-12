const base = 'https://news.web.nhk';
const code = await fetch(`${base}/_next/static/chunks/9435-84fbb4254a29e972.js`, { headers: { 'User-Agent': 'Mozilla/5.0' } }).then((r) => r.text());

let pos = 0;
let c = 0;
while ((pos = code.indexOf('ctu', pos + 1)) >= 0 && c < 12) {
  const snippet = code.slice(Math.max(0, pos - 100), pos + 250).replace(/\s+/g, ' ');
  if (/erpc|value|key|in|out|searchParams|cookie|localStorage/.test(snippet)) {
    console.log(`\n--- ${c} ---`);
    console.log(snippet);
    c++;
  }
}