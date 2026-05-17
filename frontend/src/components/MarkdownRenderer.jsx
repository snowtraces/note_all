import React, { useEffect, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';

import './MarkdownEditor.css';
import { getCommonExtensions } from './editor/commonExtensions';

const preprocessContent = (text) => {
  if (!text) return '';
  // Replace [[tool:xxx]] with standard markdown inline code `🛠️ xxx`
  let processed = text.replace(/\[\[tool:([a-zA-Z0-9_]+)\]\]/g, '`🛠️ $1`');
  // Replace [[note:id|title]] with standard markdown link [📄 title](/note/id)
  processed = processed.replace(/\[\[note:(\d+)\|(.*?)\]\]/g, '[📄 $2](/note/$1)');
  return processed;
};

const MarkdownRenderer = React.memo(({ content, className = '' }) => {
  const containerRef = useRef(null);
  const processedContent = React.useMemo(() => preprocessContent(content), [content]);

  const editor = useEditor({
    editable: false,
    extensions: getCommonExtensions(),
    content: processedContent || '',
    editorProps: {
      attributes: {
        class: 'tiptap-content outline-none',
      },
    },
  });

  useEffect(() => {
    if (editor && processedContent !== undefined) {
       const currentContent = editor.storage.markdown.getMarkdown();
       if (processedContent !== currentContent) {
         queueMicrotask(() => {
           if (editor && !editor.isDestroyed) {
             editor.commands.setContent(processedContent || '', false, {
               parseOptions: { preserveWhitespace: 'full' },
             });
           }
         });
       }
    }
  }, [processedContent, editor]);

  // 对提及（工具/笔记）进行二次精细化 DOM 渲染和交互绑定
  useEffect(() => {
    if (editor && containerRef.current) {
      const container = containerRef.current;

      // 1. 处理所有工具提及 (code tags starting with 🛠️)
      const codes = container.querySelectorAll('code');
      codes.forEach(code => {
        if (code.textContent.includes('🛠️')) {
          // 精美淡琥珀色胶囊设计
          code.style.display = 'inline-flex';
          code.style.alignItems = 'center';
          code.style.gap = '4px';
          code.style.padding = '1px 6px';
          code.style.borderRadius = '6px';
          code.style.background = 'rgba(245, 158, 11, 0.08)';
          code.style.color = '#d97706';
          code.style.border = '1px solid rgba(245, 158, 11, 0.2)';
          code.style.fontSize = '12px';
          code.style.fontWeight = '600';
          code.style.fontFamily = 'inherit';
          code.style.margin = '0 2px';
        }
      });

      // 2. 处理所有笔记提及 (a tags starting with 📄 or having href /note/)
      const links = container.querySelectorAll('a');
      links.forEach(a => {
        const href = a.getAttribute('href') || '';
        if (a.textContent.includes('📄') || href.startsWith('/note/')) {
          const match = href.match(/\/note\/(\d+)/);
          const noteId = match ? match[1] : null;

          // 精美翡翠绿胶囊设计
          a.style.display = 'inline-flex';
          a.style.alignItems = 'center';
          a.style.gap = '4px';
          a.style.padding = '1px 6px';
          a.style.borderRadius = '6px';
          a.style.background = 'rgba(16, 185, 129, 0.08)';
          a.style.color = '#059669';
          a.style.border = '1px solid rgba(16, 185, 129, 0.2)';
          a.style.textDecoration = 'none';
          a.style.fontSize = '12px';
          a.style.fontWeight = '600';
          a.style.margin = '0 2px';
          a.style.transition = 'all 0.20s cubic-bezier(0.4, 0, 0.2, 1)';
          a.style.cursor = 'pointer';

          // 微动画效果
          a.onmouseenter = () => {
            a.style.background = 'rgba(16, 185, 129, 0.16)';
            a.style.borderColor = 'rgba(16, 185, 129, 0.4)';
            a.style.transform = 'translateY(-1px)';
            a.style.boxShadow = '0 4px 12px rgba(16, 185, 129, 0.15)';
          };
          a.onmouseleave = () => {
            a.style.background = 'rgba(16, 185, 129, 0.08)';
            a.style.borderColor = 'rgba(16, 185, 129, 0.2)';
            a.style.transform = 'translateY(0)';
            a.style.boxShadow = 'none';
          };

          if (noteId) {
            a.onclick = (e) => {
              e.preventDefault();
              e.stopPropagation();
              // 分发全局事件，拉起笔记详情
              const event = new CustomEvent('open-note', { detail: { id: parseInt(noteId) } });
              window.dispatchEvent(event);
            };
          }
        }
      });
    }
  }, [editor, processedContent]);

  useEffect(() => {
    if (editor && containerRef.current) {
      const updateIds = () => {
        const container = containerRef.current;
        if (!container) return;
        const headings = container.querySelectorAll('h1, h2, h3');
        headings.forEach(h => {
          const text = h.textContent || '';
          const id = text.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^\p{L}\p{N}_-]/gu, '');
          if (h.id !== id) {
            h.id = id;
          }
        });
      };

      const observer = new MutationObserver(() => {
        updateIds();
      });

      observer.observe(containerRef.current, { childList: true, subtree: true });

      updateIds();
      
      const timer = setTimeout(updateIds, 100);

      return () => {
        observer.disconnect();
        clearTimeout(timer);
      };
    }
  }, [editor, processedContent]);

  if (!editor) return null;

  return (
    <div ref={containerRef} className={`markdown-renderer-wrapper ${className}`}>
      <EditorContent editor={editor} />
    </div>
  );
});

export default MarkdownRenderer;
