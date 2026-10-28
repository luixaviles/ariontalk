# @ariontalk/plugin-silero-vad

## 0.4.0

### Patch Changes

- 48133e2: Keep the microphone stream open between turns, so the browser's echo cancellation stays settled and the assistant's own voice is less likely to trigger an interruption. `init()` now opens the microphone and loads the audio worklet up front, so the first turn starts listening right away, and `destroy()` releases the microphone.
- Updated dependencies [ab2182f]
- Updated dependencies [ab2182f]
- Updated dependencies [cf97dd0]
  - @ariontalk/core@0.4.0

## 0.3.0

### Minor Changes

- Version aligned with the rest of the `@ariontalk` package set (coordinated 0.3.0 release).

### Patch Changes

- Updated dependencies
  - @ariontalk/core@0.3.0

## 0.2.0

### Minor Changes

- - Version aligned with the rest of the `@ariontalk` package set (coordinated 0.2.0 release). No functional changes.

### Patch Changes

- Updated dependencies
  - @ariontalk/core@0.2.0

## 0.1.1

### Patch Changes

- Updated dependencies
  - @ariontalk/core@0.1.1
