import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resolveRecognitionLang, SpeechRecognitionService } from '../speech-recognition.js';

function installMockSpeechRecognition(opts: {
  available?: string | Promise<string>;
  installResult?: boolean | Promise<boolean>;
}) {
  const instances: any[] = [];
  const Ctor: any = vi.fn(function (this: any) {
    this.start = vi.fn();
    this.stop = vi.fn();
    this.abort = vi.fn();
    instances.push(this);
  });
  if (opts.available !== undefined) {
    Ctor.available = vi.fn().mockImplementation(() =>
      opts.available instanceof Promise ? opts.available : Promise.resolve(opts.available)
    );
  }
  if (opts.installResult !== undefined) {
    Ctor.install = vi.fn().mockImplementation(() =>
      opts.installResult instanceof Promise ? opts.installResult : Promise.resolve(opts.installResult)
    );
  }
  (window as any).SpeechRecognition = Ctor;
  return { Ctor, instances };
}

describe('resolveRecognitionLang', () => {
  const originalNavigator = global.navigator;

  afterEach(() => {
    Object.defineProperty(global, 'navigator', {
      value: originalNavigator,
      writable: true,
      configurable: true,
    });
  });

  it('maps "en" to "en-US"', () => {
    expect(resolveRecognitionLang('en')).toBe('en-US');
  });

  it('maps "es" to "es-ES"', () => {
    expect(resolveRecognitionLang('es')).toBe('es-ES');
  });

  it('resolves "auto" using navigator.language when available', () => {
    Object.defineProperty(global, 'navigator', {
      value: { language: 'fr-FR' },
      writable: true,
      configurable: true,
    });
    expect(resolveRecognitionLang('auto')).toBe('fr-FR');
  });

  it('falls back to "en-US" for "auto" if navigator.language is undefined', () => {
    Object.defineProperty(global, 'navigator', {
      value: {},
      writable: true,
      configurable: true,
    });
    expect(resolveRecognitionLang('auto')).toBe('en-US');
  });

  it('passes through custom language tag if not in LANG_MAP', () => {
    expect(resolveRecognitionLang('pt-BR' as any)).toBe('pt-BR');
  });
});

describe('SpeechRecognitionService processLocally', () => {
  let service: SpeechRecognitionService;

  beforeEach(() => {
    vi.restoreAllMocks();
    delete (window as any).SpeechRecognition;
    delete (window as any).webkitSpeechRecognition;
    service = new SpeechRecognitionService();
  });

  afterEach(() => {
    service.stop();
  });

  it('1. off mode never calls available() and never sets processLocally', () => {
    const { Ctor, instances } = installMockSpeechRecognition({ available: 'available' });
    service.setLocalMode('off');
    service.start('en');

    expect(Ctor.available).not.toHaveBeenCalled();
    expect(instances.length).toBe(1);
    expect(instances[0].processLocally).toBeUndefined();
    expect(service.localStatus).toBe('cloud');
  });

  it('2. prefer + available sets processLocally = true on the created recognizer', async () => {
    const { Ctor, instances } = installMockSpeechRecognition({ available: 'available' });
    service.setLocalMode('prefer');
    service.start('en');

    await vi.waitFor(() => expect(instances.length).toBe(1));
    expect(Ctor.available).toHaveBeenCalledWith({ langs: ['en-US'], processLocally: true });
    expect(instances[0].processLocally).toBe(true);
    expect(service.localStatus).toBe('on-device');
  });

  it('3. prefer + unavailable starts anyway with processLocally unset, onError not called', async () => {
    const { instances } = installMockSpeechRecognition({ available: 'unavailable' });
    const onError = vi.fn();
    service.onError = onError;
    service.setLocalMode('prefer');
    service.start('en');

    await vi.waitFor(() => expect(instances.length).toBe(1));
    expect(instances[0].processLocally).toBeUndefined();
    expect(onError).not.toHaveBeenCalled();
    expect(service.localStatus).toBe('cloud');
  });

  it('4. prefer + downloadable starts immediately without processLocally, calls install() exactly once', async () => {
    let resolveInstall: (val: boolean) => void = () => {};
    const installPromise = new Promise<boolean>((res) => { resolveInstall = res; });
    const { Ctor, instances } = installMockSpeechRecognition({
      available: 'downloadable',
      installResult: installPromise,
    });

    service.setLocalMode('prefer');
    service.start('en');

    // Starts immediately without processLocally
    await vi.waitFor(() => expect(instances.length).toBe(1));
    expect(instances[0].processLocally).toBeUndefined();
    expect(Ctor.install).toHaveBeenCalledTimes(1);
    expect(Ctor.install).toHaveBeenCalledWith({ langs: ['en-US'], processLocally: true });
    expect(service.localStatus).toBe('downloading');

    // After install finishes, status becomes on-device
    resolveInstall(true);
    await vi.waitFor(() => expect(service.localStatus).toBe('on-device'));
  });

  it('5. require + unavailable does not create recognizer and calls onError("speech-local-unavailable")', async () => {
    const { instances } = installMockSpeechRecognition({ available: 'unavailable' });
    const onError = vi.fn();
    service.onError = onError;
    service.setLocalMode('require');
    service.start('en');

    await vi.waitFor(() => expect(onError).toHaveBeenCalledWith('speech-local-unavailable'));
    expect(instances.length).toBe(0);
    expect(service.localStatus).toBe('unavailable');
  });

  it('6. require + downloadable + install() resolving false calls onError and calls install() exactly once', async () => {
    const { Ctor, instances } = installMockSpeechRecognition({
      available: 'downloadable',
      installResult: false,
    });
    const onError = vi.fn();
    service.onError = onError;
    service.setLocalMode('require');
    service.start('en');

    await vi.waitFor(() => expect(onError).toHaveBeenCalledWith('speech-local-unavailable'));
    expect(instances.length).toBe(0);
    expect(Ctor.install).toHaveBeenCalledTimes(1);
    expect(service.localStatus).toBe('unavailable');
  });

  it('7. available() throwing SyntaxError is swallowed and degrades to cloud in prefer mode', async () => {
    const Ctor: any = vi.fn(function (this: any) {
      this.start = vi.fn();
    });
    Ctor.available = vi.fn().mockRejectedValue(new DOMException('SyntaxError'));
    (window as any).SpeechRecognition = Ctor;

    const onError = vi.fn();
    service.onError = onError;
    service.setLocalMode('prefer');
    service.start('en');

    await vi.waitFor(() => expect(service.localStatus).toBe('cloud'));
    expect(onError).not.toHaveBeenCalled();
  });

  it('8. available() never settling hits PROBE_TIMEOUT_MS and degrades to cloud', async () => {
    vi.useFakeTimers();
    const neverResolves = new Promise<string>(() => {});
    const { instances } = installMockSpeechRecognition({ available: neverResolves });

    service.setLocalMode('prefer');
    service.start('en');

    // Fast-forward 2000ms probe timeout
    await vi.advanceTimersByTimeAsync(2050);

    expect(instances.length).toBe(1);
    expect(service.localStatus).toBe('cloud');
    vi.useRealTimers();
  });

  it('9. lang: "auto" passes a valid BCP 47 tag to available(), not the string "auto"', async () => {
    const { Ctor } = installMockSpeechRecognition({ available: 'available' });
    service.setLocalMode('prefer');
    service.start('auto');

    await vi.waitFor(() => expect(Ctor.available).toHaveBeenCalled());
    const langsArg = Ctor.available.mock.calls[0][0].langs;
    expect(langsArg[0]).not.toBe('auto');
    expect(typeof langsArg[0]).toBe('string');
  });

  it('10. setLanguage("es") re-probes with es-ES', async () => {
    const { Ctor } = installMockSpeechRecognition({ available: 'available' });
    service.setLocalMode('prefer');
    service.start('en');

    await vi.waitFor(() => expect(Ctor.available).toHaveBeenCalledWith({ langs: ['en-US'], processLocally: true }));

    service.setLanguage('es');
    await vi.waitFor(() => expect(Ctor.available).toHaveBeenCalledWith({ langs: ['es-ES'], processLocally: true }));
  });

  it('pause() during the probe window suppresses the start', async () => {
    let resolveAvail: (v: string) => void = () => {};
    const { instances } = installMockSpeechRecognition({
      available: new Promise<string>((r) => { resolveAvail = r; }),
    });
    service.setLocalMode('prefer');
    service.start('en');
    service.pause();
    resolveAvail('available');
    await new Promise((r) => setTimeout(r, 20));
    expect(instances.length).toBe(0);
  });

  it('resume() during the probe creates exactly one on-device recognizer', async () => {
    let resolveAvail: (v: string) => void = () => {};
    const { instances } = installMockSpeechRecognition({
      available: new Promise<string>((r) => { resolveAvail = r; }),
    });
    service.setLocalMode('require');
    service.start('en');
    service.pause();
    service.resume();
    expect(instances.length).toBe(0); // nothing starts while probing
    resolveAvail('available');
    await vi.waitFor(() => expect(instances.length).toBe(1));
    expect(instances[0].processLocally).toBe(true);
  });

  it('require + downloadable calls install() exactly once', async () => {
    const { Ctor } = installMockSpeechRecognition({ available: 'downloadable', installResult: true });
    service.setLocalMode('require');
    service.start('en');
    await vi.waitFor(() => expect(service.localStatus).toBe('on-device'));
    expect(Ctor.install).toHaveBeenCalledTimes(1);
  });

  it('require + unavailable latches and does not re-probe on restart', async () => {
    const { Ctor } = installMockSpeechRecognition({ available: 'unavailable' });
    const onError = vi.fn();
    service.onError = onError;
    service.setLocalMode('require');
    for (let i = 0; i < 4; i++) {
      service.stop();
      service.start('en');
      await vi.waitFor(() => expect(onError).toHaveBeenCalledTimes(i + 1));
    }
    expect(Ctor.available).toHaveBeenCalledTimes(1); // latched after the first probe
  });

  it('latch is per-language', async () => {
    const { Ctor } = installMockSpeechRecognition({ available: 'unavailable' });
    const onError = vi.fn();
    service.onError = onError;
    service.setLocalMode('require');
    service.start('en');
    await vi.waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
    expect(Ctor.available).toHaveBeenCalledTimes(1);

    // Switch language to es - should re-probe for es-ES
    service.setLanguage('es');
    await vi.waitFor(() => expect(Ctor.available).toHaveBeenCalledTimes(2));
    expect(Ctor.available).toHaveBeenLastCalledWith({ langs: ['es-ES'], processLocally: true });
  });

  it('resume() after a latched require failure does not fall back to cloud', async () => {
    const { instances } = installMockSpeechRecognition({ available: 'unavailable' });
    const onError = vi.fn();
    service.onError = onError;
    service.setLocalMode('require');
    service.start('en');
    await vi.waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
    expect(instances.length).toBe(0);

    service.resume();
    expect(instances.length).toBe(0);
    expect(service.localStatus).toBe('unavailable');
  });

  it('resume() still starts normally in prefer mode after a cloud fallback', async () => {
    const { instances } = installMockSpeechRecognition({ available: 'unavailable' });
    service.setLocalMode('prefer');
    service.start('en');
    await vi.waitFor(() => expect(instances.length).toBe(1));

    service.pause();
    service.resume();
    expect(instances[0].start).toHaveBeenCalledTimes(2);
  });

  it('stop() mid-probe clears probing flag', async () => {
    let resolveAvail: (v: string) => void = () => {};
    const { instances } = installMockSpeechRecognition({
      available: new Promise<string>((r) => { resolveAvail = r; }),
    });
    service.setLocalMode('prefer');
    service.start('en');
    service.stop();
    resolveAvail('available');
    await new Promise((r) => setTimeout(r, 20));
    expect(instances.length).toBe(0);

    // Start again after stop
    service.start('en');
    await vi.waitFor(() => expect(instances.length).toBe(1));
  });
});
