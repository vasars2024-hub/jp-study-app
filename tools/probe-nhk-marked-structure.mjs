const base = 'https://news.web.nhk';
const code = await fetch(`${base}/_next/static/chunks/4788-b18606c716529b34.js`, { headers: { 'User-Agent': 'Mozilla/5.0' } }).then((r) => r.text());

// Find render functions for marked body blocks
for (const needle of ['"paragraph"', 'type==="heading"', 'type==="paragraph"', 'markedBody', 'renderMarked', 'MarkedBody', 'ArticleBody']) {
  let pos = 0;
  let c = 0;
  while ((pos = code.indexOf(needle, pos + 1)) >= 0 && c < 2) {
    console.log(`\n${needle} @${pos}`);
    console.log(code.slice(Math.max(0, pos - 80), pos + 300).replace(/\s+/g, ' '));
    c++;
  }
}