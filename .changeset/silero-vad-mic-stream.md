---
"@ariontalk/plugin-silero-vad": patch
---

Keep the microphone stream open between turns, so the browser's echo cancellation stays settled and the assistant's own voice is less likely to trigger an interruption. `init()` now opens the microphone and loads the audio worklet up front, so the first turn starts listening right away, and `destroy()` releases the microphone.
