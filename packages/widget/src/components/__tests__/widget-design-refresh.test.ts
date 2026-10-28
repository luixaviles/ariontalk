import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import '../widget-root.js';
import '../widget-session.js';
import '../widget-minimized.js';
import '../widget-fab.js';
import '../widget-voice-settings.js';
import type { WidgetSession } from '../widget-session.js';
import type { WidgetMinimized } from '../widget-minimized.js';
import type { WidgetVoiceSettings } from '../widget-voice-settings.js';
import type { EngineErrorCode, TtsPlugin, BargeInPlugin } from '../../types.js';

describe('Widget design refresh (spec-01)', () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '';
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  describe('Settings gear icon path', () => {
    it('matches the exact settings gear path', async () => {
      // Exact settings gear path.
      const GEAR_PATH = 'M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z';

      const el = document.createElement('ariontalk-widget') as any;
      el.setAttribute('force', '');
      el.setAttribute('settings', '');
      document.body.appendChild(el);
      await el.updateComplete;

      const gearPath = el.shadowRoot?.querySelector('.gear-btn svg path')?.getAttribute('d');
      expect(gearPath).toBe(GEAR_PATH);
    });
  });

  describe('Seal & Header', () => {
    it('shows the seal only when localEngine and onDevice are both true, replacing header-subtitle', async () => {
      const el = document.createElement('vcw-session') as WidgetSession;
      el.headerSubtitle = 'Custom Subtitle';
      document.body.appendChild(el);
      await el.updateComplete;

      // Neither set: shows subtitle
      expect(el.shadowRoot?.querySelector('.seal')).toBeNull();
      expect(el.shadowRoot?.querySelector('.header-subtitle')?.textContent?.trim()).toBe('Custom Subtitle');

      // Only localEngine: still shows subtitle
      el.localEngine = true;
      el.onDevice = false;
      await el.updateComplete;
      expect(el.shadowRoot?.querySelector('.seal')).toBeNull();

      // Only onDevice (localEngine false): never shows seal
      el.localEngine = false;
      el.onDevice = true;
      await el.updateComplete;
      expect(el.shadowRoot?.querySelector('.seal')).toBeNull();

      // Both true: shows seal and replaces subtitle
      el.localEngine = true;
      el.onDevice = true;
      await el.updateComplete;
      const seal = el.shadowRoot?.querySelector('.seal') as HTMLButtonElement;
      expect(seal).not.toBeNull();
      expect(seal.textContent).toContain('Offline · Private');
      expect(el.shadowRoot?.querySelector('.header-subtitle')?.textContent).not.toContain('Custom Subtitle');
      expect(seal.getAttribute('aria-expanded')).toBe('false');
      expect(el.shadowRoot?.querySelector('.seal-explainer')).toBeNull();

      // Click seal toggles explainer
      seal.click();
      await el.updateComplete;
      expect(seal.getAttribute('aria-expanded')).toBe('true');
      const explainer = el.shadowRoot?.querySelector('.seal-explainer');
      expect(explainer).not.toBeNull();
      expect(explainer?.getAttribute('role')).toBe('note');
      expect(explainer?.textContent).toContain('Everything happens on your device');
    });
  });

  describe('Status labels & Controls', () => {
    it('renders "Starting…" with localEngine and "Connecting…" without', async () => {
      const el = document.createElement('vcw-session') as WidgetSession;
      el.status = 'loading';
      el.loadingStage = 'connecting';
      document.body.appendChild(el);
      await el.updateComplete;

      expect(el.shadowRoot?.querySelector('.status span')?.textContent?.trim()).toBe('Connecting…');

      el.localEngine = true;
      await el.updateComplete;
      expect(el.shadowRoot?.querySelector('.status span')?.textContent?.trim()).toBe('Starting…');
    });

    it('renders the mic button in a live session even when bargeInEnabled is false', async () => {
      const el = document.createElement('vcw-session') as WidgetSession;
      el.status = 'listening';
      el.bargeInEnabled = false;
      document.body.appendChild(el);
      await el.updateComplete;

      const micBtn = el.shadowRoot?.querySelector('.mute-btn');
      expect(micBtn).not.toBeNull();
      expect(micBtn?.getAttribute('aria-label')).toBe('Turn microphone off');
    });

    it('shows only End button while loading', async () => {
      const el = document.createElement('vcw-session') as WidgetSession;
      el.status = 'loading';
      document.body.appendChild(el);
      await el.updateComplete;

      expect(el.shadowRoot?.querySelector('.mute-btn')).toBeNull();
      expect(el.shadowRoot?.querySelector('.end-btn')).not.toBeNull();
    });
  });

  describe('Visitor speaking: Orb & You pill', () => {
    it('shows orb only with userSpeaking, and You pill for listening + transcript with provisional tail', async () => {
      const el = document.createElement('vcw-session') as WidgetSession;
      el.status = 'listening';
      document.body.appendChild(el);
      await el.updateComplete;

      expect(el.shadowRoot?.querySelector('.orb')).toBeNull();
      expect(el.shadowRoot?.querySelector('.you')).toBeNull();

      // Transcript without userSpeaking still shows You pill, no orb
      el.interimTranscript = 'Hello world';
      await el.updateComplete;
      expect(el.shadowRoot?.querySelector('.orb')).toBeNull();
      const youPill = el.shadowRoot?.querySelector('.you');
      expect(youPill).not.toBeNull();
      expect(youPill?.querySelector('b')?.textContent).toBe('You');
      expect(youPill?.querySelector('.provisional')?.textContent).toBe('Hello world');

      // Growing transcript marks only the changed tail as provisional
      el.userSpeaking = true;
      el.interimTranscript = 'Hello world how are you';
      await el.updateComplete;
      expect(el.shadowRoot?.querySelector('.orb')).not.toBeNull();
      expect(youPill?.querySelector('p')?.textContent).toBe('Hello world how are you');
      expect(youPill?.querySelector('.provisional')?.textContent).toBe(' how are you');
    });
  });

  describe('Error panel & Events', () => {
    const CODES: EngineErrorCode[] = [
      'mic-blocked',
      'mic-not-found',
      'speech-unavailable',
      'speech-stopped',
      'model-unavailable',
      'model-memory',
      'answer-failed',
      'language-switch-failed',
    ];

    it('renders localized title and detail for every EngineErrorCode in en and es, plus fallback without code', async () => {
      const el = document.createElement('vcw-session') as WidgetSession;
      el.status = 'error';
      el.headerTitle = 'ArionTalk';
      document.body.appendChild(el);

      for (const locale of ['en', 'es'] as const) {
        el.locale = locale;
        for (const code of CODES) {
          el.errorCode = code;
          el.error = 'Raw fallback';
          await el.updateComplete;

          const msg = el.shadowRoot?.querySelector('.msg.err[role="alert"]');
          expect(msg, `${locale}:${code}`).not.toBeNull();
          const title = msg?.querySelector('.msg-title')?.textContent?.trim() ?? '';
          const detail = msg?.querySelector('p:not(.msg-title)')?.textContent?.trim() ?? '';
          expect(title.length, `${locale}:${code} title`).toBeGreaterThan(0);
          expect(title).not.toBe('Raw fallback');
          expect(detail.length, `${locale}:${code} detail`).toBeGreaterThan(0);
          expect(detail).not.toContain('{title}');
        }

        // Fallback without errorCode uses engine's error message as title and no detail line
        el.errorCode = null;
        el.error = 'Custom engine message';
        await el.updateComplete;
        const msg = el.shadowRoot?.querySelector('.msg.err[role="alert"]');
        expect(msg?.querySelector('.msg-title')?.textContent?.trim()).toBe('Custom engine message');
        expect(msg?.querySelector('p:not(.msg-title)')).toBeNull();
      }
    });

    it('dispatches session-retry and session-close from error panel', async () => {
      const el = document.createElement('vcw-session') as WidgetSession;
      el.status = 'error';
      el.errorCode = 'speech-stopped';
      document.body.appendChild(el);
      await el.updateComplete;

      let retried = 0;
      let closed = 0;
      el.addEventListener('session-retry', () => { retried++; });
      el.addEventListener('session-close', () => { closed++; });

      const btns = el.shadowRoot?.querySelectorAll('.actions .btn') as NodeListOf<HTMLButtonElement>;
      btns[0].click();
      btns[1].click();

      expect(retried).toBe(1);
      expect(closed).toBe(1);
    });

    it('FAB error note shows server message when state.error is custom without code, generic detail for failedToStart, and code copy when errorCode is set', async () => {
      const el = document.createElement('ariontalk-widget') as any;
      el.setAttribute('force', '');
      document.body.appendChild(el);
      await el.updateComplete;

      const baseState = { ...el.controller.state };
      const stateSpy = vi.spyOn(el.controller, 'state', 'get');

      // 1. Custom server error without errorCode
      stateSpy.mockReturnValue({
        ...baseState,
        status: 'error',
        error: 'Monthly voice quota exceeded for this site.',
        errorCode: undefined,
      });
      el.requestUpdate();
      await el.updateComplete;

      let note = el.shadowRoot?.querySelector('.fab-error[role="alert"]');
      expect(note?.querySelector('strong')?.textContent?.trim()).toBe("We couldn't start the assistant");
      expect(note?.querySelector('span')?.textContent?.trim()).toBe('Monthly voice quota exceeded for this site.');

      // 2. Generic failedToStart string without errorCode
      stateSpy.mockReturnValue({
        ...baseState,
        status: 'error',
        error: 'Failed to start session',
        errorCode: undefined,
      });
      el.requestUpdate();
      await el.updateComplete;

      note = el.shadowRoot?.querySelector('.fab-error[role="alert"]');
      expect(note?.querySelector('strong')?.textContent?.trim()).toBe("We couldn't start the assistant");
      expect(note?.querySelector('span')?.textContent?.trim()).toBe('Something went wrong while loading. Try again.');

      // 3. With errorCode set
      stateSpy.mockReturnValue({
        ...baseState,
        status: 'error',
        error: 'Out of memory',
        errorCode: 'model-memory',
      });
      el.requestUpdate();
      await el.updateComplete;

      note = el.shadowRoot?.querySelector('.fab-error[role="alert"]');
      expect(note?.querySelector('strong')?.textContent?.trim()).toBe("We couldn't start the assistant");
      expect(note?.querySelector('span')?.textContent?.trim()).toBe(
        "Your browser doesn't have enough memory for the AI model.",
      );
    });
  });

  describe('Permission flow in root', () => {
    function stubPermission(state: 'granted' | 'prompt' | 'denied' | 'throw' | 'missing') {
      if (state === 'missing') {
        Object.defineProperty(navigator, 'permissions', { value: undefined, configurable: true });
        return;
      }
      const query = state === 'throw'
        ? vi.fn().mockRejectedValue(new Error('Unsupported'))
        : vi.fn().mockResolvedValue({ state });
      Object.defineProperty(navigator, 'permissions', {
        value: { query },
        configurable: true,
      });
    }

    async function mountRoot(engine: 'local' | 'gemini' = 'local') {
      const el = document.createElement('ariontalk-widget') as any;
      el.setAttribute('force', '');
      el.setAttribute('engine', engine);
      if (engine === 'gemini') {
        el.setAttribute('token-server', 'https://api.test/token');
      }
      document.body.appendChild(el);
      await el.updateComplete;
      vi.spyOn(el.controller, 'ensureEngine').mockResolvedValue(undefined);
      vi.spyOn(el.controller, 'startSession').mockResolvedValue(undefined);
      vi.spyOn(el.controller, 'applyVoiceSettings').mockImplementation(() => {});
      return el;
    }

    it('starts immediately when permission is granted', async () => {
      stubPermission('granted');
      const el = await mountRoot('local');
      await el.handleFabClick();
      await el.updateComplete;

      expect(el.active).toBe(true);
      expect(el.preflight).toBeNull();
    });

    it('shows pre-prompt when permission is prompt on local engine; allow starts, dismiss returns to FAB', async () => {
      stubPermission('prompt');
      const el = await mountRoot('local');
      await el.handleFabClick();
      await el.updateComplete;

      expect(el.active).toBe(false);
      expect(el.preflight).toBe('permission');
      let sessionEl = el.shadowRoot?.querySelector('vcw-session') as WidgetSession;
      expect(sessionEl).not.toBeNull();
      expect(sessionEl.panel).toBe('permission');

      // Dismiss returns to FAB
      sessionEl.dispatchEvent(new CustomEvent('permission-dismiss', { bubbles: true, composed: true }));
      await el.updateComplete;
      expect(el.preflight).toBeNull();
      expect(el.shadowRoot?.querySelector('vcw-fab')).not.toBeNull();

      // Click again and allow -> starts session
      await el.handleFabClick();
      await el.updateComplete;
      sessionEl = el.shadowRoot?.querySelector('vcw-session') as WidgetSession;
      sessionEl.dispatchEvent(new CustomEvent('permission-allow', { bubbles: true, composed: true }));
      await el.updateComplete;
      await Promise.resolve();
      expect(el.active).toBe(true);
    });

    it('requests getUserMedia on permission-allow: stops tracks and starts on success, shows mic-blocked on NotAllowedError, and mic-not-found on NotFoundError', async () => {
      stubPermission('prompt');
      const el = await mountRoot('local');

      // 1. Success: stops tracks and starts session
      const stopTrack1 = vi.fn();
      const stopTrack2 = vi.fn();
      const getUserMedia = vi.fn().mockResolvedValue({
        getTracks: () => [{ stop: stopTrack1 }, { stop: stopTrack2 }],
      });
      Object.defineProperty(navigator, 'mediaDevices', {
        value: { getUserMedia },
        configurable: true,
      });

      await el.handleFabClick();
      await el.updateComplete;
      expect(el.preflight).toBe('permission');

      await el.handlePermissionAllow();
      await el.updateComplete;
      expect(getUserMedia).toHaveBeenCalledWith({ audio: true });
      expect(stopTrack1).toHaveBeenCalledTimes(1);
      expect(stopTrack2).toHaveBeenCalledTimes(1);
      expect(el.preflight).toBeNull();
      expect(el.active).toBe(true);

      // Reset session
      el.handleEnd();
      await el.updateComplete;

      // 2. NotAllowedError -> mic-blocked
      getUserMedia.mockRejectedValueOnce(Object.assign(new Error('Denied'), { name: 'NotAllowedError' }));
      await el.handleFabClick();
      await el.updateComplete;
      await el.handlePermissionAllow();
      await el.updateComplete;
      expect(el.active).toBe(false);
      expect(el.preflight).toBe('mic-blocked');
      let sessionEl = el.shadowRoot?.querySelector('vcw-session') as WidgetSession;
      expect(sessionEl.panel).toBe('mic-blocked');
      expect(sessionEl.shadowRoot?.querySelector('.msg-title')?.textContent?.trim()).toBe('Your microphone is blocked');

      // 3. NotFoundError -> mic-not-found
      getUserMedia.mockRejectedValueOnce(Object.assign(new Error('No mic'), { name: 'NotFoundError' }));
      await el.handleFabClick();
      await el.updateComplete;
      await el.handlePermissionAllow();
      await el.updateComplete;
      expect(el.active).toBe(false);
      expect(el.preflight).toBe('mic-not-found');
      sessionEl = el.shadowRoot?.querySelector('vcw-session') as WidgetSession;
      expect(sessionEl.panel).toBe('mic-not-found');
      expect(sessionEl.shadowRoot?.querySelector('.msg-title')?.textContent?.trim()).toBe("We can't find a microphone");
      expect(sessionEl.shadowRoot?.querySelector('p:not(.msg-title)')?.textContent?.trim()).toBe('Connect one or check your system settings, then try again.');
    });

    it('guards against double Allow, disables Allow while pending, and ignores resolution after Dismiss while still stopping tracks', async () => {
      stubPermission('prompt');
      const el = await mountRoot('local');
      const continueSpy = vi.spyOn(el, 'continueSessionStart');

      let resolveMic!: (stream: { getTracks: () => Array<{ stop: () => void }> }) => void;
      const getUserMedia = vi.fn().mockImplementation(
        () => new Promise(resolve => { resolveMic = resolve; }),
      );
      Object.defineProperty(navigator, 'mediaDevices', {
        value: { getUserMedia },
        configurable: true,
      });

      // 1. Double Allow while pending calls getUserMedia and continueSessionStart once, and disables Allow button
      await el.handleFabClick();
      await el.updateComplete;
      const sessionEl = el.shadowRoot?.querySelector('vcw-session') as WidgetSession;
      await sessionEl.updateComplete;

      const allowBtn = sessionEl.shadowRoot?.querySelector('.btn.primary') as HTMLButtonElement;
      expect(allowBtn.disabled).toBe(false);

      const firstAllow = el.handlePermissionAllow();
      const secondAllow = el.handlePermissionAllow();
      await el.updateComplete;
      await sessionEl.updateComplete;

      expect(sessionEl.permissionPending).toBe(true);
      expect(allowBtn.disabled).toBe(true);
      expect(getUserMedia).toHaveBeenCalledTimes(1);

      const stopTrack1 = vi.fn();
      resolveMic({ getTracks: () => [{ stop: stopTrack1 }] });
      await Promise.all([firstAllow, secondAllow]);
      await el.updateComplete;

      expect(stopTrack1).toHaveBeenCalledTimes(1);
      expect(continueSpy).toHaveBeenCalledTimes(1);
      expect(el.active).toBe(true);

      // Reset session
      el.handleEnd();
      await el.updateComplete;
      continueSpy.mockClear();
      getUserMedia.mockClear();

      // 2. Dismiss during a pending request followed by success starts nothing and stops the tracks
      await el.handleFabClick();
      await el.updateComplete;
      const pendingAllow = el.handlePermissionAllow();
      await el.updateComplete;

      el.handlePermissionDismiss();
      await el.updateComplete;
      expect(el.preflight).toBeNull();

      const stopTrack2 = vi.fn();
      resolveMic({ getTracks: () => [{ stop: stopTrack2 }] });
      await pendingAllow;
      await el.updateComplete;

      expect(stopTrack2).toHaveBeenCalledTimes(1);
      expect(continueSpy).not.toHaveBeenCalled();
      expect(el.active).toBe(false);
    });

    it('ignores stale getUserMedia resolution after Dismiss + new pre-prompt, and clears permissionPending before continueSessionStart settles', async () => {
      stubPermission('prompt');
      const el = await mountRoot('local');

      let resolveMic!: (stream: { getTracks: () => Array<{ stop: () => void }> }) => void;
      const getUserMedia = vi.fn().mockImplementation(
        () => new Promise(resolve => { resolveMic = resolve; }),
      );
      Object.defineProperty(navigator, 'mediaDevices', {
        value: { getUserMedia },
        configurable: true,
      });

      // 1. Allow -> Dismiss -> FAB button again (new pre-prompt) -> first request resolves:
      // no session starts, tracks stopped, and new panel is still 'permission' with Allow enabled
      const continueSpy = vi.spyOn(el, 'continueSessionStart');
      await el.handleFabClick();
      await el.updateComplete;
      const firstAllow = el.handlePermissionAllow();
      await el.updateComplete;

      el.handlePermissionDismiss();
      await el.updateComplete;
      expect(el.preflight).toBeNull();

      await el.handleFabClick();
      await el.updateComplete;
      expect(el.preflight).toBe('permission');

      let newPanel = el.shadowRoot?.querySelector('vcw-session') as WidgetSession;
      await newPanel.updateComplete;
      let allowBtn = newPanel.shadowRoot?.querySelector('.btn.primary') as HTMLButtonElement;
      expect(newPanel.panel).toBe('permission');
      expect(newPanel.permissionPending).toBe(false);
      expect(allowBtn.disabled).toBe(false);

      const stopStaleTrack = vi.fn();
      resolveMic({ getTracks: () => [{ stop: stopStaleTrack }] });
      await firstAllow;
      await el.updateComplete;

      expect(stopStaleTrack).toHaveBeenCalledTimes(1);
      expect(continueSpy).not.toHaveBeenCalled();
      expect(el.active).toBe(false);
      expect(el.preflight).toBe('permission');
      newPanel = el.shadowRoot?.querySelector('vcw-session') as WidgetSession;
      await newPanel.updateComplete;
      allowBtn = newPanel.shadowRoot?.querySelector('.btn.primary') as HTMLButtonElement;
      expect(newPanel.panel).toBe('permission');
      expect(newPanel.permissionPending).toBe(false);
      expect(allowBtn.disabled).toBe(false);

      // 2. Allow on the new panel, success, with a long-running continueSessionStart:
      // permissionRequestInFlight / permissionPending is false as soon as getUserMedia resolves
      let resolveContinue!: () => void;
      continueSpy.mockImplementation(
        () => new Promise<void>(resolve => { resolveContinue = resolve; }),
      );

      const secondAllow = el.handlePermissionAllow();
      await el.updateComplete;
      await newPanel.updateComplete;
      expect(newPanel.permissionPending).toBe(true);

      const stopFreshTrack = vi.fn();
      resolveMic({ getTracks: () => [{ stop: stopFreshTrack }] });
      await Promise.resolve();
      await Promise.resolve();
      await el.updateComplete;

      expect(stopFreshTrack).toHaveBeenCalledTimes(1);
      expect(el.permissionRequestInFlight).toBe(false);
      expect(continueSpy).toHaveBeenCalledTimes(1);

      resolveContinue();
      await secondAllow;
    });

    it('shows mic-blocked panel when permission is denied', async () => {
      stubPermission('denied');
      const el = await mountRoot('local');
      await el.handleFabClick();
      await el.updateComplete;

      expect(el.active).toBe(false);
      expect(el.preflight).toBe('mic-blocked');
      const sessionEl = el.shadowRoot?.querySelector('vcw-session') as WidgetSession;
      expect(sessionEl.panel).toBe('mic-blocked');
    });

    it('skips pre-prompt on gemini when prompt, but still shows mic-blocked on denied', async () => {
      stubPermission('prompt');
      const el = await mountRoot('gemini');
      await el.handleFabClick();
      await el.updateComplete;
      expect(el.active).toBe(true);

      el.handleEnd();
      await el.updateComplete;

      stubPermission('denied');
      await el.handleFabClick();
      await el.updateComplete;
      expect(el.active).toBe(false);
      expect(el.preflight).toBe('mic-blocked');
    });

    it('starts when permissions.query is missing or throws', async () => {
      stubPermission('missing');
      const el1 = await mountRoot('local');
      await el1.handleFabClick();
      expect(el1.active).toBe(true);

      stubPermission('throw');
      const el2 = await mountRoot('local');
      await el2.handleFabClick();
      expect(el2.active).toBe(true);
    });
  });

  describe('Minimized states', () => {
    it('renders one signal per state, label per state, ring only while visitor speaks, red dot on error', async () => {
      const el = document.createElement('vcw-minimized') as WidgetMinimized;
      document.body.appendChild(el);
      await el.updateComplete;

      // Listening: mic icon, no ring
      expect(el.shadowRoot?.querySelector('.mic-icon')).not.toBeNull();
      expect(el.shadowRoot?.querySelector('.ring')).toBeNull();
      expect(el.shadowRoot?.querySelector('.fab')?.getAttribute('aria-label')).toBe(
        'Back to the conversation (listening)',
      );

      // Visitor speaking: ring + mic icon
      el.userSpeaking = true;
      await el.updateComplete;
      expect(el.shadowRoot?.querySelector('.ring')).not.toBeNull();
      expect(el.shadowRoot?.querySelector('.fab')?.getAttribute('aria-label')).toBe(
        'Back to the conversation (hearing you)',
      );

      // Thinking: 3 dots, no ring
      el.userSpeaking = false;
      el.status = 'thinking';
      await el.updateComplete;
      expect(el.shadowRoot?.querySelector('.ring')).toBeNull();
      expect(el.shadowRoot?.querySelectorAll('.dot').length).toBe(3);
      expect(el.shadowRoot?.querySelector('.fab')?.getAttribute('aria-label')).toBe(
        'Back to the conversation (searching the page)',
      );

      // Speaking: 4 bars
      el.status = 'speaking';
      await el.updateComplete;
      expect(el.shadowRoot?.querySelectorAll('.bar').length).toBe(4);
      expect(el.shadowRoot?.querySelector('.fab')?.getAttribute('aria-label')).toBe(
        'Back to the conversation (answering)',
      );

      // Muted: gray circle, no ring
      el.status = 'listening';
      el.muted = true;
      await el.updateComplete;
      expect(el.shadowRoot?.querySelector('.fab')?.classList.contains('muted')).toBe(true);
      expect(el.shadowRoot?.querySelector('.ring')).toBeNull();
      expect(el.shadowRoot?.querySelector('.fab')?.getAttribute('aria-label')).toBe(
        'Back to the conversation (microphone off)',
      );

      // Error: 14px red dot top-right
      el.muted = false;
      el.status = 'error';
      await el.updateComplete;
      expect(el.shadowRoot?.querySelector('.err')).not.toBeNull();
      expect(el.shadowRoot?.querySelector('.fab')?.getAttribute('aria-label')).toBe(
        'Back to the conversation (stopped)',
      );

      // Leftover errorCode with status="listening" shows no red dot
      el.status = 'listening';
      el.errorCode = 'language-switch-failed';
      await el.updateComplete;
      expect(el.shadowRoot?.querySelector('.err')).toBeNull();
      expect(el.shadowRoot?.querySelector('.fab')?.getAttribute('aria-label')).toBe(
        'Back to the conversation (listening)',
      );
    });
  });

  describe('Settings panel enhancements', () => {
    function makePlugin(opts?: { supported?: boolean; reason?: string; tooltip?: string }): TtsPlugin {
      return {
        id: 'kokoro',
        label: 'Kokoro',
        tooltip: opts?.tooltip,
        voices: [{ id: 'af_heart', name: 'Heart', lang: 'en-US', local: true }],
        supports: { rate: true, pitch: false, volume: true },
        isSupported: opts?.supported !== undefined ? () => opts.supported! : undefined,
        unsupportedReason: opts?.reason,
        create: () => ({ id: 'kokoro' } as any),
      };
    }

    it('updates help note with selection, disables unsupported plugin, and handles radio arrow keys', async () => {
      const el = document.createElement('vcw-voice-settings') as WidgetVoiceSettings;
      el.currentSettings = {
        lang: 'en',
        rate: 1,
        pitch: 1,
        volume: 1,
        bargeInPluginId: 'off',
        ttsPluginId: 'system',
        voiceIds: {},
      };
      el.capabilities = {
        supportedLanguages: ['en', 'es'],
        supportsVoiceSelection: true,
        supportsRatePitchVolume: true,
        supportsBargeInPlugins: true,
        supportsTtsPlugins: true,
        alwaysCaptureMic: false,
        supportsOffline: true,
        maxSessionDurationSec: null,
        requiresTokenServer: false,
      };
      const bargeIn: BargeInPlugin = {
        id: 'silero',
        label: 'Silero VAD',
        tooltip: 'Neural voice activity detection',
        create: () => ({} as any),
      };
      el.ttsPlugins = [makePlugin({ supported: true, tooltip: 'Kokoro tooltip text' })];
      el.bargeInPlugins = [bargeIn];
      document.body.appendChild(el);
      await el.updateComplete;

      // System help note shown by default
      const hints = el.shadowRoot?.querySelectorAll('.hint');
      expect(hints?.[0]?.textContent?.trim()).toBe('Voices from your browser and operating system.');
      expect(hints?.[1]?.textContent?.trim()).toBe('Wait for the response to finish.');

      // ArrowRight on Speech radiogroup selects Kokoro
      const speechGroup = el.shadowRoot?.querySelectorAll('[role="radiogroup"]')[0] as HTMLElement;
      speechGroup.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      await el.updateComplete;

      const radios = speechGroup.querySelectorAll('[role="radio"]');
      expect(radios[0].getAttribute('aria-checked')).toBe('false');
      expect(radios[0].getAttribute('tabindex')).toBe('-1');
      expect(radios[1].getAttribute('aria-checked')).toBe('true');
      expect(radios[1].getAttribute('tabindex')).toBe('0');
      expect(el.shadowRoot?.querySelectorAll('.hint')[0]?.textContent?.trim()).toBe('Kokoro tooltip text');

      // Interruption group roving tabindex: Off is checked (0), Silero is -1
      const interruptionGroup = el.shadowRoot?.querySelectorAll('[role="radiogroup"]')[1] as HTMLElement;
      const intRadios = interruptionGroup.querySelectorAll('[role="radio"]');
      expect(intRadios[0].getAttribute('tabindex')).toBe('0');
      expect(intRadios[1].getAttribute('tabindex')).toBe('-1');

      // Footer hidden by hide-attribution
      expect(el.shadowRoot?.querySelector('.footer')).not.toBeNull();
      el.hideAttribution = true;
      await el.updateComplete;
      expect(el.shadowRoot?.querySelector('.footer')).toBeNull();
    });

    it('falls back to Off when saved bargeInPluginId is unregistered, keeping Off checked with tabindex 0', async () => {
      localStorage.setItem(
        'ariontalk:settings:local',
        JSON.stringify({
          lang: 'en',
          rate: 1,
          pitch: 1,
          volume: 1,
          bargeInPluginId: 'gone',
          ttsPluginId: 'system',
          voiceIds: {},
        }),
      );

      const bargeIn: BargeInPlugin = {
        id: 'silero',
        label: 'Silero VAD',
        tooltip: 'Neural voice activity detection',
        create: () => ({} as any),
      };

      const root = document.createElement('ariontalk-widget') as any;
      root.setAttribute('engine', 'local');
      root.bargeInPlugins = [bargeIn];
      document.body.appendChild(root);
      await root.updateComplete;

      expect(root.currentSettings.bargeInPluginId).toBe('off');

      const panel = document.createElement('vcw-voice-settings') as WidgetVoiceSettings;
      panel.bargeInPlugins = [bargeIn];
      panel.currentSettings = {
        lang: 'en',
        rate: 1,
        pitch: 1,
        volume: 1,
        bargeInPluginId: 'gone',
        ttsPluginId: 'system',
        voiceIds: {},
      };
      panel.capabilities = {
        supportedLanguages: ['en'],
        supportsVoiceSelection: true,
        supportsRatePitchVolume: true,
        supportsBargeInPlugins: true,
        supportsTtsPlugins: true,
        alwaysCaptureMic: false,
        supportsOffline: true,
        maxSessionDurationSec: null,
        requiresTokenServer: false,
      };
      document.body.appendChild(panel);
      await panel.updateComplete;

      const radios = panel.shadowRoot?.querySelectorAll('[role="radio"]');
      expect(radios?.[0].getAttribute('aria-checked')).toBe('true');
      expect(radios?.[0].getAttribute('tabindex')).toBe('0');
      expect(radios?.[1].getAttribute('aria-checked')).toBe('false');
      expect(radios?.[1].getAttribute('tabindex')).toBe('-1');
    });

    it('renders unsupported plugin aria-disabled with reason, and maps saved unsupported choice to system', async () => {
      localStorage.setItem(
        'ariontalk:settings:local',
        JSON.stringify({
          lang: 'en',
          rate: 1,
          pitch: 1,
          volume: 1,
          bargeInPluginId: 'off',
          ttsPluginId: 'kokoro',
          voiceIds: { kokoro: 'af_heart' },
        }),
      );

      const unsupported = makePlugin({
        supported: false,
        reason: "Kokoro needs WebGPU, which this browser doesn't support.",
        tooltip: 'Kokoro tooltip',
      });

      const root = document.createElement('ariontalk-widget') as any;
      root.setAttribute('engine', 'local');
      root.ttsPlugins = [unsupported];
      document.body.appendChild(root);
      await root.updateComplete;

      // Root currentSettings maps unsupported saved plugin to system
      expect(root.currentSettings.ttsPluginId).toBe('system');

      // Mount settings panel with saved unsupported choice
      const panel = document.createElement('vcw-voice-settings') as WidgetVoiceSettings;
      panel.ttsPlugins = [unsupported];
      panel.currentSettings = {
        lang: 'en',
        rate: 1,
        pitch: 1,
        volume: 1,
        bargeInPluginId: 'off',
        ttsPluginId: 'kokoro',
        voiceIds: { kokoro: 'af_heart' },
      };
      panel.capabilities = {
        supportedLanguages: ['en'],
        supportsVoiceSelection: true,
        supportsRatePitchVolume: true,
        supportsBargeInPlugins: true,
        supportsTtsPlugins: true,
        alwaysCaptureMic: false,
        supportsOffline: true,
        maxSessionDurationSec: null,
        requiresTokenServer: false,
      };
      document.body.appendChild(panel);
      await panel.updateComplete;

      const radios = panel.shadowRoot?.querySelectorAll('[role="radio"]') as NodeListOf<HTMLButtonElement>;
      expect(radios[0].getAttribute('aria-checked')).toBe('true');
      expect(radios[0].getAttribute('tabindex')).toBe('0');
      expect(radios[1].getAttribute('aria-disabled')).toBe('true');
      expect(radios[1].getAttribute('aria-checked')).toBe('false');
      expect(radios[1].getAttribute('tabindex')).toBe('-1');

      // Clicking disabled button does nothing
      radios[1].click();
      await panel.updateComplete;
      expect(radios[0].getAttribute('aria-checked')).toBe('true');

      // Reason is shown
      const reasonEl = panel.shadowRoot?.querySelector('.unsupported-reason');
      expect(reasonEl?.textContent?.trim()).toBe("Kokoro needs WebGPU, which this browser doesn't support.");

      // Apply saves system
      let applied: any = null;
      panel.addEventListener('settings-apply', (e: any) => { applied = e.detail; });
      (panel.shadowRoot?.querySelector('.apply-btn') as HTMLButtonElement).click();
      expect(applied.ttsPluginId).toBe('system');
    });
  });

  describe('Level loop', () => {
    it('starts only in visitor-speaking and speaking states, writes --lvl, stops on state change/disconnect, and skips under reduced motion', async () => {
      vi.useFakeTimers();

      let currentInput = 0.65;
      let currentOutput: number | null = 0.8;
      const levelSource = vi.fn(() => ({ input: currentInput, output: currentOutput }));

      const el = document.createElement('vcw-session') as WidgetSession;
      el.status = 'listening';
      el.levelSource = levelSource;
      document.body.appendChild(el);
      await el.updateComplete;

      // Not userSpeaking: loop does not run
      expect((el as any).levelLoop.running).toBe(false);

      // userSpeaking = true: loop starts and sets exponentially smoothed --lvl on .orb
      // First tick: 0 * 0.45 + 0.65 * 0.55 = 0.3575 -> '0.36'
      el.userSpeaking = true;
      await el.updateComplete;
      expect((el as any).levelLoop.running).toBe(true);
      const orb = el.shadowRoot?.querySelector('.orb') as HTMLElement;
      expect(orb.style.getPropertyValue('--lvl')).toBe('0.36');

      // Second tick with 0.42: 0.3575 * 0.45 + 0.42 * 0.55 = 0.391875 -> '0.39'
      currentInput = 0.42;
      vi.advanceTimersByTime(60);
      expect(orb.style.getPropertyValue('--lvl')).toBe('0.39');

      // Switch to thinking: loop stops and resets smoothing state
      el.userSpeaking = false;
      el.status = 'thinking';
      await el.updateComplete;
      expect((el as any).levelLoop.running).toBe(false);

      // Restart visitor-speaking with currentInput = 1.0: starts fresh from 0 (0 * 0.45 + 1.0 * 0.55 = 0.55)
      currentInput = 1.0;
      el.status = 'listening';
      el.userSpeaking = true;
      await el.updateComplete;
      const orbAfterRestart = el.shadowRoot?.querySelector('.orb') as HTMLElement;
      expect(orbAfterRestart.style.getPropertyValue('--lvl')).toBe('0.55');

      // Switch to speaking with non-null output: loop runs
      el.userSpeaking = false;
      el.status = 'speaking';
      await el.updateComplete;
      expect((el as any).levelLoop.running).toBe(true);

      // Disconnect stops loop
      el.remove();
      expect((el as any).levelLoop.running).toBe(false);

      // Under reduced motion, loop never starts
      vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true }));
      const elRm = document.createElement('vcw-session') as WidgetSession;
      elRm.status = 'listening';
      elRm.userSpeaking = true;
      elRm.levelSource = levelSource;
      document.body.appendChild(elRm);
      await elRm.updateComplete;
      expect((elRm as any).levelLoop.running).toBe(false);
    });

    it('ten interimTranscript updates in a row create one interval, not ten, and speaking with output: null keeps css-anim and stops the loop', async () => {
      vi.useFakeTimers();
      const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');

      const el = document.createElement('vcw-session') as WidgetSession;
      el.status = 'listening';
      el.userSpeaking = true;
      el.levelSource = () => ({ input: 0.5, output: null });
      document.body.appendChild(el);
      await el.updateComplete;

      expect(setIntervalSpy).toHaveBeenCalledTimes(1);

      for (let i = 1; i <= 10; i++) {
        el.interimTranscript = `word ${i}`;
        await el.updateComplete;
      }

      // Still only 1 interval created across 10 transcript re-renders
      expect(setIntervalSpy).toHaveBeenCalledTimes(1);

      // Switch to speaking with output: null -> keeps css-anim on .bars and stops the loop on first tick
      el.userSpeaking = false;
      el.status = 'speaking';
      await el.updateComplete;
      const bars = el.shadowRoot?.querySelector('.bars');
      expect(bars?.classList.contains('css-anim')).toBe(true);
      expect((el as any).levelLoop.running).toBe(false);
    });

    it('reads replaced levelSource on the next tick without a status change, and stops polling in minimized when muted', async () => {
      vi.useFakeTimers();

      const source1 = vi.fn(() => ({ input: 0.2, output: 0.3 }));
      const source2 = vi.fn(() => ({ input: 0.8, output: 0.9 }));

      const sessionEl = document.createElement('vcw-session') as WidgetSession;
      sessionEl.status = 'listening';
      sessionEl.userSpeaking = true;
      sessionEl.levelSource = source1;
      document.body.appendChild(sessionEl);
      await sessionEl.updateComplete;

      expect(source1).toHaveBeenCalledTimes(1);

      // Swap levelSource mid-loop without changing status
      sessionEl.levelSource = source2;
      await sessionEl.updateComplete;

      vi.advanceTimersByTime(60);
      expect(source2).toHaveBeenCalledTimes(1);
      expect(source1).toHaveBeenCalledTimes(1);

      // Minimized stops polling when muted during speaking
      const minSource = vi.fn(() => ({ input: 0, output: 0.7 }));
      const minEl = document.createElement('vcw-minimized') as WidgetMinimized;
      minEl.status = 'speaking';
      minEl.levelSource = minSource;
      document.body.appendChild(minEl);
      await minEl.updateComplete;

      expect((minEl as any).levelLoop.running).toBe(true);
      expect(minSource).toHaveBeenCalledTimes(1);

      minEl.muted = true;
      await minEl.updateComplete;
      expect((minEl as any).levelLoop.running).toBe(false);

      vi.advanceTimersByTime(180);
      expect(minSource).toHaveBeenCalledTimes(1);
    });
  });
});
