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

ArionTalk adds a voice assistant to any website with a single HTML tag. Visitors speak naturally, and the AI responds with voice while scrolling to and highlighting the exact content being discussed. It works with two engines: **Gemini Live** (cloud, multimodal, 12 languages) and a **Local** engine (offline, on-device, privacy-first).

## Key Features

- **Page Understanding** — Automatically extracts text, images, and structure from any webpage. The AI knows what's on the page before you even ask.
- **Interactive Highlights** — As the AI discusses content, it scrolls to and highlights the exact section or image — powered by Gemini function calling.
- **Natural Voice with Barge-in** — Talk naturally, interrupt anytime. The AI stops, listens, and adapts — just like a real conversation.
- **Offline Mode** — The local engine runs entirely on-device via Gemini Nano. No server, no API keys, no internet required.

## Packages

| Package | Description |
|---------|-------------|
| [`@ariontalk/core`](./packages/core) | Headless voice engine — services, types, and session logic with no UI dependency |
| [`@ariontalk/widget`](./packages/widget) | Drop-in Web Component that wraps `@ariontalk/core` with a ready-made UI |
| [`@ariontalk/engine-gemini`](./packages/engine-gemini) | Cloud engine add-on using Gemini Live API for real-time voice conversations |
| [`@ariontalk/token-server`](./packages/token-server) | Lightweight Hono server that issues ephemeral Gemini API tokens |
| [`@ariontalk/plugin-silero-vad`](./packages/plugin-silero-vad) | Silero VAD plugin for AI-powered barge-in detection |

## Quick Start

### Gemini Live Engine (recommended)

**1. Add the widget to your page:**

```html
<ariontalk-widget
  engine="gemini"
  token-server="http://localhost:3001/api/token"
  interactive-highlights
  settings
></ariontalk-widget>
<script
  type="module"
  src="https://cdn.jsdelivr.net/npm/@ariontalk/widget@latest/dist/ariontalk.js"
  async
></script>
```

**2. Start the token server:**

```bash
cd packages/token-server
cp .env.example .env
# Edit .env and add your GEMINI_API_KEY (get one at https://aistudio.google.com/apikey)
pnpm dev
```

The token server runs on `http://localhost:3001` and issues ephemeral tokens so your API key is never exposed to the browser.

### Local Engine (offline)

For a fully offline experience with no server required:

```html
<ariontalk-widget lang="en"></ariontalk-widget>
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
| `engine` | `string` | `"local"` | Engine type: `"local"` (on-device) or `"gemini"` (cloud) |
| `token-server` | `string` | `""` | URL of the token server for Gemini engine (required when `engine="gemini"`) |
| `lang` | `string` | `"en"` | Language for the session |
| `interactive-highlights` | `boolean` | `false` | Enable real-time content highlighting during Gemini conversations |
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
│   ├── core/                        # @ariontalk/core
│   │   └── src/
│   │       ├── engine/
│   │       │   └── voice-engine.ts          # Local voice session orchestrator
│   │       ├── services/
│   │       │   ├── page-extractor.ts        # Page content extraction (text + images)
│   │       │   ├── page-indexer.ts          # Annotated page index for interactive highlights
│   │       │   ├── speech-recognition.ts    # WebSpeech Recognition wrapper
│   │       │   ├── speech-synthesis.ts      # WebSpeech Synthesis wrapper
│   │       │   ├── ai-session.ts            # Prompt API (Gemini Nano) wrapper
│   │       │   └── barge-in-detector.ts     # Energy-based interruption detection
│   │       └── utils/
│   │           ├── browser-support.ts       # Feature detection
│   │           └── timer.ts                 # Session timer
│   ├── engine-gemini/               # @ariontalk/engine-gemini
│   │   └── src/
│   │       ├── gemini-engine.ts             # Gemini Live WebSocket engine
│   │       ├── audio/
│   │       │   ├── audio-capture.ts         # Mic capture at 16kHz PCM
│   │       │   └── audio-playback.ts        # Web Audio playback with worklet
│   │       ├── highlights/
│   │       │   └── highlight-manager.ts     # Scroll + highlight via function calling
│   │       └── session/
│   │           └── token-manager.ts         # Ephemeral token lifecycle
│   ├── token-server/                # @ariontalk/token-server
│   │   └── src/
│   │       └── index.ts                     # Hono server — token endpoint + system prompt
│   ├── widget/                      # @ariontalk/widget
│   │   └── src/
│   │       ├── components/
│   │       │   ├── widget-root.ts           # Root component: FAB + session panel
│   │       │   ├── widget-fab.ts            # Floating action button
│   │       │   ├── widget-session.ts        # Expanded session panel
│   │       │   └── widget-voice-settings.ts # Settings UI
│   │       └── controllers/
│   │           └── voice-session.controller.ts  # Engine lifecycle management
│   └── plugin-silero-vad/           # @ariontalk/plugin-silero-vad
│       └── src/
│           └── silero-vad-detector.ts       # AI-powered voice activity detection
├── demo/                            # Demo pages with widget examples
├── website/                         # Astro + Starlight documentation site
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

cp website/.env.example website/.env
# Defaults to http://localhost:3001 — no changes needed for local dev
```

### Run with Gemini Live

```bash
# Terminal 1: Start the token server
pnpm token-server
# Runs on http://localhost:3001

# Terminal 2: Start the demo
pnpm demo
# Opens at http://localhost:5173
```

### Other Commands

```bash
# Run the docs website
pnpm website

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
