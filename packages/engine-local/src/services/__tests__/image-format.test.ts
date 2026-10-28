import { describe, it, expect } from 'vitest';
import { formatFor, MULTIMODAL_IMAGE_HEADER, TEXT_ONLY_IMAGE_HEADER } from '../image-format.js';
import type { PreparedImages } from '../page-images.js';
import type { IndexedImage } from '@ariontalk/core';

describe('image-format', () => {
  const dummyPrepared: PreparedImages = {
    attached: [],
    skipped: [],
  };

  it('formatFor returns text-only header when attachedIds is empty', () => {
    const result = formatFor(new Set(), dummyPrepared);
    expect(result.header).toBe(TEXT_ONLY_IMAGE_HEADER);
    expect(result.describeImage).toBeUndefined();
  });

  it('formatFor produces attached for an id in the set and not attached with caption for one that is not', () => {
    const attachedIds = new Set(['img-1']);
    const result = formatFor(attachedIds, dummyPrepared);

    expect(result.header).toBe(MULTIMODAL_IMAGE_HEADER);
    expect(result.describeImage).toBeDefined();

    const attachedImg: IndexedImage = {
      id: 'img-1',
      element: {} as HTMLImageElement,
      caption: 'a red bicycle',
    };
    const unattachedWithCaption: IndexedImage = {
      id: 'img-2',
      element: {} as HTMLImageElement,
      caption: 'a blue car',
    };
    const unattachedWithoutCaption: IndexedImage = {
      id: 'img-3',
      element: {} as HTMLImageElement,
      caption: null,
    };

    expect(result.describeImage!(attachedImg)).toBe('attached');
    expect(result.describeImage!(unattachedWithCaption)).toBe('not attached, caption: "a blue car"');
    expect(result.describeImage!(unattachedWithoutCaption)).toBe('not attached');
  });
});
