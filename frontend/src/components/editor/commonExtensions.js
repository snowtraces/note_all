import { StarterKit } from '@tiptap/starter-kit';
import { Link } from '@tiptap/extension-link';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import { TaskList } from '@tiptap/extension-task-list';
import { TaskItem } from '@tiptap/extension-task-item';
import { Highlight } from '@tiptap/extension-highlight';
import { Typography } from '@tiptap/extension-typography';
import { Markdown } from 'tiptap-markdown';

import { CustomImage } from './TiptapImage';
import { CustomCodeBlock } from './TiptapCodeBlock';
import { InlineMathDecorations } from './InlineMathDecorations';
import { HeadingIdPatch } from './HeadingIdPatch';

export function getCommonExtensions({ markdownClipboard = false } = {}) {
  return [
    StarterKit.configure({ codeBlock: false }),
    Markdown.configure({
      html: true,
      ...(markdownClipboard ? { transformPastedText: true, transformCopiedText: true } : {}),
    }),
    Link.configure({
      openOnClick: false,
      HTMLAttributes: {
        class: 'text-primeAccent underline underline-offset-4 decoration-primeAccent/30 hover:decoration-primeAccent transition-all',
      },
    }),
    CustomImage.configure({ inline: false, allowBase64: true }),
    Table.configure({ resizable: true, HTMLAttributes: { class: 'tiptap-table' } }),
    TableRow,
    TableCell,
    TableHeader,
    TaskList,
    TaskItem.configure({ nested: true }),
    Highlight.configure({ multicolor: true }),
    Typography,
    CustomCodeBlock,
    InlineMathDecorations,
    HeadingIdPatch,
  ];
}