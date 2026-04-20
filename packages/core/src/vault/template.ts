import matter from 'gray-matter';
import type { Template, TemplateField } from '@aimo-note/dto';

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
    if (key === 'title') {
      continue; // title is auto-derived from filename
    }
    if (key === 'tags' || key === 'created' || key === 'modified') {
      // Reserved fields: boolean true means auto-set, otherwise skip
      if (typeof value === 'boolean' && value === true) {
        fields.push({ name: key, type: 'checkbox', autoSet: key as 'created' | 'modified' });
      } else if (key === 'tags' && Array.isArray(value)) {
        fields.push({ name: 'tags', type: 'tags', defaultValue: value });
      }
      continue;
    }
    if (typeof value === 'boolean') {
      fields.push({ name: key, type: 'checkbox', defaultValue: value });
    } else if (value instanceof Date) {
      fields.push({ name: key, type: 'date', defaultValue: value.toISOString().split('T')[0] });
    } else if (typeof value === 'string') {
      fields.push({ name: key, type: 'text', defaultValue: value });
    } else if (Array.isArray(value)) {
      const valueStr = JSON.stringify(value);
      fields.push({ name: key, type: detectFieldType(key, valueStr), defaultValue: value });
    } else {
      fields.push({ name: key, type: 'text', defaultValue: String(value) });
    }
  }

  return { fileName, fields, body };
}

/**
 * Detect field type from field name and raw YAML value string.
 */
export function detectFieldType(fieldName: string, valueStr: string): 'text' | 'date' | 'tags' | 'checkbox' {
  if (fieldName === 'created' || fieldName === 'modified') return 'checkbox';
  if (/\b(date|time|year|month|day)\b/i.test(fieldName)) return 'date';
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

  let hasCreated = false;
  let hasModified = false;
  let hasTags = false;

  for (const field of fields) {
    if (field.autoSet === 'created') {
      fm.created = new Date().toISOString();
      hasCreated = true;
    } else if (field.autoSet === 'modified') {
      fm.modified = new Date().toISOString();
      hasModified = true;
    } else {
      fm[field.name] = values[field.name] ?? field.defaultValue ?? '';
      if (field.name === 'tags') hasTags = true;
    }
  }

  if (!hasCreated) {
    fm.created = new Date().toISOString();
  }
  if (!hasModified) {
    fm.modified = new Date().toISOString();
  }
  if (!hasTags) {
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
      if (Array.isArray(v)) {
        const items = v.map(item =>
          typeof item === 'string' ? `'${item}'` : String(item)
        );
        return `${k}: [${items.join(', ')}]`;
      }
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
    if (field.type === 'tags') {
      const items = ((field.defaultValue ?? []) as unknown[]).map(item =>
        typeof item === 'string' ? `'${item}'` : String(item)
      );
      fmLines.push(`${field.name}: [${items.join(', ')}]`);
    } else if (field.autoSet === 'created') {
      fmLines.push('created: true');
    } else if (field.autoSet === 'modified') {
      fmLines.push('modified: true');
    } else if (field.type === 'date') {
      fmLines.push(`${field.name}: "${field.defaultValue ?? ''}"`);
    } else if (field.type === 'checkbox') {
      fmLines.push(`${field.name}: ${field.defaultValue ? 'true' : 'false'}`);
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
