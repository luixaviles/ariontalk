# @ariontalk/core

Shared services, types, and page understanding for ArionTalk. This package contains no engine implementation.

Pick an engine to go with it:

- [`@ariontalk/engine-local`](https://www.npmjs.com/package/@ariontalk/engine-local) for on-device voice via the Chrome Prompt API
- [`@ariontalk/engine-gemini`](https://www.npmjs.com/package/@ariontalk/engine-gemini) for cloud voice via the Gemini Live API

Both implement the same `VoiceEngineInterface` defined here, and both use the page indexing and highlight services below.

## Install

```bash
npm install @ariontalk/core
```

## Usage

```js
import { PageIndexerService, HighlightManager, isVoiceChatSupported } from '@ariontalk/core';
import { VoiceEngine } from '@ariontalk/engine-local';

// Annotate the page so an engine can reference sections by ID
const indexer = new PageIndexerService();
const { annotatedText, elementMap } = indexer.buildIndex();

// Scroll to and highlight a section
const highlights = new HighlightManager();
highlights.init();
highlights.highlightElements(elementMap.get('sec-1') ?? []);

const engine = new VoiceEngine({ interactiveHighlights: true });
if (isVoiceChatSupported(engine)) {
  await engine.startSession('en');
}
```

### Key exports

- **`PageIndexerService`** — builds an annotated page index with stable `sec-N` / `img-N` anchors
- **`PageExtractorService`** — extracts page text and images for AI context
- **`HighlightManager`** — scroll-and-highlight on the host page, shared by both engines
- **`isVoiceChatSupported(engine)`** — check browser capabilities before starting
- **`EnergyBargeInDetector`** — energy-based barge-in detection plugin
- **`createLogger` / `setLogLevel`** — logging utilities
- **Types** — `VoiceEngineInterface`, `EngineCapabilities`, `SupportedLang`, `VoiceEngineState`, `VoiceSettings`, `BargeInDetector`, and more

## License

MIT — see [LICENSE](https://github.com/luixaviles/ariontalk/blob/main/LICENSE)

## Links

- [ariontalk.com](https://ariontalk.com)
- [GitHub](https://github.com/luixaviles/ariontalk)
