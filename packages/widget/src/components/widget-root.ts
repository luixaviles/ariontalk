import { LitElement, html, css, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { sharedStyles } from '../styles/shared-styles.js';
import { isVoiceChatSupported } from '@ariontalk/core';
import { VoiceSessionController } from '../controllers/voice-session.controller.js';
import type { SupportedLang, VoiceSettings } from '../types.js';
import './widget-fab.js';
import './widget-session.js';

/**
 * <ariontalk> — Root component that embeds the full voice chat experience.
 * Toggles between a FAB (idle) and session panel (active).
 */
@customElement('ariontalk-widget')
export class ArionTalk extends LitElement {
  static styles = [
    sharedStyles,
    css`
      :host {
        display: block;
        position: fixed;
        z-index: 999999;
      }

      /* Light theme (default) */
      :host([theme="light"]),
      :host(:not([theme])) {
        --at-primary-color: #111827;
        --at-primary-text: #FFFFFF;
        --at-text-color: #1F2937;
        --at-text-secondary: #6B7280;
        --at-text-muted: #9CA3AF;
        --at-bg-color: #FFFFFF;
        --at-surface-color: #F3F4F6;
        --at-surface-hover: #E5E7EB;
        --at-border-color: #D1D5DB;
        --at-border-radius: 16px;
        --at-font-family: system-ui, sans-serif;
        --at-shadow-color: rgba(0, 0, 0, 0.12);
        --at-shadow-hover: rgba(0, 0, 0, 0.18);
        --at-focus-ring: rgba(17, 24, 39, 0.2);
        --at-success-color: #10B981;
        --at-error-color: #EF4444;
        --at-error-hover: #DC2626;
      }

      /* Dark theme */
      :host([theme="dark"]) {
        --at-primary-color: #FAFAFA;
        --at-primary-text: #18181B;
        --at-text-color: #FAFAFA;
        --at-text-secondary: #A1A1AA;
        --at-text-muted: #71717A;
        --at-bg-color: #18181B;
        --at-surface-color: #27272A;
        --at-surface-hover: #3F3F46;
        --at-border-color: #3F3F46;
        --at-border-radius: 16px;
        --at-font-family: system-ui, sans-serif;
        --at-shadow-color: rgba(0, 0, 0, 0.4);
        --at-shadow-hover: rgba(0, 0, 0, 0.5);
        --at-focus-ring: rgba(250, 250, 250, 0.25);
        --at-success-color: #34D399;
        --at-error-color: #F87171;
        --at-error-hover: #EF4444;
      }

      :host([position="bottom-right"]),
      :host(:not([position])) {
        bottom: 24px;
        right: 24px;
      }

      :host([position="bottom-left"]) {
        bottom: 24px;
        left: 24px;
      }

      .hidden {
        display: none;
      }
    `,
  ];

  /** Initial language: "en" or "es" */
  @property({ type: String }) lang: SupportedLang = 'en';
  @property({ type: String, reflect: true }) position = 'bottom-right';
  @property({ type: String, reflect: true }) theme = 'light';
  /** When set, skips browser support check and always shows the widget UI. */
  @property({ type: Boolean }) force = false;
  /** When set, shows the voice settings gear icon in the session panel. */
  @property({ type: Boolean }) settings = false;

  @state() private supported = false;
  @state() private active = false;

  private controller = new VoiceSessionController(this);

  connectedCallback() {
    super.connectedCallback();
    this.checkSupport();
  }

  render() {
    if (!this.supported) return nothing;

    if (this.active) {
      return html`
        <vcw-session
          .status=${this.controller.state.status}
          .lang=${this.controller.state.currentLang}
          .timerDisplay=${this.controller.timerDisplay}
          .interimTranscript=${this.controller.state.interimTranscript}
          .error=${this.controller.state.error}
          .downloadProgress=${this.controller.state.downloadProgress}
          .settingsEnabled=${this.settings}
          .voices=${this.controller.getAllVoices()}
          .currentVoiceSettings=${this.controller.getVoiceOverrides()}
          @lang-toggle=${this.handleLangToggle}
          @session-end=${this.handleEnd}
          @voice-settings-apply=${this.handleVoiceSettingsApply}
        ></vcw-session>
      `;
    }

    return html`
      <vcw-fab @fab-click=${this.handleFabClick}></vcw-fab>
    `;
  }

  private async checkSupport() {
    this.supported = this.force || await isVoiceChatSupported();
  }

  private async handleFabClick() {
    this.active = true;
    this.dispatchEvent(
      new CustomEvent('at-session-start', {
        detail: { lang: this.lang },
        bubbles: true,
        composed: true,
      }),
    );
    await this.controller.startSession(this.lang);
  }

  private handleLangToggle(e: CustomEvent<{ lang: SupportedLang }>) {
    this.controller.switchLanguage(e.detail.lang);
  }

  private handleVoiceSettingsApply(e: CustomEvent<VoiceSettings>) {
    this.controller.applyVoiceSettings(e.detail);
  }

  private handleEnd() {
    const duration = this.controller.state.elapsedSeconds;
    this.controller.endSession();
    this.active = false;
    this.dispatchEvent(
      new CustomEvent('at-session-end', {
        detail: { duration, messageCount: 0 },
        bubbles: true,
        composed: true,
      }),
    );
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'ariontalk-widget': ArionTalk;
  }
}
