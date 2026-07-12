const base = 'https://news.web.nhk';
// chunk 2457 has NewsArticleSection
const code = await fetch(`${base}/_next/static/chunks/2457-7615a65e1c1d9a51.js`, { headers: { 'User-Agent': 'Mozilla/5.0' } }).then((r) => r.text());

for (const needle of ['NewsArticleSection', 'MarkedBody', 'markedBody', 'ArticleBody', 'renderParagraph', 'ParagraphBlock']) {
  let pos = 0;
  let c = 0;
  while ((pos = code.indexOf(needle, pos + 1)) >= 0 && c < 2) {
    console.log(`\n${needle} @${pos}`);
    console.log(code.slice(Math.max(0, pos - 100), pos + 400).replace(/\s+/g, ' '));
    c++;
  }
}

// Also search chunk 1483 and 2028
for (const file of ['1483-34379330c70db254.js', '2028-8af6111cf3cfd47a.js', '3722-068636126f50f38e.js']) {
  const c2 = await fetch(`${base}/_next/static/chunks/${file}`, { headers: { 'User-Agent': 'Mozilla/5.0' } }).then((r) => r.text());
  if (c2.includes('markedBody') || c2.includes('MarkedBody') || c2.includes('NewsArticleBody')) {
    console.log('\nFILE', file, 'has markedBody');
    const i = c2.indexOf('markedBody');
    console.log(c2.slice(i - 100, i + 400).replace(/\s+/g, ' '));
  }
}