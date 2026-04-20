import { observer, useService } from '@rabjs/react';
import { EditorService } from '@/services/editor.service';
import { useState, useCallback } from 'react';

interface FieldDef {
  key: string;
  type: 'text' | 'date' | 'array';
  value: string;
}

function inferType(value: unknown): 'text' | 'date' | 'array' {
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return 'date';
  return 'text';
}

function serializeValue(value: unknown, type: FieldDef['type']): string {
  if (type === 'array') return Array.isArray(value) ? value.join(', ') : String(value ?? '');
  if (type === 'date') return value instanceof Date ? value.toISOString().split('T')[0] : String(value ?? '');
  return String(value ?? '');
}

export const FrontmatterPanel = observer(() => {
  const service = useService(EditorService);
  const [showAddField, setShowAddField] = useState(false);
  const [newFieldName, setNewFieldName] = useState('');
  const [newFieldType, setNewFieldType] = useState<'text' | 'date' | 'array'>('text');

  const frontmatter = service.getFrontmatter();
  const hasFrontmatter = Object.keys(frontmatter).length > 0;

  const fields: FieldDef[] = Object.entries(frontmatter).map(([key, value]) => ({
    key,
    type: inferType(value),
    value: serializeValue(value, inferType(value)),
  }));

  const handleAddFrontmatter = useCallback(() => {
    const newFm = { ...frontmatter, title: '' };
    service.updateFrontmatter(newFm);
  }, [frontmatter, service]);

  const handleFieldChange = useCallback((key: string, value: string, type: FieldDef['type']) => {
    let parsedValue: unknown = value;
    if (type === 'array') parsedValue = value.split(',').map((s) => s.trim()).filter(s => s.trim() !== '');
    const newFm = { ...frontmatter, [key]: parsedValue };
    service.updateFrontmatter(newFm);
  }, [frontmatter, service]);

  const handleDeleteField = useCallback((key: string) => {
    const newFm = { ...frontmatter };
    delete newFm[key];
    service.updateFrontmatter(newFm);
  }, [frontmatter, service]);

  const handleAddField = useCallback(() => {
    if (!newFieldName.trim()) return;
    const newFm = { ...frontmatter, [newFieldName.trim()]: '' };
    service.updateFrontmatter(newFm);
    setNewFieldName('');
    setShowAddField(false);
  }, [frontmatter, service, newFieldName]);

  if (!hasFrontmatter) {
    return (
      <div className="frontmatter-empty px-4 py-2">
        <button
          onClick={handleAddFrontmatter}
          className="text-sm text-muted-foreground hover:text-foreground cursor-pointer bg-transparent border-none"
        >
          + 添加 Frontmatter
        </button>
      </div>
    );
  }

  return (
    <div className="frontmatter-panel border-b border-border px-4 py-3">
      <div className="flex flex-col gap-2">
        {fields.map((field) => (
          <div key={field.key} className="flex items-center gap-2">
            <span className="w-[120px] text-sm text-muted-foreground text-right flex-shrink-0">
              {field.key}:
            </span>
            {field.type === 'date' ? (
              <input
                type="date"
                value={field.value}
                onChange={(e) => handleFieldChange(field.key, e.target.value, field.type)}
                className="flex-1 text-sm bg-transparent border border-border rounded px-2 py-1"
              />
            ) : (
              <input
                type="text"
                value={field.value}
                onChange={(e) => handleFieldChange(field.key, e.target.value, field.type)}
                placeholder={field.type === 'array' ? 'tag1, tag2, ...' : ''}
                className="flex-1 text-sm bg-transparent border border-border rounded px-2 py-1"
              />
            )}
            <button
              onClick={() => handleDeleteField(field.key)}
              className="text-muted-foreground hover:text-destructive text-sm px-1 cursor-pointer bg-transparent border-none"
            >
              −
            </button>
          </div>
        ))}
        {showAddField ? (
          <div className="flex items-center gap-2 mt-1">
            <input
              type="text"
              value={newFieldName}
              onChange={(e) => setNewFieldName(e.target.value)}
              placeholder="字段名"
              className="w-[120px] text-sm bg-transparent border border-border rounded px-2 py-1"
            />
            <select
              value={newFieldType}
              onChange={(e) => setNewFieldType(e.target.value as FieldDef['type'])}
              className="text-sm bg-transparent border border-border rounded px-2 py-1"
            >
              <option value="text">文本</option>
              <option value="date">日期</option>
              <option value="array">数组</option>
            </select>
            <button
              onClick={handleAddField}
              className="text-sm text-muted-foreground hover:text-foreground cursor-pointer bg-transparent border-none"
            >
              确认
            </button>
            <button
              onClick={() => setShowAddField(false)}
              className="text-sm text-muted-foreground hover:text-destructive cursor-pointer bg-transparent border-none"
            >
              取消
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowAddField(true)}
            className="text-sm text-muted-foreground hover:text-foreground cursor-pointer bg-transparent border-none text-left mt-1"
          >
            + 添加字段
          </button>
        )}
      </div>
    </div>
  );
});