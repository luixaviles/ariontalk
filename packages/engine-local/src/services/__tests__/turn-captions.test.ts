import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TurnCaptions } from '../turn-captions.js';

describe('TurnCaptions', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('1. First word emits on start, later words emit as time advances weighted by length', () => {
    const captions = new TurnCaptions();
    const emitted: string[] = [];
    captions.onChange = (text) => emitted.push(text);

    const handle = captions.utterance('A supercalifragilisticexpialidocious end');
    handle.start({ durationMs: 2000 });

    expect(emitted).toEqual(['A']);

    vi.advanceTimersByTime(200);
    expect(emitted[emitted.length - 1]).toBe('A supercalifragilisticexpialidocious');

    vi.advanceTimersByTime(1300); // 1500ms total
    expect(emitted[emitted.length - 1]).toBe('A supercalifragilisticexpialidocious');

    vi.advanceTimersByTime(400); // 1900ms total
    expect(emitted[emitted.length - 1]).toBe('A supercalifragilisticexpialidocious end');
  });

  it('2. Kokoro order produces the expected caption sequence', () => {
    const captions = new TurnCaptions();
    const emitted: string[] = [];
    captions.onChange = (text) => emitted.push(text);

    const h1 = captions.utterance('First sentence here.');
    const h2 = captions.utterance('Second sentence there.');

    h1.start({ durationMs: 2000 });
    expect(emitted[emitted.length - 1]).toBe('First');

    h2.start({ durationMs: 2000 });
    expect(emitted[emitted.length - 1]).toBe('First sentence here. Second');

    h1.end();
    expect(emitted[emitted.length - 1]).toBe('First sentence here. Second');

    h2.end();
    expect(emitted[emitted.length - 1]).toBe('First sentence here. Second sentence there.');

    captions.reset();
    expect(emitted[emitted.length - 1]).toBe('');
  });

  it('3. Web Speech order produces the expected caption sequence', () => {
    const captions = new TurnCaptions();
    const emitted: string[] = [];
    captions.onChange = (text) => emitted.push(text);

    const h1 = captions.utterance('First sentence here.');
    const h2 = captions.utterance('Second sentence there.');

    h1.start({ durationMs: 2000 });
    expect(emitted[emitted.length - 1]).toBe('First');

    h1.end();
    expect(emitted[emitted.length - 1]).toBe('First sentence here.');

    h2.start({ durationMs: 2000 });
    expect(emitted[emitted.length - 1]).toBe('First sentence here. Second');

    h2.end();
    expect(emitted[emitted.length - 1]).toBe('First sentence here. Second sentence there.');

    captions.reset();
    expect(emitted[emitted.length - 1]).toBe('');
  });

  it('4. end() on a handle that never started commits nothing and emits nothing', () => {
    const captions = new TurnCaptions();
    const onChange = vi.fn();
    captions.onChange = onChange;

    const handle = captions.utterance('Never started sentence.');
    handle.end();
    expect(onChange).not.toHaveBeenCalled();

    const nextHandle = captions.utterance('Second turn sentence.');
    nextHandle.start({ durationMs: 1000 });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('Second');
  });

  it('5. boundary() pulls a word forward and timer tick for that word does not emit again', () => {
    const captions = new TurnCaptions();
    const emitted: string[] = [];
    captions.onChange = (text) => emitted.push(text);

    const handle = captions.utterance('One two three four');
    handle.start({ durationMs: 1900 });
    expect(emitted).toEqual(['One']);

    handle.boundary(4);
    expect(emitted).toEqual(['One', 'One two']);

    vi.advanceTimersByTime(500);
    expect(emitted).toEqual(['One', 'One two']);

    vi.advanceTimersByTime(500);
    expect(emitted).toEqual(['One', 'One two', 'One two three']);
  });

  it('6. Fallback estimate: with no durationMs, rate: 2 reveals at half the delay of rate: 1', () => {
    // 80 chars, word weights 35 and 46. Estimate is 5200ms at rate 1 and 2600ms at rate 2,
    // so the second word is due at 2247ms and 1123ms respectively.
    const text = 'Supercalifragilisticexpialidocious pneumonoultramicroscopicsilicovolcanoconiosis';
    const full = text;

    const rate1: string[] = [];
    const captionsRate1 = new TurnCaptions();
    captionsRate1.onChange = (t) => rate1.push(t);
    captionsRate1.utterance(text, { rate: 1 }).start();

    const rate2: string[] = [];
    const captionsRate2 = new TurnCaptions();
    captionsRate2.onChange = (t) => rate2.push(t);
    captionsRate2.utterance(text, { rate: 2 }).start();

    vi.advanceTimersByTime(1122);
    expect(rate2[rate2.length - 1]).toBe('Supercalifragilisticexpialidocious');
    expect(rate1[rate1.length - 1]).toBe('Supercalifragilisticexpialidocious');

    vi.advanceTimersByTime(1); // 1123ms
    expect(rate2[rate2.length - 1]).toBe(full);
    expect(rate1[rate1.length - 1]).toBe('Supercalifragilisticexpialidocious');

    vi.advanceTimersByTime(1124); // 2247ms
    expect(rate1[rate1.length - 1]).toBe(full);
  });

  it('7. reset() emits empty once when text was showing, and emits nothing when nothing was showing', () => {
    const captions = new TurnCaptions();
    const onChange = vi.fn();
    captions.onChange = onChange;

    captions.reset();
    expect(onChange).not.toHaveBeenCalled();

    const handle = captions.utterance('Active utterance');
    handle.start({ durationMs: 1000 });
    expect(onChange).toHaveBeenCalledTimes(1);

    captions.reset();
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onChange).toHaveBeenLastCalledWith('');

    captions.reset();
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('8. Calls on handles from before reset() are ignored', () => {
    const captions = new TurnCaptions();
    const emitted: string[] = [];
    captions.onChange = (text) => emitted.push(text);

    const handle = captions.utterance('First utterance to cancel');
    handle.start({ durationMs: 2000 });
    expect(emitted).toEqual(['First']);

    captions.reset();
    expect(emitted).toEqual(['First', '']);

    handle.boundary(10);
    handle.end();
    vi.advanceTimersByTime(2000);

    expect(emitted).toEqual(['First', '']);
  });

  it('9. Missed ticks catch up in one emit', () => {
    let now = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => now);

    const captions = new TurnCaptions();
    let changeCount = 0;
    let lastText = '';
    captions.onChange = (text) => {
      changeCount++;
      lastText = text;
    };

    const handle = captions.utterance('One two three four five six');
    handle.start({ durationMs: 3000 });
    expect(changeCount).toBe(1);
    expect(lastText).toBe('One');

    now += 2500;
    vi.advanceTimersByTime(500);

    expect(changeCount).toBe(2);
    expect(lastText).toContain('five');
  });

  it('10. Empty and whitespace-only text: no emit, end() commits nothing', () => {
    const captions = new TurnCaptions();
    const onChange = vi.fn();
    captions.onChange = onChange;

    const emptyHandle = captions.utterance('   ');
    emptyHandle.start();
    expect(onChange).not.toHaveBeenCalled();

    emptyHandle.end();
    expect(onChange).not.toHaveBeenCalled();

    const validHandle = captions.utterance('Valid text');
    validHandle.start({ durationMs: 1000 });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('Valid');
  });
});
