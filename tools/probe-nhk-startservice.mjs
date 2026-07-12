const base = 'https://news.web.nhk';
const code = await fetch(`${base}/_next/static/chunks/9435-84fbb4254a29e972.js`, { headers: { 'User-Agent': 'Mozilla/5.0' } }).then((r) => r.text());
for (const needle of ['startService', 'erpc.startService', 'J.erpc', 'collationEnforcement', 'household-anonymous', 'cookie', 'setCookie']) {
  let pos = 0;
  let c = 0;
  while ((pos = code.indexOf(needle, pos + 1)) >= 0 && c < 2) {
    console.log(`\n${needle} @${pos}`);
    console.log(code.slice(Math.max(0, pos - 120), pos + 350).replace(/\s+/g, ' '));
    c++;
  }
}