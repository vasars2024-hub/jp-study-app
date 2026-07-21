/**
 * EPUB mining i18n packs + catalogs inject.
 * Prefer: node tools/build-and-patch-epub-i18n.cjs
 *
 * This file re-exports the packed en/ja maps for debugging; the build script
 * is the source of truth for zh/ru and catalog injection.
 */
'use strict';

module.exports = require('./epub-mining-i18n-packs.json');
