# @ariontalk/plugin-silero-vad

Silero VAD barge-in plugin for ArionTalk — AI-powered voice activity detection.

## Install

```bash
npm install @ariontalk/plugin-silero-vad
```

`@ariontalk/core` is a peer dependency.

## Usage

```js
import { SileroVadDetector } from '@ariontalk/plugin-silero-vad';

// Use with the widget
widget.bargeInPlugins = [
  {
    id: 'silero-vad',
    label: 'Smart VAD',
    create: () => new SileroVadDetector({ onnxWASMBasePath: '/' }),
  },
];
```

### Options

| Option | Default | Description |
|--------|---------|-------------|
| `positiveSpeechThreshold` | `0.7` | Detection sensitivity (0–1) |
| `negativeSpeechThreshold` | `0.55` | Silence threshold (0–1) |
| `minSpeechMs` | `500` | Minimum speech duration in ms |
| `redemptionMs` | `1400` | Grace period for pauses in ms |
| `baseAssetPath` | `"./"` | Path to VAD model assets |
| `onnxWASMBasePath` | `"./"` | Path to ONNX WASM runtime files |

## How it works

Silero VAD uses a lightweight ONNX neural network to detect speech with higher accuracy and fewer false positives than energy-based detection. Dependencies are lazy-loaded — the model is only fetched when a session starts.

## License

MIT — see [LICENSE](https://github.com/luixaviles/ariontalk/blob/main/LICENSE)

## Links

- [ariontalk.com](https://ariontalk.com)
- [GitHub](https://github.com/luixaviles/ariontalk)
