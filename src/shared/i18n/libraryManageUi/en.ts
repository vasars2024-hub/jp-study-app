// Library management (libManage.*): the import job (progress, stop, resume),
// duplicates, Remove with Undo and "Recently removed", editing a book's
// details, missing-file relink. Plus the Files app's refusal for a mine
// request that names no catalogue row. English source of truth.

import type { Catalog } from '../core';

export const LIBRARY_MANAGE_UI_EN: Catalog = {
  // Import job
  'libManage.menu.importBooksFolder': 'Import a folder of books…',
  'libManage.btn.importBooksFolder': 'Import a folder of books',
  'libManage.dialog.importBooksFolder': 'Import every book and manga archive in a folder',
  'libManage.import.aria': 'Library import',
  'libManage.import.running': 'Importing {done} of {total}',
  'libManage.import.current': 'Now: {name}',
  'libManage.import.stop': 'Stop',
  'libManage.import.stopping': 'Stopping after this file…',
  'libManage.import.finished': 'Import finished.',
  'libManage.import.stopped': 'Import stopped.',
  'libManage.import.added': 'Added: {count}',
  'libManage.import.duplicates': 'Already in the library: {count}',
  'libManage.import.failed': 'Not imported: {count}',
  'libManage.import.left': 'Not reached: {count}',
  'libManage.import.failuresTitle': 'Files that were not imported',
  'libManage.import.fail.unreadable': '{name} — could not be read',
  'libManage.import.fail.noPages': '{name} — the archive holds no images',
  'libManage.import.fail.storageFull': '{name} — the disk is full',
  'libManage.import.fail.badFile': '{name} — not a valid book or archive',
  'libManage.import.dismiss': 'Dismiss',
  'libManage.import.resumable': 'An import did not finish. Files left: {count}.',
  'libManage.import.resume': 'Resume',
  'libManage.import.discard': 'Forget it',
  'libManage.import.noneFound': 'That folder has no EPUB, PDF or manga archives in it.',

  // Remove, Undo, Recently removed
  'libManage.remove.done': 'Removed “{title}”.',
  'libManage.remove.undo': 'Undo',
  'libManage.remove.failed': 'It could not be removed because one of its files is in use. Close it and try again.',
  'libManage.trash.summary': 'Recently removed ({count})',
  'libManage.trash.restore': 'Restore',
  'libManage.trash.restoreNamed': 'Restore {title}',
  'libManage.trash.keptUntil': 'Kept until {date}',
  'libManage.trash.restoreFailed': 'It could not be restored. Close any open files and try again.',
  'libManage.trash.release': 'Move all to the Recycle Bin',
  'libManage.trash.releaseTitle': 'Move removed items to the Recycle Bin?',
  'libManage.trash.releaseMessage':
    'They will no longer be restorable from the library. Windows keeps them in the Recycle Bin until you empty it.',
  'libManage.trash.releaseFailed': 'Some items could not be moved and are still listed here.',

  // Details
  'libManage.meta.edit': 'Edit details',
  'libManage.meta.dialogTitle': 'Edit details',
  'libManage.meta.field.title': 'Title',
  'libManage.meta.field.author': 'Authors',
  'libManage.meta.field.series': 'Series',
  'libManage.meta.field.seriesIndex': 'Number in series',
  'libManage.meta.field.tags': 'Tags',
  'libManage.meta.tagsHint': 'Separate tags with commas.',
  'libManage.meta.authorHint': 'Separate several authors with “&”.',
  'libManage.meta.seriesWithIndex': '{series}, #{index}',
  'libManage.meta.error.invalid': 'Those details could not be saved.',
  'libManage.meta.error.notFound': 'This item is no longer in the library.',
  'libManage.meta.error.titleRequired': 'A title is required.',
  'libManage.meta.error.tooLong': 'A field is too long (300 characters at most).',
  'libManage.meta.error.seriesIndex': 'The number in series must be a number from 0 to 100000.',
  'libManage.meta.error.tags': 'Use at most 50 tags of up to 60 characters each.',

  // Missing files
  'libManage.missing.badge': 'File missing',
  'libManage.missing.explain': 'The stored copy of this item was moved or deleted outside the app.',
  'libManage.missing.relink': 'Locate file…',
  'libManage.missing.relinked': 'Found — the item can be opened again.',
  'libManage.missing.relinkFailed': 'That file could not be used. Try another one.',
  'libManage.missing.noPages': 'That archive holds no images.',
  'libManage.missing.diskFull': 'The disk is full, so the file could not be copied in.',
  'libManage.dialog.relinkManga': 'Locate the manga archive',

  // Library search
  'libManage.search.label': 'Search the library',
  'libManage.search.placeholder': 'Title, author, series or tag',

  // Files app: a mine request that names no row of the catalogue
  'filesApp.mine.refuse.notIndexed': 'This file is not in the Files catalogue any more. Refresh and try again.',
};
