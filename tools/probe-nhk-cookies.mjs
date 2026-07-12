const base = 'https://news.web.nhk';
const code = await fetch(`${base}/_next/static/chunks/674-6a1e8fb8bd63774e.js`, { headers: { 'User-Agent': 'Mozilla/5.0' } }).then((r) => r.text());

for (const needle of ['setConsentToUse', 'getConsentToUse', 'ConsentToUse', 'efm', 'cookie.set', 'document.cookie']) {
  let pos = 0;
  let c = 0;
  while ((pos = code.indexOf(needle, pos + 1)) >= 0 && c < 2) {
    console.log(`\n${needle} @${pos}`);
    console.log(code.slice(Math.max(0, pos - 80), pos + 400).replace(/\s+/g, ' '));
    c++;
  }
}