// Build: three esbuild bundles + static assets copied into dist/.
//   background.js          — MV3 service worker (ES module)
//   popup.js               — popup UI (IIFE)
//   inject/extractor.js    — injected on demand via chrome.scripting (IIFE, no imports allowed)
import * as esbuild from 'esbuild';
import { cpSync, mkdirSync, rmSync } from 'node:fs';

const watch = process.argv.includes('--watch');
const outdir = 'dist';

rmSync(outdir, { recursive: true, force: true });
mkdirSync(outdir, { recursive: true });
const copyStatic = () => cpSync('static', outdir, { recursive: true });
copyStatic();

const common = {
  bundle: true,
  target: 'chrome120',
  // Keep output readable: Chrome Web Store review rejects obfuscated code, and
  // readable bundles make store review faster.
  minify: false,
  sourcemap: watch ? 'inline' : false,
  legalComments: 'none',
  logLevel: 'info',
  // turndown's source checks process.browser to pick its HTML parser.
  define: { 'process.browser': 'true' },
};

const builds = [
  { entryPoints: { background: 'src/background.ts' }, format: 'esm' },
  { entryPoints: { popup: 'src/popup/popup.ts' }, format: 'iife' },
  { entryPoints: { 'inject/extractor': 'src/inject/extractor.ts' }, format: 'iife' },
].map((b) => ({ ...common, ...b, outdir }));

if (watch) {
  for (const b of builds) {
    const ctx = await esbuild.context({
      ...b,
      plugins: [{ name: 'static', setup: (build) => build.onEnd(copyStatic) }],
    });
    await ctx.watch();
  }
  console.log('watching… reload the extension in chrome://extensions after changes');
} else {
  await Promise.all(builds.map((b) => esbuild.build(b)));
}
