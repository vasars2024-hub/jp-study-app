import type { Catalog } from '../core';

export const LIBRARY_MANAGE_UI_ZH: Catalog = {
  // Import job
  'libManage.menu.importBooksFolder': '导入书籍文件夹…',
  'libManage.btn.importBooksFolder': '导入书籍文件夹',
  'libManage.dialog.importBooksFolder': '导入文件夹中的所有书籍和漫画压缩包',
  'libManage.import.aria': '书库导入',
  'libManage.import.running': '正在导入 {done} / {total}',
  'libManage.import.current': '当前：{name}',
  'libManage.import.stop': '停止',
  'libManage.import.stopping': '处理完这个文件后停止…',
  'libManage.import.finished': '导入完成。',
  'libManage.import.stopped': '导入已停止。',
  'libManage.import.added': '已添加：{count}',
  'libManage.import.duplicates': '已在书库中：{count}',
  'libManage.import.failed': '未导入：{count}',
  'libManage.import.left': '未处理：{count}',
  'libManage.import.failuresTitle': '未能导入的文件',
  'libManage.import.fail.unreadable': '{name} — 无法读取',
  'libManage.import.fail.noPages': '{name} — 压缩包中没有图片',
  'libManage.import.fail.storageFull': '{name} — 磁盘已满',
  'libManage.import.fail.badFile': '{name} — 不是有效的书籍或压缩包',
  'libManage.import.dismiss': '关闭',
  'libManage.import.resumable': '有一次导入没有完成。剩余文件：{count}。',
  'libManage.import.resume': '继续',
  'libManage.import.discard': '放弃',
  'libManage.import.noneFound': '该文件夹中没有 EPUB、PDF 或漫画压缩包。',

  // Remove, Undo, Recently removed
  'libManage.remove.done': '已移除“{title}”。',
  'libManage.remove.undo': '撤销',
  'libManage.remove.failed': '其中有文件正在使用，无法移除。请关闭后重试。',
  'libManage.trash.summary': '最近移除（{count}）',
  'libManage.trash.restore': '恢复',
  'libManage.trash.restoreNamed': '恢复 {title}',
  'libManage.trash.keptUntil': '保留至 {date}',
  'libManage.trash.restoreFailed': '无法恢复。请关闭打开的文件后重试。',
  'libManage.trash.release': '全部移到回收站',
  'libManage.trash.releaseTitle': '将已移除的项目移到回收站？',
  'libManage.trash.releaseMessage': '之后将无法再从书库中恢复。在你清空回收站之前，Windows 会把它们保留在回收站中。',
  'libManage.trash.releaseFailed': '有些项目未能移动，仍列在这里。',

  // Details
  'libManage.meta.edit': '编辑详情',
  'libManage.meta.dialogTitle': '编辑详情',
  'libManage.meta.field.title': '标题',
  'libManage.meta.field.author': '作者',
  'libManage.meta.field.series': '系列',
  'libManage.meta.field.seriesIndex': '系列中的序号',
  'libManage.meta.field.tags': '标签',
  'libManage.meta.tagsHint': '用逗号分隔标签。',
  'libManage.meta.authorHint': '多位作者用“&”分隔。',
  'libManage.meta.seriesWithIndex': '{series} 第{index}卷',
  'libManage.meta.error.invalid': '无法保存这些详情。',
  'libManage.meta.error.notFound': '该项目已不在书库中。',
  'libManage.meta.error.titleRequired': '标题为必填项。',
  'libManage.meta.error.tooLong': '有字段过长（最多 300 个字符）。',
  'libManage.meta.error.seriesIndex': '系列序号必须是 0 到 100000 之间的数字。',
  'libManage.meta.error.tags': '最多 50 个标签，每个不超过 60 个字符。',

  // Missing files
  'libManage.missing.badge': '文件丢失',
  'libManage.missing.explain': '该项目保存的副本已在应用外被移动或删除。',
  'libManage.missing.relink': '定位文件…',
  'libManage.missing.relinked': '已找到，可以再次打开。',
  'libManage.missing.relinkFailed': '无法使用该文件，请换一个试试。',
  'libManage.missing.noPages': '该压缩包中没有图片。',
  'libManage.missing.diskFull': '磁盘已满，无法复制该文件。',
  'libManage.dialog.relinkManga': '定位漫画压缩包',

  // Library search
  'libManage.search.label': '搜索书库',
  'libManage.search.placeholder': '标题、作者、系列或标签',

  // Files app
  'filesApp.mine.refuse.notIndexed': '该文件已不在文件目录中。请刷新后重试。',
};
