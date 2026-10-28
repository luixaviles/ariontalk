# @ariontalk/widget

## 0.4.0

### Minor Changes

- ab2182f: Move the on-device engine out of `@ariontalk/core` into the new `@ariontalk/engine-local` package. Core now holds only the shared services, types and page understanding used by both engines.

  - **Breaking (`@ariontalk/core`)**: `VoiceEngine`, `VoiceEngineOptions`, `AISessionService`, `SpeechRecognitionService` and `SpeechSynthesisService` are no longer exported from `@ariontalk/core`. Import them from `@ariontalk/engine-local` instead:

    ```ts
    import { VoiceEngine } from "@ariontalk/engine-local";
    ```

  - **Breaking (`@ariontalk/engine-gemini`)**: `HighlightManager` is no longer exported from `@ariontalk/engine-gemini`. Import it from `@ariontalk/core`, where both engines now share it.

- ab2182f: Add interactive highlights to the on-device engine. With `interactive-highlights` set, the local engine now scrolls to and highlights the section or image it's talking about, using inline action tags in the model's reply. The attribute works the same on both engines.
- cf97dd0: Refresh the widget design, state visuals, accessibility, and theming tokens.

  - **Default button label**: The voice button now defaults to `"Ask about this page"` (Spanish: `"Pregunta sobre esta página"`). Pass the `label` attribute to override it.
  - **New states and panels**: Added a microphone permission prompt before the browser dialog on local sessions, a microphone-blocked panel with instructions to re-enable access, an expandable `"Offline · Private"` header seal when both speech recognition and voice synthesis run on the device, and an error panel with cause-specific messages and Retry / Close actions.
  - **Voice-reactive indicators and reduced motion**: Added visitor-speaking radial waves, a `"You"` transcript pill, three thinking dots, five speaking bars driven by audio output level when available, single-signal minimized states, a three-spark hover effect on the voice button, and full `prefers-reduced-motion: reduce` support.
  - **Settings panel**: Replaced hover tooltips with always-visible help notes, grouped Speed / Pitch / Volume on a single row, added radio group keyboard navigation for Speech and Interruption, disabled unsupported speech plugins with an explanation when WebGPU is unavailable, and updated the attribution footer with the new horizontal logo lockup.
  - **Theme tokens**: Added `--at-primary-ui`, `--at-on-primary-ui`, `--at-state-listening`, `--at-state-voice`, `--at-state-thinking`, `--at-state-speaking`, `--at-state-muted`, `--at-state-error`, `--at-caption-label`, `--at-voice-deep`, `--at-voice-mid`, `--at-voice-light`, `--at-voice-rim-a`, `--at-voice-rim-b`, `--at-dur-fast`, `--at-dur-base`, `--at-dur-slow`, `--at-ease-standard`, `--at-ease-enter`, and `--at-ease-exit`. Updated the light theme defaults for `--at-error-color` (from `#EF4444` to `#DC2626`), `--at-error-hover` (from `#DC2626` to `#B91C1C`), and `--at-divider-color` (from `rgba(0, 0, 0, 0.05)` to `rgba(127, 127, 127, 0.14)`).
  - **Breaking (`@ariontalk/widget`)**: `WidgetVoiceSettings` is no longer exported as a value from `@ariontalk/widget`; import it from `@ariontalk/widget/primitives`, which also defines all `vcw-*` elements.
  - **Core, local engine, and Kokoro TTS**: Added `EngineErrorCode`, `userSpeaking`, `onDevice`, and `getAudioLevels()` on `VoiceEngineState` / `VoiceEngineInterface`, `getOutputLevel()` on `SpeechSynthesizer` and `KokoroSynthesizer`, `InputLevelMeter` in `@ariontalk/engine-local`, and `isSupported()` / `unsupportedReason` on `TtsPlugin` and `kokoroTtsPlugin()`.

- 2fd4ef4: Stop bundling the Gemini engine into the npm build.

  `@ariontalk/engine-gemini` is now an optional peer dependency and is left as a
  bare import for bundlers to resolve, matching how `lit` is already handled. The
  npm payload drops by roughly 111 KB gzipped for every consumer, including those
  using only the local engine, and installing the engine package alongside the
  widget no longer produces two copies of it.

  **Action required** if you use `engine="gemini"` or `site-key`: add
  `@ariontalk/engine-gemini` to your dependencies. The local engine is unaffected,
  and the CDN build still inlines everything, so `<script src=".../ariontalk.js">`
  users need no change.

### Patch Changes

- Updated dependencies [48133e2]
- Updated dependencies [ab2182f]
- Updated dependencies [ab2182f]
- Updated dependencies [cf97dd0]
  - @ariontalk/engine-gemini@0.4.0
  - @ariontalk/core@0.4.0
  - @ariontalk/engine-local@0.4.0

## 0.3.0

### Minor Changes

- Version aligned with the rest of the `@ariontalk` package set (coordinated 0.3.0 release).

### Patch Changes

- Updated dependencies
  - @ariontalk/core@0.3.0

## 0.2.0

### Minor Changes

- - Add `site-key` and `service-url` attributes for use with the ArionTalk cloud service. When `site-key` is set, `engine` defaults to `"gemini"` and `service-url` is defaulted automatically.
  - Add FAB customization: `label` (default `"Voice Chat"`), `variant` (`"default"` or `"compact"`), `icon` (`"mic"` or `"wave"`).
  - Add minimize state with a dedicated `<vcw-minimized>` component. Status-aware icons indicate listening, speaking, or muted without expanding the panel.
  - Move user-facing error messages from client to server responses for consistent copy.
  - Remove the `shield` icon option from FAB (use `mic` or `wave`).
  - `token-server` attribute retained for back-compat but deprecated in docs; prefer `service-url` and `site-key`.

### Patch Changes

- Updated dependencies
  - @ariontalk/core@0.2.0

## 0.1.1

### Patch Changes

- Fix CDN build to produce a self-contained bundle for direct browser/CDN usage
- Updated dependencies
  - @ariontalk/core@0.1.1
