import { LitElement, html, css, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { sharedStyles } from '../styles/shared-styles.js';
import './widget-voice-settings.js';
import type { WidgetStatus, SupportedLang, VoiceSettings } from '../types.js';

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
        background: var(--at-bg-color);
        border-radius: var(--at-border-radius);
        box-shadow: 0 8px 30px var(--at-shadow-color);
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
        color: var(--at-text-color);
      }

      /* Status indicator */
      .status {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 13px;
        color: var(--at-text-secondary);
        min-height: 28px;
      }

      /* Listening: pulsing mic */
      .status-listening .indicator {
        width: 12px;
        height: 12px;
        border-radius: 50%;
        background: var(--at-success-color);
        animation: vcw-pulse 1.5s ease-in-out infinite;
      }

      /* Thinking: spinner */
      .status-thinking .indicator {
        width: 16px;
        height: 16px;
        border: 2px solid var(--at-border-color);
        border-top-color: var(--at-primary-color);
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
        background: var(--at-primary-color);
        border-radius: 999px;
        animation: vcw-wave 0.8s ease-in-out infinite;
      }

      .wave-bar:nth-child(1) { animation-delay: 0s; height: 8px; }
      .wave-bar:nth-child(2) { animation-delay: 0.15s; height: 14px; }
      .wave-bar:nth-child(3) { animation-delay: 0.3s; height: 8px; }
      .wave-bar:nth-child(4) { animation-delay: 0.45s; height: 14px; }

      /* Loading: spinner (same as thinking) */
      .status-loading .indicator {
        width: 16px;
        height: 16px;
        border: 2px solid var(--at-border-color);
        border-top-color: var(--at-primary-color);
        border-radius: 50%;
        animation: vcw-spin 0.8s linear infinite;
      }

      /* Progress bar */
      .progress-bar {
        width: 100%;
        max-width: 220px;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 6px;
      }

      .progress-track {
        width: 100%;
        height: 6px;
        background: var(--at-border-color);
        border-radius: 3px;
        overflow: hidden;
      }

      .progress-fill {
        height: 100%;
        background: var(--at-primary-color);
        border-radius: 3px;
        transition: width 0.3s ease;
      }

      .progress-fill--indeterminate {
        width: 40%;
        animation: vcw-indeterminate 1.5s ease-in-out infinite;
      }

      .progress-text {
        font-size: 12px;
        color: var(--at-text-muted);
      }

      /* Error */
      .status-error {
        color: var(--at-error-color);
      }

      /* Transcript */
      .transcript {
        font-size: 13px;
        color: var(--at-text-muted);
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
        background: var(--at-surface-color);
        color: var(--at-text-color);
        padding: 6px 14px;
        border-radius: 999px;
        font-size: 13px;
        font-weight: 600;
        transition: background 0.15s;
      }

      .lang-toggle:hover {
        background: var(--at-surface-hover);
      }

      /* End call button */
      .end-btn {
        width: 48px;
        height: 48px;
        border-radius: 50%;
        background: var(--at-error-color);
        color: #fff;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background 0.15s;
      }

      .end-btn:hover {
        background: var(--at-error-hover);
      }

      .end-btn svg {
        width: 22px;
        height: 22px;
      }

      /* Gear button */
      .gear-btn {
        width: 36px;
        height: 36px;
        border-radius: 50%;
        background: var(--at-surface-color);
        color: var(--at-text-color);
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background 0.15s;
      }
      .gear-btn:hover { background: var(--at-surface-hover); }
      .gear-btn svg { width: 18px; height: 18px; }
    `,
  ];

  @state() private showSettings = false;
  @property({ type: Boolean }) settingsEnabled = false;
  @property({ type: Array }) voices: SpeechSynthesisVoice[] = [];
  @property({ type: Object }) currentVoiceSettings: VoiceSettings | null = null;

  @property({ type: String }) status: WidgetStatus = 'listening';
  @property({ type: String }) lang: SupportedLang = 'en';
  @property({ type: String }) timerDisplay = '00:00';
  @property({ type: String }) interimTranscript = '';
  @property({ type: String }) error: string | null = null;
  @property({ type: Number }) downloadProgress = 0;

  render() {
    if (this.settingsEnabled && this.showSettings) {
      return html`
        <vcw-voice-settings
          .voices=${this.voices}
          .currentSettings=${this.currentVoiceSettings}
          @voice-settings-apply=${this.handleSettingsApply}
          @voice-settings-back=${this.handleSettingsBack}
        ></vcw-voice-settings>
      `;
    }

    return html`
      <div class="panel">
        <div class="timer">${this.timerDisplay}</div>

        <div class="status status-${this.status}">
          ${this.renderStatusIndicator()}
          <span>${this.statusLabel}</span>
        </div>

        ${this.status === 'loading' ? this.renderProgressBar() : nothing}

        ${this.interimTranscript
          ? html`<div class="transcript">${this.interimTranscript}</div>`
          : nothing}

        ${this.status === 'error' && this.error
          ? html`<div class="status status-error">${this.error}</div>`
          : nothing}

        <div class="controls">
          ${this.settingsEnabled ? html`
            <button class="gear-btn" @click=${this.handleGearClick} aria-label="Voice settings">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                   stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="3"/>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
              </svg>
            </button>
          ` : nothing}

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
      case 'loading': return 'Loading AI model...';
      case 'listening': return 'Listening...';
      case 'thinking': return 'Thinking...';
      case 'speaking': return 'Speaking...';
      case 'error': return 'Error';
      default: return '';
    }
  }

  private renderProgressBar() {
    const indeterminate = this.downloadProgress < 0;
    const pct = indeterminate ? 0 : Math.round(this.downloadProgress * 100);

    return html`
      <div class="progress-bar">
        <div class="progress-track">
          ${indeterminate
            ? html`<div class="progress-fill progress-fill--indeterminate"></div>`
            : html`<div class="progress-fill" style="width: ${pct}%"></div>`}
        </div>
        <span class="progress-text">
          ${indeterminate ? 'Preparing model...' : `${pct}%`}
        </span>
      </div>
    `;
  }

  private renderStatusIndicator() {
    switch (this.status) {
      case 'loading':
        return html`<div class="indicator"></div>`;
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

  private handleGearClick() {
    this.showSettings = true;
  }

  private handleSettingsBack() {
    this.showSettings = false;
  }

  private handleSettingsApply(e: CustomEvent<VoiceSettings>) {
    this.showSettings = false;
    this.dispatchEvent(new CustomEvent('voice-settings-apply', {
      detail: e.detail, bubbles: true, composed: true,
    }));
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
