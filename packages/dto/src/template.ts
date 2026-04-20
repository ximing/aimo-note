/**
 * Template types for note templates stored in .aimo-note/templates/
 */

export type TemplateFieldType = 'text' | 'date' | 'tags' | 'checkbox';

export interface TemplateField {
  name: string;
  type: TemplateFieldType;
  defaultValue?: unknown;
  autoSet?: 'created' | 'modified';
}

export interface Template {
  fileName: string;
  fields: TemplateField[];
  body: string;
}

export interface TemplateMapping {
  directory: string;
  templateFileName: string;
}

export interface TemplateListItem {
  fileName: string;
  fieldCount: number;
  preview: string;
}
