import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs', 'iife'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  minify: false,
  outDir: 'dist',
  bundle: true,
  platform: 'browser',
  external: [],
  globalName: 'XDTracker',
  esbuildOptions(options) {
    options.globalName = 'XDTracker'
  }
})