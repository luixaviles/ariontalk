import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { sharedStyles } from '../styles/shared-styles.js';
import type { VoiceSettings } from '../types.js';

interface VoiceTier {
  label: string;
  voices: SpeechSynthesisVoice[];
}

/**
 * Voice settings panel with voice selection dropdown and rate/pitch/volume sliders.
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
        background: var(--vcw-bg-color, #FFFFFF);
        border-radius: var(--vcw-border-radius, 16px);
        box-shadow: 0 8px 30px rgba(0, 0, 0, 0.2);
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
        background: #f3f4f6;
        color: var(--vcw-text-color, #1F2937);
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background 0.15s;
        flex-shrink: 0;
      }

      .back-btn:hover {
        background: #e5e7eb;
      }

      .back-btn svg {
        width: 16px;
        height: 16px;
      }

      .header-title {
        font-size: 16px;
        font-weight: 700;
        color: var(--vcw-text-color, #1F2937);
      }

      .field {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }

      .field-label {
        font-size: 13px;
        font-weight: 600;
        color: var(--vcw-text-color, #1F2937);
      }

      select {
        width: 100%;
        padding: 8px 12px;
        border: 1px solid #d1d5db;
        border-radius: 8px;
        font-size: 13px;
        font-family: var(--vcw-font-family, system-ui, sans-serif);
        color: var(--vcw-text-color, #1F2937);
        background: var(--vcw-bg-color, #FFFFFF);
        outline: none;
      }

      select:focus {
        border-color: var(--vcw-primary-color, #4F46E5);
        box-shadow: 0 0 0 2px rgba(79, 70, 229, 0.2);
      }

      input[type="range"] {
        width: 100%;
        accent-color: var(--vcw-primary-color, #4F46E5);
      }

      .apply-btn {
        width: 100%;
        padding: 10px;
        border-radius: 999px;
        background: var(--vcw-primary-color, #4F46E5);
        color: #fff;
        font-size: 14px;
        font-weight: 600;
        transition: opacity 0.15s;
      }

      .apply-btn:hover {
        opacity: 0.9;
      }
    `,
  ];

  @property({ type: Array }) voices: SpeechSynthesisVoice[] = [];
  @property({ type: Object }) currentSettings: VoiceSettings | null = null;

  @state() private selectedVoiceURI = '';
  @state() private rate = 1.0;
  @state() private pitch = 1.0;
  @state() private volume = 1.0;

  private initialized = false;

  willUpdate() {
    if (!this.initialized) {
      this.initialized = true;
      if (this.currentSettings) {
        this.selectedVoiceURI = this.currentSettings.voice?.voiceURI ?? '';
        this.rate = this.currentSettings.rate;
        this.pitch = this.currentSettings.pitch;
        this.volume = this.currentSettings.volume;
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
          <span class="header-title">Voice Settings</span>
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
    this.dispatchEvent(new CustomEvent('voice-settings-back', {
      bubbles: true, composed: true,
    }));
  }

  private handleApply() {
    const voice = this.selectedVoiceURI
      ? this.voices.find(v => v.voiceURI === this.selectedVoiceURI) ?? null
      : null;

    const settings: VoiceSettings = {
      voice,
      rate: this.rate,
      pitch: this.pitch,
      volume: this.volume,
    };

    this.dispatchEvent(new CustomEvent('voice-settings-apply', {
      detail: settings,
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
