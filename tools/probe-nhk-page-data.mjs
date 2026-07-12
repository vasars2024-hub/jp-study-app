const base = 'https://news.web.nhk';
const pageCode = await fetch(`${base}/_next/static/chunks/app/newsweb/na/%5Bid%5D/page-424872bba7896ae4.js`, { headers: { 'User-Agent': 'Mozilla/5.0' } }).then((r) => r.text());

// Find the page component function - search for newsArticleSection or similar
for (const needle of ['newsArticleSection', 'NewsArticleSection', 'markedLead', 'NewsArticlePage', 'articleData', 'newsArticle']) {
  let pos = 0;
  let c = 0;
  while ((pos = pageCode.indexOf(needle, pos + 1)) >= 0 && c < 3) {
    console.log(`\n${needle} @${pos}:`);
    console.log(pageCode.slice(Math.max(0, pos - 150), pos + 350).replace(/\s+/g, ' '));
    c++;
  }
}

// Search server component loader patterns
for (const needle of ['await ', 'fetch(', 'getNewsArticle', 'detailedArticleBody', 'detailFlg']) {
  const count = (pageCode.match(new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) ?? []).length;
  if (count) console.log('\ncount', needle, count);
}