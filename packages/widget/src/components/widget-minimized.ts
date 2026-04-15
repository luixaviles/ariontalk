import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { sharedStyles } from '../styles/shared-styles.js';
import type { WidgetStatus } from '../types.js';

/**
 * Minimized state of an active voice session — a small circular FAB with a
 * pulsing ring indicating the call is still live. Clicking anywhere on it
 * dispatches `restore` to return to the expanded session panel.
 */
@customElement('vcw-minimized')
export class WidgetMinimized extends LitElement {
  static styles = [
    sharedStyles,
    css`
      :host {
        display: block;
      }

      .fab {
        position: relative;
        width: 56px;
        height: 56px;
        border-radius: 50%;
        background: var(--at-primary-color);
        color: var(--at-primary-text);
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 4px 14px var(--at-shadow-color);
        transition: transform 0.2s ease, box-shadow 0.2s ease;
        animation: vcw-fade-in 0.25s ease-out;
      }

      .fab:hover {
        transform: translateY(-1px);
        box-shadow: 0 6px 20px var(--at-shadow-hover);
      }

      .fab:active {
        transform: translateY(0);
      }

      /* Expanding pulse ring */
      .ring {
        position: absolute;
        inset: 0;
        border-radius: 50%;
        border: 2px solid var(--at-primary-color);
        opacity: 0;
        animation: vcw-ring-pulse 1.8s ease-out infinite;
        pointer-events: none;
      }

      .ring.delay {
        animation-delay: 0.9s;
      }

      @keyframes vcw-ring-pulse {
        0% {
          transform: scale(1);
          opacity: 0.6;
        }
        100% {
          transform: scale(1.6);
          opacity: 0;
        }
      }

      /* Waveform icon (4 bars, gently animated) -- shown when speaking */
      .waveform {
        display: flex;
        align-items: center;
        gap: 3px;
        height: 24px;
      }

      .bar {
        width: 3px;
        background: currentColor;
        border-radius: 999px;
        animation: vcw-wave 0.9s ease-in-out infinite;
      }

      .bar:nth-child(1) { animation-delay: 0s;    height: 10px; }
      .bar:nth-child(2) { animation-delay: 0.15s; height: 16px; }
      .bar:nth-child(3) { animation-delay: 0.3s;  height: 10px; }
      .bar:nth-child(4) { animation-delay: 0.45s; height: 16px; }

      /* Microphone icon -- shown when listening (waiting for user) */
      .mic-icon {
        width: 22px;
        height: 22px;
      }

      /* Three-dot indicator -- shown when thinking/loading */
      .dots {
        display: flex;
        align-items: center;
        gap: 4px;
        height: 24px;
      }

      .dot {
        width: 5px;
        height: 5px;
        background: currentColor;
        border-radius: 50%;
        animation: vcw-dots 1.2s ease-in-out infinite;
      }

      .dot:nth-child(1) { animation-delay: 0s; }
      .dot:nth-child(2) { animation-delay: 0.2s; }
      .dot:nth-child(3) { animation-delay: 0.4s; }

      @keyframes vcw-dots {
        0%, 80%, 100% {
          opacity: 0.3;
          transform: scale(0.8);
        }
        40% {
          opacity: 1;
          transform: scale(1);
        }
      }

      /* Slow the outer rings down when not actively speaking, so the
         visual is calmer during listening/thinking states. */
      :host([data-status="listening"]) .ring,
      :host([data-status="thinking"]) .ring,
      :host([data-status="loading"]) .ring {
        animation-duration: 2.6s;
      }
    `,
  ];

  @property({ type: String, reflect: true, attribute: 'data-status' }) status: WidgetStatus = 'listening';

  /** When true, the user has muted their microphone -- the listening icon shows a muted variant. */
  @property({ type: Boolean }) muted = false;

  render() {
    const ariaLabel = this.muted
      ? 'Restore voice chat (muted)'
      : 'Restore voice chat';
    return html`
      <button
        class="fab"
        @click=${this.handleClick}
        aria-label=${ariaLabel}
        title=${ariaLabel}
      >
        <span class="ring"></span>
        <span class="ring delay"></span>
        ${this.renderStatusIcon()}
      </button>
    `;
  }

  private renderStatusIcon() {
    switch (this.status) {
      case 'speaking':
        return html`
          <span class="waveform" aria-hidden="true">
            <span class="bar"></span>
            <span class="bar"></span>
            <span class="bar"></span>
            <span class="bar"></span>
          </span>
        `;

      case 'thinking':
      case 'loading':
        return html`
          <span class="dots" aria-hidden="true">
            <span class="dot"></span>
            <span class="dot"></span>
            <span class="dot"></span>
          </span>
        `;

      case 'listening':
      default:
        return this.muted
          ? html`
              <svg class="mic-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <line x1="2" y1="2" x2="22" y2="22"/>
                <path d="M18.89 13.23A7 7 0 0 0 19 12v-2"/>
                <path d="M5 10v2a7 7 0 0 0 12 5"/>
                <path d="M15 9.34V5a3 3 0 0 0-5.68-1.33"/>
                <path d="M9 9v3a3 3 0 0 0 5.12 2.12"/>
                <line x1="12" y1="19" x2="12" y2="22"/>
              </svg>
            `
          : html`
              <svg class="mic-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/>
                <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                <line x1="12" y1="19" x2="12" y2="22"/>
              </svg>
            `;
    }
  }

  private handleClick() {
    this.dispatchEvent(new CustomEvent('restore', { bubbles: true, composed: true }));
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'vcw-minimized': WidgetMinimized;
  }
}
