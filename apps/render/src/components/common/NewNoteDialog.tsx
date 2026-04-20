import { useState, useCallback, useEffect } from 'react';
import { observer, useService } from '@rabjs/react';
import { PromptDialog } from './PromptDialog';
import { TemplateService } from '@/services/template.service';
import type { Template, TemplateField } from '@aimo-note/dto';

interface NewNoteDialogProps {
  parentPath: string;
  onConfirm: (name: string, content: string) => void;
  onCancel: () => void;
}

export const NewNoteDialog = observer(({ parentPath, onConfirm, onCancel }: NewNoteDialogProps) => {
  const templateService = useService(TemplateService);
  const [step, setStep] = useState<'name' | 'variables'>('name');
  const [noteName, setNoteName] = useState('');
  const [template, setTemplate] = useState<Template | null>(null);
  const [fieldValues, setFieldValues] = useState<Record<string, unknown>>({});

  useEffect(() => {
    templateService.loadTemplates();
  }, [templateService]);

  const handleNameConfirm = useCallback(async (name: string) => {
    setNoteName(name);
    const tmpl = await templateService.findTemplateForDirectory(parentPath);
    if (tmpl) {
      setTemplate(tmpl);
      const initial: Record<string, unknown> = {};
      for (const field of tmpl.fields) {
        if (field.defaultValue !== undefined) {
          initial[field.name] = field.defaultValue;
        } else if (field.type === 'tags') {
          initial[field.name] = [];
        } else if (field.type === 'checkbox') {
          initial[field.name] = false;
        } else {
          initial[field.name] = '';
        }
      }
      setFieldValues(initial);
      setStep('variables');
    } else {
      onConfirm(name, `# ${name}\n\n`);
    }
  }, [parentPath, templateService, onConfirm]);

  const handleVariableConfirm = useCallback(() => {
    const content = templateService.applyTemplateToContent(template!, fieldValues, noteName);
    onConfirm(noteName, content);
  }, [noteName, template, fieldValues, templateService, onConfirm]);

  if (step === 'variables' && template) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-bg-primary rounded-xl shadow-xl max-w-md w-full mx-4 p-6">
          <h2 className="text-lg font-bold mb-4">Fill Template: {noteName}</h2>
          <div className="space-y-4">
            {template.fields.filter(f => !f.autoSet).map(field => (
              <VariableField
                key={field.name}
                field={field}
                value={fieldValues[field.name]}
                onChange={val => setFieldValues(prev => ({ ...prev, [field.name]: val }))}
              />
            ))}
          </div>
          <div className="flex gap-3 justify-end mt-6">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 border border-border rounded hover:bg-muted"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleVariableConfirm}
              className="px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90"
            >
              Create
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <PromptDialog
      title="New Note"
      defaultValue="untitled"
      placeholder="Enter note name"
      confirmText="Next"
      onConfirm={handleNameConfirm}
      onCancel={onCancel}
    />
  );
});

interface VariableFieldProps {
  field: TemplateField;
  value: unknown;
  onChange: (value: unknown) => void;
}

function VariableField({ field, value, onChange }: VariableFieldProps) {
  if (field.type === 'text') {
    return (
      <div>
        <label className="block text-sm font-medium mb-1">{field.name}</label>
        <input
          type="text"
          value={String(value ?? '')}
          onChange={e => onChange(e.target.value)}
          className="w-full px-3 py-2 rounded-lg border border-border bg-bg-secondary text-text-primary"
        />
      </div>
    );
  }

  if (field.type === 'date') {
    return (
      <div>
        <label className="block text-sm font-medium mb-1">{field.name}</label>
        <input
          type="date"
          value={String(value ?? '')}
          onChange={e => onChange(e.target.value)}
          className="w-full px-3 py-2 rounded-lg border border-border bg-bg-secondary text-text-primary"
        />
      </div>
    );
  }

  if (field.type === 'checkbox') {
    return (
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={e => onChange(e.target.checked)}
          className="w-4 h-4"
        />
        <span className="text-sm font-medium">{field.name}</span>
      </label>
    );
  }

  if (field.type === 'tags') {
    return <TagsField field={field} value={value} onChange={onChange} />;
  }

  return null;
}

function TagsField({ field, value, onChange }: VariableFieldProps) {
  const tags = Array.isArray(value) ? value : [];
  const [input, setInput] = useState('');

  const handleAddTag = () => {
    const trimmed = input.trim();
    if (!trimmed || tags.includes(trimmed)) return;
    onChange([...tags, trimmed]);
    setInput('');
  };

  return (
    <div>
      <label className="block text-sm font-medium mb-1">{field.name}</label>
      <div className="flex flex-wrap gap-1 mb-2">
        {tags.map(tag => (
          <span key={tag} className="inline-flex items-center gap-1 px-2 py-0.5 bg-accent/10 text-accent rounded text-sm">
            {tag}
            <button type="button" onClick={() => onChange(tags.filter(t => t !== tag))}>×</button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddTag(); } }}
          className="flex-1 px-3 py-2 rounded-lg border border-border bg-bg-secondary text-text-primary"
          placeholder="Add tag..."
        />
        <button type="button" onClick={handleAddTag} className="px-3 py-2 bg-primary text-primary-foreground rounded">+</button>
      </div>
    </div>
  );
}
