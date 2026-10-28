import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { sharedStyles } from '../styles/shared-styles.js';

import { getStrings, type UiLocale } from '../i18n.js';

/**
 * Floating action button -- the idle-state UI.
 *
 * Configurable via:
 * - `label`: visible text (default variant) or aria-label (compact variant)
 * - `variant`: "default" pill-with-text or "compact" icon-only circle
 * - `icon`: "mic" (default) | "wave" (audio bars)
 * - `iconUrl`: optional custom image URL for the FAB button logo
 *
 * Dispatches `fab-click` when clicked.
 */
@customElement('vcw-fab')
export class WidgetFab extends LitElement {
  static styles = [
    sharedStyles,
    css`
      :host {
        display: block;
      }

      /* Default variant: pill with text */
      .fab {
        position: relative;
        display: flex;
        align-items: center;
        gap: 8px;
        background: var(--at-fab-bg, var(--at-primary-ui, var(--at-primary-color, #111827)));
        color: var(--at-fab-text, var(--at-on-primary-ui, var(--at-primary-text, #FFFFFF)));
        border: var(--at-fab-border, none);
        padding: 12px 20px;
        border-radius: 999px;
        font-size: 14px;
        font-weight: 600;
        box-shadow: 0 4px 14px var(--at-shadow-color);
        transition:
          transform var(--at-dur-base, 200ms) var(--at-ease-standard, cubic-bezier(.2, 0, 0, 1)),
          box-shadow var(--at-dur-base, 200ms) var(--at-ease-standard, cubic-bezier(.2, 0, 0, 1));
      }

      .fab:hover {
        transform: translateY(-1px);
        box-shadow: 0 6px 20px var(--at-shadow-hover);
      }

      .fab:active {
        transform: translateY(0);
      }

      .icw {
        position: relative;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
      }

      .icw > svg {
        width: 20px;
        height: 20px;
        flex-shrink: 0;
        transition:
          opacity var(--at-dur-base, 200ms) var(--at-ease-standard, cubic-bezier(.2, 0, 0, 1)) 60ms,
          transform var(--at-dur-base, 200ms) var(--at-ease-standard, cubic-bezier(.2, 0, 0, 1)) 60ms;
      }

      .fab img.custom-fab-icon {
        width: 22px;
        height: 22px;
        object-fit: contain;
        border-radius: 50%;
        flex-shrink: 0;
      }

      /* Compact variant: circular icon-only */
      .fab.compact {
        width: 56px;
        height: 56px;
        padding: 0;
        justify-content: center;
        gap: 0;
      }

      .fab.compact .icw > svg {
        width: 24px;
        height: 24px;
      }

      .fab.compact img.custom-fab-icon {
        width: 28px;
        height: 28px;
      }

      /* Option B: sparks on hover/focus-visible */
      .spark {
        position: absolute;
        left: 50%;
        top: 50%;
        pointer-events: none;
      }

      .spark i {
        position: absolute;
        width: 5px;
        height: 5px;
        margin: -2.5px;
        border-radius: 50%;
        background: currentColor;
        opacity: 0;
        transform: translate(var(--sx), var(--sy)) scale(0.5);
        transition:
          opacity var(--at-dur-base, 200ms) var(--at-ease-exit, cubic-bezier(.3, 0, 1, 1)),
          transform var(--at-dur-slow, 320ms) var(--at-ease-exit, cubic-bezier(.3, 0, 1, 1));
      }

      .spark i:nth-child(1) { --sx: -15px; --sy: -11px; --ex: -8px; --ey: 5px; }
      .spark i:nth-child(2) { --sx: 13px;  --sy: -14px; --ex: 0px;  --ey: 0px; }
      .spark i:nth-child(3) { --sx: 5px;   --sy: 15px;  --ex: 8px;  --ey: -5px; }

      .fab.on .spark i,
      :host([hover]) .spark i {
        opacity: 1;
        transform: translate(var(--ex), var(--ey)) scale(1);
        transition:
          opacity var(--at-dur-fast, 120ms) var(--at-ease-enter, cubic-bezier(0, 0, 0, 1)),
          transform var(--at-dur-slow, 320ms) var(--at-ease-enter, cubic-bezier(0, 0, 0, 1));
      }

      .fab.on .spark i:nth-child(2),
      :host([hover]) .spark i:nth-child(2) {
        transition-delay: 40ms;
      }

      .fab.on .spark i:nth-child(3),
      :host([hover]) .spark i:nth-child(3) {
        transition-delay: 80ms;
      }

      .fab.on .icw > svg,
      :host([hover]) .icw > svg {
        opacity: 0;
        transform: scale(0.7);
        transition-delay: 0ms;
      }
    `,
  ];

  /** Visible label text (default variant) or aria-label (compact variant). */
  @property({ type: String }) label = '';

  /** Target UI locale for translation fallbacks. */
  @property({ type: String }) locale: UiLocale = 'en';

  /** "default" pill-with-text or "compact" icon-only circle. */
  @property({ type: String }) variant: 'default' | 'compact' = 'default';

  /** Icon to display in the FAB. */
  @property({ type: String }) icon: 'mic' | 'wave' = 'mic';

  /** Optional custom image URL for the FAB button icon. */
  @property({ type: String, attribute: 'icon-url' }) iconUrl = '';

  @state() private sparkActive = false;

  render() {
    const isCompact = this.variant === 'compact';
    const activeLabel = this.label || getStrings(this.locale).voiceChat;
    const showSparks = !this.iconUrl && this.sparkActive;
    return html`
      <button
        class="fab ${isCompact ? 'compact' : ''} ${showSparks ? 'on' : ''}"
        @click=${this.handleClick}
        @pointerenter=${this.handlePointerEnter}
        @pointerleave=${this.handlePointerLeave}
        @focus=${this.handleFocus}
        @blur=${this.handleBlur}
        aria-label=${activeLabel}
        title=${isCompact ? activeLabel : ''}
      >
        ${this.renderIcon()}
        ${isCompact ? '' : activeLabel}
      </button>
    `;
  }

  private renderIcon() {
    if (this.iconUrl) {
      return html`<img src="${this.iconUrl}" alt="" class="custom-fab-icon" aria-hidden="true" />`;
    }

    const svgIcon = this.icon === 'wave'
      ? html`
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <rect x="3"  y="8" width="2" height="8"  rx="1"/>
            <rect x="7"  y="5" width="2" height="14" rx="1"/>
            <rect x="11" y="8" width="2" height="8"  rx="1"/>
            <rect x="15" y="5" width="2" height="14" rx="1"/>
            <rect x="19" y="8" width="2" height="8"  rx="1"/>
          </svg>
        `
      : html`
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/>
            <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
            <line x1="12" y1="19" x2="12" y2="22"/>
          </svg>
        `;

    return html`
      <span class="icw">
        ${svgIcon}
        <span class="spark" aria-hidden="true"><i></i><i></i><i></i></span>
      </span>
    `;
  }

  private handleClick() {
    this.dispatchEvent(new CustomEvent('fab-click', { bubbles: true, composed: true }));
  }

  private handlePointerEnter(e: PointerEvent) {
    if (e.pointerType !== 'touch') {
      this.sparkActive = true;
    }
    this.handleIntent();
  }

  private handlePointerLeave() {
    this.sparkActive = false;
  }

  private handleFocus(e: FocusEvent) {
    const btn = e.currentTarget as HTMLButtonElement | null;
    try {
      if (btn?.matches(':focus-visible')) {
        this.sparkActive = true;
      }
    } catch {
      this.sparkActive = true;
    }
    this.handleIntent();
  }

  private handleBlur() {
    this.sparkActive = false;
  }

  private handleIntent() {
    this.dispatchEvent(new CustomEvent('fab-intent', { bubbles: true, composed: true }));
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'vcw-fab': WidgetFab;
  }
}
