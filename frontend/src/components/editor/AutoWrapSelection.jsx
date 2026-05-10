import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';

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

            // IME composition 期间绝不 return true，否则会破坏浏览器 IME 状态导致卡死。
            if (view.composing) {
              const selectedText = state.doc.textBetween(from, to);
              const onCompEnd = () => {
                view.dom.removeEventListener('compositionend', onCompEnd);
                setTimeout(() => {
                  const { state: newState, dispatch: newDispatch } = view;
                  const newTr = newState.tr;
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