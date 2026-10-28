import { LitElement, html, css, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { sharedStyles } from '../styles/shared-styles.js';
import type { SupportedLang, BargeInPlugin, TtsPlugin } from '../types.js';
import type { VoiceInfo, EngineCapabilities } from '@ariontalk/core';
import { getStrings, type UiLocale, type UiStrings } from '../i18n.js';

interface VoiceTier {
  label: string;
  voices: VoiceInfo[];
}

interface SettingsData {
  lang: SupportedLang;
  rate: number;
  pitch: number;
  volume: number;
  bargeInPluginId: string;
  ttsPluginId: string;
  voiceIds: Record<string, string>;
}

/**
 * Settings panel with language selection, voice dropdown, and rate/pitch/volume sliders.
 */
@customElement('vcw-voice-settings')
export class WidgetVoiceSettings extends LitElement {
  static styles = [
    sharedStyles,
    css`
      :host {
        display: block;
      }

      .panel {
        background: var(--at-bg-color, #FFFFFF);
        border-radius: var(--at-border-radius, 16px);
        box-shadow: 0 8px 30px var(--at-shadow-color);
        padding: 24px;
        width: var(--at-settings-width, 400px);
        max-width: calc(100vw - 48px);
        box-sizing: border-box;
        animation: vcw-fade-in var(--at-dur-base, 200ms) var(--at-ease-enter, cubic-bezier(0, 0, 0, 1));
        display: flex;
        flex-direction: column;
        gap: 18px;
      }

      .header {
        display: flex;
        align-items: center;
        gap: 12px;
      }

      .back-btn {
        position: relative;
        width: 32px;
        height: 32px;
        border-radius: 50%;
        background: var(--at-surface-color, #F3F4F6);
        color: var(--at-text-color, #1F2937);
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background var(--at-dur-fast, 120ms) var(--at-ease-standard, cubic-bezier(.2, 0, 0, 1));
        flex-shrink: 0;
        padding: 0;
      }

      .back-btn::after {
        content: "";
        position: absolute;
        inset: -6px;
      }

      .back-btn:hover {
        background: var(--at-surface-hover, #E5E7EB);
      }

      .back-btn svg {
        width: 16px;
        height: 16px;
      }

      .header-title {
        font-size: 16px;
        font-weight: 700;
        color: var(--at-text-color, #1F2937);
      }

      .field {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }

      .field-label {
        font-size: 13px;
        font-weight: 600;
        color: var(--at-text-color, #1F2937);
        display: flex;
        justify-content: space-between;
        align-items: center;
      }

      .field-label output {
        font-weight: 500;
        color: var(--at-text-secondary, #6B7280);
        font-variant-numeric: tabular-nums;
      }

      .lang-selector {
        display: flex;
        border: 1px solid var(--at-border-color, #D1D5DB);
        border-radius: 8px;
        overflow: hidden;
      }

      .lang-option {
        flex: 1 1 0;
        min-height: 40px;
        padding: 0 12px;
        font-size: 13px;
        font-weight: 600;
        color: var(--at-text-secondary, #6B7280);
        background: var(--at-bg-color, #FFFFFF);
        transition:
          background var(--at-dur-fast, 120ms) var(--at-ease-standard, cubic-bezier(.2, 0, 0, 1)),
          color var(--at-dur-fast, 120ms) var(--at-ease-standard, cubic-bezier(.2, 0, 0, 1));
      }

      .lang-option + .lang-option {
        border-left: 1px solid var(--at-border-color, #D1D5DB);
      }

      .lang-option.active {
        background: var(--at-primary-ui, var(--at-primary-color, #111827));
        color: var(--at-on-primary-ui, var(--at-primary-text, #FFFFFF));
      }

      .lang-option[aria-disabled="true"] {
        cursor: not-allowed;
        background: var(--at-surface-color, #F3F4F6);
        font-weight: 500;
      }

      .hint {
        display: flex;
        gap: 6px;
        font-size: 12px;
        line-height: 1.45;
        color: var(--at-text-secondary, #6B7280);
      }

      .hint svg {
        width: 14px;
        height: 14px;
        flex-shrink: 0;
        margin-top: 1px;
      }

      .tts-note {
        color: var(--at-state-error, var(--at-error-color, #DC2626));
      }

      select {
        width: 100%;
        min-height: 40px;
        box-sizing: border-box;
        padding: 8px 12px;
        border: 1px solid var(--at-border-color, #D1D5DB);
        border-radius: 8px;
        font-size: 13px;
        font-family: var(--at-font-family, system-ui, sans-serif);
        color: var(--at-text-color, #1F2937);
        background: var(--at-bg-color, #FFFFFF);
        outline: none;
        text-overflow: ellipsis;
        overflow: hidden;
        white-space: nowrap;
      }

      select:focus {
        border-color: var(--at-primary-ui, var(--at-primary-color, #111827));
        box-shadow: 0 0 0 2px var(--at-focus-ring);
      }

      .sliders-row {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
        gap: 14px;
      }

      input[type="range"] {
        width: 100%;
        min-height: 24px;
        accent-color: var(--at-primary-ui, var(--at-primary-color, #111827));
      }

      .apply-btn {
        width: 100%;
        min-height: 44px;
        padding: 10px;
        border-radius: 999px;
        background: var(--at-primary-ui, var(--at-primary-color, #111827));
        color: var(--at-on-primary-ui, var(--at-primary-text, #FFFFFF));
        font-size: 14px;
        font-weight: 600;
        transition: opacity var(--at-dur-fast, 120ms) var(--at-ease-standard, cubic-bezier(.2, 0, 0, 1));
      }

      .apply-btn:hover {
        opacity: 0.9;
      }

      .footer {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        padding-top: 14px;
        border-top: 1px solid var(--at-border-color, #D1D5DB);
        font-size: 11px;
        color: var(--at-text-secondary, #6B7280);
      }

      .footer svg {
        height: 24px;
        width: auto;
        color: var(--at-text-color, #1F2937);
      }
    `,
  ];

  @property({ type: Array }) voices: VoiceInfo[] = [];
  @property({ type: Array }) ttsPlugins: TtsPlugin[] = [];
  @property({ type: Object }) currentSettings: SettingsData | null = null;
  @property({ type: Array }) bargeInPlugins: BargeInPlugin[] = [];
  @property({ type: Object }) capabilities: EngineCapabilities | null = null;
  @property({ type: String }) locale: UiLocale = 'en';
  @property({ type: Boolean, attribute: 'hide-attribution' }) hideAttribution = false;

  private static readonly SYSTEM_TTS = {
    id: 'system',
    supports: { rate: true, pitch: true, volume: true },
  };

  private static readonly LANG_DISPLAY_NAMES: Record<string, string> = {
    en: 'English',
    es: 'Español',
    ja: '日本語',
    fr: 'Français',
    de: 'Deutsch',
    pt: 'Português',
    it: 'Italiano',
    zh: '中文',
    ko: '한국어',
    hi: 'हिन्दी',
    ar: 'العربية',
    ru: 'Русский',
  };

  @state() private selectedLang: SupportedLang = 'auto';
  @state() private ttsPluginId = 'system';
  @state() private voiceIds: Record<string, string> = {};
  @state() private rate = 1.0;
  @state() private pitch = 1.0;
  @state() private volume = 1.0;
  @state() private bargeInPluginId = 'off';

  private initialized = false;

  connectedCallback() {
    super.connectedCallback();
    this.initialized = false;
  }

  private isPluginSupported(plugin?: TtsPlugin): boolean {
    if (!plugin) return false;
    return plugin.isSupported?.() ?? true;
  }

  private resolveTtsPluginId(id?: string): string {
    if (!id || id === 'system') return 'system';
    const plugin = this.ttsPlugins.find(p => p.id === id);
    return this.isPluginSupported(plugin) ? id : 'system';
  }

  private resolveBargeInPluginId(id?: string): string {
    if (!id || id === 'off') return 'off';
    return this.bargeInPlugins.some(p => p.id === id) ? id : 'off';
  }

  willUpdate(changed: Map<string, unknown>) {
    if (!this.initialized) {
      this.initialized = true;
      if (this.currentSettings) {
        this.selectedLang = this.currentSettings.lang;
        const stored = this.currentSettings as SettingsData & { voiceId?: string };
        this.ttsPluginId = this.resolveTtsPluginId(stored.ttsPluginId);
        const voiceIds = { ...(stored.voiceIds ?? {}) };
        if (stored.voiceId && voiceIds.system === undefined) voiceIds.system = stored.voiceId;
        this.voiceIds = voiceIds;
        this.rate = this.currentSettings.rate;
        this.pitch = this.currentSettings.pitch;
        this.volume = this.currentSettings.volume;
        this.bargeInPluginId = this.resolveBargeInPluginId(this.currentSettings.bargeInPluginId);
      }
    } else {
      if (changed.has('ttsPlugins')) {
        this.ttsPluginId = this.resolveTtsPluginId(this.ttsPluginId);
      }
      if (changed.has('bargeInPlugins')) {
        this.bargeInPluginId = this.resolveBargeInPluginId(this.bargeInPluginId);
      }
    }
  }

  private get selectedPlugin(): TtsPlugin | undefined {
    return this.ttsPlugins.find(p => p.id === this.ttsPluginId);
  }

  private get selectedVoices(): VoiceInfo[] {
    if (this.ttsPluginId === 'system') return this.voices;
    return this.selectedPlugin?.voices ?? this.voices;
  }

  private get selectedSupports() {
    if (this.ttsPluginId === 'system') return WidgetVoiceSettings.SYSTEM_TTS.supports;
    return this.selectedPlugin?.supports ?? WidgetVoiceSettings.SYSTEM_TTS.supports;
  }

  private get selectedTtsStatus(): string {
    if (this.ttsPluginId === 'system') return 'ready';
    return this.selectedPlugin?.status?.() ?? 'unknown';
  }

  private get selectedTtsLabel(): string {
    const s = getStrings(this.locale);
    if (this.ttsPluginId === 'system') return s.speechSystem;
    return this.selectedPlugin?.label ?? this.ttsPluginId;
  }

  private selectTtsPlugin(id: string) {
    if (id !== 'system') {
      const plugin = this.ttsPlugins.find(p => p.id === id);
      if (!this.isPluginSupported(plugin)) return;
      this.ttsPluginId = id;
      if (plugin && !this.voiceIds[id] && plugin.voices.length > 0) {
        this.voiceIds = { ...this.voiceIds, [id]: plugin.voices[0].id };
      }
      return;
    }
    this.ttsPluginId = 'system';
  }

  private handleSpeechKeyDown(e: KeyboardEvent) {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
    e.preventDefault();
    const supportedPlugins = this.ttsPlugins.filter(p => this.isPluginSupported(p));
    const ids = ['system', ...supportedPlugins.map(p => p.id)];
    if (ids.length <= 1) return;
    const currentIdx = Math.max(0, ids.indexOf(this.ttsPluginId));
    const delta = (e.key === 'ArrowRight' || e.key === 'ArrowDown') ? 1 : -1;
    const nextIdx = (currentIdx + delta + ids.length) % ids.length;
    const nextId = ids[nextIdx];
    this.selectTtsPlugin(nextId);
    const group = e.currentTarget as HTMLElement;
    const btn = group.querySelector<HTMLButtonElement>(`button[data-id="${nextId}"]`);
    btn?.focus();
  }

  private handleInterruptionKeyDown(e: KeyboardEvent) {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
    e.preventDefault();
    const ids = ['off', ...this.bargeInPlugins.map(p => p.id)];
    if (ids.length <= 1) return;
    const currentIdx = Math.max(0, ids.indexOf(this.bargeInPluginId));
    const delta = (e.key === 'ArrowRight' || e.key === 'ArrowDown') ? 1 : -1;
    const nextIdx = (currentIdx + delta + ids.length) % ids.length;
    const nextId = ids[nextIdx];
    this.bargeInPluginId = nextId;
    const group = e.currentTarget as HTMLElement;
    const btn = group.querySelector<HTMLButtonElement>(`button[data-id="${nextId}"]`);
    btn?.focus();
  }

  render() {
    const s = getStrings(this.locale);
    const tiers = this.getVoiceTiers(s);
    const supports = this.selectedSupports;
    const currentVoiceId = this.voiceIds[this.ttsPluginId] ?? '';
    const speechHint = this.ttsPluginId === 'system'
      ? s.speechSystemHint
      : (this.selectedPlugin?.tooltip ?? '');
    const unsupportedPlugins = this.ttsPlugins.filter(p => !this.isPluginSupported(p) && p.unsupportedReason);
    const selectedBargeIn = this.bargeInPlugins.find(p => p.id === this.bargeInPluginId);
    const interruptionHint = this.bargeInPluginId === 'off'
      ? s.interruptionOffHint
      : (selectedBargeIn?.tooltip ?? '');
    const showSliders = this.capabilities?.supportsRatePitchVolume !== false
      && (supports.rate || supports.pitch || supports.volume);

    return html`
      <div class="panel">
        <div class="header">
          <button class="back-btn" @click=${this.handleBack} aria-label=${s.back}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                 stroke-linecap="round" stroke-linejoin="round">
              <path d="M19 12H5"/>
              <polyline points="12 19 5 12 12 5"/>
            </svg>
          </button>
          <span class="header-title">${s.settingsTitle}</span>
        </div>

        <div class="field">
          <label class="field-label" for="at-lang-select">${s.language}</label>
          <select id="at-lang-select" @change=${this.handleLangChange} .value=${this.selectedLang}>
            ${(this.capabilities?.supportedLanguages ?? ['auto', 'en']).map(code => html`
              <option value=${code} ?selected=${code === this.selectedLang}>
                ${code === 'auto' ? s.automatic : (WidgetVoiceSettings.LANG_DISPLAY_NAMES[code] ?? code)}
              </option>
            `)}
          </select>
        </div>

        ${this.capabilities?.supportsTtsPlugins !== false && this.ttsPlugins.length > 0 ? html`
          <div class="field">
            <span class="field-label" id="at-speech-label">${s.speech}</span>
            <div
              class="lang-selector"
              role="radiogroup"
              aria-labelledby="at-speech-label"
              @keydown=${this.handleSpeechKeyDown}
            >
              <button
                type="button"
                role="radio"
                data-id="system"
                tabindex=${this.ttsPluginId === 'system' ? '0' : '-1'}
                aria-checked=${this.ttsPluginId === 'system' ? 'true' : 'false'}
                class="lang-option ${this.ttsPluginId === 'system' ? 'active' : ''}"
                @click=${() => this.selectTtsPlugin('system')}
              >${s.speechSystem}</button>
              ${this.ttsPlugins.map(p => {
                const supported = this.isPluginSupported(p);
                const checked = supported && this.ttsPluginId === p.id;
                return html`
                  <button
                    type="button"
                    role="radio"
                    data-id=${p.id}
                    tabindex=${checked ? '0' : '-1'}
                    aria-checked=${checked ? 'true' : 'false'}
                    aria-disabled=${supported ? nothing : 'true'}
                    class="lang-option ${checked ? 'active' : ''}"
                    @click=${() => this.selectTtsPlugin(p.id)}
                  >${p.label}</button>
                `;
              })}
            </div>
            ${speechHint ? html`
              <div class="hint">
                ${this.renderInfoSvg()}
                <span>${speechHint}</span>
              </div>
            ` : nothing}
            ${unsupportedPlugins.map(p => html`
              <div class="hint unsupported-reason">
                ${this.renderInfoSvg()}
                <span>${p.unsupportedReason}</span>
              </div>
            `)}
            ${this.selectedTtsStatus === 'failed' ? html`
              <div class="hint tts-note" role="status">
                ${this.renderAlertSvg()}
                <span>${s.ttsUnavailable.replace('{label}', this.selectedTtsLabel)}</span>
              </div>
            ` : nothing}
          </div>
        ` : nothing}

        ${this.capabilities?.supportsVoiceSelection !== false ? html`
        <div class="field">
          <label class="field-label" for="at-voice-select">${s.voice}</label>
          <select id="at-voice-select" @change=${this.handleVoiceChange} .value=${currentVoiceId}>
            ${this.ttsPluginId === 'system' || this.selectedPlugin?.allowAutomaticVoice
              ? html`<option value="">${s.automatic}</option>` : nothing}
            ${tiers.map(tier => tier.voices.length > 0 ? html`
              <optgroup label=${tier.label}>
                ${tier.voices.map(v => html`
                  <option value=${v.id} ?selected=${v.id === currentVoiceId}>
                    ${v.name} (${v.lang}${v.group ? '' : `, ${v.local ? s.voiceLocal : s.voiceRemote}`})
                  </option>
                `)}
              </optgroup>
            ` : '')}
          </select>
        </div>
        ` : nothing}

        ${showSliders ? html`
          <div class="sliders-row">
            ${supports.rate ? html`
              <div class="field">
                <label class="field-label" for="at-rate-range">
                  <span>${s.speed}</span>
                  <output for="at-rate-range">${this.rate.toFixed(1)}x</output>
                </label>
                <input id="at-rate-range" type="range" min="0.5" max="2.0" step="0.1"
                       .value=${String(this.rate)}
                       @input=${this.handleRateChange} />
              </div>
            ` : nothing}

            ${supports.pitch ? html`
              <div class="field">
                <label class="field-label" for="at-pitch-range">
                  <span>${s.pitch}</span>
                  <output for="at-pitch-range">${this.pitch.toFixed(1)}</output>
                </label>
                <input id="at-pitch-range" type="range" min="0.0" max="2.0" step="0.1"
                       .value=${String(this.pitch)}
                       @input=${this.handlePitchChange} />
              </div>
            ` : nothing}

            ${supports.volume ? html`
              <div class="field">
                <label class="field-label" for="at-volume-range">
                  <span>${s.volume}</span>
                  <output for="at-volume-range">${Math.round(this.volume * 100)}%</output>
                </label>
                <input id="at-volume-range" type="range" min="0.0" max="1.0" step="0.05"
                       .value=${String(this.volume)}
                       @input=${this.handleVolumeChange} />
              </div>
            ` : nothing}
          </div>
        ` : nothing}

        ${this.capabilities?.supportsBargeInPlugins !== false && this.bargeInPlugins.length > 0 ? html`
          <div class="field">
            <span class="field-label" id="at-interruption-label">${s.interruption}</span>
            <div
              class="lang-selector"
              role="radiogroup"
              aria-labelledby="at-interruption-label"
              @keydown=${this.handleInterruptionKeyDown}
            >
              <button
                type="button"
                role="radio"
                data-id="off"
                tabindex=${this.bargeInPluginId === 'off' ? '0' : '-1'}
                aria-checked=${this.bargeInPluginId === 'off' ? 'true' : 'false'}
                class="lang-option ${this.bargeInPluginId === 'off' ? 'active' : ''}"
                @click=${() => { this.bargeInPluginId = 'off'; }}
              >${s.interruptionOff}</button>
              ${this.bargeInPlugins.map(plugin => {
                const checked = this.bargeInPluginId === plugin.id;
                return html`
                  <button
                    type="button"
                    role="radio"
                    data-id=${plugin.id}
                    tabindex=${checked ? '0' : '-1'}
                    aria-checked=${checked ? 'true' : 'false'}
                    class="lang-option ${checked ? 'active' : ''}"
                    @click=${() => { this.bargeInPluginId = plugin.id; }}
                  >${plugin.label}</button>
                `;
              })}
            </div>
            ${interruptionHint ? html`
              <div class="hint">
                ${this.renderInfoSvg()}
                <span>${interruptionHint}</span>
              </div>
            ` : nothing}
          </div>
        ` : nothing}

        <button class="apply-btn" @click=${this.handleApply}>${s.apply}</button>

        ${!this.hideAttribution ? this.renderFooter(s) : nothing}
      </div>
    `;
  }

  private renderInfoSvg() {
    return html`
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="12" y1="16" x2="12" y2="12"></line>
        <line x1="12" y1="8" x2="12.01" y2="8"></line>
      </svg>
    `;
  }

  private renderAlertSvg() {
    return html`
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="12" y1="8" x2="12" y2="12"></line>
        <line x1="12" y1="16" x2="12.01" y2="16"></line>
      </svg>
    `;
  }

  private renderFooter(s: UiStrings) {
    return html`
      <div class="footer">
        <span>${s.poweredBy}</span>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1898.3 529.2" fill="none" role="img" aria-label="ArionTalk">
          <defs>
            <linearGradient id="at-settings-lockup-grad" x1="654.375" y1="13.748" x2="654.375" y2="1143.78" gradientUnits="userSpaceOnUse">
              <stop stop-color="#FF0F7B"/>
              <stop offset="1" stop-color="#F89B29"/>
            </linearGradient>
          </defs>
          <g transform="translate(-69.53 -6.44) scale(0.46833)">
            <path d="M654.375 13.748L148.472 228.065V578.765C148.472 851.532 362.508 1046.36 654.375 1143.78C946.242 1046.36 1160.28 851.532 1160.28 578.765V228.065L654.375 13.748Z" fill="url(#at-settings-lockup-grad)"/>
            <path d="M507.807 435.185C507.807 399.417 479.683 370.422 444.992 370.422C410.3 370.422 382.177 399.417 382.177 435.185V661.857C382.177 697.625 410.3 726.621 444.992 726.621C479.683 726.621 507.807 697.625 507.807 661.857V435.185Z" fill="white"/>
            <path d="M717.19 308.665C717.19 273.34 688.285 244.703 652.63 244.703C616.975 244.703 588.07 273.34 588.07 308.665V788.375C588.07 823.7 616.975 852.337 652.63 852.337C688.285 852.337 717.19 823.7 717.19 788.375V308.665Z" fill="white"/>
            <path d="M926.572 394.425C926.572 349.698 897.644 313.44 861.96 313.44C826.275 313.44 797.347 349.698 797.347 394.425V677.871C797.347 722.597 826.275 758.855 861.96 758.855C897.644 758.855 926.572 722.597 926.572 677.871V394.425Z" fill="white"/>
          </g>
          <g transform="translate(596.76 -1145.30)">
            <path d="M2.19958 1490.27L77.5352 1297.8H114.378L189.439 1490.27H147.097L108.329 1386.61C107.229 1383.68 105.855 1379.92 104.205 1375.34C102.739 1370.76 101.181 1365.9 99.531 1360.77C97.8813 1355.64 96.3232 1350.78 94.8569 1346.2C93.3905 1341.43 92.2907 1337.49 91.5575 1334.37L98.9811 1334.1C97.8813 1338.31 96.5982 1342.71 95.1318 1347.29C93.8487 1351.69 92.474 1356.28 91.0076 1361.04C89.5412 1365.62 87.9832 1370.12 86.3335 1374.51C84.6838 1378.91 83.1258 1383.22 81.6594 1387.44L42.8918 1490.27H2.19958ZM37.1179 1449.85L50.5903 1416.58H138.848L152.596 1449.85H37.1179ZM210.964 1490.27V1344.82H248.632L250.007 1391.56L243.408 1381.94C245.607 1374.42 249.182 1367.64 254.131 1361.59C259.08 1355.36 264.854 1350.5 271.453 1347.02C278.235 1343.54 285.292 1341.8 292.624 1341.8C295.74 1341.8 298.764 1342.07 301.697 1342.62C304.63 1343.17 307.104 1343.81 309.12 1344.55L298.672 1387.44C296.473 1386.34 293.815 1385.42 290.699 1384.69C287.583 1383.77 284.375 1383.31 281.076 1383.31C276.677 1383.31 272.552 1384.14 268.703 1385.79C265.037 1387.25 261.829 1389.45 259.08 1392.39C256.33 1395.14 254.131 1398.44 252.481 1402.28C251.015 1406.13 250.282 1410.35 250.282 1414.93V1490.27H210.964ZM334.822 1490.27V1344.82H373.864V1490.27H334.822ZM354.068 1314.85C346.553 1314.85 340.687 1313.02 336.471 1309.35C332.255 1305.69 330.147 1300.46 330.147 1293.68C330.147 1287.45 332.255 1282.41 336.471 1278.56C340.87 1274.53 346.736 1272.51 354.068 1272.51C361.583 1272.51 367.449 1274.43 371.664 1278.28C375.88 1281.95 377.988 1287.08 377.988 1293.68C377.988 1300.1 375.789 1305.23 371.389 1309.08C367.174 1312.93 361.4 1314.85 354.068 1314.85ZM483.201 1493.02C468.354 1493.02 455.064 1489.81 443.333 1483.39C431.786 1476.8 422.621 1467.81 415.839 1456.45C409.24 1445.08 405.94 1432.07 405.94 1417.41C405.94 1402.74 409.24 1389.82 415.839 1378.64C422.621 1367.27 431.786 1358.29 443.333 1351.69C455.064 1345.1 468.354 1341.8 483.201 1341.8C497.865 1341.8 510.97 1345.1 522.518 1351.69C534.249 1358.29 543.414 1367.27 550.013 1378.64C556.612 1389.82 559.911 1402.74 559.911 1417.41C559.911 1432.07 556.612 1445.08 550.013 1456.45C543.414 1467.81 534.249 1476.8 522.518 1483.39C510.97 1489.81 497.865 1493.02 483.201 1493.02ZM483.201 1458.92C490.349 1458.92 496.765 1457.18 502.447 1453.7C508.129 1450.03 512.528 1445.08 515.644 1438.85C518.944 1432.44 520.594 1425.29 520.594 1417.41C520.594 1409.34 518.944 1402.19 515.644 1395.96C512.528 1389.55 508.129 1384.6 502.447 1381.11C496.765 1377.45 490.349 1375.61 483.201 1375.61C475.869 1375.61 469.362 1377.45 463.679 1381.11C457.997 1384.78 453.506 1389.73 450.207 1395.96C446.908 1402.19 445.35 1409.34 445.533 1417.41C445.35 1425.29 446.908 1432.44 450.207 1438.85C453.506 1445.08 457.997 1450.03 463.679 1453.7C469.362 1457.18 475.869 1458.92 483.201 1458.92ZM589.285 1490.27V1344.82H626.678L627.778 1374.51L620.079 1377.81C622.096 1371.22 625.67 1365.26 630.802 1359.94C636.118 1354.44 642.442 1350.04 649.774 1346.75C657.106 1343.45 664.804 1341.8 672.869 1341.8C683.867 1341.8 693.032 1344 700.364 1348.39C707.879 1352.79 713.47 1359.48 717.136 1368.47C720.985 1377.26 722.91 1388.17 722.91 1401.18V1490.27H683.867V1404.21C683.867 1397.61 682.951 1392.11 681.118 1387.71C679.285 1383.31 676.444 1380.11 672.594 1378.09C668.928 1375.89 664.346 1374.97 658.847 1375.34C654.448 1375.34 650.324 1376.07 646.474 1377.54C642.808 1378.82 639.601 1380.75 636.851 1383.31C634.285 1385.88 632.177 1388.81 630.527 1392.11C629.061 1395.41 628.328 1398.99 628.328 1402.83V1490.27H609.082C604.866 1490.27 601.108 1490.27 597.809 1490.27C594.509 1490.27 591.668 1490.27 589.285 1490.27Z" fill="#FF0F7B"/>
            <path d="M797.64 1490.27V1334.92H741.55V1297.8H896.621V1334.92H838.882V1490.27H797.64ZM952.235 1493.02C940.137 1493.02 929.231 1489.72 919.516 1483.12C909.802 1476.52 902.103 1467.54 896.421 1456.17C890.739 1444.81 887.897 1431.8 887.897 1417.13C887.897 1402.47 890.739 1389.55 896.421 1378.36C902.286 1367 910.168 1358.11 920.066 1351.69C929.964 1345.1 941.237 1341.8 953.885 1341.8C961.033 1341.8 967.541 1342.9 973.406 1345.1C979.455 1347.11 984.679 1349.95 989.078 1353.62C993.661 1357.28 997.51 1361.5 1000.63 1366.27C1003.74 1371.03 1005.94 1376.16 1007.22 1381.66L998.976 1380.29V1344.82H1037.74V1490.27H998.426V1455.35L1007.22 1454.52C1005.76 1459.66 1003.38 1464.51 1000.08 1469.1C996.777 1473.68 992.652 1477.8 987.703 1481.47C982.938 1484.95 977.53 1487.79 971.481 1489.99C965.433 1492.01 959.017 1493.02 952.235 1493.02ZM962.958 1459.2C970.29 1459.2 976.705 1457.46 982.204 1453.97C987.703 1450.49 991.919 1445.63 994.852 1439.4C997.968 1432.99 999.526 1425.56 999.526 1417.13C999.526 1408.88 997.968 1401.64 994.852 1395.41C991.919 1389.18 987.703 1384.32 982.204 1380.84C976.705 1377.17 970.29 1375.34 962.958 1375.34C955.809 1375.34 949.486 1377.17 943.987 1380.84C938.671 1384.32 934.455 1389.18 931.339 1395.41C928.223 1401.64 926.665 1408.88 926.665 1417.13C926.665 1425.56 928.223 1432.99 931.339 1439.4C934.455 1445.63 938.671 1450.49 943.987 1453.97C949.486 1457.46 955.809 1459.2 962.958 1459.2ZM1077.16 1490.27V1286.81H1116.2V1490.27H1077.16ZM1192.95 1446.55L1181.4 1414.38L1250.13 1344.82H1301.55L1192.95 1446.55ZM1155.83 1490.27V1286.81H1194.87V1490.27H1155.83ZM1254.26 1490.27L1202.02 1424.56L1229.51 1402.56L1301.27 1490.27H1254.26Z" fill="currentColor"/>
          </g>
        </svg>
      </div>
    `;
  }

  private getVoiceTiers(s: UiStrings): VoiceTier[] {
    const groupedMap = new Map<string, VoiceInfo[]>();
    const premium: VoiceInfo[] = [];
    const local: VoiceInfo[] = [];
    const network: VoiceInfo[] = [];
    const google: VoiceInfo[] = [];

    for (const v of this.selectedVoices) {
      if (v.group) {
        if (!groupedMap.has(v.group)) {
          groupedMap.set(v.group, []);
        }
        groupedMap.get(v.group)!.push(v);
      } else if (/premium|enhanced|natural/i.test(v.name)) {
        premium.push(v);
      } else if (v.local) {
        local.push(v);
      } else if (/google/i.test(v.name)) {
        google.push(v);
      } else {
        network.push(v);
      }
    }

    const sort = (arr: VoiceInfo[]) =>
      arr.sort((a, b) => a.lang.localeCompare(b.lang) || a.name.localeCompare(b.name));

    const tiers: VoiceTier[] = [];
    for (const [groupLabel, voices] of groupedMap.entries()) {
      tiers.push({ label: groupLabel, voices: sort(voices) });
    }
    if (premium.length > 0) tiers.push({ label: s.voiceTierPremium, voices: sort(premium) });
    if (local.length > 0) tiers.push({ label: s.voiceTierLocal, voices: sort(local) });
    if (network.length > 0) tiers.push({ label: s.voiceTierNetwork, voices: sort(network) });
    if (google.length > 0) tiers.push({ label: s.voiceTierGoogle, voices: sort(google) });

    return tiers;
  }

  private handleLangChange(e: Event) {
    this.selectedLang = (e.target as HTMLSelectElement).value as SupportedLang;
  }

  private handleVoiceChange(e: Event) {
    const val = (e.target as HTMLSelectElement).value;
    this.voiceIds = { ...this.voiceIds, [this.ttsPluginId]: val };
  }

  private handleRateChange(e: Event) {
    this.rate = parseFloat((e.target as HTMLInputElement).value);
  }

  private handlePitchChange(e: Event) {
    this.pitch = parseFloat((e.target as HTMLInputElement).value);
  }

  private handleVolumeChange(e: Event) {
    this.volume = parseFloat((e.target as HTMLInputElement).value);
  }

  private handleBack() {
    this.dispatchEvent(new CustomEvent('settings-back', {
      bubbles: true, composed: true,
    }));
  }

  private handleApply() {
    const plugin = this.ttsPlugins.find(p => p.id === this.ttsPluginId);
    const effectiveTtsId = this.ttsPluginId !== 'system' && plugin && this.isPluginSupported(plugin)
      ? this.ttsPluginId
      : 'system';

    this.dispatchEvent(new CustomEvent('settings-apply', {
      detail: {
        lang: this.selectedLang,
        rate: this.rate,
        pitch: this.pitch,
        volume: this.volume,
        bargeInPluginId: this.bargeInPluginId,
        ttsPluginId: effectiveTtsId,
        voiceIds: { ...this.voiceIds },
      } satisfies SettingsData,
      bubbles: true,
      composed: true,
    }));
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'vcw-voice-settings': WidgetVoiceSettings;
  }
}
