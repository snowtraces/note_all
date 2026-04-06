import React, { useState, useEffect } from 'react';
import { BrainCircuit, X, ArchiveRestore, Trash2, Image as ImageIcon, FileText, Code, Save, ExternalLink, Link, Zap, Share2, RefreshCw, CheckCircle2, XCircle, ClipboardEdit, Eye } from 'lucide-react';
import { getAuthToken } from '../api/authApi';
import MarkdownRenderer from './MarkdownRenderer';
import { getRelatedNotes, reprocessNote, setNoteCategory, resetNoteCategory } from '../api/noteApi';
import { getTemplates } from '../api/templateApi';
import { Globe, User, Clock, CheckCircle, Info } from 'lucide-react';
import ShareModal from './ShareModal';

export default function FragmentDetail({
  item,
  showTrash,
  handleRestore,
  handleDelete,
  setSelectedItem,
  setPreviewImage,
  handleUpdateText,
  handleUpdateStatus
}) {
  const [isRawMode, setIsRawMode] = useState(false);
  const [editValue, setEditValue] = useState(item?.ocr_text || '');
  const [isSaving, setIsSaving] = useState(false);
  const [isReprocessing, setIsReprocessing] = useState(false);
  const [relatedItems, setRelatedItems] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [reprocessStatus, setReprocessStatus] = useState(null); 
  const [annotation, setAnnotation] = useState(item?.user_comment || '');
  const [isSubmittingStatus, setIsSubmittingStatus] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);

  const token = getAuthToken();
  const fileUrl = item?.storage_id ? `/api/file/${item.storage_id}${token ? `?token=${token}` : ''}` : '';

  useEffect(() => {
    setEditValue(item?.ocr_text || '');
    setAnnotation(item?.user_comment || '');
    if (item?.id) loadRelated();
    setReprocessStatus(null);
  }, [item]);

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    try {
      const data = await getTemplates();
      setTemplates(data || []);
      const active = data.find(t => t.is_active);
      if (active) setSelectedTemplateId(active.id);
    } catch (e) { console.error(e); }
  };

  const loadRelated = async () => {
    try {
      const data = await getRelatedNotes(item.id);
      setRelatedItems(data || []);
    } catch (e) { console.error(e); }
  };

  const onSave = async () => {
    if (!item) return;
    setIsSaving(true);
    try {
      await handleUpdateText(item.id, editValue);
      setSelectedItem(prev => ({ ...prev, ocr_text: editValue }));
    } catch(e) { console.error(e); }
    setIsSaving(false);
  };

  const handleReprocess = async () => {
    if (!item) return;
    setIsReprocessing(true);
    try {
      await reprocessNote(item.id, selectedTemplateId);
      setReprocessStatus({ type: 'success', msg: '已触发更新...' });
    } catch (e) {
      setReprocessStatus({ type: 'error', msg: '失败: ' + e.message });
    }
    setIsReprocessing(false);
  };

  const changeCategory = async (cat) => {
    try {
      await setNoteCategory(item.id, cat, null);
      setSelectedItem(prev => ({ ...prev, category_type: 'doc', doc_sub_type: cat }));
    } catch(e) { console.error(e); }
  };

  const resetCategory = async () => {
    try {
      await resetNoteCategory(item.id);
      setSelectedItem(prev => ({ ...prev, category_type: 'fragment', doc_sub_type: '' }));
    } catch(e) { console.error(e); }
  };

  if (!item) return null;

  return (
    <div className="w-full h-full flex flex-col animate-in fade-in zoom-in-95 duration-300">
      {/* Top Bar */}
      <div className="flex items-center justify-between px-5 py-2.5 border-b border-white/5 bg-[#0a0a0a] shrink-0">
        <div className="font-medium text-white/80 tracking-wide flex items-center gap-2 text-[15px]">
          <BrainCircuit size={18} className="text-primeAccent" /> 碎片的完整映射
        </div>
        <div className="flex gap-3">
          {showTrash ? (
            <>
              <button 
                onClick={() => handleRestore(item.id)} 
                className="px-4 py-1.5 bg-primeAccent/10 text-primeAccent hover:bg-primeAccent/20 transition-colors rounded-lg flex items-center gap-1.5 text-xs font-medium border border-primeAccent/20"
              >
                <ArchiveRestore size={14} /> 撤销
              </button>
              <button 
                onClick={() => handleDelete(item.id, true)} 
                className="px-4 py-1.5 bg-red-500/10 text-red-500 hover:bg-red-500/20 rounded-lg flex items-center gap-1.5 text-xs font-medium border border-red-500/20"
              >
                <Trash2 size={14} /> 彻底删除
              </button>
            </>
          ) : (
            <button 
              onClick={() => handleDelete(item.id)} 
              className="px-4 py-1.5 bg-red-500/5 text-red-500/60 hover:text-red-500 transition-colors rounded-lg flex items-center gap-1.5 text-xs font-medium border border-red-500/10"
            >
              <Trash2 size={14} /> 丢弃
            </button>
          )}

          {!showTrash && (
            <button 
              onClick={() => setShowShareModal(true)} 
              className="px-4 py-1.5 bg-primeAccent/5 text-primeAccent/60 hover:bg-primeAccent/10 hover:text-primeAccent transition-colors rounded-lg flex items-center gap-1.5 text-xs font-medium border border-primeAccent/10"
            >
              <Share2 size={14} /> 分享
            </button>
          )}
          <button 
            onClick={() => setSelectedItem(null)}
            className="p-1.5 bg-white/5 hover:bg-white/10 rounded-full text-white/60 hover:text-white transition-colors ml-2"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden flex-col lg:flex-row">
        <div className="flex-1 p-5 lg:p-6 overflow-y-auto custom-scrollbar lg:border-r border-white/5 bg-[#0a0a0a]">
          {/* AI Summary */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[10px] text-silverText/30 uppercase tracking-widest font-mono flex items-center gap-2 bg-white/[0.03] px-3 py-1 rounded-full border border-white/5">
                <BrainCircuit size={12} /> AI 智能总结
              </h3>
              <div className="flex items-center gap-2">
                <select 
                  value={selectedTemplateId} 
                  onChange={(e) => setSelectedTemplateId(e.target.value)}
                  className="bg-black/30 border border-white/10 text-silverText/60 text-[10px] rounded px-2 py-1 outline-none"
                >
                  <option value="">(默认模板)</option>
                  {templates.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
                <button
                  onClick={handleReprocess}
                  className="p-1 text-primeAccent/60 hover:text-primeAccent"
                  title="重新处理"
                >
                  <RefreshCw size={14} className={isReprocessing ? 'animate-spin' : ''} />
                </button>
              </div>
            </div>
            <div className="text-silverText/90 text-sm leading-relaxed bg-white/[0.02] p-5 rounded-2xl border border-white/5 ai-summary-markdown shadow-inner">
              <MarkdownRenderer content={item.ai_summary || "正在提取语义..."} />
            </div>
          </div>

          {/* OCR Content */}
          <div>
            <div className="flex items-center justify-between mb-4 border-b border-white/5 pb-2">
              <h3 className="text-[10px] text-primeAccent font-bold uppercase tracking-widest flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-primeAccent animate-pulse"></span> 
                {item.original_url ? '源头正文片段' : '核心视觉识别原文'}
              </h3>
              <div className="flex items-center gap-2">
                {item.original_url && (
                  <a href={item.original_url} target="_blank" rel="noreferrer" className="p-1 text-primeAccent/40 hover:text-primeAccent"><ExternalLink size={14}/></a>
                )}
                <button onClick={() => setIsRawMode(!isRawMode)} className="text-[10px] text-silverText/30 hover:text-white uppercase transition-colors">
                  {isRawMode ? '预览模式' : '编辑源码'}
                </button>
              </div>
            </div>
            <div className="bg-[#111] p-5 rounded-2xl border border-white/5 min-h-[300px]">
              {isRawMode ? (
                <div className="relative h-full">
                  <textarea 
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    className="w-full h-full min-h-[400px] bg-transparent outline-none font-mono text-sm text-silverText/70 leading-relaxed resize-none"
                  />
                  {editValue !== item.ocr_text && (
                    <button onClick={onSave} className="absolute bottom-0 right-0 bg-primeAccent text-black font-bold px-4 py-2 rounded-lg text-xs flex items-center gap-2 shadow-xl hover:scale-105 transition-all">
                      <Save size={14}/> {isSaving ? '正在保存...' : '保存修改'}
                    </button>
                  )}
                </div>
              ) : (
                <div className="markdown-ocr opacity-90 leading-relaxed font-light text-silverText/90">
                  <MarkdownRenderer content={item.ocr_text || "无可用文本内容"} />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="w-[300px] shrink-0 bg-[#0f0f0f]/80 flex flex-col h-full border-l border-white/5">
          <div className="flex-1 overflow-y-auto p-5 custom-scrollbar flex flex-col gap-6">
            <div className="w-full h-[180px] bg-[#000] border border-white/5 rounded-2xl flex items-center justify-center relative overflow-hidden group shadow-2xl">
              {item.file_type?.includes('image') ? (
                <img src={fileUrl} alt="source" className="max-w-full max-h-full object-contain cursor-zoom-in" onClick={() => setPreviewImage(fileUrl)} />
              ) : (
                <div className="flex flex-col items-center gap-3 text-white/20">
                  <ImageIcon size={32} />
                  <span className="text-[10px] uppercase font-mono tracking-widest">{item.file_type || 'DATA'}</span>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-5">
              <div>
                <div className="text-[10px] text-silverText/30 uppercase tracking-widest font-mono mb-3">语义印记 (Tags)</div>
                <div className="flex flex-wrap gap-1.5">
                  {(item.ai_tags || '').split(',').map((tag, idx) => tag.trim() && (
                    <span key={idx} className="bg-white/5 text-silverText/70 border border-white/5 px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors">
                      #{tag.trim()}
                    </span>
                  ))}
                </div>
              </div>

              <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-4 flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-silverText/30 uppercase tracking-widest font-bold">层级分类</span>
                  {item.category_type !== 'fragment' && (
                    <button onClick={resetCategory} className="text-[9px] text-red-500/40 hover:text-red-500">重置</button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: 'contract', label: '合约' },
                    { id: 'invoice', label: '票据' },
                    { id: 'certificate', label: '证照' },
                    { id: 'medical', label: '医疗' },
                    { id: 'insurance', label: '保险' },
                  ].map(cat => (
                    <button 
                      key={cat.id} 
                      onClick={() => changeCategory(cat.id)}
                      className={`py-2 rounded-lg text-[10px] border transition-all ${item.doc_sub_type === cat.id ? 'bg-primeAccent/20 border-primeAccent text-primeAccent' : 'bg-white/5 border-white/5 text-silverText/40 hover:bg-white/10'}`}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>
              </div>

              {relatedItems.length > 0 && (
                <div>
                  <div className="text-[10px] text-silverText/30 uppercase tracking-widest font-mono mb-3 flex items-center gap-2">
                    <Link size={10} className="text-primeAccent" /> 联想触发
                  </div>
                  <div className="space-y-2.5">
                    {relatedItems.slice(0, 3).map(rel => (
                      <div key={rel.id} onClick={() => setSelectedItem(rel)} className="p-3 bg-white/[0.02] border border-white/5 rounded-xl hover:border-primeAccent/20 hover:bg-primeAccent/5 transition-all cursor-pointer group">
                        <div className="text-[11px] text-silverText/50 group-hover:text-white transition-colors line-clamp-2 leading-relaxed">
                          {rel.ai_summary || rel.original_name}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="p-5 border-t border-white/5 bg-[#0a0a0a] flex flex-col gap-4">
            <textarea
              value={annotation}
              onChange={(e) => setAnnotation(e.target.value)}
              placeholder="记录思考与回响..."
              className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-[12px] text-white/80 focus:border-primeAccent/30 min-h-[100px] resize-none outline-none transition-all"
            />
            <button
              onClick={async () => {
                setIsSubmittingStatus(true);
                await handleUpdateStatus(item.id, 'done', annotation);
                setIsSubmittingStatus(false);
              }}
              disabled={isSubmittingStatus}
              className={`w-full py-3 rounded-xl flex items-center justify-center gap-2 text-xs font-bold transition-all ${item.status === 'done' ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-primeAccent text-black hover:scale-[1.02]'}`}
            >
              {isSubmittingStatus ? <RefreshCw size={14} className="animate-spin" /> : item.status === 'done' ? <><CheckCircle size={14}/> 已收纳至硬库</> : <><Eye size={14}/> 已读并保存</>}
            </button>
          </div>
        </div>
      </div>
      {showShareModal && <ShareModal item={item} onClose={() => setShowShareModal(false)} />}
    </div>
  );
}
