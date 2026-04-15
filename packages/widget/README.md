# @ariontalk/widget

Drop-in voice AI widget for any website — powered by Gemini Live with interactive highlights.

## CDN (quickest)

```html
<ariontalk-widget site-key="YOUR_SITE_KEY" interactive-highlights></ariontalk-widget>
<script type="module" src="https://cdn.jsdelivr.net/npm/@ariontalk/widget@latest/dist/ariontalk.js"></script>
```

Register your site at [ariontalk.com](https://ariontalk.com) to get a site key. When `site-key` is set, `engine="gemini"` resolves automatically and the widget points at the cloud service.

## Install

```bash
npm install @ariontalk/widget
```

## Usage

**Cloud service (recommended):**

```html
<ariontalk-widget site-key="YOUR_SITE_KEY" interactive-highlights></ariontalk-widget>

<script type="module">
  import '@ariontalk/widget';
</script>
```

**Self-hosted token server:**

```html
<ariontalk-widget
  engine="gemini"
  token-server="https://your-server.com/api/token"
  settings
  interactive-highlights
></ariontalk-widget>
```

### Attributes

| Attribute | Default | Description |
|-----------|---------|-------------|
| `site-key` | `""` | Site key for the ArionTalk cloud service. When set, `engine` resolves to `"gemini"` and `service-url` is defaulted automatically. |
| `service-url` | auto | Base URL for the ArionTalk cloud service. |
| `engine` | `"local"` | `"local"` (browser) or `"gemini"` (cloud) |
| `token-server` | `""` | Self-hosted token endpoint URL. Alternative to `site-key`. |
| `lang` | `"auto"` | Language code. `"auto"` reads `<html lang>`; otherwise pass `en`, `es`, `ja`, `fr`, … |
| `label` | `"Voice Chat"` | FAB label text. |
| `variant` | `"default"` | FAB size: `"default"` or `"compact"`. |
| `icon` | `"mic"` | FAB icon: `"mic"` or `"wave"`. |
| `position` | `"bottom-right"` | `"bottom-right"` or `"bottom-left"` |
| `theme` | `"light"` | `"light"` or `"dark"` |
| `settings` | `false` | Show settings panel |
| `interactive-highlights` | `false` | Scroll-and-highlight during speech (Gemini) |
| `log-level` | `"disabled"` | `"disabled"` \| `"error"` \| `"warning"` \| `"info"` \| `"debug"` |

### Barge-in plugins

```js
import '@ariontalk/widget';
import { SileroVadDetector } from '@ariontalk/plugin-silero-vad';

const widget = document.querySelector('ariontalk-widget');
widget.bargeInPlugins = [
  { id: 'silero-vad', label: 'Smart VAD', create: () => new SileroVadDetector() },
];
```

### Events

- `at-session-start` — fired when a voice session begins
- `at-session-end` — fired when a voice session ends (includes `detail.duration`)

## License

MIT — see [LICENSE](https://github.com/luixaviles/ariontalk/blob/main/LICENSE)

## Links

- [ariontalk.com](https://ariontalk.com)
- [GitHub](https://github.com/luixaviles/ariontalk)
