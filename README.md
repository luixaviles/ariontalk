# ArionTalk

A lightweight, offline-first, privacy-focused voice chat widget. Embed it on any website with a single script tag and let visitors have voice conversations with an AI agent about your page content — powered entirely by Chrome's built-in APIs.

**No backend. No API keys. No subscriptions. Everything runs on-device.**

## How It Works

ArionTalk combines three Chrome built-in APIs into a seamless voice conversation loop:

1. **WebSpeech Recognition** — Converts the user's voice to text
2. **Prompt API (Gemini Nano)** — Processes the message on-device and generates a response
3. **WebSpeech Synthesis** — Speaks the AI response back to the user

The widget automatically extracts your page content (text + images) so the AI can answer questions about what the visitor is looking at.

## Packages

| Package | Description |
|---------|-------------|
| [`@ariontalk/core`](./packages/core) | Headless voice engine — services, types, and session logic with no UI dependency |
| [`@ariontalk/widget`](./packages/widget) | Drop-in Web Component that wraps `@ariontalk/core` with a ready-made UI |

## Quick Start

### CDN (simplest)

```html
<ariontalk-widget lang="en"></ariontalk-widget>
<script
  type="module"
  src="https://cdn.jsdelivr.net/npm/@ariontalk/widget@latest/dist/ariontalk.js"
  async
></script>
```

### npm / pnpm

```bash
pnpm add @ariontalk/widget
```

```javascript
import '@ariontalk/widget';
```

```html
<ariontalk-widget lang="en"></ariontalk-widget>
```

### Headless (core only)

Use `@ariontalk/core` if you want the voice engine without the widget UI:

```bash
pnpm add @ariontalk/core
```

```javascript
import { VoiceEngine, isVoiceChatSupported } from '@ariontalk/core';
```

## Configuration

### Attributes

| Attribute | Type | Default | Description |
|-----------|------|---------|-------------|
| `lang` | `string` | `"en"` | Language (`"en"` or `"es"`) |
| `position` | `string` | `"bottom-right"` | Widget position on screen |
| `theme` | `string` | `"light"` | `"light"` or `"dark"` |
| `settings` | `boolean` | `false` | Show settings gear icon next to FAB (pre-session) |
| `force` | `boolean` | `false` | Skip browser support check |

### Theming

ArionTalk ships with light (default) and dark themes using a neutral gray/black/white palette.

#### Dark Theme

```html
<ariontalk-widget theme="dark"></ariontalk-widget>
```

#### CSS Custom Properties

All colors flow through `--at-*` CSS custom properties. Override any of them to customize the look:

| Property | Light Default | Dark Default | Description |
|----------|--------------|--------------|-------------|
| `--at-primary-color` | `#111827` | `#FAFAFA` | Accent / FAB background |
| `--at-primary-text` | `#FFFFFF` | `#18181B` | Text on accent backgrounds |
| `--at-text-color` | `#1F2937` | `#FAFAFA` | Primary text |
| `--at-text-secondary` | `#6B7280` | `#A1A1AA` | Medium emphasis text |
| `--at-text-muted` | `#9CA3AF` | `#71717A` | Low emphasis text |
| `--at-bg-color` | `#FFFFFF` | `#18181B` | Panel backgrounds |
| `--at-surface-color` | `#F3F4F6` | `#27272A` | Button / chip backgrounds |
| `--at-surface-hover` | `#E5E7EB` | `#3F3F46` | Hover states |
| `--at-border-color` | `#D1D5DB` | `#3F3F46` | Input borders, progress tracks |
| `--at-border-radius` | `16px` | `16px` | Panel border radius |
| `--at-font-family` | `system-ui, sans-serif` | `system-ui, sans-serif` | Font stack |
| `--at-shadow-color` | `rgba(0,0,0,0.12)` | `rgba(0,0,0,0.4)` | Box shadows |
| `--at-shadow-hover` | `rgba(0,0,0,0.18)` | `rgba(0,0,0,0.5)` | Hover shadows |
| `--at-focus-ring` | `rgba(17,24,39,0.2)` | `rgba(250,250,250,0.25)` | Focus outlines |
| `--at-success-color` | `#10B981` | `#34D399` | Listening indicator |
| `--at-error-color` | `#EF4444` | `#F87171` | Error text, end button |
| `--at-error-hover` | `#DC2626` | `#EF4444` | End button hover |

#### Custom Theming

Override any `--at-*` property via CSS — no special `theme` value needed:

```css
/* Full custom theme */
ariontalk-widget {
  --at-primary-color: #7C3AED;
  --at-primary-text: #FFFFFF;
  --at-bg-color: #1A1A2E;
  --at-text-color: #E0E0E0;
}

/* Partial override — change just the accent, keep the rest from light/dark */
ariontalk-widget {
  --at-primary-color: #7C3AED;
  --at-primary-text: #FFFFFF;
}
```

This works because external CSS custom properties take precedence over `:host()` rules inside Shadow DOM. You can combine overrides with `theme="dark"` to use dark as a base and tweak specific tokens.

### Events

Listen for widget lifecycle events:

```javascript
const widget = document.querySelector('ariontalk-widget');

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

This is a monorepo managed with [pnpm workspaces](https://pnpm.io/workspaces) and [changesets](https://github.com/changesets/changesets).

```
ariontalk/
├── packages/
│   ├── core/                              # @ariontalk/core
│   │   ├── src/
│   │   │   ├── index.ts                   # Public API exports
│   │   │   ├── engine/
│   │   │   │   └── voice-engine.ts        # Voice session orchestrator
│   │   │   ├── services/
│   │   │   │   ├── speech-recognition.ts  # WebSpeech Recognition wrapper
│   │   │   │   ├── speech-synthesis.ts    # WebSpeech Synthesis wrapper
│   │   │   │   ├── ai-session.ts          # Prompt API (Gemini Nano) wrapper
│   │   │   │   └── page-extractor.ts      # Page content extraction
│   │   │   ├── utils/
│   │   │   │   ├── browser-support.ts     # Feature detection
│   │   │   │   └── timer.ts              # Session timer
│   │   │   └── types.ts                   # TypeScript types
│   │   ├── package.json
│   │   └── tsdown.config.ts
│   └── widget/                            # @ariontalk/widget
│       ├── src/
│       │   ├── index.ts                   # Main entry point, registers custom element
│       │   ├── components/
│       │   │   ├── widget-root.ts         # Root component: FAB + session panel
│       │   │   ├── widget-fab.ts          # Floating action button
│       │   │   ├── widget-session.ts      # Expanded session panel
│       │   │   └── widget-voice-settings.ts
│       │   ├── controllers/
│       │   │   └── voice-session.controller.ts
│       │   ├── styles/
│       │   │   └── shared-styles.ts       # Shared CSS
│       │   └── types.ts
│       ├── dev/
│       │   └── index.html                 # Development page
│       ├── package.json
│       └── vite.config.ts
├── package.json                           # Root workspace config
├── pnpm-workspace.yaml
└── tsconfig.base.json
```

## Development

```bash
# Install dependencies
pnpm install

# Start dev server (widget)
pnpm dev

# Build all packages
pnpm build

# Run tests
pnpm test
```

## Tech Stack

- **[Lit](https://lit.dev/)** — Web Components library (widget only)
- **TypeScript** — Type safety
- **Vite** — Build tool for widget (library mode)
- **[tsdown](https://github.com/nicepkg/tsdown)** — Build tool for core
- **[pnpm](https://pnpm.io/)** — Package manager & workspaces
- **[Changesets](https://github.com/changesets/changesets)** — Versioning & publishing
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
