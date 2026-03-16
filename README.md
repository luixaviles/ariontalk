# ArionTalk

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
```

### Run with Gemini Live

```bash
# Terminal 1: Start the token server
cp packages/token-server/.env.example packages/token-server/.env
# Edit .env and add your GEMINI_API_KEY
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

The token server is a lightweight Node.js HTTP server built with [Hono](https://hono.dev/). Deploy it to Google Cloud Run:

```bash
# Build and deploy
gcloud run deploy ariontalk-token-server \
  --source packages/token-server \
  --set-env-vars GEMINI_API_KEY=your-key \
  --allow-unauthenticated \
  --region us-central1
```

Then point your widget to the deployed URL:

```html
<ariontalk-widget
  engine="gemini"
  token-server="https://ariontalk-token-server-xxxxx.run.app/api/token"
  interactive-highlights
></ariontalk-widget>
```

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

## Bundle Size

~12-16 KB gzipped (widget + Lit, excluding engine add-ons).

## License

MIT
