import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useEditor, EditorContent } from '@tiptap/react';
import { NodeSelection } from '@tiptap/pm/state';

import { Placeholder } from '@tiptap/extension-placeholder';
import GlobalDragHandle from 'tiptap-extension-global-drag-handle';

import { getCommonExtensions } from './editor/commonExtensions';
import { AutoWrapSelection } from './editor/AutoWrapSelection';

import { uploadImage } from '../api/noteApi';
import SlashCommand, { setOnImageUpload, setOnShowHelp } from './SlashCommandExtension';
import SlashCommandHelpModal from './SlashCommandHelpModal';



const ensureTrailingEmptyParagraph = (editor) => {
  if (!editor || !editor.isEditable || editor.view.composing) return;
  const { state, view } = editor;
  const { doc, schema } = state;
  const lastChild = doc.lastChild;

  const isEmptyParagraph = lastChild &&
                           lastChild.type.name === 'paragraph' &&
                           lastChild.textContent === '';

  if (!isEmptyParagraph) {
    const tr = state.tr;
    const paragraph = schema.nodes.paragraph.createAndFill();
    if (paragraph) {
      const { selection } = state;
      tr.insert(doc.content.size, paragraph);
      tr.setSelection(selection.map(tr.doc, tr.mapping));
      tr.setMeta('addToHistory', false);
      view.dispatch(tr);
    }
  }
};

export default function MarkdownEditor({
  initialContent,
  onUpdate,
  editorRef,
  onImageUpload,
  editable = true,
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
    editable: editable,
    extensions: [
      ...getCommonExtensions({ markdownClipboard: true }),
      Placeholder.configure({
        placeholder: '在此输入内容，输入 / 唤起工具或快捷菜单...',
      }),
      GlobalDragHandle.configure({
        dragHandleWidth: 28,
        scrollTreshold: 0,
        customNodes: ['codeBlock'],
      }),
      SlashCommand,
    ],
    content: initialContent || '',
    onCreate: ({ editor }) => {
      if (editor.isEditable) {
        ensureTrailingEmptyParagraph(editor);
      }
    },
    onSelectionUpdate: ({ editor }) => {
      updateTableMenuPos(editor);
    },
    onUpdate: ({ editor }) => {
      // 始终确保编辑区域底部有一个空段落 (采用 queueMicrotask 异步执行，不阻塞当前 ProseMirror 更新，完美支持 IME 输入法)
      queueMicrotask(() => {
        if (editor.isEditable && !editor.view.composing) {
          ensureTrailingEmptyParagraph(editor);
        }
      });

      const md = editor.storage.markdown.getMarkdown();
      lastMarkdownRef.current = md;
      updateTableMenuPos(editor);
      if (onUpdate) onUpdate(md);
    },
    editorProps: {
      attributes: {
        class: `tiptap-content outline-none ${className}`,
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

  useEffect(() => {
    if (editor && editor.isEditable !== editable) {
      editor.setEditable(editable);
      if (editable) {
        ensureTrailingEmptyParagraph(editor);
      }
    }
  }, [editor, editable]);

  const domParentRef = useRef(null);



  useEffect(() => {
    if (!editor) return;

    const domParent = editor.view.dom.parentElement;
    domParentRef.current = domParent;
    if (!domParent) return;

    const handleDragHandleMouseDown = (e) => {
      const dragHandle = e.target.closest('.drag-handle');
      if (dragHandle) {
        e.stopPropagation();
      }
    };

    const handleDragHandleClick = (e) => {
      const dragHandle = e.target.closest('.drag-handle');
      if (!dragHandle) return;

      const activeNodeType = dragHandle.getAttribute('data-active-node-type');

      // 阻止默认点击行为和事件冒泡，防止触发编辑器内其他默认点击聚集逻辑
      e.preventDefault();
      e.stopPropagation();

      const view = editor.view;

      // 聚焦编辑器，确保在选中时处于活跃状态
      view.focus();

      // 根据点击事件的 clientY 坐标，和编辑器正文横坐标中心，精准定位当前的文字行/块
      const editorRect = view.dom.getBoundingClientRect();
      const x = editorRect.left + editorRect.width / 2;
      const y = e.clientY;

      let bestPos = -1;
      let bestDepth = -1;

      // 垂直扫描，强制穿透 margin 找到真实的块内容！
      for (let offset = 0; offset <= 40; offset += 5) {
        const scanY = y + offset;
        const posResult = view.posAtCoords({ left: x, top: scanY });
        if (!posResult) continue;

        let pos = posResult.inside !== null && posResult.inside !== undefined && posResult.inside >= 0
          ? posResult.inside
          : posResult.pos;
        if (pos == null || pos < 0) continue;

        const $pos = view.state.doc.resolve(pos);
        
        let codeBlockDepth = -1;
        let listItemDepth = -1;

        for (let d = $pos.depth; d > 0; d--) {
          const name = $pos.node(d).type.name;
          if (name === 'codeBlock') {
            codeBlockDepth = d;
          } else if (name === 'listItem' || name === 'taskItem') {
            listItemDepth = d;
          }
        }

        if (offset === 0) {
           bestPos = pos;
           if (codeBlockDepth > 0) bestDepth = codeBlockDepth;
           else if (listItemDepth > 0) bestDepth = listItemDepth;
           else bestDepth = 1;
        }

        if (activeNodeType === 'codeBlock' && codeBlockDepth > 0) {
           bestPos = pos;
           bestDepth = codeBlockDepth;
           break;
        } 
        else if ((activeNodeType === 'li' || activeNodeType === 'listItem' || activeNodeType === 'taskItem') && listItemDepth > 0 && codeBlockDepth === -1) {
           bestPos = pos;
           bestDepth = listItemDepth;
           break;
        } 
        else if (offset === 0 && !activeNodeType || (activeNodeType !== 'codeBlock' && activeNodeType !== 'li' && activeNodeType !== 'listItem' && activeNodeType !== 'taskItem')) {
           break;
        }
      }

      if (bestPos < 0) return;

      const $finalPos = view.state.doc.resolve(bestPos);
      let nodePos = bestDepth > 0 ? $finalPos.before(bestDepth) : $finalPos.before(1);

      try {
        let selection = NodeSelection.create(view.state.doc, nodePos);

        if (selection.node.type.isInline || selection.node.type.name === 'tableRow') {
          const $posResolved = view.state.doc.resolve(selection.from);
          selection = NodeSelection.create(view.state.doc, $posResolved.before());
        }

        view.dispatch(view.state.tr.setSelection(selection));

      } catch (err) {
        console.error('Failed to select node on drag handle click:', err);
      }
    };

    const handleMouseMove = (e) => {
      let curr = e.target;
      if (!curr) return;

      let blockNode = null;
      while (curr && curr !== domParent) {
        const dataType = curr.getAttribute?.('data-type');
        const hasCodeBlockClass = curr.classList?.contains('tiptap-codeblock-wrapper');
        if (dataType === 'codeBlock' || hasCodeBlockClass) {
          blockNode = curr;
          break;
        }
        if (curr.tagName.toLowerCase() === 'li') {
          blockNode = curr;
          break;
        }
        if (curr.parentElement?.classList.contains('ProseMirror')) {
          blockNode = curr;
          break;
        }
        curr = curr.parentElement;
      }

      if (!blockNode) return;

      let nodeName = blockNode.tagName.toLowerCase();
      const dataTypeAttr = blockNode.getAttribute?.('data-type');
      if (dataTypeAttr) {
        nodeName = dataTypeAttr;
      } else if (blockNode.classList?.contains('tiptap-codeblock-wrapper')) {
        nodeName = 'codeBlock';
      }

      const dragHandle = domParent.querySelector('.drag-handle');
      if (dragHandle) {
        dragHandle.setAttribute('data-active-node-type', nodeName);
      }
    };

    domParent.addEventListener('mousedown', handleDragHandleMouseDown, true);
    domParent.addEventListener('click', handleDragHandleClick, true);
    domParent.addEventListener('mousemove', handleMouseMove);
    return () => {
      domParent.removeEventListener('mousedown', handleDragHandleMouseDown, true);
      domParent.removeEventListener('click', handleDragHandleClick, true);
      domParent.removeEventListener('mousemove', handleMouseMove);
    };
  }, [editor]);

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
            if (editor.isEditable) {
              ensureTrailingEmptyParagraph(editor);
            }
          });
        }
      }
    };

    syncContent();

    const onCompositionEnd = () => {
      setTimeout(() => {
        syncContent();
        if (editor.isEditable) {
          ensureTrailingEmptyParagraph(editor);
        }
      }, 50);
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