import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useEditor, EditorContent } from '@tiptap/react';

import { StarterKit } from '@tiptap/starter-kit';
import { Link } from '@tiptap/extension-link';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import { TaskList } from '@tiptap/extension-task-list';
import { TaskItem } from '@tiptap/extension-task-item';
import { Placeholder } from '@tiptap/extension-placeholder';
import { Highlight } from '@tiptap/extension-highlight';
import { Typography } from '@tiptap/extension-typography';
import { Markdown } from 'tiptap-markdown';
import GlobalDragHandle from 'tiptap-extension-global-drag-handle';

import { CustomImage } from './editor/TiptapImage';
import { CustomCodeBlock } from './editor/TiptapCodeBlock';
import { AutoWrapSelection } from './editor/AutoWrapSelection';
import { InlineMathDecorations } from './editor/InlineMathDecorations';
import { HeadingIdPatch } from './editor/HeadingIdPatch';

import { uploadImage } from '../api/noteApi';
import SlashCommand, { setOnImageUpload, setOnShowHelp } from './SlashCommandExtension';
import SlashCommandHelpModal from './SlashCommandHelpModal';

export default function MarkdownEditor({
  initialContent,
  onUpdate,
  editorRef,
  onImageUpload,
  className = '',
}) {
  const lastMarkdownRef = useRef(initialContent || '');
  const [isTableActive, setIsTableActive] = useState(false);
  const [activeTableWrapper, setActiveTableWrapper] = useState(null);
  const [showHelp, setShowHelp] = useState(false);

  const updateTableMenuPos = useCallback((editor) => {
    setIsTableActive(editor.isActive('table'));
    if (!editor.isActive('table')) {
      setActiveTableWrapper(null);
      return;
    }
    try {
      const domAtPos = editor.view.domAtPos(editor.state.selection.anchor);
      let el = domAtPos.node;
      if (el && el.nodeType !== 1) el = el.parentElement;
      const tableWrapper = el?.closest('.tableWrapper') || el?.closest('table')?.parentElement;
      if (tableWrapper) {
        tableWrapper.style.position = 'relative';
        setActiveTableWrapper(tableWrapper);
      }
    } catch (err) { }
  }, []);

  const handleDrop = useCallback((view, event, _slice, _moved) => {
    const files = event.dataTransfer?.files;
    if (!files || files.length === 0) return false;

    let handled = false;
    for (const file of files) {
      if (!file.type.startsWith('image/')) continue;
      event.preventDefault();
      handled = true;

      const processUpload = async () => {
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
      };
      processUpload();
    }
    return handled;
  }, [onImageUpload]);

  const handlePaste = useCallback((view, event) => {
    const items = event.clipboardData?.items;
    if (!items) return false;

    let handled = false;
    for (const item of items) {
      if (!item.type.startsWith('image/')) continue;

      const file = item.getAsFile();
      if (!file) continue;

      event.preventDefault();
      handled = true;

      const processUpload = async () => {
        try {
          const reader = new FileReader();
          reader.onload = async () => {
            const base64 = reader.result.split(',')[1];
            const result = await (onImageUpload || uploadImage)(base64, file.type);
            view.dispatch(
              view.state.tr.replaceSelectionWith(
                view.state.schema.nodes.image.create({ src: result.url })
              )
            );
          };
          reader.readAsDataURL(file);
        } catch (err) {
          console.error('Image paste upload failed:', err);
        }
      };
      processUpload();
    }
    return handled;
  }, [onImageUpload]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        codeBlock: false,
      }),
      Markdown.configure({
        html: true,
        transformPastedText: true,
        transformCopiedText: true,
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'text-primeAccent underline underline-offset-4 decoration-primeAccent/30 hover:decoration-primeAccent transition-all',
        },
      }),
      CustomImage.configure({
        inline: false,
        allowBase64: true,
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
      Highlight.configure({ multicolor: true }),
      Typography,
      CustomCodeBlock,
      AutoWrapSelection,
      InlineMathDecorations,
      HeadingIdPatch,
      GlobalDragHandle.configure({
        dragHandleWidth: 28,
        scrollTreshold: 0,
      }),
      SlashCommand,
    ],
    content: initialContent || '',
    onSelectionUpdate: ({ editor }) => {
      updateTableMenuPos(editor);
    },
    onUpdate: ({ editor }) => {
      const md = editor.storage.markdown.getMarkdown();
      lastMarkdownRef.current = md;
      updateTableMenuPos(editor);
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

  useEffect(() => {
    if (editorRef && editor) {
      editorRef.current = editor;
    }
  }, [editor, editorRef]);

  // IME composition 期间绝不调用 setContent，避免破坏 composition 状态导致无限循环卡死；
  // 编辑器聚焦状态下也跳过同步，避免打断输入流。
  useEffect(() => {
    if (!editor || initialContent === undefined) return;

    const syncContent = () => {
      if (editor.view.composing || editor.isFocused) return;

      if (initialContent !== lastMarkdownRef.current) {
        const currentMd = editor.storage.markdown.getMarkdown();
        if (initialContent !== currentMd) {
          queueMicrotask(() => {
            if (editor.isFocused) return;

            editor.commands.setContent(initialContent || '', false, {
              parseOptions: { preserveWhitespace: 'full' },
            });
            lastMarkdownRef.current = initialContent;
          });
        }
      }
    };

    syncContent();

    const onCompositionEnd = () => {
      setTimeout(() => { syncContent(); }, 50);
    };
    editor.view.dom.addEventListener('compositionend', onCompositionEnd);
    return () => editor.view.dom.removeEventListener('compositionend', onCompositionEnd);
  }, [initialContent, editor]);

  useEffect(() => {
    setOnImageUpload(onImageUpload || null);
    setOnShowHelp(() => setShowHelp(true));
  }, [onImageUpload]);

  if (!editor) return null;

  return (
    <div className={`markdown-editor-wrapper relative ${className}`}>
      {isTableActive && activeTableWrapper && createPortal(
        <div
          className="absolute -bottom-10 right-0 flex items-center gap-1 bg-modal/95 border border-borderSubtle rounded-lg shadow-xl p-1.5 animate-in fade-in zoom-in-95 backdrop-blur-md z-50"
          onMouseDown={(e) => e.preventDefault()}
        >
          <button onClick={() => editor.chain().focus().addColumnAfter().run()} className="px-2.5 py-1 text-[11px] font-medium text-textPrimary hover:text-primeAccent hover:bg-primeAccent/10 rounded transition-colors" title="在右侧插入列">+列</button>
          <button onClick={() => editor.chain().focus().deleteColumn().run()} className="px-2.5 py-1 text-[11px] font-medium text-textSecondary hover:text-red-400 hover:bg-red-400/10 rounded transition-colors" title="删除当前列">-列</button>
          <div className="w-px h-3.5 bg-borderSubtle mx-0.5" />
          <button onClick={() => editor.chain().focus().addRowAfter().run()} className="px-2.5 py-1 text-[11px] font-medium text-textPrimary hover:text-primeAccent hover:bg-primeAccent/10 rounded transition-colors" title="在下方插入行">+行</button>
          <button onClick={() => editor.chain().focus().deleteRow().run()} className="px-2.5 py-1 text-[11px] font-medium text-textSecondary hover:text-red-400 hover:bg-red-400/10 rounded transition-colors" title="删除当前行">-行</button>
          <div className="w-px h-3.5 bg-borderSubtle mx-0.5" />
          <button onClick={() => editor.chain().focus().deleteTable().run()} className="px-2.5 py-1 text-[11px] font-medium text-red-500/80 hover:text-red-500 hover:bg-red-500/10 rounded transition-colors" title="删除整个表格">删表</button>
        </div>,
        activeTableWrapper
      )}
      <div className="tiptap-editor-container relative">
        <EditorContent editor={editor} className="tiptap-content-area" />
        <div id="tiptap-bubble-menu-container" />
      </div>

      <SlashCommandHelpModal
        isOpen={showHelp}
        onClose={() => setShowHelp(false)}
      />
    </div>
  );
}