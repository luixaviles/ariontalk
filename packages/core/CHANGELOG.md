# @ariontalk/core

## 0.2.0

### Minor Changes

- - `SessionTimer.format(seconds, padMinutes?)` gains an optional second argument. When `padMinutes` is omitted, minutes are no longer zero-padded: `format(90)` now returns `"1:30"` (previously `"01:30"`). Pass `padMinutes: true` to restore the old formatting.
  - Version aligned with the rest of the `@ariontalk` package set (coordinated 0.2.0 release).

## 0.1.1

### Patch Changes

- Fix page indexer failing to extract content from wrapped headings
