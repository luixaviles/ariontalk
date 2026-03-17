# @ariontalk/widget

Drop-in voice AI widget for any website — powered by Gemini Live with interactive highlights.

## CDN (quickest)

```html
<ariontalk-widget lang="en" settings></ariontalk-widget>
<script type="module" src="https://cdn.jsdelivr.net/npm/@ariontalk/widget@latest/dist/ariontalk.js"></script>
```

## Install

```bash
npm install @ariontalk/widget
```

## Usage

```html
<ariontalk-widget
  lang="en"
  engine="gemini"
  token-server="https://your-server.com/api/token"
  settings
  interactive-highlights
></ariontalk-widget>

<script type="module">
  import '@ariontalk/widget';
</script>
```

### Attributes

| Attribute | Default | Description |
|-----------|---------|-------------|
| `lang` | `"en"` | Language code (`auto`, `en`, `es`, `ja`, `fr`, …) |
| `engine` | `"local"` | `"local"` (browser) or `"gemini"` (cloud) |
| `token-server` | — | Token endpoint URL (required for Gemini) |
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
