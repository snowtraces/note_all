import { CodeBlock } from '@tiptap/extension-code-block';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import Prism from 'prismjs';

// Import common languages
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-c';
import 'prismjs/components/prism-cpp';
import 'prismjs/components/prism-csharp';
import 'prismjs/components/prism-diff';
import 'prismjs/components/prism-docker';
import 'prismjs/components/prism-go';
import 'prismjs/components/prism-graphql';
import 'prismjs/components/prism-ini';
import 'prismjs/components/prism-java';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-jsx';
import 'prismjs/components/prism-kotlin';
import 'prismjs/components/prism-latex';
import 'prismjs/components/prism-less';
import 'prismjs/components/prism-lua';
import 'prismjs/components/prism-makefile';
import 'prismjs/components/prism-markdown';
import 'prismjs/components/prism-nginx';
import 'prismjs/components/prism-objectivec';
import 'prismjs/components/prism-perl';
import 'prismjs/components/prism-php';
import 'prismjs/components/prism-powershell';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-r';
import 'prismjs/components/prism-ruby';
import 'prismjs/components/prism-rust';
import 'prismjs/components/prism-scala';
import 'prismjs/components/prism-scss';
import 'prismjs/components/prism-sql';
import 'prismjs/components/prism-swift';
import 'prismjs/components/prism-toml';
import 'prismjs/components/prism-tsx';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-yaml';

const prismPluginKey = new PluginKey('codeBlockPrism');

export const CodeBlockPrism = CodeBlock.extend({
  addProseMirrorPlugins() {
    const { name } = this;

    return [
      new Plugin({
        key: prismPluginKey,
        state: {
          init: (_, { doc }) => getDecorations({ doc, name }),
          apply: (tr, set) => {
            if (!tr.docChanged) {
              return set.map(tr.mapping, tr.doc);
            }
            return getDecorations({ doc: tr.doc, name });
          },
        },
        props: {
          decorations: (state) => prismPluginKey.getState(state),
        },
      }),
    ];
  },
});

function getDecorations({ doc, name }) {
  const decorations = [];

  doc.descendants((node, pos) => {
    if (node.type.name !== name) {
      return;
    }

    const language = node.attrs.language || 'plain';
    
    // Normalize language name for Prism
    let langName = language;
    if (langName === 'js') langName = 'javascript';
    if (langName === 'ts') langName = 'typescript';
    if (langName === 'sh') langName = 'bash';
    if (langName === 'shell') langName = 'bash';
    if (langName === 'math') langName = 'latex';

    const grammar = Prism.languages[langName];

    if (!grammar) {
      return;
    }

    const text = node.textContent;
    const tokens = Prism.tokenize(text, grammar);

    let start = pos + 1;

    function parseToken(token, currentPos) {
      if (typeof token === 'string') {
        return currentPos + token.length;
      }

      const from = currentPos;
      let to = from;

      if (Array.isArray(token.content)) {
        token.content.forEach((t) => {
          to = parseToken(t, to);
        });
      } else {
        to = parseToken(token.content, to);
      }

      decorations.push(
        Decoration.inline(from, to, {
          class: `token ${token.type} ${token.alias || ''}`,
        })
      );

      return to;
    }

    tokens.forEach((token) => {
      start = parseToken(token, start);
    });
  });

  return DecorationSet.create(doc, decorations);
}
