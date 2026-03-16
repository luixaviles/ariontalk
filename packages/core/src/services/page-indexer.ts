const MAX_TEXT_CHARS = 6000;
const MIN_IMG_DIMENSION = 50;

const SKIP_TAGS = new Set([
  'NAV', 'HEADER', 'FOOTER', 'ASIDE', 'SCRIPT', 'STYLE', 'NOSCRIPT',
  'SVG', 'IFRAME', 'FORM', 'INPUT', 'BUTTON', 'SELECT', 'TEXTAREA',
]);

export interface PageIndex {
  annotatedText: string;
  elementMap: Map<string, Element[]>;
}

/**
 * Assigns stable IDs to page sections and images, producing annotated text
 * that the model can reference via tool calls (e.g. "sec-1", "img-2").
 */
export class PageIndexerService {
  private cachedIndex: PageIndex | null = null;
  private observer: MutationObserver | null = null;

  constructor() {
    this.setupMutationObserver();
  }

  /** Build (or return cached) annotated index of the page. */
  buildIndex(): PageIndex {
    if (this.cachedIndex !== null) return this.cachedIndex;

    const elementMap = new Map<string, Element[]>();
    const parts: string[] = [];

    const mainEl = this.findRoot();

    // Index sections by headings
    const headings = mainEl.querySelectorAll('h1, h2, h3, h4, h5, h6');
    let secIdx = 0;

    for (const heading of headings) {
      if (!this.isVisible(heading)) continue;

      secIdx++;
      const id = `sec-${secIdx}`;

      const sectionEls = this.collectSectionElements(heading);
      elementMap.set(id, sectionEls);

      const headingText = (heading.textContent || '').trim();
      const bodyText = this.extractSectionBody(heading);

      parts.push(`[${id}] ${headingText}`);
      if (bodyText) parts.push(bodyText);
      parts.push('');
    }

    // If no headings found, extract body text as sec-1
    if (secIdx === 0) {
      const bodyText = this.extractTextFromElement(mainEl);
      if (bodyText) {
        elementMap.set('sec-1', [mainEl]);
        parts.push('[sec-1] Main content');
        parts.push(bodyText);
        parts.push('');
      }
    }

    // Index images
    const imgs = Array.from(mainEl.querySelectorAll('img'));
    const candidates = imgs.filter((img) => {
      if (img.naturalWidth < MIN_IMG_DIMENSION || img.naturalHeight < MIN_IMG_DIMENSION) return false;
      if (!img.src || img.src.startsWith('data:')) return false;
      return true;
    });

    if (candidates.length > 0) {
      parts.push('Images on this page (actual image data is sent separately):');
      let imgIdx = 0;
      for (const img of candidates) {
        imgIdx++;
        const id = `img-${imgIdx}`;
        elementMap.set(id, [img]);
        const altNote = img.alt
          ? `alt text: "${img.alt}"`
          : '(no alt text)';
        parts.push(`[${id}] ${altNote}`);
      }
    }

    let annotatedText = parts.join('\n');
    if (annotatedText.length > MAX_TEXT_CHARS) {
      annotatedText = annotatedText.slice(0, MAX_TEXT_CHARS) + '...';
    }

    this.cachedIndex = { annotatedText, elementMap };
    return this.cachedIndex;
  }

  destroy(): void {
    this.observer?.disconnect();
    this.observer = null;
    this.cachedIndex = null;
  }

  /** Invalidate cache so next buildIndex() re-scans the DOM. */
  invalidate(): void {
    this.cachedIndex = null;
  }

  private findRoot(): Element {
    return (
      document.querySelector('main') ||
      document.querySelector('article') ||
      document.querySelector('[role="main"]') ||
      document.body
    );
  }

  /** Collect the heading and all sibling elements until the next heading of same or higher level. */
  private collectSectionElements(heading: Element): Element[] {
    const level = parseInt(heading.tagName[1], 10);
    const els: Element[] = [heading];
    let sibling = heading.nextElementSibling;

    while (sibling) {
      const tag = sibling.tagName;
      if (/^H[1-6]$/.test(tag) && parseInt(tag[1], 10) <= level) break;
      els.push(sibling);
      sibling = sibling.nextElementSibling;
    }

    return els;
  }

  /** Extract text between this heading and the next sibling heading of same or higher level. */
  private extractSectionBody(heading: Element): string {
    const level = parseInt(heading.tagName[1], 10);
    const chunks: string[] = [];
    let sibling = heading.nextElementSibling;

    while (sibling) {
      const tag = sibling.tagName;
      // Stop at next heading of same or higher level
      if (/^H[1-6]$/.test(tag) && parseInt(tag[1], 10) <= level) break;
      if (!SKIP_TAGS.has(tag)) {
        const text = (sibling.textContent || '').trim();
        if (text.length > 1) chunks.push(text);
      }
      sibling = sibling.nextElementSibling;
    }

    return chunks.join(' ');
  }

  private extractTextFromElement(root: Element): string {
    const chunks: string[] = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        if (SKIP_TAGS.has(parent.tagName)) return NodeFilter.FILTER_REJECT;
        if (parent.hasAttribute('hidden') || parent.getAttribute('aria-hidden') === 'true') {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      },
    });

    let node: Node | null;
    while ((node = walker.nextNode())) {
      const text = (node.textContent || '').trim();
      if (text.length > 1) chunks.push(text);
    }

    return chunks.join(' ');
  }

  private isVisible(el: Element): boolean {
    if ((el as HTMLElement).hidden) return false;
    if (el.getAttribute('aria-hidden') === 'true') return false;
    const cls = el.className;
    if (typeof cls === 'string' && /\b(hidden|invisible|d-none)\b/i.test(cls)) return false;
    return true;
  }

  private setupMutationObserver(): void {
    if (typeof MutationObserver === 'undefined') return;

    let debounceId: ReturnType<typeof setTimeout> | null = null;

    this.observer = new MutationObserver(() => {
      if (debounceId) clearTimeout(debounceId);
      debounceId = setTimeout(() => {
        this.cachedIndex = null;
      }, 2000);
    });

    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }
}
