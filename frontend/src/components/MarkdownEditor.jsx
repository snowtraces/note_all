import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useEditor, EditorContent, ReactNodeViewRenderer, NodeViewWrapper, NodeViewContent } from '@tiptap/react';
import { StarterKit } from '@tiptap/starter-kit';
import { Image } from '@tiptap/extension-image';
import { Link } from '@tiptap/extension-link';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import { TaskList } from '@tiptap/extension-task-list';
import { TaskItem } from '@tiptap/extension-task-item';
import { Placeholder } from '@tiptap/extension-placeholder';
import { Highlight } from '@tiptap/extension-highlight';
import { Underline } from '@tiptap/extension-underline';
import { Typography } from '@tiptap/extension-typography';
import { CodeBlockLowlight } from '@tiptap/extension-code-block-lowlight';
import { common, createLowlight } from 'lowlight';
import { Markdown } from 'tiptap-markdown';
import { uploadImage } from '../api/noteApi';
import { getActiveServerUrl } from '../api/client';

const lowlight = createLowlight(common);

const LANGUAGES = [
  'plain', 'bash', 'css', 'html', 'javascript', 'typescript', 'python',
  'go', 'rust', 'java', 'c', 'cpp', 'ruby', 'php', 'sql', 'json',
  'yaml', 'xml', 'markdown', 'shell', 'dockerfile', 'graphql', 'tsx',
  'jsx', 'swift', 'kotlin', 'scala', 'lua', 'perl', 'r',
];

// 自定义 Image 组件，对齐 LazyImage 的 URL 拼接逻辑
const TiptapImageComponent = ({ node }) => {
  const src = node.attrs.src;
  const activeUrl = getActiveServerUrl();
  const fullSrc = activeUrl && src?.startsWith('/') ? `${activeUrl}${src}` : src;

  return (
    <NodeViewWrapper>
      <img
        src={fullSrc}
        alt={node.attrs.alt || ''}
        className="tiptap-image"
        loading="lazy"
      />
    </NodeViewWrapper>
  );
};

const CustomImage = Image.extend({
  addNodeView() {
    return ReactNodeViewRenderer(TiptapImageComponent);
  },
});

// 自定义代码块组件 — 带 header + 语言选择下拉框
const CodeBlockComponent = ({ node, updateAttributes, extension }) => {
  const language = node.attrs.language || 'plain';
  const [showLangPicker, setShowLangPicker] = useState(false);
  const [langSearch, setLangSearch] = useState('');
  const [pickerPos, setPickerPos] = useState({ top: 0, left: 0 });
  const btnRef = useRef(null);
  const pickerRef = useRef(null);

  const filteredLangs = LANGUAGES.filter(l =>
    l.toLowerCase().includes(langSearch.toLowerCase())
  );

  const openPicker = () => {
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setPickerPos({ top: rect.bottom + 2, left: rect.left });
    }
    setShowLangPicker(true);
  };

  useEffect(() => {
    if (!showLangPicker) return;
    const handleClickOutside = (e) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target) && btnRef.current && !btnRef.current.contains(e.target)) {
        setShowLangPicker(false);
        setLangSearch('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showLangPicker]);

  return (
    <NodeViewWrapper className="tiptap-codeblock-wrapper">
      <div className="bg-code rounded-lg border border-borderSubtle my-4 overflow-hidden shadow-lg">
        <div className="bg-code-header px-4 py-2 flex items-center justify-between border-b border-borderSubtle">
          <button
            ref={btnRef}
            onClick={openPicker}
            contentEditable={false}
            className="text-[11px] text-textSecondary font-mono lowercase hover:text-primeAccent transition-colors flex items-center gap-1"
          >
            {language}
            <svg width="8" height="8" viewBox="0 0 8 8" fill="none" className="opacity-40">
              <path d="M2 3L4 5L6 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
        <pre className="p-4 overflow-x-auto custom-scrollbar text-[13px] font-mono leading-relaxed whitespace-pre-wrap break-words">
          <NodeViewContent as="code" />
        </pre>
      </div>

      {showLangPicker && createPortal(
        <div
          ref={pickerRef}
          contentEditable={false}
          style={{ top: pickerPos.top, left: pickerPos.left }}
          className="fixed z-[999] bg-modal border border-borderSubtle rounded-lg shadow-xl w-[160px] max-h-[240px] overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150"
        >
          <input
            type="text"
            value={langSearch}
            onChange={(e) => setLangSearch(e.target.value)}
            placeholder="搜索语言..."
            contentEditable={false}
            className="px-3 py-2 text-[11px] text-textPrimary bg-sidebar border-b border-borderSubtle outline-none font-mono w-full"
            autoFocus
          />
          <div className="overflow-y-auto custom-scrollbar py-1 flex-1">
            {filteredLangs.length === 0 && (
              <div className="px-3 py-2 text-[10px] text-textSecondary/40 font-mono">无匹配</div>
            )}
            {filteredLangs.map(lang => (
              <button
                key={lang}
                contentEditable={false}
                onClick={() => {
                  updateAttributes({ language: lang });
                  setShowLangPicker(false);
                  setLangSearch('');
                }}
                className={`w-full px-3 py-1.5 text-[11px] font-mono lowercase text-left transition-colors ${
                  lang === language
                    ? 'bg-primeAccent/15 text-primeAccent'
                    : 'text-textSecondary/70 hover:text-textPrimary hover:bg-primeAccent/5'
                }`}
              >
                {lang}
              </button>
            ))}
          </div>
        </div>,
        document.body
      )}
    </NodeViewWrapper>
  );
};

const CustomCodeBlock = CodeBlockLowlight.extend({
  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockComponent);
  },
});

export default function MarkdownEditor({
  initialContent,
  onUpdate,
  editorRef,
  onImageUpload,
  className = '',
}) {
  const handleDrop = useCallback(async (view, event, _slice, _moved) => {
    const files = event.dataTransfer?.files;
    if (!files || files.length === 0) return false;

    for (const file of files) {
      if (!file.type.startsWith('image/')) continue;
      event.preventDefault();

      try {
        const reader = new FileReader();
        reader.onload = async () => {
          const base64 = reader.result.split(',')[1];
          const result = await (onImageUpload || uploadImage)(base64, file.type);
          const pos = view.posAtCoords({ left: event.clientX, top: event.clientY });
          if (pos) {
            view.dispatch(
              view.state.tr.insert(
                pos.pos,
                view.state.schema.nodes.image.create({ src: result.url })
              )
            );
          }
        };
        reader.readAsDataURL(file);
      } catch (err) {
        console.error('Image drop upload failed:', err);
      }
    }
    return true;
  }, [onImageUpload]);

  const handlePaste = useCallback(async (view, event) => {
    const items = event.clipboardData?.items;
    if (!items) return false;

    for (const item of items) {
      if (!item.type.startsWith('image/')) continue;
      event.preventDefault();

      const file = item.getAsFile();
      try {
        const reader = new FileReader();
        reader.onload = async () => {
          const base64 = reader.result.split(',')[1];
          const result = await (onImageUpload || uploadImage)(base64, file.type);
          view.dispatch(
            view.state.tr.insert(
              view.state.selection.from,
              view.state.schema.nodes.image.create({ src: result.url })
            )
          );
        };
        reader.readAsDataURL(file);
      } catch (err) {
        console.error('Image paste upload failed:', err);
      }
    }
    return true;
  }, [onImageUpload]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        codeBlock: false, // replaced by CodeBlockLowlight
      }),
      Markdown.configure({
        html: true,
        transformPastedText: true,
        transformCopiedText: true,
      }),
      CustomImage.configure({
        inline: false,
        allowBase64: true,
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'tiptap-link',
          target: '_blank',
          rel: 'noopener noreferrer',
        },
      }),
      Table.configure({ resizable: true, HTMLAttributes: { class: 'tiptap-table' } }),
      TableRow,
      TableCell,
      TableHeader,
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({
        placeholder: '开始书写，Markdown 语法即时渲染...',
      }),
      Highlight.configure({ multicolor: false }),
      Underline,
      Typography,
      CustomCodeBlock.configure({ lowlight }),
    ],
    content: initialContent || '',
    onUpdate: ({ editor }) => {
      const md = editor.storage.markdown.getMarkdown();
      if (onUpdate) onUpdate(md);
    },
    editorProps: {
      attributes: {
        class: 'tiptap-content outline-none',
      },
      handleDrop: handleDrop,
      handlePaste: handlePaste,
    },
  });

  // 暴露 editor 实例给父组件
  useEffect(() => {
    if (editorRef && editor) {
      editorRef.current = editor;
    }
  }, [editor, editorRef]);

  // 外部内容变更时同步（比如从 RAW 模式切回来）
  useEffect(() => {
    if (editor && initialContent !== undefined) {
      const currentMd = editor.storage.markdown.getMarkdown();
      if (initialContent !== currentMd) {
        queueMicrotask(() => {
          editor.commands.setContent(initialContent || '', false, {
            parseOptions: { preserveWhitespace: 'full' },
          });
        });
      }
    }
  }, [initialContent, editor]);

  if (!editor) return null;

  return (
    <div className={`markdown-editor-wrapper ${className}`}>
      <EditorContent editor={editor} />
    </div>
  );
}