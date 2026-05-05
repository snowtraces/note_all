import { Extension } from '@tiptap/core';
import { Suggestion } from '@tiptap/suggestion';
import { createRoot } from 'react-dom/client';
import React from 'react';
import SlashCommandMenu, { COMMAND_GROUPS, flattenItems, filterGroups } from './SlashCommandMenu';

// 模块级变量，由 MarkdownEditor 同步 onImageUpload 回调
let _onImageUpload = null;
export function setOnImageUpload(fn) {
  _onImageUpload = fn;
}

function executeCommand(chain, item, editor) {
  const commandId = item.id;
  
  if (commandId.startsWith('dynamic_table_')) {
    chain.insertTable({ rows: item.rows, cols: item.cols, withHeaderRow: true }).run();
    return;
  }

  switch (commandId) {
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
                event.preventDefault();
                event.stopPropagation();
                if (flatItems[selectedIdx]) {
                  try {
                    cmdFn(flatItems[selectedIdx]);
                  } catch (err) {
                    console.error('[SlashCommand] Error executing command:', err);
                  }
                }
                return true;
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
