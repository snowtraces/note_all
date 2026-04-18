import React, { useState, useEffect } from 'react';
import { X, Check, Plus, Trash2, Edit2, AlertCircle, Cpu, FileText, RefreshCw, Database, Zap, Loader2 } from 'lucide-react';
import { getTemplates, createTemplate, updateTemplate, deleteTemplate, setActiveTemplate } from '../api/templateApi';
import { getEmbeddingStatus, rebuildEmbeddings } from '../api/systemApi';

const TABS = [
  { id: 'templates', label: 'AI 模板', icon: FileText },
  { id: 'vector', label: '向量引擎', icon: Cpu },
];

// ============ Tab: AI 模板管理 ============
function TemplatesTab() {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [formData, setFormData] = useState({ name: '', system_prompt: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);

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
      <div className="w-1/3 border-r border-white/5 bg-[#0a0a0a] flex flex-col p-4 gap-3 overflow-y-auto custom-scrollbar">
        <div className="text-[11px] font-mono text-silverText/40 uppercase tracking-widest pl-2 mb-1 flex justify-between items-center">
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
          <div className="text-center text-sm py-10 text-silverText/40 animate-pulse">加载中...</div>
        ) : templates.map(t => (
          <div
            key={t.id}
            className={`group p-3 rounded-xl border cursor-pointer transition-all flex flex-col gap-2 relative ${
              editingTemplate?.id === t.id ? 'bg-white/10 border-white/20' : 'bg-white/[0.02] border-white/5 hover:bg-white/[0.05]'
            }`}
            onClick={() => {
              setEditingTemplate(t);
              setFormData({ name: t.name, system_prompt: t.system_prompt });
            }}
          >
            <div className="flex items-center justify-between pr-8">
              <div className="font-medium text-white/90 text-[14px] flex items-center gap-2">
                {t.name}
                {t.is_builtin && <span className="text-[9px] bg-white/10 px-1.5 py-0.5 rounded text-silverText/60">内置</span>}
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
                  className="text-[10px] opacity-0 group-hover:opacity-100 bg-white/10 hover:bg-white/20 text-white/80 px-2 py-0.5 rounded-full transition-all"
                >
                  使用
                </button>
              )}
            </div>

            <div className="text-[12px] text-silverText/40 line-clamp-2 pr-2">
              {t.system_prompt}
            </div>
          </div>
        ))}
      </div>

      {/* Edit Panel */}
      <div className="flex-1 bg-[#111] p-6 flex flex-col">
        {editingTemplate !== null ? (
          <div className="flex flex-col h-full gap-5">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white/90">
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
              <label className="text-[13px] text-silverText/60 font-medium">模板名称</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                disabled={editingTemplate.is_builtin}
                className="bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:border-primeAccent/50 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                placeholder="例如：论文阅读理解"
              />
            </div>

            <div className="flex flex-col gap-2 flex-1 min-h-0">
              <label className="text-[13px] text-silverText/60 font-medium flex justify-between">
                <span>提示词内容 (System Prompt)</span>
                <span className="text-[11px] text-primeAccent/70 font-mono hidden md:inline">建议必须保留 JSON 输出约束，以确保数据格式化</span>
              </label>
              <textarea
                value={formData.system_prompt}
                onChange={(e) => setFormData(prev => ({ ...prev, system_prompt: e.target.value }))}
                disabled={editingTemplate.is_builtin}
                className="bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-[13px] font-mono leading-relaxed text-white focus:border-primeAccent/50 focus:outline-none flex-1 resize-none disabled:opacity-50 disabled:cursor-not-allowed custom-scrollbar"
                placeholder="请输入大模型的 System Prompt 定义..."
              />
            </div>

            {!editingTemplate.is_builtin && (
              <div className="flex justify-end pt-2 border-t border-white/5">
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
          <div className="flex-1 flex flex-col items-center justify-center text-silverText/30 gap-4 opacity-50">
            <Edit2 size={48} strokeWidth={1} />
            <p className="text-sm">在左侧选择一个模板进行查看或编辑，或点击新建</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ============ Tab: 向量引擎 ============
function VectorTab() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [rebuilding, setRebuilding] = useState(false);

  const loadStatus = async () => {
    try {
      const data = await getEmbeddingStatus();
      setStatus(data);
      setRebuilding(data.is_rebuilding);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadStatus();
    const timer = setInterval(loadStatus, 3000);
    return () => clearInterval(timer);
  }, []);

  const handleRebuild = async () => {
    if (!window.confirm('确定要清空并重建所有向量索引？\n\n此操作会清除现有向量数据，然后调用 Embedding API 逐条重新生成。过程可能需要数分钟。')) return;
    try {
      setRebuilding(true);
      await rebuildEmbeddings();
    } catch (e) {
      alert(e.message);
      setRebuilding(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-silverText/40 animate-pulse">
        加载中...
      </div>
    );
  }

  const progress = status && status.note_count > 0
    ? Math.round((status.embedding_count / status.note_count) * 100)
    : 0;

  return (
    <div className="flex-1 p-8 overflow-y-auto custom-scrollbar">
      <div className="max-w-2xl mx-auto space-y-6">

        {/* Status Cards */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white/[0.03] border border-white/5 rounded-xl p-5">
            <div className="text-[11px] text-silverText/40 uppercase tracking-wider mb-3 font-mono">向量扩展</div>
            <div className="flex items-center gap-3">
              {status?.vector_ext ? (
                <>
                  <div className="h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]" />
                  <span className="text-emerald-400 text-sm font-medium">sqlite-vector 已启用</span>
                </>
              ) : (
                <>
                  <div className="h-2.5 w-2.5 rounded-full bg-amber-400" />
                  <span className="text-amber-400 text-sm font-medium">回退模式 (Go 内存计算)</span>
                </>
              )}
            </div>
          </div>

          <div className="bg-white/[0.03] border border-white/5 rounded-xl p-5">
            <div className="text-[11px] text-silverText/40 uppercase tracking-wider mb-3 font-mono">Embedding 模型</div>
            <div className="flex items-center gap-2">
              <Zap size={14} className="text-primeAccent" />
              <span className="text-white/80 text-sm font-mono">{status?.model_id || '-'}</span>
            </div>
          </div>
        </div>

        {/* Progress Card */}
        <div className="bg-white/[0.03] border border-white/5 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-[11px] text-silverText/40 uppercase tracking-wider font-mono">向量索引覆盖率</div>
            <span className="text-white/60 text-sm font-mono">
              {status?.embedding_count ?? 0} / {status?.note_count ?? 0}
            </span>
          </div>
          <div className="h-2 bg-white/5 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-primeAccent/80 to-primeAccent rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="text-right text-[12px] text-silverText/40">{progress}%</div>
        </div>

        {/* Rebuild Action */}
        <div className="bg-white/[0.03] border border-white/5 rounded-xl p-5 space-y-4">
          <div className="flex items-start justify-between">
            <div>
              <h4 className="text-white/90 font-medium text-[15px] mb-1.5">全量重建向量索引</h4>
              <p className="text-[13px] text-silverText/40 leading-relaxed">
                清空现有向量数据，使用当前 Embedding 模型对所有笔记重新生成向量。<br />
                适用于切换模型、修复数据不一致等场景。
              </p>
            </div>
          </div>

          <button
            onClick={handleRebuild}
            disabled={rebuilding}
            className={`w-full flex items-center justify-center gap-2.5 py-3 rounded-xl font-semibold text-sm transition-all ${
              rebuilding
                ? 'bg-white/5 text-silverText/40 cursor-not-allowed'
                : 'bg-primeAccent/10 text-primeAccent hover:bg-primeAccent/20 border border-primeAccent/20'
            }`}
          >
            {rebuilding ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                重建进行中，请查看后端日志...
              </>
            ) : (
              <>
                <RefreshCw size={16} />
                清空并重建所有向量
              </>
            )}
          </button>
        </div>

      </div>
    </div>
  );
}

// ============ Main Settings Modal ============
export default function SettingsModal({ onClose }) {
  const [activeTab, setActiveTab] = useState('templates');

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-[#111] border border-white/10 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">

        {/* Header with Tabs */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-white/5 bg-[#1a1a1a]">
          <div className="flex items-center gap-1">
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-medium transition-all ${
                  activeTab === tab.id
                    ? 'bg-white/10 text-white'
                    : 'text-silverText/50 hover:text-white/80 hover:bg-white/5'
                }`}
              >
                <tab.icon size={15} />
                {tab.label}
              </button>
            ))}
          </div>
          <button onClick={onClose} className="p-2 text-silverText/50 hover:text-white rounded-lg hover:bg-white/5 transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Tab Content */}
        <div className="flex flex-1 overflow-hidden min-h-[400px]">
          {activeTab === 'templates' && <TemplatesTab />}
          {activeTab === 'vector' && <VectorTab />}
        </div>

      </div>
    </div>
  );
}
