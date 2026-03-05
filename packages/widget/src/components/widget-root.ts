import { LitElement, html, css, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { sharedStyles } from '../styles/shared-styles.js';
import { isVoiceChatSupported } from '@ariontalk/core';
import { VoiceSessionController } from '../controllers/voice-session.controller.js';
import type { SupportedLang, VoiceSettings, BargeInMode } from '../types.js';
import './widget-fab.js';
import './widget-session.js';
import './widget-voice-settings.js';

const STORAGE_KEY = 'ariontalk:settings';

interface SavedSettings {
  lang: SupportedLang;
  voiceURI: string;
  rate: number;
  pitch: number;
  volume: number;
  bargeIn: BargeInMode;
}

/**
 * <ariontalk-widget> — Root component that embeds the full voice chat experience.
 * Toggles between a FAB (idle), settings panel, and session panel (active).
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

      .fab-row {
        display: flex;
        align-items: center;
        gap: 12px;
      }

      .gear-btn {
        width: 44px;
        height: 44px;
        border-radius: 50%;
        background: var(--at-surface-color);
        color: var(--at-text-color);
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 4px 14px var(--at-shadow-color);
        transition: transform 0.2s ease, box-shadow 0.2s ease;
      }

      .gear-btn:hover {
        transform: translateY(-1px);
        box-shadow: 0 6px 20px var(--at-shadow-hover);
      }

      .gear-btn:active {
        transform: translateY(0);
      }

      .gear-btn svg {
        width: 20px;
        height: 20px;
      }
    `,
  ];

  /** Initial language: "en" or "es" */
  @property({ type: String }) lang: SupportedLang = 'en';
  @property({ type: String, reflect: true }) position = 'bottom-right';
  @property({ type: String, reflect: true }) theme = 'light';
  /** When set, skips browser support check and always shows the widget UI. */
  @property({ type: Boolean }) force = false;
  /** When set, shows a settings gear icon next to the FAB for pre-session configuration. */
  @property({ type: Boolean }) settings = false;

  @state() private supported = false;
  @state() private active = false;
  @state() private showSettings = false;

  private savedSettings: SavedSettings | null = null;
  private controller = new VoiceSessionController(this);

  connectedCallback() {
    super.connectedCallback();
    this.loadSettings();
    this.checkSupport();
  }

  render() {
    if (!this.supported) return nothing;

    if (this.active) {
      return html`
        <vcw-session
          .status=${this.controller.state.status}
          .timerDisplay=${this.controller.timerDisplay}
          .interimTranscript=${this.controller.state.interimTranscript}
          .error=${this.controller.state.error}
          .downloadProgress=${this.controller.state.downloadProgress}
          @session-end=${this.handleEnd}
        ></vcw-session>
      `;
    }

    if (this.showSettings) {
      return html`
        <vcw-voice-settings
          .voices=${this.controller.getAllVoices()}
          .currentSettings=${this.currentSettings}
          @settings-apply=${this.handleSettingsApply}
          @settings-back=${this.handleSettingsBack}
        ></vcw-voice-settings>
      `;
    }

    return html`
      <div class="fab-row">
        <vcw-fab @fab-click=${this.handleFabClick}></vcw-fab>
        ${this.settings ? html`
          <button class="gear-btn" @click=${this.handleGearClick} aria-label="Settings">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                 stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
          </button>
        ` : nothing}
      </div>
    `;
  }

  private async checkSupport() {
    this.supported = this.force || await isVoiceChatSupported();
  }

  private get currentSettings(): SavedSettings {
    return this.savedSettings ?? {
      lang: this.lang,
      voiceURI: '',
      rate: 1.0,
      pitch: 1.0,
      volume: 1.0,
      bargeIn: 'off',
    };
  }

  private loadSettings() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const stored: SavedSettings = JSON.parse(raw);
      if (stored.lang) this.lang = stored.lang;
      this.savedSettings = stored;
    } catch { /* ignore corrupt data */ }
  }

  private saveSettings(settings: SavedSettings) {
    this.savedSettings = settings;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch { /* storage full */ }
  }

  private async handleFabClick() {
    // Apply saved voice settings before starting
    const s = this.currentSettings;
    const voice = s.voiceURI
      ? this.controller.getAllVoices().find(v => v.voiceURI === s.voiceURI) ?? null
      : null;
    this.controller.setBargeInMode(s.bargeIn);
    this.controller.applyVoiceSettings({ voice, rate: s.rate, pitch: s.pitch, volume: s.volume });

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

  private handleGearClick() {
    this.showSettings = true;
  }

  private handleSettingsApply(e: CustomEvent<SavedSettings>) {
    this.saveSettings(e.detail);
    this.lang = e.detail.lang;
    this.showSettings = false;
  }

  private handleSettingsBack() {
    this.showSettings = false;
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
