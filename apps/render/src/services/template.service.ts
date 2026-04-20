import { Service } from '@rabjs/react';
import { template } from '@/ipc/template';
import { VaultService } from './vault.service';
import type { Template } from '@aimo-note/dto';
import {
  parseTemplate,
  applyTemplate,
  serializeTemplate,
  findTemplateForDirectory,
} from '@aimo-note/core';

export class TemplateService extends Service {
  templates: Array<{ fileName: string; fieldCount: number; preview: string }> = [];
  mappings: Record<string, string> = {};
  isLoading = false;

  private get vaultService(): VaultService {
    return this.resolve(VaultService);
  }

  private get vaultPath(): string | null {
    return this.vaultService.path;
  }

  async loadTemplates(): Promise<void> {
    if (!this.vaultPath) return;
    this.isLoading = true;
    try {
      const result = await template.list(this.vaultPath);
      this.templates = result.templates;
      const mappingsResult = await template.getMappings(this.vaultPath);
      this.mappings = mappingsResult.mappings;
    } finally {
      this.isLoading = false;
    }
  }

  async readTemplate(fileName: string): Promise<Template> {
    if (!this.vaultPath) throw new Error('No vault open');
    const result = await template.read(this.vaultPath, fileName);
    return parseTemplate(result.content!, fileName);
  }

  async saveTemplate(templateObj: Template): Promise<void> {
    if (!this.vaultPath) throw new Error('No vault open');
    const content = serializeTemplate(templateObj);
    await template.write(this.vaultPath, templateObj.fileName, content);
    await this.loadTemplates();
  }

  async deleteTemplate(fileName: string): Promise<void> {
    if (!this.vaultPath) throw new Error('No vault open');
    await template.delete(this.vaultPath, fileName);
    await this.loadTemplates();
    // Remove stale mappings for the deleted template
    const validTemplateFileNames = new Set(this.templates.map(t => t.fileName));
    const cleanedMappings: Record<string, string> = {};
    for (const [dir, tmplFileName] of Object.entries(this.mappings)) {
      if (validTemplateFileNames.has(tmplFileName)) {
        cleanedMappings[dir] = tmplFileName;
      }
    }
    if (Object.keys(cleanedMappings).length !== Object.keys(this.mappings).length) {
      this.mappings = cleanedMappings;
      await template.setMappings(this.vaultPath, cleanedMappings);
    }
  }

  async setMapping(directory: string, templateFileName: string): Promise<void> {
    if (!this.vaultPath) throw new Error('No vault open');
    const newMappings = { ...this.mappings, [directory]: templateFileName };
    await template.setMappings(this.vaultPath, newMappings);
    this.mappings = newMappings;
  }

  async removeMapping(directory: string): Promise<void> {
    if (!this.vaultPath) throw new Error('No vault open');
    const newMappings = { ...this.mappings };
    delete newMappings[directory];
    await template.setMappings(this.vaultPath, newMappings);
    this.mappings = newMappings;
  }

  async findTemplateForDirectory(directory: string): Promise<Template | null> {
    const templateFileName = findTemplateForDirectory(this.mappings, directory);
    if (!templateFileName) return null;
    try {
      return await this.readTemplate(templateFileName);
    } catch {
      return null;
    }
  }

  applyTemplateToContent(
    templateObj: Template,
    values: Record<string, unknown>,
    fileName: string
  ): string {
    return applyTemplate(templateObj, values, fileName).content;
  }
}
