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
| `label` | `"Ask about this page"` | FAB label text. |
| `variant` | `"default"` | FAB size: `"default"` or `"compact"`. |
| `icon` | `"mic"` | FAB icon: `"mic"` or `"wave"`. |
| `position` | `"bottom-right"` | `"bottom-right"` or `"bottom-left"` |
| `theme` | `"light"` | `"light"` or `"dark"` |
| `settings` | `false` | Show settings panel |
| `interactive-highlights` | `false` | Scroll-and-highlight during speech. Works on both engines. |
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

- `at-session-start` - fired when a voice session begins
- `at-session-end` - fired when a voice session ends (includes `detail.duration`)

### Primitives

For custom composition, import UI primitives from `@ariontalk/widget/primitives`, which defines all `<vcw-*>` custom elements (`<vcw-fab>`, `<vcw-session>`, `<vcw-minimized>`, and `<vcw-voice-settings>`) without loading the assembled widget or engine. `WidgetVoiceSettings` is exported as a value from `@ariontalk/widget/primitives` and only as a type from `@ariontalk/widget`.

### Theme tokens

Set CSS custom properties on `ariontalk-widget` to customize colors and motion:

| Property | Light Default | Dark Default | Description |
|----------|---------------|--------------|-------------|
| `--at-primary-color` | `#111827` | `#FAFAFA` | Brand accent color |
| `--at-primary-text` | `#FFFFFF` | `#18181B` | Text on `--at-primary-color` |
| `--at-primary-ui` | `var(--at-primary-color)` | `var(--at-primary-color)` | Button fill for FAB, primary actions, active segments, and slider fill |
| `--at-on-primary-ui` | `var(--at-primary-text)` | `var(--at-primary-text)` | Text and icon color on `--at-primary-ui` |
| `--at-text-color` | `#1F2937` | `#FAFAFA` | Primary text |
| `--at-text-secondary` | `#6B7280` | `#A1A1AA` | Medium emphasis text |
| `--at-text-muted` | `#9CA3AF` | `#71717A` | Low emphasis text |
| `--at-bg-color` | `#FFFFFF` | `#18181B` | Panel background |
| `--at-surface-color` | `#F3F4F6` | `#27272A` | Button and card surface background |
| `--at-surface-hover` | `#E5E7EB` | `#3F3F46` | Surface hover background |
| `--at-border-color` | `#D1D5DB` | `#3F3F46` | Input borders and progress tracks |
| `--at-divider-color` | `rgba(127, 127, 127, 0.14)` | `rgba(255, 255, 255, 0.07)` | Header divider line |
| `--at-border-radius` | `16px` | `16px` | Panel border radius |
| `--at-font-family` | `system-ui, sans-serif` | `system-ui, sans-serif` | Font stack |
| `--at-shadow-color` | `rgba(0, 0, 0, 0.12)` | `rgba(0, 0, 0, 0.4)` | Box shadow |
| `--at-shadow-hover` | `rgba(0, 0, 0, 0.18)` | `rgba(0, 0, 0, 0.5)` | Hover shadow |
| `--at-focus-ring` | `rgba(17, 24, 39, 0.2)` | `rgba(250, 250, 250, 0.25)` | Input focus ring |
| `--at-success-color` | `#10B981` | `#34D399` | Success accent |
| `--at-error-color` | `#DC2626` | `#F87171` | Error accent |
| `--at-error-hover` | `#B91C1C` | `#EF4444` | Error hover accent |
| `--at-state-listening` | `var(--at-primary-color)` | `var(--at-primary-color)` | Listening indicator dot |
| `--at-state-voice` | `#DB7609` | `#F89B29` | Voice-detected indicator accent |
| `--at-state-thinking` | `#FF0F7B` | `#FF0F7B` | Thinking indicator dots |
| `--at-state-speaking` | `#FF0F7B` | `#FF0F7B` | Speaking waveform bars |
| `--at-state-muted` | `#6B7280` | `#A1A1AA` | Muted indicator, active mute button, and badge |
| `--at-state-error` | `#DC2626` | `#F87171` | Error icon, badge, and End button icon |
| `--at-caption-label` | `#4B5563` | `#A1A1AA` | "You" label in the user transcript pill |
| `--at-voice-deep` | `#DB7609` | `#E8850F` | Visitor-speaking wave inner radial stop |
| `--at-voice-mid` | `#F89B29` | `#F89B29` | Visitor-speaking wave outer radial stop |
| `--at-voice-light` | `#FFC46B` | `#FFD08A` | Visitor-speaking wave highlight |
| `--at-voice-rim-a` | `#FF0F7B` | `#FF0F7B` | Visitor-speaking wave rim start |
| `--at-voice-rim-b` | `#FFD166` | `#FFD166` | Visitor-speaking wave rim end |
| `--at-dur-fast` | `120ms` | `120ms` | Fast transition duration |
| `--at-dur-base` | `200ms` | `200ms` | Standard transition duration |
| `--at-dur-slow` | `320ms` | `320ms` | Entrance transition duration |
| `--at-ease-standard` | `cubic-bezier(0.2, 0, 0, 1)` | `cubic-bezier(0.2, 0, 0, 1)` | Standard easing curve |
| `--at-ease-enter` | `cubic-bezier(0, 0, 0, 1)` | `cubic-bezier(0, 0, 0, 1)` | Entrance easing curve |
| `--at-ease-exit` | `cubic-bezier(0.3, 0, 1, 1)` | `cubic-bezier(0.3, 0, 1, 1)` | Exit easing curve |

## License

MIT — see [LICENSE](https://github.com/luixaviles/ariontalk/blob/main/LICENSE)

## Links

- [ariontalk.com](https://ariontalk.com)
- [GitHub](https://github.com/luixaviles/ariontalk)
