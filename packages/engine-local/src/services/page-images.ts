import { createLogger, type IndexedImage } from '@ariontalk/core';

const log = createLogger('page-images');

export interface PageImage {
  id: string;
  source: ImageBitmapSource;
  /** Closes a downscaled bitmap. No-op for a bare element. */
  close(): void;
}

export type SkipReason = 'not-loaded' | 'tainted';

export interface PreparedImages {
  attached: PageImage[];
  skipped: Array<{ id: string; reason: SkipReason }>;
}

export interface PrepareOptions {
  downscaleAbovePx?: number;
  isOriginClean?: (img: HTMLImageElement) => boolean;
  createBitmap?: typeof createImageBitmap;
}

const originCleanCache = new WeakMap<HTMLImageElement, boolean>();

function defaultIsOriginClean(img: HTMLImageElement): boolean {
  const cached = originCleanCache.get(img);
  if (cached !== undefined) return cached;

  let clean = false;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(img, 0, 0, 1, 1);
      ctx.getImageData(0, 0, 1, 1);
      clean = true;
    }
  } catch {
    clean = false;
  }

  originCleanCache.set(img, clean);
  return clean;
}

/** Prepares indexed images for Prompt API consumption with origin validation and downscaling. */
export async function preparePageImages(
  images: IndexedImage[],
  opts?: PrepareOptions,
): Promise<PreparedImages> {
  const downscaleLimit = opts?.downscaleAbovePx ?? 1024;
  const isOriginClean = opts?.isOriginClean ?? defaultIsOriginClean;
  const createBitmap = opts?.createBitmap ?? (typeof createImageBitmap !== 'undefined' ? createImageBitmap : undefined);

  const attached: PageImage[] = [];
  const skipped: Array<{ id: string; reason: SkipReason }> = [];

  for (const image of images) {
    const img = image.element;

    if (!img.isConnected || !img.complete || img.naturalWidth === 0) {
      log.debug(`Image ${image.id} skipped: not-loaded`);
      skipped.push({ id: image.id, reason: 'not-loaded' });
      continue;
    }

    let isClean = originCleanCache.get(img);
    if (isClean === undefined) {
      isClean = isOriginClean(img);
      originCleanCache.set(img, isClean);
    }

    if (!isClean) {
      log.debug(`Image ${image.id} skipped: tainted`);
      skipped.push({ id: image.id, reason: 'tainted' });
      continue;
    }

    const exceedsLimit = img.naturalWidth > downscaleLimit || img.naturalHeight > downscaleLimit;
    if (exceedsLimit && createBitmap) {
      let resizeWidth: number;
      let resizeHeight: number;

      if (img.naturalWidth >= img.naturalHeight) {
        resizeWidth = downscaleLimit;
        resizeHeight = Math.round((img.naturalHeight / img.naturalWidth) * downscaleLimit);
      } else {
        resizeHeight = downscaleLimit;
        resizeWidth = Math.round((img.naturalWidth / img.naturalHeight) * downscaleLimit);
      }

      try {
        const bitmap = await createBitmap(img, { resizeWidth, resizeHeight, resizeQuality: 'medium' });
        attached.push({
          id: image.id,
          source: bitmap,
          close: () => bitmap.close(),
        });
        continue;
      } catch (err) {
        log.warn(`Failed to downscale image ${image.id}, falling back to element:`, err);
      }
    }

    attached.push({
      id: image.id,
      source: img,
      close: () => {},
    });
  }

  return { attached, skipped };
}
