import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';

export const ReadOnlyExtension = Extension.create({
  name: 'readOnlyMode',
  
  addStorage() {
    return {
      enabled: false,
    };
  },
  
  addProseMirrorPlugins() {
    const storage = this.storage;
    return [
      new Plugin({
        key: new PluginKey('readOnlyMode'),
        props: {
          // 当启用时拦截所有用户输入事件以模拟只读行为，同时允许程序化更新（如 setContent）通过。
          handleKeyDown: () => storage.enabled,
          handleTextInput: () => storage.enabled,
          handlePaste: () => storage.enabled,
          handleDrop: () => storage.enabled,
        },
      }),
    ];
  },
});
