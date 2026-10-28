# @ariontalk/engine-cloud-ws

The provider-neutral WebSocket client and Gemini Live frame codec used by `@ariontalk/engine-gemini`.

It's bundled into `@ariontalk/engine-gemini` at build time, so you don't install it separately. It isn't published to npm.

## Main exports

- `WsClient`, `WsHandshakeError`, `WsClientOptions`
- `LIVE_API_VERSION`, `buildLiveUrl`, `buildSetupFrame`, `isSetupComplete`
- `encodeAudioChunk`, `encodeText`, `encodeClientContent`, `encodeToolResponse`
- `FunctionResponse`, `ToolCall`, `EnginePart`, `LiveServerMessage`
