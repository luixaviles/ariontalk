import { LitElement, html, css, nothing, type PropertyValues } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { sharedStyles } from '../styles/shared-styles.js';
import type { WidgetStatus, EngineErrorCode } from '../types.js';
import { getStrings, type UiLocale } from '../i18n.js';
import { LevelLoop, type LevelSource } from '../controllers/level-loop.js';

const MIN_BAR_WEIGHTS = [0.75, 1.0, 0.85, 0.65] as const;
const MIN_RM_HEIGHTS = [10, 16, 12, 8] as const;

/**
 * Minimized state of an active voice session — a small circular FAB with a
 * single signal per state. Clicking anywhere on it dispatches `restore` to
 * return to the expanded session panel.
 */
@customElement('vcw-minimized')
export class WidgetMinimized extends LitElement {
  static styles = [
    sharedStyles,
    css`
      :host {
        display: block;
      }

      .fab {
        position: relative;
        width: 56px;
        height: 56px;
        border-radius: 50%;
        background: var(--at-primary-ui, var(--at-primary-color, #111827));
        color: var(--at-on-primary-ui, var(--at-primary-text, #FFFFFF));
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 4px 14px var(--at-shadow-color);
        transition:
          transform var(--at-dur-base, 200ms) var(--at-ease-standard, cubic-bezier(.2, 0, 0, 1)),
          box-shadow var(--at-dur-base, 200ms) var(--at-ease-standard, cubic-bezier(.2, 0, 0, 1));
        animation: vcw-fade-in var(--at-dur-base, 200ms) var(--at-ease-enter, cubic-bezier(0, 0, 0, 1)) both;
      }

      .fab:hover {
        transform: translateY(-1px);
        box-shadow: 0 6px 20px var(--at-shadow-hover);
      }

      .fab:active {
        transform: translateY(0);
      }

      .fab.muted {
        background: var(--at-state-muted, var(--at-text-secondary, #6B7280));
        color: var(--at-bg-color, #FFFFFF);
      }

      /* Single ring scaled by input level when visitor speaks */
      .ring {
        position: absolute;
        inset: 0;
        border-radius: 50%;
        border: 2px solid var(--at-primary-ui, var(--at-primary-color, #111827));
        pointer-events: none;
        transform: scale(calc(1 + var(--lvl, 0) * 0.35));
        opacity: calc(0.2 + var(--lvl, 0) * 0.6);
        transition: transform 60ms linear, opacity 60ms linear;
      }

      /* Error dot top-right */
      .err {
        position: absolute;
        top: 1px;
        right: 1px;
        width: 14px;
        height: 14px;
        border-radius: 50%;
        background: var(--at-state-error, var(--at-error-color, #DC2626));
        border: 2px solid var(--at-bg-color, #FFFFFF);
        box-sizing: border-box;
      }

      /* Waveform icon (4 bars) -- shown when speaking */
      .waveform {
        display: flex;
        align-items: center;
        gap: 3px;
        height: 22px;
        color: currentColor;
      }

      .bar {
        display: block;
        width: 3px;
        height: 6px;
        background: currentColor;
        border-radius: 999px;
        transition: height 90ms linear;
      }

      .waveform.css-anim .bar {
        animation: vcw-wave 0.9s ease-in-out infinite;
      }

      .waveform.css-anim .bar:nth-child(1) { animation-delay: 0s;    height: 10px; }
      .waveform.css-anim .bar:nth-child(2) { animation-delay: 0.15s; height: 16px; }
      .waveform.css-anim .bar:nth-child(3) { animation-delay: 0.3s;  height: 12px; }
      .waveform.css-anim .bar:nth-child(4) { animation-delay: 0.45s; height: 8px; }

      /* Microphone icon -- shown when listening / muted / error */
      .mic-icon {
        width: 22px;
        height: 22px;
      }

      /* Three-dot indicator -- shown when thinking/loading */
      .dots {
        display: flex;
        align-items: center;
        gap: 6px;
        height: 22px;
        color: currentColor;
      }

      .dot {
        display: block;
        width: 7px;
        height: 7px;
        background: currentColor;
        border-radius: 50%;
        animation: vcw-star 1.2s var(--at-ease-standard, cubic-bezier(.2, 0, 0, 1)) infinite;
      }

      .dot:nth-child(1) { animation-delay: 0s; }
      .dot:nth-child(2) { animation-delay: 150ms; }
      .dot:nth-child(3) { animation-delay: 300ms; }

      @media (prefers-reduced-motion: reduce) {
        .ring {
          transform: scale(1.12);
          opacity: 0.5;
        }
        .dot {
          animation: none !important;
          opacity: 1;
        }
        .dot:nth-child(2) {
          transform: scale(1.2);
        }
        .waveform .bar,
        .waveform.css-anim .bar {
          animation: none !important;
        }
        .waveform .bar:nth-child(1) { height: 10px !important; }
        .waveform .bar:nth-child(2) { height: 16px !important; }
        .waveform .bar:nth-child(3) { height: 12px !important; }
        .waveform .bar:nth-child(4) { height: 8px !important; }
      }
    `,
  ];

  @property({ type: String, reflect: true, attribute: 'data-status' }) status: WidgetStatus = 'listening';

  /** When true, the user has muted their microphone -- the listening icon shows a muted variant. */
  @property({ type: Boolean }) muted = false;

  /** True while the visitor's speech is detected during 'listening'. */
  @property({ type: Boolean, attribute: 'user-speaking' }) userSpeaking = false;

  /** Machine-readable error code when in error state. */
  @property({ type: String, attribute: 'error-code' }) errorCode: EngineErrorCode | null = null;

  /** Polled every 60 ms by the level loop. */
  @property({ attribute: false }) levelSource: LevelSource | null = null;

  /** Target UI locale for translation fallbacks. */
  @property({ type: String }) locale: UiLocale = 'en';

  private levelLoop = new LevelLoop();

  disconnectedCallback() {
    super.disconnectedCallback();
    this.levelLoop.stop();
  }

  protected updated(_changed: PropertyValues<this>) {
    // The muted circle shows the mic-off icon with no bars, so skip polling while muted.
    this.levelLoop.sync(this.shadowRoot, {
      status: this.status,
      muted: this.muted,
      userSpeaking: this.userSpeaking,
      source: this.muted ? null : this.levelSource,
      inputSelector: '.ring',
      barsContainerSelector: '.waveform',
      barsSelector: '.bar',
      barScale: 15,
      weights: MIN_BAR_WEIGHTS,
      reducedMotionHeights: MIN_RM_HEIGHTS,
    });
  }

  private get isVisitorSpeaking(): boolean {
    return this.status === 'listening' && !this.muted && this.userSpeaking;
  }

  private get isError(): boolean {
    return this.status === 'error';
  }

  private get stateLabel(): string {
    const s = getStrings(this.locale);
    if (this.isError) return s.minStateError;
    if (this.muted) return s.minStateMuted;
    if (this.isVisitorSpeaking) return s.minStateHearing;
    switch (this.status) {
      case 'speaking':
        return s.minStateSpeaking;
      case 'thinking':
      case 'loading':
        return s.minStateThinking;
      case 'listening':
      default:
        return s.minStateListening;
    }
  }

  render() {
    const s = getStrings(this.locale);
    const ariaLabel = s.backToConversation.replace('{state}', this.stateLabel);
    const showRing = this.isVisitorSpeaking && !this.isError;
    const isMutedLook = this.muted && !this.isError;

    return html`
      <button
        class="fab ${isMutedLook ? 'muted' : ''}"
        @click=${this.handleClick}
        aria-label=${ariaLabel}
        title=${ariaLabel}
      >
        ${showRing ? html`<span class="ring" aria-hidden="true"></span>` : nothing}
        ${this.renderStatusIcon()}
        ${this.isError ? html`<span class="err" aria-hidden="true"></span>` : nothing}
      </button>
    `;
  }

  private renderStatusIcon() {
    if (this.isError) {
      return this.renderMicIcon(false);
    }

    if (this.muted) {
      return this.renderMicIcon(true);
    }

    switch (this.status) {
      case 'speaking':
        return html`
          <span class="waveform css-anim" aria-hidden="true">
            <span class="bar"></span>
            <span class="bar"></span>
            <span class="bar"></span>
            <span class="bar"></span>
          </span>
        `;

      case 'thinking':
      case 'loading':
        return html`
          <span class="dots" aria-hidden="true">
            <span class="dot"></span>
            <span class="dot"></span>
            <span class="dot"></span>
          </span>
        `;

      case 'listening':
      default:
        return this.renderMicIcon(false);
    }
  }

  private renderMicIcon(muted: boolean) {
    return muted
      ? html`
          <svg class="mic-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <line x1="2" y1="2" x2="22" y2="22"/>
            <path d="M18.89 13.23A7 7 0 0 0 19 12v-2"/>
            <path d="M5 10v2a7 7 0 0 0 12 5"/>
            <path d="M15 9.34V5a3 3 0 0 0-5.68-1.33"/>
            <path d="M9 9v3a3 3 0 0 0 5.12 2.12"/>
            <line x1="12" y1="19" x2="12" y2="22"/>
          </svg>
        `
      : html`
          <svg class="mic-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/>
            <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
            <line x1="12" y1="19" x2="12" y2="22"/>
          </svg>
        `;
  }

  private handleClick() {
    this.dispatchEvent(new CustomEvent('restore', { bubbles: true, composed: true }));
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'vcw-minimized': WidgetMinimized;
  }
}
