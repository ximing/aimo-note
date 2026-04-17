export interface Plugin {
  id: string;
  name: string;
  version: string;
  description: string;
  main: string;
  enabled: boolean;
}

export interface PluginAPI {
  app: AppAPI;
  note: NoteAPI;
  workspace: WorkspaceAPI;
}

export interface AppAPI {
  getVersion(): string;
  getVaultPath(): string;
}

export interface NoteAPI {
  open(path: string): Promise<unknown>;
  create(path: string, content: string): Promise<unknown>;
  update(note: unknown): Promise<void>;
}

export interface WorkspaceAPI {
  getActiveNote(): unknown | null;
  setStatusBarText(text: string): void;
}

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  main: string;
  permissions?: string[];
}
