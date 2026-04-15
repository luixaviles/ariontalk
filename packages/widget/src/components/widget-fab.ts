import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { sharedStyles } from '../styles/shared-styles.js';

/**
 * Floating action button -- the idle-state UI.
 *
 * Configurable via:
 * - `label`: visible text (default variant) or aria-label (compact variant)
 * - `variant`: "default" pill-with-text or "compact" icon-only circle
 * - `icon`: "mic" (default) | "wave" (audio bars)
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
        display: flex;
        align-items: center;
        gap: 8px;
        background: var(--at-primary-color);
        color: var(--at-primary-text);
        padding: 12px 20px;
        border-radius: 999px;
        font-size: 14px;
        font-weight: 600;
        box-shadow: 0 4px 14px var(--at-shadow-color);
        transition: transform 0.2s ease, box-shadow 0.2s ease;
      }

      .fab:hover {
        transform: translateY(-1px);
        box-shadow: 0 6px 20px var(--at-shadow-hover);
      }

      .fab:active {
        transform: translateY(0);
      }

      .fab svg {
        width: 20px;
        height: 20px;
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

      .fab.compact svg {
        width: 24px;
        height: 24px;
      }
    `,
  ];

  /** Visible label text (default variant) or aria-label (compact variant). */
  @property({ type: String }) label = 'Voice Chat';

  /** "default" pill-with-text or "compact" icon-only circle. */
  @property({ type: String }) variant: 'default' | 'compact' = 'default';

  /** Icon to display in the FAB. */
  @property({ type: String }) icon: 'mic' | 'wave' = 'mic';

  render() {
    const isCompact = this.variant === 'compact';
    return html`
      <button
        class="fab ${isCompact ? 'compact' : ''}"
        @click=${this.handleClick}
        aria-label=${this.label || 'Start voice chat'}
        title=${isCompact ? this.label : ''}
      >
        ${this.renderIcon()}
        ${isCompact ? '' : this.label}
      </button>
    `;
  }

  private renderIcon() {
    switch (this.icon) {
      case 'wave':
        return html`
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <rect x="3"  y="8" width="2" height="8"  rx="1"/>
            <rect x="7"  y="5" width="2" height="14" rx="1"/>
            <rect x="11" y="8" width="2" height="8"  rx="1"/>
            <rect x="15" y="5" width="2" height="14" rx="1"/>
            <rect x="19" y="8" width="2" height="8"  rx="1"/>
          </svg>
        `;

      case 'mic':
      default:
        return html`
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/>
            <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
            <line x1="12" y1="19" x2="12" y2="22"/>
          </svg>
        `;
    }
  }

  private handleClick() {
    this.dispatchEvent(new CustomEvent('fab-click', { bubbles: true, composed: true }));
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'vcw-fab': WidgetFab;
  }
}
