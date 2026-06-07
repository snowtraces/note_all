import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

export const searchPluginKey = new PluginKey('search');

export const SearchExtension = Extension.create({
  name: 'search',

  addStorage() {
    return {
      searchTerm: '',
      caseSensitive: false,
      isRegex: false,
      activeMatchIndex: 0,
    };
  },

  addCommands() {
    return {
      setSearchTerm: (searchTerm) => ({ tr }) => {
        this.storage.searchTerm = searchTerm;
        tr.setMeta('search', true);
        return true;
      },
      setActiveMatchIndex: (index) => ({ tr }) => {
        this.storage.activeMatchIndex = index;
        tr.setMeta('search', true);
        return true;
      },
      setCaseSensitive: (caseSensitive) => ({ tr }) => {
        this.storage.caseSensitive = caseSensitive;
        tr.setMeta('search', true);
        return true;
      },
      setIsRegex: (isRegex) => ({ tr }) => {
        this.storage.isRegex = isRegex;
        tr.setMeta('search', true);
        return true;
      }
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: searchPluginKey,
        state: {
          init() {
            return DecorationSet.empty;
          },
          apply: (tr, oldState) => {
            if (!tr.docChanged && !tr.getMeta('search')) {
              // If doc changed, we ideally should map the old decorations, 
              // but since search needs to be exact, recomputing on doc change is safer and fast enough for preview
              if (!tr.docChanged) return oldState;
            }

            const { searchTerm, caseSensitive, isRegex, activeMatchIndex } = this.storage;

            if (!searchTerm) {
              return DecorationSet.empty;
            }

            const doc = tr.doc;
            const decorations = [];
            let matchIndex = 0;

            let searchRegex;
            try {
              if (isRegex) {
                // If it's a regex, allow evaluating it.
                searchRegex = new RegExp(searchTerm, caseSensitive ? 'g' : 'gi');
              } else {
                // Literal string search
                searchRegex = new RegExp(
                  searchTerm.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&'),
                  caseSensitive ? 'g' : 'gi'
                );
              }
            } catch (e) {
              // Ignore invalid regular expressions while typing
              return DecorationSet.empty;
            }

            doc.descendants((node, pos) => {
              if (node.isText) {
                const text = node.text;
                const matches = Array.from(text.matchAll(searchRegex));

                for (const match of matches) {
                  if (match[0].length === 0) continue;

                  const from = pos + match.index;
                  const to = from + match[0].length;
                  const isActive = matchIndex === activeMatchIndex;

                  decorations.push(
                    Decoration.inline(from, to, {
                      class: isActive
                        ? 'search-match-active bg-amber-400 text-amber-900 rounded-[2px] shadow-[0_0_0_2px_rgba(251,191,36,0.4)] transition-all'
                        : 'search-match bg-amber-500/20 text-amber-600 rounded-[2px] transition-all',
                      'data-search-index': matchIndex.toString(),
                    })
                  );
                  matchIndex++;
                }
              }
            });

            return DecorationSet.create(doc, decorations);
          },
        },
        props: {
          decorations(state) {
            return this.getState(state);
          },
        },
      }),
    ];
  },
});
