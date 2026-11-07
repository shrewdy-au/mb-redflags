import { defineConfig } from 'tsup';

// Adapted from the MOGL scraper tsup config. Background is an ES module service worker;
// the content script must be a classic script, so it is bundled as an IIFE.
const shared = {
  outDir: 'extension/dist',
  target: 'es2020',
  splitting: false,
  sourcemap: true,
  minify: false,
  dts: false,
  outExtension: () => ({ js: '.js' })
} as const;

export default defineConfig([
  { ...shared, entry: { background: 'extension/src/background.ts' }, format: 'esm', clean: false },
  { ...shared, entry: { content: 'extension/src/content/index.ts' }, format: 'iife', clean: false },
  // Map drawer page (iframed by the content script). MapLibre is bundled; its CSP worker is copied by copy-assets.
  { ...shared, outDir: 'extension/dist/drawer', entry: { drawer: 'extension/src/drawer/drawer.ts' }, format: 'iife', clean: false, sourcemap: false, minify: true }
]);
