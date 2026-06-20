import { BubbleMenu } from '@tiptap/react/menus';
import { Bold, Italic, Strikethrough, Code, Highlighter, Baseline } from 'lucide-react';

const TEXT_COLORS = [
  { name: '默认', value: '', color: 'transparent' },
  { name: '红色', value: '#ef4444', color: '#ef4444' },
  { name: '橙色', value: '#f97316', color: '#f97316' },
  { name: '黄色', value: '#eab308', color: '#eab308' },
  { name: '绿色', value: '#10b981', color: '#10b981' },
  { name: '蓝色', value: '#3b82f6', color: '#3b82f6' },
  { name: '紫色', value: '#a855f7', color: '#a855f7' }
];

const HIGHLIGHT_COLORS = [
  { name: '默认', value: '', color: 'transparent' },
  { name: '红底', value: 'rgba(239, 68, 68, 1)', color: 'rgba(239, 68, 68, 1)' },
  { name: '橙底', value: 'rgba(249, 115, 22, 1)', color: 'rgba(249, 115, 22, 1)' },
  { name: '黄底', value: 'rgba(234, 179, 8, 1)', color: 'rgba(234, 179, 8, 1)' },
  { name: '绿底', value: 'rgba(16, 185, 129, 1)', color: 'rgba(16, 185, 129, 1)' },
  { name: '蓝底', value: 'rgba(59, 130, 246, 1)', color: 'rgba(59, 130, 246, 1)' },
  { name: '紫底', value: 'rgba(168, 85, 247, 1)', color: 'rgba(168, 85, 247, 1)' }
];

const FormatButton = ({ editor, command, isActiveName, Icon, title }) => (
  <button
    onClick={() => editor.chain().focus()[command]().run()}
    className={`p-1.5 rounded-md transition-all active:scale-[0.98] ${editor.isActive(isActiveName) ? 'bg-primeAccent/15 text-primeAccent' : 'text-textSecondary hover:bg-bgHover hover:text-textPrimary'}`}
    title={title}
  >
    <Icon size={14} strokeWidth={2.5} />
  </button>
);

const ColorPicker = ({ editor, type, colors, Icon, title, shapeClass }) => {
  const isText = type === 'textStyle';

  // Custom check for "default/transparent" color
  const checkActive = (val) => {
    if (!val) {
      // If checking for default, it's active if no specific color is set
      if (isText) {
        return !editor.getAttributes('textStyle').color;
      } else {
        return !editor.getAttributes('highlight').color;
      }
    }
    return editor.isActive(type, { color: val });
  };

  const handleSelect = (val) => {
    if (isText) {
      val ? editor.chain().focus().setColor(val).run() : editor.chain().focus().unsetColor().run();
    } else {
      val ? editor.chain().focus().setHighlight({ color: val }).run() : editor.chain().focus().unsetHighlight().run();
    }
  };

  return (
    <div className="flex items-center gap-0.5">
      <span className="p-1 text-textTertiary" title={title}>
        <Icon size={13} strokeWidth={2.5} />
      </span>
      <div className="flex gap-0.5 ml-0.5">
        {colors.map(c => (
          <button
            key={`${type}-${c.name}`}
            onClick={() => handleSelect(c.value)}
            className={`w-6 h-6 rounded-md transition-all active:scale-[0.9] flex items-center justify-center hover:bg-bgHover ${checkActive(c.value) ? 'ring-1 ring-primeAccent/50 bg-bgSubtle' : ''}`}
            title={c.name}
          >
            <div
              className={`w-3.5 h-3.5 ${shapeClass} ${c.value ? '' : 'border-[1.5px] border-textMuted bg-transparent relative after:content-[""] after:absolute after:w-[120%] after:h-[1.5px] after:bg-textMuted after:rotate-45 after:top-1/2 after:left-1/2 after:-translate-x-1/2 after:-translate-y-1/2'}`}
              style={{ backgroundColor: c.color !== 'transparent' ? c.color : undefined }}
            />
          </button>
        ))}
      </div>
    </div>
  );
};

export default function EditorBubbleMenu({ editor }) {
  if (!editor) return null;
  return (
    <BubbleMenu
      editor={editor}
      tippyOptions={{ duration: 150, placement: 'top', animation: 'shift-away' }}
      className="flex items-center gap-1 bg-modal/95 backdrop-blur-md border border-borderSubtle rounded-xl shadow-lg p-1.5 z-50 overflow-hidden custom-scrollbar"
    >
      <FormatButton editor={editor} command="toggleBold" isActiveName="bold" Icon={Bold} title="加粗" />
      <FormatButton editor={editor} command="toggleItalic" isActiveName="italic" Icon={Italic} title="斜体" />
      <FormatButton editor={editor} command="toggleStrike" isActiveName="strike" Icon={Strikethrough} title="删除线" />
      <FormatButton editor={editor} command="toggleCode" isActiveName="code" Icon={Code} title="行内代码" />

      <div className="w-px h-4 bg-borderSubtle mx-1" />

      <ColorPicker
        editor={editor}
        type="textStyle"
        colors={TEXT_COLORS}
        Icon={Baseline}
        title="文字颜色"
        shapeClass="rounded-full"
      />

      <div className="w-px h-4 bg-borderSubtle mx-1" />

      <ColorPicker
        editor={editor}
        type="highlight"
        colors={HIGHLIGHT_COLORS}
        Icon={Highlighter}
        title="背景高亮"
        shapeClass="rounded-sm"
      />
    </BubbleMenu>
  );
}
