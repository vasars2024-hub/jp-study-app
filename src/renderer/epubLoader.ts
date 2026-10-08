// Custom EPUB loader. We use epub.js purely as a *parser* (it unzips the file
// and reads the OPF spine / paths), then extract each chapter's HTML ourselves
// and rewrite its images to blob URLs. The reader renders this straight into the
// app's own DOM — no iframes — so native CSS writing-mode gives us real
// right-to-left (縦書き) scrolling, which epub.js's renderer can't do.

export interface EpubChapter {
  href: string; // spine href, relative to the OPF (used to match the TOC)
  absPath: string; // archive-absolute path, e.g. "/OEBPS/text/ch01.xhtml"
  html: string; // sanitized <body> inner HTML, images swapped for blob URLs
  chars: number; // number of (non-space) characters — for the reading stats
  label: string; // first heading / snippet, for a fallback chapter list
}

export interface EpubTocEntry {
  label: string;
  chapterIndex: number; // which chapter this points at
  anchor: string; // element id within the chapter, or '' for its start
  depth: number;
}

export interface LoadedEpub {
  title: string;
  chapters: EpubChapter[];
  toc: EpubTocEntry[];
  totalChars: number;
  /** 'rtl' when the book declares right-to-left / vertical progression. */
  direction: 'ltr' | 'rtl';
  destroy: () => void; // revoke blob URLs + free the parser
}

/** Resolve a resource href relative to the chapter it appears in. */
function resolveRelative(chapterAbsPath: string, rel: string): string {
  if (!rel) return rel;
  if (/^[a-z]+:/i.test(rel) || rel.startsWith('//') || rel.startsWith('data:') || rel.startsWith('blob:')) {
    return rel;
  }
  try {
    // A throwaway base lets the URL parser do the ../ math for us.
    const u = new URL(rel, `epub://book${chapterAbsPath}`);
    return decodeURIComponent(u.pathname); // keeps the leading slash
  } catch {
    return rel;
  }
}

export async function loadEpub(buffer: ArrayBuffer): Promise<LoadedEpub> {
  const ePub = (await import('epubjs')).default;
  const book: any = ePub(buffer as any);

  // Wait for the package (paths) and spine to be parsed. Navigation is
  // best-effort — some EPUBs have a broken/absent TOC.
  await book.opened;
  await book.loaded.spine;

  const archive = book.archive;
  const urls: string[] = []; // blob URLs to revoke on destroy
  const urlCache = new Map<string, string>();

  async function blobFor(absPath: string): Promise<string | null> {
    if (urlCache.has(absPath)) return urlCache.get(absPath) as string;
    try {
      const url: string = await archive.createUrl(absPath);
      urlCache.set(absPath, url);
      urls.push(url);
      return url;
    } catch {
      return null;
    }
  }

  const parser = new DOMParser();

  // Archive.getText wants an archive-absolute path ("/OEBPS/..."); resolve()
  // should give that, but be forgiving about the leading slash just in case.
  async function readText(absPath: string, href: string): Promise<string> {
    const tries = [
      absPath,
      absPath.startsWith('/') ? absPath : `/${absPath}`,
      href.startsWith('/') ? href : `/${href}`,
    ];
    for (const p of tries) {
      try {
        const t: string | undefined = await archive.getText(p);
        if (t) return t;
      } catch {
        /* try the next form */
      }
    }
    return '';
  }

  // XHTML is strict — a malformed file yields a <parsererror> and a null body,
  // so fall back to the lenient HTML parser, which always produces a <body>.
  function parseChapter(raw: string): Document {
    let doc = parser.parseFromString(raw, 'application/xhtml+xml');
    if (!doc.body || doc.querySelector('parsererror')) {
      doc = parser.parseFromString(raw, 'text/html');
    }
    return doc;
  }

  const spineItems: any[] = book.spine?.spineItems ?? [];
  const chapters: EpubChapter[] = [];
  // Map spine hrefs to chapter index under several keys (full path AND bare
  // filename), because a TOC often references chapters with a different path
  // prefix than the spine does.
  const hrefIndex = new Map<string, number>();
  const addKey = (k: string, i: number) => {
    if (k && !hrefIndex.has(k)) hrefIndex.set(k, i);
  };

  // Each spine item's first chapter-part index + label, for the fallback TOC.
  const spineFirsts: { index: number; label: string }[] = [];

  for (let i = 0; i < spineItems.length; i++) {
    const item = spineItems[i];
    const href: string = item.href ?? '';
    const absPath: string = book.resolve(href) ?? `/${href}`;
    // The TOC points at the first part of this spine item.
    const firstIndex = chapters.length;
    addKey(stripAnchor(href), firstIndex);
    addKey(basename(href), firstIndex);
    addKey(stripAnchor(absPath), firstIndex);
    addKey(basename(absPath), firstIndex);

    let label = '';
    let parts: { html: string; chars: number }[] = [{ html: '', chars: 0 }];
    try {
      const raw = await readText(absPath, href);
      const doc = parseChapter(raw);
      const body = doc.body ?? doc.querySelector('body');
      if (body) {
        sanitize(body);
        const heading = body.querySelector('h1, h2, h3, h4, h5, h6');
        label = (heading?.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 40);
        // Swap every image reference for a blob URL from the archive.
        const imgEls = Array.from(body.querySelectorAll('img, image')) as Element[];
        for (const el of imgEls) {
          const attr = el.tagName.toLowerCase() === 'image' ? 'xlink:href' : 'src';
          const srcRaw =
            el.getAttribute('src') || el.getAttribute('xlink:href') || el.getAttribute('href') || '';
          if (!srcRaw) continue;
          const resolved = resolveRelative(absPath, srcRaw);
          const blob = await blobFor(resolved);
          if (blob) {
            if (attr === 'xlink:href') el.setAttributeNS('http://www.w3.org/1999/xlink', 'href', blob);
            el.setAttribute('src', blob);
          }
        }
        if (!label) label = (body.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 24);
        parts = splitBody(body);
      }
    } catch {
      /* unreadable chapter — keep a single empty slot */
    }

    spineFirsts.push({ index: firstIndex, label });
    parts.forEach((p, pi) => {
      chapters.push({
        href,
        absPath,
        html: p.html,
        chars: p.chars,
        label: pi === 0 ? label : `${label || 'Section'} (${pi + 1})`,
      });
    });
  }

  const totalChars = chapters.reduce((n, c) => n + c.chars, 0);

  // ---- TOC (best effort) ----
  const toc: EpubTocEntry[] = [];
  try {
    const nav = await book.loaded.navigation;
    const walk = (items: any[], depth: number) => {
      for (const it of items ?? []) {
        const label = String(it?.label ?? '').trim();
        const rawHref = String(it?.href ?? '');
        const key = stripAnchor(rawHref);
        const idx = hrefIndex.get(key) ?? hrefIndex.get(basename(key));
        if (rawHref && idx != null) {
          toc.push({ label: label || '—', chapterIndex: idx, anchor: anchorOf(rawHref), depth });
        }
        if (it?.subitems?.length) walk(it.subitems, depth + 1);
      }
    };
    walk(nav?.toc ?? [], 0);
  } catch {
    /* no usable TOC */
  }

  // Fallback: no usable nav → list the chapters that actually have text, so the
  // "Jump to chapter" control is never empty.
  if (toc.length === 0) {
    for (const s of spineFirsts) {
      const c = chapters[s.index];
      if (c && c.chars > 0) {
        toc.push({ label: s.label || c.label || `Section ${s.index + 1}`, chapterIndex: s.index, anchor: '', depth: 0 });
      }
    }
  }

  let title = '';
  let direction: 'ltr' | 'rtl' = 'ltr';
  try {
    const meta = await book.loaded.metadata;
    title = meta?.title ?? '';
    if (meta?.direction === 'rtl') direction = 'rtl';
  } catch {
    /* ignore */
  }
  try {
    // Vertical Japanese books usually declare rtl page progression on the spine.
    const spineDir = book.packaging?.spine?.direction ?? book.spine?.direction;
    if (spineDir === 'rtl') direction = 'rtl';
  } catch {
    /* ignore */
  }

  const destroy = () => {
    for (const u of urls) {
      try {
        URL.revokeObjectURL(u);
      } catch {
        /* ignore */
      }
    }
    try {
      book.destroy();
    } catch {
      /* ignore */
    }
  };

  return { title, chapters, toc, totalChars, direction, destroy };
}

function stripAnchor(href: string): string {
  const i = href.indexOf('#');
  return i === -1 ? href : href.slice(0, i);
}
function basename(href: string): string {
  const s = stripAnchor(href);
  const i = s.lastIndexOf('/');
  return i === -1 ? s : s.slice(i + 1);
}

// Split a chapter body into render-sized parts so no single rendered chapter is
// huge. The reader shows one part at a time, which keeps the DOM small (fast,
// no freezes) and makes paginated pages come out clean and discrete.
const CHUNK_ELEMENTS = 30;
const CHUNK_CHARS = 6000;
const WRAPPER_TAGS = new Set(['DIV', 'SECTION', 'ARTICLE', 'MAIN']);

/**
 * Characters a reader actually reads: whitespace and furigana excluded. A
 * book with full ruby counted every reading twice (漢字 + かんじ), inflating
 * the characters-read statistics by up to ~2x.
 */
export function readableCharCount(el: Element): number {
  const all = (el.textContent ?? '').replace(/\s+/g, '').length;
  let ruby = 0;
  el.querySelectorAll('rt, rp').forEach((node) => {
    if (node.parentElement?.closest('rt, rp')) return; // nested: counted by its ancestor
    ruby += (node.textContent ?? '').replace(/\s+/g, '').length;
  });
  return Math.max(0, all - ruby);
}

const charCount = readableCharCount;

function splitBody(body: Element): { html: string; chars: number }[] {
  const kids = Array.from(body.children);
  if (kids.length === 0) {
    return [{ html: body.innerHTML, chars: charCount(body) }];
  }

  // Many EPUBs wrap the whole chapter in one div — descend so paragraphs chunk.
  if (kids.length === 1) {
    const sole = kids[0];
    if (WRAPPER_TAGS.has(sole.tagName) && sole.children.length > 0) {
      return splitBody(sole);
    }
  }

  const parts: { html: string; chars: number }[] = [];
  let group: Element[] = [];
  let gChars = 0;
  const flush = (): void => {
    if (!group.length) return;
    parts.push({ html: group.map((e) => e.outerHTML).join(''), chars: gChars });
    group = [];
    gChars = 0;
  };
  for (const el of kids) {
    const elChars = charCount(el);
    // One block element can exceed the char budget — split inside it instead.
    if (elChars >= CHUNK_CHARS && el.children.length > 0) {
      flush();
      parts.push(...splitBody(el));
      continue;
    }
    group.push(el);
    gChars += elChars;
    if (group.length >= CHUNK_ELEMENTS || gChars >= CHUNK_CHARS) flush();
  }
  flush();
  return parts.length ? parts : [{ html: '', chars: 0 }];
}
function anchorOf(href: string): string {
  const i = href.indexOf('#');
  return i === -1 ? '' : href.slice(i + 1);
}

/** Remove scripts, external styles and inline handlers before we inject the HTML. */
function sanitize(root: Element): void {
  const kill = root.querySelectorAll('script, link, style, meta, base, title');
  kill.forEach((el) => el.remove());
  // Strip on* event handlers and javascript: hrefs.
  const all = root.querySelectorAll('*');
  all.forEach((el) => {
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      if (name.startsWith('on')) el.removeAttribute(attr.name);
      if ((name === 'href' || name === 'src') && /^\s*javascript:/i.test(attr.value)) {
        el.removeAttribute(attr.name);
      }
    }
  });
}
