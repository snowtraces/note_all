import React, { useState, useEffect } from 'react';
import { Plus, Check, Trash2, AlertCircle, Edit2 } from 'lucide-react';
import { getTemplates, createTemplate, updateTemplate, deleteTemplate, setActiveTemplate } from '../../api/templateApi';
import { useTheme } from '../../context/ThemeContext';

export default function TemplatesTab() {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [formData, setFormData] = useState({ name: '', system_prompt: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { mode } = useTheme();

  useEffect(() => { loadTemplates(); }, []);

  const loadTemplates = async () => {
    setLoading(true);
    try {
      const data = await getTemplates();
      setTemplates(data || []);
    } catch (e) {
      console.error(e);
      alert('加载模板失败');
    }
    setLoading(false);
  };

  const handleCreateOrUpdate = async () => {
    if (!formData.name.trim() || !formData.system_prompt.trim()) {
      alert('模板名称和提示词内容不能为空');
      return;
    }
    setIsSubmitting(true);
    try {
      if (editingTemplate && editingTemplate.id) {
        await updateTemplate(editingTemplate.id, formData);
      } else {
        await createTemplate(formData);
      }
      setEditingTemplate(null);
      setFormData({ name: '', system_prompt: '' });
      await loadTemplates();
    } catch (e) {
      console.error(e);
      alert(editingTemplate ? '更新模板失败' : '创建模板失败');
    }
    setIsSubmitting(false);
  };

  const handleDelete = async (t) => {
    if (t.is_builtin) { alert("内置模板不可删除"); return; }
    if (!window.confirm(`确定要删除模板 [${t.name}] 吗？`)) return;
    try {
      await deleteTemplate(t.id);
      await loadTemplates();
    } catch (e) {
      console.error(e);
      alert('删除失败');
    }
  };

  const handleSetActive = async (id) => {
    try {
      await setActiveTemplate(id);
      await loadTemplates();
    } catch (e) {
      console.error(e);
      alert('激活失败');
    }
  };

  return (
    <div className="flex flex-1 overflow-hidden min-h-[400px]">
      {/* List Sidebar */}
      <div
        style={{ backgroundColor: 'var(--bg-sidebar)' }}
        className={`w-1/3 border-r flex flex-col p-4 gap-3 overflow-y-auto custom-scrollbar backdrop-blur border-borderSubtle`}>
        <div className={`text-[11px] font-mono uppercase tracking-widest pl-2 mb-1 flex justify-between items-center text-textTertiary`}>
          <span>可用模板</span>
          <button
            onClick={() => {
              const defaultTpl = templates.find(t => t.name.includes("通用抽取"));
              setEditingTemplate({});
              setFormData({ name: '', system_prompt: defaultTpl ? defaultTpl.system_prompt : '' });
            }}
            className="text-primeAccent hover:text-primeAccent/70 flex items-center gap-1 bg-primeAccent/10 px-2 py-1 rounded transition-colors"
            title="新建模板"
          >
            <Plus size={12} /> 新建
          </button>
        </div>

        {loading ? (
          <div className="text-center text-sm py-10 animate-pulse text-textTertiary">加载中...</div>
        ) : templates.map(t => (
          <div
            key={t.id}
            className={`group p-3 rounded-xl border cursor-pointer transition-all flex flex-col gap-2 relative ${editingTemplate?.id === t.id
              ? 'bg-bgHover border-borderSubtle'
              : 'bg-bgSubtle border-borderSubtle hover:bg-bgHover'
              }`}
            onClick={() => {
              setEditingTemplate(t);
              setFormData({ name: t.name, system_prompt: t.system_prompt });
            }}
          >
            <div className="flex items-center justify-between pr-8 overflow-hidden">
              <div className="font-medium text-[14px] flex items-center gap-2 flex-1 min-w-0 text-textPrimary">
                <span className="truncate">{t.name}</span>
                {t.is_builtin && <span className="shrink-0 text-[9px] px-1.5 py-0.5 rounded bg-bgHover text-textTertiary">内置</span>}
              </div>
            </div>

            <div className="absolute right-3 top-3 flex items-center gap-1">
              {t.is_active ? (
                <div className="bg-primeAccent/20 text-primeAccent text-[10px] px-2 py-0.5 rounded-full font-medium flex items-center gap-1 pointer-events-none">
                  <Check size={12} /> 激活中
                </div>
              ) : (
                <button
                  onClick={(e) => { e.stopPropagation(); handleSetActive(t.id); }}
                  className="text-[10px] opacity-0 group-hover:opacity-100 px-2 py-0.5 rounded-full transition-all bg-bgHover hover:bg-bgHover text-textSecondary"
                >
                  使用
                </button>
              )}
            </div>

            <div className="text-[12px] line-clamp-2 pr-2 text-textTertiary">
              {t.system_prompt}
            </div>
          </div>
        ))}
      </div>

      {/* Edit Panel */}
      <div
        style={{ backgroundColor: 'var(--bg-modal)' }}
        className={`flex-1 p-6 flex flex-col backdrop-blur`}>
        {editingTemplate !== null ? (
          <div className="flex flex-col h-full gap-5">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-textPrimary">
                {editingTemplate.id ? '编辑模板' : '创建新模板'}
              </h3>
              {editingTemplate.id && !editingTemplate.is_builtin && (
                <button
                  onClick={(e) => { e.stopPropagation(); handleDelete(editingTemplate); }}
                  className="text-red-400 hover:text-red-300 flex items-center gap-1 text-sm bg-red-400/10 hover:bg-red-400/20 px-3 py-1.5 rounded-lg transition-colors"
                >
                  <Trash2 size={14} /> 删除模板
                </button>
              )}
            </div>

            {editingTemplate.is_builtin && (
              <div className="bg-amber-500/10 border border-amber-500/20 text-amber-500/80 p-3 rounded-lg text-[13px] flex gap-2 items-start">
                <AlertCircle size={16} className="shrink-0 mt-0.5" />
                <span>系统内置模板是受保护的，不可修改名称和内容，不可删除。如果你想微调，建议新建一个模板然后复制下方提示词修改。</span>
              </div>
            )}

            <div className="flex flex-col gap-2">
              <label className="text-[13px] font-medium text-textTertiary">模板名称</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                disabled={editingTemplate.is_builtin}
                className="rounded-xl px-4 py-3 text-sm focus:border-primeAccent/50 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed bg-[var(--input-bg)] border border-[var(--glass-border)] text-textPrimary"
                placeholder="例如：论文阅读理解"
              />
            </div>

            <div className="flex flex-col gap-2 flex-1 min-h-0">
              <label className="text-[13px] font-medium flex justify-between text-textTertiary">
                <span>提示词内容 (System Prompt)</span>
                <span className="text-[11px] text-primeAccent/70 font-mono hidden md:inline">建议必须保留 JSON 输出约束，以确保数据格式化</span>
              </label>
              <textarea
                value={formData.system_prompt}
                onChange={(e) => setFormData(prev => ({ ...prev, system_prompt: e.target.value }))}
                disabled={editingTemplate.is_builtin}
                className="rounded-xl px-4 py-3 text-[13px] font-mono leading-relaxed focus:border-primeAccent/50 focus:outline-none flex-1 resize-none disabled:opacity-50 disabled:cursor-not-allowed custom-scrollbar bg-[var(--input-bg)] border border-[var(--glass-border)] text-textPrimary"
                placeholder="请输入大模型的 System Prompt 定义..."
              />
            </div>

            {!editingTemplate.is_builtin && (
              <div className="flex justify-end pt-2 border-t border-borderSubtle">
                <button
                  onClick={handleCreateOrUpdate}
                  disabled={isSubmitting}
                  className="bg-primeAccent text-[#111] font-bold px-6 py-2.5 rounded-lg hover:brightness-110 flex items-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? '保存中...' : (editingTemplate.id ? '保存修改' : '确认创建')}
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 opacity-50 text-textMuted">
            <Edit2 size={48} strokeWidth={1} />
            <p className="text-sm">在左侧选择一个模板进行查看或编辑，或点击新建</p>
          </div>
        )}
      </div>
    </div>
  );
}
