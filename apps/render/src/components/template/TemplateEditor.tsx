import { useState, useCallback } from 'react';
import { observer } from '@rabjs/react';
import type { Template, TemplateField, TemplateFieldType } from '@aimo-note/dto';

interface TemplateEditorProps {
  template?: Template;
  onSave: (template: Template) => void;
  onCancel: () => void;
}

const FIELD_TYPES: { value: TemplateFieldType; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'date', label: 'Date' },
  { value: 'tags', label: 'Tags' },
  { value: 'checkbox', label: 'Checkbox' },
];

export const TemplateEditor = observer(({ template, onSave, onCancel }: TemplateEditorProps) => {
  const [fileName, setFileName] = useState(template?.fileName ?? '');
  const [fields, setFields] = useState<TemplateField[]>(
    template?.fields ?? [
      { name: 'title', type: 'text' },
      { name: 'tags', type: 'tags' },
      { name: 'created', type: 'checkbox', autoSet: 'created' },
      { name: 'modified', type: 'checkbox', autoSet: 'modified' },
    ]
  );
  const [body, setBody] = useState(template?.body ?? '# {{title}}\n\n');
  const [newFieldName, setNewFieldName] = useState('');
  const [newFieldType, setNewFieldType] = useState<TemplateFieldType>('text');

  const handleAddField = useCallback(() => {
    if (!newFieldName.trim()) return;
    if (fields.some(f => f.name === newFieldName.trim())) return;
    setFields([...fields, { name: newFieldName.trim(), type: newFieldType }]);
    setNewFieldName('');
  }, [newFieldName, newFieldType, fields]);

  const handleRemoveField = useCallback((name: string) => {
    setFields(fields.filter(f => f.name !== name));
  }, [fields]);

  const handleSave = useCallback(() => {
    const cleanFileName = fileName.endsWith('.md') ? fileName : `${fileName}.md`;
    const templateObj: Template = { fileName: cleanFileName, fields, body };
    onSave(templateObj);
  }, [fileName, fields, body, onSave]);

  return (
    <div className="template-editor p-4 max-w-2xl mx-auto">
      <h2 className="text-xl font-bold mb-4">
        {template ? `Edit: ${template.fileName}` : 'New Template'}
      </h2>

      {/* File Name - only for new templates */}
      {!template && (
        <div className="mb-4">
          <label className="block text-sm font-medium mb-1">Template Name</label>
          <input
            type="text"
            value={fileName}
            onChange={e => setFileName(e.target.value)}
            placeholder="my-template"
            className="w-full px-3 py-2 rounded-lg border border-border bg-bg-secondary text-text-primary"
          />
        </div>
      )}

      {/* Frontmatter Fields */}
      <div className="mb-6">
        <h3 className="text-lg font-semibold mb-2">Frontmatter Fields</h3>
        <div className="space-y-2">
          {fields.map(field => (
            <div key={field.name} className="flex items-center gap-2 p-2 bg-bg-secondary rounded">
              <span className="font-mono text-sm flex-1">{field.name}</span>
              <span className="text-xs text-muted-foreground px-2 py-0.5 bg-bg-tertiary rounded">{field.type}</span>
              {field.autoSet && (
                <span className="text-xs text-accent px-2 py-0.5 bg-accent/10 rounded">auto:{field.autoSet}</span>
              )}
              <button
                type="button"
                onClick={() => handleRemoveField(field.name)}
                className="text-muted-foreground hover:text-destructive"
              >
                ×
              </button>
            </div>
          ))}
        </div>

        {/* Add Field */}
        <div className="mt-3 flex gap-2 items-end">
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Field Name</label>
            <input
              type="text"
              value={newFieldName}
              onChange={e => setNewFieldName(e.target.value)}
              placeholder="custom_field"
              className="px-3 py-2 rounded border border-border bg-bg-secondary text-text-primary text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Type</label>
            <select
              value={newFieldType}
              onChange={e => setNewFieldType(e.target.value as TemplateFieldType)}
              className="px-3 py-2 rounded border border-border bg-bg-secondary text-text-primary text-sm"
            >
              {FIELD_TYPES.map(ft => (
                <option key={ft.value} value={ft.value}>{ft.label}</option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={handleAddField}
            className="px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90"
          >
            Add
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="mb-6">
        <h3 className="text-lg font-semibold mb-2">Body</h3>
        <textarea
          value={body}
          onChange={e => setBody(e.target.value)}
          rows={10}
          className="w-full px-3 py-2 rounded-lg border border-border bg-bg-secondary text-text-primary font-mono text-sm"
          placeholder="Use {{fieldName}} for variable substitution..."
        />
        <p className="text-xs text-muted-foreground mt-1">
          Use {'{{fieldName}}'} for variable substitution.
        </p>
      </div>

      {/* Actions */}
      <div className="flex gap-3 justify-end">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 border border-border rounded hover:bg-muted"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={!fileName.trim() && !template}
          className="px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-50"
        >
          Save Template
        </button>
      </div>
    </div>
  );
});
