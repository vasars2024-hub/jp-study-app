// risk4: the update panel's loading / error states, translation cancel and the
// clipboard watcher's cloud opt-in, and the one-time CC-CEDICT download prompt.
// English source of truth.

import type { Catalog } from '../core';

export const RISK4_UI_EN: Catalog = {
  // Settings -> Help -> Updates, before main has said which build this is.
  'risk4.update.checkingVersion': 'Checking version…',
  'risk4.update.loadFailed': 'Could not read this copy’s version details.',
  'risk4.update.retry': 'Try again',
  // Translate workbench.
  'risk4.translate.cancel': 'Cancel',
  'risk4.translate.cancelled': 'Translation cancelled.',
  'risk4.translate.clipboardCloud': 'Allow cloud engine for clipboard',
  'risk4.translate.clipboardCloudHint':
    'Off: text picked up from the clipboard is translated offline. On: it may be sent to the cloud engine chosen for this language pair.',
  // The Chinese dictionary became a download.
  'risk4.cedict.title': 'Chinese dictionary needed',
  'risk4.cedict.missing':
    'The Chinese dictionary (CC-CEDICT) is no longer included in the installer. Download it to look up Chinese words again.',
  'risk4.cedict.download': 'Download now',
  'risk4.cedict.downloading': 'Downloading CC-CEDICT. Progress is in Settings > Models & dictionaries.',
  'risk4.cedict.downloadFailed': 'Could not start the download. Try again from Settings > Models & dictionaries.',
};
