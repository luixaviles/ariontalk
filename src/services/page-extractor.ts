import type { ImageContext } from '../types.js';

const MAX_TEXT_CHARS = 6000; // ~1,500 tokens
const MAX_IMAGES = 2;
const IMG_MAX_SIZE = 512;
const MIN_IMG_DIMENSION = 50; // skip tiny icons/trackers

const SKIP_TAGS = new Set([
  'NAV', 'HEADER', 'FOOTER', 'ASIDE', 'SCRIPT', 'STYLE', 'NOSCRIPT',
  'SVG', 'IFRAME', 'FORM', 'INPUT', 'BUTTON', 'SELECT', 'TEXTAREA',
]);

/**
 * Extracts page content (text + images) for use as AI context.
 */
export class PageExtractorService {
  private cachedText: string | null = null;
  private cachedImages: ImageContext[] | null = null;
  private observer: MutationObserver | null = null;

  constructor() {
    this.setupMutationObserver();
  }

  /** Returns formatted page text summary within token budget. */
  extractText(): string {
    if (this.cachedText !== null) return this.cachedText;

    const parts: string[] = [];

    // Metadata
    const title = document.title;
    if (title) parts.push(`Page title: ${title}`);

    const description =
      document.querySelector<HTMLMetaElement>('meta[name="description"]')?.content ||
      document.querySelector<HTMLMetaElement>('meta[property="og:description"]')?.content;
    if (description) parts.push(`Description: ${description}`);

    // Structured data (JSON-LD)
    const jsonLd = document.querySelector('script[type="application/ld+json"]');
    if (jsonLd?.textContent) {
      try {
        const data = JSON.parse(jsonLd.textContent);
        const headline = data.headline || data.name;
        if (headline) parts.push(`Headline: ${headline}`);
        if (data.description) parts.push(`Summary: ${data.description}`);
      } catch { /* ignore malformed JSON-LD */ }
    }

    // Main content text
    const mainEl =
      document.querySelector('main') ||
      document.querySelector('article') ||
      document.querySelector('[role="main"]') ||
      document.body;

    const textContent = this.extractTextFromElement(mainEl);
    if (textContent) parts.push(`\nPage content:\n${textContent}`);

    const full = parts.join('\n');
    this.cachedText = full.length > MAX_TEXT_CHARS ? full.slice(0, MAX_TEXT_CHARS) + '...' : full;
    return this.cachedText;
  }

  /** Extracts top images as Blobs with alt text descriptions. */
  async extractImages(): Promise<ImageContext[]> {
    if (this.cachedImages !== null) return this.cachedImages;

    const mainEl =
      document.querySelector('main') ||
      document.querySelector('article') ||
      document.querySelector('[role="main"]') ||
      document.body;

    const imgs = Array.from(mainEl.querySelectorAll('img'));
    const candidates = imgs.filter((img) => {
      if (img.naturalWidth < MIN_IMG_DIMENSION || img.naturalHeight < MIN_IMG_DIMENSION) return false;
      if (!img.src || img.src.startsWith('data:')) return false;
      return true;
    });

    const results: ImageContext[] = [];

    for (const img of candidates.slice(0, MAX_IMAGES)) {
      try {
        const blob = await this.imageToBlob(img);
        if (blob) {
          results.push({ blob, alt: img.alt || '', src: img.src });
        }
      } catch {
        // CORS or other failure — fall back to alt text only
        if (img.alt) {
          results.push({ blob: new Blob(), alt: img.alt, src: img.src });
        }
      }
    }

    this.cachedImages = results;
    return results;
  }

  destroy(): void {
    this.observer?.disconnect();
    this.observer = null;
    this.invalidateCache();
  }

  private extractTextFromElement(root: Element): string {
    const chunks: string[] = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        if (SKIP_TAGS.has(parent.tagName)) return NodeFilter.FILTER_REJECT;

        const style = getComputedStyle(parent);
        if (style.display === 'none' || style.visibility === 'hidden') {
          return NodeFilter.FILTER_REJECT;
        }

        // Skip ad containers (common class patterns)
        const cls = parent.className;
        if (typeof cls === 'string' && /\b(ad[s-]?|sponsor|promo)\b/i.test(cls)) {
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

  private async imageToBlob(img: HTMLImageElement): Promise<Blob | null> {
    // Try fetching same-origin image as blob
    try {
      const url = new URL(img.src, location.href);
      if (url.origin === location.origin) {
        const resp = await fetch(img.src);
        return await resp.blob();
      }
    } catch { /* fall through to canvas */ }

    // Canvas fallback (requires CORS headers on image)
    return new Promise((resolve) => {
      const canvas = document.createElement('canvas');
      const scale = Math.min(1, IMG_MAX_SIZE / Math.max(img.naturalWidth, img.naturalHeight));
      canvas.width = img.naturalWidth * scale;
      canvas.height = img.naturalHeight * scale;

      const ctx = canvas.getContext('2d');
      if (!ctx) { resolve(null); return; }

      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) => resolve(blob),
        'image/jpeg',
        0.7,
      );
    });
  }

  private invalidateCache(): void {
    this.cachedText = null;
    this.cachedImages = null;
  }

  private setupMutationObserver(): void {
    if (typeof MutationObserver === 'undefined') return;

    let debounceId: ReturnType<typeof setTimeout> | null = null;

    this.observer = new MutationObserver(() => {
      if (debounceId) clearTimeout(debounceId);
      debounceId = setTimeout(() => {
        this.invalidateCache();
      }, 2000);
    });

    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }
}
