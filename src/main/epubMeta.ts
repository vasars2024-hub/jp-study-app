/** Shared EPUB OPF metadata parsing — used by both the Library importer (main/library.ts) and the mining analyzer (main/mining.ts) so a book's stored title and its mining-panel title can never disagree. */

/** Pull `<dc:title>` out of an OPF package document's raw XML. Returns undefined if missing/blank. */
export function extractEpubTitleFromOpf(opfXml: string): string | undefined {
  const raw = (opfXml.match(/<dc:title[^>]*>([\s\S]*?)<\/dc:title>/i) ?? [])[1]
    ?.replace(/<[^>]+>/g, '')
    .trim();
  return raw || undefined;
}
