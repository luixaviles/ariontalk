import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PageIndexerService } from '../page-indexer.js';

describe('PageIndexerService', () => {
  let indexer: PageIndexerService;

  beforeEach(() => {
    document.body.innerHTML = '';
    indexer = new PageIndexerService();
  });

  afterEach(() => {
    indexer.destroy();
  });

  it('rescues Elementor-style non-sibling layouts via ratio fallback', () => {
    document.body.innerHTML = `
      <main>
        <section class="hero">
          <div class="elementor-widget-heading"><h1>Getting Started</h1></div>
        </section>
        <section class="content">
          <div class="elementor-widget-heading">
            <div class="elementor-heading-title">Platform Features:</div>
          </div>
          <div class="elementor-widget-text">
            <p>Priority API access and developer tooling.</p>
            <p>Automated builds and virtual sandbox environments.</p>
          </div>
        </section>
      </main>
    `;

    const index = indexer.buildIndex();

    expect(index.elementMap.has('sec-1')).toBe(true);
    expect(index.annotatedText).toContain('[sec-1] Getting Started');
    expect(index.annotatedText).toContain('[content] Full page text');
    expect(index.annotatedText).toContain('Platform Features:');
    expect(index.annotatedText).toContain('Priority API access');
  });

  it('rescues partial-capture layouts when captured text is below 50% ratio', () => {
    document.body.innerHTML = `
      <main>
        <section class="intro">
          <div class="widget"><h1>Main Title</h1></div>
          <p>Short intro.</p>
        </section>
        <section class="body">
          <div class="widget">
            <p>This is a huge amount of detailed content that lives in a separate
               section branch, unreachable from the heading's sibling walk. It provides
               extensive explanation about the service and its many features and benefits.</p>
          </div>
        </section>
      </main>
    `;

    const index = indexer.buildIndex();

    expect(index.annotatedText).toContain('[content] Full page text');
    expect(index.annotatedText).toContain('huge amount of detailed content');
  });

  it('preserves structured section output on docs sites without triggering fallback', () => {
    document.body.innerHTML = `
      <main>
        <h1>Installation</h1>
        <p>Step 1: Run pnpm install to setup all workspace dependencies cleanly.</p>
        <h2>Configuration</h2>
        <p>Step 2: Add environment variables to your local config file.</p>
      </main>
    `;

    const index = indexer.buildIndex();

    expect(index.annotatedText).toContain('[sec-1] Installation');
    expect(index.annotatedText).toContain('[sec-2] Configuration');
    expect(index.annotatedText).not.toContain('[content] Full page text');
  });

  it('respects inline styles and HTML5 visibility attributes', () => {
    document.body.innerHTML = `
      <main>
        <p>Visible content</p>
        <p style="display: none">Hidden by display none</p>
        <p hidden>Hidden by hidden attribute</p>
        <p aria-hidden="true">Hidden by aria-hidden</p>
        <p style="opacity: 0">Animation pending content</p>
      </main>
    `;

    const index = indexer.buildIndex();

    expect(index.annotatedText).toContain('Visible content');
    expect(index.annotatedText).toContain('Animation pending content');
    expect(index.annotatedText).not.toContain('Hidden by display none');
    expect(index.annotatedText).not.toContain('Hidden by hidden attribute');
    expect(index.annotatedText).not.toContain('Hidden by aria-hidden');
  });

  it('excludes hidden content from section bodies (visibility-aware)', () => {
    document.body.innerHTML = `
      <main>
        <h1>Section Heading</h1>
        <p>Visible body text here.</p>
        <p style="display: none">Hidden body text that must not appear.</p>
      </main>
    `;

    const index = indexer.buildIndex();

    expect(index.annotatedText).toContain('Visible body text here.');
    expect(index.annotatedText).not.toContain('Hidden body text that must not appear.');
  });

  it('gates image indexing with includeImages option while preserving section numbering', () => {
    document.body.innerHTML = `
      <main>
        <h1>Section One</h1>
        <p>Text one.</p>
        <img src="https://example.com/a.png" alt="Image A" width="100" height="100">
        <h2>Section Two</h2>
        <p>Text two.</p>
      </main>
    `;

    // Mock image dimensions for jsdom
    const imgs = document.querySelectorAll('img');
    imgs.forEach((img) => {
      Object.defineProperty(img, 'naturalWidth', { value: 100 });
      Object.defineProperty(img, 'naturalHeight', { value: 100 });
    });

    const indexerWithImages = new PageIndexerService({ includeImages: true });
    const indexWithImages = indexerWithImages.buildIndex();
    expect(indexWithImages.annotatedText).toContain('[sec-1] Section One');
    expect(indexWithImages.annotatedText).toContain('[sec-2] Section Two');
    expect(indexWithImages.annotatedText).toContain('[img-1] alt text: "Image A"');
    indexerWithImages.destroy();

    const indexerNoImages = new PageIndexerService({ includeImages: false });
    const indexNoImages = indexerNoImages.buildIndex();
    expect(indexNoImages.annotatedText).toContain('[sec-1] Section One');
    expect(indexNoImages.annotatedText).toContain('[sec-2] Section Two');
    expect(indexNoImages.annotatedText).not.toContain('img-1');
    expect(indexNoImages.annotatedText).not.toContain('Images on this page');
    indexerNoImages.destroy();
  });

  it('does not swallow container siblings containing subsequent headings', () => {
    document.body.innerHTML = `
      <main>
        <h1>Page Title</h1>
        <p class="byline">Byline text.</p>
        <article>
          <h2>First Topic</h2>
          <p>Topic 1 text.</p>
          <h2>Second Topic</h2>
          <p>Topic 2 text.</p>
        </article>
      </main>
    `;

    const index = indexer.buildIndex();

    expect(index.elementMap.get('sec-1')?.map((el) => el.tagName)).toEqual(['H1', 'P']);
    expect(index.annotatedText).toContain('[sec-1] Page Title');
    expect(index.annotatedText).toContain('[sec-2] First Topic');
    expect(index.annotatedText).toContain('[sec-3] Second Topic');
    const sec1Text = index.annotatedText.split('[sec-2]')[0];
    expect(sec1Text).not.toContain('First Topic');
    expect(sec1Text).toContain('Byline text.');
  });

  it('keeps flat hierarchical headings mutually exclusive and non-overlapping', () => {
    document.body.innerHTML = `
      <main>
        <h1>Document Title</h1>
        <p>Introductory paragraph.</p>
        <h2>Major Section</h2>
        <p>Section overview.</p>
        <h3>Sub Topic</h3>
        <p>Detailed subtopic.</p>
        <h2>Next Major Section</h2>
        <p>Next section overview.</p>
      </main>
    `;

    const index = indexer.buildIndex();

    expect(index.elementMap.get('sec-1')?.map((el) => el.tagName)).toEqual(['H1', 'P']);
    expect(index.elementMap.get('sec-2')?.map((el) => el.tagName)).toEqual(['H2', 'P']);
    expect(index.elementMap.get('sec-3')?.map((el) => el.tagName)).toEqual(['H3', 'P']);
    expect(index.elementMap.get('sec-4')?.map((el) => el.tagName)).toEqual(['H2', 'P']);
  });

  it('preserves all section headers under budget pressure without dropping trailing sections', () => {
    document.body.innerHTML = `
      <main>
        <h1>Section One</h1>
        <p>${'A'.repeat(8000)}</p>
        <h2>Section Two</h2>
        <p>Important trailing content.</p>
        <h2>Section Three</h2>
        <p>Final trailing content.</p>
      </main>
    `;

    const index = indexer.buildIndex();

    expect(index.annotatedText).toContain('[sec-1] Section One');
    expect(index.annotatedText).toContain('[sec-2] Section Two');
    expect(index.annotatedText).toContain('[sec-3] Section Three');
    expect(index.annotatedText).toContain('Important trailing content.');
    expect(index.annotatedText).toContain('Final trailing content.');
    expect(index.annotatedText.length).toBeLessThanOrEqual(6003);
  });

  it('filters out non-content and hidden tags from collected section elements', () => {
    document.body.innerHTML = `
      <main>
        <h1>Visible Section</h1>
        <p>Visible paragraph.</p>
        <script>console.log("ignore");</script>
        <style>.ignore { color: red; }</style>
        <nav><a href="#">Skip link</a></nav>
        <p style="display: none">Hidden paragraph.</p>
        <h2>Next Section</h2>
        <p>Next paragraph.</p>
      </main>
    `;

    const index = indexer.buildIndex();

    const sec1Tags = index.elementMap.get('sec-1')?.map((el) => el.tagName);
    expect(sec1Tags).toEqual(['H1', 'P']);
  });

  it('populates images with id, element, and caption, null when none present', () => {
    document.body.innerHTML = `
      <main>
        <h1>Photos</h1>
        <img id="img1" src="/photo1.jpg" alt="A mountain landscape" width="100" height="100" />
        <img id="img2" src="/photo2.jpg" width="100" height="100" />
      </main>
    `;

    const index = indexer.buildIndex();

    expect(index.images).toHaveLength(2);
    expect(index.images[0]).toEqual({
      id: 'img-1',
      element: document.getElementById('img1'),
      caption: 'A mountain landscape',
    });
    expect(index.images[1]).toEqual({
      id: 'img-2',
      element: document.getElementById('img2'),
      caption: null,
    });
    expect(index.annotatedText).toContain('[img-1] alt text: "A mountain landscape"');
    expect(index.annotatedText).toContain('[img-2] (no alt text)');
  });

  it('indexes lazy image with width/height attributes when naturalWidth is 0', () => {
    document.body.innerHTML = `
      <main>
        <h1>Lazy Photos</h1>
        <img id="lazy" src="/lazy.jpg" alt="Deferred chart" width="200" height="150" loading="lazy" />
      </main>
    `;
    const imgEl = document.getElementById('lazy') as HTMLImageElement;
    Object.defineProperty(imgEl, 'naturalWidth', { value: 0 });
    Object.defineProperty(imgEl, 'naturalHeight', { value: 0 });

    const index = indexer.buildIndex();

    expect(index.images).toHaveLength(1);
    expect(index.images[0].id).toBe('img-1');
    expect(index.images[0].caption).toBe('Deferred chart');
    expect(index.annotatedText).toContain('[img-1] alt text: "Deferred chart"');
  });

  it('setImageFormat changes per-image line and invalidates cache', () => {
    document.body.innerHTML = `
      <main>
        <h1>Gallery</h1>
        <img src="/clean.jpg" alt="Clean image" width="100" height="100" />
      </main>
    `;

    const index1 = indexer.buildIndex();
    expect(index1.annotatedText).toContain('Images on this page (actual image data is sent separately):');
    expect(index1.annotatedText).toContain('[img-1] alt text: "Clean image"');

    indexer.setImageFormat({
      header: 'Attached images:',
      describeImage: (img) => `attached (id: ${img.id})`,
    });

    const index2 = indexer.buildIndex();
    expect(index2.annotatedText).toContain('Attached images:');
    expect(index2.annotatedText).toContain('[img-1] attached (id: img-1)');
    expect(index2.annotatedText).not.toContain('alt text: "Clean image"');
  });

  it('setImageFormat restores default when describeImage is undefined and keeps cache on empty object', () => {
    document.body.innerHTML = `
      <main>
        <h1>Reset Test</h1>
        <img src="/clean.jpg" alt="Clean image" width="100" height="100" />
      </main>
    `;

    indexer.setImageFormat({
      header: 'Attached images:',
      describeImage: (img) => `attached (id: ${img.id})`,
    });

    const index1 = indexer.buildIndex();
    expect(index1.annotatedText).toContain('[img-1] attached (id: img-1)');

    // Calling setImageFormat({}) changes nothing and keeps cache
    indexer.setImageFormat({});
    const indexSame = indexer.buildIndex();
    expect(indexSame).toBe(index1);

    // Calling with describeImage: undefined restores default alt text describer and invalidates cache
    indexer.setImageFormat({ describeImage: undefined, header: undefined });
    const index2 = indexer.buildIndex();
    expect(index2).not.toBe(index1);
    expect(index2.annotatedText).toContain('Images on this page (actual image data is sent separately):');
    expect(index2.annotatedText).toContain('[img-1] alt text: "Clean image"');
  });

  it('prints caption: when caption comes from figcaption fallback', () => {
    document.body.innerHTML = `
      <main>
        <h1>Figures</h1>
        <figure>
          <img src="/fig.jpg" width="120" height="100" />
          <figcaption>Diagram of the solar system</figcaption>
        </figure>
      </main>
    `;

    const index = indexer.buildIndex();

    expect(index.images).toHaveLength(1);
    expect(index.images[0].caption).toBe('Diagram of the solar system');
    expect(index.annotatedText).toContain('[img-1] caption: "Diagram of the solar system"');
  });
});
