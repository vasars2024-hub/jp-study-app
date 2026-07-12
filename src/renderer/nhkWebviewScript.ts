/** Self-contained JS executed inside the immersion <webview> for NHK full-article extraction. */

export const NHK_WEBVIEW_EXTRACT_SCRIPT = String.raw`(() => {
  const HYDRATION_MARKERS = ${JSON.stringify([
    'イギリスの海事機関',
    'ペルシャ湾内',
    'UAE',
    'イランメディア',
    '米中央軍',
  ])};
  const MIN_FULL_LEN = 1800;
  const PROMO_RE = /^(注目(ワード|の?キーワード)?|あわせて読みたい|深掘り(コンテンツ)?|関連(記事|ニュース)?|最新・注目(の動画|ニュース)?|新着(ニュース|記事)?|各地のニュース|天気予報|防災情報)/;

  function esc(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function isPromoLabel(text) {
    const t = String(text ?? '').replace(/\s+/g, ' ').trim();
    if (!t || t.length > 56) return false;
    return PROMO_RE.test(t);
  }

  function inline(nodes) {
    if (!nodes || !nodes.length) return '';
    return nodes.map((node) => {
      const type = node && node.type ? node.type : 'text';
      if (type === 'text') return esc(node.value || '');
      if (type === 'strong') return '<strong>' + inline(node.children) + '</strong>';
      if (type === 'highlight') return '<mark>' + inline(node.children) + '</mark>';
      if (type === 'link') {
        const href = esc(node.url || '#');
        return '<a href="' + href + '">' + inline(node.children) + '</a>';
      }
      if (node.children && node.children.length) return inline(node.children);
      return esc(node.value || '');
    }).join('');
  }

  function blocksToHtml(blocks) {
    if (!blocks || !blocks.length) return '';
    const parts = [];
    for (const block of blocks) {
      const type = block && block.type ? block.type : '';
      const inner = inline(block.children);
      if (!inner && type !== 'thematicBreak') continue;
      if (type === 'paragraph') parts.push('<p>' + inner + '</p>');
      else if (type === 'heading') {
        const depth = Math.min(6, Math.max(2, Number(block.depth) || 2));
        parts.push('<h' + depth + '>' + inner + '</h' + depth + '>');
      } else if (type === 'thematicBreak') parts.push('<hr/>');
      else if (inner) parts.push('<p>' + inner + '</p>');
    }
    return parts.join('\n');
  }

  function getFiber(dom) {
    if (!dom) return null;
    const key = Object.keys(dom).find((k) => k.indexOf('__reactFiber$') === 0 || k.indexOf('__reactInternalInstance$') === 0);
    return key ? dom[key] : null;
  }

  function findArticleData(fiber, depth) {
    if (!fiber || depth > 48) return null;
    try {
      const props = fiber.memoizedProps || fiber.pendingProps;
      if (props && typeof props === 'object') {
        if (props.detailedArticleBody && props.detailedArticleBody.markedBody) return props;
        if (props.newsArticle && props.newsArticle.detailedArticleBody) return props.newsArticle;
        if (props.article && props.article.detailedArticleBody) return props.article;
        for (const value of Object.values(props)) {
          if (value && typeof value === 'object' && value.detailedArticleBody && value.detailedArticleBody.markedBody) {
            return value;
          }
        }
      }
      const state = fiber.memoizedState;
      if (state && typeof state === 'object') {
        if (state.detailedArticleBody && state.detailedArticleBody.markedBody) return state;
        if (state.memoizedState && state.memoizedState.detailedArticleBody) return state.memoizedState;
      }
    } catch (_) {}
    return findArticleData(fiber.child, depth + 1) || findArticleData(fiber.sibling, depth + 1);
  }

  function extractFromReact() {
    const roots = [document.querySelector('main'), document.querySelector('h1'), document.body];
    for (const root of roots) {
      if (!root) continue;
      let fiber = getFiber(root);
      let hops = 0;
      while (fiber && hops < 6) {
        const data = findArticleData(fiber, 0);
        if (data && data.detailedArticleBody && data.detailedArticleBody.markedBody) {
          const lead = blocksToHtml(data.detailedArticleBody.markedLead);
          const body = blocksToHtml(data.detailedArticleBody.markedBody);
          const html = (lead + body).trim();
          if (html.length > 120) {
            const title = (data.headline || data.name || document.querySelector('h1')?.textContent || document.title || '').trim();
            const published = data.datePublished || data.dateModified || null;
            const byline = data.author && data.author.name ? data.author.name : null;
            return { title, html, publishedTime: published, byline, source: 'react' };
          }
        }
        fiber = fiber.return;
        hops += 1;
      }
    }
    return null;
  }

  function prunePromoTail(root) {
    const labels = root.querySelectorAll('h2,h3,h4,h5,h6,p,span,strong,dt,legend');
    for (const label of labels) {
      if (!isPromoLabel(label.textContent)) continue;
      let node = label;
      while (node && node.parentElement) {
        const parent = node.parentElement;
        const children = Array.from(parent.children);
        const idx = children.indexOf(node);
        if (idx >= 0) {
          for (let i = idx; i < children.length; i += 1) children[i].remove();
        }
        if (parent === root) break;
        const hasProse = children.slice(0, idx).some((c) => (c.textContent || '').replace(/\s/g, '').length > 80);
        if (hasProse) break;
        node = parent;
      }
      break;
    }
  }

  function childHasPromoLabel(el) {
    for (const node of el.querySelectorAll('h2,h3,h4,h5,h6,p,span,strong')) {
      if (isPromoLabel((node.textContent || '').replace(/\s+/g, ' ').trim())) return true;
    }
    return false;
  }

  function extractFromDom() {
    const main = document.querySelector('main');
    if (!main) return null;
    const h1 = main.querySelector('h1');
    let best = null;
    let bestLen = 0;

    const shell = document.createElement('div');
    for (const child of Array.from(main.children)) {
      if (childHasPromoLabel(child)) break;
      shell.appendChild(child.cloneNode(true));
    }
    const shellLen = (shell.textContent || '').replace(/\s/g, '').length;
    if (shellLen >= 120) {
      best = shell;
      bestLen = shellLen;
    }

    const candidates = [];
    if (h1) {
      let node = h1.parentElement;
      while (node && node !== main) {
        candidates.push(node);
        node = node.parentElement;
      }
    }
    candidates.push(main);
    for (const source of candidates) {
      const clone = source.cloneNode(true);
      prunePromoTail(clone);
      clone.querySelectorAll('nav,header,footer,form,button,script,style,noscript').forEach((el) => el.remove());
      const text = (clone.textContent || '').replace(/\s/g, '');
      const promoChars = Array.from(clone.querySelectorAll('h2,h3,h4,p')).reduce((n, el) => {
        const t = (el.textContent || '').replace(/\s+/g, ' ').trim();
        return n + (isPromoLabel(t) ? t.length : 0);
      }, 0);
      const score = text.length - promoChars * 2;
      if (score > bestLen) {
        bestLen = text.length;
        best = clone;
      }
    }

    if (best) {
      prunePromoTail(best);
      best.querySelectorAll('nav,header,footer,form,button,script,style,noscript').forEach((el) => el.remove());
    }
    if (!best || bestLen < 120) return null;
    const title = (h1?.textContent || document.title || '').replace(/\s+/g, ' ').trim();
    const timeEl = main.querySelector('time');
    const publishedTime = timeEl ? timeEl.getAttribute('datetime') || timeEl.textContent : null;
    return { title, html: best.innerHTML, publishedTime, byline: null, source: 'dom' };
  }

  function textIncludes(node, needle) {
    return String(node?.textContent ?? '').includes(needle);
  }

  function setCheckboxChecked(input) {
    if (!input || input.checked) return false;
    const proto = window.HTMLInputElement?.prototype;
    const setter = proto && Object.getOwnPropertyDescriptor(proto, 'checked')?.set;
    if (setter) setter.call(input, true);
    else input.checked = true;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.click();
    input.closest('label')?.click();
    return true;
  }

  function clickButtonMatching(re) {
    const btn = Array.from(document.querySelectorAll('button,a,[role="button"]')).find((el) => {
      const t = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
      return re.test(t) && !el.disabled;
    });
    if (!btn) return false;
    btn.click();
    return true;
  }

  function acceptNhkConsentIfPresent() {
    const bodyText = document.body?.textContent ?? '';
    const onConsent =
      bodyText.includes('ご利用にあたって') ||
      bodyText.includes('内容について確認しました') ||
      bodyText.includes('ご利用意向の確認');
    if (!onConsent) return false;

    if (clickButtonMatching(/確認しました|I understand/i)) return true;

    const checkbox = document.querySelector('input[type="checkbox"]');
    if (checkbox) setCheckboxChecked(checkbox);

    if (clickButtonMatching(/^次へ$/)) return true;

    const nextBtn = Array.from(document.querySelectorAll('button')).find((btn) => {
      const t = (btn.textContent ?? '').replace(/\s+/g, ' ').trim();
      return t === '次へ' || t.endsWith('次へ');
    });
    if (nextBtn && !nextBtn.disabled) {
      nextBtn.click();
      return true;
    }
    return !!checkbox;
  }

  function looksHydrated(text) {
    const compact = String(text || '').replace(/\s+/g, '');
    if (compact.length >= MIN_FULL_LEN + 400) return true;
    return HYDRATION_MARKERS.some((m) => compact.includes(m));
  }

  const consentHandled = acceptNhkConsentIfPresent();
  if (consentHandled) {
    return { ready: false, consent: true, textLen: 0 };
  }

  const main = document.querySelector('main');
  const plain = main ? (main.innerText || '') : '';
  if (!looksHydrated(plain)) {
    return { ready: false, textLen: plain.replace(/\s/g, '').length };
  }

  const fromReact = extractFromReact();
  const picked = fromReact || extractFromDom();
  if (!picked || !picked.html || picked.html.replace(/<[^>]+>/g, '').replace(/\s/g, '').length < 120) {
    return { ready: false, textLen: plain.replace(/\s/g, '').length, reason: 'empty' };
  }

  return {
    ready: true,
    title: picked.title,
    html: picked.html,
    publishedTime: picked.publishedTime,
    byline: picked.byline,
    source: picked.source,
    textLen: picked.html.replace(/<[^>]+>/g, '').replace(/\s/g, '').length,
    url: location.href,
  };
})()`;