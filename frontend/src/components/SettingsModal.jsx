import React, { useState, useEffect } from 'react';
import { X, Check, Plus, Trash2, Edit2, AlertCircle, Cpu, FileText, RefreshCw, Database, Zap, Loader2, Palette, Sun, Moon } from 'lucide-react';
import { getTemplates, createTemplate, updateTemplate, deleteTemplate, setActiveTemplate } from '../api/templateApi';
import { getEmbeddingStatus, rebuildEmbeddings } from '../api/systemApi';
import { useTheme, MODES } from '../context/ThemeContext';

const TABS = [
  { id: 'appearance', label: '外观', icon: Palette },
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
  const { mode } = useTheme();
  const isLight = mode === 'light';

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
        style={{ backgroundColor: isLight ? '#f8fafc' : 'var(--bg-sidebar)' }}
        className={`w-1/3 border-r flex flex-col p-4 gap-3 overflow-y-auto custom-scrollbar backdrop-blur ${isLight ? 'border-slate-200' : 'border-white/5'}`}>
        <div className={`text-[11px] font-mono uppercase tracking-widest pl-2 mb-1 flex justify-between items-center ${isLight ? 'text-slate-500' : 'text-silverText/40'}`}>
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
          <div className={`text-center text-sm py-10 animate-pulse ${isLight ? 'text-slate-400' : 'text-silverText/40'}`}>加载中...</div>
        ) : templates.map(t => (
          <div
            key={t.id}
            className={`group p-3 rounded-xl border cursor-pointer transition-all flex flex-col gap-2 relative ${
              editingTemplate?.id === t.id
                ? isLight ? 'bg-slate-100 border-slate-300' : 'bg-white/10 border-white/20'
                : isLight ? 'bg-white border-slate-200 hover:bg-slate-50' : 'bg-white/[0.02] border-white/5 hover:bg-white/[0.05]'
            }`}
            onClick={() => {
              setEditingTemplate(t);
              setFormData({ name: t.name, system_prompt: t.system_prompt });
            }}
          >
            <div className="flex items-center justify-between pr-8">
              <div className={`font-medium text-[14px] flex items-center gap-2 ${isLight ? 'text-slate-800' : 'text-white/90'}`}>
                {t.name}
                {t.is_builtin && <span className={`text-[9px] px-1.5 py-0.5 rounded ${isLight ? 'bg-slate-200 text-slate-500' : 'bg-white/10 text-silverText/60'}`}>内置</span>}
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
                  className={`text-[10px] opacity-0 group-hover:opacity-100 px-2 py-0.5 rounded-full transition-all ${isLight ? 'bg-slate-200 hover:bg-slate-300 text-slate-600' : 'bg-white/10 hover:bg-white/20 text-white/80'}`}
                >
                  使用
                </button>
              )}
            </div>

            <div className={`text-[12px] line-clamp-2 pr-2 ${isLight ? 'text-slate-500' : 'text-silverText/40'}`}>
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
              <h3 className={`text-lg font-semibold ${isLight ? 'text-slate-800' : 'text-white/90'}`}>
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
              <label className={`text-[13px] font-medium ${isLight ? 'text-slate-600' : 'text-silverText/60'}`}>模板名称</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                disabled={editingTemplate.is_builtin}
                className={`rounded-xl px-4 py-3 text-sm focus:border-primeAccent/50 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed ${isLight ? 'bg-slate-50 border border-slate-200 text-slate-800' : 'bg-[var(--input-bg)] border border-[var(--glass-border)] text-white'}`}
                placeholder="例如：论文阅读理解"
              />
            </div>

            <div className="flex flex-col gap-2 flex-1 min-h-0">
              <label className={`text-[13px] font-medium flex justify-between ${isLight ? 'text-slate-600' : 'text-silverText/60'}`}>
                <span>提示词内容 (System Prompt)</span>
                <span className="text-[11px] text-primeAccent/70 font-mono hidden md:inline">建议必须保留 JSON 输出约束，以确保数据格式化</span>
              </label>
              <textarea
                value={formData.system_prompt}
                onChange={(e) => setFormData(prev => ({ ...prev, system_prompt: e.target.value }))}
                disabled={editingTemplate.is_builtin}
                className={`rounded-xl px-4 py-3 text-[13px] font-mono leading-relaxed focus:border-primeAccent/50 focus:outline-none flex-1 resize-none disabled:opacity-50 disabled:cursor-not-allowed custom-scrollbar ${isLight ? 'bg-slate-50 border border-slate-200 text-slate-800' : 'bg-[var(--input-bg)] border border-[var(--glass-border)] text-white'}`}
                placeholder="请输入大模型的 System Prompt 定义..."
              />
            </div>

            {!editingTemplate.is_builtin && (
              <div className={`flex justify-end pt-2 border-t ${isLight ? 'border-slate-200' : 'border-white/5'}`}>
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
          <div className={`flex-1 flex flex-col items-center justify-center gap-4 opacity-50 ${isLight ? 'text-slate-400' : 'text-silverText/30'}`}>
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
  const { mode } = useTheme();
  const isLight = mode === 'light';

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
    if (!window.confirm('确定要清空并重建所有向量索引？\n\n此操作会清除现有的文档向量 和 分片向量，然后重新生成。\n过程可能需要数分钟，请查看后端日志了解进度。')) return;
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
      <div className={`flex-1 flex items-center justify-center animate-pulse ${isLight ? 'text-slate-400' : 'text-silverText/40'}`}>
        加载中...
      </div>
    );
  }

  const chunkPerNote = status && status.note_count > 0
    ? Math.round(status.chunk_count / status.note_count)
    : 0;

  return (
    <div className="flex-1 p-8 overflow-y-auto custom-scrollbar">
      <div className="max-w-2xl mx-auto space-y-6">

        {/* Status Cards */}
        <div className="grid grid-cols-2 gap-4">
          <div className={`rounded-xl p-5 ${isLight ? 'bg-slate-50 border border-slate-200' : 'bg-white/[0.03] border border-white/5'}`}>
            <div className={`text-[11px] uppercase tracking-wider mb-3 font-mono ${isLight ? 'text-slate-500' : 'text-silverText/40'}`}>向量扩展</div>
            <div className="flex items-center gap-3">
              {status?.vector_ext ? (
                <>
                  <div className="h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]" />
                  <span className="text-emerald-400 text-sm font-medium">sqlite-vector 已启用</span>
                </>
              ) : (
                <>
                  <div className="h-2.5 w-2.5 rounded-full bg-amber-400" />
                  <span className="text-amber-400 text-sm font-medium">向量检索已禁用</span>
                </>
              )}
            </div>
          </div>

          <div className={`rounded-xl p-5 ${isLight ? 'bg-slate-50 border border-slate-200' : 'bg-white/[0.03] border border-white/5'}`}>
            <div className={`text-[11px] uppercase tracking-wider mb-3 font-mono ${isLight ? 'text-slate-500' : 'text-silverText/40'}`}>Embedding 模型</div>
            <div className="flex items-center gap-2">
              <Zap size={14} className="text-primeAccent" />
              <span className={`text-sm font-mono ${isLight ? 'text-slate-700' : 'text-white/80'}`}>{status?.model_id || '-'}</span>
            </div>
          </div>
        </div>

        {/* Chunk Progress Card */}
        <div className={`rounded-xl p-5 space-y-4 ${isLight ? 'bg-slate-50 border border-slate-200' : 'bg-white/[0.03] border border-white/5'}`}>
          <div className="flex items-center justify-between">
            <div className={`text-[11px] uppercase tracking-wider font-mono ${isLight ? 'text-slate-500' : 'text-silverText/40'}`}>分片向量索引</div>
            <span className={`text-sm font-mono ${isLight ? 'text-slate-600' : 'text-white/60'}`}>
              {status?.chunk_count ?? 0} 个分片 / {status?.note_count ?? 0} 篇笔记
            </span>
          </div>
          <div className={`text-[13px] ${isLight ? 'text-slate-500' : 'text-silverText/60'}`}>
            平均每篇 {chunkPerNote} 个分片 · 粒度 {status?.chunk_max_size || 500} 字 · 上下文限制 {status?.rag_context_limit || 12000} 字
          </div>
        </div>

        {/* Rebuild Action */}
        <div className={`rounded-xl p-5 space-y-4 ${isLight ? 'bg-slate-50 border border-slate-200' : 'bg-white/[0.03] border border-white/5'}`}>
          <div className="flex items-start justify-between">
            <div>
              <h4 className={`font-medium text-[15px] mb-1.5 ${isLight ? 'text-slate-800' : 'text-white/90'}`}>全量重建向量索引</h4>
              <p className={`text-[13px] leading-relaxed ${isLight ? 'text-slate-500' : 'text-silverText/40'}`}>
                清空并重建文档向量 + 分片向量索引。<br />
                适用于切换模型、修复数据不一致等场景。
              </p>
            </div>
          </div>

          <button
            onClick={handleRebuild}
            disabled={rebuilding}
            className={`w-full flex items-center justify-center gap-2.5 py-3 rounded-xl font-semibold text-sm transition-all ${
              rebuilding
                ? isLight ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-white/5 text-silverText/40 cursor-not-allowed'
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

// ============ Tab: 外观设置 ============
function AppearanceTab() {
  const { theme, mode, setTheme, setMode, themes } = useTheme();
  const isLight = mode === 'light';

  return (
    <div className="flex-1 p-8 overflow-y-auto custom-scrollbar">
      <div className="max-w-xl mx-auto space-y-8">
        {/* 配色风格选择 */}
        <div>
          <h3 className={`text-[13px] font-mono uppercase tracking-wider mb-4 ${isLight ? 'text-slate-500' : 'text-silverText/40'}`}>配色风格</h3>
          <div className="grid grid-cols-3 gap-4">
            {themes.map((t) => (
              <button
                key={t.id}
                onClick={() => setTheme(t.id)}
                className={`group relative p-4 rounded-xl border transition-all ${
                  theme === t.id
                    ? isLight ? 'bg-slate-100 border-slate-300 ring-2 ring-[var(--prime-accent)]' : 'bg-white/10 border-white/20 ring-2 ring-[var(--prime-accent)]'
                    : isLight ? 'bg-white border-slate-200 hover:bg-slate-50' : 'bg-white/[0.02] border-white/5 hover:bg-white/[0.05] hover:border-white/10'
                }`}
              >
                {/* 预览色块 */}
                <div className="flex items-center justify-center mb-3">
                  <div
                    className="w-12 h-12 rounded-lg shadow-lg"
                    style={{
                      background: `linear-gradient(135deg, ${t.accent}, ${t.accent}88)`,
                      boxShadow: `0 4px 12px ${t.accent}40`,
                    }}
                  />
                </div>
                {/* 名称 */}
                <div className="text-center">
                  <div className={`text-[14px] font-medium ${isLight ? 'text-slate-800' : 'text-white/90'}`}>{t.name}</div>
                  <div className={`text-[11px] mt-1 ${isLight ? 'text-slate-500' : 'text-silverText/40'}`}>{t.description}</div>
                </div>
                {/* 激活指示 */}
                {theme === t.id && (
                  <div className="absolute top-2 right-2">
                    <Check size={14} className="text-[var(--prime-accent)]" />
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* 亮度模式切换 */}
        <div>
          <h3 className={`text-[13px] font-mono uppercase tracking-wider mb-4 ${isLight ? 'text-slate-500' : 'text-silverText/40'}`}>亮度模式</h3>
          <div className="flex gap-4">
            <button
              onClick={() => setMode('dark')}
              className={`flex items-center gap-3 px-5 py-3 rounded-xl border transition-all ${
                mode === 'dark'
                  ? isLight ? 'bg-slate-100 border-slate-300 ring-2 ring-[var(--prime-accent)]' : 'bg-white/10 border-white/20 ring-2 ring-[var(--prime-accent)]'
                  : isLight ? 'bg-white border-slate-200 hover:bg-slate-50' : 'bg-white/[0.02] border-white/5 hover:bg-white/[0.05]'
              }`}
            >
              <Moon size={18} className={isLight ? 'text-slate-500' : 'text-silverText/60'} />
              <span className={`text-[14px] font-medium ${isLight ? 'text-slate-800' : 'text-white/90'}`}>暗色模式</span>
              {mode === 'dark' && <Check size={14} className="text-[var(--prime-accent)]" />}
            </button>
            <button
              onClick={() => setMode('light')}
              className={`flex items-center gap-3 px-5 py-3 rounded-xl border transition-all ${
                mode === 'light'
                  ? isLight ? 'bg-slate-100 border-slate-300 ring-2 ring-[var(--prime-accent)]' : 'bg-white/10 border-white/20 ring-2 ring-[var(--prime-accent)]'
                  : isLight ? 'bg-white border-slate-200 hover:bg-slate-50' : 'bg-white/[0.02] border-white/5 hover:bg-white/[0.05]'
              }`}
            >
              <Sun size={18} className={isLight ? 'text-slate-500' : 'text-silverText/60'} />
              <span className={`text-[14px] font-medium ${isLight ? 'text-slate-800' : 'text-white/90'}`}>亮色模式</span>
              {mode === 'light' && <Check size={14} className="text-[var(--prime-accent)]" />}
            </button>
          </div>
        </div>

        {/* 当前配置显示 */}
        <div className={`rounded-xl p-4 ${isLight ? 'bg-slate-50 border border-slate-200' : 'bg-white/[0.03] border border-white/5'}`}>
          <div className={`text-[11px] uppercase tracking-wider mb-2 font-mono ${isLight ? 'text-slate-500' : 'text-silverText/40'}`}>当前配置</div>
          <div className={`text-[13px] ${isLight ? 'text-slate-700' : 'text-white/80'}`}>
            {themes.find(t => t.id === theme)?.name} · {MODES.find(m => m.id === mode)?.name}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============ Main Settings Modal ============
export default function SettingsModal({ onClose }) {
  const [activeTab, setActiveTab] = useState('appearance');
  const { mode } = useTheme();
  const isLight = mode === 'light';

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div
        style={{ backgroundColor: 'var(--bg-modal)' }}
        className={`backdrop-blur-xl border rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 ${isLight ? 'border-slate-200' : 'border-white/10'}`}>

        {/* Header with Tabs */}
        <div
          style={{ backgroundColor: 'var(--bg-header)' }}
          className={`flex items-center justify-between px-6 py-3 border-b backdrop-blur ${isLight ? 'border-slate-200' : 'border-white/5'}`}>
          <div className="flex items-center gap-1">
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-medium transition-all ${
                  activeTab === tab.id
                    ? isLight ? 'bg-slate-200 text-slate-800' : 'bg-white/10 text-white'
                    : isLight ? 'text-slate-500 hover:text-slate-800 hover:bg-slate-100' : 'text-silverText/50 hover:text-white/80 hover:bg-white/5'
                }`}
              >
                <tab.icon size={15} />
                {tab.label}
              </button>
            ))}
          </div>
          <button onClick={onClose} className={`p-2 rounded-lg transition-colors ${isLight ? 'text-slate-500 hover:text-slate-800 hover:bg-slate-100' : 'text-silverText/50 hover:text-white hover:bg-white/5'}`}>
            <X size={20} />
          </button>
        </div>

        {/* Tab Content */}
        <div className="flex flex-1 overflow-hidden min-h-[400px]">
          {activeTab === 'appearance' && <AppearanceTab />}
          {activeTab === 'templates' && <TemplatesTab />}
          {activeTab === 'vector' && <VectorTab />}
        </div>

      </div>
    </div>
  );
}
