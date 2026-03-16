const STYLE_ATTR = 'data-ariontalk-highlights';
const HIGHLIGHT_CLASS = 'ariontalk-highlight';
const FADING_CLASS = 'ariontalk-highlight--fading';
const FADE_DURATION_MS = 600;

const HIGHLIGHT_CSS = `
.${HIGHLIGHT_CLASS} {
  background-color: rgba(99, 102, 241, 0.08);
  border-left: 3px solid rgba(99, 102, 241, 0.6);
  border-right: 3px solid rgba(99, 102, 241, 0.6);
  padding-left: 12px;
  padding-right: 12px;
  transition: background-color 0.6s ease, border-color 0.6s ease;
}
img.${HIGHLIGHT_CLASS} {
  background-color: transparent;
  border-left: none;
  border-right: none;
  padding: 0;
  outline: 3px solid rgba(99, 102, 241, 0.6);
  outline-offset: 4px;
  border-radius: 4px;
  transition: outline-color 0.6s ease;
}
.${FADING_CLASS} {
  background-color: transparent;
  border-left-color: transparent;
  border-right-color: transparent;
}
img.${FADING_CLASS} {
  outline-color: transparent;
}
`;

/**
 * Manages scroll-and-highlight effects on the host page.
 * Injects a style tag and toggles CSS classes on target elements.
 * Supports highlighting multiple elements (e.g. a full section).
 */
export class HighlightManager {
  private styleEl: HTMLStyleElement | null = null;
  private currentEls: Element[] = [];
  private fadeTimer: ReturnType<typeof setTimeout> | null = null;

  /** Inject the highlight stylesheet into document.head (reuses existing if present). */
  init(): void {
    const existing = document.querySelector<HTMLStyleElement>(`style[${STYLE_ATTR}]`);
    if (existing) {
      this.styleEl = existing;
      return;
    }

    const style = document.createElement('style');
    style.setAttribute(STYLE_ATTR, '');
    style.textContent = HIGHLIGHT_CSS;
    document.head.appendChild(style);
    this.styleEl = style;
  }

  /** Scroll to and highlight the given elements. Clears any previous highlight first. */
  highlightElements(els: Element[]): void {
    this.clearImmediately();

    const connected = els.filter(el => el.isConnected);
    if (connected.length === 0) return;

    connected[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
    for (const el of connected) {
      el.classList.add(HIGHLIGHT_CLASS);
    }
    this.currentEls = connected;
  }

  /** Fade out the current highlight over 600ms, then remove classes. */
  fadeOut(): void {
    if (this.currentEls.length === 0) return;

    for (const el of this.currentEls) {
      el.classList.add(FADING_CLASS);
    }
    const snapshot = this.currentEls;

    this.fadeTimer = setTimeout(() => {
      for (const el of snapshot) {
        el.classList.remove(HIGHLIGHT_CLASS, FADING_CLASS);
      }
      if (this.currentEls === snapshot) this.currentEls = [];
      this.fadeTimer = null;
    }, FADE_DURATION_MS);
  }

  /** Remove highlight classes immediately (e.g. on interruption). */
  clearImmediately(): void {
    if (this.fadeTimer) {
      clearTimeout(this.fadeTimer);
      this.fadeTimer = null;
    }
    for (const el of this.currentEls) {
      el.classList.remove(HIGHLIGHT_CLASS, FADING_CLASS);
    }
    this.currentEls = [];
  }

  /** Clean up: clear highlight and remove injected style tag. */
  destroy(): void {
    this.clearImmediately();
    if (this.styleEl && this.styleEl.parentNode) {
      this.styleEl.parentNode.removeChild(this.styleEl);
    }
    this.styleEl = null;
  }
}
