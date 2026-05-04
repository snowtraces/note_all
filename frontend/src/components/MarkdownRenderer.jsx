import React, { useEffect, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { StarterKit } from '@tiptap/starter-kit';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import { TaskList } from '@tiptap/extension-task-list';
import { TaskItem } from '@tiptap/extension-task-item';
import { Highlight } from '@tiptap/extension-highlight';
import { Underline } from '@tiptap/extension-underline';
import { Typography } from '@tiptap/extension-typography';
import { Markdown } from 'tiptap-markdown';
import { Link } from '@tiptap/extension-link';

import './MarkdownEditor.css';
import { 
  CustomImage, 
  CustomCodeBlock, 
  InlineMathDecorations, 
  lowlight,
  HeadingIdPatch 
} from './MarkdownEditor';

const MarkdownRenderer = React.memo(({ content, className = '' }) => {
  const containerRef = useRef(null);
  const editor = useEditor({
    editable: false,
    extensions: [
      StarterKit.configure({
        codeBlock: false,
      }),
      Markdown.configure({
        html: true,
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
      Highlight.configure({ multicolor: false }),
      Typography,
      CustomCodeBlock.configure({ lowlight }),
      InlineMathDecorations,
      HeadingIdPatch,
    ],
    content: content || '',
    editorProps: {
      attributes: {
        class: 'tiptap-content outline-none',
      },
    },
  });

  useEffect(() => {
    if (editor && content !== undefined) {
       // Only update if content changed to avoid unnecessary re-renders
       const currentContent = editor.storage.markdown.getMarkdown();
       if (content !== currentContent) {
         queueMicrotask(() => {
           if (editor && !editor.isDestroyed) {
             editor.commands.setContent(content || '', false, {
               parseOptions: { preserveWhitespace: 'full' },
             });
           }
         });
       }
    }
  }, [content, editor]);

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

      // Create an observer to watch for DOM changes within the renderer
      const observer = new MutationObserver(() => {
        updateIds();
      });

      observer.observe(containerRef.current, { childList: true, subtree: true });

      // Initial run
      updateIds();
      
      // Fallback for delayed Tiptap rendering
      const timer = setTimeout(updateIds, 100);

      return () => {
        observer.disconnect();
        clearTimeout(timer);
      };
    }
  }, [editor, content]);

  if (!editor) return null;

  return (
    <div ref={containerRef} className={`markdown-renderer-wrapper ${className}`}>
      <EditorContent editor={editor} />
    </div>
  );
});

export default MarkdownRenderer;
