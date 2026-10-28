---
"@ariontalk/widget": minor
---

Stop bundling the Gemini engine into the npm build.

`@ariontalk/engine-gemini` is now an optional peer dependency and is left as a
bare import for bundlers to resolve, matching how `lit` is already handled. The
npm payload drops by roughly 111 KB gzipped for every consumer, including those
using only the local engine, and installing the engine package alongside the
widget no longer produces two copies of it.

**Action required** if you use `engine="gemini"` or `site-key`: add
`@ariontalk/engine-gemini` to your dependencies. The local engine is unaffected,
and the CDN build still inlines everything, so `<script src=".../ariontalk.js">`
users need no change.
