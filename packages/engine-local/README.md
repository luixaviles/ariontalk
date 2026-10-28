# @ariontalk/engine-local

On-device engine for ArionTalk: Chrome Prompt API (Gemini Nano) with Web Speech.

## Install

Note: This package is not on npm yet; build from source until the next release.

```bash
npm install @ariontalk/engine-local
```

`@ariontalk/core` is a peer dependency.

## Usage

```js
import { VoiceEngine } from '@ariontalk/engine-local';

const engine = new VoiceEngine({
  interactiveHighlights: true,
});

await engine.startSession('en');
```

This is the engine `@ariontalk/widget` uses by default, when `engine="local"`.

### Options

| Option | Default | Description |
|--------|---------|-------------|
| `interactiveHighlights` | `false` | Scroll to and highlight the section being discussed |
| `imageContext` | `true` | Share page images with the model when supported (requires `interactiveHighlights`) |
| `bargeInDetector` | `null` | A `BargeInDetector` from `@ariontalk/core` or a plugin |

### Key exports

- **`VoiceEngine`** - on-device voice engine (Chrome Prompt API + Web Speech)
- **`AISessionService`** - Chrome Prompt API wrapper
- **`SpeechRecognitionService`** - Web Speech recognition wrapper
- **`SpeechSynthesisService`** - Web Speech synthesis wrapper

### Interactive highlights

The Chrome Prompt API has no function calling, so the model signals highlights by writing inline action tags such as `@@sec-2@@` into its response. The engine strips those tags before speech and fires the highlight when the matching sentence starts playing, so highlights track the voice instead of racing ahead of it.

Section anchors come from `PageIndexerService` and the highlighting itself from `HighlightManager`, both in `@ariontalk/core` and both shared with the cloud engine.

### Image context

With `interactiveHighlights` on and a Chrome build whose Prompt API accepts image input, the engine shares the page's images with the model when the session starts, so you can ask about any picture on the page and the model can highlight it with `@@img-N@@`. Set `imageContext: false` to turn this off.

Images from another origin must be readable by the page: serve them with CORS headers and add `crossorigin="anonymous"` to the `<img>`. Images that can't be read, or haven't loaded yet when the session starts, are known to the model only by their alt text.

## Requirements

Chrome 139+ with the Prompt API available. When the model is unavailable the session still runs as plain voice, with highlights off.

## License

MIT - see [LICENSE](https://github.com/luixaviles/ariontalk/blob/main/LICENSE)

## Links

- [ariontalk.com](https://ariontalk.com)
- [GitHub](https://github.com/luixaviles/ariontalk)
