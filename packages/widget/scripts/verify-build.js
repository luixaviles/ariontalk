/**
 * Post-build verification script for @ariontalk/widget.
 *
 * Runs automatically after every `pnpm build` via the `postbuild` lifecycle hook.
 * Validates that the dist output meets the dual-build contract:
 *
 *   - CDN bundle (ariontalk.js): self-contained, no bare specifiers, no code-splitting
 *   - ESM bundle (ariontalk.esm.js): lit externalized, consumed by bundlers
 *   - Type declarations (index.d.ts): present for TypeScript consumers
 *
 * This script complements publint (package.json entry point validation) and
 * attw (TypeScript module resolution validation), which also run in postbuild.
 *
 */
import { readFileSync, existsSync, statSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dist = resolve(__dirname, '../dist');

let failures = 0;

function assert(condition, message) {
  if (!condition) {
    console.error(`  \u2717 ${message}`);
    failures++;
  } else {
    console.log(`  \u2713 ${message}`);
  }
}

console.log('\nVerifying build output...\n');

// --- CDN bundle checks ---
const cdnFile = resolve(dist, 'ariontalk.js');
const cdnExists = existsSync(cdnFile);
assert(cdnExists, 'CDN bundle exists (dist/ariontalk.js)');

if (cdnExists) {
  const cdn = readFileSync(cdnFile, 'utf-8');
  const cdnSize = statSync(cdnFile).size;

  assert(!cdn.includes('from "lit"'), 'CDN bundle has no bare "lit" imports');
  assert(!cdn.includes("from 'lit'"), "CDN bundle has no bare 'lit' imports");
  assert(!cdn.includes('from "lit/'), 'CDN bundle has no bare "lit/" imports');
  assert(!cdn.includes('from "./') && !cdn.includes("from './"), 'CDN bundle has no relative chunk imports');
  assert(cdnSize > 100_000, `CDN bundle is non-trivial (${(cdnSize / 1024).toFixed(0)} KB)`);
}

// --- ESM bundle checks ---
const esmFile = resolve(dist, 'ariontalk.esm.js');
const esmExists = existsSync(esmFile);
assert(esmExists, 'ESM entry exists (dist/ariontalk.esm.js)');

if (esmExists) {
  const esm = readFileSync(esmFile, 'utf-8');
  assert(esm.includes('from "./') || esm.includes('from "lit'), 'ESM entry imports from chunks or lit');
}

// --- Type declarations ---
assert(existsSync(resolve(dist, 'index.d.ts')), 'Type declarations exist (dist/index.d.ts)');

// --- Result ---
console.log('');
if (failures > 0) {
  console.error(`\u2717 ${failures} check(s) failed\n`);
  process.exit(1);
} else {
  console.log('\u2713 All checks passed\n');
}
