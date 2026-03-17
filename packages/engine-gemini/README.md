# @ariontalk/engine-gemini

Gemini Live engine add-on for ArionTalk — real-time voice streaming with function calling.

## Install

```bash
npm install @ariontalk/engine-gemini
```

`@ariontalk/core` is a peer dependency.

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
- **`HighlightManager`** — manages interactive scroll-and-highlight during speech

### Supported voices

Kore, Puck, Charon, Aoede, Fenrir, Leda, Orus, Zephyr

## License

MIT — see [LICENSE](https://github.com/luixaviles/ariontalk/blob/main/LICENSE)

## Links

- [ariontalk.com](https://ariontalk.com)
- [GitHub](https://github.com/luixaviles/ariontalk)
