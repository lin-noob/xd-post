import { defineConfig } from 'rollup';
import typescript from '@rollup/plugin-typescript';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import { terser } from 'rollup-plugin-terser';

export default defineConfig({
  input: 'src/index.ts',
  output: [
    {
      file: 'dist/index.umd.js',
      format: 'umd',
      name: 'XDTracker',
      exports: 'named',
      sourcemap: true,
      globals: {}
    },
    {
      file: 'dist/index.umd.min.js',
      format: 'umd',
      name: 'XDTracker',
      exports: 'named',
      sourcemap: true,
      plugins: [terser()],
      globals: {}
    }
  ],
  plugins: [
    nodeResolve({
      browser: true,
      preferBuiltins: false
    }),
    commonjs(),
    typescript({
      tsconfig: './tsconfig.json',
      declaration: false,
      declarationDir: undefined
    })
  ],
  external: []
});