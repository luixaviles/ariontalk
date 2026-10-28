# ArionTalk demo

A short guide to photographing the Moon that you can talk to. Click the mic, ask about the page, and the answer comes back by voice while the widget scrolls to and highlights the part it's talking about. Everything runs on your laptop with Chrome's built-in AI. No server, no API key.

## Setup

- Chrome 148 or later. The demo uses Chrome's built-in [Prompt API](https://developer.chrome.com/docs/ai/prompt-api), which runs an on-device model.
- A computer that meets Chrome's requirements for built-in AI: Windows 10 or 11, macOS 13+, or Linux; at least 22 GB of free disk space; and either a GPU with more than 4 GB of VRAM, or 16 GB of RAM and 4 CPU cores.
- The first session downloads the model, which can take a few minutes. Later sessions start right away.
- Allow microphone access when Chrome asks.

## Run it

From the repo root:

```bash
pnpm install
pnpm demo
```

Open http://localhost:5173, pick the Moon page, and click the mic button in the bottom-right corner.

The sun/moon button in the header switches between light and dark. Add `?clean` to the URL to hide the header for screen recordings.

## Things to ask

- "What settings should I use for a half Moon?"
- "What am I looking at in the Moon photo?"
- "Why is the full Moon a bad time to shoot?"
- "Can I do this with my phone?"
- "Is the Moon really bigger near the horizon?"

Interrupt it while it's talking. It stops and listens.

## How it's wired

The page loads the widget and two optional plugins: Silero VAD for more accurate interruptions, and Kokoro for a neural voice.

```html
<ariontalk-widget lang="en" interactive-highlights settings></ariontalk-widget>

<script type="module">
  import '@ariontalk/widget';
  import { EnergyBargeInDetector } from '@ariontalk/core';
  import { SileroVadDetector } from '@ariontalk/plugin-silero-vad';
  import { kokoroTtsPlugin } from '@ariontalk/plugin-kokoro-tts';

  const widget = document.querySelector('ariontalk-widget');
  widget.bargeInPlugins = [
    { id: 'energy', label: 'Energy', create: () => new EnergyBargeInDetector() },
    { id: 'silero-vad', label: 'Smart VAD', create: () => new SileroVadDetector({ onnxWASMBasePath: '/' }) },
  ];
  widget.ttsPlugins = [kokoroTtsPlugin()];
</script>
```

- `interactive-highlights` lets the assistant scroll to and highlight the section or image it's discussing.
- `settings` shows the gear button, where you pick the interruption mode and the voice.
- Silero VAD needs its model and ONNX files served from your site. `pnpm demo` copies them into `demo/public/` before starting.

The demo page also sets `force`, `variant`, `header-title` and `log-level` for the booth setup. See the widget attributes in the [main README](../README.md#configuration).
