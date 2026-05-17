import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Search, FileText, Zap, BrainCircuit, Box, PenTool, Hash, Info } from 'lucide-react';
import { searchNotes } from '../api/noteApi';

/**
 * getCaretCoordinates: 计算输入框内光标的像素位置
 */
function getCaretCoordinates(element, position) {
  const div = document.createElement('div');
  const style = window.getComputedStyle(element);
  for (const prop of style) {
    div.style[prop] = style[prop];
  }
  div.style.position = 'absolute';
  div.style.visibility = 'hidden';
  div.style.whiteSpace = 'pre-wrap';
  div.style.wordWrap = 'break-word';
  div.style.width = `${element.offsetWidth}px`;
  
  const text = element.value.substring(0, position);
  div.textContent = text;
  
  const span = document.createElement('span');
  span.textContent = element.value.substring(position) || '.';
  div.appendChild(span);
  
  document.body.appendChild(div);
  const { offsetLeft: left, offsetTop: top } = span;
  const rect = element.getBoundingClientRect();
  document.body.removeChild(div);
  
  return {
    top: rect.top + top - element.scrollTop,
    left: rect.left + left - element.scrollLeft
  };
}

const MentionMenu = ({ 
  inputRef, 
  onSelect, 
  onClose,
  triggerChar,
  searchText
}) => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const menuRef = useRef(null);

  const staticTools = [
    { id: 'search', title: '搜索', icon: <Search size={14} />, desc: '在知识库中检索相关文档' },
    { id: 'summarize', title: '总结', icon: <Box size={14} />, desc: '对当前内容进行深度摘要' },
    { id: 'save_note', title: '保存笔记', icon: <Zap size={14} />, desc: '将当前对话保存为永久笔记' },
    { id: 'compare', title: '对比', icon: <FileText size={14} />, desc: '对比多个文档的差异' },
    { id: 'generate', title: '生成', icon: <PenTool size={14} />, desc: '基于上下文创作新内容' },
    { id: 'analyze', title: '分析', icon: <BrainCircuit size={14} />, desc: '分析文档间的逻辑关联' }
  ];

  const fetchItems = useCallback(async (q) => {
    if (triggerChar === '/') {
      const filtered = staticTools.filter(t => 
        t.id.includes(q.toLowerCase()) || t.title.includes(q)
      );
      setItems(filtered);
    } else if (triggerChar === '@') {
      setLoading(true);
      try {
        const results = await searchNotes(q);
        setItems(results.slice(0, 10).map(r => ({
          id: r.id,
          title: r.ai_title || r.original_name,
          desc: r.ai_summary || '查看详情',
          icon: <FileText size={14} />,
          raw: r
        })));
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
  }, [triggerChar]);

  useEffect(() => {
    fetchItems(searchText);
    setActiveIndex(0);
    
    // 计算位置
    if (inputRef.current) {
      const pos = getCaretCoordinates(inputRef.current, inputRef.current.selectionStart);
      setCoords(pos);
    }
  }, [searchText, fetchItems, inputRef]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex(prev => (prev + 1) % Math.max(1, items.length));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex(prev => (prev - 1 + items.length) % Math.max(1, items.length));
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        if (items.length > 0) {
          e.preventDefault();
          e.stopPropagation();
          onSelect(items[activeIndex]);
        }
      } else if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [items, activeIndex, onSelect, onClose]);

  if (items.length === 0 && !loading) return null;

  return createPortal(
    <div 
      ref={menuRef}
      className="fixed z-[1000] bg-card/95 backdrop-blur-xl border border-borderSubtle rounded-xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] overflow-hidden min-w-[240px] max-w-[320px] animate-in fade-in zoom-in-95 duration-100"
      style={{ 
        top: `${coords.top - 8}px`,
        left: `${coords.left}px`,
        transform: 'translateY(-100%)'
      }}
    >
      <div className="px-3 py-2 bg-bgSubtle/50 border-b border-borderSubtle flex items-center justify-between">
        <span className="text-[10px] font-bold text-primeAccent uppercase tracking-widest">
          {triggerChar === '/' ? '可用工具集' : '知识库联想'}
        </span>
        {loading && <div className="w-3 h-3 border-2 border-primeAccent/20 border-t-primeAccent animate-spin rounded-full"></div>}
      </div>

      <div className="max-h-[260px] overflow-y-auto custom-scrollbar p-1">
        {items.map((item, idx) => (
          <div
            key={item.id}
            onClick={() => onSelect(item)}
            onMouseEnter={() => setActiveIndex(idx)}
            className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors ${idx === activeIndex ? 'bg-primeAccent/10 text-primeAccent' : 'hover:bg-bgHover text-textSecondary'}`}
          >
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border ${idx === activeIndex ? 'bg-primeAccent/20 border-primeAccent/30' : 'bg-sidebar border-borderSubtle'}`}>
              {item.icon}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[12px] font-bold truncate">
                {triggerChar === '/' ? `/${item.id}` : `@${item.title}`}
              </div>
              <div className="text-[9px] text-textTertiary truncate">
                {item.desc}
              </div>
            </div>
          </div>
        ))}
      </div>
      
      <div className="px-3 py-1.5 bg-bgSubtle/50 border-t border-borderSubtle text-[9px] text-textMuted font-mono flex items-center gap-1.5">
        <Info size={10} />
        <span>使用 ↑↓ 选择，回车确认</span>
      </div>
    </div>,
    document.body
  );
};

export default MentionMenu;
