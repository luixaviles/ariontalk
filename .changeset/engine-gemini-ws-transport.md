---
"@ariontalk/engine-gemini": patch
---

Drop the `@google/genai` dependency. The engine now connects to the Gemini Live API through a small WebSocket client bundled into its build, so installing `@ariontalk/engine-gemini` no longer pulls in the Google GenAI SDK.
