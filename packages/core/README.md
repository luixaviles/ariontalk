# @ariontalk/core

Headless voice AI engine with page understanding — services, types, and session logic.

## Install

```bash
npm install @ariontalk/core
```

## Usage

```js
import { VoiceEngine, isVoiceChatSupported } from '@ariontalk/core';

const engine = new VoiceEngine();

if (isVoiceChatSupported(engine)) {
  await engine.startSession('en');
}
```

### Key exports

- **`VoiceEngine`** — local browser-based voice engine (Web Speech API)
- **`isVoiceChatSupported(engine)`** — check browser capabilities before starting
- **`EnergyBargeInDetector`** — energy-based barge-in detection plugin
- **`createLogger` / `setLogLevel`** — logging utilities
- **Types** — `SupportedLang`, `VoiceEngineState`, `VoiceSettings`, `BargeInDetector`, and more

## License

MIT — see [LICENSE](https://github.com/luixaviles/ariontalk/blob/main/LICENSE)

## Links

- [ariontalk.com](https://ariontalk.com)
- [GitHub](https://github.com/luixaviles/ariontalk)
