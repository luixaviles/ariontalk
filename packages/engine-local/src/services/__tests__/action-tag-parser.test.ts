import { describe, it, expect } from 'vitest';
import { parseActionTags, holdBackPartialTag } from '../action-tag-parser.js';

describe('ActionTagParser', () => {
  describe('parseActionTags', () => {
    it('parses well-formed tag', () => {
      const input = 'As you can see, @@sec-1@@ here is the pricing.';
      const res = parseActionTags(input);
      expect(res.clean).toBe('As you can see, here is the pricing.');
      expect(res.ids).toEqual(['sec-1']);
    });

    it('parses tag in Spanish context', () => {
      const input = 'Como puede ver, @@sec-2@@ los precios estan aqui.';
      const res = parseActionTags(input);
      expect(res.clean).toBe('Como puede ver, los precios estan aqui.');
      expect(res.ids).toEqual(['sec-2']);
    });

    it('normalizes internal spaces in section ID', () => {
      const input = 'Look at @@sec 4@@ section four.';
      const res = parseActionTags(input);
      expect(res.clean).toBe('Look at section four.');
      expect(res.ids).toEqual(['sec-4']);
    });

    it('handles markdown emphasis around tags', () => {
      const input = 'Here is **@@sec-5@@** the feature.';
      const res = parseActionTags(input);
      expect(res.clean).toBe('Here is **** the feature.');
      expect(res.ids).toEqual(['sec-5']);
    });

    it('strips tag with unknown ID completely from spoken text', () => {
      const input = 'Here is @@sec-unknown@@ the mystery section.';
      const res = parseActionTags(input);
      expect(res.clean).toBe('Here is the mystery section.');
      expect(res.ids).toEqual(['sec-unknown']);
    });

    it('extracts multiple tags in order', () => {
      const input = 'First @@sec-1@@ and second @@sec-2@@ sections.';
      const res = parseActionTags(input);
      expect(res.clean).toBe('First and second sections.');
      expect(res.ids).toEqual(['sec-1', 'sec-2']);
    });

    it('strips unlinked page anchor bracket without yielding ID', () => {
      const input = 'Aqui esta [sec-1] la seccion.';
      const res = parseActionTags(input);
      expect(res.clean).toBe('Aqui esta la seccion.');
      expect(res.ids).toEqual([]);
    });

    it('leaves bracketed tokens without anchors untouched', () => {
      const input = 'Here is a [note] for you.';
      const res = parseActionTags(input);
      expect(res.clean).toBe('Here is a [note] for you.');
      expect(res.ids).toEqual([]);
    });

    it('drops trailing colon after tag so spoken text starts at first word', () => {
      const input = '@@img-1@@: The image shows a hand holding a dandelion.';
      const res = parseActionTags(input);
      expect(res.clean).toBe('The image shows a hand holding a dandelion.');
      expect(res.ids).toEqual(['img-1']);
    });

    it('drops trailing dash and space after tag', () => {
      const input = '@@sec-2@@ - The second section covers transformers.';
      const res = parseActionTags(input);
      expect(res.clean).toBe('The second section covers transformers.');
      expect(res.ids).toEqual(['sec-2']);
    });

    it('keeps the sign on a negative number opening the answer', () => {
      const res = parseActionTags('@@img-1@@ -5 degrees is the reading.');
      expect(res.clean).toBe('-5 degrees is the reading.');
      expect(res.ids).toEqual(['img-1']);
    });

    it('handles tag with no trailing punctuation cleanly', () => {
      const input = '@@sec-1@@ The first section covers AI.';
      const res = parseActionTags(input);
      expect(res.clean).toBe('The first section covers AI.');
      expect(res.ids).toEqual(['sec-1']);
    });

    it('leaves leading punctuation untouched when no tag was present', () => {
      const input = ': This note has no tag.';
      const res = parseActionTags(input);
      expect(res.clean).toBe(': This note has no tag.');
      expect(res.ids).toEqual([]);
    });

    it('recognises none as reserved ID returning no highlight element ID', () => {
      const input = '@@none@@: This page discusses artificial intelligence.';
      const res = parseActionTags(input);
      expect(res.clean).toBe('This page discusses artificial intelligence.');
      expect(res.ids).toEqual([]);
      expect(res.ids).not.toContain('none');
    });

    it('strips @@none@@ without trailing punctuation and yields empty ids', () => {
      const input = '@@none@@ This page discusses artificial intelligence.';
      const res = parseActionTags(input);
      expect(res.clean).toBe('This page discusses artificial intelligence.');
      expect(res.ids).toEqual([]);
    });

    it('treats uppercase @@NONE@@ as reserved tag', () => {
      const input = '@@NONE@@ This page discusses artificial intelligence.';
      const res = parseActionTags(input);
      expect(res.clean).toBe('This page discusses artificial intelligence.');
      expect(res.ids).toEqual([]);
    });
  });

  describe('holdBackPartialTag', () => {
    it('holds back buffer tail with unmatched @@', () => {
      const input = 'Sentence ending here. @@sec';
      const { ready, held } = holdBackPartialTag(input);
      expect(ready).toBe('Sentence ending here. ');
      expect(held).toBe('@@sec');
    });

    it('holds back buffer tail with trailing @', () => {
      const input = 'Sentence ending here. @';
      const { ready, held } = holdBackPartialTag(input);
      expect(ready).toBe('Sentence ending here. ');
      expect(held).toBe('@');
    });

    it('does not hold back when tag is closed', () => {
      const input = 'Sentence ending here. @@sec-1@@';
      const { ready, held } = holdBackPartialTag(input);
      expect(ready).toBe('Sentence ending here. @@sec-1@@');
      expect(held).toBe('');
    });

    it('releases held tag when length exceeds 80 characters', () => {
      const longProse = '@@' + 'a'.repeat(85);
      const { ready, held } = holdBackPartialTag(longProse);
      expect(ready).toBe(longProse);
      expect(held).toBe('');
    });
  });
});
