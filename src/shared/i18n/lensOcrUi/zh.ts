import type { Catalog } from '../core';

export const LENS_OCR_UI_ZH: Catalog = {
  'lensOcr.stage.refining': '正在更仔细地识别小字…',
  'lensOcr.stage.basic': '正在用内置识别器识别… {percent}%',
  'lensOcr.cancel': '取消',
  'lensOcr.cancelHint': '停止本次识别并重新框选区域。按 Esc 关闭阅读镜。',

  'lensOcr.cached': '即时',
  'lensOcr.cachedHint': '刚才已识别过同一画面，因此直接复用了那次结果。',

  'lensOcr.basic.badge': '基础 OCR',
  'lensOcr.basic.badgeHint': '由应用内置、无需下载的识别器识别。',
  'lensOcr.basic.notice': '由于未安装高精度模型，已使用内置的离线识别器识别。它能很好地识别清晰的文字；对于艺术字、很小或模糊的文字，请安装该模型。',

  // ---- Watch region ----
  'lensOcr.watch.start': '监视',
  'lensOcr.watch.startHint': '保留此区域：文字一变就自动重新读取（适合视觉小说或游戏的文本框）。',
  'lensOcr.watch.selectHint': '拖动框选要监视的文本框',
  'lensOcr.watch.panel': '监视中的区域',
  'lensOcr.watch.active': '正在监视此区域',
  'lensOcr.watch.reading': '正在读取新文字…',
  'lensOcr.watch.empty': '区域内暂时没有文字。',
  'lensOcr.watch.waiting': '每次文字变化都会显示在这里。',
  'lensOcr.watch.stop': '停止监视',
  'lensOcr.watch.stopHint': '不再重新读取此区域。最后一次读取的内容会保留到关闭阅读镜为止。',
};
