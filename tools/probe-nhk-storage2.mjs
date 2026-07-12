const base = 'https://news.web.nhk';
const code = await fetch(`${base}/_next/static/chunks/2028-8af6111cf3cfd47a.js`, { headers: { 'User-Agent': 'Mozilla/5.0' } }).then((r) => r.text());
let pos = 0;
while ((pos = code.indexOf('localStorage', pos + 1)) >= 0) {
  console.log(code.slice(Math.max(0, pos - 80), pos + 200).replace(/\s+/g, ' '));
}