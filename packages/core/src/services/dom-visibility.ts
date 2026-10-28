/**
 * True if the element is rendered/visible (display / visibility). Ignores
 * opacity, so animation-pending content (opacity:0 pre-reveal, e.g. AOS /
 * Elementor) is still treated as present. No class-name matching.
 */
export function isElementVisible(el: Element): boolean {
  const he = el as HTMLElement;
  if (he.hidden || el.getAttribute('aria-hidden') === 'true') return false;

  const cv = (he as any).checkVisibility;
  if (typeof cv === 'function') {
    // Only filter display:none / visibility:hidden. Do NOT pass
    // contentVisibilityAuto: it reports off-screen `content-visibility: auto`
    // sections (a common long-page perf pattern) as invisible, which would
    // drop real, present content we want to extract.
    return cv.call(he, { visibilityProperty: true });
  }

  // Fallback for engines without checkVisibility (rare; predates ~2024 Baseline).
  if (typeof getComputedStyle === 'function') {
    const s = getComputedStyle(he);
    if (s.display === 'none' || s.visibility === 'hidden') return false;
  }
  return true;
}

/** Memoized wrapper for hot paths (per-text-node walks). Fresh memo per call. */
export function makeVisibilityChecker(): (el: Element) => boolean {
  const memo = new WeakMap<Element, boolean>();
  return (el: Element): boolean => {
    const cached = memo.get(el);
    if (cached !== undefined) return cached;
    const v = isElementVisible(el);
    memo.set(el, v);
    return v;
  };
}
