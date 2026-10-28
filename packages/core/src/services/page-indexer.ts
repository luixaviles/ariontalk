import { isElementVisible, makeVisibilityChecker } from './dom-visibility.js';

const MAX_TEXT_CHARS = 6000;
const MIN_IMG_DIMENSION = 50;

const SKIP_TAGS = new Set([
  'NAV', 'HEADER', 'FOOTER', 'ASIDE', 'SCRIPT', 'STYLE', 'NOSCRIPT',
  'SVG', 'IFRAME', 'FORM', 'INPUT', 'BUTTON', 'SELECT', 'TEXTAREA',
]);

const DEFAULT_IMAGE_HEADER = 'Images on this page (actual image data is sent separately):';

export interface IndexedImage {
  id: string;
  element: HTMLImageElement;
  /** Alt text, else title, aria-label, or figcaption. Null when none. */
  caption: string | null;
}

export interface PageIndex {
  annotatedText: string;
  elementMap: Map<string, Element[]>;
  images: IndexedImage[];
}

export interface PageIndexerOptions {
  /** Include [img-N] entries in the annotated text. Default: true. */
  includeImages?: boolean;
  /** Header line above the image list. Default keeps the cloud engine's wording. */
  imageHeader?: string;
  /** Text after "[img-N] " for each image. Default: alt text / caption / "(no alt text)". */
  describeImage?: (image: IndexedImage) => string;
}

/**
 * Assigns stable IDs to page sections and images, producing annotated text
 * that the model can reference via tool calls (e.g. "sec-1", "img-2").
 */
export class PageIndexerService {
  private cachedIndex: PageIndex | null = null;
  private observer: MutationObserver | null = null;
  private includeImages: boolean;
  private imageHeader: string;
  private describeImage?: (image: IndexedImage) => string;

  constructor(options?: PageIndexerOptions) {
    this.includeImages = options?.includeImages ?? true;
    this.imageHeader = options?.imageHeader ?? DEFAULT_IMAGE_HEADER;
    this.describeImage = options?.describeImage;
    this.setupMutationObserver();
  }

  /** Set header and per-image describer; a key set to undefined restores the default. */
  setImageFormat(format: { header?: string; describeImage?: PageIndexerOptions['describeImage'] }): void {
    let changed = false;
    if ('header' in format) {
      const next = format.header ?? DEFAULT_IMAGE_HEADER;
      if (next !== this.imageHeader) { this.imageHeader = next; changed = true; }
    }
    if ('describeImage' in format) {
      if (format.describeImage !== this.describeImage) { this.describeImage = format.describeImage; changed = true; }
    }
    if (changed) this.invalidate();
  }

  /** Build (or return cached) annotated index of the page. */
  buildIndex(): PageIndex {
    if (this.cachedIndex !== null) return this.cachedIndex;

    const elementMap = new Map<string, Element[]>();
    const sections: Array<{ id: string; headingText: string; bodyText: string }> = [];

    const mainEl = this.findRoot();

    // Index sections by headings
    const headings = mainEl.querySelectorAll('h1, h2, h3, h4, h5, h6');
    let secIdx = 0;
    let capturedBodyChars = 0;

    for (const heading of headings) {
      if (!this.isVisible(heading)) continue;

      secIdx++;
      const id = `sec-${secIdx}`;

      const sectionEls = this.collectSectionElements(heading);
      elementMap.set(id, sectionEls);

      const headingText = (heading.textContent || '').trim();
      const bodyText = this.extractSectionBody(heading);
      capturedBodyChars += bodyText.length;

      sections.push({ id, headingText, bodyText });
    }

    const fullText = this.extractTextFromElement(mainEl);
    const MIN_SECTION_COVERAGE = 0.5;
    let fallbackContent = '';

    // If no headings found, extract body text as sec-1
    if (secIdx === 0) {
      if (fullText) {
        elementMap.set('sec-1', [mainEl]);
        sections.push({
          id: 'sec-1',
          headingText: 'Main content',
          bodyText: fullText,
        });
      }
    } else if (fullText.length > 0 && capturedBodyChars < MIN_SECTION_COVERAGE * fullText.length) {
      // Headings found but sectioning captured a minority of the visible text
      // (page builders, deeply nested / partial-capture layouts). Keep the
      // [sec-N] heading anchors already emitted (for highlights); append the
      // full visible text so the model has the actual content.
      fallbackContent = fullText;
    }

    // Index images
    const imageParts: string[] = [];
    const images: IndexedImage[] = [];
    if (this.includeImages) {
      const imgs = Array.from(mainEl.querySelectorAll('img'));
      const candidates = imgs.filter((img) => {
        if (!this.imageMeetsMinSize(img)) return false;
        if (!img.src || img.src.startsWith('data:')) return false;
        return true;
      });

      if (candidates.length > 0) {
        imageParts.push(this.imageHeader);
        let imgIdx = 0;
        for (const img of candidates) {
          imgIdx++;
          const id = `img-${imgIdx}`;
          elementMap.set(id, [img]);
          const caption = this.extractImageCaption(img);
          const indexedImg: IndexedImage = { id, element: img, caption };
          images.push(indexedImg);

          const desc = this.describeImage
            ? this.describeImage(indexedImg)
            : this.defaultDescribeImage(indexedImg);
          imageParts.push(`[${id}] ${desc}`);
        }
      }
    }

    const formatIndexText = (bodyCap?: number): string => {
      const parts: string[] = [];
      for (const s of sections) {
        parts.push(`[${s.id}] ${s.headingText}`);
        if (s.bodyText) {
          const body = bodyCap !== undefined && s.bodyText.length > bodyCap
            ? s.bodyText.slice(0, bodyCap) + '...'
            : s.bodyText;
          parts.push(body);
        }
        parts.push('');
      }

      if (fallbackContent) {
        parts.push('[content] Full page text');
        const fb = bodyCap !== undefined && fallbackContent.length > bodyCap
          ? fallbackContent.slice(0, bodyCap) + '...'
          : fallbackContent;
        parts.push(fb);
        parts.push('');
      }

      if (imageParts.length > 0) {
        parts.push(...imageParts);
      }

      return parts.join('\n');
    };

    let annotatedText = formatIndexText();

    if (annotatedText.length > MAX_TEXT_CHARS && sections.length > 0) {
      // Allocate available character budget across sections with body text.
      // Minimum cap of 120 chars ensures every section has meaningful context.
      const sectionsWithBody = sections.filter((s) => s.bodyText.length > 0).length + (fallbackContent ? 1 : 0);
      const overhead = formatIndexText(0).length;
      const availableBodyBudget = Math.max(0, MAX_TEXT_CHARS - overhead);
      const perSectionCap = Math.max(120, Math.floor(availableBodyBudget / Math.max(1, sectionsWithBody)));
      annotatedText = formatIndexText(perSectionCap);

      // Guardrail if headers alone or minimum caps exceed limit
      if (annotatedText.length > MAX_TEXT_CHARS) {
        annotatedText = annotatedText.slice(0, MAX_TEXT_CHARS) + '...';
      }
    }

    this.cachedIndex = { annotatedText, elementMap, images };
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

  /** Collect the heading and all sibling elements until the next heading or heading container. */
  private collectSectionElements(heading: Element): Element[] {
    const siblingRoot = this.getSiblingRoot(heading);

    const els: Element[] = [siblingRoot];
    let sibling = siblingRoot.nextElementSibling;

    while (sibling) {
      if (this.isHeadingBoundary(sibling)) break;
      if (!SKIP_TAGS.has(sibling.tagName) && this.isVisible(sibling)) {
        els.push(sibling);
      }
      sibling = sibling.nextElementSibling;
    }

    return els;
  }

  /** Extract text between this heading and the next heading or heading container. */
  private extractSectionBody(heading: Element): string {
    const siblingRoot = this.getSiblingRoot(heading);
    const chunks: string[] = [];
    let sibling = siblingRoot.nextElementSibling;

    while (sibling) {
      if (this.isHeadingBoundary(sibling)) break;
      if (!SKIP_TAGS.has(sibling.tagName) && this.isVisible(sibling)) {
        const text = this.extractTextFromElement(sibling);
        if (text.length > 1) chunks.push(text);
      }
      sibling = sibling.nextElementSibling;
    }

    return chunks.join(' ');
  }

  private extractTextFromElement(root: Element): string {
    const isVisible = makeVisibilityChecker();
    const chunks: string[] = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        if (SKIP_TAGS.has(parent.tagName)) return NodeFilter.FILTER_REJECT;
        if (!isVisible(parent)) return NodeFilter.FILTER_REJECT;
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
   * Check whether a div is a "thin wrapper" around a heading: a container
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
   * Check whether an element represents a heading boundary.
   * Direct headings, thin heading wrappers, and containers that introduce
   * subsequent headings are treated as section boundaries.
   */
  private isHeadingBoundary(el: Element): boolean {
    if (/^H[1-6]$/.test(el.tagName)) {
      return true;
    }

    if (this.isHeadingWrapper(el)) {
      return true;
    }

    if (el.querySelector && el.querySelector('h1, h2, h3, h4, h5, h6')) {
      return true;
    }

    return false;
  }

  private isVisible(el: Element): boolean {
    return isElementVisible(el);
  }

  private imageMeetsMinSize(img: HTMLImageElement): boolean {
    if (img.naturalWidth > 0 || img.naturalHeight > 0) {
      return img.naturalWidth >= MIN_IMG_DIMENSION && img.naturalHeight >= MIN_IMG_DIMENSION;
    }
    const widthAttr = parseInt(img.getAttribute('width') || '0', 10);
    const heightAttr = parseInt(img.getAttribute('height') || '0', 10);
    if (widthAttr > 0 && heightAttr > 0) {
      return widthAttr >= MIN_IMG_DIMENSION && heightAttr >= MIN_IMG_DIMENSION;
    }
    if (typeof img.getBoundingClientRect === 'function') {
      const rect = img.getBoundingClientRect();
      return rect.width >= MIN_IMG_DIMENSION && rect.height >= MIN_IMG_DIMENSION;
    }
    return false;
  }

  private extractImageCaption(img: HTMLImageElement): string | null {
    const alt = (img.alt || '').trim();
    if (alt) return alt;
    const title = (img.title || '').trim();
    if (title) return title;
    const ariaLabel = (img.getAttribute('aria-label') || '').trim();
    if (ariaLabel) return ariaLabel;
    const figcaption = img.closest('figure')?.querySelector('figcaption')?.textContent?.trim();
    if (figcaption) return figcaption;
    return null;
  }

  private defaultDescribeImage(image: IndexedImage): string {
    if (image.element.alt) {
      return `alt text: "${image.element.alt}"`;
    }
    if (image.caption) {
      return `caption: "${image.caption}"`;
    }
    return '(no alt text)';
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
