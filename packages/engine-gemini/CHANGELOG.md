# @ariontalk/engine-gemini

## 0.4.0

### Minor Changes

- ab2182f: Move the on-device engine out of `@ariontalk/core` into the new `@ariontalk/engine-local` package. Core now holds only the shared services, types and page understanding used by both engines.

  - **Breaking (`@ariontalk/core`)**: `VoiceEngine`, `VoiceEngineOptions`, `AISessionService`, `SpeechRecognitionService` and `SpeechSynthesisService` are no longer exported from `@ariontalk/core`. Import them from `@ariontalk/engine-local` instead:

    ```ts
    import { VoiceEngine } from "@ariontalk/engine-local";
    ```

  - **Breaking (`@ariontalk/engine-gemini`)**: `HighlightManager` is no longer exported from `@ariontalk/engine-gemini`. Import it from `@ariontalk/core`, where both engines now share it.

### Patch Changes

- 48133e2: Drop the `@google/genai` dependency. The engine now connects to the Gemini Live API through a small WebSocket client bundled into its build, so installing `@ariontalk/engine-gemini` no longer pulls in the Google GenAI SDK.
- Updated dependencies [ab2182f]
- Updated dependencies [ab2182f]
- Updated dependencies [cf97dd0]
  - @ariontalk/core@0.4.0

## 0.3.1

### Patch Changes

- Upgrade `@google/genai` dependency to `^2.15.0`.

## 0.3.0

### Minor Changes

- Migrate to `gemini-3.1-flash-live-preview`. Synchronous tool calls (drop `NON_BLOCKING`/`SILENT`), `sendRealtimeInput` greeting trigger, conditional `sessionResumption`, completion via `generationComplete` or `turnComplete`. Bumps `@google/genai` to `^1.50.1`.

### Patch Changes

- Updated dependencies
  - @ariontalk/core@0.3.0

## 0.2.0

### Minor Changes

- - Send the scripted session greeting via system instruction.
  - Schedule tool responses with `SILENT`.
  - Deliver page content as context rather than a user-turn instruction.
  - Token manager: tighten session and lifecycle handling.

### Patch Changes

- Updated dependencies
  - @ariontalk/core@0.2.0

## 0.1.1

### Patch Changes

- Updated dependencies
  - @ariontalk/core@0.1.1
