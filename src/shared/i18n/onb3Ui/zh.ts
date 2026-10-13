// onb3: first-run setup follow-ups and translated error text for the manga
// reader and the visual-novel panels. — Simplified Chinese.

import type { Catalog } from '../core';

export const ONB3_UI_ZH: Catalog = {
  'onb3.dl.builtInSettingUpDesc':
    '日英词典随应用附带，正在设置中，无需下载。',
  'onb3.dl.builtInSettingUp': '正在设置，{percent}%',
  'onb3.dl.builtInSettingUpIndeterminate': '正在设置…',
  'onb3.finish.blancTour':
    '导览介绍的是 Study OS 桌面。Blanc 会在单独的窗口中打开，所以导览留在“帮助”里，随时可以开始。',

  'onb3.manga.pageMissing': '此页面已不在库中。请重新打开漫画后再扫描。',
  'onb3.manga.regionTooSmall': '区域太小，无法识别。请把文字框得大一些。',
  'onb3.manga.phase.ocr': '正在识别文字',
  'onb3.manga.phase.translate': '正在翻译',

  'onb3.vn.scanFailed': '无法扫描该文件夹。',
  'onb3.vn.analyzeFailed': '无法分析这一行。',
  'onb3.vn.agent.addFailed': '无法添加视觉小说。',
  'onb3.vn.agent.routesFailed': '无法保存路线。',
  'onb3.vn.agent.captureFailed': '无法保存捕获的台词。',
};
