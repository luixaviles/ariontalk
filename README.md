# ArionTalk

A lightweight, offline-first, privacy-focused voice chat widget. Embed it on any website with a single script tag and let visitors have voice conversations with an AI agent about your page content — powered entirely by Chrome's built-in APIs.

**No backend. No API keys. No subscriptions. Everything runs on-device.**

## How It Works

ArionTalk combines three Chrome built-in APIs into a seamless voice conversation loop:

1. **WebSpeech Recognition** — Converts the user's voice to text
2. **Prompt API (Gemini Nano)** — Processes the message on-device and generates a response
3. **WebSpeech Synthesis** — Speaks the AI response back to the user

The widget automatically extracts your page content (text + images) so the AI can answer questions about what the visitor is looking at.

## Quick Start

### CDN (simplest)

```html
<voicezero-ariontalk lang="en"></voicezero-ariontalk>
<script
  type="module"
  src="https://cdn.jsdelivr.net/npm/ariontalk@latest/dist/ariontalk.js"
  async
></script>
```

### npm

```bash
npm install ariontalk
```

```javascript
import 'ariontalk';
```

```html
<voicezero-ariontalk lang="en"></voicezero-ariontalk>
```

## Configuration

### Attributes

| Attribute | Type | Default | Description |
|-----------|------|---------|-------------|
| `lang` | `string` | `"en"` | Language (`"en"` or `"es"`) |
| `position` | `string` | `"bottom-right"` | Widget position on screen |
| `theme` | `string` | `"light"` | `"light"` or `"dark"` |

### Theming

Customize the look with CSS custom properties:

```css
voicezero-ariontalk {
  --at-primary-color: #4F46E5;
  --at-text-color: #1F2937;
  --at-bg-color: #FFFFFF;
  --at-font-family: system-ui, sans-serif;
  --at-border-radius: 16px;
}
```

### Events

Listen for widget lifecycle events:

```javascript
const widget = document.querySelector('voicezero-ariontalk');

widget.addEventListener('at-session-start', (e) => {
  console.log('Session started:', e.detail.lang);
});

widget.addEventListener('at-session-end', (e) => {
  console.log('Session ended:', e.detail.duration, e.detail.messageCount);
});

widget.addEventListener('at-error', (e) => {
  console.error('Error:', e.detail.error);
});
```

## Browser Support

| Browser | Supported | Notes |
|---------|-----------|-------|
| Chrome 139+ | Yes | Full support via Prompt API origin trial |
| Firefox | No | No Speech Recognition or Prompt API |
| Safari | No | No Prompt API |

The widget automatically hides itself on unsupported browsers.

## Offline Capabilities

| Feature | Offline? | Details |
|---------|----------|---------|
| AI responses (Gemini Nano) | Yes | Fully on-device after initial model download (~1.7 GB, cached) |
| Speech synthesis | Yes | Uses local voices when available |
| Speech recognition | Partial | On-device mode available in Chrome 128+ (`processLocally`), falls back to server-based |

## Architecture

```
ariontalk/
├── src/
│   ├── ariontalk.ts                     # Main entry point
│   ├── components/
│   │   ├── widget-root.ts               # Root component: FAB + session panel
│   │   ├── widget-fab.ts                # Floating action button
│   │   └── widget-session.ts            # Expanded session panel
│   ├── services/
│   │   ├── speech-recognition.ts        # WebSpeech Recognition wrapper
│   │   ├── speech-synthesis.ts          # WebSpeech Synthesis wrapper
│   │   ├── ai-session.ts               # Prompt API (Gemini Nano) wrapper
│   │   └── page-extractor.ts           # Page content extraction
│   ├── controllers/
│   │   └── voice-session.controller.ts  # Voice session orchestrator
│   ├── utils/
│   │   ├── browser-support.ts           # Feature detection
│   │   └── timer.ts                     # Session timer
│   ├── styles/
│   │   └── shared-styles.ts             # Shared CSS
│   └── types.ts                         # TypeScript types
├── dev/
│   └── index.html                       # Development page
├── package.json
├── tsconfig.json
└── vite.config.ts
```

## Development

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Build for production
npm run build
```

## Tech Stack

- **[Lit](https://lit.dev/)** — Web Components library
- **TypeScript** — Type safety
- **Vite** — Build tool (library mode)
- **Chrome Built-in APIs** — WebSpeech, Prompt API (Gemini Nano)

## Bundle Size

~12-16 KB gzipped (including Lit).

## How It Stays Private

- All AI processing happens on-device via Gemini Nano
- Speech synthesis uses local voices when available
- Page content is extracted locally and never sent to any server
- No analytics, no tracking, no external requests (except speech recognition fallback)
- Shadow DOM encapsulation prevents interference with host pages

## License

MIT
