import { nodeResolve } from '@rollup/plugin-node-resolve';
import typescript from '@rollup/plugin-typescript';

export default {
  input: 'src/index.ts',
  output: {
    dir: 'dist',
    format: 'esm',
    preserveModules: true,
  },
  plugins: [
    typescript({
      tsconfig: './tsconfig.json',
    }),
    nodeResolve({
      extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
    }),
  ],
};
