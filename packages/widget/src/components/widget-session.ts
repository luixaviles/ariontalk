import { LitElement, html, css, nothing, type PropertyValues } from 'lit';
import { customElement, property, query, state } from 'lit/decorators.js';
import { sharedStyles } from '../styles/shared-styles.js';
import type { WidgetStatus, EngineErrorCode } from '../types.js';
import { getStrings, type UiLocale, type UiStrings } from '../i18n.js';
import { LevelLoop, type LevelSource, isReducedMotion } from '../controllers/level-loop.js';

export type SessionPanelMode = 'permission' | 'mic-blocked' | 'mic-not-found' | null;

export function getErrorCopy(
  s: UiStrings,
  errorCode: EngineErrorCode | null,
  rawError: string | null,
  headerTitle: string,
): { title: string; detail: string; isMicIcon: boolean } {
  const replaceTitle = (str: string) => str.replace('{title}', headerTitle);
  switch (errorCode) {
    case 'mic-blocked':
      return { title: s.errMicBlockedTitle, detail: s.errMicBlockedDetail, isMicIcon: true };
    case 'mic-not-found':
      return { title: s.errMicNotFoundTitle, detail: s.errMicNotFoundDetail, isMicIcon: true };
    case 'speech-unavailable':
      return { title: s.errSpeechUnavailableTitle, detail: s.errSpeechUnavailableDetail, isMicIcon: false };
    case 'speech-stopped':
      return { title: s.errSpeechStoppedTitle, detail: s.errSpeechStoppedDetail, isMicIcon: false };
    case 'model-unavailable':
      return { title: s.errModelUnavailableTitle, detail: s.errModelUnavailableDetail, isMicIcon: false };
    case 'model-memory':
      return { title: s.errModelMemoryTitle, detail: s.errModelMemoryDetail, isMicIcon: false };
    case 'answer-failed':
      return { title: s.errAnswerFailedTitle, detail: replaceTitle(s.errAnswerFailedDetail), isMicIcon: false };
    case 'language-switch-failed':
      return { title: s.errLangSwitchFailedTitle, detail: s.errLangSwitchFailedDetail, isMicIcon: false };
    default:
      return { title: rawError || s.errorLabel, detail: '', isMicIcon: false };
  }
}

/**
 * Expanded session panel showing timer, status indicator,
 * end-call button, and interim transcript.
 */
const SESSION_BAR_WEIGHTS = [0.65, 1.0, 0.75, 0.95, 0.55] as const;
const SESSION_RM_HEIGHTS = [10, 16, 12, 18, 8] as const;

@customElement('vcw-session')
export class WidgetSession extends LitElement {
  static styles = [
    sharedStyles,
    css`
      :host {
        display: block;
      }

      .panel {
        position: relative;
        background: var(--at-bg-color, #FFFFFF);
        border-radius: var(--at-border-radius, 16px);
        box-shadow: 0 8px 30px var(--at-shadow-color);
        width: 300px;
        min-width: 280px;
        max-width: 100%;
        overflow: hidden;
        transform-origin: 100% 100%;
        animation: vcw-fade-in var(--at-dur-slow, 320ms) var(--at-ease-enter, cubic-bezier(0, 0, 0, 1)) both;
        display: flex;
        flex-direction: column;
      }

      :host([position="bottom-left"]) .panel {
        transform-origin: 0% 100%;
      }

      .panel.minimizing {
        transform: scale(0.18);
        opacity: 0;
        transition:
          transform var(--at-dur-base, 200ms) var(--at-ease-exit, cubic-bezier(.3, 0, 1, 1)),
          opacity var(--at-dur-base, 200ms) var(--at-ease-exit, cubic-bezier(.3, 0, 1, 1));
      }

      /* Header row: brand identity and actions */
      .header-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        width: 100%;
        padding: 10px 12px 10px 16px;
        border-bottom: 1px solid var(--at-divider-color, rgba(127, 127, 127, 0.14));
        box-sizing: border-box;
        gap: 10px;
      }

      .header-left {
        display: flex;
        align-items: center;
        gap: 10px;
        min-width: 0;
      }

      /* Avatar: borderless circular container */
      .avatar {
        position: relative;
        width: 36px;
        height: 36px;
        border-radius: 50%;
        background: var(--at-surface-color, #F3F4F6);
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
      }

      .avatar svg.arion-logo {
        width: 20px;
        height: 20px;
        color: var(--at-logo-color, var(--at-primary-color, #111827));
      }

      .status-badge {
        position: absolute;
        bottom: -1px;
        right: -1px;
        width: 11px;
        height: 11px;
        border-radius: 50%;
        border: 2px solid var(--at-bg-color, #FFFFFF);
        box-sizing: border-box;
        display: none;
      }

      .status-badge.muted {
        display: block;
        background: var(--at-state-muted, var(--at-text-secondary, #6B7280));
      }

      .status-badge.error {
        display: block;
        background: var(--at-state-error, var(--at-error-color, #DC2626));
      }

      /* Header info typography */
      .header-info {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 2px;
        text-align: left;
        min-width: 0;
      }

      .header-title {
        font-size: 14px;
        font-weight: 600;
        color: var(--at-text-color, #1F2937);
        line-height: 1.2;
      }

      .header-subtitle {
        font-size: 12px;
        color: var(--at-text-secondary, var(--at-text-muted, #6B7280));
        line-height: 1.2;
        display: flex;
        align-items: center;
        gap: 4px;
      }

      .header-separator {
        opacity: 0.6;
        user-select: none;
      }

      .seal {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        font-size: 12px;
        line-height: 1.2;
        color: var(--at-text-secondary, #6B7280);
        border-radius: 6px;
        padding: 2px 4px 2px 0;
        background: none;
        transition: color var(--at-dur-fast, 120ms) var(--at-ease-standard, cubic-bezier(.2, 0, 0, 1));
      }

      .seal svg {
        width: 13px;
        height: 13px;
        flex-shrink: 0;
      }

      .seal:hover {
        color: var(--at-text-color, #1F2937);
      }

      .seal-explainer {
        margin: 10px 12px 0;
        padding: 10px 12px;
        border-radius: 10px;
        background: var(--at-surface-color, #F3F4F6);
        font-size: 12px;
        line-height: 1.5;
        color: var(--at-text-color, #1F2937);
        animation: vcw-fade var(--at-dur-base, 200ms) var(--at-ease-enter, cubic-bezier(0, 0, 0, 1));
      }

      .header-actions {
        display: flex;
        align-items: center;
        margin-left: auto;
      }

      /* Timer */
      .timer {
        font-size: 12px;
        font-weight: 500;
        font-variant-numeric: tabular-nums;
        color: var(--at-text-secondary, var(--at-text-muted, #6B7280));
        line-height: 1;
      }

      /* Minimize button: borderless and transparent with 6px hit extension */
      .minimize-btn {
        position: relative;
        width: 32px;
        height: 32px;
        flex-shrink: 0;
        border-radius: 50%;
        background: transparent;
        border: none;
        color: var(--at-text-secondary, #6B7280);
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        padding: 0;
        transition:
          background var(--at-dur-fast, 120ms) var(--at-ease-standard, cubic-bezier(.2, 0, 0, 1)),
          color var(--at-dur-fast, 120ms) var(--at-ease-standard, cubic-bezier(.2, 0, 0, 1)),
          transform var(--at-dur-fast, 120ms) var(--at-ease-standard, cubic-bezier(.2, 0, 0, 1));
      }

      .minimize-btn::after {
        content: "";
        position: absolute;
        inset: -6px;
      }

      .minimize-btn:hover {
        background: var(--at-surface-hover, #E5E7EB);
        color: var(--at-text-color, #1F2937);
      }

      .minimize-btn:active {
        transform: scale(0.95);
      }

      .minimize-btn svg {
        width: 20px;
        height: 20px;
      }

      /* Panel body */
      .panel-body {
        padding: 20px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 14px;
        min-height: 150px;
        width: 100%;
        box-sizing: border-box;
        transition: opacity var(--at-dur-fast, 120ms) var(--at-ease-standard, cubic-bezier(.2, 0, 0, 1));
      }

      .panel-body.out {
        opacity: 0;
      }

      /* Status indicator */
      .status {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        font-size: 13px;
        color: var(--at-text-secondary, #6B7280);
        min-height: 28px;
        text-align: center;
      }

      .ind {
        display: flex;
        align-items: center;
        justify-content: center;
        min-width: 28px;
        height: 28px;
      }

      /* Loading: technical spinner */
      .status-loading .indicator {
        width: 16px;
        height: 16px;
        border: 2px solid var(--at-border-color, #D1D5DB);
        border-top-color: var(--at-primary-ui, var(--at-primary-color, #111827));
        border-radius: 50%;
        animation: vcw-spin 0.8s linear infinite;
        box-sizing: border-box;
      }

      /* Listening: 14px breathing dot */
      .status-listening .indicator {
        width: 14px;
        height: 14px;
        border-radius: 50%;
        background: var(--at-state-listening, var(--at-primary-color, #111827));
        animation: vcw-breathe 2.4s ease-in-out infinite;
      }

      /* Visitor speaking: orb with 3 radial waves */
      .orb {
        position: relative;
        width: 14px;
        height: 14px;
        --lvl: 0;
      }

      .orb .core {
        position: absolute;
        inset: 0;
        z-index: 1;
        border-radius: 50%;
        background: var(--at-state-listening, var(--at-primary-color, #111827));
        transform: scale(calc(1 + var(--lvl, 0) * 0.15));
        transition: transform 60ms linear;
      }

      .orb .waves {
        position: absolute;
        inset: 0;
        opacity: calc(0.3 + var(--lvl, 0) * 0.7);
        transition: opacity 60ms linear;
      }

      .orb .waves i {
        position: absolute;
        inset: 0;
        border-radius: 50%;
        opacity: 0;
        background: radial-gradient(
          circle,
          transparent 46%,
          color-mix(in srgb, var(--at-voice-deep, #DB7609) 45%, transparent) 60%,
          var(--at-voice-mid, #F89B29) 69%,
          transparent 72%
        );
        animation: vcw-orb-wave 1.8s cubic-bezier(0, 0, 0.2, 1) infinite;
      }

      .orb .waves i:nth-child(2) {
        animation-delay: 600ms;
      }

      .orb .waves i:nth-child(3) {
        animation-delay: 1200ms;
      }

      .orb .waves i::after {
        content: "";
        position: absolute;
        inset: 0;
        border-radius: 50%;
        background: conic-gradient(
          from 285deg,
          transparent 0deg,
          var(--at-voice-rim-a, #FF0F7B) 40deg,
          var(--at-voice-rim-b, #FFD166) 110deg,
          transparent 160deg
        );
        -webkit-mask: radial-gradient(circle, transparent 65%, #000 68%, #000 71%, transparent 72%);
        mask: radial-gradient(circle, transparent 65%, #000 68%, #000 71%, transparent 72%);
      }

      @keyframes vcw-orb-wave {
        0%   { transform: scale(0.9); opacity: 0; }
        15%  { opacity: 1; }
        100% { transform: scale(3); opacity: 0; }
      }

      /* Muted: static mic-off icon */
      .status-muted .muted-icon {
        width: 18px;
        height: 18px;
        color: var(--at-state-muted, var(--at-text-secondary, #6B7280));
      }

      /* Thinking: three 7px dots in --at-state-thinking */
      .stars {
        display: flex;
        align-items: center;
        gap: 6px;
        height: 22px;
        color: var(--at-state-thinking, #FF0F7B);
      }

      .stars i {
        display: block;
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: currentColor;
        animation: vcw-star 1.2s var(--at-ease-standard, cubic-bezier(.2, 0, 0, 1)) infinite;
      }

      .stars i:nth-child(2) {
        animation-delay: 150ms;
      }

      .stars i:nth-child(3) {
        animation-delay: 300ms;
      }

      /* Speaking: 5 bars in --at-state-speaking */
      .bars {
        display: flex;
        align-items: center;
        gap: 3px;
        height: 22px;
        color: var(--at-state-speaking, #FF0F7B);
      }

      .bars .wave-bar {
        display: block;
        width: 3px;
        height: 6px;
        background: currentColor;
        border-radius: 999px;
        transition: height 90ms linear;
      }

      .bars.css-anim .wave-bar {
        animation: vcw-wave 0.8s ease-in-out infinite;
      }

      .bars.css-anim .wave-bar:nth-child(1) { animation-delay: 0s;    height: 10px; }
      .bars.css-anim .wave-bar:nth-child(2) { animation-delay: 0.15s; height: 16px; }
      .bars.css-anim .wave-bar:nth-child(3) { animation-delay: 0.3s;  height: 12px; }
      .bars.css-anim .wave-bar:nth-child(4) { animation-delay: 0.45s; height: 18px; }
      .bars.css-anim .wave-bar:nth-child(5) { animation-delay: 0.6s;  height: 8px; }

      /* Progress bar: reserves height to prevent layout shift */
      .progress-bar {
        width: 100%;
        max-width: 240px;
        min-height: 28px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 6px;
      }

      .progress-track {
        width: 100%;
        height: 6px;
        background: var(--at-border-color, #D1D5DB);
        border-radius: 3px;
        overflow: hidden;
      }

      .progress-fill {
        height: 100%;
        background: var(--at-primary-ui, var(--at-primary-color, #111827));
        border-radius: 3px;
        transition: width var(--at-dur-slow, 320ms) var(--at-ease-standard, cubic-bezier(.2, 0, 0, 1));
      }

      .progress-fill--indeterminate {
        width: 40%;
        animation: vcw-indeterminate 1.5s ease-in-out infinite;
      }

      .progress-text {
        font-size: 12px;
        line-height: 16px;
        color: var(--at-text-secondary, var(--at-text-muted, #6B7280));
        font-variant-numeric: tabular-nums;
      }

      /* Visitor caption ("You" pill) */
      .you {
        max-width: 250px;
        background: var(--at-surface-color, #F3F4F6);
        border-radius: 12px;
        padding: 8px 12px;
        text-align: left;
      }

      .you b {
        display: block;
        font-size: 12px;
        font-weight: 600;
        color: var(--at-caption-label, #4B5563);
        margin-bottom: 2px;
      }

      .you p {
        margin: 0;
        font-size: 14px;
        line-height: 1.4;
        color: var(--at-text-color, #1F2937);
      }

      .you .provisional {
        opacity: 0.6;
        transition: opacity var(--at-dur-fast, 120ms) var(--at-ease-standard, cubic-bezier(.2, 0, 0, 1));
      }

      /* Speaking / general transcript caption (15px, no italics, max 3 lines, top fade only on overflow) */
      .transcript.say {
        font-size: 15px;
        line-height: 1.45;
        color: var(--at-text-color, #1F2937);
        font-style: normal;
        text-align: center;
        max-width: 250px;
        max-height: calc(1.45em * 3);
        overflow: hidden;
        display: flex;
        flex-direction: column;
        justify-content: flex-end;
      }

      .transcript.say.overflow {
        -webkit-mask-image: linear-gradient(transparent 0, #000 1.45em);
        mask-image: linear-gradient(transparent 0, #000 1.45em);
      }

      /* Error and permission panels (.msg) */
      .msg {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 6px;
        text-align: center;
        max-width: 250px;
      }

      .msg .ic {
        width: 40px;
        height: 40px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--at-surface-color, #F3F4F6);
        color: var(--at-text-color, #1F2937);
        margin-bottom: 4px;
      }

      .msg .ic svg {
        width: 20px;
        height: 20px;
      }

      .msg.err .ic {
        color: var(--at-state-error, var(--at-error-color, #DC2626));
        background: color-mix(in srgb, var(--at-state-error, var(--at-error-color, #DC2626)) 12%, transparent);
      }

      .msg .msg-title {
        margin: 0;
        font-size: 14px;
        font-weight: 600;
        color: var(--at-text-color, #1F2937);
      }

      .msg p {
        margin: 0;
        font-size: 13px;
        line-height: 1.45;
        color: var(--at-text-secondary, #6B7280);
      }

      .actions {
        display: flex;
        gap: 8px;
        justify-content: center;
        flex-wrap: wrap;
      }

      .btn {
        min-height: 44px;
        padding: 0 14px;
        border-radius: 999px;
        font-size: 13px;
        font-weight: 600;
        transition: background var(--at-dur-fast, 120ms) var(--at-ease-standard, cubic-bezier(.2, 0, 0, 1));
      }

      .btn.primary {
        background: var(--at-primary-ui, var(--at-primary-color, #111827));
        color: var(--at-on-primary-ui, var(--at-primary-text, #FFFFFF));
      }

      .btn.ghost {
        background: var(--at-surface-color, #F3F4F6);
        color: var(--at-text-color, #1F2937);
      }

      .btn.ghost:hover {
        background: var(--at-surface-hover, #E5E7EB);
      }

      /* Controls 3-column grid (56 / 64 / 56 px) */
      .controls {
        display: grid;
        grid-template-columns: 56px 64px 56px;
        align-items: start;
        justify-items: center;
        gap: 8px;
      }

      .controls.controls--end-only {
        display: flex;
        justify-content: center;
      }

      .ctl {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 4px;
        font-size: 11px;
        color: var(--at-text-secondary, #6B7280);
      }

      /* Mute button (56px center) */
      .mute-btn {
        width: 56px;
        height: 56px;
        border-radius: 50%;
        background: var(--at-surface-color, #F3F4F6);
        color: var(--at-text-color, #1F2937);
        display: flex;
        align-items: center;
        justify-content: center;
        transition:
          background var(--at-dur-fast, 120ms) var(--at-ease-standard, cubic-bezier(.2, 0, 0, 1)),
          color var(--at-dur-fast, 120ms) var(--at-ease-standard, cubic-bezier(.2, 0, 0, 1));
      }

      .mute-btn:hover {
        background: var(--at-surface-hover, #E5E7EB);
      }

      .mute-btn[aria-pressed="true"],
      .mute-btn.active {
        background: var(--at-state-muted, var(--at-text-secondary, #6B7280));
        color: var(--at-bg-color, #FFFFFF);
      }

      .mute-btn svg {
        width: 22px;
        height: 22px;
      }

      /* End call button (44px neutral surface, X icon in --at-state-error) */
      .end-btn {
        width: 44px;
        height: 44px;
        margin-top: 6px;
        border-radius: 50%;
        background: var(--at-surface-color, #F3F4F6);
        color: var(--at-state-error, var(--at-error-color, #DC2626));
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background var(--at-dur-fast, 120ms) var(--at-ease-standard, cubic-bezier(.2, 0, 0, 1));
      }

      .controls--end-only .end-btn {
        margin-top: 0;
      }

      .end-btn:hover {
        background: var(--at-surface-hover, #E5E7EB);
      }

      .end-btn svg {
        width: 20px;
        height: 20px;
      }

      /* Attribution */
      .attribution {
        display: inline-flex;
        align-items: center;
        margin-top: 0px;
        font-size: 10px;
        line-height: 1;
        color: var(--at-text-secondary, #6B7280);
        text-decoration: none;
        transition: color var(--at-dur-fast, 120ms) var(--at-ease-standard, cubic-bezier(.2, 0, 0, 1));
      }

      .attribution:hover {
        color: var(--at-text-color, #1F2937);
      }

      .attribution:hover .attribution-name {
        text-decoration: underline;
      }

      .attribution-name {
        font-weight: 600;
      }

      @media (prefers-reduced-motion: reduce) {
        .stars i {
          animation: none !important;
          opacity: 1;
        }
        .stars i:nth-child(2) {
          transform: scale(1.2);
        }
        .you .provisional {
          opacity: 1;
          text-decoration: underline dotted;
          text-underline-offset: 3px;
        }
        .orb .core {
          transform: none;
        }
        .orb .waves {
          opacity: 0.7;
        }
        .orb .waves i {
          animation: none !important;
          opacity: 1;
          transform: scale(2.2);
        }
        .orb .waves i:nth-child(n+2) {
          display: none;
        }
        .bars .wave-bar,
        .bars.css-anim .wave-bar {
          animation: none !important;
        }
        .bars .wave-bar:nth-child(1) { height: 10px !important; }
        .bars .wave-bar:nth-child(2) { height: 16px !important; }
        .bars .wave-bar:nth-child(3) { height: 12px !important; }
        .bars .wave-bar:nth-child(4) { height: 18px !important; }
        .bars .wave-bar:nth-child(5) { height: 8px !important; }
      }
    `,
  ];

  @property({ type: String }) status: WidgetStatus = 'listening';
  @property({ type: String, attribute: 'loading-stage' }) loadingStage: 'connecting' | 'voice' | 'ai' = 'connecting';
  @property({ type: String, attribute: 'timer-display' }) timerDisplay = '00:00';
  @property({ type: String, attribute: 'interim-transcript' }) interimTranscript = '';
  @property({ type: String }) error: string | null = null;
  @property({ type: Number, attribute: 'download-progress' }) downloadProgress = 0;
  /** @deprecated No longer affects rendering; the mic button is always shown during a live session. */
  @property({ type: Boolean, attribute: 'barge-in-enabled' }) bargeInEnabled = false;
  @property({ type: Boolean }) muted = false;
  @property({ type: Boolean, attribute: 'show-minimize' }) showMinimize = false;
  @property({ type: Boolean, attribute: 'show-attribution' }) showAttribution = false;
  @property({ type: String, attribute: 'header-title' }) headerTitle = 'ArionTalk';
  @property({ type: String, attribute: 'header-subtitle' }) headerSubtitle = '';
  @property({ type: Boolean, attribute: 'show-timer' }) showTimer = false;
  @property({ type: String }) locale: UiLocale = 'en';

  @property({ type: Boolean, attribute: 'local-engine' }) localEngine = false;
  @property({ type: Boolean, attribute: 'on-device' }) onDevice = false;
  @property({ type: Boolean, attribute: 'user-speaking' }) userSpeaking = false;
  @property({ type: String, attribute: 'error-code' }) errorCode: EngineErrorCode | null = null;
  @property({ type: String }) panel: SessionPanelMode = null;
  @property({ type: Boolean, attribute: 'permission-pending' }) permissionPending = false;
  @property({ attribute: false }) levelSource: LevelSource | null = null;

  @state() private sealExpanded = false;
  @state() private bodyFading = false;

  @query('.transcript') private transcriptEl?: HTMLElement;

  private _prevTranscript = '';
  private _stablePrefix = '';
  private _lastDisplayKey = '';
  private _fadeTimer: ReturnType<typeof setTimeout> | null = null;
  private levelLoop = new LevelLoop();

  disconnectedCallback() {
    super.disconnectedCallback();
    this.levelLoop.stop();
    if (this._fadeTimer) {
      clearTimeout(this._fadeTimer);
      this._fadeTimer = null;
    }
  }

  protected willUpdate(changed: PropertyValues<this>) {
    if (changed.has('interimTranscript')) {
      const current = this.interimTranscript;
      const prev = this._prevTranscript;
      if (!current) {
        this._stablePrefix = '';
      } else if (prev && current.startsWith(prev) && current !== prev) {
        this._stablePrefix = prev;
      } else if (prev && !current.startsWith(prev)) {
        this._stablePrefix = '';
      }
      this._prevTranscript = current;
    }

    const nextKey = `${this.panel ?? ''}|${this.displayStatus}|${this.userSpeaking}`;
    if (this._lastDisplayKey && this._lastDisplayKey !== nextKey && !isReducedMotion()) {
      this.bodyFading = true;
      if (this._fadeTimer) clearTimeout(this._fadeTimer);
      this._fadeTimer = setTimeout(() => {
        this.bodyFading = false;
        this._fadeTimer = null;
      }, 120);
    }
    this._lastDisplayKey = nextKey;
  }

  protected updated(changed: PropertyValues<this>) {
    if (changed.has('interimTranscript') || changed.has('status')) {
      if (this.transcriptEl) {
        this.transcriptEl.scrollTo?.({ top: this.transcriptEl.scrollHeight, behavior: 'smooth' });
        if (this.transcriptEl.classList.contains('say')) {
          const isOverflow = this.transcriptEl.scrollHeight > this.transcriptEl.clientHeight + 1;
          this.transcriptEl.classList.toggle('overflow', isOverflow);
        }
      }
    }
    this.levelLoop.sync(this.shadowRoot, {
      panel: this.panel,
      status: this.status,
      muted: this.muted,
      userSpeaking: this.userSpeaking,
      source: this.levelSource,
      inputSelector: '.orb',
      barsContainerSelector: '.bars',
      barsSelector: '.bars .wave-bar',
      barScale: 17,
      weights: SESSION_BAR_WEIGHTS,
      reducedMotionHeights: SESSION_RM_HEIGHTS,
    });
  }

  private get showSeal(): boolean {
    return this.localEngine && this.onDevice;
  }

  private get badgeClass(): string {
    if (this.panel === 'mic-blocked' || this.panel === 'mic-not-found' || this.displayStatus === 'error') {
      return 'status-badge error';
    }
    if (!this.panel && this.displayStatus === 'muted') return 'status-badge muted';
    return 'status-badge';
  }

  render() {
    const s = getStrings(this.locale);
    const canMinimize = this.showMinimize && !this.panel;

    return html`
      <div class="panel">
        <div class="header-row">
          <div class="header-left">
            <div class="avatar" aria-hidden="true">
              <svg class="arion-logo" viewBox="0 0 1154 1160" fill="none" aria-hidden="true" focusable="false">
                <defs>
                  <linearGradient id="at-avatar-grad" x1="577.389" y1="13.7471" x2="577.389" y2="1143.78" gradientUnits="userSpaceOnUse">
                    <stop stop-color="#FF0F7B"/>
                    <stop offset="1" stop-color="#F89B29"/>
                  </linearGradient>
                </defs>
                <path d="M577.389 13.7471L71.4863 228.064V578.764C71.4863 851.531 285.522 1046.36 577.389 1143.78C869.257 1046.36 1083.29 851.531 1083.29 578.764V228.064L577.389 13.7471Z" style="fill: var(--at-logo-color, url(#at-avatar-grad))"/>
                <path d="M430.821 435.185C430.821 399.417 402.698 370.422 368.006 370.422C333.315 370.422 305.191 399.417 305.191 435.185V661.857C305.191 697.625 333.315 726.621 368.006 726.621C402.698 726.621 430.821 697.625 430.821 661.857V435.185Z" fill="var(--at-bg-color, #FFFFFF)"/>
                <path d="M640.204 308.665C640.204 273.34 611.3 244.703 575.645 244.703C539.989 244.703 511.085 273.34 511.085 308.665V788.375C511.085 823.7 539.989 852.337 575.645 852.337C611.3 852.337 640.204 823.7 640.204 788.375V308.665Z" fill="var(--at-bg-color, #FFFFFF)"/>
                <path d="M849.587 394.425C849.587 349.698 820.659 313.44 784.974 313.44C749.29 313.44 720.362 349.698 720.362 394.425V677.871C720.362 722.597 749.29 758.855 784.974 758.855C820.659 758.855 849.587 722.597 849.587 677.871V394.425Z" fill="var(--at-bg-color, #FFFFFF)"/>
              </svg>
              <span class=${this.badgeClass} aria-hidden="true"></span>
            </div>
            <div class="header-info">
              <span class="header-title">${this.headerTitle}</span>
              <span class="header-subtitle">${this.showTimer && !this.panel && this.status !== 'loading' ? html`
                <span class="timer" role="timer" aria-label=${s.sessionDuration}>${this.timerDisplay}</span>
                <span class="header-separator" aria-hidden="true">&middot;</span>
              ` : nothing}${this.showSeal ? html`
                <button
                  class="seal"
                  type="button"
                  aria-expanded=${this.sealExpanded ? 'true' : 'false'}
                  aria-controls="at-seal-explainer"
                  @click=${this.toggleSeal}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                    <path d="m9 12 2 2 4-4"></path>
                  </svg>
                  <span>${s.sealLabel}</span>
                </button>
              ` : html`<span>${this.headerSubtitle || s.askAQuestion}</span>`}</span>
            </div>
          </div>

          <div class="header-actions">
            ${canMinimize ? html`
              <button
                class="minimize-btn"
                @click=${this.handleMinimize}
                aria-label=${s.minimize}
                title=${s.minimize}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
              </button>
            ` : nothing}
          </div>
        </div>

        ${this.showSeal && this.sealExpanded ? html`
          <div class="seal-explainer" id="at-seal-explainer" role="note">
            ${s.sealExplainer}
          </div>
        ` : nothing}

        <div class="panel-body ${this.bodyFading ? 'out' : ''}">
          ${this.renderBodyContent(s)}
        </div>
      </div>
    `;
  }

  private renderBodyContent(s: UiStrings) {
    if (this.panel === 'permission') {
      const title = s.permTitle.replace('{title}', this.headerTitle);
      const body = this.onDevice ? s.permBodyOnDevice : s.permBody;
      return html`
        <div class="msg">
          <div class="ic" aria-hidden="true">${this.renderMicSvg(false)}</div>
          <p class="msg-title">${title}</p>
          <p>${body}</p>
        </div>
        <div class="actions">
          <button class="btn primary" ?disabled=${this.permissionPending} @click=${this.handlePermissionAllow}>${s.permAllow}</button>
          <button class="btn ghost" @click=${this.handlePermissionDismiss}>${s.permNotNow}</button>
        </div>
      `;
    }

    if (this.panel === 'mic-blocked' || this.panel === 'mic-not-found') {
      const isNotFound = this.panel === 'mic-not-found';
      return html`
        <div class="msg err" role="alert">
          <div class="ic" aria-hidden="true">${this.renderMicSvg(true)}</div>
          <p class="msg-title">${isNotFound ? s.errMicNotFoundTitle : s.errMicBlockedTitle}</p>
          <p>${isNotFound ? s.errMicNotFoundDetail : s.errMicBlockedDetail}</p>
        </div>
        <div class="actions">
          <button class="btn primary" @click=${this.handleRetry}>${s.retry}</button>
          <button class="btn ghost" @click=${this.handleClose}>${s.close}</button>
        </div>
      `;
    }

    if (this.displayStatus === 'error') {
      const copy = getErrorCopy(s, this.errorCode, this.error, this.headerTitle);
      return html`
        <div class="msg err" role="alert">
          <div class="ic" aria-hidden="true">
            ${copy.isMicIcon ? this.renderMicSvg(true) : this.renderAlertSvg()}
          </div>
          <p class="msg-title">${copy.title}</p>
          ${copy.detail ? html`<p>${copy.detail}</p>` : nothing}
        </div>
        <div class="actions">
          <button class="btn primary" @click=${this.handleRetry}>${s.retry}</button>
          <button class="btn ghost" @click=${this.handleClose}>${s.close}</button>
        </div>
        ${this.showAttribution ? this.renderAttribution() : nothing}
      `;
    }

    const isSpeaking = this.displayStatus === 'speaking';
    const isListening = this.status === 'listening';

    return html`
      <div class="status status-${this.displayStatus}" aria-live="polite" aria-atomic="true">
        <div class="ind">${this.renderStatusIndicator()}</div>
        <span class=${isSpeaking ? 'sr-only' : ''}>${this.statusLabel}</span>
      </div>

      ${this.status === 'loading' && this.downloadProgress !== 0 ? this.renderProgressBar() : nothing}

      ${this.interimTranscript
        ? (isListening
            ? html`<div class="transcript you" aria-live="polite"><b>${s.you}</b><p>${this.renderVisitorTranscript()}</p></div>`
            : html`<div class="transcript say" aria-live="polite"><span>${this.interimTranscript}</span></div>`)
        : nothing}

      ${this.renderControls(s)}

      ${this.showAttribution ? this.renderAttribution() : nothing}
    `;
  }

  private renderControls(s: UiStrings) {
    if (this.status === 'loading') {
      return html`
        <div class="controls controls--end-only">
          <div class="ctl">
            <button
              class="end-btn"
              @click=${this.handleEnd}
              aria-label=${s.endShort}
            >
              ${this.renderXSvg()}
            </button>
            <span aria-hidden="true">${s.endShort}</span>
          </div>
        </div>
      `;
    }

    const micAria = this.muted ? s.micTurnOn : s.micTurnOff;
    const micShort = this.muted ? s.unmuteShort : s.muteShort;

    return html`
      <div class="controls">
        <span></span>
        <div class="ctl">
          <button
            class="mute-btn ${this.muted ? 'active' : ''}"
            @click=${this.handleMuteToggle}
            aria-label=${micAria}
            aria-pressed=${this.muted ? 'true' : 'false'}
            title=${micAria}
          >
            ${this.renderMicSvg(this.muted)}
          </button>
          <span aria-hidden="true">${micShort}</span>
        </div>
        <div class="ctl">
          <button
            class="end-btn"
            @click=${this.handleEnd}
            aria-label=${s.endShort}
          >
            ${this.renderXSvg()}
          </button>
          <span aria-hidden="true">${s.endShort}</span>
        </div>
      </div>
    `;
  }

  private renderMicSvg(muted: boolean) {
    return muted
      ? html`
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="1" y1="1" x2="23" y2="23"></line>
            <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"></path>
            <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2c0 .76-.12 1.5-.34 2.18"></path>
            <line x1="12" y1="19" x2="12" y2="23"></line>
            <line x1="8" y1="23" x2="16" y2="23"></line>
          </svg>
        `
      : html`
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
            <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
            <line x1="12" y1="19" x2="12" y2="23"></line>
            <line x1="8" y1="23" x2="16" y2="23"></line>
          </svg>
        `;
  }

  private renderXSvg() {
    return html`
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
      </svg>
    `;
  }

  private renderAlertSvg() {
    return html`
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="12" y1="8" x2="12" y2="12"></line>
        <line x1="12" y1="16" x2="12.01" y2="16"></line>
      </svg>
    `;
  }

  private renderAttribution() {
    const s = getStrings(this.locale);
    return html`
      <a
        class="attribution"
        href="https://ariontalk.com/?ref=widget"
        target="_blank"
        rel="noopener"
        aria-label="${s.poweredBy} ArionTalk, ${s.opensInNewTab}"
      >
        <span>${s.poweredBy} <span class="attribution-name">ArionTalk</span></span>
      </a>
    `;
  }

  private get displayStatus(): string {
    if (this.muted && this.status === 'listening') return 'muted';
    return this.status;
  }

  private get statusLabel(): string {
    const s = getStrings(this.locale);
    switch (this.displayStatus) {
      case 'loading': {
        // "loading" when downloading (>0%), "preparing" during initialization.
        const downloading = this.downloadProgress > 0;
        if (this.loadingStage === 'voice') return downloading ? s.loadingVoice : s.preparingVoice;
        if (this.loadingStage === 'ai') return downloading ? s.loadingModel : s.preparingModel;
        return this.localEngine ? s.starting : s.connecting;
      }
      case 'listening': return s.listening;
      case 'muted': return s.muted;
      case 'thinking': return s.thinking;
      case 'speaking': return s.answering.replace('{title}', this.headerTitle);
      case 'error': return s.errorLabel;
      default: return '';
    }
  }

  private renderVisitorTranscript() {
    const current = this.interimTranscript;
    const prefix = this._stablePrefix;

    if (prefix && current.startsWith(prefix) && current.length > prefix.length) {
      const tail = current.slice(prefix.length);
      return html`${prefix}<span class="provisional">${tail}</span>`;
    }

    return html`<span class="provisional">${current}</span>`;
  }

  private renderProgressBar() {
    // Indeterminate animation when unmeasured; percentage fill when measured.
    const measured = this.downloadProgress > 0;
    const pct = Math.round(this.downloadProgress * 100);

    return html`
      <div class="progress-bar">
        <div class="progress-track">
          ${measured
        ? html`<div class="progress-fill" style="width: ${pct}%"></div>`
        : html`<div class="progress-fill progress-fill--indeterminate"></div>`}
        </div>
        ${measured ? html`<span class="progress-text">${pct}%</span>` : nothing}
      </div>
    `;
  }

  private renderStatusIndicator() {
    switch (this.displayStatus) {
      case 'loading':
        return html`<div class="indicator" aria-hidden="true"></div>`;
      case 'listening':
        if (this.userSpeaking) {
          return html`
            <div class="orb" aria-hidden="true">
              <span class="waves"><i></i><i></i><i></i></span>
              <span class="core"></span>
            </div>
          `;
        }
        return html`<div class="indicator" aria-hidden="true"></div>`;
      case 'muted':
        return html`
          <svg class="muted-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <line x1="1" y1="1" x2="23" y2="23"></line>
            <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"></path>
            <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2c0 .76-.12 1.5-.34 2.18"></path>
            <line x1="12" y1="19" x2="12" y2="23"></line>
            <line x1="8" y1="23" x2="16" y2="23"></line>
          </svg>
        `;
      case 'thinking':
        return html`
          <div class="stars" aria-hidden="true">
            <i></i><i></i><i></i>
          </div>
        `;
      case 'speaking':
        return html`
          <div class="bars css-anim" aria-hidden="true">
            <i class="wave-bar"></i>
            <i class="wave-bar"></i>
            <i class="wave-bar"></i>
            <i class="wave-bar"></i>
            <i class="wave-bar"></i>
          </div>
        `;
      default:
        return nothing;
    }
  }

  private toggleSeal() {
    this.sealExpanded = !this.sealExpanded;
  }

  private handleMuteToggle() {
    this.dispatchEvent(new CustomEvent('mute-toggle', {
      detail: { muted: !this.muted },
      bubbles: true,
      composed: true,
    }));
  }

  private handleEnd() {
    this.dispatchEvent(new CustomEvent('session-end', { bubbles: true, composed: true }));
  }

  private handleMinimize() {
    this.dispatchEvent(new CustomEvent('minimize', { bubbles: true, composed: true }));
  }

  private handleRetry() {
    this.dispatchEvent(new CustomEvent('session-retry', { bubbles: true, composed: true }));
  }

  private handleClose() {
    this.dispatchEvent(new CustomEvent('session-close', { bubbles: true, composed: true }));
  }

  private handlePermissionAllow() {
    this.dispatchEvent(new CustomEvent('permission-allow', { bubbles: true, composed: true }));
  }

  private handlePermissionDismiss() {
    this.dispatchEvent(new CustomEvent('permission-dismiss', { bubbles: true, composed: true }));
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'vcw-session': WidgetSession;
  }
}
