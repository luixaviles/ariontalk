import { LitElement, html, css } from 'lit';
import { customElement } from 'lit/decorators.js';
import { sharedStyles } from '../styles/shared-styles.js';

/**
 * Floating action button — the idle-state UI showing a mic icon + "Voice Chat" label.
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

      .fab {
        display: flex;
        align-items: center;
        gap: 8px;
        background: var(--vcw-primary-color, #4F46E5);
        color: #fff;
        padding: 12px 20px;
        border-radius: 999px;
        font-size: 14px;
        font-weight: 600;
        box-shadow: 0 4px 14px rgba(0, 0, 0, 0.25);
        transition: transform 0.2s ease, box-shadow 0.2s ease;
      }

      .fab:hover {
        transform: translateY(-1px);
        box-shadow: 0 6px 20px rgba(0, 0, 0, 0.3);
      }

      .fab:active {
        transform: translateY(0);
      }

      .fab svg {
        width: 20px;
        height: 20px;
        flex-shrink: 0;
      }
    `,
  ];

  render() {
    return html`
      <button
        class="fab"
        @click=${this.handleClick}
        aria-label="Start voice chat"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/>
          <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
          <line x1="12" y1="19" x2="12" y2="22"/>
        </svg>
        Voice Chat
      </button>
    `;
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
