const base = 'https://news.web.nhk';
const code = await fetch(`${base}/_next/static/chunks/9435-84fbb4254a29e972.js`, { headers: { 'User-Agent': 'Mozilla/5.0' } }).then((r) => r.text());
const idx = code.indexOf('startService');
console.log(code.slice(Math.max(0, idx - 400), idx + 2000).replace(/\s+/g, ' '));