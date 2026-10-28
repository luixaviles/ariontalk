# @ariontalk/plugin-kokoro-tts

## 0.4.0

### Minor Changes

- cf97dd0: Refresh the widget design, state visuals, accessibility, and theming tokens.

  - **Default button label**: The voice button now defaults to `"Ask about this page"` (Spanish: `"Pregunta sobre esta página"`). Pass the `label` attribute to override it.
  - **New states and panels**: Added a microphone permission prompt before the browser dialog on local sessions, a microphone-blocked panel with instructions to re-enable access, an expandable `"Offline · Private"` header seal when both speech recognition and voice synthesis run on the device, and an error panel with cause-specific messages and Retry / Close actions.
  - **Voice-reactive indicators and reduced motion**: Added visitor-speaking radial waves, a `"You"` transcript pill, three thinking dots, five speaking bars driven by audio output level when available, single-signal minimized states, a three-spark hover effect on the voice button, and full `prefers-reduced-motion: reduce` support.
  - **Settings panel**: Replaced hover tooltips with always-visible help notes, grouped Speed / Pitch / Volume on a single row, added radio group keyboard navigation for Speech and Interruption, disabled unsupported speech plugins with an explanation when WebGPU is unavailable, and updated the attribution footer with the new horizontal logo lockup.
  - **Theme tokens**: Added `--at-primary-ui`, `--at-on-primary-ui`, `--at-state-listening`, `--at-state-voice`, `--at-state-thinking`, `--at-state-speaking`, `--at-state-muted`, `--at-state-error`, `--at-caption-label`, `--at-voice-deep`, `--at-voice-mid`, `--at-voice-light`, `--at-voice-rim-a`, `--at-voice-rim-b`, `--at-dur-fast`, `--at-dur-base`, `--at-dur-slow`, `--at-ease-standard`, `--at-ease-enter`, and `--at-ease-exit`. Updated the light theme defaults for `--at-error-color` (from `#EF4444` to `#DC2626`), `--at-error-hover` (from `#DC2626` to `#B91C1C`), and `--at-divider-color` (from `rgba(0, 0, 0, 0.05)` to `rgba(127, 127, 127, 0.14)`).
  - **Breaking (`@ariontalk/widget`)**: `WidgetVoiceSettings` is no longer exported as a value from `@ariontalk/widget`; import it from `@ariontalk/widget/primitives`, which also defines all `vcw-*` elements.
  - **Core, local engine, and Kokoro TTS**: Added `EngineErrorCode`, `userSpeaking`, `onDevice`, and `getAudioLevels()` on `VoiceEngineState` / `VoiceEngineInterface`, `getOutputLevel()` on `SpeechSynthesizer` and `KokoroSynthesizer`, `InputLevelMeter` in `@ariontalk/engine-local`, and `isSupported()` / `unsupportedReason` on `TtsPlugin` and `kokoroTtsPlugin()`.

### Patch Changes

- Updated dependencies [ab2182f]
- Updated dependencies [ab2182f]
- Updated dependencies [cf97dd0]
  - @ariontalk/core@0.4.0
