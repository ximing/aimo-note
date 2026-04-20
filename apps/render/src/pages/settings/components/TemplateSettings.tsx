import { useState, useCallback, useEffect } from 'react';
import { observer, useService } from '@rabjs/react';
import { TemplateService } from '@/services/template.service';
import { TemplateEditor } from '@/components/template/TemplateEditor';
import { ConfirmDialog } from '@/components/common';
import type { Template } from '@aimo-note/dto';

export const TemplateSettings = observer(() => {
  const templateService = useService(TemplateService);
  const [editingTemplate, setEditingTemplate] = useState<Template | null | undefined>(undefined);
  const [activeTab, setActiveTab] = useState<'list' | 'mappings'>('list');
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

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

  const handleDeleteConfirm = useCallback(async () => {
    if (deleteTarget) await templateService.deleteTemplate(deleteTarget);
    setDeleteTarget(null);
  }, [deleteTarget, templateService]);

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
      <div className="flex gap-4 mb-4 border-b border-border">
        <button
          type="button"
          onClick={() => setActiveTab('list')}
          className={`pb-2 px-1 text-sm font-medium ${
            activeTab === 'list'
              ? 'border-b-2 border-accent text-accent'
              : 'text-muted-foreground hover:text-text-primary'
          }`}
        >
          模板列表
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('mappings')}
          className={`pb-2 px-1 text-sm font-medium ${
            activeTab === 'mappings'
              ? 'border-b-2 border-accent text-accent'
              : 'text-muted-foreground hover:text-text-primary'
          }`}
        >
          目录映射
        </button>
      </div>

      {activeTab === 'list' && (
        <div>
          <div className="flex justify-between items-center mb-3">
            <h4 className="text-sm font-medium text-text-primary">模板</h4>
            <button
              type="button"
              onClick={handleNewTemplate}
              className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded hover:bg-primary/90"
            >
              + 新建模板
            </button>
          </div>

          {templateService.templates.length === 0 ? (
            <p className="text-sm text-muted-foreground">暂无模板，创建第一个模板开始使用。</p>
          ) : (
            <div className="space-y-2">
              {templateService.templates.map(t => (
                <div
                  key={t.fileName}
                  className="flex items-center justify-between p-3 bg-bg-secondary rounded-md"
                >
                  <div>
                    <p className="text-sm font-medium text-text-primary">{t.fileName}</p>
                    <p className="text-xs text-muted-foreground">
                      {t.fieldCount} 个字段 · {t.preview}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleEditTemplate(t.fileName)}
                      className="px-3 py-1 text-xs border border-border rounded hover:bg-muted"
                    >
                      编辑
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(t.fileName)}
                      className="px-3 py-1 text-xs text-destructive border border-border rounded hover:bg-destructive/10"
                    >
                      删除
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

      {deleteTarget && (
        <ConfirmDialog
          title="删除模板"
          message={`确定删除 "${deleteTarget}" 吗？此操作无法撤销。`}
          confirmText="删除"
          danger
          onConfirm={handleDeleteConfirm}
          onCancel={() => setDeleteTarget(null)}
        />
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
      <h4 className="text-sm font-medium text-text-primary mb-3">目录 → 模板 映射</h4>

      {entries.length > 0 && (
        <div className="space-y-2 mb-4">
          {entries.map(([dir, tmpl]) => (
            <div key={dir} className="flex items-center gap-3 p-3 bg-bg-secondary rounded-md">
              <span className="font-mono text-sm flex-1 text-text-primary">{dir || '(根目录)'}</span>
              <span className="text-muted-foreground">→</span>
              <span className="font-mono text-sm text-text-primary">{tmpl}</span>
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
          <label className="block text-xs text-text-secondary mb-1">目录</label>
          <input
            type="text"
            value={newDir}
            onChange={e => setNewDir(e.target.value)}
            placeholder="例如 journals（空表示根目录）"
            className="w-full px-3 py-2 text-sm rounded-md border border-border bg-bg-secondary text-text-primary"
          />
        </div>
        <div className="flex-1">
          <label className="block text-xs text-text-secondary mb-1">模板</label>
          <select
            value={newTemplate}
            onChange={e => setNewTemplate(e.target.value)}
            className="w-full px-3 py-2 text-sm rounded-md border border-border bg-bg-secondary text-text-primary"
          >
            <option value="">选择模板...</option>
            {templateService.templates.map(t => (
              <option key={t.fileName} value={t.fileName}>{t.fileName}</option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={handleAddMapping}
          disabled={!newDir.trim() || !newTemplate}
          className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50"
        >
          添加
        </button>
      </div>
    </div>
  );
});
