import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PageExtractorService } from '../page-extractor.js';

describe('PageExtractorService', () => {
  let extractor: PageExtractorService;

  beforeEach(() => {
    document.body.innerHTML = '';
    extractor = new PageExtractorService();
  });

  afterEach(() => {
    extractor.destroy();
  });

  it('extracts text content from main elements including Elementor structures', () => {
    document.body.innerHTML = `
      <main>
        <div class="elementor-section elementor-invisible">
          <h1>Getting Started</h1>
          <p>The platform includes developer tools and SDK integrations.</p>
        </div>
      </main>
    `;

    const text = extractor.extractText();

    expect(text).toContain('Getting Started');
    expect(text).toContain('The platform includes developer tools and SDK integrations.');
  });

  it('filters hidden content while retaining animation-pending opacity 0 content', () => {
    document.body.innerHTML = `
      <main>
        <p>Visible prose</p>
        <p style="display: none">Hidden inline</p>
        <p hidden>Hidden attribute</p>
        <p aria-hidden="true">Hidden aria</p>
        <p style="opacity: 0">Pending animation</p>
      </main>
    `;

    const text = extractor.extractText();

    expect(text).toContain('Visible prose');
    expect(text).toContain('Pending animation');
    expect(text).not.toContain('Hidden inline');
    expect(text).not.toContain('Hidden attribute');
    expect(text).not.toContain('Hidden aria');
  });
});
