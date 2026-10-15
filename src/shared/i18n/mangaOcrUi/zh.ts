// The manga reader's automatic OCR -- Simplified Chinese. See ./en.ts for scope.
import type { Catalog } from '../core';

export const MANGA_OCR_UI_ZH: Catalog = {
  'mangaOcrUi.autoOcr': '自动识别每一页',
  'mangaOcrUi.autoOcr.hint':
    '打开页面时识别其中的文字，并提前识别下一页，这样可以立即指向单词查词。每页只识别一次并保存。',
  'mangaOcrUi.phase.loading': '正在启动文字识别…',
  'mangaOcrUi.phase.detect': '正在查找页面上的文字…',
  'mangaOcrUi.phase.read': '正在识别第 {current} 个对话框，共 {total} 个…',
  'mangaOcrUi.models.autoOffer':
    '安装漫画 OCR 模型后即可自动识别页面。模型只需下载一次，可离线使用。',
};
