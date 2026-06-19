import React, { useState } from 'react';
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough,
  Heading1, Heading2, Heading3,
  List, ListOrdered, CheckSquare,
  Quote, Code, CodeSquare,
  Link, Image as ImageIcon, Table as TableIcon,
  Highlighter, Save,
  ExternalLink, ImageDown, ChevronUp, ChevronDown, XCircle,
} from 'lucide-react';
import { EDITOR_MODES } from '../constants/editorModes';
import { triggerImageUpload } from './SlashCommandExtension';

export default function DetailToolbar({
  // Editor
  editor,
  // Content
  item,
  externalImages,
  localImages,
  isLocalizing,
  localizingProgress,
  totalImagesToLocalize,
  // Search
  isSearchActive,
  searchQuery,
  totalMatches,
  activeSearchIndex,
  searchInputRef,
  onSearchQueryChange,
  onSearchClose,
  onSearchNext,
  onSearchPrev,
  onSearchKeyDown,
  isRegex,
  onToggleRegex,
  // Common
  editorMode,
  onModeChange,
  hasUnsavedChanges,
  isSaving,
  onSave,
  onLocalizeImages,
}) {
  // ─── Editor-specific state & helpers ───
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');

  const setLink = () => {
    if (linkUrl) {
      try {
        const parsed = new URL(linkUrl, window.location.origin);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
          setShowLinkInput(false);
          setLinkUrl('');
          return;
        }
      } catch { /* relative paths are ok */ }
      editor.chain().focus().extendMarkRange('link').setLink({ href: linkUrl }).run();
    } else {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
    }
    setShowLinkInput(false);
    setLinkUrl('');
  };

  const handleCodeBlock = () => {
    const { state } = editor;
    const { selection } = state;
    if (selection.empty || editor.isActive('codeBlock')) {
      editor.chain().focus().toggleCodeBlock().run();
      return;
    }
    const text = state.doc.textBetween(selection.from, selection.to, '\n');
    editor.chain().focus().deleteSelection().insertContent({
      type: 'codeBlock',
      content: text ? [{ type: 'text', text }] : []
    }).run();
  };

  const groups = editor ? [
    {
      items: [
        { icon: Bold, action: () => editor.chain().focus().toggleBold().run(), active: editor.isActive('bold'), title: '粗体 (Ctrl+B)' },
        { icon: Italic, action: () => editor.chain().focus().toggleItalic().run(), active: editor.isActive('italic'), title: '斜体 (Ctrl+I)' },
        { icon: UnderlineIcon, action: () => editor.chain().focus().toggleUnderline().run(), active: editor.isActive('underline'), title: '下划线' },
        { icon: Strikethrough, action: () => editor.chain().focus().toggleStrike().run(), active: editor.isActive('strike'), title: '删除线' },
        { icon: Highlighter, action: () => editor.chain().focus().toggleHighlight().run(), active: editor.isActive('highlight'), title: '高亮' },
        { icon: Code, action: () => editor.chain().focus().toggleCode().run(), active: editor.isActive('code'), title: '行内代码' },
      ],
    },
    {
      items: [
        { icon: Heading1, action: () => editor.chain().focus().toggleHeading({ level: 1 }).run(), active: editor.isActive('heading', { level: 1 }), title: '标题 1' },
        { icon: Heading2, action: () => editor.chain().focus().toggleHeading({ level: 2 }).run(), active: editor.isActive('heading', { level: 2 }), title: '标题 2' },
        { icon: Heading3, action: () => editor.chain().focus().toggleHeading({ level: 3 }).run(), active: editor.isActive('heading', { level: 3 }), title: '标题 3' },
        { icon: List, action: () => editor.chain().focus().toggleBulletList().run(), active: editor.isActive('bulletList'), title: '无序列表' },
        { icon: ListOrdered, action: () => editor.chain().focus().toggleOrderedList().run(), active: editor.isActive('orderedList'), title: '有序列表' },
        { icon: CheckSquare, action: () => editor.chain().focus().toggleTaskList().run(), active: editor.isActive('taskList'), title: '任务列表' },
        { icon: Quote, action: () => editor.chain().focus().toggleBlockquote().run(), active: editor.isActive('blockquote'), title: '引用块' },
        { icon: CodeSquare, action: handleCodeBlock, active: editor.isActive('codeBlock'), title: '代码块' },
      ],
    },
    {
      items: [
        { icon: ImageIcon, action: () => triggerImageUpload(editor), active: false, title: '上传图片' },
        {
          icon: Link, action: () => {
            if (editor.isActive('link')) {
              editor.chain().focus().unsetLink().run();
            } else {
              setShowLinkInput(true);
            }
          }, active: editor.isActive('link'), title: '链接'
        },
        { icon: TableIcon, action: () => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(), active: editor.isActive('table'), title: '插入表格' },
      ],
    },
  ] : [];

  return (
    <div className="shrink-0 sticky bottom-0 lg:static border-t border-borderSubtle bg-main px-4 md:px-5 py-2 flex items-center gap-2 z-30 min-h-[48px]">

      {/* ─── Left: conditional sections ─── */}

      {/* Edit: format buttons */}
      {editorMode === 'edit' && editor && (
        <div className="flex items-center gap-1 overflow-x-auto custom-scrollbar min-w-0 flex-1">
          {groups.map((group, gi) => (
            <React.Fragment key={gi}>
              {gi > 0 && <div className="w-px h-5 bg-borderSubtle shrink-0" />}
              {group.items.map((btn, ii) => (
                <button
                  key={ii}
                  onClick={btn.action}
                  className={`toolbar-btn p-1.5 rounded-md transition-all shrink-0 ${btn.danger
                    ? 'text-red-400/80 hover:text-red-400 hover:bg-red-400/10'
                    : 'text-textTertiary hover:text-textPrimary hover:bg-primeAccent/10'
                    } ${btn.active && !btn.danger ? 'bg-primeAccent/15 text-primeAccent shadow-sm' : ''
                    }`}
                  title={btn.title}
                >
                  {btn.icon ? <btn.icon size={14} /> : <span className="text-[10px] font-bold px-1 whitespace-nowrap">{btn.label}</span>}
                </button>
              ))}
            </React.Fragment>
          ))}
        </div>
      )}

      {/* Edit: link input dialog */}
      {editorMode === 'edit' && showLinkInput && (
        <div className="flex items-center gap-1 shrink-0 animate-in fade-in duration-200">
          <input
            type="url"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && setLink()}
            placeholder="https://..."
            className="bg-sidebar border border-borderSubtle text-textPrimary text-[10px] rounded px-2 py-1 outline-none focus:border-primeAccent/30 w-[140px]"
            autoFocus
          />
          <button onClick={setLink} className="text-[10px] text-primeAccent font-medium hover:underline">确认</button>
          <button onClick={() => { setShowLinkInput(false); setLinkUrl(''); }} className="text-[10px] text-textMuted hover:text-red-400">取消</button>
        </div>
      )}

      {/* View: search bar */}
      {isSearchActive && editorMode === 'view' && (
        <div className="flex items-center flex-1 min-w-0 animate-in fade-in slide-in-from-left-2 duration-200">
          <div className="flex items-center flex-1 min-w-0 h-8 bg-sidebar border border-primeAccent/40 rounded-lg overflow-hidden shadow-[0_0_0_3px_rgba(var(--color-prime-accent-rgb,99,102,241),0.08)] transition-shadow focus-within:shadow-[0_0_0_3px_rgba(var(--color-prime-accent-rgb,99,102,241),0.15)] focus-within:border-primeAccent/70 max-w-md">
            <span className="shrink-0 flex items-center justify-center w-7 h-full border-r border-borderSubtle/50 text-primeAccent/50 font-mono text-[11px] font-bold select-none">/</span>
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchQueryChange(e.target.value)}
              onKeyDown={onSearchKeyDown}
              placeholder={isRegex ? "正则表达式..." : "搜索文档内容..."}
              className="flex-1 min-w-0 h-full bg-transparent text-textPrimary text-[12px] outline-none placeholder:text-textTertiary/60 px-2.5"
            />
            <button
              onClick={onToggleRegex}
              className={`shrink-0 flex items-center justify-center w-8 h-full border-l border-borderSubtle/50 font-mono text-[11px] font-bold transition-colors ${
                isRegex
                  ? 'text-primeAccent bg-primeAccent/10'
                  : 'text-textTertiary hover:text-textSecondary hover:bg-bgHover'
              }`}
              title={isRegex ? "关闭正则 (.*)" : "启用正则 (.*)"}
            >.*</button>
            {searchQuery && (
              <>
                <span className={`shrink-0 text-[10px] font-mono px-2 h-full flex items-center border-l border-borderSubtle/50 ${totalMatches === 0 ? 'text-red-400/70' : 'text-primeAccent/70'}`}>
                  {totalMatches > 0 ? `${activeSearchIndex + 1} / ${totalMatches}` : '无结果'}
                </span>
                <div className="w-px h-4 bg-borderSubtle/50 shrink-0" />
                <button onClick={onSearchPrev} className="shrink-0 flex items-center justify-center w-7 h-full text-textTertiary hover:text-primeAccent hover:bg-primeAccent/8 transition-colors" title="上一个 (Shift+Enter)">
                  <ChevronUp size={13} />
                </button>
                <button onClick={onSearchNext} className="shrink-0 flex items-center justify-center w-7 h-full text-textTertiary hover:text-primeAccent hover:bg-primeAccent/8 transition-colors" title="下一个 (Enter)">
                  <ChevronDown size={13} />
                </button>
                <div className="w-px h-4 bg-borderSubtle/50 shrink-0" />
                <button onClick={onSearchClose} className="shrink-0 flex items-center justify-center w-7 h-full text-textTertiary hover:text-red-400 hover:bg-red-500/8 transition-colors rounded-r-lg" title="关闭 (Esc)">
                  <XCircle size={13} />
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Raw: keyboard shortcut hints */}
      {editorMode === 'raw' && !isSearchActive && (
        <div className="hidden md:flex items-center gap-2 text-[10px] text-textSecondary/50 bg-sidebar/30 border border-borderSubtle/30 px-2.5 py-0.5 rounded-lg shadow-sm animate-in fade-in duration-300">
          <div className="flex items-center gap-1 shrink-0">
            <kbd className="px-1.5 py-0.5 bg-sidebar border border-borderSubtle rounded font-mono text-[9px] text-textPrimary shadow-sm">Ctrl + B</kbd>
            <span className="text-textTertiary">加粗</span>
          </div>
          <span className="text-borderSubtle/50 font-light select-none">/</span>
          <div className="flex items-center gap-1 shrink-0">
            <kbd className="px-1.5 py-0.5 bg-sidebar border border-borderSubtle rounded font-mono text-[9px] text-textPrimary shadow-sm">Ctrl + I</kbd>
            <span className="text-textTertiary">块选择</span>
          </div>
          <span className="text-borderSubtle/50 font-light select-none">/</span>
          <div className="flex items-center gap-1 shrink-0">
            <kbd className="px-1.5 py-0.5 bg-sidebar border border-borderSubtle rounded font-mono text-[9px] text-textPrimary shadow-sm">Ctrl + K</kbd>
            <span className="text-textTertiary">链接</span>
          </div>
          <span className="text-borderSubtle/50 font-light select-none">/</span>
          <div className="flex items-center gap-1 shrink-0">
            <kbd className="px-1.5 py-0.5 bg-sidebar border border-borderSubtle rounded font-mono text-[9px] text-textPrimary shadow-sm">Ctrl + S</kbd>
            <span className="text-textTertiary">保存</span>
          </div>
        </div>
      )}

      {/* ─── Right: always-visible controls ─── */}
      <div className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar min-w-0 ml-auto shrink-0">
        {item?.original_url && (
          <a href={item.original_url} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-2 py-1 bg-primeAccent/10 hover:bg-primeAccent/20 text-primeAccent transition-colors rounded text-[10px] font-mono border border-primeAccent/20 shrink-0"
            title="直达原文">
            <ExternalLink size={13} /> 源网址
          </a>
        )}

        {(externalImages.length > 0 || localImages.length > 0) && (
          <button onClick={onLocalizeImages} disabled={isLocalizing || externalImages.length === 0}
            className={`flex items-center gap-1.5 px-2 py-1 transition-colors rounded text-[10px] font-mono shrink-0 ${externalImages.length === 0
              ? 'bg-green-500/10 text-green-400 border border-green-500/20'
              : 'bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 border border-orange-500/20'
              }`}
            title={externalImages.length === 0 ? "图片已全部本地化" : "本地化第三方图片"}>
            <ImageDown size={13} className={isLocalizing ? 'animate-pulse' : ''} />
            {isLocalizing ? `本地化中 ${localizingProgress}/${totalImagesToLocalize}` : `图片 ${localImages.length}/${externalImages.length + localImages.length}`}
          </button>
        )}

        {hasUnsavedChanges && (
          <button onClick={onSave} disabled={isSaving}
            className="flex items-center gap-1.5 px-3 py-1 bg-primeAccent/20 text-primeAccent hover:bg-primeAccent hover:text-white transition-all rounded text-[10px] font-bold border border-primeAccent/30 backdrop-blur shadow-lg disabled:opacity-50">
            <Save size={13} />
            {isSaving ? '保存中...' : '保存'}
          </button>
        )}

        <div className="flex items-center gap-0.5 bg-sidebar rounded-md p-0.5 border border-borderSubtle">
          {EDITOR_MODES.map(m => (
            <button
              key={m.key}
              onClick={() => onModeChange(m.key)}
              className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-all ${editorMode === m.key
                ? 'bg-primeAccent/15 text-primeAccent shadow-sm'
                : 'text-textSecondary/80 hover:text-textSecondary hover:bg-card'
                }`}
              title={m.label}
            >
              <m.icon size={12} />
              <span className="hidden sm:inline">{m.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
