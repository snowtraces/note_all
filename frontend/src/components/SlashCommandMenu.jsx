import React, { useEffect, useRef } from 'react';
import {
  Pilcrow, Heading1, Heading2, Heading3,
  List, ListOrdered, ListChecks, Quote,
  Code2, Minus, Table2, Image as ImageIcon,
} from 'lucide-react';

const COMMAND_GROUPS = [
  {
    label: '文本',
    items: [
      { id: 'paragraph', title: '正文', desc: '普通文本段落', aliases: ['p', 'text', 'zw', 'zhengwen'], icon: Pilcrow },
      { id: 'heading1', title: '标题 1', desc: '一级标题', aliases: ['h1', '1', 'bt1'], icon: Heading1 },
      { id: 'heading2', title: '标题 2', desc: '二级标题', aliases: ['h2', '2', 'bt2'], icon: Heading2 },
      { id: 'heading3', title: '标题 3', desc: '三级标题', aliases: ['h3', '3', 'bt3'], icon: Heading3 },
      { id: 'blockquote', title: '引用块', desc: '引用内容', aliases: ['quote', 'block', 'yy', 'yinyong', '>'], icon: Quote },
    ],
  },
  {
    label: '列表',
    items: [
      { id: 'bulletList', title: '无序列表', desc: '项目符号列表', aliases: ['ul', 'list', 'wx', 'wuxu', '-'], icon: List },
      { id: 'orderedList', title: '有序列表', desc: '数字编号列表', aliases: ['ol', '1.', 'yx', 'youxu'], icon: ListOrdered },
      { id: 'taskList', title: '任务列表', desc: '可勾选任务', aliases: ['task', 'todo', 'rw', 'renwu', '[]'], icon: ListChecks },
    ],
  },
  {
    label: '内容',
    items: [
      { id: 'codeBlock', title: '代码块', desc: '代码片段', aliases: ['code', 'dm', 'daima', '```'], icon: Code2 },
      { id: 'mermaid', title: '流程图 (Mermaid)', desc: '插入动态流程图', aliases: ['mermaid', 'lct', 'tu'], icon: Code2 },
      { id: 'math', title: '数学公式 (KaTeX)', desc: '插入 LaTeX 公式块', aliases: ['math', 'latex', 'gs', 'gongshi'], icon: Code2 },
      { id: 'divider', title: '分割线', desc: '水平分割线', aliases: ['divider', 'hr', 'line', 'fgx', '---'], icon: Minus },
      { id: 'table', title: '表格', desc: '插入 3×3 表格', aliases: ['table', 'bg', 'biaoge'], icon: Table2 },
      { id: 'image', title: '图片', desc: '上传本地图片', aliases: ['image', 'img', 'pic', 'tp', 'tupian'], icon: ImageIcon },
    ],
  },
];

// 扁平化所有命令（用于键盘导航）
function flattenItems(groups) {
  const flat = [];
  for (const g of groups) {
    for (const item of g.items) {
      flat.push(item);
    }
  }
  return flat;
}

// 根据 query 过滤分组
function filterGroups(query, groups) {
  if (!query) return groups;
  const q = query.toLowerCase();
  
  // 匹配 /table3*4, /table3x4, 或 /table3×4
  const tableMatch = q.match(/^table(\d+)[*xX×](\d+)$/);

  let result = groups
    .map((g) => ({
      ...g,
      items: g.items.filter(
        (item) =>
          item.title.toLowerCase().includes(q) ||
          item.desc.toLowerCase().includes(q) ||
          (item.aliases && item.aliases.some(alias => alias.includes(q)))
      ),
    }))
    .filter((g) => g.items.length > 0);

  if (tableMatch) {
    const rows = parseInt(tableMatch[1], 10);
    const cols = parseInt(tableMatch[2], 10);
    // 限制最大行列数防崩溃
    if (rows > 0 && cols > 0 && rows <= 50 && cols <= 50) {
      result.unshift({
        label: '快捷指令',
        items: [{
          id: `dynamic_table_${rows}_${cols}`,
          title: `动态表格 ${rows}×${cols}`,
          desc: `快速插入 ${rows} 行 ${cols} 列的表格`,
          icon: Table2,
          rows,
          cols,
        }]
      });
    }
  }

  return result;
}

// 计算弹窗位置
function calcPosition(rect, menuHeight) {
  if (!rect) return { top: -9999, left: -9999 };
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let top = rect.bottom + 4;
  let left = rect.left;

  if (top + menuHeight > vh - 16) {
    top = rect.top - menuHeight - 4;
  }
  if (left + 280 > vw - 16) {
    left = vw - 280 - 16;
  }
  if (left < 8) left = 8;

  return { top, left };
}

export default function SlashCommandMenu({
  items: groups,
  selectedIndex,
  onSelect,
  clientRect,
}) {
  const menuRef = useRef(null);
  const posRef = useRef({ top: -9999, left: -9999 });

  const flatItems = flattenItems(groups);

  // 更新位置
  useEffect(() => {
    if (!clientRect) return;
    const rect = clientRect();
    if (!rect) return;
    const menuHeight = menuRef.current?.offsetHeight || 320;
    posRef.current = calcPosition(rect, menuHeight);
    // 直接修改 DOM 避免 React 重渲染
    if (menuRef.current) {
      menuRef.current.style.top = posRef.current.top + 'px';
      menuRef.current.style.left = posRef.current.left + 'px';
    }
  }, [clientRect, groups]);

  // 选中项滚动到可见区域
  useEffect(() => {
    const el = menuRef.current?.querySelector('[data-selected="true"]');
    el?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  let flatIdx = 0;

  return (
    <div
      ref={menuRef}
      className="slash-command-menu"
      style={{ top: posRef.current.top, left: posRef.current.left }}
    >
      {groups.map((group) => {
        const groupStart = flatIdx;
        return (
          <div key={group.label} className="slash-command-group">
            <div className="slash-command-group-label">{group.label}</div>
            {group.items.map((item) => {
              const idx = flatIdx++;
              return (
                <button
                  key={item.id}
                  data-selected={idx === selectedIndex ? 'true' : 'false'}
                  className={`slash-command-item${
                    idx === selectedIndex ? ' slash-command-item-selected' : ''
                  }`}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onSelect(item);
                  }}
                >
                  <span className="slash-command-item-icon">
                    <item.icon size={18} />
                  </span>
                  <span className="slash-command-item-text">
                    <span className="slash-command-item-title">{item.title}</span>
                    <span className="slash-command-item-desc">{item.desc}</span>
                  </span>
                </button>
              );
            })}
          </div>
        );
      })}
      {flatItems.length === 0 && (
        <div className="slash-command-empty">无匹配命令</div>
      )}
    </div>
  );
}

export { COMMAND_GROUPS, flattenItems, filterGroups };
