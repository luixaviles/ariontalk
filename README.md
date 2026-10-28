<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset=".github/assets/logo-horizontal-dark.svg" />
    <img src=".github/assets/logo-horizontal-light.svg" alt="ArionTalk" width="320" />
  </picture>
</p>

<h3 align="center">Talk to any website</h3>

<p align="center">
  An open-source voice AI agent that knows what's on your page. One tag, no backend.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@ariontalk/widget"><img src="https://img.shields.io/npm/v/@ariontalk/widget?color=FF0F7B" alt="npm version" /></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT License" /></a>
</p>

<p align="center">
  <a href="https://ariontalk.com/?utm_source=github&utm_medium=readme&utm_content=try-live">Try it live</a> ·
  <a href="https://ariontalk.com/docs/getting-started/?utm_source=github&utm_medium=readme&utm_content=docs">Docs</a> ·
  <a href="https://tally.so/r/lbPLEX?src=github-readme">Early access</a>
</p>

## What it does

Add one tag to a page and visitors can ask about it by voice. The agent answers out loud and scrolls to and highlights the section or image it's talking about.

- **Page understanding.** Reads the text, headings and images on the page before the first question.
- **Interactive highlights.** Scrolls to and highlights what it's discussing.
- **Natural turn-taking.** Interrupt it any time and it stops to listen. An optional Silero VAD plugin makes interruptions more accurate.
- **Two engines, one API.** Run on-device with Chrome's built-in AI (the Prompt API), with no server or API key, or in the cloud with the Gemini Live API for more languages and any modern browser.

## Quick start

### On-device

No server or API key. Requires Chrome 148+, which runs a built-in on-device model (Gemini Nano) through the Prompt API.

```html
<ariontalk-widget interactive-highlights></ariontalk-widget>
<script
  type="module"
  src="https://cdn.jsdelivr.net/npm/@ariontalk/widget@latest/dist/ariontalk.js"
  async
></script>
```

### Hosted (ArionTalk cloud service)

Uses the Gemini Live engine without running a server. [Request early access](https://tally.so/r/lbPLEX?src=github-readme) to get a site key.

```html
<ariontalk-widget site-key="YOUR_SITE_KEY" interactive-highlights></ariontalk-widget>
<script
  type="module"
  src="https://cdn.jsdelivr.net/npm/@ariontalk/widget@latest/dist/ariontalk.js"
  async
></script>
```

### Self-hosted

You can run the included token server with your own Gemini API key instead of the hosted service. See [Token Server](https://ariontalk.com/docs/api/token-server/) in the docs.

The CDN script loads the latest npm release (0.3.0). Some features on `main`, such as highlights on the on-device engine, ship in the next release.

## Try the demo

The [`demo/`](./demo) folder has a page you can talk to, running on-device:

```bash
pnpm install
pnpm demo
```

Setup and sample questions are in [`demo/README.md`](./demo/README.md).

## Packages

| Package | Description |
|---------|-------------|
| [`@ariontalk/widget`](./packages/widget) | Drop-in Web Component with a ready-made UI. Works with both engines. |
| [`@ariontalk/core`](./packages/core) | Shared types, page understanding and highlights. No engine, no UI. |
| [`@ariontalk/engine-local`](./packages/engine-local) | On-device engine: Chrome's Prompt API and Web Speech. |
| [`@ariontalk/engine-gemini`](./packages/engine-gemini) | Cloud engine: Gemini Live API over WebSocket. |
| [`@ariontalk/plugin-silero-vad`](./packages/plugin-silero-vad) | Silero VAD for more accurate interruptions. |
| [`@ariontalk/plugin-kokoro-tts`](./packages/plugin-kokoro-tts) | Kokoro neural voice, on-device. |
| [`@ariontalk/token-server`](./packages/token-server) | Small Hono server that issues short-lived Gemini tokens for self-hosting. Not published to npm. |

Both engines implement the same `VoiceEngineInterface` from `@ariontalk/core`, and the widget picks one from the `engine` attribute.

`main` is ahead of the latest npm release (0.3.0). `@ariontalk/engine-local` and `@ariontalk/plugin-kokoro-tts` aren't on npm yet; build from source until the next release.

## Configuration

The most common attributes:

| Attribute | Default | Description |
|-----------|---------|-------------|
| `engine` | `"local"` | `"local"` (on-device) or `"gemini"` (cloud). |
| `site-key` | | Site key for the ArionTalk cloud service. Sets `engine` to `"gemini"`. |
| `interactive-highlights` | off | Scroll to and highlight what the agent is discussing. |
| `lang` | `"auto"` | BCP-47 language code, or `"auto"` to use `<html lang>`. |
| `label` | "Ask about this page" | Text on the voice button. |
| `theme` | `"light"` | `"light"` or `"dark"`. |
| `position` | `"bottom-right"` | `"bottom-right"` or `"bottom-left"`. |
| `settings` | off | Show the settings gear for voice and interruption options. |

See the [widget reference](https://ariontalk.com/docs/api/widget/) for every attribute, event and theming token.

## Development

Requires Node.js 22+ and pnpm 10+.

```bash
git clone https://github.com/luixaviles/ariontalk.git
cd ariontalk
pnpm install
pnpm build
```

| Command | What it does |
|---------|--------------|
| `pnpm dev` | Widget dev page on the on-device engine (http://localhost:5173/dev/index.html). |
| `pnpm demo` | The demo pages (http://localhost:5173). |
| `pnpm token-server` | Local token server for the cloud engine. Needs `GEMINI_API_KEY` in `packages/token-server/.env`. |
| `pnpm docs` | The docs site. |
| `pnpm test` | All package tests. |

## Browser support

| Engine | Browser |
|--------|---------|
| On-device | Chrome 148+ (Prompt API) |
| Cloud | Any modern browser with WebSocket and microphone access |

## Contributing

Bug reports, ideas and pull requests are welcome. Please run `pnpm test` before opening a PR, and add a changeset (`pnpm changeset`) when you change a package.

## License

[MIT](./LICENSE)
