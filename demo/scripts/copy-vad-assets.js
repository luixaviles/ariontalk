import { cpSync, mkdirSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Resolve @ricky0123/vad-web from the plugin package's context
const pluginDir = dirname(fileURLToPath(import.meta.resolve('@ariontalk/plugin-silero-vad')));
const pluginRequire = createRequire(join(pluginDir, 'index.js'));
const vadDistDir = dirname(pluginRequire.resolve('@ricky0123/vad-web'));

// Resolve onnxruntime-web from vad-web's context (sibling in pnpm virtual store)
const vadRequire = createRequire(join(vadDistDir, 'index.js'));
const ortDistDir = dirname(vadRequire.resolve('onnxruntime-web'));

const publicDir = resolve(__dirname, '../public');
const ortWasmDir = resolve(__dirname, '../.ort-wasm');
mkdirSync(publicDir, { recursive: true });
mkdirSync(ortWasmDir, { recursive: true });

// Files loaded via fetch() go to public/
const publicAssets = [
  join(vadDistDir, 'vad.worklet.bundle.min.js'),
  join(vadDistDir, 'silero_vad_legacy.onnx'),
  join(vadDistDir, 'silero_vad_v5.onnx'),
  join(ortDistDir, 'ort-wasm-simd-threaded.wasm'),
];

// Files loaded via dynamic import() go to .ort-wasm/ (Vite blocks import from public/)
const moduleAssets = [
  join(ortDistDir, 'ort-wasm-simd-threaded.mjs'),
];

for (const src of publicAssets) {
  const filename = src.split('/').pop();
  cpSync(src, join(publicDir, filename));
  console.log(`Copied ${filename} → public/`);
}

for (const src of moduleAssets) {
  const filename = src.split('/').pop();
  cpSync(src, join(ortWasmDir, filename));
  console.log(`Copied ${filename} → .ort-wasm/`);
}
