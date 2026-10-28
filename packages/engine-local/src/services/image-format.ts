import type { IndexedImage } from '@ariontalk/core';
import type { PreparedImages } from './page-images.js';

export const MULTIMODAL_IMAGE_HEADER = 'Images on this page. Attached ones were shared with you as pictures right after this text.';
export const TEXT_ONLY_IMAGE_HEADER = 'Images on this page, described by their alt text. Image data is not available.';

export function formatFor(attachedIds: Set<string>, prepared: PreparedImages): {
  header: string;
  describeImage?: (img: IndexedImage) => string;
} {
  if (attachedIds.size > 0) {
    return {
      header: MULTIMODAL_IMAGE_HEADER,
      describeImage: (img: IndexedImage) =>
        attachedIds.has(img.id)
          ? 'attached'
          : `not attached${img.caption ? `, caption: "${img.caption}"` : ''}`,
    };
  }
  return {
    header: TEXT_ONLY_IMAGE_HEADER,
    describeImage: undefined,
  };
}
