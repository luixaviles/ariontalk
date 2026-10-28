import { LitElement, html, css, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { sharedStyles } from '../styles/shared-styles.js';
import { isVoiceChatSupported, micErrorKind, setLogLevel, LogLevel } from '@ariontalk/core/utils';
import { VoiceSessionController } from '../controllers/voice-session.controller.js';
import type { SupportedLang, BargeInPlugin, TtsPlugin } from '../types.js';
import { detectUiLocale, detectGreetingLang, getStrings, type UiLocale } from '../i18n.js';
import './widget-fab.js';
import { getErrorCopy } from './widget-session.js';
import './widget-minimized.js';

const STORAGE_KEY = 'ariontalk:settings';

export interface SavedSettings {
  lang: SupportedLang;
  rate: number;
  pitch: number;
  volume: number;
  bargeInPluginId: string;
  /** Selected TTS backend. 'system' means the browser's own voices. */
  ttsPluginId: string;
  /** Voice choice per backend, so switching backends doesn't discard the other's pick. */
  voiceIds: Record<string, string>;
  /** @deprecated Read on load and migrated into voiceIds.system. Never written. */
  voiceId?: string;
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
        --at-divider-color: rgba(127, 127, 127, 0.14);
        --at-border-radius: 16px;
        --at-settings-width: 400px;
        --at-font-family: system-ui, sans-serif;
        --at-shadow-color: rgba(0, 0, 0, 0.12);
        --at-shadow-hover: rgba(0, 0, 0, 0.18);
        --at-focus-ring: rgba(17, 24, 39, 0.2);
        --at-success-color: #10B981;
        --at-error-color: #DC2626;
        --at-error-hover: #B91C1C;

        --at-primary-ui: var(--at-primary-color);
        --at-on-primary-ui: var(--at-primary-text);
        --at-state-listening: var(--at-primary-color);
        --at-state-thinking: #FF0F7B;
        --at-state-speaking: #FF0F7B;
        --at-state-voice: #DB7609;
        --at-state-muted: var(--at-text-secondary);
        --at-state-error: var(--at-error-color);
        --at-caption-label: #4B5563;
        --at-voice-deep: #DB7609;
        --at-voice-mid: #F89B29;
        --at-voice-light: #FFC46B;
        --at-voice-rim-a: #FF0F7B;
        --at-voice-rim-b: #FFD166;
        --at-dur-fast: 120ms;
        --at-dur-base: 200ms;
        --at-dur-slow: 320ms;
        --at-ease-standard: cubic-bezier(.2, 0, 0, 1);
        --at-ease-enter: cubic-bezier(0, 0, 0, 1);
        --at-ease-exit: cubic-bezier(.3, 0, 1, 1);
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
        --at-divider-color: rgba(255, 255, 255, 0.07);
        --at-border-radius: 16px;
        --at-settings-width: 400px;
        --at-font-family: system-ui, sans-serif;
        --at-shadow-color: rgba(0, 0, 0, 0.4);
        --at-shadow-hover: rgba(0, 0, 0, 0.5);
        --at-focus-ring: rgba(250, 250, 250, 0.25);
        --at-success-color: #34D399;
        --at-error-color: #F87171;
        --at-error-hover: #EF4444;

        --at-primary-ui: var(--at-primary-color);
        --at-on-primary-ui: var(--at-primary-text);
        --at-state-listening: var(--at-primary-color);
        --at-state-thinking: #FF0F7B;
        --at-state-speaking: #FF0F7B;
        --at-state-voice: #F89B29;
        --at-state-muted: var(--at-text-secondary);
        --at-state-error: var(--at-error-color);
        --at-caption-label: #A1A1AA;
        --at-voice-deep: #E8850F;
        --at-voice-mid: #F89B29;
        --at-voice-light: #FFD08A;
        --at-voice-rim-a: #FF0F7B;
        --at-voice-rim-b: #FFD166;
        --at-dur-fast: 120ms;
        --at-dur-base: 200ms;
        --at-dur-slow: 320ms;
        --at-ease-standard: cubic-bezier(.2, 0, 0, 1);
        --at-ease-enter: cubic-bezier(0, 0, 0, 1);
        --at-ease-exit: cubic-bezier(.3, 0, 1, 1);
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
        transition:
          transform var(--at-dur-base, 200ms) var(--at-ease-standard, cubic-bezier(.2, 0, 0, 1)),
          box-shadow var(--at-dur-base, 200ms) var(--at-ease-standard, cubic-bezier(.2, 0, 0, 1));
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

      .fab-container {
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 8px;
      }

      :host([position="bottom-left"]) .fab-container {
        align-items: flex-start;
      }

      /* Card 13: Button note (Couldn't start) */
      .fab-error {
        background: var(--at-bg-color);
        color: var(--at-text-color);
        border: 1px solid var(--at-border-color);
        border-left: 3px solid var(--at-state-error, var(--at-error-color));
        border-radius: 10px;
        padding: 10px 12px;
        font-size: 12px;
        line-height: 1.4;
        box-shadow: 0 4px 12px var(--at-shadow-color);
        animation: vcw-fade-in var(--at-dur-base, 200ms) var(--at-ease-enter, cubic-bezier(0, 0, 0, 1));
        max-width: 280px;
        white-space: normal;
        cursor: pointer;
        display: grid;
        grid-template-columns: 16px 1fr auto;
        align-items: center;
        column-gap: 8px;
        row-gap: 2px;
      }

      .fab-error svg {
        width: 16px;
        height: 16px;
        color: var(--at-state-error, var(--at-error-color));
        grid-row: 1 / 3;
        align-self: start;
        margin-top: 1px;
      }

      .fab-error strong {
        font-weight: 600;
        color: var(--at-text-color);
        grid-column: 2;
      }

      .fab-error span {
        color: var(--at-text-secondary);
        grid-column: 2;
      }

      .fab-error .fab-error-retry {
        grid-column: 3;
        grid-row: 1 / 3;
        min-height: 32px;
        padding: 0 12px;
        border-radius: 999px;
        background: var(--at-primary-ui, var(--at-primary-color));
        color: var(--at-on-primary-ui, var(--at-primary-text));
        font-size: 12px;
        font-weight: 600;
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
  /** Registered TTS plugins. Each provides a factory and static voice metadata. */
  @property({ type: Array }) ttsPlugins: TtsPlugin[] = [];
  /** Log level: 'disabled' | 'error' | 'warning' | 'info' | 'debug'. Disabled by default. */
  @property({ type: String, attribute: 'log-level' }) logLevel: LogLevel = LogLevel.Disabled;
  /** Engine type: 'local' (browser-based) or 'gemini' (cloud-based). */
  @property({ type: String }) engine: 'local' | 'gemini' = 'local';
  /** URL of the token server for Gemini engine authentication. */
  @property({ type: String, attribute: 'token-server' }) tokenServer = '';
  /** Site key for hosted ArionTalk service (alternative to token-server). */
  @property({ type: String, attribute: 'site-key' }) siteKey = '';
  /** Base URL of the cloud service. When set, /api/token and /api/sessions/end are derived from it.
   *  Defaults to https://api.ariontalk.com when site-key is present. */
  @property({ type: String, attribute: 'service-url' }) serviceUrl = '';
  /** Gemini voice name for TTS output. */
  @property({ type: String, attribute: 'gemini-voice' }) geminiVoice = '';
  /** When set, enables interactive scroll-and-highlight during Gemini speech. */
  @property({ type: Boolean, attribute: 'interactive-highlights' }) interactiveHighlights = false;
  /** On-device speech recognition policy: "prefer" (default), "require", or "off". */
  @property({ type: String, attribute: 'speech-local' }) speechLocal = 'prefer';
  /** When set, hides the "Powered by ArionTalk" link in the session panel. */
  @property({ type: Boolean, attribute: 'hide-attribution' }) hideAttribution = false;
  @property({ type: String, attribute: 'ui-lang' }) uiLang = '';
  /** Visible label text on the idle FAB (default variant) or aria-label (compact variant). */
  @property({ type: String }) label = '';
  /** FAB variant: "default" pill-with-text or "compact" icon-only circle. */
  @property({ type: String, reflect: true }) variant: 'default' | 'compact' = 'default';
  /** Icon to display in the FAB: "mic" | "wave". */
  @property({ type: String }) icon: 'mic' | 'wave' = 'mic';
  /** Voice assistant header title. Defaults to 'ArionTalk'. */
  @property({ type: String, attribute: 'header-title' }) headerTitle = 'ArionTalk';
  /** Voice assistant header subtitle. Defaults to localized 'Ask a question'. */
  @property({ type: String, attribute: 'header-subtitle' }) headerSubtitle = '';
  /** Whether to display the session timer in the session header. Default false. */
  @property({ type: Boolean, attribute: 'show-timer' }) showTimer = false;
  @state() private supported = false;
  @state() private active = false;
  @state() private showSettings = false;
  @state() private muted = false;
  @state() private minimized = false;
  @state() private preflight: 'permission' | 'mic-blocked' | 'mic-not-found' | null = null;
  @state() private permissionRequestInFlight = false;
  private permissionRequestId = 0;
  @state() private locale: UiLocale = 'en';

  private greetingLang: string | undefined;
  @state() private savedSettings: SavedSettings | null = null;
  private loadedSettingsKey: string | null = null;
  private controller = new VoiceSessionController(this);
  private readonly levelSourceFn = () => this.controller.getAudioLevels();

  /** Resolves the effective engine: site-key implies gemini unless engine is explicitly set. */
  private get effectiveEngine(): 'local' | 'gemini' {
    return (this.siteKey && !this.hasAttribute('engine')) ? 'gemini' : this.engine;
  }

  private get resolvedServiceUrl(): string {
    if (this.serviceUrl) return this.serviceUrl;
    if (this.tokenServer.endsWith('/api/token')) {
      return this.tokenServer.slice(0, -'/api/token'.length);
    }
    if (this.siteKey) return 'https://api.ariontalk.com';
    return '';
  }

  private get tokenServerUrl(): string {
    const base = this.resolvedServiceUrl;
    return base ? `${base}/api/token` : this.tokenServer;
  }

  private get sessionMeterUrl(): string {
    const base = this.resolvedServiceUrl;
    return base ? `${base}/api/sessions/end` : '';
  }

  private get resolvedSpeechLocal(): 'prefer' | 'require' | 'off' {
    const val = (this.speechLocal || '').toLowerCase();
    if (val === 'prefer' || val === 'require' || val === 'off') {
      return val as 'prefer' | 'require' | 'off';
    }
    console.warn(`[ArionTalk] Invalid speech-local attribute "${this.speechLocal}". Defaulting to "prefer".`);
    return 'prefer';
  }

  connectedCallback() {
    super.connectedCallback();
    if (this.logLevel !== LogLevel.Disabled) setLogLevel(this.logLevel);
    this.applyUiLang();
    this.loadSettings();
    this.checkSupport();
    this.initEngine();
  }

  updated(changed: Map<string, unknown>) {
    if (changed.has('logLevel')) {
      setLogLevel(this.logLevel);
    }
    if (changed.has('uiLang')) {
      this.applyUiLang();
    }
    if (changed.has('engine') || changed.has('siteKey')) {
      // Settings are keyed by engine, so re-read them when it changes.
      this.loadSettings(false);
    }
    if (changed.has('engine') || changed.has('siteKey') || changed.has('uiLang')) {
      this.initEngine();
    }
  }

  private applyUiLang() {
    this.locale = detectUiLocale(this.uiLang);
    this.greetingLang = detectGreetingLang(this.uiLang);
  }

  private engineMessages() {
    const s = getStrings(this.locale);
    return {
      connectionLost: s.connectionLost,
      sessionEndingSoon: s.sessionEndingSoon,
      failedToStart: s.failedToStart,
      couldNotConnect: s.couldNotConnect,
      connectionError: s.connectionError,
      invalidResponse: s.invalidResponse,
    };
  }

  render() {
    if (!this.supported) return nothing;
    const isLocal = this.effectiveEngine === 'local';
    const state = this.controller.state;

    if (this.active) {
      if (this.minimized) {
        return html`
          <vcw-minimized
            .status=${state.status}
            .muted=${this.muted}
            .userSpeaking=${state.userSpeaking ?? false}
            .errorCode=${state.errorCode ?? null}
            .levelSource=${this.levelSourceFn}
            .locale=${this.locale}
            @restore=${this.handleRestore}
          ></vcw-minimized>
        `;
      }
      return html`
        <vcw-session
          position=${this.position}
          .status=${state.status}
          .loadingStage=${state.loadingStage ?? 'connecting'}
          .timerDisplay=${this.controller.timerDisplay}
          .interimTranscript=${state.interimTranscript}
          .error=${state.error}
          .errorCode=${state.errorCode ?? null}
          .downloadProgress=${state.downloadProgress}
          .bargeInEnabled=${this.currentSettings.bargeInPluginId !== 'off' || this.controller.capabilities.alwaysCaptureMic === true}
          .muted=${this.muted}
          .localEngine=${isLocal}
          .onDevice=${state.onDevice ?? false}
          .userSpeaking=${state.userSpeaking ?? false}
          .levelSource=${this.levelSourceFn}
          show-minimize
          .showAttribution=${!this.hideAttribution}
          .headerTitle=${this.headerTitle}
          .headerSubtitle=${this.headerSubtitle}
          .showTimer=${this.showTimer}
          .locale=${this.locale}
          @mute-toggle=${this.handleMuteToggle}
          @session-end=${this.handleEnd}
          @session-close=${this.handleSessionClose}
          @session-retry=${this.handleSessionRetry}
          @minimize=${this.handleMinimize}
        ></vcw-session>
      `;
    }

    if (this.preflight) {
      return html`
        <vcw-session
          position=${this.position}
          .panel=${this.preflight}
          .permissionPending=${this.permissionRequestInFlight}
          .localEngine=${isLocal}
          .onDevice=${state.onDevice ?? false}
          .headerTitle=${this.headerTitle}
          .headerSubtitle=${this.headerSubtitle}
          .locale=${this.locale}
          @permission-allow=${this.handlePermissionAllow}
          @permission-dismiss=${this.handlePermissionDismiss}
          @session-retry=${this.handleSessionRetry}
          @session-close=${this.handleSessionClose}
        ></vcw-session>
      `;
    }

    if (this.showSettings) {
      return html`
        <vcw-voice-settings
          .voices=${this.controller.getVoices()}
          .ttsPlugins=${this.ttsPlugins}
          .currentSettings=${this.currentSettings}
          .bargeInPlugins=${this.bargeInPlugins}
          .capabilities=${this.controller.capabilities}
          .locale=${this.locale}
          .hideAttribution=${this.hideAttribution}
          @settings-apply=${this.handleSettingsApply}
          @settings-back=${this.handleSettingsBack}
        ></vcw-voice-settings>
      `;
    }

    const s = getStrings(this.locale);
    const fabErrorCopy = state.error
      ? (state.errorCode
          ? getErrorCopy(s, state.errorCode, state.error, this.headerTitle)
          : {
              title: s.errStartFailedTitle,
              detail: state.error !== s.failedToStart ? state.error : s.errStartFailedDetail,
            })
      : null;

    return html`
      <div class="fab-container">
        ${fabErrorCopy ? html`
          <div class="fab-error" role="alert" aria-live="assertive" @click=${() => this.controller.setError(null)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12" y2="12"></line>
              <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
            <strong>${fabErrorCopy.title}</strong>
            <span>${fabErrorCopy.detail}</span>
            <button type="button" class="fab-error-retry" @click=${this.handleFabErrorRetry}>${s.retry}</button>
          </div>
        ` : nothing}
        <div class="fab-row">
          <vcw-fab
            .label=${this.label}
            .variant=${this.variant}
            .icon=${this.icon}
            .locale=${this.locale}
            @fab-click=${this.handleFabClick}
            @fab-intent=${this.handleFabIntent}
          ></vcw-fab>
          ${this.settings ? html`
            <button class="gear-btn" @click=${this.handleGearClick} aria-label=${s.settings}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                   stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="3"/>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
              </svg>
            </button>
          ` : nothing}
        </div>
      </div>
    `;
  }

  private async checkSupport() {
    this.supported = this.force || await isVoiceChatSupported(this.effectiveEngine);
  }

  private get currentSettings(): SavedSettings {
    const defaults: SavedSettings = {
      lang: this.lang,
      rate: 1.0,
      pitch: 1.0,
      volume: 1.0,
      bargeInPluginId: 'off',
      ttsPluginId: 'system',
      voiceIds: {},
    };
    const saved = this.savedSettings;
    if (!saved) return defaults;
    const plugin = this.ttsPlugins.find(p => p.id === saved.ttsPluginId);
    const knownAndSupported = saved.ttsPluginId === 'system'
      || (plugin !== undefined && (plugin.isSupported?.() ?? true));
    const knownBargeIn = saved.bargeInPluginId === 'off'
      || this.bargeInPlugins.some(p => p.id === saved.bargeInPluginId);
    return {
      ...defaults,
      ...saved,
      bargeInPluginId: knownBargeIn ? saved.bargeInPluginId : 'off',
      ttsPluginId: knownAndSupported ? saved.ttsPluginId : 'system',
      voiceIds: saved.voiceIds ?? (saved.voiceId ? { system: saved.voiceId } : {}),
    };
  }

  /** Settings are stored per engine; voice IDs are not interchangeable. */
  private get settingsKey(): string {
    return `${STORAGE_KEY}:${this.effectiveEngine}`;
  }

  /**
   * Idempotent per key, so the re-read from `updated()` is a no-op unless the
   * engine actually changed. `applyLang` is off there so a mid-life engine
   * switch cannot override the host's `lang` attribute from storage.
   */
  private loadSettings(applyLang = true) {
    const key = this.settingsKey;
    if (key === this.loadedSettingsKey) return;
    this.loadedSettingsKey = key;

    try {
      const raw = localStorage.getItem(key);
      if (!raw) {
        // Drop anything held for a previously selected engine.
        this.savedSettings = null;
        return;
      }
      const stored: any = JSON.parse(raw);
      if (stored.voiceId !== undefined && stored.voiceIds === undefined) {
        stored.voiceIds = { system: stored.voiceId };
        delete stored.voiceId;
      }
      stored.voiceIds ??= {};
      stored.ttsPluginId ??= 'system';
      if (applyLang && stored.lang) this.lang = stored.lang;
      this.savedSettings = stored as SavedSettings;
    } catch { /* ignore corrupt data */ }
  }

  private saveSettings(settings: SavedSettings) {
    this.savedSettings = settings;
    try {
      localStorage.setItem(this.settingsKey, JSON.stringify(settings));
    } catch { /* storage full */ }
  }

  private async initEngine(): Promise<void> {
    if (this.effectiveEngine === 'gemini') {
      if (!this.tokenServerUrl) {
        console.error('[ariontalk] Gemini engine requires a "service-url", "token-server", or "site-key" attribute.');
        return;
      }
      await this.controller.setEngine('gemini', {
        tokenServerUrl: this.tokenServerUrl,
        // The engine takes opaque extras; naming the key is the widget's job.
        tokenRequestExtras: this.siteKey ? { siteKey: this.siteKey } : undefined,
        voice: this.geminiVoice || undefined,
        interactiveHighlights: this.interactiveHighlights,
        messages: this.engineMessages(),
        onSessionEnd: (detail: any) => {
          this.active = false;
          this.muted = false;
          this.minimized = false;

          const meterUrl = this.sessionMeterUrl;
          if (meterUrl && detail.sessionMeta?.sessionId) {
            fetch(meterUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                siteKey: this.siteKey,
                sessionId: detail.sessionMeta.sessionId,
                duration: detail.duration,
              }),
            }).catch(() => {});
          }

          this.dispatchEvent(
            new CustomEvent('at-session-end', {
              detail: { ...detail, messageCount: 0 },
              bubbles: true,
              composed: true,
            }),
          );
        },
      });
    } else {
      await this.controller.setEngine('local', {
        interactiveHighlights: this.interactiveHighlights,
        speechLocal: this.resolvedSpeechLocal,
      });
    }
  }

  private async queryMicPermission(): Promise<'granted' | 'prompt' | 'denied' | 'unknown'> {
    try {
      if (typeof navigator === 'undefined' || !navigator.permissions?.query) {
        return 'unknown';
      }
      const status = await navigator.permissions.query({ name: 'microphone' as PermissionName });
      if (status?.state === 'granted' || status?.state === 'prompt' || status?.state === 'denied') {
        return status.state;
      }
      return 'unknown';
    } catch {
      return 'unknown';
    }
  }

  private cancelPermissionRequest() {
    ++this.permissionRequestId;
    this.permissionRequestInFlight = false;
  }

  private async handleFabClick() {
    this.cancelPermissionRequest();
    this.controller.setError(null);
    this.preflight = null;

    const perm = await this.queryMicPermission();
    if (perm === 'denied') {
      this.preflight = 'mic-blocked';
      return;
    }
    if (perm === 'prompt' && this.effectiveEngine === 'local') {
      this.preflight = 'permission';
      return;
    }

    await this.continueSessionStart();
  }

  private async continueSessionStart() {
    this.controller.setError(null);
    this.preflight = null;
    const s = this.currentSettings;

    if (this.effectiveEngine === 'local') {
      // The engine's options declare these optional, not nullable.
      const plugin = this.bargeInPlugins.find(p => p.id === s.bargeInPluginId);
      const detector = plugin ? plugin.create() : undefined;
      const ttsPlugin = this.ttsPlugins.find(p => p.id === s.ttsPluginId);
      const synthesizer = ttsPlugin ? ttsPlugin.create() : undefined;
      await this.controller.setEngine('local', {
        bargeInDetector: detector,
        synthesizer,
        interactiveHighlights: this.interactiveHighlights,
        speechLocal: this.resolvedSpeechLocal,
      });
    }

    try {
      await this.controller.ensureEngine();
    } catch (err) {
      console.error('[ariontalk] Failed to load voice engine:', err);
      this.active = false;
      this.controller.setError(getStrings(this.locale).failedToStart);
      return;
    }

    const voiceId = s.voiceIds[s.ttsPluginId] || null;
    this.controller.applyVoiceSettings({
      voiceId,
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
    await this.controller.startSession(this.lang, { greetingLang: this.greetingLang });
  }

  private async handlePermissionAllow() {
    if (this.permissionRequestInFlight) return;
    const id = ++this.permissionRequestId;
    this.permissionRequestInFlight = true;

    let micErr: unknown = null;
    if (typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(track => track.stop());
      } catch (err) {
        micErr = err;
      }
    }

    if (id !== this.permissionRequestId || this.preflight !== 'permission') return;
    this.permissionRequestInFlight = false;

    if (micErr) {
      const kind = micErrorKind(micErr);
      if (kind === 'blocked') {
        this.preflight = 'mic-blocked';
        return;
      }
      if (kind === 'not-found') {
        this.preflight = 'mic-not-found';
        return;
      }
      this.preflight = null;
      this.controller.setError(getStrings(this.locale).failedToStart);
      return;
    }

    this.preflight = null;
    await this.continueSessionStart();
  }

  private handlePermissionDismiss() {
    this.cancelPermissionRequest();
    this.preflight = null;
  }

  private handleSessionClose() {
    this.cancelPermissionRequest();
    if (this.active) {
      this.handleEnd();
    } else {
      this.preflight = null;
    }
  }

  private async handleSessionRetry() {
    if (this.active) {
      this.handleEnd();
    } else {
      this.preflight = null;
    }
    await this.handleFabClick();
  }

  private async handleFabErrorRetry(e: Event) {
    e.stopPropagation();
    this.controller.setError(null);
    await this.handleFabClick();
  }

  private handleFabIntent() {
    this.controller.ensureEngine().catch(() => {});
    const s = this.currentSettings;
    if (s.ttsPluginId === 'system') return;
    const plugin = this.ttsPlugins.find(p => p.id === s.ttsPluginId);
    if (!plugin?.preload || plugin.status?.() !== 'unknown') return;
    plugin.preload().catch(() => {});
  }

  private loadSettingsPanel(): Promise<unknown> {
    return import('./widget-voice-settings.js');
  }

  private async handleGearClick() {
    try {
      await this.controller.ensureEngine();
    } catch (err) {
      console.warn('[ariontalk] Failed to pre-load voice engine for settings:', err);
    }
    try {
      await this.loadSettingsPanel();
    } catch (err) {
      console.warn('[ariontalk] Failed to load settings panel:', err);
      return;
    }
    this.showSettings = true;
  }

  private handleSettingsApply(e: CustomEvent<SavedSettings>) {
    const previous = this.currentSettings.ttsPluginId;
    this.saveSettings(e.detail);
    this.lang = e.detail.lang;
    this.showSettings = false;

    if (e.detail.ttsPluginId !== 'system') {
      const plugin = this.ttsPlugins.find(p => p.id === e.detail.ttsPluginId);
      const status = plugin?.status?.() ?? 'unknown';
      if (e.detail.ttsPluginId !== previous || status === 'failed') {
        plugin?.preload?.().catch(() => {}).finally(() => this.requestUpdate());
      }
    }
  }

  private handleSettingsBack() {
    this.showSettings = false;
  }

  private handleMuteToggle(e: CustomEvent<{ muted: boolean }>) {
    this.muted = e.detail.muted;
    this.controller.setMuted(this.muted);
  }

  private handleMinimize() {
    this.minimized = true;
  }

  private handleRestore() {
    this.minimized = false;
  }

  private handleEnd() {
    this.cancelPermissionRequest();
    this.active = false;
    this.muted = false;
    this.minimized = false;
    this.preflight = null;
    this.controller.endSession();
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'ariontalk-widget': ArionTalk;
  }
}
