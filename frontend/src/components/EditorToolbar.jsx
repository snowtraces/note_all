import React, { useState } from 'react';
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough,
  Heading1, Heading2, Heading3,
  List, ListOrdered, CheckSquare,
  Quote, Code, CodeSquare,
  Link, Image as ImageIcon, Table as TableIcon,
  Highlighter, Save,
} from 'lucide-react';
import { EDITOR_MODES } from '../constants/editorModes';

export default function EditorToolbar({
  editor,
  editorMode,
  onModeChange,
  hasUnsavedChanges,
  isSaving,
  onSave,
}) {
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');

  if (!editor) return null;

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

  const groups = [
    // 文本格式
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
    // 块级格式
    {
      items: [
        { icon: Heading1, action: () => editor.chain().focus().toggleHeading({ level: 1 }).run(), active: editor.isActive('heading', { level: 1 }), title: '标题 1' },
        { icon: Heading2, action: () => editor.chain().focus().toggleHeading({ level: 2 }).run(), active: editor.isActive('heading', { level: 2 }), title: '标题 2' },
        { icon: Heading3, action: () => editor.chain().focus().toggleHeading({ level: 3 }).run(), active: editor.isActive('heading', { level: 3 }), title: '标题 3' },
        { icon: List, action: () => editor.chain().focus().toggleBulletList().run(), active: editor.isActive('bulletList'), title: '无序列表' },
        { icon: ListOrdered, action: () => editor.chain().focus().toggleOrderedList().run(), active: editor.isActive('orderedList'), title: '有序列表' },
        { icon: CheckSquare, action: () => editor.chain().focus().toggleTaskList().run(), active: editor.isActive('taskList'), title: '任务列表' },
        { icon: Quote, action: () => editor.chain().focus().toggleBlockquote().run(), active: editor.isActive('blockquote'), title: '引用块' },
        { icon: CodeSquare, action: () => editor.chain().focus().toggleCodeBlock().run(), active: editor.isActive('codeBlock'), title: '代码块' },
      ],
    },
    // 插入
    {
      items: [
        { icon: ImageIcon, action: () => {
          const url = window.prompt('图片 URL:');
          if (url) editor.chain().focus().setImage({ src: url }).run();
        }, active: false, title: '插入图片' },
        { icon: Link, action: () => {
          if (editor.isActive('link')) {
            editor.chain().focus().unsetLink().run();
          } else {
            setShowLinkInput(true);
          }
        }, active: editor.isActive('link'), title: '链接' },
        { icon: TableIcon, action: () => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(), active: editor.isActive('table'), title: '插入表格' },
      ],
    },
  ];

  return (
    <div className="editor-toolbar shrink-0 sticky bottom-0 lg:static border-t border-borderSubtle bg-main px-4 md:px-5 py-2 flex items-center gap-2 overflow-x-auto custom-scrollbar z-30">
      {editorMode === 'edit' && groups.map((group, gi) => (
        <React.Fragment key={gi}>
          {gi > 0 && <div className="w-px h-5 bg-borderSubtle shrink-0" />}
          {group.items.map((item, ii) => (
            <button
              key={ii}
              onClick={item.action}
              className={`toolbar-btn p-1.5 rounded-md transition-all text-textSecondary/70 hover:text-textPrimary hover:bg-primeAccent/10 ${
                item.active ? 'bg-primeAccent/15 text-primeAccent shadow-sm' : ''
              }`}
              title={item.title}
            >
              <item.icon size={14} />
            </button>
          ))}
        </React.Fragment>
      ))}

      {/* 链接输入框 */}
      {showLinkInput && (
        <div className="flex items-center gap-1 ml-1 animate-in fade-in duration-200">
          <input
            type="url"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && setLink()}
            placeholder="https://..."
            className="bg-sidebar border border-borderSubtle text-textPrimary text-[10px] rounded px-2 py-1 outline-none focus:border-primeAccent/30 w-[140px]"
            autoFocus
          />
          <button onClick={setLink} className="text-[10px] text-primeAccent font-medium hover:underline">确认</button>
          <button onClick={() => { setShowLinkInput(false); setLinkUrl(''); }} className="text-[10px] text-textSecondary/50 hover:text-red-400">取消</button>
        </div>
      )}

      {/* 模式切换器 */}
      <div className="flex items-center ml-auto gap-0.5 bg-sidebar rounded-md p-0.5 border border-borderSubtle">
        {EDITOR_MODES.map(m => (
          <button
            key={m.key}
            onClick={() => onModeChange(m.key)}
            className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-mono transition-all ${
              editorMode === m.key
                ? 'bg-primeAccent/15 text-primeAccent shadow-sm'
                : 'text-textSecondary/50 hover:text-textSecondary hover:bg-card'
            }`}
            title={m.label}
          >
            <m.icon size={12} />
            <span className="hidden sm:inline">{m.label}</span>
          </button>
        ))}
      </div>

      {/* 保存按钮 */}
      {hasUnsavedChanges && (
        <button onClick={onSave} disabled={isSaving}
          className="flex items-center gap-1.5 px-3 py-1 bg-primeAccent/20 text-primeAccent hover:bg-primeAccent hover:text-white transition-all rounded text-[10px] font-bold border border-primeAccent/30 backdrop-blur shadow-lg disabled:opacity-50">
          <Save size={13} />
          {isSaving ? '保存中...' : '保存'}
        </button>
      )}
    </div>
  );
}