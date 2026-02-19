import { LitElement, html, css, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { sharedStyles } from '../styles/shared-styles.js';
import { isVoiceChatSupported } from '../utils/browser-support.js';
import { VoiceSessionController } from '../controllers/voice-session.controller.js';
import type { SupportedLang, VoiceSettings } from '../types.js';
import './widget-fab.js';
import './widget-session.js';

/**
 * <voice-chat-widget> — Root component that embeds the full voice chat experience.
 * Toggles between a FAB (idle) and session panel (active).
 */
@customElement('voice-chat-widget')
export class VoiceChatWidget extends LitElement {
  static styles = [
    sharedStyles,
    css`
      :host {
        display: block;
        position: fixed;
        z-index: 999999;
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
  @property({ type: String }) theme = 'light';
  /** When set, skips browser support check and always shows the widget UI. */
  @property({ type: Boolean }) force = false;

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
      new CustomEvent('vcw-session-start', {
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
      new CustomEvent('vcw-session-end', {
        detail: { duration, messageCount: 0 },
        bubbles: true,
        composed: true,
      }),
    );
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'voice-chat-widget': VoiceChatWidget;
  }
}
