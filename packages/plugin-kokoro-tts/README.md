# @ariontalk/plugin-kokoro-tts

Kokoro TTS plugin for [ArionTalk](https://ariontalk.com): opt-in, high-quality on-device neural voice synthesis using an 82M parameter model via `kokoro-js`.

## Installation

Note: This package is not on npm yet; build from source until the next release.

```bash
npm install @ariontalk/plugin-kokoro-tts kokoro-js
```

## Usage

```js
import { kokoroTtsPlugin } from '@ariontalk/plugin-kokoro-tts';

document.querySelector('ariontalk-widget').ttsPlugins = [
  kokoroTtsPlugin()
];
```
