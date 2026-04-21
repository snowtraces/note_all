import React, { useState, useEffect, useRef } from 'react';
import { BrainCircuit, X, ArchiveRestore, Trash2, Image as ImageIcon, FileText, Code, Save, ExternalLink, Link, Zap, Share2, RefreshCw, CheckCircle2, XCircle, ClipboardEdit, Eye, ImageDown } from 'lucide-react';
import { getAuthToken } from '../api/authApi';
import MarkdownRenderer from './MarkdownRenderer';
import { getRelatedNotes, reprocessNote, uploadImage } from '../api/noteApi';
import { getTemplates } from '../api/templateApi';
import ShareModal from './ShareModal';

export default function Detail({
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
  const [reprocessStatus, setReprocessStatus] = useState(null); // { type: 'success' | 'error', msg: string }
  const [annotation, setAnnotation] = useState(item?.user_comment || '');
  const [isSubmittingStatus, setIsSubmittingStatus] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [externalImages, setExternalImages] = useState([]); // 第三方图片URL列表
  const [localImages, setLocalImages] = useState([]); // 已本地化的图片URL列表
  const [localizingProgress, setLocalizingProgress] = useState(0); // 已处理数量
  const [totalImagesToLocalize, setTotalImagesToLocalize] = useState(0); // 本次本地化任务的总数
  const [isLocalizing, setIsLocalizing] = useState(false);
  const textareaRef = useRef(null);
  const token = getAuthToken();
  const fileUrl = item?.storage_id ? `/api/file/${item.storage_id}${token ? `?token=${token}` : ''}` : '';

  // 自动调整文本框高度
  useEffect(() => {
    if (isRawMode && textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
    }
  }, [editValue, isRawMode]);

  // 当外部 item 变化时，重新绑定 editValue 和加载关联内容
  useEffect(() => {
    setEditValue(item?.ocr_text || '');
    setReprocessStatus(null);
    setAnnotation(item?.user_comment || '');
    if (item && item.id) {
       loadRelated();
    }
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
    } catch (e) {
      console.error(e);
    }
  };

  const loadRelated = async () => {
    try {
      const data = await getRelatedNotes(item.id);
      setRelatedItems(data || []);
    } catch (e) {
      console.error(e);
    }
  };

  // 从 URL 扩展名推断 MIME type
  const inferMimeType = (url) => {
    const ext = url.split('.').pop()?.toLowerCase()?.split('?')[0];
    const mimeMap = {
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'png': 'image/png',
      'gif': 'image/gif',
      'webp': 'image/webp',
      'bmp': 'image/bmp',
      'svg': 'image/svg+xml',
    };
    return mimeMap[ext] || 'image/png';
  };

  // 检测 markdown 内容中的图片 URL
  const detectImages = (text) => {
    if (!text) return { external: [], local: [] };
    // 匹配 markdown 图片语法 ![alt](url) 和 HTML <img src="url">
    const mdImgRegex = /!\[.*?\]\(([^)]+)\)/g;
    const htmlImgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;

    const external = []; // 第三方图片（https://开头）
    const local = [];    // 本地图片（/api/file/开头）

    let match;
    while ((match = mdImgRegex.exec(text)) !== null) {
      const url = match[1];
      if (url.startsWith('/api/file/')) {
        local.push({ url, mimeType: inferMimeType(url) });
      } else if (url.startsWith('http://') || url.startsWith('https://')) {
        external.push({ url, mimeType: inferMimeType(url) });
      }
    }
    while ((match = htmlImgRegex.exec(text)) !== null) {
      const url = match[1];
      if (url.startsWith('/api/file/')) {
        local.push({ url, mimeType: inferMimeType(url) });
      } else if (url.startsWith('http://') || url.startsWith('https://')) {
        external.push({ url, mimeType: inferMimeType(url) });
      }
    }
    return { external, local };
  };

  // 当 item 变化时检测图片数量
  useEffect(() => {
    const { external, local } = detectImages(item?.ocr_text);
    setExternalImages(external);
    setLocalImages(local);
    setLocalizingProgress(0);
    setTotalImagesToLocalize(0);
  }, [item?.ocr_text]);

  // 从浏览器渲染的图片获取 base64 数据
  const fetchImageAsBase64 = async (url, mimeType = 'image/png') => {
    return new Promise((resolve, reject) => {
      const img = new window.Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        const dataUrl = canvas.toDataURL(mimeType);
        // 去掉 data:image/xxx;base64, 前缀
        const base64Data = dataUrl.split(',')[1];
        resolve({ data: base64Data, mimeType });
      };
      img.onerror = (err) => {
        reject(new Error(`无法加载图片: ${url}`));
      };
      img.src = url;
    });
  };

  // 执行图片本地化
  const handleLocalizeImages = async () => {
    if (!externalImages.length || isLocalizing) return;

    setIsLocalizing(true);
    setLocalizingProgress(0);
    setTotalImagesToLocalize(externalImages.length);

    let updatedText = editValue;

    for (let i = 0; i < externalImages.length; i++) {
      const { url: originalUrl, mimeType: originalMimeType } = externalImages[i];
      try {
        // 1. 从浏览器获取已渲染的图片内容（使用推断的 MIME type）
        const { data, mimeType } = await fetchImageAsBase64(originalUrl, originalMimeType);

        // 2. 上传到服务器
        const { url } = await uploadImage(data, mimeType);

        // 3. 加上token鉴权参数
        const urlWithToken = token ? `${url}?token=${token}` : url;

        // 4. 替换原文中的 URL
        // 处理 markdown 格式 ![alt](url)
        updatedText = updatedText.replace(
          new RegExp(`!\\[([^\\]]*)\\]\\(${originalUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\)`, 'g'),
          `![$1](${urlWithToken})`
        );
        // 处理 HTML 格式 <img src="url">
        updatedText = updatedText.replace(
          new RegExp(`<img([^>]*)src=["']${originalUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']([^>]*)>`, 'gi'),
          `<img$1src="${urlWithToken}"$2>`
        );

        setLocalizingProgress(i + 1);
      } catch (err) {
        console.error(`图片本地化失败: ${originalUrl}`, err);
        // 继续处理下一张
        setLocalizingProgress(i + 1);
      }
    }

    // 更新编辑值
    setEditValue(updatedText);

    // 自动保存到服务器
    if (handleUpdateText && item) {
      setIsSaving(true);
      await handleUpdateText(item.id, updatedText);
      setIsSaving(false);
    }

    setIsLocalizing(false);
    // 重新检测图片
    const { external, local } = detectImages(updatedText);
    setExternalImages(external);
    setLocalImages(local);
  };

  if (!item) return null;

  const onSaveWrap = async () => {
    if (!handleUpdateText || !item) return;
    setIsSaving(true);
    await handleUpdateText(item.id, editValue);
    setIsSaving(false);
  };

  const handleReprocess = async () => {
    if (!item) return;
    setIsReprocessing(true);
    setReprocessStatus(null);
    try {
      await reprocessNote(item.id, selectedTemplateId);
      setReprocessStatus({ type: 'success', msg: '已触发处理，请稍候片刻等待 AI 更新...' });
      setTimeout(() => setReprocessStatus(null), 5000);
    } catch (e) {
      console.error(e);
      setReprocessStatus({ type: 'error', msg: '重新处理失败: ' + e.message });
      setTimeout(() => setReprocessStatus(null), 5000);
    }
    setIsReprocessing(false);
  };

  return (
    <div className="w-full h-full flex flex-col animate-in fade-in zoom-in-95 duration-300">
      {/* 顶栏控制 */}
      <div className="flex items-center justify-between px-5 py-2.5 border-b border-borderSubtle bg-main shrink-0">
        <div className="font-medium text-textPrimary tracking-wide flex items-center gap-2 text-[15px]">
          <BrainCircuit size={18} className="text-primeAccent" /> 碎片的完整映射
        </div>
        <div className="flex gap-3">
          {showTrash ? (
            <>
              <button 
                onClick={() => handleRestore(item.id)} 
                className="px-4 py-1.5 bg-primeAccent/10 text-primeAccent hover:bg-primeAccent/20 transition-colors rounded-lg flex items-center gap-1.5 text-xs font-medium border border-primeAccent/20"
              >
                <ArchiveRestore size={14} /> 撤销删除
              </button>
              <button 
                onClick={() => handleDelete(item.id, true)} 
                className="px-4 py-1.5 bg-red-500/10 text-red-500 hover:bg-red-500/20 hover:text-red-400 transition-colors rounded-lg flex items-center gap-1.5 text-xs font-medium border border-red-500/20 shadow-[0_0_10px_rgba(239,68,68,0.1)]"
              >
                <Trash2 size={14} /> 彻底摧毁
              </button>
            </>
          ) : (
            <button 
              onClick={() => handleDelete(item.id)} 
              className="px-4 py-1.5 bg-red-500/5 text-red-500/60 hover:bg-red-500/10 hover:text-red-500 transition-colors rounded-lg flex items-center gap-1.5 text-xs font-medium border border-red-500/10"
            >
              <Trash2 size={14} /> 移入垃圾篓
            </button>
          )}

          {!showTrash && (
            <button 
              onClick={() => setShowShareModal(true)} 
              className="px-4 py-1.5 bg-primeAccent/5 text-primeAccent/60 hover:bg-primeAccent/10 hover:text-primeAccent transition-colors rounded-lg flex items-center gap-1.5 text-xs font-medium border border-primeAccent/10"
            >
              <Share2 size={14} /> 分享碎片
            </button>
          )}
          <button 
            onClick={() => setSelectedItem(null)}
            className="p-1.5 bg-white/5 hover:bg-white/10 rounded-full text-white/60 hover:text-white transition-colors ml-2"
            title="关闭详情视图 (Esc)"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* 内容区 */}
      <div className="flex flex-1 overflow-hidden flex-col lg:flex-row">
        <div className="flex-1 p-5 lg:p-6 overflow-y-auto custom-scrollbar lg:border-r border-borderSubtle bg-main">
          {/* AI 分析框架 */}
          <div className="mb-5">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-[11px] text-textSecondary uppercase tracking-widest font-mono flex items-center gap-2 bg-sidebar inline-flex px-3 py-1 rounded-full border border-borderSubtle">
                  <BrainCircuit size={12} /> AI 智能总结
              </h3>
              <div className="flex items-center gap-2">
                {reprocessStatus && (
                  <span className={`text-[11px] font-mono flex items-center gap-1 ${
                    reprocessStatus.type === 'success' ? 'text-green-400' : 'text-red-400'
                  }`}>
                    {reprocessStatus.type === 'success' ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                    {reprocessStatus.msg}
                  </span>
                )}
                
                <select 
                  value={selectedTemplateId} 
                  onChange={(e) => setSelectedTemplateId(e.target.value)}
                  disabled={isReprocessing}
                  className="bg-sidebar border border-borderSubtle text-textSecondary text-[11px] rounded px-2 py-1 outline-none focus:border-primeAccent/30"
                >
                  <option value="" className="bg-header text-textPrimary">(默认激活模板)</option>
                  {templates.map(t => (
                    <option key={t.id} value={t.id} className="bg-header text-textPrimary">{t.name} {t.is_active ? '(激活)' : ''}</option>
                  ))}
                </select>

                <button
                  onClick={handleReprocess}
                  disabled={isReprocessing}
                  className="flex items-center gap-1.5 px-3 py-1 bg-primeAccent/10 text-primeAccent hover:bg-primeAccent/20 transition-all rounded text-[10px] uppercase font-bold disabled:opacity-50"
                >
                  <RefreshCw size={12} className={isReprocessing ? 'animate-spin' : ''} />
                  {isReprocessing ? '处理中...' : '重新 AI 处理'}
                </button>
              </div>
            </div>
            <div className="text-textSecondary text-[14px] leading-relaxed font-normal bg-card px-4 py-3 rounded-xl border border-borderSubtle ai-summary-markdown">
              <MarkdownRenderer content={item.ai_summary || "暂无相关摘要..."} />
            </div>
          </div>

          {/* OCR 原文提取 */}
          <div className="mb-4">
            <div className="flex items-center justify-between border-b border-primeAccent/20 pb-2 mb-3">
              <h2 className="text-[11px] text-primeAccent uppercase tracking-[0.2em] font-bold flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-primeAccent animate-pulse shadow-[0_0_10px_color-mix(in_srgb,var(--prime-accent),transparent_20%)]"></span> 
                {item.original_url ? '源网页正文推断' : 'OCR 核心视觉提取文本'}
              </h2>
              
              <div className="flex items-center gap-3">
                {item.original_url && (
                  <a
                    href={item.original_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-3 py-1 bg-primeAccent/10 hover:bg-primeAccent/20 text-primeAccent transition-colors rounded-md text-[10px] font-mono border border-primeAccent/20 uppercase shadow-[0_0_10px_color-mix(in_srgb,var(--prime-accent),transparent_90%)]"
                    title="直达原文"
                  >
                    <ExternalLink size={12} /> 直达源网址
                  </a>
                )}
                {/* 图片本地化按钮 - 有图片时显示 */}
                {(externalImages.length > 0 || localImages.length > 0) && (
                  <button
                    onClick={handleLocalizeImages}
                    disabled={isLocalizing || externalImages.length === 0}
                    className={`flex items-center gap-1.5 px-3 py-1 transition-colors rounded-md text-[10px] font-mono ${
                      externalImages.length === 0
                        ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                        : 'bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 border border-orange-500/20'
                    }`}
                    title={externalImages.length === 0 ? "图片已全部本地化" : "将第三方图片下载并本地化存储"}
                  >
                    <ImageDown size={12} className={isLocalizing ? 'animate-pulse' : ''} />
                    {isLocalizing
                      ? `本地化中 ${localizingProgress}/${totalImagesToLocalize}`
                      : `图片本地化 ${localImages.length}/${externalImages.length + localImages.length}`}
                  </button>
                )}
                <button
                  onClick={() => setIsRawMode(!isRawMode)}
                  className="flex items-center gap-1.5 px-3 py-1 bg-sidebar hover:bg-card text-textSecondary hover:text-textPrimary transition-colors rounded-md text-[10px] font-mono border border-borderSubtle uppercase"
                  title={isRawMode ? "切换为 Markdown 预览" : "查看原始提取文本"}
                >
                  {isRawMode ? <><FileText size={12} /> 预览模式</> : <><Code size={12} /> RAW 模式</>}
                </button>
              </div>
            </div>
            
            <div className="text-textPrimary text-[14px] leading-[1.7] tracking-wide bg-modal px-5 py-4 rounded-xl border border-borderSubtle selection:bg-primeAccent selection:text-black mt-1 shadow-inner">
              {isRawMode ? (
                <div className="relative group/edit">
                  <textarea
                    ref={textareaRef}
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    className="w-full outline-none bg-transparent overflow-hidden whitespace-pre-wrap font-mono text-[13px] text-textSecondary break-words border-none"
                    placeholder="未能提取到或尚未进行 OCR 文本识别..."
                  />
                  <div className="sticky bottom-6 right-0 flex justify-end pointer-events-none z-20 pr-4 pb-2">
                    {editValue !== item.ocr_text && (
                      <button 
                        onClick={onSaveWrap}
                        disabled={isSaving}
                        className="pointer-events-auto bg-primeAccent/20 hover:bg-primeAccent/80 hover:text-white text-primeAccent px-4 py-2 rounded-lg flex items-center gap-2 text-xs font-mono border border-primeAccent/30 font-bold transition-all backdrop-blur shadow-lg"
                      >
                        <Save size={14} />
                        {isSaving ? "正在保存..." : "保存修改"}
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="markdown-ocr">
                  <MarkdownRenderer content={item.ocr_text || "未能提取到或尚未进行 OCR 文本识别。"} />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 源侧边区 (分层结构，底部固定) */}
        <div className="w-full lg:w-[280px] xl:w-[320px] shrink-0 bg-panel/80 flex flex-col h-full relative border-l border-borderSubtle">
          {/* 上部可滚动元数据区 */}
          <div className="flex-1 overflow-y-auto p-5 custom-scrollbar scrollbar-hide flex flex-col gap-4">
            {/* 图像源展示 (缩小高度) */}
            <div className="w-full h-[180px] shrink-0 bg-sidebar border border-borderSubtle rounded-2xl flex items-center justify-center relative overflow-hidden group shadow-lg shadow-black/10 dark:shadow-black/40 text-center">
            <div className="absolute top-3 left-3 bg-modal/50 backdrop-blur-md px-2 py-0.5 rounded text-[10px] text-textSecondary tracking-widest uppercase font-mono z-10 pointer-events-none border border-borderSubtle shadow-md">源视觉</div>
            
            {item.file_type?.includes('image') ? (
              <img 
                src={fileUrl} 
                alt="source visual" 
                className="max-w-full max-h-full object-contain transition-transform duration-700 group-hover:scale-105 cursor-crosshair"
                onClick={() => setPreviewImage(fileUrl)}
              />
            ) : (
              <div className="opacity-40 flex flex-col items-center justify-center p-4 h-full">
                <ImageIcon size={36} className="mb-3 text-white/50 shrink-0" />
                <span className="text-[10px] tracking-widest uppercase font-mono">{item.file_type || 'DOCUMENT'}</span>
              </div>
            )}
          </div>

          {/* 底部元数据 */}
          <div className="shrink-0 flex flex-col gap-4">
            <div>
              <div className="text-[10px] text-textSecondary/50 uppercase mb-2 font-mono flex items-center gap-2">语义印记 (Tags)</div>
              <div className="flex flex-wrap gap-1.5 max-h-[80px] overflow-y-auto custom-scrollbar">
                {item.ai_tags ? (
                  item.ai_tags.split(',').map((tag, idx) => (
                    <span key={idx} className="bg-sidebar text-textSecondary border border-borderSubtle px-2 py-1 rounded-md text-[11px] font-medium hover:bg-card transition-colors cursor-default whitespace-nowrap">
                      #{tag.trim()}
                    </span>
                  ))
                ) : (
                  <span className="text-textSecondary/30 text-[11px] italic bg-sidebar px-2 py-1 rounded-md">无标签记录</span>
                )}
              </div>
            </div>

            <div className="bg-card border border-borderSubtle rounded-xl p-4 space-y-4">
              <div>
                <div className="text-[10px] text-textSecondary/50 uppercase mb-1 font-mono">初次记录落点时间</div>
                <div className="text-textSecondary text-[11px] font-mono bg-sidebar px-2 py-1 rounded inline-block">
                  {item.created_at || item.CreatedAt ? new Date(item.created_at || item.CreatedAt).toLocaleString('zh-CN', { hour12: false }) : '未知时间'}
                </div>
              </div>
            </div>
            {/* 相关灵感发现 (Phase 4) */}
            {relatedItems.length > 0 && (
              <div className="pt-2 animate-in fade-in slide-in-from-top-2 duration-700">
                <div className="text-[10px] text-textSecondary/50 uppercase mb-3 font-mono flex items-center gap-2">
                  <Link size={10} className="text-primeAccent" /> 相关灵感发现
                </div>
                <div className="space-y-2">
                  {relatedItems.map(rel => (
                    <div 
                      key={rel.id}
                      onClick={() => setSelectedItem(rel)}
                      className="p-3 bg-sidebar border border-borderSubtle rounded-xl hover:border-primeAccent/30 hover:bg-primeAccent/5 transition-all cursor-pointer group/rel"
                    >
                      <div className="text-[11px] text-textSecondary/70 group-hover/rel:text-textPrimary transition-colors line-clamp-2 leading-snug">
                         {rel.ai_summary || rel.original_name}
                      </div>
                      <div className="mt-2 text-[9px] font-mono text-textSecondary/20 group-hover/rel:text-primeAccent/50 transition-colors">
                         {new Date(rel.created_at || rel.CreatedAt).toLocaleDateString()}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 溯源谱系 (Lineage) - 移动到右侧栏底部 */}
            {item.parents && item.parents.length > 0 && (
              <div className="pt-4 mt-2 border-t border-white/5 animate-in fade-in slide-in-from-bottom-2 duration-700">
                <div className="text-[10px] text-silverText/40 uppercase mb-3 font-mono flex items-center gap-2">
                  <Zap size={10} className="text-primeAccent" /> 知识合成谱系 (Sources)
                </div>
                <div className="space-y-2">
                  {item.parents.map(p => (
                    <div 
                      key={p.id}
                      onClick={() => setSelectedItem(p)}
                      className="p-3 bg-primeAccent/5 border border-primeAccent/10 hover:border-primeAccent/30 transition-all rounded-xl cursor-pointer group/node"
                    >
                      <div className="text-[11px] text-silverText/70 group-hover/node:text-white transition-colors line-clamp-2 leading-relaxed">
                          {p.ai_summary || p.original_name || '未命名片段'}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 底部固定批注与标记已读区 */}
        <div className="p-5 border-t border-borderSubtle bg-card shrink-0 flex flex-col gap-3">
            <div className="text-[10px] text-textSecondary/50 uppercase font-mono flex items-center gap-2">
              <ClipboardEdit size={10} className="text-primeAccent" /> 手动批注与回响
            </div>
            <textarea
              value={annotation}
              onChange={(e) => setAnnotation(e.target.value)}
              placeholder="在此记录你的对此碎片的深度思考或执行备忘..."
              className="w-full bg-sidebar border border-borderSubtle rounded-xl p-3 text-[12px] text-textPrimary focus:outline-none focus:border-primeAccent/30 min-h-[100px] resize-none transition-all"
            />
            <button
              onClick={async () => {
                setIsSubmittingStatus(true);
                await handleUpdateStatus(item.id, 'done', annotation);
                setIsSubmittingStatus(false);
              }}
              disabled={isSubmittingStatus}
              className={`w-full py-3 rounded-xl flex items-center justify-center gap-2 text-xs font-bold transition-all ${item.status === 'done'
                  ? 'bg-primeAccent/10 text-primeAccent border border-primeAccent/30 shadow-[0_0_15px_color-mix(in_srgb,var(--prime-accent),transparent_90%)]'
                  : 'bg-primeAccent text-white-fixed dark:text-black hover:bg-primeAccent/90 shadow-[0_0_20px_color-mix(in_srgb,var(--prime-accent),transparent_70%)]'
                }`}
            >
              {isSubmittingStatus ? (
                <RefreshCw size={14} className="animate-spin" />
              ) : item.status === 'done' ? (
                <><CheckCircle2 size={14} /> 已存入常驻记忆</>
              ) : (
                <><Eye size={14} /> 标注为已读并保存</>
              )}
            </button>
          </div>
        </div>
      </div>
      {showShareModal && <ShareModal item={item} onClose={() => setShowShareModal(false)} />}
    </div>
  );
}
