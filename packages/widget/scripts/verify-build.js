/**
 * Post-build verification script for @ariontalk/widget.
 *
 * Runs automatically after every `pnpm build` via the `postbuild` lifecycle hook.
 * Validates that the dist output meets the dual-build contract:
 *
 *   - CDN bundle (ariontalk.js + chunks): multi-chunk ES modules, budget-enforced
 *   - ESM bundle (ariontalk.esm.js): lit & engine externalized, consumed by bundlers
 *   - Type declarations (index.d.ts): present for TypeScript consumers
 */
import { readFileSync, existsSync, statSync, readdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { gzipSync } from 'zlib';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dist = resolve(__dirname, '../dist');

let failures = 0;

function assert(condition, message) {
  if (!condition) {
    console.error(`  ✗ ${message}`);
    failures++;
  } else {
    console.log(`  ✓ ${message}`);
  }
}

function getGzipSize(filePath) {
  return existsSync(filePath) ? gzipSync(readFileSync(filePath)).length : 0;
}

function getRawSize(filePath) {
  return existsSync(filePath) ? statSync(filePath).size : 0;
}

function formatKb(bytes) {
  return (bytes / 1024).toFixed(2) + ' KB';
}

function staticReachableFrom(entry) {
  const seen = new Set();
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.shift();
    if (seen.has(file) || !existsSync(file)) continue;
    seen.add(file);
    const src = readFileSync(file, 'utf-8');
    for (const m of src.matchAll(/from\s*["'](\.\/[^"']+)["']/g)) {
      queue.push(resolve(dist, m[1]));
    }
  }
  return seen;
}

console.log('\nVerifying build output...\n');

// --- CDN bundle checks ---
const cdnFile = resolve(dist, 'ariontalk.js');
const cdnExists = existsSync(cdnFile);
assert(cdnExists, 'CDN bundle exists (dist/ariontalk.js)');

if (cdnExists) {
  const cdn = readFileSync(cdnFile, 'utf-8');

  assert(!cdn.includes('from "lit"'), 'CDN entry has no bare "lit" imports');
  assert(!cdn.includes("from 'lit'"), "CDN entry has no bare 'lit' imports");
  assert(!cdn.includes('from "lit/'), 'CDN entry has no bare "lit/" imports');

  // Relative import resolution: every relative import in ariontalk.js must resolve to a dist file
  const relativeImports = [
    ...cdn.matchAll(/(?:from|import\()\s*["'](\.\/[^"']+)["']/g),
  ].map((m) => m[1]);

  let allRelativesExist = true;
  for (const rel of relativeImports) {
    const target = resolve(dist, rel);
    if (!existsSync(target)) {
      allRelativesExist = false;
      assert(false, `Relative import "${rel}" does not exist in dist`);
    }
  }
  if (allRelativesExist) {
    assert(true, 'Every relative import from ariontalk.js resolves in dist');
  }

  // Reachable CDN files must not have bare @ariontalk/ imports
  const cdnChunkFiles = readdirSync(dist).filter(
    (f) => f === 'ariontalk.js' || (f.startsWith('chunk-') && f.endsWith('.js')),
  );
  let noBareAriontalk = true;
  for (const f of cdnChunkFiles) {
    const src = readFileSync(resolve(dist, f), 'utf-8');
    if (src.match(/from\s*["']@ariontalk\//) || src.match(/import\(\s*["']@ariontalk\//)) {
      noBareAriontalk = false;
      assert(false, `CDN chunk ${f} contains bare @ariontalk/ import`);
    }
  }
  if (noBareAriontalk) {
    assert(true, 'No bare @ariontalk/ specifiers survive in reachable CDN files');
  }

  // Entry chunk static reach cannot contain Gemini endpoints/tokens
  const staticReach = staticReachableFrom(cdnFile);
  const staticSources = [...staticReach].map((f) => readFileSync(f, 'utf-8'));

  assert(
    !staticSources.some((s) => s.includes('@google/genai')),
    'CDN entry chunk cannot reach @google/genai',
  );
  assert(
    !staticSources.some((s) => s.includes('generativelanguage.googleapis.com')),
    'CDN entry chunk cannot reach generativelanguage.googleapis.com',
  );
  assert(
    !staticSources.some((s) => s.includes('Ephemeral token acquired')),
    'CDN entry chunk cannot reach "Ephemeral token acquired"',
  );
}

// Check no file anywhere in dist contains @google/genai
const allDistFiles = readdirSync(dist).filter(
  (f) => f.endsWith('.js') || f.endsWith('.mjs') || f.endsWith('.d.ts'),
);
const hasGoogleGenai = allDistFiles.some((f) =>
  readFileSync(resolve(dist, f), 'utf-8').includes('@google/genai'),
);
assert(!hasGoogleGenai, 'No file anywhere in dist contains @google/genai');

// --- ESM bundle checks ---
const esmFile = resolve(dist, 'ariontalk.esm.js');
const esmExists = existsSync(esmFile);
assert(esmExists, 'ESM entry exists (dist/ariontalk.esm.js)');

if (esmExists) {
  const esm = readFileSync(esmFile, 'utf-8');
  assert(
    esm.includes('from "./') || esm.includes('from "lit'),
    'ESM entry imports from chunks or lit',
  );
}

function reachableFrom(entryFile) {
  const seen = new Set();
  const queue = [entryFile];
  while (queue.length > 0) {
    const file = queue.shift();
    if (seen.has(file) || !existsSync(file)) continue;
    seen.add(file);
    const src = readFileSync(file, 'utf-8');
    for (const m of src.matchAll(/(?:from|import\()\s*["'](\.\/[^"']+)["']/g)) {
      queue.push(resolve(dist, m[1]));
    }
  }
  return seen;
}

// Engine is external for bundlers
const esmReach = esmExists ? reachableFrom(esmFile) : new Set();
const esmSources = [...esmReach].map((f) => readFileSync(f, 'utf-8'));
assert(
  esmSources.some((s) => s.includes('@ariontalk/engine-gemini')),
  'ESM build leaves the Gemini engine as a bare import (not inlined)',
);
assert(
  !esmSources.some((s) => s.includes('Ephemeral token acquired')),
  'ESM build does not inline the Gemini engine',
);

// Primitives entry stays free of the engine
const primitivesFile = resolve(dist, 'primitives.js');
const primitivesExists = existsSync(primitivesFile);
assert(primitivesExists, 'Primitives entry exists (dist/primitives.js)');

if (primitivesExists) {
  const reach = reachableFrom(primitivesFile);
  const sources = [...reach].map((f) => readFileSync(f, 'utf-8'));

  assert(
    !sources.some((s) => s.includes('@ariontalk/engine-gemini')),
    'Primitives entry cannot reach the Gemini engine',
  );
  assert(
    !sources.some((s) => s.includes('ariontalk-widget')),
    'Primitives entry cannot reach the widget root that loads an engine',
  );
}

// Type declarations
assert(existsSync(resolve(dist, 'index.d.ts')), 'Type declarations exist (dist/index.d.ts)');

// --- Size report (informational) ---
const entryGzip = getGzipSize(cdnFile);
const coreChunkFile = resolve(dist, 'chunk-core.js');
const geminiChunkFile = resolve(dist, 'chunk-engine-gemini.js');
const localChunkFile = resolve(dist, 'chunk-engine-local.js');

// Transitive footprint before user interaction: entry plus static imports.
const idleFiles = staticReachableFrom(cdnFile);
const idleGzip = [...idleFiles].reduce((acc, f) => acc + getGzipSize(f), 0);

const sessionGzip = (engineChunk) => {
  const files = new Set([...idleFiles, ...staticReachableFrom(engineChunk)]);
  return [...files].reduce((acc, f) => acc + getGzipSize(f), 0);
};

// The ESM entry can be a thin re-export shim, so measure what a bundler pulls with it.
const esmGzip = esmExists
  ? [...staticReachableFrom(esmFile)].reduce((acc, f) => acc + getGzipSize(f), 0)
  : 0;

const allCdnGzip = readdirSync(dist)
  .filter((f) => f === 'ariontalk.js' || (f.startsWith('chunk-') && f.endsWith('.js')))
  .reduce((acc, f) => acc + getGzipSize(resolve(dist, f)), 0);

const row = (label, gzip, rawFile) =>
  console.log(
    label.padEnd(32) +
    (rawFile ? formatKb(getRawSize(rawFile)) : '-').padStart(12) +
    formatKb(gzip).padStart(12),
  );

console.log('\nSize report (informational):');
console.log('--------------------------------------------------------');
console.log('Artifact'.padEnd(32) + 'Raw'.padStart(12) + 'Gzip'.padStart(12));
console.log('--------------------------------------------------------');
row('Idle load (transitive)', idleGzip, null);
row('  ariontalk.js', entryGzip, cdnFile);
row('  chunk-core.js', getGzipSize(coreChunkFile), coreChunkFile);
row('Gemini session (transitive)', sessionGzip(geminiChunkFile), null);
row('  chunk-engine-gemini.js', getGzipSize(geminiChunkFile), geminiChunkFile);
row('Local session (transitive)', sessionGzip(localChunkFile), null);
row('  chunk-engine-local.js', getGzipSize(localChunkFile), localChunkFile);
row('Entry plus all chunks', allCdnGzip, null);
row('ESM entry (transitive)', esmGzip, null);
console.log('--------------------------------------------------------\n');

if (failures > 0) {
  console.error(`✗ ${failures} check(s) failed\n`);
  process.exit(1);
} else {
  console.log('✓ All checks passed\n');
}
