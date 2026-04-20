import { useState, useCallback, useEffect } from 'react';
import { observer, useService } from '@rabjs/react';
import { TemplateService } from '@/services/template.service';
import { TemplateEditor } from '@/components/template/TemplateEditor';
import type { Template } from '@aimo-note/dto';

export const TemplateSettings = observer(() => {
  const templateService = useService(TemplateService);
  const [editingTemplate, setEditingTemplate] = useState<Template | null | undefined>(undefined);
  const [activeTab, setActiveTab] = useState<'list' | 'mappings'>('list');

  useEffect(() => {
    templateService.loadTemplates();
  }, [templateService]);

  const handleNewTemplate = useCallback(() => {
    setEditingTemplate(null);
  }, []);

  const handleEditTemplate = useCallback(async (fileName: string) => {
    const t = await templateService.readTemplate(fileName);
    setEditingTemplate(t);
  }, [templateService]);

  const handleSaveTemplate = useCallback(async (t: Template) => {
    await templateService.saveTemplate(t);
    setEditingTemplate(undefined);
  }, [templateService]);

  const handleDeleteTemplate = useCallback(async (fileName: string) => {
    await templateService.deleteTemplate(fileName);
  }, [templateService]);

  if (editingTemplate !== undefined) {
    return (
      <TemplateEditor
        template={editingTemplate ?? undefined}
        onSave={handleSaveTemplate}
        onCancel={() => setEditingTemplate(undefined)}
      />
    );
  }

  return (
    <div className="template-settings">
      {/* Tab Switcher */}
      <div className="flex gap-4 mb-6 border-b border-border">
        <button
          type="button"
          onClick={() => setActiveTab('list')}
          className={`pb-2 px-1 font-medium ${
            activeTab === 'list'
              ? 'border-b-2 border-accent text-accent'
              : 'text-muted-foreground hover:text-text-primary'
          }`}
        >
          Template List
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('mappings')}
          className={`pb-2 px-1 font-medium ${
            activeTab === 'mappings'
              ? 'border-b-2 border-accent text-accent'
              : 'text-muted-foreground hover:text-text-primary'
          }`}
        >
          Directory Mappings
        </button>
      </div>

      {activeTab === 'list' && (
        <div>
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold">Templates</h3>
            <button
              type="button"
              onClick={handleNewTemplate}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90"
            >
              + New Template
            </button>
          </div>

          {templateService.templates.length === 0 ? (
            <p className="text-muted-foreground text-sm">No templates yet. Create one to get started.</p>
          ) : (
            <div className="space-y-2">
              {templateService.templates.map(t => (
                <div
                  key={t.fileName}
                  className="flex items-center justify-between p-3 bg-bg-secondary rounded-lg"
                >
                  <div>
                    <p className="font-medium">{t.fileName}</p>
                    <p className="text-xs text-muted-foreground">
                      {t.fieldCount} fields · {t.preview}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleEditTemplate(t.fileName)}
                      className="px-3 py-1 text-sm border border-border rounded hover:bg-muted"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteTemplate(t.fileName)}
                      className="px-3 py-1 text-sm text-destructive border border-border rounded hover:bg-destructive/10"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'mappings' && (
        <DirectoryMappings />
      )}
    </div>
  );
});

const DirectoryMappings = observer(() => {
  const templateService = useService(TemplateService);
  const [newDir, setNewDir] = useState('');
  const [newTemplate, setNewTemplate] = useState('');

  const handleAddMapping = useCallback(async () => {
    if (!newDir.trim() || !newTemplate) return;
    await templateService.setMapping(newDir.trim(), newTemplate);
    setNewDir('');
    setNewTemplate('');
  }, [newDir, newTemplate, templateService]);

  const handleRemoveMapping = useCallback(async (dir: string) => {
    await templateService.removeMapping(dir);
  }, [templateService]);

  const entries = Object.entries(templateService.mappings);

  return (
    <div>
      <h3 className="text-lg font-semibold mb-4">Directory → Template Mappings</h3>

      {entries.length > 0 && (
        <div className="space-y-2 mb-6">
          {entries.map(([dir, tmpl]) => (
            <div key={dir} className="flex items-center gap-3 p-3 bg-bg-secondary rounded-lg">
              <span className="font-mono text-sm flex-1">{dir || '(root)'}</span>
              <span className="text-muted-foreground">→</span>
              <span className="font-mono text-sm">{tmpl}</span>
              <button
                type="button"
                onClick={() => handleRemoveMapping(dir)}
                className="text-muted-foreground hover:text-destructive"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-3 items-end">
        <div className="flex-1">
          <label className="block text-sm font-medium mb-1">Directory</label>
          <input
            type="text"
            value={newDir}
            onChange={e => setNewDir(e.target.value)}
            placeholder="e.g. journals (empty for root)"
            className="w-full px-3 py-2 rounded-lg border border-border bg-bg-secondary text-text-primary"
          />
        </div>
        <div className="flex-1">
          <label className="block text-sm font-medium mb-1">Template</label>
          <select
            value={newTemplate}
            onChange={e => setNewTemplate(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-border bg-bg-secondary text-text-primary"
          >
            <option value="">Select template...</option>
            {templateService.templates.map(t => (
              <option key={t.fileName} value={t.fileName}>{t.fileName}</option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={handleAddMapping}
          disabled={!newDir.trim() || !newTemplate}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50"
        >
          Add
        </button>
      </div>
    </div>
  );
});
