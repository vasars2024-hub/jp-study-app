const kid = 'k10015174811';
const KID = 'K10015174811';
const markers = ['イギリスの海事機関', 'UAE', 'ペルシャ湾内', '官房副長官'];
const tries = [
  `https://www3.nhk.or.jp/news/html/20260712/${kid}/${kid}.html`,
  `https://www3.nhk.or.jp/news/html/20260712/${kid}c.html`,
  `https://www3.nhk.or.jp/news/html/20260712/${kid}/${kid}c.html`,
  `https://www3.nhk.or.jp/news/html/20260712/${KID}/${KID}.html`,
  `https://www3.nhk.or.jp/news/html/20260712/${kid}.html`,
  `https://www3.nhk.or.jp/news/html/${kid}/${kid}.html`,
  `https://www3.nhk.or.jp/rss/news/cat0.xml`,
  `https://www3.nhk.or.jp/news/p/${kid}.html`,
  `https://www3.nhk.or.jp/news/p/${KID}.html`,
];

for (const url of tries) {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'ja' }, redirect: 'follow' });
    const text = await res.text();
    const found = markers.filter((m) => text.includes(m));
    console.log(res.status, url.replace('https://www3.nhk.or.jp/', ''), 'len', text.length, found.join(',') || '-');
  } catch (e) {
    console.log('fail', url, e.message);
  }
}