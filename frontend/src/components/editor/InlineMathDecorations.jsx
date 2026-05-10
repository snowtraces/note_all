import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import katex from 'katex';

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
                if (text[match.index - 1] === '$' || text[match.index + match[0].length] === '$') {
                  continue;
                }

                const start = pos + 1 + match.index;
                const end = start + match[0].length;

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
                  widget.onmousedown = (e) => {};

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