# @ariontalk/widget

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
