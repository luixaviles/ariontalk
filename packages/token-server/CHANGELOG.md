# @ariontalk/token-server

## 0.2.0

### Minor Changes

- - Version aligned with the rest of the `@ariontalk` package set. Not published to npm (`private: true`); this bump is visible only to repo contributors.
  - App and entry-point split: `src/app.ts` contains the Hono app for testability; `src/index.ts` is the server entry point.
  - Voice assistant system prompt moved to `src/prompts/voice-assistant.md`.
