import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { sharedStyles } from '../styles/shared-styles.js';
import type { SupportedLang, BargeInMode } from '../types.js';

interface VoiceTier {
  label: string;
  voices: SpeechSynthesisVoice[];
}

interface SettingsData {
  lang: SupportedLang;
  voiceURI: string;
  rate: number;
  pitch: number;
  volume: number;
  bargeIn: BargeInMode;
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
        background: var(--at-bg-color);
        border-radius: var(--at-border-radius);
        box-shadow: 0 8px 30px var(--at-shadow-color);
        padding: 24px;
        min-width: 260px;
        animation: vcw-fade-in 0.25s ease-out;
        display: flex;
        flex-direction: column;
        gap: 16px;
      }

      .header {
        display: flex;
        align-items: center;
        gap: 12px;
      }

      .back-btn {
        width: 32px;
        height: 32px;
        border-radius: 50%;
        background: var(--at-surface-color);
        color: var(--at-text-color);
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background 0.15s;
        flex-shrink: 0;
      }

      .back-btn:hover {
        background: var(--at-surface-hover);
      }

      .back-btn svg {
        width: 16px;
        height: 16px;
      }

      .header-title {
        font-size: 16px;
        font-weight: 700;
        color: var(--at-text-color);
      }

      .field {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }

      .field-label {
        font-size: 13px;
        font-weight: 600;
        color: var(--at-text-color);
      }

      .lang-selector {
        display: flex;
        border: 1px solid var(--at-border-color);
        border-radius: 8px;
      }

      .lang-option:first-child {
        border-radius: 7px 0 0 7px;
      }

      .lang-option:last-child {
        border-radius: 0 7px 7px 0;
      }

      .lang-option {
        flex: 1;
        padding: 8px 16px;
        font-size: 13px;
        font-weight: 600;
        color: var(--at-text-secondary);
        background: var(--at-bg-color);
        transition: background 0.15s, color 0.15s;
      }

      .lang-option:not(:last-child) {
        border-right: 1px solid var(--at-border-color);
      }

      .lang-option.active {
        background: var(--at-primary-color);
        color: var(--at-primary-text);
      }

      select {
        width: 100%;
        padding: 8px 12px;
        border: 1px solid var(--at-border-color);
        border-radius: 8px;
        font-size: 13px;
        font-family: var(--at-font-family);
        color: var(--at-text-color);
        background: var(--at-bg-color);
        outline: none;
      }

      select:focus {
        border-color: var(--at-primary-color);
        box-shadow: 0 0 0 2px var(--at-focus-ring);
      }

      input[type="range"] {
        width: 100%;
        accent-color: var(--at-primary-color);
      }

      .apply-btn {
        width: 100%;
        padding: 10px;
        border-radius: 999px;
        background: var(--at-primary-color);
        color: var(--at-primary-text);
        font-size: 14px;
        font-weight: 600;
        transition: opacity 0.15s;
      }

      .apply-btn:hover {
        opacity: 0.9;
      }

      /* Help icon */
      .help-label {
        display: flex;
        align-items: center;
        gap: 4px;
      }

      .help-icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 16px;
        height: 16px;
        border-radius: 50%;
        border: 1px solid var(--at-border-color);
        color: var(--at-text-muted);
        font-size: 11px;
        font-weight: 700;
        line-height: 1;
        cursor: help;
        flex-shrink: 0;
      }

      /* Tooltips */
      [data-tooltip] {
        position: relative;
      }

      [data-tooltip]:hover::after {
        content: attr(data-tooltip);
        position: absolute;
        bottom: calc(100% + 6px);
        left: 50%;
        transform: translateX(-50%);
        padding: 6px 10px;
        border-radius: 6px;
        background: var(--at-text-color);
        color: var(--at-bg-color);
        font-size: 12px;
        font-weight: 400;
        line-height: 1.4;
        white-space: nowrap;
        pointer-events: none;
        z-index: 10;
        animation: vcw-fade-in 0.15s ease-out;
      }

      .lang-option:last-child[data-tooltip]:hover::after {
        left: auto;
        right: 0;
        transform: none;
      }
    `,
  ];

  @property({ type: Array }) voices: SpeechSynthesisVoice[] = [];
  @property({ type: Object }) currentSettings: SettingsData | null = null;

  @state() private selectedLang: SupportedLang = 'en';
  @state() private selectedVoiceURI = '';
  @state() private rate = 1.0;
  @state() private pitch = 1.0;
  @state() private volume = 1.0;
  @state() private bargeIn: BargeInMode = 'off';

  private initialized = false;

  connectedCallback() {
    super.connectedCallback();
    this.initialized = false;
  }

  willUpdate() {
    if (!this.initialized) {
      this.initialized = true;
      if (this.currentSettings) {
        this.selectedLang = this.currentSettings.lang;
        this.selectedVoiceURI = this.currentSettings.voiceURI;
        this.rate = this.currentSettings.rate;
        this.pitch = this.currentSettings.pitch;
        this.volume = this.currentSettings.volume;
        this.bargeIn = this.currentSettings.bargeIn ?? 'off';
      }
    }
  }

  render() {
    const tiers = this.getVoiceTiers();

    return html`
      <div class="panel">
        <div class="header">
          <button class="back-btn" @click=${this.handleBack} aria-label="Back">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                 stroke-linecap="round" stroke-linejoin="round">
              <path d="M19 12H5"/>
              <polyline points="12 19 5 12 12 5"/>
            </svg>
          </button>
          <span class="header-title">Settings</span>
        </div>

        <div class="field">
          <label class="field-label">Language</label>
          <div class="lang-selector">
            <button class="lang-option ${this.selectedLang === 'en' ? 'active' : ''}"
              @click=${() => { this.selectedLang = 'en'; }}>English</button>
            <button class="lang-option ${this.selectedLang === 'es' ? 'active' : ''}"
              @click=${() => { this.selectedLang = 'es'; }}>Español</button>
          </div>
        </div>

        <div class="field">
          <label class="field-label">Voice</label>
          <select @change=${this.handleVoiceChange} .value=${this.selectedVoiceURI}>
            <option value="">Automatic</option>
            ${tiers.map(tier => tier.voices.length > 0 ? html`
              <optgroup label=${tier.label}>
                ${tier.voices.map(v => html`
                  <option value=${v.voiceURI} ?selected=${v.voiceURI === this.selectedVoiceURI}>
                    ${v.name} (${v.lang}, ${v.localService ? 'local' : 'remote'})
                  </option>
                `)}
              </optgroup>
            ` : '')}
          </select>
        </div>

        <div class="field">
          <label class="field-label">Speed: ${this.rate.toFixed(1)}x</label>
          <input type="range" min="0.5" max="2.0" step="0.1"
                 .value=${String(this.rate)}
                 @input=${this.handleRateChange} />
        </div>

        <div class="field">
          <label class="field-label">Pitch: ${this.pitch.toFixed(1)}</label>
          <input type="range" min="0.0" max="2.0" step="0.1"
                 .value=${String(this.pitch)}
                 @input=${this.handlePitchChange} />
        </div>

        <div class="field">
          <label class="field-label">Volume: ${Math.round(this.volume * 100)}%</label>
          <input type="range" min="0.0" max="1.0" step="0.05"
                 .value=${String(this.volume)}
                 @input=${this.handleVolumeChange} />
        </div>

        <div class="field">
          <label class="field-label help-label">
            Interruption
            <span class="help-icon"
              data-tooltip="Controls whether you can interrupt the assistant while it speaks"
              >?</span>
          </label>
          <div class="lang-selector">
            <button class="lang-option ${this.bargeIn === 'off' ? 'active' : ''}"
              data-tooltip="Wait for the response to finish"
              @click=${() => { this.bargeIn = 'off'; }}>Off</button>
            <button class="lang-option ${this.bargeIn === 'energy' ? 'active' : ''}"
              data-tooltip="Interrupt by speaking — uses mic energy detection"
              @click=${() => { this.bargeIn = 'energy'; }}>Energy</button>
          </div>
        </div>

        <button class="apply-btn" @click=${this.handleApply}>Apply</button>
      </div>
    `;
  }

  private getVoiceTiers(): VoiceTier[] {
    const premium: SpeechSynthesisVoice[] = [];
    const local: SpeechSynthesisVoice[] = [];
    const network: SpeechSynthesisVoice[] = [];
    const google: SpeechSynthesisVoice[] = [];

    for (const v of this.voices) {
      if (/premium|enhanced|natural/i.test(v.name)) {
        premium.push(v);
      } else if (v.localService) {
        local.push(v);
      } else if (/google/i.test(v.name)) {
        google.push(v);
      } else {
        network.push(v);
      }
    }

    const sort = (arr: SpeechSynthesisVoice[]) =>
      arr.sort((a, b) => a.lang.localeCompare(b.lang) || a.name.localeCompare(b.name));

    return [
      { label: 'Premium', voices: sort(premium) },
      { label: 'Local', voices: sort(local) },
      { label: 'Network', voices: sort(network) },
      { label: 'Google', voices: sort(google) },
    ];
  }

  private handleVoiceChange(e: Event) {
    this.selectedVoiceURI = (e.target as HTMLSelectElement).value;
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
    this.dispatchEvent(new CustomEvent('settings-apply', {
      detail: {
        lang: this.selectedLang,
        voiceURI: this.selectedVoiceURI,
        rate: this.rate,
        pitch: this.pitch,
        volume: this.volume,
        bargeIn: this.bargeIn,
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
