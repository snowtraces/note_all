import React, { useEffect, useState } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { markdown } from '@codemirror/lang-markdown';
import { EditorView, keymap } from '@codemirror/view';
import { EditorSelection } from '@codemirror/state';

// 快捷键包装命令：如加粗 (**)、斜体 (*) 等
const toggleWrap = (view, wrapStr) => {
  const { state, dispatch } = view;
  const len = wrapStr.length;
  
  const changes = [];
  const ranges = [];
  
  // 从后往前遍历选区处理，避免前面的修改影响后面选区的绝对索引
  const sortedRanges = [...state.selection.ranges].reverse();
  
  for (const range of sortedRanges) {
    const { from, to } = range;
    
    if (from === to) {
      // 空光标：插入成对的标记，并将光标放在中间
      changes.push({ from, insert: wrapStr + wrapStr });
      ranges.push(EditorSelection.cursor(from + len));
    } else {
      // 防止 from - len 越界
      const startPos = Math.max(0, from - len);
      const before = state.sliceDoc(startPos, from);
      const after = state.sliceDoc(to, to + len);
      
      if (before === wrapStr && after === wrapStr) {
        // 已包裹：拆掉包装
        changes.push(
          { from: from - len, to: from, insert: "" },
          { from: to, to: to + len, insert: "" }
        );
        ranges.push(EditorSelection.range(from - len, to - len));
      } else {
        // 未包裹：进行包裹
        changes.push(
          { from: from, insert: wrapStr },
          { from: to, insert: wrapStr }
        );
        ranges.push(EditorSelection.range(from + len, to + len));
      }
    }
  }
  
  ranges.reverse();
  
  dispatch(state.update({
    changes,
    selection: EditorSelection.create(ranges),
    scrollIntoView: true,
    userEvent: "input"
  }));
};

// 插入链接命令：把选中文本变成 [文本]()
const wrapLink = (view) => {
  const { state, dispatch } = view;
  const changes = [];
  const ranges = [];
  
  const sortedRanges = [...state.selection.ranges].reverse();
  
  for (const range of sortedRanges) {
    const { from, to } = range;
    if (from === to) {
      changes.push({ from, insert: "[]()" });
      ranges.push(EditorSelection.cursor(from + 1));
    } else {
      const selectedText = state.sliceDoc(from, to);
      changes.push({ from, to, insert: `[${selectedText}]()` });
      ranges.push(EditorSelection.cursor(from + selectedText.length + 3)); // 光标放到 () 中间
    }
  }
  
  ranges.reverse();
  
  dispatch(state.update({
    changes,
    selection: EditorSelection.create(ranges),
    scrollIntoView: true,
    userEvent: "input"
  }));
};

// 自定义 Markdown 快捷键绑定
const markdownKeymap = keymap.of([
  {
    key: 'Mod-b',
    run: (view) => {
      toggleWrap(view, '**');
      return true;
    }
  },
  {
    key: 'Mod-k',
    run: (view) => {
      wrapLink(view);
      return true;
    }
  }
]);

// 拦截输入：当选中文字时输入特殊符号进行包裹；或者未选中时对中文特殊符号进行自动闭合
const inputHandler = EditorView.inputHandler.of((view, from, to, text) => {
  const { state, dispatch } = view;
  
  // 1. 如果是非空选区，支持输入特殊符号对选区进行包裹
  if (from !== to) {
    const markdownMarks = {
      '`': '`',
      '*': '*',
      '~': '~',
      '_': '_',
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
    
    if (markdownMarks[text]) {
      const mark = markdownMarks[text];
      const selected = state.sliceDoc(from, to);
      dispatch(state.update({
        changes: { from, to, insert: mark + selected + mark },
        selection: EditorSelection.range(from + mark.length, from + mark.length + selected.length),
        userEvent: "input"
      }));
      return true;
    }
    
    if (wrapPairs[text]) {
      const pair = wrapPairs[text];
      const selected = state.sliceDoc(from, to);
      dispatch(state.update({
        changes: { from, to, insert: pair[0] + selected + pair[1] },
        selection: EditorSelection.range(from + pair[0].length, from + pair[0].length + selected.length),
        userEvent: "input"
      }));
      return true;
    }
  } else {
    // 2. 如果是空选区（普通输入），对于部分中文常用括号或符号提供自动闭合支持
    const emptyWrapPairs = {
      '【': ['【', '】'],
      '（': ['（', '）'],
      '《': ['《', '》'],
      '“': ['“', '”'],
      '‘': ['‘', '’'],
    };
    if (emptyWrapPairs[text]) {
      const pair = emptyWrapPairs[text];
      dispatch(state.update({
        changes: { from, to: from, insert: pair[0] + pair[1] },
        selection: EditorSelection.cursor(from + pair[0].length),
        userEvent: "input"
      }));
      return true;
    }
  }
  
  return false;
});

export default function RawEditor({ value, onChange, placeholder }) {
  // 检测当前是否为暗色模式
  const [isDarkMode, setIsDarkMode] = useState(() => {
    return document.documentElement.getAttribute('data-mode') === 'dark';
  });

  useEffect(() => {
    // 监听系统的 data-mode 属性变化，同步编辑器主题
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.attributeName === 'data-mode') {
          const mode = document.documentElement.getAttribute('data-mode');
          setIsDarkMode(mode === 'dark');
        }
      });
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-mode'],
    });

    return () => observer.disconnect();
  }, []);

  // 自定义主题样式覆盖，确保背景、文字色、光标及选区颜色与系统一致
  const customTheme = EditorView.theme({
    '&': {
      color: 'var(--text-primary)',
      backgroundColor: 'transparent',
      fontFamily: 'Consolas, Monaco, "Andale Mono", "Ubuntu Mono", monospace',
      fontSize: '13px',
    },
    // 去掉外层聚焦边框
    '&.cm-focused': {
      outline: 'none !important',
    },
    '.cm-scroller': {
      overflow: 'visible', // 让高度随内容自动撑开，不使用 CodeMirror 自带的滚动条
      fontFamily: 'inherit',
    },
    '.cm-content': {
      caretColor: 'var(--prime-accent)',
      padding: '8px 0',
      minHeight: '200px', // 设置最小高度
    },
    '.cm-cursor, .cm-dropCursor': {
      borderLeftColor: 'var(--prime-accent) !important',
    },
    '&.cm-focused .cm-cursor': {
      borderLeftColor: 'var(--prime-accent) !important',
    },
    // 自定义选区背景色，使用带透明度的品牌色
    '.cm-selectionBackground, & ::selection, &.cm-focused .cm-selectionBackground': {
      backgroundColor: 'color-mix(in srgb, var(--prime-accent) 25%, transparent) !important',
    },
    // 行号条样式
    '.cm-gutters': {
      backgroundColor: 'transparent',
      color: 'var(--text-muted)',
      borderRight: '1px solid var(--border-subtle)',
      userSelect: 'none',
      paddingRight: '4px',
    },
    '.cm-gutterElement': {
      paddingLeft: '4px',
      paddingRight: '8px',
    },
    // 激活行高亮样式
    '.cm-activeLine': {
      backgroundColor: 'color-mix(in srgb, var(--text-primary) 2%, transparent)',
    },
    '.cm-activeLineGutter': {
      backgroundColor: 'color-mix(in srgb, var(--text-primary) 4%, transparent)',
      color: 'var(--text-primary)',
    },
  });

  return (
    <div className="w-full text-textSecondary cm-editor-wrapper">
      <CodeMirror
        value={value}
        onChange={onChange}
        placeholder={placeholder || '在此输入 Markdown 源码...'}
        theme={isDarkMode ? 'dark' : 'light'}
        extensions={[
          markdown(),
          EditorView.lineWrapping,
          markdownKeymap,
          inputHandler,
          customTheme,
        ]}
        basicSetup={{
          lineNumbers: true, // 启用行号
          foldGutter: true,  // 启用代码折叠
          highlightActiveLine: true,
          highlightActiveLineGutter: true,
          dropCursor: true,
          allowMultipleSelections: true,
          indentOnInput: true,
          bracketMatching: true,
          closeBrackets: true,
          autocompletion: true,
          rectangularSelection: true,
          crosshairCursor: true,
        }}
      />
    </div>
  );
}
