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
    const siblingRoot = this.getSiblingRoot(heading);

    const els: Element[] = [siblingRoot];
    let sibling = siblingRoot.nextElementSibling;

    while (sibling) {
      if (this.isHeadingBoundary(sibling, level)) break;
      els.push(sibling);
      sibling = sibling.nextElementSibling;
    }

    return els;
  }

  /** Extract text between this heading and the next sibling heading of same or higher level. */
  private extractSectionBody(heading: Element): string {
    const level = parseInt(heading.tagName[1], 10);
    const siblingRoot = this.getSiblingRoot(heading);
    const chunks: string[] = [];
    let sibling = siblingRoot.nextElementSibling;

    while (sibling) {
      if (this.isHeadingBoundary(sibling, level)) break;
      if (!SKIP_TAGS.has(sibling.tagName)) {
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

  /**
   * Check whether a div is a "thin wrapper" around a heading — a container
   * added by doc frameworks (Starlight, Docusaurus, etc.) for anchor links.
   *
   * A thin wrapper contains only the heading itself plus decorative elements
   * (anchors, spans). Content elements like <p>, <ul>, <div> disqualify it.
   */
  private isHeadingWrapper(div: Element, heading?: Element): boolean {
    if (div.tagName !== 'DIV') return false;

    const children = div.children;
    let hasHeading = false;

    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      if (/^H[1-6]$/.test(child.tagName)) {
        if (heading && child !== heading) return false;
        hasHeading = true;
      } else if (child.tagName !== 'A' && child.tagName !== 'SPAN') {
        return false;
      }
    }

    return hasHeading;
  }

  /**
   * If the heading is wrapped in a non-semantic container (e.g. Starlight's
   * `<div class="sl-heading-wrapper">`), return the wrapper so that sibling
   * traversal reaches the actual section content instead of staying inside
   * the wrapper.
   */
  private getSiblingRoot(heading: Element): Element {
    const parent = heading.parentElement;
    if (!parent) return heading;

    if (parent === this.findRoot()) return heading;

    if (this.isHeadingWrapper(parent, heading)) return parent;

    return heading;
  }

  /**
   * Check whether an element represents a heading boundary at or above
   * the given level. Handles both bare headings and wrapped headings
   * (e.g. `<div class="sl-heading-wrapper"><h2>...</h2></div>`).
   *
   * For wrapped headings, the div must be a thin wrapper (same heuristic
   * as getSiblingRoot). Content divs that happen to contain headings
   * (cards, panels, etc.) are NOT treated as boundaries.
   */
  private isHeadingBoundary(el: Element, level: number): boolean {
    if (/^H[1-6]$/.test(el.tagName)) {
      return parseInt(el.tagName[1], 10) <= level;
    }

    if (this.isHeadingWrapper(el)) {
      const children = el.children;
      for (let i = 0; i < children.length; i++) {
        const child = children[i];
        if (/^H[1-6]$/.test(child.tagName)) {
          return parseInt(child.tagName[1], 10) <= level;
        }
      }
    }

    return false;
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
