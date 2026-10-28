---
"@ariontalk/core": minor
"@ariontalk/engine-gemini": minor
"@ariontalk/widget": minor
"@ariontalk/engine-local": minor
---

Move the on-device engine out of `@ariontalk/core` into the new `@ariontalk/engine-local` package. Core now holds only the shared services, types and page understanding used by both engines.

- **Breaking (`@ariontalk/core`)**: `VoiceEngine`, `VoiceEngineOptions`, `AISessionService`, `SpeechRecognitionService` and `SpeechSynthesisService` are no longer exported from `@ariontalk/core`. Import them from `@ariontalk/engine-local` instead:

  ```ts
  import { VoiceEngine } from '@ariontalk/engine-local';
  ```

- **Breaking (`@ariontalk/engine-gemini`)**: `HighlightManager` is no longer exported from `@ariontalk/engine-gemini`. Import it from `@ariontalk/core`, where both engines now share it.
