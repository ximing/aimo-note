import { fs } from '../ipc';

export function useFileSystem() {
  return {
    selectVault: () => fs.selectVault(),
    readFile: (path: string) => fs.readFile(path),
    writeFile: (path: string, content: string) => fs.writeFile(path, content),
  };
}
