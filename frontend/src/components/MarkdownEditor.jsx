import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Copy, Check } from 'lucide-react';
import { useEditor, EditorContent, ReactNodeViewRenderer, NodeViewWrapper, NodeViewContent } from '@tiptap/react';
import { Extension, mergeAttributes } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';

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
import { Markdown } from 'tiptap-markdown';
import { CodeBlockPrism } from './CodeBlockPrism';
import GlobalDragHandle from 'tiptap-extension-global-drag-handle';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import mermaid from 'mermaid';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { uploadImage } from '../api/noteApi';
import { getActiveServerUrl } from '../api/client';
import SlashCommand, { setOnImageUpload, setOnShowHelp } from './SlashCommandExtension';
import SlashCommandHelpModal from './SlashCommandHelpModal';

// Prism is now used via CodeBlockPrism extension

const LANGUAGES = [
  'plain', 'mermaid', 'math', 'bash', 'c', 'cpp', 'csharp', 'css', 'diff', 'dockerfile', 
  'go', 'graphql', 'html', 'ini', 'java', 'javascript', 'json', 'jsx', 'kotlin', 'latex',
  'less', 'lua', 'makefile', 'markdown', 'nginx', 'objectivec', 'perl', 'php', 'powershell',
  'python', 'r', 'ruby', 'rust', 'scala', 'scss', 'shell', 'sql', 'swift', 'toml', 'tsx', 
  'typescript', 'xml', 'yaml',
];

mermaid.initialize({ startOnLoad: false, theme: 'default' });

// 自定义 Image 组件，对齐 LazyImage 的 URL 拼接逻辑，并添加尺寸选择功能
export const TiptapImageComponent = ({ node, updateAttributes, editor }) => {
  const isEditable = editor?.isEditable;
  const src = node.attrs.src;
  const width = node.attrs.width || 'auto';
  const activeUrl = getActiveServerUrl();
  const fullSrc = activeUrl && src?.startsWith('/') ? `${activeUrl}${src}` : src;
  const [showSizePicker, setShowSizePicker] = useState(false);
  const pickerRef = useRef(null);

  const sizes = [
    { label: '600px', value: '600px' },
    { label: '900px', value: '900px' },
    { label: '1200px', value: '1200px' },
    { label: '25%', value: '25%' },
    { label: '50%', value: '50%' },
    { label: '75%', value: '75%' },
    { label: '100%', value: '100%' },
    { label: '自适应', value: 'auto' },
  ];

  useEffect(() => {
    if (!showSizePicker) return;
    const handleClickOutside = (e) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) {
        setShowSizePicker(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showSizePicker]);

  return (
    <NodeViewWrapper className="tiptap-image-wrapper flex justify-start my-4 group">
      <div
        className={`relative max-w-full ${width === 'auto' ? 'w-fit' : ''}`}
        style={width !== 'auto' ? { width } : undefined}
      >
        <img
          src={fullSrc}
          alt={node.attrs.alt || ''}
          className="tiptap-image rounded-lg shadow-sm group-hover:shadow-md transition-shadow duration-300 block"
          style={{ width: width === 'auto' ? 'auto' : '100%', maxHeight: '80vh' }}
          loading="lazy"
        />

        {isEditable && (
          <div className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-10" contentEditable={false}>
            <button
              onClick={() => setShowSizePicker(!showSizePicker)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 bg-modal border border-borderSubtle text-textPrimary rounded-md text-[11px] font-medium hover:text-primeAccent hover:border-primeAccent transition-all shadow-xl"
            >
              <span>{width === 'auto' ? '自适应' : width}</span>
              <svg width="10" height="10" viewBox="0 0 12 12" fill="none" className={`transition-transform duration-200 ${showSizePicker ? 'rotate-180' : ''}`}>
                <path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>

            {showSizePicker && (
              <div
                ref={pickerRef}
                className="absolute bottom-full right-0 mb-2 bg-modal border border-borderSubtle rounded-lg shadow-2xl py-1 min-w-[100px] overflow-hidden animate-in fade-in slide-in-from-bottom-1 duration-200"
              >
                {sizes.map(s => (
                  <button
                    key={s.value}
                    onClick={() => {
                      updateAttributes({ width: s.value });
                      setShowSizePicker(false);
                    }}
                    className={`w-full px-3 py-1.5 text-left text-[11px] flex items-center justify-between transition-colors ${width === s.value
                      ? 'bg-primeAccent/15 text-primeAccent font-bold'
                      : 'text-textSecondary hover:bg-primeAccent/5 hover:text-textPrimary'
                      }`}
                  >
                    {s.label}
                    {width === s.value && (
                      <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                        <path d="M2 6L5 9L10 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </NodeViewWrapper>
  );
};

export const CustomImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: 'auto',
        renderHTML: attributes => ({
          width: attributes.width !== 'auto' ? attributes.width : undefined,
          style: attributes.width !== 'auto' ? `width: ${attributes.width}; height: auto;` : undefined,
        }),
        parseHTML: element => element.getAttribute('width') || element.style.width || 'auto',
      },
    };
  },
  addStorage() {
    return {
      markdown: {
        serialize: (state, node) => {
          const { src, alt, width } = node.attrs;
          if (width && width !== 'auto') {
            state.write(`<img src="${src}" alt="${alt || ''}" width="${width}" />`);
          } else {
            state.write(`![${alt || ''}](${src})`);
          }
          state.closeBlock(node);
        }
      }
    }
  },
  addNodeView() {
    return ReactNodeViewRenderer(TiptapImageComponent);
  },
}).configure({
  inline: false,
  allowBase64: true,
});

// 自定义代码块组件 — 带 header + 语言选择下拉框
export const CodeBlockComponent = ({ node, updateAttributes, editor }) => {
  const isEditable = editor?.isEditable;
  const language = node.attrs.language || 'plain';
  const [showLangPicker, setShowLangPicker] = useState(false);
  const [langSearch, setLangSearch] = useState('');
  const [pickerPos, setPickerPos] = useState({ top: 0, left: 0 });
  const [previewContent, setPreviewContent] = useState('');
  const [previewError, setPreviewError] = useState('');
  const [copied, setCopied] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const btnRef = useRef(null);
  const pickerRef = useRef(null);
  const scrollContainerRef = useRef(null);
  const copyTimerRef = useRef(null);

  const [isCollapsed, setIsCollapsed] = useState(true);
  const linesCount = node.textContent.split('\n').length;
  const isTooLong = linesCount > 20; // 超过 20 行算超长
  const displayCollapsed = isTooLong && isCollapsed;
  const lastLinesCount = useRef(linesCount);

  useEffect(() => {
    if (isEditable && linesCount > 20 && lastLinesCount.current <= 20) {
      // 在编辑状态下，如果行数是从 20 行以内涨到 20 行以上，自动展开，避免打断用户输入
      setIsCollapsed(false);
    }
    lastLinesCount.current = linesCount;
  }, [linesCount, isEditable]);

  const handleCopy = (e) => {
    e.preventDefault();
    e.stopPropagation();
    navigator.clipboard.writeText(node.textContent).then(() => {
      setCopied(true);
      copyTimerRef.current = setTimeout(() => setCopied(false), 1500);
    }).catch(() => {});
  };

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

  const filteredLangs = LANGUAGES.filter(l =>
    l.toLowerCase().includes(langSearch.toLowerCase())
  );

  useEffect(() => {
    setSelectedIndex(0);
  }, [langSearch]);

  useEffect(() => {
    if (showLangPicker) {
      const activeItem = scrollContainerRef.current?.querySelector(`[data-index="${selectedIndex}"]`);
      activeItem?.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex, showLangPicker]);

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (filteredLangs.length > 0 ? (prev + 1) % filteredLangs.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (filteredLangs.length > 0 ? (prev - 1 + filteredLangs.length) % filteredLangs.length : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredLangs[selectedIndex]) {
        updateAttributes({ language: filteredLangs[selectedIndex] });
        setShowLangPicker(false);
        setLangSearch('');
      }
    } else if (e.key === 'Escape') {
      setShowLangPicker(false);
      setLangSearch('');
    }
  };

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

  // Handle advanced rendering
  useEffect(() => {
    const code = node.textContent;
    if (!code || !code.trim()) {
      setPreviewContent('');
      setPreviewError('');
      return;
    }

    if (language === 'mermaid') {
      const id = `mermaid-${Math.random().toString(36).substr(2, 9)}`;
      mermaid.render(id, code)
        .then(({ svg }) => {
          setPreviewContent(svg);
          setPreviewError('');
        })
        .catch(err => setPreviewError(err.message));
    } else if (language === 'math' || language === 'latex') {
      try {
        const html = katex.renderToString(code, { displayMode: true, throwOnError: true });
        setPreviewContent(html);
        setPreviewError('');
      } catch (err) {
        setPreviewError(err.message);
      }
    } else {
      setPreviewContent('');
      setPreviewError('');
    }
  }, [node.textContent, language]);

  return (
    <NodeViewWrapper className="tiptap-codeblock-wrapper">
      <div className="bg-code rounded-xl border border-borderSubtle/60 my-6 overflow-hidden">
        <div className="bg-code-header px-4 py-2.5 flex items-center justify-between border-b border-borderSubtle/60">
          {isEditable ? (
            <button
              ref={btnRef}
              onClick={openPicker}
              contentEditable={false}
              className="text-[11px] text-textSecondary font-mono lowercase hover:text-primeAccent transition-colors flex items-center gap-1"
            >
              {language}
              <svg width="8" height="8" viewBox="0 0 8 8" fill="none" className="opacity-40">
                <path d="M2 3L4 5L6 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          ) : (
            <span className="text-[11px] text-textSecondary font-mono lowercase">{language}</span>
          )}
          <button
            contentEditable={false}
            onClick={handleCopy}
            className="text-[12px] text-textSecondary/40 hover:text-primeAccent transition-colors flex items-center gap-1.5 px-1.5 py-0.5 rounded hover:bg-primeAccent/10"
          >
            {copied ? (
              <>
                <Check size={14} strokeWidth={2} />
                <span>已复制</span>
              </>
            ) : (
              <>
                <Copy size={14} strokeWidth={1.2} />
                <span>复制</span>
              </>
            )}
          </button>
        </div>
        <div className="relative">
          <pre 
            style={displayCollapsed ? { maxHeight: '350px', overflowY: 'hidden' } : { maxHeight: 'none' }}
            className="p-4 overflow-x-auto custom-scrollbar text-[14px] font-mono leading-relaxed whitespace-pre-wrap break-words transition-all duration-300"
          >
            <NodeViewContent as="code" />
          </pre>
          {displayCollapsed && (
            <div 
              style={{ background: 'linear-gradient(to top, var(--bg-code) 0%, transparent 100%)' }}
              className="absolute bottom-0 left-0 right-0 h-16 pointer-events-none z-10" 
            />
          )}
        </div>
        {isTooLong && (
          <div className="flex justify-center pb-3 pt-1 border-t border-borderSubtle/30 bg-code-header/30" contentEditable={false}>
            <button
              onClick={() => setIsCollapsed(!isCollapsed)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-textSecondary hover:text-primeAccent hover:bg-primeAccent/10 rounded-lg transition-all font-medium"
            >
              {isCollapsed ? (
                <>
                  <span>展开代码 ({linesCount} 行)</span>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="mt-0.5">
                    <path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </>
              ) : (
                <>
                  <span>收起代码</span>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="mt-0.5 rotate-180">
                    <path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </>
              )}
            </button>
          </div>
        )}
        {(language === 'mermaid' || language === 'math' || language === 'latex') && (
          <div className="bg-sidebar border-t border-borderSubtle p-4 flex flex-col items-center justify-center overflow-x-auto min-h-[60px]" contentEditable={false}>
            {previewError ? (
              <div className="text-red-500 text-xs font-mono whitespace-pre-wrap">{previewError}</div>
            ) : previewContent ? (
              <div dangerouslySetInnerHTML={{ __html: previewContent }} className={language === 'mermaid' ? 'mermaid-preview' : 'math-preview'} />
            ) : (
              <div className="text-textSecondary text-xs">渲染中...</div>
            )}
          </div>
        )}
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
            onKeyDown={handleKeyDown}
            placeholder="搜索语言..."
            contentEditable={false}
            className="px-3 py-2 text-[11px] text-textPrimary bg-sidebar border-b border-borderSubtle outline-none font-mono w-full"
            autoFocus
          />
          <div ref={scrollContainerRef} className="overflow-y-auto custom-scrollbar py-1 flex-1">
            {filteredLangs.length === 0 && (
              <div className="px-3 py-2 text-[10px] text-textSecondary/40 font-mono">无匹配</div>
            )}
            {filteredLangs.map((lang, index) => (
              <button
                key={lang}
                data-index={index}
                contentEditable={false}
                onClick={() => {
                  updateAttributes({ language: lang });
                  setShowLangPicker(false);
                  setLangSearch('');
                }}
                className={`w-full px-3 py-1.5 text-[11px] font-mono lowercase text-left transition-colors ${index === selectedIndex
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

export const CustomCodeBlock = CodeBlockPrism.extend({
  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockComponent);
  },
});

export const AutoWrapSelection = Extension.create({
  name: 'autoWrapSelection',
  addProseMirrorPlugins() {
    const editor = this.editor;
    return [
      new Plugin({
        key: new PluginKey('autoWrapSelection'),
        props: {
          handleTextInput: (view, from, to, text) => {
            const { state, dispatch } = view;
            const { selection, tr } = state;

            if (selection.empty) {
              return false;
            }

            const markdownMarks = {
              '`': 'code',
              '*': 'italic',
              '~': 'strike',
              '_': 'underline',
            };

            const wrapPairs = {
              "'": ["'", "'"],
              '"': ['"', '"'],
              '(': ['(', ')'],
              '[': ['[', ']'],
              '{': ['{', '}'],
              '<': ['<', '>'],
              '“': ['“', '”'],
              '”': ['“', '”'],
              '‘': ['‘', '’'],
              '’': ['‘', '’'],
              '【': ['【', '】'],
              '（': ['（', '）'],
              '《': ['《', '》'],
            };

            const mark = markdownMarks[text];
            const pair = wrapPairs[text];

            if (!mark && !pair) {
              return false;
            }

            // 如果处于输入法组合状态 (IME Composition)，绝对不能 return true (preventDefault)，
            // 否则会破坏浏览器 IME 状态导致卡死。我们需要等组合结束后再修正文档。
            if (view.composing) {
              const selectedText = state.doc.textBetween(from, to);
              const onCompEnd = () => {
                view.dom.removeEventListener('compositionend', onCompEnd);
                setTimeout(() => {
                  const { state: newState, dispatch: newDispatch } = view;
                  const newTr = newState.tr;
                  // IME 已经把选中文本替换为了 text，我们需要删掉它并包裹原文本
                  newTr.delete(from, from + text.length);

                  if (mark) {
                    newTr.insertText(selectedText, from);
                    const newSel = newState.selection.constructor.create(newTr.doc, from, from + selectedText.length);
                    newTr.setSelection(newSel);
                    newDispatch(newTr);
                    editor.chain().focus().toggleMark(mark).run();
                  } else if (pair) {
                    newTr.insertText(pair[0] + selectedText + pair[1], from);
                    const newSel = newState.selection.constructor.create(newTr.doc, from + pair[0].length, from + pair[0].length + selectedText.length);
                    newTr.setSelection(newSel);
                    newDispatch(newTr);
                  }
                }, 10);
              };
              view.dom.addEventListener('compositionend', onCompEnd);
              return false;
            }

            if (mark) {
              editor.chain().focus().toggleMark(mark).run();
              return true;
            }

            if (pair) {
              tr.insertText(pair[0], selection.from);
              tr.insertText(pair[1], selection.to + pair[0].length);

              const newSelection = state.selection.constructor.create(
                tr.doc,
                selection.from + pair[0].length,
                selection.to + pair[0].length
              );
              tr.setSelection(newSelection);
              dispatch(tr);
              return true;
            }

            return false;
          },
        },
      }),
    ];
  },
});

export const InlineMathDecorations = Extension.create({
  name: 'inlineMathDecorations',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('inlineMathDecorations'),
        state: {
          init(_, { doc }) {
            return this.spec.buildDecorations(doc, null);
          },
          apply(tr, old, oldState, newState) {
            if (!tr.docChanged && oldState.selection === newState.selection) {
              return old;
            }
            return this.spec.buildDecorations(newState.doc, newState.selection);
          }
        },
        props: {
          decorations(state) {
            return this.getState(state);
          }
        },
        buildDecorations(doc, selection) {
          const decorations = [];

          doc.descendants((node, pos) => {
            if (node.type.name === 'codeBlock' || node.type.name === 'code_block') {
              return false;
            }
            if (node.isBlock && node.isTextblock) {
              const text = node.textContent;
              const mathRegex = /\$([^\$\n]+)\$/g;
              let match;

              while ((match = mathRegex.exec(text)) !== null) {
                // Ignore if it is part of $$...$$
                if (text[match.index - 1] === '$' || text[match.index + match[0].length] === '$') {
                  continue;
                }

                const start = pos + 1 + match.index;
                const end = start + match[0].length;

                // 检查匹配到的文本是否在行内代码 (code mark) 中
                let hasCodeMark = false;
                doc.nodesBetween(start, end, (child) => {
                  if (child.isInline && child.marks.some(mark => mark.type.name === 'code')) {
                    hasCodeMark = true;
                  }
                });

                if (hasCodeMark) {
                  continue;
                }

                const isCursorInside = selection &&
                  ((selection.from >= start && selection.from <= end) ||
                    (selection.to >= start && selection.to <= end));

                if (!isCursorInside) {
                  const mathText = match[1];
                  let html = '';
                  try {
                    html = katex.renderToString(mathText, { throwOnError: false });
                  } catch (e) {
                    html = `<span class="text-red-500">${mathText}</span>`;
                  }

                  const widget = document.createElement('span');
                  widget.innerHTML = html;
                  widget.className = 'inline-math-preview mx-1 cursor-pointer';
                  // Mousedown toggles cursor position
                  widget.onmousedown = (e) => {
                    // Let ProseMirror handle the click and move cursor near it
                  };

                  decorations.push(Decoration.widget(start, widget));
                  decorations.push(Decoration.inline(start, end, {
                    style: 'display: none;',
                  }));
                }
              }
            }
          });
          return DecorationSet.create(doc, decorations);
        }
      })
    ];
  }
});

export const HeadingIdPatch = Extension.create({
  name: 'headingIdPatch',
  addGlobalAttributes() {
    return [
      {
        types: ['heading'],
        attributes: {
          id: {
            default: null,
            renderHTML: attributes => {
              if (!attributes.id) return {};
              return { id: attributes.id };
            },
            parseHTML: element => element.getAttribute('id'),
          },
        },
      },
    ];
  },
  addProseMirrorPlugins() {
    return [
      new Plugin({
        appendTransaction: (transactions, oldState, newState) => {
          if (!transactions.some(tr => tr.docChanged)) return null;
          const tr = newState.tr;
          let changed = false;
          newState.doc.descendants((node, pos) => {
            if (node.type.name === 'heading') {
              const id = node.textContent
                .toLowerCase()
                .trim()
                .replace(/\s+/g, '-')
                .replace(/[^\p{L}\p{N}_-]/gu, '');
              if (node.attrs.id !== id) {
                tr.setNodeMarkup(pos, undefined, { ...node.attrs, id });
                changed = true;
              }
            }
          });
          return changed ? tr : null;
        },
      }),
    ];
  },
});

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
        codeBlock: false, // replaced by CodeBlockLowlight
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

  // 暴露 editor 实例给父组件
  useEffect(() => {
    if (editorRef && editor) {
      editorRef.current = editor;
    }
  }, [editor, editorRef]);

  // 外部内容变更时同步（比如从 RAW 模式切回来）
  // IME composition 期间绝不调用 setContent，否则会破坏 composition 状态导致无限循环卡死；
  // 同时，如果编辑器处于聚焦状态，说明用户正在输入，此时也绝不调用 setContent，避免打断输入流或破坏 IME 状态。
  // composition 结束后补偿同步被跳过的 setContent
  useEffect(() => {
    if (!editor || initialContent === undefined) return;

    const syncContent = () => {
      // 如果正在输入或已聚焦，跳过同步。只有在非聚焦状态下（如切模式、切笔记）才进行强制同步。
      if (editor.view.composing || editor.isFocused) return;

      if (initialContent !== lastMarkdownRef.current) {
        const currentMd = editor.storage.markdown.getMarkdown();
        if (initialContent !== currentMd) {
          queueMicrotask(() => {
            // 再次检查聚焦状态，防止 microtask 执行时用户已聚焦
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
      // compositionend 后 ProseMirror 需要一个 tick 才刷新 composing=false
      setTimeout(() => { syncContent(); }, 50);
    };
    editor.view.dom.addEventListener('compositionend', onCompositionEnd);
    return () => editor.view.dom.removeEventListener('compositionend', onCompositionEnd);
  }, [initialContent, editor]);

  // 同步 onImageUpload 回调给 SlashCommand
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