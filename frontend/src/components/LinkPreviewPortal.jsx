import React from 'react';
import { createPortal } from 'react-dom';
import { FileText, Globe, FolderOpen, Calendar, ExternalLink } from 'lucide-react';

/**
 * LinkPreviewPortal - 全局统一的 Wiki 链接与网页链接预览悬浮 Portal 卡片
 */
const LinkPreviewPortal = ({ 
  visible, 
  loading, 
  data, 
  coords,
  onMouseEnter,
  onMouseLeave
}) => {
  if (!visible) return null;

  // 绝对定位位置设定
  const containerStyle = {
    position: 'absolute',
    top: `${coords.top}px`,
    left: `${coords.left}px`,
    zIndex: 2000, // 确保高于一切常规弹出菜单
  };

  // 内部双链笔记点击跳转：不刷新页面，分发全局 open-note 路由事件切换笔记
  const handleInternalClick = (e) => {
    e.preventDefault();
    if (data?.id) {
      window.dispatchEvent(new CustomEvent('open-note', { 
        detail: { id: parseInt(data.id) } 
      }));
    }
  };

  return createPortal(
    <div
      style={containerStyle}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      data-no-preview="true" // 整个预览卡片容器打上阻断标记，防止卡片内的一切元素再次激活预览
      className="w-80 p-4 rounded-xl border border-borderSubtle bg-card/90 backdrop-blur-xl shadow-[0_20px_50px_rgba(0,0,0,0.3)] dark:shadow-[0_20px_50px_rgba(0,0,0,0.6)] animate-in fade-in zoom-in-95 duration-200 select-none pointer-events-auto"
    >
      {loading ? (
        /* 骨架屏状态 (Skeleton Loading Overlay) */
        <div className="animate-pulse space-y-3">
          <div className="flex items-center gap-2">
            <div className="w-12 h-4 bg-slate-300/30 dark:bg-slate-700/30 rounded" />
          </div>
          <div className="h-5 bg-slate-300/40 dark:bg-slate-700/40 rounded w-5/6" />
          <div className="space-y-1.5 pt-1">
            <div className="h-3 bg-slate-300/20 dark:bg-slate-700/20 rounded w-full" />
            <div className="h-3 bg-slate-300/20 dark:bg-slate-700/20 rounded w-11/12" />
            <div className="h-3 bg-slate-300/20 dark:bg-slate-700/20 rounded w-4/5" />
          </div>
          <div className="h-3 bg-slate-300/10 dark:bg-slate-700/10 rounded w-1/3 pt-1" />
        </div>
      ) : data?.type === 'internal' ? (
        /* 1. 内部双链笔记展示卡片 (翡翠绿主题) */
        <div className="space-y-2">
          <div className="flex items-start justify-between gap-2">
            {/* 分类 L1/L2 面包屑 */}
            <div className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 dark:bg-emerald-500/20 px-2 py-0.5 rounded-md inline-flex border border-emerald-500/15">
              <FolderOpen size={10} className="shrink-0" />
              <span className="truncate max-w-[200px]">{data.folder || '未分类'}</span>
            </div>
            
            {/* 内部跳转小指示器 (可点击) */}
            <a
              href={data.url || `/note/${data.id}`}
              onClick={handleInternalClick}
              data-no-preview="true" // 阻断递归激活
              title="在新面板打开笔记"
              className="p-1 -mr-1 rounded-md hover:bg-emerald-500/10 text-textMuted hover:text-emerald-500 shrink-0 mt-0.5 transition-colors cursor-pointer flex items-center justify-center"
            >
              <ExternalLink size={12} />
            </a>
          </div>

          {/* 标题 - 支持点击跳转 */}
          <h4 className="text-sm font-bold text-textPrimary tracking-tight line-clamp-1 leading-snug flex items-center gap-1.5">
            <FileText size={14} className="text-emerald-500 shrink-0" />
            <a 
              href={data.url || `/note/${data.id}`}
              onClick={handleInternalClick}
              data-no-preview="true" // 阻断递归激活
              className="truncate hover:text-emerald-500 hover:underline transition-colors cursor-pointer"
            >
              {data.title}
            </a>
          </h4>

          {/* AI 摘要或纯净正文兜底 */}
          <p className="text-xs text-textSecondary leading-relaxed line-clamp-3 pt-0.5 break-all">
            {data.summary || '无摘要内容。'}
          </p>

          {/* 更新日期 */}
          <div className="flex items-center gap-1 text-[10px] text-textTertiary pt-1.5 border-t border-borderSubtle">
            <Calendar size={10} className="shrink-0" />
            <span>更新于 {data.updatedAt}</span>
          </div>
        </div>
      ) : (
        /* 2. 外部超链接展示卡片 (深邃蓝/靛蓝主题) */
        <div className="space-y-2">
          <div className="flex items-start justify-between gap-2">
            {/* 外部网站域名或名称徽章 */}
            <div className="flex items-center gap-1.5 text-[10px] font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 dark:bg-indigo-500/20 px-2 py-0.5 rounded-md inline-flex border border-indigo-500/15 max-w-[180px]">
              <Globe size={10} className="shrink-0" />
              <span className="truncate">{data?.site_name || '外部网页'}</span>
            </div>
            
            {/* 右上角链接跳转小指示 */}
            <a 
              href={data?.url} 
              target="_blank" 
              rel="noopener noreferrer"
              data-no-preview="true" // 阻断递归激活
              title="在新窗口打开网页"
              className="p-1 -mr-1 rounded-md hover:bg-indigo-500/10 text-textMuted hover:text-indigo-500 shrink-0 mt-0.5 transition-colors cursor-pointer flex items-center justify-center"
            >
              <ExternalLink size={12} />
            </a>
          </div>

          <div className="flex gap-3 items-start pt-0.5">
            <div className="flex-1 min-w-0 space-y-1.5">
              {/* 标题 - 支持点击跳转 */}
              <h4 className="text-xs font-bold text-textPrimary leading-snug line-clamp-2 break-words">
                <a 
                  href={data?.url} 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  data-no-preview="true" // 阻断递归激活
                  className="hover:text-indigo-500 hover:underline transition-colors cursor-pointer"
                >
                  {data?.title || '未命名的网页'}
                </a>
              </h4>
              {/* 描述信息 */}
              <p className="text-[11px] text-textSecondary leading-relaxed line-clamp-3 break-all">
                {data?.description || '无法获取此页面的大纲描述信息。'}
              </p>
            </div>

            {/* 网页封面图 */}
            {data?.image && (
              <div className="w-16 h-16 rounded-lg overflow-hidden shrink-0 border border-borderSubtle bg-sidebar/50">
                <img 
                  src={data.image} 
                  alt="Web Preview" 
                  className="w-full h-full object-cover transition-transform hover:scale-105 duration-300"
                  onError={(e) => {
                    e.target.style.display = 'none';
                  }}
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>,
    document.body
  );
};

export default LinkPreviewPortal;
