# ArionTalk - Voice AI Agent for Any Website

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: light)" srcset="https://ariontalk.com/images/logo-full-light.svg" />
    <source media="(prefers-color-scheme: dark)" srcset="https://ariontalk.com/images/logo-full-dark.svg" />
    <img src="https://ariontalk.com/images/logo-full-light.svg" alt="ArionTalk Logo" width="200" />
  </picture>
</p>

<p align="center">
  <a href="https://www.typescriptlang.org/">
    <img src="https://img.shields.io/badge/TypeScript-5.x-blue?logo=typescript" alt="TypeScript" />
  </a>
  <a href="https://nodejs.org/">
    <img src="https://img.shields.io/badge/Node.js-22%2B-green?logo=node.js" alt="Node.js" />
  </a>
  <a href="https://ai.google.dev/gemini-api/docs/live">
    <img src="https://img.shields.io/badge/Gemini_Live-API-8E75B2?logo=googlegemini&logoColor=white" alt="Gemini Live" />
  </a>
  <a href="https://www.google.com/chrome/">
    <img src="https://img.shields.io/badge/Chrome-139%2B-4285F4?logo=googlechrome&logoColor=white" alt="Chrome 139+" />
  </a>
  <a href="https://opensource.org/licenses/MIT">
    <img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT" />
  </a>
</p>

A voice AI agent that understands your webpage — reads your content, sees your images, and highlights what it's talking about. Powered by Gemini Live.

## What It Does

ArionTalk adds a voice assistant to any website with a single HTML tag. Visitors speak naturally, and the AI responds with voice while scrolling to and highlighting the exact content being discussed. It works with two engines: **Gemini Live** (cloud, multimodal, 12 languages) and a **Local** engine (on-device, privacy-first).

## Key Features

- **Page Understanding** — Automatically extracts text, images, and structure from any webpage. The AI knows what's on the page before you even ask.
- **Interactive Highlights** — As the AI discusses content, it scrolls to and highlights the exact section or image. Works on both engines: Gemini function calling in the cloud, inline action tags on-device.
- **Natural Voice with Barge-in** — Talk naturally, interrupt anytime. The AI stops, listens, and adapts — just like a real conversation.
- **Offline Mode** — The local engine runs the model on-device via Gemini Nano, interactive highlights included. No server and no API keys. Speech-to-text uses Chrome 139+ on-device recognition (`processLocally`), controlled via the `speech-local` attribute (`prefer` by default, `require`, or `off`).

## Packages

| Package | Description |
|---------|-------------|
| [`@ariontalk/core`](./packages/core) | Shared services, types, and page understanding — no engine implementation, no UI dependency |
| [`@ariontalk/widget`](./packages/widget) | Drop-in Web Component with a ready-made UI, bundling both engines |
| [`@ariontalk/engine-local`](./packages/engine-local) | On-device engine using the Chrome Prompt API (Gemini Nano) and Web Speech |
| [`@ariontalk/engine-gemini`](./packages/engine-gemini) | Cloud engine add-on using Gemini Live API for real-time voice conversations |
| [`@ariontalk/token-server`](./packages/token-server) | Lightweight Hono server that issues ephemeral Gemini API tokens |
| [`@ariontalk/plugin-silero-vad`](./packages/plugin-silero-vad) | Silero VAD plugin for AI-powered barge-in detection |
| [`@ariontalk/plugin-kokoro-tts`](./packages/plugin-kokoro-tts) | Kokoro TTS plugin for high-quality on-device neural voice synthesis |

Both engines implement the same `VoiceEngineInterface` from `@ariontalk/core` and share its page indexing and highlight services. The widget picks one at runtime from the `engine` attribute.

Note: The `main` branch is ahead of the latest npm release (0.3.0), and `@ariontalk/engine-local` and `@ariontalk/plugin-kokoro-tts` are not on npm yet. Build from source until the next release (see [Development](#development)).

## Quick Start

### Gemini Live Engine (recommended)

The fastest path is the ArionTalk cloud service. Register your site at [ariontalk.com](https://ariontalk.com) to get a site key — no server to run.

```html
<ariontalk-widget
  site-key="YOUR_SITE_KEY"
  interactive-highlights
></ariontalk-widget>
<script
  type="module"
  src="https://cdn.jsdelivr.net/npm/@ariontalk/widget@latest/dist/ariontalk.js"
  async
></script>
```

When `site-key` is set, `engine="gemini"` resolves automatically and the widget points at the cloud service.

**Self-hosted alternative.** If you'd rather run your own token server, use the `token-server` attribute and start the included server:

```html
<ariontalk-widget
  engine="gemini"
  token-server="http://localhost:3001/api/token"
  interactive-highlights
  settings
></ariontalk-widget>
```

```bash
cd packages/token-server
cp .env.example .env
# Edit .env and add your GEMINI_API_KEY (get one at https://aistudio.google.com/apikey)
pnpm dev
```

The token server runs on `http://localhost:3001` and issues ephemeral tokens so your API key is never exposed to the browser.

### Local Engine (offline)

For an on-device experience with no server required:

```html
<ariontalk-widget></ariontalk-widget>
<script
  type="module"
  src="https://cdn.jsdelivr.net/npm/@ariontalk/widget@latest/dist/ariontalk.js"
  async
></script>
```

Requires Chrome 139+ with the Prompt API origin trial enabled.

## Configuration

| Attribute | Type | Default | Description |
|-----------|------|---------|-------------|
| `site-key` | `string` | `""` | Site key for the ArionTalk cloud service. When set, `engine` defaults to `"gemini"` and `service-url` is defaulted automatically. |
| `service-url` | `string` | auto | Base URL for the ArionTalk cloud service. Defaulted automatically when `site-key` is present. |
| `engine` | `string` | `"local"` | Engine type: `"local"` (on-device) or `"gemini"` (cloud) |
| `token-server` | `string` | `""` | URL of a self-hosted token server. Kept for back-compat; prefer `site-key` for the cloud service. |
| `lang` | `string` | `"auto"` | BCP-47 language code, or `"auto"` to detect from `<html lang>`. |
| `label` | `string` | `"Voice Chat"` | Text shown on the floating action button. |
| `variant` | `string` | `"default"` | FAB size variant: `"default"` or `"compact"`. |
| `icon` | `string` | `"mic"` | FAB icon: `"mic"` or `"wave"`. |
| `interactive-highlights` | `boolean` | `false` | Enable real-time content highlighting during conversations. Works on both engines. |
| `gemini-voice` | `string` | `""` | Gemini voice name (`Kore`, `Puck`, `Charon`, `Aoede`, `Fenrir`, `Leda`, `Orus`, `Zephyr`) |
| `gemini-model` | `string` | `""` | Gemini model identifier |
| `position` | `string` | `"bottom-right"` | Widget position (`"bottom-right"` or `"bottom-left"`) |
| `theme` | `string` | `"light"` | Color theme (`"light"` or `"dark"`) |
| `settings` | `boolean` | `false` | Show settings gear icon for pre-session configuration |
| `force` | `boolean` | `false` | Skip browser support check and always show the widget |
| `log-level` | `string` | `"disabled"` | Console logging: `"disabled"`, `"error"`, `"warning"`, `"info"`, `"debug"` |

## Architecture

```
ariontalk/
├── packages/
│   ├── core/                        # @ariontalk/core — shared by both engines
│   │   └── src/
│   │       ├── services/
│   │       │   ├── page-extractor.ts        # Page content extraction (text + images)
│   │       │   ├── page-indexer.ts          # Annotated page index (sec-N / img-N anchors)
│   │       │   ├── highlight-manager.ts     # Scroll + highlight, shared by both engines
│   │       │   ├── dom-visibility.ts        # Visibility checks for extraction
│   │       │   └── barge-in-detector.ts     # Energy-based interruption detection
│   │       ├── types.ts                     # VoiceEngineInterface, EngineCapabilities
│   │       └── utils/
│   │           ├── browser-support.ts       # Feature detection
│   │           ├── logger.ts                # Leveled logging
│   │           ├── blob.ts                  # Blob to base64 helper
│   │           └── timer.ts                 # Session timer
│   ├── engine-local/              # @ariontalk/engine-local
│   │   └── src/
│   │       ├── engine/
│   │       │   └── voice-engine.ts          # On-device voice session orchestrator
│   │       └── services/
│   │           ├── ai-session.ts            # Prompt API (Gemini Nano) wrapper
│   │           ├── action-tag-parser.ts     # Inline @@sec-N@@ tag parsing
│   │           ├── speech-recognition.ts    # WebSpeech Recognition wrapper
│   │           └── speech-synthesis.ts      # WebSpeech Synthesis wrapper
│   ├── engine-gemini/               # @ariontalk/engine-gemini
│   │   └── src/
│   │       ├── gemini-engine.ts             # Gemini Live WebSocket engine
│   │       ├── audio/
│   │       │   ├── audio-capture.ts         # Mic capture at 16kHz PCM
│   │       │   └── audio-playback.ts        # Web Audio playback with worklet
│   │       └── session/
│   │           └── token-manager.ts         # Ephemeral token lifecycle
│   ├── token-server/                # @ariontalk/token-server
│   │   └── src/
│   │       ├── app.ts                       # Hono app (exported for tests)
│   │       ├── index.ts                     # Node server entry point
│   │       └── prompts/
│   │           └── voice-assistant.md       # System instruction template
│   ├── widget/                      # @ariontalk/widget
│   │   └── src/
│   │       ├── components/
│   │       │   ├── widget-root.ts           # Root component: FAB + session + minimize
│   │       │   ├── widget-fab.ts            # Floating action button (label/variant/icon)
│   │       │   ├── widget-session.ts        # Expanded session panel
│   │       │   ├── widget-minimized.ts      # Collapsed status-aware indicator
│   │       │   └── widget-voice-settings.ts # Settings UI
│   │       └── controllers/
│   │           └── voice-session.controller.ts  # Engine lifecycle management
│   └── plugin-silero-vad/           # @ariontalk/plugin-silero-vad
│       └── src/
│           └── silero-vad-detector.ts       # AI-powered voice activity detection
├── docs/                            # Documentation content (MDX)
├── docs-site/                       # Astro + Starlight shell for docs/
├── pnpm-workspace.yaml
└── package.json
```

## Development

### Prerequisites

- Node.js 20+
- pnpm 9+
- Gemini API key (for Gemini engine — get one at [Google AI Studio](https://aistudio.google.com/apikey))

### Setup

```bash
# Clone and install
git clone https://github.com/luixaviles/ariontalk.git
cd ariontalk
pnpm install
pnpm build

# Configure environment
cp packages/token-server/.env.example packages/token-server/.env
# Edit packages/token-server/.env and add your GEMINI_API_KEY
```

### Try the on-device engine

No server or API key needed. Requires Chrome 139+ with the Prompt API (Gemini Nano).

```bash
pnpm dev
# Opens http://localhost:5173/dev/index.html
```

### Run with Gemini Live

```bash
# Start the token server
pnpm token-server
# Runs on http://localhost:3001
```

### Other Commands

```bash
# Run the docs site locally
pnpm docs

# Build all packages
pnpm build

# Run tests
pnpm test
```

## Deployment

### Token Server on Google Cloud Run

**One-time GCP setup:**

```bash
gcloud auth login
GCP_PROJECT_ID=your-project ./scripts/setup-gcp.sh
```

This enables required APIs, creates an Artifact Registry repository, and stores your `GEMINI_API_KEY` in Secret Manager.

Save your project ID so the deploy script picks it up automatically:

```bash
cp .env.example .env
# Edit .env and set GCP_PROJECT_ID
```

**Deploy:**

```bash
pnpm deploy-token-server
```

Builds a Docker image, pushes to Artifact Registry, and deploys to Cloud Run. The `GEMINI_API_KEY` is pulled from Secret Manager at runtime — never passed in plain text.

You can also pass the project ID inline: `GCP_PROJECT_ID=your-project pnpm deploy-token-server`.

## Tech Stack

- **[Gemini Live API](https://ai.google.dev/)** — Real-time multimodal voice streaming with function calling
- **[Lit](https://lit.dev/)** — Web Components library
- **TypeScript** — Type safety across all packages
- **[Hono](https://hono.dev/)** — Lightweight HTTP server for token endpoint
- **[Google Cloud Run](https://cloud.google.com/run)** — Serverless deployment for token server
- **Web Audio API** — Low-latency audio capture and playback
- **Chrome Built-in APIs** — WebSpeech, Prompt API (Gemini Nano) for local engine

## Browser Support

| Engine | Browser | Notes |
|--------|---------|-------|
| Gemini Live | Any modern browser | Requires WebSocket + microphone access |
| Local | Chrome 139+ | Requires Prompt API origin trial |


## License

MIT
