// Novel reader extras (search, link import, coded errors) — Chinese. See ./en.ts.
import type { Catalog } from '../core';

export const NOVEL_READER_UI_ZH: Catalog = {
  'novelReaderUi.translate.autoFailed': '自动翻译失败。请点击“翻译”重试。',
  'novelReaderUi.link.importing': '正在将网页导入为书籍…',
  'novelReaderUi.link.saved': '已保存到书库：{title}',
  'novelReaderUi.link.openedInBrowser': '{reason} 已改为在浏览器中打开该网页。',
  'novelReaderUi.import.noArticle': '此网页上没有可读的文章，因此无法导入。',
  'novelReaderUi.import.failed': '无法导入此网页。请稍后重试。',
  'novelReaderUi.import.wikiFailed': '维基百科没有返回文章。请稍后重试。',
  'novelReaderUi.novels.jitenNetwork': '无法连接 Jiten。请检查网络连接后重试。',
  'novelReaderUi.novels.jitenHttp': 'Jiten 返回了错误 {status}。请稍后重试。',
  'novelReaderUi.novels.jitenFailed': '无法加载 Jiten 目录。请稍后重试。',
  'novelReaderUi.novels.sourcesFailed': '无法保存来源设置。请检查地址和密钥后重试。',
  'novelReaderUi.search.open': '在书中搜索 (Ctrl+F)',
  'novelReaderUi.search.aria': '在本书中搜索',
  'novelReaderUi.search.placeholder': '搜索本书',
  'novelReaderUi.search.prev': '上一个匹配',
  'novelReaderUi.search.next': '下一个匹配',
  'novelReaderUi.search.count': '第 {current} 项，共 {total} 项',
  'novelReaderUi.search.none': '无匹配',
  'novelReaderUi.search.capped': '仅列出前 {max} 个匹配。',
  'novelReaderUi.search.ignoreWidth': '忽略假名与全半角',
  'novelReaderUi.search.ignoreWidthTitle': '将平假名与片假名、全角与半角字母和数字视为相同',
  'novelReaderUi.search.results': '匹配结果',
  'novelReaderUi.search.chapter': '第 {n} 部分',
};
