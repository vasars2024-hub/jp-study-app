const base = 'https://news.web.nhk';
const code = await fetch(`${base}/_next/static/chunks/9435-84fbb4254a29e972.js`, { headers: { 'User-Agent': 'Mozilla/5.0' } }).then((r) => r.text());
const idx = code.indexOf('getNewsArticle');
console.log(code.slice(Math.max(0, idx - 500), idx + 2500).replace(/\s+/g, ' '));