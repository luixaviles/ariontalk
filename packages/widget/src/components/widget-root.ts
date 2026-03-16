import { LitElement, html, css, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { sharedStyles } from '../styles/shared-styles.js';
import { isVoiceChatSupported, setLogLevel, LogLevel } from '@ariontalk/core';
import { VoiceSessionController } from '../controllers/voice-session.controller.js';
import type { SupportedLang, VoiceSettings, BargeInPlugin } from '../types.js';
import './widget-fab.js';
import './widget-session.js';
import './widget-voice-settings.js';

const STORAGE_KEY = 'ariontalk:settings';

interface SavedSettings {
  lang: SupportedLang;
  voiceId: string;
  rate: number;
  pitch: number;
  volume: number;
  bargeInPluginId: string;
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

  /** Initial language: "auto" (detect from user speech), or a BCP-47 code like "en", "es", etc. */
  @property({ type: String }) lang: SupportedLang = 'auto';
  @property({ type: String, reflect: true }) position = 'bottom-right';
  @property({ type: String, reflect: true }) theme = 'light';
  /** When set, skips browser support check and always shows the widget UI. */
  @property({ type: Boolean }) force = false;
  /** When set, shows a settings gear icon next to the FAB for pre-session configuration. */
  @property({ type: Boolean }) settings = false;
  /** Registered barge-in plugins. Each provides a factory for creating detector instances. */
  @property({ type: Array }) bargeInPlugins: BargeInPlugin[] = [];
  /** Log level: 'disabled' | 'error' | 'warning' | 'info' | 'debug'. Disabled by default. */
  @property({ type: String, attribute: 'log-level' }) logLevel: LogLevel = LogLevel.Disabled;
  /** Engine type: 'local' (browser-based) or 'gemini' (cloud-based). */
  @property({ type: String }) engine: 'local' | 'gemini' = 'local';
  /** URL of the token server for Gemini engine authentication. */
  @property({ type: String, attribute: 'token-server' }) tokenServer = '';
  /** Gemini model identifier (e.g. 'gemini-2.0-flash-exp'). */
  @property({ type: String, attribute: 'gemini-model' }) geminiModel = '';
  /** Gemini voice name for TTS output. */
  @property({ type: String, attribute: 'gemini-voice' }) geminiVoice = '';
  /** When set, enables interactive scroll-and-highlight during Gemini speech. */
  @property({ type: Boolean, attribute: 'interactive-highlights' }) interactiveHighlights = false;

  @state() private supported = false;
  @state() private active = false;
  @state() private showSettings = false;
  @state() private muted = false;

  private savedSettings: SavedSettings | null = null;
  private controller = new VoiceSessionController(this);

  connectedCallback() {
    super.connectedCallback();
    if (this.logLevel !== LogLevel.Disabled) setLogLevel(this.logLevel);
    this.loadSettings();
    this.checkSupport();
    this.initEngine();
  }

  updated(changed: Map<string, unknown>) {
    if (changed.has('logLevel')) {
      setLogLevel(this.logLevel);
    }
    if (changed.has('engine')) {
      this.initEngine();
    }
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
          .bargeInEnabled=${this.currentSettings.bargeInPluginId !== 'off' || this.controller.capabilities.alwaysCaptureMic === true}
          .muted=${this.muted}
          @mute-toggle=${this.handleMuteToggle}
          @session-end=${this.handleEnd}
        ></vcw-session>
      `;
    }

    if (this.showSettings) {
      return html`
        <vcw-voice-settings
          .voices=${this.controller.getVoices()}
          .currentSettings=${this.currentSettings}
          .bargeInPlugins=${this.bargeInPlugins}
          .capabilities=${this.controller.capabilities}
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
    this.supported = this.force || await isVoiceChatSupported(this.engine);
  }

  private get currentSettings(): SavedSettings {
    return this.savedSettings ?? {
      lang: this.lang,
      voiceId: '',
      rate: 1.0,
      pitch: 1.0,
      volume: 1.0,
      bargeInPluginId: 'off',
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

  private async initEngine(): Promise<void> {
    if (this.engine === 'gemini') {
      await this.controller.setEngine('gemini', {
        tokenServer: this.tokenServer,
        model: this.geminiModel,
        voice: this.geminiVoice || undefined,
        interactiveHighlights: this.interactiveHighlights,
      });
    } else {
      await this.controller.setEngine('local');
    }
  }

  private async handleFabClick() {
    const s = this.currentSettings;

    if (this.engine === 'local') {
      const plugin = this.bargeInPlugins.find(p => p.id === s.bargeInPluginId);
      const detector = plugin ? plugin.create() : null;
      if (detector) {
        await this.controller.setEngine('local', { bargeInDetector: detector });
      }
    }

    this.controller.applyVoiceSettings({
      voiceId: s.voiceId || null,
      rate: s.rate,
      pitch: s.pitch,
      volume: s.volume,
    });

    this.active = true;
    this.dispatchEvent(new CustomEvent('at-session-start', {
      detail: { lang: this.lang },
      bubbles: true,
      composed: true,
    }));
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

  private handleMuteToggle(e: CustomEvent<{ muted: boolean }>) {
    this.muted = e.detail.muted;
    this.controller.setMuted(this.muted);
  }

  private handleEnd() {
    const duration = this.controller.state.elapsedSeconds;
    this.controller.endSession();
    this.active = false;
    this.muted = false;
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
