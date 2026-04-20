import { useState, useCallback } from 'react';
import { observer } from '@rabjs/react';
import type { Template, TemplateField, TemplateFieldType } from '@aimo-note/dto';

interface TemplateEditorProps {
  template?: Template;
  onSave: (template: Template) => void;
  onCancel: () => void;
}

const FIELD_TYPES: { value: TemplateFieldType; label: string }[] = [
  { value: 'text', label: '文本' },
  { value: 'date', label: '日期' },
  { value: 'tags', label: '标签' },
  { value: 'checkbox', label: '复选框' },
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
    <div className="template-editor">
      <h4 className="text-sm font-medium text-text-primary mb-4">
        {template ? `编辑: ${template.fileName}` : '新建模板'}
      </h4>

      {/* File Name - only for new templates */}
      {!template && (
        <div className="mb-4">
          <label className="block text-xs text-text-secondary mb-1">模板名称</label>
          <input
            type="text"
            value={fileName}
            onChange={e => setFileName(e.target.value)}
            placeholder="my-template"
            className="w-full px-3 py-2 text-sm rounded-md border border-border bg-bg-secondary text-text-primary"
          />
        </div>
      )}

      {/* Frontmatter Fields */}
      <div className="mb-4">
        <h5 className="text-xs font-medium text-text-secondary mb-2">Frontmatter 字段</h5>
        <div className="space-y-2">
          {fields.map(field => (
            <div key={field.name} className="flex items-center gap-2 p-2 bg-bg-secondary rounded-md">
              <span className="font-mono text-sm flex-1 text-text-primary">{field.name}</span>
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
            <label className="block text-xs text-muted-foreground mb-1">字段名</label>
            <input
              type="text"
              value={newFieldName}
              onChange={e => setNewFieldName(e.target.value)}
              placeholder="custom_field"
              className="px-3 py-2 rounded-md border border-border bg-bg-secondary text-text-primary text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">类型</label>
            <select
              value={newFieldType}
              onChange={e => setNewFieldType(e.target.value as TemplateFieldType)}
              className="px-3 py-2 rounded-md border border-border bg-bg-secondary text-text-primary text-sm"
            >
              {FIELD_TYPES.map(ft => (
                <option key={ft.value} value={ft.value}>{ft.label}</option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={handleAddField}
            className="px-3 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
          >
            添加
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="mb-4">
        <h5 className="text-xs font-medium text-text-secondary mb-2">正文</h5>
        <textarea
          value={body}
          onChange={e => setBody(e.target.value)}
          rows={10}
          className="w-full px-3 py-2 rounded-md border border-border bg-bg-secondary text-text-primary font-mono text-sm"
          placeholder="使用 {{字段名}} 进行变量替换..."
        />
        <p className="text-xs text-muted-foreground mt-1">
          使用 {'{{字段名}}'} 进行变量替换。
        </p>
      </div>

      {/* Actions */}
      <div className="flex gap-3 justify-end">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-sm border border-border rounded-md hover:bg-muted"
        >
          取消
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={!fileName.trim() && !template}
          className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50"
        >
          保存模板
        </button>
      </div>
    </div>
  );
});
