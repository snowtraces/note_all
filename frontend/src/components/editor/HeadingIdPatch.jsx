import { Extension } from '@tiptap/core';
import { Plugin } from '@tiptap/pm/state';

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