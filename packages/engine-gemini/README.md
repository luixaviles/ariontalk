# @ariontalk/engine-gemini

Gemini Live engine add-on for ArionTalk — real-time voice streaming with function calling.

## Install

```bash
npm install @ariontalk/engine-gemini
```

`@ariontalk/core` is a peer dependency. `@google/genai` is no longer a dependency — the engine uses an inlined, lightweight WebSocket client for direct Gemini Live streaming.

## Usage

```js
import { GeminiEngine } from '@ariontalk/engine-gemini';

const engine = new GeminiEngine({
  tokenServerUrl: 'https://your-server.com/api/token',
  voice: 'Kore',
  interactiveHighlights: true,
});

await engine.startSession('en');
```

### Key exports

- **`GeminiEngine`** — cloud-based voice engine powered by Gemini Live API
- **Types** — `GeminiEngineOptions`, `EnginePart`, `ToolCallContext`, `FunctionResponse`

### Interactive highlights

With `interactiveHighlights: true`, the model calls a `highlight_and_scroll` function to scroll to and highlight the section it is discussing. Section anchors come from `PageIndexerService` and the highlighting from `HighlightManager`, both in `@ariontalk/core` and both shared with `@ariontalk/engine-local`.

### Supported voices

Kore, Puck, Charon, Aoede, Fenrir, Leda, Orus, Zephyr

## License

MIT — see [LICENSE](https://github.com/luixaviles/ariontalk/blob/main/LICENSE)

## Links

- [ariontalk.com](https://ariontalk.com)
- [GitHub](https://github.com/luixaviles/ariontalk)
