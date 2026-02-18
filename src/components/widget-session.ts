import { LitElement, html, css, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { sharedStyles } from '../styles/shared-styles.js';
import type { WidgetStatus, SupportedLang } from '../types.js';

/**
 * Expanded session panel showing timer, status indicator, language toggle,
 * end-call button, and interim transcript.
 */
@customElement('vcw-session')
export class WidgetSession extends LitElement {
  static styles = [
    sharedStyles,
    css`
      :host {
        display: block;
      }

      .panel {
        background: var(--vcw-bg-color, #FFFFFF);
        border-radius: var(--vcw-border-radius, 16px);
        box-shadow: 0 8px 30px rgba(0, 0, 0, 0.2);
        padding: 24px;
        min-width: 260px;
        animation: vcw-fade-in 0.25s ease-out;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 16px;
      }

      /* Timer */
      .timer {
        font-size: 28px;
        font-weight: 700;
        font-variant-numeric: tabular-nums;
        color: var(--vcw-text-color, #1F2937);
      }

      /* Status indicator */
      .status {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 13px;
        color: #6b7280;
        min-height: 28px;
      }

      /* Listening: pulsing mic */
      .status-listening .indicator {
        width: 12px;
        height: 12px;
        border-radius: 50%;
        background: #10b981;
        animation: vcw-pulse 1.5s ease-in-out infinite;
      }

      /* Thinking: spinner */
      .status-thinking .indicator {
        width: 16px;
        height: 16px;
        border: 2px solid #e5e7eb;
        border-top-color: var(--vcw-primary-color, #4F46E5);
        border-radius: 50%;
        animation: vcw-spin 0.8s linear infinite;
      }

      /* Speaking: audio waves */
      .status-speaking .indicator {
        display: flex;
        align-items: center;
        gap: 2px;
        height: 20px;
      }

      .wave-bar {
        width: 3px;
        background: var(--vcw-primary-color, #4F46E5);
        border-radius: 999px;
        animation: vcw-wave 0.8s ease-in-out infinite;
      }

      .wave-bar:nth-child(1) { animation-delay: 0s; height: 8px; }
      .wave-bar:nth-child(2) { animation-delay: 0.15s; height: 14px; }
      .wave-bar:nth-child(3) { animation-delay: 0.3s; height: 8px; }
      .wave-bar:nth-child(4) { animation-delay: 0.45s; height: 14px; }

      /* Error */
      .status-error {
        color: #ef4444;
      }

      /* Transcript */
      .transcript {
        font-size: 13px;
        color: #9ca3af;
        font-style: italic;
        text-align: center;
        min-height: 20px;
        max-width: 220px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      /* Controls row */
      .controls {
        display: flex;
        align-items: center;
        gap: 16px;
      }

      /* Language toggle */
      .lang-toggle {
        background: #f3f4f6;
        color: var(--vcw-text-color, #1F2937);
        padding: 6px 14px;
        border-radius: 999px;
        font-size: 13px;
        font-weight: 600;
        transition: background 0.15s;
      }

      .lang-toggle:hover {
        background: #e5e7eb;
      }

      /* End call button */
      .end-btn {
        width: 48px;
        height: 48px;
        border-radius: 50%;
        background: #ef4444;
        color: #fff;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background 0.15s;
      }

      .end-btn:hover {
        background: #dc2626;
      }

      .end-btn svg {
        width: 22px;
        height: 22px;
      }
    `,
  ];

  @property({ type: String }) status: WidgetStatus = 'listening';
  @property({ type: String }) lang: SupportedLang = 'en';
  @property({ type: String }) timerDisplay = '00:00';
  @property({ type: String }) interimTranscript = '';
  @property({ type: String }) error: string | null = null;

  render() {
    return html`
      <div class="panel">
        <div class="timer">${this.timerDisplay}</div>

        <div class="status status-${this.status}">
          ${this.renderStatusIndicator()}
          <span>${this.statusLabel}</span>
        </div>

        ${this.interimTranscript
          ? html`<div class="transcript">${this.interimTranscript}</div>`
          : nothing}

        ${this.status === 'error' && this.error
          ? html`<div class="status status-error">${this.error}</div>`
          : nothing}

        <div class="controls">
          <button
            class="lang-toggle"
            @click=${this.handleLangToggle}
            aria-label="Switch language"
          >
            ${this.lang === 'en' ? 'EN' : 'ES'}
          </button>

          <button
            class="end-btn"
            @click=${this.handleEnd}
            aria-label="End voice chat"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91"/>
              <line x1="22" y1="2" x2="2" y2="22"/>
            </svg>
          </button>
        </div>
      </div>
    `;
  }

  private get statusLabel(): string {
    switch (this.status) {
      case 'listening': return 'Listening...';
      case 'thinking': return 'Thinking...';
      case 'speaking': return 'Speaking...';
      case 'error': return 'Error';
      default: return '';
    }
  }

  private renderStatusIndicator() {
    switch (this.status) {
      case 'listening':
        return html`<div class="indicator"></div>`;
      case 'thinking':
        return html`<div class="indicator"></div>`;
      case 'speaking':
        return html`
          <div class="indicator">
            <div class="wave-bar"></div>
            <div class="wave-bar"></div>
            <div class="wave-bar"></div>
            <div class="wave-bar"></div>
          </div>
        `;
      default:
        return nothing;
    }
  }

  private handleLangToggle() {
    const newLang: SupportedLang = this.lang === 'en' ? 'es' : 'en';
    this.dispatchEvent(
      new CustomEvent('lang-toggle', { detail: { lang: newLang }, bubbles: true, composed: true }),
    );
  }

  private handleEnd() {
    this.dispatchEvent(new CustomEvent('session-end', { bubbles: true, composed: true }));
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'vcw-session': WidgetSession;
  }
}
