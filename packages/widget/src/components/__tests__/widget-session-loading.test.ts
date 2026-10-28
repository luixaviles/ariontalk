import { describe, it, expect, beforeEach } from 'vitest';
import '../widget-session.js';
import type { WidgetSession } from '../widget-session.js';

type LoadingStage = 'connecting' | 'voice' | 'ai';

async function mountLoading(stage: LoadingStage, downloadProgress: number): Promise<WidgetSession> {
  const el = document.createElement('vcw-session') as WidgetSession;
  el.status = 'loading';
  el.loadingStage = stage;
  el.downloadProgress = downloadProgress;
  document.body.appendChild(el);
  await el.updateComplete;
  return el;
}

function statusText(el: WidgetSession): string {
  return el.shadowRoot?.querySelector('.status span')?.textContent?.trim() ?? '';
}

function progressText(el: WidgetSession): string | null {
  const node = el.shadowRoot?.querySelector('.progress-text');
  return node ? (node.textContent?.trim() ?? '') : null;
}

describe('vcw-session loading panel', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('1. A download shows the percentage on the bar and never repeats it in the label', async () => {
    const el = await mountLoading('voice', 0.42);

    expect(statusText(el)).toBe('Loading voice...');
    expect(progressText(el)).toBe('42%');
  });

  it('2. An indeterminate load labels the status only, with no second label under the bar', async () => {
    const el = await mountLoading('voice', -1);

    expect(statusText(el)).toBe('Preparing voice...');
    expect(progressText(el)).toBeNull();
    expect(el.shadowRoot?.querySelector('.progress-fill--indeterminate')).not.toBeNull();
  });

  it('3. A load with nothing to download shows the label alone, with no bar', async () => {
    const el = await mountLoading('voice', 0);

    expect(statusText(el)).toBe('Preparing voice...');
    expect(el.shadowRoot?.querySelector('.progress-bar')).toBeNull();
  });

  it('6. The header row is present in every state, so the panel does not resize', async () => {
    const el = await mountLoading('voice', 0);
    el.showMinimize = true;
    el.showTimer = true;
    await el.updateComplete;

    expect(el.shadowRoot?.querySelector('.header-row')).not.toBeNull();
    expect(el.shadowRoot?.querySelector('.avatar')).not.toBeNull();
    expect(el.shadowRoot?.querySelector('.timer')).toBeNull();
    expect(el.shadowRoot?.querySelector('.minimize-btn')).not.toBeNull();

    el.status = 'listening';
    await el.updateComplete;

    expect(el.shadowRoot?.querySelector('.header-row')).not.toBeNull();
    expect(el.shadowRoot?.querySelector('.timer')).not.toBeNull();
    expect(el.shadowRoot?.querySelector('.minimize-btn')).not.toBeNull();
    expect(el.shadowRoot?.querySelector('.progress-bar')).toBeNull();

    // When showTimer is false (default), timer is hidden
    el.showTimer = false;
    await el.updateComplete;
    expect(el.shadowRoot?.querySelector('.timer')).toBeNull();
  });

  it('7. Minimizing is possible while a model loads', async () => {
    const el = await mountLoading('voice', 0.5);
    el.showMinimize = true;
    await el.updateComplete;

    let minimized = 0;
    el.addEventListener('minimize', () => { minimized++; });
    (el.shadowRoot?.querySelector('.minimize-btn') as HTMLButtonElement).click();

    expect(minimized).toBe(1);
  });

  it('4. The AI stage follows the same rule', async () => {
    const el = await mountLoading('ai', 0.6);
    expect(statusText(el)).toBe('Loading AI model...');
    expect(progressText(el)).toBe('60%');

    el.downloadProgress = -1;
    await el.updateComplete;
    expect(statusText(el)).toBe('Preparing model...');
    expect(progressText(el)).toBeNull();
  });

  it('5. A connecting stage keeps its own label and reserves nothing, since it never shows a bar', async () => {
    const el = await mountLoading('connecting', 0);
    expect(statusText(el)).toBe('Connecting…');
    expect(el.shadowRoot?.querySelector('.progress-bar')).toBeNull();
  });

  it('8. Header renders avatar with ArionTalk logo and active status badge', async () => {
    const el = await mountLoading('connecting', 0);
    expect(el.shadowRoot?.querySelector('.avatar .arion-logo')).not.toBeNull();
    expect(el.shadowRoot?.querySelector('.avatar .status-badge')).not.toBeNull();
  });

  it('9. Header renders default and customized title and subtitle', async () => {
    const el = await mountLoading('connecting', 0);
    expect(el.shadowRoot?.querySelector('.header-title')?.textContent?.trim()).toBe('ArionTalk');
    expect(el.shadowRoot?.querySelector('.header-subtitle')?.textContent?.trim()).toBe('Ask a question');

    el.headerTitle = 'Support Bot';
    el.headerSubtitle = 'How can I assist?';
    await el.updateComplete;

    expect(el.shadowRoot?.querySelector('.header-title')?.textContent?.trim()).toBe('Support Bot');
    expect(el.shadowRoot?.querySelector('.header-subtitle')?.textContent?.trim()).toBe('How can I assist?');
  });

  it('10. Header subtitle localizes according to locale', async () => {
    const el = await mountLoading('connecting', 0);
    el.locale = 'es';
    await el.updateComplete;

    expect(el.shadowRoot?.querySelector('.header-subtitle')?.textContent?.trim()).toBe('Haz una pregunta');
  });

  it('11. Header subtitle renders timer inline when session is connected and showTimer is true', async () => {
    const el = await mountLoading('connecting', 0);
    el.status = 'listening';
    el.timerDisplay = '1:23';
    await el.updateComplete;

    // By default showTimer is false, timer is omitted
    const subtitle = el.shadowRoot?.querySelector('.header-subtitle');
    expect(subtitle?.querySelector('.timer')).toBeNull();
    expect(subtitle?.textContent?.trim()).toBe('Ask a question');

    // When showTimer is enabled, timer is rendered inline
    el.showTimer = true;
    await el.updateComplete;
    expect(subtitle?.querySelector('.timer')?.textContent).toBe('1:23');
    expect(subtitle?.textContent).toContain('1:23');
    expect(subtitle?.textContent).toContain('Ask a question');
  });
});
