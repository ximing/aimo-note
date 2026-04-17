export interface VaultInfo {
  path: string;
  name: string;
  files: number;
  size: number;
}

export interface VaultFile {
  path: string;
  name: string;
  isDirectory: boolean;
  children?: VaultFile[];
}
