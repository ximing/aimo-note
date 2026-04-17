import { createRollupConfig } from '@aimo-note/rollup-config';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageDir = resolve(__dirname);

export default createRollupConfig({
  input: 'src/index.ts',
  packageDir,
});
