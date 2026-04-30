# @ariontalk/engine-gemini

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
