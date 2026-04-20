export interface TemplateListItem {
  fileName: string;
  fieldCount: number;
  preview: string;
}

export interface TemplateIPC {
  list(vaultPath: string): Promise<{
    success: boolean;
    templates: TemplateListItem[];
    error?: string;
  }>;
  read(
    vaultPath: string,
    fileName: string
  ): Promise<{
    success: boolean;
    content?: string;
    error?: string;
  }>;
  write(
    vaultPath: string,
    fileName: string,
    content: string
  ): Promise<{
    success: boolean;
    error?: string;
  }>;
  delete(
    vaultPath: string,
    fileName: string
  ): Promise<{
    success: boolean;
    error?: string;
  }>;
  getMappings(vaultPath: string): Promise<{
    success: boolean;
    mappings: Record<string, string>;
    error?: string;
  }>;
  setMappings(
    vaultPath: string,
    mappings: Record<string, string>
  ): Promise<{
    success: boolean;
    error?: string;
  }>;
}

export const template: TemplateIPC = {
  async list(vaultPath: string) {
    const result = await window.electronAPI!.template.list(vaultPath);
    if (!result.success) throw new Error(result.error);
    return result;
  },
  async read(vaultPath: string, fileName: string) {
    const result = await window.electronAPI!.template.read(vaultPath, fileName);
    if (!result.success) throw new Error(result.error);
    return result;
  },
  async write(vaultPath: string, fileName: string, content: string) {
    const result = await window.electronAPI!.template.write(vaultPath, fileName, content);
    if (!result.success) throw new Error(result.error);
    return result;
  },
  async delete(vaultPath: string, fileName: string) {
    const result = await window.electronAPI!.template.delete(vaultPath, fileName);
    if (!result.success) throw new Error(result.error);
    return result;
  },
  async getMappings(vaultPath: string) {
    const result = await window.electronAPI!.template.getMappings(vaultPath);
    if (!result.success) throw new Error(result.error);
    return result;
  },
  async setMappings(vaultPath: string, mappings: Record<string, string>) {
    const result = await window.electronAPI!.template.setMappings(vaultPath, mappings);
    if (!result.success) throw new Error(result.error);
    return result;
  },
};
