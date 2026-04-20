import matter from 'gray-matter';
import type { Template, TemplateField, TemplateFieldType } from '@aimo-note/dto';

const TEMPLATES_DIR = '.aimo-note/templates';
const TEMPLATE_EXT = '.md';

export interface ParsedTemplate {
  fields: TemplateField[];
  body: string;
}

export interface TemplateApplyResult {
  content: string;
  frontmatter: Record<string, unknown>;
}

export function parseTemplate(content: string, fileName: string): Template {
  const { data, content: body } = matter(content);
  const fields: TemplateField[] = [];

  for (const [key, value] of Object.entries(data)) {
    if (key === 'title' || key === 'tags' || key === 'created' || key === 'modified') {
      continue; // skip reserved fields
    }
    if (typeof value === 'boolean' && (key === 'created' || key === 'modified')) {
      fields.push({ name: key, type: 'checkbox', autoSet: key });
    } else if (typeof value === 'string') {
      fields.push({ name: key, type: 'text', defaultValue: value });
    } else if (Array.isArray(value)) {
      fields.push({ name: key, type: 'tags', defaultValue: value });
    } else {
      fields.push({ name: key, type: 'text', defaultValue: String(value) });
    }
  }

  return { fileName, fields, body };
}

export function detectFieldType(valueStr: string): TemplateFieldType {
  if (valueStr === 'true' || valueStr === 'false') return 'checkbox';
  if (valueStr === '[]') return 'tags';
  if (/^\d{4}-\d{2}-\d{2}/.test(valueStr)) return 'date';
  return 'text';
}

export function buildFrontmatter(
  fields: TemplateField[],
  values: Record<string, unknown>,
  fileName: string
): Record<string, unknown> {
  const fm: Record<string, unknown> = {};
  fm.title = fileName.replace(/\.md$/, '');

  for (const field of fields) {
    if (field.autoSet === 'created') {
      fm.created = new Date().toISOString();
    } else if (field.autoSet === 'modified') {
      fm.modified = new Date().toISOString();
    } else {
      fm[field.name] = values[field.name] ?? field.defaultValue ?? '';
    }
  }

  if (!fields.some(f => f.name === 'created')) {
    fm.created = new Date().toISOString();
  }
  if (!fields.some(f => f.name === 'modified')) {
    fm.modified = new Date().toISOString();
  }
  if (!fields.some(f => f.name === 'tags')) {
    fm.tags = [];
  }

  return fm;
}

export function substituteVariables(
  body: string,
  values: Record<string, unknown>,
  fileName: string
): string {
  let result = body;
  result = result.replace(/\{\{title\}\}/g, fileName.replace(/\.md$/, ''));
  result = result.replace(/\{\{date\}\}/g, new Date().toISOString().split('T')[0]);

  for (const [key, value] of Object.entries(values)) {
    const placeholder = `{{${key}}}`;
    const replacement = Array.isArray(value) ? value.join(', ') : String(value ?? '');
    result = result.replace(new RegExp(placeholder.replace(/[{}]/g, '\\$&'), 'g'), replacement);
  }

  return result;
}

export function applyTemplate(
  template: Template,
  values: Record<string, unknown>,
  fileName: string
): TemplateApplyResult {
  const frontmatter = buildFrontmatter(template.fields, values, fileName);
  const body = substituteVariables(template.body, values, fileName);

  const fmLines = Object.entries(frontmatter)
    .map(([k, v]) => {
      if (Array.isArray(v)) return `${k}: ${JSON.stringify(v)}`;
      if (typeof v === 'string') return `${k}: "${v}"`;
      return `${k}: ${v}`;
    })
    .join('\n');

  return {
    content: `---\n${fmLines}\n---\n\n${body}`,
    frontmatter,
  };
}

export function serializeTemplate(template: Template): string {
  const fmLines: string[] = [];

  for (const field of template.fields) {
    if (field.autoSet === 'created') {
      fmLines.push('created: true');
    } else if (field.autoSet === 'modified') {
      fmLines.push('modified: true');
    } else if (field.type === 'tags') {
      fmLines.push(`${field.name}: []`);
    } else {
      fmLines.push(`${field.name}: "${field.defaultValue ?? ''}"`);
    }
  }

  return `---\n${fmLines.join('\n')}\n---\n\n${template.body}`;
}

export function findTemplateForDirectory(
  mappings: Record<string, string>,
  directory: string
): string | null {
  let current = directory;

  while (true) {
    const templateName = mappings[current];
    if (templateName) return templateName;

    if (current === '') break;

    const lastSlash = current.lastIndexOf('/');
    current = lastSlash === -1 ? '' : current.substring(0, lastSlash);
  }

  return mappings[''] ?? null;
}
