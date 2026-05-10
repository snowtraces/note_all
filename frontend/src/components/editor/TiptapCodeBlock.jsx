import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Copy, Check } from 'lucide-react';
import { ReactNodeViewRenderer, NodeViewWrapper, NodeViewContent } from '@tiptap/react';
import mermaid from 'mermaid';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { CodeBlockPrism } from '../CodeBlockPrism';

mermaid.initialize({ startOnLoad: false, theme: 'default', suppressErrors: true });

const LANGUAGES = [
  'plain', 'mermaid', 'math', 'bash', 'c', 'cpp', 'csharp', 'css', 'diff', 'dockerfile',
  'go', 'graphql', 'html', 'ini', 'java', 'javascript', 'json', 'jsx', 'kotlin', 'latex',
  'less', 'lua', 'makefile', 'markdown', 'nginx', 'objectivec', 'perl', 'php', 'powershell',
  'python', 'r', 'ruby', 'rust', 'scala', 'scss', 'shell', 'sql', 'swift', 'toml', 'tsx',
  'typescript', 'xml', 'yaml',
];

const MERMAID_TEMPLATES = [
  { label: '流程图', desc: '节点+箭头', code: 'flowchart TD\n    A[开始] --> B{判断}\n    B -->|是| C[执行]\n    B -->|否| D[跳过]\n    C --> E[结束]' },
  { label: '序列图', desc: '交互时序', code: 'sequenceDiagram\n    participant 用户\n    participant 服务器\n    用户->>服务器: 发送请求\n    服务器-->>用户: 返回响应' },
  { label: '类图', desc: '继承关系', code: 'classDiagram\n    class Animal\n    Animal : +name String\n    Animal : +move()\n    class Dog\n    Dog : +bark()\n    Animal <|-- Dog' },
  { label: '甘特图', desc: '时间排期', code: 'gantt\n    title 项目进度\n    section 设计\n    需求分析 :a1, 2024-01-01, 7d\n    UI设计 :a2, after a1, 5d\n    section 开发\n    前端开发 :b1, after a2, 10d' },
  { label: '饼图', desc: '占比分布', code: 'pie title 市场份额\n    "产品A" : 40\n    "产品B" : 30\n    "产品C" : 20\n    "其他" : 10' },
  { label: '状态图', desc: '流转切换', code: 'stateDiagram-v2\n    [*] --> 待处理\n    待处理 --> 进行中: 开始\n    进行中 --> 已完成: 完成\n    已完成 --> [*]' },
];

const CodeBlockComponent = ({ node, updateAttributes, editor, getPos }) => {
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
  const isTooLong = linesCount > 20;
  const displayCollapsed = isTooLong && isCollapsed;
  const lastLinesCount = useRef(linesCount);

  useEffect(() => {
    if (isEditable && linesCount > 20 && lastLinesCount.current <= 20) {
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

  const insertTemplate = (templateCode) => {
    const pos = getPos();
    if (pos === undefined) return;
    const tr = editor.state.tr;
    const newContent = editor.state.schema.text(templateCode);
    const from = pos + 1;
    const to = from + node.content.size;
    if (from === to) {
      tr.insert(from, newContent);
    } else {
      tr.replaceWith(from, to, newContent);
    }
    editor.view.dispatch(tr);
  };

  useEffect(() => {
    const code = node.textContent;
    if (!code || !code.trim()) {
      setPreviewContent('');
      setPreviewError('');
      return;
    }

    if (language === 'mermaid') {
      const id = `mermaid-${Math.random().toString(36).substr(2, 9)}`;
      // 清理上一次 mermaid 渲染可能残留的错误 SVG
      const oldErrorEl = document.getElementById('d' + id);
      if (oldErrorEl) oldErrorEl.remove();
      mermaid.render(id, code)
        .then(({ svg }) => {
          // 清理 mermaid 内部产生的错误占位元素
          const errEl = document.querySelector(`[data-mermaid-id="${id}"]`);
          if (errEl) errEl.remove();
          setPreviewContent(svg);
          setPreviewError('');
        })
        .catch(err => {
          // 只清理本次渲染产生的错误 SVG，避免误删其他 mermaid 代码块的渲染结果
          const errorEl = document.getElementById('d' + id);
          if (errorEl) errorEl.remove();
          setPreviewError(err.message || '图表语法错误');
        });
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
          <div className="flex items-center gap-1 flex-wrap">
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
            {isEditable && language === 'mermaid' && (
              <>
                {MERMAID_TEMPLATES.map(t => (
                  <button
                    key={t.label}
                    onClick={() => insertTemplate(t.code)}
                    className="px-2 py-0.5 text-[10px] text-textSecondary/50 font-mono hover:text-primeAccent hover:bg-primeAccent/10 rounded transition-colors border border-transparent hover:border-primeAccent/20"
                  >
                    {t.label}
                  </button>
                ))}
              </>
            )}
          </div>
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
          <div className="bg-sidebar border-t border-borderSubtle p-4 overflow-x-auto min-h-[60px]" contentEditable={false}>
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