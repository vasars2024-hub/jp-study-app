const base = 'https://news.web.nhk';
const code = await fetch(`${base}/_next/static/chunks/9435-84fbb4254a29e972.js`, { headers: { 'User-Agent': 'Mozilla/5.0' } }).then((r) => r.text());

let pos = 0;
let count = 0;
while ((pos = code.indexOf('detailFlg', pos + 1)) >= 0 && count < 8) {
  console.log('\n--- hit', count, '@', pos, '---');
  console.log(code.slice(Math.max(0, pos - 200), pos + 400).replace(/\s+/g, ' '));
  count += 1;
}

// Also search page chunk
const pageCode = await fetch(`${base}/_next/static/chunks/app/newsweb/na/%5Bid%5D/page-424872bba7896ae4.js`, { headers: { 'User-Agent': 'Mozilla/5.0' } }).then((r) => r.text());
pos = 0;
count = 0;
while ((pos = pageCode.indexOf('detailFlg', pos + 1)) >= 0 && count < 5) {
  console.log('\n=== page hit', count, '===');
  console.log(pageCode.slice(Math.max(0, pos - 200), pos + 500).replace(/\s+/g, ' '));
  count += 1;
}
for (const needle of ['getNewsArticle', 'markedBody', 'detailedArticleBody', 'detail']) {
  const i = pageCode.indexOf(needle);
  if (i >= 0) console.log('\npage', needle, pageCode.slice(i, i + 400).replace(/\s+/g, ' '));
}