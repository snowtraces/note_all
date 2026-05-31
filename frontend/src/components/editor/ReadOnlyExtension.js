import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';

/**
 * ReadOnlyExtension
 *
 * 核心思路：只读模式下仅用 filterTransaction 拒绝文档修改事务。
 * 不要在 props.handleKeyDown 里返回 true——那会让 ProseMirror
 * 完全消费（consume）键盘事件，导致浏览器快捷键（F5 等）和上层
 * 组件快捷键（v/i/r）全部失效。
 *
 * 键盘快捷键的放行交给 Detail.jsx 的捕获阶段监听器处理。
 */
export const ReadOnlyExtension = Extension.create({
  name: 'readOnlyMode',
  
  addStorage() {
    return {
      enabled: false,
    };
  },
  
  addProseMirrorPlugins() {
    const ext = this; // 捕获 extension 实例，用于 filterTransaction 中访问 editor
    const storage = this.storage;
    return [
      new Plugin({
        key: new PluginKey('readOnlyMode'),

        // ── 最底层防线：拒绝所有会改变文档内容的事务 ──────────────────
        filterTransaction(tr) {
          // 允许程序化更新（如切换卡片时的 setContent 内容同步）
          if (ext.editor?.isProgrammaticUpdate) return true;
          if (storage.enabled && tr.docChanged) {
            return false;
          }
          return true;
        },

        props: {
          // ── 拒绝文字输入 ────────────────────────────────────────────
          handleTextInput() {
            return storage.enabled;
          },

          // ── 拒绝粘贴与拖拽（只读模式下没有意义） ─────────────────────
          handlePaste() {
            return storage.enabled;
          },
          handleDrop() {
            return storage.enabled;
          },

          // ── 拦截原生 beforeinput（覆盖输入法 IME、语音输入等） ────────
          handleDOMEvents: {
            beforeinput(view, event) {
              if (storage.enabled) {
                event.preventDefault();
                return true;
              }
              return false;
            },
          },

          // ── 注意：handleKeyDown 故意不设置 ──────────────────────────
          // 原因：若在此返回 true，ProseMirror 会完全消费（consume）
          // 键盘事件，导致 v/i/r 快捷键、F5 等浏览器默认行为全部失效。
          // 阻止删除/输入的任务由上面的 filterTransaction 兜底，
          // 文字不会真的被写入文档。
        },
      }),
    ];
  },
});
