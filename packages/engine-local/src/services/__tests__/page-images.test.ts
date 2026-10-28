import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IndexedImage } from '@ariontalk/core';
import { preparePageImages } from '../page-images.js';

describe('preparePageImages', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('attaches loaded and clean image directly as element', async () => {
    const img = document.createElement('img');
    img.src = '/test.jpg';
    document.body.appendChild(img);

    Object.defineProperty(img, 'complete', { value: true });
    Object.defineProperty(img, 'naturalWidth', { value: 600 });
    Object.defineProperty(img, 'naturalHeight', { value: 400 });

    const images: IndexedImage[] = [{ id: 'img-1', element: img, caption: null }];
    const result = await preparePageImages(images, {
      isOriginClean: () => true,
    });

    expect(result.attached).toHaveLength(1);
    expect(result.attached[0].id).toBe('img-1');
    expect(result.attached[0].source).toBe(img);
    expect(result.skipped).toHaveLength(0);
  });

  it('skips image with naturalWidth 0 as not-loaded', async () => {
    const img = document.createElement('img');
    img.src = '/lazy.jpg';
    document.body.appendChild(img);

    Object.defineProperty(img, 'complete', { value: true });
    Object.defineProperty(img, 'naturalWidth', { value: 0 });
    Object.defineProperty(img, 'naturalHeight', { value: 0 });

    const images: IndexedImage[] = [{ id: 'img-1', element: img, caption: null }];
    const result = await preparePageImages(images);

    expect(result.attached).toHaveLength(0);
    expect(result.skipped).toEqual([{ id: 'img-1', reason: 'not-loaded' }]);
  });

  it('skips detached element as not-loaded', async () => {
    const img = document.createElement('img');
    img.src = '/detached.jpg';

    Object.defineProperty(img, 'complete', { value: true });
    Object.defineProperty(img, 'naturalWidth', { value: 400 });
    Object.defineProperty(img, 'naturalHeight', { value: 300 });

    const images: IndexedImage[] = [{ id: 'img-1', element: img, caption: null }];
    const result = await preparePageImages(images);

    expect(result.attached).toHaveLength(0);
    expect(result.skipped).toEqual([{ id: 'img-1', reason: 'not-loaded' }]);
  });

  it('skips tainted image and caches check across multiple calls', async () => {
    const img = document.createElement('img');
    img.src = '/cors.jpg';
    document.body.appendChild(img);

    Object.defineProperty(img, 'complete', { value: true });
    Object.defineProperty(img, 'naturalWidth', { value: 500 });
    Object.defineProperty(img, 'naturalHeight', { value: 500 });

    const cleanCheckSpy = vi.fn().mockReturnValue(false);
    const images: IndexedImage[] = [{ id: 'img-1', element: img, caption: null }];

    const result1 = await preparePageImages(images, { isOriginClean: cleanCheckSpy });
    expect(result1.skipped).toEqual([{ id: 'img-1', reason: 'tainted' }]);
    expect(cleanCheckSpy).toHaveBeenCalledTimes(1);

    const result2 = await preparePageImages(images, { isOriginClean: cleanCheckSpy });
    expect(result2.skipped).toEqual([{ id: 'img-1', reason: 'tainted' }]);
    expect(cleanCheckSpy).toHaveBeenCalledTimes(1);
  });

  it('downscales 3000px image to 1024px longer side and close() closes it', async () => {
    const img = document.createElement('img');
    img.src = '/huge.jpg';
    document.body.appendChild(img);

    Object.defineProperty(img, 'complete', { value: true });
    Object.defineProperty(img, 'naturalWidth', { value: 3000 });
    Object.defineProperty(img, 'naturalHeight', { value: 1500 });

    const fakeBitmap = {
      close: vi.fn(),
    } as any;

    const createBitmapMock = vi.fn().mockResolvedValue(fakeBitmap);

    const images: IndexedImage[] = [{ id: 'img-1', element: img, caption: null }];
    const result = await preparePageImages(images, {
      isOriginClean: () => true,
      createBitmap: createBitmapMock,
    });

    expect(result.attached).toHaveLength(1);
    expect(createBitmapMock).toHaveBeenCalledWith(img, {
      resizeWidth: 1024,
      resizeHeight: 512,
      resizeQuality: 'medium',
    });

    result.attached[0].close();
    expect(fakeBitmap.close).toHaveBeenCalledTimes(1);
  });

  it('falls back to image element when createBitmap throws', async () => {
    const img = document.createElement('img');
    img.src = '/error.jpg';
    document.body.appendChild(img);

    Object.defineProperty(img, 'complete', { value: true });
    Object.defineProperty(img, 'naturalWidth', { value: 2000 });
    Object.defineProperty(img, 'naturalHeight', { value: 1000 });

    const createBitmapMock = vi.fn().mockRejectedValue(new Error('Out of memory'));

    const images: IndexedImage[] = [{ id: 'img-1', element: img, caption: null }];
    const result = await preparePageImages(images, {
      isOriginClean: () => true,
      createBitmap: createBitmapMock,
    });

    expect(result.attached).toHaveLength(1);
    expect(result.attached[0].source).toBe(img);
    // Calling close on fallback element should be safe no-op
    expect(() => result.attached[0].close()).not.toThrow();
  });

  it('preserves input order in attached images', async () => {
    const img1 = document.createElement('img');
    const img2 = document.createElement('img');
    document.body.appendChild(img1);
    document.body.appendChild(img2);

    for (const img of [img1, img2]) {
      Object.defineProperty(img, 'complete', { value: true });
      Object.defineProperty(img, 'naturalWidth', { value: 400 });
      Object.defineProperty(img, 'naturalHeight', { value: 300 });
    }

    const images: IndexedImage[] = [
      { id: 'img-1', element: img1, caption: null },
      { id: 'img-2', element: img2, caption: null },
    ];

    const result = await preparePageImages(images, { isOriginClean: () => true });

    expect(result.attached).toHaveLength(2);
    expect(result.attached[0].id).toBe('img-1');
    expect(result.attached[1].id).toBe('img-2');
  });
});
