import { createLogger } from '@ariontalk/core';

const log = createLogger('action-tag-parser');

const TAG_RE = /@@\s*([\w-]+(?:\s+[\w-]+)?)\s*@@/g;
// Safety net: bracketed page anchors removed from speech, not treated as tags.
const RESIDUAL_ANCHOR_RE = /\[[^\]]{0,80}\b(?:sec|img)[\s-]?\d+[^\]]{0,20}\]/gi;
// Reserved tag IDs that signal an action or absence but never map to an element ID.
// Real element IDs from page-indexer always use sec-N or img-N, preventing collisions.
const RESERVED_TAG_IDS = new Set(['none']);
const MAX_HELD_TAG_LENGTH = 80;

export interface ParsedTags {
  /** Text with every tag-shaped token removed, safe to speak. */
  clean: string;
  /** Element IDs extracted, in order of appearance. */
  ids: string[];
}

/** Strip action tags from a sentence and return the IDs found. */
export function parseActionTags(text: string): ParsedTags {
  if (!text) {
    return { clean: '', ids: [] };
  }

  const ids: string[] = [];
  const matches = Array.from(text.matchAll(TAG_RE));

  for (const match of matches) {
    const rawId = match[1];
    if (rawId) {
      const normalizedId = rawId.trim().replace(/\s+/g, '-');
      if (!RESERVED_TAG_IDS.has(normalizedId.toLowerCase())) {
        ids.push(normalizedId);
      }
    }
  }

  const cleanRaw = text.replace(TAG_RE, '');

  const residualMatches = Array.from(cleanRaw.matchAll(RESIDUAL_ANCHOR_RE));
  if (residualMatches.length > 0) {
    log.debug('removed unrecognized tag(s):', residualMatches.map(m => m[0]));
  }
  const cleanNoResidual = cleanRaw.replace(RESIDUAL_ANCHOR_RE, '');
  let clean = cleanNoResidual.replace(/\s{2,}/g, ' ').trim();

  // Drop leading separator punctuation left at the start of spoken text.
  // A dash must be followed by space to count as a separator, so a negative
  // number opening the answer keeps its sign.
  if (matches.length > 0 || residualMatches.length > 0) {
    clean = clean.replace(/^(?:[:,\s]+|-(?=\s))+/, '').trim();
  }

  return { clean, ids };
}

/** Split streaming buffer into safe text and tail held for unclosed tag. */
export function holdBackPartialTag(buffer: string): { ready: string; held: string } {
  const atAtMatches = buffer.match(/@@/g);
  const count = atAtMatches ? atAtMatches.length : 0;

  if (count % 2 === 1) {
    const lastOpen = buffer.lastIndexOf('@@');
    const tailLength = buffer.length - lastOpen;
    if (tailLength <= MAX_HELD_TAG_LENGTH) {
      return {
        ready: buffer.slice(0, lastOpen),
        held: buffer.slice(lastOpen),
      };
    }
  } else if (buffer.endsWith('@') && !buffer.endsWith('@@')) {
    return {
      ready: buffer.slice(0, -1),
      held: '@',
    };
  }

  return { ready: buffer, held: '' };
}
