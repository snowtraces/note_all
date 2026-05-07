import { Extension } from '@tiptap/core';
import { Suggestion, findSuggestionMatch } from '@tiptap/suggestion';
import { createRoot } from 'react-dom/client';
import React from 'react';
import SlashCommandMenu, { COMMAND_GROUPS, flattenItems, filterGroups } from './SlashCommandMenu';

// 模块级变量，由 MarkdownEditor 同步 onImageUpload 回调
let _onImageUpload = null;
let _onShowHelp = null;

export function setOnImageUpload(fn) {
  _onImageUpload = fn;
}

export function setOnShowHelp(fn) {
  _onShowHelp = fn;
}

function executeCommand(chain, item, editor) {
  const commandId = item.id;
  
  if (commandId.startsWith('dynamic_table_')) {
    chain.insertTable({ rows: item.rows, cols: item.cols, withHeaderRow: true }).run();
    return;
  }

  if (commandId.startsWith('dynamic_code_')) {
    chain.setCodeBlock({ language: item.lang }).run();
    return;
  }

  if (commandId.startsWith('dynamic_text_')) {
    chain.insertContent(item.text).run();
    return;
  }

  if (commandId.startsWith('cmd_highlight_')) {
    let color = item.color;
    if (/^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{6}$/.test(color)) {
      color = '#' + color;
    }
    // 插入带显式内联样式的 mark 标签
    chain.insertContent(`<mark style="background-color: ${color}; color: #000; padding: 0.1em 0.3em; border-radius: 4px;">${item.color}</mark>&nbsp;`).run();
    return;
  }

  if (commandId.startsWith('dynamic_link_')) {
    chain.insertContent(`<a href="${item.url}">${item.url}</a> `).run();
    return;
  }

  if (commandId.startsWith('dynamic_img_')) {
    chain.insertContent(`<img src="${item.url}" />`).run();
    return;
  }

  if (commandId.startsWith('cmd_heading_')) {
    // 使用 HTML 标签插入标题，确保其被识别为 Heading 节点
    chain.insertContent(`<h${item.level}>${item.content}</h${item.level}>`).run();
    return;
  }

  switch (commandId) {
    case 'help':
      if (_onShowHelp) {
        chain.run(); // 仅执行之前的删除操作
        _onShowHelp();
      } else {
        chain.insertContent(
`<h2>🚀 斜杠指令帮助指南</h2>
<p>输入 <code>/</code> 即可触发快捷菜单。以下是部分高级指令的使用方法：</p>
<h3>🎨 动态高亮</h3>
<p>输入 <code>/hl-颜色名</code> 或 <code>/hl-十六进制</code> 快速着色。</p>
<ul>
<li>示例：<code>/hl-red</code>, <code>/hl-yellow</code>, <code>/hl-66ccff</code></li>
</ul>
<h3>📝 快速标题</h3>
<p>输入 <code>/h1-标题内容</code> 快速创建带内容的标题（支持 h1-h6）。</p>
<ul>
<li>示例：<code>/h2-项目进度</code></li>
</ul>
<h3>🔗 资源插入</h3>
<p>输入 <code>/link:URL</code> 或 <code>/img:URL</code> 直接嵌入资源。</p>
<ul>
<li>示例：<code>/img:https://...</code></li>
</ul>
<h3>📅 效率工具</h3>
<ul>
<li><code>/date</code>: 插入当前日期</li>
<li><code>/time</code>: 插入当前时间</li>
<li><code>/clear</code>: 擦除本行所有格式，重置为正文</li>
</ul>`
        ).run();
      }
      break;
    case 'clear':
      chain.unsetAllMarks().setParagraph().run();
      break;
    case 'paragraph':
      chain.setParagraph().run();
      break;
    case 'heading1':
      chain.setHeading({ level: 1 }).run();
      break;
    case 'heading2':
      chain.setHeading({ level: 2 }).run();
      break;
    case 'heading3':
      chain.setHeading({ level: 3 }).run();
      break;
    case 'heading4':
      chain.setHeading({ level: 4 }).run();
      break;
    case 'heading5':
      chain.setHeading({ level: 5 }).run();
      break;
    case 'heading6':
      chain.setHeading({ level: 6 }).run();
      break;
    case 'blockquote':
      chain.toggleBlockquote().run();
      break;
    case 'bulletList':
      chain.toggleBulletList().run();
      break;
    case 'orderedList':
      chain.toggleOrderedList().run();
      break;
    case 'taskList':
      chain.toggleTaskList().run();
      break;
    case 'codeBlock':
      chain.toggleCodeBlock().run();
      break;
    case 'mermaid':
      chain.setCodeBlock({ language: 'mermaid' }).run();
      break;
    case 'math':
      chain.setCodeBlock({ language: 'math' }).run();
      break;
    case 'divider':
      chain.setHorizontalRule().run();
      break;
    case 'table':
      chain.insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
      break;
    case 'image':
      chain.run();
      triggerImageUpload(editor);
      break;
  }
}

export function triggerImageUpload(editor) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.multiple = true;
  input.onchange = async () => {
    const files = input.files;
    if (!files || files.length === 0) return;

    for (const file of files) {
      try {
        const base64 = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result.split(',')[1]);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });

        let result;
        if (_onImageUpload) {
          result = await _onImageUpload(base64, file.type);
        } else {
          const { uploadImage } = await import('../api/noteApi');
          result = await uploadImage(base64, file.type);
        }

        editor
          .chain()
          .focus()
          .insertContent({
            type: 'image',
            attrs: { src: result.url },
          })
          .run();
      } catch (err) {
        console.error('Image upload failed:', err);
      }
    }
  };
  input.click();
}

const SlashCommand = Extension.create({
  name: 'slashCommand',

  addOptions() {
    return {
      suggestion: {
        char: '/',
        startOfLine: false,
        allowedPrefixes: [' ', '\n', ''],
        decorationClass: 'slash-command-decoration',
        findSuggestionMatch: ({ $position }) => {
          // 如果当前在代码块中，或者处于行内代码 (code mark) 中，不触发斜杠命令
          if ($position.parent.type.name === 'codeBlock' || $position.parent.type.name === 'code_block') {
            return null;
          }
          if ($position.marks().some(mark => mark.type.name === 'code')) {
            return null;
          }

          const textBefore = $position.parent.textContent.slice(0, $position.parentOffset);

          // 匹配以 / 开头，后面跟着非空格字符的串
          const match = textBefore.match(/(?:^|\s)\/([^\s]*)$/);

          if (!match) return null;

          const matchIndex = match.index + (match[0].startsWith(' ') ? 1 : 0);

          return {
            range: {
              from: $position.pos - (textBefore.length - matchIndex),
              to: $position.pos,
            },
            query: match[1],
            text: match[0],
          };
        },
        command: ({ editor, range, props }) => {
          const chain = editor.chain().focus().deleteRange(range);
          executeCommand(chain, props, editor);
        },
        items: ({ query }) => {
          const filtered = filterGroups(query, COMMAND_GROUPS);
          filtered._query = query;
          return filtered;
        },
        render: () => {
          let element = null;
          let root = null;
          let selectedIdx = 0;
          let flatItems = [];
          let cmdFn = null;
          let rectFn = null;
          let currentItems = COMMAND_GROUPS;

          const doRender = () => {
            if (!root) return;
            root.render(
              React.createElement(SlashCommandMenu, {
                items: currentItems,
                selectedIndex: selectedIdx,
                onSelect: (item) => cmdFn(item),
                clientRect: rectFn,
              })
            );
          };

          return {
            onStart: (props) => {
              element = document.createElement('div');
              element.className = 'slash-command-portal';
              document.body.appendChild(element);
              root = createRoot(element);
              currentItems = props.items;
              flatItems = flattenItems(currentItems);
              cmdFn = props.command;
              rectFn = props.clientRect;
              selectedIdx = 0;
              doRender();
            },

            onUpdate: (props) => {
              currentItems = props.items;
              flatItems = flattenItems(currentItems);
              cmdFn = props.command;
              rectFn = props.clientRect;
              if (selectedIdx >= flatItems.length && flatItems.length > 0) {
                selectedIdx = 0;
              }
              doRender();
            },

            onKeyDown: ({ event }) => {
              if (event.key === 'ArrowDown') {
                event.preventDefault();
                event.stopPropagation();
                selectedIdx =
                  flatItems.length > 0
                    ? (selectedIdx + 1) % flatItems.length
                    : 0;
                doRender();
                return true;
              }
              if (event.key === 'ArrowUp') {
                event.preventDefault();
                event.stopPropagation();
                selectedIdx =
                  flatItems.length > 0
                    ? (selectedIdx - 1 + flatItems.length) % flatItems.length
                    : 0;
                doRender();
                return true;
              }
              if (event.key === 'Enter' && !event.isComposing) {
                if (flatItems.length > 0 && flatItems[selectedIdx]) {
                  event.preventDefault();
                  event.stopPropagation();
                  try {
                    cmdFn(flatItems[selectedIdx]);
                  } catch (err) {
                    console.error('[SlashCommand] Error executing command:', err);
                  }
                  return true;
                }
              }
              return false;
            },

            onExit: () => {
              const currentRoot = root;
              const currentElement = element;
              
              root = null;
              element = null;
              selectedIdx = 0;
              flatItems = [];
              cmdFn = null;
              rectFn = null;
              currentItems = COMMAND_GROUPS;

              // Asynchronously unmount to prevent React 18 synchronous unmount issues during ProseMirror transactions
              setTimeout(() => {
                if (currentRoot) {
                  currentRoot.unmount();
                }
                if (currentElement) {
                  currentElement.remove();
                }
              }, 0);
            },
          };
        },
      },
    };
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        ...this.options.suggestion,
        editor: this.editor,
      }),
    ];
  },
});

export default SlashCommand;
